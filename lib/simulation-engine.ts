import { DEFAULT_SIMULATION_ASSUMPTIONS, STANDARD_TURBINE_SCENARIOS } from "./simulation-constants";
import type { PowerCurvePoint, SimulationAssumptions, TurbineScenario } from "./simulation-types";

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export function getNearestScenarioByMw(targetMw: number): TurbineScenario {
  return STANDARD_TURBINE_SCENARIOS.reduce((best, cur) =>
    Math.abs(cur.ratedMw - targetMw) < Math.abs(best.ratedMw - targetMw) ? cur : best,
  );
}

export function interpolatePowerKw(windSpeed: number, curve: PowerCurvePoint[], cutIn: number, cutOut: number): number {
  if (!Number.isFinite(windSpeed) || windSpeed < cutIn || windSpeed >= cutOut) return 0;
  const sorted = [...curve].sort((a, b) => a.ws - b.ws);
  for (let i = 1; i < sorted.length; i += 1) {
    const left = sorted[i - 1];
    const right = sorted[i];
    if (windSpeed <= right.ws) {
      const span = right.ws - left.ws || 1;
      const t = (windSpeed - left.ws) / span;
      return left.kw + t * (right.kw - left.kw);
    }
  }
  return sorted[sorted.length - 1]?.kw ?? 0;
}

export function getAirDensityRatio(tempC?: number, pressureHpa?: number): number {
  if (typeof tempC !== "number" || typeof pressureHpa !== "number") return 1;
  const rho = (pressureHpa * 100) / (287.05 * (tempC + 273.15));
  return clamp(rho / 1.225, 0.9, 1.1);
}

export function estimateDailyEnergyMwh(input: {
  windSpeed: number;
  tempC?: number;
  pressureHpa?: number;
  scenario?: TurbineScenario;
  assumptions?: SimulationAssumptions;
  extraLossPct?: number;
}): number {
  const scenario = input.scenario ?? getNearestScenarioByMw(4.2);
  const assumptions = input.assumptions ?? DEFAULT_SIMULATION_ASSUMPTIONS;

  const densityRatio = getAirDensityRatio(input.tempC, input.pressureHpa);
  const adjustedWind = input.windSpeed * Math.cbrt(densityRatio);
  const powerKw = interpolatePowerKw(adjustedWind, scenario.powerCurve, scenario.cutIn, scenario.cutOut);

  const grossMwh = (powerKw / 1000) * 24;
  const totalLossPct =
    assumptions.availabilityLossPct +
    assumptions.electricalLossPct +
    assumptions.wakeLossPct +
    assumptions.curtailmentLossPct +
    assumptions.icingLossPct +
    assumptions.otherLossPct +
    (input.extraLossPct ?? 0);

  return grossMwh * (1 - clamp(totalLossPct, 0, 60) / 100);
}

// 표준정규분포 75%/90% 분위수(z=0.6745, 1.2816)를 사용. SiteDetail.tsx의
// uncertaintyBreakdown과 동일한 계수로 맞춰, 같은 화면 안에서 두 가지 다른
// P75/P90 산출 공식이 쓰이지 않도록 통일함.
export function estimatePValuesFromP50(p50Mwh: number, uncertaintyPct = 10): { p50: number; p75: number; p90: number } {
  const u = clamp(uncertaintyPct, 3, 25) / 100;
  const p75 = p50Mwh * (1 - 0.6745 * u);
  const p90 = p50Mwh * (1 - 1.2816 * u);
  return { p50: p50Mwh, p75: Math.max(0, p75), p90: Math.max(0, p90) };
}

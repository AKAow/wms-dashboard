export type TurbineScenarioKey = string;

export interface PowerCurvePoint {
  ws: number;
  kw: number;
}

export interface TurbineScenario {
  key: TurbineScenarioKey;
  isCustom?: boolean;
  name: string;
  ratedMw: number;
  iecClass: "I" | "II" | "III" | "I/II";
  cutIn: number;
  ratedSpeed: number;
  cutOut: number;
  hubHeightM: number;
  rotorDiameterM: number;
  powerCurve: PowerCurvePoint[];
  notes?: string;
}

export interface SimulationAssumptions {
  availabilityLossPct: number;
  electricalLossPct: number;
  wakeLossPct: number;
  curtailmentLossPct: number;
  icingLossPct: number;
  otherLossPct: number;
}

export interface BacktestMetrics {
  windowDays: 30 | 90 | 365;
  mapePct: number | null;
  nmaePct: number | null;
  biasPct: number | null;
  grade: "A" | "B" | "C";
}

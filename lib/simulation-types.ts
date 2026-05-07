export type TurbineScenarioKey = "S-3.6-IEC3" | "M-4.2-IEC2" | "L-5.0-IEC1_2";

export interface PowerCurvePoint {
  ws: number; // wind speed (m/s)
  kw: number; // power output (kW)
}

export interface TurbineScenario {
  key: TurbineScenarioKey;
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

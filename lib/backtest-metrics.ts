import { BACKTEST_GRADE_RULES } from "./simulation-constants";

const safeDiv = (a: number, b: number) => (b === 0 ? 0 : a / b);

export function getBacktestGradeByMape(mapePct: number | null): "A" | "B" | "C" {
  if (mapePct === null || Number.isNaN(mapePct)) return "C";
  if (mapePct <= BACKTEST_GRADE_RULES.A.maxMapePct) return "A";
  if (mapePct <= BACKTEST_GRADE_RULES.B.maxMapePct) return "B";
  return "C";
}

export function calculateBacktestMetrics(rows: Array<{ actualMwh: number; predictedMwh: number }>) {
  const valid = rows.filter((r) => Number.isFinite(r.actualMwh) && Number.isFinite(r.predictedMwh) && r.actualMwh > 0);
  if (!valid.length) return { mapePct: null, nmaePct: null, biasPct: null, grade: "C" as const };

  const ape = valid.map((r) => Math.abs(r.predictedMwh - r.actualMwh) / r.actualMwh);
  const ae = valid.map((r) => Math.abs(r.predictedMwh - r.actualMwh));
  const err = valid.map((r) => r.predictedMwh - r.actualMwh);

  const mapePct = (ape.reduce((a, b) => a + b, 0) / valid.length) * 100;
  const avgActual = valid.reduce((a, b) => a + b.actualMwh, 0) / valid.length;
  const nmaePct = safeDiv(ae.reduce((a, b) => a + b, 0) / valid.length, avgActual) * 100;
  const biasPct = safeDiv(err.reduce((a, b) => a + b, 0) / valid.length, avgActual) * 100;

  return {
    mapePct,
    nmaePct,
    biasPct,
    grade: getBacktestGradeByMape(mapePct),
  };
}

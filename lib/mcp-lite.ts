const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export interface McpLiteResult {
  factor: number;
  shortAvg: number;
  longAvg: number;
  confidence: "high" | "medium" | "low";
}

// MCP-lite: 최근 관측 풍속 평균 대비 장기(최대 12개월) 평균 비율로 단순 보정
export function calculateMcpLiteFactor(input: { recentWind: number[]; longWind: number[] }): McpLiteResult {
  const recent = input.recentWind.filter((v) => Number.isFinite(v) && v > 0);
  const long = input.longWind.filter((v) => Number.isFinite(v) && v > 0);

  if (!recent.length || !long.length) {
    return { factor: 1, shortAvg: 0, longAvg: 0, confidence: "low" };
  }

  const shortAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const longAvg = long.reduce((a, b) => a + b, 0) / long.length;
  const raw = longAvg > 0 ? longAvg / shortAvg : 1;
  const factor = clamp(raw, 0.9, 1.1);

  const n = Math.min(recent.length, long.length);
  const confidence = n >= 180 ? "high" : n >= 90 ? "medium" : "low";
  return { factor, shortAvg, longAvg, confidence };
}

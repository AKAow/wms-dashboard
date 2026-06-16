"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { MapPin, Activity, Wind, Navigation, BarChart2, Table2, CalendarDays, Search, Bell, Download } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import * as XLSX from "xlsx";
import type { Site, DailyStat, Measurement } from "@/lib/types";
import type { TurbineScenario } from "@/lib/simulation-types";
import { CHANNEL_LABELS } from "@/lib/types";
import { DEFAULT_SIMULATION_ASSUMPTIONS, MET_MAST_GRADE_RULES, STANDARD_TURBINE_SCENARIOS } from "@/lib/simulation-constants";
import { estimateDailyEnergyMwh, estimatePValuesFromP50, getNearestScenarioByMw, interpolatePowerKw } from "@/lib/simulation-engine";
import { calculateMcpLiteFactor } from "@/lib/mcp-lite";

type Tab = "overview" | "daily" | "monthly" | "simulation";

const EXCEL_DISPLAY_CHANNELS = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7", "ch8", "ch13", "ch14", "ch15", "ch16", "ch17", "ch21", "ch22"] as const;
const EXCEL_WIND_SPEED_CHANNELS = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7", "ch8"] as const;
const EXCEL_WIND_DIR_CHANNELS = ["ch13", "ch14", "ch15", "ch16"] as const;
const EXCEL_ATMO_CHANNELS = ["ch17", "ch21", "ch22"] as const;
const RIGHT_SUMMARY_CLASS = ["right-[216px]", "right-[144px]", "right-[72px]", "right-0"] as const;
const RIGHT_SUMMARY_BG_CLASS = "bg-[#f8fbff] shadow-[-1px_0_0_#d6e8ff_inset]";

const EXCEL_SENSOR_META: Record<string, { description: string; height: string }> = {
  ch1: { description: "2 - NRG 40C Anem", height: "100m" },
  ch2: { description: "3 - NRG 40C Anem", height: "96m" },
  ch3: { description: "4 - NRG 40C Anem", height: "80m" },
  ch4: { description: "5 - NRG 40C Anem", height: "80m" },
  ch5: { description: "6 - NRG 40C Anem", height: "60m" },
  ch6: { description: "6S - NRG 40C Anem", height: "60m" },
  ch7: { description: "7 - NRG 40C Anem", height: "40m" },
  ch8: { description: "7S - NRG 40C Anem", height: "40m" },
  ch13: { description: "13 - NRG 200M Vane", height: "97m" },
  ch14: { description: "14 - NRG 200M Vane", height: "77m" },
  ch15: { description: "15 - NRG 200M Vane", height: "57m" },
  ch16: { description: "16 - NRG 200M Vane", height: "37m" },
  ch17: { description: "17 - NRG iP65 Baro", height: "2m" },
  ch21: { description: "21 - NRG RH5x Humi", height: "5m" },
  ch22: { description: "22 - NRG T60 Temp", height: "5m" },
};
const CHART_COLORS: Record<string, string> = {
  ch1: "#3b82f6",
  ch2: "#06b6d4",
  ch3: "#8b5cf6",
  ch4: "#ec4899",
  ch5: "#22c55e",
  ch6: "#0ea5e9",
  ch7: "#14b8a6",
  ch8: "#6366f1",
  ch13: "#f59e0b",
  ch14: "#f97316",
  ch15: "#eab308",
  ch16: "#84cc16",
  ch17: "#a855f7",
  ch21: "#10b981",
  ch22: "#ef4444",
};


const AGE_LOSS_MAP: Record<"0-5" | "6-10" | "11-15" | "16+", number> = {
  "0-5": 0.12,
  "6-10": 0.15,
  "11-15": 0.18,
  "16+": 0.22,
};

const getKSTParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";

  return { year, month, day };
};

const formatKSTDate = (date = new Date()) => {
  const { year, month, day } = getKSTParts(date);
  return `${year}-${month}-${day}`;
};

const formatKSTMonth = (date = new Date()) => {
  const { year, month } = getKSTParts(date);
  return `${year}-${month}`;
};

const toKSTLabel = (timestamp: string) => {
  const d = new Date(timestamp);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
};

const toKSTDateOnly = (timestamp: string) => {
  const { year, month, day } = getKSTParts(new Date(timestamp));
  return `${year}-${month}-${day}`;
};

const toFixedOrDash = (value: number | null | undefined, digits = 2) =>
  typeof value === "number" ? value.toFixed(digits) : "-";

const trendLabel = (points: number[]) => {
  if (points.length < 2) return { text: "— 동일", cls: "flat" as const };
  const prev = points[points.length - 2];
  const last = points[points.length - 1];
  if (last > prev) return { text: "▲ 상승", cls: "up" as const };
  if (last < prev) return { text: "▼ 하락", cls: "down" as const };
  return { text: "— 동일", cls: "flat" as const };
};

const toUTCDateOnly = (timestamp: string) => timestamp.slice(0, 10);

function MiniSparkline({ points, color = "#2f80ed" }: { points: number[]; color?: string }) {
  if (!points.length) return <div className="h-7 w-[92px]" />;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const w = 100;
  const h = 26;
  const d = points
    .map((p, i) => {
      const x = (i / Math.max(points.length - 1, 1)) * w;
      const y = h - ((p - min) / (max - min || 1)) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="h-7 w-[92px] opacity-90 shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

const WIND_ROSE_DIRS = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"] as const;
const WIND_ROSE_BANDS = [
  { label: "0–3",  max: 3,        color: "#bfdbfe" },
  { label: "3–6",  max: 6,        color: "#60a5fa" },
  { label: "6–9",  max: 9,        color: "#2f80ed" },
  { label: "9–12", max: 12,       color: "#1d4ed8" },
  { label: "12+",  max: Infinity, color: "#7c3aed" },
];

function WindRose({ data, label }: { data: Array<{ dir: number | null | undefined; speed: number | null | undefined }>; label?: string }) {
  const n = 16;
  const sectorDeg = 360 / n;
  const cx = 160, cy = 160, r = 120;

  const sectors: number[][] = Array.from({ length: n }, () => Array(WIND_ROSE_BANDS.length).fill(0));
  let total = 0;

  for (const { dir, speed } of data) {
    if (dir == null || speed == null) continue;
    total++;
    const idx = Math.round(((dir % 360) + 360) / sectorDeg) % n;
    const band = WIND_ROSE_BANDS.findIndex((b) => (speed as number) < b.max);
    if (band >= 0) sectors[idx][band]++;
  }

  if (total === 0) {
    return <div className="h-64 flex items-center justify-center text-sm text-slate-500">풍향 데이터 없음</div>;
  }

  const maxFreq = Math.max(...sectors.map((s) => s.reduce((a, b) => a + b, 0)), 1);
  const halfRad = (sectorDeg / 2) * (Math.PI / 180);

  const petals = sectors.flatMap((bands, i) => {
    const centerRad = (i * sectorDeg - 90) * (Math.PI / 180);
    let cum = 0;
    return bands.map((count, bi) => {
      if (count === 0) { cum += count; return null; }
      const ir = (cum / maxFreq) * r;
      const or = ((cum + count) / maxFreq) * r;
      cum += count;
      const sa = centerRad - halfRad;
      const ea = centerRad + halfRad;
      const path = ir > 0.5
        ? `M${(cx + ir * Math.cos(sa)).toFixed(1)},${(cy + ir * Math.sin(sa)).toFixed(1)} L${(cx + or * Math.cos(sa)).toFixed(1)},${(cy + or * Math.sin(sa)).toFixed(1)} A${or.toFixed(1)},${or.toFixed(1)} 0 0,1 ${(cx + or * Math.cos(ea)).toFixed(1)},${(cy + or * Math.sin(ea)).toFixed(1)} L${(cx + ir * Math.cos(ea)).toFixed(1)},${(cy + ir * Math.sin(ea)).toFixed(1)} A${ir.toFixed(1)},${ir.toFixed(1)} 0 0,0 ${(cx + ir * Math.cos(sa)).toFixed(1)},${(cy + ir * Math.sin(sa)).toFixed(1)} Z`
        : `M${cx},${cy} L${(cx + or * Math.cos(sa)).toFixed(1)},${(cy + or * Math.sin(sa)).toFixed(1)} A${or.toFixed(1)},${or.toFixed(1)} 0 0,1 ${(cx + or * Math.cos(ea)).toFixed(1)},${(cy + or * Math.sin(ea)).toFixed(1)} Z`;
      return <path key={`${i}-${bi}`} d={path} fill={WIND_ROSE_BANDS[bi].color} opacity={0.88} />;
    });
  });

  const rings = [0.25, 0.5, 0.75, 1.0].map((pct) => (
    <circle key={pct} cx={cx} cy={cy} r={pct * r} fill="none" stroke="#d6e8ff" strokeWidth={1} strokeDasharray="3 3" />
  ));

  const labels = WIND_ROSE_DIRS.map((label, i) => {
    const angle = (i * sectorDeg - 90) * (Math.PI / 180);
    const lr = r + 18;
    return (
      <text key={label} x={(cx + lr * Math.cos(angle)).toFixed(1)} y={(cy + lr * Math.sin(angle)).toFixed(1)}
        textAnchor="middle" dominantBaseline="middle" fontSize={10}
        fill="#64748b" fontWeight={["N","S","E","W"].includes(label) ? 700 : 400}>
        {label}
      </text>
    );
  });

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 320 320" className="w-full max-w-[280px]">
        {rings}
        {petals}
        {labels}
        <circle cx={cx} cy={cy} r={3} fill="#64748b" />
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center">
        {WIND_ROSE_BANDS.map((b) => (
          <div key={b.label} className="flex items-center gap-1.5 text-xs text-slate-600">
            <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: b.color }} />
            {b.label} m/s
          </div>
        ))}
      </div>
      {label && <p className="text-[11px] text-slate-400">{label} · 총 {total}개 데이터포인트</p>}
    </div>
  );
}

export default function SiteDetail({ site }: { site: Site }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [windRoseDirCh, setWindRoseDirCh] = useState<"ch13" | "ch14" | "ch15" | "ch16">("ch13");
  const [dailyWindRoseDirCh, setDailyWindRoseDirCh] = useState<"ch13" | "ch14" | "ch15" | "ch16">("ch13");
  const [monthlyWindRoseDirCh, setMonthlyWindRoseDirCh] = useState<"ch13" | "ch14" | "ch15" | "ch16">("ch13");
  const [simPeriod, setSimPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [simPreset, setSimPreset] = useState<"3M" | "6M" | "12M" | "custom">("6M");
  const [simStartDate, setSimStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [simEndDate, setSimEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [turbineAgeBand, setTurbineAgeBand] = useState<"0-5" | "6-10" | "11-15" | "16+">("6-10");
  const [turbineMw, setTurbineMw] = useState<number>(4.2);
  const [selectedScenarioKey, setSelectedScenarioKey] = useState<string>("M-4.2-IEC2");
  const [dbTurbineCurves, setDbTurbineCurves] = useState<TurbineScenario[]>([]);
  const [selectedDate, setSelectedDate] = useState(formatKSTDate());
  const [selectedMonth, setSelectedMonth] = useState(formatKSTMonth());
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [overviewKpiPeriod, setOverviewKpiPeriod] = useState<"all" | "month" | "day">("month");
  const dateInputRef = useRef<HTMLInputElement>(null);
  const monthInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  // DB 커스텀 커브 로드
  useEffect(() => {
    supabase.from("turbine_curves").select("*").order("created_at", { ascending: true }).then(({ data }) => {
      if (!data) return;
      setDbTurbineCurves(
        (data as Array<{ id: string; name: string; rated_mw: number; iec_class: string | null; cut_in: number; rated_speed: number; cut_out: number; hub_height_m: number | null; rotor_diameter_m: number | null; curve_data: import("@/lib/simulation-types").PowerCurvePoint[]; notes: string | null }>).map((r) => ({
          key: r.id,
          name: r.name,
          ratedMw: r.rated_mw,
          iecClass: (r.iec_class ?? "II") as "I" | "II" | "III" | "I/II",
          cutIn: r.cut_in,
          ratedSpeed: r.rated_speed,
          cutOut: r.cut_out,
          hubHeightM: r.hub_height_m ?? 100,
          rotorDiameterM: r.rotor_diameter_m ?? 130,
          powerCurve: r.curve_data,
          notes: r.notes ?? undefined,
          isCustom: true,
        }))
      );
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allScenarios = useMemo(
    () => [...STANDARD_TURBINE_SCENARIOS, ...dbTurbineCurves],
    [dbTurbineCurves]
  );

  const selectedScenario = useMemo(
    () => allScenarios.find((s) => s.key === selectedScenarioKey) ?? allScenarios.find((s) => s.key === "M-4.2-IEC2") ?? allScenarios[0],
    [allScenarios, selectedScenarioKey]
  );

  const loadMeasurements = useCallback(async () => {
    setLoading(true);
    const startUtc = new Date(`${selectedDate}T00:00:00+09:00`).toISOString();
    const endUtc = new Date(`${selectedDate}T23:59:59+09:00`).toISOString();
    const { data } = await supabase
      .from("measurements")
      .select("*")
      .eq("site_id", site.id)
      .gte("timestamp", startUtc)
      .lte("timestamp", endUtc)
      .order("timestamp");
    setMeasurements(data ?? []);
    setLoading(false);
  }, [selectedDate, site.id, supabase]);

  const loadMonthlyStats = useCallback(async () => {
    setLoading(true);
    const allStats: DailyStat[] = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from("daily_stats")
        .select("id,site_id,date,channel,avg_value,max_value,min_value,std_value,data_count")
        .eq("site_id", site.id)
        .order("date")
        .range(from, from + pageSize - 1);

      if (error) {
        setLoading(false);
        return;
      }

      const batch = (data ?? []) as DailyStat[];
      allStats.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }

    allStats.sort((a, b) => (a.date === b.date ? a.channel.localeCompare(b.channel) : a.date.localeCompare(b.date)));
    setDailyStats(allStats);
    setLoading(false);
  }, [site.id, supabase]);

  useEffect(() => {
    async function initDefaultMonthFromData() {
      const { data } = await supabase
        .from("measurements")
        .select("timestamp")
        .eq("site_id", site.id)
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.timestamp) {
        setSelectedMonth(data.timestamp.slice(0, 7));
      }
    }
    initDefaultMonthFromData();
  }, [site.id, supabase]);

  useEffect(() => {
    if (tab !== "daily" && overviewKpiPeriod !== "day") return;
    queueMicrotask(() => {
      void loadMeasurements();
    });
  }, [tab, selectedDate, overviewKpiPeriod, loadMeasurements]);

  useEffect(() => {
    if (tab !== "monthly" && tab !== "overview") return;
    queueMicrotask(() => {
      void loadMonthlyStats();
    });
  }, [tab, selectedMonth, loadMonthlyStats]);


  const dailyExcelData = useMemo(() => {
    return measurements
      .filter((m) => toKSTDateOnly(m.timestamp) === selectedDate)
      .map((m) => ({
        time: toKSTLabel(m.timestamp),
        ch1: m.ch1,
        ch2: m.ch2,
        ch3: m.ch3,
        ch4: m.ch4,
        ch5: m.ch5,
        ch6: m.ch6,
        ch7: m.ch7,
        ch8: m.ch8,
        ch13: m.ch13,
        ch14: m.ch14,
        ch15: m.ch15,
        ch16: m.ch16,
        ch17: m.ch17,
        ch21: m.ch21,
        ch22: m.ch22,
      }));
  }, [measurements, selectedDate]);

  const dailyExcelTable = useMemo(() => {
    const timeLabels = dailyExcelData.map((r) => r.time);
    const rows = EXCEL_DISPLAY_CHANNELS.map((ch) => {
      const values = dailyExcelData.map((r) => r[ch]);
      const numeric = values.filter((v): v is number => typeof v === "number");
      const ave = numeric.length ? numeric.reduce((a, b) => a + b, 0) / numeric.length : null;
      const max = numeric.length ? Math.max(...numeric) : null;
      const min = numeric.length ? Math.min(...numeric) : null;
      const std = numeric.length
        ? Math.sqrt(numeric.reduce((sum, v) => sum + (v - (ave ?? 0)) ** 2, 0) / numeric.length)
        : null;
      return { ch, values, ave, max, min, std };
    });

    return { timeLabels, rows };
  }, [dailyExcelData]);

  const selectedMonthStats = useMemo(() => {
    return dailyStats.filter((s) => s.date.startsWith(selectedMonth));
  }, [dailyStats, selectedMonth]);

  const overviewMonthlyPreview = useMemo(() => {
    return selectedMonthStats
      .filter((s) => ["ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7", "ch8"].includes(s.channel))
      .reduce<Record<string, Record<string, number>>>((acc, s) => {
        if (!acc[s.date]) acc[s.date] = {};
        acc[s.date][s.channel] = s.avg_value ?? 0;
        return acc;
      }, {});
  }, [selectedMonthStats]);

  const overviewChartData = Object.entries(overviewMonthlyPreview).map(([date, vals]) => ({
    date: date.slice(5),
    ch1: vals.ch1 ?? 0,
    ch2: vals.ch2 ?? 0,
    ch3: vals.ch3 ?? 0,
    ch4: vals.ch4 ?? 0,
    ch5: vals.ch5 ?? 0,
    ch6: vals.ch6 ?? 0,
    ch7: vals.ch7 ?? 0,
    ch8: vals.ch8 ?? 0,
  }));

  const overviewChartSeries = useMemo(() => {
    // 일별: 10분 raw 데이터
    if (overviewKpiPeriod === "day") {
      return dailyExcelData.map((m) => ({
        date: m.time,
        ch1: m.ch1 ?? 0, ch2: m.ch2 ?? 0, ch3: m.ch3 ?? 0, ch4: m.ch4 ?? 0,
        ch5: m.ch5 ?? 0, ch6: m.ch6 ?? 0, ch7: m.ch7 ?? 0, ch8: m.ch8 ?? 0,
      }));
    }
    // 월간: 선택 월 일별 평균
    if (overviewKpiPeriod === "month") return overviewChartData;
    // 전체: 전 기간 월별 평균
    const monthMap = new Map<string, {
      date: string;
      ch1: number; ch2: number; ch3: number; ch4: number; ch5: number; ch6: number; ch7: number; ch8: number;
      c1: number; c2: number; c3: number; c4: number; c5: number; c6: number; c7: number; c8: number;
    }>();
    for (const row of dailyStats.filter((r) => ["ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7", "ch8"].includes(r.channel) && typeof r.avg_value === "number")) {
      const key = row.date.slice(0, 7);
      const prev = monthMap.get(key) ?? { date: key, ch1: 0, ch2: 0, ch3: 0, ch4: 0, ch5: 0, ch6: 0, ch7: 0, ch8: 0, c1: 0, c2: 0, c3: 0, c4: 0, c5: 0, c6: 0, c7: 0, c8: 0 };
      const v = row.avg_value as number;
      if (row.channel === "ch1") { prev.ch1 += v; prev.c1 += 1; }
      if (row.channel === "ch2") { prev.ch2 += v; prev.c2 += 1; }
      if (row.channel === "ch3") { prev.ch3 += v; prev.c3 += 1; }
      if (row.channel === "ch4") { prev.ch4 += v; prev.c4 += 1; }
      if (row.channel === "ch5") { prev.ch5 += v; prev.c5 += 1; }
      if (row.channel === "ch6") { prev.ch6 += v; prev.c6 += 1; }
      if (row.channel === "ch7") { prev.ch7 += v; prev.c7 += 1; }
      if (row.channel === "ch8") { prev.ch8 += v; prev.c8 += 1; }
      monthMap.set(key, prev);
    }
    return Array.from(monthMap.values()).map((r) => ({
      date: r.date,
      ch1: r.c1 ? r.ch1 / r.c1 : 0, ch2: r.c2 ? r.ch2 / r.c2 : 0,
      ch3: r.c3 ? r.ch3 / r.c3 : 0, ch4: r.c4 ? r.ch4 / r.c4 : 0,
      ch5: r.c5 ? r.ch5 / r.c5 : 0, ch6: r.c6 ? r.ch6 / r.c6 : 0,
      ch7: r.c7 ? r.ch7 / r.c7 : 0, ch8: r.c8 ? r.ch8 / r.c8 : 0,
    }));
  }, [overviewKpiPeriod, overviewChartData, dailyStats, dailyExcelData]);

  const excelMonthlyChartData = useMemo(() => {
    const rows = selectedMonthStats
      .filter((s) => ["ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7", "ch8"].includes(s.channel))
      .reduce<Record<string, { date: string; ch1: number; ch2: number; ch3: number; ch4: number; ch5: number; ch6: number; ch7: number; ch8: number }>>((acc, s) => {
        if (!acc[s.date]) {
          acc[s.date] = { date: s.date.slice(5), ch1: 0, ch2: 0, ch3: 0, ch4: 0, ch5: 0, ch6: 0, ch7: 0, ch8: 0 };
        }
        const v = s.avg_value ?? 0;
        if (s.channel === "ch1") acc[s.date].ch1 = v;
        if (s.channel === "ch2") acc[s.date].ch2 = v;
        if (s.channel === "ch3") acc[s.date].ch3 = v;
        if (s.channel === "ch4") acc[s.date].ch4 = v;
        if (s.channel === "ch5") acc[s.date].ch5 = v;
        if (s.channel === "ch6") acc[s.date].ch6 = v;
        if (s.channel === "ch7") acc[s.date].ch7 = v;
        if (s.channel === "ch8") acc[s.date].ch8 = v;
        return acc;
      }, {});

    return Object.entries(rows)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [selectedMonthStats]);

  const excelMonthlyTable = useMemo(() => {
    const [year, month] = selectedMonth.split("-");
    const daysInMonth = new Date(Number(year), Number(month), 0).getDate();
    const dayLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, "0"));

    const byChannelDate = selectedMonthStats.reduce<Record<string, Record<string, number>>>((acc, s) => {
      if (!EXCEL_DISPLAY_CHANNELS.includes(s.channel as (typeof EXCEL_DISPLAY_CHANNELS)[number])) return acc;
      if (!acc[s.channel]) acc[s.channel] = {};
      const day = s.date.slice(-2);
      acc[s.channel][day] = s.avg_value ?? 0;
      return acc;
    }, {});

    const rows = EXCEL_DISPLAY_CHANNELS.map((ch) => {
      const dayValues = dayLabels.map((d) => byChannelDate[ch]?.[d]);
      const numeric = dayValues.filter((v): v is number => typeof v === "number");
      const ave = numeric.length ? numeric.reduce((a, b) => a + b, 0) / numeric.length : null;
      const max = numeric.length ? Math.max(...numeric) : null;
      const min = numeric.length ? Math.min(...numeric) : null;
      const std = numeric.length
        ? Math.sqrt(numeric.reduce((sum, v) => sum + (v - (ave ?? 0)) ** 2, 0) / numeric.length)
        : null;

      return { ch, dayValues, ave, max, min, std };
    });

    return { dayLabels, rows };
  }, [selectedMonthStats, selectedMonth]);

  const downloadMonthlyExcel = useCallback(async () => {
    const templatePath = "/reports/202603_Wando_Daesin_Monthly_Report_260403.xlsx";

    const fixed31DayLabels = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"));
    const header = [
      "Description",
      "Height",
      ...fixed31DayLabels,
      "AVE",
      "MAX",
      "MIN",
      "STD",
    ];

    const rows = excelMonthlyTable.rows.map((row) => {
      const dayMap = new Map<string, number>();
      excelMonthlyTable.dayLabels.forEach((day, idx) => {
        const value = row.dayValues[idx];
        if (typeof value === "number") dayMap.set(day, value);
      });

      return [
        EXCEL_SENSOR_META[row.ch]?.description ?? CHANNEL_LABELS[row.ch],
        EXCEL_SENSOR_META[row.ch]?.height ?? "-",
        ...fixed31DayLabels.map((d) => {
          const v = dayMap.get(d);
          return typeof v === "number" ? Number(v.toFixed(2)) : "";
        }),
        typeof row.ave === "number" ? Number(row.ave.toFixed(2)) : "",
        typeof row.max === "number" ? Number(row.max.toFixed(2)) : "",
        typeof row.min === "number" ? Number(row.min.toFixed(2)) : "",
        typeof row.std === "number" ? Number(row.std.toFixed(2)) : "",
      ];
    });

    try {
      const res = await fetch(templatePath);
      const ab = await res.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array" });
      const sheetName = wb.SheetNames[0] || "Monthly";
      const ws = wb.Sheets[sheetName] ?? XLSX.utils.aoa_to_sheet([]);

      XLSX.utils.sheet_add_aoa(ws, [header, ...rows], { origin: "A1" });
      wb.Sheets[sheetName] = ws;
      XLSX.writeFile(wb, `${site.site_number}_${selectedMonth}_Monthly_Report.xlsx`);
      return;
    } catch {
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Monthly");
      XLSX.writeFile(wb, `${site.site_number}_${selectedMonth}_Monthly_Report.xlsx`);
    }
  }, [excelMonthlyTable, selectedMonth, site.site_number]);

  const monthRows = useMemo(
    () => dailyStats.filter((row) => row.date.startsWith(selectedMonth)),
    [dailyStats, selectedMonth],
  );

  const monthAvgWind = useMemo(() => {
    const values = monthRows
      .filter((row) => row.channel === "ch1" && typeof row.avg_value === "number")
      .map((row) => row.avg_value as number);
    if (!values.length) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }, [monthRows]);

  const monthCoverage = useMemo(() => {
    const days = new Set(monthRows.filter((row) => row.channel === "ch1").map((row) => row.date));
    const [y, m] = selectedMonth.split("-").map(Number);
    if (!y || !m) return 0;
    const daysInMonth = new Date(y, m, 0).getDate();
    return Math.round((days.size / daysInMonth) * 100);
  }, [monthRows, selectedMonth]);

  const latestDataDate = useMemo(() => {
    const last = dailyStats[dailyStats.length - 1]?.date;
    return last ?? "-";
  }, [dailyStats]);

  const sparkWind = useMemo(
    () => monthRows.filter((r) => r.channel === "ch1").slice(-12).map((r) => r.avg_value ?? 0),
    [monthRows],
  );
  const monthTurbulenceIntensity = useMemo(() => {
    const rows = monthRows.filter((r) => r.channel === "ch1" && typeof r.avg_value === "number" && typeof r.std_value === "number" && (r.avg_value as number) > 0);
    if (!rows.length) return null;
    const tis = rows.map((r) => ((r.std_value as number) / (r.avg_value as number)) * 100);
    const avg = tis.reduce((a, b) => a + b, 0) / tis.length;
    return Math.max(0, Math.min(100, avg));
  }, [monthRows]);

  const monthMaxGust = useMemo(() => {
    const rows = monthRows.filter((r) => ["ch1", "ch2", "ch3", "ch4", "ch5", "ch7"].includes(r.channel) && typeof r.max_value === "number");
    if (!rows.length) return null;
    return Math.max(...rows.map((r) => r.max_value as number));
  }, [monthRows]);

  const monthlyWindRoseData = useMemo(() => {
    const SPEED_FOR_DIR: Record<string, string> = { ch13: "ch1", ch14: "ch3", ch15: "ch5", ch16: "ch7" };
    const speedCh = SPEED_FOR_DIR[monthlyWindRoseDirCh];
    const dirByDate = new Map<string, number>();
    const speedByDate = new Map<string, number>();
    for (const r of selectedMonthStats) {
      if (r.channel === monthlyWindRoseDirCh && typeof r.avg_value === "number") dirByDate.set(r.date, r.avg_value);
      if (r.channel === speedCh && typeof r.avg_value === "number") speedByDate.set(r.date, r.avg_value);
    }
    const dates = new Set([...dirByDate.keys(), ...speedByDate.keys()]);
    return Array.from(dates).map((date) => ({ dir: dirByDate.get(date) ?? null, speed: speedByDate.get(date) ?? null }));
  }, [selectedMonthStats, monthlyWindRoseDirCh]);

  const monthlyWindRoseAllData = useMemo(() => {
    const PAIRS = [
      { dir: "ch13", speed: "ch1" },
      { dir: "ch14", speed: "ch3" },
      { dir: "ch15", speed: "ch5" },
      { dir: "ch16", speed: "ch7" },
    ] as const;
    return PAIRS.flatMap(({ dir: dirCh, speed: speedCh }) => {
      const dirByDate = new Map<string, number>();
      const speedByDate = new Map<string, number>();
      for (const r of selectedMonthStats) {
        if (r.channel === dirCh && typeof r.avg_value === "number") dirByDate.set(r.date, r.avg_value);
        if (r.channel === speedCh && typeof r.avg_value === "number") speedByDate.set(r.date, r.avg_value);
      }
      const dates = new Set([...dirByDate.keys(), ...speedByDate.keys()]);
      return Array.from(dates).map((d) => ({ dir: dirByDate.get(d) ?? null, speed: speedByDate.get(d) ?? null }));
    });
  }, [selectedMonthStats]);

  const monthWindDirVariability = useMemo(() => {
    const angles = monthRows
      .filter((r) => ["ch13", "ch14", "ch15", "ch16"].includes(r.channel) && typeof r.avg_value === "number")
      .map((r) => (r.avg_value as number) * Math.PI / 180);
    if (!angles.length) return null;
    const c = angles.reduce((a, x) => a + Math.cos(x), 0) / angles.length;
    const s = angles.reduce((a, x) => a + Math.sin(x), 0) / angles.length;
    const R = Math.sqrt(c * c + s * s);
    if (R <= 0) return null;
    return Math.sqrt(-2 * Math.log(R)) * (180 / Math.PI);
  }, [monthRows]);

  const sparkTI = useMemo(
    () => monthRows
      .filter((r) => r.channel === "ch1" && typeof r.avg_value === "number" && typeof r.std_value === "number" && (r.avg_value as number) > 0)
      .slice(-12)
      .map((r) => ((r.std_value as number) / (r.avg_value as number)) * 100),
    [monthRows],
  );
  const sparkMaxGust = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const r of monthRows) {
      if (!["ch1", "ch2", "ch3", "ch4", "ch5", "ch7"].includes(r.channel)) continue;
      if (typeof r.max_value !== "number") continue;
      const prev = byDate.get(r.date);
      if (prev == null || r.max_value > prev) byDate.set(r.date, r.max_value);
    }
    return Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([, v]) => v);
  }, [monthRows]);
  const sparkDirVar = useMemo(
    () => {
      const byDate = new Map<string, number[]>();
      for (const r of monthRows) {
        if (!["ch13", "ch14", "ch15", "ch16"].includes(r.channel)) continue;
        if (typeof r.avg_value !== "number") continue;
        if (!byDate.has(r.date)) byDate.set(r.date, []);
        byDate.get(r.date)!.push((r.avg_value as number) * Math.PI / 180);
      }

      return Array.from(byDate.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-12)
        .map(([, angles]) => {
          const c = angles.reduce((a, x) => a + Math.cos(x), 0) / angles.length;
          const s = angles.reduce((a, x) => a + Math.sin(x), 0) / angles.length;
          const R = Math.sqrt(c * c + s * s);
          if (R <= 0) return 0;
          return Math.sqrt(-2 * Math.log(R)) * (180 / Math.PI);
        });
    },
    [monthRows],
  );

  const windTrend = useMemo(() => trendLabel(sparkWind), [sparkWind]);
  const tiTrend = useMemo(() => trendLabel(sparkTI), [sparkTI]);
  const maxGustTrend = useMemo(() => trendLabel(sparkMaxGust), [sparkMaxGust]);
  const dirTrend = useMemo(() => trendLabel(sparkDirVar), [sparkDirVar]);

  // ─── Weibull 분포 파라미터 추정 (선택 월 ch1 일간 평균 풍속 기준) ───
  // Lanczos 근사로 감마 함수 계산
  const gammaLanczos = (z: number): number => {
    const g = 7;
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaLanczos(1 - z));
    const zz = z - 1;
    let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (zz + i);
    const t = zz + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, zz + 0.5) * Math.exp(-t) * x;
  };

  const weibullStats = useMemo(() => {
    // 선택 월 ch1 avg_value 배열
    const values = selectedMonthStats
      .filter((r) => r.channel === "ch1" && typeof r.avg_value === "number" && (r.avg_value as number) > 0)
      .map((r) => r.avg_value as number);
    if (values.length < 3) return null;

    const n = values.length;
    const mu = values.reduce((a, b) => a + b, 0) / n;
    const sigma = Math.sqrt(values.reduce((s, v) => s + (v - mu) ** 2, 0) / n);
    if (sigma <= 0 || mu <= 0) return null;

    // Method of Moments: k = (σ/μ)^-1.086
    const k = Math.pow(sigma / mu, -1.086);
    // A = μ / Γ(1 + 1/k)
    const A = mu / gammaLanczos(1 + 1 / k);

    // 히스토그램 빈(bin) 생성
    const maxV = Math.max(...values);
    const binCount = 10;
    const binSize = maxV / binCount;
    const bins = Array.from({ length: binCount }, (_, i) => {
      const lo = i * binSize;
      const hi = (i + 1) * binSize;
      const count = values.filter((v) => v >= lo && (i === binCount - 1 ? v <= hi : v < hi)).length;
      const freq = count / n;
      // Weibull PDF: (k/A) * (x/A)^(k-1) * exp(-(x/A)^k)
      const xMid = (lo + hi) / 2;
      const pdf = xMid > 0 ? (k / A) * Math.pow(xMid / A, k - 1) * Math.exp(-Math.pow(xMid / A, k)) * binSize : 0;
      return { bin: `${lo.toFixed(1)}~${hi.toFixed(1)}`, freq, pdf, xMid };
    });

    return { k, A, bins, mu, sigma, n };
  }, [selectedMonthStats]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 풍속 전단 분석 (Power Law) ───
  // 기본 높이 매핑 (EXCEL_SENSOR_META 기반)
  const SHEAR_HEIGHTS: Record<string, number> = { ch1: 100, ch2: 96, ch3: 80, ch4: 80, ch5: 60, ch6: 60, ch7: 40, ch8: 40 };

  const windShearStats = useMemo(() => {
    // 선택 월 각 채널별 평균 풍속 계산
    const channelAvg = new Map<string, number>();
    for (const ch of Object.keys(SHEAR_HEIGHTS)) {
      const vals = selectedMonthStats
        .filter((r) => r.channel === ch && typeof r.avg_value === "number" && (r.avg_value as number) > 0)
        .map((r) => r.avg_value as number);
      if (vals.length > 0) channelAvg.set(ch, vals.reduce((a, b) => a + b, 0) / vals.length);
    }

    // ch1(100m)과 ch7(40m) 쌍으로 α 계산
    const v1 = channelAvg.get("ch1");
    const v7 = channelAvg.get("ch7");
    const h1 = SHEAR_HEIGHTS["ch1"];
    const h7 = SHEAR_HEIGHTS["ch7"];

    if (!v1 || !v7 || v1 <= 0 || v7 <= 0) return null;
    const alpha = Math.log(v1 / v7) / Math.log(h1 / h7);

    // 수직 풍속 프로파일 — 데이터 있는 채널만
    const profile = Object.entries(SHEAR_HEIGHTS)
      .filter(([ch]) => channelAvg.has(ch))
      .map(([ch, height]) => ({
        height,
        speed: channelAvg.get(ch)!,
        ch,
      }))
      .sort((a, b) => b.height - a.height); // 높이 내림차순

    return { alpha, profile };
  }, [selectedMonthStats]); // eslint-disable-line react-hooks/exhaustive-deps

  // 전체 기간 KPI
  const allAvgWind = useMemo(() => {
    const values = dailyStats.filter((r) => r.channel === "ch1" && typeof r.avg_value === "number").map((r) => r.avg_value as number);
    if (!values.length) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }, [dailyStats]);

  const allTurbulenceIntensity = useMemo(() => {
    const rows = dailyStats.filter((r) => r.channel === "ch1" && typeof r.avg_value === "number" && typeof r.std_value === "number" && (r.avg_value as number) > 0);
    if (!rows.length) return null;
    const tis = rows.map((r) => ((r.std_value as number) / (r.avg_value as number)) * 100);
    return Math.max(0, Math.min(100, tis.reduce((a, b) => a + b, 0) / tis.length));
  }, [dailyStats]);

  const allMaxGust = useMemo(() => {
    const rows = dailyStats.filter((r) => ["ch1", "ch2", "ch3", "ch4", "ch5", "ch7"].includes(r.channel) && typeof r.max_value === "number");
    if (!rows.length) return null;
    return Math.max(...rows.map((r) => r.max_value as number));
  }, [dailyStats]);

  const allWindDirVariability = useMemo(() => {
    const angles = dailyStats.filter((r) => ["ch13", "ch14", "ch15", "ch16"].includes(r.channel) && typeof r.avg_value === "number").map((r) => (r.avg_value as number) * Math.PI / 180);
    if (!angles.length) return null;
    const c = angles.reduce((a, x) => a + Math.cos(x), 0) / angles.length;
    const s = angles.reduce((a, x) => a + Math.sin(x), 0) / angles.length;
    const R = Math.sqrt(c * c + s * s);
    if (R <= 0) return null;
    return Math.sqrt(-2 * Math.log(R)) * (180 / Math.PI);
  }, [dailyStats]);

  // 일별 KPI (selectedDate 기준, measurements 원시 데이터)
  const dayAvgWind = useMemo(() => {
    const values = dailyExcelData.map((m) => m.ch1).filter((v): v is number => typeof v === "number");
    if (!values.length) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }, [dailyExcelData]);

  const dayTurbulenceIntensity = useMemo(() => {
    const values = dailyExcelData.map((m) => m.ch1).filter((v): v is number => typeof v === "number");
    if (values.length < 2) return null;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean <= 0) return null;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    return Math.max(0, Math.min(100, (Math.sqrt(variance) / mean) * 100));
  }, [dailyExcelData]);

  const dayMaxGust = useMemo(() => {
    const chKeys = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch7"] as const;
    const values = dailyExcelData.flatMap((m) => chKeys.map((ch) => m[ch]).filter((v): v is number => typeof v === "number"));
    if (!values.length) return null;
    return Math.max(...values);
  }, [dailyExcelData]);

  const dayWindDirVariability = useMemo(() => {
    const chKeys = ["ch13", "ch14", "ch15", "ch16"] as const;
    const angles = dailyExcelData
      .flatMap((m) => chKeys.map((ch) => m[ch]).filter((v): v is number => typeof v === "number"))
      .map((v) => v * Math.PI / 180);
    if (!angles.length) return null;
    const c = angles.reduce((a, x) => a + Math.cos(x), 0) / angles.length;
    const s = angles.reduce((a, x) => a + Math.sin(x), 0) / angles.length;
    const R = Math.sqrt(c * c + s * s);
    if (R <= 0) return null;
    return Math.sqrt(-2 * Math.log(R)) * (180 / Math.PI);
  }, [dailyExcelData]);

  // 기간 선택에 따른 활성 KPI
  const activeAvgWind = overviewKpiPeriod === "all" ? allAvgWind : overviewKpiPeriod === "day" ? dayAvgWind : monthAvgWind;
  const activeTI = overviewKpiPeriod === "all" ? allTurbulenceIntensity : overviewKpiPeriod === "day" ? dayTurbulenceIntensity : monthTurbulenceIntensity;
  const activeMaxGust = overviewKpiPeriod === "all" ? allMaxGust : overviewKpiPeriod === "day" ? dayMaxGust : monthMaxGust;
  const activeDirVar = overviewKpiPeriod === "all" ? allWindDirVariability : overviewKpiPeriod === "day" ? dayWindDirVariability : monthWindDirVariability;

  const sensorWindRows = useMemo(() => {
    const speedChannels = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch7"] as const;
    if (overviewKpiPeriod === "day") {
      return speedChannels.map((ch) => {
        const values = dailyExcelData.map((m) => m[ch]).filter((v): v is number => typeof v === "number");
        const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
        const latest = values.length ? values[values.length - 1] : null;
        return { ch, label: CHANNEL_LABELS[ch], avg, latest };
      });
    }
    const source = overviewKpiPeriod === "all" ? dailyStats : monthRows;
    return speedChannels.map((ch) => {
      const rows = source.filter((r) => r.channel === ch && typeof r.avg_value === "number");
      const values = rows.map((r) => r.avg_value as number);
      const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
      const latest = values.length ? values[values.length - 1] : null;
      return { ch, label: CHANNEL_LABELS[ch], avg, latest };
    });
  }, [overviewKpiPeriod, monthRows, dailyStats, dailyExcelData]);

  const sensorWindUiRows = useMemo(() => {
    return sensorWindRows.map((row) => {
      let state: "ok" | "warn" | "err" = "ok";
      const v = row.latest ?? row.avg ?? 0;
      if (v >= 12) state = "warn";
      if (v >= 18) state = "err";
      return { ...row, state };
    });
  }, [sensorWindRows]);

  const tempByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of dailyStats) {
      if (r.channel === "ch22" && typeof r.avg_value === "number") map.set(r.date, r.avg_value);
    }
    return map;
  }, [dailyStats]);

  const pressureByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of dailyStats) {
      if (r.channel === "ch17" && typeof r.avg_value === "number") map.set(r.date, r.avg_value);
    }
    return map;
  }, [dailyStats]);

  const estimateDailyRows = useMemo(() => {
    const byDate = monthRows
      .filter((r) => r.channel === "ch1" && typeof r.avg_value === "number")
      .sort((a, b) => a.date.localeCompare(b.date));

    const scenario = selectedScenario;
    return byDate.map((r) => {
      const v = r.avg_value as number;
      const dc = r.data_count ?? 0;
      const uncertaintyPct = dc >= 100 ? 8 : dc >= 50 ? 12 : 16;
      const p50raw = estimateDailyEnergyMwh({
        windSpeed: v,
        tempC: tempByDate.get(r.date),
        pressureHpa: pressureByDate.get(r.date),
        scenario,
        assumptions: DEFAULT_SIMULATION_ASSUMPTIONS,
      });
      const { p50, p75, p90 } = estimatePValuesFromP50(p50raw, uncertaintyPct);
      const quality = dc >= 100 ? "정상" : dc >= 50 ? "주의" : "낮음";
      return {
        date: r.date.slice(5),
        wind: v,
        p50,
        p75,
        p90,
        quality,
      };
    });
  }, [monthRows, selectedScenario, tempByDate, pressureByDate]);

  // Overview WindRose — 선택 높이
  const overviewWindRoseData = useMemo(() => {
    const speedCh = "ch1";
    const dirCh = windRoseDirCh;
    if (overviewKpiPeriod === "day") {
      return dailyExcelData.map((m) => ({ dir: m[dirCh], speed: m[speedCh] }));
    }
    const source = overviewKpiPeriod === "all" ? dailyStats : selectedMonthStats;
    const dirByDate = new Map<string, number>();
    const speedByDate = new Map<string, number>();
    for (const r of source) {
      if (r.channel === dirCh && typeof r.avg_value === "number") dirByDate.set(r.date, r.avg_value);
      if (r.channel === speedCh && typeof r.avg_value === "number") speedByDate.set(r.date, r.avg_value);
    }
    const dates = new Set([...dirByDate.keys(), ...speedByDate.keys()]);
    return Array.from(dates).map((d) => ({ dir: dirByDate.get(d) ?? null, speed: speedByDate.get(d) ?? null }));
  }, [overviewKpiPeriod, windRoseDirCh, dailyExcelData, dailyStats, selectedMonthStats]);

  // 일별 WindRose — 선택 높이
  const dailyWindRoseData = useMemo(() => {
    const PAIRS: Record<"ch13"|"ch14"|"ch15"|"ch16", "ch1"|"ch3"|"ch5"|"ch7"> = { ch13: "ch1", ch14: "ch3", ch15: "ch5", ch16: "ch7" };
    const speedCh = PAIRS[dailyWindRoseDirCh];
    return dailyExcelData.map((m) => ({ dir: m[dailyWindRoseDirCh] as number | null | undefined, speed: m[speedCh] as number | null | undefined }));
  }, [dailyExcelData, dailyWindRoseDirCh]);

  // 일별 WindRose — 전체 높이 종합
  const dailyWindRoseAllData = useMemo(() => {
    const PAIRS = [
      { dir: "ch13" as const, speed: "ch1" as const },
      { dir: "ch14" as const, speed: "ch3" as const },
      { dir: "ch15" as const, speed: "ch5" as const },
      { dir: "ch16" as const, speed: "ch7" as const },
    ];
    return PAIRS.flatMap(({ dir, speed }) =>
      dailyExcelData.map((m) => ({ dir: m[dir], speed: m[speed] }))
    );
  }, [dailyExcelData]);

  // Overview WindRose — 전체 높이 종합 (ch13↔ch1, ch14↔ch3, ch15↔ch5, ch16↔ch7)
  const overviewWindRoseAllData = useMemo(() => {
    const PAIRS = [
      { dir: "ch13", speed: "ch1" },
      { dir: "ch14", speed: "ch3" },
      { dir: "ch15", speed: "ch5" },
      { dir: "ch16", speed: "ch7" },
    ] as const;
    if (overviewKpiPeriod === "day") {
      return PAIRS.flatMap(({ dir, speed }) =>
        dailyExcelData.map((m) => ({ dir: m[dir], speed: m[speed] }))
      );
    }
    const source = overviewKpiPeriod === "all" ? dailyStats : selectedMonthStats;
    return PAIRS.flatMap(({ dir: dirCh, speed: speedCh }) => {
      const dirByDate = new Map<string, number>();
      const speedByDate = new Map<string, number>();
      for (const r of source) {
        if (r.channel === dirCh && typeof r.avg_value === "number") dirByDate.set(r.date, r.avg_value);
        if (r.channel === speedCh && typeof r.avg_value === "number") speedByDate.set(r.date, r.avg_value);
      }
      const dates = new Set([...dirByDate.keys(), ...speedByDate.keys()]);
      return Array.from(dates).map((d) => ({ dir: dirByDate.get(d) ?? null, speed: speedByDate.get(d) ?? null }));
    });
  }, [overviewKpiPeriod, dailyExcelData, dailyStats, selectedMonthStats]);

  const estimateRowsForPeriod = useMemo(() => {
    if (overviewKpiPeriod === "day") {
      return estimateDailyRows.slice(-1);
    }

    if (overviewKpiPeriod === "month") {
      return estimateDailyRows;
    }

    const monthMap = new Map<string, { date: string; windSum: number; p50Sum: number; p75Sum: number; p90Sum: number; count: number; qualityScore: number }>();
    const scenario = selectedScenario;
    for (const row of dailyStats.filter((r) => r.channel === "ch1" && typeof r.avg_value === "number")) {
      const key = row.date.slice(0, 7);
      const v = row.avg_value as number;
      const uncertaintyPct = (row.data_count ?? 0) >= 100 ? 8 : (row.data_count ?? 0) >= 50 ? 12 : 16;
      const p50raw = estimateDailyEnergyMwh({
        windSpeed: v,
        tempC: tempByDate.get(row.date),
        pressureHpa: pressureByDate.get(row.date),
        scenario,
        assumptions: DEFAULT_SIMULATION_ASSUMPTIONS,
      });
      const { p50, p75, p90 } = estimatePValuesFromP50(p50raw, uncertaintyPct);
      const prev = monthMap.get(key) ?? { date: key, windSum: 0, p50Sum: 0, p75Sum: 0, p90Sum: 0, count: 0, qualityScore: 0 };
      prev.windSum += v;
      prev.p50Sum += p50;
      prev.p75Sum += p75;
      prev.p90Sum += p90;
      prev.count += 1;
      prev.qualityScore += (row.data_count ?? 0) >= 100 ? 2 : (row.data_count ?? 0) >= 50 ? 1 : 0;
      monthMap.set(key, prev);
    }
    return Array.from(monthMap.values()).map((r) => ({
      date: r.date,
      wind: r.count ? r.windSum / r.count : 0,
      p50: r.p50Sum,
      p75: r.p75Sum,
      p90: r.p90Sum,
      quality: r.qualityScore >= r.count * 1.5 ? "정상" : r.qualityScore >= r.count ? "주의" : "낮음",
    }));
  }, [estimateDailyRows, overviewKpiPeriod, dailyStats, selectedScenario, tempByDate, pressureByDate]);

  const effectiveSimDates = useMemo(() => {
    if (simPreset === "custom") return { start: simStartDate, end: simEndDate };
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - (simPreset === "3M" ? 3 : simPreset === "6M" ? 6 : 12));
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }, [simPreset, simStartDate, simEndDate]);

  const simulationDailyRows = useMemo(() => {
    const start = new Date(`${effectiveSimDates.start}T00:00:00`);
    const end = new Date(`${effectiveSimDates.end}T23:59:59`);

    const baseRows = dailyStats
      .filter((r) => r.channel === "ch1" && typeof r.avg_value === "number")
      .filter((r) => {
        const x = new Date(`${r.date}T00:00:00`);
        return x >= start && x <= end;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const scenario = selectedScenario;
    const ageLossPct = Math.round(AGE_LOSS_MAP[turbineAgeBand] * 100);

    const longWindRows = dailyStats
      .filter((r) => r.channel === "ch1" && typeof r.avg_value === "number")
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-365)
      .map((r) => r.avg_value as number);
    const recentWindRows = baseRows.map((r) => r.avg_value as number);
    const mcpLite = calculateMcpLiteFactor({ recentWind: recentWindRows, longWind: longWindRows });

    return baseRows.map((r) => {
      const v = r.avg_value as number;
      const dc2 = r.data_count ?? 0;
      const uncertaintyPct = dc2 >= 100 ? 8 : dc2 >= 50 ? 12 : 16;
      const p50raw = estimateDailyEnergyMwh({
        windSpeed: v,
        tempC: tempByDate.get(r.date),
        pressureHpa: pressureByDate.get(r.date),
        scenario,
        assumptions: DEFAULT_SIMULATION_ASSUMPTIONS,
        extraLossPct: ageLossPct,
      });
      const p50adj = p50raw * mcpLite.factor;
      const { p50, p75, p90 } = estimatePValuesFromP50(p50adj, uncertaintyPct);
      return { date: r.date, wind: v, p50, p75, p90 };
    });
  }, [dailyStats, effectiveSimDates, turbineAgeBand, selectedScenario, tempByDate, pressureByDate]);

  const mcpLiteSummary = useMemo(() => {
    const longWindRows = dailyStats
      .filter((r) => r.channel === "ch1" && typeof r.avg_value === "number")
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-365)
      .map((r) => r.avg_value as number);
    const recentWindRows = simulationDailyRows.map((r) => r.wind);
    return calculateMcpLiteFactor({ recentWind: recentWindRows, longWind: longWindRows });
  }, [dailyStats, simulationDailyRows]);

  const simulationRows = useMemo(() => {
    if (simPeriod === "daily") {
      return simulationDailyRows.map((r) => ({ ...r, label: r.date.slice(5) }));
    }
    if (simPeriod === "weekly") {
      const weekMap = new Map<string, { label: string; windSum: number; p50Sum: number; p75Sum: number; p90Sum: number; count: number }>();
      for (const r of simulationDailyRows) {
        const dd = Number(r.date.slice(-2));
        const mm = Number(r.date.slice(5, 7));
        const key = `${mm}월 ${Math.ceil(dd / 7)}주`;
        const prev = weekMap.get(key) ?? { label: key, windSum: 0, p50Sum: 0, p75Sum: 0, p90Sum: 0, count: 0 };
        prev.windSum += r.wind;
        prev.p50Sum += r.p50;
        prev.p75Sum += r.p75;
        prev.p90Sum += r.p90;
        prev.count += 1;
        weekMap.set(key, prev);
      }
      return Array.from(weekMap.values()).map((r) => ({
        label: r.label,
        wind: r.count ? r.windSum / r.count : 0,
        p50: r.p50Sum,
        p75: r.p75Sum,
        p90: r.p90Sum,
      }));
    }

    const monthMap = new Map<string, { label: string; windSum: number; p50Sum: number; p75Sum: number; p90Sum: number; count: number }>();
    for (const r of simulationDailyRows) {
      const key = r.date.slice(0, 7);
      const prev = monthMap.get(key) ?? { label: key, windSum: 0, p50Sum: 0, p75Sum: 0, p90Sum: 0, count: 0 };
      prev.windSum += r.wind;
      prev.p50Sum += r.p50;
      prev.p75Sum += r.p75;
      prev.p90Sum += r.p90;
      prev.count += 1;
      monthMap.set(key, prev);
    }
    return Array.from(monthMap.values()).map((r) => ({
      label: r.label,
      wind: r.count ? r.windSum / r.count : 0,
      p50: r.p50Sum,
      p75: r.p75Sum,
      p90: r.p90Sum,
    }));
  }, [simulationDailyRows, simPeriod]);

  const simulationSummary = useMemo(() => {
    const totalP50 = simulationDailyRows.reduce((a, b) => a + b.p50, 0);
    const totalP75 = simulationDailyRows.reduce((a, b) => a + b.p75, 0);
    const totalP90 = simulationDailyRows.reduce((a, b) => a + b.p90, 0);

    const p50 = simulationRows.reduce((a, b) => a + b.p50, 0);
    const p75 = simulationRows.reduce((a, b) => a + b.p75, 0);
    const p90 = simulationRows.reduce((a, b) => a + b.p90, 0);
    const avgWind = simulationRows.length ? simulationRows.reduce((a, b) => a + b.wind, 0) / simulationRows.length : 0;
    const avgP50 = simulationRows.length ? p50 / simulationRows.length : 0;
    const avgP75 = simulationRows.length ? p75 / simulationRows.length : 0;
    const avgP90 = simulationRows.length ? p90 / simulationRows.length : 0;
    return { totalP50, totalP75, totalP90, avgWind, avgP50, avgP75, avgP90, loss: AGE_LOSS_MAP[turbineAgeBand] };
  }, [simulationDailyRows, simulationRows, turbineAgeBand]);

  const metMastQuality = useMemo(() => {
    const ch1Rows = dailyStats.filter((r) => r.channel === "ch1" && typeof r.avg_value === "number");
    const n = ch1Rows.length;
    if (!n) return { grade: "C" as const, coverage: 0, highQualityPct: 0, avgPoints: 0, reason: "관측 데이터 부족" };
    const highQuality = ch1Rows.filter((r) => (r.data_count ?? 0) >= 100).length;
    const avgPoints = ch1Rows.reduce((a, b) => a + (b.data_count ?? 0), 0) / n;
    const highQualityPct = Math.round((highQuality / n) * 100);
    const coverage = monthCoverage;
    const grade = coverage >= MET_MAST_GRADE_RULES.A.minCoveragePct && highQualityPct >= MET_MAST_GRADE_RULES.A.minHighQualityPct
      ? "A"
      : coverage >= MET_MAST_GRADE_RULES.B.minCoveragePct && highQualityPct >= MET_MAST_GRADE_RULES.B.minHighQualityPct
      ? "B"
      : "C";
    const reason = grade === "A" ? "커버리지/데이터수 양호" : grade === "B" ? "보완 관측 권장" : "보완 관측 필요";
    return { grade, coverage, highQualityPct, avgPoints, reason };
  }, [dailyStats, monthCoverage]);

  const uncertaintyBreakdown = useMemo(() => {
    const measurementPct = metMastQuality.grade === "A" ? 6 : metMastQuality.grade === "B" ? 9 : 12;
    const modelPct = 8;
    const mcpPct = mcpLiteSummary.confidence === "high" ? 4 : mcpLiteSummary.confidence === "medium" ? 6 : 8;
    const totalPct = Math.sqrt(measurementPct ** 2 + modelPct ** 2 + mcpPct ** 2);
    const p90p50 = Math.max(0.7, 1 - 1.28 * (totalPct / 100));
    const p75p50 = Math.max(0.8, 1 - 0.67 * (totalPct / 100));
    return { measurementPct, modelPct, mcpPct, totalPct, p75p50, p90p50 };
  }, [metMastQuality.grade, mcpLiteSummary.confidence]);

  const simulationMeta = useMemo(() => {
    const assumptions = DEFAULT_SIMULATION_ASSUMPTIONS;
    const totalLossPct = assumptions.availabilityLossPct + assumptions.electricalLossPct + assumptions.wakeLossPct + assumptions.curtailmentLossPct + assumptions.icingLossPct + assumptions.otherLossPct + Math.round(AGE_LOSS_MAP[turbineAgeBand] * 100);
    return {
      version: "prebankable-v1",
      generatedAt: new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }).format(new Date()),
      totalLossPct,
    };
  }, [turbineAgeBand]);

  const simulationAssessment = useMemo(() => {
    const coverage = monthCoverage;
    const wind = simulationSummary.avgWind;
    if (coverage >= 80 && wind >= 6.5) {
      return { grade: "타당", tone: "text-emerald-700 bg-emerald-50 border-emerald-200", reason: "풍황/커버리지 기준 충족" };
    }
    if (coverage >= 60 && wind >= 5.5) {
      return { grade: "조건부 타당", tone: "text-amber-700 bg-amber-50 border-amber-200", reason: "추가 관측 또는 가정 점검 필요" };
    }
    return { grade: "보류", tone: "text-rose-700 bg-rose-50 border-rose-200", reason: "데이터 품질 또는 풍황 기준 미달" };
  }, [monthCoverage, simulationSummary.avgWind]);

  const simulationAdvice = useMemo(() => {
    const p90Ratio = simulationSummary.totalP50 > 0 ? simulationSummary.totalP90 / simulationSummary.totalP50 : 0;
    const coverage = monthCoverage;
    const wind = simulationSummary.avgWind;
    const lossPct = Math.round(simulationSummary.loss * 100);

    let range: [number, number] = [4.0, 4.5];
    if (wind >= 6.5 && p90Ratio >= 0.85 && coverage >= 80) range = [5.0, 6.2];
    else if (wind >= 5.8 && p90Ratio >= 0.8 && coverage >= 70) range = [4.5, 5.6];
    else if (wind >= 5.5 && p90Ratio >= 0.78 && coverage >= 60) range = [4.0, 5.0];

    const inRange = selectedScenario.ratedMw >= range[0] && selectedScenario.ratedMw <= range[1];

    let summary = `현재 조건의 현실적 용량 범위는 ${range[0].toFixed(1)}~${range[1].toFixed(1)}MW로 추정됩니다.`;
    if (!inRange) {
      summary += ` 선택값 ${selectedScenario.ratedMw.toFixed(1)}MW는 권장 범위를 벗어납니다.`;
    }

    if (coverage < 60) summary += ` 데이터 커버리지(${coverage}%)가 낮아 신뢰도는 제한적입니다.`;
    else if (p90Ratio < 0.8) summary += ` P90/P50=${toFixedOrDash(p90Ratio, 2)}로 불확실성이 큰 편입니다.`;

    return {
      summary,
      basis: [
        `평균 풍속: ${toFixedOrDash(wind, 2)} m/s`,
        `데이터 커버리지: ${coverage}%`,
        `P90/P50 비율: ${toFixedOrDash(p90Ratio, 2)}`,
        `연식 손실률 가정: ${lossPct}%`,
      ],
      range,
      inRange,
    };
  }, [simulationSummary, monthCoverage, selectedScenario]);

  const simulationConclusion = useMemo(() => {
    const p90ratio = simulationSummary.totalP50 > 0 ? simulationSummary.totalP90 / simulationSummary.totalP50 : 0;
    return `현재 평가는 ${simulationAssessment.grade}이며, 데이터 커버리지 ${monthCoverage}%, P90/P50 ${toFixedOrDash(p90ratio, 2)} 기준으로 ${simulationAdvice.summary}`;
  }, [simulationAssessment.grade, monthCoverage, simulationSummary.totalP50, simulationSummary.totalP90, simulationAdvice.summary]);

  // ─── AEP 연간 발전량 추정 (전체 ch1 데이터 기반 Weibull 적분) ───
  const aepEstimate = useMemo(() => {
    const values = dailyStats
      .filter((r) => r.channel === "ch1" && typeof r.avg_value === "number" && (r.avg_value as number) > 0)
      .map((r) => r.avg_value as number);
    if (values.length < 10) return null;

    const n = values.length;
    const mu = values.reduce((a, b) => a + b, 0) / n;
    const sigma = Math.sqrt(values.reduce((s, v) => s + (v - mu) ** 2, 0) / n);
    if (sigma <= 0 || mu <= 0) return null;

    const k = Math.pow(sigma / mu, -1.086);
    const A = mu / gammaLanczos(1 + 1 / k);

    const scenario = selectedScenario;
    const totalLossPct =
      DEFAULT_SIMULATION_ASSUMPTIONS.availabilityLossPct +
      DEFAULT_SIMULATION_ASSUMPTIONS.electricalLossPct +
      DEFAULT_SIMULATION_ASSUMPTIONS.wakeLossPct +
      DEFAULT_SIMULATION_ASSUMPTIONS.curtailmentLossPct +
      DEFAULT_SIMULATION_ASSUMPTIONS.icingLossPct +
      DEFAULT_SIMULATION_ASSUMPTIONS.otherLossPct +
      Math.round(simulationSummary.loss * 100);

    const tempVals = dailyStats.filter((r) => r.channel === "ch22" && typeof r.avg_value === "number").map((r) => r.avg_value as number);
    const pressVals = dailyStats.filter((r) => r.channel === "ch17" && typeof r.avg_value === "number").map((r) => r.avg_value as number);
    const avgTemp = tempVals.length ? tempVals.reduce((a, b) => a + b, 0) / tempVals.length : 15;
    const avgPress = pressVals.length ? pressVals.reduce((a, b) => a + b, 0) / pressVals.length : 1013.25;
    const rho = (avgPress * 100) / (287.05 * (avgTemp + 273.15));
    const densityRatio = Math.min(Math.max(rho / 1.225, 0.9), 1.1);

    const dv = 0.1;
    let aepKwh = 0;
    for (let v = dv / 2; v < 30; v += dv) {
      const pdf = v > 0 ? (k / A) * Math.pow(v / A, k - 1) * Math.exp(-Math.pow(v / A, k)) : 0;
      const adjV = v * Math.cbrt(densityRatio);
      const powerKw = interpolatePowerKw(adjV, scenario.powerCurve, scenario.cutIn, scenario.cutOut);
      aepKwh += powerKw * pdf * dv * 8760;
    }

    const aepGrossGwh = aepKwh / 1e6;
    const aepNetGwh = aepGrossGwh * (1 - totalLossPct / 100);
    const cf = aepNetGwh / ((scenario.ratedMw * 8760) / 1e3);
    const p75 = aepNetGwh * uncertaintyBreakdown.p75p50;
    const p90 = aepNetGwh * uncertaintyBreakdown.p90p50;

    return { k, A, mu, n, aepGrossGwh, aepNetGwh, cf, p75, p90, scenario: scenario.name, totalLossPct };
  }, [dailyStats, selectedScenario, simulationSummary.loss, uncertaintyBreakdown]); // eslint-disable-line react-hooks/exhaustive-deps

  const downloadPreFeasibilityReport = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const rows = [
      ["항목", "값"],
      ["리포트 버전", simulationMeta.version],
      ["생성시각(KST)", simulationMeta.generatedAt],
      ["사이트", `${site.name} (${site.site_number})`],
      ["기간", `${effectiveSimDates.start} ~ ${effectiveSimDates.end}`],
      ["터빈", `${selectedScenario.name} (${selectedScenario.ratedMw.toFixed(1)}MW)`],
      ["풍황 신뢰도 등급", metMastQuality.grade],
      ["월 커버리지(%)", metMastQuality.coverage],
      ["고품질 일비율(%)", metMastQuality.highQualityPct],
      ["MCP-lite 계수", Number(toFixedOrDash(mcpLiteSummary.factor, 3))],
      ["총 손실률(%)", simulationMeta.totalLossPct],
      ["총합 불확실성(%)", Number(toFixedOrDash(uncertaintyBreakdown.totalPct, 1))],
      ["P75/P50 참고비율", Number(toFixedOrDash(uncertaintyBreakdown.p75p50, 2))],
      ["P90/P50 참고비율", Number(toFixedOrDash(uncertaintyBreakdown.p90p50, 2))],
      ["누적 P50(MWh)", Number(toFixedOrDash(simulationSummary.totalP50, 1))],
      ["누적 P75(MWh)", Number(toFixedOrDash(simulationSummary.totalP75, 1))],
      ["누적 P90(MWh)", Number(toFixedOrDash(simulationSummary.totalP90, 1))],
      ["주의", "본 문서는 사전타당성(Pre-bankable) 참고용이며 발전량 보증값이 아닙니다."],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Pre-Feasibility");
    XLSX.writeFile(wb, `${site.site_number}_${effectiveSimDates.start}_${effectiveSimDates.end}_PreFeasibility.xlsx`);
  }, [
    simulationMeta,
    site.name,
    site.site_number,
    effectiveSimDates,
    selectedScenario,
    metMastQuality,
    mcpLiteSummary.factor,
    uncertaintyBreakdown,
    simulationSummary,
  ]);

  return (
    <div className="space-y-6 sitekit">
      <div className="topbar">
        <div className="crumbs"><b>Overview</b> · {site.site_number}</div>
        <div className="search">
          <Search size={14} />
          <input placeholder="Search data, channels, alerts…" />
        </div>
        <button className="topbar-btn" title="Notifications"><Bell size={16} /></button>
      </div>

      <div className="page-head">
        <div>
          <h1>{site.name}</h1>
          <div className="sub">{site.location_name ?? "위치 미입력"} · 최근 동기화 {latestDataDate}</div>
        </div>
        <div className="actions">
          <button onClick={downloadMonthlyExcel} className="btn btn-primary"><Download size={15} />Export report</button>
        </div>
      </div>

      <div className="flex gap-1 bg-white/70 rounded-xl p-1 w-fit border border-[#d6e8ff] overflow-x-auto shadow-[0_6px_16px_rgba(10,37,64,0.06)]">
        {(["overview", "daily", "monthly", "simulation"] as Tab[]).map((key) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${tab === key ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-700"}`}>
            {key === "overview" ? "Overview" : key === "daily" ? "일별 데이터" : key === "monthly" ? "월별 통계" : "사업성 시뮬레이션"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 bg-white/70 rounded-xl p-1 border border-[#d6e8ff] shadow-[0_4px_12px_rgba(10,37,64,0.06)]">
              {(["all", "month", "day"] as const).map((p) => (
                <button key={p} onClick={() => setOverviewKpiPeriod(p)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${overviewKpiPeriod === p ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-700"}`}>
                  {p === "all" ? "전체 기간" : p === "month" ? "월간" : "일별"}
                </button>
              ))}
            </div>
            {overviewKpiPeriod === "month" && (
              <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-xs border border-[#c8def8] rounded-lg px-2 py-1 text-slate-700 bg-white focus:outline-none focus:border-blue-500" />
            )}
            {overviewKpiPeriod === "day" && (
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                className="text-xs border border-[#c8def8] rounded-lg px-2 py-1 text-slate-700 bg-white focus:outline-none focus:border-blue-500" />
            )}
          </div>
          <div className="kpi-row">
            <div className="kpi-card">
              <div className="k-icon"><Wind size={16} /></div>
              <div className="k-label">평균 풍속</div>
              <div className="k-num">{toFixedOrDash(activeAvgWind, 2)}<span className="u">m/s</span></div>
              <div className="k-foot"><span className={`k-delta ${windTrend.cls}`}>{windTrend.text}</span><MiniSparkline points={sparkWind} color="#2f80ed" /></div>
            </div>
            <div className="kpi-card">
              <div className="k-icon"><BarChart2 size={16} /></div>
              <div className="k-label">난류 강도</div>
              <div className="k-num">{toFixedOrDash(activeTI, 1)}<span className="u">%</span></div>
              <div className="k-foot"><span className={`k-delta ${tiTrend.cls}`}>{tiTrend.text}</span><MiniSparkline points={sparkTI} color="#10b981" /></div>
            </div>
            <div className="kpi-card">
              <div className="k-icon"><Activity size={16} /></div>
              <div className="k-label">최대 순간 풍속</div>
              <div className="k-num">{toFixedOrDash(activeMaxGust, 1)}<span className="u">m/s</span></div>
              <div className="k-foot"><span className={`k-delta ${maxGustTrend.cls}`}>{maxGustTrend.text}</span><MiniSparkline points={sparkMaxGust} color="#8b5cf6" /></div>
            </div>
            <div className="kpi-card">
              <div className="k-icon"><MapPin size={16} /></div>
              <div className="k-label">풍향 변동성</div>
              <div className="k-num">{toFixedOrDash(activeDirVar, 1)}<span className="u">°</span></div>
              <div className="k-foot"><span className={`k-delta ${dirTrend.cls}`}>{dirTrend.text}</span><MiniSparkline points={sparkDirVar} color="#ef4444" /></div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <div className="p-title">풍속 출력 추이</div>
                <div className="p-sub">{overviewKpiPeriod === "all" ? "전체 기간 월별 평균" : overviewKpiPeriod === "month" ? `${selectedMonth} 일별 평균` : `${selectedDate} 10분 데이터`}</div>
              </div>
            </div>
            {overviewChartSeries.length === 0 ? (
              <div className="text-sm text-slate-500 py-10 text-center">월간 데이터가 없습니다</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={overviewChartSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d6e8ff" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} unit=" m/s" />
                  <Tooltip contentStyle={{ backgroundColor: "rgba(255,255,255,0.96)", border: "1px solid #d6e8ff", borderRadius: "8px", color: "#0f172a" }} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Line type="monotone" dataKey="ch1" name="100m 풍속" stroke={CHART_COLORS.ch1} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ch2" name="96m 풍속" stroke={CHART_COLORS.ch2} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ch3" name="80m 풍속" stroke={CHART_COLORS.ch3} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ch4" name="80m 풍속(S)" stroke={CHART_COLORS.ch4} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ch5" name="60m 풍속" stroke={CHART_COLORS.ch5} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ch6" name="60m 풍속(S)" stroke={CHART_COLORS.ch6} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ch7" name="40m 풍속" stroke={CHART_COLORS.ch7} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ch8" name="40m 풍속(S)" stroke={CHART_COLORS.ch8} dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3 items-stretch">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <div className="p-title">Wind Direction Rose</div>
                  <div className="p-sub">방향 분포 및 풍속 밴드</div>
                </div>
                <select
                  value={windRoseDirCh}
                  onChange={(e) => setWindRoseDirCh(e.target.value as "ch13" | "ch14" | "ch15" | "ch16")}
                  className="rounded-lg border border-[#d6e8ff] bg-white px-2 py-1 text-xs text-slate-700"
                >
                  <option value="ch13">97m (ch13)</option>
                  <option value="ch14">77m (ch14)</option>
                  <option value="ch15">57m (ch15)</option>
                  <option value="ch16">37m (ch16)</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <WindRose data={overviewWindRoseAllData} label="전 높이 종합" />
                <WindRose
                  data={overviewWindRoseData}
                  label={windRoseDirCh === "ch13" ? "97m" : windRoseDirCh === "ch14" ? "77m" : windRoseDirCh === "ch15" ? "57m" : "37m"}
                />
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <div>
                  <div className="p-title">센서별 풍속</div>
                  <div className="p-sub">채널별 평균값과 최신값</div>
                </div>
              </div>
              <div className="t-head">
                <div />
                <div>Sensor</div>
                <div className="right">Avg</div>
                <div className="right">Latest</div>
              </div>
              <div>
                {sensorWindUiRows.map((row) => (
                  <div key={row.ch} className="t-row">
                    <div className={`t-dot ${row.state}`} />
                    <div>
                      <div className="t-name">{row.label}</div>
                      <div className="t-site">{row.ch.toUpperCase()}</div>
                    </div>
                    <div className="t-num">{toFixedOrDash(row.avg, 2)}</div>
                    <div className="t-num">{toFixedOrDash(row.latest, 2)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <div className="p-title">일자별 사업성 추정</div>
                  <div className="p-sub">신뢰구간(P50/P75/P90) 포함 추정값</div>
                </div>
              </div>

              {estimateRowsForPeriod.length === 0 ? (
                <div className="text-sm text-slate-500 py-10 text-center">추정 가능한 데이터가 없습니다</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={estimateRowsForPeriod}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#d6e8ff" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} unit=" MWh" />
                      <Tooltip contentStyle={{ backgroundColor: "rgba(255,255,255,0.96)", border: "1px solid #d6e8ff", borderRadius: "8px", color: "#0f172a" }} />
                      <Legend wrapperStyle={{ fontSize: "12px" }} />
                      <Line type="monotone" dataKey="p50" name="P50" stroke="#2f80ed" dot={false} strokeWidth={2.2} />
                      <Line type="monotone" dataKey="p75" name="P75" stroke="#10b981" dot={false} strokeWidth={1.8} />
                      <Line type="monotone" dataKey="p90" name="P90" stroke="#f59e0b" dot={false} strokeWidth={1.8} />
                    </LineChart>
                  </ResponsiveContainer>

                  <div className="mt-3 h-[190px] overflow-auto border border-[#d6e8ff] rounded-lg">
                    <table className="w-full min-w-[680px] text-xs">
                      <thead>
                        <tr className="border-b border-[#d6e8ff] text-slate-500">
                          <th className="text-left px-2 py-2">날짜</th>
                          <th className="text-right px-2 py-2">평균풍속</th>
                          <th className="text-right px-2 py-2">P50</th>
                          <th className="text-right px-2 py-2">P75</th>
                          <th className="text-right px-2 py-2">P90</th>
                          <th className="text-right px-2 py-2">품질</th>
                        </tr>
                      </thead>
                      <tbody>
                        {estimateRowsForPeriod.map((r) => (
                          <tr key={r.date} className="border-b border-[#e6f0ff] text-slate-700">
                            <td className="px-2 py-2">{r.date}</td>
                            <td className="px-2 py-2 text-right">{toFixedOrDash(r.wind, 2)} m/s</td>
                            <td className="px-2 py-2 text-right">{toFixedOrDash(r.p50, 1)}</td>
                            <td className="px-2 py-2 text-right">{toFixedOrDash(r.p75, 1)}</td>
                            <td className="px-2 py-2 text-right">{toFixedOrDash(r.p90, 1)}</td>
                            <td className="px-2 py-2 text-right">{r.quality}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 rounded-lg border border-[#d6e8ff] bg-white/70 p-3 text-[11px] text-slate-600">
                    기준: 풍속 기반 파워커브 근사 · 정격 4.2MW · 손실 17% · 결과는 사업성 검토용 추정치(보증 아님)
                  </div>
                </>
              )}
            </div>

            <div className="panel">
              <div className="panel-head">
                <div>
                  <div className="p-title">사이트 정보</div>
                  <div className="p-sub">위치 및 계측기 기본 정보</div>
                </div>
              </div>
              <div className="space-y-3 text-sm">
                {[["사이트 번호", site.site_number], ["현장 주소", site.location_name ?? "-"], ["위도", site.latitude != null ? `${toFixedOrDash(site.latitude, 6)}° N` : "-"], ["경도", site.longitude != null ? `${toFixedOrDash(site.longitude, 6)}° E` : "-"], ["고도", site.elevation != null ? `${toFixedOrDash(site.elevation, 1)} m` : "-"], ["iPack", site.ipack_email ?? "-"]].map(([l, v]) => (
                  <div key={l} className="flex justify-between gap-4"><span className="text-slate-500">{l}</span><span className="text-slate-800 font-mono text-xs text-right">{v}</span></div>
                ))}
              </div>
              <div className="pt-1 space-y-2">
                <div className="rounded-lg border border-[#d6e8ff] bg-white/70 overflow-hidden">
                  {site.latitude != null && site.longitude != null ? (
                    <iframe
                      title="site-map"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${site.longitude - 0.01}%2C${site.latitude - 0.01}%2C${site.longitude + 0.01}%2C${site.latitude + 0.01}&layer=mapnik&marker=${site.latitude}%2C${site.longitude}`}
                      className="w-full h-52"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  ) : (
                    <div className="h-52 flex items-center justify-center text-xs text-slate-500">지도 좌표 정보가 없습니다</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "daily" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-500">날짜</label>
              <div className="flex items-center gap-2">
                <input
                  ref={dateInputRef}
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  onKeyDown={(e) => e.preventDefault()}
                  onFocus={undefined}
                  className="rounded-xl border border-[#c8def8] bg-white/70 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => dateInputRef.current?.showPicker?.()}
                  className="rounded-lg border border-[#c8def8] bg-white/70 p-2 text-slate-700 hover:text-slate-900"
                  title="날짜 선택"
                >
                  <CalendarDays className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {loading ? <div className="text-center py-12 text-slate-500 text-sm">로딩 중...</div>
          : dailyExcelData.length === 0 ? <div className="text-center py-12 text-slate-500 text-sm rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl">해당 날짜의 데이터가 없습니다</div>
          : <>
            <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2"><Wind className="w-4 h-4 text-blue-400" />Wind Speed</h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dailyExcelData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d6e8ff" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748b" }} interval={11} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} unit=" m/s" />
                  <Tooltip contentStyle={{ backgroundColor: "rgba(255,255,255,0.96)", border: "1px solid #d6e8ff", borderRadius: "8px", color: "#0f172a" }} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  {EXCEL_WIND_SPEED_CHANNELS.map((ch) => <Line key={ch} type="monotone" dataKey={ch} name={CHANNEL_LABELS[ch]} stroke={CHART_COLORS[ch] ?? "#3b82f6"} dot={false} strokeWidth={1.8} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Navigation className="w-4 h-4 text-blue-400" />Wind Direction Rose</h3>
                <select
                  value={dailyWindRoseDirCh}
                  onChange={(e) => setDailyWindRoseDirCh(e.target.value as "ch13" | "ch14" | "ch15" | "ch16")}
                  className="rounded-lg border border-[#d6e8ff] bg-white px-2 py-1 text-xs text-slate-700"
                >
                  <option value="ch13">97m (ch13)</option>
                  <option value="ch14">77m (ch14)</option>
                  <option value="ch15">57m (ch15)</option>
                  <option value="ch16">37m (ch16)</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <WindRose data={dailyWindRoseAllData} label="전 높이 종합" />
                <WindRose
                  data={dailyWindRoseData}
                  label={dailyWindRoseDirCh === "ch13" ? "97m" : dailyWindRoseDirCh === "ch14" ? "77m" : dailyWindRoseDirCh === "ch15" ? "57m" : "37m"}
                />
              </div>
            </div>

            <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-blue-400" />Atmospheric / Humidity / Temp</h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dailyExcelData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d6e8ff" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748b" }} interval={11} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#64748b" }} unit="°" domain={["auto", "auto"]} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#a855f7" }} unit=" hPa" domain={["auto", "auto"]} />
                  <Tooltip contentStyle={{ backgroundColor: "rgba(255,255,255,0.96)", border: "1px solid #d6e8ff", borderRadius: "8px", color: "#0f172a" }} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Line yAxisId="right" type="monotone" dataKey="ch17" name={CHANNEL_LABELS["ch17"]} stroke={CHART_COLORS["ch17"]} dot={false} strokeWidth={1.8} />
                  <Line yAxisId="left" type="monotone" dataKey="ch21" name={CHANNEL_LABELS["ch21"]} stroke={CHART_COLORS["ch21"]} dot={false} strokeWidth={1.8} />
                  <Line yAxisId="left" type="monotone" dataKey="ch22" name={CHANNEL_LABELS["ch22"]} stroke={CHART_COLORS["ch22"]} dot={false} strokeWidth={1.8} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl overflow-hidden">
              <div className="p-4 border-b border-[#d6e8ff] flex items-center gap-2 text-slate-900 text-sm font-semibold"><Table2 className="w-4 h-4 text-blue-400" />일별 10분 평균 데이터</div>
              <div className="overflow-x-auto overflow-y-visible">
                <table className="w-full min-w-[2400px] border-separate border-spacing-0">
                  <thead>
                    <tr className="border-b border-[#d6e8ff]/70">
                      <th className="sticky left-0 z-20 bg-white text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">센서</th>
                      <th className="sticky left-[200px] z-20 bg-white text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">높이</th>
                      {dailyExcelTable.timeLabels.map((t, i) => <th key={`${t}-${i}`} className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t}</th>)}
                      {['AVE', 'MAX', 'MIN', 'STD'].map((h, i) => <th key={h} className={`sticky ${RIGHT_SUMMARY_CLASS[i]} z-20 ${RIGHT_SUMMARY_BG_CLASS} w-[72px] min-w-[72px] max-w-[72px] text-left px-2 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider`}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#d6e8ff]/70">
                    {dailyExcelTable.rows.map((row) => (
                      <tr key={row.ch} className="hover:bg-blue-50/60 transition-colors">
                        <td className="sticky left-0 z-10 bg-white px-4 py-2.5 w-[200px] min-w-[200px] text-xs text-slate-800 whitespace-nowrap">{EXCEL_SENSOR_META[row.ch]?.description ?? CHANNEL_LABELS[row.ch]}</td>
                        <td className="sticky left-[200px] z-10 bg-white px-3 py-2.5 w-[92px] min-w-[92px] text-xs text-slate-700 whitespace-nowrap border-r border-[#d6e8ff]">{EXCEL_SENSOR_META[row.ch]?.height ?? "-"}</td>
                        {row.values.map((v, i) => <td key={`${row.ch}-${i}`} className="px-3 py-2.5 text-xs text-slate-700">{toFixedOrDash(v, 2)}</td>)}
                        <td className={`sticky right-[216px] z-10 ${RIGHT_SUMMARY_BG_CLASS} w-[72px] min-w-[72px] max-w-[72px] px-2 py-2.5 text-xs text-slate-700`}>{toFixedOrDash(row.ave, 2)}</td>
                        <td className={`sticky right-[144px] z-10 ${RIGHT_SUMMARY_BG_CLASS} w-[72px] min-w-[72px] max-w-[72px] px-2 py-2.5 text-xs text-slate-700`}>{toFixedOrDash(row.max, 2)}</td>
                        <td className={`sticky right-[72px] z-10 ${RIGHT_SUMMARY_BG_CLASS} w-[72px] min-w-[72px] max-w-[72px] px-2 py-2.5 text-xs text-slate-700`}>{toFixedOrDash(row.min, 2)}</td>
                        <td className={`sticky right-0 z-10 ${RIGHT_SUMMARY_BG_CLASS} w-[72px] min-w-[72px] max-w-[72px] px-2 py-2.5 text-xs text-slate-700`}>{toFixedOrDash(row.std, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>}
        </div>
      )}

      {tab === "monthly" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-500">월</label>
              <div className="flex items-center gap-2">
                <input
                  ref={monthInputRef}
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  onKeyDown={(e) => e.preventDefault()}
                  onFocus={undefined}
                  className="rounded-xl border border-[#c8def8] bg-white/70 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => monthInputRef.current?.showPicker?.()}
                  className="rounded-lg border border-[#c8def8] bg-white/70 p-2 text-slate-700 hover:text-slate-900"
                  title="월 선택"
                >
                  <CalendarDays className="w-4 h-4" />
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={downloadMonthlyExcel}
              className="rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-500/20"
            >
              고객사 엑셀 다운로드
            </button>
          </div>

          {loading ? <div className="text-center py-12 text-slate-500 text-sm">로딩 중...</div>
          : excelMonthlyChartData.length === 0 ? <div className="text-center py-12 text-slate-500 text-sm rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl">해당 월의 데이터가 없습니다</div>
          : <>
            <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2"><BarChart2 className="w-4 h-4 text-blue-400" />엑셀형 월간 채널 비교 그래프 (평균값)</h3>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={excelMonthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d6e8ff" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} unit=" m/s" />
                  <Tooltip contentStyle={{ backgroundColor: "rgba(255,255,255,0.96)", border: "1px solid #d6e8ff", borderRadius: "8px", color: "#0f172a" }} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Line type="monotone" dataKey="ch1" name="100m 풍속 (N)" stroke={CHART_COLORS.ch1} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ch2" name="96m 풍속 (N)" stroke={CHART_COLORS.ch2} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ch3" name="80m 풍속 (N)" stroke={CHART_COLORS.ch3} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ch4" name="80m 풍속 (S)" stroke={CHART_COLORS.ch4} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ch5" name="60m 풍속 (N)" stroke={CHART_COLORS.ch5} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ch6" name="60m 풍속 (S)" stroke={CHART_COLORS.ch6} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ch7" name="40m 풍속 (N)" stroke={CHART_COLORS.ch7} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ch8" name="40m 풍속 (S)" stroke={CHART_COLORS.ch8} dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Navigation className="w-4 h-4 text-blue-400" />Wind Direction Rose</h3>
                <select
                  value={monthlyWindRoseDirCh}
                  onChange={(e) => setMonthlyWindRoseDirCh(e.target.value as "ch13" | "ch14" | "ch15" | "ch16")}
                  className="rounded-lg border border-[#d6e8ff] bg-white px-2 py-1 text-xs text-slate-700"
                >
                  <option value="ch13">97m (ch13)</option>
                  <option value="ch14">77m (ch14)</option>
                  <option value="ch15">57m (ch15)</option>
                  <option value="ch16">37m (ch16)</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <WindRose data={monthlyWindRoseAllData} label="전 높이 종합" />
                <WindRose
                  data={monthlyWindRoseData}
                  label={monthlyWindRoseDirCh === "ch13" ? "97m" : monthlyWindRoseDirCh === "ch14" ? "77m" : monthlyWindRoseDirCh === "ch15" ? "57m" : "37m"}
                />
              </div>
            </div>

            {/* ── Weibull 분포 분석 ── */}
            <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-blue-400" />Weibull 분포 분석 (ch1 · {selectedMonth})
              </h3>
              {!weibullStats ? (
                <div className="text-center py-8 text-slate-500 text-sm">데이터 부족 (최소 3일 필요)</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                    <div className="rounded-lg border border-[#d6e8ff] bg-white px-4 py-3">
                      <div className="text-xs text-slate-500 mb-1">형상 계수 k</div>
                      <div className="text-lg font-bold text-slate-900">{weibullStats.k.toFixed(3)}</div>
                    </div>
                    <div className="rounded-lg border border-[#d6e8ff] bg-white px-4 py-3">
                      <div className="text-xs text-slate-500 mb-1">척도 계수 A (m/s)</div>
                      <div className="text-lg font-bold text-slate-900">{weibullStats.A.toFixed(3)}</div>
                    </div>
                    <div className="rounded-lg border border-[#d6e8ff] bg-white px-4 py-3">
                      <div className="text-xs text-slate-500 mb-1">평균 풍속 μ</div>
                      <div className="text-lg font-bold text-slate-900">{weibullStats.mu.toFixed(2)} m/s</div>
                    </div>
                    <div className="rounded-lg border border-[#d6e8ff] bg-white px-4 py-3">
                      <div className="text-xs text-slate-500 mb-1">표준편차 σ</div>
                      <div className="text-lg font-bold text-slate-900">{weibullStats.sigma.toFixed(2)} m/s</div>
                    </div>
                  </div>
                  {/* 히스토그램 + Weibull 곡선 오버레이 */}
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={weibullStats.bins} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#d6e8ff" />
                      <XAxis dataKey="bin" tick={{ fontSize: 9, fill: "#64748b" }} interval={0} angle={-30} textAnchor="end" height={44} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v: number) => (v * 100).toFixed(1) + "%"} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "rgba(255,255,255,0.96)", border: "1px solid #d6e8ff", borderRadius: "8px", color: "#0f172a" }}
                        formatter={(value: unknown, name: unknown) => {
                          const v = typeof value === "number" ? value : 0;
                          return [name === "freq" ? (v * 100).toFixed(2) + "%" : v.toFixed(4), name === "freq" ? "실측 빈도" : "Weibull PDF"];
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "11px" }} formatter={(v) => v === "freq" ? "실측 빈도" : "Weibull PDF"} />
                      <Line type="monotone" dataKey="freq" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="pdf" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="5 3" />
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="text-[11px] text-slate-400 mt-2">Method of Moments · 데이터 {weibullStats.n}일</p>
                </>
              )}
            </div>

            {/* ── 풍속 전단 분석 ── */}
            <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Wind className="w-4 h-4 text-blue-400" />풍속 전단 분석 (Wind Shear · {selectedMonth})
              </h3>
              {!windShearStats ? (
                <div className="text-center py-8 text-slate-500 text-sm">ch1(100m) / ch7(40m) 데이터 부족</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                    <div className="rounded-lg border border-[#d6e8ff] bg-white px-4 py-3 col-span-1">
                      <div className="text-xs text-slate-500 mb-1">전단 지수 α</div>
                      <div className="text-lg font-bold text-slate-900">{windShearStats.alpha.toFixed(4)}</div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {windShearStats.alpha < 0.1 ? "매우 낮음 (불안정)" : windShearStats.alpha < 0.2 ? "낮음 (양호)" : windShearStats.alpha < 0.3 ? "표준 (IEC 1/7≈0.143)" : "높음 (안정)"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-[#d6e8ff] bg-white px-4 py-3">
                      <div className="text-xs text-slate-500 mb-1">100m 평균 풍속</div>
                      <div className="text-lg font-bold text-slate-900">
                        {windShearStats.profile.find((p) => p.ch === "ch1")?.speed.toFixed(2) ?? "-"} m/s
                      </div>
                    </div>
                    <div className="rounded-lg border border-[#d6e8ff] bg-white px-4 py-3">
                      <div className="text-xs text-slate-500 mb-1">40m 평균 풍속</div>
                      <div className="text-lg font-bold text-slate-900">
                        {windShearStats.profile.find((p) => p.ch === "ch7")?.speed.toFixed(2) ?? "-"} m/s
                      </div>
                    </div>
                  </div>
                  {/* 수직 풍속 프로파일 차트 */}
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={windShearStats.profile} layout="vertical" margin={{ top: 4, right: 24, left: 16, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#d6e8ff" />
                      <XAxis type="number" dataKey="speed" tick={{ fontSize: 11, fill: "#64748b" }} unit=" m/s" domain={["auto", "auto"]} />
                      <YAxis type="number" dataKey="height" tick={{ fontSize: 11, fill: "#64748b" }} unit="m" domain={["auto", "auto"]} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "rgba(255,255,255,0.96)", border: "1px solid #d6e8ff", borderRadius: "8px", color: "#0f172a" }}
                        formatter={(value: unknown) => { const v = typeof value === "number" ? value : 0; return [`${v.toFixed(2)} m/s`, "평균 풍속"]; }}
                        labelFormatter={(label) => `높이 ${label}m`}
                      />
                      <Line type="monotone" dataKey="speed" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 5, fill: "#3b82f6" }} />
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="text-[11px] text-slate-400 mt-2">Power Law: α = log(V₂/V₁) / log(H₂/H₁) · ch1(100m) ↔ ch7(40m)</p>
                </>
              )}
            </div>

            <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl overflow-hidden">
              <div className="p-4 border-b border-[#d6e8ff] flex items-center gap-2 text-slate-900 text-sm font-semibold"><Table2 className="w-4 h-4 text-blue-400" />월별 통계 데이터</div>
              <div className="overflow-x-auto overflow-y-visible">
                <table className="w-full min-w-[2200px] border-separate border-spacing-0">
                  <thead>
                    <tr className="border-b border-[#d6e8ff]/70">
                      <th className="sticky left-0 z-20 bg-white text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">센서</th>
                      <th className="sticky left-[200px] z-20 bg-white text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">높이</th>
                      {excelMonthlyTable.dayLabels.map((d) => (
                        <th key={d} className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{d}</th>
                      ))}
                      {['AVE', 'MAX', 'MIN', 'STD'].map((h, i) => (
                        <th key={h} className={`sticky ${RIGHT_SUMMARY_CLASS[i]} z-20 ${RIGHT_SUMMARY_BG_CLASS} w-[72px] min-w-[72px] max-w-[72px] text-left px-2 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#d6e8ff]/70">
                    {excelMonthlyTable.rows.map((row) => (
                      <tr key={row.ch} className="hover:bg-blue-50/60 transition-colors">
                        <td className="sticky left-0 z-10 bg-white px-4 py-2.5 w-[200px] min-w-[200px] text-xs text-slate-800 whitespace-nowrap">{EXCEL_SENSOR_META[row.ch]?.description ?? CHANNEL_LABELS[row.ch]}</td>
                        <td className="sticky left-[200px] z-10 bg-white px-3 py-2.5 w-[92px] min-w-[92px] text-xs text-slate-700 whitespace-nowrap border-r border-[#d6e8ff]">{EXCEL_SENSOR_META[row.ch]?.height ?? "-"}</td>
                        {row.dayValues.map((v, i) => (
                          <td key={`${row.ch}-${i}`} className="px-3 py-2.5 text-xs text-slate-700">{toFixedOrDash(v, 2)}</td>
                        ))}
                        <td className={`sticky right-[216px] z-10 ${RIGHT_SUMMARY_BG_CLASS} w-[72px] min-w-[72px] max-w-[72px] px-2 py-2.5 text-xs text-slate-700`}>{toFixedOrDash(row.ave, 2)}</td>
                        <td className={`sticky right-[144px] z-10 ${RIGHT_SUMMARY_BG_CLASS} w-[72px] min-w-[72px] max-w-[72px] px-2 py-2.5 text-xs text-slate-700`}>{toFixedOrDash(row.max, 2)}</td>
                        <td className={`sticky right-[72px] z-10 ${RIGHT_SUMMARY_BG_CLASS} w-[72px] min-w-[72px] max-w-[72px] px-2 py-2.5 text-xs text-slate-700`}>{toFixedOrDash(row.min, 2)}</td>
                        <td className={`sticky right-0 z-10 ${RIGHT_SUMMARY_BG_CLASS} w-[72px] min-w-[72px] max-w-[72px] px-2 py-2.5 text-xs text-slate-700`}>{toFixedOrDash(row.std, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>}
        </div>
      )}

      {tab === "simulation" && (
        <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">사업성 시뮬레이션</h3>
            <button
              type="button"
              onClick={downloadPreFeasibilityReport}
              className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-500/20"
            >
              사전타당성 리포트 다운로드
            </button>
          </div>
          <p className="text-xs text-slate-600">연식 기반 손실률과 적용 구간을 선택해 P50/P75/P90 추정치를 계산합니다.</p>

          <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-3.5">
            <div className="text-[11px] tracking-wide text-blue-700 mb-1.5">한 줄 결론</div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="text-slate-600 text-xs">사업성 평가</span>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${simulationAssessment.tone}`}>{simulationAssessment.grade}</span>
              <span className="text-xs text-slate-500">{simulationAssessment.reason}</span>
            </div>
            <div className="text-[13px] leading-6 tracking-[0.01em] text-slate-900 font-medium">{simulationConclusion}</div>
            <div className="mt-1 text-[12px] leading-5 text-slate-700">{simulationAdvice.summary}</div>
          </div>

          <div className="overflow-x-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <div className="min-w-0 rounded-lg border border-[#d6e8ff] bg-white/70 p-2.5">
              <div className="text-slate-500 text-xs mb-2">핵심 지표</div>
              <div className="space-y-2 text-xs">
                <div className="rounded-md border border-[#d6e8ff] bg-white px-3 py-2"><div className="text-slate-500 tracking-wide">신뢰도 등급</div><div className="font-semibold text-slate-900 mt-0.5">{metMastQuality.grade}</div></div>
                <div className="rounded-md border border-[#d6e8ff] bg-white px-3 py-2"><div className="text-slate-500 tracking-wide">누적 P50</div><div className="font-semibold text-slate-900 mt-0.5">{toFixedOrDash(simulationSummary.totalP50, 1)} MWh</div></div>
                <div className="rounded-md border border-[#d6e8ff] bg-white px-3 py-2"><div className="text-slate-500 tracking-wide">P90/P50</div><div className="font-semibold text-slate-900 mt-0.5">{toFixedOrDash(simulationSummary.totalP50 > 0 ? simulationSummary.totalP90 / simulationSummary.totalP50 : 0, 2)}</div></div>
                <div className="rounded-md border border-[#d6e8ff] bg-white px-3 py-2"><div className="text-slate-500 tracking-wide">월 커버리지</div><div className="font-semibold text-slate-900 mt-0.5">{monthCoverage}%</div></div>
              </div>
            </div>

            <div className="min-w-0 rounded-lg border border-[#d6e8ff] bg-blue-50/50 p-2.5">
              <div className="text-slate-500 text-xs mb-2">터빈 설정</div>
              <div className="space-y-2 text-sm">
                <label className="space-y-1 block">
                  <span className="text-[11px] tracking-wide text-slate-500 inline-flex items-center gap-2 whitespace-nowrap">터빈 연식 구간 <b className="text-slate-700">손실률 {Math.round(simulationSummary.loss * 100)}%</b></span>
                  <select value={turbineAgeBand} onChange={(e) => setTurbineAgeBand(e.target.value as "0-5" | "6-10" | "11-15" | "16+")} className="w-full rounded-lg border border-[#d6e8ff] bg-white px-3 py-2 text-slate-800">
                    <option value="0-5">0~5년 (12%)</option>
                    <option value="6-10">6~10년 (15%)</option>
                    <option value="11-15">11~15년 (18%)</option>
                    <option value="16+">16년 이상 (22%)</option>
                  </select>
                </label>
                <label className="space-y-1 block">
                  <span className="text-[11px] tracking-wide text-slate-500">터빈 시나리오</span>
                  <select value={selectedScenarioKey} onChange={(e) => { setSelectedScenarioKey(e.target.value); const sc = allScenarios.find((s) => s.key === e.target.value); if (sc) setTurbineMw(sc.ratedMw); }} className="w-full rounded-lg border border-[#d6e8ff] bg-white px-3 py-2 text-slate-800">
                    <optgroup label="내장 기종">
                      {STANDARD_TURBINE_SCENARIOS.map((s) => (
                        <option key={s.key} value={s.key}>{s.name} · {s.ratedMw.toFixed(1)}MW</option>
                      ))}
                    </optgroup>
                    {dbTurbineCurves.length > 0 && (
                      <optgroup label="커스텀 커브 (DB)">
                        {dbTurbineCurves.map((s) => (
                          <option key={s.key} value={s.key}>{s.name} · {s.ratedMw.toFixed(1)}MW{s.notes ? ` (${s.notes})` : ""}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </label>
              </div>
            </div>

            <div className="min-w-0 rounded-lg border border-[#d6e8ff] bg-white/60 p-2.5">
              <div className="text-slate-500 text-xs mb-2">기간/표시 설정</div>
              <div className="space-y-2 text-sm">
                <label className="space-y-1 block">
                  <span className="text-[11px] tracking-wide text-slate-500">표시기준</span>
                  <select value={simPeriod} onChange={(e) => setSimPeriod(e.target.value as "daily" | "weekly" | "monthly")} className="w-full h-9 rounded-md border border-[#d6e8ff] bg-white px-2 text-slate-800">
                    <option value="daily">일별</option>
                    <option value="weekly">주별</option>
                    <option value="monthly">월별</option>
                  </select>
                </label>
                <label className="space-y-1 block">
                  <span className="text-[11px] tracking-wide text-slate-500">적용기간</span>
                  <select value={simPreset} onChange={(e) => setSimPreset(e.target.value as "3M" | "6M" | "12M" | "custom")} className="w-full h-9 rounded-md border border-[#d6e8ff] bg-white px-2 text-slate-800">
                    <option value="3M">3M</option>
                    <option value="6M">6M</option>
                    <option value="12M">12M</option>
                    <option value="custom">커스텀</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 block">
                    <span className="text-[11px] tracking-wide text-slate-500">시작</span>
                    <input type="date" disabled={simPreset !== "custom"} value={effectiveSimDates.start} onChange={(e) => setSimStartDate(e.target.value)} className="w-full h-9 rounded-md border border-[#d6e8ff] bg-white px-2 text-slate-800 disabled:bg-slate-100" />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-[11px] tracking-wide text-slate-500">종료</span>
                    <input type="date" disabled={simPreset !== "custom"} value={effectiveSimDates.end} onChange={(e) => setSimEndDate(e.target.value)} className="w-full h-9 rounded-md border border-[#d6e8ff] bg-white px-2 text-slate-800 disabled:bg-slate-100" />
                  </label>
                </div>
              </div>
            </div>
            </div>
          </div>

          

          {/* ── AEP 연간 발전량 추정 ── */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Wind className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-semibold text-slate-900">AEP 연간 발전량 추정</span>
              <span className="text-xs text-slate-400">(전체 기간 ch1 · Weibull 적분)</span>
            </div>
            {!aepEstimate ? (
              <p className="text-xs text-slate-500">ch1 일간 평균 데이터 10일 이상 필요합니다.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                  <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2.5">
                    <div className="text-[11px] text-slate-500 mb-0.5">AEP P50</div>
                    <div className="text-lg font-bold text-emerald-700">{aepEstimate.aepNetGwh.toFixed(2)} <span className="text-xs font-normal">GWh/yr</span></div>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2.5">
                    <div className="text-[11px] text-slate-500 mb-0.5">AEP P75</div>
                    <div className="text-lg font-bold text-slate-700">{aepEstimate.p75.toFixed(2)} <span className="text-xs font-normal">GWh/yr</span></div>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2.5">
                    <div className="text-[11px] text-slate-500 mb-0.5">AEP P90</div>
                    <div className="text-lg font-bold text-slate-700">{aepEstimate.p90.toFixed(2)} <span className="text-xs font-normal">GWh/yr</span></div>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2.5">
                    <div className="text-[11px] text-slate-500 mb-0.5">설비이용률 (CF)</div>
                    <div className="text-lg font-bold text-blue-700">{(aepEstimate.cf * 100).toFixed(1)} <span className="text-xs font-normal">%</span></div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-600">
                  <div className="rounded border border-[#d6e8ff] bg-white px-2 py-1.5">Weibull k = {aepEstimate.k.toFixed(3)}</div>
                  <div className="rounded border border-[#d6e8ff] bg-white px-2 py-1.5">Weibull A = {aepEstimate.A.toFixed(3)} m/s</div>
                  <div className="rounded border border-[#d6e8ff] bg-white px-2 py-1.5">총 손실률 {aepEstimate.totalLossPct}%</div>
                  <div className="rounded border border-[#d6e8ff] bg-white px-2 py-1.5">기준 터빈 {aepEstimate.scenario.split(" ").slice(1, 3).join(" ")}</div>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">데이터 {aepEstimate.n}일 · Gross {aepEstimate.aepGrossGwh.toFixed(2)} GWh · 순발전량 P50 기준</p>
              </>
            )}
          </div>

          <details className="rounded-lg border border-[#d6e8ff] bg-white/70 p-3 text-xs text-slate-700">
            <summary className="cursor-pointer font-semibold text-slate-900">근거 상세 보기</summary>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="rounded border border-[#d6e8ff] bg-white px-2 py-1.5">MCP-lite: {toFixedOrDash(mcpLiteSummary.factor, 3)} ({mcpLiteSummary.confidence}) · 최근 {toFixedOrDash(mcpLiteSummary.shortAvg, 2)} / 장기 {toFixedOrDash(mcpLiteSummary.longAvg, 2)} m/s</div>
              <div className="rounded border border-[#d6e8ff] bg-white px-2 py-1.5">불확실성(계측/모델/MCP): ±{toFixedOrDash(uncertaintyBreakdown.measurementPct, 1)} / ±{toFixedOrDash(uncertaintyBreakdown.modelPct, 1)} / ±{toFixedOrDash(uncertaintyBreakdown.mcpPct, 1)}%</div>
              <div className="rounded border border-[#d6e8ff] bg-white px-2 py-1.5">총합 불확실성: ±{toFixedOrDash(uncertaintyBreakdown.totalPct, 1)}% · P75/P50 {toFixedOrDash(uncertaintyBreakdown.p75p50, 2)} · P90/P50 {toFixedOrDash(uncertaintyBreakdown.p90p50, 2)}</div>
              <div className="rounded border border-[#d6e8ff] bg-white px-2 py-1.5">메타: {simulationMeta.version} · {simulationMeta.generatedAt} · 총손실률 {simulationMeta.totalLossPct}%</div>
            </div>
          </details>

          


          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-[#d6e8ff] bg-blue-50/50 p-3">
              <div className="text-slate-500 text-xs mb-2">누적 추정값</div>
              <table className="w-full text-xs">
                <tbody>
                  <tr><td className="py-1 text-slate-600">P50</td><td className="py-1 text-right font-semibold text-slate-900">{toFixedOrDash(simulationSummary.totalP50, 1)} MWh</td></tr>
                  <tr><td className="py-1 text-slate-600">P75</td><td className="py-1 text-right font-semibold text-slate-900">{toFixedOrDash(simulationSummary.totalP75, 1)} MWh</td></tr>
                  <tr><td className="py-1 text-slate-600">P90</td><td className="py-1 text-right font-semibold text-slate-900">{toFixedOrDash(simulationSummary.totalP90, 1)} MWh</td></tr>
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-[#d6e8ff] bg-white/60 p-3">
              <div className="text-slate-500 text-xs mb-2">기준 평균값</div>
              <table className="w-full text-xs">
                <tbody>
                  <tr><td className="py-1 text-slate-600">평균 풍속</td><td className="py-1 text-right font-semibold text-slate-900">{toFixedOrDash(simulationSummary.avgWind, 2)} m/s</td></tr>
                  <tr><td className="py-1 text-slate-600">평균 P50</td><td className="py-1 text-right font-semibold text-slate-900">{toFixedOrDash(simulationSummary.avgP50, 1)} MWh</td></tr>
                  <tr><td className="py-1 text-slate-600">평균 P75</td><td className="py-1 text-right font-semibold text-slate-900">{toFixedOrDash(simulationSummary.avgP75, 1)} MWh</td></tr>
                  <tr><td className="py-1 text-slate-600">평균 P90</td><td className="py-1 text-right font-semibold text-slate-900">{toFixedOrDash(simulationSummary.avgP90, 1)} MWh</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          

          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={simulationRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d6e8ff" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} unit=" MWh" />
              <Tooltip contentStyle={{ backgroundColor: "rgba(255,255,255,0.96)", border: "1px solid #d6e8ff", borderRadius: "8px", color: "#0f172a" }} />
              <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: "12px" }} />
              <Line type="monotone" dataKey="p50" name="P50" stroke="#2f80ed" dot={false} strokeWidth={2.2} />
              <Line type="monotone" dataKey="p75" name="P75" stroke="#10b981" dot={false} strokeWidth={1.8} strokeDasharray="6 4" />
              <Line type="monotone" dataKey="p90" name="P90" stroke="#f59e0b" dot={false} strokeWidth={1.8} strokeDasharray="2 3" />
            </LineChart>
          </ResponsiveContainer>

          <div className="h-[220px] overflow-auto border border-[#d6e8ff] rounded-lg">
            <table className="w-full min-w-[700px] text-xs">
              <thead>
                <tr className="border-b border-[#d6e8ff] text-slate-500">
                  <th className="text-left px-2 py-2">구간</th>
                  <th className="text-right px-2 py-2">평균풍속</th>
                  <th className="text-right px-2 py-2">P50</th>
                  <th className="text-right px-2 py-2">P75</th>
                  <th className="text-right px-2 py-2">P90</th>
                  <th className="text-right px-2 py-2">적용손실</th>
                </tr>
              </thead>
              <tbody>
                <tr className="sticky top-0 bg-blue-50 border-b border-[#cfe3ff] text-slate-800 font-semibold">
                  <td className="px-2 py-2">통합</td>
                  <td className="px-2 py-2 text-right">{toFixedOrDash(simulationSummary.avgWind, 2)} m/s</td>
                  <td className="px-2 py-2 text-right">{toFixedOrDash(simulationSummary.avgP50, 1)}</td>
                  <td className="px-2 py-2 text-right">{toFixedOrDash(simulationSummary.avgP75, 1)}</td>
                  <td className="px-2 py-2 text-right">{toFixedOrDash(simulationSummary.avgP90, 1)}</td>
                  <td className="px-2 py-2 text-right">{Math.round(simulationSummary.loss * 100)}%</td>
                </tr>
                {simulationRows.map((r, i) => (
                  <tr key={r.label} className={`border-b border-[#e6f0ff] text-slate-700 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                    <td className="px-2 py-1.5">{r.label}</td>
                    <td className="px-2 py-1.5 text-right">{toFixedOrDash(r.wind, 2)} m/s</td>
                    <td className="px-2 py-1.5 text-right">{toFixedOrDash(r.p50, 1)}</td>
                    <td className="px-2 py-1.5 text-right">{toFixedOrDash(r.p75, 1)}</td>
                    <td className="px-2 py-1.5 text-right">{toFixedOrDash(r.p90, 1)}</td>
                    <td className="px-2 py-1.5 text-right">{Math.round(simulationSummary.loss * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-amber-700">※ 시뮬레이션 값은 사업성 검토 참고용이며 발전량 보증값이 아닙니다.</p>
        </div>
      )}
    </div>
  );
}

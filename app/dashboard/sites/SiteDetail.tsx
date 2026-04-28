"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { MapPin, Activity, Wind, Navigation, BarChart2, Table2, CalendarDays, Search, Bell, Download } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import * as XLSX from "xlsx";
import type { Site, DailyStat, Measurement } from "@/lib/types";
import { CHANNEL_LABELS } from "@/lib/types";

type Tab = "overview" | "daily" | "monthly" | "simulation";

const EXCEL_DISPLAY_CHANNELS = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch7", "ch13", "ch14", "ch15", "ch16", "ch17", "ch21", "ch22"] as const;
const EXCEL_WIND_SPEED_CHANNELS = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch7"] as const;
const EXCEL_WIND_DIR_CHANNELS = ["ch13", "ch14", "ch15", "ch16"] as const;
const EXCEL_ATMO_CHANNELS = ["ch17", "ch21", "ch22"] as const;

const EXCEL_SENSOR_META: Record<string, { description: string; height: string }> = {
  ch1: { description: "2 - NRG 40C Anem", height: "100m" },
  ch2: { description: "3 - NRG 40C Anem", height: "96m" },
  ch3: { description: "4 - NRG 40C Anem", height: "80m" },
  ch4: { description: "5 - NRG 40C Anem", height: "80m" },
  ch5: { description: "6 - NRG 40C Anem", height: "60m" },
  ch7: { description: "7 - NRG 40C Anem", height: "40m" },
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
  ch7: "#14b8a6",
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

export default function SiteDetail({ site }: { site: Site }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [outputPeriod, setOutputPeriod] = useState<"1W" | "1M" | "1Y">("1M");
  const [overviewPeriod, setOverviewPeriod] = useState<"1W" | "1M" | "1Y">("1M");
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
  const [selectedDate, setSelectedDate] = useState(formatKSTDate());
  const [selectedMonth, setSelectedMonth] = useState(formatKSTMonth());
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const monthInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

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
    const allMeasurements: Measurement[] = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from("measurements")
        .select("*")
        .eq("site_id", site.id)
        .order("timestamp")
        .range(from, from + pageSize - 1);

      if (error) {
        setLoading(false);
        return;
      }

      const batch = data ?? [];
      allMeasurements.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }

    const statsMap: Record<string, { sum: number; count: number; min: number; max: number; sumSq: number }> = {};
    allMeasurements.forEach((m) => {
      const day = toUTCDateOnly(m.timestamp);
      EXCEL_DISPLAY_CHANNELS.forEach((ch) => {
        const value = m[ch as keyof Measurement] as number | null;
        if (typeof value !== "number") return;
        const key = `${day}|${ch}`;
        if (!statsMap[key]) statsMap[key] = { sum: 0, count: 0, min: value, max: value, sumSq: 0 };
        const s = statsMap[key];
        s.sum += value;
        s.count += 1;
        s.min = Math.min(s.min, value);
        s.max = Math.max(s.max, value);
        s.sumSq += value * value;
      });
    });

    const computed: DailyStat[] = Object.entries(statsMap).map(([key, s]) => {
      const [date, channel] = key.split("|");
      const avg = s.count ? s.sum / s.count : null;
      const variance = s.count && avg != null ? s.sumSq / s.count - avg * avg : null;
      return {
        id: `${site.id}-${date}-${channel}`,
        site_id: site.id,
        date,
        channel,
        avg_value: avg,
        max_value: s.count ? s.max : null,
        min_value: s.count ? s.min : null,
        std_value: variance != null ? Math.sqrt(Math.max(variance, 0)) : null,
        data_count: s.count,
      };
    });

    computed.sort((a, b) => (a.date === b.date ? a.channel.localeCompare(b.channel) : a.date.localeCompare(b.date)));
    setDailyStats(computed);
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
    if (tab !== "daily") return;
    queueMicrotask(() => {
      void loadMeasurements();
    });
  }, [tab, selectedDate, loadMeasurements]);

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
        ch7: m.ch7,
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
      .filter((s) => ["ch1", "ch2", "ch3"].includes(s.channel))
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
  }));

  const overviewChartSeries = useMemo(() => {
    if (outputPeriod === "1W") return overviewChartData.slice(-7);
    if (outputPeriod === "1M") return overviewChartData;

    const monthMap = new Map<string, { date: string; ch1: number; ch2: number; ch3: number; ch4: number; ch5: number; count: number }>();
    for (const row of dailyStats.filter((r) => ["ch1", "ch2", "ch3", "ch4", "ch5"].includes(r.channel) && typeof r.avg_value === "number")) {
      const key = row.date.slice(0, 7);
      const prev = monthMap.get(key) ?? { date: key, ch1: 0, ch2: 0, ch3: 0, ch4: 0, ch5: 0, count: 0 };
      const v = row.avg_value as number;
      if (row.channel === "ch1") prev.ch1 += v;
      if (row.channel === "ch2") prev.ch2 += v;
      if (row.channel === "ch3") prev.ch3 += v;
      if (row.channel === "ch4") prev.ch4 += v;
      if (row.channel === "ch5") prev.ch5 += v;
      prev.count += 1;
      monthMap.set(key, prev);
    }
    return Array.from(monthMap.values()).map((r) => ({
      date: r.date,
      ch1: r.count ? r.ch1 / r.count : 0,
      ch2: r.count ? r.ch2 / r.count : 0,
      ch3: r.count ? r.ch3 / r.count : 0,
      ch4: r.count ? r.ch4 / r.count : 0,
      ch5: r.count ? r.ch5 / r.count : 0,
    }));
  }, [outputPeriod, overviewChartData, dailyStats]);

  const excelMonthlyChartData = useMemo(() => {
    const rows = selectedMonthStats
      .filter((s) => ["ch1", "ch2", "ch3", "ch4", "ch5"].includes(s.channel))
      .reduce<Record<string, { date: string; ch1: number; ch2: number; ch3: number; ch4: number; ch5: number }>>((acc, s) => {
        if (!acc[s.date]) {
          acc[s.date] = { date: s.date.slice(5), ch1: 0, ch2: 0, ch3: 0, ch4: 0, ch5: 0 };
        }
        const v = s.avg_value ?? 0;
        if (s.channel === "ch1") acc[s.date].ch1 = v;
        if (s.channel === "ch2") acc[s.date].ch2 = v;
        if (s.channel === "ch3") acc[s.date].ch3 = v;
        if (s.channel === "ch4") acc[s.date].ch4 = v;
        if (s.channel === "ch5") acc[s.date].ch5 = v;
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

  const downloadMonthlyExcel = useCallback(() => {
    const fixedTemplates: Record<string, string> = {
      "2026-03": "/reports/202603_Wando_Daesin_Monthly_Report_260403.xlsx",
    };

    const templatePath = fixedTemplates[selectedMonth];
    if (templatePath) {
      const a = document.createElement("a");
      a.href = templatePath;
      a.download = `${site.site_number}_${selectedMonth}_Monthly_Report.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    const header = [
      "Description",
      "Height",
      ...excelMonthlyTable.dayLabels,
      "AVE",
      "MAX",
      "MIN",
      "STD",
    ];

    const rows = excelMonthlyTable.rows.map((row) => [
      EXCEL_SENSOR_META[row.ch]?.description ?? CHANNEL_LABELS[row.ch],
      EXCEL_SENSOR_META[row.ch]?.height ?? "-",
      ...row.dayValues.map((v) => (typeof v === "number" ? Number(v.toFixed(2)) : "")),
      typeof row.ave === "number" ? Number(row.ave.toFixed(2)) : "",
      typeof row.max === "number" ? Number(row.max.toFixed(2)) : "",
      typeof row.min === "number" ? Number(row.min.toFixed(2)) : "",
      typeof row.std === "number" ? Number(row.std.toFixed(2)) : "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Monthly");
    XLSX.writeFile(wb, `${site.site_number}_${selectedMonth}_Monthly_Report.xlsx`);
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
  const sparkCoverage = useMemo(() => monthRows.filter((r) => r.channel === "ch1").slice(-12).map((r) => (r.data_count ? 1 : 0)), [monthRows]);
  const sparkSync = useMemo(() => monthRows.slice(-12).map((r) => (r.avg_value != null ? 1 : 0)), [monthRows]);
  const sparkFail = useMemo(() => monthRows.slice(-12).map((r) => (r.std_value != null && r.std_value > 3 ? 1 : 0)), [monthRows]);

  const sensorWindRows = useMemo(() => {
    const speedChannels = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch7"] as const;
    return speedChannels.map((ch) => {
      const rows = monthRows.filter((r) => r.channel === ch && typeof r.avg_value === "number");
      const values = rows.map((r) => r.avg_value as number);
      const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
      const latest = values.length ? values[values.length - 1] : null;
      return { ch, label: CHANNEL_LABELS[ch], avg, latest };
    });
  }, [monthRows]);

  const sensorWindUiRows = useMemo(() => {
    return sensorWindRows.map((row) => {
      let state: "ok" | "warn" | "err" = "ok";
      const v = row.latest ?? row.avg ?? 0;
      if (v >= 12) state = "warn";
      if (v >= 18) state = "err";
      return { ...row, state };
    });
  }, [sensorWindRows]);

  const estimateDailyRows = useMemo(() => {
    const byDate = monthRows
      .filter((r) => r.channel === "ch1" && typeof r.avg_value === "number")
      .sort((a, b) => a.date.localeCompare(b.date));

    const ratedPowerMw = turbineMw;
    const losses = 0.17;
    return byDate.map((r) => {
      const v = r.avg_value as number;
      const grossCf = Math.min(Math.max((v - 3) / 9, 0), 1) ** 3;
      const netCf = Math.min(grossCf * 0.9, 0.62);
      const p50 = ratedPowerMw * 24 * netCf * (1 - losses);
      const p75 = p50 * 0.92;
      const p90 = p50 * 0.84;
      const quality = r.data_count >= 100 ? "정상" : r.data_count >= 50 ? "주의" : "낮음";
      return {
        date: r.date.slice(5),
        wind: v,
        p50,
        p75,
        p90,
        quality,
      };
    });
  }, [monthRows, turbineMw]);

  const estimateRowsForPeriod = useMemo(() => {
    if (overviewPeriod === "1W") {
      return estimateDailyRows.slice(-7);
    }

    if (overviewPeriod === "1M") {
      return estimateDailyRows;
    }

    const monthMap = new Map<string, { date: string; windSum: number; p50Sum: number; p75Sum: number; p90Sum: number; count: number; qualityScore: number }>();
    for (const row of dailyStats.filter((r) => r.channel === "ch1" && typeof r.avg_value === "number")) {
      const key = row.date.slice(0, 7);
      const v = row.avg_value as number;
      const ratedPowerMw = turbineMw;
      const grossCf = Math.min(Math.max((v - 3) / 9, 0), 1) ** 3;
      const netCf = Math.min(grossCf * 0.9, 0.62);
      const p50 = ratedPowerMw * 24 * netCf * (1 - 0.17);
      const p75 = p50 * 0.92;
      const p90 = p50 * 0.84;
      const prev = monthMap.get(key) ?? { date: key, windSum: 0, p50Sum: 0, p75Sum: 0, p90Sum: 0, count: 0, qualityScore: 0 };
      prev.windSum += v;
      prev.p50Sum += p50;
      prev.p75Sum += p75;
      prev.p90Sum += p90;
      prev.count += 1;
      prev.qualityScore += row.data_count >= 100 ? 2 : row.data_count >= 50 ? 1 : 0;
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
  }, [estimateDailyRows, overviewPeriod, dailyStats, turbineMw]);

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

    const loss = AGE_LOSS_MAP[turbineAgeBand];
    const ratedPowerMw = turbineMw;

    return baseRows.map((r) => {
      const v = r.avg_value as number;
      const grossCf = Math.min(Math.max((v - 3) / 9, 0), 1) ** 3;
      const netCf = Math.min(grossCf * 0.9, 0.62);
      const p50 = ratedPowerMw * 24 * netCf * (1 - loss);
      const p75 = p50 * 0.92;
      const p90 = p50 * 0.84;
      return { date: r.date, wind: v, p50, p75, p90 };
    });
  }, [dailyStats, effectiveSimDates, turbineAgeBand, turbineMw]);

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
        p50: r.count ? r.p50Sum / r.count : 0,
        p75: r.count ? r.p75Sum / r.count : 0,
        p90: r.count ? r.p90Sum / r.count : 0,
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
      p50: r.count ? r.p50Sum / r.count : 0,
      p75: r.count ? r.p75Sum / r.count : 0,
      p90: r.count ? r.p90Sum / r.count : 0,
    }));
  }, [simulationDailyRows, simPeriod]);

  const simulationSummary = useMemo(() => {
    const p50 = simulationRows.reduce((a, b) => a + b.p50, 0);
    const p75 = simulationRows.reduce((a, b) => a + b.p75, 0);
    const p90 = simulationRows.reduce((a, b) => a + b.p90, 0);
    const avgWind = simulationRows.length ? simulationRows.reduce((a, b) => a + b.wind, 0) / simulationRows.length : 0;
    const avgP50 = simulationRows.length ? p50 / simulationRows.length : 0;
    const avgP75 = simulationRows.length ? p75 / simulationRows.length : 0;
    const avgP90 = simulationRows.length ? p90 / simulationRows.length : 0;
    return { p50, p75, p90, avgWind, avgP50, avgP75, avgP90, loss: AGE_LOSS_MAP[turbineAgeBand] };
  }, [simulationRows, turbineAgeBand]);

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
          <div className="kpi-row">
            <div className="kpi-card">
              <div className="k-icon"><Wind size={16} /></div>
              <div className="k-label">Wind · avg</div>
              <div className="k-num">{toFixedOrDash(monthAvgWind, 2)}<span className="u">m/s</span></div>
              <div className="k-foot"><span className="k-delta flat">— steady</span><MiniSparkline points={sparkWind} color="#2f80ed" /></div>
            </div>
            <div className="kpi-card">
              <div className="k-icon"><BarChart2 size={16} /></div>
              <div className="k-label">Data coverage</div>
              <div className="k-num">{monthCoverage}<span className="u">%</span></div>
              <div className="k-foot"><span className="k-delta up">▲ monthly</span><MiniSparkline points={sparkCoverage} color="#10b981" /></div>
            </div>
            <div className="kpi-card">
              <div className="k-icon"><Activity size={16} /></div>
              <div className="k-label">Latest sync</div>
              <div className="k-num" style={{fontSize: "30px"}}>{latestDataDate}</div>
              <div className="k-foot"><span className="k-delta up">▲ synced</span><MiniSparkline points={sparkSync} color="#8b5cf6" /></div>
            </div>
            <div className="kpi-card">
              <div className="k-icon"><MapPin size={16} /></div>
              <div className="k-label">Observed days</div>
              <div className="k-num">{new Set(monthRows.filter((r) => r.channel === "ch1").map((r) => r.date)).size}<span className="u">days</span></div>
              <div className="k-foot"><span className="k-delta down">▼ risk</span><MiniSparkline points={sparkFail} color="#ef4444" /></div>
            </div>
          </div>

          <div className="grid">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <div className="p-title">풍속 출력 추이</div>
                  <div className="p-sub">기간별 센서 풍속 추세</div>
                </div>
                <div className="seg">
                  {(["1W", "1M", "1Y"] as const).map((p) => (
                    <span key={p} className={outputPeriod === p ? "on" : ""} onClick={() => setOutputPeriod(p)}>{p}</span>
                  ))}
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
                  </LineChart>
                </ResponsiveContainer>
              )}
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
                  <div className="p-sub">신뢰구간(P50/P75/P90) 포함 일별 추정값</div>
                </div>
                <div className="seg">
                  {(["1W", "1M", "1Y"] as const).map((p) => (
                    <span key={p} className={overviewPeriod === p ? "on" : ""} onClick={() => setOverviewPeriod(p)}>{p}</span>
                  ))}
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
                {[["사이트 번호", site.site_number], ["위치명", site.location_name ?? "-"], ["위도", site.latitude != null ? `${toFixedOrDash(site.latitude, 6)}° N` : "-"], ["경도", site.longitude != null ? `${toFixedOrDash(site.longitude, 6)}° E` : "-"], ["고도", site.elevation != null ? `${toFixedOrDash(site.elevation, 1)} m` : "-"], ["iPack", site.ipack_email ?? "-"]].map(([l, v]) => (
                  <div key={l} className="flex justify-between gap-4"><span className="text-slate-500">{l}</span><span className="text-slate-800 font-mono text-xs text-right">{v}</span></div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button onClick={() => setTab("daily")} className="rounded-lg border border-[#c8def8] bg-white/80 px-3 py-2 text-xs text-slate-700 hover:bg-blue-50">일간 데이터 보기</button>
                <button onClick={() => setTab("monthly")} className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-500">월간 통계 보기</button>
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
                  onFocus={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
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
              <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2"><Navigation className="w-4 h-4 text-blue-400" />Wind Direction</h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dailyExcelData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d6e8ff" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748b" }} interval={11} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} domain={[0, 360]} unit=" °" />
                  <Tooltip contentStyle={{ backgroundColor: "rgba(255,255,255,0.96)", border: "1px solid #d6e8ff", borderRadius: "8px", color: "#0f172a" }} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  {EXCEL_WIND_DIR_CHANNELS.map((ch) => <Line key={ch} type="monotone" dataKey={ch} name={CHANNEL_LABELS[ch]} stroke={CHART_COLORS[ch] ?? "#94a3b8"} dot={false} strokeWidth={1.8} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-blue-400" />Atmospheric / Humidity / Temp</h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dailyExcelData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d6e8ff" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748b" }} interval={11} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip contentStyle={{ backgroundColor: "rgba(255,255,255,0.96)", border: "1px solid #d6e8ff", borderRadius: "8px", color: "#0f172a" }} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  {EXCEL_ATMO_CHANNELS.map((ch) => <Line key={ch} type="monotone" dataKey={ch} name={CHANNEL_LABELS[ch]} stroke={CHART_COLORS[ch] ?? "#22d3ee"} dot={false} strokeWidth={1.8} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl overflow-hidden">
              <div className="p-4 border-b border-[#d6e8ff] flex items-center gap-2 text-slate-900 text-sm font-semibold"><Table2 className="w-4 h-4 text-blue-400" />10 Minutes Average Data (엑셀형 가로)</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[2400px]">
                  <thead>
                    <tr className="border-b border-[#d6e8ff]/70">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Height</th>
                      {dailyExcelTable.timeLabels.map((t, i) => <th key={`${t}-${i}`} className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t}</th>)}
                      {['AVE', 'MAX', 'MIN', 'STD'].map((h) => <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#d6e8ff]/70">
                    {dailyExcelTable.rows.map((row) => (
                      <tr key={row.ch} className="hover:bg-blue-50/60 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-slate-800 whitespace-nowrap">{EXCEL_SENSOR_META[row.ch]?.description ?? CHANNEL_LABELS[row.ch]}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-700 whitespace-nowrap">{EXCEL_SENSOR_META[row.ch]?.height ?? "-"}</td>
                        {row.values.map((v, i) => <td key={`${row.ch}-${i}`} className="px-3 py-2.5 text-xs text-slate-700">{toFixedOrDash(v, 2)}</td>)}
                        <td className="px-3 py-2.5 text-xs text-slate-700">{toFixedOrDash(row.ave, 2)}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-700">{toFixedOrDash(row.max, 2)}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-700">{toFixedOrDash(row.min, 2)}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-700">{toFixedOrDash(row.std, 2)}</td>
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
                  onFocus={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
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
          : Object.keys(excelMonthlyChartData).length === 0 ? <div className="text-center py-12 text-slate-500 text-sm rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl">해당 월의 데이터가 없습니다</div>
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
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl overflow-hidden">
              <div className="p-4 border-b border-[#d6e8ff] flex items-center gap-2 text-slate-900 text-sm font-semibold"><Table2 className="w-4 h-4 text-blue-400" />월별 통계 수치 (엑셀형 가로 테이블)</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[2200px]">
                  <thead>
                    <tr className="border-b border-[#d6e8ff]/70">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Height</th>
                      {excelMonthlyTable.dayLabels.map((d) => (
                        <th key={d} className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{d}</th>
                      ))}
                      {['AVE', 'MAX', 'MIN', 'STD'].map((h) => (
                        <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#d6e8ff]/70">
                    {excelMonthlyTable.rows.map((row) => (
                      <tr key={row.ch} className="hover:bg-blue-50/60 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-slate-800 whitespace-nowrap">{EXCEL_SENSOR_META[row.ch]?.description ?? CHANNEL_LABELS[row.ch]}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-700 whitespace-nowrap">{EXCEL_SENSOR_META[row.ch]?.height ?? "-"}</td>
                        {row.dayValues.map((v, i) => (
                          <td key={`${row.ch}-${i}`} className="px-3 py-2.5 text-xs text-slate-700">{toFixedOrDash(v, 2)}</td>
                        ))}
                        <td className="px-3 py-2.5 text-xs text-slate-700">{toFixedOrDash(row.ave, 2)}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-700">{toFixedOrDash(row.max, 2)}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-700">{toFixedOrDash(row.min, 2)}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-700">{toFixedOrDash(row.std, 2)}</td>
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
          <h3 className="text-sm font-semibold text-slate-900">사업성 시뮬레이션</h3>
          <p className="text-xs text-slate-600">연식 기반 손실률과 적용 구간을 선택해 P50/P75/P90 추정치를 계산합니다.</p>

          <div className={`rounded-lg border px-3 py-2 text-sm inline-flex items-center gap-2 ${simulationAssessment.tone}`}>
            <b>사업성 평가: {simulationAssessment.grade}</b>
            <span className="text-xs">({simulationAssessment.reason})</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-xs text-slate-500 inline-flex items-center gap-2">터빈 연식 구간 <b className="text-slate-700">손실률 {Math.round(simulationSummary.loss * 100)}%</b></span>
              <select value={turbineAgeBand} onChange={(e) => setTurbineAgeBand(e.target.value as "0-5" | "6-10" | "11-15" | "16+")} className="w-full rounded-lg border border-[#d6e8ff] bg-white px-3 py-2 text-slate-800">
                <option value="0-5">0~5년 (12%)</option>
                <option value="6-10">6~10년 (15%)</option>
                <option value="11-15">11~15년 (18%)</option>
                <option value="16+">16년 이상 (22%)</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-500">터빈 용량 (MW)</span>
              <select value={String(turbineMw)} onChange={(e) => setTurbineMw(Number(e.target.value))} className="w-full rounded-lg border border-[#d6e8ff] bg-white px-3 py-2 text-slate-800">
                <option value="3.6">3.6 MW</option>
                <option value="4.0">4.0 MW</option>
                <option value="4.2">4.2 MW</option>
                <option value="4.5">4.5 MW</option>
                <option value="5.0">5.0 MW</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-xs text-slate-500">적용기간 프리셋</span>
              <select value={simPreset} onChange={(e) => setSimPreset(e.target.value as "3M" | "6M" | "12M" | "custom")} className="w-full rounded-lg border border-[#d6e8ff] bg-white px-3 py-2 text-slate-800">
                <option value="3M">최근 3개월</option>
                <option value="6M">최근 6개월</option>
                <option value="12M">최근 12개월</option>
                <option value="custom">커스텀</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-500">적용 시작일</span>
              <input type="date" disabled={simPreset !== "custom"} value={effectiveSimDates.start} onChange={(e) => setSimStartDate(e.target.value)} className="w-full rounded-lg border border-[#d6e8ff] bg-white px-3 py-2 text-slate-800 disabled:bg-slate-100" />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-500">적용 종료일</span>
              <input type="date" disabled={simPreset !== "custom"} value={effectiveSimDates.end} onChange={(e) => setSimEndDate(e.target.value)} className="w-full rounded-lg border border-[#d6e8ff] bg-white px-3 py-2 text-slate-800 disabled:bg-slate-100" />
            </label>
          </div>

          <div className="space-y-1">
            <span className="text-xs text-slate-500">표시 기준</span>
            <div className="seg">
              {([
                { key: "daily", label: "일별" },
                { key: "weekly", label: "주별" },
                { key: "monthly", label: "월별" },
              ] as const).map((p) => (
                <span key={p.key} className={simPeriod === p.key ? "on" : ""} onClick={() => setSimPeriod(p.key)}>{p.label}</span>
              ))}
            </div>
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-[#d6e8ff] bg-blue-50/50 p-3">
              <div className="text-slate-500 text-xs mb-2">누적 추정값</div>
              <table className="w-full text-xs">
                <tbody>
                  <tr><td className="py-1 text-slate-600">P50</td><td className="py-1 text-right font-semibold text-slate-900">{toFixedOrDash(simulationSummary.p50, 1)} MWh</td></tr>
                  <tr><td className="py-1 text-slate-600">P75</td><td className="py-1 text-right font-semibold text-slate-900">{toFixedOrDash(simulationSummary.p75, 1)} MWh</td></tr>
                  <tr><td className="py-1 text-slate-600">P90</td><td className="py-1 text-right font-semibold text-slate-900">{toFixedOrDash(simulationSummary.p90, 1)} MWh</td></tr>
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

          <div className="rounded-lg border border-[#d6e8ff] bg-white/70 p-3 text-xs text-slate-600 space-y-1">
            <div><b>P50</b>: 기준 시나리오에서 초과 달성 확률이 약 50%인 중간값 추정치</div>
            <div><b>P75</b>: 보수적 관점의 추정치(초과 달성 확률 약 75%)</div>
            <div><b>P90</b>: 매우 보수적 추정치(초과 달성 확률 약 90%)</div>
          </div>

          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={simulationRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d6e8ff" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} unit=" MWh" />
              <Tooltip contentStyle={{ backgroundColor: "rgba(255,255,255,0.96)", border: "1px solid #d6e8ff", borderRadius: "8px", color: "#0f172a" }} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Line type="monotone" dataKey="p50" name="P50" stroke="#2f80ed" dot={false} strokeWidth={2.2} />
              <Line type="monotone" dataKey="p75" name="P75" stroke="#10b981" dot={false} strokeWidth={1.8} />
              <Line type="monotone" dataKey="p90" name="P90" stroke="#f59e0b" dot={false} strokeWidth={1.8} />
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
                {simulationRows.map((r) => (
                  <tr key={r.label} className="border-b border-[#e6f0ff] text-slate-700">
                    <td className="px-2 py-2">{r.label}</td>
                    <td className="px-2 py-2 text-right">{toFixedOrDash(r.wind, 2)} m/s</td>
                    <td className="px-2 py-2 text-right">{toFixedOrDash(r.p50, 1)}</td>
                    <td className="px-2 py-2 text-right">{toFixedOrDash(r.p75, 1)}</td>
                    <td className="px-2 py-2 text-right">{toFixedOrDash(r.p90, 1)}</td>
                    <td className="px-2 py-2 text-right">{Math.round(simulationSummary.loss * 100)}%</td>
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

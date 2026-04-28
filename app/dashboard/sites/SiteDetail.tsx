"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { MapPin, Activity, Wind, Navigation, BarChart2, Table2, CalendarDays } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import * as XLSX from "xlsx";
import type { Site, DailyStat, Measurement } from "@/lib/types";
import { CHANNEL_LABELS } from "@/lib/types";

type Tab = "overview" | "daily" | "monthly";

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

export default function SiteDetail({ site }: { site: Site }) {
  const [tab, setTab] = useState<Tab>("overview");
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
  }));

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

  const mapEmbedUrl = useMemo(() => {
    if (site.latitude == null || site.longitude == null) return null;
    const lat = site.latitude;
    const lon = site.longitude;
    const delta = 0.01;
    const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lon}`;
  }, [site.latitude, site.longitude]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="text-sm text-slate-500">Site Dashboard · Customer View</div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1"><MapPin className="w-4 h-4 text-blue-400" /><h1 className="text-3xl font-bold tracking-tight text-slate-900">{site.name}</h1></div>
          <p className="text-sm text-slate-500">{site.site_number} · {site.location_name ?? "위치 미입력"} · 최근 동기화 {latestDataDate}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setTab("monthly")} className="rounded-xl border border-[#c8def8] bg-white/80 px-4 py-2 text-sm text-slate-700 hover:bg-blue-50">월간 통계</button>
          <button onClick={downloadMonthlyExcel} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">엑셀 다운로드</button>
          <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${site.is_active ? "bg-green-400/10 text-green-500" : "bg-slate-200 text-slate-600"}`}>
            <Activity className="w-3 h-3" />{site.is_active ? "활성" : "비활성"}
          </span>
        </div>
      </div>

      <div className="flex gap-1 bg-white/70 rounded-xl p-1 w-fit border border-[#d6e8ff] overflow-x-auto shadow-[0_6px_16px_rgba(10,37,64,0.06)]">
        {(["overview", "daily", "monthly"] as Tab[]).map((key) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${tab === key ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-700"}`}>
            {key === "overview" ? "Overview" : key === "daily" ? "일별 데이터" : "월별 통계"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-4">
              <p className="text-xs text-slate-500 uppercase">평균 풍속 ({selectedMonth})</p>
              <p className="text-2xl font-semibold text-slate-900 mt-2">{toFixedOrDash(monthAvgWind, 2)} m/s</p>
            </div>
            <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-4">
              <p className="text-xs text-slate-500 uppercase">월 데이터 커버리지</p>
              <p className="text-2xl font-semibold text-slate-900 mt-2">{monthCoverage}%</p>
            </div>
            <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-4">
              <p className="text-xs text-slate-500 uppercase">최근 동기화일</p>
              <p className="text-2xl font-semibold text-slate-900 mt-2">{latestDataDate}</p>
            </div>
            <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-4">
              <p className="text-xs text-slate-500 uppercase">관측 일수 ({selectedMonth})</p>
              <p className="text-2xl font-semibold text-slate-900 mt-2">{new Set(monthRows.filter((r) => r.channel === "ch1").map((r) => r.date)).size}일</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4">
            <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2"><BarChart2 className="w-4 h-4 text-blue-400" />엑셀 기준 월간 풍속 비교</h3>
              {overviewChartData.length === 0 ? (
                <div className="text-sm text-slate-500 py-10 text-center">월간 데이터가 없습니다</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={overviewChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d6e8ff" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} unit=" m/s" />
                    <Tooltip contentStyle={{ backgroundColor: "rgba(255,255,255,0.96)", border: "1px solid #d6e8ff", borderRadius: "8px", color: "#0f172a" }} />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Line type="monotone" dataKey="ch1" name="100m 풍속" stroke={CHART_COLORS.ch1} dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="ch2" name="96m 풍속" stroke={CHART_COLORS.ch2} dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="ch3" name="80m 풍속" stroke={CHART_COLORS.ch3} dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-400" />사이트 정보</h3>
              <div className="space-y-3 text-sm">
                {[["사이트 번호", site.site_number], ["위치명", site.location_name ?? "-"], ["위도", site.latitude != null ? `${toFixedOrDash(site.latitude, 6)}° N` : "-"], ["경도", site.longitude != null ? `${toFixedOrDash(site.longitude, 6)}° E` : "-"], ["고도", site.elevation != null ? `${toFixedOrDash(site.elevation, 1)} m` : "-"], ["iPack", site.ipack_email ?? "-"]].map(([l, v]) => (
                  <div key={l} className="flex justify-between gap-4"><span className="text-slate-500">{l}</span><span className="text-slate-800 font-mono text-xs text-right">{v}</span></div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-4">
            <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Navigation className="w-4 h-4 text-blue-400" />계측기 위치 지도</h3>
              {!mapEmbedUrl ? (
                <div className="text-sm text-slate-500">위도/경도 정보가 없어 지도를 표시할 수 없습니다</div>
              ) : (
                <>
                  <div className="w-full h-[280px] rounded-xl overflow-hidden border border-[#d6e8ff]">
                    <iframe title="site-map" src={mapEmbedUrl} className="w-full h-full" loading="lazy" />
                  </div>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${site.latitude}&mlon=${site.longitude}#map=12/${site.latitude}/${site.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-500 hover:text-blue-600"
                  >
                    OpenStreetMap에서 크게 보기
                  </a>
                </>
              )}
            </div>

            <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Wind className="w-4 h-4 text-blue-400" />센서 구성</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(CHANNEL_LABELS).map(([ch, label]) => (
                  <div key={ch} className="flex items-center gap-2 text-xs"><span className="text-blue-500 font-mono w-8">{ch}</span><span className="text-slate-600">{label}</span></div>
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
    </div>
  );
}

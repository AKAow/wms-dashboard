"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { MapPin, Activity, Wind, Navigation, BarChart2, Table2, CalendarDays } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { Site, DailyStat, Measurement } from "@/lib/types";
import { CHANNEL_LABELS } from "@/lib/types";

type Tab = "overview" | "daily" | "monthly";

const DAILY_CHANNEL_OPTIONS = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch13", "ch14", "ch15", "ch16", "ch17", "ch21", "ch22"];
const MONTHLY_CHANNEL_OPTIONS = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch22"];
const EXCEL_DAILY_TABLE_CHANNELS = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch13", "ch14", "ch15", "ch16", "ch17", "ch21", "ch22"] as const;
const CHART_COLORS: Record<string, string> = {
  ch1: "#3b82f6",
  ch2: "#06b6d4",
  ch3: "#8b5cf6",
  ch4: "#ec4899",
  ch5: "#22c55e",
  ch13: "#f59e0b",
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

export default function SiteDetail({ site }: { site: Site }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedDate, setSelectedDate] = useState(formatKSTDate());
  const [selectedMonth, setSelectedMonth] = useState(formatKSTMonth());
  const [dailyChannel, setDailyChannel] = useState("ch1");
  const [monthlyChannel, setMonthlyChannel] = useState("ch1");
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
    const [year, month] = selectedMonth.split("-");
    const end = new Date(parseInt(year), parseInt(month), 0).toISOString().split("T")[0];
    const { data } = await supabase
      .from("daily_stats")
      .select("*")
      .eq("site_id", site.id)
      .gte("date", `${year}-${month}-01`)
      .lte("date", end)
      .order("date")
      .order("channel");
    setDailyStats(data ?? []);
    setLoading(false);
  }, [selectedMonth, site.id, supabase]);

  useEffect(() => {
    if (tab === "daily") loadMeasurements();
  }, [tab, selectedDate, loadMeasurements]);

  useEffect(() => {
    if (tab === "monthly" || tab === "overview") loadMonthlyStats();
  }, [tab, selectedMonth, loadMonthlyStats]);

  const dailyChartData = useMemo(() => {
    return measurements
      .filter((m) => toKSTDateOnly(m.timestamp) === selectedDate)
      .map((m) => ({
        time: toKSTLabel(m.timestamp),
        value: m[dailyChannel as keyof Measurement] as number | null,
      }))
      .filter((row) => row.value !== null);
  }, [measurements, selectedDate, dailyChannel]);

  const dailyTableRows = useMemo(() => {
    return measurements
      .filter((m) => toKSTDateOnly(m.timestamp) === selectedDate)
      .map((m) => ({
        time: toKSTLabel(m.timestamp),
        values: EXCEL_DAILY_TABLE_CHANNELS.reduce<Record<string, number | null>>((acc, ch) => {
          acc[ch] = m[ch as keyof Measurement] as number | null;
          return acc;
        }, {}),
      }));
  }, [measurements, selectedDate]);

  const monthlyChannelStats = useMemo(() => {
    return dailyStats.filter((s) => s.channel === monthlyChannel);
  }, [dailyStats, monthlyChannel]);

  const overviewMonthlyPreview = useMemo(() => {
    return dailyStats
      .filter((s) => ["ch1", "ch2", "ch3"].includes(s.channel))
      .reduce<Record<string, Record<string, number>>>((acc, s) => {
        if (!acc[s.date]) acc[s.date] = {};
        acc[s.date][s.channel] = s.avg_value ?? 0;
        return acc;
      }, {});
  }, [dailyStats]);

  const overviewChartData = Object.entries(overviewMonthlyPreview).map(([date, vals]) => ({
    date: date.slice(5),
    ch1: vals.ch1 ?? 0,
    ch2: vals.ch2 ?? 0,
    ch3: vals.ch3 ?? 0,
  }));

  const excelMonthlyChartData = useMemo(() => {
    return dailyStats
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
  }, [dailyStats]);

  const mapEmbedUrl = useMemo(() => {
    if (site.latitude == null || site.longitude == null) return null;
    const lat = site.latitude;
    const lon = site.longitude;
    const delta = 0.01;
    const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lon}`;
  }, [site.latitude, site.longitude]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1"><MapPin className="w-4 h-4 text-blue-400" /><h1 className="text-2xl font-bold text-white">{site.name}</h1></div>
          <p className="text-sm text-slate-400">{site.site_number} · {site.location_name ?? "위치 미입력"}</p>
        </div>
        <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${site.is_active ? "bg-green-400/10 text-green-400" : "bg-slate-700 text-slate-400"}`}>
          <Activity className="w-3 h-3" />{site.is_active ? "활성" : "비활성"}
        </span>
      </div>

      <div className="flex gap-1 bg-[#020617] rounded-xl p-1 w-fit border border-slate-800/60 overflow-x-auto">
        {(["overview", "daily", "monthly"] as Tab[]).map((key) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${tab === key ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
            {key === "overview" ? "Overview" : key === "daily" ? "일별 데이터" : "월별 통계"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-400" />사이트 정보</h3>
              <div className="space-y-3 text-sm">
                {[["사이트 번호", site.site_number], ["위치명", site.location_name ?? "-"], ["위도", site.latitude != null ? `${toFixedOrDash(site.latitude, 6)}° N` : "-"], ["경도", site.longitude != null ? `${toFixedOrDash(site.longitude, 6)}° E` : "-"], ["고도", site.elevation != null ? `${toFixedOrDash(site.elevation, 1)} m` : "-"], ["iPack", site.ipack_email ?? "-"]].map(([l, v]) => (
                  <div key={l} className="flex justify-between gap-4"><span className="text-slate-500">{l}</span><span className="text-slate-200 font-mono text-xs text-right">{v}</span></div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Wind className="w-4 h-4 text-blue-400" />센서 구성</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(CHANNEL_LABELS).map(([ch, label]) => (
                  <div key={ch} className="flex items-center gap-2 text-xs"><span className="text-blue-400 font-mono w-8">{ch}</span><span className="text-slate-400">{label}</span></div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Navigation className="w-4 h-4 text-blue-400" />계측기 위치 지도</h3>
            {!mapEmbedUrl ? (
              <div className="text-sm text-slate-500">위도/경도 정보가 없어 지도를 표시할 수 없습니다</div>
            ) : (
              <>
                <div className="w-full h-[280px] rounded-xl overflow-hidden border border-slate-800/60">
                  <iframe title="site-map" src={mapEmbedUrl} className="w-full h-full" loading="lazy" />
                </div>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${site.latitude}&mlon=${site.longitude}#map=12/${site.latitude}/${site.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  OpenStreetMap에서 크게 보기
                </a>
              </>
            )}
          </div>

          <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><BarChart2 className="w-4 h-4 text-blue-400" />엑셀 기준 월간 풍속 비교 미리보기</h3>
            {overviewChartData.length === 0 ? (
              <div className="text-sm text-slate-500 py-10 text-center">월간 데이터가 없습니다</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={overviewChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} unit=" m/s" />
                  <Tooltip contentStyle={{ backgroundColor: "#0b111d", border: "1px solid #1e293b", borderRadius: "8px", color: "#f8fafc" }} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Line type="monotone" dataKey="ch1" name="100m 풍속" stroke={CHART_COLORS.ch1} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ch2" name="96m 풍속" stroke={CHART_COLORS.ch2} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ch3" name="80m 풍속" stroke={CHART_COLORS.ch3} dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {tab === "daily" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400">날짜</label>
              <div className="flex items-center gap-2">
                <input
                  ref={dateInputRef}
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  onKeyDown={(e) => e.preventDefault()}
                  onFocus={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                  className="rounded-xl border border-slate-700/80 bg-[#020617] px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => dateInputRef.current?.showPicker?.()}
                  className="rounded-lg border border-slate-700/80 bg-[#020617] p-2 text-slate-300 hover:text-white"
                  title="날짜 선택"
                >
                  <CalendarDays className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400">항목</label>
              <select value={dailyChannel} onChange={(e) => setDailyChannel(e.target.value)} className="rounded-xl border border-slate-700/80 bg-[#020617] px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none">
                {DAILY_CHANNEL_OPTIONS.map((ch) => <option key={ch} value={ch}>{CHANNEL_LABELS[ch]}</option>)}
              </select>
            </div>
          </div>

          {loading ? <div className="text-center py-12 text-slate-500 text-sm">로딩 중...</div>
          : dailyChartData.length === 0 ? <div className="text-center py-12 text-slate-500 text-sm rounded-xl border border-slate-800/60 bg-[#0b111d]">해당 날짜의 데이터가 없습니다</div>
          : <>
            <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Wind className="w-4 h-4 text-blue-400" />{CHANNEL_LABELS[dailyChannel]} 시계열</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#64748b" }} interval={17} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip contentStyle={{ backgroundColor: "#0b111d", border: "1px solid #1e293b", borderRadius: "8px", color: "#f8fafc" }} />
                  <Line type="monotone" dataKey="value" name={CHANNEL_LABELS[dailyChannel]} stroke={CHART_COLORS[dailyChannel] ?? "#3b82f6"} dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] overflow-hidden">
              <div className="p-4 border-b border-slate-800/60 flex items-center gap-2 text-white text-sm font-semibold"><Table2 className="w-4 h-4 text-blue-400" />일별 수치 데이터 (KST)</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1600px]">
                  <thead>
                    <tr className="border-b border-slate-800/40">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">시간</th>
                      {EXCEL_DAILY_TABLE_CHANNELS.map((ch) => (
                        <th key={ch} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">{CHANNEL_LABELS[ch]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {dailyTableRows.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-slate-300 font-mono">{row.time}</td>
                        {EXCEL_DAILY_TABLE_CHANNELS.map((ch) => (
                          <td key={`${i}-${ch}`} className="px-4 py-2.5 text-xs text-slate-300">{row.values[ch] ?? "-"}</td>
                        ))}
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
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400">월</label>
              <div className="flex items-center gap-2">
                <input
                  ref={monthInputRef}
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  onKeyDown={(e) => e.preventDefault()}
                  onFocus={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                  className="rounded-xl border border-slate-700/80 bg-[#020617] px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => monthInputRef.current?.showPicker?.()}
                  className="rounded-lg border border-slate-700/80 bg-[#020617] p-2 text-slate-300 hover:text-white"
                  title="월 선택"
                >
                  <CalendarDays className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400">항목</label>
              <select value={monthlyChannel} onChange={(e) => setMonthlyChannel(e.target.value)} className="rounded-xl border border-slate-700/80 bg-[#020617] px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none">
                {MONTHLY_CHANNEL_OPTIONS.map((ch) => <option key={ch} value={ch}>{CHANNEL_LABELS[ch]}</option>)}
              </select>
            </div>
          </div>

          {loading ? <div className="text-center py-12 text-slate-500 text-sm">로딩 중...</div>
          : Object.keys(excelMonthlyChartData).length === 0 ? <div className="text-center py-12 text-slate-500 text-sm rounded-xl border border-slate-800/60 bg-[#0b111d]">해당 월의 데이터가 없습니다</div>
          : <>
            <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><BarChart2 className="w-4 h-4 text-blue-400" />엑셀형 월간 채널 비교 그래프 (평균값)</h3>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={Object.values(excelMonthlyChartData)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} unit=" m/s" />
                  <Tooltip contentStyle={{ backgroundColor: "#0b111d", border: "1px solid #1e293b", borderRadius: "8px", color: "#f8fafc" }} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Line type="monotone" dataKey="ch1" name="100m 풍속 (N)" stroke={CHART_COLORS.ch1} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ch2" name="96m 풍속 (N)" stroke={CHART_COLORS.ch2} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ch3" name="80m 풍속 (N)" stroke={CHART_COLORS.ch3} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ch4" name="80m 풍속 (S)" stroke={CHART_COLORS.ch4} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ch5" name="60m 풍속 (N)" stroke={CHART_COLORS.ch5} dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] overflow-hidden">
              <div className="p-4 border-b border-slate-800/60 flex items-center gap-2 text-white text-sm font-semibold"><Table2 className="w-4 h-4 text-blue-400" />월별 통계 수치</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead>
                    <tr className="border-b border-slate-800/40">
                      {["날짜", "평균", "최대", "최소", "표준편차", "데이터수"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {monthlyChannelStats.map((row) => (
                      <tr key={`${row.date}-${row.channel}`} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-slate-300 font-mono">{row.date}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-300">{row.avg_value ?? "-"}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-300">{row.max_value ?? "-"}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-300">{row.min_value ?? "-"}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-300">{row.std_value ?? "-"}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-300">{row.data_count ?? "-"}</td>
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

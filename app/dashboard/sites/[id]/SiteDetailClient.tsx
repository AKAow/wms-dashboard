"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { MapPin, Activity, Thermometer, Wind, Navigation, BarChart2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import type { Site, DailyStat, Measurement } from "@/lib/types";
import { CHANNEL_LABELS } from "@/lib/types";

type Tab = "overview" | "daily" | "monthly";

const COLORS = ["#3b82f6", "#06b6d4", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#f97316", "#ec4899"];

export default function SiteDetailClient({ site }: { site: Site }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (tab === "daily") loadMeasurements();
  }, [tab, selectedDate]);

  useEffect(() => {
    if (tab === "monthly") loadMonthlyStats();
  }, [tab, selectedMonth]);

  const loadMeasurements = async () => {
    setLoading(true);
    const start = `${selectedDate}T00:00:00`;
    const end = `${selectedDate}T23:59:59`;
    const { data } = await supabase
      .from("measurements")
      .select("*")
      .eq("site_id", site.id)
      .gte("timestamp", start)
      .lte("timestamp", end)
      .order("timestamp");
    setMeasurements(data ?? []);
    setLoading(false);
  };

  const loadMonthlyStats = async () => {
    setLoading(true);
    const [year, month] = selectedMonth.split("-");
    const start = `${year}-${month}-01`;
    const end = new Date(parseInt(year), parseInt(month), 0).toISOString().split("T")[0];
    const { data } = await supabase
      .from("daily_stats")
      .select("*")
      .eq("site_id", site.id)
      .gte("date", start)
      .lte("date", end)
      .order("date");
    setDailyStats(data ?? []);
    setLoading(false);
  };

  const chartData = measurements.map((m) => ({
    time: new Date(m.timestamp).toLocaleTimeString("ko", { hour: "2-digit", minute: "2-digit" }),
    "100m": m.ch1,
    "96m": m.ch2,
    "80m": m.ch3,
    "풍향(97m)": m.ch13,
  }));

  // 월별: 날짜별 ch1 avg
  const monthlyChartData = (() => {
    const byDate: Record<string, Record<string, number>> = {};
    dailyStats.forEach((s) => {
      if (!byDate[s.date]) byDate[s.date] = {};
      byDate[s.date][s.channel] = s.avg_value ?? 0;
    });
    return Object.entries(byDate).map(([date, vals]) => ({
      date: date.slice(5),
      "100m": vals["ch1"] ?? 0,
      "96m": vals["ch2"] ?? 0,
      "80m": vals["ch3"] ?? 0,
    }));
  })();

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "daily", label: "일별 데이터" },
    { key: "monthly", label: "월별 통계" },
  ];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-blue-400" />
            <h1 className="text-2xl font-bold text-white">{site.name}</h1>
          </div>
          <p className="text-sm text-slate-400">{site.site_number} · {site.location_name}</p>
        </div>
        <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${site.is_active ? "bg-green-400/10 text-green-400" : "bg-slate-700 text-slate-400"}`}>
          <Activity className="w-3 h-3" />
          {site.is_active ? "활성" : "비활성"}
        </span>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-[#020617] rounded-xl p-1 w-fit border border-slate-800/60">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === key ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Overview 탭 */}
      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-400" /> 사이트 정보
            </h3>
            <div className="space-y-3 text-sm">
              {[
                ["사이트 번호", site.site_number],
                ["위치명", site.location_name ?? "-"],
                ["위도", site.latitude ? `${site.latitude}° N` : "-"],
                ["경도", site.longitude ? `${site.longitude}° E` : "-"],
                ["고도", site.elevation ? `${site.elevation} m` : "-"],
                ["iPack 이메일", site.ipack_email ?? "-"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-slate-500">{label}</span>
                  <span className="text-slate-200 font-mono text-xs">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Wind className="w-4 h-4 text-blue-400" /> 센서 구성
            </h3>
            <div className="space-y-2">
              {["ch1","ch2","ch3","ch4","ch5","ch6","ch7","ch8","ch13","ch14","ch15","ch16","ch17","ch21","ch22"].map((ch) => (
                <div key={ch} className="flex items-center gap-2 text-xs">
                  <span className="text-blue-400 font-mono w-8">{ch}</span>
                  <span className="text-slate-400">{CHANNEL_LABELS[ch]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 일별 탭 */}
      {tab === "daily" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-400">날짜 선택</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-xl border border-slate-700/80 bg-[#020617] px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-500 text-sm">로딩 중...</div>
          ) : chartData.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm rounded-xl border border-slate-800/60 bg-[#0b111d]">
              해당 날짜의 데이터가 없습니다
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Wind className="w-4 h-4 text-blue-400" /> 풍속 시계열 (m/s)
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#64748b" }} interval={17} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} unit=" m/s" />
                    <Tooltip contentStyle={{ backgroundColor: "#0b111d", border: "1px solid #1e293b", borderRadius: "8px", color: "#f8fafc" }} />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Line type="monotone" dataKey="100m" stroke="#3b82f6" dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="96m" stroke="#06b6d4" dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="80m" stroke="#8b5cf6" dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-blue-400" /> 풍향 (97m)
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#64748b" }} interval={17} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} unit="°" domain={[0, 360]} />
                    <Tooltip contentStyle={{ backgroundColor: "#0b111d", border: "1px solid #1e293b", borderRadius: "8px", color: "#f8fafc" }} />
                    <Line type="monotone" dataKey="풍향(97m)" stroke="#f59e0b" dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}

      {/* 월별 탭 */}
      {tab === "monthly" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-400">월 선택</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-xl border border-slate-700/80 bg-[#020617] px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-500 text-sm">로딩 중...</div>
          ) : monthlyChartData.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm rounded-xl border border-slate-800/60 bg-[#0b111d]">
              해당 월의 데이터가 없습니다
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-blue-400" /> 일별 평균 풍속 (m/s)
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} unit=" m/s" />
                  <Tooltip contentStyle={{ backgroundColor: "#0b111d", border: "1px solid #1e293b", borderRadius: "8px", color: "#f8fafc" }} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="100m" fill="#3b82f6" radius={[2,2,0,0]} />
                  <Bar dataKey="96m" fill="#06b6d4" radius={[2,2,0,0]} />
                  <Bar dataKey="80m" fill="#8b5cf6" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

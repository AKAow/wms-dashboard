"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarDays,
  Download,
  Gauge,
  MapPin,
  Search,
  Upload,
} from "lucide-react";
import Link from "next/link";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useSites } from "@/hooks/useSites";
import { useRecentUploads } from "@/hooks/useUploadHistory";

function panelClass() {
  return "rounded-2xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl shadow-[0_8px_24px_rgba(10,37,64,0.06)]";
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function DashboardPage() {
  const supabase = createClient();
  const { sites, reload: loadSites } = useSites(supabase);
  const { uploads, load: loadUploads } = useRecentUploads(supabase);
  const [query, setQuery] = useState("");

  useAuthGuard(supabase);

  useEffect(() => {
    void loadSites();
    void loadUploads(300);
  }, [loadSites, loadUploads]);

  const activeSites = sites.filter((s) => s.is_active).length;
  const selectedSite = useMemo(() => {
    if (!sites.length) return null;
    const q = query.trim().toLowerCase();
    if (!q) return sites[0];
    return sites.find((s) => [s.name, s.site_number, s.location_name ?? ""].join(" ").toLowerCase().includes(q)) ?? sites[0];
  }, [sites, query]);

  const failed30d = useMemo(() => {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 30);
    return uploads.filter((u) => u.status === "failed" && new Date(u.created_at) >= threshold).length;
  }, [uploads]);

  const latestSync = uploads[0]?.created_at ?? null;

  const coverage30d = useMemo(() => {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 30);
    const target = uploads.filter((u) => new Date(u.created_at) >= threshold);
    if (!target.length) return 0;
    const ok = target.filter((u) => u.status === "success").length;
    return Math.round((ok / target.length) * 100);
  }, [uploads]);

  const chartData = useMemo(() => {
    const today = startOfDay(new Date());
    const days = Array.from({ length: 14 }, (_, i) => {
      const day = new Date(today);
      day.setDate(today.getDate() - (13 - i));
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      return { key, label: `${String(day.getMonth() + 1).padStart(2, "0")}/${String(day.getDate()).padStart(2, "0")}`, total: 0, success: 0 };
    });

    const map = new Map(days.map((d) => [d.key, d]));
    for (const u of uploads) {
      if (selectedSite && u.site_id !== selectedSite.id) continue;
      const d = new Date(u.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const row = map.get(key);
      if (!row) continue;
      row.total += 1;
      if (u.status === "success") row.success += 1;
    }

    return days;
  }, [uploads, selectedSite]);

  const siteAlerts = useMemo(() => {
    return uploads
      .filter((u) => u.status === "failed" && (!selectedSite || u.site_id === selectedSite.id))
      .slice(0, 5)
      .map((u) => ({
        id: u.id,
        title: u.file_name ?? "파일명 없음",
        time: new Date(u.created_at).toLocaleString("ko"),
        meta: u.error_message ?? "처리 중 오류가 발생했습니다.",
      }));
  }, [uploads, selectedSite]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="text-sm text-slate-500">Customer Dashboard · WMS</div>
        <div className="ml-auto relative w-72 max-w-[60vw]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="사이트/번호 검색"
            className="w-full rounded-xl border border-[#d6e8ff] bg-white/80 pl-9 pr-3 py-2 text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <button className="w-9 h-9 rounded-xl border border-[#d6e8ff] bg-white/80 inline-flex items-center justify-center text-slate-600">
          <Bell className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{selectedSite?.name ?? "WMS 고객 대시보드"}</h1>
          <p className="text-sm text-slate-600 mt-1">평균 풍속, 동기화 상태, 일간·월간 데이터와 사이트 정보를 한 화면에서 확인합니다.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className={`${panelClass()} p-4`}>
          <div className="text-xs uppercase tracking-wider text-slate-500">활성 사이트</div>
          <div className="mt-2 flex items-end justify-between">
            <p className="text-4xl font-semibold text-slate-900">{activeSites}</p>
            <Activity className="w-5 h-5 text-emerald-500" />
          </div>
        </div>
        <div className={`${panelClass()} p-4`}>
          <div className="text-xs uppercase tracking-wider text-slate-500">최근 동기화</div>
          <div className="mt-2 flex items-end justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">{latestSync ? new Date(latestSync).toLocaleString("ko") : "없음"}</p>
            <Upload className="w-5 h-5 text-sky-500" />
          </div>
        </div>
        <div className={`${panelClass()} p-4`}>
          <div className="text-xs uppercase tracking-wider text-slate-500">데이터 커버리지(30일)</div>
          <div className="mt-2 flex items-end justify-between">
            <p className="text-4xl font-semibold text-slate-900">{coverage30d}%</p>
            <Gauge className="w-5 h-5 text-blue-500" />
          </div>
        </div>
        <div className={`${panelClass()} p-4`}>
          <div className="text-xs uppercase tracking-wider text-slate-500">최근 30일 실패</div>
          <div className="mt-2 flex items-end justify-between">
            <p className="text-4xl font-semibold text-slate-900">{failed30d}</p>
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-3">
        <div className={`${panelClass()} p-4`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">일간 동기화 추이 (14일)</h2>
              <p className="text-xs text-slate-500">사이트 기준 전체/성공 건수</p>
            </div>
            <CalendarDays className="w-4 h-4 text-blue-500" />
          </div>
          <div className="h-64 overflow-x-auto">
            <LineChart width={900} height={250} data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d6e8ff" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(255,255,255,0.95)",
                  border: "1px solid #d6e8ff",
                  borderRadius: 10,
                  color: "#0f172a",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="total" name="전체" stroke="#2f80ed" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="success" name="성공" stroke="#10b981" strokeWidth={2.5} dot={false} />
            </LineChart>
          </div>
        </div>

        <div className={`${panelClass()} p-4 space-y-3`}>
          <h2 className="text-sm font-semibold text-slate-900">사이트 정보</h2>
          {selectedSite ? (
            <>
              <div className="rounded-xl border border-[#d6e8ff] bg-white/70 p-3 space-y-2">
                <div className="flex items-center gap-2 text-slate-900 font-medium"><MapPin className="w-4 h-4 text-blue-500" />{selectedSite.name}</div>
                <div className="text-xs text-slate-600">번호: {selectedSite.site_number}</div>
                <div className="text-xs text-slate-600">위치: {selectedSite.location_name ?? "-"}</div>
                <div className="text-xs text-slate-600">고도: {selectedSite.elevation ? `${selectedSite.elevation}m` : "-"}</div>
                <div className="text-xs text-slate-600">좌표: {selectedSite.latitude && selectedSite.longitude ? `${selectedSite.latitude.toFixed(4)}, ${selectedSite.longitude.toFixed(4)}` : "-"}</div>
                <div className="text-xs text-slate-600">상태: {selectedSite.is_active ? "활성" : "비활성"}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Link href={`/dashboard/sites?id=${encodeURIComponent(selectedSite.id)}`} className="rounded-xl border border-[#d6e8ff] bg-white/80 px-3 py-2 text-xs text-slate-700 hover:bg-blue-50 text-center">일간/월간 데이터 보기</Link>
                <Link href={`/dashboard/sites?id=${encodeURIComponent(selectedSite.id)}`} className="rounded-xl bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-500 text-center inline-flex items-center justify-center gap-1"><Download className="w-3 h-3" />데이터 다운로드</Link>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">사이트 정보가 없습니다.</p>
          )}
        </div>
      </div>

      <div className={`${panelClass()} p-4`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-900">최근 알림 피드</h2>
          <span className="text-xs text-slate-500">최근 {siteAlerts.length}건</span>
        </div>
        <div className="space-y-2">
          {siteAlerts.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">최근 실패 알림이 없습니다.</p>
          ) : (
            siteAlerts.map((a) => (
              <div key={a.id} className="rounded-xl border border-[#d6e8ff] bg-white/70 p-3">
                <p className="text-sm font-medium text-slate-900 truncate">{a.title}</p>
                <p className="text-xs text-slate-600 mt-1">{a.meta}</p>
                <p className="text-[11px] text-slate-500 mt-2">{a.time}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

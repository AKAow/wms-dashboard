"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Activity,
  AlertTriangle,
  Bell,
  Database,
  MapPin,
  Search,
  ShieldCheck,
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

  const failed30d = useMemo(() => {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 30);
    return uploads.filter((u) => u.status === "failed" && new Date(u.created_at) >= threshold).length;
  }, [uploads]);

  const recent7d = useMemo(() => {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 7);
    return uploads.filter((u) => new Date(u.created_at) >= threshold).length;
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
      const d = new Date(u.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const row = map.get(key);
      if (!row) continue;
      row.total += 1;
      if (u.status === "success") row.success += 1;
    }

    return days;
  }, [uploads]);

  const filteredSites = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter((s) =>
      [s.name, s.site_number, s.location_name ?? ""].join(" ").toLowerCase().includes(q),
    );
  }, [sites, query]);

  const siteLastUpload = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of uploads) {
      if (!u.site_id) continue;
      if (!map.has(u.site_id)) map.set(u.site_id, u.created_at);
    }
    return map;
  }, [uploads]);

  const alerts = useMemo(() => {
    return uploads
      .filter((u) => u.status === "failed")
      .slice(0, 6)
      .map((u) => ({
        id: u.id,
        title: u.file_name ?? "파일명 없음",
        time: new Date(u.created_at).toLocaleString("ko"),
        meta: u.error_message ?? "처리 중 오류가 발생했습니다.",
      }));
  }, [uploads]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="text-sm text-slate-500">Overview · WMS Fleet</div>
        <div className="ml-auto relative w-72 max-w-[60vw]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="사이트/번호/위치 검색"
            className="w-full rounded-xl border border-[#d6e8ff] bg-white/80 pl-9 pr-3 py-2 text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <button className="w-9 h-9 rounded-xl border border-[#d6e8ff] bg-white/80 inline-flex items-center justify-center text-slate-600">
          <Bell className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">WMS 운영 대시보드</h1>
          <p className="text-sm text-slate-600 mt-1">사이트 운영 상태, 업로드 흐름, 실패 알림을 한 화면에서 확인합니다.</p>
        </div>
        <Link href="/dashboard/data" className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-500">
          데이터 이력 보기
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className={`${panelClass()} p-4`}>
          <div className="text-xs uppercase tracking-wider text-slate-500">전체 사이트</div>
          <div className="mt-2 flex items-end justify-between">
            <p className="text-4xl font-semibold text-slate-900">{sites.length}</p>
            <MapPin className="w-5 h-5 text-blue-500" />
          </div>
        </div>
        <div className={`${panelClass()} p-4`}>
          <div className="text-xs uppercase tracking-wider text-slate-500">활성 사이트</div>
          <div className="mt-2 flex items-end justify-between">
            <p className="text-4xl font-semibold text-slate-900">{activeSites}</p>
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
          </div>
        </div>
        <div className={`${panelClass()} p-4`}>
          <div className="text-xs uppercase tracking-wider text-slate-500">최근 7일 업로드</div>
          <div className="mt-2 flex items-end justify-between">
            <p className="text-4xl font-semibold text-slate-900">{recent7d}</p>
            <Upload className="w-5 h-5 text-sky-500" />
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
              <h2 className="text-sm font-semibold text-slate-900">업로드 추이 (14일)</h2>
              <p className="text-xs text-slate-500">총 업로드 대비 성공 처리 건수</p>
            </div>
            <Database className="w-4 h-4 text-blue-500" />
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

        <div className={`${panelClass()} p-4`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900">실패 알림 피드</h2>
            <span className="text-xs text-slate-500">최근 {alerts.length}건</span>
          </div>
          <div className="space-y-2 max-h-64 overflow-auto pr-1">
            {alerts.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">최근 실패 알림이 없습니다.</p>
            ) : (
              alerts.map((a) => (
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

      <div className={`${panelClass()} p-4`}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-900">사이트 운영 목록</h2>
          <Link href="/dashboard/sites" className="text-xs text-blue-600 hover:underline">전체 관리</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-[#d6e8ff]">
                <th className="px-3 py-2 text-left text-xs text-slate-500 uppercase">상태</th>
                <th className="px-3 py-2 text-left text-xs text-slate-500 uppercase">사이트</th>
                <th className="px-3 py-2 text-left text-xs text-slate-500 uppercase">번호</th>
                <th className="px-3 py-2 text-left text-xs text-slate-500 uppercase">위치</th>
                <th className="px-3 py-2 text-left text-xs text-slate-500 uppercase">최근 동기화</th>
              </tr>
            </thead>
            <tbody>
              {filteredSites.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">검색 결과가 없습니다.</td>
                </tr>
              ) : (
                filteredSites.map((site) => (
                  <tr key={site.id} className="border-b border-[#d6e8ff]/70 hover:bg-blue-50/50 transition-colors">
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${site.is_active ? "text-emerald-600" : "text-slate-500"}`}>
                        <Activity className="w-3.5 h-3.5" />
                        {site.is_active ? "활성" : "비활성"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm font-medium text-slate-900">
                      <Link href={`/dashboard/sites?id=${encodeURIComponent(site.id)}`} className="hover:text-blue-600">
                        {site.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 font-mono">{site.site_number}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">{site.location_name ?? "-"}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">
                      {siteLastUpload.get(site.id)
                        ? new Date(siteLastUpload.get(site.id)!).toLocaleString("ko")
                        : "업로드 이력 없음"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

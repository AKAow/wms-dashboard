"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { MapPin, Activity, RefreshCw, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useSites } from "@/hooks/useSites";
import { useRecentUploads } from "@/hooks/useUploadHistory";

export default function DashboardPage() {
  const supabase = createClient();
  const { sites, reload: loadSites } = useSites(supabase);
  const { uploads, load: loadUploads } = useRecentUploads(supabase);

  useAuthGuard(supabase);

  useEffect(() => {
    void loadSites();
    void loadUploads(5);
  }, [loadSites, loadUploads]);

  const activeSites = sites.filter((s) => s.is_active).length;
  const lastUpload = uploads[0];

  const stats = [
    { label: "전체 사이트", value: sites.length, icon: MapPin, color: "text-blue-400", bg: "bg-blue-400/10" },
    { label: "활성 사이트", value: activeSites, icon: Activity, color: "text-green-400", bg: "bg-green-400/10" },
    { label: "최근 업데이트", value: lastUpload ? new Date(lastUpload.created_at).toLocaleDateString("ko") : "없음", icon: RefreshCw, color: "text-purple-400", bg: "bg-purple-400/10" },
  ];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">대시보드</h1>
        <p className="text-sm text-slate-500 mt-1">기상 측정 사이트 현황</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-500 font-medium">{label}</span>
              <div className={`p-2 rounded-lg ${bg}`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {/* 사이트 목록 */}
      <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl overflow-hidden">
        <div className="p-5 border-b border-[#d6e8ff]">
          <h2 className="text-sm font-semibold text-slate-900">사이트 목록</h2>
        </div>
        <div className="divide-y divide-[#d6e8ff]/70">
          {sites.length === 0 ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-8 h-8 text-slate-500 mx-auto mb-3" />
              <p className="text-sm text-slate-500">등록된 사이트가 없습니다</p>
              <Link href="/dashboard/sites" className="text-xs text-blue-400 hover:underline mt-1 inline-block">
                사이트 추가하기 →
              </Link>
            </div>
          ) : (
            sites.map((site) => (
              <Link
                key={site.id}
                href={`/dashboard/sites?id=${encodeURIComponent(site.id)}`}
                className="flex items-center justify-between p-4 hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${site.is_active ? "bg-green-400" : "bg-slate-600"}`} />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{site.name}</p>
                    <p className="text-xs text-slate-500">{site.site_number} · {site.location_name ?? "위치 미설정"}</p>
                  </div>
                </div>
                <div className="text-right">
                  {site.latitude && site.longitude ? (
                    <p className="text-xs text-slate-500">
                      {site.latitude.toFixed(4)}°N, {site.longitude.toFixed(4)}°E
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500">좌표 미설정</p>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* 최근 업로드 이력 */}
      <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl overflow-hidden">
        <div className="p-5 border-b border-[#d6e8ff] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">최근 데이터 업로드</h2>
          <Link href="/dashboard/data" className="text-xs text-blue-400 hover:underline">전체 보기</Link>
        </div>
        <div className="divide-y divide-[#d6e8ff]/70">
          {uploads.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">업로드 이력이 없습니다</div>
          ) : (
            uploads.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm text-slate-900">{u.file_name ?? "이름 없음"}</p>
                  <p className="text-xs text-slate-500">{u.source} · {new Date(u.created_at).toLocaleString("ko")}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  u.status === "success" ? "bg-green-400/10 text-green-400" :
                  u.status === "failed" ? "bg-red-400/10 text-red-400" :
                  "bg-yellow-400/10 text-yellow-400"
                }`}>
                  {u.status === "success" ? "완료" : u.status === "failed" ? "실패" : "처리중"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

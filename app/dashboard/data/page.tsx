"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RefreshCw, CheckCircle, XCircle, Clock } from "lucide-react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useUploadHistory } from "@/hooks/useUploadHistory";

const WORKER_BASE = "https://wms-rld-worker.aka-74b.workers.dev";

export default function DataPage() {
  const supabase = createClient();
  const { uploads, load } = useUploadHistory(supabase);
  const [syncDay, setSyncDay] = useState("수요일");
  const [selectedSite, setSelectedSite] = useState<string>("all");

  useAuthGuard(supabase);

  useEffect(() => {
    void load(200);
  }, [load]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${WORKER_BASE}/cron-config`, { cache: "no-store" });
        const d = (await r.json()) as { ok?: boolean; dayKst?: string };
        if (alive && r.ok && d?.ok && d.dayKst) {
          setSyncDay(d.dayKst);
        }
      } catch {
        // noop: fallback to default
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const statusIcon = (status: string) => {
    if (status === "success") return <CheckCircle className="w-4 h-4 text-green-400" />;
    if (status === "failed") return <XCircle className="w-4 h-4 text-red-400" />;
    return <Clock className="w-4 h-4 text-yellow-400" />;
  };

  const siteOptions = useMemo(() => {
    const names = Array.from(new Set(uploads.map((u) => u.sites?.name).filter(Boolean) as string[]));
    return names.sort((a, b) => a.localeCompare(b, "ko"));
  }, [uploads]);

  const filteredUploads = useMemo(() => {
    if (selectedSite === "all") return uploads;
    return uploads.filter((u) => (u.sites?.name ?? "-") === selectedSite);
  }, [uploads, selectedSite]);

  const siteSummary = useMemo(() => {
    const map = new Map<string, { total: number; success: number; failed: number; latest: string | null }>();
    for (const u of uploads) {
      const name = u.sites?.name ?? "미지정";
      if (!map.has(name)) map.set(name, { total: 0, success: 0, failed: 0, latest: null });
      const s = map.get(name)!;
      s.total += 1;
      if (u.status === "success") s.success += 1;
      if (u.status === "failed") s.failed += 1;
      if (!s.latest || new Date(u.created_at) > new Date(s.latest)) s.latest = u.created_at;
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "ko"));
  }, [uploads]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">데이터 관리</h1>
        <p className="text-sm text-slate-500 mt-1">데이터 적재 현황 및 자동 동기화 상태</p>
      </div>

      <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg bg-blue-400/10"><RefreshCw className="w-5 h-5 text-blue-400" /></div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">사이트별 자동 동기화</h3>
            <p className="text-xs text-slate-500">각 사이트 설정에 따라 RLD 메일을 자동 감지하여 처리</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm mt-4">
          {[["동기화 방식", "사이트별 설정"], ["동기화 주기", `주 1회 (${syncDay} 06:00)`], ["마지막 실행", uploads[0] ? new Date(uploads[0].created_at).toLocaleString("ko") : "-"], ["상태", "활성"]].map(([l, v]) => (
            <div key={l}>
              <p className="text-xs text-slate-500 mb-0.5">{l}</p>
              <p className={`text-sm ${l === "상태" ? "text-green-400 font-medium" : "text-slate-700"}`}>{v}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-4 border-t border-[#d6e8ff] pt-3">
          💡 RLD 파일로 사이트를 추가하거나 데이터를 업로드하려면 <span className="text-blue-400 font-medium">사이트 관리 &gt; RLD로 추가</span> 를 사용하세요
        </p>
      </div>

      <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">사이트별 데이터 현황</h2>
          <span className="text-xs text-slate-500">{siteSummary.length}개 사이트</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {siteSummary.length === 0 ? (
            <p className="text-sm text-slate-500">사이트별 데이터가 없습니다.</p>
          ) : (
            siteSummary.map(([name, s]) => (
              <div key={name} className="rounded-lg border border-[#d6e8ff] bg-white/65 p-3">
                <p className="text-sm text-slate-900 font-medium">{name}</p>
                <p className="text-xs text-slate-500 mt-1">총 {s.total}건 · 성공 {s.success}건 · 실패 {s.failed}건</p>
                <p className="text-xs text-slate-500 mt-1">최근 반영: {s.latest ? new Date(s.latest).toLocaleString("ko") : "-"}</p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl overflow-hidden">
        <div className="p-4 border-b border-[#d6e8ff] flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-900">업로드 이력</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">사이트</span>
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="rounded-lg border border-[#c8def8] bg-white/70 px-3 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">전체</option>
              {siteOptions.map((site) => (
                <option key={site} value={site}>{site}</option>
              ))}
            </select>
            <span className="text-xs text-slate-500">{filteredUploads.length}건</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-[#d6e8ff]/70">
                {["상태", "파일명", "사이트", "날짜", "건수", "일시"].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d6e8ff]/70">
              {filteredUploads.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">업로드 이력이 없습니다</td></tr>
              ) : (
                filteredUploads.map((u) => (
                  <tr key={u.id} className="hover:bg-blue-50/60 transition-colors">
                    <td className="px-4 py-3">{statusIcon(u.status)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-700 max-w-[160px] truncate">{u.file_name ?? "-"}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{u.sites?.name ?? "-"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{u.date_range_start ?? "-"}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{u.records_inserted?.toLocaleString() ?? "-"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{new Date(u.created_at).toLocaleString("ko")}</td>
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

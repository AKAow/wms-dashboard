"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { RefreshCw, CheckCircle, XCircle, Clock } from "lucide-react";
import type { UploadHistory } from "@/lib/types";
import { useRouter } from "next/navigation";

export default function DataPage() {
  const [uploads, setUploads] = useState<(UploadHistory & { sites: { name: string } | null })[]>([]);
  const supabase = createClient();
  const router = useRouter();

  const loadHistory = useCallback(async () => {
    const { data } = await supabase.from("upload_history").select("*, sites(name)").order("created_at", { ascending: false }).limit(50);
    if (data) setUploads(data);
  }, [supabase]);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push("/login");
      await loadHistory();
    }
    init();
  }, [router, supabase, loadHistory]);

  const statusIcon = (status: string) => {
    if (status === "success") return <CheckCircle className="w-4 h-4 text-green-400" />;
    if (status === "failed") return <XCircle className="w-4 h-4 text-red-400" />;
    return <Clock className="w-4 h-4 text-yellow-400" />;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">데이터 관리</h1>
        <p className="text-sm text-slate-400 mt-1">데이터 적재 현황 및 자동 동기화 상태</p>
      </div>

      {/* 동기화 상태 카드 */}
      <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg bg-blue-400/10"><RefreshCw className="w-5 h-5 text-blue-400" /></div>
          <div>
            <h3 className="text-sm font-semibold text-white">Gmail 자동 동기화</h3>
            <p className="text-xs text-slate-400">iPack 발송 RLD를 자동 감지하여 처리</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm mt-4">
          {[["연동 계정","windtreeeng@gmail.com"],["동기화 주기","주 1회 (일요일 06:00)"],["마지막 실행", uploads[0] ? new Date(uploads[0].created_at).toLocaleString("ko") : "-"],["상태","활성"]].map(([l,v]) => (
            <div key={l}>
              <p className="text-xs text-slate-500 mb-0.5">{l}</p>
              <p className={`text-sm ${l==="상태"?"text-green-400 font-medium":"text-slate-300"}`}>{v}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-4 border-t border-slate-800/60 pt-3">
          💡 RLD 파일로 사이트를 추가하거나 데이터를 업로드하려면 <span className="text-blue-400 font-medium">사이트 관리 &gt; RLD로 추가</span> 를 사용하세요
        </p>
      </div>

      {/* 업로드 이력 */}
      <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] overflow-hidden">
        <div className="p-4 border-b border-slate-800/60 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">업로드 이력</h2>
          <span className="text-xs text-slate-500">{uploads.length}건</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-slate-800/40">
                {["상태","파일명","사이트","날짜","건수","일시"].map((h,i) => (
                  <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {uploads.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">업로드 이력이 없습니다</td></tr>
              ) : (
                uploads.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-4 py-3">{statusIcon(u.status)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-300 max-w-[160px] truncate">{u.file_name ?? "-"}</td>
                    <td className="px-4 py-3 text-sm text-slate-400">{u.sites?.name ?? "-"}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{u.date_range_start ?? "-"}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{u.records_inserted?.toLocaleString() ?? "-"}</td>
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

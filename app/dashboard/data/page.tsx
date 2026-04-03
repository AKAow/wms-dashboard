export const runtime = 'edge';

import { createClient } from "@/lib/supabase/server";
import { Upload, RefreshCw, CheckCircle, XCircle, Clock } from "lucide-react";
import type { UploadHistory } from "@/lib/types";

export default async function DataPage() {
  const supabase = await createClient();
  const { data: uploads } = await supabase
    .from("upload_history")
    .select("*, sites(name)")
    .order("created_at", { ascending: false })
    .limit(50);

  const statusIcon = (status: string) => {
    if (status === "success") return <CheckCircle className="w-4 h-4 text-green-400" />;
    if (status === "failed") return <XCircle className="w-4 h-4 text-red-400" />;
    return <Clock className="w-4 h-4 text-yellow-400" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">데이터 관리</h1>
          <p className="text-sm text-slate-400 mt-1">측정 데이터 업로드 및 동기화 관리</p>
        </div>
      </div>

      {/* 업로드 방식 카드 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-blue-400/10">
              <RefreshCw className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-sm font-semibold text-white">Gmail 자동 동기화</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            iPack에서 발송된 RLD 파일을 Gmail에서 자동으로 감지하여 처리합니다.
            주 1회 스케줄로 실행됩니다.
          </p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400">연결됨 — windtreeeng@gmail.com</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-purple-400/10">
              <Upload className="w-5 h-5 text-purple-400" />
            </div>
            <h3 className="text-sm font-semibold text-white">수동 파일 업로드</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            변환된 meas.txt 파일을 직접 업로드하여 데이터를 추가합니다.
          </p>
          <button className="text-xs px-3 py-2 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/20 transition-colors flex items-center gap-2">
            <Upload className="w-3 h-3" />
            파일 선택 (준비 중)
          </button>
        </div>
      </div>

      {/* 업로드 이력 */}
      <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] overflow-hidden">
        <div className="p-4 border-b border-slate-800/60">
          <h2 className="text-sm font-semibold text-white">업로드 이력</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800/40">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">상태</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">파일명</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">사이트</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">기간</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">건수</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">일시</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {(uploads ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                  업로드 이력이 없습니다
                </td>
              </tr>
            ) : (
              (uploads ?? []).map((u: UploadHistory & { sites: { name: string } | null }) => (
                <tr key={u.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-4 py-3">{statusIcon(u.status)}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-300">{u.file_name ?? "-"}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{u.sites?.name ?? "-"}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {u.date_range_start && u.date_range_end
                      ? `${u.date_range_start} ~ ${u.date_range_end}`
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">{u.records_inserted?.toLocaleString() ?? "-"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(u.created_at).toLocaleString("ko")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

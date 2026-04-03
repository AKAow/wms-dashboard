"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload, RefreshCw, CheckCircle, XCircle, Clock, Loader2, FileUp } from "lucide-react";
import type { UploadHistory } from "@/lib/types";
import { useRouter } from "next/navigation";

const WORKER_URL = "https://wms-rld-worker.aka-74b.workers.dev/upload-rld";

type UploadResult = { ok: boolean; site_number?: string; records_inserted?: number; is_new_site?: boolean; error?: string; };

export default function DataPage() {
  const [uploads, setUploads] = useState<(UploadHistory & { sites: { name: string } | null })[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<{ name: string; status: "pending" | "done" | "error"; result?: UploadResult }[]>([]);
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

  const processFiles = async (files: File[]) => {
    const rldFiles = files.filter(f => f.name.endsWith(".rld"));
    if (rldFiles.length === 0) return;

    setUploadQueue(rldFiles.map(f => ({ name: f.name, status: "pending" })));
    setUploading(true);

    for (let i = 0; i < rldFiles.length; i++) {
      const file = rldFiles[i];
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch(WORKER_URL, { method: "POST", body: form });
        const result: UploadResult = await res.json();
        setUploadQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: result.ok ? "done" : "error", result } : q));
      } catch {
        setUploadQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: "error", result: { ok: false, error: "네트워크 오류" } } : q));
      }
    }
    setUploading(false);
    await loadHistory();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(Array.from(e.target.files));
    e.target.value = "";
  };

  const statusIcon = (status: string) => {
    if (status === "success") return <CheckCircle className="w-4 h-4 text-green-400" />;
    if (status === "failed") return <XCircle className="w-4 h-4 text-red-400" />;
    return <Clock className="w-4 h-4 text-yellow-400" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">데이터 관리</h1>
        <p className="text-sm text-slate-400 mt-1">RLD 파일 업로드 시 사이트 자동 인식 및 데이터 적재</p>
      </div>

      {/* RLD 업로드 영역 */}
      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        className={`rounded-xl border-2 border-dashed transition-all p-8 text-center cursor-pointer ${
          dragging ? "border-blue-500 bg-blue-500/10" : "border-slate-700 hover:border-slate-600 bg-[#0b111d]"
        }`}
        onClick={() => document.getElementById("rld-input")?.click()}
      >
        <input id="rld-input" type="file" accept=".rld" multiple className="hidden" onChange={onFileChange} />
        <div className="flex flex-col items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-400/10">
            <FileUp className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">RLD 파일을 드래그하거나 클릭하여 업로드</p>
            <p className="text-xs text-slate-500 mt-1">여러 파일 동시 선택 가능 · 파일명에서 사이트 번호 자동 인식</p>
          </div>
          {uploading && (
            <div className="flex items-center gap-2 text-sm text-blue-400">
              <Loader2 className="w-4 h-4 animate-spin" /> 변환 중...
            </div>
          )}
        </div>
      </div>

      {/* 업로드 진행 상황 */}
      {uploadQueue.length > 0 && (
        <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] overflow-hidden">
          <div className="p-4 border-b border-slate-800/60">
            <h2 className="text-sm font-semibold text-white">업로드 진행</h2>
          </div>
          <div className="divide-y divide-slate-800/40">
            {uploadQueue.map((q, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  {q.status === "pending" ? <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
                    : q.status === "done" ? <CheckCircle className="w-4 h-4 text-green-400" />
                    : <XCircle className="w-4 h-4 text-red-400" />}
                  <span className="text-sm text-slate-300 font-mono">{q.name}</span>
                </div>
                <div className="text-right text-xs">
                  {q.result?.ok && (
                    <span className="text-green-400">
                      {q.result.is_new_site ? "✨ 새 사이트 " : ""}
                      {q.result.site_number} · {q.result.records_inserted?.toLocaleString()}건
                    </span>
                  )}
                  {q.result?.error && <span className="text-red-400">{q.result.error}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 자동 동기화 상태 */}
      <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg bg-blue-400/10"><RefreshCw className="w-5 h-5 text-blue-400" /></div>
          <h3 className="text-sm font-semibold text-white">Gmail 자동 동기화</h3>
        </div>
        <p className="text-xs text-slate-400 mb-3">iPack에서 발송된 RLD를 Gmail에서 자동 감지하여 처리합니다.</p>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-green-400">연결됨 — windtreeeng@gmail.com</span>
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
              {["상태","파일명","사이트","기간","건수","일시"].map((h,i) => (
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
                  <td className="px-4 py-3 text-xs font-mono text-slate-300">{u.file_name ?? "-"}</td>
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
  );
}

"use client";

import { useEffect, useState } from "react";
import { Settings, Key, Mail, Globe, CheckCircle, Loader2, CalendarDays } from "lucide-react";

const WORKER_BASE = "https://wms-rld-worker.aka-74b.workers.dev";
const DAYS = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"] as const;

export default function SettingsPage() {
  const [nrgClientId, setNrgClientId] = useState("YPFS53vAxMLrbkaAOhwaMC8R8zhKGI0A");
  const [nrgSecret, setNrgSecret] = useState("");
  const [dashboardUrl, setDashboardUrl] = useState("https://wms-dashboard-ckn.pages.dev");
  const [syncDay, setSyncDay] = useState<(typeof DAYS)[number]>("수요일");
  const [loadingCron, setLoadingCron] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${WORKER_BASE}/cron-config`, { cache: "no-store" });
        const d = (await r.json()) as { ok?: boolean; dayKst?: string };
        if (alive && r.ok && d?.ok && d.dayKst && DAYS.includes(d.dayKst as (typeof DAYS)[number])) {
          setSyncDay(d.dayKst as (typeof DAYS)[number]);
        }
      } catch {
        // noop: keep default value
      } finally {
        if (alive) setLoadingCron(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleSave = async () => {
    setSaveError("");
    setSaving(true);
    try {
      const r = await fetch(`${WORKER_BASE}/cron-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayKst: syncDay }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.ok) {
        throw new Error(d?.error || "cron-update-failed");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">설정</h1>
        <p className="text-sm text-slate-500 mt-1">시스템 연동 및 API 키 관리</p>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-400/10"><Key className="w-5 h-5 text-blue-400" /></div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">NRG Cloud API</h3>
              <p className="text-xs text-slate-500">RLD 파일 변환 서비스</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Client ID</label>
              <input type="text" value={nrgClientId} onChange={(e) => setNrgClientId(e.target.value)} className="w-full rounded-xl border border-[#c8def8] bg-white/70 px-4 py-2.5 text-sm font-mono text-slate-700 focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Client Secret</label>
              <input type="password" value={nrgSecret} onChange={(e) => setNrgSecret(e.target.value)} placeholder="새 시크릿 입력 시에만 입력" className="w-full rounded-xl border border-[#c8def8] bg-white/70 px-4 py-2.5 text-sm font-mono text-slate-700 focus:border-blue-500 focus:outline-none" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-xs text-green-400">연결됨</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-red-400/10"><Mail className="w-5 h-5 text-red-400" /></div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">자동 동기화 스케줄</h3>
              <p className="text-xs text-slate-500">Gmail 필터는 사이트별 설정에서 관리</p>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-500">동기화 주기</span>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-blue-400" />
                <select value={syncDay} onChange={(e) => setSyncDay(e.target.value as (typeof DAYS)[number])} disabled={loadingCron} className="rounded-lg border border-[#c8def8] bg-white/70 px-3 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none disabled:opacity-60">
                  {DAYS.map((day) => <option key={day} value={day}>{day} 06:00</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-between"><span className="text-slate-500">상태</span><span className="text-green-400">활성</span></div>
            <p className="text-xs text-slate-500 pt-2 border-t border-[#d6e8ff]">현재 설정 기준: 주 1회 {syncDay} 06:00 KST</p>
          </div>
        </div>

        <div className="rounded-xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-purple-400/10"><Globe className="w-5 h-5 text-purple-400" /></div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">배포 설정</h3>
              <p className="text-xs text-slate-500">Cloudflare Pages</p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">대시보드 URL</label>
            <input type="url" value={dashboardUrl} onChange={(e) => setDashboardUrl(e.target.value)} className="w-full rounded-xl border border-[#c8def8] bg-white/70 px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none" />
          </div>
        </div>

        {saveError && <p className="text-xs text-red-400">저장 실패: {saveError}</p>}

        <button onClick={handleSave} disabled={saving || loadingCron} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors disabled:opacity-60 flex items-center gap-2">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" />저장 중...</> : saved ? <><CheckCircle className="w-4 h-4" />저장됨</> : <><Settings className="w-4 h-4" />설정 저장</>}
        </button>
      </div>
    </div>
  );
}

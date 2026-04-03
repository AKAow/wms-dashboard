"use client";

import { useState } from "react";
import { Settings, Key, Mail, Globe, CheckCircle, Loader2, CalendarDays } from "lucide-react";

export default function SettingsPage() {
  const [nrgClientId, setNrgClientId] = useState("YPFS53vAxMLrbkaAOhwaMC8R8zhKGI0A");
  const [nrgSecret, setNrgSecret] = useState("");
  const [dashboardUrl, setDashboardUrl] = useState("https://wms-dashboard-ckn.pages.dev");
  const [syncDay, setSyncDay] = useState("수요일");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 800));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">설정</h1>
        <p className="text-sm text-slate-400 mt-1">시스템 연동 및 API 키 관리</p>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-400/10"><Key className="w-5 h-5 text-blue-400" /></div>
            <div>
              <h3 className="text-sm font-semibold text-white">NRG Cloud API</h3>
              <p className="text-xs text-slate-400">RLD 파일 변환 서비스</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Client ID</label>
              <input type="text" value={nrgClientId} onChange={(e) => setNrgClientId(e.target.value)} className="w-full rounded-xl border border-slate-700/80 bg-[#020617]/50 px-4 py-2.5 text-sm font-mono text-slate-300 focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Client Secret</label>
              <input type="password" value={nrgSecret} onChange={(e) => setNrgSecret(e.target.value)} placeholder="새 시크릿 입력 시에만 입력" className="w-full rounded-xl border border-slate-700/80 bg-[#020617]/50 px-4 py-2.5 text-sm font-mono text-slate-300 focus:border-blue-500 focus:outline-none" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-xs text-green-400">연결됨</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-red-400/10"><Mail className="w-5 h-5 text-red-400" /></div>
            <div>
              <h3 className="text-sm font-semibold text-white">Gmail 연동</h3>
              <p className="text-xs text-slate-400">RLD 자동 수신 계정</p>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">연동 계정</span><span className="text-slate-200">windtreeeng@gmail.com</span></div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">동기화 주기</span>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-blue-400" />
                <select value={syncDay} onChange={(e) => setSyncDay(e.target.value)} className="rounded-lg border border-slate-700 bg-[#020617] px-3 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none">
                  {['월요일','화요일','수요일','목요일','금요일','토요일','일요일'].map((day) => <option key={day} value={day}>{day} 06:00</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-between"><span className="text-slate-400">상태</span><span className="text-green-400">활성</span></div>
            <p className="text-xs text-slate-500 pt-2 border-t border-slate-800/60">현재 설정 기준: 주 1회 수요일 06:00 KST</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-purple-400/10"><Globe className="w-5 h-5 text-purple-400" /></div>
            <div>
              <h3 className="text-sm font-semibold text-white">배포 설정</h3>
              <p className="text-xs text-slate-400">Cloudflare Pages</p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">대시보드 URL</label>
            <input type="url" value={dashboardUrl} onChange={(e) => setDashboardUrl(e.target.value)} className="w-full rounded-xl border border-slate-700/80 bg-[#020617]/50 px-4 py-2.5 text-sm text-slate-300 focus:border-blue-500 focus:outline-none" />
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors disabled:opacity-60 flex items-center gap-2">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" />저장 중...</> : saved ? <><CheckCircle className="w-4 h-4" />저장됨</> : <><Settings className="w-4 h-4" />설정 저장</>}
        </button>
      </div>
    </div>
  );
}

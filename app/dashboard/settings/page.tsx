"use client";

import { Settings, Key, Mail, Globe } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">설정</h1>
        <p className="text-sm text-slate-400 mt-1">시스템 연동 및 API 키 관리</p>
      </div>

      <div className="space-y-4">
        {/* NRG Cloud API */}
        <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-400/10">
              <Key className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">NRG Cloud API</h3>
              <p className="text-xs text-slate-400">RLD 파일 변환 서비스</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Client ID</label>
              <input
                type="text"
                defaultValue="YPFS53vAxMLrb..."
                className="w-full rounded-xl border border-slate-700/80 bg-[#020617]/50 px-4 py-2.5 text-sm font-mono text-slate-300 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Client Secret</label>
              <input
                type="password"
                defaultValue="••••••••••••••••••••"
                className="w-full rounded-xl border border-slate-700/80 bg-[#020617]/50 px-4 py-2.5 text-sm font-mono text-slate-300 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-xs text-green-400">연결됨</span>
            </div>
          </div>
        </div>

        {/* Gmail 연동 */}
        <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-red-400/10">
              <Mail className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Gmail 연동</h3>
              <p className="text-xs text-slate-400">RLD 자동 수신 계정</p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">연동 계정</span>
              <span className="text-slate-200">windtreeeng@gmail.com</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">동기화 주기</span>
              <span className="text-slate-200">주 1회 (일요일 06:00)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">상태</span>
              <span className="text-green-400">활성</span>
            </div>
          </div>
        </div>

        {/* 사이트 URL */}
        <div className="rounded-xl border border-slate-800/60 bg-[#0b111d] p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-purple-400/10">
              <Globe className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">배포 설정</h3>
              <p className="text-xs text-slate-400">Cloudflare Pages</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">대시보드 URL</label>
              <input
                type="url"
                placeholder="https://wms.windtreeeng.com"
                className="w-full rounded-xl border border-slate-700/80 bg-[#020617]/50 px-4 py-2.5 text-sm text-slate-300 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <button className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors flex items-center gap-2">
          <Settings className="w-4 h-4" />
          설정 저장
        </button>
      </div>
    </div>
  );
}

"use client";

import Image from "next/image";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff, Loader2, Wind, BarChart3, Zap } from "lucide-react";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      setError("이메일 또는 비밀번호를 다시 확인해주세요.");
      return;
    }

    window.location.href = "/dashboard/";
  };

  return (
    <div className="min-h-screen flex">
      {/* 왼쪽 브랜드 패널 */}
      <div className="hidden lg:flex lg:w-[52%] relative flex-col justify-between p-12 bg-[#0a2540] overflow-hidden">
        {/* 배경 장식 */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.18)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(16,185,129,0.10)_0%,transparent_60%)]" />

        {/* 격자 패턴 */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* 로고 */}
        <div className="relative flex items-center gap-3">
          <Image src="/brand/logo-mark.png" alt="WindTree" width={40} height={40} className="rounded-xl" priority />
          <Image src="/brand/logo-horizontal.png" alt="WindTree WMS" width={152} height={28} className="h-7 w-auto brightness-0 invert" priority />
        </div>

        {/* 중앙 메인 카피 */}
        <div className="relative">
          <p className="text-blue-400 text-sm font-semibold tracking-widest uppercase mb-4">Wind Measurement System</p>
          <h2 className="text-4xl font-bold text-white leading-tight mb-6">
            기상 데이터를<br />한 곳에서
          </h2>
          <p className="text-slate-400 text-base leading-relaxed max-w-sm">
            전국 풍력 발전 후보지의 기상 측정 데이터를 실시간으로 수집·분석·관리합니다.
          </p>

          {/* 통계 카드 3개 */}
          <div className="mt-10 grid grid-cols-3 gap-4">
            {[
              { icon: Wind, label: "관측 사이트", value: "20+" },
              { icon: BarChart3, label: "일일 레코드", value: "1,440" },
              { icon: Zap, label: "자동 동기화", value: "24/7" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-xl bg-white/[0.06] border border-white/10 p-4">
                <Icon className="w-5 h-5 text-blue-400 mb-2" />
                <div className="text-xl font-bold text-white">{value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 하단 */}
        <div className="relative text-xs text-slate-600">
          © 2025 WindTree Engineering. All rights reserved.
        </div>
      </div>

      {/* 오른쪽 폼 패널 */}
      <div className="flex-1 flex items-center justify-center px-6 bg-[#f7fbff]">
        <div className="w-full max-w-sm">
          {/* 모바일 로고 */}
          <div className="flex lg:hidden items-center gap-3 mb-8">
            <Image src="/brand/logo-mark.png" alt="WindTree" width={36} height={36} className="rounded-xl" priority />
            <Image src="/brand/logo-horizontal.png" alt="WindTree WMS" width={136} height={26} className="h-6 w-auto" priority />
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">로그인</h1>
            <p className="text-sm text-slate-500 mt-1">계속하려면 로그인하세요</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">이메일</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@windtreeeng.com"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">비밀번호</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 py-3 text-sm font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2 transition-colors mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> 로그인 중...
                </>
              ) : (
                "로그인"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

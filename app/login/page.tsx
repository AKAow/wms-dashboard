"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Wind, Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }

    window.location.href = "/dashboard/";
    
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(180deg,#f5faff_0%,#eaf4ff_100%)] relative overflow-hidden">
      {/* 배경 효과 */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:40px_40px] opacity-30" />
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-[#0078FF]/30 to-transparent" />
        <div className="absolute left-1/4 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0078FF] shadow-[0_0_20px_#0078FF] animate-pulse-glow" />
        <div className="absolute left-3/4 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3393FF] shadow-[0_0_15px_#3393FF] animate-pulse-glow" />
      </div>

      <div className="relative z-10 w-full max-w-sm px-4">
        {/* 헤더 */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex w-10 h-10 border rounded-xl items-center justify-center border-[#c8def8]/80 bg-white/80 shadow-lg shadow-blue-900/10">
              <Wind className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-slate-900">WindTree WMS</span>
          </div>
          <p className="text-sm text-slate-500">기상 측정 데이터 통합 관리 플랫폼</p>
        </div>

        {/* 카드 */}
        <div
          className={`w-full rounded-2xl border border-[#d6e8ff] bg-white/70 backdrop-blur-xl p-8 shadow-2xl shadow-black/40 relative overflow-hidden ${shake ? "animate-shake" : ""}`}
        >
          <div className="bg-noise" />
          <form onSubmit={handleLogin} className="relative space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                이메일
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@windtreeeng.com"
                className="w-full rounded-xl border border-[#c8def8] bg-white/70 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:bg-white/70 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                비밀번호
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-[#c8def8] bg-white/70 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:bg-white/70 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  로그인 중...
                </>
              ) : (
                "로그인"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          © 2026 WindTree Co., Ltd. All rights reserved.
        </p>
      </div>
    </div>
  );
}

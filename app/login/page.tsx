"use client";

import Image from "next/image";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff, Loader2 } from "lucide-react";

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
    <div className="min-h-screen px-4 bg-[linear-gradient(180deg,#f7fbff_0%,#edf5ff_100%)] flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-[#d6e8ff] bg-white shadow-[0_20px_60px_rgba(10,37,64,0.12)] p-8">
        <div className="flex flex-col items-center text-center mb-7">
          <div className="flex items-center gap-3 mb-3">
            <Image src="/brand/logo-mark.png" alt="WindTree" width={40} height={40} className="rounded-xl" priority />
            <Image src="/brand/logo-horizontal.png" alt="WindTree WMS" width={152} height={28} className="h-7 w-auto" priority />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">WMS 로그인</h1>
          <p className="text-sm text-slate-500 mt-1">기상 측정 데이터 통합 관리</p>
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
              className="w-full rounded-xl border border-[#c8def8] bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
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
                className="w-full rounded-xl border border-[#c8def8] bg-white px-3.5 py-2.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 p-1"
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
            className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-3 text-sm font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2"
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
  );
}

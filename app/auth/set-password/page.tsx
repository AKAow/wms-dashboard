"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";

export default function SetPasswordPage() {
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    if (password !== confirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    window.location.href = "/dashboard/";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(180deg,#f7fbff_0%,#edf5ff_100%)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#d6e8ff] bg-white p-8">
        <h1 className="text-xl font-semibold text-slate-900 mb-1">비밀번호 설정</h1>
        <p className="text-sm text-slate-500 mb-6">초대 수락을 완료하려면 새 비밀번호를 설정해주세요.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">새 비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[#c8def8] px-3.5 py-2.5 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">비밀번호 확인</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-xl border border-[#c8def8] px-3.5 py-2.5 text-sm"
              required
            />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-3 text-sm font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> 저장 중...
              </>
            ) : (
              "비밀번호 설정 완료"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

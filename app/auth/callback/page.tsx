"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

export default function AuthCallbackPage() {
  const supabase = createClient();
  const [error, setError] = useState("");

  useEffect(() => {
    async function run() {
      try {
        const url = new URL(window.location.href);

        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const access_token = hash.get("access_token");
        const refresh_token = hash.get("refresh_token");
        const type = hash.get("type") || url.searchParams.get("type") || "";

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          setError("초대 링크가 만료되었거나 유효하지 않습니다. 다시 초대해 주세요.");
          return;
        }

        if (type === "invite" || type === "recovery") {
          window.location.href = "/auth/set-password";
          return;
        }

        window.location.href = "/dashboard/";
      } catch (e) {
        setError(e instanceof Error ? e.message : "인증 처리 중 오류가 발생했습니다.");
      }
    }

    void run();
  }, [supabase.auth]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(180deg,#f7fbff_0%,#edf5ff_100%)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#d6e8ff] bg-white p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-900 mb-2">인증 처리 중입니다</h1>
        {error ? <p className="text-sm text-rose-600">{error}</p> : <p className="text-sm text-slate-500">잠시만 기다려주세요...</p>}
      </div>
    </div>
  );
}

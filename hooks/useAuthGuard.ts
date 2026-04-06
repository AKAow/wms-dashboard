"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasActiveSession } from "@/lib/services/auth.service";

export function useAuthGuard(supabase: SupabaseClient) {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    async function verify() {
      const active = await hasActiveSession(supabase);
      if (mounted && !active) {
        router.push("/login");
      }
    }

    verify();

    return () => {
      mounted = false;
    };
  }, [router, supabase]);
}

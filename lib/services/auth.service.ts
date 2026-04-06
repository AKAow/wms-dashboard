import type { SupabaseClient } from "@supabase/supabase-js";

export async function hasActiveSession(supabase: SupabaseClient): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return Boolean(session);
}

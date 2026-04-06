import type { SupabaseClient } from "@supabase/supabase-js";
import type { UploadHistory } from "@/lib/types";

export type UploadWithSite = UploadHistory & { sites: { name: string } | null };

export async function fetchUploadHistory(
  supabase: SupabaseClient,
  limit = 50,
): Promise<UploadWithSite[]> {
  const { data, error } = await supabase
    .from("upload_history")
    .select("*, sites(name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as UploadWithSite[]) ?? [];
}

export async function fetchRecentUploads(
  supabase: SupabaseClient,
  limit = 5,
): Promise<UploadHistory[]> {
  const { data, error } = await supabase
    .from("upload_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as UploadHistory[]) ?? [];
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Site } from "@/lib/types";

export type SitePayload = {
  name: string;
  site_number: string;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  elevation: number | null;
  ipack_email: string | null;
  gmail_sync_enabled: boolean;
  gmail_query: string | null;
  is_active: boolean;
};

export async function fetchSites(supabase: SupabaseClient): Promise<Site[]> {
  const { data, error } = await supabase.from("sites").select("*").order("name");
  if (error) throw error;
  return (data as Site[]) ?? [];
}

export async function createSite(supabase: SupabaseClient, payload: SitePayload) {
  return supabase.from("sites").insert(payload);
}

export async function updateSite(supabase: SupabaseClient, siteId: string, payload: SitePayload) {
  return supabase.from("sites").update(payload).eq("id", siteId);
}

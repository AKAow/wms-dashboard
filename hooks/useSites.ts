"use client";

import { useCallback, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Site } from "@/lib/types";
import {
  createSite,
  deleteSite,
  fetchSites,
  updateSite,
  type SitePayload,
} from "@/lib/services/sites.service";

export function useSites(supabase: SupabaseClient) {
  const [sites, setSites] = useState<Site[]>([]);

  const reload = useCallback(async () => {
    const data = await fetchSites(supabase);
    setSites(data);
    return data;
  }, [supabase]);

  const addSite = useCallback(
    async (payload: SitePayload) => {
      const res = await createSite(supabase, payload);
      if (!res.error) await reload();
      return res;
    },
    [reload, supabase],
  );

  const editSite = useCallback(
    async (siteId: string, payload: SitePayload) => {
      const res = await updateSite(supabase, siteId, payload);
      if (!res.error) await reload();
      return res;
    },
    [reload, supabase],
  );

  const removeSite = useCallback(
    async (siteId: string) => {
      const res = await deleteSite(supabase, siteId);
      if (!res.error) await reload();
      return res;
    },
    [reload, supabase],
  );

  return { sites, setSites, reload, addSite, editSite, removeSite };
}

"use client";

import { useCallback, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UploadHistory } from "@/lib/types";
import {
  fetchRecentUploads,
  fetchUploadHistory,
  type UploadWithSite,
} from "@/lib/services/upload-history.service";

export function useUploadHistory(supabase: SupabaseClient) {
  const [uploads, setUploads] = useState<UploadWithSite[]>([]);

  const load = useCallback(
    async (limit = 50) => {
      const data = await fetchUploadHistory(supabase, limit);
      setUploads(data);
      return data;
    },
    [supabase],
  );

  return { uploads, load };
}

export function useRecentUploads(supabase: SupabaseClient) {
  const [uploads, setUploads] = useState<UploadHistory[]>([]);

  const load = useCallback(
    async (limit = 5) => {
      const data = await fetchRecentUploads(supabase, limit);
      setUploads(data);
      return data;
    },
    [supabase],
  );

  return { uploads, load };
}

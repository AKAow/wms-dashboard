import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = "https://gxngbvahywpaaavkkrfx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4bmdidmFoeXdwYWFhdmtrcmZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxODE0NjYsImV4cCI6MjA5MDc1NzQ2Nn0.ADoZo0J1KJonkrUZN3XLPGi6vRrDgKM1I17ygN2RMeM";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

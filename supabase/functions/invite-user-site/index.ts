// Deploy with: supabase functions deploy invite-user-site
// Required env vars on Supabase project:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type InvitePayload = {
  email: string;
  role: "admin" | "viewer";
  siteId: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { email, role, siteId } = (await req.json()) as InvitePayload;
    if (!email || !role || !siteId) {
      return new Response(JSON.stringify({ error: "missing fields" }), { status: 400 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);
    if (inviteError) {
      return new Response(JSON.stringify({ error: inviteError.message }), { status: 400 });
    }

    const userId = invited.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "invited user id missing" }), { status: 400 });
    }

    const { error: upsertError } = await admin
      .from("user_site_access")
      .upsert(
        {
          user_id: userId,
          site_id: siteId,
          role,
          granted_at: new Date().toISOString(),
        },
        { onConflict: "user_id,site_id" },
      );

    if (upsertError) {
      return new Response(JSON.stringify({ error: upsertError.message }), { status: 400 });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});

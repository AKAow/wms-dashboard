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

function resolveRedirectTo(): string {
  const base =
    Deno.env.get("DASHBOARD_URL") ||
    Deno.env.get("NEXT_PUBLIC_DASHBOARD_URL") ||
    "https://wms-dashboard-ckn.pages.dev";

  return `${base.replace(/\/$/, "")}/auth/callback`;
}

async function syncUserGlobalRole(admin: ReturnType<typeof createClient>, userId: string) {
  const { data: roles, error: roleErr } = await admin
    .from("user_site_access")
    .select("role")
    .eq("user_id", userId);

  if (roleErr) throw new Error(roleErr.message);

  const isAdmin = (roles ?? []).some((r) => r.role === "admin");
  const nextRole = isAdmin ? "admin" : "viewer";

  const { data: userData, error: getUserErr } = await admin.auth.admin.getUserById(userId);
  if (getUserErr) throw new Error(getUserErr.message);

  const raw = (userData.user?.user_metadata ?? {}) as Record<string, unknown>;
  const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...raw,
      role: nextRole,
    },
  });

  if (updateErr) throw new Error(updateErr.message);
}

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

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: resolveRedirectTo(),
    });
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

    await syncUserGlobalRole(admin, userId);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});

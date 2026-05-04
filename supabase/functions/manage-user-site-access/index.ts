// Deploy with: supabase functions deploy manage-user-site-access
// Required env vars on Supabase project:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Payload = {
  userId: string;
  siteId: string;
  action: "set-role" | "remove";
  role?: "admin" | "viewer";
};

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

    const { data: requester, error: requesterErr } = await admin.auth.getUser(jwt);
    if (requesterErr || !requester.user?.id) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }

    const requesterId = requester.user.id;
    const requesterMetaRole = (requester.user.user_metadata?.role as string | undefined) ?? "";

    let requesterIsAdmin = requesterMetaRole === "admin";
    if (!requesterIsAdmin) {
      const { data: myAccess, error: myErr } = await admin
        .from("user_site_access")
        .select("role")
        .eq("user_id", requesterId)
        .eq("role", "admin")
        .limit(1);
      if (myErr) return new Response(JSON.stringify({ error: myErr.message }), { status: 400 });
      requesterIsAdmin = (myAccess ?? []).length > 0;
    }

    if (!requesterIsAdmin) {
      return new Response(JSON.stringify({ error: "admin required" }), { status: 403 });
    }

    const { userId, siteId, action, role } = (await req.json()) as Payload;
    if (!userId || !siteId || !action) {
      return new Response(JSON.stringify({ error: "missing fields" }), { status: 400 });
    }

    if (action === "set-role") {
      if (!role) return new Response(JSON.stringify({ error: "role required" }), { status: 400 });
      const { error } = await admin
        .from("user_site_access")
        .update({ role, granted_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("site_id", siteId);

      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    } else if (action === "remove") {
      const { error } = await admin
        .from("user_site_access")
        .delete()
        .eq("user_id", userId)
        .eq("site_id", siteId);

      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    } else {
      return new Response(JSON.stringify({ error: "invalid action" }), { status: 400 });
    }

    await syncUserGlobalRole(admin, userId);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});

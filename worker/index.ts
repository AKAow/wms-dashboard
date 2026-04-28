/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Env {
  NRG_CLIENT_ID: string;
  NRG_CLIENT_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  // Gmail OAuth (optional but required for scheduled auto-sync)
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  GMAIL_USER?: string; // default: windtreeeng@gmail.com

  // Optional: Cloudflare API for updating cron trigger from web settings
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_SCRIPT_NAME?: string; // default: wms-rld-worker
}

type ScheduledEvent = {
  cron: string;
  scheduledTime: number;
};

type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

const NRG_BASE = "https://cloud-api.nrgsystems.com/nrgcloudcustomerapi/";

type ParsedRow = Record<string, string | number | null>;
type MeasurementRow = ParsedRow & { site_id: string; timestamp?: string | number | null };

async function getNRGToken(clientId: string, secret: string): Promise<string> {
  const r = await fetch(NRG_BASE + "token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret: secret }),
  });
  const d = (await r.json()) as { apiToken?: string; access_token?: string };
  return d.apiToken || d.access_token || "";
}

async function convertRLD(token: string, fileBase64: string): Promise<ArrayBuffer | null> {
  const r = await fetch(NRG_BASE + "data/convert", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      FileBytes64BitEncoded: fileBase64,
      NecFile64BitEncoded: "",
      exportType: "measurements",
    }),
  });
  if (!r.ok) return null;
  return r.arrayBuffer();
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((base64url.length + 3) % 4);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function unzipToText(zipBuffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(zipBuffer);
  let offset = 0;
  while (offset < bytes.length - 30) {
    if (bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b && bytes[offset + 2] === 0x03 && bytes[offset + 3] === 0x04) {
      const compression = bytes[offset + 8] | (bytes[offset + 9] << 8);
      const compSize = bytes[offset + 18] | (bytes[offset + 19] << 8) | (bytes[offset + 20] << 16) | (bytes[offset + 21] << 24);
      const nameLen = bytes[offset + 26] | (bytes[offset + 27] << 8);
      const extraLen = bytes[offset + 28] | (bytes[offset + 29] << 8);
      const dataOffset = offset + 30 + nameLen + extraLen;
      const compData = bytes.slice(dataOffset, dataOffset + compSize);

      if (compression === 0) {
        return new TextDecoder("utf-8").decode(compData);
      } else if (compression === 8) {
        const ds = new DecompressionStream("deflate-raw");
        const writer = ds.writable.getWriter();
        writer.write(compData);
        writer.close();

        const reader = ds.readable.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const total = chunks.reduce((a, c) => a + c.length, 0);
        const out = new Uint8Array(total);
        let pos = 0;
        for (const c of chunks) {
          out.set(c, pos);
          pos += c.length;
        }
        return new TextDecoder("utf-8").decode(out);
      }
      break;
    }
    offset++;
  }
  return "";
}

function parseMeas(text: string): { siteNumber: string | null; records: ParsedRow[] } {
  const lines = text.split("\n");
  const siteMatch = text.match(/Site Number:\s*(\d+)/);
  const siteNumber = siteMatch ? siteMatch[1] : null;
  const hi = lines.findIndex((l) => l.startsWith("Timestamp\t"));
  if (hi < 0) return { siteNumber, records: [] };

  const headers = lines[hi].split("\t");
  const idx = (p: string) => headers.findIndex((h) => h.startsWith(p) && h.includes("_Avg_"));
  const cm: Record<string, number> = {
    ch1: idx("Ch1_"),
    ch2: idx("Ch2_"),
    ch3: idx("Ch3_"),
    ch4: idx("Ch4_"),
    ch5: idx("Ch5_"),
    ch6: idx("Ch6_"),
    ch7: idx("Ch7_"),
    ch8: idx("Ch8_"),
    ch13: idx("Ch13_"),
    ch14: idx("Ch14_"),
    ch15: idx("Ch15_"),
    ch16: idx("Ch16_"),
    ch17: idx("Ch17_"),
    ch21: idx("Ch21_"),
    ch22: idx("Ch22_"),
  };

  const records: ParsedRow[] = [];
  for (const line of lines.slice(hi + 1)) {
    if (!line.trim()) continue;
    const p = line.split("\t");
    const row: ParsedRow = { timestamp: p[0] };
    for (const [ch, i] of Object.entries(cm)) row[ch] = i >= 0 && p[i] ? parseFloat(p[i]) : null;
    records.push(row);
  }
  return { siteNumber, records };
}

async function sbFetch(env: Env, path: string, init?: RequestInit): Promise<Response> {
  const SH = {
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    "Content-Type": "application/json",
  };
  return fetch(`${env.SUPABASE_URL}${path}`, { ...init, headers: { ...SH, ...(init?.headers || {}) } });
}

async function hasUploadHistory(env: Env, fileName: string): Promise<boolean> {
  const r = await sbFetch(env, `/rest/v1/upload_history?file_name=eq.${encodeURIComponent(fileName)}&select=id&limit=1`);
  if (!r.ok) return false;
  const d = (await r.json()) as { id: string }[];
  return d.length > 0;
}

async function processRldFile(env: Env, fileName: string, fileBuffer: ArrayBuffer, source = "worker-auto") {
  const already = await hasUploadHistory(env, fileName);
  if (already) return { ok: true, skipped: true, file_name: fileName };

  const snFromName = fileName.match(/^(\d+)_/)?.[1] ?? null;
  const token = await getNRGToken(env.NRG_CLIENT_ID, env.NRG_CLIENT_SECRET);
  if (!token) throw new Error("NRG 토큰 발급 실패");

  const zipBuf = await convertRLD(token, toBase64(fileBuffer));
  if (!zipBuf) throw new Error("NRG 변환 실패");

  const text = await unzipToText(zipBuf);
  if (!text) throw new Error("파일 추출 실패");

  const { siteNumber, records } = parseMeas(text);
  const sn = siteNumber || snFromName;
  if (!sn) throw new Error("사이트 번호 인식 불가");

  const sr = await sbFetch(env, `/rest/v1/sites?site_number=eq.${sn}&select=id`);
  const sites = (await sr.json()) as { id: string }[];
  let siteId: string;
  const isNew = sites.length === 0;

  if (isNew) {
    const cr = await sbFetch(env, `/rest/v1/sites`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ name: `Site ${sn}`, site_number: sn, is_active: true }),
    });
    siteId = ((await cr.json()) as { id: string }[])[0].id;
  } else {
    siteId = sites[0].id;
  }

  const rows: MeasurementRow[] = records.map((r) => ({ ...r, site_id: siteId }));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    await sbFetch(env, `/rest/v1/measurements`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(rows.slice(i, i + 500)),
    });
    inserted += Math.min(500, rows.length - i);
  }

  const statsMap = new Map<string, { [ch: string]: { sum: number; max: number; min: number; count: number; vals: number[] } }>();
  const CHANNELS = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch13"];

  for (const r of rows) {
    const ts = String(r.timestamp || "");
    const d = ts.split(" ")[0];
    if (!statsMap.has(d)) statsMap.set(d, {});
    const s = statsMap.get(d)!;

    for (const ch of CHANNELS) {
      const v = r[ch] as number | null;
      if (v !== null && Number.isFinite(v)) {
        if (!s[ch]) s[ch] = { sum: 0, max: v, min: v, count: 0, vals: [] };
        s[ch].sum += v;
        s[ch].count += 1;
        s[ch].vals.push(v);
        if (v > s[ch].max) s[ch].max = v;
        if (v < s[ch].min) s[ch].min = v;
      }
    }
  }

  const statRows: any[] = [];
  for (const [date, chs] of statsMap.entries()) {
    for (const [ch, d] of Object.entries(chs)) {
      const avg = d.sum / d.count;
      const variance = d.vals.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / d.count;
      statRows.push({
        site_id: siteId,
        date,
        channel: ch,
        avg_value: avg,
        max_value: d.max,
        min_value: d.min,
        std_value: Math.sqrt(variance),
        data_count: d.count,
      });
    }
  }

  for (let i = 0; i < statRows.length; i += 500) {
    await sbFetch(env, `/rest/v1/daily_stats`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(statRows.slice(i, i + 500)),
    });
  }

  const dm = fileName.match(/(\d{4}-\d{2}-\d{2})/);
  await sbFetch(env, `/rest/v1/upload_history`, {
    method: "POST",
    body: JSON.stringify({
      site_id: siteId,
      source,
      file_name: fileName,
      date_range_start: dm?.[1] ?? null,
      date_range_end: dm?.[1] ?? null,
      records_inserted: inserted,
      status: "success",
    }),
  });

  return { ok: true, file_name: fileName, site_number: sn, site_id: siteId, records_inserted: inserted, is_new_site: isNew };
}

async function getGoogleAccessToken(env: Env): Promise<string> {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN) return "";

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  if (!r.ok) return "";
  const d = (await r.json()) as { access_token?: string };
  return d.access_token || "";
}

function walkParts(parts: any[] | undefined, out: any[] = []): any[] {
  if (!parts) return out;
  for (const p of parts) {
    out.push(p);
    if (p.parts) walkParts(p.parts, out);
  }
  return out;
}

const KST_DAYS = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"] as const;
type KstDay = (typeof KST_DAYS)[number];

const JS_DAY_TO_KST: KstDay[] = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

function kstDayToJsDay(day: KstDay): number {
  if (day === "일요일") return 0;
  return KST_DAYS.indexOf(day) + 1;
}

function jsDayToKstDay(jsDay: number): KstDay | null {
  return JS_DAY_TO_KST[jsDay] ?? null;
}

function dayToCron(day: KstDay): string {
  const kstJsDay = kstDayToJsDay(day);
  // 06:00 KST == 21:00 UTC(previous day)
  const utcDow = (kstJsDay + 6) % 7;
  return `0 21 * * ${utcDow}`;
}

function cronToDayKst(cron: string): KstDay | null {
  const m = cron.trim().match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+([0-7])$/);
  if (!m) return null;

  const minute = Number(m[1]);
  const hour = Number(m[2]);
  const rawDow = Number(m[3]);
  if (Number.isNaN(minute) || Number.isNaN(hour) || Number.isNaN(rawDow)) return null;
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;

  const utcDow = rawDow === 7 ? 0 : rawDow;
  if (utcDow < 0 || utcDow > 6) return null;

  const kstHour = hour + 9;
  const dayShift = kstHour >= 24 ? 1 : 0;
  const kstJsDay = (utcDow + dayShift) % 7;
  return jsDayToKstDay(kstJsDay);
}

async function getCronConfig(env: Env): Promise<Response> {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
    return new Response(JSON.stringify({ ok: false, error: "cloudflare-config-missing" }), { status: 500 });
  }
  const script = env.CLOUDFLARE_SCRIPT_NAME || "wms-rld-worker";
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${script}/schedules`, {
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
  });
  const d = (await r.json()) as any;
  if (!r.ok || !d?.success) {
    return new Response(JSON.stringify({ ok: false, error: "cloudflare-read-failed", detail: d }), { status: 500 });
  }
  const schedules: Array<{ cron: string }> = Array.isArray(d.result)
    ? d.result
    : (d.result?.schedules || []);
  const cron = schedules[0]?.cron || null;
  const dayKst = cron ? cronToDayKst(cron) : null;
  return new Response(JSON.stringify({ ok: true, cron, dayKst, schedules }));
}

async function setCronConfig(env: Env, dayKst: string): Promise<Response> {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
    return new Response(JSON.stringify({ ok: false, error: "cloudflare-config-missing" }), { status: 500 });
  }
  if (!KST_DAYS.includes(dayKst as KstDay)) {
    return new Response(JSON.stringify({ ok: false, error: "invalid-day" }), { status: 400 });
  }

  const script = env.CLOUDFLARE_SCRIPT_NAME || "wms-rld-worker";
  const cron = dayToCron(dayKst as KstDay);

  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${script}/schedules`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([{ cron }]),
  });
  const d = (await r.json()) as any;
  if (!r.ok || !d?.success) {
    return new Response(JSON.stringify({ ok: false, error: "cloudflare-update-failed", detail: d }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true, cron, dayKst }));
}

async function runScheduledSync(env: Env): Promise<Response> {
  const user = env.GMAIL_USER || "windtreeeng@gmail.com";
  const token = await getGoogleAccessToken(env);
  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: "gmail-token-failed" }), { status: 500 });
  }

  const siteRes = await sbFetch(
    env,
    "/rest/v1/sites?select=id,name,site_number,gmail_sync_enabled,gmail_query,is_active&gmail_sync_enabled=eq.true&is_active=eq.true",
  );
  if (!siteRes.ok) {
    const txt = await siteRes.text();
    return new Response(JSON.stringify({ ok: false, error: "site-config-read-failed", detail: txt }), { status: 500 });
  }

  const targets = (await siteRes.json()) as Array<{
    id: string;
    name: string;
    site_number: string;
    gmail_sync_enabled: boolean;
    gmail_query: string | null;
    is_active: boolean;
  }>;

  const auth = { Authorization: `Bearer ${token}` };
  let processed = 0;
  let skipped = 0;
  let checkedMessages = 0;
  const results: any[] = [];

  // Cloudflare subrequest budget 보호 (1101 방지)
  const MAX_SITES_PER_RUN = 8;
  const MAX_MESSAGES_PER_SITE = 20;
  const MAX_ATTACHMENTS_PER_SITE = 1;
  const limitedTargets = targets.slice(0, MAX_SITES_PER_RUN);

  for (const site of limitedTargets) {
    const siteQuery = site.gmail_query?.trim();
    const defaultQuery = `has:attachment filename:rld filename:${site.site_number}_ newer_than:14d`;
    const q = encodeURIComponent(siteQuery && siteQuery.length > 0 ? siteQuery : defaultQuery);

    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(user)}/messages?q=${q}&maxResults=${MAX_MESSAGES_PER_SITE}`;
    const listRes = await fetch(listUrl, { headers: auth });
    if (!listRes.ok) {
      const txt = await listRes.text();
      results.push({ ok: false, site_id: site.id, site_number: site.site_number, error: "gmail-list-failed", detail: txt });
      continue;
    }

    const list = (await listRes.json()) as { messages?: { id: string }[] };
    const msgs = (list.messages || []).slice(0, MAX_MESSAGES_PER_SITE);
    checkedMessages += msgs.length;

    let processedForSite = 0;
    for (const m of msgs) {
      if (processedForSite >= MAX_ATTACHMENTS_PER_SITE) break;

      const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(user)}/messages/${m.id}?format=full`, { headers: auth });
      if (!msgRes.ok) continue;
      const msg = (await msgRes.json()) as any;

      const parts = walkParts(msg.payload?.parts);
      for (const p of parts) {
        const fileName: string = p.filename || "";
        const isRld = fileName.toLowerCase().endsWith(".rld");
        if (!isRld) continue;

        if (!fileName.includes(`${site.site_number}_`)) continue;

        const already = await hasUploadHistory(env, fileName);
        if (already) {
          skipped++;
          results.push({ ok: true, skipped: true, reason: "already-uploaded", site_id: site.id, site_number: site.site_number, file_name: fileName });
          continue;
        }

        const aid = p.body?.attachmentId;
        if (!aid) continue;

        const attRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(user)}/messages/${m.id}/attachments/${aid}`, { headers: auth });
        if (!attRes.ok) continue;
        const att = (await attRes.json()) as { data?: string };
        if (!att.data) continue;

        try {
          const buf = fromBase64UrlToArrayBuffer(att.data);
          const r = await processRldFile(env, fileName, buf, "gmail-cron");
          processed++;
          processedForSite++;
          results.push({ ...r, site_id: site.id, site_number: site.site_number });
        } catch (e: unknown) {
          results.push({
            ok: false,
            site_id: site.id,
            site_number: site.site_number,
            file_name: fileName,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, processed, skipped, checked_messages: checkedMessages, enabled_sites: targets.length, scanned_sites: limitedTargets.length, results }));
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(request.url);

    if (url.pathname === "/cron-config" && request.method === "GET") {
      const res = await getCronConfig(env);
      return new Response(await res.text(), { status: res.status, headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (url.pathname === "/cron-config" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as { dayKst?: string };
      const res = await setCronConfig(env, body.dayKst || "");
      return new Response(await res.text(), { status: res.status, headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (url.pathname === "/sync-rld" && request.method === "POST") {
      const res = await runScheduledSync(env);
      return new Response(await res.text(), { status: res.status, headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (url.pathname !== "/upload-rld" || request.method !== "POST") {
      return new Response("Not found", { status: 404, headers: cors });
    }

    try {
      const fd = await request.formData();
      const file = fd.get("file") as File;
      if (!file) {
        return new Response(JSON.stringify({ error: "파일 없음" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      }

      const result = await processRldFile(env, file.name, await file.arrayBuffer(), "manual");
      return new Response(JSON.stringify(result), { headers: { ...cors, "Content-Type": "application/json" } });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledSync(env));
  },
};

export default worker;

// index.ts
var NRG_TOKEN_URL = "https://cloud-api.nrgsystems.com/nrgcloudcustomerapi/token";
var NRG_CONVERT_URL = "https://cloud-api.nrgsystems.com/nrgcloudcustomerapi/convert";
async function getNRGToken(clientId, secret) {
  const r = await fetch(NRG_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: secret
    })
  });
  const d = await r.json();
  return d.access_token;
}
async function convertRLD(token, fileName, fileBase64) {
  const r = await fetch(NRG_CONVERT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ fileName, fileContentBase64: fileBase64 })
  });
  const d = await r.json();
  if (d.textOutput) return d.textOutput;
  if (d.fileContentBase64) return atob(d.fileContentBase64);
  return "";
}
function parseMeas(text) {
  const lines = text.split("\n");
  const hi = lines.findIndex((l) => l.startsWith("Timestamp	"));
  if (hi < 0) return { siteNumber: null, records: [] };
  const siteMatch = text.match(/Site Number:\s*(\d+)/);
  const siteNumber = siteMatch ? siteMatch[1] : null;
  const headers = lines[hi].split("	");
  const idx = (prefix) => {
    const k = headers.findIndex((h) => h.startsWith(prefix) && h.includes("_Avg_"));
    return k >= 0 ? k : -1;
  };
  const chMap = {
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
    ch22: idx("Ch22_")
  };
  const records = [];
  for (const line of lines.slice(hi + 1)) {
    if (!line.trim()) continue;
    const parts = line.split("	");
    const row = { timestamp: parts[0] };
    for (const [ch, i] of Object.entries(chMap)) {
      row[ch] = i >= 0 && parts[i] ? parseFloat(parts[i]) : null;
    }
    records.push(row);
  }
  return { siteNumber, records };
}
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (url.pathname !== "/upload-rld" || request.method !== "POST") {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }
    try {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file) return new Response(JSON.stringify({ error: "\uD30C\uC77C \uC5C6\uC74C" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const fileNameMatch = file.name.match(/^(\d+)_/);
      const siteNumberFromName = fileNameMatch ? fileNameMatch[1] : null;
      const bytes = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
      const token = await getNRGToken(env.NRG_CLIENT_ID, env.NRG_CLIENT_SECRET);
      const measText = await convertRLD(token, file.name, base64);
      if (!measText) return new Response(JSON.stringify({ error: "\uBCC0\uD658 \uC2E4\uD328" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { siteNumber, records } = parseMeas(measText);
      const finalSiteNumber = siteNumber || siteNumberFromName;
      if (!finalSiteNumber) return new Response(JSON.stringify({ error: "\uC0AC\uC774\uD2B8 \uBC88\uD638\uB97C \uC778\uC2DD\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const supabaseHeaders = {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json"
      };
      const siteRes = await fetch(`${env.SUPABASE_URL}/rest/v1/sites?site_number=eq.${finalSiteNumber}&select=id,name`, { headers: supabaseHeaders });
      const sites = await siteRes.json();
      let siteId;
      if (sites.length === 0) {
        const newSite = await fetch(`${env.SUPABASE_URL}/rest/v1/sites`, {
          method: "POST",
          headers: { ...supabaseHeaders, Prefer: "return=representation" },
          body: JSON.stringify({ name: `Site ${finalSiteNumber}`, site_number: finalSiteNumber, is_active: true })
        });
        const created = await newSite.json();
        siteId = created[0].id;
      } else {
        siteId = sites[0].id;
      }
      const rows = records.map((r) => ({ ...r, site_id: siteId }));
      const batchSize = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        await fetch(`${env.SUPABASE_URL}/rest/v1/measurements`, {
          method: "POST",
          headers: { ...supabaseHeaders, Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify(batch)
        });
        inserted += batch.length;
      }
      const dateMatch = file.name.match(/(\d{4}-\d{2}-\d{2})/);
      await fetch(`${env.SUPABASE_URL}/rest/v1/upload_history`, {
        method: "POST",
        headers: supabaseHeaders,
        body: JSON.stringify({
          site_id: siteId,
          source: "manual",
          file_name: file.name,
          date_range_start: dateMatch ? dateMatch[1] : null,
          date_range_end: dateMatch ? dateMatch[1] : null,
          records_inserted: inserted,
          status: "success"
        })
      });
      return new Response(JSON.stringify({
        ok: true,
        site_number: finalSiteNumber,
        site_id: siteId,
        records_inserted: inserted,
        is_new_site: sites.length === 0
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }
};
export {
  index_default as default
};

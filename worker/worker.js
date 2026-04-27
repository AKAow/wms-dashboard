// index.ts
var NRG_BASE = "https://cloud-api.nrgsystems.com/nrgcloudcustomerapi/";
async function getNRGToken(clientId, secret) {
  const r = await fetch(NRG_BASE + "token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret: secret })
  });
  const d = await r.json();
  return d.apiToken || d.access_token || "";
}
async function convertRLD(token, fileBase64) {
  const r = await fetch(NRG_BASE + "data/convert", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ FileBytes64BitEncoded: fileBase64, NecFile64BitEncoded: "", exportType: "measurements" })
  });
  if (!r.ok) return null;
  return r.arrayBuffer();
}
async function unzipToText(zipBuffer) {
  const bytes = new Uint8Array(zipBuffer);
  let offset = 0;
  while (offset < bytes.length - 30) {
    if (bytes[offset] === 80 && bytes[offset + 1] === 75 && bytes[offset + 2] === 3 && bytes[offset + 3] === 4) {
      const compression = bytes[offset + 8] | bytes[offset + 9] << 8;
      const compSize = bytes[offset + 18] | bytes[offset + 19] << 8 | bytes[offset + 20] << 16 | bytes[offset + 21] << 24;
      const nameLen = bytes[offset + 26] | bytes[offset + 27] << 8;
      const extraLen = bytes[offset + 28] | bytes[offset + 29] << 8;
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
        const chunks = [];
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
function parseMeas(text) {
  const lines = text.split("\n");
  const siteMatch = text.match(/Site Number:\s*(\d+)/);
  const siteNumber = siteMatch ? siteMatch[1] : null;
  const hi = lines.findIndex((l) => l.startsWith("Timestamp	"));
  if (hi < 0) return { siteNumber, records: [] };
  const headers = lines[hi].split("	");
  const idx = (p) => headers.findIndex((h) => h.startsWith(p) && h.includes("_Avg_"));
  const cm = { ch1: idx("Ch1_"), ch2: idx("Ch2_"), ch3: idx("Ch3_"), ch4: idx("Ch4_"), ch5: idx("Ch5_"), ch6: idx("Ch6_"), ch7: idx("Ch7_"), ch8: idx("Ch8_"), ch13: idx("Ch13_"), ch14: idx("Ch14_"), ch15: idx("Ch15_"), ch16: idx("Ch16_"), ch17: idx("Ch17_"), ch21: idx("Ch21_"), ch22: idx("Ch22_") };
  const records = [];
  for (const line of lines.slice(hi + 1)) {
    if (!line.trim()) continue;
    const p = line.split("	");
    const row = { timestamp: p[0] };
    for (const [ch, i] of Object.entries(cm)) row[ch] = i >= 0 && p[i] ? parseFloat(p[i]) : null;
    records.push(row);
  }
  return { siteNumber, records };
}
var index_default = {
  async fetch(request, env) {
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(request.url);
    if (url.pathname !== "/upload-rld" || request.method !== "POST") return new Response("Not found", { status: 404, headers: cors });
    try {
      const fd = await request.formData();
      const file = fd.get("file");
      if (!file) return new Response(JSON.stringify({ error: "\uD30C\uC77C \uC5C6\uC74C" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      const snFromName = file.name.match(/^(\d+)_/)?.[1] ?? null;
      const bytes = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
      const token = await getNRGToken(env.NRG_CLIENT_ID, env.NRG_CLIENT_SECRET);
      if (!token) throw new Error("NRG \uD1A0\uD070 \uBC1C\uAE09 \uC2E4\uD328");
      const zipBuf = await convertRLD(token, b64);
      if (!zipBuf) throw new Error("NRG \uBCC0\uD658 \uC2E4\uD328");
      const text = await unzipToText(zipBuf);
      if (!text) throw new Error("\uD30C\uC77C \uCD94\uCD9C \uC2E4\uD328");
      const { siteNumber, records } = parseMeas(text);
      const sn = siteNumber || snFromName;
      if (!sn) throw new Error("\uC0AC\uC774\uD2B8 \uBC88\uD638 \uC778\uC2DD \uBD88\uAC00");
      const SH = { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json" };
      const SB = env.SUPABASE_URL;
      const sr = await fetch(`${SB}/rest/v1/sites?site_number=eq.${sn}&select=id`, { headers: SH });
      const sites = await sr.json();
      let siteId;
      const isNew = sites.length === 0;
      if (isNew) {
        const cr = await fetch(`${SB}/rest/v1/sites`, { method: "POST", headers: { ...SH, Prefer: "return=representation" }, body: JSON.stringify({ name: `Site ${sn}`, site_number: sn, is_active: true }) });
        siteId = (await cr.json())[0].id;
      } else {
        siteId = sites[0].id;
      }
      const rows = records.map((r) => ({ ...r, site_id: siteId }));
      let inserted = 0;
      for (let i = 0; i < rows.length; i += 500) {
        await fetch(`${SB}/rest/v1/measurements`, { method: "POST", headers: { ...SH, Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(rows.slice(i, i + 500)) });
        inserted += Math.min(500, rows.length - i);
      }
      const statsMap = /* @__PURE__ */ new Map();
      const CHANNELS = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch13"];
      for (const r of rows) {
        const d = r.timestamp.split(" ")[0];
        if (!statsMap.has(d)) statsMap.set(d, {});
        const s = statsMap.get(d);
        for (const ch of CHANNELS) {
          const v = r[ch];
          if (v !== null) {
            if (!s[ch]) s[ch] = { sum: 0, max: v, min: v, count: 0, vals: [] };
            s[ch].sum += v;
            s[ch].count += 1;
            s[ch].vals.push(v);
            if (v > s[ch].max) s[ch].max = v;
            if (v < s[ch].min) s[ch].min = v;
          }
        }
      }
      const statRows = [];
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
            data_count: d.count
          });
        }
      }
      for (let i = 0; i < statRows.length; i += 500) {
        await fetch(`${SB}/rest/v1/daily_stats`, {
          method: "POST",
          headers: { ...SH, Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify(statRows.slice(i, i + 500))
        });
      }
      const dm = file.name.match(/(\d{4}-\d{2}-\d{2})/);
      await fetch(`${SB}/rest/v1/upload_history`, { method: "POST", headers: SH, body: JSON.stringify({ site_id: siteId, source: "manual", file_name: file.name, date_range_start: dm?.[1] ?? null, date_range_end: dm?.[1] ?? null, records_inserted: inserted, status: "success" }) });
      return new Response(JSON.stringify({ ok: true, site_number: sn, site_id: siteId, records_inserted: inserted, is_new_site: isNew }), { headers: { ...cors, "Content-Type": "application/json" } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
  }
};
export {
  index_default as default
};

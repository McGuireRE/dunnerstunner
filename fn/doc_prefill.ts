// Reads the documents Tim drops in (title, LIM, property summary, CRM export, etc.) and suggests
// values for the agency agreement. Suggestions only: Tim reviews and ticks each one before it's used.
// Agent only. Needs the ANTHROPIC_API_KEY secret, which Tim adds himself in Supabase.
import { admin, cors, json } from "./shared.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { unzipSync, strFromU8 } from "npm:fflate@0.8.2";
import * as XLSX from "npm:xlsx@0.18.5";

import { FIELD_KEYS, MAX_TOTAL, MODEL, SYSTEM, TOOL } from "./prefill_shared.ts";

function b64(bytes: Uint8Array) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
export function docxText(bytes: Uint8Array) {
  const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  const xml = strFromU8(files["word/document.xml"] || new Uint8Array());
  return xml.replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, "\t").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
}
export function sheetText(bytes: Uint8Array) {
  const wb = XLSX.read(bytes, { type: "array" });
  return wb.SheetNames.map((n) => `Sheet: ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join("\n\n").slice(0, 400000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    if (!(await userClient.rpc("is_agent")).data) return json({ error: "Not allowed" }, 403);
    const key = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
    if (!key) return json({ error: "not_set_up", message: "Document reading isn't switched on yet." }, 503);

    const body = await req.json();
    const files: { path: string; name: string }[] = (body.files || []).slice(0, 12);
    if (!files.length) return json({ error: "No documents" }, 400);
    if (files.some((f) => !/^imports\/[0-9a-f-]{36}\/[^/]+$/.test(f.path))) return json({ error: "Bad file" }, 400);

    const db = admin();
    const content: any[] = [];
    const skipped: string[] = [];
    let total = 0;
    for (const f of files) {
      const { data, error } = await db.storage.from("private").download(f.path);
      if (error || !data) { skipped.push(`${f.name} (couldn't open)`); continue; }
      const bytes = new Uint8Array(await data.arrayBuffer());
      total += bytes.length; if (total > MAX_TOTAL) { skipped.push(`${f.name} (too large all together)`); continue; }
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      content.push({ type: "text", text: `File: ${f.name}` });
      if (ext === "pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(bytes) } });
      else if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) content.push({ type: "image", source: { type: "base64", media_type: ext === "jpg" ? "image/jpeg" : `image/${ext}`, data: b64(bytes) } });
      else if (ext === "docx") content.push({ type: "text", text: docxText(bytes).slice(0, 400000) });
      else if (["xlsx", "xls", "ods"].includes(ext)) content.push({ type: "text", text: sheetText(bytes) });
      else if (["csv", "txt", "vcf", "tsv"].includes(ext)) content.push({ type: "text", text: new TextDecoder().decode(bytes).slice(0, 400000) });
      else { content.pop(); skipped.push(`${f.name} (this type of file can't be read: use PDF, Word .docx, Excel, CSV or a photo)`); }
    }
    if (!content.length) return json({ error: "None of the documents could be read.", skipped }, 400);
    content.push({ type: "text", text: `Current form values, for comparison (may be blank): ${JSON.stringify(body.current || {}).slice(0, 4000)}\n\nRecord what these documents say for the agency agreement.` });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, system: SYSTEM, tools: [TOOL], tool_choice: { type: "tool", name: "fill_agreement" }, messages: [{ role: "user", content }] }),
    });
    const out = await r.json();
    if (!r.ok) {
      const msg = String(out?.error?.message || r.status);
      const friendly = r.status === 401 ? "The AI key isn't valid. Check the key in Supabase." : /credit|billing/i.test(msg) ? "The AI account is out of credit. Top it up in the Anthropic console." : msg;
      await db.from("ai_calls").insert({ purpose: "agreement prefill", model: MODEL, ok: false, error: msg, files: files.length, agent: "agent" });
      return json({ error: friendly }, 502);
    }
    const use = (out.content || []).find((c: any) => c.type === "tool_use");
    const usage = out.usage || {};
    await db.from("ai_calls").insert({ purpose: "agreement prefill", model: MODEL, ok: true, input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0, files: files.length, agreement_id: body.agreement_id || null, agent: "agent" });
    const res = use?.input || { documents: [], people: [], fields: [], flags: [] };
    res.fields = (res.fields || []).filter((f: any) => FIELD_KEYS.includes(f.key) && String(f.value ?? "").trim());
    return json({ ok: true, result: res, skipped, usage: { input: usage.input_tokens, output: usage.output_tokens } });
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

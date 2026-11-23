// Reads the documents Tim drops in (title, LIM, property summary, CRM export, etc.) and suggests
// values for the agency agreement. Suggestions only: Tim reviews and ticks each one before it's used.
// Agent only, except mode "offer_condition" (offers phase 1): a buyer on a property's offer form asks for help wording their own
// condition. That mode needs the property's live offer link token, and the database's rate limits and daily cap
// (offer_public_ai_claim, migration 018) before any model call; the result is a draft Tim approves. Because buyers have no
// account, this function is deployed with the gateway's JWT verification OFF; every other mode still checks is_agent() with the
// caller's own token, as before. Needs the ANTHROPIC_API_KEY secret, which Tim adds himself in Supabase.
import { admin, cors, json } from "./shared.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { unzipSync, strFromU8 } from "npm:fflate@0.8.2";
import * as XLSX from "npm:xlsx@0.18.5";

import { FIELD_KEYS, MAX_TOTAL, MODEL, SYSTEM, TOOL, TRANSLATE_KINDS, buildTranslateRequest, readTranslateResult } from "./prefill_shared.ts";
import { makeDraft, netOf } from "./offer_public_handler.ts";

const anthropic = async (key: string, request: unknown) => {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal: ctl.signal, headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify(request) });
    return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
  } finally { clearTimeout(t); }
};
// the buyer's condition helper (offers phase 1)
const offerDraft = makeDraft({
  rpc: async (fn, args) => { const { data, error } = await admin().rpc(fn, args); return { data, error: error ? { message: error.message } : null }; },
  aiKey: () => (Deno.env.get("ANTHROPIC_API_KEY") || "").trim(),
  callModel: (request) => anthropic((Deno.env.get("ANTHROPIC_API_KEY") || "").trim(), request),
  logAi: async (row) => { await admin().from("ai_calls").insert({ ...row, files: 0, agent: "buyer form" }); },
});

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
    // a buyer on the offer form: read the body first (capped), and never reach the agent-only modes below
    const raw = await req.text();
    let body: any = null; try { body = JSON.parse(raw); } catch (_) { body = null; }
    if (body && body.mode === "offer_condition") {
      if (raw.length > 4000) return json({ ok: false, error: "That is more than the helper can take." }, 413);
      const r = await offerDraft(body, netOf(req));
      return json(r.body, r.status);
    }
    if (!body || typeof body !== "object") return json({ error: "Bad request" }, 400);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    if (!(await userClient.rpc("is_agent")).data) return json({ error: "Not allowed" }, 403);
    const key = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
    if (!key) return json({ error: "not_set_up", message: "Document reading isn't switched on yet." }, 503);


    // Translation mode (phase 4): same agent-only check, same key, same ai_calls log. The strings are data.
    if (body.mode === "translate") {
      const kind = String(body.kind || ""), lang = String(body.lang || "");
      const sources: string[] = Array.isArray(body.sources) ? body.sources : [];
      let request;
      try { request = buildTranslateRequest(kind, lang, sources); } catch (e: any) { return json({ error: String(e?.message || e) }, 400); }
      const purpose = TRANSLATE_KINDS[kind].purpose;
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify(request) });
      const out = await r.json();
      const dbT = admin();
      if (!r.ok) {
        const msg = String(out?.error?.message || r.status);
        await dbT.from("ai_calls").insert({ purpose, model: request.model, ok: false, error: msg, files: 0, agent: "agent" });
        return json({ error: r.status === 401 ? "The AI key isn't valid. Check the key in Supabase." : /credit|billing/i.test(msg) ? "The AI account is out of credit. Top it up in the Anthropic console." : msg }, 502);
      }
      const usage = out.usage || {};
      const cutOff = out.stop_reason === "max_tokens";   // the reply ran out of room part way
      await dbT.from("ai_calls").insert({ purpose, model: request.model, ok: true, error: cutOff ? "max_tokens" : null, input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0, files: 0, agent: "agent" });
      const res = readTranslateResult(sources, out);
      if (cutOff) res.rejected = res.rejected.map((x) => (x.reason === "missing" ? { source: x.source, reason: "cut off" } : x));
      return json({ ok: true, model: request.model, cut_off: cutOff, translations: res.ok, rejected: res.rejected, usage: { input: usage.input_tokens, output: usage.output_tokens } });
    }

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

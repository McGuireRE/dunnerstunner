// The offer-draft edge function's request handling (fn/offer_draft.ts is the deployed entry). Offers phase 2. Tim only: every
// action first asks the database, with the caller's own token, whether they are the agent (is_agent). Two actions:
//   read_pack:      the AI reads part of an agreement pack (the text of up to 8 pages, as Tim's screen read it with pdf.js) and
//                   proposes the chattels list, places to initial, sign or acknowledge, and anything unusual. The answer is kept in
//                   offer_blank_reads and shown to Tim, who ticks, moves or deletes each proposal. Nothing is used until he does.
//   confirm_file:   works out the SHA-256 and size of a blank or draft Tim has just uploaded, from the stored file itself (service
//                   role), and records them (offer_file_confirm). The database accepts a blank or draft only with a matching fingerprint.
//   lawyer_lookup:  finds the purchaser's lawyer's public work email and phone (the firm's own website, the Law Society) with the
//                   Anthropic web search tool, each value with its source page. Only values from pages the search returned are kept;
//                   with no direct dial or mobile, the firm's main line. Kept in offer_lawyer_lookups for Tim's tick. Always returns
//                   links Tim can use himself, so it is a clear manual step when search isn't available.
// The model calls and their ai_calls rows use prefill_shared.ts (Haiku, reading). The pack's text and web pages are data, never
// instructions. Tested by onboarding/tests/offer-draft-fn.test.js with fakes, so no test calls a model or the database.
import { buildLawyerLookupRequest, buildPackReadRequest, checkPackPages, LAWYER_LOOKUP_PURPOSE, lawyerManualLinks, MODEL_READ, PACK_READ_PURPOSE, readLawyerLookupResult, readPackReadResult } from "./prefill_shared.ts";

export const MAX_BODY = 200000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE_RE = /^properties\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/docs\/[A-Za-z0-9._-]{1,200}$/;
export const MAX_CONTINUE = 3;   // a lookup that pauses (pause_turn) is continued this many times at most
type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>;
type Deps = {
  cors: Record<string, string>;
  whoIsAgent: (authorization: string) => Promise<string | null>;   // the agent's email when the caller is Tim, otherwise null
  rpc: Rpc;                                                         // offer_ai_read_save, offer_lawyer_save and offer_file_confirm, with the service role
  download: (path: string) => Promise<Uint8Array | null>;           // a file from the property-files bucket, with the service role
  aiKey: () => string;
  callModel: (request: any, ms?: number) => Promise<{ ok: boolean; status: number; body: any }>;
  logAi: (row: { purpose: string; model: string; ok: boolean; error: string | null; input_tokens: number; output_tokens: number }, agent: string) => Promise<void>;
};

export function makeHandler(d: Deps) {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: Object.assign({ "Content-Type": "application/json", "Cache-Control": "no-store" }, d.cors) });
  const friendly = (status: number, msg: string) => status === 401 ? "The AI key isn't valid. Check the key in Supabase." : /credit|billing/i.test(msg) ? "The AI account is out of credit. Top it up in the Anthropic console." : "The AI didn't answer. Try again in a minute.";
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: d.cors });
    if (req.method !== "POST") return json({ error: "Not allowed" }, 405);
    const auth = req.headers.get("Authorization") || "";
    if (!/^Bearer\s+\S+/.test(auth)) return json({ error: "Sign in first" }, 401);
    let text = ""; try { text = await req.text(); } catch (_) { return json({ error: "Bad request" }, 400); }
    if (text.length > MAX_BODY) return json({ error: "That is more than can be read at once." }, 413);
    let body: any = null; try { body = JSON.parse(text); } catch (_) { body = null; }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Bad request" }, 400);
    const action = String(body.action || "");
    if (!["read_pack", "lawyer_lookup", "confirm_file"].includes(action)) return json({ error: "Bad request" }, 400);
    let agent: string | null = null;
    try { agent = await d.whoIsAgent(auth); } catch (_) { agent = null; }
    if (!agent) return json({ error: "Only Tim can do this" }, 403);
    const key = d.aiKey();

    if (action === "confirm_file") {
      const path = typeof body.path === "string" ? body.path : "";
      if (!FILE_RE.test(path) || path.includes("..")) return json({ error: "Bad request" }, 400);
      let bytes: Uint8Array | null = null; try { bytes = await d.download(path); } catch (_) { bytes = null; }
      if (!bytes || !bytes.length) return json({ ok: false, error: "The file isn't in storage yet. Try again." }, 404);
      const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), sha = Array.from(h, (x) => x.toString(16).padStart(2, "0")).join("");
      const r = await d.rpc("offer_file_confirm", { p_path: path, p_sha256: sha, p_size: bytes.length, p_actor: agent });
      if (r.error) return json({ ok: false, error: "The file's fingerprint couldn't be recorded." }, 409);
      return json({ ok: true, sha256: sha, size: bytes.length });
    }

    if (action === "read_pack") {
      const blank = String(body.blank_id || ""); if (!UUID.test(blank)) return json({ error: "Bad request" }, 400);
      let pages; try { pages = checkPackPages(body.pages, body.total_pages); } catch (e: any) { return json({ error: String(e?.message || e) }, 400); }
      if (!key) return json({ ok: false, reason: "off", message: "Document reading isn't switched on yet." });
      const request = buildPackReadRequest(pages, Number(body.total_pages));
      let r: { ok: boolean; status: number; body: any };
      try { r = await d.callModel(request, 40000); } catch (e: any) { r = { ok: false, status: 0, body: { error: { message: String(e?.message || e) } } }; }
      const usage = r.body?.usage || {}, err = r.ok ? null : String(r.body?.error?.message || r.status).slice(0, 300);
      await d.logAi({ purpose: PACK_READ_PURPOSE, model: MODEL_READ, ok: r.ok, error: err, input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0 }, agent).catch(() => null);
      if (!r.ok) return json({ ok: false, reason: "failed", message: friendly(r.status, err || "") });
      const res = readPackReadResult(r.body, pages);
      const saved = await d.rpc("offer_ai_read_save", { p_blank: blank, p_pages: pages.map((p) => p.page), p_model: MODEL_READ, p_ok: true, p_result: res, p_actor: agent });
      if (saved.error) return json({ ok: false, reason: "failed", message: "That blank isn't ready to be read." });
      return json({ ok: true, read_id: saved.data, pages: pages.map((p) => p.page), ...res });
    }

    // lawyer_lookup
    const offer = String(body.offer_id || ""); if (!UUID.test(offer)) return json({ error: "Bad request" }, 400);
    const firm = String(body.firm ?? "").slice(0, 200), person = String(body.person ?? "").slice(0, 200);
    const manual = lawyerManualLinks(firm, person);
    let request; try { request = buildLawyerLookupRequest(firm, person); } catch (e: any) { return json({ ok: false, reason: "need_name", message: String(e?.message || e), manual }); }
    if (!key) return json({ ok: false, reason: "off", message: "The lookup isn't switched on yet. Use the links to look the lawyer up yourself.", manual });
    // a long search can pause (stop_reason pause_turn): it is sent back to carry on, a few times at most, and every block kept
    let r: { ok: boolean; status: number; body: any } = { ok: false, status: 0, body: {} }; const content: any[] = [], paused: any[] = []; let turnReq: any = request;
    for (let turn = 0; turn <= MAX_CONTINUE; turn++) {
      try { r = await d.callModel(turnReq, 55000); } catch (e: any) { r = { ok: false, status: 0, body: { error: { message: String(e?.message || e) } } }; }
      const usage = r.body?.usage || {}, e1 = r.ok ? null : String(r.body?.error?.message || r.status).slice(0, 300);
      await d.logAi({ purpose: LAWYER_LOOKUP_PURPOSE, model: MODEL_READ, ok: r.ok, error: e1, input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0 }, agent).catch(() => null);
      if (!r.ok) break;
      content.push(...(r.body?.content || []));
      if (r.body?.stop_reason !== "pause_turn") break;
      // every paused reply so far, in order, as the assistant's turn: the next continuation carries all the earlier searches
      paused.push(...(r.body.content || []));
      turnReq = Object.assign({}, request, { messages: request.messages.concat({ role: "assistant", content: paused.slice() }) });
    }
    const err = r.ok ? null : String(r.body?.error?.message || r.status).slice(0, 300);
    if (!r.ok) {
      const noSearch = /web.?search/i.test(err || "");
      await d.rpc("offer_lawyer_save", { p_offer: offer, p_firm: firm, p_person: person, p_model: MODEL_READ, p_ok: false, p_result: { reason: noSearch ? "no_search" : "failed", error: err, manual }, p_actor: agent }).catch(() => null);
      return json({ ok: false, reason: noSearch ? "no_search" : "failed", message: noSearch ? "Web search isn't switched on for the AI account. Use the links to look the lawyer up yourself." : friendly(r.status, err || ""), manual });
    }
    const res = readLawyerLookupResult({ content });
    const saved = await d.rpc("offer_lawyer_save", { p_offer: offer, p_firm: firm, p_person: person, p_model: MODEL_READ, p_ok: true, p_result: { ...res, manual }, p_actor: agent });
    if (saved.error) return json({ ok: false, reason: "failed", message: "That offer couldn't be found.", manual });
    return json({ ok: true, lookup_id: saved.data, values: res.values, fallback: res.fallback, dropped: res.dropped, note: res.note, manual });
  };
}

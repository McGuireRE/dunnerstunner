// The offer-public edge function's request handling (fn/offer_public.ts is the deployed entry). This is the only door for buyers,
// who have no account: they never reach a table or a database function themselves. Three actions, each needing the property's
// own link token:
//   info:   the property's address and whether offers are open (plus the holiday province, the KiwiSaver warning setting, Tim's
//           own clause wording, and the chattels list Tim typed for the property). Unknown, switched-off and wrong-stage links all answer {ok: false}.
//   submit: one offer. The database (offer_public_submit, migration 018) checks the link, the rate limits and every field, and
//           writes only the offer row. Tim is then emailed (never the buyer, never the vendors).
//   draft:  help wording the buyer's own condition (makeDraft below): the model call and its ai_calls log are prefill_shared.ts's
//           (Sonnet), only on a live link and within the rate limits and the daily cap (offer_public_ai_claim), failing soft (the
//           buyer types their own wording). Its body is capped at 4,000 characters before it is read.
// Everything the caller sends is data. Tested by onboarding/tests/offer-public-fn.test.js with fakes for the database, the model and
// email, so no test ever sends email or calls a model.
import { buildOfferConditionRequest, MODEL_DRAFT, noToolError, OFFER_CONDITION_PURPOSE, readOfferConditionResult } from "./prefill_shared.ts";

export const MAX_BODY = 80000;
export const MAX_DRAFT_BODY = 4000;
export const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>;
type Deps = {
  cors: Record<string, string> | ((req: Request) => Record<string, string>);   // a function: the headers for each request (corsFor)
  rpc: Rpc;                                                        // the offer_public_* functions, with the service role
  notifyTim: (offerId: string) => Promise<void>;                   // the email to Tim (throws on failure)
  draft?: (body: any, net: string) => Promise<{ status: number; body: any }>;   // makeDraft(...), for action "draft"
};
type DraftDeps = {
  rpc: Rpc;
  aiKey: () => string;                                             // the ANTHROPIC_API_KEY secret, '' when not set
  callModel: (request: any) => Promise<{ ok: boolean; status: number; body: any }>;
  logAi: (row: { purpose: string; model: string; ok: boolean; error: string | null; input_tokens: number; output_tokens: number }) => Promise<void>;
};

// the caller's network address: Cloudflare's CF-Connecting-IP when present (set by the edge, not the caller), otherwise the LAST
// entry of X-Forwarded-For (added by the platform's own proxy). Earlier entries can be typed by the caller, so they are never used.
// Check after deploy (OFFERS-PLAN.md): a request with a made-up X-Forwarded-For must record the real network.
export function netOf(req: Request): string {
  const cf = (req.headers.get("cf-connecting-ip") || "").trim();
  if (cf) return cf.slice(0, 100);
  const parts = (req.headers.get("x-forwarded-for") || "").split(",").map((x) => x.trim()).filter(Boolean);
  const last = parts.length ? parts[parts.length - 1] : "";
  return (last || (req.headers.get("x-real-ip") || "").trim() || "unknown").slice(0, 100);
}
const REASONS = ["busy_network", "busy_property", "busy_site", "closed"];

export function makeHandler(d: Deps) {
  const staticCors: Record<string, string> = typeof d.cors === "function" ? {} : d.cors;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: Object.assign({ "Content-Type": "application/json", "Cache-Control": "no-store" }, staticCors) });
  // a refusal from the database is a plain message for the buyer; anything else stays hidden
  const plain = (m: string) => /^(Please|Up to|That is more|The date for|Nothing was sent)/.test(m) ? m.slice(0, 200) : "Something went wrong. Please try again, or call Tim on 027 562 7207.";
  const handle = async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: staticCors });
    if (req.method !== "POST") return json({ error: "Not allowed" }, 405);
    let text = "";
    try { text = await req.text(); } catch (_) { return json({ error: "Bad request" }, 400); }
    if (text.length > MAX_BODY) return json({ ok: false, error: "That is more than the form can take." }, 413);
    // the draft helper takes far less: cap it before reading anything
    if (/"action"\s*:\s*"draft"/.test(text.slice(0, 200)) && text.length > MAX_DRAFT_BODY) return json({ ok: false, error: "That is more than the helper can take." }, 413);
    let body: any = null; try { body = JSON.parse(text); } catch (_) { body = null; }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Bad request" }, 400);
    const action = String(body.action || ""), token = typeof body.token === "string" ? body.token : "";
    if (!["info", "submit", "draft"].includes(action)) return json({ error: "Bad request" }, 400);
    if (action === "draft") {
      if (text.length > MAX_DRAFT_BODY) return json({ ok: false, error: "That is more than the helper can take." }, 413);
      if (!d.draft) return json({ ok: false, reason: "off" });
      const r = await d.draft(body, netOf(req)); return json(r.body, r.status);
    }
    if (!TOKEN_RE.test(token)) return json({ ok: false });   // not a token at all: nothing asked
    const net = netOf(req);

    if (action === "info") {
      const { data, error } = await d.rpc("offer_public_info", { p_token: token, p_net: net });
      if (error || !data || data.ok !== true) return json({ ok: false, reason: data?.reason === "busy_network" ? "busy_network" : undefined });
      return json({ ok: true, open: true, address: String(data.address || ""), province: String(data.province || "otago"), ks_days: +data.ks_days || 15, wording: data.wording && typeof data.wording === "object" ? data.wording : {}, chattels: Array.isArray(data.chattels) ? data.chattels.filter((x: unknown) => typeof x === "string").slice(0, 60) : [] });
    }

    if (action === "submit") {
      // the hidden field filled (often a form-filling robot, sometimes a browser's autofill): the offer is kept, flagged for Tim's
      // "Possible spam" fold, and nobody is emailed. The buyer is told it was received, because it was.
      const spam = typeof body.website === "string" && body.website.trim() !== "";
      if (!body.offer || typeof body.offer !== "object" || Array.isArray(body.offer)) return json({ ok: false, error: "Nothing was sent." }, 400);
      const { data, error } = await d.rpc("offer_public_submit", { p_token: token, p_offer: body.offer, p_net: net, p_spam: spam });
      if (error) return json({ ok: false, error: plain(error.message || "") }, 400);
      if (!data || data.ok !== true) return json({ ok: false, reason: REASONS.includes(data?.reason) ? data.reason : "closed" });
      if (!spam) {
        let notifyError: string | null = null;
        try { await d.notifyTim(String(data.id)); } catch (e: any) { notifyError = String(e?.message || e).slice(0, 300); }
        try { await d.rpc("offer_public_notified", { p_offer: data.id, p_error: notifyError }); } catch (_) { /* the Offers tile still shows it */ }
      }
      return json({ ok: true, ref: String(data.ref || "") });   // never the offer's id
    }

    return json({ error: "Bad request" }, 400);
  };
  // per request: the caller's own site when it is the onboarding app or the portal (corsFor), otherwise the fixed headers
  return async (req: Request): Promise<Response> => {
    const res = await handle(req);
    if (typeof d.cors === "function") { const h = d.cors(req); for (const k of Object.keys(h)) res.headers.set(k, h[k]); }
    return res;
  };
}

// Help wording a custom condition: { token, text } in, { status, body } out. Fails soft whenever help isn't available.
export function makeDraft(d: DraftDeps) {
  return async (body: any, net: string): Promise<{ status: number; body: any }> => {
    const json = (b: unknown, status = 200) => ({ status, body: b });
    const token = body && typeof body.token === "string" ? body.token : "";
    if (!TOKEN_RE.test(token)) return json({ ok: false, reason: "closed" });
    const key = d.aiKey();
    if (!key) return json({ ok: false, reason: "off" });
    let request: any;
    try { request = buildOfferConditionRequest(String(body.text ?? "")); } catch (e: any) { return json({ ok: false, error: String(e?.message || e) }, 400); }
    const claim = await d.rpc("offer_public_ai_claim", { p_token: token, p_net: net });
    if (claim.error || !claim.data || claim.data.ok !== true) return json({ ok: false, reason: ["busy", "cap", "closed"].includes(claim.data?.reason) ? claim.data.reason : "off" });
    let r: { ok: boolean; status: number; body: any };
    try { r = await d.callModel(request); } catch (e: any) { r = { ok: false, status: 0, body: { error: { message: String(e?.message || e) } } }; }
    const usage = r.body?.usage || {};
    // a reply in text only (no tool answer) is logged as not ok, and the buyer is told plainly
    const res = r.ok ? readOfferConditionResult(r.body) : null, noTool = !!res?.noTool;
    await d.logAi({ purpose: OFFER_CONDITION_PURPOSE, model: MODEL_DRAFT, ok: r.ok && !noTool, error: noTool ? noToolError(r.body) : r.ok ? null : String(r.body?.error?.message || r.status).slice(0, 300), input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0 }).catch(() => null);
    if (!r.ok || !res) return json({ ok: false, reason: "failed" });
    if (noTool) return json({ ok: false, reason: "no_answer", error: res.why });
    if (!res.ok) return json({ ok: false, reason: "unsuitable", why: res.why });
    return json({ ok: true, draft: true, wording: res.wording, summary: res.summary });
  };
}

// The offer-public edge function's request handling (fn/offer_public.ts is the deployed entry). This is the only door for buyers,
// who have no account: they never reach a table or a database function themselves. Three actions, each needing the property's
// own link token:
//   info:   the property's address and whether offers are open (plus the holiday province, the KiwiSaver warning setting, Tim's
//           own clause wording, and the chattels list Tim typed for the property). Unknown, switched-off and wrong-stage links all answer {ok: false}.
//   submit: one offer. The database (offer_public_submit, migration 018) checks the link, the rate limits and every field, and
//           writes only the offer row. Tim is then emailed (never the buyer, never the vendors).
// Help wording the buyer's own condition is makeDraft below. It is served by doc-prefill (fn/doc_prefill.ts, mode
// "offer_condition"), because every model call goes through doc_prefill.ts and prefill_shared.ts: Sonnet, only on a live link and
// within the rate limits and the daily cap (offer_public_ai_claim), logged in ai_calls, and failing soft (the buyer types their
// own wording). Everything the caller sends is data. Tested by onboarding/tests/offer-public-fn.test.js with fakes for the database, the model and
// email, so no test ever sends email or calls a model.
import { buildOfferConditionRequest, MODEL_DRAFT, OFFER_CONDITION_PURPOSE, readOfferConditionResult } from "./prefill_shared.ts";

export const MAX_BODY = 80000;
export const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>;
type Deps = {
  cors: Record<string, string>;
  rpc: Rpc;                                                        // the offer_public_* functions, with the service role
  notifyTim: (offerId: string) => Promise<void>;                   // the email to Tim (throws on failure)
};
type DraftDeps = {
  rpc: Rpc;
  aiKey: () => string;                                             // the ANTHROPIC_API_KEY secret, '' when not set
  callModel: (request: any) => Promise<{ ok: boolean; status: number; body: any }>;
  logAi: (row: { purpose: string; model: string; ok: boolean; error: string | null; input_tokens: number; output_tokens: number }) => Promise<void>;
};

// the caller's network address, as the platform's proxy reports it (the first address in X-Forwarded-For)
export function netOf(req: Request): string {
  const xf = req.headers.get("x-forwarded-for") || "";
  const first = xf.split(",")[0].trim();
  return (first || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown").slice(0, 100);
}

export function makeHandler(d: Deps) {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: Object.assign({ "Content-Type": "application/json", "Cache-Control": "no-store" }, d.cors) });
  // a refusal from the database is a plain message for the buyer; anything else stays hidden
  const plain = (m: string) => /^(Please|Up to|That is more|The date for|Nothing was sent)/.test(m) ? m.slice(0, 200) : "Something went wrong. Please try again, or call Tim on 027 562 7207.";
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: d.cors });
    if (req.method !== "POST") return json({ error: "Not allowed" }, 405);
    let text = "";
    try { text = await req.text(); } catch (_) { return json({ error: "Bad request" }, 400); }
    if (text.length > MAX_BODY) return json({ ok: false, error: "That is more than the form can take." }, 413);
    let body: any = null; try { body = JSON.parse(text); } catch (_) { body = null; }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Bad request" }, 400);
    const action = String(body.action || ""), token = typeof body.token === "string" ? body.token : "";
    if (!["info", "submit"].includes(action)) return json({ error: "Bad request" }, 400);
    if (!TOKEN_RE.test(token)) return json({ ok: false });   // not a token at all: nothing asked
    const net = netOf(req);

    if (action === "info") {
      const { data, error } = await d.rpc("offer_public_info", { p_token: token, p_net: net });
      if (error || !data || data.ok !== true) return json({ ok: false, reason: data?.reason === "busy" ? "busy" : undefined });
      return json({ ok: true, open: true, address: String(data.address || ""), province: String(data.province || "otago"), ks_days: +data.ks_days || 15, wording: data.wording && typeof data.wording === "object" ? data.wording : {}, chattels: Array.isArray(data.chattels) ? data.chattels.filter((x: unknown) => typeof x === "string").slice(0, 60) : [] });
    }

    if (action === "submit") {
      if (typeof body.website === "string" && body.website.trim()) return json({ ok: true, ref: "RECEIVED" });   // a form-filling robot: looks fine, nothing kept
      if (!body.offer || typeof body.offer !== "object" || Array.isArray(body.offer)) return json({ ok: false, error: "Nothing was sent." }, 400);
      const { data, error } = await d.rpc("offer_public_submit", { p_token: token, p_offer: body.offer, p_net: net });
      if (error) return json({ ok: false, error: plain(error.message || "") }, 400);
      if (!data || data.ok !== true) return json({ ok: false, reason: data?.reason === "busy" ? "busy" : "closed" });
      let notifyError: string | null = null;
      try { await d.notifyTim(String(data.id)); } catch (e: any) { notifyError = String(e?.message || e).slice(0, 300); }
      try { await d.rpc("offer_public_notified", { p_offer: data.id, p_error: notifyError }); } catch (_) { /* the Offers tile still shows it */ }
      return json({ ok: true, ref: String(data.ref || "") });   // never the offer's id
    }

    return json({ error: "Bad request" }, 400);
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
    await d.logAi({ purpose: OFFER_CONDITION_PURPOSE, model: MODEL_DRAFT, ok: r.ok, error: r.ok ? null : String(r.body?.error?.message || r.status).slice(0, 300), input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0 }).catch(() => null);
    if (!r.ok) return json({ ok: false, reason: "failed" });
    const res = readOfferConditionResult(r.body);
    if (!res.ok) return json({ ok: false, reason: "unsuitable", why: res.why });
    return json({ ok: true, draft: true, wording: res.wording, summary: res.summary });
  };
}

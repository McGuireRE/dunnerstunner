// The offer-sign edge function (offers phase 3, migration 020): purchasers signing an offer Tim approved, by their own link, and
// Round 1 made and locked. The deployed entry; the request handling is in offer_sign_handler.ts (tested without a network, database
// or email). Deployed like the others: a tiny index.ts imports this file's raw GitHub URL pinned to a commit, as `offer-sign`, with
// the gateway's JWT verification OFF (purchasers have no account; every purchaser action needs their link's token, and after the
// code check its session, checked by the database). Tim's two actions (send, lock) ask is_agent with his own token first, as
// offer-draft does. The database functions it calls can only be run by the service role. Email goes through shared.ts sendMail: the
// links and codes to each purchaser's own address, a note to Tim when a purchaser asks for a change, and to Tim when Round 1 locks.
// Codes are emailed as their own message; there is no text-message provider yet (see OFFERS-PLAN.md, phase 3 questions).
// Round 1 is drawn with pdf-lib and the same signing core the browser uses (onboarding/src/sign-core.js, at the same commit).
import { admin, APP_URL, cors, sendMail, TIM_EMAIL } from "./shared.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import * as PDFLib from "npm:pdf-lib@1.17.1";
import "../onboarding/src/sign-core.js";
import { makeHandler } from "./offer_sign_handler.ts";
import { netOf } from "./offer_public_handler.ts";

const SIGN = (globalThis as any).SIGN;
Deno.serve(makeHandler({
  cors,
  appUrl: APP_URL,
  timEmail: TIM_EMAIL,
  whoIsAgent: async (authorization) => {
    const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: u, error: ue } = await uc.auth.getUser();
    if (ue || !u?.user) return null;
    const { data } = await uc.rpc("is_agent");
    return data === true ? String(u.user.email || "agent") : null;
  },
  rpc: async (fn, args) => { const { data, error } = await admin().rpc(fn, args); return { data, error: error ? { message: error.message } : null }; },
  signedUrl: async (path) => { const { data, error } = await admin().storage.from("property-files").createSignedUrl(path, 600); return error || !data ? null : data.signedUrl; },
  download: async (path) => { const { data, error } = await admin().storage.from("property-files").download(path); return error || !data ? null : new Uint8Array(await data.arrayBuffer()); },
  upload: async (path, bytes) => { const { error } = await admin().storage.from("property-files").upload(path, new Blob([bytes], { type: "application/pdf" }), { contentType: "application/pdf", upsert: false });
    return error ? { ok: false, exists: /exists/i.test(error.message || "") } : { ok: true }; },
  sendMail: (kind, msg) => sendMail(admin(), null, kind, msg),
  renderRound: (draft, m) => SIGN.renderRound(PDFLib, draft, m),
  net: netOf,
}));

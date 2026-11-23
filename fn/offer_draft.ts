// The offer-draft edge function (offers phase 2): the AI reading of an agreement pack, and the purchaser's lawyer lookup. Tim only.
// The deployed entry; the request handling is in offer_draft_handler.ts (tested without a network, database or model).
// Deployed like the others: a tiny index.ts imports this file's raw GitHub URL pinned to a commit, as `offer-draft`, with the
// gateway's JWT verification ON (every caller must be signed in). The handler then asks is_agent with the caller's own token, so a
// signed-in vendor is refused. Its database writes (offer_ai_read_save, offer_lawyer_save) need the service role. The model calls go
// through prefill_shared.ts and are logged in ai_calls. Needs the ANTHROPIC_API_KEY secret (already set by Tim for doc-prefill);
// the lawyer lookup also needs web search switched on for that Anthropic account (Tim, in the Anthropic console), and otherwise
// gives Tim the links to look the lawyer up himself.
import { admin, cors } from "./shared.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { makeHandler } from "./offer_draft_handler.ts";
import { callAnthropic, logAiCall } from "./prefill_shared.ts";

Deno.serve(makeHandler({
  cors,
  whoIsAgent: async (authorization) => {
    const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: u, error: ue } = await uc.auth.getUser();
    if (ue || !u?.user) return null;
    const { data } = await uc.rpc("is_agent");
    return data === true ? String(u.user.email || "agent") : null;
  },
  rpc: async (fn, args) => { const { data, error } = await admin().rpc(fn, args); return { data, error: error ? { message: error.message } : null }; },
  aiKey: () => (Deno.env.get("ANTHROPIC_API_KEY") || "").trim(),
  callModel: (request, ms) => callAnthropic((Deno.env.get("ANTHROPIC_API_KEY") || "").trim(), request, ms),
  logAi: (row, agent) => logAiCall(admin(), row, agent),
}));

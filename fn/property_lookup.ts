// Public council records for a property (Tim, 18 November 2026): the deployed entry. The request handling is in
// property_lookup_handler.ts and the lookup itself in property_lookup_core.ts (both tested without a network or database).
// Agent only, except the keyless health check. Nothing here writes to a property: Tim ticks values on the page and
// agent_council_accept (migration 013) takes them from the saved lookup.
// Deployed like doc_prefill: a tiny index.ts imports this file's raw GitHub URL pinned to a commit, and the relative imports below
// then load the siblings from that same commit. Deploy with JWT verification off for the gateway (the function checks the agent
// itself), or the keyless health check can't be reached.
import { admin, cors } from "./shared.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { makeHandler } from "./property_lookup_handler.ts";

Deno.serve(makeHandler({
  cors,
  fetch,
  agent: async (authorization) => {
    if (!authorization) return null;
    const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } } });
    const { data: isAgent } = await uc.rpc("is_agent");
    if (!isAgent) return null;
    const { data } = await uc.auth.getUser();
    return data?.user?.email || "agent";
  },
  propertyExists: async (id) => { const { data } = await admin().from("properties").select("id").eq("id", id).maybeSingle(); return !!data; },
  recent: async (askedNorm, sinceIso) => {
    const { data } = await admin().from("council_lookups").select("id, created_at, status, property_id, result").eq("asked_norm", askedNorm).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(20);
    return data || [];
  },
  save: async (row) => { const { data, error } = await admin().from("council_lookups").insert(row).select("id, created_at").single(); return error ? null : data; },
}));

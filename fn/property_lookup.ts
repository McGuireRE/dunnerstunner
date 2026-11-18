// Public council records for a property (Tim, 18 November 2026). Agent only, except the keyless health check.
//   POST { mode: "suggest", text }                                   address suggestions from the ORC locator
//   POST { mode: "lookup", address, magicKey?, property_id? }        the lookup; saved to council_lookups (the cache and audit)
//   GET  ?health=1                                                   whether each upstream host answers; no property data, no writes
// Nothing here writes to a property: Tim ticks values on the page and agent_council_accept (migration 013) takes them from the
// saved lookup. Deployed like doc_prefill: a tiny index.ts imports this file's raw GitHub URL pinned to a commit, and the
// relative imports below then load the siblings from that same commit. Deploy with JWT verification off for the gateway (the
// function checks the agent itself), or the keyless health check can't be reached.
import { admin, cors, json } from "./shared.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { health, lookup, suggest } from "./property_lookup_core.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    if (req.method === "GET" && url.searchParams.get("health") === "1") return json(await health({ fetch }));
    if (req.method !== "POST") return json({ error: "Not allowed" }, 405);

    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    if (!(await userClient.rpc("is_agent")).data) return json({ error: "Not allowed" }, 403);

    const body = await req.json().catch(() => ({}));
    if (body.mode === "suggest") return json(await suggest(String(body.text || ""), { fetch }));
    if (body.mode !== "lookup") return json({ error: "Unknown request" }, 400);

    const address = String(body.address || "").replace(/\s+/g, " ").trim();
    if (address.length < 3 || address.length > 300) return json({ error: "Add the address" }, 400);
    const magicKey = body.magicKey ? String(body.magicKey).slice(0, 400) : undefined;
    const pid = body.property_id ? String(body.property_id) : null;
    if (pid && !UUID.test(pid)) return json({ error: "Bad property" }, 400);

    const db = admin();
    if (pid) { const { data } = await db.from("properties").select("id").eq("id", pid).maybeSingle(); if (!data) return json({ error: "Property not found" }, 404); }

    const result = await lookup({ address, magicKey }, { fetch, timeoutMs: 5000 });
    const { data: u } = await userClient.auth.getUser();
    const row = {
      property_id: pid, asked: address, matched_address: (result as any).matched_address || null, council: (result as any).council || null,
      status: result.status, result, created_by: u?.user?.email || "agent",
    };
    const { data: saved, error } = await db.from("council_lookups").insert(row).select("id, created_at").single();
    if (error) return json({ ok: true, saved: false, error: "Not saved: " + error.message, result }, 200);
    return json({ ok: true, saved: true, lookup_id: saved.id, created_at: saved.created_at, result });
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

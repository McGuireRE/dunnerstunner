// The request handling for fn/property_lookup.ts, kept free of Deno and npm imports so tests run it with fakes.
//   GET  ?health=1      whether each upstream host answers (cached for a minute, so repeated anonymous calls can't hammer
//                       the councils); no property data, no database writes
//   POST, agent only:  { mode: "suggest", text }
//                       { mode: "lookup", address, magicKey?, candidate?, unit_ref?, property_id?, fresh? }
// A lookup reuses a stored one for the same address (and the same choice of address and unit) less than 30 days old, unless Tim
// asks to look again (fresh). However asked, the same address is fetched from the councils at most once a minute: a repeat within
// the minute gets the stored answer. Every fresh lookup is saved, so the page and agent_council_accept work from what was stored.
import { health, lookup, suggest } from "./property_lookup_core.ts";

export type Stored = { id: string; created_at: string; status: string; property_id: string | null; result: any };
export type HandlerDeps = {
  cors: Record<string, string>;
  agent: (authorization: string) => Promise<string | null>;          // the agent's email, or null when not an agent
  propertyExists: (id: string) => Promise<boolean>;
  recent: (askedNorm: string, sinceIso: string) => Promise<Stored[]>; // newest first
  save: (row: Record<string, unknown>) => Promise<{ id: string; created_at: string } | null>;
  fetch: (url: string, init?: any) => Promise<any>;
  now?: () => number;
};

export const REUSE_DAYS = 30;
export const REPEAT_MS = 60_000;
export const HEALTH_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const norm = (t: unknown) => String(t ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// statuses that mean the councils answered (a slow or unavailable answer is not held against a retry)
const ANSWERED = ["ok", "weak", "choose", "choose_unit", "not_found"];

let healthCache: { at: number; body: any } | null = null;
export function resetHealthCache() { healthCache = null; }

export function makeHandler(d: HandlerDeps) {
  const now = () => (d.now ? d.now() : Date.now());
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...d.cors, "Content-Type": "application/json" } });
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: d.cors });
    try {
      const url = new URL(req.url);
      if (req.method === "GET" && url.searchParams.get("health") === "1") {
        if (!healthCache || now() - healthCache.at > HEALTH_MS) healthCache = { at: now(), body: await health({ fetch: d.fetch }) };
        return json(Object.assign({}, healthCache.body, { checked_at: new Date(healthCache.at).toISOString() }));
      }
      if (req.method !== "POST") return json({ error: "Not allowed" }, 405);
      const who = await d.agent(req.headers.get("Authorization") || "");
      if (!who) return json({ error: "Not allowed" }, 403);

      const body: any = await req.json().catch(() => ({}));
      if (body.mode === "suggest") return json(await suggest(String(body.text || ""), { fetch: d.fetch }));
      if (body.mode !== "lookup") return json({ error: "Unknown request" }, 400);

      const address = String(body.address || "").replace(/\s+/g, " ").trim();
      if (address.length < 3 || address.length > 300) return json({ error: "Add the address" }, 400);
      const magicKey = body.magicKey ? String(body.magicKey).slice(0, 400) : undefined;
      const candidate = Number.isInteger(body.candidate) && body.candidate >= 0 && body.candidate < 10 ? body.candidate : undefined;
      const unitRef = body.unit_ref ? String(body.unit_ref).slice(0, 40) : undefined;
      const pid = body.property_id ? String(body.property_id) : null;
      if (pid && !UUID.test(pid)) return json({ error: "Bad property" }, 400);
      if (pid && !(await d.propertyExists(pid))) return json({ error: "Property not found" }, 404);

      // reuse: the same address and the same choices, not tied to another property
      const n = norm(address);
      const same = (s: Stored) => (s.result?.unit_ref || null) === (unitRef || null) && (s.result?.candidate ?? null) === (candidate ?? null) && (!s.property_id || !pid || s.property_id === pid);
      const rows = (await d.recent(n, new Date(now() - REUSE_DAYS * 864e5).toISOString())).filter(same);
      const repeat = rows.find((s) => ANSWERED.includes(s.status) && now() - Date.parse(s.created_at) < REPEAT_MS);
      if (repeat) return json({ ok: true, saved: true, reused: true, limited: !!body.fresh, lookup_id: repeat.id, created_at: repeat.created_at, result: repeat.result });
      if (!body.fresh) { const ok = rows.find((s) => s.status === "ok"); if (ok) return json({ ok: true, saved: true, reused: true, lookup_id: ok.id, created_at: ok.created_at, result: ok.result }); }

      const result: any = await lookup({ address, magicKey, candidate, unitRef }, { fetch: d.fetch });
      const saved = await d.save({ property_id: pid, asked: address, matched_address: result.matched_address || null, council: result.council || null, status: result.status, result, created_by: who });
      if (!saved) return json({ ok: true, saved: false, error: "Not saved", result });
      return json({ ok: true, saved: true, lookup_id: saved.id, created_at: saved.created_at, result });
    } catch (e: any) {
      return json({ error: String(e?.message || e) }, 500);
    }
  };
}

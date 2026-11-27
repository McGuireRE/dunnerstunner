// The appraisal-fetch edge function (LW3 phase C2): photos for a comparable from a recent listing on a portal or an agency's site,
// fetched server-side into the private appraisal-media bucket for Tim to pick from. Tim only. The request handling, and every safety
// rule, is in appraisal_fetch_handler.ts and appraisal_fetch_core.ts (tested without a network, database or storage).
// Deployed like the others: a tiny index.ts imports this file's raw GitHub URL pinned to a commit, as `appraisal-fetch`, with the
// gateway's JWT verification ON (every caller must be signed in). The handler then asks is_agent with the caller's own token, so a
// signed-in vendor is refused. Reading the comparable, storing and filing the photos use the service role. No secret is needed.
// Tim has said other agencies' photos may be used on his private vendor-only page, and that the reuse risk is his (27 Nov 2026).
import { admin, cors } from "./shared.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { makeHandler } from "./appraisal_fetch_handler.ts";

const BUCKET = "appraisal-media";
// a host's addresses, A and AAAA. If the lookup itself can't run, the fetch is refused (it never goes ahead unchecked).
async function resolve(host: string): Promise<string[]> {
  const out: string[] = []; let ran = false;
  for (const t of ["A", "AAAA"] as const) {
    try { out.push(...(await Deno.resolveDns(host, t))); ran = true; } catch (e: any) { if (e?.name === "NotFound" || /no (data|record)|not found|NXDOMAIN/i.test(String(e?.message || ""))) ran = true; }
  }
  if (!ran) throw new Error("lookup unavailable");
  return out;
}

Deno.serve(makeHandler({
  cors,
  whoIsAgent: async (authorization) => {
    const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: u, error: ue } = await uc.auth.getUser();
    if (ue || !u?.user) return null;
    const { data } = await uc.rpc("is_agent");
    return data === true ? String(u.user.email || "agent") : null;
  },
  comp: async (aid, cid) => {
    const db = admin();
    const { data: c } = await db.from("appraisal_comps").select("id, appraisal_id").eq("id", cid).eq("appraisal_id", aid).maybeSingle();
    if (!c) return null;
    const { data: a } = await db.from("appraisal_views").select("status").eq("id", aid).maybeSingle();
    return a ? { id: c.id, appraisal_id: c.appraisal_id, sent: a.status === "sent" } : null;
  },
  resolve,
  fetch: (url, init) => fetch(url, init),
  upload: async (path, bytes, mime) => {
    const { error } = await admin().storage.from(BUCKET).upload(path, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }), { contentType: mime, upsert: false });
    if (!error) return { ok: true };
    return /exists|duplicate|409/i.test(String((error as any).statusCode || "") + " " + error.message) ? { ok: false, exists: true } : { ok: false, error: error.message };
  },
  sign: async (paths) => {
    const { data } = await admin().storage.from(BUCKET).createSignedUrls(paths, 1800);
    const out: Record<string, string> = {}; (data || []).forEach((x: any) => { if (x.path && x.signedUrl) out[x.path] = x.signedUrl; }); return out;
  },
  filed: async (cid) => {
    const { data } = await admin().from("appraisal_media").select("path, position").eq("comp_id", cid);
    return { paths: (data || []).map((m: any) => m.path), maxPosition: (data || []).reduce((n: number, m: any) => Math.max(n, m.position || 0), 0) };
  },
  insertMedia: async (rows) => { const { error } = await admin().from("appraisal_media").insert(rows); return { error: error ? error.message : null }; },
  remove: async (paths) => { await admin().storage.from(BUCKET).remove(paths); },
}));

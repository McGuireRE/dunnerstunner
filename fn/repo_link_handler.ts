// The repo-link edge function's request handling (fn/repo_link.ts is the deployed entry): a vendor asks for a link to a photo or
// document Tim has shared with them. The caller's own token is used to ask the database repo_vendor_can_read (migration 016:
// this round's owners and agreement signers, shared in this round, not removed, a kind that may be shared); only on yes is a
// signed link made, with the service role, for a fixed 600 seconds whatever the request says. Tested by
// onboarding/tests/repo-link-fn.test.js with fakes for both.
//
// LW3 phase E (migration 037): the same for a file in an appraisal sent to the vendor. The request names the copy it reads
// ({ snapshot, bucket, path }); the database is asked appraisal_vendor_can_read with the caller's own token (the newest copy they
// were sent, still an owner or contact, and the file listed in that copy), and only then is a 600-second link made in that bucket.
export const LINK_SECONDS = 600;
const PATH_RE = /^properties\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(docs|photos)\/[A-Za-z0-9._-]{1,200}$/;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp('^' + UUID + '$');
// where an appraisal's files can be, by bucket: comparables' photos, the header and intro stills (appraisal-media), the header clip and
// the video introduction (appraisal-video), the mockup's photos (property-files). Anything else is refused before the database is asked.
const APPRAISAL_PATHS: Record<string, RegExp> = {
  "appraisal-media": new RegExp('^appraisals/' + UUID + '/(comps/' + UUID + '|header|intro)/[A-Za-z0-9._-]{1,200}$'),
  "appraisal-video": new RegExp('^appraisals/' + UUID + '/(header|intro)/[A-Za-z0-9._-]{1,200}$'),
  "property-files": PATH_RE,
};

type Deps = {
  cors: Record<string, string>;
  // the caller's answer from repo_vendor_can_read, asked with their own Authorization header; null when the token isn't valid
  canRead: (authorization: string, path: string) => Promise<boolean | null>;
  // a signed link to the file in the property-files bucket, made with the service role
  sign: (path: string, seconds: number) => Promise<string | null>;
  // 037: the caller's answer from appraisal_vendor_can_read (null when the token isn't valid), and a link in the named bucket
  canReadAppraisal?: (authorization: string, snapshot: string, bucket: string, path: string) => Promise<boolean | null>;
  signIn?: (bucket: string, path: string, seconds: number) => Promise<string | null>;
};

export function makeHandler(d: Deps) {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: Object.assign({ "Content-Type": "application/json" }, d.cors) });
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: d.cors });
    if (req.method !== "POST") return json({ error: "Not allowed" }, 405);
    const auth = req.headers.get("Authorization") || "";
    if (!/^Bearer\s+\S+/.test(auth)) return json({ error: "Sign in first" }, 401);
    let body: any = null; try { body = await req.json(); } catch (_) { body = null; }
    const path = body && typeof body.path === "string" ? body.path : "";
    // an appraisal's file: the copy, the bucket and the path must all be well formed before anything is asked
    if (body && body.snapshot !== undefined) {
      const snap = typeof body.snapshot === "string" ? body.snapshot : "", bucket = typeof body.bucket === "string" ? body.bucket : "";
      const re = Object.prototype.hasOwnProperty.call(APPRAISAL_PATHS, bucket) ? APPRAISAL_PATHS[bucket] : null;
      if (!UUID_RE.test(snap) || !re || !re.test(path) || path.includes("..") || !d.canReadAppraisal || !d.signIn) return json({ error: "Bad request" }, 400);
      let ok: boolean | null = null;
      try { ok = await d.canReadAppraisal(auth, snap, bucket, path); } catch (_) { ok = null; }
      if (ok === null) return json({ error: "Sign in first" }, 401);
      if (!ok) return json({ error: "Not allowed" }, 403);
      const url = await d.signIn(bucket, path, LINK_SECONDS).catch(() => null);
      if (!url) return json({ error: "The file couldn't be found" }, 404);
      return json({ url, expires_in: LINK_SECONDS });
    }
    if (!PATH_RE.test(path) || path.includes("..")) return json({ error: "Bad request" }, 400);
    let ok: boolean | null = null;
    try { ok = await d.canRead(auth, path); } catch (_) { ok = null; }
    if (ok === null) return json({ error: "Sign in first" }, 401);
    if (!ok) return json({ error: "Not allowed" }, 403);
    const url = await d.sign(path, LINK_SECONDS).catch(() => null);
    if (!url) return json({ error: "The file couldn't be found" }, 404);
    return json({ url, expires_in: LINK_SECONDS });
  };
}

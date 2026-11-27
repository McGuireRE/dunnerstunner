// The appraisal-fetch edge function's request handling (fn/appraisal_fetch.ts is the deployed entry). LW3 phase C2: photos for a
// comparable from a recent listing on a portal or an agency's site. Tim only: every action first asks the database, with the caller's
// own token, whether they are the agent (is_agent). Two actions:
//   fetch: from a listing page's link (or the image links in a comparables pack, photo_hints), finds the listing's photos and downloads
//          up to 20 of them server-side into the private appraisal-media bucket, beside the comparable, under a name that carries the
//          fingerprint of the image link. Nothing is filed yet: Tim sees them (short signed links) and picks which to keep.
//   keep:  files the photos Tim picked (appraisal_media rows: source 'url', the image link, the listing page's link) and removes the
//          ones he left out. A photo is filed only if its stored name matches the fingerprint of the link sent back with it.
// Safety: https only (for the page, every photo and every redirect; this also closes DNS rebinding, see appraisal_fetch_core.ts); no user names, odd ports or private host names; every address a host resolves to must be public, and
// that is checked again after every redirect (at most 5); time limits on every request and 90 seconds for the whole fetch (what was staged by then is returned); a page over 3 MB, a photo over 15 MB or
// 100 MB in all is refused; a photo must be JPEG, PNG or WebP by its own bytes, not only by what the site says. The page's text is
// data: it is only searched for image links. Where a site turns the fetch away, Tim is told plainly and pointed at his download folder.
// Tested by onboarding/tests/appraisal-fetch-fn.test.js with fakes (no network, database or storage).
import { addressesOk, checkUrl, EXT, FETCHED_RE, fetchedPath, findImages, IMAGE_MS, ipBlocked, isUuid, isV4, looksBlocked, MAX_CANDIDATES, MAX_IMAGE_BYTES, MAX_IMAGES,
  MAX_PAGE_BYTES, MAX_REDIRECTS, MAX_TOTAL_BYTES, PAGE_MS, sha256Hex, sniffImage, typeOk, USER_AGENT } from "./appraisal_fetch_core.ts";

export const MAX_BODY = 40000;
export const BLOCKED_MESSAGE = "That site wouldn't let the photos be fetched (it turns away automatic downloads). Save them from the listing into your download folder, then drop them in under Photos from your download folder.";
type Comp = { id: string; appraisal_id: string; sent: boolean };
type Deps = {
  cors: Record<string, string>;
  whoIsAgent: (authorization: string) => Promise<string | null>;
  comp: (aid: string, cid: string) => Promise<Comp | null>;                        // the comparable on this appraisal, with the service role
  resolve: (host: string) => Promise<string[]>;                                     // the host's addresses (A and AAAA); throws when it can't tell
  fetch: (url: string, init: RequestInit) => Promise<Response>;                     // the network, with redirect "manual"
  upload: (path: string, bytes: Uint8Array, mime: string) => Promise<{ ok: boolean; exists?: boolean; error?: string }>;
  sign: (paths: string[]) => Promise<Record<string, string>>;                       // short signed links for Tim's screen
  filed: (cid: string) => Promise<{ paths: string[]; maxPosition: number }>;        // what is already filed for the comparable
  insertMedia: (rows: Record<string, unknown>[]) => Promise<{ error: string | null }>;
  remove: (paths: string[]) => Promise<void>;
  sha?: (s: string) => Promise<string>;
  timeBudgetMs?: number;                                                            // the whole fetch's time limit (TIME_BUDGET_MS); smaller in tests
};
type Got = { ok: true; url: string; status: number; type: string; bytes: Uint8Array } | { ok: false; why: string; blocked?: boolean; status?: number; timeUp?: boolean };
// the bytes left to download and the moment the whole request must stop, well inside the edge function's wall-clock limit (150 s)
export type Budget = { left: number; until: number };
export const TIME_BUDGET_MS = 90000;

// one request, made safely: the link checked (https only); the host's addresses looked up and every one public; no redirect followed
// blindly (each hop checked the same way); a time limit, never past the request's own budget; the body read up to its cap and no
// further, and a body that stalls or breaks is a plain failure, never an error.
export async function safeGet(d: Deps, raw: string, kind: "page" | "image", budget: Budget): Promise<Got> {
  let url = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const msLeft = budget.until - Date.now();
    if (msLeft <= 0) return { ok: false, timeUp: true, why: "Time ran out." };
    const c = checkUrl(url); if (!c.ok) return { ok: false, why: c.why };
    const host = c.url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (!(isV4(host) || host.includes(":"))) {
      let ips: string[] = [];
      try { ips = await d.resolve(host); } catch (_) { return { ok: false, why: "The site's address couldn't be checked, so nothing was fetched." }; }
      if (!ips.length) return { ok: false, why: "That site couldn't be found." };
      if (!addressesOk(ips)) return { ok: false, why: "That link points at a private address, so it can't be fetched." };
    } else if (ipBlocked(host)) return { ok: false, why: "That link points at a private address, so it can't be fetched." };
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), Math.min(kind === "page" ? PAGE_MS : IMAGE_MS, msLeft));
    try {
      let r: Response;
      try {
        r = await d.fetch(c.url.href, { method: "GET", redirect: "manual", signal: ctl.signal, headers: { "User-Agent": USER_AGENT,
          Accept: kind === "page" ? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" : "image/jpeg,image/png,image/webp;q=0.9,*/*;q=0.1", "Accept-Language": "en-NZ,en;q=0.8" } });
      } catch (e: any) { return { ok: false, why: e?.name === "AbortError" ? "The site took too long to answer." : "The site couldn't be reached." }; }
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location"); try { await r.body?.cancel(); } catch (_) { /* nothing to read */ }
        if (!loc) return { ok: false, why: "The site sent the fetch somewhere it didn't say." };
        try { url = new URL(loc, c.url).href; } catch (_) { return { ok: false, why: "The site sent the fetch to a link that isn't valid." }; }
        continue;
      }
      const cap = Math.min(kind === "page" ? MAX_PAGE_BYTES : MAX_IMAGE_BYTES, budget.left);
      const len = Number(r.headers.get("content-length") || "");
      if (len > 0 && len > cap) { try { await r.body?.cancel(); } catch (_) { /* */ } return { ok: false, why: kind === "page" ? "That page is too big to read." : "That photo is over 15 MB." }; }
      const chunks: Uint8Array[] = []; let n = 0;
      if (r.body) {
        const rd = r.body.getReader();
        try {
          for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length;
            if (n > cap) { try { await rd.cancel(); } catch (_) { /* */ } return { ok: false, why: kind === "page" ? "That page is too big to read." : "That photo is over 15 MB." }; }
            chunks.push(value); }
        } catch (e: any) {
          // the time limit fired, or the connection dropped, part way through the download
          try { await rd.cancel(); } catch (_) { /* */ }
          return { ok: false, timeUp: Date.now() >= budget.until, why: ctl.signal.aborted ? "The site took too long to send it." : "The download broke off part way." };
        }
      }
      const bytes = new Uint8Array(n); let at = 0; for (const ch of chunks) { bytes.set(ch, at); at += ch.length; }
      budget.left -= n;
      const type = String(r.headers.get("content-type") || "");
      if (!r.ok) {
        const text = kind === "page" ? new TextDecoder().decode(bytes.subarray(0, 20000)) : "";
        return { ok: false, status: r.status, blocked: looksBlocked(r.status, text), why: looksBlocked(r.status, text) ? "The site turned the fetch away." : "The site answered with an error (" + r.status + ")." };
      }
      return { ok: true, url: c.url.href, status: r.status, type, bytes };
    } finally { clearTimeout(t); }
  }
  return { ok: false, why: "The site redirected too many times." };
}

export function makeHandler(d: Deps) {
  const sha = d.sha || sha256Hex;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: Object.assign({ "Content-Type": "application/json", "Cache-Control": "no-store" }, d.cors) });
  const handle = async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: d.cors });
    if (req.method !== "POST") return json({ error: "Not allowed" }, 405);
    const auth = req.headers.get("Authorization") || "";
    if (!/^Bearer\s+\S+/.test(auth)) return json({ error: "Sign in first" }, 401);
    let text = ""; try { text = await req.text(); } catch (_) { return json({ error: "Bad request" }, 400); }
    if (text.length > MAX_BODY) return json({ error: "That is more than can be sent at once." }, 413);
    let body: any = null; try { body = JSON.parse(text); } catch (_) { body = null; }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Bad request" }, 400);
    const action = String(body.action || "");
    if (!["fetch", "keep"].includes(action)) return json({ error: "Bad request" }, 400);
    let agent: string | null = null; try { agent = await d.whoIsAgent(auth); } catch (_) { agent = null; }
    if (!agent) return json({ error: "Only Tim can do this" }, 403);
    const aid = body.appraisal_id, cid = body.comp_id;
    if (!isUuid(aid) || !isUuid(cid)) return json({ error: "Bad request" }, 400);
    let comp: Comp | null = null; try { comp = await d.comp(aid, cid); } catch (_) { comp = null; }
    if (!comp) return json({ ok: false, error: "That comparable isn't on this appraisal." }, 404);
    if (comp.sent) return json({ ok: false, error: "This appraisal has been sent, and a sent copy never changes." }, 409);
    const pageIn = typeof body.page_url === "string" ? body.page_url.trim() : "";

    if (action === "fetch") {
      const budget: Budget = { left: MAX_TOTAL_BYTES, until: Date.now() + (d.timeBudgetMs || TIME_BUDGET_MS) };
      let candidates: string[] = [], page: string | null = null;
      if (pageIn) {
        const g = await safeGet(d, pageIn, "page", budget);
        if (!g.ok) return json({ ok: false, reason: g.blocked ? "blocked" : "failed", message: g.blocked ? BLOCKED_MESSAGE : g.why + (g.status ? "" : " Check the link, or save the photos into your download folder.") });
        page = g.url;
        const sniffed = sniffImage(g.bytes);
        if (sniffed && typeOk(g.type, sniffed)) candidates = [g.url];   // the link was a photo itself
        else {
          if (!/html|xml/i.test(g.type) && g.type) return json({ ok: false, reason: "failed", message: "That link isn't a listing page or a photo." });
          const html = new TextDecoder().decode(g.bytes);
          if (looksBlocked(g.status, html)) return json({ ok: false, reason: "blocked", message: BLOCKED_MESSAGE });
          candidates = findImages(html, g.url);
        }
      } else if (Array.isArray(body.image_urls)) {
        candidates = body.image_urls.filter((u: unknown) => typeof u === "string").map((u: string) => u.trim()).filter((u: string) => checkUrl(u).ok).slice(0, MAX_CANDIDATES);
      }
      if (!candidates.length) return json({ ok: false, reason: "no_photos", message: pageIn ? "No listing photos were found on that page. If the site loads them as you scroll, save them into your download folder instead." : "Give the link of the listing, or of its photos." });
      const photos: { path: string; image_url: string; mime: string; size: number }[] = [], skipped: { image_url: string; why: string }[] = [];
      let blocked = 0, timeUp = false;
      for (const u of candidates) {
        if (photos.length >= MAX_IMAGES || budget.left <= 0) break;
        if (Date.now() >= budget.until) { timeUp = true; break; }   // stop in good time, and return what is staged so far
        const g = await safeGet(d, u, "image", budget);
        if (!g.ok) { if (g.timeUp) { timeUp = true; break; } if (g.blocked) blocked++; skipped.push({ image_url: u, why: g.why }); continue; }
        const mime = sniffImage(g.bytes);
        if (!typeOk(g.type, mime)) { skipped.push({ image_url: u, why: "Not a JPEG, PNG or WebP photo." }); continue; }
        if (g.bytes.length < 2000) { skipped.push({ image_url: u, why: "Too small to be a listing photo." }); continue; }
        const path = await fetchedPath(aid, cid, u, mime!);
        if (photos.some((p) => p.path === path)) continue;
        const up = await d.upload(path, g.bytes, mime!);
        if (!up.ok && !up.exists) { skipped.push({ image_url: u, why: "It couldn't be saved: " + (up.error || "try again") + "." }); continue; }
        photos.push({ path, image_url: u, mime: mime!, size: g.bytes.length });
      }
      if (!photos.length) return json({ ok: false, reason: timeUp ? "time" : blocked ? "blocked" : "no_photos", message: timeUp ? "The site was too slow, so no photos were fetched in the time allowed. Save them from the listing into your download folder instead." : blocked ? BLOCKED_MESSAGE : "None of the photos could be fetched. Save them from the listing into your download folder instead.", skipped: skipped.slice(0, 10) });
      let links: Record<string, string> = {}; try { links = await d.sign(photos.map((p) => p.path)); } catch (_) { links = {}; }
      return json({ ok: true, page_url: page, photos: photos.map((p) => ({ ...p, url: links[p.path] || null })), skipped: skipped.slice(0, 20), time_up: timeUp,
        message: timeUp ? "The site was slow, so only " + photos.length + " photo" + (photos.length === 1 ? " was" : "s were") + " fetched in the time allowed. Keep the ones you want, or save the rest into your download folder." : null });
    }

    // keep
    const keep = Array.isArray(body.keep) ? body.keep.slice(0, MAX_IMAGES) : [], discard = Array.isArray(body.discard) ? body.discard.slice(0, 60) : [];
    let pageUrl: string | null = null;
    if (pageIn) { const c = checkUrl(pageIn); if (!c.ok) return json({ ok: false, error: "The listing's link isn't valid." }, 400); pageUrl = c.url.href.slice(0, 1000); }
    const mine = (p: unknown) => { const m = FETCHED_RE.exec(String(p || "")); return m && m[1] === aid && m[2] === cid ? m : null; };
    const have = await d.filed(cid);
    const rows: Record<string, unknown>[] = []; let pos = have.maxPosition;
    for (const k of keep) {
      const m = mine(k && k.path), iu = String((k && k.image_url) || "");
      if (!m || !checkUrl(iu).ok || (await sha(iu)).slice(0, 32) !== m[3]) return json({ ok: false, error: "A photo didn't match the link it came from, so nothing was filed. Fetch the photos again." }, 400);
      if (have.paths.includes(k.path) || rows.some((r) => r.path === k.path)) continue;
      const ext = m[4]; const mime = Object.keys(EXT).find((x) => EXT[x] === ext)!;
      rows.push({ appraisal_id: aid, comp_id: cid, path: k.path, file_name: (iu.split("/").pop() || "").split("?")[0].slice(0, 200), mime_type: mime, position: ++pos, source: "url",
        source_url: /^https:\/\/\S+$/.test(iu) && iu.length <= 1000 ? iu : null, page_url: pageUrl, created_by: agent });
    }
    if (rows.length) { const r = await d.insertMedia(rows); if (r.error) return json({ ok: false, error: "The photos weren't filed: " + r.error }, 409); }
    const gone = discard.filter((p: unknown) => mine(p) && !have.paths.includes(String(p)) && !rows.some((r) => r.path === p)) as string[];
    if (gone.length) { try { await d.remove(gone); } catch (_) { /* left for a later clean-up; never shown, as nothing files them */ } }
    return json({ ok: true, kept: rows.length, removed: gone.length });
  };
  // anything unexpected still answers in JSON, with the CORS headers, in plain words
  return async (req: Request): Promise<Response> => {
    try { return await handle(req); } catch (_) { return json({ ok: false, reason: "failed", error: "Something went wrong fetching the photos. Try again, or save them into your download folder." }, 500); }
  };
}

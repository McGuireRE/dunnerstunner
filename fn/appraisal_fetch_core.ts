// The pure rules of the appraisal-fetch edge function (LW3 phase C2, APPRAISAL-PLAN.md): which links may be fetched (SSRF
// protection), which addresses are private, how a listing page's photos are found in its HTML, what a downloaded file really is, and
// where a fetched photo is kept. No network, database or storage here, so onboarding/tests/appraisal-fetch-fn.test.js can test it.
// The listing page's text is data: it is only searched for image links, never followed as an instruction and never stored.

export const MAX_IMAGES = 20;                      // photos fetched for one comparable at a time
export const MAX_CANDIDATES = 40;                  // image links tried, at most, to find them
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;   // the appraisal-media bucket's limit
export const MAX_PAGE_BYTES = 3 * 1024 * 1024;     // a listing page's HTML
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024;  // everything downloaded in one request
export const MAX_REDIRECTS = 5;
export const PAGE_MS = 12000, IMAGE_MS = 15000;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
// a generic client name: nothing about Tim or the agency goes to the sites fetched from
export const USER_AGENT = "Mozilla/5.0 (compatible; listing-photo-fetch/1.0)";

// ───────── addresses ─────────
const v4ToInt = (s: string): number | null => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s); if (!m) return null;
  const p = m.slice(1).map(Number); if (p.some((x) => x > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
};
const inV4 = (ip: number, base: string, bits: number) => { const b = v4ToInt(base)!; const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0; return ((ip & mask) >>> 0) === ((b & mask) >>> 0); };
// not on the public internet: this network, private, shared (CGNAT), loopback, link-local, protocol and documentation ranges,
// benchmarking, multicast, reserved and broadcast
const V4_BLOCKED: [string, number][] = [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]];
export function ipv4Blocked(s: string): boolean {
  const ip = v4ToInt(s); if (ip === null) return true;   // not a plain address: refused
  return V4_BLOCKED.some(([b, n]) => inV4(ip, b, n));
}
// an IPv6 address as its eight 16-bit groups, or null (an IPv4 tail such as ::ffff:10.0.0.1 is read too)
export function v6Groups(s: string): number[] | null {
  let a = String(s || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (a.includes("%")) return null;                     // a zone id (fe80::1%eth0) is never public
  const tail = /^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(a);
  if (tail) { const v = v4ToInt(tail[2]); if (v === null) return null; a = tail[1] + (v >>> 16).toString(16) + ":" + (v & 0xffff).toString(16); }
  if (!/^[0-9a-f:]+$/.test(a) || (a.match(/::/g) || []).length > 1) return null;
  const [h, t] = a.includes("::") ? a.split("::") : [a, null];
  const hs = h ? h.split(":") : [], ts = t === null ? [] : (t ? t.split(":") : []);
  if (t === null && hs.length !== 8) return null;
  if (t !== null && hs.length + ts.length > 7) return null;
  const parts = hs.concat(t === null ? [] : Array(8 - hs.length - ts.length).fill("0"), ts);
  if (parts.length !== 8 || parts.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return null;
  return parts.map((x) => parseInt(x, 16));
}
export function ipv6Blocked(s: string): boolean {
  const g = v6Groups(s); if (!g) return true;
  const v4of = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  // ::ffff:a.b.c.d (IPv4-mapped): the IPv4 address decides
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return ipv4Blocked(v4of(g[6], g[7]));
  // only global unicast (2000::/3) is public; that leaves out ::, ::1, IPv4-compatible, NAT64 (64:ff9b::), discard (100::),
  // unique local (fc00::/7), link-local (fe80::/10), site-local and multicast (ff00::/8)
  if (g[0] < 0x2000 || g[0] > 0x3fff) return true;
  if (g[0] === 0x2001 && g[1] < 0x0200) return true;                // 2001::/23 protocol assignments (Teredo among them)
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;              // documentation
  if (g[0] === 0x3fff && g[1] < 0x1000) return true;                // documentation (3fff::/20)
  if (g[0] === 0x2002) return ipv4Blocked(v4of(g[1], g[2]));        // 6to4: the IPv4 address inside decides
  return false;
}
export const isV4 = (s: string) => v4ToInt(s) !== null;
export const isV6 = (s: string) => /^\[?[0-9a-f:.%]+\]?$/i.test(s) && s.includes(":");
export const ipBlocked = (s: string) => (isV4(s) ? ipv4Blocked(s) : isV6(s) ? ipv6Blocked(s) : true);

// ───────── links ─────────
const BAD_HOST = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|home\.arpa)$/i;
// Is this a link that may be fetched? https only (see below); no user name or password; the normal port; a public host name (with a
// dot) or a public address. Returns the parsed link, or why not in plain words. The host's addresses are checked separately, after
// they are looked up (and again after every redirect). Why https only: the address is looked up twice (once to check it, once by the
// fetch itself), so a hostile site could answer the second lookup with a private address (DNS rebinding). Over https the connection then
// fails, because nothing on a private address holds a certificate for the site's name; over plain http it would go through.
export function checkUrl(raw: unknown): { ok: true; url: URL } | { ok: false; why: string } {
  const s = String(raw ?? "").trim();
  if (!s || s.length > 2000) return { ok: false, why: "That isn't a web link." };
  let u: URL; try { u = new URL(s); } catch (_) { return { ok: false, why: "That isn't a web link." }; }
  if (u.protocol === "http:") return { ok: false, why: "Only secure links (starting with https) can be fetched. Open the listing in your browser and copy the link from the address bar." };
  if (u.protocol !== "https:") return { ok: false, why: "Only web links starting with https can be fetched." };
  if (u.username || u.password) return { ok: false, why: "Links with a user name or password can't be fetched." };
  if (u.port && u.port !== "443") return { ok: false, why: "Only links on the normal web port can be fetched." };
  const host = u.hostname.replace(/\.$/, "");
  if (!host) return { ok: false, why: "That isn't a web link." };
  if (isV4(host) || host.startsWith("[")) { if (ipBlocked(host)) return { ok: false, why: "That link points at a private address, so it can't be fetched." }; return { ok: true, url: u }; }
  if (/^[0-9.]+$/.test(host) || /^0x/i.test(host)) return { ok: false, why: "That link points at a private address, so it can't be fetched." };
  if (!host.includes(".") || BAD_HOST.test(host)) return { ok: false, why: "That link points at a private address, so it can't be fetched." };
  return { ok: true, url: u };
}
// a looked-up host's addresses: every one must be public (one private address is enough to refuse)
export function addressesOk(ips: string[]): boolean { return Array.isArray(ips) && ips.length > 0 && ips.every((ip) => !ipBlocked(ip)); }

// ───────── finding the listing's photos in its page ─────────
const ENT: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
export const decodeEntities = (s: string) => String(s || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
// the attributes of one tag, names in lower case
export function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const body = tag.replace(/^<\s*[a-zA-Z0-9]+/, "").replace(/\/?>$/, "");
  let m; while ((m = re.exec(body))) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}
// the largest picture in a srcset ("a.jpg 640w, b.jpg 1280w" gives b.jpg)
export function bestOfSrcset(v: string): string {
  let best = "", size = -1;
  for (const part of String(v || "").split(/,\s+(?=\S)/)) {
    const [u, d] = part.trim().split(/\s+/); if (!u) continue;
    const n = d ? parseFloat(d) * (/x$/i.test(d) ? 1000 : 1) : 1; if (n > size) { size = n; best = u; }
  }
  return best;
}
const NOT_A_PHOTO = /(logo|icon|sprite|avatar|favicon|placeholder|badge|spinner|loader|pixel|tracking|blank|transparent|agent[-_]?photo|headshot|profile[-_]?pic|watermark)/i;
const PHOTO_EXT = /\.(jpe?g|png|webp)(?:$|[?#])/i;
// the image links of a listing page, best first: its share image (og:image and the like), the listing's JSON-LD images, the gallery's
// pictures (img src, data-src, srcset), then image links in the page's own data (galleries loaded by script). Relative links are made
// whole against the page's address; logos, icons, SVG and GIF are left out; each picture is listed once.
export function findImages(html: string, pageUrl: string): string[] {
  const h = String(html || "").slice(0, MAX_PAGE_BYTES);
  const found: string[] = [];
  const add = (v: unknown) => { if (typeof v === "string" && v.trim()) found.push(v.trim()); };
  for (const t of h.match(/<meta\b[^>]*>/gi) || []) {
    const a = attrsOf(t), k = (a.property || a.name || a.itemprop || "").toLowerCase();
    if (["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src", "image"].includes(k)) add(a.content);
  }
  for (const t of h.match(/<link\b[^>]*>/gi) || []) { const a = attrsOf(t); if (/\bimage_src\b/i.test(a.rel || "")) add(a.href); }
  const walk = (v: any, depth: number, inImage: boolean) => {
    if (depth > 12 || v == null) return;
    if (typeof v === "string") { if (inImage) add(v); return; }
    if (Array.isArray(v)) { v.slice(0, 200).forEach((x) => walk(x, depth + 1, inImage)); return; }
    if (typeof v === "object") for (const [k, x] of Object.entries(v)) {
      const lk = k.toLowerCase();
      if (inImage && (lk === "url" || lk === "contenturl")) walk(x, depth + 1, true);
      else if (["image", "images", "photo", "photos", "primaryimageofpage"].includes(lk)) walk(x, depth + 1, true);
      else if (!inImage) walk(x, depth + 1, false);
    }
  };
  for (const m of h.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim()), 0, false); } catch (_) { /* a broken block is skipped */ }
  }
  for (const t of h.match(/<(img|source)\b[^>]*>/gi) || []) {
    const a = attrsOf(t);
    const set = a.srcset || a["data-srcset"]; if (set) { add(bestOfSrcset(set)); continue; }   // the largest of the set, not its small fallback
    for (const k of["data-src", "data-lazy-src", "data-original", "data-large", "data-full", "src"]) if (a[k] && !a[k].startsWith("data:")) { add(a[k]); break; }
  }
  // galleries loaded by script: image links quoted in the page's own scripts (not in its tags, which are read above)
  for (const sc of h.matchAll(/<script\b(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi))
    for (const m of sc[1].matchAll(/["'](https?:(?:\\?\/){2}[^"'\s<>]{4,1500}?\.(?:jpe?g|png|webp)(?:\?[^"'\s<>]{0,500})?)["']/gi)) add(m[1].replace(/\\\//g, "/").replace(/\\u002[fF]/g, "/"));
  const out: string[] = [], seen = new Set<string>(), seenPath = new Set<string>();
  for (const f of found) {
    let u: URL; try { u = new URL(decodeEntities(f), pageUrl); } catch (_) { continue; }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    if (/\.(svg|gif|ico)(?:$|[?#])/i.test(u.pathname) || NOT_A_PHOTO.test(u.pathname)) continue;
    u.hash = "";
    const key = u.href, pk = u.host + u.pathname;
    if (seen.has(key) || (seenPath.has(pk) && PHOTO_EXT.test(u.pathname))) continue;
    seen.add(key); seenPath.add(pk); out.push(key);
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

// ───────── what a download really is ─────────
export function sniffImage(b: Uint8Array): string | null {
  if (!b || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}
// the header's type agrees with the bytes (a generic "binary" header is accepted; a page or script is not)
export function typeOk(header: string | null, sniffed: string | null): boolean {
  if (!sniffed || !IMAGE_TYPES.includes(sniffed)) return false;
  const t = String(header || "").split(";")[0].trim().toLowerCase();
  if (!t || t === "application/octet-stream" || t === "binary/octet-stream") return true;
  return t === sniffed || (t === "image/jpg" && sniffed === "image/jpeg") || (t === "image/pjpeg" && sniffed === "image/jpeg");
}
// a page that turned the fetch away (a bot check, a sign-in wall or a refusal)
export function looksBlocked(status: number, text: string): boolean {
  if ([401, 403, 407, 429, 451, 503].includes(status)) return true;
  const t = String(text || "").slice(0, 20000);
  return /cf-chl|challenge-platform|just a moment\.\.\.|attention required|captcha|access denied|are you a robot|px-captcha|datadome/i.test(t) && !/og:image/i.test(t);
}

// ───────── where a fetched photo is kept ─────────
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown) => typeof s === "string" && UUID.test(s);
export async function sha256Hex(s: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return Array.from(h, (x) => x.toString(16).padStart(2, "0")).join("");
}
// appraisals/<appraisal>/comps/<comp>/fetch-<first 32 of the SHA-256 of the image link>.<jpg|png|webp>. The name carries the link's
// fingerprint, so when Tim keeps a photo the function can check the link he sends back is the one it was fetched from.
export async function fetchedPath(aid: string, cid: string, imageUrl: string, mime: string): Promise<string> {
  return `appraisals/${aid}/comps/${cid}/fetch-${(await sha256Hex(imageUrl)).slice(0, 32)}.${EXT[mime]}`;
}
export const FETCHED_RE = /^appraisals\/([0-9a-f-]{36})\/comps\/([0-9a-f-]{36})\/fetch-([0-9a-f]{32})\.(jpg|png|webp)$/;

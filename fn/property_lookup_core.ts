// Public council records for one property (Tim, 18 November 2026). Pure: no Deno, no database, no imports. Every upstream call
// goes through the fetch function passed in, so tests run it with recorded answers. Only the keyless public services verified
// in the council research are used, by exact host, over https, with no redirects, a size cap enforced while reading, a timeout on
// every call and one deadline for the whole lookup. Values are suggestions: each carries its source, the source's own date where it
// gives one, and when it was fetched. Rating valuations are labelled as the council's, never as a market value; rates have their
// own note. Hazards and zones say "Not a substitute for a LIM."
// Flats, units and cross-leases: when more than one rating unit sits at the point, one is used only when the typed unit matches a
// council record for certain; otherwise the lookup stops and lists the units (each with its own address and valuation reference)
// for Tim to choose. Never silently the first.
// Erasable TypeScript only (types, no enums), so Node can import this file directly for the unit test.

export type FetchFn = (url: string, init?: any) => Promise<any>;
export type Deps = { fetch: FetchFn; now?: () => Date; timeoutMs?: number; deadlineMs?: number };
export type Value = {
  key: string; group: string; label: string; value: string | number; display: string; kind: string;
  field: string | null; source: string; source_name: string; source_url: string; as_of: string | null; as_of_label: string | null;
  fetched_at: string; note: string; also: { display: string; source_name: string; as_of_label: string | null }[];
};
export type Source = { id: string; name: string; url: string; status: string; http?: number; ms?: number; note?: string };
export type LookupInput = { address: string; magicKey?: string; candidate?: number; unitRef?: string };

export const ORC = "https://maps.orc.govt.nz/arcgis/rest/services";
export const ORC_HZ = "https://services6.arcgis.com/ALxeDxaeNjQo1Mf0/arcgis/rest/services";
export const LINZ = "https://services.arcgis.com/xdsHIIxuCWByZiCB/ArcGIS/rest/services";
export const DCC = "https://apps.dunedin.govt.nz/arcgis/rest/services/Public";
export const QLDC = "https://services1.arcgis.com/9YyqaQtDdDR8tupG/arcgis/rest/services";
export const WDC = "https://services6.arcgis.com/18uRagbQ26OU6noY/arcgis/rest/services";
export const CDC = "https://gis.cluthadc.govt.nz/arcgis/rest/services";
export const HOSTS = ["maps.orc.govt.nz", "services6.arcgis.com", "services.arcgis.com", "apps.dunedin.govt.nz", "services1.arcgis.com", "gis.cluthadc.govt.nz"];
export const MIN_SCORE = 95;
export const LIM_NOTE = "Not a substitute for a LIM.";
export const LINZ_CREDIT = "Contains data sourced from the LINZ Data Service licensed for reuse under CC BY 4.0.";
export const MAX_BYTES = 2_000_000;
export const CALL_TIMEOUT_MS = 4000;      // one upstream call
export const DEADLINE_MS = 12000;         // the whole lookup; the page waits a little longer than this (CR_WAIT in app.js)
const UA = "Mozilla/5.0 (compatible; agency-property-lookup/1.0)";

export const COUNCILS: Record<string, { name: string; search?: string }> = {
  DCC: { name: "Dunedin City Council" },
  QLDC: { name: "Queenstown Lakes District Council" },
  WDC: { name: "Waitaki District Council", search: "https://propertyratessearch.waitaki.govt.nz/" },
  CDC: { name: "Clutha District Council" },
  CODC: { name: "Central Otago District Council", search: "https://www.codc.govt.nz/do-it-online/rating-and-property-search" },
};
export function councilId(name: unknown): string | null {
  const s = String(name ?? "").toLowerCase();
  if (/dunedin/.test(s)) return "DCC";
  if (/queenstown/.test(s)) return "QLDC";
  if (/waitaki/.test(s)) return "WDC";
  if (/clutha/.test(s)) return "CDC";
  if (/central otago/.test(s)) return "CODC";
  return null;
}

// ── switched on, and switched off until confirmed ──
// ORC hazard maps checked at a real address in the research: liquefaction (layers 65 and 66) and the tsunami evacuation zones
// (layers named as zones, read from the service's own list).
export const ORC_HAZARDS_ON: { svc: string; label: string; layers: number[] | null; nameRe?: RegExp }[] = [
  { svc: "Liquefaction_and_ground_class_Otago", label: "Liquefaction and ground class", layers: [65, 66] },
  { svc: "TsunamiEvacuationZones", label: "Tsunami evacuation zone", layers: null, nameRe: /zone|evacuat/i },
];
// OFF until each is checked at a real address (which layer, which fields): their first layer may be a study area, not a hazard.
// To switch one on, move it to ORC_HAZARDS_ON with its confirmed layer ids, and add a recorded answer to the tests.
export const ORC_HAZARDS_OFF: { svc: string; label: string }[] = [
  { svc: "FloodHazard_Otago_2024", label: "flood hazard" },
  { svc: "HAIL", label: "contaminated land (HAIL)" },
  { svc: "Landslides_OtagoRegion2020", label: "landslides" },
  { svc: "Coastal_erosion", label: "coastal erosion" },
  { svc: "Alluvial_Fans_Otago", label: "alluvial fans" },
];
// OFF: the Waitaki zone layer (WDC_ODP_Zone_WFL1/FeatureServer/7) was queried in the research, but its service address (the
// ArcGIS organisation it sits in) was not recorded. Switch on once the address is confirmed.
export const WDC_ZONE_ON = false;

// ── small helpers ──
export const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
export const refKey = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");   // "26280/29000A" = "26280-29000 A"
const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v)).replace(/\s+/g, " ");
const num = (v: unknown) => { if (v == null || v === "") return null; const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : null; };
export function dollars(n: number) { const cents = Math.round(n * 100) % 100 !== 0; return "$" + n.toLocaleString("en-NZ", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 }); }
export const m2 = (n: number) => Math.round(n).toLocaleString("en-NZ") + " m²";
export function nzDate(ms: number | string | Date) { const d = new Date(ms as any); return isNaN(d.getTime()) ? null : d.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "Pacific/Auckland" }); }
const isoDay = (ms: unknown) => { const n = num(ms); if (n == null || n <= 0) return null; const d = new Date(n); return isNaN(d.getTime()) ? null : d.toISOString(); };
function attrs(data: any): any[] { return Array.isArray(data?.features) ? data.features.map((f: any) => { const a: any = {}; Object.entries(f?.attributes || {}).forEach(([k, v]) => { a[k] = typeof v === "string" ? v.trim() : v; }); return a; }) : []; }
export function valNote(asOfLabel: string | null) { return `Council rating valuation (as at ${asOfLabel || "date not given"}), not a market value.`; }
export function ratesNote(asOfLabel: string | null) { return `Rates as the council publishes them (as at ${asOfLabel || "date not given"}). Check the latest rates notice.`; }

// The unit in an address: "2/20 Thames Street", "Flat 2, 20 Thames Street", "Unit 2B 20 ..." give { unit: "2", number: "20" }.
export function parseUnit(a: unknown): { unit: string; number: string } | null {
  const s = String(a ?? "").trim();
  let m = s.match(/^(?:(?:flat|unit|apartment|apt)\s*)?([0-9]+[a-z]?|[a-z])\s*\/\s*(\d+[a-z]?)\b/i);
  if (m) return { unit: m[1].toUpperCase(), number: m[2].toUpperCase() };
  m = s.match(/^(?:flat|unit|apartment|apt)\.?\s*([0-9]+[a-z]?|[a-z])\s*,?\s+(\d+[a-z]?)\s/i);
  if (m) return { unit: m[1].toUpperCase(), number: m[2].toUpperCase() };
  return null;
}

// one GET to an allowed host: https only, no redirects, size cap while reading, timeout. Never throws.
export async function getJson(url: string, deps: Deps): Promise<{ ok: boolean; data?: any; status?: number; ms: number; error?: string; at: string }> {
  const t0 = Date.now(); const at = () => (deps.now ? deps.now() : new Date()).toISOString();
  let u: URL; try { u = new URL(url); } catch { return { ok: false, ms: 0, error: "bad url", at: at() }; }
  if (u.protocol !== "https:" || !HOSTS.includes(u.hostname)) return { ok: false, ms: 0, error: "host not allowed", at: at() };
  const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
  const ms = Math.max(1, deps.timeoutMs ?? CALL_TIMEOUT_MS);
  let timer: any; const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => { try { ac?.abort(); } catch { /* */ } rej(new Error("timeout")); }, ms); });
  timeout.catch(() => { /* handled by the races below */ });
  try {
    const res: any = await Promise.race([deps.fetch(url, { redirect: "manual", signal: ac?.signal, headers: { "User-Agent": UA, Accept: "application/json" } }), timeout]);
    const status = Number(res?.status ?? 0);
    if (status >= 300 && status < 400) return { ok: false, status, ms: Date.now() - t0, error: "redirect refused", at: at() };
    if (!res?.ok) return { ok: false, status, ms: Date.now() - t0, error: "http " + status, at: at() };
    const len = Number(res.headers?.get?.("content-length") || 0);
    if (len > MAX_BYTES) { try { ac?.abort(); } catch { /* */ } return { ok: false, status, ms: Date.now() - t0, error: "too large", at: at() }; }
    let text = "";
    const reader = res.body && typeof res.body.getReader === "function" ? res.body.getReader() : null;
    if (reader) {
      // read in pieces, and stop as soon as the cap is passed
      const dec = new TextDecoder(); let n = 0;
      while (true) {
        const { done, value } = await Promise.race([reader.read(), timeout]) as any;
        if (done) break;
        n += value?.byteLength || 0;
        if (n > MAX_BYTES) { try { await reader.cancel(); } catch { /* */ } try { ac?.abort(); } catch { /* */ } return { ok: false, status, ms: Date.now() - t0, error: "too large", at: at() }; }
        text += dec.decode(value, { stream: true });
      }
      text += dec.decode();
    } else {
      text = await Promise.race([res.text(), timeout]);
      if (text.length > MAX_BYTES) return { ok: false, status, ms: Date.now() - t0, error: "too large", at: at() };
    }
    let data: any; try { data = JSON.parse(text); } catch { return { ok: false, status, ms: Date.now() - t0, error: "not json", at: at() }; }
    if (data && data.error) return { ok: false, status, ms: Date.now() - t0, error: "service error " + str(data.error.code || data.error.message), at: at() };
    return { ok: true, data, status, ms: Date.now() - t0, at: at() };
  } catch (e: any) {
    return { ok: false, ms: Date.now() - t0, error: /timeout|abort/i.test(String(e?.message || e?.name)) ? "timeout" : "network", at: at() };
  } finally { clearTimeout(timer); }
}

export function pointQuery(base: string, layer: string, x: number, y: number, wkid: number) {
  const p = new URLSearchParams({ geometry: `${x},${y}`, geometryType: "esriGeometryPoint", inSR: String(wkid), spatialRel: "esriSpatialRelIntersects", outFields: "*", returnGeometry: "false", f: "json" });
  return `${base}/${layer}/query?${p.toString()}`;
}
export const suggestUrl = (text: string) => `${ORC}/OtagoAddress_Locator/GeocodeServer/suggest?${new URLSearchParams({ text, maxSuggestions: "5", f: "json" })}`;
export function geocodeUrl(address: string, magicKey?: string) {
  const p = new URLSearchParams({ SingleLine: address, maxLocations: "5", outSR: "4326", f: "json" });
  if (magicKey) p.set("magicKey", magicKey);
  return `${ORC}/OtagoAddress_Locator/GeocodeServer/findAddressCandidates?${p}`;
}
// DCC rates by address text, as verified: Formatted_address LIKE '100 GLADSTONE%' (house number and the first word of the street;
// for "2/20 ..." the house number is 20, so every unit at the number comes back and the valuation reference picks the one)
export function dccRatesUrl(matched: string) {
  const first = matched.split(",")[0].toUpperCase().replace(/^(FLAT|UNIT|APARTMENT|APT)\.?\s+[0-9A-Z]+\s*,?\s*/, "").replace(/^[0-9A-Z]+\s*\/\s*/, "").replace(/[^A-Z0-9/ -]/g, " ").replace(/\s+/g, " ").trim().split(" ");
  const i = first.findIndex((w) => /\d/.test(w)); if (i < 0 || !first[i + 1]) return null;
  const prefix = `${first[i]} ${first[i + 1]}`.replace(/'/g, "''");
  return `${DCC}/Rates/FeatureServer/0/query?${new URLSearchParams({ where: `Formatted_address LIKE '${prefix}%'`, outFields: "*", returnGeometry: "false", f: "json" })}`;
}

// ── address suggestions (ORC locator, all of Otago) ──
export async function suggest(text: string, deps: Deps) {
  const t = String(text || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (t.length < 3) return { ok: true, suggestions: [] };
  const r = await getJson(suggestUrl(t), deps);
  if (!r.ok) return { ok: false, error: r.error, suggestions: [] };
  return { ok: true, suggestions: (r.data?.suggestions || []).slice(0, 5).map((s: any) => ({ text: str(s.text), magicKey: str(s.magicKey) })).filter((s: any) => s.text) };
}

// ── health: whether each upstream host answers. No property data. ──
export async function health(deps: Deps) {
  const checks: [string, string][] = [
    ["maps.orc.govt.nz", `${ORC}/OtagoAddress_Locator/GeocodeServer?f=json`],
    ["services6.arcgis.com (ORC hazards)", `${ORC_HZ}?f=json`],
    ["services.arcgis.com (LINZ)", `${LINZ}/LINZ_NZ_Property_Boundaries/FeatureServer/0?f=json`],
    ["apps.dunedin.govt.nz", `${DCC}?f=json`],
    ["services1.arcgis.com (QLDC)", `${QLDC}/Land_Parcels_and_Properties_Data/FeatureServer/0?f=json`],
    ["services6.arcgis.com (WDC)", `${WDC}/WDC_PARCELS_view/FeatureServer/0?f=json`],
    ["gis.cluthadc.govt.nz", `${CDC}/PropertyPublic/MapServer/0?f=json`],
  ];
  const res = await Promise.all(checks.map(async ([name, url]) => { const r = await getJson(url, deps); return [name, { ok: r.ok, status: r.status ?? 0 }] as const; }));
  return { ok: true, hosts: Object.fromEntries(res) };
}

export function summarise(a: any) {
  const SKIP = /objectid|globalid|^fid$|^id$|shape|^st_|created|edited|last_?edit|date|^area$|^length$/i;
  const seen = new Set<string>(); const parts: string[] = [];
  for (const [k, v] of Object.entries(a || {})) {
    if (SKIP.test(k) || typeof v !== "string") continue; const s = v.replace(/\s+/g, " ").trim();
    if (!s || s.length > 120 || /^https?:/i.test(s) || seen.has(s.toLowerCase())) continue; seen.add(s.toLowerCase()); parts.push(s); if (parts.length >= 4) break;
  }
  return parts.join("; ");
}
const DCC_ZONE_LAYERS = [0, 1, 2, 3, 4, 5, 6];
export const DCC_HAZ_LAYERS: [number, string][] = [[9, "Hazard 1 (flood)"], [10, "Hazard 1A (flood)"], [11, "Hazard 1 (land instability)"], [12, "Hazard 2 (flood)"], [13, "Hazard 2 (land instability)"], [14, "Hazard 3 (flood)"], [15, "Hazard 3 (alluvial fan)"], [16, "Hazard 3 (coastal)"]];

// the council's own property layer for a council, with where its valuation reference and address sit
type CouncilLayer = { id: string; name: string; url: string; refField: string; addr: (a: any) => string; asOf: (a: any) => string | null; asOfLabel: (a: any) => string | null; pick?: (rows: any[]) => any[] };
function councilLayer(council: string, matched: string, x: number, y: number, wkid: number): CouncilLayer | null {
  if (council === "DCC") { const u = dccRatesUrl(matched); return u ? { id: "dcc_rates", name: "Dunedin City Council rates", url: u, refField: "VGNumber", addr: (a) => str(a.Formatted_address), asOf: (a) => str(a.Rateable_Year) || null, asOfLabel: (a) => (str(a.Rateable_Year) ? `${str(a.Rateable_Year)} rating year` : null) } : null; }
  if (council === "QLDC") return { id: "qldc_parcels", name: "Queenstown Lakes District Council land parcels and properties", url: pointQuery(QLDC, "Land_Parcels_and_Properties_Data/FeatureServer/0", x, y, wkid), refField: "ASSESSMENT_NO", addr: (a) => str(a.PHYSADDRESS), asOf: () => null, asOfLabel: () => null, pick: (rows) => { const u = rows.filter((a) => str(a.PROPERTY_TYPE_DESC) === "RatingUnit"); return u.length ? u : rows; } };
  if (council === "WDC") return { id: "wdc_parcels", name: "Waitaki District Council parcels", url: pointQuery(WDC, "WDC_PARCELS_view/FeatureServer/0", x, y, wkid), refField: "VALUATION_NO", addr: (a) => str(a.ADDRESS), asOf: () => null, asOfLabel: () => null };
  if (council === "CDC") return { id: "cdc_property", name: "Clutha District Council property (public)", url: pointQuery(CDC, "PropertyPublic/MapServer/0", x, y, wkid), refField: "Assessment_Number", addr: (a) => [str(a.Address), str(a.Suburb)].filter(Boolean).join(", "), asOf: (a) => isoDay(a.Updated), asOfLabel: (a) => { const d = isoDay(a.Updated); return d ? nzDate(d) : null; } };
  return null;
}
// a council record and a valuation reference are the same rating unit when the references match, punctuation and spacing aside;
// a reference with a suffix letter ("26280/29000A") is a different unit from one without
const sameRef = (a: unknown, b: unknown) => !!refKey(a) && refKey(a) === refKey(b);
const orcAddr = (u: any) => [`${str(u?.HouseNumber)}${str(u?.HouseNumberExtension)}`, str(u?.StreetName)].filter(Boolean).join(" ");

// ── the lookup ──
export async function lookup(input: LookupInput, deps: Deps) {
  const asked = String(input.address || "").replace(/\s+/g, " ").trim().slice(0, 300);
  const end = Date.now() + (deps.deadlineMs ?? DEADLINE_MS);
  // every call gets what is left of the deadline, at most one call's timeout
  const get = (url: string) => getJson(url, Object.assign({}, deps, { timeoutMs: Math.max(1, Math.min(deps.timeoutMs ?? CALL_TIMEOUT_MS, end - Date.now())) }));
  const sources: Source[] = []; const values: Value[] = []; const links: { label: string; url: string }[] = []; const info: string[] = [];
  const base = { asked, unit_ref: input.unitRef || null, candidate: input.candidate ?? null };
  const track = (id: string, name: string, url: string, r: any, found: boolean | null, note?: string) => {
    sources.push({ id, name, url, status: !r.ok ? (r.error === "timeout" ? "timeout" : "failed") : found === false ? "none" : "ok", http: r.status, ms: r.ms, note: note || (!r.ok ? r.error : undefined) });
  };
  if (asked.length < 3) return { status: "no_address", ...base, sources, values, links, info };

  // 1. the address and its point (strong matches only; the matched address is always returned)
  const gUrl = geocodeUrl(asked, input.magicKey);
  const g = await get(gUrl);
  const cands = g.ok ? (g.data?.candidates || []).filter((c: any) => c && c.location && Number.isFinite(+c.location.x) && Number.isFinite(+c.location.y)) : [];
  track("orc_locator", "Otago Regional Council address locator", gUrl, g, g.ok ? cands.length > 0 : null);
  if (!g.ok) return { status: g.error === "timeout" ? "slow" : "unavailable", ...base, sources, values, links, info };
  // the same address text at two different places (the same street name in two towns) is two candidates, not one
  const seen = new Set<string>(); const list = cands.slice().sort((a: any, b: any) => (+b.score || 0) - (+a.score || 0))
    .filter((c: any) => { const k = str(c.address).toUpperCase() + "@" + (+c.location.x).toFixed(4) + "," + (+c.location.y).toFixed(4); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((c: any, i: number) => ({ index: i, address: str(c.address), label: str(c.address), score: Math.round((+c.score || 0) * 100) / 100, x: +c.location.x, y: +c.location.y }));
  if (!list.length) return { status: "not_found", ...base, sources, values, links, info };
  const strong = list.filter((c: any) => c.score >= MIN_SCORE);
  const wkid = +(g.data?.spatialReference?.latestWkid || g.data?.spatialReference?.wkid || 4326);
  let best: any = null;
  if (input.candidate != null) {
    best = strong.find((c: any) => c.index === input.candidate) || null;
    if (!best) return { status: "choose", ...base, candidates: await labelled(strong.slice(0, 5)), sources, values, links, info };
  } else {
    if (!strong.length) return { status: "weak", ...base, candidates: list.slice(0, 5).map(({ x: _x, y: _y, ...c }: any) => c), sources, values, links, info };
    if (strong.length > 1 && !input.magicKey && strong[0].score - strong[1].score < 1) return { status: "choose", ...base, candidates: await labelled(strong.slice(0, 5)), sources, values, links, info };
    best = strong[0];
  }
  const { x, y } = best;
  const matched = best.address;
  // candidates whose text is the same get the council area added, so Tim can tell them apart
  async function labelled(cs: any[]) {
    const texts = cs.map((c) => c.address.toUpperCase()); const dup = (t: string) => texts.filter((z) => z === t).length > 1;
    return Promise.all(cs.map(async (c) => {
      let label = c.address;
      if (dup(c.address.toUpperCase())) { const r = await get(pointQuery(ORC, "Otago_Boundaries/MapServer/3", c.x, c.y, wkid)); const b = r.ok ? attrs(r.data)[0] : null; label = `${c.address} (${b ? str(b.Name) : `${c.y.toFixed(3)}, ${c.x.toFixed(3)}`})`; }
      return { index: c.index, address: c.address, label, score: c.score };
    }));
  }

  // 2. at the point, all at once: ORC Properties (every Otago council's roll), LINZ property boundaries, and the ORC hazard maps
  const orcUrl = pointQuery(ORC, "PropertyExternal/MapServer/0", x, y, wkid);
  const linzUrl = pointQuery(LINZ, "LINZ_NZ_Property_Boundaries/FeatureServer/0", x, y, wkid);
  const orcP = get(orcUrl), linzP = get(linzUrl);
  const hazP = orcHazards(x, y, wkid, get, track);
  const orcR = await orcP;
  const orcAll = orcR.ok ? attrs(orcR.data).filter((a) => a.RatingAuthority && String(a.RatingAuthority).toUpperCase() !== "NA") : [];
  // one entry per rating unit
  const orcUnits: any[] = []; orcAll.forEach((a) => { if (!orcUnits.some((u) => sameRef(u.ValuationReference || u.VNZ, a.ValuationReference || a.VNZ))) orcUnits.push(a); });
  track("orc_properties", "Otago Regional Council, ORC Properties", orcUrl, orcR, orcR.ok ? orcUnits.length > 0 : null, orcUnits.length > 1 ? `${orcUnits.length} rating units at this point` : undefined);
  let council = orcUnits.length ? councilId(orcUnits[0].RatingAuthority) : null;
  const linzR: any = await linzP;
  const linzRows = linzR.ok ? attrs(linzR.data) : [];
  if (!council && linzRows.length) council = councilId(linzRows[0].territorial_authority);
  let taName: string | null = null;
  if (!council && !orcUnits.length && !linzRows.length) {
    // last resort: which Otago council the point is in
    const bUrl = pointQuery(ORC, "Otago_Boundaries/MapServer/3", x, y, wkid); const bR = await get(bUrl); const b = bR.ok ? attrs(bR.data)[0] : null;
    track("orc_boundaries", "Otago Regional Council, Otago territorial authorities", bUrl, bR, bR.ok ? !!b : null);
    if (b) council = ["DCC", "QLDC", "WDC", "CDC", "CODC"].includes(str(b.Id)) ? str(b.Id) : councilId(b.Name);
  }

  // 3. the council's own layer (one query), used to settle which rating unit when there are several
  const layer = council ? councilLayer(council, matched, x, y, wkid) : null;
  const layerP = layer ? get(layer.url) : null;
  // only the unit Tim typed counts: the address finder's own match may have picked one flat for him
  const typed = parseUnit(asked);
  let orc: any = null, unitNote: string | null = null;
  const layerR: any = layerP ? await layerP : null;
  const layerRows = layer && layerR?.ok ? (layer.pick ? layer.pick(attrs(layerR.data)) : attrs(layerR.data)) : [];
  if (input.unitRef) {
    orc = orcUnits.find((u) => sameRef(u.ValuationReference || u.VNZ, input.unitRef)) || null;
    if (!orc && orcUnits.length) return { status: "choose_unit", ...base, matched_address: matched, units: unitList(), sources, values, links, info };
  } else if (orcUnits.length > 1) {
    // several rating units here: use one only when the typed unit matches a council record for certain, and that record's
    // valuation reference is exactly one of ORC's units
    if (typed && layer) {
      const hits = layerRows.filter((a) => { const pu = parseUnit(layer.addr(a)); return pu && pu.unit === typed.unit && pu.number === typed.number; });
      const units = hits.map((a) => orcUnits.filter((u) => sameRef(u.ValuationReference || u.VNZ, a[layer.refField]))).filter((m) => m.length === 1).map((m) => m[0]);
      const uniq = units.filter((u, i) => units.findIndex((w) => sameRef(w.ValuationReference, u.ValuationReference)) === i);
      if (uniq.length === 1) { orc = uniq[0]; unitNote = `Matched to unit ${typed.unit} by the council's own address for it.`; }
    }
    if (!orc) return { status: "choose_unit", ...base, matched_address: matched, units: unitList(), sources, values, links, info };
  } else orc = orcUnits[0] || null;
  function unitList() {
    return orcUnits.map((u) => {
      const ref = str(u.ValuationReference || u.VNZ); const c = layer ? layerRows.find((a) => sameRef(a[layer.refField], ref)) : null;
      return { ref, address: (c && layer ? layer.addr(c) : "") || orcAddr(u) || matched, legal: str(u.LegalDescription) || null, title: str(u.CertificateOfTitle) || null };
    });
  }
  const ref = str(orc?.ValuationReference || orc?.VNZ) || null;
  // LINZ: the record for this rating unit; with several and no ORC unit to tie to, Tim chooses
  let linz: any = null;
  if (ref) { linz = linzRows.find((a) => sameRef(a.valuation_reference, ref)) || null; if (!linz && linzRows.length) info.push("The LINZ record at this point doesn't carry this rating unit's valuation reference, so nothing is used from it."); }
  else if (linzRows.length === 1) linz = linzRows[0];
  else if (linzRows.length > 1) {
    if (input.unitRef) linz = linzRows.find((a) => sameRef(a.valuation_reference, input.unitRef)) || null;
    if (!linz) return { status: "choose_unit", ...base, matched_address: matched, units: linzRows.map((a) => ({ ref: str(a.valuation_reference), address: matched, legal: str(a.legal_description) || null, title: str(a.title_no) || null })), sources, values, links, info };
  }
  if (linzR) track("linz_boundaries", "LINZ NZ Property Boundaries", linzUrl, linzR, linzR.ok ? !!linz : null, linzRows.length > 1 ? `${linzRows.length} records at this point` : undefined);
  if (!council && linz) taName = str(linz.territorial_authority) || null;
  const lref = ref || str(linz?.valuation_reference) || null;

  // the council record for this rating unit (cross-checked on its valuation reference)
  let cRow: any = null, cs: any = null;
  if (layer) {
    let note: string | undefined;
    if (!lref) note = "not cross-checked: no valuation reference";
    else { const hit = layerRows.filter((a) => sameRef(a[layer.refField], lref)); cRow = hit[0] || null; if (!cRow && layerRows.length) note = "valuation reference did not match; nothing used from this layer"; }
    track(layer.id, layer.name, layer.url, layerR, layerR.ok ? !!cRow : null, note);
    if (cRow) cs = { id: layer.id, name: layer.name, url: layer.url, at: layerR.at, asOf: layer.asOf(cRow), asOfLabel: layer.asOfLabel(cRow) };
  }
  const unitAddress = (cRow && layer ? layer.addr(cRow) : "") || orcAddr(orc) || null;

  // 4. district plan (Dunedin) at the point, in parallel; the ORC hazards were already asked
  const jobs: Promise<void>[] = []; const dccHaz = { answered: 0, found: 0, at: "" };
  if (council === "DCC") {
    DCC_ZONE_LAYERS.forEach((l) => { const u2 = pointQuery(DCC, `SecondGenerationPlan_Zones/MapServer/${l}`, x, y, wkid); jobs.push(get(u2).then((r) => { const a = r.ok ? attrs(r.data)[0] : null; track(`dcc_zone_${l}`, "Dunedin City Council 2GP zones", u2, r, r.ok ? !!a : null); if (a && !values.some((v) => v.key === "zone")) { const z = [str(a.Zone), str(a.Sub_Zone)].filter(Boolean).join(": ") || str(a.Name); if (z) values.push(mk("zone", "Plan and hazards", "District plan zone (2GP)", z, `The district plan map shows ${z}.`, "zone", null, "dcc_2gp", "Dunedin City Council, Second Generation District Plan (2GP)", u2, null, null, r.at, (str(a.Plan_Ref) ? `${str(a.Plan_Ref)}. ` : "") + LIM_NOTE)); } })); });
    DCC_HAZ_LAYERS.forEach(([l, nm]) => { const u2 = pointQuery(DCC, `SecondGenerationPlan_OverlayZones/MapServer/${l}`, x, y, wkid); jobs.push(get(u2).then((r) => { const a = r.ok ? attrs(r.data)[0] : null; track(`dcc_haz_${l}`, `Dunedin City Council 2GP overlay: ${nm}`, u2, r, r.ok ? !!a : null); if (r.ok) { dccHaz.answered++; dccHaz.at = r.at; } if (a) { dccHaz.found++; const cat = str(a.Category); values.push(mk(`hazard_dcc_${l}`, "Plan and hazards", `2GP hazard overlay: ${nm}`, nm + (cat ? ` (${cat})` : ""), `The district plan map shows ${nm}${cat ? `, ${cat}` : ""}.`, "hazard", null, "dcc_2gp", "Dunedin City Council, Second Generation District Plan (2GP)", u2, null, null, r.at, (str(a.Plan_Ref) ? `${str(a.Plan_Ref)}. ` : "") + LIM_NOTE)); } })); });
  }
  if (council === "WDC" && WDC_ZONE_ON) {
    const zu = pointQuery(WDC, "WDC_ODP_Zone_WFL1/FeatureServer/7", x, y, wkid);
    jobs.push(get(zu).then((r) => { const a = r.ok ? attrs(r.data)[0] : null; track("wdc_zone", "Waitaki District Council operative district plan zones", zu, r, r.ok ? !!a : null); if (a) { const z = str(a.ZONE_DESC) || str(a.ZONE); if (z) values.push(mk("zone", "Plan and hazards", "District plan zone (operative plan)", z, `The district plan map shows ${z}.`, "zone", null, "wdc_zone", "Waitaki District Council, operative district plan", zu, null, null, r.at, LIM_NOTE)); } }));
  }
  const [hz] = await Promise.all([hazP, ...jobs]);

  // ORC hazards apply in Otago only: not for the Canterbury part of Waitaki, nor outside Otago
  const canterbury = council === "WDC" && cRow && /canterbury/i.test(str(cRow.REGIONAL_CNCL));
  const inOtago = !!(council && council in COUNCILS) && !canterbury;
  if (canterbury) info.push("This property is in the Canterbury part of Waitaki, so the Otago Regional Council's hazard maps don't cover it.");
  if (inOtago) {
    hz.values.forEach((v) => values.push(v));
    if (hz.none.length) info.push(`The regional council's ${hz.none.join(" and ")} maps show nothing at this point. ${LIM_NOTE}`);
    info.push(`Not checked here: ${ORC_HAZARDS_OFF.map((h) => h.label).join(", ")}. Check the regional council's hazard maps and the LIM. ${LIM_NOTE}`);
  }
  if (council === "DCC" && dccHaz.answered === DCC_HAZ_LAYERS.length && !dccHaz.found) values.push(mk("hazard_dcc_none", "Plan and hazards", "2GP hazard overlays", "None mapped at this point", "The district plan map shows no hazard overlay at this point.", "hazard", null, "dcc_2gp", "Dunedin City Council, Second Generation District Plan (2GP)", `${DCC}/SecondGenerationPlan_OverlayZones/MapServer`, null, null, dccHaz.at, LIM_NOTE));
  if (council === "WDC" && !WDC_ZONE_ON) info.push(`The Waitaki District Council's zone isn't checked here yet. Open the council's page for it. ${LIM_NOTE}`);

  // 5. the values, council first, then ORC, then LINZ; the others shown beside for comparison
  const orcAt = orcR.at, orcAsOf = isoDay(orc?.UpdateDate), orcAsOfLabel = orcAsOf ? nzDate(orcAsOf) : null;
  const ORCN = "Otago Regional Council, ORC Properties", LINZN = "LINZ NZ Property Boundaries";
  type Cand = { v: string | number; display: string; src: string; name: string; url: string; at: string; asOf: string | null; asOfLabel: string | null };
  const pick = (key: string, group: string, label: string, kind: string, field: string | null, cands2: (Cand | null)[], note: (c: Cand) => string, same: (a: Cand, b: Cand) => boolean) => {
    const ok = cands2.filter((c): c is Cand => !!c && c.v !== "" && c.v != null);
    if (!ok.length) return; const [first, ...rest] = ok;
    const v = mk(key, group, label, first.v, first.display, kind, field, first.src, first.name, first.url, first.asOf, first.asOfLabel, first.at, note(first));
    v.also = rest.filter((c) => !same(first, c)).map((c) => ({ display: c.display, source_name: c.name, as_of_label: c.asOfLabel }));
    values.push(v);
  };
  const sameText = (a: Cand, b: Cand) => str(a.v).toLowerCase().replace(/[^a-z0-9]/g, "") === str(b.v).toLowerCase().replace(/[^a-z0-9]/g, "");
  const sameNum = (a: Cand, b: Cand) => Math.round(+a.v) === Math.round(+b.v);
  const sameRefC = (a: Cand, b: Cand) => sameRef(a.v, b.v);
  const C = (v: any, display: string, src: any): Cand | null => (src && v != null && v !== "" ? { v, display, src: src.id, name: src.name, url: src.url, at: src.at, asOf: src.asOf, asOfLabel: src.asOfLabel } : null);
  const orcS = orc ? { id: "orc_properties", name: ORCN, url: orcUrl, at: orcAt, asOf: orcAsOf, asOfLabel: orcAsOfLabel } : null;
  const linzS = linz ? { id: "linz_boundaries", name: LINZN, url: linzUrl, at: linzR.at, asOf: null, asOfLabel: null } : null;
  const cr = cRow as any;
  const moneyC = (n: number | null, s: any) => (n == null || n <= 0 ? null : C(n, dollars(n), s));
  const areaC = (n: number | null, s: any) => (n == null || n <= 0 ? null : C(Math.round(n), m2(n), s));
  const textC = (t: unknown, s: any) => (str(t) ? C(str(t), str(t), s) : null);

  pick("valuation_ref", "Title and land", "Valuation reference", "fact", null, [textC(orc?.ValuationReference || orc?.VNZ, orcS), textC(linz?.valuation_reference, linzS)], () => "", sameRefC);
  // the title: LINZ, then the council's own; ORC's single title is a hint only, so it is shown beside but never offered
  pick("title_ref", "Title and land", "Title reference", "fact", "title_ref", [textC(linz?.title_no, linzS), textC(council === "WDC" ? cr?.CERT_TITLE : council === "QLDC" ? cr?.titles : null, cs)], () => "The title document is the authority.", sameText);
  const tv = values.find((v) => v.key === "title_ref"), ot = textC(orc?.CertificateOfTitle, orcS);
  if (tv && ot && digits(ot.v) && !digits(tv.value).includes(digits(ot.v).replace(/^0+/, ""))) tv.also.push({ display: ot.display + " (a hint only)", source_name: ot.name, as_of_label: ot.asOfLabel });
  pick("title_type", "Title and land", "Title type", "fact", null, [textC(linz?.title_type, linzS)], () => "", sameText);
  pick("legal_description", "Title and land", "Legal description", "fact", "legal_description", [textC(linz?.legal_description, linzS), textC(council === "QLDC" ? cr?.appellation : council === "WDC" ? cr?.TITLE : council === "CDC" ? cr?.Legal_Description : null, cs), textC(orc?.LegalDescription, orcS)], () => "", sameText);
  const cHa = council === "DCC" ? num(cr?.Area_Ha) : council === "WDC" ? num(cr?.LAND_AREA) : council === "CDC" ? num(cr?.Hectares) : null;
  pick("land_area", "Title and land", "Land area", "fact", "pLand", [areaC(cHa != null ? cHa * 10000 : null, cs), areaC(num(orc?.Hectares) != null ? num(orc?.Hectares)! * 10000 : null, orcS), areaC(num(linz?.area), linzS)], () => "Areas can differ between sources; the title is the authority.", sameNum);
  // the council's rating valuation (DCC's "Rateable_Value" is its capital value)
  const cCV = council === "DCC" ? num(cr?.Rateable_Value) : council === "QLDC" ? num(cr?.CAPITAL_VALUE) : council === "WDC" ? num(cr?.CV) : council === "CDC" ? num(cr?.Capital_Value) : null;
  const cLV = council === "QLDC" ? num(cr?.LAND_VALUE) : council === "WDC" ? num(cr?.LV) : council === "CDC" ? num(cr?.Land_Value) : null;
  const vn = (c: Cand) => valNote(c.asOfLabel), rn = (c: Cand) => ratesNote(c.asOfLabel);
  pick("capital_value", "Council rating valuation", "Capital value", "valuation", null, [moneyC(cCV, cs), moneyC(num(orc?.CapitalValue), orcS)], vn, sameNum);
  pick("land_value", "Council rating valuation", "Land value", "valuation", null, [moneyC(cLV, cs), moneyC(num(orc?.LandValue), orcS)], vn, sameNum);
  const cIV = council === "QLDC" ? num(cr?.IMPROVEMENTS_VALUE) : null;
  if (cIV != null && cIV > 0) pick("improvements_value", "Council rating valuation", "Improvements value", "valuation", null, [moneyC(cIV, cs)], vn, sameNum);
  else {
    // worked out as capital value less land value, only from one source's own pair
    const pair = cCV != null && cLV != null && cs ? { cv: cCV, lv: cLV, s: cs } : num(orc?.CapitalValue) != null && num(orc?.LandValue) != null && orcS ? { cv: num(orc.CapitalValue)!, lv: num(orc.LandValue)!, s: orcS } : null;
    if (pair && pair.cv - pair.lv > 0) pick("improvements_value", "Council rating valuation", "Improvements value (worked out)", "valuation", null, [moneyC(pair.cv - pair.lv, pair.s)], (c) => `Worked out as capital value less land value. ${valNote(c.asOfLabel)}`, sameNum);
  }
  const cRates = council === "DCC" ? num(cr?.Total_rates) : council === "CDC" ? num(cr?.Rates_Struck) : null;
  pick("rates_council", "Rates", `${council ? COUNCILS[council].name : "District"} rates`, "rates", null, [moneyC(cRates, cs)], rn, sameNum);
  pick("rates_orc", "Rates", "Otago Regional Council rates", "rates", null, [moneyC(num(orc?.AnnualLevy), orcS)], rn, sameNum);
  const use = council === "DCC" ? str(cr?.Land_Use_Descript) || str(cr?.Land_Use) : council === "QLDC" ? str(cr?.LANDUSEDESCRIPTION) : "";
  pick("land_use", "Title and land", "Council land use", "hint", null, [textC(use, cs)], () => "A hint only. The property type is yours to choose.", sameText);

  // 6. links to the council's own pages (never scraped), and what the council doesn't publish
  if (council === "WDC" && cr && /^https:\/\/[a-z0-9.-]*waitaki\.govt\.nz\//i.test(str(cr.Property_Details))) links.push({ label: "Open this property on the Waitaki District Council's rating page", url: str(cr.Property_Details) });
  else if (council && COUNCILS[council]?.search) links.push({ label: `Open the ${COUNCILS[council].name}'s property search`, url: COUNCILS[council].search! });
  if (council === "CODC") info.push("Central Otago District Council doesn't publish its zone map or improvements value as data. Open the council's property search for those.");
  if (council === "QLDC") info.push("Queenstown Lakes District Council's zoning is split across its operative and proposed plans, so no zone is shown. Check the council's maps.");
  if (council === "CDC") info.push("Clutha District Council's public property layer is updated less often than its rates; check the date beside each value.");
  if (!council && taName) info.push(`This property is in ${taName}, outside the councils this lookup knows. Only the LINZ record is shown.`);
  if (unitNote) info.unshift(unitNote);
  info.push("Floor area, year built, bedrooms and owners' names are not published by councils. They come from the title, the LIM and your inspection.");
  const credits = ["Otago Regional Council"]; if (linz) credits.push(LINZ_CREDIT); if (council && cs) credits.push(COUNCILS[council].name);
  const order = ["Title and land", "Council rating valuation", "Rates", "Plan and hazards"];
  values.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  return {
    status: values.length ? "ok" : "not_found", ...base, matched_address: matched, unit_address: unitAddress, units_here: orcUnits.length,
    score: best.score, point: { x, y, wkid },
    council: council ? COUNCILS[council].name : taName, council_id: council, valuation_ref: lref,
    values, sources, links, info, credits,
  };
}

// ORC hazards that are switched on, at the point. Liquefaction: the two verified layers, asked directly (their names read alongside);
// tsunami: the layers the service itself names as zones.
async function orcHazards(x: number, y: number, wkid: number, get: (u: string) => Promise<any>, track: (id: string, name: string, url: string, r: any, found: boolean | null, note?: string) => void) {
  const out: Value[] = []; const none: string[] = [];
  await Promise.all(ORC_HAZARDS_ON.map(async (h) => {
    const meta = `${ORC_HZ}/${h.svc}/FeatureServer?f=json`;
    let layers: { id: number; name: string }[];
    if (h.layers) {
      const ids = h.layers;
      const [m, ...rs] = await Promise.all([get(meta), ...ids.map((id) => get(pointQuery(ORC_HZ, `${h.svc}/FeatureServer/${id}`, x, y, wkid)))]);
      const names: any = {}; (m.ok ? m.data?.layers || [] : []).forEach((l: any) => { names[+l.id] = str(l.name); });
      layers = ids.map((id) => ({ id, name: names[id] || h.label }));
      return finish(h, layers, rs);
    }
    const m = await get(meta);
    if (!m.ok) { track(`orc_hz_${h.svc}`, `Otago Regional Council: ${h.label}`, meta, m, null); return; }
    layers = (m.data?.layers || []).map((l: any) => ({ id: +l.id, name: str(l.name) })).filter((l: any) => Number.isInteger(l.id) && (!h.nameRe || h.nameRe.test(l.name))).slice(0, 3);
    if (!layers.length) { track(`orc_hz_${h.svc}`, `Otago Regional Council: ${h.label}`, meta, m, null, "no zone layer named in the service"); return; }
    const rs = await Promise.all(layers.map((l) => get(pointQuery(ORC_HZ, `${h.svc}/FeatureServer/${l.id}`, x, y, wkid))));
    return finish(h, layers, rs);
  }));
  function finish(h: any, layers: { id: number; name: string }[], rs: any[]) {
    let any = false, answered = 0;
    layers.forEach((l, i) => {
      const r = rs[i], u = pointQuery(ORC_HZ, `${h.svc}/FeatureServer/${l.id}`, x, y, wkid), rows = r.ok ? attrs(r.data) : [];
      track(`orc_hz_${h.svc}_${l.id}`, `Otago Regional Council: ${h.label}${l.name && l.name !== h.label ? ` (${l.name})` : ""}`, u, r, r.ok ? rows.length > 0 : null);
      if (r.ok) answered++;
      if (rows.length) { any = true; const s = summarise(rows[0]); const shown = s || l.name || h.label; out.push(mk(`hazard_orc_${h.svc.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30)}_${l.id}`, "Plan and hazards", `${h.label} (ORC)`, shown, `The regional council's map shows: ${shown}.`, "hazard", null, `orc_hz_${h.svc}`, `Otago Regional Council, ${h.label.toLowerCase()} map`, u, null, null, r.at, LIM_NOTE)); }
    });
    if (!any && answered === layers.length && layers.length) none.push(h.label.toLowerCase());
  }
  return { values: out, none };
}

function mk(key: string, group: string, label: string, value: string | number, display: string, kind: string, field: string | null, source: string, source_name: string, source_url: string, as_of: string | null, as_of_label: string | null, fetched_at: string, note: string): Value {
  return { key, group, label, value, display, kind, field, source, source_name, source_url, as_of, as_of_label, fetched_at, note, also: [] };
}

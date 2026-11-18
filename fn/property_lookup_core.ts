// Public council records for one property (Tim, 18 November 2026). Pure: no Deno, no database, no imports. Every upstream call
// goes through the fetch function passed in, so tests run it with recorded answers. Only the keyless public services verified
// in the council research are used, by exact host, over https, with no redirects, a size cap and a timeout on every call.
// Values are suggestions: each carries its source, the source's own date where it gives one, and when it was fetched.
// Rating valuations are labelled as the council's, never as a market value. Hazards and zones say "Not a substitute for a LIM."
// Erasable TypeScript only (types, no enums), so Node can import this file directly for the unit test.

export type FetchFn = (url: string, init?: any) => Promise<any>;
export type Deps = { fetch: FetchFn; now?: () => Date; timeoutMs?: number };
export type Value = {
  key: string; group: string; label: string; value: string | number; display: string; kind: string;
  field: string | null; source: string; source_name: string; source_url: string; as_of: string | null; as_of_label: string | null;
  fetched_at: string; note: string; also: { display: string; source_name: string; as_of_label: string | null }[];
};
export type Source = { id: string; name: string; url: string; status: string; http?: number; ms?: number; note?: string };

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
const MAX_BYTES = 2_000_000;
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

// ── small helpers ──
export const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v)).replace(/\s+/g, " ");
const num = (v: unknown) => { if (v == null || v === "") return null; const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : null; };
export function dollars(n: number) { const cents = Math.round(n * 100) % 100 !== 0; return "$" + n.toLocaleString("en-NZ", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 }); }
export const m2 = (n: number) => Math.round(n).toLocaleString("en-NZ") + " m²";
export function nzDate(ms: number | string | Date) { const d = new Date(ms as any); return isNaN(d.getTime()) ? null : d.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "Pacific/Auckland" }); }
const isoDay = (ms: unknown) => { const n = num(ms); if (n == null || n <= 0) return null; const d = new Date(n); return isNaN(d.getTime()) ? null : d.toISOString(); };
function attrs(data: any): any[] { return Array.isArray(data?.features) ? data.features.map((f: any) => { const a: any = {}; Object.entries(f?.attributes || {}).forEach(([k, v]) => { a[k] = typeof v === "string" ? v.trim() : v; }); return a; }) : []; }
export function valNote(asOfLabel: string | null) { return `Council rating valuation (as at ${asOfLabel || "date not given"}), not a market value.`; }

// one GET to an allowed host: https only, no redirects, size cap, timeout. Never throws.
export async function getJson(url: string, deps: Deps): Promise<{ ok: boolean; data?: any; status?: number; ms: number; error?: string; at: string }> {
  const t0 = Date.now(); const at = () => (deps.now ? deps.now() : new Date()).toISOString();
  let u: URL; try { u = new URL(url); } catch { return { ok: false, ms: 0, error: "bad url", at: at() }; }
  if (u.protocol !== "https:" || !HOSTS.includes(u.hostname)) return { ok: false, ms: 0, error: "host not allowed", at: at() };
  const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
  const ms = deps.timeoutMs ?? 5000;
  let timer: any; const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => { try { ac?.abort(); } catch { /* */ } rej(new Error("timeout")); }, ms); });
  try {
    const res: any = await Promise.race([deps.fetch(url, { redirect: "manual", signal: ac?.signal, headers: { "User-Agent": UA, Accept: "application/json" } }), timeout]);
    const status = Number(res?.status ?? 0);
    if (status >= 300 && status < 400) return { ok: false, status, ms: Date.now() - t0, error: "redirect refused", at: at() };
    if (!res?.ok) return { ok: false, status, ms: Date.now() - t0, error: "http " + status, at: at() };
    const text: string = await Promise.race([res.text(), timeout]);
    if (text.length > MAX_BYTES) return { ok: false, status, ms: Date.now() - t0, error: "too large", at: at() };
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
// DCC rates by address text, as verified: Formatted_address LIKE '100 GLADSTONE%' (house number and the first word of the street)
export function dccRatesUrl(matched: string) {
  const first = matched.split(",")[0].toUpperCase().replace(/[^A-Z0-9/ -]/g, " ").replace(/\s+/g, " ").trim().split(" ");
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

// ── ORC hazard services (names verified). Layer ids are read from each service's own description, except liquefaction, where
//    only the two verified layers (65 and 66) are asked. ──
export const ORC_HAZARDS: [string, string, number[] | null][] = [
  ["FloodHazard_Otago_2024", "Flood hazard", null],
  ["Liquefaction_and_ground_class_Otago", "Liquefaction and ground class", [65, 66]],
  ["TsunamiEvacuationZones", "Tsunami evacuation zone", null],
  ["HAIL", "Contaminated land register (HAIL)", null],
  ["Landslides_OtagoRegion2020", "Landslides", null],
  ["Coastal_erosion", "Coastal erosion", null],
  ["Alluvial_Fans_Otago", "Alluvial fans", null],
];
const SKIP_ATTR = /objectid|globalid|^fid$|^id$|shape|^st_|created|edited|last_?edit|date|^area$|^length$/i;
export function summarise(a: any) {
  const seen = new Set<string>(); const parts: string[] = [];
  for (const [k, v] of Object.entries(a || {})) {
    if (SKIP_ATTR.test(k) || typeof v !== "string") continue; const s = v.replace(/\s+/g, " ").trim();
    if (!s || s.length > 120 || /^https?:/i.test(s) || seen.has(s.toLowerCase())) continue; seen.add(s.toLowerCase()); parts.push(s); if (parts.length >= 4) break;
  }
  return parts.join("; ");
}
const DCC_ZONE_LAYERS = [0, 1, 2, 3, 4, 5, 6];
export const DCC_HAZ_LAYERS: [number, string][] = [[9, "Hazard 1 (flood)"], [10, "Hazard 1A (flood)"], [11, "Hazard 1 (land instability)"], [12, "Hazard 2 (flood)"], [13, "Hazard 2 (land instability)"], [14, "Hazard 3 (flood)"], [15, "Hazard 3 (alluvial fan)"], [16, "Hazard 3 (coastal)"]];

// ── the lookup ──
export async function lookup(input: { address: string; magicKey?: string }, deps: Deps) {
  const asked = String(input.address || "").replace(/\s+/g, " ").trim().slice(0, 300);
  const sources: Source[] = []; const values: Value[] = []; const links: { label: string; url: string }[] = []; const info: string[] = [];
  const base = { asked, credits: [] as string[] };
  const track = (id: string, name: string, url: string, r: any, found: boolean | null, note?: string) => {
    sources.push({ id, name, url, status: !r.ok ? (r.error === "timeout" ? "timeout" : "failed") : found === false ? "none" : "ok", http: r.status, ms: r.ms, note: note || (!r.ok ? r.error : undefined) });
  };
  if (asked.length < 3) return { status: "no_address", ...base, sources, values, links, info };

  // 1. the address and its point (strong matches only; the matched address is always returned)
  const gUrl = geocodeUrl(asked, input.magicKey);
  const g = await getJson(gUrl, deps);
  const cands = g.ok ? (g.data?.candidates || []).filter((c: any) => c && c.location && Number.isFinite(+c.location.x) && Number.isFinite(+c.location.y)) : [];
  track("orc_locator", "Otago Regional Council address locator", gUrl, g, g.ok ? cands.length > 0 : null);
  if (!g.ok) return { status: "unavailable", ...base, sources, values, links, info };
  const seen = new Set<string>(); const list = cands.slice().sort((a: any, b: any) => (+b.score || 0) - (+a.score || 0))
    .filter((c: any) => { const k = str(c.address).toUpperCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((c: any) => ({ address: str(c.address), score: Math.round((+c.score || 0) * 100) / 100, x: +c.location.x, y: +c.location.y }));
  if (!list.length) return { status: "not_found", ...base, sources, values, links, info };
  const strong = list.filter((c: any) => c.score >= MIN_SCORE);
  if (!strong.length) return { status: "weak", ...base, candidates: list.slice(0, 5), sources, values, links, info };
  if (strong.length > 1 && !input.magicKey && strong[0].score - strong[1].score < 1) return { status: "choose", ...base, candidates: strong.slice(0, 5), sources, values, links, info };
  const best = strong[0];
  const wkid = +(g.data?.spatialReference?.latestWkid || g.data?.spatialReference?.wkid || 4326);
  const { x, y } = best;
  const matched = best.address;

  // 2. the property: ORC Properties (Otago, every council's roll) and LINZ property boundaries, at the point
  const orcUrl = pointQuery(ORC, "PropertyExternal/MapServer/0", x, y, wkid);
  const linzUrl = pointQuery(LINZ, "LINZ_NZ_Property_Boundaries/FeatureServer/0", x, y, wkid);
  const orcP = getJson(orcUrl, deps), linzP = getJson(linzUrl, deps);
  const orcR = await orcP;
  const orcRows = orcR.ok ? attrs(orcR.data).filter((a) => a.RatingAuthority && String(a.RatingAuthority).toUpperCase() !== "NA") : [];
  const orc = orcRows[0] || null;
  track("orc_properties", "Otago Regional Council, ORC Properties", orcUrl, orcR, orcR.ok ? !!orc : null);
  let council = orc ? councilId(orc.RatingAuthority) : null;
  let linzR: any = null, linz: any = null;
  const needLinz = async () => { if (!linzR) { linzR = await linzP; linz = linzR.ok ? attrs(linzR.data)[0] || null : null; } return linz; };
  if (!council) { await needLinz(); council = linz ? councilId(linz.territorial_authority) : null; }
  let taName: string | null = null;
  if (!council && !orc && !linz) {
    // last resort: which Otago council the point is in
    const bUrl = pointQuery(ORC, "Otago_Boundaries/MapServer/3", x, y, wkid); const bR = await getJson(bUrl, deps); const b = bR.ok ? attrs(bR.data)[0] : null;
    track("orc_boundaries", "Otago Regional Council, Otago territorial authorities", bUrl, bR, bR.ok ? !!b : null);
    if (b) { council = ["DCC", "QLDC", "WDC", "CDC", "CODC"].includes(str(b.Id)) ? str(b.Id) : councilId(b.Name); }
  }
  const ref = str(orc?.ValuationReference || orc?.VNZ) || null;

  // 3. the council's own layer (cross-checked on the valuation reference), the district plan, and ORC hazards, all at once
  const fetchedNote = (r: any) => r.at;
  const jobs: Promise<void>[] = [];
  const dccHaz = { answered: 0, found: 0, at: "" };
  let cRow: any = null, cSrc: { id: string; name: string; url: string; at: string; asOf: string | null; asOfLabel: string | null } | null = null;
  const crossCheck = (rows: any[], refField: string) => {
    if (!ref) return { row: null, note: "not cross-checked: no valuation reference from ORC" };
    const hit = rows.filter((a) => digits(a[refField]) && digits(a[refField]) === digits(ref));
    return hit.length ? { row: hit[0], note: hit.length > 1 ? `${hit.length} records match; the first is shown` : undefined } : { row: null, note: rows.length ? "valuation reference did not match ORC's; nothing used from this layer" : undefined };
  };
  if (council === "DCC") {
    const u = dccRatesUrl(matched);
    if (u) jobs.push(getJson(u, deps).then((r) => { const rows = r.ok ? attrs(r.data) : []; const c = crossCheck(rows, "VGNumber"); track("dcc_rates", "Dunedin City Council rates", u, r, r.ok ? !!c.row : null, c.note || (r.ok ? undefined : r.error)); if (c.row) { cRow = c.row; cSrc = { id: "dcc_rates", name: "Dunedin City Council rates", url: u, at: fetchedNote(r), asOf: str(c.row.Rateable_Year) || null, asOfLabel: str(c.row.Rateable_Year) ? `${str(c.row.Rateable_Year)} rating year` : null }; } }));
    DCC_ZONE_LAYERS.forEach((l) => { const u2 = pointQuery(DCC, `SecondGenerationPlan_Zones/MapServer/${l}`, x, y, wkid); jobs.push(getJson(u2, deps).then((r) => { const a = r.ok ? attrs(r.data)[0] : null; track(`dcc_zone_${l}`, "Dunedin City Council 2GP zones", u2, r, r.ok ? !!a : null); if (a && !values.some((v) => v.key === "zone")) { const z = [str(a.Zone), str(a.Sub_Zone)].filter(Boolean).join(": ") || str(a.Name); if (z) values.push(mk("zone", "Plan and hazards", "District plan zone (2GP)", z, `The district plan map shows ${z}.`, "zone", null, "dcc_2gp", "Dunedin City Council, Second Generation District Plan (2GP)", u2, null, null, r.at, (str(a.Plan_Ref) ? `${str(a.Plan_Ref)}. ` : "") + LIM_NOTE)); } })); });
    DCC_HAZ_LAYERS.forEach(([l, nm]) => { const u2 = pointQuery(DCC, `SecondGenerationPlan_OverlayZones/MapServer/${l}`, x, y, wkid); jobs.push(getJson(u2, deps).then((r) => { const a = r.ok ? attrs(r.data)[0] : null; track(`dcc_haz_${l}`, `Dunedin City Council 2GP overlay: ${nm}`, u2, r, r.ok ? !!a : null); if (r.ok) { dccHaz.answered++; dccHaz.at = r.at; } if (a) { dccHaz.found++; const cat = str(a.Category); values.push(mk(`hazard_dcc_${l}`, "Plan and hazards", `2GP hazard overlay: ${nm}`, nm + (cat ? ` (${cat})` : ""), `The district plan map shows ${nm}${cat ? `, ${cat}` : ""}.`, "hazard", null, "dcc_2gp", "Dunedin City Council, Second Generation District Plan (2GP)", u2, null, null, r.at, (str(a.Plan_Ref) ? `${str(a.Plan_Ref)}. ` : "") + LIM_NOTE)); } })); });
  } else if (council === "QLDC") {
    const u = pointQuery(QLDC, "Land_Parcels_and_Properties_Data/FeatureServer/0", x, y, wkid);
    jobs.push(getJson(u, deps).then((r) => { const rows = r.ok ? attrs(r.data) : []; const units = rows.filter((a) => str(a.PROPERTY_TYPE_DESC) === "RatingUnit"); const c = crossCheck(units.length ? units : rows, "ASSESSMENT_NO"); track("qldc_parcels", "Queenstown Lakes District Council land parcels and properties", u, r, r.ok ? !!c.row : null, c.note || (r.ok ? undefined : r.error)); if (c.row) { cRow = c.row; cSrc = { id: "qldc_parcels", name: "Queenstown Lakes District Council land parcels and properties", url: u, at: r.at, asOf: null, asOfLabel: null }; } }));
  } else if (council === "WDC") {
    const u = pointQuery(WDC, "WDC_PARCELS_view/FeatureServer/0", x, y, wkid);
    jobs.push(getJson(u, deps).then((r) => { const rows = r.ok ? attrs(r.data) : []; const c = crossCheck(rows, "VALUATION_NO"); track("wdc_parcels", "Waitaki District Council parcels", u, r, r.ok ? !!c.row : null, c.note || (r.ok ? undefined : r.error)); if (c.row) { cRow = c.row; cSrc = { id: "wdc_parcels", name: "Waitaki District Council parcels", url: u, at: r.at, asOf: null, asOfLabel: null }; } }));
    const zu = pointQuery(WDC, "WDC_ODP_Zone_WFL1/FeatureServer/7", x, y, wkid);
    jobs.push(getJson(zu, deps).then((r) => { const a = r.ok ? attrs(r.data)[0] : null; track("wdc_zone", "Waitaki District Council operative district plan zones", zu, r, r.ok ? !!a : null); if (a) { const z = str(a.ZONE_DESC) || str(a.ZONE); if (z) values.push(mk("zone", "Plan and hazards", "District plan zone (operative plan)", z, `The district plan map shows ${z}.`, "zone", null, "wdc_zone", "Waitaki District Council, operative district plan", zu, null, null, r.at, (str(a.ZONE_STATUS) ? `Status: ${str(a.ZONE_STATUS).toLowerCase()}. ` : "") + "A proposed plan is also published. " + LIM_NOTE)); } }));
  } else if (council === "CDC") {
    const u = pointQuery(CDC, "PropertyPublic/MapServer/0", x, y, wkid);
    jobs.push(getJson(u, deps).then((r) => { const rows = r.ok ? attrs(r.data) : []; const c = crossCheck(rows, "Assessment_Number"); track("cdc_property", "Clutha District Council property (public)", u, r, r.ok ? !!c.row : null, c.note || (r.ok ? undefined : r.error)); if (c.row) { cRow = c.row; const d = isoDay(c.row.Updated); cSrc = { id: "cdc_property", name: "Clutha District Council property (public)", url: u, at: r.at, asOf: d, asOfLabel: d ? nzDate(d) : null }; } }));
  }
  // ORC hazards anywhere in Otago (dropped below for the Canterbury part of Waitaki)
  const hazNone: string[] = [];
  if (council || orc) {
    for (const [svc, label, fixed] of ORC_HAZARDS) {
      jobs.push((async () => {
        const meta = `${ORC_HZ}/${svc}/FeatureServer?f=json`;
        const m = await getJson(meta, deps);
        if (!m.ok) { track(`orc_hz_${svc}`, `Otago Regional Council: ${label}`, meta, m, null); return; }
        const layers: { id: number; name: string }[] = (m.data?.layers || []).map((l: any) => ({ id: +l.id, name: str(l.name) })).filter((l: any) => Number.isInteger(l.id));
        const want = (fixed ? layers.filter((l) => fixed.includes(l.id)).concat(fixed.filter((id) => !layers.some((l) => l.id === id)).map((id) => ({ id, name: label }))) : layers.slice(0, 3));
        let any = false, answered = 0;
        await Promise.all(want.map(async (l) => {
          const u = pointQuery(ORC_HZ, `${svc}/FeatureServer/${l.id}`, x, y, wkid); const r = await getJson(u, deps);
          const rows = r.ok ? attrs(r.data) : []; track(`orc_hz_${svc}_${l.id}`, `Otago Regional Council: ${label}${l.name && l.name !== label ? ` (${l.name})` : ""}`, u, r, r.ok ? rows.length > 0 : null);
          if (r.ok) answered++;
          if (rows.length) { any = true; const s = summarise(rows[0]); const shown = s || l.name || label; values.push(mk(`hazard_orc_${svc.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30)}_${l.id}`, "Plan and hazards", `${label} (ORC)`, shown, `The regional council's map shows: ${shown}.`, "hazard", null, `orc_hz_${svc}`, `Otago Regional Council, ${label.toLowerCase()} map`, u, null, null, r.at, LIM_NOTE)); }
        }));
        if (!any && answered === want.length && want.length) hazNone.push(label.charAt(0).toLowerCase() + label.slice(1));
      })());
    }
  }
  await Promise.all(jobs);
  await needLinz();
  if (linzR) track("linz_boundaries", "LINZ NZ Property Boundaries", linzUrl, linzR, linzR.ok ? !!linz : null);
  if (!council && linz) taName = str(linz.territorial_authority) || null;

  // Canterbury part of Waitaki: ORC's hazards and rates don't apply
  const canterbury = council === "WDC" && cRow && /canterbury/i.test(str(cRow.REGIONAL_CNCL));
  if (canterbury) { for (let i = values.length - 1; i >= 0; i--) if (values[i].key.startsWith("hazard_orc_")) values.splice(i, 1); hazNone.length = 0; info.push("This property is in the Canterbury part of Waitaki, so the Otago Regional Council's hazard maps don't cover it."); }
  // a plain "none mapped" line only when every 2GP hazard overlay answered and none applies
  if (council === "DCC" && dccHaz.answered === DCC_HAZ_LAYERS.length && !dccHaz.found) values.push(mk("hazard_dcc_none", "Plan and hazards", "2GP hazard overlays", "None mapped at this point", "The district plan map shows no hazard overlay at this point.", "hazard", null, "dcc_2gp", "Dunedin City Council, Second Generation District Plan (2GP)", `${DCC}/SecondGenerationPlan_OverlayZones/MapServer`, null, null, dccHaz.at, LIM_NOTE));
  if (hazNone.length) info.push(`The regional council's maps show nothing at this point for: ${hazNone.join(", ")}. ${LIM_NOTE}`);

  // 4. the values, council first, then ORC, then LINZ; the others shown beside for comparison
  const orcAt = orcR.at, orcAsOf = isoDay(orc?.UpdateDate), orcAsOfLabel = orcAsOf ? nzDate(orcAsOf) : null;
  const ORCN = "Otago Regional Council, ORC Properties", LINZN = "LINZ NZ Property Boundaries";
  type Cand = { v: string | number; display: string; src: string; name: string; url: string; at: string; asOf: string | null; asOfLabel: string | null };
  const pick = (key: string, group: string, label: string, kind: string, field: string | null, cs: (Cand | null)[], note: (c: Cand) => string, same: (a: Cand, b: Cand) => boolean) => {
    const ok = cs.filter((c): c is Cand => !!c && c.v !== "" && c.v != null);
    if (!ok.length) return; const [first, ...rest] = ok;
    const v = mk(key, group, label, first.v, first.display, kind, field, first.src, first.name, first.url, first.asOf, first.asOfLabel, first.at, note(first));
    v.also = rest.filter((c) => !same(first, c)).map((c) => ({ display: c.display, source_name: c.name, as_of_label: c.asOfLabel }));
    values.push(v);
  };
  const sameText = (a: Cand, b: Cand) => str(a.v).toLowerCase().replace(/[^a-z0-9]/g, "") === str(b.v).toLowerCase().replace(/[^a-z0-9]/g, "");
  const sameNum = (a: Cand, b: Cand) => Math.round(+a.v) === Math.round(+b.v);
  const sameDigits = (a: Cand, b: Cand) => digits(a.v) === digits(b.v);
  const C = (v: any, display: string, src: { id: string; name: string; url: string; at: string; asOf: string | null; asOfLabel: string | null } | null): Cand | null => (src && v != null && v !== "" ? { v, display, src: src.id, name: src.name, url: src.url, at: src.at, asOf: src.asOf, asOfLabel: src.asOfLabel } : null);
  const orcS = orc ? { id: "orc_properties", name: ORCN, url: orcUrl, at: orcAt, asOf: orcAsOf, asOfLabel: orcAsOfLabel } : null;
  const linzS = linz && linzR ? { id: "linz_boundaries", name: LINZN, url: linzUrl, at: linzR.at, asOf: null, asOfLabel: null } : null;
  const cs = cSrc as any, cr = cRow as any;
  const moneyC = (n: number | null, s: any) => (n == null || n <= 0 ? null : C(n, dollars(n), s));
  const areaC = (n: number | null, s: any) => (n == null || n <= 0 ? null : C(Math.round(n), m2(n), s));
  const textC = (t: unknown, s: any) => (str(t) ? C(str(t), str(t), s) : null);

  pick("valuation_ref", "Title and land", "Valuation reference", "fact", null, [textC(orc?.ValuationReference || orc?.VNZ, orcS), textC(linz?.valuation_reference, linzS)], () => "", sameDigits);
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
  const vn = (c: Cand) => valNote(c.asOfLabel);
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
  pick("rates_council", "Rates", `${council ? COUNCILS[council].name : "District"} rates`, "rates", null, [moneyC(cRates, cs)], vn, sameNum);
  pick("rates_orc", "Rates", "Otago Regional Council rates", "rates", null, [moneyC(num(orc?.AnnualLevy), orcS)], vn, sameNum);
  const use = council === "DCC" ? str(cr?.Land_Use_Descript) || str(cr?.Land_Use) : council === "QLDC" ? str(cr?.LANDUSEDESCRIPTION) : "";
  pick("land_use", "Title and land", "Council land use", "hint", null, [textC(use, cs)], () => "A hint only. The property type is yours to choose.", sameText);

  // 5. links to the council's own pages (never scraped), and what the council doesn't publish
  if (council === "WDC" && cr && /^https:\/\/[a-z0-9.-]*waitaki\.govt\.nz\//i.test(str(cr.Property_Details))) links.push({ label: "Open this property on the Waitaki District Council's rating page", url: str(cr.Property_Details) });
  else if (council && COUNCILS[council].search) links.push({ label: `Open the ${COUNCILS[council].name}'s property search`, url: COUNCILS[council].search! });
  if (council === "CODC") info.push("Central Otago District Council doesn't publish its zone map or improvements value as data. Open the council's property search for those.");
  if (council === "QLDC") info.push("Queenstown Lakes District Council's zoning is split across its operative and proposed plans, so no zone is shown. Check the council's maps.");
  if (council === "CDC") info.push("Clutha District Council's public property layer is updated less often than its rates; check the date beside each value.");
  if (!council && taName) info.push(`This property is in ${taName}, outside the councils this lookup knows. Only the LINZ record is shown.`);
  info.push("Floor area, year built, bedrooms and owners' names are not published by councils. They come from the title, the LIM and your inspection.");
  const credits = ["Otago Regional Council"]; if (linz) credits.push(LINZ_CREDIT); if (council && cs) credits.push(COUNCILS[council].name);
  const order = ["Title and land", "Council rating valuation", "Rates", "Plan and hazards"];
  values.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  return {
    status: values.length ? "ok" : "not_found", asked, matched_address: matched, score: best.score, point: { x, y, wkid },
    council: council ? COUNCILS[council].name : taName, council_id: council, valuation_ref: ref || str(linz?.valuation_reference) || null,
    values, sources, links, info, credits,
  };
}

function mk(key: string, group: string, label: string, value: string | number, display: string, kind: string, field: string | null, source: string, source_name: string, source_url: string, as_of: string | null, as_of_label: string | null, fetched_at: string, note: string): Value {
  return { key, group, label, value, display, kind, field, source, source_name, source_url, as_of, as_of_label, fetched_at, note, also: [] };
}

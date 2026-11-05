import { APPENDIX_SET, buildAgreementPdf, buildCampaignPdf, buildFormPdf, buildNoticePdf, buildVariationPdf, type Appendix } from "./pdf.ts";

const RAW = "https://raw.githubusercontent.com/McGuireRE/dunnerstunner/main/onboarding/assets/";
let cache: { template: Uint8Array; font: Uint8Array; bold: Uint8Array } | null = null;
async function get(name: string) {
  const r = await fetch(RAW + name);
  if (!r.ok) throw new Error(`Could not load ${name} (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}
async function assets() {
  if (!cache) cache = { template: await get("agreement-v3.15-26102026.pdf"), font: await get("body.ttf"), bold: await get("bold.ttf") };
  return cache;
}

// The REA guides live in onboarding/assets/guides, listed in guides.json with the version of each file:
// {"agency": {"file": "...pdf", "version": "...", "title": "...", "earlier": [{"file": "...pdf", "version": "..."}]},
//  "sale_purchase": {...}}. "earlier" keeps older versions listed, so agreements signed with them still print
// with the guide they were given. Until Tim adds the list, nothing about the guides is shown, asked for or appended.
const GUIDE_FILE = /^[A-Za-z0-9._-]+\.pdf$/;
type Guide = { file: string; version: string; title?: string };
const okGuide = (g: any): g is Guide => !!g && typeof g.file === "string" && GUIDE_FILE.test(g.file) && typeof g.version === "string" && !!g.version.trim();
async function guideJson() { try { const r = await fetch(RAW + "guides/guides.json"); return r.ok ? await r.json() : null; } catch (_) { return null; } }
// the current guide of each kind
export async function guideList(): Promise<Record<string, Guide>> {
  const j = await guideJson(), out: Record<string, Guide> = {};
  for (const k of ["agency", "sale_purchase"]) { const g = j?.[k]; if (okGuide(g)) out[k] = { file: g.file, version: g.version.trim(), title: typeof g.title === "string" ? g.title : undefined }; }
  return out;
}
// every version Tim has listed for a kind, current and earlier
async function guideListed(kind: string): Promise<Guide[]> {
  const g = (await guideJson())?.[kind];
  if (!g) return [];
  return [g, ...(Array.isArray(g.earlier) ? g.earlier : [])].filter(okGuide).map((x: any) => ({ file: x.file, version: x.version.trim(), title: typeof g.title === "string" ? g.title : undefined }));
}
async function guideBytes(file: string) { if (!GUIDE_FILE.test(file)) return undefined; try { return await get("guides/" + file); } catch (_) { return undefined; } }
export async function sha256Hex(b: Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(b)))).map((x) => x.toString(16).padStart(2, "0")).join(""); }

// Which format an agreement's PDF uses. Signed before phase 2 (the first client signature records no
// appendices): exactly the old format. Signed on it, or not signed yet: the Vendor Guide and Complaints
// procedure, and the REA guide, but only a guide the server has checked: listed with that version, the same
// file (SHA-256) when one was recorded, and, for an unsigned draft, actually there.
export async function appendixFor(sigs: any[]): Promise<Appendix | undefined> {
  const first = [...(sigs || [])].filter((s) => s.signer_role === "client").sort((a, b) => a.signed_at < b.signed_at ? -1 : 1)[0];
  if (first && !first.snapshot?.appendices) return undefined;
  const set = first ? String(first.snapshot.appendices.set || APPENDIX_SET) : APPENDIX_SET;
  if (!first) {
    const g = (await guideList()).agency;
    const bytes = g ? await guideBytes(g.file) : undefined;
    return { set, reaGuide: g && bytes ? { ...g, bytes, sha256: await sha256Hex(bytes) } : null };
  }
  const saleListed = await guideListed("sale_purchase");   // receipts for the sale and purchase guide print only for a listed version
  const claimed = first.snapshot.appendices.rea_agency_guide;
  if (!claimed || typeof claimed.file !== "string" || !GUIDE_FILE.test(claimed.file) || typeof claimed.version !== "string") return { set, reaGuide: null, saleListed };
  const listed = (await guideListed("agency")).find((g) => g.file === claimed.file && g.version === claimed.version);
  if (!listed) return { set, reaGuide: null, saleListed };
  let bytes = await guideBytes(listed.file);
  if (bytes && claimed.sha256 && (await sha256Hex(bytes)) !== claimed.sha256) bytes = undefined;   // not the file they were shown
  return { set, reaGuide: { ...listed, sha256: claimed.sha256, received: true, bytes }, saleListed };
}

export async function makeAgreementPdf(db: any, agreementId: string, part?: string) {
  const { data: ag }: any = await db.from("agreements").select("*").eq("id", agreementId).single();
  const { data: people } = await db.from("agreement_people").select("*").eq("agreement_id", agreementId).order("position");
  const { data: sigs } = await db.from("signatures").select("*").eq("agreement_id", agreementId).order("signed_at");
  const sigImages: Record<string, Uint8Array> = {};
  for (const s of sigs || []) {
    if (!s.image_path) continue;
    const { data } = await db.storage.from("private").download(s.image_path);
    if (data) sigImages[s.id] = new Uint8Array(await data.arrayBuffer());
  }
  const { data: variations } = await db.from("agreement_variations").select("*").eq("agreement_id", agreementId).order("number");
  const appendix = part === "campaign" ? undefined : await appendixFor(sigs || []);
  const input = { ...(await assets()), ag, people: people || [], sigs: sigs || [], sigImages, variations: variations || [], appendix };
  const safe = String(ag.address || "agreement").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (part === "campaign") return { bytes: await buildCampaignPdf(input), filename: `McGuire-Campaign-${safe}.pdf`, ag };
  return { bytes: await buildAgreementPdf(input), filename: `McGuire-Agency-Agreement-${ag.ref}-${safe}.pdf`, ag };
}

export async function makeVariationPdf(db: any, variationId: string) {
  const { data: vr }: any = await db.from("agreement_variations").select("*").eq("id", variationId).single();
  const { data: ag }: any = await db.from("agreements").select("*").eq("id", vr.agreement_id).single();
  const { data: people } = await db.from("agreement_people").select("*").eq("agreement_id", vr.agreement_id).order("position");
  const { data: vsigs } = await db.from("variation_signatures").select("*").eq("variation_id", variationId).order("signed_at");
  const vimg: Record<string, Uint8Array> = {};
  for (const s of vsigs || []) {
    if (!s.image_path) continue;
    const { data } = await db.storage.from("private").download(s.image_path);
    if (data) vimg[s.id] = new Uint8Array(await data.arrayBuffer());
  }
  const input = { ...(await assets()), ag, people: people || [], sigs: [], sigImages: {} };
  const safe = String(ag.address || "agreement").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return { bytes: await buildVariationPdf(input, vr, vsigs || [], vimg), filename: `McGuire-Variation-${vr.number}-${ag.ref}-${safe}.pdf`, ag, vr };
}

export async function makeNoticePdf(db: any, noticeId: string) {
  const { data: n }: any = await db.from("prior_agency_notices").select("*").eq("id", noticeId).single();
  const { data: ag }: any = await db.from("agreements").select("*").eq("id", n.agreement_id).single();
  const { data: people } = await db.from("agreement_people").select("*").eq("agreement_id", n.agreement_id).order("position");
  const { data: sigs } = await db.from("signatures").select("*").eq("agreement_id", n.agreement_id).eq("signer_role", "client").order("signed_at");
  const sigImages: Record<string, Uint8Array> = {};
  for (const s of sigs || []) {
    if (!s.image_path || !(s.snapshot?.notices || []).some((x: any) => x.idx === n.idx)) continue;
    const { data } = await db.storage.from("private").download(s.image_path);
    if (data) sigImages[s.id] = new Uint8Array(await data.arrayBuffer());
  }
  const input = { ...(await assets()), ag, people: people || [], sigs: sigs || [], sigImages };
  const safe = (x: string) => String(x || "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return { bytes: await buildNoticePdf(input, n), filename: `Notice-of-Cancellation-${safe(n.agency)}-${safe(ag.address)}.pdf`, ag, n };
}

export async function makeFormPdf(db: any, formId: string) {
  const { data: form }: any = await db.from("property_forms").select("*").eq("id", formId).single();
  const { data: ag }: any = await db.from("agreements").select("*").eq("id", form.agreement_id).single();
  const { data: fsigs } = await db.from("form_signatures").select("*").eq("form_id", formId).order("signed_at");
  const images: Record<string, Uint8Array> = {};
  for (const s of fsigs || []) {
    if (!s.image_path) continue;
    const { data } = await db.storage.from("private").download(s.image_path);
    if (data) images[s.id] = new Uint8Array(await data.arrayBuffer());
  }
  const a = await assets();
  const title = form.kind === "healthy_homes" ? "Healthy-Homes-Checklist-and-Statement" : "Vendor-Declaration";
  const safe = String(ag.address || "property").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const { data: people } = await db.from("agreement_people").select("*").eq("agreement_id", form.agreement_id).order("position");
  return { bytes: await buildFormPdf({ font: a.font, bold: a.bold, ag, people: people || [], form, fsigs: fsigs || [], images }), filename: `${title}-${safe}.pdf`, ag, form };
}

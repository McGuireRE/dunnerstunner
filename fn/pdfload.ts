import { buildAgreementPdf, buildCampaignPdf, buildNoticePdf, buildVariationPdf } from "./pdf.ts";

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
  const input = { ...(await assets()), ag, people: people || [], sigs: sigs || [], sigImages, variations: variations || [] };
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

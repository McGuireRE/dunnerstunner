import { buildAgreementPdf, buildCampaignPdf } from "./pdf.ts";

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
  const input = { ...(await assets()), ag, people: people || [], sigs: sigs || [], sigImages };
  const safe = String(ag.address || "agreement").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (part === "campaign") return { bytes: await buildCampaignPdf(input), filename: `McGuire-Campaign-${safe}.pdf`, ag };
  return { bytes: await buildAgreementPdf(input), filename: `McGuire-Agency-Agreement-${ag.ref}-${safe}.pdf`, ag };
}

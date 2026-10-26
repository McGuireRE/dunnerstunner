import nodemailer from "npm:nodemailer@6.9.16";
import { Buffer } from "node:buffer";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

export const APP_URL = "https://packages.dunnerstunner.co.nz/onboarding/";
export const TIM_EMAIL = "hello@timmcguire.co.nz";
export const FROM = '"McGuire Real Estate" <hello@timmcguire.co.nz>';

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const num = (s: unknown) => parseFloat(String(s ?? "").replace(/[^0-9.]/g, "")) || 0;
export const money = (n: number) => "$" + Number(n || 0).toLocaleString("en-NZ", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
export const fmtDT = (d: string) => new Date(d).toLocaleString("en-NZ", { weekday: "short", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Pacific/Auckland" });

export function wrap(inner: string) {
  return `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#2B2A28;max-width:600px">
${inner}
<p style="margin-top:28px">Tim McGuire<br>McGuire Real Estate Ltd · Licensed REAA 2008<br>027 562 7207 · tim@mcguire.co.nz</p></div>`;
}

export function frontPageTable(ag: any, people: any[]) {
  const c = ag.config || {}, a = ag.answers || {};
  const [pk, amt] = String(c.pkg || "Later|0").split("|");
  const pkAmt = pk === "Custom" ? num(c.custom) : +amt;
  const later = pk === "Later" || a.mkt === "later";
  const lim = c.limOn === false ? 0 : (c.lim === undefined || c.lim === "" ? 425 : num(c.lim));
  const adm = c.adminOn === false ? 0 : (c.admin === undefined || c.admin === "" ? 500 : num(c.admin));
  const costs = [lim ? `LIM ${money(lim)}` : "", adm ? `administration fee ${money(adm)}` : "", `marketing ${later ? "to be agreed" : money(pkAmt)}`].filter(Boolean).join(", ");
  const rows: [string, string][] = [
    ["Client(s)", people.filter((p) => p.legal_name).map((p) => esc(p.legal_name)).join(" and ") + (a.capacity && a.capacity !== "Owners" && a.entity ? `, as ${esc(a.capacity.toLowerCase())} for ${esc(a.entity)}` : "")],
    ["Property", esc(ag.address)],
    ["Commission", (c.aboveType === "none") ? `${money(num(c.flat))} flat fee, whatever the sale price, plus GST` : (c.aboveType === "amount") ? `${money(num(c.flat))} for a sale price up to ${money(num(c.thr))}, plus a further ${money(num(c.aboveAmt))} if the sale price is above that, plus GST` : `${money(num(c.flat))} for a sale price up to ${money(num(c.thr))}, plus ${esc(c.pct)}% of the portion above, plus GST`],
    ["Costs (incl GST)", esc(costs)],
    ["Appraisal", c.appr === "pending" ? "Not yet given. The agreement takes effect on receipt of a written appraisal, and the client may cancel within 2 working days of receiving it, at no cost." : `Given. Asking price or median appraised value ${money(num(c.ask))}`],
  ];
  return `<table style="border-collapse:collapse;width:100%">${rows.map(([k, v]) => `<tr><td style="padding:8px 10px 8px 0;border-bottom:1px solid #E4E0DA;color:#6E6A65;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:8px 0;border-bottom:1px solid #E4E0DA">${v}</td></tr>`).join("")}</table>`;
}

let transport: any = null;
export async function sendMail(db: any, agreementId: string | null, kind: string, msg: { to: string | string[]; bcc?: string | string[]; subject: string; html: string; replyTo?: string; attachments?: { filename: string; content: Uint8Array; contentType?: string }[] }) {
  const pass = (Deno.env.get("SMTP_PASS") || "").replace(/[\s"']/g, "");
  const recipients = [msg.to, msg.bcc].flat().filter(Boolean).join(", ");
  if (!pass) {
    await db.from("email_log").insert({ agreement_id: agreementId, kind, recipients, subject: msg.subject, ok: false, error: "SMTP_PASS secret not set" });
    throw new Error("Email is not set up yet (SMTP_PASS secret missing)");
  }
  transport = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: TIM_EMAIL, pass } });
  try {
    await transport.sendMail({ from: FROM, replyTo: msg.replyTo || "tim@mcguire.co.nz", to: msg.to, bcc: msg.bcc, subject: msg.subject, html: msg.html, attachments: msg.attachments?.map((x) => ({ ...x, content: Buffer.from(x.content) })) });
    await db.from("email_log").insert({ agreement_id: agreementId, kind, recipients, subject: msg.subject, ok: true });
  } catch (e: any) {
    await db.from("email_log").insert({ agreement_id: agreementId, kind, recipients, subject: msg.subject, ok: false, error: String(e?.message || e) });
    throw e;
  }
}

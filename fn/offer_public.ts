// The offer form's public door (offers phase 1, migration 018). The deployed entry; the request handling is in
// offer_public_handler.ts (tested without a network, database, model or email). Buyers have no account, so this function is
// deployed with the gateway's JWT verification OFF, like lawyer-view: every action needs the property's own link token, and the
// database checks it, the link being on, the property's stage and the rate limits. The database functions it calls
// (offer_public_info, offer_public_submit, offer_public_ai_claim, offer_public_notified) can only be run by the service role.
// Deployed like the others: a tiny index.ts imports this file's raw GitHub URL pinned to a commit, as `offer-public`.
// Help wording a buyer's own condition is not here: it is doc-prefill's "offer_condition" mode (every model call goes through
// doc_prefill.ts), using makeDraft from offer_public_handler.ts. Email goes to Tim only.
import { admin, APP_URL, cors, esc, money, sendMail, TIM_EMAIL, wrap } from "./shared.ts";
import { makeHandler } from "./offer_public_handler.ts";

const CONDITION_NAMES: Record<string, string> = { builders: "Builder's report", finance: "Finance", lim: "LIM", lawyer: "Lawyer's approval", electrical: "Electrical report", technical: "Specified technical report", toxicology: "Toxicology report", oia: "OIA consent", land_act: "Land Act consent", sale: "Sale of another property", sdd: "Specified Due Diligence", custom: "Their own condition (to approve)" };

Deno.serve(makeHandler({
  cors,
  rpc: async (fn, args) => { const { data, error } = await admin().rpc(fn, args); return { data, error: error ? { message: error.message } : null }; },
  notifyTim: async (offerId) => {
    const db = admin();
    const { data: o }: any = await db.from("property_offers").select("id,property_id,amount,details,related_party,needs_date_help,kiwisaver,received_at").eq("id", offerId).single();
    const { data: p }: any = await db.from("properties").select("address").eq("id", o.property_id).single();
    const d = o.details || {};
    const names = (d.purchasers || []).map((x: any) => `${x.first || ""} ${x.last || ""}`.trim()).filter(Boolean);
    const conds = (d.conditions || []).map((c: any) => CONDITION_NAMES[c.key] || "Condition");
    const flags = [o.related_party ? "<strong style=\"color:#B3261E\">A purchaser says they are connected with you or McGuire Real Estate.</strong>" : "", o.needs_date_help ? "They asked for your help with the dates." : "", o.kiwisaver ? "KiwiSaver funds are in the deposit." : ""].filter(Boolean);
    const html = wrap(`<p>A new offer has come in through the offer form.</p>
      <p><strong>${esc(p?.address || "Property")}</strong><br>${esc(money(+o.amount))}${names.length ? ` from ${esc(names.join(", "))}` : ""}${d.entity ? ` (${esc(d.entity)})` : ""}<br>Conditions: ${esc(conds.length ? conds.join(", ") : "none")}</p>
      ${flags.length ? `<p>${flags.join("<br>")}</p>` : ""}
      <p>Open the property's Offers tile to read everything they entered: <a href="${APP_URL}">${APP_URL}</a></p>
      <p style="color:#6E6A65;font-size:13.5px">Nothing has been sent to the sellers.</p>`);
    await sendMail(db, null, "offer_received", { to: TIM_EMAIL, subject: `New offer: ${p?.address || "a property"}`, html });
  },
}));

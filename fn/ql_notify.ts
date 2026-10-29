import { admin, cors, esc, json, money, sendMail, TIM_EMAIL, wrap } from "https://raw.githubusercontent.com/McGuireRE/dunnerstunner/16307f754d2b5e1017614ffb90ebb8b579879556/fn/shared.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Quiet Listings emails: applications, decisions, enquiries, new-listing alerts.
const SITES = ["https://dunnerstunner.co.nz/", "https://www.dunnerstunner.co.nz/", "https://packages.dunnerstunner.co.nz/quiet/"];
const btn = (url: string, label: string) => `<p><a href="${url}" style="display:inline-block;background:#16181D;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">${label}</a></p>`;
const row = (k: string, v: unknown) => v === undefined || v === null || v === "" ? "" : `<tr><td style="padding:6px 10px 6px 0;border-bottom:1px solid #E4E0DA;color:#6E6A65;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;border-bottom:1px solid #E4E0DA">${esc(Array.isArray(v) ? v.join(", ") : v)}</td></tr>`;
const table = (rows: string[]) => `<table style="border-collapse:collapse;width:100%">${rows.join("")}</table>`;
const first = (n: string | null) => (n || "").trim().split(/\s+/)[0] || "there";
const nm = (s: unknown) => parseFloat(String(s ?? "").replace(/[^0-9.]/g, "")) || 0;

function memberTable(m: any) {
  const a = m.application || {};
  return table([
    row("Name", m.full_name), row("Email", m.email), row("Phone", m.phone), row("Home address", m.home_address),
    row("Bought before", a.bought), row("Sold before", a.sold), row("Currently owns", a.owns), row("Buying as", a.buying_as), row("Looking for", a.looking_for),
    row("Budget (their figure)", a.budget ? money(nm(a.budget)) : ""), row("Finance", a.finance_type), row("Lender", a.lender),
    row("Pre-approved amount", a.preapproved ? money(nm(a.preapproved)) : ""), row("Pre-approval expires", a.preapproval_expiry), row("Deposit", a.deposit ? money(nm(a.deposit)) : ""),
    row("Needs to sell first", a.need_to_sell), 
    row("Top 10 criteria", (a.criteria || []).filter(Boolean).map((c: string, i: number) => `${i + 1}. ${c}`).join("  ")),
    row("Suburbs", a.suburbs), row("Property types", a.types), row("Bedrooms (min)", a.min_beds), row("Price range", [a.price_min, a.price_max].filter(Boolean).join(" to ")),
    row("Why buying", a.reason), row("In their words", a.story), row("Timeframe", a.timeframe), row("Decision makers", a.decision_makers),
  ]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const site = SITES.includes(body.site) ? body.site : SITES[0];
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!user) return json({ error: "Not signed in" }, 401);
    const { data: isAgent } = await userClient.rpc("is_agent");
    const db = admin();

    if (body.type === "submitted" || body.type === "update") {
      const { data: m } = await db.from("ql_members").select("*").eq("user_id", user.id).single();
      if (!m) return json({ error: "No application" }, 404);
      if (body.type === "submitted") {
        await sendMail(db, null, "ql_application", { to: TIM_EMAIL, subject: `Quiet Listings application: ${m.full_name}`, replyTo: m.email,
          html: wrap(`<p>A new Quiet Listings membership application is waiting for your review.</p>${memberTable(m)}${btn(site + "#/admin/member/" + m.user_id, "Review application")}`) });
        await sendMail(db, null, "ql_application_ack", { to: m.email, subject: "Your Quiet Listings application",
          html: wrap(`<p>Kia ora ${esc(first(m.full_name))},</p><p>Thank you for applying for Quiet Listings membership. Every application is reviewed personally, because the owners who list with us privately are trusting us to introduce only serious, prepared buyers.</p><p>We usually respond within two working days. I'll call you to talk through your plans and your position before your membership is confirmed.</p>${btn(site, "Check your application")}`) });
      } else {
        const u = (m.application?.updates || []).at(-1) || {};
        await sendMail(db, null, "ql_update", { to: TIM_EMAIL, subject: `Quiet Listings member update: ${m.full_name}`, replyTo: m.email,
          html: wrap(`<p>${esc(m.full_name)} has sent an update to their circumstances.</p>${table([row("Note", u.note), ...Object.entries(u.finance || {}).map(([k, v]) => row(k, v))])}<p>Current verified budget: ${m.qualified_to ? money(m.qualified_to) : "not set"}.</p>${btn(site + "#/admin/member/" + m.user_id, "Review member")}`) });
      }
      return json({ ok: true });
    }

    if (body.type === "decision") {
      if (!isAgent) return json({ error: "Not allowed" }, 403);
      const { data: m } = await db.from("ql_members").select("*").eq("user_id", body.user_id).single();
      if (!m) return json({ error: "Not found" }, 404);
      const msg = m.decision_message ? `<p style="background:#F4F1EC;padding:12px 14px;border-radius:6px">${esc(m.decision_message).replace(/\n/g, "<br>")}</p>` : "";
      let subject = "", html = "";
      if (m.status === "approved") {
        subject = "Welcome to Quiet Listings";
        html = `<p>Kia ora ${esc(first(m.full_name))},</p><p>Your Quiet Listings membership has been approved. You can now see every Quiet Listing: homes offered privately, away from the open market.</p>${msg}<p>When something comes up that suits what you've told us, we'll let you know. If your finance or plans change, send us an update from your account.</p><p>Please remember the terms you agreed to: everything you see is confidential, all contact goes through us, and viewings are for buyers who are ready to act.</p>${btn(site, "View Quiet Listings")}`;
      } else if (m.status === "info") {
        subject = "Your Quiet Listings application: more information needed";
        html = `<p>Kia ora ${esc(first(m.full_name))},</p><p>Thanks for your application. Before we can make a decision, we need a little more from you.</p>${msg}${btn(site, "Update your application")}`;
      } else if (m.status === "declined") {
        subject = "Your Quiet Listings application";
        html = `<p>Kia ora ${esc(first(m.full_name))},</p><p>Thank you for applying for Quiet Listings. After careful review, we're not able to offer membership at this time.</p>${msg}<p>This isn't a reflection on you personally. Quiet Listings access is deliberately limited. If your circumstances change, you're welcome to send us an update, and we'd be glad to help you with properties on the open market in the meantime.</p>`;
      } else if (m.status === "suspended") {
        subject = "Your Quiet Listings membership";
        html = `<p>Kia ora ${esc(first(m.full_name))},</p><p>Your Quiet Listings access has been paused.</p>${msg}<p>If you have any questions, please reply to this email.</p>`;
      } else return json({ ok: true, note: "no email for this status" });
      await sendMail(db, null, "ql_decision", { to: m.email, subject, html: wrap(html) });
      return json({ ok: true });
    }

    if (body.type === "enquiry") {
      const { data: e } = await db.from("ql_enquiries").select("*").eq("id", body.enquiry_id).eq("user_id", user.id).single();
      if (!e) return json({ error: "Not found" }, 404);
      const { data: m } = await db.from("ql_members").select("*").eq("user_id", user.id).single();
      const { data: l } = await db.from("ql_listings").select("*").eq("id", e.listing_id).single();
      const kind = { viewing: "private viewing request", question: "question", offer: "intention to make an offer" }[e.kind as string] || "enquiry";
      await sendMail(db, null, "ql_enquiry", { to: TIM_EMAIL, replyTo: m.email, subject: `Quiet Listings ${kind}: ${l.ref} ${l.street || l.suburb}`,
        html: wrap(`<p><strong>${esc(m.full_name)}</strong> has sent a ${kind} for <strong>${esc(l.ref)}, ${esc(l.street || "")} ${esc(l.suburb || "")}</strong>.</p>${table([row("Message", e.message), row("Suits them", e.times), row("Phone", m.phone), row("Email", m.email), row("Verified budget", m.qualified_to ? money(m.qualified_to) : ""), row("Cash verified", m.cash_verified ? "Yes" : "No"), row("Free of a sale condition", m.sale_free ? "Yes" : "No")])}${btn(site + "#/admin/member/" + m.user_id, "See member")}`) });
      await sendMail(db, null, "ql_enquiry_ack", { to: m.email, subject: `We've received your ${kind}: ${l.headline || l.suburb}`,
        html: wrap(`<p>Kia ora ${esc(first(m.full_name))},</p><p>Thanks, we've received your ${kind} for ${esc(l.headline || l.suburb)} (${esc(l.ref)}). We'll be in touch shortly${e.kind === "viewing" ? " to arrange a time with the owners" : ""}.</p><p>A reminder that all viewings are accompanied by McGuire Real Estate. Please don't visit the property or approach the owners directly.</p>`) });
      return json({ ok: true });
    }

    if (body.type === "alert") {
      if (!isAgent) return json({ error: "Not allowed" }, 403);
      const { data: l } = await db.from("ql_listings").select("*").eq("id", body.listing_id).single();
      if (!l || !["live", "under_offer"].includes(l.status)) return json({ error: "The listing must be live before members can be alerted" }, 400);
      const { data: members } = await userClient.rpc("ql_alert_targets", { lid: l.id });
      const { data: allQ } = await userClient.rpc("ql_qualified_members", { lid: l.id });
      const { data: sent } = await db.from("ql_alerts").select("user_id").eq("listing_id", l.id);
      const done = new Set((sent || []).map((s: any) => s.user_id));
      const todo = (members || []).filter((m: any) => !done.has(m.user_id) && (!body.only || body.only.includes(m.user_id)));
      let ok = 0; const errors: string[] = [];
      for (const m of todo) {
        try {
          await sendMail(db, null, "ql_alert", { to: m.email, subject: `New Quiet Listing: ${l.headline || (l.property_type || "Property") + " in " + l.suburb}`,
            html: wrap(`<p>Kia ora ${esc(first(m.full_name))},</p><p>A new Quiet Listing has just become available, and you qualify to view it.</p>${table([row("Property", l.headline), row("Location", [l.suburb, l.city].filter(Boolean).join(", ")), row("Type", l.property_type), row("Bedrooms", l.beds), row("Bathrooms", l.baths), row("Price", "Expressions of interest")])}${btn(site + "#/listing/" + l.id, "View the listing")}<p style="color:#6E6A65;font-size:13px">This property is offered privately. Please keep its details confidential.</p>`) });
          await db.from("ql_alerts").insert({ listing_id: l.id, user_id: m.user_id });
          ok++;
        } catch (e: any) { errors.push(`${m.email}: ${e?.message || e}`); }
      }
      return json({ ok: true, sent: ok, skipped: (members || []).length - todo.length, waiting: Math.max(0, (allQ || []).length - (members || []).length), errors });
    }
    if (body.type === "interest") {
      const { data: ints } = await db.from("ql_interests").select("*").eq("user_id", user.id).is("notified_at", null);
      if (!ints?.length) return json({ ok: true, note: "nothing new" });
      const { data: m } = await db.from("ql_members").select("*").eq("user_id", user.id).single();
      const q = m.application?.quick || {};
      for (const i of ints) {
        const { data: l } = await db.from("ql_listings").select("*").eq("id", i.listing_id).single();
        if (!l) continue;
        await sendMail(db, null, "ql_interest", { to: TIM_EMAIL, replyTo: m.email, subject: `Share link registration: ${m.full_name || m.email} for ${l.ref} ${l.street || l.suburb}`,
          html: wrap(`<p><strong>${esc(m.full_name || m.email)}</strong> registered through the share link for <strong>${esc(l.ref)}, ${esc(l.street || "")} ${esc(l.suburb || "")}</strong>.</p>${table([row("Phone", m.phone), row("Email", m.email), row("Budget (their figure)", q.budget), row("Property to sell", q.need_to_sell), row("Membership", m.status === "approved" ? "Full member" : "Registered only (not yet a full member)")])}${String(q.need_to_sell || "").startsWith("Yes") ? "<p><strong>They have a property to sell.</strong> A possible listing, and a candidate for chain matching.</p>" : ""}${btn(site + "#/admin/member/" + m.user_id, "See them")}`) }).catch(() => null);
        await db.from("ql_interests").update({ notified_at: new Date().toISOString() }).eq("user_id", user.id).eq("listing_id", i.listing_id);
      }
      return json({ ok: true });
    }
    return json({ error: "Unknown type" }, 400);
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

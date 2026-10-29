import { admin, cors, esc, json, money, sendMail, TIM_EMAIL, wrap } from "https://raw.githubusercontent.com/McGuireRE/dunnerstunner/16307f754d2b5e1017614ffb90ebb8b579879556/fn/shared.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Quiet Listings owner updates: staged activity reports that gently encourage the open market.
const first = (n: string | null) => (n || "").trim().split(/\s+|&|,/)[0] || "there";
const stageFor = (days: number) => days >= 42 ? 3 + Math.floor((days - 42) / 28) : days >= 21 ? 2 : days >= 7 ? 1 : 0;
const btn = (url: string, label: string, dark = true) => `<a href="${url}" style="display:inline-block;background:${dark ? "#16181D" : "#fff"};color:${dark ? "#fff" : "#16181D"};border:1px solid #16181D;padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:600;margin:4px 6px 4px 0">${label}</a>`;
const nameOf = (l: any) => l.street || l.suburb || l.ref;

function statsBlock(s: any) {
  const cell = (n: number, t: string) => `<td style="padding:12px 8px;text-align:center;border:1px solid #E4E0DA;width:25%"><div style="font-size:26px;font-weight:600;font-family:Georgia,serif">${n}</div><div style="font-size:12.5px;color:#6E6A65">${t}</div></td>`;
  const t = `<table style="border-collapse:collapse;width:100%;margin:14px 0"><tr>${cell(s.members, "verified buyers can see it")}${cell(s.viewed, "have looked at it")}${cell(s.saved, "shortlisted it")}${cell(s.viewings + s.offers, s.offers ? "viewing or offer requests" : "viewing requests")}</tr></table>`;
  return t + (s.share_visits || s.registrations ? `<p style="margin:-4px 0 14px;font-size:14.5px">Your share link: <strong>${s.share_visits}</strong> visit${s.share_visits === 1 ? "" : "s"} and <strong>${s.registrations}</strong> registered buyer${s.registrations === 1 ? "" : "s"}.</p>` : "");
}

const MARKET = [
  (s: any) => `<p><strong>Competition sets the price.</strong> When several buyers see a home at the same time, with a clear deadline, they compete with each other rather than with your price. That's hard to create quietly, with ${s.members} verified buyer${s.members === 1 ? "" : "s"} able to see your home.</p>`,
  () => `<p><strong>Where buyers are looking.</strong> Most buyers start their search on Trade Me and realestate.co.nz, and many of them haven't heard of Quiet Listings. A short, well-presented campaign puts your home in front of all of them at once, and our members would still have had first look.</p>`,
  () => `<p><strong>Privacy and reach aren't either-or.</strong> A discreet campaign, with no signboard, private viewings only and the street address withheld, can give you the reach of the open market with much of the privacy you have now.</p>`,
];

function buildEmail(l: any, s: any, stage: number, site: string) {
  const link = `${site}#/owner/${l.vendor_token}`;
  const hi = `<p>Kia ora ${esc(first(l.vendor_name))},</p>`;
  const where = esc(nameOf(l));
  const checkin = `<p>A quick check-in on your plans helps me make sure we're on the right track. It takes under a minute.</p><p>${btn(link, "Answer a few quick questions")}</p>`;
  const quiet = s.days >= 42 && s.viewings + s.offers === 0 ? `<p>With no viewing requests yet, it's likely the right buyer for your home isn't among our members at the moment.</p>` : "";
  const shareTip = l.share_enabled && l.share_slug && !s.share_visits ? `<p><strong>Tip:</strong> your home has its own share link, ready to post on Facebook or send to friends. Anyone interested has to register with us first, so the tyre kickers are filtered out. ${btn(link, "Get your share link", false)}</p>` : "";
  let subject = "", body = "";
  if (stage <= 1) {
    subject = `Your first week on Quiet Listings: ${nameOf(l)}`;
    body = `${hi}<p>A quick update on ${where} after its first week as a Quiet Listing.</p>${statsBlock(s)}<p>Every one of these buyers has been personally qualified, with their finance checked, before they could see your home. I'll keep you posted as things develop.</p>${shareTip}<p>${btn(link, "See your listing's activity", false)}</p>`;
  } else if (stage === 2) {
    subject = `Three weeks in: ${nameOf(l)}`;
    body = `${hi}<p>Here's where things stand for ${where} after three weeks.</p>${statsBlock(s)}${shareTip}${checkin}`;
  } else if (stage === 3) {
    subject = `Six weeks on Quiet Listings: ${nameOf(l)}`;
    body = `${hi}<p>Your home has been a Quiet Listing for six weeks now. Here's the activity so far.</p>${statsBlock(s)}${quiet}` +
      (l.discretion
        ? `<p>I know discretion matters to you, and that won't change unless you want it to. If your plans or timing shift, just let me know.</p>${checkin}`
        : `<p>An honest view: Quiet Listings members are a small, carefully chosen group. The open market reaches every buyer, and it's often the buyer you didn't expect who pays the most.</p>${MARKET[2](s)}<p>If you'd like to talk about it, there's no obligation and nothing changes until you say so.</p>${checkin}`);
  } else {
    subject = `Your Quiet Listing update: ${nameOf(l)}`;
    body = `${hi}<p>Your regular update for ${where}, now ${Math.round(s.days / 7)} weeks as a Quiet Listing.</p>${statsBlock(s)}${quiet}` +
      (l.discretion ? `<p>As always, if anything changes with your plans or timing, I'm here.</p>` : MARKET[(stage - 4) % 3](s) + `<p>Whenever you're ready to talk about the open market, I'd be glad to.</p>`) + checkin;
  }
  return { subject, html: wrap(body) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const db = admin();
    const settings = Object.fromEntries(((await db.from("ql_settings").select("*")).data || []).map((r: any) => [r.key, r.value]));
    const site = settings.site || "https://packages.dunnerstunner.co.nz/quiet/";
    const stats = async (id: string) => (await db.rpc("ql_stats_internal", { lid: id })).data;
    const send = async (l: any, stage: number, manual: boolean) => {
      const s = await stats(l.id);
      const { subject, html } = buildEmail(l, s, stage, site);
      try {
        await sendMail(db, l.agreement_id, "ql_owner_update", { to: l.vendor_email, bcc: TIM_EMAIL, subject, html });
        await db.from("ql_nudges").insert({ listing_id: l.id, stage, subject, recipients: l.vendor_email, ok: true, manual });
        await db.from("ql_listings").update({ nudge_stage: stage, last_nudge_at: new Date().toISOString() }).eq("id", l.id);
        return { ok: true, subject };
      } catch (e: any) {
        await db.from("ql_nudges").insert({ listing_id: l.id, stage, subject, recipients: l.vendor_email, ok: false, error: String(e?.message || e), manual });
        return { ok: false, error: String(e?.message || e) };
      }
    };

    if (body.mode === "cron") {
      if (!settings.cron_secret || body.secret !== settings.cron_secret) return json({ error: "Not allowed" }, 403);
      const { data: ls } = await db.from("ql_listings").select("*").eq("status", "live").eq("nudges", "auto").not("vendor_email", "is", null).not("published_at", "is", null);
      const out: any[] = [];
      for (const l of ls || []) {
        const days = Math.floor((Date.now() - new Date(l.published_at).getTime()) / 864e5);
        const st = stageFor(days);
        if (st > l.nudge_stage && (!l.last_nudge_at || Date.now() - new Date(l.last_nudge_at).getTime() > 6 * 864e5)) out.push({ ref: l.ref, stage: st, ...(await send(l, st, false)) });
      }
      // leeway reviews due today (NZ date)
      const today = new Date(Date.now() + 13 * 36e5).toISOString().slice(0, 10);
      const { data: due } = await db.from("ql_listings").select("*").eq("leeway_review", today).in("status", ["live", "under_offer"]);
      for (const l of due || []) {
        const s = await stats(l.id);
        const sc = ["m_price", "m_motivation", "m_time"].filter((k) => l[k] === "yes").length;
        const { data: ck } = await db.from("ql_owner_checkins").select("*").eq("listing_id", l.id).order("at", { ascending: false }).limit(1);
        await sendMail(db, null, "ql_leeway_review", { to: TIM_EMAIL, subject: `Leeway review due: ${l.ref} ${nameOf(l)} (${sc} of 3)`,
          html: wrap(`<p>The leeway review for <strong>${esc(l.ref)} ${esc(l.street || l.suburb || "")}</strong> is due today.</p><p>Your matrix: price ${esc(l.m_price || "not set")}, motivation ${esc(l.m_motivation || "not set")}, time ${esc(l.m_time || "not set")} (<strong>${sc} of 3</strong>).${ck?.[0] ? ` The owner's latest check-in scored ${ck[0].score} of 3.` : ""}</p>${statsBlock(s)}<p>${btn(site + "#/admin/listing/" + l.id, "Open the listing")}</p>`) }).catch(() => null);
      }
      return json({ ok: true, sent: out, leeway: (due || []).length });
    }

    if (body.mode === "checkin") {
      const { data: l } = await db.from("ql_listings").select("*").eq("vendor_token", String(body.token || "")).maybeSingle();
      if (!l) return json({ error: "Not found" }, 404);
      const { data: cks } = await db.from("ql_owner_checkins").select("*").eq("listing_id", l.id).is("notified_at", null).gt("at", new Date(Date.now() - 15 * 6e4).toISOString()).order("at", { ascending: false }).limit(1);
      const c = cks?.[0]; if (!c) return json({ ok: true, note: "nothing new" });
      const a = c.answers || {};
      const L: any = { price: { same: "View on price unchanged", flexible: "Open to offers below their price", higher: "Now wants more", yes: "Would accept around the guide", consider: "Would consider it", no: "Wants more" }, motivation: { need: "Needs to sell", like: "Would like to, if the price is right", testing: "Just testing the waters" }, time: { yes: "Has a date to be sold by", rough: "Roughly", no: "No deadline" }, market: { yes: "YES, wants to talk about the open market", notyet: "Not yet" } };
      const rows = [["Price", L.price[a.price]], ["Motivation", L.motivation[a.motivation]], ["Timeframe", L.time[a.time] + (a.date ? ` (${a.date})` : "")], ["Open market", L.market[a.market]], ["Comment", a.comment]].filter((r) => r[1]);
      const sc = ["m_price", "m_motivation", "m_time"].filter((k) => l[k] === "yes").length;
      const flag = a.market === "yes" || c.score >= 2;
      await sendMail(db, l.agreement_id, "ql_owner_checkin", { to: TIM_EMAIL, replyTo: l.vendor_email || undefined, subject: `${flag ? "Ready to talk? " : ""}Owner check-in: ${l.ref} ${nameOf(l)} (${c.score} of 3)`,
        html: wrap(`<p>${esc(l.vendor_name || "The owner")} has answered the check-in for <strong>${esc(l.ref)} ${esc(l.street || l.suburb || "")}</strong>.</p><table style="border-collapse:collapse;width:100%">${rows.map(([k, v]) => `<tr><td style="padding:6px 10px 6px 0;border-bottom:1px solid #E4E0DA;color:#6E6A65;white-space:nowrap">${k}</td><td style="padding:6px 0;border-bottom:1px solid #E4E0DA">${esc(v)}</td></tr>`).join("")}</table><p>Their answers score <strong>${c.score} of 3</strong> on price, motivation and time. Your own matrix is ${sc} of 3.${c.score >= 2 && sc < 2 ? " Their answers suggest things have moved: worth updating your matrix." : ""}</p><p>${btn(site + "#/admin/listing/" + l.id, "Open the listing")}</p>`) });
      await db.from("ql_owner_checkins").update({ notified_at: new Date().toISOString() }).eq("id", c.id);
      return json({ ok: true });
    }

    if (body.mode === "seller") {
      const { data: d } = await db.from("ql_seller_leads").select("*").eq("id", String(body.lead_id || "")).is("notified_at", null).gt("created_at", new Date(Date.now() - 15 * 6e4).toISOString()).maybeSingle();
      if (!d) return json({ ok: true, note: "nothing new" });
      const M: any = { need: "Needs to sell", like: "Would like to, if the price is right", testing: "Just testing the waters" };
      const T: any = { yes: "Has a date to be sold by", rough: "Roughly", no: "No deadline" };
      const P: any = { essential: "Essential: must stay private", preferred: "Preferred for now", open: "Not important" };
      const mot = d.motivation === "need", tim = d.time === "yes";
      const rows = [["Name", d.name], ["Email", d.email], ["Phone", d.phone], ["Property", d.address], ["Type", [d.property_type, d.beds ? d.beds + " bedrooms" : ""].filter(Boolean).join(", ")],
        ["Their price band (never shown)", d.price_low ? `${money(d.price_low)} to ${money(d.price_high)}` : d.expected_price], ["Appraised", d.appraised], ["What's prompting the move", d.reason], ["Motivation", M[d.motivation]], ["Timeframe", [T[d.time], d.time_when].filter(Boolean).join(": ")],
        ["Privacy", P[d.privacy]], ["Also buying", d.also_buying ? "Yes" : "No"], ["Comments", d.comments]].filter((r) => r[1]);
      await sendMail(db, null, "ql_seller_lead", { to: TIM_EMAIL, replyTo: d.email, subject: `Seller enquiry: ${d.address} (${d.name})`,
        html: wrap(`<p>A new seller enquiry has come in through Quiet Listings.</p><table style="border-collapse:collapse;width:100%">${rows.map(([k, v]) => `<tr><td style="padding:6px 10px 6px 0;border-bottom:1px solid #E4E0DA;color:#6E6A65;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;border-bottom:1px solid #E4E0DA">${esc(v)}</td></tr>`).join("")}</table><p>On their own answers: motivation ${mot ? "<strong>yes</strong>" : "not yet"}, time ${tim ? "<strong>yes</strong>" : "not yet"}. Price realism is yours to judge at the appraisal.</p><p>${btn(site + "#/admin/lead/" + d.id, "Open the enquiry")}</p>`) });
      await sendMail(db, null, "ql_seller_ack", { to: d.email, subject: "Thanks for your enquiry: selling quietly",
        html: wrap(`<p>Kia ora ${esc(first(d.name))},</p><p>Thanks for getting in touch about ${esc(d.address)}. I'll call you shortly to talk through your plans, and arrange a time to see the property and give you a written appraisal.</p><p>There's no obligation, and everything you've told me stays confidential.${d.also_buying ? " As you're buying too, we'll plan both moves together so the timing works for you." : ""}</p>`) });
      await db.from("ql_seller_leads").update({ notified_at: new Date().toISOString() }).eq("id", d.id);
      return json({ ok: true });
    }

    // agent-only: preview or send the next update now
    const auth = req.headers.get("Authorization") || "";
    const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: isAgent } = await uc.rpc("is_agent");
    if (!isAgent) return json({ error: "Not allowed" }, 403);
    const { data: l } = await db.from("ql_listings").select("*").eq("id", body.listing_id).single();
    if (!l) return json({ error: "Not found" }, 404);
    const next = Math.max(l.nudge_stage + 1, 1);
    if (body.mode === "preview") { const s = await stats(l.id); return json({ stage: next, to: l.vendor_email, ...buildEmail(l, s, next, site) }); }
    if (body.mode === "send") {
      if (!l.vendor_email) return json({ error: "Add the owner's email first" }, 400);
      return json(await send(l, next, true));
    }
    return json({ error: "Unknown mode" }, 400);
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

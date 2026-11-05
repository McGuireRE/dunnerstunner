import { admin, APP_URL, cors, esc, fmtDT, frontPageTable, json, sendMail, TIM_EMAIL, wrap } from "https://raw.githubusercontent.com/McGuireRE/dunnerstunner/0aef03d14160c5038fb0502df551d6ac6b81e7c0/fn/shared.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
// Phase 2 adds makeFormPdf: repin both imports to the commit that contains it before deploying.
import { makeAgreementPdf, makeFormPdf, makeNoticePdf, makeVariationPdf } from "https://raw.githubusercontent.com/McGuireRE/dunnerstunner/0aef03d14160c5038fb0502df551d6ac6b81e7c0/fn/pdfload.ts";

// Called by the app after a vendor sends to their lawyer, or after signing.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const { type, agreement_id } = body;
    if (String(type || "").startsWith("pl_")) return await prelistingMail(req, body);
    // Check the caller is a party to this agreement, or the agent
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: visible } = await userClient.from("agreements").select("id").eq("id", agreement_id).maybeSingle();
    if (!visible) return json({ error: "Not allowed" }, 403);

    const db = admin();
    const { data: ag }: any = await db.from("agreements").select("*").eq("id", agreement_id).single();
    const { data: people } = await db.from("agreement_people").select("*").eq("agreement_id", agreement_id).order("position");
    const names = (people || []).filter((p: any) => p.legal_name).map((p: any) => p.pref_name || p.legal_name.split(" ")[0]);
    const nameList = names.length < 2 ? names.join("") : names.slice(0, -1).join(", ") + " and " + names.at(-1);

    if (type === "lawyer") {
      const { data: links } = await db.from("lawyer_links").select("*").eq("agreement_id", agreement_id).is("emailed_at", null).order("sent_at", { ascending: false }).limit(1);
      const l = links?.[0];
      if (!l) return json({ ok: true, note: "nothing to send" });
      const url = `${APP_URL}?lawyer=${l.token}`;
      const isSigned = ["signed", "countersigned", "ended"].includes(ag.status);
      const who = l.sent_by || nameList || "Your client";
      const signedBy = (people || []).filter((p: any) => p.signed_at).map((p: any) => `${esc(p.legal_name)} (${esc(fmtDT(p.signed_at))})`).join(", ");
      const html = isSigned
        ? wrap(`<p>Kia ora ${esc(l.lawyer_name.split(" ")[0])},</p>
        <p>${esc(who)} asked me to send you the <strong>signed</strong> Sole and Exclusive Agency Agreement for <strong>${esc(ag.address)}</strong> (${esc(ag.ref)}). The full agreement, with all terms, schedules and signatures, is attached as a PDF.</p>
        <p><a href="${url}" style="display:inline-block;background:#D9432C;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:600">View it online</a></p>
        <p>Signed by ${signedBy || "the client(s)"}${ag.countersigned_at ? `, and countersigned by Timothy McGuire on ${esc(fmtDT(ag.countersigned_at))}` : ""}. The link is read-only and works for 90 days.</p>
        ${frontPageTable(ag, people || [])}
        <p>Any questions, just reply to this email or call me.</p>`)
        : wrap(`<p>Kia ora ${esc(l.lawyer_name.split(" ")[0])},</p>
        <p>${esc(who)} asked me to send you the draft agency agreement for <strong>${esc(ag.address)}</strong> before signing it. The full draft, with all terms and the client's answers so far, is attached as a PDF.</p>
        <p><a href="${url}" style="display:inline-block;background:#D9432C;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:600">View it online</a></p>
        <p>The link is read-only and expires in 30 days. Nothing has been signed.</p>
        ${frontPageTable(ag, people || [])}
        <p>If you'd like anything changed, please reply to this email or call me, and I'll update the agreement for your client.</p>`);
      try {
        const pdf = await makeAgreementPdf(db, agreement_id);
        await sendMail(db, agreement_id, "lawyer_link", { to: l.email, bcc: TIM_EMAIL, subject: isSigned ? `Signed agency agreement: ${ag.address}` : `Agency agreement for review: ${ag.address}`, html, attachments: [{ filename: (isSigned ? "" : "DRAFT-") + pdf.filename, content: pdf.bytes, contentType: "application/pdf" }] });
        await db.from("lawyer_links").update({ emailed_at: new Date().toISOString(), email_error: null }).eq("id", l.id);
        await db.from("agreement_events").insert({ agreement_id, actor: "system", kind: "lawyer_emailed", detail: { lawyer: l.lawyer_name, email: l.email } });
        return json({ ok: true });
      } catch (e: any) {
        await db.from("lawyer_links").update({ email_error: String(e?.message || e) }).eq("id", l.id);
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    if (type === "signed") {
      if (!["signed", "countersigned"].includes(ag.status) || ag.copy_sent_at) return json({ ok: true, note: "not ready or already sent" });
      const unsol = ag.config?.approach === "unsolicited";
      const html = wrap(`<p>Kia ora ${esc(nameList)},</p>
        <p>Thank you. Everyone has now signed the Sole and Exclusive Agency Agreement for <strong>${esc(ag.address)}</strong> (${esc(ag.ref)}, ${esc(ag.agreement_version)}). Your full signed agreement, including all the terms, schedules and signatures, is attached as a PDF.</p>
        ${frontPageTable(ag, people || [])}
        <p>You can see your agreement at any time, and send a copy to your lawyer, here: <a href="${APP_URL}">${APP_URL}</a></p>
        <p style="color:#6E6A65;font-size:13.5px">Your cooling-off period ends ${unsol ? "at the end of " : "5pm, "}${esc(fmtDT(ag.cooling_off_until))}. If you need to change or cancel this agreement, sign in at the link above and choose "start here" at the bottom of the page, and I'll call you to talk it through.</p>`);
      const to = (people || []).filter((p: any) => p.email).map((p: any) => p.email);
      try {
        const pdf = await makeAgreementPdf(db, agreement_id);
        await sendMail(db, agreement_id, "signed_copy", { to, bcc: TIM_EMAIL, subject: `Your signed agency agreement: ${ag.address}`, html, attachments: [{ filename: pdf.filename, content: pdf.bytes, contentType: "application/pdf" }] });
        await db.from("agreements").update({ copy_sent_at: new Date().toISOString(), copy_error: null }).eq("id", agreement_id);
        await db.from("agreement_events").insert({ agreement_id, actor: "system", kind: "copy_emailed", detail: { to: to.join(", ") } });
        return json({ ok: true });
      } catch (e: any) {
        await db.from("agreements").update({ copy_error: String(e?.message || e) }).eq("id", agreement_id);
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }
    // A document signed after the agreement (Vendor Declaration, Healthy Homes): make the PDF, file it on the
    // property, and email it to Tim only. Vendors are never emailed from here.
    if (type === "form_signed") {
      const { data: form }: any = await db.from("property_forms").select("*").eq("id", body.form_id).single();
      if (!form || form.agreement_id !== agreement_id) return json({ error: "Not allowed" }, 403);
      if (form.status !== "signed") return json({ ok: true, note: "not signed by everyone yet" });
      if (form.kind === "vendor_declaration" && !form.countersigned_at) return json({ ok: true, note: "waiting for the licensee to countersign" });
      if (form.document_id) return json({ ok: true, note: "already filed" });
      // claim the filing in one update, so two calls can't both file it (a claim older than 10 minutes has failed)
      const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: claim } = await db.from("property_forms").update({ filing_at: new Date().toISOString() }).eq("id", form.id).is("document_id", null).or(`filing_at.is.null,filing_at.lt.${stale}`).select("id");
      if (!claim || !claim.length) return json({ ok: true, note: "already being filed" });
      const label = form.kind === "healthy_homes" ? "Healthy Homes checklist and statement" : "Vendor Declaration";
      try {
        const pdf = await makeFormPdf(db, form.id);
        const path = `properties/${form.property_id}/generated/${form.id}-${pdf.filename}`;
        const up = await db.storage.from("private").upload(path, pdf.bytes, { contentType: "application/pdf", upsert: true });
        if (up.error) throw new Error(up.error.message);
        const { data: doc, error: de }: any = await db.from("property_documents").insert({ property_id: form.property_id, kind: label, name: pdf.filename, path, source: "generated", created_by: "system" }).select("id").single();
        if (de) throw new Error(de.message);
        await db.from("property_forms").update({ document_id: doc.id, pdf_error: null, filing_at: null }).eq("id", form.id);
        await db.from("agreement_events").insert({ agreement_id, actor: "system", kind: "form_filed", detail: { form: form.kind, file: pdf.filename } });
        try { await sendMail(db, agreement_id, "form_signed", { to: TIM_EMAIL, subject: `${label} signed: ${ag.address}`, html: wrap(`<p>Hi Tim,</p><p>${esc(nameList || "The vendors")} signed the ${esc(label)} for <strong>${esc(ag.address)}</strong> (${esc(ag.ref)}). The PDF is attached and filed on the property's documents.</p>`), attachments: [{ filename: pdf.filename, content: pdf.bytes, contentType: "application/pdf" }] }); }
        catch (e: any) { await db.from("property_forms").update({ pdf_error: "Filed on the property, but the email to Tim failed: " + String(e?.message || e) }).eq("id", form.id); return json({ ok: false, filed: true, error: String(e?.message || e) }, 500); }
        return json({ ok: true });
      } catch (e: any) {
        await db.from("property_forms").update({ pdf_error: String(e?.message || e), filing_at: null }).eq("id", form.id);
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }
    if (type === "cancel_request") {
      const { data: reqs } = await db.from("cancellation_requests").select("*").eq("agreement_id", agreement_id).order("requested_at", { ascending: false }).limit(1);
      const r = reqs?.[0]; if (!r) return json({ ok: true, note: "nothing to send" });
      const first = (n: string) => (n || "").split(" ")[0];
      await sendMail(db, agreement_id, "cancel_request", { to: TIM_EMAIL, subject: `Request to cancel: ${ag.address} (${r.within_cooling_off ? "within cooling-off" : "after cooling-off"})`,
        html: wrap(`<p><strong>${esc(r.requested_by)}</strong> has asked to cancel the agency agreement for <strong>${esc(ag.address)}</strong> (${esc(ag.ref)}), ${r.within_cooling_off ? "<strong>within the cooling-off period</strong>" : "after the cooling-off period"}.</p>
          <p>Call them on <strong>${esc(r.phone || "their usual number")}</strong>.${r.reasons ? `</p><p>Their reasons: “${esc(r.reasons)}”` : " No reasons given."}</p>
          <p>Nothing has changed yet. Talk it through, then process the request on the agreement page.</p>
          <p><a href="${APP_URL}" style="display:inline-block;background:#D9432C;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:600">Open the agreement</a></p>`) });
      const person = (people || []).find((p: any) => p.id === r.person_id);
      if (person?.email) await sendMail(db, agreement_id, "cancel_request_ack", { to: person.email, subject: `Your request about ${ag.address}`,
        html: wrap(`<p>Kia ora ${esc(first(person.pref_name || person.legal_name))},</p><p>I've received your request to cancel the agency agreement for ${esc(ag.address)}. I'll call you on ${esc(r.phone || "your number")}, usually the same day, so we can talk it through.</p><p>Nothing changes until we've spoken, and you'll get written confirmation of whatever we decide.${r.within_cooling_off ? " Your request was made within your cooling-off period, and that's recorded." : ""}</p>`) }).catch(() => null);
      return json({ ok: true });
    }
    if (type === "cancel_processed") {
      const { data: r } = await db.from("cancellation_requests").select("*").eq("id", String(body.request_id || "")).eq("agreement_id", agreement_id).maybeSingle();
      if (!r || r.status !== "processed") return json({ ok: true, note: "nothing to send" });
      const to = (people || []).filter((p: any) => p.email).map((p: any) => p.email);
      const html = r.outcome === "cancelled"
        ? wrap(`<p>Kia ora ${esc(nameList)},</p><p>Following our conversation, I confirm the Sole and Exclusive Agency Agreement for <strong>${esc(ag.address)}</strong> (${esc(ag.ref)}) is cancelled as of ${esc(fmtDT(r.processed_at))}${r.within_cooling_off ? ", within your cooling-off period" : ""}. McGuire Real Estate is no longer acting for you on this property.</p><p>Thank you for talking it through with me. If your plans change in future, I'd be glad to help.</p>`)
        : wrap(`<p>Kia ora ${esc(nameList)},</p><p>Thanks for talking things through today. As we agreed, your agency agreement for <strong>${esc(ag.address)}</strong> (${esc(ag.ref)}) continues as it is, and your request to cancel has been withdrawn.</p><p>If anything else comes up, call or text me any time.</p>`);
      await sendMail(db, agreement_id, "cancel_processed", { to, bcc: TIM_EMAIL, subject: r.outcome === "cancelled" ? `Confirmation: agency agreement cancelled, ${ag.address}` : `Your agency agreement continues: ${ag.address}`, html });
      return json({ ok: true });
    }
    if (type === "variation_sent" || type === "variation_signed") {
      const { data: vr }: any = await db.from("agreement_variations").select("*").eq("id", String(body.variation_id || "")).eq("agreement_id", agreement_id).maybeSingle();
      if (!vr) return json({ ok: true, note: "nothing to send" });
      const rows = (vr.summary || []).map((r: any) => `<tr><td style="padding:8px 10px 8px 0;border-bottom:1px solid #E4E0DA;color:#6E6A65;vertical-align:top">${esc(r.label)}</td><td style="padding:8px 0;border-bottom:1px solid #E4E0DA">${esc(r.to)}${r.from ? `<br><span style="color:#6E6A65;font-size:13px">Was: ${esc(r.from)}</span>` : ""}</td></tr>`).join("");
      const table = `<table style="border-collapse:collapse;width:100%">${rows}</table>`;
      const to = (people || []).filter((p: any) => p.email && p.signed_at).map((p: any) => p.email);
      if (type === "variation_sent") {
        if (vr.status !== "sent") return json({ ok: true, note: "not open" });
        const html = wrap(`<p>Kia ora ${esc(nameList)},</p>
          <p>As we discussed, here are the changes to your agency agreement for <strong>${esc(ag.address)}</strong> (${esc(ag.ref)}), set out as Variation ${vr.number}. Everything else in your agreement stays the same.</p>
          ${table}
          <p>To read and sign it, open the link below and sign in with your email, the same way you signed your agreement. You're welcome to get legal advice first.</p>
          <p><a href="${APP_URL}" style="display:inline-block;background:#D9432C;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:600">Read and sign</a></p>
          <p>Nothing changes until everyone has signed. Any questions, just call or text me.</p>`);
        await sendMail(db, agreement_id, "variation_sent", { to, bcc: TIM_EMAIL, subject: `Changes to your agency agreement to sign: ${ag.address}`, html });
        return json({ ok: true });
      }
      if (vr.status !== "signed") return json({ ok: true, note: "not signed yet" });
      if (vr.copy_sent_at) return json({ ok: true, note: "already sent" });
      try {
        const pdf = await makeVariationPdf(db, vr.id);
        const html = wrap(`<p>Kia ora ${esc(nameList)},</p>
          <p>Thank you. Everyone has signed Variation ${vr.number} to your agency agreement for <strong>${esc(ag.address)}</strong> (${esc(ag.ref)}), and it applies from ${esc(fmtDT(vr.signed_at))}. Your signed copy is attached.</p>
          ${table}
          <p>Everything else in your agreement stays the same. You can see your agreement and its variations at any time here: <a href="${APP_URL}">${APP_URL}</a></p>`);
        await sendMail(db, agreement_id, "variation_copy", { to, bcc: TIM_EMAIL, subject: `Signed: Variation ${vr.number} to your agency agreement, ${ag.address}`, html, attachments: [{ filename: pdf.filename, content: pdf.bytes, contentType: "application/pdf" }] });
        await db.from("agreement_variations").update({ copy_sent_at: new Date().toISOString(), copy_error: null }).eq("id", vr.id);
        await db.from("agreement_events").insert({ agreement_id, actor: "system", kind: "variation_copy_emailed", detail: { number: vr.number, to: to.join(", ") } });
        return json({ ok: true });
      } catch (e: any) {
        await db.from("agreement_variations").update({ copy_error: String(e?.message || e) }).eq("id", vr.id);
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }
    if (type === "prior_notice") {
      const { data: isAgent } = await userClient.rpc("is_agent");
      if (!isAgent) return json({ error: "Not allowed" }, 403);
      const { data: n }: any = await db.from("prior_agency_notices").select("*").eq("id", String(body.notice_id || "")).eq("agreement_id", agreement_id).maybeSingle();
      if (!n || n.status === "sent") return json({ ok: true, note: "nothing to send" });
      if (!n.email || !n.reviewed_at) return json({ ok: false, error: "Add the agency email and review the notice first" }, 400);
      const cc = (people || []).filter((p: any) => p.email && p.signed_at).map((p: any) => p.email);
      const sellers = (people || []).filter((p: any) => p.legal_name && p.signed_at).map((p: any) => p.legal_name);
      const sellerList = sellers.length < 2 ? sellers.join("") : sellers.slice(0, -1).join(", ") + " and " + sellers.at(-1);
      try {
        const pdf = await makeNoticePdf(db, n.id);
        const html = wrap(`<p>Kia ora${n.agent_name ? " " + esc(n.agent_name.split(" ")[0]) : ""},</p>
          <p>On behalf of ${esc(sellerList)}, please find attached their signed notice cancelling your agency for <strong>${esc(ag.address)}</strong>.</p>
          <p>They've asked that you confirm in writing the date your agency ends, stop marketing the property from that date, and send them a list of anyone you introduced to the property during your agency. They're copied in on this email.</p>
          <p>Please reply to all. Thank you.</p>`);
        await sendMail(db, agreement_id, "prior_notice", { to: n.email, cc, bcc: TIM_EMAIL, replyTo: "tim@mcguire.co.nz", subject: `Notice of cancellation of agency: ${ag.address}`, html, attachments: [{ filename: pdf.filename, content: pdf.bytes, contentType: "application/pdf" }] });
        await db.from("prior_agency_notices").update({ status: "sent", sent_at: new Date().toISOString(), sent_to: n.email, sent_method: "Emailed from the onboarding app", sent_by: "Tim McGuire", send_error: null }).eq("id", n.id);
        await db.from("agreement_events").insert({ agreement_id, actor: "system", kind: "prior_notice_sent", detail: { agency: n.agency, to: n.email } });
        return json({ ok: true });
      } catch (e: any) {
        await db.from("prior_agency_notices").update({ send_error: String(e?.message || e) }).eq("id", n.id);
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }
    return json({ error: "Unknown type" }, 400);
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

// Pre-listing (appraisal → questionnaire → updated plan) emails.
const PL_ITEMS: [string, string][] = [["method", "Sale method"], ["price", "Indicative price"], ["start", "Start date"], ["marketing", "Marketing"]];
async function prelistingMail(req: Request, body: any) {
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const id = String(body.prelisting_id || "");
  const { data: visible } = await userClient.from("prelistings").select("id").eq("id", id).maybeSingle();
  if (!visible) return json({ error: "Not allowed" }, 403);
  const db = admin();
  const { data: pl }: any = await db.from("prelistings").select("*").eq("id", id).single();
  const a = pl.answers || {}, ap = pl.appraisal || {};
  const first = (pl.contact_name || "").split(/\s+/)[0];
  const btn = (label: string) => `<p><a href="${APP_URL}" style="display:inline-block;background:#D9432C;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:600">${label}</a></p>`;
  const td = "padding:8px 10px 8px 0;border-bottom:1px solid #E4E0DA;vertical-align:top";
  const tr = (k: string, v: string) => `<tr><td style="${td};color:#6E6A65;width:42%">${k}</td><td style="${td}">${v}</td></tr>`;
  const ans = (k: string) => a[k] ? esc(a[k]).replace(/\n/g, "<br>") : `<span style="color:#9A958F">No answer</span>`;
  const isAgent = async () => !!(await userClient.rpc("is_agent")).data;
  const owners = (a.owners || []).map((o: any) => `${esc(o.name)}${o.pref ? ` (“${esc(o.pref)}”)` : ""}<br><span style="color:#6E6A65">${esc(o.email)}${o.mobile ? " · " + esc(o.mobile) : ""}</span>`).join("<br>");
  const vendorTo = [pl.contact_email];

  if (body.type === "pl_invite") {
    if (!(await isAgent())) return json({ error: "Not allowed" }, 403);
    await sendMail(db, null, "pl_invite", { to: vendorTo, bcc: TIM_EMAIL, subject: `Your appraisal: ${pl.address}`, html: wrap(`<p>Kia ora${first ? " " + esc(first) : ""},</p>
      <p>Thanks for having me through ${esc(pl.address)}. Your appraisal and my plan for selling it are ready to look at.</p>
      <table style="border-collapse:collapse;width:100%">${PL_ITEMS.map(([k, l]) => tr(l, esc(ap[k] || "To discuss"))).join("")}</table>
      <p>Open the link below and sign in with this email address. You'll get a sign-in link, no password needed.</p>${btn("See your appraisal")}`) });
    await db.from("prelistings").update({ invited_at: new Date().toISOString() }).eq("id", id);
    return json({ ok: true });
  }
  if (body.type === "pl_plan") {
    if (!(await isAgent())) return json({ error: "Not allowed" }, 403);
    if (pl.status !== "plan") return json({ ok: true, note: "not published" });
    const name = ((a.owners || [])[0]?.pref) || first;
    await sendMail(db, null, "pl_plan", { to: vendorTo, bcc: TIM_EMAIL, subject: `Your updated plan: ${pl.address}`, html: wrap(`<p>Kia ora${name ? " " + esc(name) : ""},</p>
      <p>Thank you for your answers. I've updated the plan for ${esc(pl.address)} around what you told me. You'll see what you said, and what I've changed.</p>${btn("See your updated plan")}
      <p>If it addresses your concerns, you can tick to say so and we'll arrange to meet. If you still have a question, there's a place to ask it.</p>`) });
    return json({ ok: true });
  }
  if (body.type === "pl_submitted") {
    if (pl.status !== "submitted") return json({ ok: true, note: "not submitted" });
    await sendMail(db, null, "pl_submitted", { to: TIM_EMAIL, subject: `Questionnaire answers: ${pl.address}`, html: wrap(`<p><strong>${esc(pl.contact_name || pl.contact_email)}</strong> has answered the pre-listing questions for <strong>${esc(pl.address)}</strong>.</p>
      <table style="border-collapse:collapse;width:100%">
      ${tr("Have you spoken with anyone else about selling?", ans("spoke"))}
      ${tr("Anything you liked, anything that put you off, or anything that left you wondering?", ans("spokeFeel"))}
      ${tr("If every agent charged exactly the same, who would you choose?", ans("choose"))}
      ${tr("What's behind that choice?", ans("chooseWhy"))}
      ${tr("Any other ideas you'd like built into our plan?", ans("ideas"))}
      ${PL_ITEMS.map(([k, l]) => tr(`Confidence: ${l} (${esc(ap[k] || "not set")})`, (a.conf || {})[k] ? `<strong>${a.conf[k]} of 5</strong>` : "Not rated")).join("")}
      ${tr("What do you like most about the plan so far?", ans("likeMost"))}
      ${tr("What would need to be true for working together to be an easy yes?", ans("easyYes"))}
      ${tr("Owners", owners || "None")}
      ${tr("Meeting preference", esc((a.meet || []).join(", ") || "None given"))}
      </table><p>Next: write their updated plan ("You said / I've changed") and publish it.</p>${btn("Open the pre-listing")}`) });
    return json({ ok: true });
  }
  if (body.type === "pl_question") {
    if (pl.status !== "question") return json({ ok: true, note: "no question" });
    await sendMail(db, null, "pl_question", { to: TIM_EMAIL, replyTo: pl.contact_email, subject: `A question about the plan: ${pl.address}`, html: wrap(`<p><strong>${esc(pl.contact_name || pl.contact_email)}</strong> has a question about the updated plan for <strong>${esc(pl.address)}</strong>:</p>
      <p style="padding:10px 14px;background:#FFF4E0;border-radius:6px">“${esc(pl.question)}”</p><p>Reply to this email to answer them directly, then publish the plan again if anything changes.</p>${btn("Open the pre-listing")}`) });
    return json({ ok: true });
  }
  if (body.type === "pl_accepted") {
    if (pl.status !== "accepted") return json({ ok: true, note: "not accepted" });
    await sendMail(db, pl.agreement_id, "pl_accepted", { to: TIM_EMAIL, subject: `Ready to list: ${pl.address}`, html: wrap(`<p><strong>${esc(pl.contact_name || pl.contact_email)}</strong> has confirmed the updated plan for <strong>${esc(pl.address)}</strong> addresses their concerns.</p>
      <p>Their agency agreement is ready as a draft with every owner filled in:</p><p>${owners}</p>
      <p>Meeting preference: ${esc((a.meet || []).join(", ") || "none given")}.</p>
      <p>After you meet, add your fee in the appointment flow, then send it to sign.</p>${btn("Open the agreement")}`) });
    return json({ ok: true });
  }
  return json({ error: "Unknown type" }, 400);
}

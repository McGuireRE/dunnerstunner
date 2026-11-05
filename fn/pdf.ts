import { PDFDocument, rgb, PDFFont, PDFPage, setCharacterSpacing, setWordSpacing, setCharacterSqueeze, setTextRise } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";

// Builds the full agency agreement: Tim's v3.15 template with page 1 filled in and boxes ticked,
// all standard terms, then schedules and an execution record with signatures.
const H = 841.92, W = 595.32;
const INK = rgb(0.05, 0.1, 0.35), GREY = rgb(0.42, 0.42, 0.42), BLACK = rgb(0.1, 0.1, 0.1), RED = INK; // everything written onto the contract is blue
const num = (s: unknown) => parseFloat(String(s ?? "").replace(/[^0-9.]/g, "")) || 0;
const money = (n: number) => "$" + Number(n || 0).toLocaleString("en-NZ", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const nzDate = (d: string | Date) => new Date(d).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "Pacific/Auckland" });
const nzDT = (d: string | Date) => new Date(d).toLocaleString("en-NZ", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Pacific/Auckland" });

export interface PdfInput {
  template: Uint8Array; font: Uint8Array; bold: Uint8Array;
  ag: any; people: any[]; sigs: any[]; sigImages: Record<string, Uint8Array>;
  variations?: any[];
  // Set only for agreements on the phase 2 format (signed after it went live, or not yet signed). Without it
  // the agreement PDF is built exactly as before, so agreements signed earlier come out the same.
  appendix?: Appendix;
}
export interface Appendix {
  set: string;
  // Set only for a guide the server has checked: listed in guides.json with this version (and, when the receipt
  // recorded one, the same SHA-256). received: the client was shown it before signing (a signed agreement).
  // bytes: the file itself, attached unaltered; missing if it couldn't be fetched.
  reaGuide?: { version: string; file: string; title?: string; sha256?: string; received?: boolean; bytes?: Uint8Array } | null;
  // the sale and purchase guide versions listed in guides.json (a signed agreement): a receipt prints only for one of these
  saleListed?: { version: string; file: string }[];
}

// Appended to the agreement (phase 2 format). Tim's wording, tidied for typos only. The app shows the same
// Complaints procedure on the "Before you sign" page (a test checks the two copies match); the Vendor Guide is
// only in the PDF. Change the id whenever the wording changes.
export const APPENDIX_SET = "P2-2026-11";
export const VENDOR_GUIDE = {
  id: "VG-2026-11",
  title: "A Simple Guide to Your Sole and Exclusive Agency Agreement",
  intro: "Your Agency Agreement is written in the formal language of a legal document. Here's what it actually means for you, in plain English.",
  sections: [
    ["What you're appointing us to do", ["You're appointing McGuire Real Estate as your sole and exclusive agent to market and sell your property: the only agency working on the sale, backed to negotiate, handle the paperwork, and do what it takes to bring it home."], []],
    ["How long it runs", [], [
      "Starts and keeps going: the agreement kicks off on the Date of Commencement and runs until it's cancelled; it doesn't expire on its own.",
      "First 90 days: we're both fully committed, giving the campaign a genuine run (or your shorter Review Date, if we've agreed one).",
      "From there: either of us can step away at any time, with 7 days' written notice.",
      "Cooling-off: by law, you can also cancel by 5pm the working day after you receive your copy of the agreement, no questions asked."]],
    ["Other ways this can wrap up", [], [
      "Off-Market Listing: you'll get a written update at least once a month, guaranteed, or you're free to cancel.",
      "Keeping things honest: we'll end it immediately if you ask us to do something unlawful or unethical, misrepresent the property, hide a material change to it, or mislead us about your identity or who you're acting for.",
      "Mutual agreement: both of us can agree in writing to end it at any time; neither of us can do this alone."]],
    ["What you're agreeing to", [], [
      "Warranties: what you tell us (condition, defects, meth history, weathertightness) is honest and to the best of your knowledge, not a guarantee.",
      "Access: we'll collaborate to flag hazards, and visiting professionals sign our access form.",
      "Marketing material: we can use what we create; you keep the rights to anything you've paid for.",
      "Identity checks: we must verify your identity before acting for you, as the law requires.",
      "Confidentiality: the agreement's terms stay between us, except where the law requires disclosure."]],
    ["Buyers we meet through your listing", [], [
      "Their privacy: we owe buyers confidentiality too, so we won't confirm or deny dealing with them elsewhere, and our silence isn't evidence of anything.",
      "No claim on other deals: if a buyer we meet through your listing later engages us for something unrelated, that's between us and them; you have no claim to any fee from it."]],
    ["If we ever want to buy your property", [], [
      "We, or anyone related to us, can only do this with your written consent and an independent valuation (which we pay for) given to you first. If we don't follow this, you can cancel and we lose our commission."]],
    ["What you pay, and your deposit", ["Your commission is whatever's recorded on the front page (Appointment of Agency D); that governs, not any figure quoted elsewhere. It's tiered: below a set sale price, it's a flat fee rather than a percentage, because a straight percentage doesn't cover the fixed cost of marketing a lower-value home; above that price, the flat fee stays, plus a percentage of the amount above it. Separately (Appointment of Agency E), you also pay marketing costs and a $575 administration fee (including GST); the administration fee covers our AML/CFT identity checks and other onboarding work, is payable on signing, and applies whether or not the property sells. Marketing costs are usually refunded if the listing is withdrawn before they're spent. Any deposit is held by an independent stakeholder (NZRET or Public Trust), not us, for at least 10 working days; our commission and expenses are paid from settlement or the deposit once it can be released."], []],
    ["We're here to help", ["Talk to us first, we want to sort it out: contact Tim McGuire, 027 562 7207, tim@mcguire.co.nz. You're never required to use our in-house process, and you can contact the Real Estate Authority (0800 367 7322) at any time, whether or not you've raised it with us."], []],
  ] as [string, string[], string[]][],
  note: "This guide is a plain-language summary for convenience only. It does not replace, override, or form part of your Agency Agreement; if anything here differs from the Agreement, the Agreement applies. Licensed REA 2008.",
};
export const COMPLAINTS = {
  id: "CDR-2026-11",
  title: "Complaints and Dispute Resolution Procedures",
  intro: [
    "Pursuant to Rule 12 of the Real Estate Agents Act (Professional Conduct and Client Care Rules) 2012, all licensed Real Estate Agents are required to have a written in-house complaints and dispute resolution procedure. That procedure is set out below.",
    "You do not have to use our complaints and resolution procedure. You may make a complaint directly to the Real Estate Authority at any time. You can make a complaint to the Real Estate Authority even if you choose to also use our procedures.",
    "Our complaints and dispute resolution procedures are designed to provide a simple and personalised process for resolving any complaint you might have about the service you have received from our agency.",
  ],
  steps: [
    ["Step 1: Contact the Manager", ["Timothy McGuire", "Phone: 027 562 7207", "Email: tim@mcguire.co.nz", "Tell the manager who you are complaining about and what your concerns are. Let the manager know what you would like done about your complaint."]],
    ["Step 2", ["The manager may ask you to put your complaint in writing so that he or she can investigate it. The manager will need a brief period to talk to the team members involved. We promise to come back to you within 10 working days with a response to your complaint. That response may be in writing. As part of the response, we might ask you to meet with members of our team to discuss the complaint and try and agree a resolution."]],
    ["Step 3", ["If we are unable to come to an agreed resolution after a meeting, or if you don't wish to meet with us, then we will provide you with a written proposal to resolve your complaint."]],
    ["Step 4", ["If you do not accept our proposal, please advise us in writing within five working days. You can of course suggest another way of resolving your complaint."]],
    ["Step 5", ["If we accept your preferred resolution, we will attempt to implement that resolution as soon as possible. If we decline your preferred resolution, we may invite you to mediate the dispute."]],
    ["Step 6", ["If we agree to mediate the complaint but do not settle the complaint at mediation, or we do not agree to mediate the dispute, then that will be the end of our process."]],
  ] as [string, string[]][],
  close: "Remember, you can still make a complaint to the Real Estate Authority in the first instance, and even if you use these procedures, you can still make a complaint to the Real Estate Authority at any time. The Real Estate Authority, C/O P.O. Box 25-371, Wellington 6146, New Zealand, 0800 367 7322 or 04 471 8930.",
};

export async function buildAgreementPdf(inp: PdfInput): Promise<Uint8Array> {
  const { ag, people } = inp;
  const sigs = [...inp.sigs].sort((a, b) => a.signed_at < b.signed_at ? -1 : 1);
  const clientSigs = sigs.filter((s) => s.signer_role === "client");
  const agentSig = sigs.find((s) => s.signer_role === "agent");
  // Use exactly what was signed, if signed
  const snap = clientSigs.length ? clientSigs[clientSigs.length - 1].snapshot || {} : {};
  const c = snap.config || ag.config || {};
  const a = snap.answers || ag.answers || {};
  const signers = people.filter((p) => p.legal_name);

  const src = await PDFDocument.load(inp.template);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const F = await doc.embedFont(inp.font, { subset: true });
  const B = await doc.embedFont(inp.bold, { subset: true });
  doc.setTitle(`Agency Agreement ${ag.ref} ${ag.address}`);
  doc.setAuthor("McGuire Real Estate Limited");
  doc.setSubject(`Sole and Exclusive Agency Agreement ${ag.agreement_version}`);

  const order = [1, 2, 3, 4, 5, 6, 7];
  const copied = await doc.copyPages(src, order);
  copied.forEach((p) => doc.addPage(p));
  const pg = (i: number) => doc.getPage(i); // 0 = front page

  const txt = (p: PDFPage, s: string, x: number, top: number, size = 9, font: PDFFont = F, color = INK, maxW?: number) => {
    s = String(s ?? "");
    if (maxW) { while (size > 6 && font.widthOfTextAtSize(s, size) > maxW) size -= 0.25; if (font.widthOfTextAtSize(s, size) > maxW) { while (s.length > 3 && font.widthOfTextAtSize(s + "…", size) > maxW) s = s.slice(0, -1); s += "…"; } }
    p.drawText(s, { x, y: H - top, size, font, color });
  };
  const tick = (p: PDFPage, x: number, top: number, h = 12) => p.drawText("✓", { x: x + 0.3, y: H - top - h + 2.2, size: h * 0.82, font: B, color: INK });
  const white = (p: PDFPage, x0: number, top: number, x1: number, bottom: number) => p.drawRectangle({ x: x0, y: H - bottom, width: x1 - x0, height: bottom - top, color: rgb(1, 1, 1) });
  const strike = (p: PDFPage, x0: number, x1: number, top: number) => p.drawLine({ start: { x: x0, y: H - top }, end: { x: x1, y: H - top }, thickness: 0.9, color: RED });

  // hide the "SAMPLE ONLY" header on every template page
  // reset text spacing left over from the template, then hide the "SAMPLE ONLY" header
  for (let i = 0; i < order.length; i++) { pg(i).pushOperators(setCharacterSpacing(0), setWordSpacing(0), setCharacterSqueeze(100), setTextRise(0)); white(pg(i), 50, 18, 160, 38); }

  /* ── Page 1: Appointment of Agency ── */
  const p1 = pg(0);
  const cap = a.capacity || "Owners";
  const clientLine = signers.map((p) => p.legal_name).join(" and ") + (cap !== "Owners" && a.entity ? `, for ${a.entity}` : "");
  txt(p1, clientLine, 52, 127, 9.5, F, INK, 480);
  if (cap === "Trustee") p1.drawEllipse({ x: 146.7, y: H - 145, xScale: 22, yScale: 8, borderColor: INK, borderWidth: 0.8 });
  else if (cap === "Director") p1.drawEllipse({ x: 193.8, y: H - 145, xScale: 23, yScale: 8, borderColor: INK, borderWidth: 0.8 });
  else if (cap !== "Owners") p1.drawLine({ start: { x: 222, y: H - 152.5 }, end: { x: 412, y: H - 152.5 }, thickness: 0.8, color: INK });
  if (a.gst === "yes") { tick(p1, 301.8, 189.6); txt(p1, a.gstNo || "", 426, 199, 8.5, F, INK, 97); } else tick(p1, 241, 189.6);
  txt(p1, ag.address, 52, 241, 9.5, F, INK, 480);
  const pending = c.appr === "pending";
  txt(p1, pending ? "On receipt of written appraisal" : c.start ? nzDate(c.start) : (ag.signed_at ? nzDate(ag.signed_at) : "Date of signing"), 434, 287, 8.5, F, INK, 95);
  const thr = num(c.thr) || 250000;
  if (thr !== 250000) {
    white(p1, 225.5, 361, 272, 373); txt(p1, money(thr), 226, 370.5, 9.5, B, INK);
    white(p1, 313, 374, 359.5, 386); txt(p1, money(thr), 313.7, 383.5, 9.5, B, INK);
  }
  txt(p1, Number(num(c.flat)).toLocaleString("en-NZ"), 330, 370, 9.5, F, INK, 70);
  const aboveT = c.aboveType || "pct";
  if (aboveT === "pct") txt(p1, String(c.pct ?? ""), 412, 383, 9.5, F, INK, 48);
  else {
    white(p1, 406, 374, 474, 387);
    txt(p1, aboveT === "amount" ? `$${Number(num(c.aboveAmt)).toLocaleString("en-NZ")} (fixed sum)` : "nil (flat fee at any price)", 409, 383, 9.5, F, INK, 140);
    p1.drawLine({ start: { x: 407, y: H - 385.5 }, end: { x: 552, y: H - 385.5 }, thickness: 0.5, color: INK });
  }
  if (!pending && num(c.ask)) {
    tick(p1, 113.5, c.askBasis === "median" ? 449.7 : 430.7);
    const ask = num(c.ask), flat = num(c.flat), pct = num(c.pct);
    const est = aboveT === "none" || ask <= thr ? flat : aboveT === "amount" ? flat + num(c.aboveAmt) : flat + (ask - thr) * pct / 100;
    txt(p1, Number(ask).toLocaleString("en-NZ"), 188, 476.5, 8.5, F, INK, 44);
    txt(p1, Number(Math.round(est * 100) / 100).toLocaleString("en-NZ", { minimumFractionDigits: 2 }), 394, 476.5, 8.5, F, INK, 54);
  } else if (pending) txt(p1, "Example to follow with the written appraisal", 300, 440, 7.5, F, GREY);
  // E. costs
  const limOn = c.limOn !== false, lim = c.lim === undefined || c.lim === "" ? 425 : num(c.lim);
  const admOn = c.adminOn !== false, adm = c.admin === undefined || c.admin === "" ? 575 : num(c.admin);
  if (!limOn || lim === 0) { strike(p1, 72, 393, 537.5); txt(p1, "Not applicable (agreed)", 410, 540, 8, B, RED); }
  else if (lim !== 425) { strike(p1, 295, 332, 537.5); txt(p1, `Amended: ${money(lim)}`, 410, 540, 8, B, RED); }
  const [pk, pkAmt] = String(c.pkg || "Later|0").split("|");
  const later = pk === "Later" || a.mkt === "later";
  txt(p1, later ? "To be agreed in writing" : Number(pk === "Custom" ? num(c.custom) : +pkAmt).toLocaleString("en-NZ", { minimumFractionDigits: 2 }), 247, 553, 8.5, F, INK, 64);
  if (!admOn || adm === 0) { strike(p1, 72, 418, 565.5); txt(p1, "Not applicable (agreed)", 428, 568, 8, B, RED); }
  else if (adm !== 500) { strike(p1, 78, 102, 565.5); txt(p1, `Amended: ${money(adm)}`, 428, 568, 8, B, RED); }
  if (c.campaign && c.campaign.snapshot && (c.campaign.snapshot.lines || []).length && !later) txt(p1, "Marketing itemised in Schedule 6. Campaign timeline in Schedule 7.", 72, 583, 7.5, F, INK);
  else if (c.schedule && (c.schedule.phases || []).length) txt(p1, "Campaign timeline in Schedule 7.", 72, 583, 7.5, F, INK);
  // signatures on page 1
  const sigLines = [{ img: 600, name: 628.5 }, { img: 652, name: 680.5 }];
  for (let i = 0; i < Math.min(2, signers.length); i++) {
    const p = signers[i], s = clientSigs.find((x) => x.person_id === p.id), L = sigLines[i];
    txt(p1, p.legal_name, 140, L.name, 8.5, F, INK, 250);
    if (s) {
      const bytes = inp.sigImages[s.id];
      if (bytes) { const im = await doc.embedPng(bytes); const h = 30, w = Math.min(300, im.width * (h / im.height)); p1.drawImage(im, { x: 118, y: H - L.img - 13, width: w, height: h }); }
      txt(p1, nzDate(s.signed_at), 503, L.name, 7.5, F, INK, 52);
    }
  }
  if (signers.length > 2) txt(p1, `Further signatories: ${signers.slice(2).map((p) => p.legal_name).join(", ")}. See Execution Record.`, 115, 693, 7.5, F, INK, 420);
  if (agentSig) {
    const bytes = inp.sigImages[agentSig.id];
    if (bytes) { const im = await doc.embedPng(bytes); const h = 30, w = Math.min(280, im.width * (h / im.height)); p1.drawImage(im, { x: 118, y: H - 704.7 - 10, width: w, height: h }); }
    txt(p1, nzDate(agentSig.signed_at), 503, 733, 7.5, F, INK, 52);
  }

  /* ── Page 2: clause 2.3 excluded persons ── */
  const buyers: any[] = a.interested || [];
  const excluded = buyers.filter((b) => b.exclude);
  const p2 = pg(1);
  if (excluded.length) {
    const e0 = excluded[0];
    txt(p2, e0.name, 95, 783.5, 7.5, F, INK, 142); txt(p2, e0.phone || "", 245, 783.5, 7.5, F, INK, 142); txt(p2, e0.email || "", 393, 783.5, 7.5, F, INK, 144);
    if (excluded.length > 1) txt(p2, `and ${excluded.length - 1} more: see Schedule 4`, 95, 795, 7, F, GREY);
  } else txt(p2, "None", 95, 783.5, 7.5, F, INK);

  /* ── Page 3: prior agency, sale method ── */
  const p3 = pg(2);
  if (a.prior === "yes") { tick(p3, 92.3, 95.2, 10); txt(p3, a.priorDetail || "", 95, 128, 7.5, F, INK, 440); }
  else if (a.prior) tick(p3, 92.3, 70.7, 10);
  const M: Record<string, [number, number, number?, number?, number?]> = {
    "Auction": [92.3, 282.3, 437, 285.5, 66], "Tender": [92.3, 326.5, 94, 340.8, 82],
    "Deadline sale": [121.7, 360.4, 375, 363.5, 82], "Ballot": [121.7, 373.3, 362, 376.5, 82],
    "Timed sale": [121.7, 386.3, 383, 389.5, 82], "Expressions of interest": [121.7, 399.1],
    "Price by negotiation": [121.7, 412.1], "Fixed price": [121.7, 424.9, 412, 428, 82],
  };
  const m = M[c.method || ""];
  if (m) { tick(p3, m[0], m[1] - 5, 9); const v = c.method === "Fixed price" ? (num(c.ask) ? Number(num(c.ask)).toLocaleString("en-NZ") : "") : (c.methodDate || ""); if (m[2] && v) txt(p3, v, m[2], m[3]!, 7.5, F, INK, m[4]); }

  /* ── Page 4: clause 9.4 additional comments ── */
  const p4 = pg(3);
  const notes: string[] = [];
  if (a.wt === "yes") notes.push(`Weathertightness: ${a.wtDetail}`);
  if (a.meth === "yes") notes.push(`Methamphetamine: ${a.methDetail}`);
  if (a.def === "yes") notes.push(`Defects or notices: ${a.defDetail}`);
  if (a.work === "yes") notes.push(`Work done: ${a.workDetail}`);
  const noteLines = wrap(notes.length ? notes.join(". ") + ". See also Schedule 1." : "Nil known to the Client. See Schedule 1 (Property Description).", F, 7.5, 465);
  noteLines.slice(0, 3).forEach((l, i) => txt(p4, i === 2 && noteLines.length > 3 ? l.replace(/.{0,24}$/, "… continued in Schedule 1") : l, 80, 576 + i * 10.5, 7.5));

  /* ── Page 7: clause 23.1 appraisal ── */
  txt(pg(6), c.apprUrl || (pending ? "To be provided before the agency commences" : "Provided to the Client in writing"), 112, 792.5, 8, F, INK, 370);

  /* ── Schedules ── */
  const S = new Sched(doc, F, B, ag);
  const row = (k: string, v: string) => S.kv(k, v || "–");
  S.page("Schedule 1: Property Description", "Clause 9.2.1");
  row("Property", ag.address);
  row("Type", a.pType); row("Bedrooms / bathrooms", `${a.pBed || "?"} / ${a.pBath || "?"}`);
  row("Floor / land area", `${a.pFloor || "?"} m² / ${a.pLand || "?"} m²`); row("Year built", a.pYear);
  row("Construction", a.pBuild); row("Parking", a.pPark); row("Heating and insulation", a.pHeat);
  row("Chattels included", (a.chattels || []).join(", ") + (a.chatOther ? `. ${a.chatOther}` : ""));
  row("Work done and consents", a.work === "yes" ? a.workDetail : a.work === "no" ? "None known to the Client" : "");
  row("Weathertightness", a.wt === "yes" ? a.wtDetail : a.wt === "no" ? "No issues known to the Client" : "");
  row("Methamphetamine", a.meth === "yes" ? a.methDetail : a.meth === "no" ? "None known to the Client" : "");
  row("Defects, notices or requisitions", a.def === "yes" ? a.defDetail : a.def === "no" ? "None known to the Client" : "");
  row("Hazards (clause 16.2)", (a.hazards || []).join(", ") + (a.hazOther ? `. ${a.hazOther}` : "") || "None identified");
  row("Client's description", a.pLove);
  S.para("The Client confirms the above is correct to the best of the Client's knowledge and belief (clause 9.2).", 8.5, GREY);

  S.page("Schedule 2: Verification of Ownership", "Clause 9.1.1");
  row("Registered owner(s) per title", c.owners); row("Title reference", c.title);
  row("Client(s)", signers.map((p) => p.legal_name).join(", "));
  row("Capacity", cap === "Owners" ? "Registered owners, personally" : `${cap}${a.entity ? ` for ${a.entity}` : ""}`);
  row("GST", a.gst === "yes" ? `Registered: ${a.gstNo || ""}` : "Not registered");
  S.para(a.titleOk ? "The Client confirmed that the ownership details are correct and that no other person has an interest in the Property (such as a mortgagee sale, estate or relationship property claim), and that the Client has full authority to sign this agreement." : "Ownership confirmation not recorded.", 9);

  S.page("Schedule 3: Visiting Professionals", "Clause 16.4 and the Third-Party Investigation Policy");
  S.para("The Client instructs the Agent to require every visiting professional (including building inspectors, valuers, engineers, tradespeople, photographers, stagers and other contractors) to:", 9);
  ["be accompanied by a McGuire Real Estate representative for the whole visit (company policy);", "give their name and contact details and sign the Agent's standard property access form before entering;", "hold current registration or licensing for their trade, and current public liability insurance;", "declare the purpose of the visit (independent assessment, quotation, or sales assessment), and remain independent of any remedial work arising from their own report when attending as an independent inspector;", "follow all safety and access directions, bring their own equipment, and keep confidential anything learned at the Property."].forEach((t) => S.bullet(t));
  S.gap(6);
  row("Visits to quote for a buyer", a.vQuotes === false ? "Not permitted" : "Permitted");
  row("Sales assessments", a.vSales ? "Permitted" : "Not permitted");
  row("Notify the Client before each visit", a.vNotify === false ? "No" : "Yes");
  row("Minimum notice", a.vNotice || "Same day is fine");
  row("Access notes", a.vNotes);

  S.page("Schedule 4: Interested Buyers and Prior Agency", "Clauses 2.3 and 3");
  if (buyers.length) buyers.forEach((b, i) => row(`Interested buyer ${i + 1}`, `${b.name}${b.phone ? ", " + b.phone : ""}${b.email ? ", " + b.email : ""}. ${b.exclude ? "Excluded from this agency for 10 working days from signing (clause 2.3)." : "Included: the Agent will negotiate with this person as part of the campaign."}`));
  else row("Interested buyers", "None listed");
  const priors = a.prior === "yes" ? (a.priorAgencies || []).filter((x: any) => x.agency) : [];
  if (priors.length) priors.forEach((x: any, i: number) => row(`Prior agency ${i + 1}`, `${x.agency}${x.agent ? " (" + x.agent + ")" : ""}, ${(x.kind || "agency").toLowerCase()}${x.dated ? " dated " + x.dated : ""}. The Client signed a notice cancelling it with this agreement.`));
  else row("Prior agency", a.prior === "yes" ? a.priorDetail : a.prior ? "None: the Client warrants no other agent has been appointed (clause 3.1)" : "");

  S.page("Schedule 5: Client Acknowledgements", "Clause 22.1");
  const L = ag.legal || {};
  row("Legal advice (22.1.1)", L.choice === "have" ? `The Client confirmed legal advice was received${L.lawyer ? ` (${L.lawyer}${L.firm ? ", " + L.firm : ""})` : ""}` : L.choice === "waive" ? "The Client was recommended to seek legal advice and chose to proceed without it" : "Not recorded");
  S.para("Before signing, each signatory separately confirmed each of the following on screen:", 9);
  ackList(pending, limOn && lim > 0).forEach((t, i) => (a.acks || []).includes(String(i)) ? S.bullet("✓ " + t) : S.bullet("☐ " + t + " (not confirmed)"));
  S.gap(4);
  S.para(`The Client also read and confirmed understanding of a plain-English summary of each part of this agreement (${(a.guide || []).length} of 8 sections confirmed).`, 8.5, GREY);
  if (pending) S.para("CONDITION: This agreement takes effect on the Client's receipt of a written appraisal from the Agent. The Client may cancel within 2 working days of receiving it, at no cost.", 9, RED);

  campaignPages(S, c, a, true);

  S.page("Execution Record", "Electronic signatures");
  row("Agreement", `${ag.ref} · Sole and Exclusive Agency Agreement ${ag.agreement_version}`);
  row("Property", ag.address);
  if (ag.cooling_off_until) row("Cancellation period", c.approach === "unsolicited" ? `Unsolicited approach: the Client may cancel until the end of ${nzDate(ag.cooling_off_until)} (5 working days after receiving a copy)` : `The Client may cancel by written notice until ${nzDT(ag.cooling_off_until)} (section 130, Real Estate Agents Act 2008)`);
  S.gap(6);
  for (const s of sigs) {
    const p = people.find((x) => x.id === s.person_id);
    S.need(105);
    S.heading2(`${s.signer_name}${s.signer_role === "agent" ? " (Licensee, REA#20117983, for McGuire Real Estate Limited)" : " (Client)"}`);
    const bytes = inp.sigImages[s.id];
    if (bytes) { const im = await doc.embedPng(bytes); const h = 40, w = Math.min(260, im.width * (h / im.height)); S.image(im, w, h); }
    S.small(`Signed ${nzDT(s.signed_at)}${p?.email ? " · signed in as " + p.email : ""}`);
    S.small(`Document fingerprint (SHA-256): ${s.snapshot_sha256}`);
    if (s.user_agent) S.small(`Device: ${String(s.user_agent).slice(0, 120)}`);
    const ok = inp.appendix?.reaGuide;
    const rg = ok && ok.received ? (s.snapshot?.rea_guides || []).find((g: any) => g.guide === "agency" && g.version === ok.version && g.file === ok.file) : null;
    if (rg) S.small(`Received the Real Estate Authority guide to agency agreements (version ${rg.version}), shown on screen before signing. Receipt confirmed ${nzDT(rg.acknowledged_at || s.signed_at)}, and recorded in what was signed.`);
    const sl = inp.appendix?.saleListed || [];
    const rs = (s.snapshot?.rea_guides || []).find((g: any) => g.guide === "sale_purchase" && sl.some((x) => x.file === g.file && x.version === g.version));
    if (rs) S.small(`Received the Real Estate Authority guide to sale and purchase agreements (version ${rs.version}), shown on screen before signing. Receipt confirmed ${nzDT(rs.acknowledged_at || s.signed_at)}, and recorded in what was signed.`);
    S.gap(8);
  }
  const unsigned = signers.filter((p) => !clientSigs.some((s) => s.person_id === p.id));
  if (unsigned.length) S.para(`Not yet signed: ${unsigned.map((p) => p.legal_name).join(", ")}.`, 9, RED);
  if (!agentSig) S.para("Not yet countersigned by the Licensee.", 9, GREY);
  S.para("Each client signed electronically after signing in with their own email address. The fingerprint identifies the exact content each person signed. Electronic signatures under Part 4 of the Contract and Commercial Law Act 2017.", 8, GREY);

  const vars = (inp.variations || []).filter((v) => v.status === "signed").sort((x, y) => x.number - y.number);
  if (vars.length) {
    S.page("Variations", "Signed changes to this agreement, in order. Each is a separate signed document");
    for (const v of vars) {
      S.need(40); S.heading2(`Variation ${v.number}, signed by everyone ${nzDT(v.signed_at)}`);
      for (const r of v.summary || []) row(r.label, `${r.to}${r.from ? `  (was: ${r.from})` : ""}`);
      S.gap(6);
    }
    S.para("All other terms of the agreement stay as signed.", 8.5, GREY);
  }

  const untouched = new Set<number>(); // pages appended exactly as published: no footer or stamp on them
  if (!inp.appendix) {
    // Vendor guide last (agreements signed before phase 2 keep the template's own page)
    const [guide] = await doc.copyPages(src, [0]); doc.addPage(guide); guide.pushOperators(setCharacterSpacing(0), setWordSpacing(0), setCharacterSqueeze(100), setTextRise(0)); white(guide, 50, 18, 160, 38);
  } else {
    appendixPages(S, ag.ref, c);
    S.suffix = undefined;
    const rg = inp.appendix.reaGuide;
    if (rg && rg.bytes) {
      const gd = await PDFDocument.load(rg.bytes);
      const pages = await doc.copyPages(gd, gd.getPageIndices());
      pages.forEach((p) => { untouched.add(doc.getPageCount()); doc.addPage(p); });
    } else if (rg && rg.received) {
      S.page(rg.title || "Real Estate Authority guide to agency agreements", `Version ${rg.version}`);
      S.para(`The Client received version ${rg.version} of the Real Estate Authority's guide to agency agreements on screen before signing. The guide could not be attached to this copy; ask McGuire Real Estate for it.`, 9);
    }
  }

  // footer
  const n = doc.getPageCount(), gen = nzDT(new Date());
  const isDraft = !["signed", "countersigned", "ended"].includes(ag.status);
  const STAMP = rgb(0.75, 0.2, 0.1);
  doc.getPages().forEach((p, i) => {
    if (untouched.has(i)) return;
    p.drawText(`${isDraft ? "DRAFT FOR REVIEW, NOT SIGNED · " : "SIGNED COPY · "}${ag.ref} · ${ag.address} · copy generated ${gen} · page ${i + 1} of ${n}`, { x: 48, y: 10, size: 6.5, font: isDraft ? B : F, color: isDraft ? STAMP : GREY });
    if (isDraft) { const t = "DRAFT FOR REVIEW: NOT SIGNED", w = B.widthOfTextAtSize(t, 10); p.drawRectangle({ x: 42, y: H - 30, width: w + 12, height: 18, borderColor: STAMP, borderWidth: 1.2, color: rgb(1, 1, 1) }); p.drawText(t, { x: 48, y: H - 25, size: 10, font: B, color: STAMP }); }
  });
  return await doc.save();
}

const isoNZ = (iso: string) => iso ? new Date(iso + "T12:00:00Z").toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
function campaignPages(S: Sched, c: any, a: any, numbered: boolean) {
  const cs = c.campaign && c.campaign.snapshot;
  const later = String(c.pkg || "").startsWith("Later") || a.mkt === "later";
  if (cs && (cs.lines || []).length) {
    S.page(numbered ? "Schedule 6: Marketing Campaign" : "Marketing Campaign", numbered ? "Clause 6.1 and Appointment of Agency E.2" : "Campaign summary");
    if (later) S.para("The Client chose to agree the marketing budget later. This campaign is Tim's recommendation only, and nothing will be booked or spent until the Client approves a budget in writing.", 9, INK);
    S.kv("Campaign", cs.title || "Marketing campaign");
    for (const l of cs.lines) S.money(l.name, [l.detail, l.sup].filter(Boolean).join(" · "), l.poa ? "On request" : money(l.amount));
    if (cs.saving > 0 && !cs.overridden) S.money("Package saving", "", "−" + money(cs.saving));
    if (cs.overridden) S.money("Items at full price", "", money(cs.itemsTotal));
    S.money(cs.overridden ? "Agreed campaign total, including GST" : "Campaign total, including GST", "", money(cs.total), true);
    S.gap(4);
    S.para(`Always included at no charge: ${(cs.included || []).join(", ")}.`, 8.5, GREY);
    S.para("The LIM report and any administration fee are shown separately on the front page. Prices include GST. Suppliers may vary, subject to booking. Unspent marketing is refunded if the property is withdrawn before it is spent (clause 6).", 8.5, GREY);
  }
  const sch = c.schedule;
  if (sch && (sch.phases || []).length) {
    S.page(numbered ? "Schedule 7: Campaign Schedule" : "Campaign Schedule", numbered ? "A guide to the campaign. Dates may move with bookings and weather" : "A guide to what happens when");
    const ev = (sch.events || []).filter((e: any) => e.title).sort((x: any, y: any) => (x.date || "") < (y.date || "") ? -1 : 1);
    if (ev.length) { S.heading2("Key dates"); for (const e of ev) S.kv(`${isoNZ(e.date)}${e.time ? ", " + e.time : ""}`, e.title); S.gap(6); }
    sch.phases.forEach((ph: any, i: number) => {
      S.need(40);
      S.heading2(`${i + 1}. ${ph.title}${ph.start ? "  ·  commencing " + isoNZ(ph.start) : ""}`);
      (ph.items || []).filter(Boolean).forEach((t: string) => S.bullet(t));
      S.gap(6);
    });
  }
}

export async function buildCampaignPdf(inp: PdfInput): Promise<Uint8Array> {
  const { ag, people } = inp;
  const clientSigs = inp.sigs.filter((s) => s.signer_role === "client").sort((x, y) => x.signed_at < y.signed_at ? -1 : 1);
  const snap = clientSigs.length ? clientSigs[clientSigs.length - 1].snapshot || {} : {};
  const c = snap.config || ag.config || {}, a = snap.answers || ag.answers || {};
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const F = await doc.embedFont(inp.font, { subset: true });
  const B = await doc.embedFont(inp.bold, { subset: true });
  doc.setTitle(`Marketing Campaign ${ag.address}`); doc.setAuthor("McGuire Real Estate Limited");
  const names = people.filter((p) => p.legal_name).map((p) => p.legal_name).join(" and ");
  const S = new Sched(doc, F, B, ag, ` · ${ag.address}${names ? " · prepared for " + names : ""}`);
  campaignPages(S, c, a, false);
  if (doc.getPageCount() === 0) { S.page("Marketing Campaign", "No campaign has been set up yet"); }
  const n = doc.getPageCount(), gen = nzDT(new Date());
  doc.getPages().forEach((p, i) => p.drawText(`McGuire Real Estate · ${ag.address} · generated ${gen} · page ${i + 1} of ${n}`, { x: 48, y: 10, size: 6.5, font: F, color: GREY }));
  return await doc.save();
}

function ackList(pending: boolean, lim: boolean) {
  return [
    "I was told I may need technical or other advice, and given time to get it",
    "I received the Real Estate Authority guide to agency agreements",
    "I received the Real Estate Authority guide to sale and purchase agreements",
    "I know about McGuire's complaints process, and that I can go straight to the Real Estate Authority",
    "It was explained when I could end up paying two commissions",
    "I was told when this agreement ends",
    "Sale methods were explained, including how the method can affect what licensees earn",
    "I understand what McGuire must disclose to buyers",
    pending ? "I understand this agreement only takes effect once I've received a written appraisal" : "I received a written appraisal",
    "I was recommended to get tax and legal advice where it applies",
    "I was advised about the LIM report, and to get advice on its contents" + (lim ? "" : ""),
  ];
}

function wrap(s: string, f: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of String(s ?? "").split(/\n/)) {
    let line = "";
    for (const w of para.split(/\s+/)) {
      const t = line ? line + " " + w : w;
      if (f.widthOfTextAtSize(t, size) > maxW && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}

class Sched {
  p!: PDFPage; y = 0; brand = "McGuire Real Estate";
  constructor(private doc: PDFDocument, private F: PDFFont, private B: PDFFont, private ag: any, public suffix?: string) {}
  page(title: string, sub: string) {
    this.p = this.doc.addPage([W, H]); this.y = H - 60;
    if (this.brand) this.p.drawText(this.brand, { x: 50, y: H - 40, size: 8, font: this.B, color: RED });
    this.p.drawText(title, { x: 50, y: this.y, size: 15, font: this.B, color: BLACK }); this.y -= 16;
    this.p.drawText(`${sub}${this.suffix ?? ` · forms part of Agency Agreement ${this.ag.ref}`}`.slice(0, 140), { x: 50, y: this.y, size: 8.5, font: this.F, color: GREY }); this.y -= 22;
  }
  need(h: number) { if (this.y - h < 40) { this.p = this.doc.addPage([W, H]); this.y = H - 50; } }
  kv(k: string, v: string) {
    const lines = wrap(v, this.F, 9, 330); this.need(lines.length * 12 + 8);
    this.p.drawText(k, { x: 50, y: this.y, size: 8.5, font: this.B, color: GREY });
    lines.forEach((l, i) => this.p.drawText(l, { x: 215, y: this.y - i * 12, size: 9, font: this.F, color: BLACK }));
    this.y -= lines.length * 12 + 4;
    this.p.drawLine({ start: { x: 50, y: this.y + 1 }, end: { x: W - 50, y: this.y + 1 }, thickness: 0.4, color: rgb(0.88, 0.86, 0.83) }); this.y -= 8;
  }
  para(s: string, size = 9, color = BLACK) { const lines = wrap(s, this.F, size, W - 100); this.need(lines.length * (size + 3) + 6); lines.forEach((l) => { this.p.drawText(l, { x: 50, y: this.y, size, font: this.F, color }); this.y -= size + 3; }); this.y -= 6; }
  bullet(s: string) { const lines = wrap(s, this.F, 9, W - 120); this.need(lines.length * 12 + 2); lines.forEach((l, i) => { if (i === 0 && !/^[✓☐]/.test(s)) this.p.drawText("•", { x: 56, y: this.y, size: 9, font: this.F, color: BLACK }); this.p.drawText(l, { x: 68, y: this.y, size: 9, font: this.F, color: BLACK }); this.y -= 12; }); this.y -= 2; }
  money(name: string, detail: string, amount: string, bold = false) {
    const lines = wrap(name, bold ? this.B : this.F, 9.5, 390), dl = detail ? wrap(detail, this.F, 7.5, 390) : [];
    this.need(lines.length * 12 + dl.length * 10 + 10);
    if (bold) this.p.drawLine({ start: { x: 50, y: this.y + 11 }, end: { x: W - 50, y: this.y + 11 }, thickness: 1, color: BLACK });
    lines.forEach((l, i) => this.p.drawText(l, { x: 50, y: this.y - i * 12, size: 9.5, font: bold ? this.B : this.F, color: BLACK }));
    const aw = (bold ? this.B : this.F).widthOfTextAtSize(amount, 9.5);
    this.p.drawText(amount, { x: W - 50 - aw, y: this.y, size: 9.5, font: bold ? this.B : this.F, color: BLACK });
    this.y -= lines.length * 12;
    dl.forEach((l) => { this.p.drawText(l, { x: 50, y: this.y, size: 7.5, font: this.F, color: GREY }); this.y -= 10; });
    this.y -= 3;
    if (!bold) this.p.drawLine({ start: { x: 50, y: this.y + 1 }, end: { x: W - 50, y: this.y + 1 }, thickness: 0.4, color: rgb(0.88, 0.86, 0.83) });
    this.y -= 9;
  }
  qa(q: string, a: string) {
    const ql = wrap(q, this.B, 8.5, W - 100), al = wrap(a, this.F, 9, W - 110);
    this.need(ql.length * 11 + al.length * 12 + 10);
    ql.forEach((l) => { this.p.drawText(l, { x: 50, y: this.y, size: 8.5, font: this.B, color: GREY }); this.y -= 11; });
    al.forEach((l) => { this.p.drawText(l, { x: 60, y: this.y, size: 9, font: this.F, color: BLACK }); this.y -= 12; });
    this.y -= 2;
    this.p.drawLine({ start: { x: 50, y: this.y + 1 }, end: { x: W - 50, y: this.y + 1 }, thickness: 0.4, color: rgb(0.88, 0.86, 0.83) }); this.y -= 8;
  }
  heading2(s: string) { this.p.drawText(s, { x: 50, y: this.y, size: 10, font: this.B, color: BLACK }); this.y -= 14; }
  image(im: any, w: number, h: number) { this.p.drawImage(im, { x: 50, y: this.y - h + 6, width: w, height: h }); this.y -= h + 4; }
  small(s: string) { wrap(s, this.F, 7.5, W - 100).forEach((l) => { this.p.drawText(l, { x: 50, y: this.y, size: 7.5, font: this.F, color: GREY }); this.y -= 10; }); }
  gap(n: number) { this.y -= n; }
}

// A variation (or extension) of a signed agreement: its own short signed document.
export async function buildVariationPdf(inp: PdfInput, vr: any, vsigs: any[], vimg: Record<string, Uint8Array>): Promise<Uint8Array> {
  const { ag, people } = inp;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const F = await doc.embedFont(inp.font, { subset: true });
  const B = await doc.embedFont(inp.bold, { subset: true });
  doc.setTitle(`Variation ${vr.number} to Agency Agreement ${ag.ref}`); doc.setAuthor("McGuire Real Estate Limited");
  const S = new Sched(doc, F, B, ag);
  const row = (k: string, v: unknown) => S.kv(k, String(v ?? "") || "Not given");
  const signers = people.filter((p) => p.legal_name && p.signed_at);
  S.page(`Variation ${vr.number} to the Agency Agreement`, `Varies Sole and Exclusive Agency Agreement ${ag.ref} (${ag.agreement_version})`);
  row("Agreement", `${ag.ref}, signed ${ag.signed_at ? nzDT(ag.signed_at) : ""}`);
  row("Property", ag.address);
  row("Client(s)", signers.map((p) => p.legal_name).join(" and "));
  row("Agent", "McGuire Real Estate Limited, Licensed REAA 2008");
  S.gap(6);
  S.heading2("The parties agree to these changes");
  for (const r of vr.summary || []) row(r.label, `${r.to}${r.from ? `\nWas: ${r.from}` : ""}`);
  if (vr.reason) row("Reason", vr.reason);
  S.gap(4);
  S.para("All other terms of the agreement, including the Terms and Conditions and schedules, stay exactly as signed. If anything in this variation conflicts with the agreement, this variation applies from the date it is signed by everyone.", 9);
  S.para("The Client was told they may get legal advice before signing this variation, and given time to do so.", 9);
  S.gap(6);
  S.heading2("Signatures");
  const sorted = [...vsigs].sort((a, b) => a.signed_at < b.signed_at ? -1 : 1);
  for (const s of sorted) {
    const p = people.find((x) => x.id === s.person_id);
    S.need(100);
    S.heading2(`${s.signer_name}${s.signer_role === "agent" ? " (Licensee, REA#20117983, for McGuire Real Estate Limited)" : " (Client)"}`);
    const bytes = vimg[s.id];
    if (bytes) { const im = await doc.embedPng(bytes); const h = 40, w = Math.min(260, im.width * (h / im.height)); S.image(im, w, h); }
    S.small(`Signed ${nzDT(s.signed_at)}${s.snapshot?.signing_method ? " · " + s.snapshot.signing_method : p?.email ? " · signed in as " + p.email : ""}`);
    S.small(`Document fingerprint (SHA-256): ${s.snapshot_sha256}`);
    S.gap(6);
  }
  const unsigned = signers.filter((p) => !vsigs.some((s) => s.person_id === p.id));
  if (vr.status === "draft") S.para("DRAFT for checking. Not yet issued or signed.", 10, RED);
  else if (vr.status === "withdrawn") S.para(`WITHDRAWN ${vr.withdrawn_at ? nzDT(vr.withdrawn_at) : ""}. This variation never took effect.`, 10, RED);
  else if (unsigned.length) S.para(`Not yet signed by: ${unsigned.map((p) => p.legal_name).join(", ")}. This variation takes effect once everyone has signed.`, 9, RED);
  else S.para(`Signed by everyone ${vr.signed_at ? nzDT(vr.signed_at) : ""}, and in effect from then.`, 9);
  S.para("Electronic signatures under Part 4 of the Contract and Commercial Law Act 2017. The fingerprint identifies the exact content each person signed.", 8, GREY);
  const n = doc.getPageCount(), gen = nzDT(new Date());
  doc.getPages().forEach((p, i) => p.drawText(`${ag.ref} · Variation ${vr.number} · ${ag.address} · generated ${gen} · page ${i + 1} of ${n}`, { x: 48, y: 10, size: 6.5, font: F, color: GREY }));
  return await doc.save();
}

// A previous agency's cancellation notice, signed by the sellers with the agency agreement.
export async function buildNoticePdf(inp: PdfInput, n: any): Promise<Uint8Array> {
  const { ag, people } = inp;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const F = await doc.embedFont(inp.font, { subset: true });
  const B = await doc.embedFont(inp.bold, { subset: true });
  doc.setTitle(`Notice of cancellation of agency: ${ag.address}`); doc.setAuthor((people || []).filter((p) => p.legal_name).map((p) => p.legal_name).join(" and "));
  const signed = inp.sigs.filter((s) => s.signer_role === "client" && (s.snapshot?.notices || []).some((x: any) => x.idx === n.idx)).sort((a, b) => a.signed_at < b.signed_at ? -1 : 1);
  const entry = signed.length ? (signed[0].snapshot.notices || []).find((x: any) => x.idx === n.idx) : null;
  const S = new Sched(doc, F, B, ag, "");
  S.brand = "";
  S.page("Notice of Cancellation of Agency", `From the owner(s) of ${ag.address}`);
  const paras: string[] = entry?.text || [`To: ${n.agency}`, `Property: ${ag.address}`, "Notice text not recorded."];
  paras.forEach((t) => S.para(t, 10));
  S.gap(8);
  S.heading2("Signed by the owner(s)");
  for (const s of signed) {
    S.need(95);
    S.heading2(s.signer_name);
    const bytes = inp.sigImages[s.id];
    if (bytes) { const im = await doc.embedPng(bytes); const h = 40, w = Math.min(260, im.width * (h / im.height)); S.image(im, w, h); }
    S.small(`Signed ${nzDT(s.signed_at)}${s.snapshot?.signing_method ? " · " + s.snapshot.signing_method : ""}`);
    S.small(`Fingerprint (SHA-256) of what was signed: ${s.snapshot_sha256}`);
    S.gap(6);
  }
  if (!signed.length) S.para("Not signed.", 10, RED);
  S.para("Each owner signed this notice electronically, with a separate confirmation for it, at the same time as signing an agency agreement with McGuire Real Estate Limited. Electronic signatures under Part 4 of the Contract and Commercial Law Act 2017.", 8, GREY);
  const n2 = doc.getPageCount(), gen = nzDT(new Date());
  doc.getPages().forEach((p, i) => p.drawText(`Notice of cancellation · ${ag.address} · generated ${gen} · page ${i + 1} of ${n2}`, { x: 48, y: 10, size: 6.5, font: F, color: GREY }));
  return await doc.save();
}

// The Vendor Guide and the Complaints procedure, appended to agreements on the phase 2 format.
// The Vendor Guide states the administration fee: the agreement's own figure (default $575 including GST)
function guideFee(t: string, c: any) {
  const adm = c.adminOn === false ? 0 : (c.admin === undefined || c.admin === "" ? 575 : num(c.admin));
  if (adm) return t.replace("a $575 administration fee", `a ${money(adm)} administration fee`);
  return t.replace(" and a $575 administration fee (including GST); the administration fee covers our AML/CFT identity checks and other onboarding work, is payable on signing, and applies whether or not the property sells.", "; no administration fee applies to your agreement.");
}
function appendixPages(S: Sched, ref: string, c: any) {
  S.suffix = ` · given with Agency Agreement ${ref}, not part of it`;
  S.page(VENDOR_GUIDE.title, "A plain-English summary");
  S.para(VENDOR_GUIDE.intro, 9, GREY);
  for (const [h, paras, bullets] of VENDOR_GUIDE.sections) {
    S.need(40); S.heading2(h);
    paras.forEach((t) => S.para(guideFee(t, c), 9));
    bullets.forEach((t) => S.bullet(t));
    S.gap(4);
  }
  S.para(VENDOR_GUIDE.note, 7.5, GREY);
  S.suffix = ` · given with Agency Agreement ${ref}`;
  S.page(COMPLAINTS.title, "Rule 12, Real Estate Agents Act (Professional Conduct and Client Care Rules) 2012");
  COMPLAINTS.intro.forEach((t) => S.para(t, 9));
  for (const [h, lines] of COMPLAINTS.steps) { S.need(40); S.heading2(h); lines.forEach((t) => S.para(t, 9)); }
  S.gap(4);
  S.para(COMPLAINTS.close, 9);
}

// The wording of the documents signed after the agreement, word for word from Tim's forms. The app holds the same
// text (onboarding/src/app.js FORM_TEXT; a test keeps the two the same). Each form records the version it was
// started on, and its PDF is printed from the form's stored answers with that version's wording.
// deno-lint-ignore no-explicit-any
export const FORM_TEXT: any = {
    VD_LEAD: 'This form provides information for prospective purchasers, based on the Vendor\'s own knowledge of the property.',
    VD_INTRO: [
    'These details are correct as at the date of the Vendor\'s signature(s) below. Any known changes and/or subsequent information becoming known will be advised in writing. These changes may be made and noted by the Licensee, who has also signed below.',
    'Where any work requiring Code Compliance has had Certificate(s) correctly issued and signed off, and they are available to the Agent or prospective purchaser to view, they will be attached to this document (or are known to appear in the LIM). If those certificates are not available, we strongly recommend your further investigation.',
    'Please note that the Vendor may not disclose all property defects. It is incumbent on the purchaser to make enquiries or seek professional assistance to satisfy themselves as to the condition of the property.',
    'The information collected in this form is held by McGuire Real Estate Limited for the purpose of this sale and is disclosed to prospective purchasers and their professional advisers as part of the marketing and sale of the property.',
  ],
    VD_SECTIONS: [
    ['Property Condition and Known Issues', [
      { k: 'pegs', q: 'Can the Vendor identify the location of ALL boundary pegs?' },
      { k: 'unpaid', why: 1, q: 'Is there any item on or about the property that is not fully paid for and/or will not be cleared on settlement? (e.g. renovations, outbuildings, insulation; include anything that may be added to rates)' },
      { k: 'history', why: 1, q: 'Is there anything in the property\'s history or recent past that would be of interest or concern to a purchaser? (e.g. death on the property, nearby developments)' },
      { k: 'meth', why: 1, from: 'meth', q: 'Is the Vendor aware of any known or suspected methamphetamine contamination, or has the property been tested?' },
      { k: 'chattels', why: 1, q: 'Are there any chattels not working? (Check with tenants if rented and unsure)' },
      { k: 'repairs', why: 1, q: 'Are there any repairs and/or maintenance the Vendor intends to complete after listing and before settlement?' },
      { k: 'faults', text: 1, from: 'def', q: 'Describe any known or suspected faults or issues on or about the property, including any indication of subsidence or water damage.' },
      { k: 'era', from: 'year', q: 'Was any part of the building or additions constructed in the 1995 to 2004 period? (noted for potential weathertightness issues)' },
      { k: 'wt', why: 1, from: 'wt', q: 'Is the Vendor aware of any weathertightness issues (water leaks, past or present, damage)?' },
      { k: 'dux', why: 1, q: 'Is the Vendor aware of any Dux Qest plumbing, Weatherside cladding, or Monolithic cladding?' },
      { k: 'asbestos', why: 1, q: 'Is the Vendor aware, or does the Vendor suspect, the presence of asbestos-containing materials anywhere on the property?' },
      { k: 'pipes', why: 1, q: 'Has there been any evidence or experience of blocked or troublesome underground pipes?' },
      { k: 'reno', text: 1, from: 'work', q: 'Describe any renovation work done, regardless of whether it required Permits, Consents, or Code Compliance Certificates (e.g. shower alterations).' },
      { k: 'consents', q: 'To your knowledge, have Permits / Consents / Certificates required for any part of the property been issued and signed off by the Local Authority where required by law?' },
      { k: 'lim', why: 1, q: 'Has a LIM been obtained for this property? If so, when, and is it available for review?' },
      { k: 'claims', why: 1, q: 'Has the property been the subject of any insurance claim (e.g. weathertightness, fire, flood, subsidence, or other)?' },
      { k: 'reports', why: 1, q: 'Has any previous prospective purchaser\'s investigation (including any report from an inspector, valuer, or other professional) identified an issue with the property? If so, has a copy of that report been provided to the Agent?' },
      { k: 'hazard', why: 1, from: 'haz', q: 'Is the Vendor aware of any safety hazard at the property that a visitor or attending professional should be made aware of (e.g. uneven surfaces, animals on site, pool or spa, loose fittings, steep or restricted access)?' },
    ]],
    ['Services and Features', [
      { k: 'water', q: 'Is the property on town water supply?' },
      { k: 'sewer', q: 'Is the property on town sewerage?' },
      { k: 'storm', q: 'Is the property on town stormwater?' },
      { k: 'power', q: 'Is the property on the national electrical network?' },
      { k: 'internet', text: 1, q: 'Describe the connection to internet at the property:' },
      { k: 'insulation', text: 1, from: 'heat', q: 'Where is insulation present in the primary dwelling?' },
      { k: 'glazing', text: 1, q: 'Describe the glazing present:' },
    ]],
    ['Registrations and Fire Appliances', [
      { k: 'hai', why: 1, q: 'Is the property registered with the Territorial Authority as a home and income (e.g. a registered B&B)? If \'Yes\', does a Code Compliance Certificate exist?' },
      { k: 'burner', why: 1, q: 'Is there a wood burner or similar fire appliance? If \'Yes\', does it have a Code Compliance Certificate, and is that certificate available?' },
    ]],
  ],
    VD_STATEMENT: [
    'We hereby declare that any information about any issue concerning any aspect of the property and its neighbourhood arising at any time that is known to us, and that may be of concern or interest to a purchaser, has been noted above, or if discovered subsequently, will be immediately advised in writing to the Agent (Tim McGuire, McGuire Real Estate Limited).',
    'We declare that:',
    'i. We have not given consents for proposed work to any neighbour; and',
    'ii. We do not know of any council requisitions affecting this property; and',
    'iii. We have not withheld any known material information about the property; and',
    'iv. There is no debt owing on any part of the property that will not be cleared on settlement date; and',
    'v. We are not aware of any defects above or below ground that would affect its weathertightness, durability, or habitability; and',
    'vi. We will promptly notify the Agent in writing of any change to the information provided in this declaration, including any report or notice received from a prospective purchaser or their professional adviser during the marketing of the property; and',
    'vii. We have provided the Agent with all information known to us relevant to the property\'s current Health and Safety Notice.',
  ],
    HH_INTRO: 'Vendor site assessment: mark each item, add notes for any non-compliant areas. All private rentals must meet the healthy homes standards (from 1 July 2025). Penalties up to $7,200 per breach.',
    HH_CHECK: [
    ['Heating', [['heat1', 'Fixed heater in main living room (heat pump, wood burner, or electric) capable of 18°C'], ['heat2', 'Heater capacity confirmed via Tenancy Services Heating Assessment Tool (see page 2)'], ['heat3', 'Heater in good working order and maintained']]],
    ['Insulation', [['ins1', 'Ceiling insulation meets regional R-value (R2.9 North Island / R3.3 South Island & Central North Island)'], ['ins2', 'Existing ceiling insulation ≥120mm thick and in reasonable condition (if pre-2008 Code)'], ['ins3', 'Underfloor insulation ≥R1.3 nationwide'], ['ins4', 'Installed per NZS 4246:2016; code compliance certificate/CoA on file if applicable']]],
    ['Ventilation', [['ven1', 'Openable windows in living room, dining room, kitchen, and bedrooms'], ['ven2', 'Kitchen extractor/rangehood ≥150mm diameter or 50 L/s (if installed post 1 Jul 2019)'], ['ven3', 'Bathroom extractor fan ≥120mm diameter or 25 L/s (if installed post 1 Jul 2019)'], ['ven4', 'Continuous mechanical ventilation (if used, approved post 1 Nov 2019) exhausts to outdoors']]],
    ['Moisture & Drainage', [['moi1', 'Gutters, downpipes, and drains in good condition and free of blockages'], ['moi2', 'Ground moisture barrier installed in enclosed subfloor (or exemption confirmed)'], ['moi3', 'No visible signs of moisture ingress (leaks, damp spots)']]],
    ['Draught Stopping', [['dra1', 'Unused fireplaces/chimneys sealed'], ['dra2', 'Gaps or holes larger than a $2 coin sealed (walls, ceilings, windows, floors, doors)'], ['dra3', 'Draught-stopping measures (weather stripping, door sweeps) in place and effective']]],
    ['Documentation', [['doc1', 'Healthy Homes Compliance Statement completed (see page 3)'], ['doc2', 'Supporting records/certificates/invoices on file'], ['doc3', 'Professional assessment completed, if applicable ($300 to $500)']]],
  ],
    HH_WS_INTRO: 'Record these measurements on site. Required heating capacity must then be calculated using the official Tenancy Services Heating Assessment Tool (tenancy.govt.nz/heating-tool) or the Schedule 2 formula in the Residential Tenancies (Healthy Homes Standards) Regulations 2019. Do not estimate: compliance is measured against the tool/formula result, not a guess.',
    HH_WS: [['dims', 'Main living room: length (m) × width (m) × stud height (m)'], ['area', 'Main living room floor area (m²)'], ['glaz', 'Total window/glazing area in main living room (m²)'], ['gtype', 'Glazing type: single or double glazed'], ['ceil', 'Ceiling insulation R-value (or thickness if R-value unknown)'], ['under', 'Underfloor insulation R-value (write N/A if slab-on-ground)'], ['wall', 'Wall insulation R-value, if known'], ['ta', 'Territorial authority / region the property is in (sets climate zone)'], ['heater', 'Existing fixed heater(s): type and rated capacity (kW)'], ['exempt', 'Modern dwelling / relevant apartment exemption applies? (reg 3)', 'yn']],
    HH_ST_INTRO: 'Use this page to record findings for the landlord\'s official Healthy Homes Compliance Statement (tenancy.govt.nz/healthy-homes/compliance-statement). This is a data-capture summary for the vendor/landlord; it is not a substitute for the legal statement, which the landlord must complete, sign, and attach to the tenancy agreement.',
    HH_ST: [
    ['Heating', [['h1', 'Required heating capacity (kW), from page 2'], ['h2', 'Installed qualifying heater(s): type & capacity (kW)'], ['h3', 'Tolerance / top-up allowance applies? (Y/N + details)'], ['h4', 'Modern dwelling / relevant apartment exemption? (Y/N)']]],
    ['Insulation: Ceiling', [['c1', 'R-value when installed (or thickness if unknown)'], ['c2', 'Date installed / date last inspected'], ['c3', 'Type of insulation (segments, loose-fill, blanket, etc.)'], ['c4', 'Condition reasonable: no mould, damage, gaps? (Y/N)'], ['c5', 'Any exempt areas & reason (not reasonably practicable)']]],
    ['Insulation: Underfloor', [['u1', 'R-value when installed'], ['u2', 'Date installed / date last inspected'], ['u3', 'Type of insulation'], ['u4', 'Condition reasonable? (Y/N)'], ['u5', 'Partial exemption for pre-existing compliant insulation? (Y/N)']]],
    ['Insulation: Wall', [['w1', 'Wall insulation present? Type/condition if known (not compulsory)']]],
    ['Ventilation', [['v1', 'Openable windows in all habitable rooms? (Y/N, list exceptions)'], ['v2', 'Kitchen extractor fan: diameter/capacity & install date'], ['v3', 'Bathroom extractor fan: diameter/capacity & install date'], ['v4', 'Continuous mechanical ventilation? (Y/N + exhaust capacity L/s)']]],
    ['Moisture & Drainage', [['m1', 'Gutters/downpipes drain efficiently to appropriate outfall? (Y/N)'], ['m2', 'Enclosed subfloor present? (Y/N)'], ['m3', 'Ground moisture barrier installed if enclosed subfloor? (Y/N + reason if not)']]],
    ['Draught Stopping', [['d1', 'Open fireplaces present? (Y/N + blocked off or written tenant agreement)'], ['d2', 'Free from unreasonable gaps/draughts? (Y/N + explanation if not)']]],
  ],
  };
const FORM_WORDING: Record<string, any> = { "VD-2026-11": FORM_TEXT, "HH-2026-11": FORM_TEXT };
const YNU: Record<string, string> = { yes: "Yes", no: "No", unknown: "Unknown" };
const nzLong = (d: string | Date) => new Date(d).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "Pacific/Auckland" });

// The document as signed, from the stored record (the same layout the app shows on screen)
export function formDoc(form: any, address: string, names: string, when: string | Date) {
  const T = FORM_WORDING[form.form_version];
  if (!T) throw new Error(`Unknown form version ${form.form_version}`);
  if (form.kind === "vendor_declaration") {
    const data = form.data || {}, ans = data.answers || {};
    return {
      title: "Vendor Declaration",
      head: [["Client / Vendor(s):", names], ["Property Address:", address], ["Date:", nzLong(when)]],
      pages: [{
        title: "Vendor Declaration", sub: address, intro: [T.VD_LEAD].concat(T.VD_INTRO),
        sections: [{ title: "From the property file", rows: (data.facts || []).map(([k, v]: string[]) => [k, v, ""]).concat([["The Vendor confirmed these details", data.fileOk ? "Still correct" : "Something has changed", data.fileOk ? "" : data.fileChanges || ""]]) }]
          .concat(T.VD_SECTIONS.map(([t, qs]: [string, any[]]) => ({ title: t, rows: qs.map((x) => { const v = ans[x.k] || {}; return [x.q, x.text ? "" : (YNU[v.a] || ""), v.d || ""]; }) })))
          .concat([{ title: "Additional Notes", rows: [["Additional Notes:", "", data.notes || "None"]] }]),
        after: ["Vendor Statement"].concat(T.VD_STATEMENT),
      }],
      sign_title: "Signed by",
    };
  }
  const ad = form.agent_data || {}, c = ad.c || {}, ws = ad.ws || {}, res = ad.res || {}, st = ad.st || {};
  return {
    title: "Healthy Homes Compliance Checklist and Statement",
    head: [["Property address:", address], ["Landlord name(s):", names]],
    pages: [
      { title: "Healthy Homes Compliance Checklist", sub: "Page 1", intro: [T.HH_INTRO], sections: T.HH_CHECK.map(([t, items]: [string, string[][]]) => ({ title: t, rows: items.map(([k, q]) => [q, (c[k] || {}).a ? "Compliant: " + c[k].a : "", (c[k] || {}).n || ""]) })).concat([{ title: "Assessment", rows: [["Assessed by:", ad.assessedBy || "", ""], ["Date:", ad.assessedOn ? nzLong(ad.assessedOn + "T12:00:00") : "", ""], ["Property address:", address, ""]] }]) },
      { title: "Heating Assessment Worksheet", sub: "Page 2", intro: [T.HH_WS_INTRO], sections: [{ title: "On-site measurement / input", rows: T.HH_WS.map(([k, q]: string[]) => [q, ws[k] || "", ""]) }, { title: "Result (from official tool/formula)", rows: [["Heating capacity (kW)", res.req ? "Required: " + res.req : "", res.inst ? "Installed: " + res.inst : ""], ["Tolerance / top-up allowance applies?", res.tol || "", ""], ["Compliant", res.comp || "", ""]] }], after: ["Tool link: tenancy.govt.nz/heating-tool"] },
      { title: "Compliance Statement: Data Capture", sub: "Page 3", intro: [T.HH_ST_INTRO], sections: T.HH_ST.map(([t, items]: [string, string[][]]) => ({ title: t, rows: items.map(([k, q]) => [q, st[k] || "", ""]) })) },
    ],
    sign_title: "Landlord name(s)",
  };
}

// A document signed after the agreement (the Vendor Declaration, the Healthy Homes checklist and statement).
// Printed from the form as stored (locked once anyone signed, and covered by each fingerprint), never from the
// copy the page sent. The licensee's countersignature follows the vendors' on the declaration.
export async function buildFormPdf(inp: { font: Uint8Array; bold: Uint8Array; ag: any; people: any[]; form: any; fsigs: any[]; images: Record<string, Uint8Array> }): Promise<Uint8Array> {
  const { ag, form } = inp;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const F = await doc.embedFont(inp.font, { subset: true });
  const B = await doc.embedFont(inp.bold, { subset: true });
  const sigs = [...inp.fsigs].sort((a, b) => a.signed_at < b.signed_at ? -1 : 1);
  const vendors = sigs.filter((s) => s.signer_role !== "agent"), licensee = sigs.find((s) => s.signer_role === "agent");
  const names = (inp.people || []).filter((p) => p.legal_name && p.signed_at).map((p) => p.legal_name).join(" and ");
  const d = formDoc(form, ag.address, names, vendors[0]?.signed_at || new Date());
  doc.setTitle(`${d.title}: ${ag.address}`); doc.setAuthor("McGuire Real Estate Limited"); doc.setSubject(`${d.title} ${form.form_version}`);
  const S = new Sched(doc, F, B, ag, ` · ${form.form_version} · relates to Agency Agreement ${ag.ref}`);
  d.pages.forEach((pg: any, i: number) => {
    S.page(pg.title || d.title, pg.sub || ag.address);
    if (i === 0) for (const [k, v] of d.head || []) S.kv(k, v);
    (pg.intro || []).forEach((t: string) => S.para(t, 8.5, GREY));
    for (const sec of pg.sections || []) {
      S.need(40); S.heading2(sec.title);
      for (const r of sec.rows || []) S.qa(r[0], [r[1], r[2]].filter(Boolean).join(r[1] && r[2] ? ". " : "") || "Not answered");
      S.gap(4);
    }
    (pg.after || []).forEach((t: string) => S.para(t, 9));
  });
  const block = async (s: any, heading: string) => {
    S.need(95);
    S.heading2(heading);
    const bytes = inp.images[s.id];
    if (bytes) { const im = await doc.embedPng(bytes); const h = 40, w = Math.min(260, im.width * (h / im.height)); S.image(im, w, h); }
    S.small(`Signed ${nzDT(s.signed_at)}${s.snapshot?.signing_method ? " · " + s.snapshot.signing_method : s.snapshot?.signer?.email ? " · signed in as " + s.snapshot.signer.email : ""}`);
    if (s.snapshot?.witnessed_by) S.small(`Witnessed by: ${s.snapshot.witnessed_by} (Licensee), ${nzDT(s.signed_at)}`);
    S.small(`Fingerprint (SHA-256) of what was signed: ${s.snapshot_sha256}`);
    S.gap(6);
  };
  S.gap(6);
  S.need(60); S.heading2(d.sign_title || "Signed by");
  for (const s of vendors) await block(s, s.signer_name);
  if (form.status !== "signed") S.para("Not yet signed by everyone.", 9, RED);
  if (form.kind === "vendor_declaration") {
    if (licensee) await block(licensee, "Timothy McGuire (Licensee, REA#20117983, for McGuire Real Estate Limited)");
    else S.para("Not yet signed by the Licensee.", 9, GREY);
  }
  S.para("Signed electronically, each signer with their own confirmation. Electronic signatures under Part 4 of the Contract and Commercial Law Act 2017. The fingerprint identifies the exact content each person signed.", 8, GREY);
  const n = doc.getPageCount(), gen = nzDT(new Date());
  doc.getPages().forEach((p, i) => p.drawText(`${d.title} · ${ag.address} · generated ${gen} · page ${i + 1} of ${n}`.slice(0, 150), { x: 48, y: 10, size: 6.5, font: F, color: GREY }));
  return await doc.save();
}

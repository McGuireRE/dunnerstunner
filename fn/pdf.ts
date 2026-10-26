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
}

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
  const admOn = c.adminOn !== false, adm = c.admin === undefined || c.admin === "" ? 500 : num(c.admin);
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
  row("Prior agency", a.prior === "yes" ? a.priorDetail : a.prior ? "None: the Client warrants no other agent has been appointed (clause 3.1)" : "");

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
    S.gap(8);
  }
  const unsigned = signers.filter((p) => !clientSigs.some((s) => s.person_id === p.id));
  if (unsigned.length) S.para(`Not yet signed: ${unsigned.map((p) => p.legal_name).join(", ")}.`, 9, RED);
  if (!agentSig) S.para("Not yet countersigned by the Licensee.", 9, GREY);
  S.para("Each client signed electronically after signing in with their own email address. The fingerprint identifies the exact content each person signed. Electronic signatures under Part 4 of the Contract and Commercial Law Act 2017.", 8, GREY);

  // Vendor guide last
  const [guide] = await doc.copyPages(src, [0]); doc.addPage(guide); guide.pushOperators(setCharacterSpacing(0), setWordSpacing(0), setCharacterSqueeze(100), setTextRise(0)); white(guide, 50, 18, 160, 38);

  // footer
  const n = doc.getPageCount(), gen = nzDT(new Date());
  doc.getPages().forEach((p, i) => p.drawText(`${ag.ref} · ${ag.address} · copy generated ${gen} · page ${i + 1} of ${n}`, { x: 48, y: 10, size: 6.5, font: F, color: GREY }));
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
  p!: PDFPage; y = 0;
  constructor(private doc: PDFDocument, private F: PDFFont, private B: PDFFont, private ag: any, private suffix?: string) {}
  page(title: string, sub: string) {
    this.p = this.doc.addPage([W, H]); this.y = H - 60;
    this.p.drawText("McGuire Real Estate", { x: 50, y: H - 40, size: 8, font: this.B, color: RED });
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
  heading2(s: string) { this.p.drawText(s, { x: 50, y: this.y, size: 10, font: this.B, color: BLACK }); this.y -= 14; }
  image(im: any, w: number, h: number) { this.p.drawImage(im, { x: 50, y: this.y - h + 6, width: w, height: h }); this.y -= h + 4; }
  small(s: string) { wrap(s, this.F, 7.5, W - 100).forEach((l) => { this.p.drawText(l, { x: 50, y: this.y, size: 7.5, font: this.F, color: GREY }); this.y -= 10; }); }
  gap(n: number) { this.y -= n; }
}

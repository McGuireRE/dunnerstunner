/* Emails from the offers system, in Tim's voice (onboarding/EMAIL-VOICE.md). No page or database code here, so the tests load it on
   its own (mail-core.test.js), Tim's screen builds drafts with it, and the offer-sign edge function uses it for the drafts it makes
   and for Tim's own round notice.

   Every email to a buyer, vendor or lawyer is a draft Tim reviews and sends from the page (offer_mail_drafts, migration 024). The
   wording comes only from the agreement's data; anything the data can't fill is a marked blank, "[Tim to ...]", never a guess.

     signLinkDraft(i)        a signer's personal link (the link itself goes in at [the signing link] when Tim sends it)
     reopenedDraft(i)        "please initial the change and finish again", to a signer whose side changed the document after they finished
     roundNotice(i)          Tim's own notice, once per submitted round: who, what changed, which round, and its portal address
     agreedDrafts(i)         the agreed copy's two emails: to the purchasers (cc their lawyer) and to the vendors (cc theirs)
     agreedPrice(i)          the agreed price after the negotiation (a typed figure that replaced the struck price), or a marked blank
     agreedDates(i)          each condition's due date and settlement day, from the agreement date with working days and the province's holidays
     agreedNotice(i)         Tim's own email once the agreed copy is locked (sent at once, with the copy attached; never to a party)
     depositRecommended(ks)  who should hold the deposit: the vendors' lawyer if any KiwiSaver is part of it, else the NZ Real Estate Trust
     DEPOSIT_HOLDERS         the choices on Tim's page, with their wording
     withdrawDrafts(i)       after Tim records a withdrawal: to the side that directed it (cc their lawyer), and to the other side's lawyer
     firstWorkingDay(d, h)   the first working day after a date: Monday to Friday, not a public holiday (non_working_days)
     toHtml(text, link)      a draft's text as the email's HTML: paragraphs, **bold**, and the link where [the signing link] is
     BLANK_RE                finds the marked blanks

   Plain words, NZ English, no em dashes. */
(function (root) {
  'use strict';
  const LINK = '[the signing link]';
  const BLANK_RE = /\[Tim to [^\]]*\]/g;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const TIM_PHONE = '027 562 7207';
  const blank = what => `[Tim to ${what}]`;
  const s_ = v => String(v == null ? '' : v).trim();
  const iso = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const fromIso = t => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s_(t)); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
  // "8 December 2026", "Monday 8 December 2026", "2026-12-08" -> a date (UTC midnight), or null
  function parseDate(t) {
    const x = s_(t); if (!x) return null; const i = fromIso(x); if (i) return i;
    const m = /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i.exec(x);
    if (!m) return null; const mo = MONTHS.findIndex(n => n.toLowerCase() === m[2].toLowerCase()); return new Date(Date.UTC(+m[3], mo, +m[1]));
  }
  const longDate = d => d ? `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '';
  const money = v => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.]/g, '')); return n > 0 ? '$' + n.toLocaleString('en-NZ', { maximumFractionDigits: 2 }) : ''; };
  const names = list => { const l = list.filter(Boolean); return l.length <= 1 ? (l[0] || '') : l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1]; };
  const uniq = a => [...new Set(a.map(x => s_(x).toLowerCase()).filter(x => x.includes('@')))];

  // the first working day after a date: Monday to Friday and not in the holidays list ([{ day: 'YYYY-MM-DD', label }])
  function firstWorkingDay(dateIso, holidays) {
    const d = fromIso(dateIso); if (!d) return null; const hol = new Set((holidays || []).map(h => s_(h.day)));
    for (let i = 1; i < 30; i++) { const x = new Date(d.getTime() + i * 864e5); if (x.getUTCDay() !== 0 && x.getUTCDay() !== 6 && !hol.has(iso(x))) return x; }
    return null;
  }
  // the 24 December to 5 January stretch the agreement's own working-day definition may leave out: Tim checks dates in it
  const inBreak = d => d && ((d.getUTCMonth() === 11 && d.getUTCDate() >= 24) || (d.getUTCMonth() === 0 && d.getUTCDate() <= 5));

  /* ───── signing emails ───── */
  // i: { first (their preferred name), address, side ('purchaser' | 'vendor'), round }
  function signLinkDraft(i) {
    const first = s_(i.first) || 'there', addr = s_(i.address) || 'the property', v = i.side === 'vendor', later = (+i.round || 1) > 1;
    const subject = v ? `An offer on ${addr}` : later ? `The vendors' reply to your offer: ${addr}` : `Your offer to sign: ${addr}`;
    const what = v ? `I have an offer on ${addr} for you to look at.` : later ? `I have the vendors' reply to your offer for ${addr} for you to look at.` : `Your offer for ${addr} is ready for you to sign.`;
    const how = v || later ? 'You can accept it as it stands, or make changes and sign them as a counteroffer. Each of you initials every change and signs.'
      : 'You read each page, then sign and initial each place yourself. It takes about 15 minutes.';
    // the way Tim's own emails open: "Dear" to purchasers, "Hello" to vendors, by preferred name
    const body = [`${v ? 'Hello' : 'Dear'} ${first},`, `${what} This link is just for you, so please don't forward it:`, LINK,
      `When you open it, I'll email you a one-time code to check it's you. ${how} The link works for 14 days.`,
      `When you confirm, it comes straight to me, and I'll be in touch with the other party myself. You can talk to your lawyer at any time before you sign, and any questions, just call me on ${TIM_PHONE}.`,
      'Tim'].join('\n\n');
    return { subject, body };
  }
  // i: { first, address, by (who made the change), side ('purchaser' | 'vendor') }
  function reopenedDraft(i) {
    const first = s_(i.first) || 'there', addr = s_(i.address) || 'the property';
    return { subject: `A change to initial: ${addr}`, body: [`${i.side === 'vendor' ? 'Hello' : 'Dear'} ${first},`,
      `${s_(i.by) || 'Someone on your side'} has made a change to the document for ${addr} since you finished. Please open the link I sent you earlier, initial the change and finish again. You'll be asked for a new code.`,
      `It all comes to me before anything goes anywhere. Any questions, just call me on ${TIM_PHONE}.`, 'Tim'].join('\n\n') };
  }
  // Tim's own notice, once per submitted round. i: { side, round, docRound, address, signers: [names], changes: [{ kind, page, text, by }], portalUrl }
  const KIND = { strike: 'line through text', cross: 'crossed-out passage', insert: 'words added', note: 'handwritten note', reinstate: 'reinstatement' };
  function roundNotice(i) {
    const side = i.side === 'vendor' ? 'vendors' : 'purchasers', ch = i.changes || [], addr = s_(i.address) || 'an offer';
    const subject = `Round ${i.round} submitted by the ${side}: ${addr}`;
    const lines = [`The ${side} (${names(i.signers || []) || 'everyone on that side'}) have signed and submitted Round ${i.round}${i.docRound && i.docRound !== i.round ? ` (Document round ${i.docRound})` : ''} for ${addr}. It is locked.`,
      ch.length ? `What changed in this round (${ch.length}):\n` + ch.map((c, k) => `${k + 1}. Page ${c.page}: ${KIND[c.kind] || c.kind}${c.text ? ` "${s_(c.text).slice(0, 200)}"` : ''}${c.by ? `, by ${c.by}` : ''}`).join('\n')
        : 'Nothing was changed in this round: they accepted it as it stood.',
      'Nothing has gone to the other side, their lawyer or their link. They are not told until you present it.',
      i.portalUrl ? `Look at it here: ${i.portalUrl}` : ''].filter(Boolean);
    return { subject, body: lines.join('\n\n') };
  }

  /* ───── the agreed copy ───── */
  const P_ACTION = {
    finance: 'Forward the agreement to your mortgage broker or bank immediately so they can confirm your finance.',
    lim: 'Order the LIM from the council now and ask for it to be processed urgently.',
    builders: 'Book your building inspection now.',
    lawyer: 'Send the agreement to your lawyer straight away for their approval.',
    electrical: 'Book your electrical inspection now.',
    technical: 'Book your specified technical report now.',
    toxicology: 'Book the toxicology test now.',
    oia: 'Your lawyer will guide the Overseas Investment consent. Keep me in the loop.',
    land_act: 'Your lawyer will guide the Land Act consent. Keep me in the loop.',
    sale: 'Keep me and your lawyer up to date on the sale of your property.',
    sdd: 'Start your due diligence straight away, with your lawyer.',
  };
  function period(c, labels) {
    if (c.after) return `within ${+c.days} working day${+c.days === 1 ? '' : 's'} of the ${(labels[c.after] || c.after)} condition being satisfied or waived`;
    if (c.date) { const d = parseDate(c.date); return d ? `by ${longDate(d)}` : blank('fill: the period'); }
    if (c.days) return `within ${+c.days} working day${+c.days === 1 ? '' : 's'} of the date of agreement`;
    return blank('fill: the period');
  }
  /* ───── the agreed price, after the negotiation (Offers fixes 2) ─────
     The agreed terms keep the price as first drafted; a change in the negotiation governs. The price is the drafted one when no change
     touches it. When a line through the price and typed words beside it give exactly one new figure (and nothing else is unclear: no
     handwriting over the price, no other typed words about the price), that figure is the agreed price, from the round it was typed in.
     Anything else is a marked blank for Tim, never a guess. i: { terms, layers (the document's rounds, each { doc_round, side, marks:
     [{ id, kind, page, geometry, target }] }), priceBoxes: [{ page, x, y, w, h }] (where the price is on the draft) }
     -> { text, figure, changed, round, unsure } */
  const PRICE_BLANK = blank('fill: the agreed price after negotiation');
  const MONEY_RE = /\$\s?\d{1,3}(?:[,\s]\d{3})+(?:\.\d{1,2})?|\$\s?\d+(?:\.\d{1,2})?|\b\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\b/g;
  const figures = t => (String(t || '').match(MONEY_RE) || []).map(x => Number(x.replace(/[^0-9.]/g, ''))).filter(n => n >= 1000);
  const PRICE_WORD = /\b(purchase\s+)?price\b/i;
  const numOf = t => { const f = figures(t); return f.length ? f[0] : null; };
  function rectOfChange(c) {
    const g = (c && c.geometry) || {};
    if (c.kind === 'strike') return { x: Math.min(g.x0, g.x1), y: g.y - 4, w: Math.abs(g.x1 - g.x0), h: 8 };
    if (c.kind === 'cross') return { x: g.x, y: g.y, w: g.w, h: g.h };
    if (c.kind === 'insert') { const z = g.size || 9; return { x: g.x, y: g.y - 2, w: Math.max(8, String(g.text || '').length * z * 0.55), h: z + 4 }; }
    if (c.kind === 'note') { const pts = (g.strokes || []).flat(); if (!pts.length) return null; const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; }
    return null;
  }
  const hits = (a, b, pad) => !!a && !!b && a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;
  function agreedPrice(i) {
    const T = i.terms || {}, AD = T.as_drafted || {}, drafted = money(AD.price) || money(T.price);
    const plain = { text: drafted || blank('fill: the price'), figure: numOf(drafted), changed: false, round: null, unsure: !drafted };
    const unsure = why => ({ text: PRICE_BLANK, figure: null, changed: true, round: null, unsure: true, why });
    if (!Array.isArray(i.layers)) {
      // only the list of changes (no shapes): any line, cross or handwriting could be on the price, and typed words with a figure could be one
      const tc = T.changes || []; if (!tc.length) return plain;
      return tc.every(c => c.kind === 'insert' && !figures(c.text).length && !PRICE_WORD.test(String(c.text || ''))) ? plain : unsure('the changes have no shapes');
    }
    const ch = []; i.layers.slice().sort((a, b) => a.doc_round - b.doc_round).forEach(L => (L.marks || []).forEach(m => ch.push(Object.assign({}, m, { round: L.doc_round, side: L.side }))));
    if (!ch.length) return plain;
    const boxes = (i.priceBoxes || []).filter(b => b && typeof b.x === 'number');
    if (!boxes.length) return unsure('no price place');
    const back = new Set(ch.filter(c => c.kind === 'reinstate' && c.target).map(c => c.target));
    const lines = ch.filter(c => (c.kind === 'strike' || c.kind === 'cross') && !back.has(c.id));
    const at = (c, pad) => boxes.some(b => b.page === c.page && hits(rectOfChange(c), b, pad));
    const nearIns = c => c.kind === 'insert' && boxes.some(b => b.page === c.page && (c.geometry || {}).y >= b.y - 30 && (c.geometry || {}).y <= b.y + b.h + 30 && (c.geometry || {}).x >= b.x - 60 && (c.geometry || {}).x <= b.x + b.w + 250);
    const struck = lines.filter(c => at(c, 2)), notes = ch.filter(c => c.kind === 'note' && at(c, 20)), ins = ch.filter(nearIns);
    const elsewhere = ch.filter(c => c.kind === 'insert' && !nearIns(c) && PRICE_WORD.test(String((c.geometry || {}).text || '')));
    if (!struck.length && !ins.length && !notes.length && !elsewhere.length) return plain;
    if (notes.length || elsewhere.length || !struck.length) return unsure('unclear');
    // the typed figure still standing: not itself struck through by a later line
    const through = (l, c) => { const g = c.geometry || {}, z = g.size || 9, r = rectOfChange(l), t = { x: g.x, y: g.y, w: rectOfChange(c).w, h: z * 0.75 };   // a line through the typed letters themselves
      return l.page === c.page && (l.kind === 'strike' ? (l.geometry.y >= t.y && l.geometry.y <= t.y + t.h && r.x < t.x + t.w && r.x + r.w > t.x) : hits(r, t, 0)); };
    const live = ins.filter(c => !lines.some(l => through(l, c)));
    if (live.length !== 1) return unsure('more than one figure, or none');
    const f = figures(live[0].geometry.text); if (f.length !== 1) return unsure('no single figure');
    return { text: money(f[0]), figure: f[0], changed: true, round: live[0].round, unsure: false };
  }
  /* ───── the dates, from the agreement date (Offers fixes 2) ─────
     A date written on the agreement for a condition (as drafted) stands. Otherwise it is worked out from the agreement date Tim
     confirmed, with the agreement's working days and the property's province's holidays (src/offers-core.js, the same counter the offer
     form uses). Settlement: the date on the agreement, else its working days after the last condition (or the agreement date).
     i: { terms, agreementIso, province, offers (OFFERS, else the loaded one) } -> { due: { key: { iso, worked } }, settle: { iso, worked } } */
  const offersLib = i => i.offers || root.OFFERS || (typeof require === 'function' ? (() => { try { return require('./offers-core.js'); } catch (_) { return null; } })() : null);
  function agreedDates(i) {
    const T = i.terms || {}, AD = T.as_drafted || {}, O = offersLib(i), conds = Array.isArray(T.conditions) ? T.conditions : [], agreed = s_(i.agreementIso), prov = i.province || (O && O.DEFAULT_PROVINCE) || 'otago';
    const due = {};
    conds.forEach(c => { const d = parseDate(AD['d_' + c.key]); if (d) { due[c.key] = { iso: iso(d), worked: false }; return; }
      if (!O || !fromIso(agreed)) return; const r = O.conditionDate(c, agreed, prov, conds); if (r && r.date) due[c.key] = { iso: r.date, worked: true, how: O.timingPlain ? O.timingPlain(c) : '' }; });
    let settle = null; const sd = parseDate(AD.settlement) || (T.settlement && T.settlement.kind === 'date' ? parseDate(T.settlement.date) : null);
    if (sd) settle = { iso: iso(sd), worked: false };
    else if (O && fromIso(agreed) && T.settlement && T.settlement.kind === 'relative' && Math.floor(+T.settlement.days) >= 1) {
      const ds = Object.values(due).map(x => x.iso).sort(), from = conds.length ? (ds.length === conds.length ? ds[ds.length - 1] : null) : agreed;
      if (from) settle = { iso: O.addWorkingDays(from, Math.floor(+T.settlement.days), { province: prov }), worked: true, how: `${Math.floor(+T.settlement.days)} working days after ${conds.length ? 'the last condition' : 'the agreement date'}` };
    }
    const pname = O && O.PROVINCES && O.PROVINCES[prov] ? O.PROVINCES[prov].name : prov;
    return { due, settle, province: prov, provinceName: pname };
  }
  // the deposit amount: a figure on the agreement, or its percentage of the agreed price
  function depositAmount(depText, price) {
    const fig = (/\$\s?[\d,]+(\.\d+)?/.exec(depText) || [''])[0]; if (money(fig)) return { text: money(fig), worked: false };
    const pc = /(\d{1,2}(?:\.\d+)?)\s?(%|per\s?cent)/i.exec(depText);
    if (pc && price && price.figure && !price.unsure) { const v = Math.round(price.figure * +pc[1]) / 100; return { text: money(v), worked: true, how: `${pc[1]}% of the agreed price ${price.text}` }; }
    return null;
  }

  // input: { address, agreement: { agreement_date }, terms (offer_agreements.terms), details (the offer), vendors: [{ legal_name, pref_name, email, phone }],
  //   vendorLawyer: { person, firm, email, phone }, holidays: [{ day, label }], labels: { key: 'Finance', ... } }
  //   -> { purchasers: { to, cc, subject, body }, vendors: { ... }, blanks: [the marked blanks, once each] }
  function agreedDrafts(input) {
    const T = input.terms || {}, D = input.details || {}, AD = T.as_drafted || {}, labels = Object.assign({}, input.labels || {}), addr = s_(input.address);
    const conds = Array.isArray(T.conditions) ? T.conditions : [];
    const pl = D.lawyer || {}, vl = input.vendorLawyer || {};
    const purch = (D.purchasers || []).map(q => ({ first: s_(q.first), last: s_(q.last), email: s_(q.email), phone: s_(q.phone) })).filter(q => q.first || q.last);
    const vend = (input.vendors || []).map(v => ({ name: s_(v.legal_name), call: s_(v.pref_name) || s_(v.legal_name).split(/\s+/)[0], email: s_(v.email), phone: s_(v.phone) }));
    const agreed = fromIso((input.agreement || {}).agreement_date), fwd = agreed ? firstWorkingDay(iso(agreed), input.holidays) : null;
    // each condition's due date: the date written on the agreement for it (as drafted), else a blank
    // each condition's due date and settlement day: on the agreement, else worked out from the agreement date (Offers fixes 2), shown once to Tim
    const notes = [], DT = agreedDates({ terms: T, agreementIso: agreed ? iso(agreed) : '', province: input.province, offers: input.offers }), AGW = agreed ? longDate(agreed) : '';
    const due = conds.map(c => { const x = DT.due[c.key], d = x ? fromIso(x.iso) : null, label = labels[c.key] || c.key;
      if (x && x.worked) notes.push(`${label} due ${longDate(d)} (worked out from the agreement date, ${AGW}: ${x.how || 'its timing'}, with ${DT.provinceName} holidays; check)`);
      return { c, label, d, text: d ? longDate(d) : blank(`fill: the ${label} due date`) }; });
    const lastDue = due.reduce((m, x) => x.d && (!m || x.d > m) ? x.d : m, null);
    const settleD = DT.settle ? fromIso(DT.settle.iso) : null;
    if (DT.settle && DT.settle.worked) notes.push(`Settlement day ${longDate(settleD)} (worked out from the agreement date, ${AGW}: ${DT.settle.how}, with ${DT.provinceName} holidays; check)`);
    const settleText = settleD ? longDate(settleD) : blank('fill: settlement day') + (s_(AD.settlement) ? ` (the agreement says: ${s_(AD.settlement)})` : '');
    const endHol = settleD || lastDue;
    const hols = agreed && endHol ? (input.holidays || []).filter(h => { const x = fromIso(h.day); return x && x > agreed && x <= endHol; }) : [];
    // the price as agreed: after the negotiation, when a typed figure replaced it (shared with Tim's own email, agreedNotice)
    const PR = input.price || agreedPrice({ terms: T, layers: input.layers, priceBoxes: input.priceBoxes }), price = PR.text;
    if (PR.changed && !PR.unsure) notes.push(`Price ${PR.text} (the figure typed in Round ${PR.round} in place of the struck price; check)`);
    // the deposit, in Tim's words: his trust account at the NZ Real Estate Trust, unless any part is KiwiSaver (then the vendors'
    // lawyer's trust account, not released before settlement). When it is paid only if the agreement's own deposit wording says so.
    const depText = [s_(AD.deposit), s_(T.deposit_printed)].join(' ');
    const DA = depositAmount(depText, PR), depAmt = DA ? DA.text : (s_(AD.deposit) && !/%|per\s?cent/i.test(s_(AD.deposit)) ? s_(AD.deposit) : blank('fill: the deposit amount'));
    if (DA && DA.worked) notes.push(`Deposit ${DA.text} (worked out from ${DA.how}; check)`);
    const depWhen = /unconditional/i.test(depText) ? 'once the agreement becomes unconditional' : /\b(on|upon) (signing|execution|acceptance)\b|\bwhen (this agreement is )?signed\b/i.test(depText) ? 'on signing' : blank('fill: when the deposit is paid');
    const ks = T.kiwisaver === true || D.kiwisaver === true;
    // who holds it: Tim's choice on his page (input.depositHolder), else the recommended one. With KiwiSaver it is never released before settlement.
    const dh = input.depositHolder && DEPOSIT_HOLDERS[input.depositHolder.holder] ? input.depositHolder : { holder: depositRecommended(ks) };
    const payee = dh.holder === 'other' ? (s_(dh.other) || blank('fill: who holds the deposit')) : DEPOSIT_HOLDERS[dh.holder].payee;
    const depositLine = whose => `Deposit (${depAmt}): payable to ${payee} ${depWhen}.` + (!ks ? '' : dh.holder === 'vendor_lawyer' ? ` Because ${whose} KiwiSaver is part of it, the whole deposit goes there and can't be released before settlement.`
      : ` Because ${whose} KiwiSaver is part of it, the deposit can't be released before settlement.`);
    const ft = Array.isArray(T.further_terms) ? T.further_terms : [];
    const asIs = ft.filter(t => /as is,?\s*where is/i.test(s_(t.text)));
    const excluded = (D.chattels_exclude || []).map(s_).filter(Boolean);
    const chattels = [...asIs.map(t => `As is, where is: further term ${t.number}${t.title ? ` (${t.title})` : ''}.`), ...(excluded.length ? [`Expressly excluded: ${excluded.join(', ')}.`] : [])];
    const vendorItems = ft.filter(t => /\bvendors?\b[^.]{0,60}\b(shall|will|must|is to|are to|to (complete|repair|remove|replace|provide|fix|finish))\b/i.test(s_(t.text)));
    const lawyerLine = L => (L.person || L.firm) ? [s_(L.person) || blank("fill: the lawyer's name"), s_(L.firm) || blank("fill: the lawyer's firm"), s_(L.email) || blank("fill: the lawyer's email"), s_(L.phone) || blank("fill: the lawyer's phone")].join(', ') : blank('fill: the lawyer (name, firm, email, phone)');
    const changed = (T.changes || []).length;
    const top = [];
    if (changed) top.push(blank(`check: the negotiation made ${changed} change${changed === 1 ? '' : 's'} to the document; make sure this roadmap follows them`));
    const dateLines = [`Date of agreement: ${agreed ? longDate(agreed) : blank('fill: the date of agreement')}. The first working day is ${fwd ? longDate(fwd) : blank('fill: the first working day')}.`];
    if (fwd && inBreak(fwd)) dateLines.push(blank('check: the first working day falls between 24 December and 5 January, which the agreement may not count as working days'));
    hols.forEach(h => dateLines.push(`Note: ${longDate(fromIso(h.day))} is a public holiday (${s_(h.label)}) and isn't a working day.`));
    const sameDay = due.length > 1 && due.every(x => x.d && due[0].d && x.d.getTime() === due[0].d.getTime());
    const condP = conds.length ? ['Conditions: your action steps', ...due.map((x, k) => `${k + 1}. ${x.label}: ${period(x.c, labels)}, due **${x.text}**. ${P_ACTION[x.c.key] || 'Make a start on this straight away, and keep me in the loop.'}`),
      ...(sameDay ? ['They all fall due on the same day, so please get started on each of them straight away.'] : [])].join('\n')
      : 'Conditions: none. The agreement is unconditional.';
    const condV = conds.length ? ["Conditions: purchaser's action steps", ...due.map((x, k) => `${k + 1}. ${x.label}: ${period(x.c, labels)}, due **${x.text}**.`),
      ...(sameDay ? ['They all fall due on the same day.'] : [])].join('\n') : 'Conditions: none. The agreement is unconditional.';
    const depositP = depositLine('your');
    const chatP = `Chattels to note: ${chattels.length ? chattels.join(' ') : 'none noted in the agreement.'}`;
    const inspect = 'Pre-settlement inspection: around five working days before settlement, I\'ll attend the property with you so you can check everything is as it should be, including the chattels in working order.';
    const close = 'It has been great working with you thus far, and I look forward to ensuring everything continues smoothly.\n\nFaithfully,\nTim';
    const pNames = names(purch.map(q => q.first || q.last));
    const purchasers = {
      to: uniq(purch.map(q => q.email).concat(purch.some(q => q.email) ? [] : [D.email])), cc: uniq([pl.email]),
      subject: `Congratulations! ${addr}`,
      body: [...top, `Dear ${pNames || blank('fill: their first names')},`,
        `Congratulations on your agreement to purchase ${addr}. It sure is a desirable property! The agreement is attached.`,
        'The contact details you have supplied me are:\n' + (purch.length ? purch.map(q => `${[q.first, q.last].filter(Boolean).join(' ')}: ${q.email || blank('fill: email')}, ${q.phone || blank('fill: phone')}`).join('\n') : blank('fill: their contact details')),
        `This email is cc'd to your lawyer: ${lawyerLine(pl)}. They are the person who will guide you through the remaining stages of your property purchase. Keep me in the loop with any questions or progress.`,
        `The vendors' lawyer is: ${lawyerLine(vl)}.`,
        `The property marketing homepage with documents is here: ${blank('add: the property page link, or delete this line')}`,
        '**Roadmap**', ...dateLines, `Price: ${price}`, condP, depositP, chatP, inspect,
        'Meeting with your lawyer: your lawyer will meet with you before settlement to go through the documents. Make sure you take evidence of ID and evidence of your current address.',
        `Possession and Settlement day: **${settleText}**. On this day you get the keys. They are released only once the vendors' lawyer confirms receipt of the funds. I'll endeavour to meet you at your new home on the day.`,
        close].join('\n\n'),
    };
    const vNames = names(vend.map(v => v.call));
    const vendors = {
      to: uniq(vend.map(v => v.email)), cc: uniq([vl.email]),
      subject: `Congratulations! ${addr}`,
      body: [...top, `Hello ${vNames || blank('fill: their first names')},`,
        `Congratulations on your agreement for the sale of ${addr}. This email is cc'd to your lawyer, ${s_(vl.person) || blank("fill: the vendors' lawyer's name")} of ${s_(vl.firm) || blank("fill: the vendors' lawyer's firm")}.`,
        `They will handle all legal notices regarding the agreement and ensure everything proceeds correctly. Keep us in the loop with any developments as soon as possible. That way ${s_(vl.person).split(/\s+/)[0] || blank("fill: the lawyer's first name")} and I can be responsive and ensure you get the best possible outcome.`,
        'The agreement is attached.',
        ...(conds.length ? ['Until the purchaser confirms the agreement, you have tasked me with marketing the property. The advertising will remain active and I will continue to discuss the property with potential purchasers.'] : []),
        `The purchaser's lawyer is: ${lawyerLine(pl)}.`,
        '**Roadmap**',
        ...(conds.length ? ['From here, the purchasers will complete the agreed conditions. In the meantime, ensure any bookings and plans pertaining to your move are only tentative "pencil" bookings. The property is not sold yet, but "under offer".'] : []),
        ...dateLines, `Price: ${price}`, condV, depositLine("the purchasers'"),
        vendorItems.length ? 'Your action items from the further terms:\n' + vendorItems.map((t, k) => `${k + 1}. Further term ${t.number}${t.title ? ` (${t.title})` : ''}: ${s_(t.text)} Please book any work now.`).join('\n')
          : blank('check: no vendor action items were found in the further terms'),
        `Chattels to note: ${chattels.length ? chattels.join(' ') : 'none noted in the agreement.'} Anything included as a chattel needs to be in full working order at settlement.`,
        'Pre-settlement inspection: around five working days before settlement, the purchasers and I will visit the property to check everything is as it should be.',
        'Meeting with your lawyer: your lawyer will meet with you before settlement to sign the transfer documents. Make sure you take evidence of ID and evidence of your current address.',
        `Possession and Settlement day: **${settleText}**. On this day you hand over the keys and receive the balance of the settlement funds, once your lawyer confirms the funds have arrived.`,
        close].join('\n\n'),
    };
    const blanks = [...new Set((purchasers.body + '\n' + vendors.body).match(BLANK_RE) || [])];
    return { purchasers, vendors, blanks, notes, price: PR };
  }

  /* ───── Tim's own email when the agreement is confirmed (Offers fixes 2; Tim: "it is most important that I get an email once the
     document is finalised") ─────
     Sent at once by the offer-sign function to Tim alone, with the locked dated agreed copy attached (or a portal link when it is too
     big to attach). Never to a party. i: { address, agreement: { agreement_date, date_text, sha256 }, purchasers: [names], vendors: [names],
     price (agreedPrice), terms, province, offers, labels, depositHolder: { holder, other, by_default }, kiwisaver, portalUrl, attached,
     tooBig, again } -> { subject, body } */
  function agreedNotice(i) {
    const addr = s_(i.address) || 'the property', A = i.agreement || {}, agreed = fromIso(A.agreement_date), T = i.terms || {}, labels = i.labels || {};
    const P = i.price || agreedPrice({ terms: T, layers: i.layers, priceBoxes: i.priceBoxes });
    const DT = agreedDates({ terms: T, agreementIso: agreed ? iso(agreed) : '', province: i.province, offers: i.offers });
    const conds = Array.isArray(T.conditions) ? T.conditions : [];
    const worked = x => x && x.worked ? ' (worked out from the agreement date)' : '';
    const dh = i.depositHolder && DEPOSIT_HOLDERS[i.depositHolder.holder] ? i.depositHolder : { holder: depositRecommended(!!i.kiwisaver), by_default: true };
    const holder = dh.holder === 'other' ? (s_(dh.other) || 'other (not named yet)') : DEPOSIT_HOLDERS[dh.holder].payee;
    const lines = [
      `The agreement for ${addr} is confirmed and locked.${i.again ? ' (Sent again, as you asked.)' : ''} ${i.attached ? 'The dated agreed copy is attached.' : i.tooBig ? 'The dated agreed copy is too big to attach, so it is not attached: download it from the offer in the portal (link below).' : 'Download the dated agreed copy from the offer in the portal (link below).'}`,
      `Date of agreement: ${agreed ? longDate(agreed) : s_(A.date_text) || 'not recorded'}.`,
      `Purchasers: ${names(i.purchasers || []) || 'not recorded'}.`,
      `Vendors: ${names(i.vendors || []) || 'not recorded'}.`,
      P.unsure ? 'Price: not worked out here. A change in the negotiation may have altered it, so check the agreed copy.' : P.changed ? `Price: ${P.text}. Changed in the negotiation: typed in Round ${P.round} in place of the struck price.` : `Price: ${P.text}.`,
      conds.length ? 'Conditions:\n' + conds.map((c, k) => { const x = DT.due[c.key]; return `${k + 1}. ${labels[c.key] || c.key}: due ${x ? longDate(fromIso(x.iso)) + worked(x) : 'not worked out (check the agreement)'}`; }).join('\n') : 'Conditions: none. The agreement is unconditional.',
      `Settlement day: ${DT.settle ? longDate(fromIso(DT.settle.iso)) + worked(DT.settle) : 'not worked out (check the agreement)'}.`,
      `Deposit holder: ${holder}${dh.by_default ? ' (the recommended one; you haven\'t chosen yet)' : ' (your choice)'}.`,
      `Fingerprint (SHA-256): ${s_(A.sha256)}`,
      i.portalUrl ? `The offer in the portal: ${i.portalUrl}` : '',
      'Only you get this email. Nothing has gone to the purchasers, the vendors or their lawyers: their emails are made on the offer page (Build the emails) for you to read and send.'].filter(Boolean);
    return { subject: `Agreement confirmed: ${addr}`, body: lines.join('\n\n') };
  }

  /* ───── who holds the deposit (Tim, 24 November 2026) ───── */
  const DEPOSIT_HOLDERS = {
    nzret: { label: "Public Trust O/A NZ Real Estate Trust (Tim's trust account)", payee: 'Public Trust O/A NZ Real Estate Trust' },
    vendor_lawyer: { label: "Vendors' lawyer's trust account", payee: "the vendors' lawyer's trust account" },
    other: { label: 'Other (type it in)', payee: '' },
  };
  const depositRecommended = ks => ks ? 'vendor_lawyer' : 'nzret';

  /* ───── a withdrawal Tim has recorded ───── */
  // i: { side (who directed it: 'purchaser' | 'vendor'), counter (true when that side had made a counteroffer), address, when (Date or ISO), partyFirst: [their first names], partyTo: [emails],
  //   ownLawyer: { email }, otherLawyer: { person, firm, email } }  -> { party: { to, cc, subject, body }, lawyer: { to, cc, subject, body } }
  // No reason is given in either: Tim adds anything more himself. The other side's own contact details are never in them.
  function withdrawDrafts(i) {
    const v = i.side === 'vendor', addr = s_(i.address) || 'the property', vc = v && i.counter === true;
    // the vendors withdraw their counteroffer only if they made one; otherwise they have declined the offer
    const yours = vc ? 'the withdrawal of your counteroffer' : v ? 'that you have declined the offer' : 'the withdrawal of your offer', theirs = vc ? 'the vendors have withdrawn their counteroffer' : v ? 'the vendors have declined the offer' : 'the purchasers have withdrawn their offer';
    const w = i.when ? new Date(i.when) : null, when = w && !isNaN(w) ? w.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : blank('fill: when it was withdrawn');
    const ol = i.otherLawyer || {}, olFirst = s_(ol.person).split(/\s+/)[0];
    const party = {
      to: uniq(i.partyTo || []), cc: uniq([(i.ownLawyer || {}).email]),
      subject: `Your withdrawal is recorded: ${addr}`,
      body: [`${v ? 'Hello' : 'Dear'} ${names((i.partyFirst || []).map(s_)) || blank('fill: their first names')},`,
        `As you asked, I have recorded ${yours} for ${addr}, with immediate effect from ${when}. Signing has stopped, and the signing links no longer work. Nothing anyone had already signed has been changed.`,
        `I'll let the ${v ? "purchasers'" : "vendors'"} lawyer know. Any questions, just call me on ${TIM_PHONE}.`, 'Tim'].join('\n\n'),
    };
    const lawyer = {
      to: uniq([ol.email]), cc: [],
      subject: `Withdrawal: ${addr}`,
      body: [`Dear ${olFirst || blank("fill: the lawyer's first name")},`,
        `I write to let you know that ${theirs} for ${addr}, with immediate effect from ${when}. Signing has stopped, and nothing further will be presented on it.`,
        `Please let your clients know. Any questions, just call me on ${TIM_PHONE}.`, 'Faithfully,\nTim'].join('\n\n'),
    };
    return { party, lawyer };
  }

  // a draft's text as the email's HTML: escaped, paragraphs at blank lines, line breaks kept, **bold**, the link at [the signing link]
  function toHtml(text, link) {
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const para = p => esc(p).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(https:\/\/[^\s<]+[^\s<.,;:)])/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>')
      .split(esc(LINK)).join(link ? `<a href="${esc(link)}" style="display:inline-block;background:#1F3B57;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Open it</a>` : esc(LINK));
    return '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1F1D1A;max-width:600px">' + String(text).split(/\n{2,}/).map(p => `<p>${para(p)}</p>`).join('') + '</div>';
  }

  const MAIL = { LINK, BLANK_RE, TIM_PHONE, signLinkDraft, reopenedDraft, roundNotice, agreedDrafts, agreedPrice, agreedDates, agreedNotice, PRICE_BLANK, DEPOSIT_HOLDERS, depositRecommended, withdrawDrafts, firstWorkingDay, parseDate, longDate, toHtml, P_ACTION };
  if (typeof module !== 'undefined' && module.exports) module.exports = MAIL; else root.MAIL = MAIL;
})(typeof window !== 'undefined' ? window : globalThis);

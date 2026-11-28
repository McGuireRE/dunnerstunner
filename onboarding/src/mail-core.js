/* Emails from the offers system, in Tim's voice (onboarding/EMAIL-VOICE.md). No page or database code here, so the tests load it on
   its own (mail-core.test.js), Tim's screen builds drafts with it, and the offer-sign edge function uses it for the drafts it makes
   and for Tim's own round notice.

   Every email to a buyer, vendor or lawyer is a draft Tim reviews and sends from the page (offer_mail_drafts, migration 024). The
   wording comes only from the agreement's data; anything the data can't fill is a marked blank, "[Tim to ...]", never a guess.

     signLinkDraft(i)        a signer's personal link (the link itself goes in at [the signing link] when Tim sends it)
     reopenedDraft(i)        "please initial the change and finish again", to a signer whose side changed the document after they finished
     roundNotice(i)          Tim's own notice, once per submitted round: who, what changed, which round, and its portal address
     requestNotice(i)        Tim's urgent email when a party asks from their link to stop, withdraw or go back to the last sealed round
     agreedDrafts(i)         the agreed copy's two emails: to the purchasers (cc their lawyer) and to the vendors (cc theirs)
     stillNeeded(text)       what the marked blanks still ask Tim to fill or add, in plain words, once each (the top of his review)
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
  // Tim's phone in every email's sign-off: the default here, and the one in the database (offer_settings.agent_phone, 025) set at run
  // time by setAgent (Tim's screen and the offer-sign function read it before making a draft), so the row is the one source
  let TIM_PHONE = '027 562 7207';
  function setAgent(a) { const ph = s_(a && a.phone); if (/^[0-9+()\s-]{6,40}$/.test(ph)) TIM_PHONE = ph; return TIM_PHONE; }
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
  // after a change was undone (Offers fixes 3): someone reopened by it, whose "please initial the change" draft was set aside, still has
  // to finish again. A draft Tim reads and sends; the same side only, nothing about the other side.
  function finishAgainDraft(i) {
    const first = s_(i.first) || 'there', addr = s_(i.address) || 'the property';
    return { subject: `Please finish signing again: ${addr}`, body: [`${i.side === 'vendor' ? 'Hello' : 'Dear'} ${first},`,
      `The document for ${addr} changed after you finished signing, and that change has since been taken back. Please open the link I sent you earlier and finish signing again. You'll be asked for a new code.`,
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
  const textW = (t, z) => String(t || '').length * z * 0.556;
  const hits = (a, b, pad) => !!a && !!b && a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;
  // only a money figure and nothing else ("$1,050,000", "1,050,000", "$1 050 000", "$1050000"); words with it ("plus GST",
  // "if settlement 1 March") are never read as the price
  const ONLY_FIGURE = /^\s*\$?\s?(?:\d{1,3}(?:[,\s]\d{3})+|\d{4,})(?:\.\d{1,2})?\s*$/;
  const digitsOf = t => String(t || '').replace(/\D/g, '');
  // every change in the rounds, oldest first, as Tim reads it ("Round 2, page 1: line through "$655,000"")
  const KIND_TIM = { strike: 'line through', cross: 'crossed-out passage', insert: 'typed', note: 'handwritten note', reinstate: 'reinstatement' };
  const changeWords = c => { const g = c.geometry || {}, t = s_(g.text != null ? g.text : c.text); return `Round ${c.round}, page ${c.page}: ${KIND_TIM[c.kind] || c.kind}${t ? ` "${t.slice(0, 120)}"` : c.kind === 'strike' ? ' (the words struck were not recorded)' : ''}`; };
  function allChanges(i) {
    const out = [];
    if (Array.isArray(i.layers)) i.layers.slice().sort((a, b) => a.doc_round - b.doc_round).forEach(L => (L.marks || []).forEach(m => out.push(Object.assign({}, m, { round: L.doc_round, side: L.side }))));
    else ((i.terms || {}).changes || []).forEach((c, k) => out.push(Object.assign({ id: 'c' + k }, c)));
    return out;
  }
  function agreedPrice(i) {
    const T = i.terms || {}, AD = T.as_drafted || {}, drafted = money(AD.price) || money(T.price), dFig = numOf(drafted);
    const ch = allChanges(i), shapes = Array.isArray(i.layers);
    const plain = { text: drafted || blank('fill: the price'), figure: dFig, changed: false, round: null, unsure: !drafted, used: [], others: ch };
    const unsure = why => ({ text: PRICE_BLANK, figure: null, changed: true, round: null, unsure: true, why, used: [], others: ch });
    if (!ch.length) return plain;
    // only the list of changes (no shapes): any line, cross or handwriting could be on the price, and typed words with a figure could be one
    if (!shapes) return ch.every(c => c.kind === 'insert' && !figures(c.text).length && !PRICE_WORD.test(String(c.text || ''))) ? plain : unsure('the changes have no shapes');
    const boxes = (i.priceBoxes || []).filter(b => b && typeof b.x === 'number');
    if (!boxes.length) return unsure('no price place');
    const back = new Set(ch.filter(c => c.kind === 'reinstate' && c.target).map(c => c.target));
    const lines = ch.filter(c => (c.kind === 'strike' || c.kind === 'cross') && !back.has(c.id));
    // a line through the price itself: inside the price place's own height, across most of its width, and (when the struck words were
    // recorded) holding the drafted figure; a crossed-out passage over the middle of the price place
    const onPrice = c => boxes.some(b => { if (b.page !== c.page) return false; const g = c.geometry || {};
      if (c.kind === 'strike') { if (!(g.y >= b.y - 0.5 && g.y <= b.y + b.h + 0.5)) return false;
        // the struck words recorded (Offers fixes 2 on): they must hold the drafted figure
        if (g.text != null) return !!drafted && digitsOf(g.text).includes(digitsOf(drafted));
        // a line from before the words were recorded: it must run across most of the drafted figure, written from the start of the place
        const figW = textW(drafted, Math.min(b.h, 10)), x0 = Math.min(g.x0, g.x1), x1 = Math.max(g.x0, g.x1), cover = Math.max(0, Math.min(x1, b.x + figW) - Math.max(x0, b.x));
        return !!drafted && cover >= figW * 0.5; }
      if (c.kind === 'cross') { const cx = b.x + b.w / 2, cy = b.y + b.h / 2; return cx >= g.x && cx <= g.x + g.w && cy >= g.y && cy <= g.y + g.h; }
      return false; });
    const at = (c, pad) => boxes.some(b => b.page === c.page && hits(rectOfChange(c), b, pad));
    const nearIns = c => c.kind === 'insert' && boxes.some(b => b.page === c.page && (c.geometry || {}).y >= b.y - 30 && (c.geometry || {}).y <= b.y + b.h + 30 && (c.geometry || {}).x >= b.x - 60 && (c.geometry || {}).x <= b.x + b.w + 250);
    const struck = lines.filter(onPrice), notes = ch.filter(c => c.kind === 'note' && at(c, 20)), ins = ch.filter(nearIns);
    const elsewhere = ch.filter(c => c.kind === 'insert' && !nearIns(c) && PRICE_WORD.test(String((c.geometry || {}).text || '')));
    if (!struck.length && !ins.length && !notes.length && !elsewhere.length) return plain;
    if (notes.length || elsewhere.length || !struck.length) return unsure('unclear');
    // the typed figure still standing: not itself struck through by a later line
    const through = (l, c) => { const g = c.geometry || {}, z = g.size || 9, r = rectOfChange(l), t = { x: g.x, y: g.y, w: rectOfChange(c).w, h: z * 0.75 };   // a line through the typed letters themselves
      return l.page === c.page && (l.kind === 'strike' ? (l.geometry.y >= t.y && l.geometry.y <= t.y + t.h && r.x < t.x + t.w && r.x + r.w > t.x) : hits(r, t, 0)); };
    const live = ins.filter(c => !lines.some(l => through(l, c)));
    if (live.length !== 1) return unsure('more than one figure, or none');
    const tx = String(live[0].geometry.text || '');
    if (!ONLY_FIGURE.test(tx)) return unsure('the typed words are more than a figure');
    const f = [Number(tx.replace(/[^0-9.]/g, ''))]; if (!(f[0] >= 1000)) return unsure('no single figure');
    // a sanity check against the drafted price: a figure under half or over double it is not read as the price
    if (dFig && (f[0] < dFig / 2 || f[0] > dFig * 2)) return unsure('far from the drafted price');
    // the changes this accounts for: the lines through the price, every figure typed by it, and the lines through those figures
    const used = new Set(struck.map(c => c.id).concat(ins.map(c => c.id)).concat(lines.filter(l => ins.some(c => through(l, c))).map(l => l.id)));
    return { text: money(f[0]), figure: f[0], changed: true, round: live[0].round, unsure: false, used: [...used], others: ch.filter(c => !used.has(c.id)) };
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
  //   vendorLawyer: { person, firm, email, phone, service }, purchaserLawyer: { the same } (else details.lawyer), purchaserSigners: [{ name, email }],
  //   hide, agent (see below), sources: [notes for Tim on where a lawyer came from], holidays: [{ day, label }], labels: { key: 'Finance', ... } }
  //   -> { purchasers: { to, cc, subject, body }, vendors: { ... }, blanks: [the marked blanks, once each], stillNeeded: [plain words], notes, left }
  function agreedDrafts(input) {
    const T = input.terms || {}, D = input.details || {}, AD = T.as_drafted || {}, labels = Object.assign({}, input.labels || {}), addr = s_(input.address);
    const conds = Array.isArray(T.conditions) ? T.conditions : [];
    /* Agreed emails filled in (Tim, 26 November 2026): every contact detail comes from the record that already holds it, so all Tim does
       is read and send. What isn't on record stays a marked blank, and the blanks are listed for him once ("Still needed", stillNeeded).
         the purchasers: their names, emails and phones on the offer (the first purchaser also has the offer's own email and phone; a
           signer's email by the same name)
         the purchasers' lawyer: input.purchaserLawyer (the agreed contract's contact page, as Tim's screen reads it), else the offer's
         the vendors: input.vendors (the names as signed, their emails and phones); the vendors' lawyer: input.vendorLawyer
         each lawyer's email for service of notices (service), shown as well when it isn't their email (Tim, 26 November 2026)
       Privacy (024 and 025, offer_mail_side_hit): an email never holds the other side's own email or phone. input.hide gives them
       ({ purchasers: { emails, phones }, vendors: { emails, phones } }: what each email must not hold), input.agent Tim's own (never
       hidden). A value that would break the rule is left out of that email, and Tim is told in the notes. */
    const nsn = v => { let x = String(v == null ? '' : v).replace(/\D/g, ''); if (x.startsWith('0064')) x = x.slice(4); else if (x.startsWith('64') && x.length >= 10) x = x.slice(2); else if (x.startsWith('0')) x = x.slice(1); return x; };
    const AG = input.agent || {}, agentE = new Set((AG.emails || []).map(e => s_(e).toLowerCase()).filter(Boolean)), agentP = new Set([TIM_PHONE].concat(AG.phones || []).map(nsn).filter(Boolean));
    const forbidOf = h => ({ emails: ((h || {}).emails || []).map(e => s_(e).toLowerCase()).filter(e => e.length >= 5 && e.includes('@') && !agentE.has(e)), phones: ((h || {}).phones || []).map(nsn).filter(x => x.length >= 7 && !agentP.has(x)) });
    const HIDE = { purchasers: forbidOf((input.hide || {}).purchasers), vendors: forbidOf((input.hide || {}).vendors) }, LEFT = { purchasers: [], vendors: [] };
    // a value for one of the two emails ('purchasers' | 'vendors'): '' when it holds the other side's own email or phone (Tim is told)
    const keep = (to, v, what) => { const x = s_(v); if (!x) return ''; const t = x.toLowerCase(), n = nsn(x), F = HIDE[to];
      if (F.emails.some(e => t.includes(e)) || (n.length >= 6 && F.phones.some(f => n.includes(f)))) { if (!LEFT[to].includes(what)) LEFT[to].push(what); return ''; } return x; };
    const pSigners = input.purchaserSigners || [];
    const purch = (D.purchasers || []).filter(q => s_(q.first) || s_(q.last)).map((q, k) => { const full = [s_(q.first), s_(q.last)].filter(Boolean).join(' '), sg = pSigners.find(x => s_(x.name).toLowerCase() === full.toLowerCase()) || {};
      return { first: s_(q.first), last: s_(q.last), full, to: s_(q.email) || (k === 0 ? s_(D.email) : ''), email: s_(q.email) || s_(sg.email) || (k === 0 ? s_(D.email) : ''), phone: s_(q.phone) || (k === 0 ? s_(D.phone) : '') }; });
    // a vendor's To address: their own as signer (v.to, when given), else the email shown; the email shown may come from the property file
    const vend = (input.vendors || []).map(v => ({ name: s_(v.legal_name), full: s_(v.legal_name), call: s_(v.pref_name) || s_(v.legal_name).split(/\s+/)[0], email: s_(v.email), to: v.to !== undefined ? s_(v.to) : s_(v.email), phone: s_(v.phone) }));
    const pl = input.purchaserLawyer || D.lawyer || {}, vl = input.vendorLawyer || {};
    const pWho = purch.length > 1 ? "the purchasers' lawyer" : "the purchaser's lawyer", vWho = "the vendors' lawyer";
    // a lawyer as one email may show them: the email for notices stands in for a missing email; hidden values are dropped, never blanked
    const lawyerFor = (L, to, who) => { const email = keep(to, L.email, `${who}'s email`), service = keep(to, L.service, `${who}'s email for notices`), phone = keep(to, L.phone, `${who}'s phone`);
      return { person: s_(L.person), firm: s_(L.firm), email: email || service, service, phone, hidEmail: !email && !service && !!(s_(L.email) || s_(L.service)), hidPhone: !phone && !!s_(L.phone) }; };
    const lawyerBlock = (L, who) => {
      if (!L.person && !L.firm && !L.email && !L.hidEmail) return blank(`fill: ${who} (name, firm, email, phone)`);
      const lines = [[L.person || blank(`fill: ${who}'s name`), L.firm || blank(`fill: ${who}'s firm`)].join(', ')];
      if (!L.hidEmail) lines.push(`Email: ${L.email || blank(`fill: ${who}'s email`)}`);
      if (!L.hidPhone) lines.push(`Phone: ${L.phone || blank(`fill: ${who}'s phone`)}`);
      if (L.service && L.email && L.service.toLowerCase() !== L.email.toLowerCase()) lines.push(`Notices are served to: ${L.service}`);
      return lines.join('\n'); };
    // a party's own contact line, in their own side's email: what is on record, a blank for what isn't
    const contactLine = (q, to) => { const e = keep(to, q.email, `${q.full}'s email`), ph = keep(to, q.phone, `${q.full}'s phone`), hidE = !e && !!q.email, hidP = !ph && !!q.phone;
      const parts = [hidE ? '' : (e || blank(`fill: ${q.full}'s email`)), hidP ? '' : (ph || blank(`fill: ${q.full}'s phone`))].filter(Boolean);
      return parts.length ? `${q.full}: ${parts.join(', ')}` : q.full; };
    const pLawP = lawyerFor(pl, 'purchasers', pWho), pLawV = lawyerFor(pl, 'vendors', pWho), vLawP = lawyerFor(vl, 'purchasers', vWho), vLawV = lawyerFor(vl, 'vendors', vWho);
    const agreed = fromIso((input.agreement || {}).agreement_date), fwd = agreed ? firstWorkingDay(iso(agreed), input.holidays) : null;
    // each condition's due date: the date written on the agreement for it (as drafted), else a blank
    // the price as agreed: after the negotiation, when a typed figure replaced it (shared with Tim's own email, agreedNotice)
    const PR = input.price || agreedPrice({ terms: T, layers: input.layers, priceBoxes: input.priceBoxes }), price = PR.text;
    // any change the price doesn't account for could alter the deposit, the settlement day or a condition's date: those become marked blanks
    const OTHER = (PR.others || []).length > 0;
    // each condition's due date and settlement day: on the agreement, else worked out from the agreement date (Offers fixes 2), shown once to Tim
    const notes = [], DT = OTHER ? { due: {}, settle: null, provinceName: '' } : agreedDates({ terms: T, agreementIso: agreed ? iso(agreed) : '', province: input.province, offers: input.offers }), AGW = agreed ? longDate(agreed) : '';
    if (OTHER) notes.push('The negotiation made other changes, so the deposit, the settlement day and each condition\'s date are left as blanks for you to fill from the agreed copy.');
    allChanges({ terms: T, layers: input.layers }).forEach(c => notes.push('Change: ' + changeWords(c)));
    const due = conds.map(c => { const x = DT.due[c.key], d = x ? fromIso(x.iso) : null, label = labels[c.key] || c.key;
      if (x && !x.worked) notes.push(`${label} due ${longDate(d)} (as written on the agreement; check)`);
      if (x && x.worked) notes.push(`${label} due ${longDate(d)} (worked out from the agreement date, ${AGW}: ${x.how || 'its timing'}, with ${DT.provinceName} holidays; check)`);
      return { c, label, d, text: d ? longDate(d) : blank(`fill: the ${label} due date`) }; });
    const lastDue = due.reduce((m, x) => x.d && (!m || x.d > m) ? x.d : m, null);
    const settleD = DT.settle ? fromIso(DT.settle.iso) : null;
    if (DT.settle && DT.settle.worked) notes.push(`Settlement day ${longDate(settleD)} (worked out from the agreement date, ${AGW}: ${DT.settle.how}, with ${DT.provinceName} holidays; check)`);
    if (DT.settle && !DT.settle.worked) notes.push(`Settlement day ${longDate(settleD)} (as written on the agreement; check)`);
    const settleText = settleD ? longDate(settleD) : blank('fill: settlement day') + (s_(AD.settlement) && !OTHER ? ` (the agreement says: ${s_(AD.settlement)})` : '');
    const endHol = settleD || lastDue;
    const hols = agreed && endHol ? (input.holidays || []).filter(h => { const x = fromIso(h.day); return x && x > agreed && x <= endHol; }) : [];
    if (PR.changed && !PR.unsure) notes.push(`Price ${PR.text} (the figure typed in Round ${PR.round} in place of the struck price; check)`);
    // the deposit, in Tim's words: his trust account at the NZ Real Estate Trust, unless any part is KiwiSaver (then the vendors'
    // lawyer's trust account, not released before settlement). When it is paid only if the agreement's own deposit wording says so.
    const depText = [s_(AD.deposit), s_(T.deposit_printed)].join(' ');
    const DA = OTHER ? null : depositAmount(depText, PR), depAmt = DA ? DA.text : (!OTHER && s_(AD.deposit) && !/%|per\s?cent/i.test(s_(AD.deposit)) ? s_(AD.deposit) : blank('fill: the deposit amount'));
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
    // cc: the lawyer's email and, when it is a different address, the email for notices too (Tim, 26 November 2026). With no address
    // that can go on it (none on record, or left out for privacy), the email never says it is cc'd: Tim is asked to add one.
    const pCc = uniq([pLawP.email, pLawP.service]), vCc = uniq([vLawV.email, vLawV.service]);
    const noCc = who => blank(`add: ${who} to the cc (no email for them on record can go on this email), then delete this line`);
    const pTo = uniq(purch.map(q => q.to).concat(purch.some(q => q.to) ? [] : [D.email]));
    // someone on the agreement who won't get it: no address for them that this email may go to (024 allows only the offer's own)
    const missOut = (q, side) => notes.push(`${q.full} won't receive the email to the ${side}: ${q.email ? `their email (${q.email}) isn't on the ${side === 'purchasers' ? 'offer' : 'signing'}` : 'no email for them is on record'}. Add it there, or send it to them yourself.`);
    purch.forEach((q, k) => { if (!q.to && !(k === 0 && pTo.length && !purch.some(x => x.to))) missOut(q, 'purchasers'); });
    const purchasers = {
      to: pTo, cc: pCc,
      subject: `Congratulations! ${addr}`,
      body: [...top, `Dear ${pNames || blank('fill: their first names')},`,
        `Congratulations on your agreement to purchase ${addr}. It sure is a desirable property! The agreement is attached.`,
        'The contact details you have supplied me are:\n' + (purch.length ? purch.map(q => contactLine(q, 'purchasers')).join('\n') : blank("fill: the purchasers' names and contact details")),
        pCc.length ? `This email is cc'd to your lawyer:\n${lawyerBlock(pLawP, pWho)}` : `Your lawyer:\n${lawyerBlock(pLawP, pWho)}\n${noCc(pWho)}`,
        'They are the person who will guide you through the remaining stages of your property purchase. Keep me in the loop with any questions or progress.',
        `The vendors' lawyer is:\n${lawyerBlock(vLawP, vWho)}`,
        `The property marketing homepage with documents is here: ${blank('add: the property page link, or delete this line')}`,
        '**Roadmap**', ...dateLines, `Price: ${price}`, condP, depositP, chatP, inspect,
        'Meeting with your lawyer: your lawyer will meet with you before settlement to go through the documents. Make sure you take evidence of ID and evidence of your current address.',
        `Possession and Settlement day: **${settleText}**. On this day you get the keys. They are released only once the vendors' lawyer confirms receipt of the funds. I'll endeavour to meet you at your new home on the day.`,
        close].join('\n\n'),
    };
    const vNames = names(vend.map(v => v.call));
    vend.forEach(v => { if (!v.to) missOut(v, 'vendors'); });
    const vendors = {
      to: uniq(vend.map(v => v.to)), cc: vCc,
      subject: `Congratulations! ${addr}`,
      body: [...top, `Hello ${vNames || blank('fill: their first names')},`,
        `Congratulations on your agreement for the sale of ${addr}. ${vCc.length ? 'This email is cc\'d to your lawyer,' : 'Your lawyer is'} ${vLawV.person || blank("fill: the vendors' lawyer's name")} of ${vLawV.firm || blank("fill: the vendors' lawyer's firm")}.${vCc.length ? '' : ' ' + noCc(vWho)}`,
        `They will handle all legal notices regarding the agreement and ensure everything proceeds correctly. Keep us in the loop with any developments as soon as possible. That way ${vLawV.person.split(/\s+/)[0] || blank("fill: the vendors' lawyer's first name")} and I can be responsive and ensure you get the best possible outcome.`,
        'The agreement is attached.',
        ...(conds.length ? ['Until the purchaser confirms the agreement, you have tasked me with marketing the property. The advertising will remain active and I will continue to discuss the property with potential purchasers.'] : []),
        'The contact details I have for you are:\n' + (vend.length ? vend.map(v => contactLine(v, 'vendors')).join('\n') : blank("fill: the vendors' names and contact details")),
        `Your lawyer:\n${lawyerBlock(vLawV, vWho)}`,
        `${pWho.replace(/^t/, 'T')} is:\n${lawyerBlock(pLawV, pWho)}`,
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
    [['purchasers', 'the purchasers'], ['vendors', 'the vendors']].forEach(([k, w]) => { if (LEFT[k].length) notes.push(`Left out of the email to ${w}: ${LEFT[k].join(', ')}. ${k === 'purchasers' ? 'It is the same as a vendor\'s own' : 'It is the same as a purchaser\'s own'}, and each side sees only their own details and the lawyers'.`); });
    (input.sources || []).forEach(n => notes.push(n));
    return { purchasers, vendors, blanks, notes, price: PR, stillNeeded: stillNeeded(purchasers.subject + '\n' + purchasers.body + '\n' + vendors.subject + '\n' + vendors.body), left: LEFT };
  }

  // what Tim still has to fill in or add, in plain words, once each ("the vendors' lawyer's phone"): from the marked blanks of one or more
  // drafts, so his review lists them at the top ("Still needed: ..."); the checks ([Tim to check: ...]) are not in it
  function stillNeeded(text) {
    const all = [...new Set((String(text || '').match(BLANK_RE) || []).filter(b => /^\[Tim to (fill|add):/.test(b)).map(b => b.replace(/^\[Tim to (fill|add):\s*/, '').replace(/\]$/, '').trim()))];
    // a lawyer missing altogether is one item: their name, firm, email, phone and first name are part of it
    const whole = all.map(t => (/^(.+) \(name, firm, email, phone\)$/.exec(t) || [])[1]).filter(Boolean);
    return all.filter(t => !whole.some(w => t.startsWith(w + "'s ") || t.startsWith(w + ' to the cc')));
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
    const OTHER = (P.others || []).length > 0, ALL = allChanges({ terms: T, layers: i.layers });
    const DT = OTHER ? { due: {}, settle: null } : agreedDates({ terms: T, agreementIso: agreed ? iso(agreed) : '', province: i.province, offers: i.offers });
    const conds = Array.isArray(T.conditions) ? T.conditions : [], notWorked = OTHER ? 'not worked out: the negotiation made other changes, so check the agreed copy' : 'not worked out (check the agreement)';
    const worked = x => x && x.worked ? ' (worked out from the agreement date)' : '';
    const dh = i.depositHolder && DEPOSIT_HOLDERS[i.depositHolder.holder] ? i.depositHolder : { holder: depositRecommended(!!i.kiwisaver), by_default: true };
    const holder = dh.holder === 'other' ? (s_(dh.other) || 'other (not named yet)') : DEPOSIT_HOLDERS[dh.holder].payee;
    const lines = [
      `The agreement for ${addr} is confirmed and locked.${i.again ? ' (Sent again, as you asked.)' : ''} ${i.attached ? 'The dated agreed copy is attached.' : i.tooBig ? 'The dated agreed copy is too big to attach, so it is not attached: download it from the offer in the portal (link below).' : 'Download the dated agreed copy from the offer in the portal (link below).'}`,
      `Date of agreement: ${agreed ? longDate(agreed) : s_(A.date_text) || 'not recorded'}.`,
      `Purchasers: ${names(i.purchasers || []) || 'not recorded'}.`,
      `Vendors: ${names(i.vendors || []) || 'not recorded'}.`,
      P.unsure ? 'Price: not worked out here. A change in the negotiation may have altered it, so check the agreed copy.' : P.changed ? `Price: ${P.text}. Changed in the negotiation: typed in Round ${P.round} in place of the struck price.` : `Price: ${P.text}.`,
      conds.length ? 'Conditions:\n' + conds.map((c, k) => { const x = DT.due[c.key]; return `${k + 1}. ${labels[c.key] || c.key}: due ${x ? longDate(fromIso(x.iso)) + worked(x) : notWorked}`; }).join('\n') : 'Conditions: none. The agreement is unconditional.',
      `Settlement day: ${DT.settle ? longDate(fromIso(DT.settle.iso)) + worked(DT.settle) : notWorked}.`,
      ALL.length ? `Changes made in the negotiation (${ALL.length}):\n` + ALL.map((c, k) => `${k + 1}. ${changeWords(c)}`).join('\n') : '',
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

  // Tim's urgent email when a party asks from their own link (024; Offers fixes 3 adds going back to the last sealed round): the subject,
  // what they ask for, and what has (and hasn't) happened. Only ever to Tim.
  function requestNotice(i) {
    const v = i.side === 'vendor', who = v ? 'a vendor' : 'a purchaser', back = (+i.round || 1) - 1, addr = s_(i.address) || 'an offer';
    const ask = i.kind === 'withdraw' ? 'withdraw' : i.kind === 'revert' ? (back >= 1 ? `go back to Round ${back} as it was signed` : 'start this round again from the beginning') : 'stop signing for now';
    const short = i.kind === 'withdraw' ? 'withdraw' : i.kind === 'revert' ? (back >= 1 ? `go back to Round ${back}` : 'start the round again') : 'stop signing';
    const after = i.kind === 'revert' ? `Nothing has been set aside yet. Only their own link has stopped, and nobody else has been told. Open the offer to ${back >= 1 ? `go back to Round ${back}` : 'start the round again'}, or let them carry on:`
      : 'Nothing is frozen yet. Only their own link has stopped, and nobody else has been told. Open the offer to Freeze now or Withdraw now:';
    return { subject: `URGENT: ${who} asks to ${short}: ${addr}`, who, ask, after };
  }

  // a draft's text as the email's HTML: escaped, paragraphs at blank lines, line breaks kept, **bold**, the link at [the signing link]
  // (or, for an appraisal, at [the appraisal link], with its own button wording: o = { token, label })
  function toHtml(text, link, o) {
    const tok = (o && o.token) || LINK, label = (o && o.label) || 'Open it';
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const para = p => esc(p).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(https:\/\/[^\s<]+[^\s<.,;:)])/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>')
      .split(esc(tok)).join(link ? `<a href="${esc(link)}" style="display:inline-block;background:#1F3B57;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${esc(label)}</a>` : esc(tok));
    return '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1F1D1A;max-width:600px">' + String(text).split(/\n{2,}/).map(p => `<p>${para(p)}</p>`).join('') + '</div>';
  }

  /* ───── the appraisal (LW3 phase E, migration 037) ───── */
  // The email that takes a vendor to their appraisal: a draft in Tim's voice that he reads, changes if he likes and sends from the
  // appraisal's Send page. [the appraisal link] becomes their own button when it goes (the notify function). It never names a figure,
  // a fee or a commission: the appraisal itself says all of that, behind their sign-in.
  // i: { first (their preferred names, one or more), address, update (a newer version of one already sent) }
  const APPRAISAL_LINK = '[the appraisal link]';
  function appraisalDraft(i) {
    const firsts = (Array.isArray(i.first) ? i.first : [i.first]).map(s_).filter(Boolean), addr = s_(i.address) || 'your property', up = !!i.update;
    const subject = up ? `Your updated appraisal: ${addr}` : `Your appraisal: ${addr}`;
    const body = [`Hello ${names(firsts) || 'there'},`,
      up ? `I've updated my appraisal of ${addr}. The new version is ready for you to look at, in the same private place as before:`
        : `Thank you for having me through ${addr}. As promised, my appraisal is ready: where I think buyers will land, how I would sell it, and the marketing I would suggest. It's private to you:`,
      APPRAISAL_LINK,
      'Open the link and sign in with this email address. You\'ll get a sign-in email straight away, with no password needed. The photos open for a short time each visit, so just sign in again whenever you come back.',
      up ? 'If anything in it raises a question, or you are ready to talk about next steps, press "I\'d like to proceed" at the bottom of the page.'
        : 'Take your time with it. When you\'re ready, press "I\'d like to proceed" at the bottom of the page and answer a few quick questions, so I can shape the plan around what matters most to you. There\'s no obligation.',
      `Any questions at all, just call or text me on ${TIM_PHONE}.`, 'Tim'].join('\n\n');
    return { subject, body };
  }
  // Tim's own note when a vendor opens their appraisal, presses "I'd like to proceed" or saves a plan they built (the notify function).
  // i: { kind: 'opened' | 'proceeded' | 'plan_built', who (their name or email), address, version, total (a built plan's total), portalUrl }
  function appraisalEventNotice(i) {
    const who = s_(i.who) || 'A vendor', addr = s_(i.address) || 'an appraisal', v = +i.version > 1 ? ` (version ${+i.version})` : '';
    const t = { opened: [`${who} opened their appraisal: ${addr}`, `${who} has opened the appraisal you sent for ${addr}${v}.`],
      proceeded: [`${who} would like to proceed: ${addr}`, `${who} pressed "I'd like to proceed" on their appraisal for ${addr}${v}. Their Questions before we meet is open, linked to this appraisal, and you'll hear when they send their answers.`],
      plan_built: [`${who} built their own marketing plan: ${addr}`, `${who} built their own marketing plan from their appraisal for ${addr}${v}${money(i.total) ? `, coming to ${money(i.total)} including GST` : ''}. It's saved to their appraisal.`] }[i.kind]
      || [`About an appraisal: ${addr}`, `${who} did something on their appraisal for ${addr}.`];
    return { subject: t[0], body: [t[1], i.portalUrl ? `Open the appraisal: ${s_(i.portalUrl)}` : ''].filter(Boolean).join('\n\n') };
  }

  const MAIL = { LINK, BLANK_RE, get TIM_PHONE() { return TIM_PHONE; }, setAgent, allChanges, stillNeeded, signLinkDraft, reopenedDraft, finishAgainDraft, roundNotice, agreedDrafts, agreedPrice, agreedDates, agreedNotice, PRICE_BLANK, DEPOSIT_HOLDERS, depositRecommended, withdrawDrafts, requestNotice, firstWorkingDay, parseDate, longDate, toHtml, P_ACTION,
    APPRAISAL_LINK, appraisalDraft, appraisalEventNotice };
  // also on the global object everywhere (a bundler may wrap this file as CommonJS: the offer-sign entry reads the globals; offers hotfix 2)
  if (typeof module !== 'undefined' && module.exports) module.exports = MAIL; root.MAIL = MAIL;
})(typeof window !== 'undefined' ? window : globalThis);

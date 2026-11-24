/* Emails from the offers system, in Tim's voice (onboarding/EMAIL-VOICE.md). No page or database code here, so the tests load it on
   its own (mail-core.test.js), Tim's screen builds drafts with it, and the offer-sign edge function uses it for the drafts it makes
   and for Tim's own round notice.

   Every email to a buyer, vendor or lawyer is a draft Tim reviews and sends from the page (offer_mail_drafts, migration 024). The
   wording comes only from the agreement's data; anything the data can't fill is a marked blank, "[Tim to ...]", never a guess.

     signLinkDraft(i)        a signer's personal link (the link itself goes in at [the signing link] when Tim sends it)
     reopenedDraft(i)        "please initial the change and finish again", to a signer whose side changed the document after they finished
     roundNotice(i)          Tim's own notice, once per submitted round: who, what changed, which round, and its portal address
     agreedDrafts(i)         the agreed copy's two emails: to the purchasers (cc their lawyer) and to the vendors (cc theirs)
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
  // i: { first, address, side ('purchaser' | 'vendor'), round }
  function signLinkDraft(i) {
    const first = s_(i.first) || 'there', addr = s_(i.address) || 'the property', v = i.side === 'vendor', later = (+i.round || 1) > 1;
    const subject = v ? `An offer on ${addr}` : later ? `The vendors' reply to your offer: ${addr}` : `Your offer to sign: ${addr}`;
    const what = v ? `I have an offer on ${addr} for you to look at.` : later ? `I have the vendors' reply to your offer for ${addr} for you to look at.` : `Your offer for ${addr} is ready for you to sign.`;
    const how = v || later ? 'You can accept it as it stands, or make changes and sign them as a counteroffer. Each of you initials every change and signs.'
      : 'You read each page, then sign and initial each place yourself. It takes about 15 minutes.';
    const body = [`Kia ora ${first},`, `${what} This link is just for you, so please don't forward it:`, LINK,
      `When you open it, I'll email you a one-time code to check it's you. ${how} The link works for 14 days.`,
      `When you confirm, it comes straight to me, and I'll be in touch with the other party myself. You can talk to your lawyer at any time before you sign, and any questions, just call me on ${TIM_PHONE}.`,
      'Tim'].join('\n\n');
    return { subject, body };
  }
  // i: { first, address, by (who made the change) }
  function reopenedDraft(i) {
    const first = s_(i.first) || 'there', addr = s_(i.address) || 'the property';
    return { subject: `A change to initial: ${addr}`, body: [`Kia ora ${first},`,
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
    const due = conds.map(c => { const d = parseDate(AD['d_' + c.key]); return { c, label: labels[c.key] || c.key, d, text: d ? longDate(d) : blank(`fill: the ${labels[c.key] || c.key} due date`) }; });
    const lastDue = due.reduce((m, x) => x.d && (!m || x.d > m) ? x.d : m, null);
    const settleD = parseDate(AD.settlement) || (T.settlement && T.settlement.kind === 'date' ? parseDate(T.settlement.date) : null);
    const settleText = settleD ? longDate(settleD) : blank('fill: settlement day') + (s_(AD.settlement) ? ` (the agreement says: ${s_(AD.settlement)})` : '');
    const endHol = settleD || lastDue;
    const hols = agreed && endHol ? (input.holidays || []).filter(h => { const x = fromIso(h.day); return x && x > agreed && x <= endHol; }) : [];
    const price = money(AD.price) || money(T.price) || blank('fill: the price');
    const deposit = s_(AD.deposit) || s_(T.deposit_printed) || blank('fill: the deposit amount');
    const ks = T.kiwisaver === true || D.kiwisaver === true;
    const depositWho = ks ? "The whole deposit is paid to the vendors' lawyer's trust account, because KiwiSaver is part of it, and it can't be released before settlement."
      : 'The deposit is paid to the NZ Real Estate Trust account.';
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
    const depositP = `Deposit: ${deposit}. ${depositWho} ${blank('fill: when the deposit is paid')}`;
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
        ...dateLines, `Price: ${price}`, condV, `Deposit: ${deposit}. ${depositWho.replace("because KiwiSaver is part of it", "because the purchasers' KiwiSaver is part of it")} ${blank('fill: when the deposit is paid')}`,
        vendorItems.length ? 'Your action items from the further terms:\n' + vendorItems.map((t, k) => `${k + 1}. Further term ${t.number}${t.title ? ` (${t.title})` : ''}: ${s_(t.text)} Please book any work now.`).join('\n')
          : blank('check: no vendor action items were found in the further terms'),
        `Chattels to note: ${chattels.length ? chattels.join(' ') : 'none noted in the agreement.'} Anything included as a chattel needs to be in full working order at settlement.`,
        'Pre-settlement inspection: around five working days before settlement, the purchasers and I will visit the property to check everything is as it should be.',
        'Meeting with your lawyer: your lawyer will meet with you before settlement to sign the transfer documents. Make sure you take evidence of ID and evidence of your current address.',
        `Possession and Settlement day: **${settleText}**. On this day you hand over the keys and receive the balance of the settlement funds, once your lawyer confirms the funds have arrived.`,
        close].join('\n\n'),
    };
    const blanks = [...new Set((purchasers.body + '\n' + vendors.body).match(BLANK_RE) || [])];
    return { purchasers, vendors, blanks };
  }

  // a draft's text as the email's HTML: escaped, paragraphs at blank lines, line breaks kept, **bold**, the link at [the signing link]
  function toHtml(text, link) {
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const para = p => esc(p).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(https:\/\/[^\s<]+[^\s<.,;:)])/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>')
      .split(esc(LINK)).join(link ? `<a href="${esc(link)}" style="display:inline-block;background:#1F3B57;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Open it</a>` : esc(LINK));
    return '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1F1D1A;max-width:600px">' + String(text).split(/\n{2,}/).map(p => `<p>${para(p)}</p>`).join('') + '</div>';
  }

  const MAIL = { LINK, BLANK_RE, signLinkDraft, reopenedDraft, roundNotice, agreedDrafts, firstWorkingDay, parseDate, longDate, toHtml, P_ACTION };
  if (typeof module !== 'undefined' && module.exports) module.exports = MAIL; else root.MAIL = MAIL;
})(typeof window !== 'undefined' ? window : globalThis);

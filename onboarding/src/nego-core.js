/* Presentation and counteroffers (offers phase 4). No page or database code here, so the tests can load it on its own
   (nego-core.test.js), the browser uses it on Tim's screen and the signer's, and the offer-sign edge function uses it to make each
   locked round and the agreed copy. Builds on sign-core.js (SIGN): the same places, marks, fingerprints and record wording.

   The document is the approved draft, never altered. Everything signed or changed is a layer on top of it:
     ink       an initial, a signature or a name one signer put in one place in one round (a tap, kept with the round)
     changes   what a countering side did to the document: a line through text, a crossed-out box, typed words, a freehand note, or a
               reinstatement of an earlier line or box. Each carries the initials of everyone on that side, beside it.
   standing(layers, current)  the working copy: every round's ink in order, where each change lifts the OTHER side's ink at its place
                              (every earlier locked round still shows it), and a side's newer signature replaces its own older one
   outstanding(st, sides)     what is still missing before the agreement is formed: a signature from everyone, and everyone's initials
                              beside every change
   presentPlaces(input)       the places for the side the newest round goes to: a side signing for the first time initials the foot of
                              every page and every filled box (as Round 1 did); everyone initials each change not yet initialled; everyone signs
   changePlaces(...)          the initials of everyone on the countering side beside one change
   renderWorking(PDFLib, ...) a locked round or the agreed copy: the draft untouched, the standing ink and every change on top, the date
                              Tim typed (the agreed copy only), and a record on pages of its own at the end
   roundLines, agreementLines the wording of those records (never on the REINZ pages)
   timelineHtml, zip, crc32   the lawyers' pack: every locked round byte for byte, the agreed copy and the timeline as a readable page

   Positions are PDF points from the bottom left of the page. */
(function (root) {
  'use strict';
  const SIGN = (typeof module !== 'undefined' && module.exports && typeof require === 'function') ? require('./sign-core.js') : root.SIGN;
  const overlap = SIGN.overlap;
  const SIDE = { purchaser: 'purchasers', vendor: 'vendors' };
  const sideName = s => SIDE[s] || s;
  const other = s => s === 'vendor' ? 'purchaser' : 'vendor';
  const ansi = s => String(s == null ? '' : s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?');
  // the version of the drawing code: a locked round can be drawn again from its layers and record and come out byte for byte the same
  const DRAW_VERSION = 'nego-draw-1';
  // initials beside a change: from Round 2 on 'change'; in Round 1 a mark Tim re-approved was initialled as 'mark' (phase 3)
  const initialsFor = (k, id) => (k.why === 'change' || k.why === 'mark') && k.ref === id;

  /* ───── shapes ───── */
  // Helvetica's widths (the font typed words are drawn in), per 1000 points, for the characters 32 to 126 (pdf-lib's own metrics)
  const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const textWidth = (t, size) => { let w = 0; for (const ch of ansi(t)) { const c = ch.charCodeAt(0); w += HELV[c - 32] || 556; } return w * (size || 9) / 1000; };
  // a change's rectangle on the page (typed words measured as Helvetica draws them)
  function changeRect(c) {
    const g = (c && c.geometry) || {};
    if (c && c.kind === 'insert') { const size = g.size || 9; return { x: g.x, y: g.y - 2, w: Math.max(8, textWidth(g.text, size)), h: size + 4 }; }
    return SIGN.markRect(c || {});
  }
  // is a piece of ink at the place of a change? It touches the change (allowing 4 points), or it sits on the change's own line within
  // 60 points of it (the initials beside a price that is struck through and written again)
  const ROW_REACH = 60;
  function atPlace(ink, c) {
    if (!ink || !c || ink.page !== c.page) return false;
    const r = changeRect(c), g = { x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 8 };
    if (overlap(ink, g) > 0) return true;
    // the box the initials belong to (the whole place a price or a condition is written in)
    if (ink.for && overlap(ink.for, { x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }) > 0) return true;
    const cy = ink.y + ink.h / 2, gapX = Math.max(0, r.x - (ink.x + ink.w), ink.x - (r.x + r.w));
    return cy >= r.y - 3 && cy <= r.y + r.h + 3 && gapX <= ROW_REACH;
  }

  /* ───── the working copy ───── */
  // the ink of one round: each tap, at its place, with whose drawn mark it shows
  function inkOf(L) {
    const byId = new Map((L.places || []).map(p => [p.id, p])), who = new Map((L.signers || []).map(s => [s.position, s]));
    return (L.taps || []).map(t => { const p = byId.get(t.place_id); if (!p) return null; const s = who.get(p.signer) || {};
      return { key: L.signing_id + '/' + p.id, round: L.doc_round, number: L.number, side: L.side, signer: p.signer, who: s.name || '', kind: p.kind, why: p.why, ref: p.ref, page: p.page, x: p.x, y: p.y, w: p.w, h: p.h,
        for: p.for || null, name: p.name || null, png: p.kind === 'signature' ? s.sig_png || null : p.kind === 'initial' ? s.init_png || null : null }; }).filter(Boolean);
  }
  // layers: the locked rounds of one document, oldest first ({ doc_round, number, side, signing_id, places, taps, signers, marks }).
  // current (optional): the round being signed, whose changes already lift ink on the working copy (its own taps are added only when
  // opts.withCurrentInk is set, as when the round is locked).
  function standing(layers, current, opts) {
    let ink = []; const changes = [], lifted = [];
    const apply = (L, withInk) => {
      const marks = (L.marks || []).map(m => Object.assign({}, m, { round: L.doc_round, side: L.side, signing_id: L.signing_id }));
      marks.forEach(c => { ink = ink.filter(k => { if (k.side !== c.side && atPlace(k, c)) { lifted.push({ ink: k.key, side: k.side, signer: k.signer, who: k.who, kind: k.kind, why: k.why, ref: k.ref, page: k.page, round: k.round, by: c.id, by_round: c.round }); return false; } return true; }); });
      changes.push(...marks);
      if (!withInk) return;
      const mine = inkOf(L);
      mine.forEach(k => { ink = ink.filter(x => !(x.side === k.side && x.signer === k.signer && x.kind === k.kind && x.why === k.why && x.ref === k.ref)); });
      ink.push(...mine);
    };
    (layers || []).slice().sort((a, b) => a.doc_round - b.doc_round).forEach(L => apply(L, true));
    if (current) apply(current, !!(opts && opts.withCurrentInk));
    return { ink, changes, lifted };
  }
  // what is missing before the agreement is formed. sides: { purchaser: [{ position, name }], vendor: [...] }
  function outstanding(st, sides) {
    const out = [], has = (side, pos, f) => st.ink.some(k => k.side === side && k.signer === pos && f(k));
    Object.entries(sides || {}).forEach(([side, list]) => (list || []).forEach(s => {
      // only a signature in the signature block counts as having signed (a signature in a box Tim drew is an extra place: why 'ack')
      if (!has(side, s.position, k => k.kind === 'signature' && k.why === 'block')) out.push({ side, signer: s.position, who: s.name || '', what: 'signature' });
      st.changes.forEach(c => { if (!has(side, s.position, k => initialsFor(k, c.id))) out.push({ side, signer: s.position, who: s.name || '', what: 'change', ref: c.id, page: c.page }); });
    }));
    return out;
  }
  // the agreement is formed when the newest round changed nothing, both sides have signed, and nothing is outstanding
  const formed = (st, sides, lastChanges) => !lastChanges && Object.values(sides || {}).every(l => (l || []).length) && !outstanding(st, sides).length;

  /* ───── places ───── */
  const rectsOf = st => st.ink.map(k => ({ page: k.page, x: k.x, y: k.y, w: k.w, h: k.h })).concat(st.changes.map(c => Object.assign({ page: c.page }, changeRect(c))));
  // initials beside one change for some signers, kept clear of what is on the page
  function initialsBeside(c, signers, page, obstacles, text) {
    const pg = Object.assign({ w: 595, h: 842 }, page || {});
    const res = SIGN.placeRow(signers.length, changeRect(c), pg, (obstacles || []).filter(o => !o.page || o.page === c.page), text || SIGN.textRects(page));
    const f = changeRect(c), r1 = v => Math.round(v * 10) / 10;
    return res.boxes.map((b, i) => ({ id: `chg:${c.id}:s${signers[i].position}`, signer: signers[i].position, kind: 'initial', why: 'change', ref: c.id, page: c.page, x: b.x, y: b.y, w: b.w, h: b.h, for: { x: r1(f.x), y: r1(f.y), w: r1(f.w), h: r1(f.h) },
      label: `Initial the change on page ${c.page} (${KIND_WORDS[c.kind] || 'change'})` }));
  }
  // the initials of everyone on the countering side beside a change they are making
  function changePlaces(c, signers, pages, st, current) {
    const page = (pages || []).find(p => p.n === c.page), obs = rectsOf(st).concat(current || []);
    return initialsBeside(c, signers, page, obs);
  }
  // input: { pages: [{ n, w, h, items? }], placed, mapPlaces, side, signers: [{ position, name }] (for a later round: the side's newest
  //   round's signers), layers (the document's locked rounds), resignEvery (false: a side signs again only where its signature was
  //   lifted; true: every round) } -> { places, blocking, counts, first }: what the side the newest round goes to does
  function presentPlaces(input) {
    const side = input.side, signers = (input.signers || []).slice().sort((a, b) => a.position - b.position), layers = input.layers || [];
    const st = standing(layers), first = !layers.some(L => L.side === side), pages = input.pages || [];
    let places = [], blocking = [];
    if (first) {
      const M = SIGN.makePlaces({ pages, placed: input.placed || [], mapPlaces: input.mapPlaces || [], signers, side, obstacles: rectsOf(st) });
      places = M.places; blocking = M.blocking;
    } else {
      // a signer signs again where they signed before when their signature was lifted (or, with resignEvery, every round); the newer
      // signature replaces the older on the working copy. Otherwise their signature stands and they initial the changes.
      const mine = layers.filter(L => L.side === side).sort((a, b) => b.doc_round - a.doc_round)[0];
      signers.forEach(s => { const standingSig = st.ink.some(k => k.side === side && k.signer === s.position && k.kind === 'signature' && k.why === 'block'); if (standingSig && !input.resignEvery) return;
        const blockPl = (mine.places || []).filter(p => p.signer === s.position && p.why === 'block'); blockPl.forEach(p => places.push(Object.assign({}, p)));
        if (!blockPl.some(p => p.kind === 'signature')) blocking.push({ id: 'sig:' + s.position, label: 'Signatures', why: `${s.name} has no signature place from an earlier round.` }); });
    }
    // everyone initials each change not yet initialled by them (the other side's, and their own where the other side lifted them)
    const obs = rectsOf(st).concat(places);
    st.changes.forEach(c => {
      const need = signers.filter(s => !st.ink.some(k => k.side === side && k.signer === s.position && initialsFor(k, c.id)));
      if (!need.length) return;
      const page = pages.find(p => p.n === c.page); if (!page) { blocking.push({ id: 'chg:' + c.id, label: 'A change', why: `Page ${c.page} isn't in the document.` }); return; }
      const add = initialsBeside(c, need, page, obs); add.forEach(p => { places.push(p); obs.push(p); });
    });
    const counts = {}; signers.forEach(s => { counts[s.position] = places.filter(p => p.signer === s.position).length; });
    return { places, blocking, counts, first, standing: st };
  }

  /* ───── words ───── */
  const KIND_WORDS = { note: 'a note', strike: 'a line through text', cross: 'a crossed-out box', reinstate: 'a reinstatement', insert: 'typed words' };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // "2026-11-24" -> "24 November 2026"
  const fullDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : ''; };
  // "24 November 2026" -> "2026-11-24", or null when it isn't written in full or isn't a real day (the database checks the same)
  function parseFullDate(t) {
    const m = /^([1-9]|[12][0-9]|3[01]) (January|February|March|April|May|June|July|August|September|October|November|December) (20[0-9]{2})$/.exec(String(t || '').trim()); if (!m) return null;
    const mo = MONTHS.indexOf(m[2]) + 1, d = new Date(Date.UTC(+m[3], mo - 1, +m[1])); if (d.getUTCMonth() !== mo - 1) return null;
    return `${m[3]}-${String(mo).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
  }
  const NZ = SIGN.NZ;
  // the record for a locked round from Round 2 on. rec: { address, offer_ref, number, document, round, side, base: { number, sha256 },
  //   draft: { number, sha256 }, places_sha256, made_at, signers (as SIGN.executionLines), changes: [{ kind, page, by, at, text? }],
  //   lifted: [{ side, who, kind, page, by_round }], outstanding }
  function roundLines(rec) {
    const L = [], add = (t, o) => L.push(Object.assign({ t: ansi(t) }, o || {}));
    add(`Execution record: Round ${rec.round}`, { bold: true, size: 15 });
    add('This page is added by McGuire Real Estate after the agreement. It is not part of the REINZ form, and nothing on the form has been changed: every change is added on top.', { size: 8.5 });
    add(`Property: ${rec.address || ''}`, { gap: 6 }); add(`Offer: ${rec.offer_ref || ''}. Document ${rec.document || 1}, Round ${rec.round} (number ${rec.number} for this offer), signed by the ${sideName(rec.side)}.`);
    add(`It answers Round ${rec.base && rec.base.round || rec.round - 1}, fingerprint (SHA-256): ${(rec.base && rec.base.sha256) || ''}`, { size: 8 });
    if (rec.link_changes != null) add(`Changes from link: ${rec.link_changes ? 'allowed' : 'not allowed'} (Tim's choice when he presented this round).`, { size: 8.5 });
    add(`Approved draft ${rec.draft && rec.draft.number || ''}, fingerprint (SHA-256): ${(rec.draft && rec.draft.sha256) || ''}`, { size: 8 });
    add(`This copy was made and locked by the server on ${NZ(rec.made_at)}. Its own fingerprint is recorded when it is locked, and it is never changed.`, { size: 8.5 });
    const ch = rec.changes || [];
    add(ch.length ? `Changes made in this round (${ch.length}), each initialled by everyone on this side:` : `No changes: the ${sideName(rec.side)} accepted Round ${rec.round - 1} as it stood.`, { bold: true, gap: 8 });
    ch.forEach(c => add(`Page ${c.page}: ${KIND_WORDS[c.kind] || c.kind}${c.kind === 'insert' && c.text ? ' "' + c.text + '"' : c.kind === 'strike' && c.text ? ' striking "' + c.text + '"' : ''} by ${c.by}, ${NZ(c.at)}.`, { size: 8.5 }));
    if ((rec.lifted || []).length) { add(`Lifted from this working copy at the place of a change (they still show on the earlier rounds):`, { bold: true, gap: 8 });
      rec.lifted.forEach(x => add(`Page ${x.page}: ${x.kind === 'signature' ? 'the signature' : 'the initials'} of ${x.who || 'one of the ' + sideName(x.side)} from Round ${x.round}.`, { size: 8.5 })); }
    (rec.signers || []).forEach((s, i) => {
      add(`${rec.side === 'vendor' ? 'Vendor' : 'Purchaser'} ${i + 1}: ${s.name}`, { bold: true, gap: 8 });
      if (s.method === 'in_person') { add(`Signed in person on Tim McGuire's device. ${s.witnessed_by || 'Tim McGuire'} saw them sign.`); add(s.id_sighted === 'known_to_tim' ? 'Identity: known to Tim McGuire personally (no photo ID was needed).' : !s.id_sighted ? 'Identity: no choice recorded (knowing them and an ID check are both optional).' : `Photo ID sighted: ${SIGN.ID_TYPES[s.id_sighted] || s.id_sighted} (the type only; no ID number is kept).`); }
      else { add('Signed by a personal link sent only to them.'); add(`Email verified with a one-time code on ${NZ(s.verified_at)}.`); }
      add(`Agreed to sign electronically: ${NZ(s.consent_at)}.`);
      (s.receipts || []).forEach(r => add(r.guide === 'chattels' ? `Read the reminder that every chattel must be in full working order at settlement: ${NZ(r.at)}.` : `Received the ${SIGN.GUIDE_NAMES[r.guide] || r.guide}: ${NZ(r.at)}.`, { size: 8.5 }));
      add(`Signed and initialled all ${s.places} places themselves: first ${NZ(s.first_tap)}, last ${NZ(s.last_tap)}. Finished: ${NZ(s.finished_at)}.`, { size: 8.5 });
      add(`Device: ${String(s.ua || 'not recorded').slice(0, 160)}`, { size: 7.5 });
      if (s.net) add(`Network (kept only as a fingerprint): ${String(s.net).slice(0, 16)}`, { size: 7.5 });
      add(`Fingerprint (SHA-256) of what they saw and signed: ${s.seen_sha256 || ''}`, { size: 7.5 });
    });
    add(`Still outstanding after this round: ${rec.outstanding ? rec.outstanding + (rec.outstanding === 1 ? ' item' : ' items') : 'nothing'}.`, { size: 8.5, gap: 8 });
    add('Contact details are never printed here. Presented by Tim McGuire only after he had looked at the round before.', { size: 7.5, gap: 6 });
    return L;
  }
  // the record on the agreed copy. rec: { address, offer_ref, date_text, accepted_at, confirmed_by, made_at, document, round, rounds: [{ number, document, round, side, changes, sha256, locked_at }] }
  function agreementLines(rec) {
    const L = [], add = (t, o) => L.push(Object.assign({ t: ansi(t) }, o || {}));
    add('The agreement as agreed', { bold: true, size: 15 });
    add('This page is added by McGuire Real Estate. It is not part of the REINZ form, and nothing on the form has been changed.', { size: 8.5 });
    add(`Property: ${rec.address || ''}`, { gap: 6 }); add(`Offer: ${rec.offer_ref || ''}`);
    add(`Agreed as Document ${rec.document}, Round ${rec.round}: both sides signed and initialled the same version, with nothing outstanding.`);
    add(`Acceptance was communicated: ${NZ(rec.accepted_at)}. Confirmed by ${rec.confirmed_by || 'Tim McGuire'}.`);
    add(`The date at the top, "${rec.date_text}", was typed by Tim McGuire once the agreement was agreed. The date and this record page are the only things added after the last signature.`);
    if (rec.base) add(`Everything else is Round ${rec.base.round} as locked (SHA-256 ${rec.base.sha256}), drawn again from the same signatures, initials and changes with drawing version ${rec.draw_version || DRAW_VERSION}.`, { size: 8.5 });
    add(`This copy was made and locked by the server on ${NZ(rec.made_at)}.`, { size: 8.5 });
    add('Every locked round of this offer', { bold: true, gap: 8 });
    (rec.rounds || []).forEach(r => add(`Document ${r.document}, Round ${r.round} (number ${r.number}): signed by the ${sideName(r.side)}, ${r.changes ? r.changes + (r.changes === 1 ? ' change' : ' changes') : 'no changes'}, locked ${NZ(r.locked_at)}. SHA-256 ${r.sha256}`, { size: 8 }));
    return L;
  }

  /* ───── the PDF ───── */
  const INK = [0.05, 0.16, 0.45];
  function wrapText(font, text, size, w) { const out = []; let cur = ''; String(text).split(/\s+/).filter(Boolean).forEach(wd => { const t = cur ? cur + ' ' + wd : wd; if (font.widthOfTextAtSize(t, size) <= w || !cur) cur = t; else { out.push(cur); cur = wd; } }); if (cur) out.push(cur); return out.length ? out : ['']; }
  const pngBytes = dataUrl => { const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || '')); if (!m) return null;
    if (typeof atob === 'function') { const b = atob(m[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
    return new Uint8Array(Buffer.from(m[1], 'base64')); };
  // m: { ink (standing, with png), changes, lines (the record), title, date?: { text, place: { page, x, y } } }
  async function renderWorking(PDFLib, draftBytes, m) {
    const doc = await PDFLib.PDFDocument.load(draftBytes, { updateMetadata: false });
    const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica), bold = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold), ink = PDFLib.rgb(INK[0], INK[1], INK[2]);
    const pages = doc.getPages(), imgs = new Map();
    const img = async png => { if (!png) return null; if (!imgs.has(png)) { const b = pngBytes(png); imgs.set(png, b ? await doc.embedPng(b) : null); } return imgs.get(png); };
    for (const k of m.ink || []) {
      const pg = pages[k.page - 1]; if (!pg) continue;
      if (k.kind === 'name') { pg.drawText(ansi(k.name || k.who || ''), { x: k.x, y: k.y + 2, size: 9, font, color: ink }); continue; }
      const im = await img(k.png); if (!im) continue; const s = Math.min(k.w / im.width, k.h / im.height), w = im.width * s, h = im.height * s;
      pg.drawImage(im, { x: k.x + (k.w - w) / 2, y: k.y + (k.h - h) / 2, width: w, height: h });
    }
    for (const c of m.changes || []) {
      const pg = pages[c.page - 1]; if (!pg) continue; const g = c.geometry || {};
      if (c.kind === 'note') (g.strokes || []).forEach(st => { for (let i = 1; i < st.length; i++) pg.drawLine({ start: { x: st[i - 1][0], y: st[i - 1][1] }, end: { x: st[i][0], y: st[i][1] }, thickness: 1.1, color: ink }); });
      else if (c.kind === 'strike') pg.drawLine({ start: { x: g.x0, y: g.y }, end: { x: g.x1, y: g.y }, thickness: 1, color: ink });
      else if (c.kind === 'cross') { pg.drawRectangle({ x: g.x, y: g.y, width: g.w, height: g.h, borderColor: ink, borderWidth: 0.9 }); pg.drawLine({ start: { x: g.x, y: g.y }, end: { x: g.x + g.w, y: g.y + g.h }, thickness: 0.9, color: ink }); pg.drawLine({ start: { x: g.x, y: g.y + g.h }, end: { x: g.x + g.w, y: g.y }, thickness: 0.9, color: ink }); }
      else if (c.kind === 'reinstate') { pg.drawText('Reinstated', { x: g.x, y: g.y + 2, size: 7, font: bold, color: ink }); pg.drawCircle({ x: g.x - 3, y: g.y + 4.5, size: 1.6, color: ink }); }
      else if (c.kind === 'insert') pg.drawText(ansi(g.text), { x: g.x, y: g.y, size: g.size || 9, font, color: ink });
    }
    if (m.date && m.date.text) { const p = m.date.place, pg = p && pages[p.page - 1];
      if (!pg || typeof p.x !== 'number' || typeof p.y !== 'number') throw new Error('The agreement blank has no date place, so the date can\'t be added. Add it to the places on the blank first.');
      pg.drawText(ansi(m.date.text), { x: p.x, y: p.y, size: 10, font, color: ink }); }
    const W = 595.32, H = 841.92; let pg = doc.addPage([W, H]), y = H - 56;
    for (const l of m.lines || []) { const size = l.size || 9.5, f = l.bold ? bold : font; y -= (l.gap || 0);
      for (const t of wrapText(f, l.t, size, W - 96)) { if (y < 50) { pg = doc.addPage([W, H]); y = H - 56; } pg.drawText(t, { x: 48, y, size, font: f, color: PDFLib.rgb(0.1, 0.1, 0.1) }); y -= size * 1.35; } }
    if (m.title) doc.setTitle(ansi(m.title), { showInWindowTitleBar: false });
    const bytes = await doc.save({ useObjectStreams: false, addDefaultPage: false });
    return { bytes, pages: doc.getPageCount(), recordPages: doc.getPageCount() - pages.length };
  }

  // a locked round drawn again from the layers up to it and its stored execution record: the same bytes, if nothing has changed
  async function redrawRound(PDFLib, draftBytes, layers, execution) {
    const st = standing(layers); return renderWorking(PDFLib, draftBytes, { ink: st.ink, changes: st.changes, lines: roundLines(execution), title: execution.title });
  }

  /* ───── a new further term in a counteroffer ───── */
  // A further term a party adds in a counteroffer (typed words, starting with its number) takes the next number after the newest
  // draft's term_last (the highest number used or retired on the drafts), after any number an earlier counteroffer term took, and
  // never a retired one. terms: { last, retired: [n], style: 'dot0' (23.0, as the printed 22.0) or 'dot' (23., also a draft with no style) }, changes: every
  // change of the document so far (standing().changes). Returns { number, label } (label as DRAFT.termNo writes it).
  const TERM_HEAD = /^\s*(\d{1,3})(?:\.0|\.)\s/;
  function nextTermNo(terms, changes) {
    const t = terms || {}, retired = new Set((t.retired || []).map(Number).filter(n => n >= 1)), style = t.style === 'dot0' ? 'dot0' : 'dot';
    let top = Math.max(0, +t.last || 0, ...[...retired]);
    (changes || []).forEach(c => { if (c && c.kind === 'insert') { const m = TERM_HEAD.exec(String((c.geometry || {}).text || '')); if (m) top = Math.max(top, +m[1]); } });
    let n = top + 1; while (retired.has(n)) n++;
    return { number: n, label: style === 'dot' ? `${n}.` : `${n}.0` };
  }

  /* ───── the lawyers' pack ───── */
  const EVENT_WORDS = {
    submitted: 'The offer came in', corrected: 'Tim corrected the offer', status: 'The offer was marked', withdrawn: 'A side withdrew', drafted: 'Drafted', approved: 'Draft approved',
    sign_released: 'Ready to sign (Round 1)', sign_started: 'Signing started on Tim\'s device', sign_links_sent: 'Personal links sent', sign_code_ok: 'Code checked', sign_consent: 'Agreed to sign electronically',
    sign_receipt: 'Read and receipted', sign_finished: 'Finished signing', sign_complete: 'Everyone on that side signed', sign_marked: 'Marked the page', sign_reviewed: 'Tim re-approved a mark',
    sign_cancelled: 'Signing stopped', sign_replaced: 'Replaced by a newer draft', sign_change_asked: 'Asked Tim for a change', round_locked: 'Round locked', round_presented: 'Tim authorised presentation',
    round_change: 'A change was made', document_closed: 'Document closed for a fresh copy', agreement_formed: 'Agreement formed',
    party_request: 'Asked Tim to stop', offer_frozen: 'Tim froze the offer', offer_unfrozen: 'Tim unfroze the offer', request_carry_on: 'Tim let them carry on', offer_withdrawn_now: 'Withdrawn',
    deposit_holder_chosen: 'Deposit holder chosen' };
  const escH = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // a plain description of one event, never contact details (events never hold them)
  function eventWords(e) {
    const d = e.detail || {}, w = EVENT_WORDS[e.kind] || e.kind;
    if (e.kind === 'round_locked') return `${w}: Document ${d.document || 1}, Round ${d.round || 1}, signed by the ${sideName(d.side || 'purchaser')}${d.changes ? ', ' + d.changes + (d.changes === 1 ? ' change' : ' changes') : ''}. SHA-256 ${d.sha256 || ''}`;
    if (e.kind === 'round_presented') return `${w} of Round ${d.checked_round} to the ${sideName(d.side)} (${d.method === 'link' ? 'by personal link' : 'in person'}), after looking at it`;
    if (e.kind === 'round_change') return `${w} in Round ${d.round} by ${e.actor}: ${KIND_WORDS[d.kind] || d.kind} on page ${d.page}${d.text ? ' "' + d.text + '"' : ''}`;
    if (e.kind === 'status') return `${w} ${d.to}${d.note ? ': ' + d.note : ''}`;
    if (e.kind === 'withdrawn') return `The ${sideName(d.side)} withdrew, at ${NZ(d.at)}${d.note ? ': ' + d.note : ''}`;
    // freeze and withdrawal (Tim, 24 November 2026): who asked, why, and when and how Tim was told
    if (e.kind === 'party_request') return `${e.actor} (${d.side === 'vendor' ? 'a vendor' : 'a purchaser'}) asked Tim to ${d.kind === 'withdraw' ? 'withdraw' : 'stop for now'}, from their link on Round ${d.round}: ${d.reason || ''}`;
    if (e.kind === 'offer_frozen') return `${w}. Every signing stopped. Asked by ${d.asked_by || 'Tim'}: ${d.reason || ''}`;
    if (e.kind === 'offer_unfrozen') return `${w}. Signing can carry on: ${d.note || ''}`;
    if (e.kind === 'request_carry_on') return `${w}: ${d.note || ''}`;
    if (e.kind === 'offer_withdrawn_now') return `${w} with immediate effect, directed by ${d.person} for the ${sideName(d.side)}: ${d.reason || ''}. Tim was told ${NZ(d.told_at)}, ${({ in_person: 'in person', phone: 'by phone', email: 'by email', link_request: 'by their request from their link' })[d.told_how] || d.told_how}. Never presented or signed again`;
    if (e.kind === 'deposit_holder_chosen' && d.by_default) return `Deposit holder: the recommended one, used for the emails (not changed by Tim): ${d.holder === 'nzret' ? 'Public Trust O/A NZ Real Estate Trust' : "the vendors' lawyer's trust account"}`;
    if (e.kind === 'deposit_holder_chosen') return `${w}: ${d.holder === 'other' ? d.other : d.holder === 'nzret' ? 'Public Trust O/A NZ Real Estate Trust' : "the vendors' lawyer's trust account"}${d.holder !== d.recommended ? ' (not the recommended one' + (d.kiwisaver ? '; KiwiSaver is part of the deposit)' : ')') : ''}`;
    if (e.kind === 'document_closed') return `${w} (Document ${d.document}, ${d.rounds} rounds kept): ${d.reason || ''}`;
    if (e.kind === 'agreement_formed') return `${w}: dated ${d.date}, acceptance communicated ${NZ(d.accepted_at)}. SHA-256 ${d.sha256 || ''}`;
    if (e.kind === 'sign_receipt') return `${w}: ${d.guide === 'chattels' ? 'the chattels reminder' : SIGN.GUIDE_NAMES[d.guide] || d.guide}`;
    return w;
  }
  // the timeline as a page a lawyer can read: every event in order, each with its fingerprint and the one before it
  function timelineHtml(events, meta) {
    const ev = (events || []).filter(e => e.hash).slice().sort((a, b) => a.seq - b.seq), m = meta || {};
    // Tim's own sign-in (an email) shows as his name; buyers and vendors are named as they signed; never anyone's contact details
    const who = a => /@/.test(String(a || '')) ? 'Tim McGuire' : a;
    const rows = ev.map(e => `<tr><td>${e.seq}</td><td>${escH(NZ(e.at))}</td><td>${escH(who(e.actor))}</td><td>${escH(eventWords(e))}</td><td class="h">${escH(String(e.hash).slice(0, 16))}<br><span>after ${escH(String(e.prev_hash).slice(0, 16))}</span></td></tr>`).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Timeline: ${escH(m.address || 'offer')}</title><style>body{font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#1f1d1a;margin:24px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:5px;text-align:left;vertical-align:top}.h{font-family:monospace;font-size:11px}.h span{color:#777}</style></head><body>
<h1>Timeline of the offer</h1><p>${escH(m.address || '')}<br>Offer: ${escH(m.offer_ref || '')}<br>Made ${escH(NZ(m.made_at))} by McGuire Real Estate for the parties' lawyers.</p>
<p>Each event carries the fingerprint (SHA-256) of the one before it, so a missing or changed event shows. ${m.check ? escH(m.check.ok ? `Checked: ${m.check.events} events, each following on from the one before.` : 'The check found a problem: ' + (((m.check.problems || [])[0] || {}).why || '')) : ''}</p>
<h2>The locked copies in this pack</h2><ul>${(m.files || []).map(f => `<li>${escH(f.name)}: SHA-256 ${escH(f.sha256)}</li>`).join('')}</ul>
<h2>Every event</h2><table><thead><tr><th>#</th><th>When (New Zealand time)</th><th>Who</th><th>What</th><th>Fingerprint</th></tr></thead><tbody>${rows}</tbody></table>
<p>Contact details are never part of the timeline.</p></body></html>`;
  }
  // a zip file of the files as they are (stored, not compressed), so each locked round inside is byte for byte the locked copy
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) {
    const enc = s => new TextEncoder().encode(s), parts = [], central = []; let off = 0;
    const u16 = v => [v & 0xff, (v >>> 8) & 0xff], u32 = v => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
    (files || []).forEach(f => { const name = enc(f.name), data = f.bytes instanceof Uint8Array ? f.bytes : enc(String(f.bytes)), crc = crc32(data);
      const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
      parts.push(local, name, data);
      central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), name);
      off += local.length + name.length + data.length; });
    const cdLen = central.reduce((a, b) => a + b.length, 0), n = (files || []).length;
    const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(n), ...u16(n), ...u32(cdLen), ...u32(off), ...u16(0)]);
    const all = parts.concat(central, [end]), out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let p = 0; all.forEach(b => { out.set(b, p); p += b.length; }); return out;
  }

  const NEGO = { changeRect, atPlace, ROW_REACH, inkOf, standing, outstanding, formed, presentPlaces, changePlaces, initialsBeside, rectsOf, KIND_WORDS, fullDate, parseFullDate, roundLines, agreementLines,
    renderWorking, redrawRound, nextTermNo, timelineHtml, eventWords, zip, crc32, sideName, other, MONTHS, DRAW_VERSION, textWidth, initialsFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = NEGO; else root.NEGO = NEGO;
})(typeof window !== 'undefined' ? window : globalThis);

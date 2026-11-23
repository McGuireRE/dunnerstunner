/* Purchaser signing (offers phase 3). No page or database code here, so the tests can load it on its own (sign-core.test.js), the
   browser uses it on Tim's screen and the signer's, and the offer-sign edge function uses it to make the locked Round 1 PDF.

   What it does:
     makePlaces(input)        every place each purchaser signs or initials, made from the approved draft and the map, with no set-up:
                                - initials beside every box the draft filled or marked
                                - initials at the foot of every page, outside any box
                                - initials beside each further term
                                - signature (and name, where the draft didn't type it) from the map's signature block
                                - each acknowledgement, initial or signature place Tim kept on the map
                              The date at the top is never a place: it is added once the agreement is fully agreed (phase 4).
     markPlaces(...)          the initials every signer adds beside a mark (a note, a strike-through, a crossed-out box, a reinstatement)
     sha256Hex(text)          SHA-256 of a string (UTF-8), worked out here so the mock database and the tests need nothing else
     chainHash, verifyChain   the timeline's hash chain: each event carries the fingerprint of the one before it
     executionLines(rec)      the execution record's wording (never on the REINZ pages: it is a page added at the end)
     renderRound(PDFLib, ...) the Round 1 PDF: the approved draft untouched, with signatures, initials and marks added on top, and the
                              execution record appended

   Positions are PDF points from the bottom left of the page, as in draft-core.js. */
(function (root) {
  'use strict';

  /* ───── SHA-256 ───── */
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function utf8(s) { if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(s)); const b = unescape(encodeURIComponent(String(s))); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function sha256Bytes(bytes) {
    const l = bytes.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n); m.set(bytes); m[l] = 0x80;
    const bits = l * 8; for (let i = 0; i < 8; i++) m[n - 1 - i] = Math.floor(bits / Math.pow(2, 8 * i)) & 0xff;
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], W = new Array(64);
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = (m[o + i * 4] << 24) | (m[o + i * 4 + 1] << 16) | (m[o + i * 4 + 2] << 8) | m[o + i * 4 + 3];
      for (let i = 16; i < 64; i++) { const a = W[i - 15], b = W[i - 2]; const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3), s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10); W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0; }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[i] + W[i]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  const sha256Hex = s => sha256Bytes(typeof s === 'string' ? utf8(s) : s);

  /* ───── the timeline's hash chain ───── */
  // Every offer event (migration 020) belongs to a chain: the offer's own, or the property's for events about no one offer. Each
  // carries its number in the chain (seq), the fingerprint of the event before it (prev_hash; the first in a chain has 64 zeros),
  // the exact text that was fingerprinted (body: the chain, seq, time, actor, kind, offer, property and detail), and its own
  // fingerprint, hash = SHA-256 of prev_hash, a new line, and body. A missing, added, reordered or altered event breaks the chain.
  const ZERO = '0'.repeat(64);
  const chainHash = (prev, body) => sha256Hex(String(prev || ZERO) + '\n' + String(body));
  const canon = x => Array.isArray(x) ? '[' + x.map(canon).join(',') + ']' : x && typeof x === 'object' ? '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}' : JSON.stringify(x === undefined ? null : x);
  // the body the mock database writes (the real database writes jsonb_build_object(...)::text; both are JSON and read back the same)
  const chainBody = e => JSON.stringify({ chain: e.chain, seq: e.seq, at: e.at, actor: e.actor, kind: e.kind, offer: e.offer_id || null, property: e.property_id, detail: e.detail || {} });
  // rows: the events of one chain (any order). Events from before the chain began (no hash) are counted, not checked.
  function verifyChain(rows) {
    const list = (rows || []).filter(r => r && r.hash), before = (rows || []).length - list.length, problems = [];
    list.sort((a, b) => a.seq - b.seq);
    let prev = ZERO;
    list.forEach((r, i) => {
      const at = `event ${r.seq} (${r.kind})`;
      if (r.seq !== i + 1) problems.push({ seq: r.seq, why: `${at}: an event is missing before it` });
      if (r.prev_hash !== prev) problems.push({ seq: r.seq, why: `${at}: it doesn't follow on from the event before it` });
      if (chainHash(r.prev_hash, r.body) !== r.hash) problems.push({ seq: r.seq, why: `${at}: its fingerprint doesn't match what it says` });
      let b = null; try { b = JSON.parse(r.body); } catch (_) { b = null; }
      if (!b || b.seq !== r.seq || b.kind !== r.kind || b.actor !== r.actor || b.chain !== r.chain || canon(b.detail || {}) !== canon(r.detail || {}) || (b.offer || null) !== (r.offer_id || null)
        || Math.abs(Date.parse(b.at) - Date.parse(r.at)) > 1) problems.push({ seq: r.seq, why: `${at}: it has been changed since it was recorded` });
      prev = r.hash;
    });
    return { ok: !problems.length, events: list.length, before, last: list.length ? list[list.length - 1].hash : null, problems };
  }

  /* ───── signing places ───── */
  const IW = 26, IH = 13, GAP = 3, FOOT_Y = 5, MARGIN = 6;
  // where a map place sits on the page, as a rectangle (the same rule as DRAFT.rectOf)
  function rectOfMap(p) {
    const FS = 9;
    if (p.kind === 'area' || p.kind === 'never') return { x: p.x, y: p.y + FS - p.h, w: p.w, h: p.h };
    if (['text', 'date', 'yesno', 'strike', 'name', 'block'].includes(p.kind)) return { x: p.x, y: p.y - 2, w: p.w, h: p.h + 2 };
    return { x: p.x, y: p.y, w: p.w, h: p.h };
  }
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const union = rs => { const x = Math.min(...rs.map(r => r.x)), y = Math.min(...rs.map(r => r.y)); return { x, y, w: Math.max(...rs.map(r => r.x + r.w)) - x, h: Math.max(...rs.map(r => r.y + r.h)) - y }; };
  const r1 = v => Math.round(v * 10) / 10;
  // a row of n initial boxes near a rectangle, keeping clear of other places (never overlapped) and printed text (overlapped as little
  // as possible), inside the page and above the foot row
  function placeRow(n, target, page, obstacles, text, opts) {
    const o = opts || {}, gw = n * IW + (n - 1) * 2, W = page.w, H = page.h, minY = o.minY != null ? o.minY : FOOT_Y + IH + 6;
    const cands = [];
    const add = (x, y, pen) => { x = Math.max(MARGIN, Math.min(W - MARGIN - gw, x)); y = Math.max(minY, Math.min(H - MARGIN - IH, y)); cands.push({ x, y, pen }); };
    const midY = target.y + (target.h - IH) / 2;
    if (o.prefer) add(o.prefer.x, o.prefer.y, 0);
    add(target.x + target.w + GAP, midY, 1);
    add(target.x - GAP - gw, midY, 2);
    add(target.x + target.w - gw, target.y - IH - 2, 3);
    add(target.x + target.w - gw, target.y + target.h + 2, 4);
    for (let k = 1; k <= 8; k++) { add(target.x + target.w - gw, target.y - IH - 2 - k * (IH + 3), 4 + k); add(target.x + target.w + GAP, midY - k * (IH + 3), 5 + k); }
    let best = null;
    for (const c of cands) {
      const r = { x: c.x, y: c.y, w: gw, h: IH };
      const hit = obstacles.reduce((a, b) => a + overlap(r, { x: b.x + 0.5, y: b.y + 1, w: Math.max(0, b.w - 1), h: Math.max(0, b.h - 2) }), 0), txt = (text || []).reduce((a, b) => a + overlap(r, b), 0);
      const score = hit * 1000 + txt + c.pen * 4 + Math.abs(c.y - midY) * 0.05;
      if (!best || score < best.score) best = { r, score, hit };
    }
    return best;
  }
  const rowBoxes = (n, r) => Array.from({ length: n }, (_, i) => ({ x: r1(r.x + i * (IW + 2)), y: r1(r.y), w: IW, h: IH }));
  // the text items of a page (pdf.js, as DRAFT.readPages gives them) as rectangles
  const textRects = pg => (pg && pg.items ? pg.items : []).map(t => ({ x: t.x, y: t.y - 1.5, w: Math.max(t.w, 2), h: Math.max(t.h, 6) + 1 }));
  // the draft's filled or marked boxes, grouped: one group per place on the map (a struck line and the new words beside it are one
  // change), except each chattel struck out on the schedule, which is its own
  function filledGroups(placed) {
    const groups = new Map();
    (placed || []).forEach(it => {
      if (!it || !(it.boxes || []).length) return;
      if (it.id === 'further_terms' || /^name_purchaser_/.test(it.id)) return;   // terms are initialled one by one; names belong to the signature block
      const g = /^chattel_x_/.test(it.id) ? it.id : (it.place || it.id);
      (it.boxes || []).forEach(b => { const k = g + '@' + b.page; if (!groups.has(k)) groups.set(k, { ref: g, page: b.page, boxes: [], labels: [] }); const x = groups.get(k); x.boxes.push(b); if (!x.labels.includes(it.label)) x.labels.push(it.label); });
    });
    return [...groups.values()].map(g => Object.assign(g, { rect: union(g.boxes) }));
  }
  // input: { pages: [{ n, w, h, items? }], placed (the approved draft's placed items), mapPlaces (its map's places),
  //   signers: [{ position, name }] } -> { places: [{ id, signer, kind, why, ref, page, x, y, w, h, label, name? }], warnings, counts }
  function makePlaces(input) {
    const pages = (input.pages || []).slice().sort((a, b) => a.n - b.n), placed = input.placed || [], map = input.mapPlaces || [];
    const signers = (input.signers || []).slice().sort((a, b) => a.position - b.position), n = signers.length, out = [], warnings = [];
    const P = no => pages.find(p => p.n === no);
    const obstacles = {}; const ob = no => (obstacles[no] ||= []);
    // what the draft wrote is kept clear; for the further terms, the lines of each term (the blank line after each is for initials)
    placed.forEach(it => (it.id === 'further_terms' && (it.term_boxes || []).length ? it.term_boxes : (it.boxes || [])).forEach(b => ob(b.page).push({ x: b.x, y: b.y, w: b.w, h: b.h })));
    map.filter(p => ['signature', 'name', 'witness'].includes(p.kind)).forEach(p => ob(p.page).push(rectOfMap(p)));
    const text = no => textRects(P(no));
    const push = (signer, kind, why, ref, page, r, label, extra) => { const pl = Object.assign({ id: `${why}:${ref}:s${signer}`, signer, kind, why, ref, page, x: r1(r.x), y: r1(r.y), w: r1(r.w), h: r1(r.h), label }, extra || {}); out.push(pl); ob(page).push(pl); return pl; };
    if (!n) return { places: [], warnings: ['There are no purchasers to sign.'], counts: {} };
    const row = (why, ref, pageNo, target, label, opts) => { const pg = P(pageNo); if (!pg) { warnings.push(`${label}: page ${pageNo} isn't in the draft.`); return; }
      const best = placeRow(n, target, pg, ob(pageNo), text(pageNo), opts); if (best.hit > 0) warnings.push(`${label} (page ${pageNo}): the initials had to go close to another place. Check them on the page.`);
      rowBoxes(n, best.r).forEach((b, i) => push(signers[i].position, 'initial', why, ref, pageNo, b, label)); };
    // 1. every box the draft filled or marked
    filledGroups(placed).forEach(g => row('filled', g.ref, g.page, g.rect, 'Initial: ' + g.labels.join('; ')));
    // 2. each further term, in the space left after it
    const ft = placed.find(x => x.id === 'further_terms');
    if (ft) {
      const tb = ft.term_boxes || [];
      if (tb.length) {
        const byTerm = new Map(); tb.forEach(b => { if (!byTerm.has(b.number)) byTerm.set(b.number, []); byTerm.get(b.number).push(b); });
        [...byTerm.entries()].sort((a, b) => a[0] - b[0]).forEach(([num, bs]) => { const last = bs[bs.length - 1], title = (((ft.terms || []).find(t => t.number === num)) || {}).title || '';
          const gw = n * IW + (n - 1) * 2, pref = last.gap ? { x: last.gap.x + last.gap.w - gw, y: last.gap.y + (last.gap.h - IH) / 2 } : null;
          row('term', 't' + num, last.page, last, `Initial further term ${num}${title ? ' (' + title + ')' : ''}`, { prefer: pref }); });
      } else (ft.terms || []).forEach(t => { const b = (ft.boxes || [])[0]; if (b) row('term', 't' + t.number, b.page, { x: b.x, y: b.y + b.h - (t.number) * 14, w: b.w, h: 12 }, `Initial further term ${t.number}${t.title ? ' (' + t.title + ')' : ''}`); });
    }
    // 3. the signature block: each purchaser's signature, and their name where the draft didn't type it
    const num = id => +(String(id).match(/(\d+)$/) || [0, 0])[1];
    const sigs = map.filter(p => p.kind === 'signature' && p.key === 'sig_purchaser').sort((a, b) => num(a.id) - num(b.id));
    const names = map.filter(p => p.kind === 'name' && p.key === 'name_purchaser').sort((a, b) => num(a.id) - num(b.id));
    if (!sigs.length) warnings.push('The map has no purchaser signature places. Add them to the places on the blank first.');
    else {
      const dy = sigs.length > 1 ? sigs[0].y - sigs[1].y : 70, nameOff = names[0] ? sigs[0].y - names[0].y : 13, lastS = sigs[sigs.length - 1], lastN = names[names.length - 1];
      signers.forEach((s, i) => {
        let sp = sigs[i], np = names[i], added = false;
        if (!sp) { const y = lastS.y - dy * (i + 1 - sigs.length); if (y < 40) { warnings.push(`There's no room on the signature page for purchaser ${i + 1}. Add another signature page to the pack in the portal.`); return; }
          sp = { page: lastS.page, x: lastS.x, y, w: lastS.w, h: lastS.h }; np = lastN ? { page: lastN.page, x: lastN.x, y: y - nameOff, w: lastN.w, h: lastN.h } : { page: lastS.page, x: lastS.x, y: y - nameOff, w: lastS.w, h: 10 }; added = true; }
        push(s.position, 'signature', 'block', 'sig' + (i + 1), sp.page, { x: sp.x, y: sp.y, w: sp.w, h: sp.h }, `Signature of ${s.name}${added ? ' (added beneath the others)' : ''}`, added ? { added: true } : null);
        const typed = placed.some(x => x.id === 'name_purchaser_' + (i + 1) && (x.boxes || []).length);
        if (!typed && np) push(s.position, 'name', 'block', 'name' + (i + 1), np.page, { x: np.x, y: np.y - 2, w: Math.max(np.w, 120), h: 12 }, `Name of ${s.name}`, { name: s.name });
      });
    }
    // 4. acknowledgements, initials and signatures Tim kept on the map (not the date, not the vendors', not a witness): the first
    // purchaser exactly where Tim put each one; then the others beside it, or in rows below, wherever is clear
    const acks = map.filter(p => P(p.page) && (['ack', 'initial'].includes(p.kind) || (p.kind === 'signature' && !['sig_purchaser', 'sig_vendor'].includes(p.key))));
    const ackLabel = p => `${p.kind === 'ack' ? 'Acknowledge' : p.kind === 'signature' ? 'Sign' : 'Initial'}: ${p.label || 'page ' + p.page}${p.reason ? ' (' + p.reason + ')' : ''}`;
    const ackSize = p => { const b = rectOfMap(p); return { x: b.x, y: b.y, w: Math.max(b.w, IW), h: Math.max(b.h, IH) }; };
    const ackKind = p => p.kind === 'signature' ? 'signature' : 'initial';
    acks.forEach(p => push(signers[0].position, ackKind(p), 'ack', p.id, p.page, ackSize(p), ackLabel(p)));
    acks.forEach(p => { const base = ackSize(p), pg = P(p.page), perRow = Math.max(1, Math.floor((pg.w - MARGIN - base.x) / (base.w + 3)));
      signers.slice(1).forEach(s => { let spot = null;
        for (let k = 1; k < 80 && !spot; k++) { const r = { x: base.x + (k % perRow) * (base.w + 3), y: base.y - Math.floor(k / perRow) * (base.h + 3), w: base.w, h: base.h };
          if (r.y > FOOT_Y + IH + 4 && r.x + r.w <= pg.w - MARGIN && !ob(p.page).some(b => overlap(r, b) > 0.5)) spot = r; }
        if (!spot) { spot = base; warnings.push(`${p.label || 'A place'} (page ${p.page}): no clear space for every purchaser. Check it on the page.`); }
        push(s.position, ackKind(p), 'ack', p.id, p.page, spot, ackLabel(p)); }); });
    // 5. the foot of every page, outside any box (last, so it keeps clear of everything above)
    pages.forEach(pg => { const gw = n * IW + (n - 1) * 2, best = placeRow(n, { x: pg.w - MARGIN - gw, y: FOOT_Y, w: gw, h: IH }, pg, ob(pg.n), text(pg.n), { minY: FOOT_Y - 1, prefer: { x: pg.w - MARGIN - gw - 4, y: FOOT_Y } });
      rowBoxes(n, best.r).forEach((b, i) => push(signers[i].position, 'initial', 'foot', 'p' + pg.n, pg.n, b, `Initial the foot of page ${pg.n}`)); });
    const counts = {}; signers.forEach(s => { counts[s.position] = out.filter(p => p.signer === s.position).length; });
    return { places: out, warnings, counts };
  }
  // the places one signer must do
  const placesFor = (places, position) => (places || []).filter(p => p.signer === position);
  // initials for marks: every signer initials beside each mark Tim has re-approved
  function markPlaces(marks, signers, pages, existing) {
    const n = (signers || []).length, ps = (pages || []), out = [], obs = {};
    (existing || []).forEach(p => (obs[p.page] ||= []).push(p));
    (marks || []).forEach(m => { const pg = ps.find(p => p.n === m.page); if (!pg || !n) return; const target = markRect(m);
      const best = placeRow(n, target, pg, obs[m.page] ||= [], null);
      rowBoxes(n, best.r).forEach((b, i) => { const pl = { id: `mark:${m.id}:s${signers[i].position}`, signer: signers[i].position, kind: 'initial', why: 'mark', ref: m.id, page: m.page, x: b.x, y: b.y, w: b.w, h: b.h, label: `Initial the ${MARK_NAMES[m.kind] || 'mark'} on page ${m.page}` }; out.push(pl); obs[m.page].push(pl); }); });
    return out;
  }
  const MARK_NAMES = { note: 'note', strike: 'line through text', cross: 'crossed-out box', reinstate: 'reinstatement' };
  // a mark's rectangle: { note: { strokes: [[[x, y], ...], ...] }, strike: { x0, x1, y }, cross: { x, y, w, h }, reinstate: { x, y } }
  function markRect(m) {
    const g = m.geometry || {};
    if (m.kind === 'note') { const pts = (g.strokes || []).flat(); if (!pts.length) return { x: 0, y: 0, w: 1, h: 1 }; const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(4, Math.max(...xs) - Math.min(...xs)), h: Math.max(4, Math.max(...ys) - Math.min(...ys)) }; }
    if (m.kind === 'strike') return { x: Math.min(g.x0, g.x1), y: g.y - 4, w: Math.abs(g.x1 - g.x0), h: 8 };
    if (m.kind === 'cross') return { x: g.x, y: g.y, w: g.w, h: g.h };
    return { x: (g.x || 0) - 4, y: (g.y || 0) - 4, w: 50, h: 10 };
  }
  // a mark's shape, checked (the database checks the same): points inside the page, a sensible size
  function markOk(m, page) {
    if (!m || !page || !['note', 'strike', 'cross', 'reinstate'].includes(m.kind)) return false;
    const g = m.geometry || {}, inX = v => typeof v === 'number' && v >= 0 && v <= page.w, inY = v => typeof v === 'number' && v >= 0 && v <= page.h;
    if (m.kind === 'note') return Array.isArray(g.strokes) && g.strokes.length >= 1 && g.strokes.length <= 60 && g.strokes.every(s => Array.isArray(s) && s.length >= 2 && s.length <= 400 && s.every(p => Array.isArray(p) && inX(p[0]) && inY(p[1])));
    if (m.kind === 'strike') return inX(g.x0) && inX(g.x1) && inY(g.y) && Math.abs(g.x1 - g.x0) >= 6;
    if (m.kind === 'cross') return inX(g.x) && inY(g.y) && inX(g.x + g.w) && inY(g.y + g.h) && g.w >= 6 && g.h >= 6;
    return inX(g.x) && inY(g.y) && !!m.target;
  }

  /* ───── the execution record ───── */
  const NZ = (iso, withSeconds) => { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return '';
    const parts = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: withSeconds === false ? undefined : '2-digit', hour12: false }).formatToParts(d);
    const g = t => (parts.find(p => p.type === t) || {}).value || ''; return `${g('day')} ${g('month')} ${g('year')}, ${g('hour')}:${g('minute')}${withSeconds === false ? '' : ':' + g('second')} New Zealand time`; };
  const ID_TYPES = { nz_driver_licence: 'NZ driver licence', passport: 'Passport', nz_firearms_licence: 'NZ firearms licence', kiwi_access_card: 'Kiwi Access Card', other_photo_id: 'Other photo ID', known_to_tim: 'Known to Tim (no ID needed)' };
  const GUIDE_NAMES = { cca: 'Client and Customer Acknowledgement', sale_purchase: 'Real Estate Authority guide to sale and purchase agreements' };
  // only what the printed font can show (names with macrons are refused at drafting; this is a last safety net)
  const ansi = s => String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
  // rec: { address, offer_ref, round, draft: { number, sha256 }, places_sha256, made_at, signers: [{ name, method, verified_at, witnessed_by,
  //   id_sighted, consent_at, receipts: [{ guide, version, sha256, at, pages }], first_tap, last_tap, finished_at, places, ua, net, seen_sha256 }],
  //   marks: [{ kind, page, by, at, reviewed_at }], replaced: [{ number, at }] } -> lines [{ t, bold?, size?, gap? }]
  function executionLines(rec) {
    const L = [], add = (t, o) => L.push(Object.assign({ t: ansi(t) }, o || {}));
    add('Execution record', { bold: true, size: 15 });
    add('This page is added by McGuire Real Estate after the agreement. It is not part of the REINZ form, and nothing on the form has been changed.', { size: 8.5 });
    add(`Property: ${rec.address || ''}`, { gap: 6 }); add(`Offer: ${rec.offer_ref || ''} (Round ${rec.round || 1}, signed by the purchasers)`);
    add(`Approved draft ${rec.draft && rec.draft.number || ''}, fingerprint (SHA-256): ${(rec.draft && rec.draft.sha256) || ''}`, { size: 8 });
    add(`Signing places, fingerprint (SHA-256): ${rec.places_sha256 || ''}`, { size: 8 });
    add(`This copy was made and locked by the server on ${NZ(rec.made_at)}. Its own fingerprint is recorded by the server when it is locked, and it is never changed.`, { size: 8.5 });
    (rec.signers || []).forEach((s, i) => {
      add(`Purchaser ${i + 1}: ${s.name}`, { bold: true, gap: 8 });
      if (s.method === 'in_person') { add(`Signed in person on Tim McGuire's device. ${s.witnessed_by || 'Tim McGuire'} saw them sign.`); add(`Photo ID sighted: ${ID_TYPES[s.id_sighted] || s.id_sighted || 'not recorded'} (the type only; no ID number is kept).`); }
      else { add('Signed by a personal link sent only to them.'); add(`Email verified with a one-time code on ${NZ(s.verified_at)}.`); }
      add(`Agreed to sign electronically: ${NZ(s.consent_at)}.`);
      (s.receipts || []).forEach(r => add(`Received the ${GUIDE_NAMES[r.guide] || r.guide}${r.version ? ', version ' + r.version : ''}${r.pages && r.pages.length ? ' (page' + (r.pages.length > 1 ? 's ' : ' ') + r.pages.join(', ') + ' of this document)' : ''}: ${NZ(r.at)}.`, { size: 8.5 }));
      add(`Signed and initialled all ${s.places} places themselves: first ${NZ(s.first_tap)}, last ${NZ(s.last_tap)}. Finished: ${NZ(s.finished_at)}.`, { size: 8.5 });
      add(`Device: ${String(s.ua || 'not recorded').slice(0, 160)}`, { size: 7.5 });
      if (s.net) add(`Network (kept only as a fingerprint): ${String(s.net).slice(0, 16)}`, { size: 7.5 });
      add(`Fingerprint (SHA-256) of what they saw and signed: ${s.seen_sha256 || ''}`, { size: 7.5 });
    });
    if ((rec.marks || []).length) { add('Marks made while signing', { bold: true, gap: 8 }); rec.marks.forEach(m => add(`Page ${m.page}: ${MARK_NAMES[m.kind] || m.kind} by ${m.by}, ${NZ(m.at)}${m.reviewed_at ? '; checked and re-approved by Tim McGuire ' + NZ(m.reviewed_at) : ''}. Initialled by every purchaser.`, { size: 8.5 })); }
    if ((rec.replaced || []).length) { add('Earlier versions', { bold: true, gap: 8 }); rec.replaced.forEach(r => add(`Draft ${r.number} was replaced on ${NZ(r.at)} before signing was finished. Signatures given on it are kept but void.`, { size: 8.5 })); }
    add('Contact details are never printed here. "Email verified" means the code was sent to the purchaser\'s own email and typed back correctly.', { size: 7.5, gap: 8 });
    return L;
  }

  /* ───── the Round 1 PDF ───── */
  const INK = [0.05, 0.16, 0.45];
  const pngBytes = dataUrl => { const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || '')); if (!m) return null;
    if (typeof atob === 'function') { const b = atob(m[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
    return new Uint8Array(Buffer.from(m[1], 'base64')); };
  function wrapText(font, text, size, w) { const out = []; let cur = ''; String(text).split(/\s+/).filter(Boolean).forEach(wd => { const t = cur ? cur + ' ' + wd : wd; if (font.widthOfTextAtSize(t, size) <= w || !cur) cur = t; else { out.push(cur); cur = wd; } }); if (cur) out.push(cur); return out.length ? out : ['']; }
  // m: { places, taps: [{ place_id, signer }], signers: [{ position, name, sig_png, init_png }], marks: [{ id, kind, page, geometry, by }], record (for executionLines), title }
  async function renderRound(PDFLib, draftBytes, m) {
    const doc = await PDFLib.PDFDocument.load(draftBytes, { updateMetadata: false });
    const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica), bold = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold), ink = PDFLib.rgb(INK[0], INK[1], INK[2]);
    const pages = doc.getPages(), imgs = {};
    for (const s of m.signers || []) { const si = pngBytes(s.sig_png), ii = pngBytes(s.init_png); imgs[s.position] = { sig: si ? await doc.embedPng(si) : null, init: ii ? await doc.embedPng(ii) : null }; }
    const done = new Set((m.taps || []).map(t => t.place_id));
    const fit = (pg, img, r) => { if (!img) return; const s = Math.min(r.w / img.width, r.h / img.height); const w = img.width * s, h = img.height * s; pg.drawImage(img, { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, width: w, height: h }); };
    for (const p of m.places || []) {
      if (!done.has(p.id)) continue; const pg = pages[p.page - 1]; if (!pg) continue; const im = imgs[p.signer] || {};
      if (p.kind === 'signature') fit(pg, im.sig, p);
      else if (p.kind === 'name') pg.drawText(ansi(p.name || ''), { x: p.x, y: p.y + 2, size: 9, font, color: ink });
      else fit(pg, im.init, p);
    }
    for (const k of m.marks || []) {
      const pg = pages[k.page - 1]; if (!pg) continue; const g = k.geometry || {};
      if (k.kind === 'note') (g.strokes || []).forEach(st => { for (let i = 1; i < st.length; i++) pg.drawLine({ start: { x: st[i - 1][0], y: st[i - 1][1] }, end: { x: st[i][0], y: st[i][1] }, thickness: 1.1, color: ink }); });
      else if (k.kind === 'strike') pg.drawLine({ start: { x: g.x0, y: g.y }, end: { x: g.x1, y: g.y }, thickness: 1, color: ink });
      else if (k.kind === 'cross') { pg.drawRectangle({ x: g.x, y: g.y, width: g.w, height: g.h, borderColor: ink, borderWidth: 0.9 }); pg.drawLine({ start: { x: g.x, y: g.y }, end: { x: g.x + g.w, y: g.y + g.h }, thickness: 0.9, color: ink }); pg.drawLine({ start: { x: g.x, y: g.y + g.h }, end: { x: g.x + g.w, y: g.y }, thickness: 0.9, color: ink }); }
      else if (k.kind === 'reinstate') { pg.drawText('Reinstated', { x: g.x, y: g.y + 2, size: 7, font: bold, color: ink }); pg.drawCircle({ x: g.x - 3, y: g.y + 4.5, size: 1.6, color: ink }); }
    }
    // the execution record, on pages of its own at the end
    const W = 595.32, H = 841.92, lines = executionLines(m.record || {}); let pg = doc.addPage([W, H]), y = H - 56;
    for (const l of lines) { const size = l.size || 9.5, f = l.bold ? bold : font; y -= (l.gap || 0);
      for (const t of wrapText(f, l.t, size, W - 96)) { if (y < 50) { pg = doc.addPage([W, H]); y = H - 56; } pg.drawText(t, { x: 48, y, size, font: f, color: PDFLib.rgb(0.1, 0.1, 0.1) }); y -= size * 1.35; } }
    if (m.title) doc.setTitle(ansi(m.title), { showInWindowTitleBar: false });
    const bytes = await doc.save({ useObjectStreams: false, addDefaultPage: false });
    return { bytes, pages: doc.getPageCount(), recordPages: doc.getPageCount() - pages.length };
  }

  // the Client and Customer Acknowledgement in the pack: the pages whose text names it
  const ccaPages = pages => (pages || []).filter(p => (p.items || []).map(i => i.s).join(' ').replace(/\s+/g, ' ').match(/client and customer acknowledg/i)).map(p => p.n);

  const SIGN = { sha256Hex, sha256Bytes, ZERO, chainHash, chainBody, verifyChain, canon, makePlaces, placesFor, markPlaces, markRect, markOk, MARK_NAMES, filledGroups, rectOfMap, overlap,
    executionLines, renderRound, ID_TYPES, GUIDE_NAMES, ccaPages, NZ, IW, IH };
  if (typeof module !== 'undefined' && module.exports) module.exports = SIGN; else root.SIGN = SIGN;
})(typeof window !== 'undefined' ? window : globalThis);

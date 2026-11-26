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
  // Initials near a rectangle: never over another place, never over printed text, and within about NEAR points of the box they
  // belong to. Tried at full size first, then smaller, as a row, a column or two rows. { ok, boxes: [{ x, y, w, h }] (one per signer),
  // small } - when nothing fits, ok is false and the boxes are only a suggestion (Tim is told, and release waits).
  const SIZES = [[26, 13], [20, 10], [16, 8]], NEAR = 40;
  const inset = (b, dx, dy) => ({ x: b.x + dx, y: b.y + dy, w: Math.max(0, b.w - 2 * dx), h: Math.max(0, b.h - 2 * dy) });
  const apart = (a, b) => Math.hypot(Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)), Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h)));
  function layouts(n, iw, ih, rowsOnly) { const L = [[n, 1]]; if (n > 2) L.push([Math.ceil(n / 2), 2]); if (n > 1 && !rowsOnly) L.push([1, n]);
    return L.map(([c, rws]) => ({ c, rws, iw, ih, w: c * iw + (c - 1) * 2, h: rws * ih + (rws - 1) * 2 })); }
  const gridBoxes = (n, at, lay) => Array.from({ length: n }, (_, i) => { const col = i % lay.c, row = Math.floor(i / lay.c); return { x: r1(at.x + col * (lay.iw + 2)), y: r1(at.y + at.h - (row + 1) * lay.ih - row * 2), w: lay.iw, h: lay.ih }; });
  function placeRow(n, target, page, obstacles, text, opts) {
    const o = opts || {}, W = page.w, H = page.h, near = o.near != null ? o.near : NEAR, minY = o.minY != null ? o.minY : FOOT_Y + IH + 6, maxY = o.maxY != null ? o.maxY : H - MARGIN;
    const obs = (obstacles || []).map(b => inset(b, 0.5, 1)), txt = (text || []).map(b => inset(b, 0.3, 0.8)), t = target;
    let fallback = null;
    // first, anything on the box's own row (any size); only then above or below it
    for (const pass of o.foot ? ['all'] : ['row', 'near']) for (const [iw, ih] of SIZES) for (const lay of layouts(n, iw, ih, o.foot || pass === 'row')) {
      const cands = [], add = (x, y, pen) => { if (x < 4 || y < minY || x + lay.w > W - 4 || y + lay.h > maxY) return; cands.push({ x, y, pen }); };
      const midY = t.y + (t.h - lay.h) / 2;
      if (o.foot) { for (const y of [4, 7, 10, 13, 16]) for (let x = W - 6 - lay.w; x >= 4; x -= 4) add(x, y, (W - 6 - lay.w - x) / 8 + y); }
      else if (pass === 'row') {
        if (o.prefer) { const pf = o.prefer(lay); if (pf) add(pf.x, pf.y, -1); }
        // inside the box's own band (the blank part of the place on the blank, after a name, a price or a date), then either side
        for (let x = t.x + t.w - lay.w; x >= t.x; x -= 4) for (const yy of [midY, t.y + 1]) add(x, yy, 0.5 + (t.x + t.w - lay.w - x) / 40);
        for (let dx = 0; dx <= near; dx += 3) for (const dy of [0, -2, 2]) { add(t.x + t.w + 2 + dx, midY + dy, dx + Math.abs(dy)); add(t.x - 2 - lay.w - dx, midY + dy, dx + Math.abs(dy) + 1); }
      } else {
        for (let dx = 0; dx <= near; dx += 3) for (const dy of [-4, 4, -6, 6]) { add(t.x + t.w + 2 + dx, midY + dy, dx + Math.abs(dy)); add(t.x - 2 - lay.w - dx, midY + dy, dx + Math.abs(dy) + 1); }
        for (let dy = 0; dy <= near; dy += 2) for (let k = 0; k <= 8; k++) { const x = t.x + t.w - lay.w - (t.w - lay.w) * k / 8; add(x, t.y - 1 - lay.h - dy, dy + 2 + k / 2); add(x, t.y + t.h + 1 + dy, dy + 3 + k / 2); }
      }
      let best = null;
      for (const c of cands) { if (best && c.pen >= best.pen) continue; const r = { x: c.x, y: c.y, w: lay.w, h: lay.h };
        if (!o.foot && apart(r, t) > near) continue; if (obs.some(b => overlap(r, b) > 0)) continue;
        if (!fallback) fallback = { at: r, lay };
        if (txt.some(b => overlap(r, b) > 0)) continue; best = { at: r, pen: c.pen }; }
      if (best) return { ok: true, boxes: gridBoxes(n, best.at, lay), small: iw < SIZES[0][0], row: pass === 'row' };
    }
    const lay = layouts(n, IW, IH)[0], at = fallback || { at: { x: Math.max(4, Math.min(W - 4 - lay.w, t.x + t.w + 2)), y: Math.max(minY, t.y), w: lay.w, h: lay.h }, lay };
    return { ok: false, boxes: gridBoxes(n, at.at, at.lay) };
  }
  // the text items of a page (pdf.js, as DRAFT.readPages gives them) as rectangles
  const textRects = pg => (pg && pg.items ? pg.items : []).map(t => ({ x: t.x, y: t.y - 1.5, w: Math.max(t.w, 2), h: Math.max(t.h, 6) + 1 }));
  // the draft's filled or marked boxes, grouped: one group per place on the map (a struck line and the new words beside it are one
  // change), except each chattel struck out on the schedule, which is its own
  function filledGroups(placed) {
    const groups = new Map();
    (placed || []).forEach(it => {
      if (!it || !(it.boxes || []).length) return;
      if (it.id === 'further_terms' || /^name_purchaser_/.test(it.id)) return;   // terms are initialled one by one; names belong to the signature block
      // a box Tim drew for initials or a signature is a signing place for that side (makePlaces, step 4b), never a filled box
      if (it.kind === 'mark' && (it.mark === 'initials' || it.mark === 'signature')) return;
      const g = /^chattel_x_/.test(it.id) ? it.id : (it.place || it.id);
      (it.boxes || []).forEach(b => { const k = g + '@' + b.page; if (!groups.has(k)) groups.set(k, { ref: g, page: b.page, boxes: [], labels: [] }); const x = groups.get(k); x.boxes.push(b); if (!x.labels.includes(it.label)) x.labels.push(it.label); });
    });
    return [...groups.values()].map(g => Object.assign(g, { rect: union(g.boxes) }));
  }
  /* ───── the chattels box (Tim, 26 November 2026: it always has initials) ─────
     Whenever a side signs the whole agreement, each signer initials inside the chattels area of the blank's map (its 'chattels' place),
     side by side, clear of printed words and other places where there is room. The database checks the same (029). */
  const CHATTELS_MSG = 'The places on the blank have no chattels area, so nobody can initial the chattels. Add the chattels area to the places on the blank, then load it again.';
  function chattelsArea(mapPlaces) {
    const p = (mapPlaces || []).find(x => x && x.id === 'chattels' && [x.x, x.y, x.w, x.h, x.page].every(v => typeof v === 'number') && x.w > 0 && x.h > 0);
    if (!p) return null; const r = (p.kind === 'area' || p.kind === 'never') ? { x: p.x, y: p.y + 9 - p.h, w: p.w, h: p.h } : { x: p.x, y: p.y, w: p.w, h: p.h };
    return Object.assign({ page: p.page }, r);
  }
  const insideOf = (p, a) => !!a && p.page === a.page && p.x >= a.x - 1 && p.x + p.w <= a.x + a.w + 1 && p.y >= a.y - 1 && p.y + p.h <= a.y + a.h + 1;
  // the boxes for some signers inside the area: one row (or rows) of initials, the first spot clear of printed words and of what is already
  // there; failing that, clear of other places only (Tim is told, and can move them); failing that, null
  function chattelsBoxes(n, area, page, obstacles, text) {
    const obs = (obstacles || []).filter(b => !b.page || b.page === area.page).map(b => inset(b, 0.5, 1)), txt = (text || []).map(b => inset(b, 0.3, 0.8));
    for (const strict of [true, false]) for (const [iw, ih] of SIZES) for (const lay of layouts(n, iw, ih, true).concat(layouts(n, iw, ih, false))) {
      if (lay.w > area.w - 2 || lay.h > area.h - 2) continue;
      for (let y = area.y + 1; y + lay.h <= area.y + area.h - 1; y += 3) for (let x = area.x + area.w - 1 - lay.w; x >= area.x + 1; x -= 4) {
        const r = { x, y, w: lay.w, h: lay.h }; if (obs.some(b => overlap(r, b) > 0)) continue; if (strict && txt.some(b => overlap(r, b) > 0)) continue;
        return { boxes: gridBoxes(n, r, lay), clear: strict };
      }
    }
    return null;
  }
  // input: { pages: [{ n, w, h, items? }], placed (the approved draft's placed items), mapPlaces (its map's places),
  //   signers: [{ position, name }], side? ('vendor': the vendors' own signature block, no acknowledgements; phase 4), obstacles?
  //   ([{ page, x, y, w, h }]: ink already on the page, kept clear) } -> { places: [{ id, signer, kind, why, ref, page, x, y, w, h, label, name? }], warnings,
  //   blocking: [{ id, label, why }] (places that couldn't be put clear of printed text near their box: release waits), counts }
  function makePlaces(input) {
    const pages = (input.pages || []).slice().sort((a, b) => a.n - b.n), placed = input.placed || [], map = input.mapPlaces || [];
    const signers = (input.signers || []).slice().sort((a, b) => a.position - b.position), n = signers.length, out = [], warnings = [], blocking = [];
    // phase 4: the vendors sign the same way, at their own signature block; what is already on the page (the purchasers' ink) is kept clear
    const vendor = input.side === 'vendor', SK = vendor ? 'sig_vendor' : 'sig_purchaser', NK = vendor ? 'name_vendor' : 'name_purchaser', RS = vendor ? 'vsig' : 'sig', RN = vendor ? 'vname' : 'name';
    const block = (id, label, why) => { if (!blocking.some(b => b.id === id)) blocking.push({ id, label, why }); };
    const P = no => pages.find(p => p.n === no);
    const obstacles = {}; const ob = no => (obstacles[no] ||= []);
    (input.obstacles || []).forEach(b => { if (b && b.page) ob(b.page).push({ x: b.x, y: b.y, w: b.w, h: b.h }); });
    // what the draft wrote is kept clear; for the further terms, the lines of each term (the blank line after each is for initials)
    placed.forEach(it => (it.id === 'further_terms' && (it.term_boxes || []).length ? it.term_boxes : (it.boxes || [])).forEach(b => ob(b.page).push({ x: b.x, y: b.y, w: b.w, h: b.h })));
    map.filter(p => ['signature', 'name', 'witness'].includes(p.kind)).forEach(p => ob(p.page).push(rectOfMap(p)));
    const text = no => textRects(P(no));
    const push = (signer, kind, why, ref, page, r, label, extra) => { const pl = Object.assign({ id: `${why}:${ref}:s${signer}`, signer, kind, why, ref, page, x: r1(r.x), y: r1(r.y), w: r1(r.w), h: r1(r.h), label }, extra || {}); out.push(pl); ob(page).push(pl); return pl; };
    if (!n) return { places: [], warnings: [], blocking: [{ id: 'signers', label: 'Purchasers', why: 'There are no purchasers to sign.' }], counts: {} };
    const row = (why, ref, pageNo, target, label, opts) => { const pg = P(pageNo); if (!pg) { block(why + ':' + ref, label, `Page ${pageNo} isn't in the draft.`); return; }
      const res = placeRow(n, target, pg, ob(pageNo), text(pageNo), opts);
      if (!res.ok) block(why + ':' + ref, label, why === 'foot' ? `Page ${pageNo}: there is no clear space at the foot of the page for the initials.` : `Page ${pageNo}: there is no clear space within about ${NEAR} points of it for the initials without covering printed words.`);
      // each initial remembers the box it belongs to ('for'), so a later change at that box lifts it from the working copy (phase 4)
      const forBox = why === 'foot' ? null : { for: { x: r1(target.x), y: r1(target.y), w: r1(target.w), h: r1(target.h) } };
      res.boxes.forEach((b, i) => push(signers[i].position, 'initial', why, ref, pageNo, b, label, forBox)); };
    // 1. every box the draft filled or marked, beside its own row: a condition's Yes/No and its date are one row; each group's
    // target takes in the blank part of the place it filled, so the initials can sit after the words written there
    const groups = filledGroups(placed);
    groups.filter(g => /^d_/.test(g.ref)).forEach(g => { const c = groups.find(x => x.ref === 'c_' + g.ref.slice(2) && x.page === g.page);
      if (c) { c.boxes.push(...g.boxes); g.labels.forEach(l => { if (!c.labels.includes(l)) c.labels.push(l); }); c.rect = union(c.boxes); g.merged = true; } });
    groups.filter(g => !g.merged).forEach(g => { const mp = /^c_/.test(g.ref) ? map.find(x => x.id === 'd_' + g.ref.slice(2) && x.page === g.page) : map.find(x => x.id === g.ref && x.page === g.page);
      const tgt = mp && ['text', 'date', 'area', 'name'].includes(mp.kind) ? union([g.rect, rectOfMap(mp)]) : g.rect;
      row('filled', g.ref, g.page, tgt, 'Initial: ' + g.labels.join('; ')); });
    // 2. each further term, in the space left after it
    const ft = placed.find(x => x.id === 'further_terms');
    if (ft) {
      const tb = ft.term_boxes || [], tno = k => ft.number_style === 'dot0' ? `${k}.0` : `${k}`;   // as the draft numbers them (23.0 on Tim's packs)
      if (tb.length) {
        const byTerm = new Map(); tb.forEach(b => { if (!byTerm.has(b.number)) byTerm.set(b.number, []); byTerm.get(b.number).push(b); });
        [...byTerm.entries()].sort((a, b) => a[0] - b[0]).forEach(([num, bs]) => { const last = bs[bs.length - 1], title = (((ft.terms || []).find(t => t.number === num)) || {}).title || '';
          const pref = last.gap ? lay => (lay.h <= last.gap.h + 2.5 ? { x: last.gap.x + last.gap.w - lay.w, y: last.gap.y + (last.gap.h - lay.h) / 2 } : null) : null;
          row('term', 't' + num, last.page, last, `Initial further term ${tno(num)}${title ? ' (' + title + ')' : ''}`, { prefer: pref }); });
      } else (ft.terms || []).forEach(t => { const b = (ft.boxes || [])[0]; if (b) row('term', 't' + t.number, b.page, { x: b.x, y: b.y + b.h - (t.number) * 14, w: b.w, h: 12 }, `Initial further term ${tno(t.number)}${t.title ? ' (' + t.title + ')' : ''}`); });
    }
    // 3. the signature block: each purchaser's signature, and their name where the draft didn't type it
    const num = id => +(String(id).match(/(\d+)$/) || [0, 0])[1];
    const sigs = map.filter(p => p.kind === 'signature' && p.key === SK).sort((a, b) => num(a.id) - num(b.id));
    const names = map.filter(p => p.kind === 'name' && p.key === NK).sort((a, b) => num(a.id) - num(b.id));
    if (!sigs.length) block('sig', 'Signatures', `The map has no ${vendor ? 'vendor' : 'purchaser'} signature places. Add them to the places on the blank first.`);
    else {
      const dy = sigs.length > 1 ? sigs[0].y - sigs[1].y : 70, nameOff = names[0] ? sigs[0].y - names[0].y : 13, lastS = sigs[sigs.length - 1], lastN = names[names.length - 1];
      // a place added for a purchaser beyond the printed lines must sit clear of every printed word on that page
      const clear = (pg, r) => !textRects(P(pg)).some(b => overlap(r, inset(b, 0.3, 0.8)) > 0) && !ob(pg).some(b => overlap(r, inset(b, 0.5, 1)) > 0);
      signers.forEach((s, i) => {
        let sp = sigs[i], np = names[i], added = false;
        const typed = placed.some(x => x.id === NK + '_' + (i + 1) && (x.boxes || []).length) || !!(vendor && names[i] && names[i].printed);
        if (!sp) { const y = lastS.y - dy * (i + 1 - sigs.length);
          sp = { page: lastS.page, x: lastS.x, y, w: lastS.w, h: lastS.h }; np = lastN ? { page: lastN.page, x: lastN.x, y: y - nameOff, w: lastN.w, h: lastN.h } : { page: lastS.page, x: lastS.x, y: y - nameOff, w: lastS.w, h: 10 }; added = true;
          const nr = { x: np.x, y: np.y - 2, w: Math.max(np.w, 120), h: 12 };
          if (y < 40 || nr.y < 30 || !clear(sp.page, sp) || (!typed && !clear(np.page, nr))) { block('sig_room', 'Signatures', NO_ROOM); return; } }
        push(s.position, 'signature', 'block', RS + (i + 1), sp.page, { x: sp.x, y: sp.y, w: sp.w, h: sp.h }, `Signature of ${s.name}${added ? ' (added beneath the others)' : ''}`, added ? { added: true } : null);
        if (!typed && np) push(s.position, 'name', 'block', RN + (i + 1), np.page, { x: np.x, y: np.y - 2, w: Math.max(np.w, 120), h: 12 }, `Name of ${s.name}`, { name: s.name });
      });
    }
    // 4. acknowledgements, initials and signatures Tim kept on the map (not the date, not the vendors', not a witness): the first
    // purchaser exactly where Tim put each one; then the others beside it, or in rows below, wherever is clear
    const acks = vendor ? [] : map.filter(p => P(p.page) && (['ack', 'initial'].includes(p.kind) || (p.kind === 'signature' && !['sig_purchaser', 'sig_vendor'].includes(p.key))));
    const ackLabel = p => `${p.kind === 'ack' ? 'Acknowledge' : p.kind === 'signature' ? 'Sign' : 'Initial'}: ${p.label || 'page ' + p.page}${p.reason ? ' (' + p.reason + ')' : ''}`;
    const ackSize = p => { const b = rectOfMap(p); return { x: b.x, y: b.y, w: Math.max(b.w, IW), h: Math.max(b.h, IH) }; };
    const ackKind = p => p.kind === 'signature' ? 'signature' : 'initial';
    acks.forEach(p => push(signers[0].position, ackKind(p), 'ack', p.id, p.page, ackSize(p), ackLabel(p)));
    acks.forEach(p => { const base = ackSize(p), pg = P(p.page), spots = [];
      // beside it on either side, then above and below, nearest first
      for (let kx = -6; kx <= 6; kx++) for (let ky = -4; ky <= 4; ky++) if (kx || ky) spots.push({ x: base.x + kx * (base.w + 3), y: base.y + ky * (base.h + 3), w: base.w, h: base.h, d: Math.abs(kx) * base.w + Math.abs(ky) * base.h * 1.5 + (ky ? 4 : 0) });
      spots.sort((a, b) => a.d - b.d);
      signers.slice(1).forEach(s => { let spot = null;
        for (const r of spots) { if (r.x >= 4 && r.y > FOOT_Y + IH + 4 && r.x + r.w <= pg.w - 4 && r.y + r.h <= pg.h - 4 && apart(r, base) <= NEAR && !ob(p.page).some(b => overlap(r, b) > 0.5) && !text(p.page).some(b => overlap(r, inset(b, 0.3, 0.8)) > 0)) { spot = { x: r.x, y: r.y, w: r.w, h: r.h }; break; } }
        if (!spot) { spot = base; block('ack:' + p.id, ackLabel(p), `Page ${p.page}: there is no clear space within about ${NEAR} points of it for every purchaser without covering printed words.`); }
        push(s.position, ackKind(p), 'ack', p.id, p.page, spot, ackLabel(p)); }); });
    // 4b. boxes Tim drew on the review screen for initials or a signature (draft edits.marks; placed kind 'mark', with who: purchasers,
    // vendors or both): a signing place for each signer on that side, inside the box he drew (Tim, 24 November 2026). Strike-outs, typed
    // text, highlights and places he moved are filled boxes (step 1), which every signer initials.
    const SIDE_WHO = vendor ? 'vendors' : 'purchasers';
    placed.filter(it => it && it.kind === 'mark' && (it.mark === 'initials' || it.mark === 'signature') && (it.who === SIDE_WHO || it.who === 'both' || !it.who) && (it.boxes || []).length).forEach(it => {
      const b0 = it.boxes[0], pg = P(b0.page), lbl = `${it.mark === 'signature' ? 'Sign' : 'Initial'}: the place Tim marked on page ${b0.page}`;
      if (!pg) { block('ack:' + it.id, lbl, `Page ${b0.page} isn't in the draft.`); return; }
      // a box for both sides is shared: the purchasers take its first half (left, or top), the vendors the second, so neither side's
      // places ever sit on the other's ink
      const shared = it.who !== SIDE_WHO, wide = b0.w >= b0.h * 2;
      const b = !shared ? b0 : wide ? { page: b0.page, x: b0.x + (vendor ? b0.w / 2 : 0), y: b0.y, w: b0.w / 2, h: b0.h } : { page: b0.page, x: b0.x, y: b0.y + (vendor ? 0 : b0.h / 2), w: b0.w, h: b0.h / 2 };
      // the box shared by everyone on the side: side by side when it is wide enough, otherwise one above the other
      const across = b.w / n >= Math.min(b.h, 30) * 1.2 || b.h / n < 8, cw = across ? b.w / n : b.w, ch = across ? b.h : b.h / n;
      if (cw < 10 || ch < 6) block('ack:' + it.id, lbl, `Page ${b.page}: the box you marked is too small for ${n === 1 ? 'the signer' : 'every signer'}. Make it bigger on the review screen and re-draft.`);
      signers.forEach((sg, i) => push(sg.position, it.mark === 'signature' ? 'signature' : 'initial', 'ack', it.id, b.page,
        { x: across ? b.x + i * cw : b.x, y: across ? b.y : b.y + b.h - (i + 1) * ch, w: Math.max(1, cw - (across && n > 1 ? 1 : 0)), h: Math.max(1, ch - (!across && n > 1 ? 1 : 0)) }, lbl + (n > 1 ? ` (${sg.name || 'signer ' + sg.position})` : ''), { marked: true }));
      // ink already on the page (the other side's, from an earlier round) is never covered
      if ((input.obstacles || []).some(k => k && k.page === b.page && out.some(x => x.ref === it.id && x.page === k.page && overlap(x, k) > 0.5)))
        block('ack:' + it.id, lbl, `Page ${b.page}: the box you marked already holds the other side's initials or signature. Draw a separate box for ${vendor ? 'the vendors' : 'the purchasers'}.`); });
    // 4c. the chattels box: every signer initials inside it (an initial already there counts); a map with no chattels area is said plainly
    if (input.chattels !== false) {
      const area = chattelsArea(map), pg = area && P(area.page);
      if (!area || !pg) block('chattels', 'Chattels', CHATTELS_MSG);
      else { const need = signers.filter(s => !out.some(x => x.signer === s.position && x.kind === 'initial' && insideOf(x, area)));
        if (need.length) { const res = chattelsBoxes(need.length, area, pg, ob(area.page), text(area.page));
          if (!res) block('chattels', 'Chattels', `Page ${area.page}: there is no clear space inside the chattels box for every signer's initials.`);
          else { if (!res.clear) warnings.push(`Page ${area.page}: the initials in the chattels box touch printed words. Move them if you like.`);
            res.boxes.forEach((b, i) => push(need[i].position, 'initial', 'filled', 'chattels_box', area.page, b, 'Initial the chattels box', { chattels: true })); } } }
    }
    // 5. the foot of every page, outside any box (last, so it keeps clear of everything above)
    pages.forEach(pg => row('foot', 'p' + pg.n, pg.n, { x: pg.w - MARGIN, y: FOOT_Y, w: 1, h: IH }, `Initial the foot of page ${pg.n}`, { foot: true, minY: 2, maxY: 28 }));
    const counts = {}; signers.forEach(s => { counts[s.position] = out.filter(p => p.signer === s.position).length; });
    return { places: out, warnings, blocking, counts };
  }
  // the places one signer must do
  const placesFor = (places, position) => (places || []).filter(p => p.signer === position);
  // initials for marks: every signer initials beside each mark Tim has re-approved
  function markPlaces(marks, signers, pages, existing) {
    const n = (signers || []).length, ps = (pages || []), out = [], obs = {};
    (existing || []).forEach(p => (obs[p.page] ||= []).push(p));
    (marks || []).forEach(m => { if (isOwn(m)) return; const pg = ps.find(p => p.n === m.page); if (!pg || !n) return; const target = markRect(m);
      const res = placeRow(n, target, pg, obs[m.page] ||= [], null);
      res.boxes.forEach((b, i) => { const pl = { id: `mark:${m.id}:s${signers[i].position}`, signer: signers[i].position, kind: 'initial', why: 'mark', ref: m.id, page: m.page, x: b.x, y: b.y, w: b.w, h: b.h, label: `Initial the ${MARK_NAMES[m.kind] || 'mark'} on page ${m.page}` }; out.push(pl); obs[m.page].push(pl); }); });
    return out;
  }
  const NO_ROOM = 'No room on the signature page for every purchaser. Add a signature page in the portal, then load the blank again.';
  const MARK_NAMES = { note: 'note', strike: 'line through text', cross: 'crossed-out box', reinstate: 'reinstatement', insert: 'added text', own_initials: 'their own initials', own_name: 'their own name', own_signature: 'their own signature' };
  // a signer's own initials, name or signature (029): checked by Tim in Round 1 like every mark, but nobody else initials it, and from
  // Round 2 on it is not a change
  const OWN_KINDS = ['own_initials', 'own_name', 'own_signature'], isOwn = m => !!m && OWN_KINDS.includes(m.kind);
  // A line through text, snapped to the printed words it crosses (Offers fixes 2, Tim 25 November 2026: a strike that looks like an
  // underline is ambiguous). page: { items: [{ s, x, y (baseline), w, h }] } as DRAFT.readPages gives them; x0, x1, y: the drag, in page
  // points. The line of text is the one whose letters the drag passes through (nearest its middle); every word with a letter under the
  // drag is struck whole, from its first letter to its last. The line goes through the middle of the letters: mid x-height for
  // ordinary text, mid cap height for figures and capitals ("$1,000,000"). Returns { x0, x1, y, text } or null when no text is there.
  const HV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const chW = c => { const k = c.charCodeAt(0); return k >= 32 && k <= 126 ? HV[k - 32] : 556; };
  // opts.keepLoneSign: the rule before offers hotfix 1 (a printed "$" beside the figure kept), so lines made then still check out
  function snapStrike(page, x0, x1, y, opts) {
    const items = ((page && page.items) || []).filter(it => it && String(it.s || '').trim() && it.w > 0);
    const lo = Math.min(x0, x1) - 1, hi = Math.max(x0, x1) + 1, mid = it => it.y + (it.h || 9) * 0.35;
    // the items whose letters the drag passes through, then the nearest line of them
    const under = items.filter(it => { const h = it.h || 9; return y >= it.y - h * 0.3 && y <= it.y + h * 1.0 && it.x <= hi && it.x + it.w >= lo; });
    if (!under.length) return null;
    const best = under.reduce((b, it) => Math.abs(y - mid(it)) < Math.abs(y - mid(b)) ? it : b);
    const line = items.filter(it => Math.abs(it.y - best.y) <= Math.max(1.5, Math.min(it.h || 9, best.h || 9) * 0.3)).sort((a, b) => a.x - b.x);
    // every character of the line with where it falls (widths in proportion to Helvetica's, scaled to the item's measured width)
    const chars = [];
    line.forEach((it, j) => {
      if (j) { const pv = line[j - 1]; if (it.x - (pv.x + pv.w) > 0.8) chars.push({ c: ' ', x0: pv.x + pv.w, x1: it.x, it: null }); }
      const s = Array.from(String(it.s)), tot = s.reduce((a, c) => a + chW(c), 0) || 1; let at = it.x;
      s.forEach(c => { const w = it.w * chW(c) / tot; chars.push({ c, x0: at, x1: at + w, it }); at += w; });
    });
    // words: runs of letters; a word is struck whole if any of its letters' middles is under the drag
    const words = []; let cur = null;
    chars.forEach((ch, i) => { if (/\s/.test(ch.c)) { cur = null; return; } if (!cur) { cur = { a: i, b: i }; words.push(cur); } else cur.b = i; });
    const hit = words.filter(wd => { for (let i = wd.a; i <= wd.b; i++) { const m = (chars[i].x0 + chars[i].x1) / 2; if (m >= lo && m <= hi) return true; } return false; });
    // a printed currency sign on its own beside a filled-in figure ("$" then "$990,000") is the form's label, not words to strike
    // (offers hotfix 1, seen live: 'This strikes through: "$ $990,000"')
    const lone = wd => chars.slice(wd.a, wd.b + 1).map(ch => ch.c).join('') === '$';
    if (!(opts && opts.keepLoneSign)) { while (hit.length > 1 && lone(hit[0])) hit.shift(); while (hit.length > 1 && lone(hit[hit.length - 1])) hit.pop(); }
    if (!hit.length) return null;
    const a = hit[0].a, b = hit[hit.length - 1].b, text = chars.slice(a, b + 1).map(ch => ch.c).join('').replace(/\s+/g, ' ').trim();
    const hts = chars.slice(a, b + 1).filter(ch => ch.it).map(ch => ch.it), h = Math.max(...hts.map(it => it.h || 9)), base = Math.min(...hts.map(it => it.y));
    const share = /[a-z]/.test(text) ? 0.26 : 0.35, r1 = v => Math.round(v * 10) / 10;
    let sx0 = chars[a].x0, sx1 = chars[b].x1; if (sx1 - sx0 < 6) { const c = (sx0 + sx1) / 2; sx0 = c - 3; sx1 = c + 3; }   // the database's shortest line
    return { x0: r1(sx0), x1: r1(sx1), y: r1(base + h * share), text: text.slice(0, 300) };
  }
  // a mark's rectangle: { note: { strokes: [[[x, y], ...], ...] }, strike: { x0, x1, y }, cross: { x, y, w, h }, reinstate: { x, y } }
  function markRect(m) {
    const g = m.geometry || {};
    if (isOwn(m)) return { x: g.x, y: g.y, w: g.w, h: g.h };
    if (m.kind === 'insert') { const size = g.size || 9; let w = 0; for (const c of ansi(g.text || '')) w += chW(c); return { x: g.x, y: g.y - 2, w: Math.max(8, w * size / 1000), h: size + 4 }; }
    if (m.kind === 'note') { const pts = (g.strokes || []).flat(); if (!pts.length) return { x: 0, y: 0, w: 1, h: 1 }; const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(4, Math.max(...xs) - Math.min(...xs)), h: Math.max(4, Math.max(...ys) - Math.min(...ys)) }; }
    if (m.kind === 'strike') return { x: Math.min(g.x0, g.x1), y: g.y - 4, w: Math.abs(g.x1 - g.x0), h: 8 };
    if (m.kind === 'cross') return { x: g.x, y: g.y, w: g.w, h: g.h };
    return { x: (g.x || 0) - 4, y: (g.y || 0) - 4, w: 50, h: 10 };
  }
  // a mark's shape, checked (the database checks the same): points inside the page, a sensible size
  function markOk(m, page) {
    if (!m || !page || !['note', 'strike', 'cross', 'reinstate', 'insert'].concat(OWN_KINDS).includes(m.kind)) return false;
    const g = m.geometry || {}, inX = v => typeof v === 'number' && v >= 0 && v <= page.w, inY = v => typeof v === 'number' && v >= 0 && v <= page.h;
    if (isOwn(m)) return inX(g.x) && inY(g.y) && typeof g.w === 'number' && typeof g.h === 'number' && g.w >= 8 && g.h >= 4 && g.x + g.w <= page.w && g.y + g.h <= page.h && (m.kind !== 'own_name' || (typeof g.text === 'string' && g.size >= 6 && g.size <= 14));
    if (m.kind === 'insert') return inX(g.x) && inY(g.y) && typeof g.text === 'string' && g.text.trim().length >= 1 && g.text.length <= 300 && g.text === g.text.trim() && g.size >= 6 && g.size <= 14;
    if (m.kind === 'note') return Array.isArray(g.strokes) && g.strokes.length >= 1 && g.strokes.length <= 60 && g.strokes.every(s => Array.isArray(s) && s.length >= 2 && s.length <= 400 && s.every(p => Array.isArray(p) && inX(p[0]) && inY(p[1])));
    if (m.kind === 'strike') return inX(g.x0) && inX(g.x1) && inY(g.y) && Math.abs(g.x1 - g.x0) >= 6;
    if (m.kind === 'cross') return inX(g.x) && inY(g.y) && inX(g.x + g.w) && inY(g.y + g.h) && g.w >= 6 && g.h >= 6;
    return inX(g.x) && inY(g.y) && !!m.target;
  }

  /* ───── the execution record ───── */
  const NZ = (iso, withSeconds) => { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return '';
    const parts = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: withSeconds === false ? undefined : '2-digit', hour12: false }).formatToParts(d);
    const g = t => (parts.find(p => p.type === t) || {}).value || ''; return `${g('day')} ${g('month')} ${g('year')}, ${g('hour')}:${g('minute')}${withSeconds === false ? '' : ':' + g('second')} New Zealand time`; };
  const ID_TYPES = { nz_driver_licence: 'NZ driver licence', passport: 'Passport', nz_firearms_licence: 'NZ firearms licence', kiwi_access_card: 'Kiwi Access Card', other_photo_id: 'Other photo ID', known_to_tim: 'Known to Tim personally' };
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
      // 029 (Tim, 26 November 2026, 17:57): Tim may choose, after a warning, to finish without an ID check; the record says so plainly
      if (s.method === 'in_person' && s.no_id_check_at) add(`Signed in person on Tim McGuire's device. Signed in person without an identity check: Tim McGuire chose to finish without one after a warning, ${NZ(s.no_id_check_at)}.`);
      else if (s.method === 'in_person') { add(`Signed in person on Tim McGuire's device. ${s.witnessed_by || 'Tim McGuire'} saw them sign.`); add(s.id_sighted === 'known_to_tim' ? 'Identity: known to Tim McGuire personally (no photo ID was needed).' : !s.id_sighted ? 'Identity: no choice recorded (knowing them and an ID check are both optional).' : `Photo ID sighted: ${ID_TYPES[s.id_sighted] || s.id_sighted} (the type only; no ID number is kept).`);
        // 029 (Tim, 26 November 2026): on his device each signer's photo ID is logged, with his tick that he checked it and watched them sign
        if (s.id_checked_at) add(`Tim McGuire checked this person's photo ID (${ID_TYPES[s.id_sighted] || s.id_sighted}) and watched them sign: ${NZ(s.id_checked_at)}.`, { size: 8.5 }); }
      else { add('Signed by a personal link sent only to them.'); add(`Email verified with a one-time code on ${NZ(s.verified_at)}.`); }
      add(`Agreed to sign electronically: ${NZ(s.consent_at)}.`);
      (s.receipts || []).forEach(r => add(`Received the ${GUIDE_NAMES[r.guide] || r.guide}${r.version ? ', version ' + r.version : ''}${r.pages && r.pages.length ? ' (page' + (r.pages.length > 1 ? 's ' : ' ') + r.pages.join(', ') + ' of this document)' : ''}: ${NZ(r.at)}.`, { size: 8.5 }));
      add(`Signed and initialled all ${s.places} places themselves: first ${NZ(s.first_tap)}, last ${NZ(s.last_tap)}. Finished: ${NZ(s.finished_at)}.`, { size: 8.5 });
      add(`Device: ${String(s.ua || 'not recorded').slice(0, 160)}`, { size: 7.5 });
      if (s.net) add(`Network (kept only as a fingerprint): ${String(s.net).slice(0, 16)}`, { size: 7.5 });
      add(`Fingerprint (SHA-256) of what they saw and signed: ${s.seen_sha256 || ''}`, { size: 7.5 });
    });
    if ((rec.marks || []).length) { add('Marks made while signing', { bold: true, gap: 8 }); rec.marks.forEach(m => add(`Page ${m.page}: ${MARK_NAMES[m.kind] || m.kind}${m.kind === 'strike' && m.text ? ' striking "' + m.text + '"' : m.kind === 'insert' && m.text ? ' "' + m.text + '"' : ''} by ${m.by}, ${NZ(m.at)}${m.reviewed_at ? '; checked and re-approved by Tim McGuire ' + NZ(m.reviewed_at) : ''}.${isOwn(m) ? ' Their own mark, so no one else initials it.' : ' Initialled by every purchaser.'}`, { size: 8.5 })); }
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
  // typed words and a signer's own initials, name or signature (029), drawn the same on Round 1 and on every later round's working copy
  async function drawAdded(doc, pg, k, font, ink) {
    const g = k.geometry || {};
    if (k.kind === 'insert') return pg.drawText(ansi(g.text), { x: g.x, y: g.y, size: g.size || 9, font, color: ink });
    // a name never runs past its box: drawn smaller if it wouldn't fit at its size
    if (k.kind === 'own_name') { const t = ansi(g.text), w1 = font.widthOfTextAtSize(t, 1) || 1, z = Math.max(3, Math.min(g.size || 9, (g.w - 1) / w1)); return pg.drawText(t, { x: g.x, y: g.y + Math.max(0, (g.h - z) / 2) + 1, size: z, font, color: ink }); }
    const b = pngBytes(k.ink); if (!b) return; const im = await doc.embedPng(b), s = Math.min(g.w / im.width, g.h / im.height), w = im.width * s, h = im.height * s;
    pg.drawImage(im, { x: g.x + (g.w - w) / 2, y: g.y + (g.h - h) / 2, width: w, height: h });
  }
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
      else if (k.kind === 'insert' || isOwn(k)) await drawAdded(doc, pg, k, font, ink);
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
    executionLines, renderRound, snapStrike, ID_TYPES, NO_ROOM, NEAR, textRects, placeRow, GUIDE_NAMES, ccaPages, NZ, IW, IH,
    chattelsArea, chattelsBoxes, insideOf, CHATTELS_MSG, OWN_KINDS, isOwn, drawAdded };
  // also on the global object everywhere (a bundler may wrap this file as CommonJS: the offer-sign entry reads the globals; offers hotfix 2)
  if (typeof module !== 'undefined' && module.exports) module.exports = SIGN; root.SIGN = SIGN;
})(typeof window !== 'undefined' ? window : globalThis);

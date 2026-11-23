// Unit tests of the signing core (src/sign-core.js, offers phase 3), on a synthetic blank drafted with draft-core (the real form is
// never copied here). Covers: SHA-256 against Node's own; the signing places made from the approved draft and map with no set-up
// (initials at the foot of every page, beside every filled or marked box, beside each further term in the blank line after it; a
// signature for each of four purchasers, the fourth added beneath the three printed lines with a name place; each acknowledgement
// Tim kept, once per purchaser; never the date at the top; nothing off the page and no two places on top of each other); marks
// (their shape checks and the initials beside each); the hash chain (a missing, altered, reordered or forged event is found; a body
// written by PostgreSQL reads the same); and the Round 1 PDF (the draft's own content streams kept byte for byte, signatures and
// initials added, the execution record on pages of its own at the end, naming each signer and "email verified" but never an email
// address or phone number).
const path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const S = require(path.join(__dirname, '..', 'src', 'sign-core.js'));
const D = require(path.join(__dirname, '..', 'src', 'draft-core.js'));
const SB = require(path.join(__dirname, 'synthetic-blank.js'));
const PDFLib = require('/opt/npm-tools/node_modules/pdf-lib');
const errs = [], out = {};
const ok = (c, msg) => { if (!c) errs.push(msg); };
// a small PNG (a dark line on a clear background), as the signature pad makes
function png(w, h, seed) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let x = 0; x < w; x++) { const on = Math.abs(y - Math.round(h / 2 + Math.sin((x + seed) / 5) * h / 4)) < 2; const o = y * (w * 4 + 1) + 1 + x * 4; raw[o] = raw[o + 1] = raw[o + 2] = 26; raw[o + 3] = on ? 255 : 0; } }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6; ih[10] = ih[11] = ih[12] = 0;
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
(async () => {
  const pdfjs = await import('/opt/npm-tools/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
  const quiet = console.log; console.warn = () => { }; console.log = (...a) => { if (!/Warning/.test(String(a[0]))) quiet(...a); };

  // ── SHA-256 ──
  ['', 'abc', 'Kia ora, Mārama', 'x'.repeat(1000), '\n'.repeat(63), 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64)].forEach(t => ok(S.sha256Hex(t) === crypto.createHash('sha256').update(t, 'utf8').digest('hex'), 'sha256 of ' + JSON.stringify(t.slice(0, 20))));
  ok(S.sha256Bytes(new Uint8Array([1, 2, 3])) === crypto.createHash('sha256').update(Buffer.from([1, 2, 3])).digest('hex'), 'sha256 of bytes');

  // ── a draft for four purchasers on the synthetic blank ──
  const blank = await SB.make({ cca: true }), bpages = await D.readPages(pdfjs, blank), map = D.buildMap(bpages);
  ok(bpages.length === 11 && S.ccaPages(bpages).join() === '10', 'the Client and Customer Acknowledgement page found by its heading (page 10)');
  const terms = [
    { key: 'lawyer_approval', kind: 'printed', clause: '22.0', title: "Lawyer's approval", rule: { when: { condition: 'lawyer' }, strike_when_unused: true }, position: 12 },
    { key: 'electrical', kind: 'further_term', title: 'Electrical report', wording_from: 'electrical', rule: { when: { condition: 'electrical' } }, position: 20 },
    { key: 'chattels', kind: 'further_term', title: 'Chattels', rule: { when: { chattels: true }, where: 'schedule' }, position: 30 }];
  const people = [['Ana Maria', 'Testbuyer', 'ana.p@buyer.example', '022 777 6666'], ['Bo', 'Testbuyer', 'bo.p@buyer.example', '022 555 4444'], ['Cy', 'Testbuyer', 'cy.p@buyer.example', '022 333 2222'], ['Di', 'Testbuyer', 'di.p@buyer.example', '022 111 0000']];
  const details = { email: 'ana.own@buyer.example', phone: '021 999 8888', price: 655000, settlement: { kind: 'relative', days: 15 }, kiwisaver: false, nominee: false,
    conditions: [{ key: 'finance', days: 10 }, { key: 'builders', days: 10 }, { key: 'electrical', days: 10 }],
    purchasers: people.map(([first, last, email, phone]) => ({ first, last, email, phone })), lawyer: { firm: 'Synthetic Law', person: 'Pat Solicitor', email: 'pat@synthlaw.example', phone: '03 477 1234' },
    chattels_add: ['Outdoor table'], chattels_exclude: ['Heat pump'], gst_registered: null };
  const plan = D.planDraft({ details, map, terms, clauses: { electrical: 'Synthetic electrical wording from Tim.' }, edits: { extra_terms: ['Synthetic extra term one, long enough to wrap onto a second line of the further terms page for this test, with more filler words to be sure it does wrap.', 'Synthetic extra term two.'] }, today: '2026-11-24', province: 'otago' });
  ok(!plan.needs.some(n => n.blocking), 'four purchasers on three printed lines: nothing blocks the draft (signing adds the fourth)');
  const r = await D.renderDraft(PDFLib, blank, plan), dpages = await D.readPages(pdfjs, r.bytes), placed = D.placedFrom(plan, r);
  const ft = placed.find(x => x.id === 'further_terms');
  ok(ft && ft.term_boxes && ft.term_boxes.length === 3 && ft.term_boxes.every(b => b.gap && b.gap.y < b.y), 'each further term has its box and the blank line after it');
  ok(ft.term_boxes[1].h > ft.term_boxes[2].h, 'a term that wraps has a taller box');
  // Tim's map: the found places plus an acknowledgement the AI suggested and he kept, and an initial place of his own
  const mapPlaces = map.places.concat([{ id: 'ai9', key: 'ai_ack', kind: 'ack', page: 9, x: 470, y: 695, w: 60, h: 18, label: 'Acknowledge (page 9)', source: 'ai', reason: 'The buyer acknowledges the LIM' },
    { id: 'tim1', key: 'tim_initial', kind: 'initial', page: 9, x: 470, y: 675, w: 46, h: 18, label: 'Initials (page 9)', source: 'tim' }]);
  const signers = people.map(([f, l], i) => ({ position: i + 1, name: f + ' ' + l }));
  const pg = dpages.map(p => ({ n: p.n, w: p.w, h: p.h, items: p.items }));
  const M = S.makePlaces({ pages: pg, placed, mapPlaces, signers });
  out.warnings = M.warnings; out.counts = M.counts;
  ok(!M.warnings.some(w => /no room|isn't in the draft/.test(w)), 'no place left out');
  const of = k => M.places.filter(p => p.signer === k);
  // the foot of every page
  for (const s of signers) ok(dpages.every(p => of(s.position).some(x => x.why === 'foot' && x.page === p.n && x.y < 20)), `${s.name}: initials at the foot of every page`);
  // every filled or marked box
  const groups = S.filledGroups(placed); out.groups = groups.length;
  ok(groups.some(g => g.ref === 'nominee') && groups.some(g => g.ref === 'purchaser') && groups.some(g => g.ref === 'price') && groups.some(g => /^chattel_x_/.test(g.ref)) && groups.some(g => g.ref === 'clause22'), 'filled and marked boxes found (purchaser, price, nominee struck, a chattel struck, clause 22.0 struck)');
  for (const s of signers) ok(groups.every(g => of(s.position).some(x => x.why === 'filled' && x.ref === g.ref && x.page === g.page)), `${s.name}: initials beside every filled or marked box`);
  ok(!M.places.some(x => x.ref === 'date') && !placed.some(x => x.id === 'date'), 'the date at the top is never filled and never a place');
  const dateP = map.places.find(x => x.id === 'date'); ok(dateP && !M.places.some(x => x.page === dateP.page && S.overlap(x, S.rectOfMap(dateP)) > 0), 'nothing sits on the date');
  // each further term
  for (const s of signers) ok([1, 2, 3].every(n => of(s.position).some(x => x.why === 'term' && x.ref === 't' + n)), `${s.name}: initials beside each further term`);
  const t1 = M.places.find(x => x.id === 'term:t1:s1'), g1 = ft.term_boxes.find(b => b.number === 1).gap; ok(t1 && t1.page === g1.page && t1.y >= g1.y - 1 && t1.y + t1.h <= g1.y + g1.h + 3, "a term's initials go in the blank line after it");
  // the signature block
  const sigs = M.places.filter(x => x.kind === 'signature' && x.why === 'block'); ok(sigs.length === 4 && signers.every(s => sigs.filter(x => x.signer === s.position).length === 1), 'one signature place for each of the four purchasers');
  const s4 = sigs.find(x => x.signer === 4), s3 = sigs.find(x => x.signer === 3); ok(s4.added && s4.y < s3.y - 40 && s4.page === s3.page, "the fourth purchaser's signature added beneath the printed three");
  const names = M.places.filter(x => x.kind === 'name'); ok(names.length === 1 && names[0].signer === 4 && names[0].name === 'Di Testbuyer', 'a name place only where the draft did not type the name (the fourth)');
  // Tim's acknowledgement and initial places, once for each purchaser, side by side or below
  for (const s of signers) ok(of(s.position).filter(x => x.why === 'ack').length === 2, `${s.name}: the acknowledgement and initial places Tim kept`);
  // nothing off the page, nothing on top of another place
  ok(M.places.every(x => { const p = pg.find(q => q.n === x.page); return p && x.x >= 0 && x.y >= 0 && x.x + x.w <= p.w && x.y + x.h <= p.h; }), 'every place sits on its page');
  let clash = 0; for (let i = 0; i < M.places.length; i++) for (let j = i + 1; j < M.places.length; j++) if (M.places[i].page === M.places[j].page && S.overlap(M.places[i], M.places[j]) > 1) { clash++; out.clash = [M.places[i], M.places[j]]; }
  ok(clash === 0, 'no two places on top of each other (' + clash + ')');
  ok(new Set(M.places.map(x => x.id)).size === M.places.length, 'every place has its own id');
  ok(signers.every(s => M.counts[s.position] >= dpages.length + groups.length + 3 + 1 + 2), 'each purchaser has every place to do');
  out.places = M.places.length;
  // one purchaser
  const one = S.makePlaces({ pages: pg, placed, mapPlaces, signers: [signers[0]] }); ok(one.places.every(x => x.signer === 1) && !one.places.some(x => x.kind === 'name'), 'one purchaser: their own places only, the name already typed');

  // ── marks ──
  const page1 = pg[0];
  ok(S.markOk({ kind: 'strike', geometry: { x0: 40, x1: 200, y: 600 } }, page1) && !S.markOk({ kind: 'strike', geometry: { x0: 40, x1: 42, y: 600 } }, page1), 'a strike needs some length');
  ok(S.markOk({ kind: 'cross', geometry: { x: 40, y: 500, w: 100, h: 40 } }, page1) && !S.markOk({ kind: 'cross', geometry: { x: 560, y: 500, w: 100, h: 40 } }, page1), 'a crossed box must sit on the page');
  ok(S.markOk({ kind: 'note', geometry: { strokes: [[[10, 10], [20, 20]]] } }, page1) && !S.markOk({ kind: 'note', geometry: { strokes: [] } }, page1), 'a note needs a stroke');
  ok(S.markOk({ kind: 'reinstate', target: 'm1', geometry: { x: 40, y: 600 } }, page1) && !S.markOk({ kind: 'reinstate', geometry: { x: 40, y: 600 } }, page1) && !S.markOk({ kind: 'paint', geometry: {} }, page1), 'a reinstatement names what it restores; nothing else is a mark');
  const marks = [{ id: 'm1', kind: 'strike', page: 1, geometry: { x0: 40, x1: 200, y: 450 } }, { id: 'm2', kind: 'reinstate', page: 1, target: 'm1', geometry: { x: 40, y: 455 } }];
  const MP = S.markPlaces(marks, signers, pg, M.places); ok(MP.length === 8 && signers.every(s => MP.filter(x => x.signer === s.position).length === 2) && MP.every(x => x.why === 'mark'), 'every purchaser initials each mark, the reinstatement too');
  ok(MP.every(a => !M.places.some(b => b.page === a.page && S.overlap(a, b) > 1)), 'mark initials keep clear of the other places');

  // ── the hash chain ──
  const mk = (n) => { const rows = []; let prev = S.ZERO; for (let i = 1; i <= n; i++) { const e = { chain: 'o1', seq: i, at: new Date(Date.UTC(2026, 10, 23, 9, 0, i)).toISOString(), actor: 'agent@example.test', kind: ['drafted', 'draft_approved', 'sign_released', 'sign_tap', 'round_locked'][i % 5], offer_id: 'o1', property_id: 'p1', detail: { n: i, price: 655000.5, note: 'Kia ora Mārama' } };
    e.body = S.chainBody(e); e.prev_hash = prev; e.hash = S.chainHash(prev, e.body); prev = e.hash; rows.push(e); } return rows; };
  let ch = mk(6), v = S.verifyChain(ch); ok(v.ok && v.events === 6 && v.last === ch[5].hash, 'an unbroken chain checks out');
  ok(S.verifyChain(mk(6).reverse()).ok, 'order of reading does not matter');
  ch = mk(6); ch.splice(2, 1); v = S.verifyChain(ch); ok(!v.ok && v.problems.some(p => /missing/.test(p.why)), 'a missing event is found');
  ch = mk(6); ch[3].detail = Object.assign({}, ch[3].detail, { price: 1 }); v = S.verifyChain(ch); ok(!v.ok && v.problems.some(p => p.seq === 4 && /changed/.test(p.why)), 'an altered event is found');
  ch = mk(6); ch[3].body = ch[3].body.replace('655000.5', '1'); v = S.verifyChain(ch); ok(!v.ok && v.problems.some(p => /fingerprint/.test(p.why)), 'an altered fingerprinted body is found');
  ch = mk(6); const forged = Object.assign({}, ch[4], { seq: 5, kind: 'round_locked', detail: { forged: true } }); forged.body = S.chainBody(forged); forged.hash = S.chainHash(forged.prev_hash, forged.body); ch[4] = forged; v = S.verifyChain(ch);
  ok(!v.ok && v.problems.some(p => p.seq === 6 && /follow on/.test(p.why)), 'a replaced event breaks the link to the next one');
  ok(S.verifyChain([{ kind: 'link_made' }, ...mk(2)]).before === 1, 'events from before the chain began are counted, not checked');
  // a body as PostgreSQL writes it (jsonb text: spaces after colons and commas, its own key order) reads the same
  const pgBody = '{"at": "2026-11-23T09:00:01.000000Z", "seq": 1, "kind": "drafted", "chain": "o1", "actor": "agent@example.test", "offer": "o1", "detail": {"n": 1, "note": "Kia ora", "price": 655000.50}, "property": "p1"}';
  const pr = { chain: 'o1', seq: 1, at: '2026-11-23T09:00:01+00:00', actor: 'agent@example.test', kind: 'drafted', offer_id: 'o1', property_id: 'p1', detail: { n: 1, note: 'Kia ora', price: 655000.5 }, body: pgBody, prev_hash: S.ZERO };
  pr.hash = S.chainHash(S.ZERO, pgBody); ok(S.verifyChain([pr]).ok, 'a chain written by PostgreSQL checks out');
  // two events as migration 020 wrote them on a local PostgreSQL 16 (tests/files/chain-from-postgres.json): the browser's check agrees
  const fromPg = require(path.join(__dirname, 'files', 'chain-from-postgres.json')); ok(S.verifyChain(fromPg).ok && S.verifyChain(fromPg).events === 2, 'a chain made by PostgreSQL checks out in the browser');
  const pgBad = JSON.parse(JSON.stringify(fromPg)); pgBad[0].detail.price = 1; ok(!S.verifyChain(pgBad).ok, 'and a change to it is found');
  // the same hash PostgreSQL makes (sha256 of prev, a new line and the body, as hex): see offer-sign-rollback.sql, which prints it
  ok(S.chainHash(S.ZERO, 'x') === crypto.createHash('sha256').update(S.ZERO + '\nx').digest('hex'), 'the chain hash is SHA-256 of the previous hash, a new line and the body');

  // ── the Round 1 PDF ──
  const sig = signers.map((s, i) => Object.assign({}, s, { sig_png: png(240, 60, i * 7), init_png: png(80, 40, i * 3) }));
  const all = M.places.concat(MP);
  const rec = { address: '1 Example Road, Testville', offer_ref: 'Ana Maria Testbuyer, Bo Testbuyer, Cy Testbuyer, Di Testbuyer', round: 1, draft: { number: 2, sha256: 'a'.repeat(64) }, places_sha256: 'b'.repeat(64), made_at: '2026-11-23T10:00:00Z',
    signers: sig.map((s, i) => ({ name: s.name, method: i < 2 ? 'in_person' : 'link', witnessed_by: 'Tim McGuire', id_sighted: 'passport', verified_at: '2026-11-23T09:30:00Z', consent_at: '2026-11-23T09:31:00Z',
      receipts: [{ guide: 'cca', pages: [10], at: '2026-11-23T09:32:00Z' }, { guide: 'sale_purchase', version: 'August 2022', sha256: 'c'.repeat(64), at: '2026-11-23T09:33:00Z' }], first_tap: '2026-11-23T09:35:00Z', last_tap: '2026-11-23T09:45:00Z', finished_at: '2026-11-23T09:46:00Z', places: all.filter(p => p.signer === s.position).length, ua: 'Mozilla/5.0 (test)', net: 'f'.repeat(64), seen_sha256: 'd'.repeat(64) })),
    marks: [{ kind: 'strike', page: 1, by: 'Ana Maria Testbuyer', at: '2026-11-23T09:40:00Z', reviewed_at: '2026-11-23T09:41:00Z' }], replaced: [{ number: 1, at: '2026-11-23T08:00:00Z' }] };
  const lines = S.executionLines(rec), txt = lines.map(l => l.t).join('\n');
  ok(/Purchaser 4: Di Testbuyer/.test(txt) && /Email verified with a one-time code/.test(txt) && /saw them sign/.test(txt) && /Photo ID sighted: Passport/.test(txt), 'the record names each signer, how they signed, the email check or ID sighted');
  ok(/Fingerprint \(SHA-256\) of what they saw and signed: d{64}/.test(txt) && /Approved draft 2, fingerprint \(SHA-256\): a{64}/.test(txt), 'and the fingerprints');
  ok(!/@|022 |021 |03 477/.test(txt), 'no email address or phone number in the record');
  const rr = await S.renderRound(PDFLib, r.bytes, { places: all, taps: all.map(p => ({ place_id: p.id, signer: p.signer })), signers: sig, marks: marks.map(m => Object.assign({ by: 'Ana Maria Testbuyer' }, m)), record: rec, title: 'Round 1' });
  const rp = await D.readPages(pdfjs, rr.bytes); out.roundPages = rp.length;
  ok(rp.length === dpages.length + rr.recordPages && rr.recordPages >= 1, 'the execution record is on pages of its own at the end');
  const recText = rp.slice(dpages.length).map(p => p.items.map(i => i.s).join(' ')).join(' ');
  ok(/Execution record/.test(recText) && /Di Testbuyer/.test(recText) && !rp.slice(0, dpages.length).some(p => p.items.some(i => /Execution record/.test(i.s))), 'never on the REINZ pages');
  ok(!/@/.test(rp.map(p => p.items.map(i => i.s).join(' ')).join(' ').replace(/pat@synthlaw\.example|vera@vendorlaw\.example/g, '')), "no email address anywhere but the lawyers'");
  const raw = async bytes => { const d = await PDFLib.PDFDocument.load(bytes); return d.getPages().map(p => { const c = p.node.Contents(); const refs = c instanceof PDFLib.PDFArray ? c.asArray() : [c];
    return refs.map(ref => { const s = d.context.lookup(ref); return Buffer.from(s.getContents ? s.getContents() : s.contents).toString('base64'); }); }); };
  const before = await raw(r.bytes), after = await raw(rr.bytes);
  ok(before.every((streams, i) => { const a = after[i]; let j = 0; for (const s of streams) { j = a.indexOf(s, j); if (j < 0) return false; j++; } return true; }), "the approved draft's content kept byte for byte; signatures, initials and marks only added on top");
  const rd = await PDFLib.PDFDocument.load(rr.bytes); let imgs = 0; rd.getPages().slice(0, dpages.length).forEach(p => { const xo = p.node.Resources().lookup(PDFLib.PDFName.of('XObject')); if (xo) imgs += xo.keys().length; });
  ok(imgs >= M.places.filter(x => x.kind !== 'name').length / 10, 'signatures and initials drawn as images on the pages');
  ok(rp[s4.page - 1].items.some(i => i.s === 'Di Testbuyer'), "the fourth purchaser's name written beside their added signature");
  const untapped = await S.renderRound(PDFLib, r.bytes, { places: all, taps: [], signers: sig, marks: [], record: rec });
  ok(untapped.bytes.length < rr.bytes.length, 'nothing is drawn for a place not done');

  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => { console.log(JSON.stringify({ errs: ['crashed: ' + (e.stack || e.message)] })); });

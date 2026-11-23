// Unit tests of the negotiation core (src/nego-core.js, offers phase 4), on a synthetic blank drafted with draft-core (the real form
// is never copied here). Covers: lifting the other side's initials at the place of a change (the purchasers' initials beside a price
// the vendors strike through and write again are lifted; their foot initials elsewhere, and the vendors' own, are not); a newer
// signature replacing a side's older one; every earlier round still holding what it held; the "nothing outstanding" check (a counter
// leaves the other side's initials outstanding beside each change; an acceptance that initials every change and signs leaves nothing;
// a lifted signature is outstanding again); the places for the side a round goes to (a side's first round initials the foot of every
// page, every filled box and signs at its own block; a later round signs again and initials every change not yet initialled, as the
// database insists); the full date ("24 November 2026") both ways; a locked round's PDF (the draft's content kept byte for byte, the
// standing ink and changes on top, the record on pages of its own at the end, no contact details); the agreed copy with the date at
// the top; the timeline page; and the lawyers' pack zip (checked by unzip, each file byte for byte).
const path = require('path'), zlib = require('zlib'), crypto = require('crypto'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');
const S = require(path.join(__dirname, '..', 'src', 'sign-core.js'));
const N = require(path.join(__dirname, '..', 'src', 'nego-core.js'));
const D = require(path.join(__dirname, '..', 'src', 'draft-core.js'));
const SB = require(path.join(__dirname, 'synthetic-blank.js'));
const PDFLib = require('/opt/npm-tools/node_modules/pdf-lib');
const errs = [], out = {};
const ok = (c, msg) => { if (!c) errs.push(msg); };
function png(w, h, seed) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let x = 0; x < w; x++) { const on = Math.abs(y - Math.round(h / 2 + Math.sin((x + seed) / 5) * h / 4)) < 2; const o = y * (w * 4 + 1) + 1 + x * 4; raw[o] = raw[o + 1] = raw[o + 2] = 26; raw[o + 3] = on ? 255 : 0; } }
  const crc = b => N.crc32(b);
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
(async () => {
  const pdfjs = await import('/opt/npm-tools/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
  const quiet = console.log; console.warn = () => { }; console.log = (...a) => { if (!/Warning/.test(String(a[0]))) quiet(...a); };
  ok(N.crc32(new TextEncoder().encode('123456789')) === 0xcbf43926, 'CRC-32 of the check string');

  // ── a draft for two purchasers on the synthetic blank, and Round 1 as phase 3 makes it ──
  const blank = await SB.make({ cca: true }), bpages = await D.readPages(pdfjs, blank), map = D.buildMap(bpages);
  const details = { email: 'ana.own@buyer.example', phone: '021 999 8888', price: 655000, settlement: { kind: 'relative', days: 15 }, kiwisaver: false, nominee: false, conditions: [{ key: 'finance', days: 10 }],
    purchasers: [{ first: 'Ana', last: 'Testbuyer', email: 'ana.p@buyer.example', phone: '022 777 6666' }, { first: 'Bo', last: 'Testbuyer', email: 'bo.p@buyer.example', phone: '022 555 4444' }],
    lawyer: { firm: 'Synthetic Law', person: 'Pat Solicitor', email: 'pat@synthlaw.example', phone: '03 477 1234' }, chattels_add: [], chattels_exclude: [] };
  const plan = D.planDraft({ details, map, terms: [], clauses: {}, edits: {}, today: '2026-11-24', province: 'otago' });
  const r = await D.renderDraft(PDFLib, blank, plan), dpages = await D.readPages(pdfjs, r.bytes), placed = D.placedFrom(plan, r);
  const pages = dpages.map(p => ({ n: p.n, w: p.w, h: p.h, items: p.items })), P = [{ position: 1, name: 'Ana Testbuyer' }, { position: 2, name: 'Bo Testbuyer' }], V = [{ position: 1, name: 'Testy Vendorperson' }, { position: 2, name: 'Otherly Vendorperson' }];
  const M1 = S.makePlaces({ pages, placed, mapPlaces: map.places, signers: P });
  const imgs = { p1: png(120, 40, 1), p2: png(120, 40, 2), v1: png(120, 40, 3), v2: png(120, 40, 4) };
  const L1 = { doc_round: 1, number: 1, side: 'purchaser', signing_id: 'g1', places: M1.places, taps: M1.places.map(p => ({ place_id: p.id, signer: p.signer })), marks: [],
    signers: P.map(s => ({ position: s.position, name: s.name, sig_png: imgs['p' + s.position], init_png: imgs['p' + s.position] })) };
  const priceIni = M1.places.filter(p => p.ref === 'price'); ok(priceIni.length === 2, 'Round 1: both purchasers initial the price');
  const priceBox = placed.find(x => x.id === 'price').boxes[0];

  // ── Round 2 goes to the vendors: their first round ──
  const pr2 = N.presentPlaces({ pages, placed, mapPlaces: map.places, side: 'vendor', signers: V, layers: [L1] });
  out.vendorCounts = pr2.counts; ok(pr2.first && !pr2.blocking.length, 'the vendors\' first round: nothing blocks');
  for (const v of V) {
    const mine = pr2.places.filter(p => p.signer === v.position);
    ok(new Set(mine.filter(p => p.why === 'foot').map(p => p.page)).size === pages.length, `${v.name}: initials at the foot of every page`);
    ok(mine.some(p => p.kind === 'signature' && p.ref === 'vsig' + v.position) && mine.some(p => p.ref === 'price'), `${v.name}: signs at the vendors' block and initials the filled boxes`);
  }
  ok(!pr2.places.some(p => M1.places.some(q => q.page === p.page && S.overlap(p, q) > 0)), 'no vendor place sits on a purchaser\'s initials or signature');
  // the vendors strike the price and write a new one beside it
  const strike = { id: '11111111-1111-4111-8111-111111111111', kind: 'strike', page: priceBox.page, geometry: { x0: priceBox.x - 1, x1: priceBox.x + priceBox.w + 1, y: priceBox.y + 3 }, by: 'Testy Vendorperson' };
  const insert = { id: '22222222-2222-4222-8222-222222222222', kind: 'insert', page: priceBox.page, geometry: { x: priceBox.x, y: priceBox.y - 10, text: '$680,000', size: 9 }, by: 'Testy Vendorperson' };
  const cur = { doc_round: 2, side: 'vendor', signing_id: 'g2', marks: [strike] };
  let st = N.standing([L1], cur);
  ok(st.lifted.length >= 2 && priceIni.every(p => st.lifted.some(x => x.ink === 'g1/' + p.id)), 'striking the price lifts both purchasers\' initials beside it from the working copy');
  ok(!st.lifted.some(x => x.why === 'foot' || x.kind === 'signature'), 'their foot initials and signatures elsewhere stay');
  const c1 = N.changePlaces(strike, V, pages, st, pr2.places);
  ok(c1.length === 2 && c1.every(p => p.id === `chg:${strike.id}:s${p.signer}` && p.why === 'change' && p.kind === 'initial'), 'each change carries every vendor\'s initials');
  const cur2 = { doc_round: 2, side: 'vendor', signing_id: 'g2', marks: [strike, insert] };
  st = N.standing([L1], cur2);
  const c2 = N.changePlaces(insert, V, pages, st, pr2.places.concat(c1));
  ok(!c2.some(p => c1.concat(pr2.places).some(q => q.page === p.page && S.overlap(p, q) > 0)), 'the second change\'s initials sit clear of the first\'s');
  ok(L1.taps.length === M1.places.length, 'Round 1 itself still holds every initial (nothing is taken from a locked round)');
  const v2places = pr2.places.concat(c1, c2);
  const L2 = { doc_round: 2, number: 2, side: 'vendor', signing_id: 'g2', places: v2places, taps: v2places.map(p => ({ place_id: p.id, signer: p.signer })), marks: [strike, insert],
    signers: V.map(s => ({ position: s.position, name: s.name, sig_png: imgs['v' + s.position], init_png: imgs['v' + s.position] })) };
  st = N.standing([L1, L2]);
  let os_ = N.outstanding(st, { purchaser: P, vendor: V });
  out.outstanding2 = os_.length;
  ok(os_.length === 4 && os_.every(x => x.side === 'purchaser' && x.what === 'change'), 'after the counter: each purchaser\'s initials beside each change are outstanding, nothing else');
  ok(!N.formed(st, { purchaser: P, vendor: V }, 2), 'not formed while the counter is unanswered');

  // ── Round 3 goes back to the purchasers: they accept ──
  const pr3 = N.presentPlaces({ pages, placed, mapPlaces: map.places, side: 'purchaser', signers: P, layers: [L1, L2] });
  ok(!pr3.first && !pr3.blocking.length, 'the purchasers\' later round: nothing blocks');
  ok(P.every(s => pr3.places.some(p => p.signer === s.position && p.kind === 'signature' && p.id === `block:sig${s.position}:s${s.position}`)), 'they sign again where they signed in Round 1');
  ok([strike, insert].every(c => P.every(s => pr3.places.some(p => p.id === `chg:${c.id}:s${s.position}`))), 'and initial each change the vendors made (as the database insists)');
  ok(!pr3.places.some(p => p.why === 'foot' || p.why === 'filled'), 'no foot or box initials again');
  const L3 = { doc_round: 3, number: 3, side: 'purchaser', signing_id: 'g3', places: pr3.places, taps: pr3.places.map(p => ({ place_id: p.id, signer: p.signer })), marks: [], signers: L1.signers };
  st = N.standing([L1, L2, L3]);
  ok(!N.outstanding(st, { purchaser: P, vendor: V }).length && N.formed(st, { purchaser: P, vendor: V }, 0), 'the purchasers accept: nothing outstanding, the agreement is formed');
  ok(st.ink.filter(k => k.side === 'purchaser' && k.kind === 'signature').length === 2 && st.ink.filter(k => k.side === 'purchaser' && k.kind === 'signature').every(k => k.round === 3), 'their newer signatures replace the older on the working copy');
  // a change at the signature block lifts the other side's signature: outstanding again
  const blk = M1.places.find(p => p.id === 'block:sig1:s1');
  const L3b = Object.assign({}, L3, { marks: [{ id: '33333333-3333-4333-8333-333333333333', kind: 'cross', page: blk.page, geometry: { x: 335, y: blk.y - 2, w: 60, h: 20 }, by: 'Ana Testbuyer' }] });
  const pr3b = N.changePlaces(L3b.marks[0], P, pages, N.standing([L1, L2], { doc_round: 3, side: 'purchaser', signing_id: 'g3', marks: L3b.marks }), pr3.places); L3b.places = pr3.places.concat(pr3b); L3b.taps = L3b.places.map(p => ({ place_id: p.id, signer: p.signer }));
  const stb = N.standing([L1, L2, L3b]), osb = N.outstanding(stb, { purchaser: P, vendor: V });
  out.liftedB = stb.lifted.filter(x => x.by === L3b.marks[0].id).map(x => x.who + ':' + x.kind);
  ok(out.liftedB.includes('Testy Vendorperson:signature') && osb.some(x => x.side === 'vendor' && x.signer === 1 && x.what === 'signature') && osb.some(x => x.side === 'vendor' && x.what === 'change') && !N.formed(stb, { purchaser: P, vendor: V }, 1), 'a change over the vendors\' signature lifts it: their signature and initials are outstanding again');

  // ── dates ──
  ok(N.fullDate('2026-11-24') === '24 November 2026' && N.parseFullDate('24 November 2026') === '2026-11-24' && N.parseFullDate('1 March 2027') === '2027-03-01', 'the date in full with the month name, both ways');
  ok(N.parseFullDate('31 February 2027') === null && N.parseFullDate('24/11/2026') === null && N.parseFullDate('24 Nov 2026') === null && N.parseFullDate('24 november 2026') === null, 'anything else is refused');

  // ── Round 2's PDF and the agreed copy ──
  const rec = { address: '1 Example Road, Testville', offer_ref: 'AT', number: 2, document: 1, round: 2, side: 'vendor', base: { round: 1, sha256: 'a'.repeat(64) }, draft: { number: 1, sha256: 'b'.repeat(64) }, made_at: new Date().toISOString(),
    signers: V.map(s => ({ name: s.name, method: 'link', verified_at: new Date().toISOString(), consent_at: new Date().toISOString(), receipts: [{ guide: 'chattels', at: new Date().toISOString() }], places: 10, first_tap: new Date().toISOString(), last_tap: new Date().toISOString(), finished_at: new Date().toISOString(), seen_sha256: 'c'.repeat(64) })),
    changes: [{ kind: 'strike', page: 1, by: 'Testy Vendorperson', at: new Date().toISOString() }, { kind: 'insert', page: 1, by: 'Testy Vendorperson', at: new Date().toISOString(), text: '$680,000' }], lifted: N.standing([L1, L2]).lifted, outstanding: 4 };
  const st2 = N.standing([L1, L2]);
  const rr = await N.renderWorking(PDFLib, r.bytes, { ink: st2.ink, changes: st2.changes, lines: N.roundLines(rec), title: 'Round 2' });
  const rt = (await D.readPages(pdfjs, rr.bytes)).map(p => p.items.map(i => i.s).join(' '));
  ok(rt.length > dpages.length && /Execution record: Round 2/.test(rt.slice(dpages.length).join(' ')) && !rt.slice(0, dpages.length).some(t => /Execution record/.test(t)), 'the record is on pages of its own at the end');
  ok(rt[priceBox.page - 1].includes('$680,000'), 'the typed price is on the page');
  const rec2 = rt.slice(dpages.length).join(' ');
  ok(/line through text by Testy Vendorperson/.test(rec2) && /typed words "\$680,000"/.test(rec2) && /initials of Ana Testbuyer from Round 1/.test(rec2) && /full working order/.test(rec2), 'it lists each change, what was lifted, and the chattels reminder');
  ok(!/buyer\.example|777 6666|555 4444|999 8888/.test(rt.join(' ')), 'no purchaser or vendor phone or email anywhere');
  const raws = async bytes => { const dd = await PDFLib.PDFDocument.load(bytes); return dd.getPages().map(pg => { const c = pg.node.Contents(); const refs = c instanceof PDFLib.PDFArray ? c.asArray() : [c]; return refs.map(x => Buffer.from(dd.context.lookup(x).getContents()).toString('base64')); }); };
  const a = await raws(r.bytes), b = await raws(rr.bytes);
  ok(a.every((s, i) => { let j = 0; for (const x of s) { j = b[i].indexOf(x, j); if (j < 0) return false; j++; } return true; }), 'the draft\'s own content kept byte for byte; everything added on top');
  const datePlace = map.places.find(x => x.id === 'date');
  const ag = await N.renderWorking(PDFLib, r.bytes, { ink: st.ink, changes: st.changes, lines: N.agreementLines({ address: rec.address, offer_ref: 'AT', date_text: '24 November 2026', accepted_at: new Date().toISOString(), document: 1, round: 3, rounds: [{ number: 1, document: 1, round: 1, side: 'purchaser', changes: 0, sha256: 'a'.repeat(64), locked_at: new Date().toISOString() }] }), date: { text: '24 November 2026', place: datePlace } });
  const at = (await D.readPages(pdfjs, ag.bytes));
  const dateItem = at[datePlace.page - 1].items.find(i => i.s === '24 November 2026');
  ok(dateItem && Math.abs(dateItem.y - datePlace.y) < 3 && dateItem.x >= datePlace.x - 1, 'the agreed copy: the date at the top, in its place');
  ok(/The agreement as agreed/.test(at.slice(dpages.length).map(p => p.items.map(i => i.s).join(' ')).join(' ')), 'with its record at the end');

  // ── the lawyers' pack ──
  const events = []; let prev = S.ZERO;
  [['submitted', {}], ['round_locked', { number: 1, document: 1, round: 1, side: 'purchaser', sha256: 'a'.repeat(64) }], ['round_presented', { checked_round: 1, side: 'vendor', method: 'link' }], ['round_change', { round: 2, kind: 'insert', page: 1, text: '$680,000 <b>' }]].forEach(([kind, detail], i) => {
    const e = { chain: 'o1', seq: i + 1, at: new Date().toISOString(), actor: i === 3 ? 'Testy Vendorperson' : 'agent@example.com', kind, offer_id: 'o1', property_id: 'p1', detail }; e.prev_hash = prev; e.body = S.chainBody(e); e.hash = S.chainHash(prev, e.body); prev = e.hash; events.push(e); });
  const html = N.timelineHtml(events, { address: '1 Example Road', offer_ref: 'AT', made_at: new Date().toISOString(), check: S.verifyChain(events), files: [{ name: 'Round-1.pdf', sha256: 'a'.repeat(64) }] });
  ok(/Checked: 4 events/.test(html) && /Tim authorised presentation of Round 1 to the vendors/.test(html) && /&lt;b&gt;/.test(html) && !/<b>/.test(html), 'the timeline reads plainly, checked, with anything typed escaped');
  const files = [{ name: 'Round-1.pdf', bytes: r.bytes }, { name: 'Round-2.pdf', bytes: rr.bytes }, { name: 'timeline.html', bytes: new TextEncoder().encode(html) }];
  const z = N.zip(files), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-')), zf = path.join(dir, 'pack.zip'); fs.writeFileSync(zf, z);
  const t = execFileSync('unzip', ['-t', zf], { encoding: 'utf8' }); ok(/No errors detected/.test(t), 'the pack is a sound zip');
  execFileSync('unzip', ['-q', zf, '-d', dir]);
  ok(files.every(f => crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f.name))).digest('hex') === crypto.createHash('sha256').update(Buffer.from(f.bytes)).digest('hex')), 'each file in it is byte for byte the locked copy');
  fs.rmSync(dir, { recursive: true, force: true });

  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => { console.log(JSON.stringify({ errs: ['crashed: ' + (e.stack || e.message)] })); });

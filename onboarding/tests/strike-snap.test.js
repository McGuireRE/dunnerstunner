// Offers fixes 2 (Tim, 25 November 2026): a line through text snapped to the printed words it crosses (SIGN.snapStrike), on a made-up
// page read with pdf.js as the app reads it. Covers: the line through the middle of the letters (mid cap height for figures, mid
// x-height for ordinary words), from the first letter of the first word crossed to the last letter of the last, whole words only;
// a short or sloppy drag still striking the whole figure; the nearest line chosen when two lines are close; nothing under the drag
// refused (null); the database's shortest line kept; the struck words recorded in Round 1's and later rounds' execution records,
// and records made before this change (no words) worded exactly as before.
const path = require('path');
const PDFLib = require('/opt/npm-tools/node_modules/pdf-lib');
const S = require(path.join(__dirname, '..', 'src', 'sign-core.js'));
const N = require(path.join(__dirname, '..', 'src', 'nego-core.js'));
const D = require(path.join(__dirname, '..', 'src', 'draft-core.js'));
(async () => {
  const errs = [], out = {};
  const ok = (c, m) => { if (!c) errs.push(m); };
  const pdfjs = await import('/opt/npm-tools/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
  const quiet = console.log; console.warn = () => { }; console.log = (...a) => { if (!/Warning/.test(String(a[0]))) quiet(...a); };
  const doc = await PDFLib.PDFDocument.create(), F = await doc.embedFont(PDFLib.StandardFonts.Helvetica), pg = doc.addPage([595.32, 842.04]);
  pg.drawText('Purchase price: $1,000,000 plus GST (if any)', { x: 40, y: 400, size: 10, font: F });
  pg.drawText('The deposit is payable on the agreement becoming unconditional', { x: 40, y: 386, size: 10, font: F });
  pg.drawText('$', { x: 300, y: 300, size: 10, font: F });   // one character: the database's shortest line is kept
  const page = (await D.readPages(pdfjs, await doc.save()))[0];
  const x = (s, from) => { const it = page.items.find(i => i.s.includes(s)); const t = it.s, k = t.indexOf(s, from || 0); return it.x + F.widthOfTextAtSize(t.slice(0, k), 10); };
  const wOf = s => F.widthOfTextAtSize(s, 10);
  const near = (a, b, tol) => Math.abs(a - b) <= (tol || 1);
  // a drag along the figure, a little sloppy at both ends and a little low (where a finger lands)
  const fx = x('$1,000,000');
  let r = S.snapStrike(page, fx + 6, fx + wOf('$1,000,000') - 8, 401.5); out.figure = r;
  ok(r && r.text === '$1,000,000', 'the whole figure is struck, not part of it: ' + JSON.stringify(r));
  ok(r && near(r.x0, fx, 0.8) && near(r.x1, fx + wOf('$1,000,000'), 0.8), 'from its first letter to its last: ' + JSON.stringify(r) + ' want ' + fx + '..' + (fx + wOf('$1,000,000')));
  ok(r && near(r.y, 400 + 10 * 0.35, 0.3), 'through the middle of the figures (mid cap height), not along the bottom like an underline: ' + (r && r.y));
  // a short tap on the word "plus" strikes just that word, through the middle of its lower-case letters
  const px_ = x('plus'); r = S.snapStrike(page, px_ + 4, px_ + 5, 403); out.word = r;
  ok(r && r.text === 'plus' && near(r.y, 400 + 10 * 0.26, 0.3) && near(r.x0, px_, 0.8), 'a short drag on a word: that word, through mid x-height: ' + JSON.stringify(r));
  // two words: everything from the first to the last, with the space between
  r = S.snapStrike(page, fx + 10, x('plus') + 3, 404); ok(r && r.text === '$1,000,000 plus', 'two words in one drag: ' + JSON.stringify(r));
  // the nearest line: a drag between the lines, nearer the deposit line, strikes on that line only
  const dx = x('payable'); r = S.snapStrike(page, dx + 2, dx + wOf('payable') - 2, 390.5); ok(r && r.text === 'payable' && near(r.y, 386 + 2.6, 0.3), 'the line the drag is nearest: ' + JSON.stringify(r));
  // nothing there: refused
  ok(S.snapStrike(page, 40, 200, 600) === null, 'a drag over empty paper: nothing to strike (null)');
  ok(S.snapStrike(page, 520, 580, 401) === null, 'a drag beside the text, on the same line but past its end: nothing (null)');
  ok(S.snapStrike({ items: [] }, 1, 2, 3) === null && S.snapStrike(null, 1, 2, 3) === null, 'no words read: null');
  // a single character still gives a line the database accepts (6 points or more)
  r = S.snapStrike(page, 300, 302, 302); ok(r && r.text === '$' && r.x1 - r.x0 >= 6 && S.markOk({ kind: 'strike', geometry: r }, { w: 595.32, h: 842.04 }), 'one character: a line at least 6 points long: ' + JSON.stringify(r));
  // the snapped line is what the locked copy draws (renderRound draws g.x0..g.x1 at g.y): the geometry is stored as is
  { const g = S.snapStrike(page, fx + 6, fx + wOf('$1,000,000') - 8, 401.5), rect = S.markRect({ kind: 'strike', geometry: g });
    ok(rect.x === Math.min(g.x0, g.x1) && rect.w === Math.abs(g.x1 - g.x0) && rect.y === g.y - 4, 'its rectangle (for the initials beside it) follows the snapped line'); }
  // re-review: a counter-counteroffer strikes the figure the other side typed in an earlier round (their typed words count as page items)
  { const pit = page.items.find(i => /1,000,000/.test(i.s)), ins = { id: 'i2', kind: 'insert', page: 1, geometry: { x: pit.x + pit.w + 12, y: pit.y + 20, text: '$690,000', size: 9 } };
    const L2 = [{ doc_round: 1, side: 'purchaser', marks: [] }, { doc_round: 2, side: 'vendor', marks: [{ id: 'k1', kind: 'strike', page: 1, geometry: { x0: 10, x1: 30, y: 700 } }, ins] }];
    const items = N.typedItems(L2, [], 1), w = N.textWidth('$690,000', 9); out.typed = items;
    ok(items.length === 1 && items[0].s === '$690,000' && items[0].h === 9 && Math.abs(items[0].w - w) < 0.01 && items[0].x === ins.geometry.x, 'the earlier round\'s typed words, with their drawn place and size: ' + JSON.stringify(items));
    ok(S.snapStrike(page, ins.geometry.x + 2, ins.geometry.x + w - 2, ins.geometry.y + 3) === null, 'without them, a drag along the typed figure finds nothing (the bug)');
    const r = S.snapStrike(Object.assign({}, page, { items: page.items.concat(items) }), ins.geometry.x + 2, ins.geometry.x + w - 2, ins.geometry.y + 3); out.counter = r;
    ok(r && r.text === '$690,000' && Math.abs(r.x0 - ins.geometry.x) < 0.2 && Math.abs(r.x1 - (ins.geometry.x + w)) < 0.2, 'with them: the line strikes exactly the typed figure: ' + JSON.stringify(r));
    // typed words already struck through by an earlier line are left out; a reinstated line brings them back; other pages' words are not on this one
    const struckL = [L2[0], { doc_round: 2, side: 'vendor', marks: [ins] }, { doc_round: 3, side: 'purchaser', marks: [{ id: 'k3', kind: 'strike', page: 1, geometry: { x0: ins.geometry.x, x1: ins.geometry.x + w, y: ins.geometry.y + 3 } }] }];
    ok(N.typedItems(struckL, [], 1).length === 0, 'struck typed words are not words to strike again');
    ok(N.typedItems(struckL, [{ id: 'r1', kind: 'reinstate', target: 'k3' }], 1).length === 1, 'reinstated: they are words again');
    ok(N.typedItems(L2, [], 2).length === 0, 'only the page\'s own typed words'); }
  // the struck words in the records
  { const base = { address: 'x', offer_ref: 'y', round: 1, draft: { number: 1, sha256: 'a' }, places_sha256: 'b', made_at: '2026-11-25T01:00:00Z', signers: [], replaced: [] };
    const now = S.executionLines(Object.assign({}, base, { marks: [{ kind: 'strike', page: 1, by: 'Ana', at: '2026-11-25T01:00:00Z', text: '$1,000,000' }] })).map(l => l.t).join('\n');
    ok(/Page 1: line through text striking "\$1,000,000" by Ana/.test(now), 'Round 1 record: the struck words: ' + now.split('\n').find(l => /Page 1/.test(l)));
    const old = S.executionLines(Object.assign({}, base, { marks: [{ kind: 'strike', page: 1, by: 'Ana', at: '2026-11-25T01:00:00Z' }] })).map(l => l.t).find(l => /Page 1/.test(l));
    ok(/^Page 1: line through text by Ana, /.test(old), 'a mark made before this change (no words): worded exactly as before: ' + old);
    const rec = { round: 2, side: 'vendor', number: 2, document: 1, base: { round: 1, sha256: 'a' }, draft: { number: 1, sha256: 'b' }, made_at: '2026-11-25T01:00:00Z', signers: [], outstanding: 0 };
    const r2 = N.roundLines(Object.assign({}, rec, { changes: [{ kind: 'strike', page: 1, by: 'Vera', at: '2026-11-25T01:00:00Z', text: '$1,000,000' }, { kind: 'insert', page: 1, by: 'Vera', at: '2026-11-25T01:00:00Z', text: '$1,050,000' }] })).map(l => l.t);
    ok(r2.some(l => /^Page 1: a line through text striking "\$1,000,000" by Vera/.test(l)) && r2.some(l => /^Page 1: typed words "\$1,050,000" by Vera/.test(l)), 'later rounds\' records: what was struck and what was typed: ' + JSON.stringify(r2.filter(l => /^Page/.test(l))));
    const r2old = N.roundLines(Object.assign({}, rec, { changes: [{ kind: 'strike', page: 1, by: 'Vera', at: '2026-11-25T01:00:00Z' }] })).map(l => l.t).find(l => /^Page/.test(l));
    ok(/^Page 1: a line through text by Vera, /.test(r2old), 'a later round locked before this change: its record reads exactly as before, so it redraws byte for byte: ' + r2old); }
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => { console.log(JSON.stringify({ errs: ['crashed: ' + (e.stack || e.message)] })); });

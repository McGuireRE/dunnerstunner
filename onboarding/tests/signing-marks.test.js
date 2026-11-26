// Signing places, chattels initials and four more marks (Tim, 26 November 2026; migration 029). Against the mock database (which mirrors
// 029), with a synthetic blank made at test time (tests/synthetic-blank.js), at 390 px on a phone:
//  B: every purchaser (and, in their first round, every vendor) has initials inside the chattels box, made for them side by side; a map
//     with no chattels area is said plainly; the database refuses a round without them (the mock as 029 has it);
//  C: "Add text", "Add my initials", "Add my name" and "Add my signature": in person in Round 1 (held for Tim; added text initialled by
//     everyone, a signer's own mark by nobody; the ink is the signer's own; clear of other signers' places), by link in Round 1 (held,
//     Tim alone emailed, the link's state carries the ink), and by the vendors in Round 2 (their own mark: not a change, nothing held);
//     the locked PDFs draw them (sign-core and nego-core, checked here with pdf-lib);
//  D: Tim adds, moves, resizes and removes places on Ready to sign and Present, in the shared viewer; required places can't be removed
//     and the screen says why under the button; what he changed is on the round's timeline.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), crypto = require('crypto');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(__dirname, '..', '..', 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const SB = require(path.join(__dirname, 'synthetic-blank.js'));
const PDFLib = require('/opt/npm-tools/node_modules/pdf-lib');
const PDFJS_DIR = '/opt/npm-tools/node_modules/pdfjs-dist/', PDFLIB_FILE = '/opt/npm-tools/node_modules/pdf-lib/dist/pdf-lib.min.js';
const AGENT = 'agent-sign@example.com';
const sha = b => crypto.createHash('sha256').update(Buffer.from(b)).digest('hex');
const GUIDE_PDF = fs.readFileSync(path.join(__dirname, '..', 'assets', 'guides', 'rea-sale-purchase-guide-2022-en.pdf'));
const GUIDES = { sale_purchase: { file: 'rea-sale-purchase-guide-2022-en.pdf', version: 'August 2022', title: 'Real Estate Authority guide to sale and purchase agreements', sha256: sha(GUIDE_PDF) } };
(async () => {
  const pdfjs = await import(PDFJS_DIR + 'legacy/build/pdf.mjs');
  const D = require(path.join(__dirname, '..', 'src', 'draft-core.js'));
  const quiet = console.log; console.warn = () => { }; console.log = (...a) => { if (!/Warning/.test(String(a[0]))) quiet(...a); };
  const b = await chromium.launch(); const out = {}; const errs = []; global.__errs = errs; global.__out = out;
  const expect = (c, m) => { if (!c) errs.push(m); };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', hasTouch: true, isMobile: true, acceptDownloads: true }); ctx.setDefaultTimeout(20000);
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
  await ctx.route('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/**', r => { const rel = new URL(r.request().url()).pathname.replace(/^\/npm\/pdfjs-dist@6\.2\.108\//, ''), f = path.join(PDFJS_DIR, rel);
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ contentType: /\.m?js$/.test(f) ? 'text/javascript' : 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(f) }); });
  await ctx.route('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/**', r => r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(PDFLIB_FILE) }));
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await ctx.route('https://packages.dunnerstunner.co.nz/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
  await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/**', r => r.fulfill({ contentType: 'text/html', body: html }));
  await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/assets/guides/**', r => { const u = r.request().url(); if (u.endsWith('guides.json')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify(GUIDES) }); if (u.endsWith('.pdf')) return r.fulfill({ contentType: 'application/pdf', body: GUIDE_PDF }); return r.fulfill({ status: 404, body: '' }); });
  const page = async (scheme) => { const p = await ctx.newPage(); if (scheme) await p.emulateMedia({ colorScheme: scheme }); p.on('pageerror', e => errs.push('page: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); }); p.on('dialog', d => d.accept()); return p; };
  const BASE = 'https://packages.dunnerstunner.co.nz/onboarding/';
  const side = p => p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth);
  const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb')));
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'out', `sign_${n}.png`), fullPage: true });
  const rpc = (p, fn, args) => p.evaluate(([fn, args]) => window.supabase.createClient().rpc(fn, args), [fn, args]);
  const invoke = (p, body) => p.evaluate(b => window.supabase.createClient().functions.invoke('offer-sign', { body: b }).then(r => r.data || (r.error && r.error.context ? r.error.context.json() : { error: r.error.message })), body);
  const blob = (p, key) => p.evaluate(async k => { const bl = (window.__repoBlobs || {})[k]; if (!bl) return null; const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }, key).then(x => x ? Buffer.from(x, 'base64') : null);
  const mails = p => p.evaluate(() => JSON.parse(localStorage.getItem('mockSignMail') || '[]'));
  const pdfText = async bytes => { const pg = await D.readPages(pdfjs, new Uint8Array(bytes)); return pg.map(x => x.items.map(i => i.s).join(' ')); };
  const now = new Date().toISOString();
  const prop = (id, address, stage) => ({ id, address, title_ref: null, owners_on_title: null, ownership: {}, description: {}, disclosures: {}, found: {}, provenance: {}, stage, stage_at: now, created_at: now, updated_at: now });
  const seed = { agreements: [{ id: 'A1', ref: 'MRE-2026-1001', address: '1 Example Road, Testville', property_id: 'P1', status: 'countersigned', config: {}, answers: {}, legal: {}, created_at: now, updated_at: now, countersigned_at: now }],
    agreement_people: [{ id: 'AP1', agreement_id: 'A1', position: 1, legal_name: 'Testy Vendorperson', pref_name: '', email: 'vendor@example.com', phone: '021 000 1111', user_id: 'v-1', signed_at: now }],
    agreement_events: [], signatures: [], lawyer_links: [], aml_files: [], aml_events: [], email_log: [], cancellation_requests: [], prelistings: [], agreement_variations: [], prior_agency_notices: [],
    properties: [prop('P1', '1 Example Road, Testville', 'live')],
    property_people: [{ id: 'PP1', property_id: 'P1', position: 1, legal_name: 'Testy Vendorperson', pref_name: '', email: 'vendor@example.com', phone: '021 000 1111', user_id: 'v-1', role: 'owner', source: 'agreement', name_from: 'agreement' }] };
  const SESSION = JSON.stringify({ user: { id: 'agent-1', email: AGENT } });
  const asAgent = async p => { await p.goto(BASE); await p.evaluate(([s, a, ses]) => { localStorage.clear(); localStorage.setItem('mockAgents', JSON.stringify([a])); localStorage.setItem('mocksession', ses); localStorage.setItem('mockdb', JSON.stringify(s)); }, [seed, AGENT, SESSION]); await p.goto(BASE); await p.waitForTimeout(600); };
  const openProp = async p => { await p.click('#navDash'); await p.waitForTimeout(400); await p.click('tr[data-prop="P1"]'); await p.waitForSelector('#offTile'); };
  const offer = (o) => Object.assign({ email: 'buyer.own@example.com', phone: '021 999 8888', seen_docs: 'yes', sign: 'in_person', price: '655000', settlement: { kind: 'relative', days: 15 },
    conditions: [{ key: 'finance', days: 10 }, { key: 'builders', days: 10 }, { key: 'electrical', days: 10 }], kiwisaver: false, entity: '', nominee: false,
    purchasers: [{ first: 'Ana Maria', last: 'Testbuyer', email: 'ana.p@example.com', phone: '022 777 6666' }, { first: 'Bo', last: 'Testbuyer', email: 'bo.p@example.com', phone: '022 555 4444' }, { first: 'Cy', last: 'Testbuyer', email: 'cy.p@example.com', phone: '022 333 2222' }, { first: 'Di', last: 'Testbuyer', email: 'di.p@example.com', phone: '022 111 0000' }],
    comments: '', lawyer: { firm: 'Synthetic Law', person: 'Pat Solicitor', email: 'pat@synthlaw.example', phone: '03 477 1234' }, related: false, date_help: false, privacy: true, chattels_add: ['Outdoor table'], chattels_exclude: ['Heat pump'], gst_registered: null, gst_number: null }, o || {});
  // Tim prepares the link emails (drafts: nothing is sent), then sends them from the page: one at a time, or ticking Reviewed and Send all reviewed
  const prepAndSend = async (p, all) => { const n0 = (await mails(p)).length; await p.click('#sgSendGo'); await p.waitForSelector('[data-mlsend]', { timeout: 20000 });
    expect((await mails(p)).length === n0, 'preparing the link emails sends nothing');
    if (all) { for (const c of await p.$$('[data-mlrev]')) { await c.evaluate(e => { if (!e.checked) e.click(); }); await p.waitForTimeout(150); } await p.click('[data-mlall]'); await p.waitForFunction(() => !document.querySelector('[data-mlsend]'), null, { timeout: 20000 }); }
    else for (let i = 0; i < 20; i++) { const bs = await p.$$('[data-mlsend]'); if (!bs.length) break; await bs[0].click(); await p.waitForFunction(n => document.querySelectorAll('[data-mlsend]').length < n, bs.length, { timeout: 20000 }); }
    await p.waitForSelector('#sgSigners'); };
  // draw a squiggle on a signature pad
  const draw = async (p, sel, seed_) => { await (await p.$(sel)).scrollIntoViewIfNeeded(); const bx = await (await p.$(sel)).boundingBox(); await p.mouse.move(bx.x + 20, bx.y + bx.height / 2); await p.mouse.down(); for (let i = 1; i <= 12; i++) await p.mouse.move(bx.x + 20 + i * (bx.width - 40) / 12, bx.y + bx.height / 2 + Math.sin(i + (seed_ || 0)) * bx.height / 4); await p.mouse.up(); };
  const tick = (p, sel) => p.$eval(sel, e => { if (!e.checked) e.click(); });
  const count = p => p.$eval('#sgCount', e => +e.textContent.match(/(\d+) of/)[1]);
  // tap every place, one at a time, page by page, as the signer does
  const tapAll = async (p, max) => { let n = 0; for (let i = 0; i < 600 && (max == null || n < max); i++) {
      const t = await p.$('#sgPage .sg-todo'); if (!t) { const gn = await p.$('#sgGoNext'); if (!gn) break; await gn.click(); await p.waitForSelector('#sgPage .sg-todo', { timeout: 10000 }); continue; }
      const c0 = await count(p); await p.evaluate(el => el.click(), t); await p.waitForFunction(c => +document.querySelector('#sgCount').textContent.match(/(\d+) of/)[1] > c, c0); n++; } return n; };
  // a purchaser's turn on Tim's device, up to the places
  const turnStart = async (p, n) => { await p.waitForSelector('#sgView'); await p.click(`#sgSigners [data-signer="${n}"] [data-turn]`); await p.waitForSelector('#sgFlow'); };
  const agreeReadDraw = async (p, k) => {
    await p.waitForSelector('#sgConsent'); await p.click('#sgAgreeGo'); expect(/Tick the box to agree/.test(await p.textContent('#sgErr')), 'consent first: Continue refused until ticked');
    await tick(p, '#sgAgree'); await p.click('#sgAgreeGo'); await p.waitForSelector('#sgGuides');
    await p.waitForSelector('#sgCcaPages .dr-pg canvas'); await p.click('#sgGuidesGo'); expect(/Client and Customer Acknowledgement/.test(await p.textContent('#sgErr')), 'the acknowledgement must be ticked');
    expect(await p.$('#sgGuides .guide-open') !== null, 'the REA guide is given to read, as for the agency agreement');
    await tick(p, '#sgCcaOk'); await tick(p, '#sgSpOk'); await p.click('#sgGuidesGo'); await p.waitForSelector('#sgDraw');
    const bg = await p.$eval('#sgDraw .sig-wrap', e => getComputedStyle(e).backgroundColor); expect(bg === 'rgb(255, 255, 255)', 'the signature pad is white (' + bg + ')');
    await p.click('#sgDrawGo'); expect(/draw your signature/.test(await p.textContent('#sgErr')), 'nothing saved until drawn');
    await draw(p, '#sgSig', k); await draw(p, '#sgInit', k + 3); await p.click('#sgDrawGo'); await p.waitForSelector('#sgPlaces');
  };

  // ── viewer helpers ──
  const dv = (p, id) => p.evaluate(id => { const r = document.getElementById(id); if (!r) return null; const f = r.querySelector('.dv-frame'), pg = r.querySelector('.dr-pg');
    return { zoom: (r.querySelector('.dv-zv') || {}).textContent, page: (r.querySelector('.dv-pgv') || {}).textContent, full: r.classList.contains('dv-full'), native: document.fullscreenElement === r,
      pgW: pg ? pg.getBoundingClientRect().width : null, fw: f.clientWidth, sw: f.scrollWidth, sl: f.scrollLeft, st: f.scrollTop, cssZoom: r.querySelector('.dv-doc').style.zoom || '',
      auto: (r.querySelector('.dv-auto input') || {}).checked, lock: document.body.classList.contains('dv-lock') }; }, id);
  // the bar's buttons use the highlight colour: the same as the accent fill under its own text colour, in this colour scheme
  const accentOk = p => p.evaluate(() => { const probe = document.createElement('div'); probe.style.background = 'var(--accent-fill)'; probe.style.color = 'var(--on-accent)'; document.body.appendChild(probe);
    const want = getComputedStyle(probe), wb = want.backgroundColor, wc = want.color; probe.remove();
    const bs = [...document.querySelectorAll('.dv-btn')]; return { n: bs.length, wb, ok: bs.length > 0 && bs.every(b => { const c = getComputedStyle(b); return c.backgroundColor === wb && c.color === wc; }),
      sizes: bs.filter(b => !b.hidden).every(b => { const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; }), labelled: bs.every(b => (b.getAttribute('aria-label') || b.textContent).trim().length > 1) }; });
  const zoomIn = async (p, id, times) => { for (let i = 0; i < times; i++) { await p.click(`#${id}In`); await p.waitForTimeout(350); } };
  const sgSetup = async () => {
    const p = await page(); await asAgent(p);
    await rpc(p, 'agent_offer_link', { p_property: 'P1', p_action: 'open' }); await rpc(p, 'agent_offer_clause', { p_key: 'electrical', p_wording: 'Synthetic electrical wording from Tim.' });
    const oid = (await rpc(p, 'agent_offer_add', { p_property: 'P1', p_offer: offer() })).data;
    await openProp(p);
    await p.setInputFiles('#drFile', { name: 'Agreement pack.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await SB.make({ cca: true })) });
    await p.waitForSelector('#drMap', { timeout: 30000 }); await p.click('#drAiGo'); await p.waitForSelector('#drProps', { timeout: 20000 });
    await p.click('[data-pkeep="0"]'); await p.waitForTimeout(150); await p.click('#drApprove'); await p.waitForSelector('#offTile');
    await p.click(`[data-offer="${oid}"]`); await p.waitForSelector('#drDraftBtn'); await p.click('#drDraftBtn'); await p.waitForSelector('#drReview', { timeout: 30000 });
    await p.waitForSelector('#drApproveDraft:not([disabled])'); await p.click('#drApproveDraft'); await p.waitForSelector('#sgReady');
    await p.click('#sgReady'); await p.waitForSelector('#sgReleaseView', { timeout: 30000 }); await p.waitForSelector('#sgCanvas .sg-place'); await p.click('#sgRelease'); await p.waitForSelector('#sgView');
    return { p, oid }; };
  const handBack = async p => { await p.click('#sgBackTim'); await p.waitForSelector('#sgHandback'); await p.click('#sgImTim'); await p.waitForSelector('#sgView'); };


  const clickBox = (p, sel) => p.$eval(sel, el => el.click());   // places can be tiny and touching at 390 px: the tap is sent to the place itself
  const clickPage = async (p, sel, pts, x, y) => { const pg = await p.$(sel); await pg.scrollIntoViewIfNeeded(); const b = await pg.boundingBox(); await p.mouse.click(b.x + x / pts[0] * b.width, b.y + (pts[1] - y) / pts[1] * b.height); };
  const pagesOf = g => g.pages;
  const note = (p, id) => p.evaluate(id => { const n = document.getElementById('bn-' + id); return n && !n.hidden ? n.textContent : ''; }, id);
  const waitNote = (p, id, re) => p.waitForFunction(([id, s]) => { const n = document.getElementById('bn-' + id); return n && !n.hidden && new RegExp(s).test(n.textContent); }, [id, re.source], { timeout: 8000 }).then(() => true, () => false);
  const SGd = require(path.join(__dirname, '..', 'src', 'sign-core.js')), NGd = require(path.join(__dirname, '..', 'src', 'nego-core.js'));

  // ── 0. the cores: chattels places, a map with no chattels area, and the new marks drawn on the locked copies ──
  { const blank = await SB.make({ cca: true }), pgs = await D.readPages(pdfjs, new Uint8Array(blank));
    const pages = pgs.map(x => ({ n: x.n, w: x.w, h: x.h, items: x.items })), chPage = pages.find(x => x.items.some(i => /SCHEDULE 2/.test(i.s))).n;
    const area = { id: 'chattels', key: 'chattels', kind: 'area', page: chPage, x: 30, y: 740, w: 530, h: 200 };
    const signers = [1, 2, 3].map(i => ({ position: i, name: 'Signer ' + i }));
    const M = SGd.makePlaces({ pages, placed: [], mapPlaces: [area, { id: 'sig_purchaser_1', key: 'sig_purchaser', kind: 'signature', page: 1, x: 40, y: 300, w: 150, h: 22 }], signers });
    const A = SGd.chattelsArea([area]), ch = M.places.filter(x => x.ref === 'chattels_box');
    expect(ch.length === 3 && ch.every(x => SGd.insideOf(x, A)) && new Set(ch.map(x => x.y)).size === 1 && ch.every((x, i) => !i || x.x > ch[i - 1].x), 'B: each signer gets initials inside the chattels box, side by side');
    const M0 = SGd.makePlaces({ pages, placed: [], mapPlaces: [], signers });
    expect(M0.blocking.some(b => b.id === 'chattels' && /no chattels area/.test(b.why)), 'B: a map with no chattels area is said plainly, and release waits');
    // a later round with "everyone signs again every round": the chattels box again, clear of the earlier ink
    const L1 = { doc_round: 1, number: 1, side: 'purchaser', signing_id: 'g1', places: M.places, taps: M.places.map(x => ({ place_id: x.id, signer: x.signer })), signers: signers.map(x => Object.assign({ sig_png: null, init_png: null }, x)), marks: [] };
    const V = [{ position: 1, name: 'Vendor 1' }];
    const L2p = NGd.presentPlaces({ pages, placed: [], mapPlaces: [area, { id: 'sig_vendor_1', key: 'sig_vendor', kind: 'signature', page: 1, x: 330, y: 300, w: 150, h: 22 }], side: 'vendor', signers: V, layers: [L1] });
    expect(L2p.places.some(x => x.ref === 'chattels_box' && SGd.insideOf(x, A) && !ch.some(c => SGd.overlap(c, x) > 0)), 'B: the vendors\' first round initials the chattels box too, clear of the purchasers');
    const L2 = Object.assign({}, L1, { doc_round: 2, number: 2, side: 'vendor', signing_id: 'g2', places: L2p.places, taps: L2p.places.map(x => ({ place_id: x.id, signer: x.signer })), signers: V });
    const L3r = NGd.presentPlaces({ pages, placed: [], mapPlaces: [area], side: 'purchaser', signers, layers: [L1, L2], resignEvery: true });
    const L3n = NGd.presentPlaces({ pages, placed: [], mapPlaces: [area], side: 'purchaser', signers, layers: [L1, L2], resignEvery: false });
    expect(L3r.places.filter(x => x.ref === 'chattels_box').length === 3 && !L3n.places.some(x => x.ref === 'chattels_box'), 'B: signing again every round initials the chattels box again; otherwise not');
    // the new marks: own marks aren't changes (nothing outstanding for them, nothing lifted) and are drawn on Round 1 and on the working copy
    const ownM = { id: 'm1', kind: 'own_initials', page: 1, geometry: { x: 100, y: 100, w: 30, h: 14 }, by: 'Signer 1', at: now };
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    ownM.ink = PNG; const nameM = { id: 'm2', kind: 'own_name', page: 1, geometry: { x: 100, y: 200, w: 90, h: 13, text: 'Signer 1', size: 9 }, by: 'Signer 1', at: now };
    const insM = { id: 'm3', kind: 'insert', page: 1, geometry: { x: 100, y: 400, text: 'Added words', size: 9 }, by: 'Signer 1', at: now };
    const st = NGd.standing([Object.assign({}, L1, { marks: [ownM, nameM, insM] })]);
    expect(st.own.length === 2 && st.changes.length === 1 && st.changes[0].id === 'm3', 'C: a signer\'s own marks are drawn but are not changes; added text is a change');
    expect(SGd.markPlaces([ownM, nameM, insM], signers, pages, []).every(x => x.ref === 'm3'), 'C: in Round 1, only added text gets everyone\'s initials');
    const imgs = async bytes => { const doc = await PDFLib.PDFDocument.load(bytes); const pg = doc.getPages()[0]; const xo = pg.node.Resources().lookup(PDFLib.PDFName.of('XObject')); return xo ? xo.keys().length : 0; };
    const words = async bytes => (await pdfText(bytes))[0];
    const r1 = await SGd.renderRound(PDFLib, new Uint8Array(blank), { places: [], taps: [], signers: [], marks: [ownM, nameM, insM], record: { marks: [] }, title: 't' });
    const r0 = await SGd.renderRound(PDFLib, new Uint8Array(blank), { places: [], taps: [], signers: [], marks: [], record: { marks: [] }, title: 't' });
    out.pdfImages = [await imgs(r0.bytes), await imgs(r1.bytes)];
    expect(out.pdfImages[1] === out.pdfImages[0] + 1 && /Signer 1/.test(await words(r1.bytes)) && /Added words/.test(await words(r1.bytes)), 'C: Round 1\'s locked copy draws the own initials (an image), the name and the added text');
    const w1 = await NGd.renderWorking(PDFLib, new Uint8Array(blank), { ink: st.ink, changes: st.changes, own: st.own, lines: [], title: 't' });
    expect(await imgs(w1.bytes) === out.pdfImages[0] + 1 && /Signer 1/.test(await words(w1.bytes)), 'C: a later round\'s working copy draws a signer\'s own marks too');
    const lines = NGd.roundLines({ round: 2, side: 'vendor', changes: [], own: [{ kind: 'own_signature', page: 3, by: 'V', at: now }] }).map(l => l.t).join(' ');
    expect(/No changes/.test(lines) && /their own signature by V/.test(lines), 'C: the round\'s record lists a signer\'s own mark apart from the changes');
    const lines0 = NGd.roundLines({ round: 2, side: 'vendor', changes: [] }).map(l => l.t).join(' ');
    expect(!/Added by a signer/.test(lines0), 'nothing new in a record with no own marks (earlier rounds read as before)'); }

  // ── 1. D and B on Ready to sign: four purchasers in person ──
  process.stderr.write('release\n');
  const p = await page(); await asAgent(p);
  await rpc(p, 'agent_offer_link', { p_property: 'P1', p_action: 'open' }); await rpc(p, 'agent_offer_clause', { p_key: 'electrical', p_wording: 'Synthetic electrical wording from Tim.' });
  const oid = (await rpc(p, 'agent_offer_add', { p_property: 'P1', p_offer: offer() })).data;
  const oid2 = (await rpc(p, 'agent_offer_add', { p_property: 'P1', p_offer: offer({ sign: 'digital', purchasers: [{ first: 'Lin', last: 'Linkbuyer', email: 'lin.l@example.com', phone: '022 123 4567' }] }) })).data;
  await openProp(p);
  await p.setInputFiles('#drFile', { name: 'Agreement pack.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await SB.make({ cca: true })) });
  await p.waitForSelector('#drMap', { timeout: 30000 }); await p.click('#drAiGo'); await p.waitForSelector('#drProps', { timeout: 20000 });
  await p.click('[data-pkeep="0"]'); await p.waitForTimeout(150); await p.click('#drApprove'); await p.waitForSelector('#offTile');
  const toRelease = async o => { await p.click(`[data-offer="${o}"]`); await p.waitForSelector('#drDraftBtn'); await p.click('#drDraftBtn'); await p.waitForSelector('#drReview', { timeout: 30000 });
    await p.waitForSelector('#drApproveDraft:not([disabled])'); await p.click('#drApproveDraft'); await p.waitForSelector('#sgReady'); await p.click('#sgReady'); await p.waitForSelector('#sgReleaseView', { timeout: 30000 }); await p.waitForSelector('#sgCanvas .sg-place'); };
  await toRelease(oid);
  let d = await db(p); const map = d.offer_blank_maps[0], A = SGd.chattelsArea(map.places), dr1 = d.offer_drafts.find(x => x.offer_id === oid);
  expect(!!A, 'the map has its chattels area (found on the schedule)');
  // the places proposed: every purchaser has initials inside the chattels box
  const placesNow = () => p.evaluate(() => [...document.querySelectorAll('#sgCanvas .dr-box')].map(b => b.dataset.id));
  await p.selectOption('#sgPick', String(A.page)); await p.waitForSelector(`#sgCanvas .dr-pg[data-page="${A.page}"] canvas`);
  // (this offer adds and leaves out chattels, so the initials beside those already sit in the box and count; none are added twice)
  const inBox = () => p.evaluate(A => { const pg = document.querySelector('#sgCanvas .dr-pg'), r = pg.getBoundingClientRect(), W = 595.32, H = 842.04;
    return [...pg.querySelectorAll('.dr-box')].filter(b => { const q = b.getBoundingClientRect(), x = (q.left - r.left) / r.width * W, y = H - (q.bottom - r.top) / r.height * H, w = q.width / r.width * W, h = q.height / r.height * H;
      return x >= A.x - 1.5 && x + w <= A.x + A.w + 1.5 && y >= A.y - 1.5 && y + h <= A.y + A.h + 1.5; }).map(b => b.dataset.id); }, A);
  await p.waitForTimeout(600); const chIds = await inBox(); out.chIds = chIds;
  expect([1, 2, 3, 4].every(n => chIds.some(id => new RegExp(':s' + n + '$').test(id))), 'B: all four purchasers have initials inside the chattels box (' + chIds.join(',') + ')');
  expect(!!(await p.$('#sgEdDv .dv-bar')) && !(await side(p)), 'D: the places are shown in the shared viewer; no sideways scroll at 390 px');
  // a signer's last initials in the chattels box can't be removed; the reason shows under Remove
  let removedN = 0, refused = false;
  for (const id of chIds.filter(x => /:s1$/.test(x))) { await clickBox(p, `#sgCanvas .dr-box[data-id="${id}"]`); await p.waitForSelector('#sgEdSel:not([hidden])'); await p.click('#sgEdRemove'); await p.waitForTimeout(250);
    if ((await placesNow()).includes(id)) { refused = /chattels box/.test(await note(p, 'sgEdRemove')); break; } removedN++; }
  await p.waitForTimeout(400); out.refusedNote = await note(p, 'sgEdRemove');
  expect(refused && (await inBox()).some(x => /:s1$/.test(x)), 'D: purchaser 1\'s last initials in the chattels box can\'t be removed, and the screen says why under the button');
  // nor moved out of the box
  await p.waitForTimeout(400); out.inBoxAfter = await inBox();
  { const last1 = (await inBox()).find(x => /:s1$/.test(x)); await clickBox(p, `#sgCanvas .dr-box[data-id="${last1}"]`); await p.click('#sgEdMove'); await clickPage(p, '#sgCanvas .dr-pg', [595.32, 842.04], 300, 300); await p.waitForTimeout(250);
    expect((await inBox()).includes(last1) && /Keep it inside the box/.test(await note(p, 'sgEdMove')), 'D: the last chattels initials can\'t be moved out of the box'); await p.click('#sgEdMove').catch(() => {}); }
  // the foot of a page and the signature block stay too
  await p.selectOption('#sgPick', '1'); await p.waitForSelector('#sgCanvas .dr-pg[data-page="1"] canvas'); await p.waitForTimeout(200);
  const foot = (await placesNow()).find(x => /^foot:/.test(x)); await clickBox(p, `#sgCanvas .dr-box[data-id="${foot}"]`); await p.click('#sgEdRemove');
  expect(await waitNote(p, 'sgEdRemove', /foot of every page/), 'D: a foot initial can\'t be removed, with the reason under Remove');
  await p.click('#sgEdSmaller'); expect(await waitNote(p, 'sgEdSmaller', /smaller/), 'D: a required place can still be resized (made smaller), confirmed under the button');
  // add a place for purchaser 2: tap Add, then the page, trying spots until one is clear
  await p.click('#sgEdDone'); await p.selectOption('#sgEdWho', '2'); await p.selectOption('#sgEdKind', 'initial');
  const pts = [595.32, 842.04];
  let added = null; for (const [x, y] of [[300, 420], [150, 500], [420, 600], [250, 250], [100, 650], [480, 320]]) { await p.click('#sgEdAdd'); await clickPage(p, '#sgCanvas .dr-pg', pts, x, y); await p.waitForTimeout(250);
    added = (await placesNow()).find(id => /^ack:tim/.test(id)); if (added) break; await p.click('#sgEdAdd').catch(() => {}); await p.waitForTimeout(50); if ((await p.textContent('#sgEdAdd')) !== 'Add a place') await p.click('#sgEdAdd'); }
  expect(!!added && /:s2$/.test(added) && /Added for/.test(await note(p, 'sgEdAdd')), 'D: Tim adds an initials place for purchaser 2 where he taps, confirmed under Add');
  await p.click('#sgEdBigger'); expect(await waitNote(p, 'sgEdBigger', /bigger/), 'D: a place made bigger, confirmed under the button');
  // an ordinary place (initials beside a filled box) can be removed
  const anyFilled = async () => { for (const pg of (await db(p)) ? [1, 2, 3, 4, 5, 6, 7, 8] : []) { await p.selectOption('#sgPick', String(pg)); await p.waitForTimeout(300); const f = (await placesNow()).find(x => /^filled:(?!chattels_box)/.test(x) && /:s3$/.test(x)); if (f) return f; } return null; };
  const rem = await anyFilled(); if (rem) { await clickBox(p, `#sgCanvas .dr-box[data-id="${rem}"]`); await p.click('#sgEdRemove'); await p.waitForTimeout(200); }
  expect(rem && !(await placesNow()).includes(rem), 'D: an ordinary place is removed');
  const sumT = await p.textContent('#sgEdSum'); out.editSum = sumT; expect(new RegExp(`1 added, 1 moved or resized, ${removedN + 1} removed`).test(sumT), 'D: the screen sums up what Tim changed (' + sumT + ')');
  expect(!(await side(p)), 'D: after the changes, no sideways scroll'); await shot(p, 'marks_release');
  await p.click('#sgRelease'); await p.waitForSelector('#sgView').catch(async e => { throw new Error('release refused: ' + await p.textContent('#sgRelErr')); });
  d = await db(p); const g1 = d.offer_signings.find(x => x.offer_id === oid);
  const ev = d.offer_events.find(e => e.kind === 'sign_places_edited' && e.detail.signing_id === g1.id); out.editEv = ev && ev.detail;
  expect(ev && ev.detail.added === 1 && ev.detail.removed === removedN + 1 && ev.detail.moved === 1 && ev.detail.added_ids[0] === added && ev.detail.removed_places.some(x => x.id === rem), 'D: the round\'s timeline records what Tim added, moved and removed');
  expect(g1.places.some(x => x.id === added) && !g1.places.some(x => x.id === rem) && [1, 2, 3, 4].every(n => g1.places.some(x => x.signer === n && x.kind === 'initial' && SGd.insideOf(x, A))), 'D and B: the released places are as Tim left them, chattels initials for everyone');

  // ── 2. C in person, Round 1: own initials (held, nobody initials them), added text (held, everyone initials it) ──
  process.stderr.write('in person marks\n');
  await turnStart(p, 1); await p.waitForSelector('#sgConsent'); await tick(p, '#sgAgree'); await p.click('#sgAgreeGo'); await p.waitForSelector('#sgGuides'); await tick(p, '#sgCcaOk'); await tick(p, '#sgSpOk'); await p.click('#sgGuidesGo');
  await p.waitForSelector('#sgDraw'); await draw(p, '#sgSig', 1); await draw(p, '#sgInit', 4); await p.click('#sgDrawGo'); await p.waitForSelector('#sgPlaces'); await p.waitForSelector('#sgPage .dr-pg canvas');
  const tools = await p.$$eval('#sgTools [data-tool]', b => b.map(x => x.dataset.tool)); out.tools1 = tools;
  expect(['note', 'strike', 'cross', 'reinstate', 'insert', 'own_initials', 'own_name', 'own_signature'].every(k => tools.includes(k)), 'C: Round 1 on Tim\'s screen: Mark the page has the four new options beside the old');
  await p.selectOption('#sgPgPick', '1'); await p.waitForSelector('#sgPage .dr-pg[data-page="1"] canvas');
  // on another purchaser's place: refused, said under Save
  d = await db(p); const other = g1.places.find(x => x.signer === 2 && x.page === 1);
  await p.click('[data-tool="own_signature"]'); await p.waitForSelector('#sgPage .sg-draw'); await clickPage(p, '#sgPage .dr-pg', g1.pages[0], other.x + other.w / 2, other.y + other.h / 2);
  await p.waitForSelector('#sgMarkSave:not([disabled])'); await p.click('#sgMarkSave');
  expect(await waitNote(p, 'sgMarkSave', /someone else's place/), 'C: a signature added over another purchaser\'s place is refused, said under Save');
  await p.click('#sgMarkCancel');
  // own initials in a clear spot
  const clear = (pg, w, h) => { const ps = g1.places.filter(x => x.page === pg); for (let y = 500; y > 120; y -= 37) for (let x = 120; x < 480; x += 61) { const r = { x: x - w / 2, y: y - h / 2, w, h }; if (!ps.some(q => SGd.overlap(q, r) > 0) && !(pg === 1 && y > 700)) return [x, y]; } return [300, 300]; };
  const spot = clear(1, 40, 20);
  await p.click('[data-tool="own_initials"]'); await p.waitForSelector('#sgPage .sg-draw'); await clickPage(p, '#sgPage .dr-pg', g1.pages[0], spot[0], spot[1]);
  await p.waitForSelector('#sgMarkSave:not([disabled])'); await p.click('#sgMarkSave'); await p.waitForSelector('#sgHeldMsg', { timeout: 15000 });
  d = await db(p); const s1 = d.offer_signers.find(x => x.signing_id === g1.id && x.position === 1), mk = d.offer_sign_marks.find(m => m.signing_id === g1.id && m.kind === 'own_initials');
  expect(mk && mk.ink_png === s1.init_png && Math.abs(mk.geometry.x + mk.geometry.w / 2 - spot[0]) < 3 && d.offer_signings.find(x => x.id === g1.id).status === 'held', 'C: "Add my initials" puts her own initials (her own ink) where she tapped, and holds the round for Tim');
  expect(d.offer_events.some(e => e.kind === 'sign_marked' && e.detail.kind === 'own_initials' && e.detail.by_link === false), 'C: it is on the timeline');
  await p.click('#sgToTim'); await p.waitForSelector('#sgHandback'); await p.click('#sgImTim'); await p.waitForSelector('#sgReview'); await p.click('#sgReview'); await p.waitForSelector('#sgView:not(:has(#sgReview))', { timeout: 15000 }).catch(() => {});
  d = await db(p); let rv = d.offer_sign_reviews.filter(r => r.signing_id === g1.id).pop();
  expect(rv && rv.marks.includes(mk.id) && rv.places.length === 0 && d.offer_signings.find(x => x.id === g1.id).status === 'signing', 'C: Tim re-approves her own initials, and nobody is asked to initial them');
  // added text: everyone on the side initials it
  await turnStart(p, 1); await p.waitForSelector('#sgPlaces'); await p.selectOption('#sgPgPick', '1'); await p.waitForSelector('#sgPage .dr-pg[data-page="1"] canvas');
  const spot2 = clear(1, 120, 14); await p.click('[data-tool="insert"]'); await p.waitForSelector('#sgPage .sg-draw'); await clickPage(p, '#sgPage .dr-pg', g1.pages[0], spot2[0] - 50, spot2[1]);
  await p.fill('#ngInsText', 'Subject to a builder report'); await p.waitForSelector('#sgMarkSave:not([disabled])'); await p.click('#sgMarkSave'); await p.waitForSelector('#sgHeldMsg', { timeout: 15000 });
  await p.click('#sgToTim'); await p.waitForSelector('#sgHandback'); await p.click('#sgImTim'); await p.waitForSelector('#sgReview'); await p.click('#sgReview'); await p.waitForTimeout(1500);
  d = await db(p); rv = d.offer_sign_reviews.filter(r => r.signing_id === g1.id).pop(); const ins = d.offer_sign_marks.find(m => m.signing_id === g1.id && m.kind === 'insert');
  expect(ins && ins.geometry.text === 'Subject to a builder report' && rv.places.length === 4 && rv.places.every(x => x.ref === ins.id), 'C: added text is a change: after Tim re-approves, all four purchasers initial beside it');
  await shot(p, 'marks_person');

  // ── 3. C by link, Round 1: the four options hold the round for Tim, who alone is emailed ──
  process.stderr.write('link marks\n');
  await p.click('#sgBackP').catch(() => {}); await openProp(p); await toRelease(oid2);
  expect(await p.isChecked('input[name="sgMethod"][value="link"]'), 'the second offer signs by link, as asked');
  // the database (the mock mirrors 029) refuses a round without everyone's chattels initials, or with a place Tim "added" on the date
  { d = await db(p); const dr2 = d.offer_drafts.filter(x => x.offer_id === oid2).sort((a, z) => z.number - a.number)[0], pg2 = dr2.pages || g1.pages;
    const pl = g1.places.filter(x => x.signer === 1 && !(x.kind === 'initial' && SGd.insideOf(x, A)));
    let r = await rpc(p, 'agent_signing_release', { p_draft: dr2.id, p_method: 'link', p_pages: g1.pages, p_places: pl, p_cca_pages: [] });
    expect(r.error && /chattels box/.test(r.error.message), 'B: the database refuses a round without the chattels initials (' + (r.error && r.error.message) + ')');
    const dp = map.places.find(x => x.id === 'date'), onDate = g1.places.filter(x => x.signer === 1).concat([{ id: 'ack:timdate:s1', signer: 1, kind: 'initial', why: 'ack', ref: 'timdate', page: dp.page, x: dp.x + 2, y: dp.y, w: 26, h: 13 }]);
    r = await rpc(p, 'agent_signing_release_edited', { p_draft: dr2.id, p_method: 'link', p_pages: g1.pages, p_places: onDate, p_cca_pages: [], p_edits: { added: ['ack:timdate:s1'] } });
    expect(r.error && /date goes/.test(r.error.message), 'D: a place Tim adds on the date place is refused'); }
  await p.click('#sgRelease'); await p.waitForSelector('#sgView'); await prepAndSend(p, false);
  d = await db(p); const gL = d.offer_signings.find(x => x.offer_id === oid2), link = (await mails(p)).filter(m => m.kind === 'offer_sign_link').pop().link, tok = link.split('sign=')[1];
  await invoke(p, { action: 'open', token: tok }); await invoke(p, { action: 'send_code', token: tok });
  const code = (await mails(p)).filter(m => m.kind === 'offer_sign_code').pop().code, ses = (await invoke(p, { action: 'verify', token: tok, code })).session;
  const A_ = { token: tok, session: ses };
  await invoke(p, Object.assign({ action: 'consent' }, A_)); await invoke(p, Object.assign({ action: 'receipt', guide: 'cca', pages: gL.cca_pages }, A_));
  await invoke(p, Object.assign({ action: 'receipt', guide: 'sale_purchase', version: GUIDES.sale_purchase.version, file: GUIDES.sale_purchase.file, sha256: GUIDES.sale_purchase.sha256 }, A_));
  const inkPng = (w, h, k) => p.evaluate(([w, h, k]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.strokeStyle = '#0d2973'; g.lineWidth = 3; g.beginPath(); for (let i = 0; i < 30; i++) g.lineTo(5 + i * (w - 10) / 30, h / 2 + Math.sin(i + k) * h / 3); g.stroke(); return c.toDataURL('image/png'); }, [w, h, k]);
  const PNG1 = await inkPng(120, 50, 1), SIG1 = await inkPng(300, 80, 2);
  let r = await invoke(p, Object.assign({ action: 'mark', kind: 'own_initials', page: 1, geometry: { x: 120, y: 400, w: 34, h: 16 } }, A_));
  expect(r.ok === false && /Draw your signature/.test(r.error), 'C by link: her own initials only once she has drawn them');
  await invoke(p, Object.assign({ action: 'marks', sig: SIG1, init: PNG1 }, A_));
  const spotL = (() => { const ps = gL.places.filter(x => x.page === 1); for (let y = 500; y > 120; y -= 37) for (let x = 120; x < 480; x += 61) { const rr = { x, y, w: 34, h: 16 }; if (!ps.some(q => SGd.overlap(q, rr) > 0)) return rr; } return { x: 300, y: 300, w: 34, h: 16 }; })();
  r = await invoke(p, Object.assign({ action: 'mark', kind: 'own_name', page: 1, geometry: { x: spotL.x, y: spotL.y, w: 120, h: 13, text: 'Someone Else', size: 9 } }, A_));
  expect(r.ok === false && /your own name/.test(r.error), 'C by link: only her own name');
  r = await invoke(p, Object.assign({ action: 'mark', kind: 'own_initials', page: 1, geometry: spotL }, A_));
  d = await db(p); const ml = (await mails(p)).filter(m => m.kind === 'offer_sign_marked'), mkL = d.offer_sign_marks.find(m => m.signing_id === gL.id);
  expect(r.ok && r.held && d.offer_signings.find(x => x.id === gL.id).status === 'held' && mkL.ink_png === PNG1, 'C by link: her own initials hold the round for Tim, in her own ink');
  out.markMails = ml.map(m => m.to); out.markR = r; out.allKinds = (await mails(p)).map(m => m.kind); expect(ml.length === 1 && ml[0].to === 'tim', 'C by link: Tim alone is emailed that she marked the page');
  const stL = await invoke(p, Object.assign({ action: 'state' }, A_));
  expect(stL.signing.marks.length === 1 && stL.signing.marks[0].ink === PNG1 && stL.signing.marks[0].mine, 'C by link: her screen shows the mark, with her ink');
  // by link in Round 1, every tool Tim's screen has: a crossed-out box and its reinstatement hold the round for Tim too, Tim alone emailed
  r = await invoke(p, Object.assign({ action: 'mark', kind: 'cross', page: 1, geometry: { x: spotL.x, y: spotL.y + 40, w: 60, h: 20 } }, A_)); const crossL = r.id;
  expect(r.ok && r.held && (await mails(p)).filter(m => m.kind === 'offer_sign_marked').length === 2, 'C by link: a crossed-out box holds the round, and Tim alone is emailed');
  r = await invoke(p, Object.assign({ action: 'mark', kind: 'reinstate', page: 1, geometry: { x: spotL.x, y: spotL.y + 62 }, target: crossL }, A_));
  d = await db(p); expect(r.ok && r.held && d.offer_sign_marks.find(m => m.id === r.id).target === crossL, 'C by link: a reinstatement points at the box it reinstates');
  r = await invoke(p, Object.assign({ action: 'mark', kind: 'smudge', page: 1, geometry: { x: 1 } }, A_)); expect(r.ok === false, 'by link, only the known kinds');
  for (let i = 0; i < 2; i++) await invoke(p, Object.assign({ action: 'undo', scope: 'last' }, A_));
  // her link page shows the held message and lets her undo it
  { const q = await page(); await q.goto(link); await q.evaluate(([k, v]) => sessionStorage.setItem(k, v), ['sgSes:' + tok, ses]).catch(() => {}); await q.close(); }
  r = await invoke(p, Object.assign({ action: 'undo', scope: 'last' }, A_)); d = await db(p);
  expect(r.ok && d.offer_signings.find(x => x.id === gL.id).status === 'signing', 'C by link: she undoes her marks, and signing carries on');
  // she signs every place and finishes: Round 1 is locked
  const stF = await invoke(p, Object.assign({ action: 'state' }, A_));
  for (const pl of stF.signing.places) await invoke(p, Object.assign({ action: 'tap', place: pl.id }, A_));
  r = await invoke(p, Object.assign({ action: 'finish' }, A_)); out.finishL = r && { ok: r.ok, complete: r.complete, locked: r.locked };
  r = await invoke(p, { action: 'lock', signing_id: gL.id }); out.lockL = r; d = await db(p); expect(d.offer_rounds.some(x => x.signing_id === gL.id), 'Round 1 by link is locked');

  // ── 4. D on Present, B for the vendors, C for a vendor in Round 2 (their own name: not a change, nothing held) ──
  process.stderr.write('present\n');
  await p.goto(BASE); await p.waitForTimeout(500); await openProp(p); await p.click(`[data-offer="${oid2}"]`);
  await p.waitForSelector('#ngPresent', { timeout: 20000 }); await p.click('#ngPresent'); await p.waitForSelector('#ngPresentView', { timeout: 30000 }); await p.waitForSelector('#ngEdPage .dr-pg canvas');
  expect(!!(await p.$('#ngEdDv .dv-bar')) && !(await side(p)), 'D: Present shows the places in the shared viewer; no sideways scroll');
  await p.selectOption('#ngEdPick', String(A.page)); await p.waitForSelector(`#ngEdPage .dr-pg[data-page="${A.page}"] canvas`);
  await p.waitForTimeout(500); out.vIds = await p.evaluate(() => [...document.querySelectorAll('#ngEdPage .dr-box')].map(b => b.dataset.id)); out.ngBlock = await p.evaluate(() => (document.querySelector('#ngBlock') || {}).textContent || '');
  await clickBox(p, '#ngEdPage .dr-box[data-id="foot:p' + A.page + ':s1"]'); await p.click('#ngEdSmaller');
  expect(await waitNote(p, 'ngEdSmaller', /smaller/), 'D: on Present, Tim resizes a place, confirmed under the button');
  await p.click('#ngEdRemove'); expect(await waitNote(p, 'ngEdRemove', /foot of every page/), 'D: on Present too, a required place says why it stays');
  await tick(p, '#ngChecked'); await p.click('#ngGo'); await p.waitForSelector('#sgView', { timeout: 20000 });
  d = await db(p); const g2 = d.offer_signings.find(x => x.offer_id === oid2 && x.round_no === 2);
  expect(g2 && d.offer_events.some(e => e.kind === 'sign_places_edited' && e.detail.signing_id === g2.id && e.detail.moved === 1), 'D: the change is recorded on Round 2\'s timeline');
  expect(g2.places.some(x => x.signer === 1 && x.kind === 'initial' && SGd.insideOf(x, A)), 'B: the vendor\'s first round has initials inside the chattels box');
  await turnStart(p, 1); await p.waitForSelector('#sgConsent'); await tick(p, '#sgAgree'); await p.click('#sgAgreeGo');
  await p.waitForSelector('#ngChatOk'); await tick(p, '#ngChatOk'); await p.click('#ngChatGo'); await p.waitForSelector('#sgDraw');
  await draw(p, '#sgSig', 7); await draw(p, '#sgInit', 8); await p.click('#sgDrawGo'); await p.waitForSelector('#sgPlaces'); await p.waitForSelector('#sgPage .dr-pg canvas');
  const tools2 = await p.$$eval('#sgTools [data-tool]', b => b.map(x => x.dataset.tool)); out.tools2 = tools2;
  expect(['strike', 'cross', 'note', 'reinstate', 'insert', 'own_initials', 'own_name', 'own_signature'].every(k => tools2.includes(k)) && /Add text/.test(await p.textContent('#sgTools')), 'C: Round 2 "To counter, change the document" has Add text and the three own marks');
  await p.selectOption('#sgPgPick', '1'); await p.waitForSelector('#sgPage .dr-pg[data-page="1"] canvas');
  const spotV = (() => { const ps = g2.places.concat(gL.places).filter(x => x.page === 1); for (let y = 560; y > 120; y -= 29) for (let x = 140; x < 460; x += 53) { const rr = { x: x - 40, y: y - 8, w: 80, h: 16 }; if (!ps.some(q => SGd.overlap(q, rr) > 0)) return [x, y]; } return [300, 300]; })();
  await p.click('[data-tool="own_name"]'); await p.waitForSelector('#sgPage .sg-draw'); await clickPage(p, '#sgPage .dr-pg', g2.pages[0], spotV[0], spotV[1]);
  await p.waitForSelector('#sgMarkSave:not([disabled])'); await p.click('#sgMarkSave'); await p.waitForSelector('#sgPlaces', { timeout: 15000 }); await p.waitForTimeout(600);
  d = await db(p); const nm = d.offer_sign_marks.find(m => m.signing_id === g2.id && m.kind === 'own_name');
  expect(nm && nm.geometry.text === 'Testy Vendorperson' && d.offer_signings.find(x => x.id === g2.id).status === 'signing' && !d.offer_sign_reviews.some(r => r.signing_id === g2.id && r.marks.includes(nm.id)), 'C: in Round 2 a vendor adds their own name: exactly their name, nothing held, nobody to initial it');
  expect(d.offer_events.some(e => e.kind === 'sign_own_mark' && e.detail.kind === 'own_name' && e.detail.round === 2), 'C: on the timeline as their own mark');
  expect(await p.evaluate(() => !!document.querySelector('#sgPage .sg-k-own_name')), 'C: shown in the on-screen layer');
  await tapAll(p); await tick(p, '#sgSaw'); await p.selectOption('#sgIdType', 'passport'); await p.click('#sgFinishGo'); await p.waitForSelector('#sgHandback', { timeout: 20000 }); await p.click('#sgImTim'); await p.waitForSelector('#sgView', { timeout: 20000 });
  for (let i = 0; i < 20 && !((await db(p)).offer_rounds || []).some(x => x.signing_id === g2.id); i++) await p.waitForTimeout(500);
  d = await db(p); const rd2 = d.offer_rounds.find(x => x.signing_id === g2.id); out.round2 = rd2 && { changes: rd2.changes, own: (rd2.execution.own || []).length };
  expect(rd2 && rd2.changes === 0 && (rd2.execution.own || []).length === 1 && !(rd2.execution.changes || []).length, 'C: Round 2 locks with no changes: the vendor\'s own name is listed apart, not as a change');
  expect(!(await side(p)), 'no sideways scroll at the end'); await shot(p, 'marks_r2');

  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
  await b.close();
})().catch(e => { console.log(JSON.stringify({ out: global.__out, errs: (global.__errs || []).concat(['crashed: ' + (e.stack || e.message)]) })); process.exit(0); });

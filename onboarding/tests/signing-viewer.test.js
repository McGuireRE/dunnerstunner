// Signing viewer (Tim, 26 November 2026): the one shared document viewer on every signing screen. Against the mock database, with a
// synthetic blank made at test time (tests/synthetic-blank.js). Covers, at 390 px on a phone:
//  - an offer signed in person on Tim's screen: the viewer's buttons in the highlight colour (light and dark), zoom in that holds
//    after tapping a place, after "Go to the next place to do", on the next and previous page, and on handing the device back and
//    starting the turn again (kept per signer: the next purchaser starts at the normal size); Next page and Previous page; full
//    screen opening and closing (the browser's own, and filling the window where there is none, as on an iPhone, left with Escape);
//    "Move to the next place for me" off until ticked, remembered, and then gliding to the next place still to do with the zoom kept;
//    drag to pan with a mouse, ctrl and a trackpad pinch, + and - keys; no sideways scroll of the page at 390 px even at 300%;
//    nothing signed changes (the places and the draft's fingerprint are as released);
//  - the agency agreement signed in person by two vendors on Tim's screen, and on a vendor's own phone: the same viewer on the front
//    page and the cancellation notices, the zoom holding after a signature is saved and the screen is drawn again, "Move to the next
//    place for me" gliding to the next vendor still to sign, and no sideways scroll at 390 px;
//  - the Vendor Declaration and a variation on the vendor's phone use the same viewer.
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
  const b = await chromium.launch(); const out = {}; const errs = [];
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

  // ── 1. an offer signed in person on Tim's screen ──
  process.stderr.write('offer\n');
  const { p, oid } = await sgSetup();
  let d = await db(p); const g0 = JSON.parse(JSON.stringify(d.offer_signings.find(x => x.offer_id === oid)));
  await turnStart(p, 1); await p.waitForSelector('#sgConsent'); await tick(p, '#sgAgree'); await p.click('#sgAgreeGo'); await p.waitForSelector('#sgGuides');
  // the Client and Customer Acknowledgement is read in the same viewer
  await p.waitForSelector('#sgCcaDv #sgCcaPages .dr-pg canvas'); const cca0 = await dv(p, 'sgCcaDv');
  await zoomIn(p, 'sgCcaDv', 1); const cca1 = await dv(p, 'sgCcaDv'); out.cca = { cca0, cca1 };
  expect(cca1.zoom === '125%' && cca1.pgW > cca0.pgW * 1.2 && !(await side(p)), 'the acknowledgement pages zoom in their own frame, drawn wider, with no sideways scroll of the screen');
  await p.click('#sgCcaDvOut'); await p.waitForTimeout(350);
  await tick(p, '#sgCcaOk'); await tick(p, '#sgSpOk'); await p.click('#sgGuidesGo'); await p.waitForSelector('#sgDraw');
  await draw(p, '#sgSig', 1); await draw(p, '#sgInit', 4); await p.click('#sgDrawGo'); await p.waitForSelector('#sgPlaces'); await p.waitForSelector('#sgPage .dr-pg canvas');
  const a0 = await accentOk(p); out.accentLight = a0;
  expect(a0.ok && a0.n >= 6, 'light: the viewer buttons use the highlight colour (' + a0.wb + ')'); expect(a0.sizes, 'large touch targets: every viewer button at least 44 px'); expect(a0.labelled, 'every viewer button is labelled');
  const v0 = await dv(p, 'sgDv'); out.v0 = v0;
  expect(v0.zoom === '100%' && /^Page \d+ of \d+$/.test(v0.page), 'the viewer starts at the normal size and says which page');
  expect(v0.sw <= v0.fw + 1 && v0.pgW <= v0.fw + 1, 'at the normal size the whole width of the page fits its frame');
  expect(v0.auto === false, '"Move to the next place for me" is off until ticked');
  expect(await p.isDisabled('#sgDvOut'), 'Zoom out waits until zoomed in');
  // zoom in twice: 150%, drawn wider inside the frame, the screen itself never scrolls sideways
  await zoomIn(p, 'sgDv', 2); const v1 = await dv(p, 'sgDv'); out.v1 = v1;
  expect(v1.zoom === '150%' && v1.pgW > v0.pgW * 1.4 && v1.sw > v1.fw, 'zoomed to 150%: the page is drawn wider and moves inside its frame');
  expect(/Zoomed to 150%/.test(await p.textContent('#bn-sgDvIn')), 'the zoom is confirmed just under the button pressed');
  expect(!(await side(p)), 'zoomed at 390 px: no sideways scroll of the page');
  // a place tapped: the zoom holds
  const c0 = await count(p); await p.$eval('#sgPage .sg-todo', el => el.click()); await p.waitForFunction(c => +document.querySelector('#sgCount').textContent.match(/(\d+) of/)[1] > c, c0); await p.waitForTimeout(200);
  const v2 = await dv(p, 'sgDv'); expect(v2.zoom === '150%' && Math.abs(v2.pgW - v1.pgW) < 2, 'after signing a place the zoom holds');
  // Next page and Previous page, zoom kept
  const pg0 = +v2.page.match(/Page (\d+)/)[1];
  await p.click('#sgNext'); await p.waitForSelector(`#sgPage .dr-pg[data-page="${pg0 + 1}"] canvas`); const v3 = await dv(p, 'sgDv');
  expect(v3.page.startsWith(`Page ${pg0 + 1} of`) && v3.zoom === '150%' && Math.abs(v3.pgW - v1.pgW) < 2 && await p.inputValue('#sgPgPick') === String(pg0 + 1), 'Next page: the next page, still at 150%, and the page list follows');
  await p.click('#sgPrev'); await p.waitForSelector(`#sgPage .dr-pg[data-page="${pg0}"] canvas`); const v4 = await dv(p, 'sgDv');
  expect(v4.page.startsWith(`Page ${pg0} of`) && v4.zoom === '150%', 'Previous page: back a page, still at 150%');
  await p.selectOption('#sgPgPick', '1'); await p.waitForSelector('#sgPage .dr-pg[data-page="1"] canvas'); await p.waitForTimeout(100);
  expect(await p.isDisabled('#sgPrev') && (await dv(p, 'sgDv')).page.startsWith('Page 1 of'), 'on page 1, Previous page waits');
  // Go to the next place to do keeps the zoom
  if (await p.$('#sgGoNext')) { await p.click('#sgGoNext'); await p.waitForTimeout(900); expect((await dv(p, 'sgDv')).zoom === '150%', '"Go to the next place to do" keeps the zoom'); }
  // drag to pan with a mouse
  { await p.$eval('#sgDvFrame', f => { f.scrollLeft = 0; }); const fr = await (await p.$('#sgDvFrame')).boundingBox(); const before = await dv(p, 'sgDv');
    await p.mouse.move(fr.x + fr.width - 20, fr.y + 60); await p.mouse.down(); await p.mouse.move(fr.x + 40, fr.y + 40, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(100);
    const after = await dv(p, 'sgDv'); out.pan = [before.sl, after.sl]; expect(after.sl > before.sl + 30, 'dragging moves the zoomed page sideways inside its frame'); }
  // + and - from the keyboard while the document has focus
  await p.focus('#sgDvFrame'); await p.keyboard.press('+'); await p.waitForTimeout(400); expect((await dv(p, 'sgDv')).zoom === '200%', 'the + key zooms in');
  await p.keyboard.press('-'); await p.waitForTimeout(400); expect((await dv(p, 'sgDv')).zoom === '150%', 'the - key zooms out');
  // ctrl and the wheel (a trackpad pinch on a computer)
  { const fr = await (await p.$('#sgDvFrame')).boundingBox(); await p.mouse.move(fr.x + fr.width / 2, fr.y + 80); await p.keyboard.down('Control'); await p.mouse.wheel(0, -60); await p.keyboard.up('Control'); await p.waitForTimeout(700);
    const z = parseInt((await dv(p, 'sgDv')).zoom); out.wheelZoom = z; expect(z > 150, 'ctrl and the wheel zoom in'); await p.evaluate(() => document.getElementById('sgDv')._dv.setZoom(1.5)); await p.waitForTimeout(400); }
  // a two-finger pinch on the phone
  { await p.evaluate(() => document.getElementById('sgDv')._dv.setZoom(1)); await p.waitForTimeout(400);
    const cdp = await ctx.newCDPSession(p); const fr = await (await p.$('#sgDvFrame')).boundingBox(); const cx = fr.x + fr.width / 2, cy = fr.y + Math.min(fr.height, 300) / 2;
    const pts = dd => [{ x: cx - dd, y: cy, id: 1 }, { x: cx + dd, y: cy, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(30) });
    for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(30 + i * 5) }); await p.waitForTimeout(30); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(700);
    const z = parseInt((await dv(p, 'sgDv')).zoom); out.pinchZoom = z; expect(z >= 180 && z <= 220, 'a pinch spreading two fingers to double their distance zooms to about 200%');
    await p.evaluate(() => document.getElementById('sgDv')._dv.setZoom(1.5)); await p.waitForTimeout(400); await cdp.detach(); }
  // zoom right up: still no sideways scroll of the screen
  await zoomIn(p, 'sgDv', 3); expect((await dv(p, 'sgDv')).zoom === '300%' && await p.isDisabled('#sgDvIn') && !(await side(p)), 'at 300%, Zoom in waits, and the screen still has no sideways scroll'); await shot(p, 'dv_300');
  for (let i = 0; i < 3; i++) { await p.click('#sgDvOut'); await p.waitForTimeout(350); }
  expect((await dv(p, 'sgDv')).zoom === '150%', 'zoom out steps back to 150%');
  // full screen: the browser's own, closed with Close full screen
  await p.click('#sgDvFull'); await p.waitForTimeout(500); const f1 = await dv(p, 'sgDv'); out.full = f1;
  expect(f1.full && f1.zoom === '150%' && await p.isVisible('#sgDvClose') && await p.isHidden('#sgDvFull'), 'full screen opens with an obvious Close full screen button, keeping the zoom');
  expect(await p.evaluate(() => document.activeElement && document.activeElement.id) === 'sgDvClose', 'the Close button has the focus');
  { const t = await p.$('#sgPage .sg-todo'); if (t) { const c1 = await count(p); await t.evaluate(el => el.click()); await p.waitForFunction(c => +document.querySelector('#sgCount').textContent.match(/(\d+) of/)[1] > c, c1); expect((await dv(p, 'sgDv')).full, 'places can be done in full screen'); } }
  await p.click('#sgDvClose'); await p.waitForTimeout(500); const f2 = await dv(p, 'sgDv');
  expect(!f2.full && !f2.native && !f2.lock && f2.zoom === '150%' && await p.isVisible('#sgDvFull'), 'Close full screen leaves it, zoom kept'); expect(!(await side(p)), 'after full screen: no sideways scroll');
  // "Move to the next place for me": ticked, remembered, and then a tap glides to the next place still to do
  await tick(p, '#sgDvAuto'); expect(/moves to the next one for you/.test(await p.textContent('#bn-sgDvAutoL')), 'the tick is confirmed just under it');
  const nextOf = () => p.evaluate(() => { const t = [...document.querySelectorAll('#sgPage .sg-todo')]; return t.map(x => x.dataset.id); });
  { const todo = await nextOf(); if (todo.length >= 2) { const c1 = await count(p); await p.$eval(`#sgPage .sg-place[data-id="${todo[0]}"]`, el => el.click());
      await p.waitForFunction(c => +document.querySelector('#sgCount').textContent.match(/(\d+) of/)[1] > c, c1); await p.waitForTimeout(900);
      const act = await p.evaluate(() => { const a = document.activeElement; const f = document.getElementById('sgDvFrame').getBoundingClientRect(), r = a.getBoundingClientRect(); return { id: a.dataset && a.dataset.id, inView: r.top >= Math.max(0, f.top) - 2 && r.bottom <= Math.min(innerHeight, f.bottom) + 2 }; });
      out.glide = act; expect(act.id && todo.slice(1).includes(act.id) && act.inView, 'after a place, the next place still to do is brought into view and focused'); expect((await dv(p, 'sgDv')).zoom === '150%', 'the glide keeps the zoom'); } }
  // the last place on a page: the glide carries on to the next page with a place to do
  { for (let i = 0; i < 40; i++) { const todo = await nextOf(); if (todo.length !== 1) { if (!todo.length) break; const c1 = await count(p); await p.$eval(`#sgPage .sg-place[data-id="${todo[0]}"]`, el => el.click()); await p.waitForFunction(c => +document.querySelector('#sgCount').textContent.match(/(\d+) of/)[1] > c, c1); await p.waitForTimeout(700); continue; }
      const pgA = +(await dv(p, 'sgDv')).page.match(/Page (\d+)/)[1], c1 = await count(p); await p.$eval(`#sgPage .sg-place[data-id="${todo[0]}"]`, el => el.click()); await p.waitForFunction(c => +document.querySelector('#sgCount').textContent.match(/(\d+) of/)[1] > c, c1); await p.waitForTimeout(1200);
      const v = await dv(p, 'sgDv'), pgB = +v.page.match(/Page (\d+)/)[1]; out.carry = [pgA, pgB];
      if (await count(p) < +(await p.textContent('#sgCount')).match(/of (\d+)/)[1]) expect(pgB > pgA && v.zoom === '150%' && await p.evaluate(() => !!(document.activeElement && document.activeElement.classList.contains('sg-todo'))), 'the last place on a page: on to the next page with a place, still zoomed, the place focused');
      break; } }
  // hand the device back and start the turn again: the zoom and the tick held for this purchaser; the next purchaser starts fresh
  await handBack(p); await turnStart(p, 1); await p.waitForSelector('#sgPlaces'); await p.waitForSelector('#sgPage .dr-pg canvas'); await p.waitForTimeout(300);
  const v5 = await dv(p, 'sgDv'); out.back = v5; expect(v5.zoom === '150%' && v5.auto === true && Math.abs(v5.pgW - v1.pgW) < 2, 'coming back to the screen: the zoom and the tick are as this purchaser left them');
  await handBack(p); await turnStart(p, 2); await p.waitForSelector('#sgConsent'); await tick(p, '#sgAgree'); await p.click('#sgAgreeGo'); await p.waitForSelector('#sgGuides'); await tick(p, '#sgCcaOk'); await tick(p, '#sgSpOk'); await p.click('#sgGuidesGo');
  await p.waitForSelector('#sgDraw'); await draw(p, '#sgSig', 2); await draw(p, '#sgInit', 5); await p.click('#sgDrawGo'); await p.waitForSelector('#sgPlaces'); await p.waitForSelector('#sgPage .dr-pg canvas');
  const v6 = await dv(p, 'sgDv'); expect(v6.zoom === '100%' && v6.auto === false, 'the next purchaser on Tim\'s device starts at the normal size, with the tick off');
  // nothing signed changed: the places, the method and the draft's fingerprint are as released
  d = await db(p); const g1 = d.offer_signings.find(x => x.id === g0.id);
  expect(JSON.stringify(g1.places) === JSON.stringify(g0.places) && g1.draft_sha256 === g0.draft_sha256, 'the signing places and the draft\'s fingerprint are untouched');
  // dark mode: the same highlight colour (the dark accent with its dark text)
  await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(200); const a1 = await accentOk(p); out.accentDark = a1;
  expect(a1.ok && a1.wb !== a0.wb, 'dark: the viewer buttons use the dark highlight colour (' + a1.wb + ')'); await shot(p, 'dv_dark'); await p.emulateMedia({ colorScheme: 'light' });

  // full screen where the browser has none (an iPhone): the viewer fills the window, and Escape leaves
  process.stderr.write('fallback\n');
  { const q = await page(); await q.addInitScript(() => { delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen; });
    await q.goto(BASE); await q.evaluate(([dbs, a, ses]) => { localStorage.setItem('mockdb', dbs); localStorage.setItem('mockAgents', JSON.stringify([a])); localStorage.setItem('mocksession', ses); }, [JSON.stringify(await db(p)), AGENT, SESSION]);
    await q.goto(BASE); await q.waitForTimeout(600); await openProp(q); await q.click(`[data-offer="${oid}"]`); await q.waitForSelector('[data-signing]'); await q.click('[data-signing]'); await q.waitForSelector('#sgView');
    await turnStart(q, 2); await q.waitForSelector('#sgPlaces'); await q.waitForSelector('#sgPage .dr-pg canvas');
    await q.click('#sgDvFull'); await q.waitForTimeout(400); const f = await dv(q, 'sgDv'); const box = await (await q.$('#sgDv')).boundingBox();
    out.fallback = { f, box }; expect(f.full && !f.native && f.lock && box.width >= 389 && box.height >= 800, 'no Fullscreen API: the viewer fills the window and the screen behind it stays still');
    expect(!(await side(q)), 'full screen fallback at 390 px: no sideways scroll');
    await q.keyboard.press('Escape'); await q.waitForTimeout(300); const f3 = await dv(q, 'sgDv'); expect(!f3.full && !f3.lock && await q.isVisible('#sgDvFull'), 'Escape leaves full screen');
    await q.close(); }

  // reduced motion: the glide is instant
  { await p.emulateMedia({ reducedMotion: 'reduce' }); await tick(p, '#sgDvAuto'); const todo = await nextOf();
    if (todo.length >= 2) { const c1 = await count(p); await p.$eval(`#sgPage .sg-place[data-id="${todo[0]}"]`, el => el.click()); await p.waitForFunction(c => +document.querySelector('#sgCount').textContent.match(/(\d+) of/)[1] > c, c1); await p.waitForTimeout(150);
      expect(await p.evaluate(() => !!(document.activeElement && document.activeElement.classList.contains('sg-todo'))), 'with less motion asked for, it moves to the next place at once'); }
    await p.emulateMedia({ reducedMotion: 'no-preference' }); }
  await p.close();

  // ── 2. the agency agreement: two vendors on Tim's screen, then one on their own phone ──
  process.stderr.write('agreement\n');
  { const TIM = 'hello@timmcguire.co.nz';
    const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); c2.setDefaultTimeout(20000);
    await c2.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
    await c2.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    await c2.route('https://packages.dunnerstunner.co.nz/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
    await c2.route('https://packages.dunnerstunner.co.nz/onboarding/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    const q = await c2.newPage(); q.on('pageerror', e => errs.push('agreement page: ' + e.message)); q.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('agreement console: ' + m.text()); }); q.on('dialog', x => x.accept());
    const tk = sel => q.$$eval(sel, els => els.forEach(el => { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }));
    const go = async () => { await q.goto(BASE); await q.waitForTimeout(500); };
    const pad = async sel => { const cv = await q.$(sel); await cv.evaluate(el => el.scrollIntoView({ block: 'center' })); await q.waitForTimeout(100); const bb = await cv.boundingBox(); await q.mouse.move(bb.x + 20, bb.y + 60); await q.mouse.down(); await q.mouse.move(bb.x + 200, bb.y + 80, { steps: 8 }); await q.mouse.up(); };
    await go(); await q.evaluate(t => { localStorage.clear(); localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'agent-1', email: t } })); }, TIM); await go();
    await q.click('#navDash'); await q.waitForTimeout(500); await q.click('#newAg'); await q.waitForTimeout(300);
    await q.fill('#tAddr', '14 Example Street, Testville'); await q.fill('#t_owners', 'Testy Ann Vendor, Second Vendor');
    await q.fill('#tPeople [data-pk=legal_name]', 'Testy Ann Vendor'); await q.fill('#tPeople [data-pk=email]', 'testy@example.com');
    await q.click('#tAddP'); await q.fill('#tPeople [data-i="1"] [data-pk=legal_name]', 'Second Vendor'); await q.fill('#tPeople [data-i="1"] [data-pk=email]', 'second@example.com');
    await tk('[data-an=titleOk]'); await q.fill('#t_ask', '750000'); await q.fill('#t_pBed', '3'); await q.fill('#t_pBath', '1');
    for (const k of ['work', 'wt', 'meth', 'def']) await tk(`input[name=t_an_${k}][value=no]`);
    await q.click('#next'); await q.waitForTimeout(400); await q.fill('#t_flat', '10000'); await q.fill('#t_pct', '3.5');
    await tk('input[name=t_an_prior][value=yes]'); await q.waitForTimeout(100);
    await q.fill('#tPrior .pa:nth-child(1) [data-pa=agency]', 'Example Realty Ltd'); await q.fill('#tPrior .pa:nth-child(1) [data-pa=agent]', 'Sam Example'); await q.fill('#tPrior .pa:nth-child(1) [data-pa=dated]', '3 August 2026'); await q.fill('#tPrior .pa:nth-child(1) [data-pa=email]', 'sam@example.com');
    await q.click('#tAddPA'); await q.fill('#tPrior .pa:nth-child(2) [data-pa=agency]', 'Another Homes'); await q.selectOption('#tPrior .pa:nth-child(2) [data-pa=kind]', 'General agency');
    await q.click('#next'); await q.waitForSelector('#tFrontDv');
    expect(await q.$('#tNoticeDv .notice'), 'Tim\'s signing screen: the cancellation notices are in the shared viewer');
    expect(/^Page 1 of 2$/.test((await dv(q, 'tNoticeDv')).page), 'two notices: Page 1 of 2');
    await q.click('#tNoticeDvNext'); await q.waitForTimeout(900); expect(/^Page 2 of 2$/.test((await dv(q, 'tNoticeDv')).page), 'Next page moves to the second notice');
    expect((await dv(q, 'tFrontDv')).auto === false, 'two vendors: "Move to the next place for me" is there, off until ticked');
    await zoomIn(q, 'tFrontDv', 2); const z1 = await dv(q, 'tFrontDv'); out.agZoom = z1;
    expect(z1.zoom === '150%' && z1.cssZoom === '1.5' && !(await side(q)), 'the front page zooms to 150% with no sideways scroll at 390 px');
    await tk('#tFrontDvAuto');
    await tk('[data-tmulti=guide]'); await tk('[data-tmulti=acks]'); await tk('input[name=tLegal][value=have]');
    const first = await q.$eval('[data-signer]', e => e.dataset.signer); await pad('#pad_' + first); await tk(`[data-tnotice="${first}"]`);
    await q.click(`[data-signnow="${first}"]`); await q.waitForFunction(f => !document.querySelector(`[data-signnow="${f}"]`) && document.querySelector('#tFrontDv'), first, { timeout: 20000 }); await q.waitForTimeout(1200);
    const z2 = await dv(q, 'tFrontDv'); out.agAfter = z2;
    expect(z2.zoom === '150%' && z2.cssZoom === '1.5' && z2.auto === true, 'after a vendor signs and the screen is drawn again, the zoom and the tick hold');
    const nx = await q.evaluate(() => { const c = document.querySelector('[data-signer]'); const r = c.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight }; }); out.agGlide = nx;
    expect(nx.top < nx.h && nx.bottom > 0, 'and it glides on to the next vendor still to sign');
    expect(!(await side(q)), 'after signing: no sideways scroll at 390 px'); await q.screenshot({ path: path.join(__dirname, 'out', 'dv_agreement.png'), fullPage: true });
    // the second vendor signs on their own phone: the same viewer on their front page and the notices
    await q.click('#tSendPhones'); await q.waitForTimeout(3200);
    await q.evaluate(() => { localStorage.removeItem('dvZoom:me'); localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'v-second', email: 'second@example.com' } })); }); await go();
    await q.waitForSelector('#agDv'); const y0 = await dv(q, 'agDv'); out.vendor0 = y0;
    expect(y0.zoom === '100%' && /^Page 1 of 3$/.test(y0.page), 'the vendor\'s own phone: the front page and two notices, three pages, at the normal size');
    await zoomIn(q, 'agDv', 1); expect((await dv(q, 'agDv')).zoom === '125%' && !(await side(q)), 'the vendor zooms to 125%, no sideways scroll');
    await q.click('#agDvNext'); await q.waitForTimeout(900); expect(/^Page 2 of 3$/.test((await dv(q, 'agDv')).page), 'Next page: the first notice');
    await q.click('#agDvPrev'); await q.waitForTimeout(900); expect(/^Page 1 of 3$/.test((await dv(q, 'agDv')).page), 'Previous page: back to the front page');
    await go(); await q.waitForSelector('#agDv'); expect((await dv(q, 'agDv')).zoom === '125%', 'coming back to the screen, the vendor\'s zoom holds');
    const a2 = await accentOk(q); expect(a2.ok && a2.sizes, 'the vendor\'s viewer buttons use the highlight colour, with large touch targets');
    await q.click('#agDvFull'); await q.waitForTimeout(400); expect((await dv(q, 'agDv')).full, 'full screen on the agreement'); await q.click('#agDvClose'); await q.waitForTimeout(400); expect(!(await dv(q, 'agDv')).full, 'and closed again');
    const bg = await q.$eval('#sig0', e => getComputedStyle(e.closest('.sig-wrap')).backgroundColor); expect(bg === 'rgb(255, 255, 255)', 'the signature pad stays white');
    await c2.close(); }

  // the viewer's wording is in the catalogue of vendor wording (src/strings.js), like every other screen, with no dashes
  { const STR = new Function('window', fs.readFileSync(path.join(__dirname, '..', 'src', 'strings.js'), 'utf8') + '; return window.I18N_STRINGS;')({});
    const all = new Set(Object.values(STR).flatMap(gs => gs.flatMap(([, l]) => l))); const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
    const sec = app.slice(app.indexOf('/* ───── the signing viewer'), app.indexOf('function dvWire')) + app.slice(app.indexOf('function dvWire'), app.indexOf('return V;\n  }'));
    const used = [...sec.matchAll(/trs\('((?:[^'\\]|\\.)*)'/g)].map(m => m[1]).concat(['Document controls', 'Previous page', 'Next page', 'Zoom out', 'Zoom in', 'Full screen', 'Close full screen', 'Move to the next place for me', 'The document. Drag or scroll to move around it.']);
    out.viewerWords = used.length; const missing = used.filter(w => !all.has(w)); expect(!missing.length, 'the viewer\'s wording is all in src/strings.js: ' + missing.join(' | '));
    expect(!used.some(w => /[\u2014\u2013]/.test(w)), 'no dashes in the viewer\'s wording'); }

  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
  await b.close();
})().catch(e => { console.log(JSON.stringify({ errs: ['crashed: ' + (e.stack || e.message)] })); process.exit(0); });

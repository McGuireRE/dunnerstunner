// Offers phase 3: purchasers sign, against the mock database, with a synthetic blank made at test time (tests/synthetic-blank.js;
// the real form is never copied here). Covers: "Ready to sign" on an approved draft, with the signing places made with no set-up
// (the foot of every page, every filled or marked box, each further term, the signature block, Tim's kept acknowledgement), the
// Client and Customer Acknowledgement found, nothing sent; four purchasers signing in person on Tim's device, each agreeing first,
// receipting both guides, drawing once and tapping every place themselves (no "apply to all", Finish only when every place is
// done), Tim recording he saw them and the ID type; a line through text, its reinstatement and a freehand note on Tim's screen, each
// sending the draft back to Tim, who re-approves, and everyone (the one who had finished too) initialling each; Round 1 locked with
// its execution record on a page at the end, no contact details on the PDF, the original content kept byte for byte, the timeline's
// hash chain checked; by link: nothing sent until Send, a personal link and a one-time code by email, a wrong code refused, no
// marking from a link but "Ask Tim for a change" emailed to him, each signer seeing only their own places and offer; tweak and
// re-sign voiding the earlier signatures (kept, shown as replaced, the old link dead); a vendor and another buyer seeing nothing; 390
// px with no sideways scroll; light and dark; the signature pads white in both.
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

  // ── 1. Tim's set-up: offers in, the blank loaded with its CCA page, the AI's acknowledgement kept, places approved ──
  process.stderr.write('step 1\n');
  let p = await page(); await asAgent(p);
  await rpc(p, 'agent_offer_link', { p_property: 'P1', p_action: 'open' }); await rpc(p, 'agent_offer_clause', { p_key: 'electrical', p_wording: 'Synthetic electrical wording from Tim.' });
  const offA = (await rpc(p, 'agent_offer_add', { p_property: 'P1', p_offer: offer() })).data;
  const offB = (await rpc(p, 'agent_offer_add', { p_property: 'P1', p_offer: offer({ sign: 'digital', price: '640000', conditions: [{ key: 'finance', days: 10 }], chattels_add: [], chattels_exclude: [], purchasers: [{ first: 'Eve', last: 'Linkbuyer', email: 'eve.l@example.com', phone: '027 100 2000' }, { first: 'Fin', last: 'Linkbuyer', email: 'fin.l@example.com', phone: '027 300 4000' }] }) })).data;
  await openProp(p);
  const blank = Buffer.from(await SB.make({ cca: true }));
  await p.setInputFiles('#drFile', { name: 'Agreement pack.pdf', mimeType: 'application/pdf', buffer: blank });
  await p.waitForSelector('#drMap', { timeout: 30000 }); await p.click('#drAiGo'); await p.waitForSelector('#drProps', { timeout: 20000 });
  await p.click('[data-pkeep="0"]'); await p.waitForTimeout(150); await p.click('#drApprove'); await p.waitForSelector('#offTile');

  // ── 2. draft offer A with a further term of Tim's, approve it, and tap Ready to sign ──
  process.stderr.write('step 2\n');
  const draftAndApprove = async (oid, extra) => {
    await p.click(`[data-offer="${oid}"]`); await p.waitForSelector('#drDraftBtn'); await p.click('#drDraftBtn'); await p.waitForSelector('#drReview', { timeout: 30000 });
    if (extra) { await p.fill('#drExtra', extra); await p.click('#drRedraft'); await p.waitForSelector('#drReview h1:has-text("Draft 2")', { timeout: 30000 }); }
    await p.waitForSelector('#drApproveDraft:not([disabled])'); await p.click('#drApproveDraft'); await p.waitForSelector('#sgReady'); };
  await draftAndApprove(offA, 'Synthetic extra term from Tim for signing.');
  let d = await db(p); const drA = d.offer_drafts.filter(x => x.offer_id === offA).sort((a, z) => z.number - a.number)[0];
  expect(!(d.offer_signings || []).length, 'approving does not release anything');
  await p.click('#sgReady'); await p.waitForSelector('#sgReleaseView', { timeout: 30000 }); await p.waitForSelector('#sgCanvas .sg-place');
  out.summary = await p.$$eval('[data-sgsum]', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  expect(out.summary.length === 4 && out.summary.every(t => /the foot of each page/.test(t) && /beside each box filled or marked/.test(t) && /beside each further term/.test(t) && /the signature block/.test(t) && /acknowledgements you kept/.test(t)), 'every purchaser has places at each page foot, each filled box, each further term, the signature block and the acknowledgement');
  expect(!(await p.$('#sgWarn')), 'no warnings: the places are made with no set-up');
  expect(await p.inputValue('#sgCca') === '10', 'the Client and Customer Acknowledgement found on page 10');
  expect(await p.isChecked('input[name="sgMethod"][value="in_person"]'), 'in person chosen, as the buyer asked');
  expect(!(await side(p)), 'Ready to sign at 390 px: no sideways scroll'); await shot(p, 'release');
  await p.click('#sgRelease'); await p.waitForSelector('#sgView');
  d = await db(p); const gA = d.offer_signings.find(x => x.offer_id === offA);
  const drPages = (await D.readPages(pdfjs, await blob(p, drA.path))).length;
  out.placesA = gA.places.length; out.pagesA = drPages;
  expect(gA.status === 'ready' && gA.method === 'in_person' && JSON.stringify(gA.cca_pages) === '[10]' && gA.draft_sha256 === drA.sha256, 'released: ready, in person, with the acknowledgement pages and the draft\'s fingerprint');
  for (let s = 1; s <= 4; s++) { const mine = gA.places.filter(x => x.signer === s);
    expect(new Set(mine.filter(x => x.why === 'foot').map(x => x.page)).size === drPages, `purchaser ${s}: initials at the foot of every page`);
    expect(mine.filter(x => x.why === 'term').length === 2 && mine.filter(x => x.kind === 'signature' && x.why === 'block').length === 1, `purchaser ${s}: each further term and a signature`);
    expect(mine.filter(x => x.why === 'ack').length === 1, `purchaser ${s}: the acknowledgement Tim kept`); }
  const filledRefs = new Set(gA.places.filter(x => x.why === 'filled').map(x => x.ref)); const placedIds = drA.placed.filter(x => (x.boxes || []).length && x.id !== 'further_terms' && !/^name_purchaser_/.test(x.id)).map(x => /^chattel_x_/.test(x.id) ? x.id : (x.place || x.id)).map(r => /^d_/.test(r) ? 'c_' + r.slice(2) : r);   // a condition's date is initialled with its Yes/No row
  expect(placedIds.every(r => filledRefs.has(r)), 'every box the draft filled or marked has initials');
  expect(!gA.places.some(x => x.ref === 'date') && !drA.placed.some(x => x.id === 'date'), 'the date at the top stays blank and has no place');
  expect(gA.places.some(x => x.signer === 4 && x.kind === 'name') && gA.places.some(x => x.signer === 4 && x.added), 'the fourth purchaser gets a signature and name added beneath the printed three');
  expect(!(await mails(p)).length && !(d.email_log || []).some(e => /offer_sign/.test(e.kind)), 'nothing sent');
  expect(d.offer_events.some(e => e.kind === 'sign_released' && e.detail.signing_id === gA.id), 'released, recorded');
  expect(!(await side(p)), 'signing screen at 390 px: no sideways scroll');

  // ── 3. purchaser 1 signs in person: agree, read, draw once, tap every place, Tim records he saw it and the ID type ──
  process.stderr.write('step 3\n');
  await turnStart(p, 1); await agreeReadDraw(p, 1);
  out.need1 = +(await p.textContent('#sgCount')).match(/of (\d+)/)[1];
  expect(out.need1 === gA.places.filter(x => x.signer === 1).length, 'the count is every one of their places');
  expect(!(await p.$$eval('#sgFlow button', bs => bs.some(x => /all/i.test(x.textContent)))), 'no "apply to all"');
  // Tim mediates: one plain line at the final confirm step only, never beside each place, and a tap raises nothing
  { const t = await p.$$eval('#main *', es => { const re = /goes straight to Tim McGuire/; return es.filter(e => re.test(e.textContent) && ![...e.children].some(c => re.test(c.textContent))).length; });
    const beside = await p.$eval('#sgToTimOnly', e => !!e.closest('section') && !!e.closest('section').querySelector('#sgFinishGo'));
    out.toTimLine = { t, beside, text: await p.textContent('#sgToTimOnly') };
    expect(t === 1 && beside && /He will be in touch with the other party; they are not told until he does\./.test(await p.textContent('#sgToTimOnly')), 'the line shows once, beside Finish, with Tim\'s name'); }
  expect(await p.isDisabled('#sgFinishGo'), 'Finish waits until every place is done');
  expect(await p.$('#sgTools') && !(await p.$('#sgAskBox')), "on Tim's screen the page can be marked");
  expect(!(await side(p)), 'the places at 390 px: no sideways scroll'); await shot(p, 'places');
  const tapped = await tapAll(p, 5); expect(tapped === 5 && await count(p) === 5, 'each tap does one place');
  d = await db(p); expect(d.offer_sign_taps.filter(t => t.signer_id === d.offer_signers.find(s => s.signing_id === gA.id && s.position === 1).id).length === 5, 'each tap recorded on the server');
  await tapAll(p); expect(await count(p) === out.need1 && !(await p.isDisabled('#sgFinishGo')), 'all places done: Finish is available');
  await p.click('#sgFinishGo'); expect(/saw them sign/.test(await p.textContent('#sgErr')), 'Tim must record that he saw them sign');
  await tick(p, '#sgSaw');
  // identity is a free choice: Neither is chosen at the start; picking "ID checked" asks only what was seen
  expect(await p.isChecked('input[name="sgIdWho"][value=""]') && await p.$('input[name="sgIdWho"][value="known"]') && await p.$('input[name="sgIdWho"][value="checked"]'), 'the choice offers Known to the agent, ID checked, or neither (the starting choice)');
  await p.$eval('input[name="sgIdWho"][value="checked"]', e => e.click()); await p.click('#sgFinishGo'); expect(/Choose what ID you saw, or choose Neither/.test(await p.textContent('#sgErr')), 'ID checked asks what was seen');
  await p.selectOption('#sgIdType', 'passport'); await p.click('#sgFinishGo'); await p.waitForSelector('#sgHandback'); await p.click('#sgImTim'); await p.waitForSelector('#sgView');
  d = await db(p); const s1 = d.offer_signers.find(s => s.signing_id === gA.id && s.position === 1);
  expect(s1.finished_at && s1.id_sighted === 'passport' && s1.witnessed_by && /^[0-9a-f]{64}$/.test(s1.seen_sha256), 'finished: witnessed, the ID type only, and the fingerprint of what they saw');
  expect(/Finished/.test(await p.textContent('#sgSigners [data-signer="1"]')), 'Tim sees purchaser 1 has finished');
  expect(/Ana Maria Testbuyer has started signing, so this can't be changed/.test(await p.textContent('#sgMethodNo')) && !(await p.$('#sgChange')), 'once someone has started, the method can\'t be changed, and Tim is told why');
  expect(d.offer_signings.find(x => x.id === gA.id).status === 'signing', 'signing is under way');

  // ── 4. purchaser 2 marks the page on Tim's screen: a line through text; signing holds; Tim re-approves; then a reinstatement and a note ──
  process.stderr.write('step 4\n');
  await turnStart(p, 2); await agreeReadDraw(p, 2);
  const markCycle = async (tool, act) => {
    await p.selectOption('#sgPgPick', '2'); await p.waitForSelector('#sgPage .dr-pg[data-page="2"]');
    await p.click(`[data-tool="${tool}"]`); await p.waitForSelector(tool === 'reinstate' ? '#sgPage .sg-mark' : '#sgPage .sg-draw', { state: 'attached' });
    await act(); await p.waitForSelector('#sgMarkSave:not([disabled])'); await p.click('#sgMarkSave'); await p.waitForSelector('#sgHeldMsg');
    expect(/Sent to Tim to check/.test(await p.textContent('#sgHeldMsg')), `a ${tool}: sent to Tim to check`);
    await p.click('#sgToTim'); await p.waitForSelector('#sgHandback'); await p.click('#sgImTim'); await p.waitForSelector('#sgHeld'); await p.waitForSelector('#sgHeldCanvas .sg-marks .sg-mark', { state: 'attached' });
    expect(!(await side(p)), 'checking a mark at 390 px: no sideways scroll');
    await p.click('#sgReview'); await p.waitForSelector('#sgView:not(:has(#sgHeld))'); };
  const drag = async (fx, fy, tx, ty, steps) => { await (await p.$('#sgPage .sg-draw')).scrollIntoViewIfNeeded(); const bx = await (await p.$('#sgPage .sg-draw')).boundingBox(); await p.mouse.move(bx.x + bx.width * fx, bx.y + bx.height * fy); await p.mouse.down(); await p.mouse.move(bx.x + bx.width * tx, bx.y + bx.height * ty, { steps: steps || 6 }); await p.mouse.up(); };
  await markCycle('strike', () => drag(0.08, 0.30, 0.6, 0.30));
  d = await db(p); const st1 = d.offer_sign_marks.find(m => m.kind === 'strike');
  expect(st1 && st1.page === 2 && st1.geometry.x1 - st1.geometry.x0 > 100 && st1.by_name === 'Bo Testbuyer', 'the line through text recorded with who');
  expect(d.offer_events.some(e => e.kind === 'sign_marked' && e.detail.kind === 'strike'), 'and when, on the timeline');
  expect(d.offer_signings.find(x => x.id === gA.id).status === 'signing' && d.offer_sign_reviews.length === 1 && d.offer_sign_reviews[0].places.length === 4, 'Tim re-approved: every purchaser initials the mark');
  expect(/Signing: \d+ of \d+/.test(await p.textContent('#sgSigners [data-signer="1"]')), 'purchaser 1, who had finished, signs again');
  const blankDraft = await blob(p, drA.path); expect(sha(blankDraft) === drA.sha256, 'the approved draft itself is unchanged by the mark');
  await turnStart(p, 2); await p.waitForSelector('#sgPlaces');
  await markCycle('reinstate', async () => { await p.waitForFunction(() => { const g = document.querySelector('#sgPage .sg-mark'); return g && g.style.cursor === 'pointer'; }); await p.evaluate(() => { const g = document.querySelector('#sgPage .sg-mark'); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); });
  d = await db(p); const re1 = d.offer_sign_marks.find(m => m.kind === 'reinstate'); expect(re1 && re1.target === st1.id, 'the reinstatement restores the struck text');
  expect(d.offer_sign_reviews.length === 2 && d.offer_sign_reviews[1].places.every(x => x.ref === re1.id), 'the reinstatement needs its own initials, from everyone');
  await turnStart(p, 2); await p.waitForSelector('#sgPlaces');
  await markCycle('note', () => drag(0.5, 0.55, 0.8, 0.6, 10));
  d = await db(p); const nt1 = d.offer_sign_marks.find(m => m.kind === 'note'); expect(nt1 && nt1.geometry.strokes[0].length >= 5, 'a freehand note with a finger or stylus');
  // a mark can't be saved from a link (shown in step 7); on Tim's screen the db refuses a mark off the page
  const offPage = await rpc(p, 'agent_signing_mark', { p_signer: d.offer_signers.find(s => s.signing_id === gA.id && s.position === 2).id, p_kind: 'cross', p_page: 2, p_geometry: { x: 560, y: 10, w: 100, h: 40 }, p_target: null });
  expect(offPage.error && /doesn't sit on the page/.test(offPage.error.message), 'a crossed box off the page is refused');

  // ── 5. everyone finishes; Round 1 is made and locked ──
  process.stderr.write('step 5\n');
  await turnStart(p, 2); await p.waitForSelector('#sgPlaces'); await tapAll(p); await tick(p, '#sgSaw'); await p.selectOption('#sgIdType', 'nz_driver_licence'); await p.click('#sgFinishGo'); await p.waitForSelector('#sgHandback'); await p.click('#sgImTim'); await p.waitForSelector('#sgView');
  await turnStart(p, 1); await p.waitForSelector('#sgPlaces');
  expect(await count(p) === out.need1 && +(await p.textContent('#sgCount')).match(/of (\d+)/)[1] === out.need1 + 3, 'purchaser 1 picks up where they left off, with the three marks to initial');
  await tapAll(p); await tick(p, '#sgSaw'); await p.selectOption('#sgIdType', 'passport'); await p.click('#sgFinishGo'); await p.waitForSelector('#sgHandback'); await p.click('#sgImTim'); await p.waitForSelector('#sgView');
  // purchaser 3: known to the agent; purchaser 4: no choice at all (optional, never blocks)
  for (const n of [3, 4]) { await turnStart(p, n); await agreeReadDraw(p, n); await tapAll(p); await tick(p, '#sgSaw'); if (n === 3) await p.$eval('input[name="sgIdWho"][value="known"]', e => e.click()); await p.click('#sgFinishGo'); await p.waitForSelector('#sgHandback'); await p.click('#sgImTim'); await p.waitForSelector('#sgView'); }
  { const d0 = await db(p), s3 = d0.offer_signers.find(s => s.signing_id === gA.id && s.position === 3), s4 = d0.offer_signers.find(s => s.signing_id === gA.id && s.position === 4);
    expect(s3.id_sighted === 'known_to_tim' && s3.finished_at, 'known to the agent: recorded');
    expect(s4.id_sighted == null && s4.finished_at, 'no identity choice: finished, and recorded as none');
    const ev4 = d0.offer_events.find(e => e.kind === 'sign_finished' && e.detail.signing_id === gA.id && e.detail.signer === 4); expect(ev4 && ev4.detail.id_sighted == null && 'id_sighted' in ev4.detail, 'the audit trail records that no choice was made'); }
  await p.waitForSelector('#sgRound', { timeout: 30000 });
  d = await db(p); const rA = d.offer_rounds.find(r => r.offer_id === offA);
  expect(rA && rA.number === 1 && d.offer_signings.find(x => x.id === gA.id).status === 'locked', 'Round 1 locked when the last purchaser finished');
  const roundPdf = await blob(p, rA.path); expect(roundPdf && sha(roundPdf) === rA.sha256 && d.offer_file_hashes.some(h => h.path === rA.path && h.sha256 === rA.sha256), 'Round 1 stored with its fingerprint, confirmed from the stored file');
  const rt = await pdfText(roundPdf); out.roundPages = rt.length;
  const rec = rt.slice(drPages).join(' ');
  expect(rt.length > drPages && /Execution record/.test(rec) && !rt.slice(0, drPages).some(t => /Execution record/.test(t)), 'the execution record is on pages added at the end, never on the REINZ pages');
  expect(['Ana Maria Testbuyer', 'Bo Testbuyer', 'Cy Testbuyer', 'Di Testbuyer'].every(n => rec.includes(n)) && /saw them sign/.test(rec) && /Photo ID sighted: Passport/.test(rec) && /NZ driver licence/.test(rec) && /known to Tim McGuire personally/.test(rec) && /Identity: no choice recorded \(knowing them and an ID check are both optional\)/.test(rec), 'it names each signer, how they signed and the ID type (or that Tim knows them, or that no choice was made)');
  expect(/Fingerprint \(SHA-256\) of what they saw and signed: [0-9a-f]{64}/.test(rec) && rec.includes(drA.sha256), 'with the fingerprints of the draft and of what each saw');
  expect(/line through text by Bo Testbuyer/.test(rec) && /reinstatement by Bo Testbuyer/.test(rec) && /note by Bo Testbuyer/.test(rec), 'and each mark, with who and when');
  out.leak = (rt.join(' ').match(/buyer\.own@|ana\.p@|bo\.p@|cy\.p@|di\.p@|999 8888|777 6666|555 4444|333 2222|111 0000|vendor@example|000 1111/g) || []);
  expect(!out.leak.length, 'no purchaser or vendor phone or email anywhere on Round 1');
  const raws = async bytes => { const dd = await PDFLib.PDFDocument.load(bytes); return dd.getPages().map(pg => { const c = pg.node.Contents(); const refs = c instanceof PDFLib.PDFArray ? c.asArray() : [c]; return refs.map(r => Buffer.from(dd.context.lookup(r).getContents()).toString('base64')); }); };
  const rdr = await raws(blankDraft), rr = await raws(roundPdf);
  expect(rdr.every((st, i) => { let j = 0; for (const s of st) { j = rr[i].indexOf(s, j); if (j < 0) return false; j++; } return true; }) && rr.slice(0, drPages).some((a, i) => a.length > rdr[i].length), 'the approved draft kept byte for byte; signatures, initials and marks added on top');
  const evA = d.offer_events.filter(e => e.offer_id === offA).sort((a, z) => a.seq - z.seq);
  expect(evA.every((e, i) => e.seq === i + 1 && e.prev_hash === (i ? evA[i - 1].hash : '0'.repeat(64))) && rA.chain_last === evA[evA.length - 1].hash, "each timeline event carries the fingerprint of the one before; the round holds the newest");
  await p.click('#sgChain'); await p.waitForFunction(() => /Timeline checked/.test(document.querySelector('#sgChainOut').textContent));
  out.chain = await p.textContent('#sgChainOut');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#sgRoundDl')]); expect(sha(fs.readFileSync(await dl.path())) === rA.sha256, 'the download is Round 1, byte for byte');
  const again = await rpc(p, 'agent_signing_release', { p_draft: drA.id, p_method: 'in_person', p_pages: gA.pages, p_places: gA.places, p_cca_pages: [10] }); expect(again.error && /already has a signed Round 1/.test(again.error.message), 'Round 1 stays as it is: nothing is released on top of it');
  expect(!(await side(p)), 'Round 1 at 390 px: no sideways scroll'); await shot(p, 'round');
  // a missing or altered event is found
  const tamper = await p.evaluate(oid => { const D_ = JSON.parse(localStorage.getItem('mockdb')); const evs = D_.offer_events.filter(e => e.offer_id === oid); const S_ = window.SIGN;
    const changed = evs.map(e => Object.assign({}, e)); changed[3].detail = Object.assign({}, changed[3].detail, { price: 1 }); const missing = evs.filter((_, i) => i !== 4);
    return [S_.verifyChain(evs).ok, S_.verifyChain(changed).ok, S_.verifyChain(missing).ok]; }, offA);
  expect(JSON.stringify(tamper) === '[true,false,false]', 'the chain finds an altered or missing event');

  // ── 6. by link (offer B): nothing sent until Send; a personal link and a code, each by email ──
  process.stderr.write('step 6\n');
  await p.click('#sgBackO'); await p.waitForSelector('#ofView'); await p.click('#ofBackP'); await p.waitForSelector('#offTile');
  await draftAndApprove(offB); d = await db(p); let drB = d.offer_drafts.filter(x => x.offer_id === offB).sort((a, z) => z.number - a.number)[0];
  await p.click('#sgReady'); await p.waitForSelector('#sgReleaseView', { timeout: 30000 });
  expect(await p.isChecked('input[name="sgMethod"][value="link"]') && /eve\.l@example\.com/.test(await p.textContent('#sgHow')), 'by link chosen, as the buyer asked; Tim sees where the links go');
  await p.click('#sgRelease'); await p.waitForSelector('#sgSendGo');
  // Tim changes his mind before anyone has started: in person instead, then back to links; each change recorded
  await p.click('#sgChange'); await p.waitForSelector('#sgReleaseView'); expect(await p.isChecked('input[name="sgMethod"][value="in_person"]'), 'changing the method opens Ready to sign the other way');
  await p.click('#sgRelease'); await p.waitForSelector('#sgView'); expect(/In person, on this device/.test(await p.textContent('#sgMethod')), 'released again in person');
  await p.click('#sgChange'); await p.waitForSelector('#sgReleaseView'); await p.click('#sgRelease'); await p.waitForSelector('#sgSendGo');
  d = await db(p); expect(d.offer_events.filter(e => e.kind === 'sign_cancelled' && e.offer_id === offB).length === 2 && d.offer_signings.filter(x => x.offer_id === offB && x.status === 'cancelled').length === 2, 'each change is recorded; the stopped releases are kept');
  expect(!(await mails(p)).some(m => /offer_sign_(link|code)/.test(m.kind)), 'released by link: still nothing sent');
  await prepAndSend(p);
  let ml = await mails(p); const links = ml.filter(m => m.kind === 'offer_sign_link');
  expect(links.length === 2 && links.map(m => m.to).sort().join() === 'eve.l@example.com,fin.l@example.com' && links[0].link !== links[1].link, 'Send: each purchaser emailed their own link');
  d = await db(p); const gB = d.offer_signings.find(x => x.offer_id === offB && !['replaced', 'cancelled'].includes(x.status));
  expect(d.offer_signers.filter(s => s.signing_id === gB.id).every(s => s.token_hash && !JSON.stringify(s).includes(links[0].link.split('sign=')[1])), 'the link tokens are kept only as fingerprints');
  // Tim's page closes; Eve opens her link on her own phone (dark mode, no sign-in)
  await p.evaluate(() => localStorage.removeItem('mocksession')); await p.close();
  const eveUrl = links.find(m => m.to === 'eve.l@example.com').link, finUrl = links.find(m => m.to === 'fin.l@example.com').link;
  let q = await page('dark'); await q.goto(eveUrl); await q.waitForSelector('#sgCode');
  expect(/Kia ora Eve/.test(await q.textContent('#sgCode')) && /e\*\*\*@example\.com/.test(await q.textContent('#sgCode')) && !/\bFin\b|fin\.l|Testy|vendor@|Ana Maria/.test(await q.textContent('#main')), 'the link shows her first name and a hint of her email, nothing about anyone else');
  await q.click('#sgSendCode'); await q.waitForFunction(() => /Sent/.test(document.querySelector('#sgCodeMsg').textContent));
  const code = (await mails(q)).filter(m => m.kind === 'offer_sign_code').pop();
  expect(code && code.to === 'eve.l@example.com' && /^\d{6}$/.test(code.code), 'a one-time code emailed to her own address, as its own message');
  await q.fill('#sgCodeIn', code.code === '000000' ? '111111' : '000000'); await q.click('#sgCodeGo'); await q.waitForFunction(() => /isn't right/.test(document.querySelector('#sgCodeMsg').textContent));
  await q.fill('#sgCodeIn', code.code); await q.click('#sgCodeGo');
  await q.waitForSelector('#sgConsent');
  { const ses0 = await q.evaluate(() => Object.keys(sessionStorage).filter(k => /^sgSes:/.test(k)).map(k => sessionStorage.getItem(k))[0]);
    const st0 = await invoke(q, { action: 'state', token: eveUrl.split('sign=')[1], session: ses0 }); expect(st0.ok && st0.signing.draft_url === null, 'the document isn\'t given before she agrees to sign electronically'); } await tick(q, '#sgAgree'); await q.click('#sgAgreeGo'); await q.waitForSelector('#sgGuides'); await q.waitForSelector('#sgCcaPages .dr-pg canvas');
  await tick(q, '#sgCcaOk'); await tick(q, '#sgSpOk'); await q.click('#sgGuidesGo'); await q.waitForSelector('#sgDraw');
  const bgD = await q.$eval('#sgDraw .sig-wrap', e => getComputedStyle(e).backgroundColor), inkBg = await q.$eval('body', e => getComputedStyle(e).backgroundColor);
  expect(bgD === 'rgb(255, 255, 255)' && inkBg !== 'rgb(255, 255, 255)', 'in dark mode the page is dark and the signature pad stays white');
  expect(!(await side(q)), 'the link page at 390 px: no sideways scroll'); await shot(q, 'link_draw_dark');
  await draw(q, '#sgSig', 5); await draw(q, '#sgInit', 6); await q.click('#sgDrawGo'); await q.waitForSelector('#sgPlaces');
  // plain words for a signer: no "fingerprint"; the check code sits behind Details, with what it is for
  expect(!/fingerprint/i.test(await q.textContent('#main')) && await q.$('#sgDocCheck') && /Document check code/.test(await q.textContent('#sgDocCheck')) && !(await q.$eval('#sgDocCheck', e => e.open)), 'the signer sees "Document check code" behind Details, never "fingerprint"');
  expect(!(await q.$('#sgTools')) && await q.$('#sgAskBox'), 'a link signer cannot mark the document, but can ask Tim for a change');
  const allMine = await q.$$eval('#sgPgPick option', o => o.length); expect(allMine >= 1, 'the pages are there to read');
  d = await db(q); const eve = d.offer_signers.find(s => s.signing_id === gB.id && s.position === 1), fin = d.offer_signers.find(s => s.signing_id === gB.id && s.position === 2);
  const finPlace = gB.places.find(x => x.signer === 2).id;
  const sesE = await q.evaluate(() => Object.keys(sessionStorage).filter(k => /^sgSes:/.test(k)).map(k => sessionStorage.getItem(k))[0]);
  const tokE = eveUrl.split('sign=')[1], tokF = finUrl.split('sign=')[1];
  let r = await invoke(q, { action: 'tap', token: tokE, session: sesE, place: finPlace }); expect(r.ok === false && /isn't yours/.test(r.error), "she can't tap Fin's place");
  r = await invoke(q, { action: 'state', token: tokF, session: sesE }); expect(r.ok === false && !r.signing, "her session doesn't open Fin's link");
  r = await invoke(q, { action: 'state', token: tokE, session: sesE }); expect(r.signing.places.every(x => x.signer === 1) && !/\bFin\b|fin\.l|@/.test(JSON.stringify(Object.assign({}, r, { signing: Object.assign({}, r.signing, { draft_url: '' }) }))), 'her state holds only her own places, no other name or any email');
  await tapAll(q, 4);
  await q.click('#sgAskBox summary'); await q.fill('#sgAskText', 'Could settlement be a week later?'); await q.click('#sgAskGo'); await q.waitForFunction(() => /Sent to Tim/.test(document.querySelector('#sgAskOut').textContent));
  ml = await mails(q); expect(ml.some(m => m.kind === 'offer_sign_ask' && m.to === 'tim' && /week later/.test(m.text)), 'Ask Tim for a change: Tim is emailed');
  await q.evaluate(s => localStorage.setItem('mocksession', s), SESSION); await q.close();

  // ── 7. tweak and re-sign: Tim corrects the offer, re-drafts, approves and releases; the old signatures stay, void and shown as replaced ──
  process.stderr.write('step 7\n');
  p = await page(); await p.goto(BASE); await p.waitForTimeout(600);
  await rpc(p, 'agent_offer_correct', { p_offer: offB, p_details: offer({ sign: 'digital', price: '640000', settlement: { kind: 'relative', days: 20 }, conditions: [{ key: 'finance', days: 10 }], chattels_add: [], chattels_exclude: [], purchasers: [{ first: 'Eve', last: 'Linkbuyer', email: 'eve.l@example.com', phone: '027 100 2000' }, { first: 'Fin', last: 'Linkbuyer', email: 'fin.l@example.com', phone: '027 300 4000' }] }), p_note: 'Eve asked for settlement a week later' });
  r = await p.evaluate(b_ => window.supabase.createClient().functions.invoke('offer-sign', { body: b_ }).then(x => x.data || x.error.context.json()), { action: 'tap', token: tokE, session: sesE, place: gB.places.find(x => x.signer === 1 && x.why === 'foot').id });
  expect(r.ok === false && /offer has changed/.test(r.error), 'once the offer is corrected, signing the old version stops');
  await openProp(p); await draftAndApprove(offB); await p.click('#sgReady'); await p.waitForSelector('#sgReleaseView', { timeout: 30000 }); await p.click('#sgRelease'); await p.waitForSelector('#sgSendGo');
  d = await db(p); const gB2 = d.offer_signings.find(x => x.offer_id === offB && x.id !== gB.id && x.status !== 'cancelled'), gB1 = d.offer_signings.find(x => x.id === gB.id);
  expect(gB1.status === 'replaced' && gB1.replaced_by === gB2.id && d.offer_signers.filter(s => s.signing_id === gB.id).every(s => s.void_at) && d.offer_sign_taps.filter(t => t.signing_id === gB.id).length === 4, 'the old signing replaced: its taps kept, its signers void');
  await p.click('#sgBackO'); await p.waitForSelector('#sgList'); expect(/Replaced by a newer draft/.test(await p.textContent('#sgList')), 'the offer page shows the old one as replaced');
  await p.click(`[data-signing="${gB.id}"]`); await p.waitForSelector('#sgReplaced'); expect(/kept, but they are void/.test(await p.textContent('#sgReplaced')) && /Replaced \(kept, void\)/.test(await p.textContent('#sgSigners')), 'opening it: replaced, the signatures kept but void');
  await p.click('#sgNewer'); await p.waitForSelector('#sgSendGo'); await prepAndSend(p, true);   // this time: tick Reviewed on each, then Send all reviewed
  const links2 = (await mails(p)).filter(m => m.kind === 'offer_sign_link').slice(-2);
  await p.evaluate(() => localStorage.removeItem('mocksession')); await p.close();
  q = await page('dark'); await q.goto(eveUrl); await q.waitForSelector('#sgClosed'); expect(/isn't working/.test(await q.textContent('#sgClosed')), "Eve's old link no longer works"); await q.close();
  // both sign the new version by their new links
  for (const who of ['eve.l@example.com', 'fin.l@example.com']) {
    q = await page(who.startsWith('eve') ? 'dark' : 'light'); if (who.startsWith('fin')) await q.goto(BASE + 'x').catch(() => null); await q.evaluate(f => f ? localStorage.setItem('mockLockFail', '1') : localStorage.removeItem('mockLockFail'), who.startsWith('fin')).catch(() => null);
    await q.goto(links2.find(m => m.to === who).link); await q.waitForSelector('#sgCode');
    await q.click('#sgSendCode'); await q.waitForFunction(() => /Sent/.test(document.querySelector('#sgCodeMsg').textContent));
    await q.fill('#sgCodeIn', (await mails(q)).filter(m => m.kind === 'offer_sign_code' && m.to === who).pop().code); await q.click('#sgCodeGo');
    await q.waitForSelector('#sgConsent'); await tick(q, '#sgAgree'); await q.click('#sgAgreeGo'); await q.waitForSelector('#sgCcaPages .dr-pg canvas'); await tick(q, '#sgCcaOk'); await tick(q, '#sgSpOk'); await q.click('#sgGuidesGo');
    await q.waitForSelector('#sgDraw'); await draw(q, '#sgSig', 7); await draw(q, '#sgInit', 8); await q.click('#sgDrawGo'); await q.waitForSelector('#sgPlaces');
    await tapAll(q); await q.click('#sgFinishGo'); await q.waitForSelector('#sgThanks', { timeout: 30000 }); out['thanks_' + who.slice(0, 3)] = (await q.textContent('#sgThanks')).replace(/\s+/g, ' ').trim();
    await q.close(); }
  expect(/Everyone has now signed\. Tim will lock the signed copy/.test(out.thanks_fin) && !/is locked/.test(out.thanks_fin), 'when locking fails at that moment, the thank-you says Tim will lock it (not that it is locked)');
  q = await page(); await q.goto(BASE + 'x').catch(() => null);
  r = await invoke(q, { action: 'send_code', token: links2.find(m => m.to === 'eve.l@example.com').link.split('sign=')[1] }); expect(r.ok === false && r.reason === 'stopped', 'a purchaser who has finished gets no further code');
  r = await invoke(q, { action: 'verify', token: links2.find(m => m.to === 'eve.l@example.com').link.split('sign=')[1], code: '123456' }); expect(r.ok === false && r.reason === 'stopped', 'and no code check');
  await q.evaluate(() => localStorage.removeItem('mockLockFail')); await q.close();
  p = await page(); await p.goto(BASE); await p.evaluate(s => localStorage.setItem('mocksession', s), SESSION); await p.goto(BASE); await p.waitForTimeout(600);
  d = await db(p); expect(!d.offer_rounds.some(r_ => r_.offer_id === offB), 'Round 1 wasn\'t locked while making it failed');
  await openProp(p); await p.click(`[data-offer="${offB}"]`); await p.waitForSelector('#sgList'); await p.click(`[data-signing="${d.offer_signings.find(x => x.offer_id === offB && x.status === 'complete').id}"]`); await p.waitForSelector('#sgRound', { timeout: 30000 });
  d = await db(p); const rB = d.offer_rounds.find(r_ => r_.offer_id === offB);
  expect(rB && rB.signing_id === gB2.id, 'Round 1 for offer B is the new version');
  const rtB = await pdfText(await blob(p, rB.path)), recB = rtB.join(' ');
  expect(/Email verified with a one-time code/.test(recB) && /personal link/.test(recB) && !/eve\.l@|fin\.l@|027 100|027 300/.test(recB) && /Draft 1 was replaced/.test(recB), 'the record says "email verified" and names no address; it notes the replaced draft');
  expect(rB.execution.signers.every(s_ => s_.net && s_.ua && s_.verified_at), 'with the device, network and code check of each');

  // ── 8. privacy: a vendor and anyone not signed in see nothing ──
  process.stderr.write('step 8\n');
  expect((await p.evaluate(() => window.supabase.createClient().from('offer_signers').select('*'))).error, "even Tim can't read the link fingerprints (select *)");
  await p.evaluate(() => localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'v-1', email: 'vendor@example.com' } }))); await p.goto(BASE); await p.waitForTimeout(800);
  const vend = await p.evaluate(async () => { const c = window.supabase.createClient(); const o = {}; for (const t of ['offer_signings', 'offer_signers', 'offer_sign_taps', 'offer_rounds', 'offer_sign_marks']) { const r_ = await c.from(t).select('id'); o[t] = r_.error ? 'refused' : r_.data.length; } o.rpc = (await c.rpc('agent_signing_start', { p_signing: 'x' })).error ? 'refused' : 'ran'; return o; });
  out.vendor = vend; expect(Object.values(vend).every(v => v === 0 || v === 'refused'), 'a signed-in vendor sees and does nothing');
  expect(!/Testbuyer|Linkbuyer|Round 1|Ready to sign/.test(await p.textContent('#main')), "the vendor's own pages show none of it");
  await p.evaluate(() => localStorage.removeItem('mocksession')); await p.goto(BASE); await p.waitForTimeout(600);
  expect((await p.evaluate(() => window.supabase.createClient().from('offer_signings').select('id'))).error, 'anyone not signed in: refused');

  // ── 9. finding 1: printed words beneath the third signature line: four purchasers can't be released, in plain words ──
  process.stderr.write('step 9\n');
  await p.evaluate(s => localStorage.setItem('mocksession', s), SESSION); await p.goto(BASE); await p.waitForTimeout(600);
  const offD = (await rpc(p, 'agent_offer_add', { p_property: 'P1', p_offer: offer({ price: '660000', conditions: [{ key: 'finance', days: 10 }], chattels_add: [], chattels_exclude: [] }) })).data;
  await openProp(p); await p.setInputFiles('#drFile', { name: 'Agreement pack with a footnote.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await SB.make({ cca: true, footnote: true })) });
  await p.waitForSelector('#drMap', { timeout: 30000 }); await p.click('#drApprove'); await p.waitForSelector('#offTile');
  await draftAndApprove(offD); await p.click('#sgReady'); await p.waitForSelector('#sgReleaseView', { timeout: 30000 });
  out.noRoom = (await p.textContent('#sgBlock')).replace(/\s+/g, ' ').trim();
  expect(/No room on the signature page for every purchaser\. Add a signature page in the portal, then load the blank again\./.test(out.noRoom) && await p.isDisabled('#sgRelease'), 'no room for a fourth signature: named, and Ready to sign waits');
  expect(!(await side(p)), 'the refusal at 390 px: no sideways scroll'); await shot(p, 'no_room');

  // ── 10. everyone has signed but Round 1 isn't locked yet, and a newer draft replaces it: those signatures show as replaced, void ──
  process.stderr.write('step 10\n');
  const gil = { first: 'Gil', last: 'Onebuyer', email: 'gil.o@example.com', phone: '027 500 6000' };
  const offE = (await rpc(p, 'agent_offer_add', { p_property: 'P1', p_offer: offer({ sign: 'digital', price: '661000', conditions: [{ key: 'finance', days: 10 }], chattels_add: [], chattels_exclude: [], purchasers: [gil] }) })).data;
  await openProp(p); await draftAndApprove(offE); await p.click('#sgReady'); await p.waitForSelector('#sgReleaseView', { timeout: 30000 }); await p.click('#sgRelease'); await p.waitForSelector('#sgSendGo'); await prepAndSend(p);
  const gilLink = (await mails(p)).filter(m => m.kind === 'offer_sign_link' && m.to === gil.email).pop().link;
  await p.evaluate(() => { localStorage.removeItem('mocksession'); localStorage.setItem('mockLockFail', '1'); }); await p.close();
  q = await page(); await q.goto(gilLink); await q.waitForSelector('#sgCode'); await q.click('#sgSendCode'); await q.waitForFunction(() => /Sent/.test(document.querySelector('#sgCodeMsg').textContent));
  await q.fill('#sgCodeIn', (await mails(q)).filter(m => m.kind === 'offer_sign_code' && m.to === gil.email).pop().code); await q.click('#sgCodeGo');
  await q.waitForSelector('#sgConsent'); await tick(q, '#sgAgree'); await q.click('#sgAgreeGo'); await q.waitForSelector('#sgCcaPages .dr-pg canvas'); await tick(q, '#sgCcaOk'); await tick(q, '#sgSpOk'); await q.click('#sgGuidesGo');
  await q.waitForSelector('#sgDraw'); await draw(q, '#sgSig', 9); await draw(q, '#sgInit', 10); await q.click('#sgDrawGo'); await q.waitForSelector('#sgPlaces');
  await tapAll(q); await q.click('#sgFinishGo'); await q.waitForSelector('#sgThanks', { timeout: 30000 });
  await q.evaluate(s => localStorage.setItem('mocksession', s), SESSION); await q.close();
  p = await page(); await p.goto(BASE); await p.waitForTimeout(600);
  d = await db(p); const gE1 = d.offer_signings.find(x => x.offer_id === offE && x.status === 'complete');
  expect(gE1 && !d.offer_rounds.some(r_ => r_.signing_id === gE1.id), 'everyone signed, Round 1 not locked yet');
  await rpc(p, 'agent_offer_correct', { p_offer: offE, p_details: offer({ sign: 'digital', price: '662000', conditions: [{ key: 'finance', days: 10 }], chattels_add: [], chattels_exclude: [], purchasers: [gil] }), p_note: 'Buyer raised the price before it was locked' });
  await openProp(p); await draftAndApprove(offE); await p.click('#sgReady'); await p.waitForSelector('#sgReleaseView', { timeout: 30000 }); await p.click('#sgRelease'); await p.waitForSelector('#sgSendGo');
  d = await db(p); const sE1 = d.offer_signers.filter(s_ => s_.signing_id === gE1.id);
  expect(d.offer_signings.find(x => x.id === gE1.id).status === 'replaced' && sE1.length === 1 && sE1.every(s_ => s_.void_at && s_.finished_at && s_.seen_sha256 && !s_.token_hash), 'the fully signed version is replaced: its signer marked void, still recorded as finished, the link closed');
  await p.click('#sgBackO'); await p.waitForSelector('#sgList'); await p.click(`[data-signing="${gE1.id}"]`); await p.waitForSelector('#sgReplaced');
  out.replacedSigner = (await p.textContent('#sgSigners [data-signer="1"]')).replace(/\s+/g, ' ').trim();
  expect(/Replaced \(kept, void\)/.test(out.replacedSigner) && !/Finished/.test(out.replacedSigner), 'Tim sees the signer as replaced, not finished');
  await p.evaluate(() => localStorage.removeItem('mockLockFail'));

  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
  await b.close();
})().catch(e => { console.log(JSON.stringify({ errs: ['crashed: ' + (e.stack || e.message)] })); process.exit(0); });

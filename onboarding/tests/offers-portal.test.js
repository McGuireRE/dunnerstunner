// Offers phases 3 and 4 inside the portal (PORTAL-PLAN.md P1), against the mock database, with a synthetic blank made at test time
// (the real form is never copied here). The portal shell is served as GitHub Pages serves it (portal/index.html, and 404.html for
// any deeper address). Covers: an address for every new agent screen, with ids only (the signing set-up for an approved draft, a round
// out for signing, one signer's turn on Tim's device, presenting a round to the vendors); each with its up link; back and forward
// (a set-up screen is replaced by the page it moves on to, so Back never lands on a finished set-up); a signer's turn being in person
// (no menu, no up link, Back and Forward stay on the page, its own "Back to Tim's screen" the way out); the purchaser's and vendor's
// pads (#sgSig, #sgInit) and their marking canvas counted as theirs (VENDOR_PADS); each address opening its page directly after a
// reload; a signing link (?sign=) opened at the portal going to packages.dunnerstunner.co.nz/onboarding; and the onboarding app at
// /onboarding not changing its address at all for the same screens.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const bundle = fs.readFileSync(path.join(__dirname, '..', 'portal.js'), 'utf8');
const shell = fs.readFileSync(path.join(ROOT, 'portal', 'index.html'), 'utf8');
const notFound = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');
const cat = fs.readFileSync(path.join(ROOT, 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const SB = require(path.join(__dirname, 'synthetic-blank.js'));
const PDFJS_DIR = '/opt/npm-tools/node_modules/pdfjs-dist/', PDFLIB_FILE = '/opt/npm-tools/node_modules/pdf-lib/dist/pdf-lib.min.js';
const AGENT = 'agent-portal-offers@example.com';
const sha = b => crypto.createHash('sha256').update(Buffer.from(b)).digest('hex');
const GUIDE_PDF = fs.readFileSync(path.join(__dirname, '..', 'assets', 'guides', 'rea-sale-purchase-guide-2022-en.pdf'));
const GUIDES = { sale_purchase: { file: 'rea-sale-purchase-guide-2022-en.pdf', version: 'August 2022', title: 'Real Estate Authority guide to sale and purchase agreements', sha256: sha(GUIDE_PDF) } };
const PK = 'https://packages.dunnerstunner.co.nz', PB = PK + '/portal/', OB = PK + '/onboarding/';
(async () => {
  const b = await chromium.launch(); const out = {}; const errs = [];
  const expect = (c, m) => { if (!c) errs.push(m); };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', hasTouch: true, isMobile: true }); ctx.setDefaultTimeout(20000);
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
  await ctx.route('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/**', r => { const rel = new URL(r.request().url()).pathname.replace(/^\/npm\/pdfjs-dist@6\.2\.108\//, ''), f = path.join(PDFJS_DIR, rel);
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ contentType: /\.m?js$/.test(f) ? 'text/javascript' : 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(f) }); });
  await ctx.route('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/**', r => r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(PDFLIB_FILE) }));
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await ctx.route(PK + '/**', r => r.fulfill({ status: 404, contentType: 'text/html', body: notFound }));
  await ctx.route(PK + '/onboarding/**', r => r.fulfill({ contentType: 'text/html', body: html }));
  await ctx.route(PK + '/portal**', r => { const u = new URL(r.request().url()); if (u.pathname === '/portal/' || u.pathname === '/portal/index.html') return r.fulfill({ contentType: 'text/html', body: shell }); return r.fulfill({ status: 404, contentType: 'text/html', body: notFound }); });
  await ctx.route(PK + '/onboarding/portal.js', r => r.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: bundle }));
  await ctx.route(PK + '/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
  await ctx.route(PK + '/onboarding/assets/guides/**', r => { const u = r.request().url(); if (u.endsWith('guides.json')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify(GUIDES) }); if (u.endsWith('.pdf')) return r.fulfill({ contentType: 'application/pdf', body: GUIDE_PDF }); return r.fulfill({ status: 404, body: '' }); });
  const seen = new Set();
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push('page: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  p.on('dialog', d => d.accept());
  p.on('framenavigated', f => { if (f === p.mainFrame()) seen.add(new URL(f.url()).pathname); });
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb')));
  const rpc = (fn, args) => p.evaluate(([fn, args]) => window.supabase.createClient().rpc(fn, args), [fn, args]);
  const at = () => p.evaluate(() => location.pathname);
  const wait = ms => p.waitForTimeout(ms || 500);
  const side = () => p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth);
  const chrome = () => p.evaluate(() => { const n = document.getElementById('pNav'), u = document.getElementById('pUpRow'), up = document.getElementById('pUp'); const vis = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none';
    return { nav: vis(n), up: vis(u) ? up.getAttribute('href') : null }; });
  const tick = sel => p.$eval(sel, e => { if (!e.checked) e.click(); });
  const draw = async (sel, k) => { await (await p.$(sel)).scrollIntoViewIfNeeded(); const bx = await (await p.$(sel)).boundingBox(); await p.mouse.move(bx.x + 20, bx.y + bx.height / 2); await p.mouse.down(); for (let i = 1; i <= 12; i++) await p.mouse.move(bx.x + 20 + i * (bx.width - 40) / 12, bx.y + bx.height / 2 + Math.sin(i + (k || 0)) * bx.height / 4); await p.mouse.up(); };
  const count = () => p.$eval('#sgCount', e => +e.textContent.match(/(\d+) of/)[1]);
  const tapAll = async () => { for (let i = 0; i < 600; i++) {
      const t = await p.$('#sgPage .sg-todo'); if (!t) { const gn = await p.$('#sgGoNext'); if (!gn) break; await gn.click(); await p.waitForSelector('#sgPage .sg-todo', { timeout: 10000 }); continue; }
      const c0 = await count(); await p.evaluate(el => el.click(), t); await p.waitForFunction(c => +document.querySelector('#sgCount').textContent.match(/(\d+) of/)[1] > c, c0); } };
  const now = new Date().toISOString();
  const prop = (id, address, stage) => ({ id, address, title_ref: null, owners_on_title: null, ownership: {}, description: {}, disclosures: {}, found: {}, provenance: {}, stage, stage_at: now, created_at: now, updated_at: now });
  const seed = { agreements: [{ id: 'A1', ref: 'MRE-2026-1001', address: '1 Example Road, Testville', property_id: 'P1', status: 'countersigned', config: {}, answers: {}, legal: {}, created_at: now, updated_at: now, countersigned_at: now }],
    agreement_people: [{ id: 'AP1', agreement_id: 'A1', position: 1, legal_name: 'Testy Vendorperson', pref_name: '', email: 'vendor@example.com', phone: '021 000 1111', user_id: 'v-1', signed_at: now }],
    agreement_events: [], signatures: [], lawyer_links: [], aml_files: [], aml_events: [], email_log: [], cancellation_requests: [], prelistings: [], agreement_variations: [], prior_agency_notices: [],
    properties: [prop('P1', '1 Example Road, Testville', 'live')],
    property_people: [{ id: 'PP1', property_id: 'P1', position: 1, legal_name: 'Testy Vendorperson', pref_name: '', email: 'vendor@example.com', phone: '021 000 1111', user_id: 'v-1', role: 'owner', source: 'agreement', name_from: 'agreement' }] };
  const offer = { email: 'buyer.own@example.com', phone: '021 999 8888', seen_docs: 'yes', sign: 'in_person', price: '655000', settlement: { kind: 'relative', days: 15 }, conditions: [{ key: 'finance', days: 10 }],
    kiwisaver: false, entity: '', nominee: false, purchasers: [{ first: 'Ana', last: 'Testbuyer', email: 'ana.p@example.com', phone: '022 777 6666' }], comments: '',
    lawyer: { firm: 'Synthetic Law', person: 'Pat Solicitor', email: 'pat@synthlaw.example', phone: '03 477 1234' }, related: false, date_help: false, privacy: true, chattels_add: [], chattels_exclude: [], gst_registered: null, gst_number: null };
  const ID = '[A-Za-z0-9_-]{1,64}';
  // the page's own "Still loading" guard (20 seconds after the page loads, if a page is still loading then) is the app's, not under
  // test here: before a long step, wait until the page has been open that long
  const settle = async () => { const t = await p.evaluate(() => performance.now()); if (t < 21000) await p.waitForTimeout(21000 - t); };

  // ── 1. signed in at the portal; an offer drafted and approved there ──
  process.stderr.write('step 1\n');
  await p.goto(PB); await p.evaluate(([s, a]) => { localStorage.clear(); localStorage.setItem('mockAgents', JSON.stringify([a])); localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'agent-1', email: a } })); localStorage.setItem('mockdb', JSON.stringify(s)); }, [seed, AGENT]);
  await p.goto(PB + 'properties/P1'); await p.waitForSelector('#offTile');
  // the portal bundle carries every script index.html does, the signing and negotiation cores included (merge of P1 with phases 3 and 4)
  expect(await p.evaluate(() => !!(window.DRAFT && window.SIGN && window.NEGO && window.SIGN.makePlaces && window.NEGO.nextTermNo)), 'the portal has the drafting, signing and negotiation cores');
  await rpc('agent_offer_link', { p_property: 'P1', p_action: 'open' });
  const oid = (await rpc('agent_offer_add', { p_property: 'P1', p_offer: offer })).data;
  await p.goto(PB + 'properties/P1'); await p.waitForSelector('#offTile');
  await p.setInputFiles('#drFile', { name: 'Agreement pack.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await SB.make({ cca: true })) });
  await p.waitForSelector('#drMap', { timeout: 30000 }); await p.click('#drApprove'); await p.waitForSelector('#offTile');
  await p.click(`[data-offer="${oid}"]`); await p.waitForSelector('#drDraftBtn'); await p.click('#drDraftBtn'); await p.waitForSelector('#drReview', { timeout: 30000 });
  await p.waitForSelector('#drApproveDraft:not([disabled])'); await p.click('#drApproveDraft'); await p.waitForSelector('#sgReady');
  let d = await db(); const dr = d.offer_drafts.filter(x => x.offer_id === oid).sort((a, z) => z.number - a.number)[0];
  const draftAddr = `/portal/properties/P1/offers/${oid}/draft/${dr.id}`;
  expect(await at() === draftAddr, 'the approved draft at its own address: ' + await at());

  // ── 2. the signing set-up: its own address, up to the offer ──
  process.stderr.write('step 2\n');
  await p.goto(PB + draftAddr.replace('/portal/', '')); await p.waitForSelector('#sgReady', { timeout: 30000 }); await settle();
  await p.click('#sgReady'); await p.waitForSelector('#sgReleaseView', { timeout: 30000 }); await wait();
  const setupAddr = draftAddr + '/sign';
  expect(await at() === setupAddr, 'Ready to sign: properties/<p>/offers/<o>/draft/<d>/sign: ' + await at());
  let c = await chrome(); expect(c.nav && c.up === `/portal/properties/P1/offers/${oid}`, 'the menu, and the up link to the offer: ' + JSON.stringify(c));
  expect(!(await side()), 'the set-up at 390 px in the portal: no sideways scroll');
  await p.click('#sgRelease'); await p.waitForSelector('#sgView'); await wait();
  d = await db(); const g1 = d.offer_signings.find(x => x.offer_id === oid); const signer1 = d.offer_signers.find(x => x.signing_id === g1.id && x.position === 1);
  const signAddr = `/portal/properties/P1/offers/${oid}/signing/${g1.id}`;
  expect(await at() === signAddr, 'released: the round at properties/<p>/offers/<o>/signing/<s>: ' + await at());
  c = await chrome(); expect(c.nav && c.up === `/portal/properties/P1/offers/${oid}`, 'the signing page: menu, and up to the offer: ' + JSON.stringify(c));
  // Back skips the finished set-up (it was replaced) and goes to the draft; Forward comes back to the signing
  await p.goBack(); await p.waitForSelector('#drReview'); await wait();
  expect(await at() === draftAddr, 'Back from the signing: the draft, not the set-up it replaced: ' + await at());
  await p.goForward(); await p.waitForSelector('#sgView'); await wait();
  expect(await at() === signAddr, 'Forward: the signing again');
  // the set-up address opened directly once released: it moves on to the signing, in place
  await p.goto(PB + setupAddr.replace('/portal/', '')); await p.waitForSelector('#sgView'); await wait();
  expect(await at() === signAddr, 'the set-up address once released opens the signing, at its own address: ' + await at());

  // ── 3. a purchaser's turn on Tim's device: in person ──
  process.stderr.write('step 3\n');
  await p.click('#sgSigners [data-signer="1"] [data-turn]'); await p.waitForSelector('#sgFlow'); await wait();
  const turnAddr = `${signAddr}/turn/${signer1.id}`;
  expect(await at() === turnAddr, 'a turn: properties/<p>/offers/<o>/signing/<s>/turn/<signer>: ' + await at());
  c = await chrome(); expect(!c.nav && !c.up, 'in person: no menu and no up link, from the start of the turn: ' + JSON.stringify(c));
  await p.goBack(); await wait(700);
  expect(await at() === turnAddr && await p.$('#sgFlow'), 'Back stays on the turn (a purchaser may be holding the tablet)');
  await p.waitForSelector('#sgConsent'); await tick('#sgAgree'); await p.click('#sgAgreeGo'); await p.waitForSelector('#sgGuides');
  await p.waitForSelector('#sgCcaPages .dr-pg canvas'); await tick('#sgCcaOk'); await tick('#sgSpOk'); await p.click('#sgGuidesGo'); await p.waitForSelector('#sgDraw');
  // the purchaser's own pads (and, below, the marking canvas) are counted as theirs under P1's "drawn on" rule
  const VP = (/const VENDOR_PADS = '([^']+)'/.exec(bundle) || [])[1] || '';
  expect(['#main #sgSig', '#main #sgInit', '#main canvas.sg-draw'].every(x => VP.split(', ').includes(x)), 'VENDOR_PADS holds #sgSig, #sgInit and the marking canvas: ' + VP);
  expect(await p.evaluate(vp => ['#sgSig', '#sgInit'].every(s => { const el = document.querySelector(s); return !!el && el.matches(vp); }), VP), 'the pads on screen match it');
  await draw('#sgSig', 1);
  c = await chrome(); expect(!c.nav && !c.up, 'drawing on the purchaser\'s pad: still in person');
  await draw('#sgInit', 4); await p.click('#sgDrawGo'); await p.waitForSelector('#sgPlaces');
  expect(await p.$('#sgTools'), "on Tim's device the page can be marked (the marking canvas is the signer's too)");
  await tapAll(); await tick('#sgSaw'); await p.selectOption('#sgIdType', 'known_to_tim'); await p.click('#sgFinishGo');
  await p.waitForSelector('#sgView', { timeout: 30000 });
  await p.waitForFunction(() => (JSON.parse(localStorage.getItem('mockdb')).offer_rounds || []).length > 0, null, { timeout: 30000 }).catch(() => null); await wait(1200);   // Round 1 locks straight after (in person)
  expect(await at() === signAddr, 'the turn finished: back on the signing, and the turn\'s address replaced: ' + await at());
  c = await chrome(); expect(c.nav, 'the menu is back');
  await p.goBack(); await wait(900);
  expect(!/\/turn\//.test(await at()), 'Back never reopens a finished turn: ' + await at());
  d = await db(); const r1 = (d.offer_rounds || []).find(x => x.offer_id === oid);
  expect(r1 && signer1.id && d.offer_signers.find(x => x.id === signer1.id).finished_at, 'Round 1 locked from the portal (the signing function called from the portal page)');

  // ── 4. presenting Round 1 to the vendors ──
  process.stderr.write('step 4\n');
  await p.goto(PB + `properties/P1/offers/${oid}`); await p.waitForSelector('#ngPresent', { timeout: 30000 });
  await p.click('#ngPresent'); await p.waitForSelector('#ngPresentView'); await wait();
  const presAddr = `/portal/properties/P1/offers/${oid}/present`;
  expect(await at() === presAddr, 'Present to the vendors: properties/<p>/offers/<o>/present: ' + await at());
  c = await chrome(); expect(c.nav && c.up === `/portal/properties/P1/offers/${oid}`, 'presenting: menu, and up to the offer: ' + JSON.stringify(c));
  expect(!(await side()), 'presenting at 390 px in the portal: no sideways scroll');
  await p.goBack(); await p.waitForSelector('#ngPresent'); await wait();
  expect(await at() === `/portal/properties/P1/offers/${oid}`, 'Back from presenting: the offer');
  await p.goForward(); await p.waitForSelector('#ngPresentView'); await wait();
  expect(await at() === presAddr, 'Forward: presenting again');
  await p.reload(); await p.waitForSelector('#ngPresentView', { timeout: 30000 }); expect(await at() === presAddr, 'presenting opens directly from its address');
  await p.waitForSelector('#ngChecked'); await tick('input[name="ngMethod"][value="in_person"]'); await tick('#ngChecked'); await p.click('#ngGo'); await p.waitForSelector('#sgView'); await wait();
  d = await db(); const g2 = d.offer_signings.find(x => x.offer_id === oid && x.round_no === 2);
  expect(g2 && await at() === `/portal/properties/P1/offers/${oid}/signing/${g2.id}`, "Round 2 out for the vendors' signing at its own address: " + await at());
  await p.goBack(); await wait(900);
  expect(await at() === `/portal/properties/P1/offers/${oid}`, 'Back from Round 2: the offer, not the presenting screen it replaced: ' + await at());
  await p.goto(PB + `properties/P1/offers/${oid}/signing/${g2.id}`); await p.waitForSelector('#sgView', { timeout: 30000 });
  const vSigner = d.offer_signers.find(x => x.signing_id === g2.id && x.position === 1);
  await p.click('#sgSigners [data-signer="1"] [data-turn]'); await p.waitForSelector('#sgFlow'); await wait();
  expect(await at() === `/portal/properties/P1/offers/${oid}/signing/${g2.id}/turn/${vSigner.id}` && !(await chrome()).nav, "the vendor's turn: its own address, in person");
  await p.click('#sgBackTim'); await p.waitForSelector('#sgView'); await wait();
  expect(await at() === `/portal/properties/P1/offers/${oid}/signing/${g2.id}` && (await chrome()).nav, "Back to Tim's screen: the way out of a turn");
  await p.reload(); await p.waitForSelector('#sgView', { timeout: 30000 }); expect(await at() === `/portal/properties/P1/offers/${oid}/signing/${g2.id}`, 'a signing opens directly from its address');
  await p.goto(PB + `properties/P1/offers/${oid}/signing/${g2.id}/turn/${vSigner.id}`); await p.waitForSelector('#sgFlow', { timeout: 30000 }); await wait();
  expect(!(await chrome()).nav, 'a turn opened from its address: in person');

  // ── 5. addresses hold ids only; a signing link at the portal goes to the onboarding app ──
  process.stderr.write('step 5\n');
  const NAMES = ['Ana', 'Testbuyer', 'Vendorperson', 'example.com', '021', '022', 'Example Road'];
  out.seen = [...seen].filter(x => /^\/portal\//.test(x));
  expect(out.seen.every(a => !NAMES.some(n => a.includes(n))), 'no address holds a name, email, phone or street: ' + out.seen.join(' '));
  expect(out.seen.filter(a => /\/offers\//.test(a)).every(a => new RegExp(`^/portal/properties/${ID}/offers/${ID}(/(draft/${ID}(/sign)?|signing/${ID}(/turn/${ID})?|present|correct))?$|^/portal/properties/${ID}/offers/blank/${ID}$`).test(a)), 'every offers address is one of the patterns, ids only');
  await p.goto(PB + '?sign=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'); await p.waitForURL(u => u.pathname === '/onboarding/', { timeout: 10000 }).catch(() => null);
  out.signLink = new URL(p.url()); expect(out.signLink.pathname === '/onboarding/' && out.signLink.search === '?sign=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ', 'a signing link opened at the portal goes to the onboarding app: ' + p.url());

  // ── 6. the onboarding app at /onboarding: the same screens, and its address never changes ──
  process.stderr.write('step 6\n');
  await p.goto(OB); await p.waitForSelector('#navDash'); await p.click('#navDash'); await wait(400); await p.click('tr[data-prop="P1"]'); await p.waitForSelector('#offTile');
  await p.click(`[data-offer="${oid}"]`); await p.waitForSelector('#ngPresent, [data-signing]', { timeout: 30000 });
  const sl = await p.$(`[data-signing="${g1.id}"]`) || await p.$('[data-signing]'); if (sl) { await sl.click(); await p.waitForSelector('#sgView'); }
  expect(sl && await at() === '/onboarding/' && !(await p.evaluate(() => location.search || location.hash)), 'at /onboarding the signing opens with the address unchanged, as on the reviewed branch: ' + await at());
  expect(!(await p.$('#pNav')) || await p.$eval('#pNav', e => e.hidden), 'no portal menu at /onboarding');

  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
  await b.close();
})().catch(e => { console.log(JSON.stringify({ errs: ['crashed: ' + (e.stack || e.message)] })); process.exit(0); });

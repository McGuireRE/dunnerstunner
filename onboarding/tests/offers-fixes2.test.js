// Offers fixes 2 (raised by Tim 25 November 2026 from his live test offer), against the mock database with a synthetic blank made at
// test time (tests/synthetic-blank.js). Covers: typed words shown on the signing page (an SVG tspan-free text with a real size, not an
// HTML span the browser doesn't draw), on the link signer's working copy and on Tim's present screen; a line through text snapped to
// the price it crosses, kept on the page until it is saved, the words it strikes shown before Save and recorded with the mark and on
// the round's execution record; a drag over empty paper refused in plain words; a crossed-out box kept on the page until saved; the
// vendors' link screen worded for vendors; the present screen keeping Tim's tick when he changes how they sign; the agreed price after
// the negotiation (the typed figure) in Tim's own email when he confirms the agreement (sent to him at once, the copy attached) and in
// the parties' email drafts, with the due dates and settlement day filled in and what was worked out shown to Tim beside the editor;
// and the privacy check (025) letting Tim's own phone through in an email to the purchasers where Tim is the vendor, while a real
// vendor's own phone is still refused.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os'), { execFileSync } = require('child_process');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(__dirname, '..', '..', 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const SB = require(path.join(__dirname, 'synthetic-blank.js'));
const PDFJS_DIR = '/opt/npm-tools/node_modules/pdfjs-dist/', PDFLIB_FILE = '/opt/npm-tools/node_modules/pdf-lib/dist/pdf-lib.min.js';
const AGENT = 'agent-nego@example.com';
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
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'out', `nego_${n}.png`), fullPage: true });
  const rpc = (p, fn, args) => p.evaluate(([fn, args]) => window.supabase.createClient().rpc(fn, args), [fn, args]);
  const invoke = (p, body) => p.evaluate(b => window.supabase.createClient().functions.invoke('offer-sign', { body: b }).then(r => r.data || (r.error && r.error.context ? r.error.context.json() : { error: r.error.message })), body);
  const blob = (p, key) => p.evaluate(async k => { const bl = (window.__repoBlobs || {})[k]; if (!bl) return null; const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }, key).then(x => x ? Buffer.from(x, 'base64') : null);
  const mails = p => p.evaluate(() => JSON.parse(localStorage.getItem('mockSignMail') || '[]'));
  const pdfText = async bytes => { const pg = await D.readPages(pdfjs, new Uint8Array(bytes)); return pg.map(x => x.items.map(i => i.s).join(' ')); };
  const now = new Date().toISOString();
  const prop = (id, address, stage) => ({ id, address, title_ref: null, owners_on_title: null, ownership: {}, description: {}, disclosures: {}, found: {}, provenance: {}, stage, stage_at: now, created_at: now, updated_at: now });
  const seed = { agreements: [{ id: 'A1', ref: 'MRE-2026-1001', address: '1 Example Road, Testville', property_id: 'P1', status: 'countersigned', config: {}, answers: {}, legal: {}, created_at: now, updated_at: now, countersigned_at: now }],
    agreement_people: [{ id: 'AP1', agreement_id: 'A1', position: 1, legal_name: 'Testy Vendorperson', pref_name: '', email: 'vendor@example.com', phone: '021 000 1111', user_id: 'v-1', signed_at: now }, { id: 'AP2', agreement_id: 'A1', position: 2, legal_name: 'Otherly Vendorperson', pref_name: '', email: 'vendor2@example.com', phone: '021 000 2222', user_id: 'v-2', signed_at: now }],
    agreement_events: [], signatures: [], lawyer_links: [], aml_files: [], aml_events: [], email_log: [], cancellation_requests: [], prelistings: [], agreement_variations: [], prior_agency_notices: [],
    properties: [prop('P1', '1 Example Road, Testville', 'live')],
    property_people: [{ id: 'PP1', property_id: 'P1', position: 1, legal_name: 'Testy Vendorperson', pref_name: '', email: 'vendor@example.com', phone: '021 000 1111', user_id: 'v-1', role: 'owner', source: 'agreement', name_from: 'agreement' },
      { id: 'PP2', property_id: 'P1', position: 2, legal_name: 'Otherly Vendorperson', pref_name: '', email: 'vendor2@example.com', phone: '021 000 2222', user_id: 'v-2', role: 'owner', source: 'agreement', name_from: 'agreement' }] };
  const SESSION = JSON.stringify({ user: { id: 'agent-1', email: AGENT } });
  const asAgent = async p => { await p.goto(BASE); await p.evaluate(([s, a, ses]) => { localStorage.clear(); localStorage.setItem('mockAgents', JSON.stringify([a])); localStorage.setItem('mocksession', ses); localStorage.setItem('mockdb', JSON.stringify(s)); }, [seed, AGENT, SESSION]); await p.goto(BASE); await p.waitForTimeout(600); };
  const openProp = async p => { await p.click('#navDash'); await p.waitForTimeout(400); await p.click('tr[data-prop="P1"]'); await p.waitForSelector('#offTile'); };
  const offer = (o) => Object.assign({ email: 'buyer.own@example.com', phone: '021 999 8888', seen_docs: 'yes', sign: 'in_person', price: '655000', settlement: { kind: 'relative', days: 15 },
    conditions: [{ key: 'finance', days: 10 }], kiwisaver: false, entity: '', nominee: false,
    purchasers: [{ first: 'Ana', last: 'Testbuyer', email: 'ana.p@example.com', phone: '022 777 6666' }, { first: 'Bo', last: 'Testbuyer', email: 'bo.p@example.com', phone: '022 555 4444' }],
    comments: '', lawyer: { firm: 'Synthetic Law', person: 'Pat Solicitor', email: 'pat@synthlaw.example', phone: '03 477 1234' }, related: false, date_help: false, privacy: true, chattels_add: ['Outdoor table'], chattels_exclude: [], gst_registered: null, gst_number: null }, o || {});
  const draw = async (p, sel, k) => { await (await p.$(sel)).scrollIntoViewIfNeeded(); const bx = await (await p.$(sel)).boundingBox(); await p.mouse.move(bx.x + 20, bx.y + bx.height / 2); await p.mouse.down(); for (let i = 1; i <= 12; i++) await p.mouse.move(bx.x + 20 + i * (bx.width - 40) / 12, bx.y + bx.height / 2 + Math.sin(i + (k || 0)) * bx.height / 4); await p.mouse.up(); };
  const tick = (p, sel) => p.$eval(sel, e => { if (!e.checked) e.click(); });
  const count = p => p.$eval('#sgCount', e => +e.textContent.match(/(\d+) of/)[1]);
  const tapAll = async (p) => { let miss = 0; for (let i = 0; i < 800; i++) {
      const t = await p.$('#sgPage .sg-todo'); if (!t) { const gn = await p.$('#sgGoNext'); if (!gn) break; await gn.click(); await p.waitForSelector('#sgPage .sg-todo', { timeout: 10000 }); continue; }
      const c0 = await count(p); await p.evaluate(el => el.click(), t).catch(() => null); try { await p.waitForFunction(c => +document.querySelector('#sgCount').textContent.match(/(\d+) of/)[1] > c, c0, { timeout: 4000 }); } catch (e) { if (++miss > 5) throw new Error('tap did not count: ' + (await p.textContent('#sgErr')) + ' id=' + (await t.getAttribute('data-id').catch(() => 'gone')) + ' count=' + (await p.textContent('#sgCount')) + ' todo=' + (await p.$$eval('#sgPage .sg-todo', x => x.map(y => y.dataset.id + (y.dataset.busy ? '*' : '')).join('|')))); } } };
  const turnStart = async (p, n) => { await p.waitForSelector('#sgView'); await p.click(`#sgSigners [data-signer="${n}"] [data-turn]`); await p.waitForSelector('#sgFlow'); };
  const consentDraw = async (p, k) => { await p.waitForSelector('#sgConsent'); await tick(p, '#sgAgree'); await p.click('#sgAgreeGo'); await p.waitForSelector('#sgDraw');
    const bg = await p.$eval('#sgDraw .sig-wrap', e => getComputedStyle(e).backgroundColor); expect(bg === 'rgb(255, 255, 255)', 'the signature pad is white (' + bg + ')');
    await draw(p, '#sgSig', k); await draw(p, '#sgInit', k + 3); await p.click('#sgDrawGo'); await p.waitForSelector('#sgPlaces'); };
  const finishInPerson = async (p, id) => { await tick(p, '#sgSaw'); if (id === 'known_to_tim') await p.$eval('input[name="sgIdWho"][value="known"]', e => e.click()); else if (id !== 'none') await p.selectOption('#sgIdType', id || 'passport'); await p.click('#sgFinishGo'); await p.waitForSelector('#sgHandback'); await p.click('#sgImTim'); await p.waitForSelector('#sgView'); };
  // Tim prepares the link emails (drafts: nothing is sent), then sends them from the page: one at a time, or ticking Reviewed and Send all reviewed
  // Tim mediates (24 November 2026): mail since a point, to anyone but Tim, codes aside (a signer asks for their own code)
  // what a vendor sees on their own page (dashboard and journey map), as text
  const vendorView = async () => { const pv = await page(); await pv.goto(BASE); await pv.evaluate(() => localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'v-1', email: 'vendor@example.com' } }))); await pv.goto(BASE); await pv.waitForTimeout(900);
    const t = (await pv.textContent('#main')).replace(/\s+/g, ' ').trim(); await pv.evaluate(() => localStorage.removeItem('mocksession')); await pv.close(); return t; };
  const notTim = (list, from) => list.slice(from).filter(m => m.to !== 'tim' && m.kind !== 'offer_sign_code');
  const toTim = (list, from) => list.slice(from).filter(m => m.to === 'tim');
  const prepAndSend = async (p, all) => { const n0 = (await mails(p)).length; await p.click('#sgSendGo'); await p.waitForSelector('[data-mlsend]', { timeout: 20000 });
    expect((await mails(p)).length === n0, 'preparing the link emails sends nothing');
    if (all) { for (const c of await p.$$('[data-mlrev]')) { await c.evaluate(e => { if (!e.checked) e.click(); }); await p.waitForTimeout(150); } await p.click('[data-mlall]'); await p.waitForFunction(() => !document.querySelector('[data-mlsend]'), null, { timeout: 20000 }); }
    else for (let i = 0; i < 20; i++) { const bs = await p.$$('[data-mlsend]'); if (!bs.length) break; await bs[0].click(); await p.waitForFunction(n => document.querySelectorAll('[data-mlsend]').length < n, bs.length, { timeout: 20000 }); }
    await p.waitForSelector('#sgSigners'); };
  // a purchaser's full Round 1 turn on Tim's device (phase 3's screens)
  const round1Turn = async (p, n) => { await turnStart(p, n); await p.waitForSelector('#sgConsent'); await tick(p, '#sgAgree'); await p.click('#sgAgreeGo'); await p.waitForSelector('#sgCcaPages .dr-pg canvas');
    await tick(p, '#sgCcaOk'); await tick(p, '#sgSpOk'); await p.click('#sgGuidesGo'); await p.waitForSelector('#sgDraw'); await draw(p, '#sgSig', n); await draw(p, '#sgInit', n + 3); await p.click('#sgDrawGo'); await p.waitForSelector('#sgPlaces'); await tapAll(p); await finishInPerson(p); };
  const draftAndApprove = async (p, oid) => { await p.click(`[data-offer="${oid}"]`); await p.waitForSelector('#drDraftBtn'); await p.click('#drDraftBtn'); await p.waitForSelector('#drReview', { timeout: 30000 });
    await p.waitForSelector('#drApproveDraft:not([disabled])'); await p.click('#drApproveDraft'); await p.waitForSelector('#sgReady'); };
  const toOffer = async (p, oid) => { await p.evaluate(() => { const b = document.querySelector('#sgBackO, #ngBack'); if (b) b.click(); }); await p.waitForSelector('#ofView'); if (oid) await p.waitForSelector('#ngOffer'); };
  // a whole in-person round through Tim's database calls (the screens are covered above), each signer doing every place
  const rpcRound = async (p, sid, opts) => p.evaluate(async ([sid, o]) => { const c = window.supabase.createClient(), M = r => { if (r.error) throw new Error(r.error.message); return r.data; };
    const D_ = JSON.parse(localStorage.getItem('mockdb')), g = D_.offer_signings.find(x => x.id === sid), png = (() => { const cv = document.createElement('canvas'); cv.width = 240; cv.height = 70; const g_ = cv.getContext('2d'); g_.strokeStyle = '#123'; g_.lineWidth = 3; g_.beginPath(); for (let i = 0; i < 24; i++) g_.lineTo(10 + i * 9, 35 + Math.sin(i) * 20); g_.stroke(); return cv.toDataURL('image/png'); })();
    if (g.status === 'ready') M(await c.rpc('agent_signing_start', { p_signing: sid }));
    const ss = D_.offer_signers.filter(x => x.signing_id === sid && !x.void_at).sort((a, z) => a.position - z.position);
    for (const s of ss) { M(await c.rpc('agent_signing_consent', { p_signer: s.id, p_ua: 'ua' })); if ((g.round_no || 1) === 1) { M(await c.rpc('agent_signing_receipt', { p_signer: s.id, p_guide: 'cca', p_version: null, p_file: null, p_sha256: null, p_pages: g.cca_pages })); M(await c.rpc('agent_signing_receipt', { p_signer: s.id, p_guide: 'sale_purchase', p_version: 'August 2022', p_file: 'rea-sale-purchase-guide-2022-en.pdf', p_sha256: null, p_pages: null })); }
      if (g.side === 'vendor') M(await c.rpc('agent_signing_receipt', { p_signer: s.id, p_guide: 'chattels', p_version: null, p_file: null, p_sha256: null, p_pages: null })); M(await c.rpc('agent_signing_marks', { p_signer: s.id, p_sig: png, p_init: png })); }
    // the changes, each with everyone's initials beside it (made by the negotiation core, as the screen does)
    for (const ch of (o && o.changes) || []) { const D2 = JSON.parse(localStorage.getItem('mockdb')), lay = (M(await c.rpc('agent_offer_layers', { p_offer: g.offer_id, p_document: g.document_id }))).layers.filter(L => L.doc_round < g.round_no);
      const cur = D2.offer_sign_marks.filter(m => m.signing_id === sid).map(m => ({ id: m.id, kind: m.kind, page: m.page, geometry: m.geometry, target: m.target })), st = window.NEGO.standing(lay, { doc_round: g.round_no, side: g.side, signing_id: 'c', marks: cur });
      const id = crypto.randomUUID(), pages = g.pages.map((w, i) => ({ n: i + 1, w: w[0], h: w[1] })), allPl = g.places.concat(D2.offer_sign_reviews.filter(r => r.signing_id === sid).flatMap(r => r.places));
      const places = window.NEGO.changePlaces(Object.assign({ id }, ch), ss.map(s => ({ position: s.position, name: s.name })), pages, st, allPl);
      M(await c.rpc('agent_round_change', { p_signer: ss[0].id, p_id: id, p_kind: ch.kind, p_page: ch.page, p_geometry: ch.geometry, p_target: ch.target || null, p_places: places })); }
    const D3 = JSON.parse(localStorage.getItem('mockdb')), all = D3.offer_signings.find(x => x.id === sid);
    for (const s of ss) { const mine = all.places.concat(D3.offer_sign_reviews.filter(r => r.signing_id === sid).flatMap(r => r.places)).filter(x => x.signer === s.position);
      for (const pl of mine) M(await c.rpc('agent_signing_tap', { p_signer: s.id, p_place: pl.id })); M(await c.rpc('agent_signing_finish', { p_signer: s.id, p_id_sighted: 'passport', p_ua: 'ua' })); }
    const r = await c.functions.invoke('offer-sign', { body: { action: 'lock', signing_id: sid } }); return r.data || (r.error && await r.error.context.json()); }, [sid, opts || null]);
  // Tim presents the newest round through his database call, with the places the present screen makes
  const rpcPresent = async (p, oid, method) => p.evaluate(async ([oid, method]) => { const c = window.supabase.createClient(), M = r => { if (r.error) throw new Error(r.error.message); return r.data; };
    const ly = M(await c.rpc('agent_offer_layers', { p_offer: oid, p_document: null })), last = ly.layers[ly.layers.length - 1], side = last.side === 'purchaser' ? 'vendor' : 'purchaser', D_ = JSON.parse(localStorage.getItem('mockdb'));
    const d = D_.offer_drafts.find(x => x.id === ly.document.draft_id), map = D_.offer_blank_maps.find(x => x.id === d.map_id), g0 = D_.offer_signings.find(x => x.id === ly.layers[0].signing_id);
    const people = side === 'vendor' ? D_.property_people.filter(x => x.property_id === d.property_id && (x.role || 'owner') === 'owner').map((x, i) => ({ position: i + 1, name: x.legal_name })) : D_.offer_signers.filter(x => x.signing_id === g0.id && !x.void_at).map(x => ({ position: x.position, name: x.name }));
    const bl = window.__repoBlobs[d.path], bytes = new Uint8Array(await bl.arrayBuffer()), pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/legacy/build/pdf.mjs').catch(() => null);
    const pages = pdfjs ? (await window.DRAFT.readPages(pdfjs, bytes)).map(x => ({ n: x.n, w: x.w, h: x.h, items: x.items })) : g0.pages.map((w, i) => ({ n: i + 1, w: w[0], h: w[1] }));
    const P = window.NEGO.presentPlaces({ pages, placed: d.placed, mapPlaces: map.places, side, signers: people, layers: ly.layers });
    return M(await c.rpc('agent_round_present', { p_offer: oid, p_method: method || 'in_person', p_places: P.places, p_checked: true, p_note: null })); }, [oid, method]);


  // Tim sells this property for himself: the vendor's own phone on the property file is Tim's mobile (the live test, 25 November 2026);
  // their own other phone is on the agency agreement. One vendor, so the vendors' round is one link.
  seed.property_people = [{ id: 'PP1', property_id: 'P1', position: 1, legal_name: 'Testy Vendorperson', pref_name: '', email: 'vendor@example.com', phone: '027 562 7207', user_id: 'v-1', role: 'owner', source: 'agreement', name_from: 'agreement' }];
  seed.agreement_people = [{ id: 'AP1', agreement_id: 'A1', position: 1, legal_name: 'Testy Vendorperson', pref_name: '', email: 'vendor@example.com', phone: '021 000 1111', user_id: 'v-1', signed_at: now }];
  const visibleText = (pg, sel) => pg.$$eval(sel, els => els.map(e => { const b = e.getBoundingClientRect(); return { t: e.textContent, w: b.width, h: b.height, kids: e.children.length, html: e.innerHTML }; }));
  const inkPixels = (pg) => pg.$eval('#sgPage canvas.sg-draw', c => { const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });

  // ── 1. set-up: an offer, the blank approved, Round 1 signed by both purchasers (through Tim's database calls) and locked ──
  process.stderr.write('step 1\n');
  let p = await page(); await asAgent(p);
  await rpc(p, 'agent_offer_link', { p_property: 'P1', p_action: 'open' });
  const offA = (await rpc(p, 'agent_offer_add', { p_property: 'P1', p_offer: offer() })).data;
  await openProp(p);
  const blank = Buffer.from(await SB.make({ cca: true }));
  await p.setInputFiles('#drFile', { name: 'Agreement pack.pdf', mimeType: 'application/pdf', buffer: blank });
  await p.waitForSelector('#drMap', { timeout: 30000 }); await p.click('#drApprove'); await p.waitForSelector('#offTile');
  await draftAndApprove(p, offA); await p.click('#sgReady'); await p.waitForSelector('#sgReleaseView', { timeout: 30000 }); await p.click('#sgRelease'); await p.waitForSelector('#sgView');
  let d = await db(p); const g1 = d.offer_signings.find(g => g.offer_id === offA && (g.round_no || 1) === 1);
  const lk1 = await rpcRound(p, g1.id); expect(lk1 && lk1.ok, 'Round 1 locked: ' + JSON.stringify(lk1));
  d = await db(p); const drA = d.offer_drafts.find(x => x.offer_id === offA), priceBox = drA.placed.find(x => x.id === 'price').boxes[0];

  // ── 2. the present screen: Tim's tick is kept when he changes how they sign; the vendors' link screen worded for vendors ──
  process.stderr.write('step 2\n');
  await p.goto(BASE); await p.waitForTimeout(500); await openProp(p); await p.click(`[data-offer="${offA}"]`); await p.waitForSelector('#ngPresent', { timeout: 30000 });
  await p.click('#ngPresent'); await p.waitForSelector('#ngPresentView'); await p.waitForSelector('#ngCanvas .dr-pg canvas');
  await tick(p, '#ngChecked'); await p.$eval('input[name="ngMethod"][value="link"]', e => e.click()); await p.waitForSelector('#ngNoEmail, #ngWho [data-ngwho] span[translate="no"]', { state: 'attached' }).catch(() => null);
  expect(await p.isChecked('#ngChecked'), 'changing "How they sign" to by link keeps the "I\'ve looked at Round 1" tick');
  await p.$eval('input[name="ngMethod"][value="in_person"]', e => e.click()); await p.waitForTimeout(150); expect(await p.isChecked('#ngChecked'), 'and back to in person: still ticked');
  await p.$eval('input[name="ngMethod"][value="link"]', e => e.click()); await p.waitForTimeout(150);
  await p.$eval('#ngLinkChanges', e => { if (!e.checked) e.click(); });
  await p.click('#ngGo'); await p.waitForSelector('#sgSendGo');
  const sendTxt = await p.textContent('#sgSend'); out.sendTxt = sendTxt.replace(/\s+/g, ' ').trim();
  expect(/each vendor their own link/.test(sendTxt) && !/purchaser/i.test(sendTxt), 'the vendors\' round by link: "Send emails each vendor their own link", nothing about purchasers: ' + out.sendTxt);
  await prepAndSend(p);
  const vLink = (await mails(p)).filter(m => m.kind === 'offer_sign_link').pop();
  expect(vLink && vLink.to === 'vendor@example.com', 'the vendor\'s link went (Tim\'s own phone in its sign-off is fine, though the vendor\'s phone on file is Tim\'s)');

  // ── 3. the vendor counters by link: strike the price (snapped, kept on the page, the words shown), type a new one (visible) ──
  process.stderr.write('step 3\n');
  let q = await page(); await q.goto(vLink.link); await q.waitForSelector('#sgCode');
  expect(/An offer on your property/.test(await q.evaluate(() => document.title)), 'the vendor\'s link page is titled for a vendor');
  await q.click('#sgSendCode'); await q.waitForFunction(() => /Sent/.test(document.querySelector('#sgCodeMsg').textContent));
  const code = (await mails(q)).filter(m => m.kind === 'offer_sign_code' && m.to === 'vendor@example.com').pop(); await q.fill('#sgCodeIn', code.code); await q.click('#sgCodeGo');
  await q.waitForSelector('#sgConsent'); await tick(q, '#sgAgree'); await q.click('#sgAgreeGo'); await q.waitForSelector('#ngChattels'); await tick(q, '#ngChatOk'); await q.click('#ngChatGo');
  await q.waitForSelector('#sgDraw'); await draw(q, '#sgSig', 5); await draw(q, '#sgInit', 6); await q.click('#sgDrawGo'); await q.waitForSelector('#sgPlaces');
  await q.selectOption('#sgPgPick', String(priceBox.page)); await q.waitForSelector(`#sgPage .dr-pg[data-page="${priceBox.page}"] canvas`);
  const W = 595.32, H = 842.04, fy = y => 1 - y / H;
  const drag = async (fx0, fy0, fx1, fy1) => { const el = await q.$('#sgPage .sg-draw'); await el.scrollIntoViewIfNeeded(); const bx = await el.boundingBox(); await q.mouse.move(bx.x + bx.width * fx0, bx.y + bx.height * fy0); await q.mouse.down(); await q.mouse.move(bx.x + bx.width * fx1, bx.y + bx.height * fy1, { steps: 6 }); await q.mouse.up(); };
  await q.click('[data-tool="strike"]'); await q.waitForSelector('#sgPage .sg-draw', { state: 'attached' });
  // over empty paper (the right margin, low on the page): refused in plain words, nothing to save
  await drag(0.93, fy(60), 0.98, fy(60)); await q.waitForFunction(() => /Drag along the words you want to strike through/.test(document.querySelector('#sgErr').textContent), null, { timeout: 15000 });
  expect(await q.$eval('#sgMarkSave', b => b.disabled), 'a drag over empty paper: refused plainly, nothing to save');
  // the read words of the price line, for where the line must go
  const pages = await D.readPages(pdfjs, new Uint8Array(await blob(q, drA.path) || await blob(p, drA.path)));
  const pit = pages[priceBox.page - 1].items.find(i => /655,000/.test(i.s) && Math.abs(i.y - priceBox.y) < 12); out.priceItem = pit;
  // a sloppy drag: starting inside the figure, ending short of it, a little low (as a finger does)
  await drag((pit.x + pit.w * 0.3) / W, fy(pit.y + 0.5), (pit.x + pit.w * 0.7) / W, fy(pit.y + 0.5));
  await q.waitForFunction(() => /This strikes through:/.test((document.querySelector('#sgStrikeWords') || {}).textContent || ''), null, { timeout: 15000 });
  const words = await q.textContent('#sgStrikeWords'); out.strikeWords = words;
  expect(/This strikes through: "\$?655,000"/.test(words), 'before Save the vendor is shown the words the line strikes: ' + words);
  expect(await inkPixels(q) > 20, 'the line stays on the page after the finger lifts, until it is saved or cancelled');
  expect(!(await q.$eval('#sgMarkSave', b => b.disabled)), 'Save confirms it');
  await q.click('#sgMarkSave'); await q.waitForSelector('#sgPlaces'); await q.waitForSelector('#sgPage .dr-pg canvas');
  d = await db(q); const sm = d.offer_sign_marks.find(m => m.kind === 'strike'); out.strike = sm && sm.geometry;
  expect(sm && /^\$?655,000$/.test(sm.geometry.text), 'the struck words are recorded with the mark: ' + JSON.stringify(sm && sm.geometry));
  expect(sm && Math.abs(sm.geometry.x0 - pit.x) < 1.5 && Math.abs(sm.geometry.x1 - (pit.x + pit.w)) < 1.5, 'the line runs from the first letter of the figure to its last, not where the finger went: ' + JSON.stringify(sm && sm.geometry) + ' vs ' + JSON.stringify(pit));
  expect(sm && sm.geometry.y > pit.y + pit.h * 0.2 && sm.geometry.y < pit.y + pit.h * 0.5, 'through the middle of the figures, not along their foot like an underline');
  // a crossed-out box stays on the page until saved; Cancel takes it off
  await q.click('[data-tool="cross"]'); await q.waitForSelector('#sgPage .sg-draw', { state: 'attached' });
  await drag(0.1, 0.1, 0.3, 0.15); await q.waitForFunction(() => !document.querySelector('#sgMarkSave').disabled);
  expect(await inkPixels(q) > 20, 'a crossed-out box stays on the page after the finger lifts');
  await q.click('#sgMarkCancel'); await q.waitForTimeout(300);
  // typed words: shown on the page where they go, at their size
  await q.click('[data-tool="insert"]'); await q.waitForSelector('#sgPage .sg-draw', { state: 'attached' });
  { const el = await q.$('#sgPage .sg-draw'); await el.scrollIntoViewIfNeeded(); const bx = await el.boundingBox(); await q.mouse.click(bx.x + bx.width * (priceBox.x / W), bx.y + bx.height * fy(priceBox.y - 10)); }
  await q.fill('#ngInsText', '$690,000'); await q.click('#sgMarkSave'); await q.waitForSelector('#sgPlaces'); await q.waitForSelector('#sgPage .dr-pg canvas');
  await q.waitForSelector('#sgPage text.sg-ins', { state: 'attached' }); await q.waitForTimeout(400);   // after the page's translator guard has run
  let ti = await visibleText(q, '#sgPage text.sg-ins'); out.insOnSigning = ti;
  expect(ti.length === 1 && ti[0].t === '$690,000' && ti[0].w > 5 && ti[0].h > 3 && ti[0].kids === 0, 'the typed words are drawn on the signing page (plain SVG text, no HTML span inside it): ' + JSON.stringify(ti));
  { const st = await q.$eval('#sgPage text.sg-ins', e => ({ fs: e.style.fontSize, x: +e.getAttribute('x'), y: +e.getAttribute('y') })); const ins = (await db(q)).offer_sign_marks.find(m => m.kind === 'insert');
    expect(st.fs === '9px' && st.x === ins.geometry.x && Math.abs(st.y - (H - ins.geometry.y)) < 0.01, 'in the same place and size the locked copy draws them (page points, 9 point): ' + JSON.stringify(st)); }
  expect(!(await side(q)), 'the signing page at 390 px: no sideways scroll');
  await tapAll(q); await q.click('#sgFinishGo'); await q.waitForSelector('#sgThanks', { timeout: 30000 });
  d = await db(q); const r2 = d.offer_rounds.find(r => r.offer_id === offA && r.doc_round === 2);
  expect(r2, 'Round 2 locked when the vendor finished');
  const r2txt = (await pdfText(await blob(q, r2.path) || await blob(p, r2.path))).join(' ');
  expect(/a line through text striking "\$?655,000"/.test(r2txt) && /typed words "\$690,000"/.test(r2txt), 'the round\'s execution record lists exactly what was struck and what was typed');
  await q.close();

  // ── 4. Tim's present screen (the working copy): the typed words are drawn there too ──
  process.stderr.write('step 4\n');
  await p.goto(BASE); await p.waitForTimeout(500); await openProp(p); await p.click(`[data-offer="${offA}"]`); await p.waitForSelector('#ngPresent', { timeout: 30000 });
  await p.click('#ngPresent'); await p.waitForSelector('#ngPresentView'); await p.waitForSelector('#ngCanvas .dr-pg canvas');
  if (+(await p.inputValue('#ngPick')) !== priceBox.page) { await p.selectOption('#ngPick', String(priceBox.page)); await p.waitForTimeout(600); }
  await p.waitForSelector('#ngCanvas text.sg-ins', { state: 'attached' }); await p.waitForTimeout(400);
  ti = await visibleText(p, '#ngCanvas text.sg-ins'); out.insOnPresent = ti;
  expect(ti.length === 1 && ti[0].t === '$690,000' && ti[0].w > 5 && ti[0].kids === 0, 'the typed words are drawn on Tim\'s present screen: ' + JSON.stringify(ti));
  // the purchasers accept Round 2 in person (through Tim's database calls), and the agreement is formed
  const pr3 = await rpcPresent(p, offA, 'in_person'); const lk3 = await rpcRound(p, pr3.id); expect(lk3 && lk3.ok && lk3.round.formed, 'Round 3: the purchasers accept; the agreement is formed: ' + JSON.stringify(lk3));

  // ── 5. Tim confirms: he alone is emailed the dated copy at once, with the agreed price after the negotiation; the drafts follow it ──
  process.stderr.write('step 5\n');
  await p.goto(BASE); await p.waitForTimeout(500); await openProp(p); await p.click(`[data-offer="${offA}"]`); await p.waitForSelector('#ngFormed', { timeout: 30000 });
  const M0 = (await mails(p)).length;
  await tick(p, '#ngAgCheck'); await p.click('#ngAgree'); await p.waitForSelector('#ngAgreed', { timeout: 30000 });
  d = await db(p); const ag = d.offer_agreements.find(x => x.offer_id === offA);
  const tm = (await mails(p)).slice(M0); out.timMail = tm.map(m => ({ kind: m.kind, to: m.to, subject: m.subject, body: m.body }));
  expect(tm.length === 1 && tm[0].kind === 'offer_agreed_copy' && tm[0].to === 'tim' && tm[0].attachments[0].sha256 === ag.sha256, 'Tim alone is emailed the locked dated copy at once');
  const tb = (tm[0] || {}).body || '';
  expect(tb.includes('Price: $690,000. Changed in the negotiation: typed in Round 2 in place of the struck price.') && !/655,000/.test(tb), 'Tim\'s email: the agreed price is the typed figure, with the round it was changed in; never the first offer\'s: ' + tb);
  expect(tb.includes('Purchasers: Ana Testbuyer and Bo Testbuyer.') && tb.includes('Vendors: Testy Vendorperson.') && /Date of agreement: \w+day \d{1,2} \w+ \d{4}\./.test(tb) && /Settlement day: \w+day/.test(tb) && /Deposit holder: /.test(tb), 'Tim\'s email: the date, the parties, settlement day and the deposit holder');
  await p.waitForSelector('#mlAgreed [data-mlsend]', { timeout: 30000 });
  d = await db(p); const dp = d.offer_mail_drafts.find(m => m.offer_id === offA && m.kind === 'agreed_purchasers' && m.status === 'draft'), dv = d.offer_mail_drafts.find(m => m.offer_id === offA && m.kind === 'agreed_vendors' && m.status === 'draft');
  out.dpBody = dp && dp.body;
  expect(dp && dv && /Price: \$690,000/.test(dp.body) && /Price: \$690,000/.test(dv.body) && !/655,000/.test(dp.body + dv.body), 'the parties\' drafts: the agreed price after the negotiation');
  expect(!/\[Tim to fill: (the \w+ due date|settlement day|the agreed price after negotiation)\]/.test(dp.body + dv.body), 'no blanks for what the portal knows: the due date, settlement day and price');
  const notes = await p.textContent('#mlNotes'); out.notes = notes.replace(/\s+/g, ' ');
  expect(/Price \$690,000 \(the figure typed in Round 2 in place of the struck price; check\)/.test(notes) && /Settlement day \w+day \d{1,2} \w+ \d{4} \(worked out from the agreement date/.test(notes) && !/worked out/.test(dp.body + dv.body), 'what was worked out, shown once to Tim beside the editor, with how; never in the emails: ' + out.notes);
  expect(!(await side(p)), 'the offer page at 390 px: no sideways scroll');

  // ── 6. the privacy check (025): Tim's own phone in an email to the purchasers passes where Tim is the vendor; a vendor's own phone doesn't ──
  process.stderr.write('step 6\n');
  const att = { path: ag.path, sha256: ag.sha256, name: 'Agreement 1 Example Road.pdf' };
  const add = body => rpc(p, 'agent_mail_draft_add', { p_offer: offA, p_kind: 'agreed_purchasers', p_signer: null, p_to: ['ana.p@example.com'], p_cc: [], p_subject: 'Congratulations! 1 Example Road', p_body: body, p_attach: att });
  let ar = await add('Dear Ana,\n\nAny questions, just call me on 027 562 7207.\n\nTim'); out.timPhone = ar.error && ar.error.message;
  expect(!ar.error, 'Tim\'s own mobile in his sign-off to the purchasers passes, though the vendor\'s phone on file is the same (Tim is the vendor): ' + out.timPhone);
  ar = await add('Dear Ana,\n\nThe vendor is on 021 000 1111.\n\nTim'); expect(ar.error && /a vendor's own phone or email/.test(ar.error.message), 'a real vendor\'s own phone is still refused: ' + (ar.error && ar.error.message));
  ar = await add('Dear Ana,\n\nThe vendor is vendor@example.com.\n\nTim'); expect(ar.error && /a vendor's own phone or email/.test(ar.error.message), 'and a vendor\'s own email');

  await b.close();
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => { console.log(JSON.stringify({ errs: ['crashed: ' + (e.stack || e.message)].concat(global.__errs || []), out: global.__out })); process.exit(0); });

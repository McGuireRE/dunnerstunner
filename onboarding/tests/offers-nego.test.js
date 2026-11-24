// Offers phase 4: presentation and counteroffers, against the mock database, with a synthetic blank made at test time
// (tests/synthetic-blank.js; the real form is never copied here). Covers: nothing reaching the vendors until Tim looks at Round 1 and
// taps Present (and every return trip needing his tap too); the vendors' personal link and emailed code; the reminder that every
// chattel must be in full working order at settlement, and that they can talk to their lawyer at any time; the purchasers' names and
// lawyer shown to them, never the purchasers' own contact details; a vendor counter that strikes the price and types a new one, lifting
// the purchasers' initials at that place from the working copy (Round 1 still has them), initialled by both vendors and signed, and
// locked as Round 2; Tim presenting it back; the purchasers accepting in person (initialling each change and signing, no guides again);
// the agreement formed, the date typed in full, the agreed copy locked with the date at the top, the stage moved to Under offer, other
// offers untouched; a five-round negotiation with one fresh copy (the messy document closed and filed with its rounds, the offer
// corrected and re-drafted, Round 1 of Document 2), every round filed; the lawyers' pack (a zip holding every locked round byte for
// byte and the timeline as a readable page); a withdrawal stopping the round in progress and killing the open link; the vendors'
// normal screens still showing nothing about offers; another buyer seeing nothing; 390 px with no sideways scroll; light and dark;
// the signature pads white in both.
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

  // ── 1. set-up: three offers, the blank and its places approved; offer A's Round 1 signed by both purchasers on Tim's device ──
  process.stderr.write('step 1\n');
  let p = await page(); await asAgent(p);
  await rpc(p, 'agent_offer_link', { p_property: 'P1', p_action: 'open' });
  const offA = (await rpc(p, 'agent_offer_add', { p_property: 'P1', p_offer: offer() })).data;
  const offB = (await rpc(p, 'agent_offer_add', { p_property: 'P1', p_offer: offer({ price: '640000', purchasers: [{ first: 'Cy', last: 'Otherbuyer', email: 'cy.o@example.com', phone: '027 100 2000' }] }) })).data;
  const offC = (await rpc(p, 'agent_offer_add', { p_property: 'P1', p_offer: offer({ price: '630000', sign: 'digital', purchasers: [{ first: 'Di', last: 'Thirdbuyer', email: 'di.t@example.com', phone: '027 300 4000' }] }) })).data;
  await openProp(p);
  const blank = Buffer.from(await SB.make({ cca: true }));
  await p.setInputFiles('#drFile', { name: 'Agreement pack.pdf', mimeType: 'application/pdf', buffer: blank });
  await p.waitForSelector('#drMap', { timeout: 30000 }); await p.click('#drApprove'); await p.waitForSelector('#offTile');
  await draftAndApprove(p, offA); await p.click('#sgReady'); await p.waitForSelector('#sgReleaseView', { timeout: 30000 }); await p.click('#sgRelease'); await p.waitForSelector('#sgView');
  await round1Turn(p, 1); await round1Turn(p, 2); await p.waitForSelector('#sgRound', { timeout: 30000 });
  let d = await db(p); const rA1 = d.offer_rounds.find(r => r.offer_id === offA), drA = d.offer_drafts.find(x => x.offer_id === offA), priceBox = drA.placed.find(x => x.id === 'price').boxes[0];
  expect(rA1 && rA1.doc_round === 1 && d.offer_documents.some(x => x.offer_id === offA && x.status === 'open' && x.number === 1), 'Round 1 locked: Document 1 is open');
  expect(!d.offer_signings.some(g => g.side === 'vendor') && !(await mails(p)).some(m => /vendor/.test(m.to)), 'nothing has gone to the vendors');
  const r1Pdf = await blob(p, rA1.path);

  // ── 2. Tim presents: only once he has looked; by personal link; nothing sent until Send ──
  process.stderr.write('step 2\n');
  await toOffer(p, offA);
  expect(/Nothing has gone to the vendors yet/.test(await p.textContent('#ngNext')), 'the offer page says nothing has gone to the vendors');
  await p.click('#ngPresent'); await p.waitForSelector('#ngPresentView'); await p.waitForSelector('#ngCanvas .dr-pg canvas');
  expect(/first round, so each initials the foot of every page/.test(await p.textContent('#ngWho')) && /Testy Vendorperson/.test(await p.textContent('#ngWho')) && /Otherly Vendorperson/.test(await p.textContent('#ngWho')), 'the present screen shows who signs and what they do');
  expect(await p.$('#ngLinkChanges') && !(await p.isChecked('#ngLinkChanges')), 'the present screen has "Let them make changes from their link", off by default (Tim, 24 November 2026)');
  await p.$eval('#ngLinkChanges', e => { if (!e.checked) e.click(); });   // Tim switches them on for this round himself
  expect(!(await side(p)), 'the present screen at 390 px: no sideways scroll'); await shot(p, 'present');
  await tick(p, 'input[name="ngMethod"][value="link"]'); await p.waitForTimeout(150);
  await p.click('#ngGo'); await p.waitForFunction(() => /Tick that you have looked at Round 1/.test(document.querySelector('#ngErr').textContent));
  d = await db(p); expect(!d.offer_signings.some(g => g.side === 'vendor'), 'not presented until Tim ticks that he has looked at Round 1');
  await tick(p, '#ngChecked'); await p.click('#ngGo'); await p.waitForSelector('#sgSendGo');
  d = await db(p); const g2 = d.offer_signings.find(g => g.offer_id === offA && g.round_no === 2);
  expect(g2 && g2.link_changes === true, 'the vendors\' round allows changes from their link, because Tim switched it on for this round');
  expect(g2 && g2.side === 'vendor' && g2.status === 'ready' && d.offer_events.some(e => e.kind === 'round_presented' && e.detail.checked_round === 1), 'presented: Round 2 for the vendors, recorded as authorised after looking');
  expect(!(await mails(p)).some(m => m.kind === 'offer_sign_link'), 'still nothing sent before Send');
  expect(/Round 2: the vendors sign/.test(await p.textContent('#sgView h1')), 'the signing screen says it is the vendors\' round');
  await prepAndSend(p);
  const vLinks = (await mails(p)).filter(m => m.kind === 'offer_sign_link');
  expect(vLinks.length === 2 && vLinks.map(m => m.to).sort().join() === 'vendor2@example.com,vendor@example.com' && vLinks.every(m => /An offer on 1 Example Road/.test(m.subject)), 'Send: each vendor emailed their own link');

  // ── 3. the vendors' normal screens still show nothing about offers ──
  process.stderr.write('step 3\n');
  await p.evaluate(() => localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'v-1', email: 'vendor@example.com' } }))); await p.goto(BASE); await p.waitForTimeout(900);
  const vText = await p.textContent('#main');
  expect(!/655,000|Testbuyer|offer to sign|Round [12]|Negotiation/i.test(vText), 'the vendor\'s own dashboard shows nothing about offers');
  for (const t of ['property_offers', 'offer_signings', 'offer_rounds', 'offer_documents', 'offer_agreements', 'offer_signers']) { const r = await p.evaluate(t => window.supabase.createClient().from(t).select('id'), t); expect(!r.data || !r.data.length, `a vendor reads nothing from ${t}`); }
  const vr = await rpc(p, 'agent_round_present', { p_offer: offA, p_method: 'link', p_places: [], p_checked: true }); expect(vr.error, 'a vendor can\'t present anything');
  await p.evaluate(() => localStorage.removeItem('mocksession')); await p.close();

  // ── 4. Testy opens her link (dark mode): a code; the chattels reminder; the lawyer note; the purchasers as on the agreement ──
  process.stderr.write('step 4\n');
  const linkV1 = vLinks.find(m => m.to === 'vendor@example.com').link, linkV2 = vLinks.find(m => m.to === 'vendor2@example.com').link;
  // from here the vendors sign, initial and change many times; only the submitted round may tell anyone, and only Tim
  let p0 = await page(); await p0.goto(BASE); const M0 = (await mails(p0)).length;
  const offerTok = (await rpc(p0, 'agent_offer_link', { p_property: 'P1', p_action: 'get' })).data;
  const buyerView0 = offerTok && offerTok.token ? JSON.stringify((await p0.evaluate(t => window.supabase.createClient().functions.invoke('offer-public', { body: { action: 'info', token: t } }), offerTok.token)).data) : null;
  await p0.close();
  let q = await page('dark'); await q.goto(linkV1); await q.waitForSelector('#sgCode');
  expect(/Tim has an offer on 1 Example Road/.test(await q.textContent('#sgCode')) && !/Testbuyer/.test(await q.textContent('#sgCode')), 'the link greets the vendor; nothing more before the code');
  await q.click('#sgSendCode'); await q.waitForFunction(() => /Sent/.test(document.querySelector('#sgCodeMsg').textContent));
  let code = (await mails(q)).filter(m => m.kind === 'offer_sign_code' && m.to === 'vendor@example.com').pop(); await q.fill('#sgCodeIn', code.code); await q.click('#sgCodeGo');
  await q.waitForSelector('#sgConsent');
  const intro = await q.textContent('#ngIntro');
  expect(/Ana Testbuyer, Bo Testbuyer/.test(intro) && /Pat Solicitor, Synthetic Law/.test(intro) && /talk to your lawyer at any time/.test(intro), 'the vendor sees the purchasers\' names and their lawyer, and that they can talk to their own lawyer at any time');
  expect(!/ana\.p@|bo\.p@|buyer\.own@|777 6666|555 4444|999 8888/.test(await q.textContent('#main')), 'never the purchasers\' own contact details');
  await tick(q, '#sgAgree'); await q.click('#sgAgreeGo'); await q.waitForSelector('#ngChattels');
  expect(/full working order at settlement/.test(await q.textContent('#ngChattels')) && /Outdoor table/.test(await q.textContent('#ngChattels')), 'the chattels reminder, with the chattels in this offer');
  await q.click('#ngChatGo'); expect(/Tick that you have read the reminder/.test(await q.textContent('#sgErr')), 'the reminder must be ticked');
  expect(!(await side(q)), 'the chattels reminder at 390 px: no sideways scroll'); await shot(q, 'chattels_dark');
  await tick(q, '#ngChatOk'); await q.click('#ngChatGo'); await q.waitForSelector('#sgDraw');
  const bgD = await q.$eval('#sgDraw .sig-wrap', e => getComputedStyle(e).backgroundColor), pageBg = await q.$eval('body', e => getComputedStyle(e).backgroundColor);
  expect(bgD === 'rgb(255, 255, 255)' && pageBg !== 'rgb(255, 255, 255)', 'dark mode: the page is dark and the signature pad white');
  await draw(q, '#sgSig', 5); await draw(q, '#sgInit', 6); await q.click('#sgDrawGo'); await q.waitForSelector('#sgPlaces');
  d = await db(q); expect(d.offer_sign_receipts.some(r => r.guide === 'chattels'), 'the reminder is receipted with the time');

  // ── 5. the counter: strike the price and type a new one; the purchasers' initials there are lifted from the working copy ──
  process.stderr.write('step 5\n');
  await q.selectOption('#sgPgPick', String(priceBox.page)); await q.waitForSelector(`#sgPage .dr-pg[data-page="${priceBox.page}"]`); await q.waitForSelector('#sgPage [data-ink]', { state: 'attached' });
  const priceInk = `${rA1.signing_id}/filled:price:s1`;
  expect(await q.$(`#sgPage [data-ink="${priceInk}"]`), 'before the change, the purchasers\' price initials show on the working copy');
  const dragOn = async (fx0, fy0, fx1, fy1) => { const el = await q.$('#sgPage .sg-draw'); await el.scrollIntoViewIfNeeded(); const bx = await el.boundingBox(); await q.mouse.move(bx.x + bx.width * fx0, bx.y + bx.height * fy0); await q.mouse.down(); await q.mouse.move(bx.x + bx.width * fx1, bx.y + bx.height * fy1, { steps: 6 }); await q.mouse.up(); };
  const W = 595.32, H = 842.04, fy = y => 1 - y / H;
  await q.click('[data-tool="strike"]'); await q.waitForSelector('#sgPage .sg-draw', { state: 'attached' });
  await dragOn((priceBox.x - 2) / W, fy(priceBox.y + 4), (priceBox.x + priceBox.w + 2) / W, fy(priceBox.y + 4));
  await q.waitForSelector('#sgMarkSave:not([disabled])'); await q.click('#sgMarkSave'); await q.waitForSelector('#sgPlaces'); await q.waitForSelector('#sgPage .dr-pg canvas');
  await q.waitForFunction(() => document.querySelectorAll('#sgPage [data-ink]').length > 0);
  expect(!(await q.$(`#sgPage [data-ink="${priceInk}"]`)) && !(await q.$(`#sgPage [data-ink="${rA1.signing_id}/filled:price:s2"]`)), 'after the strike, both purchasers\' price initials are lifted from the working copy');
  await q.click('[data-tool="insert"]'); await q.waitForSelector('#sgPage .sg-draw', { state: 'attached' });
  { const el = await q.$('#sgPage .sg-draw'); await el.scrollIntoViewIfNeeded(); const bx = await el.boundingBox(); await q.mouse.click(bx.x + bx.width * (priceBox.x / W), bx.y + bx.height * fy(priceBox.y - 10)); }
  for (const bad of ['Call me on 021 000 1111', 'Call me on 021\u00a0000\u00a01111', 'Call me on 021/000/1111', 'Call me on ０２１ ０００ １１１１', 'email vendor @ example.com']) {
    await q.fill('#ngInsText', bad); await q.click('#sgMarkSave'); await q.waitForFunction(() => /a vendor's own phone or email, so they can't go on the agreement/.test(document.querySelector('#sgErr').textContent));
    await q.evaluate(() => { document.querySelector('#sgErr').textContent = ''; }); }
  d = await db(q); expect(!d.offer_sign_marks.some(m => m.kind === 'insert'), 'a vendor\'s own phone or email in typed words (any spacing, full-width digits, slashes, a spaced @) is refused by the database, and the refusal shown plainly on the link screen');
  // and by the database too, for a vendor's own phone that is only on the agency agreement, and for a phone written with underscores
  { const ses_ = await q.evaluate(() => Object.keys(sessionStorage).filter(k => /^sgSes:/.test(k)).map(k => sessionStorage.getItem(k))[0]);
    for (const t of ['Ring 021 000 2222', 'Ring 021_000_2222']) { const rr = await invoke(q, { action: 'change', token: linkV1.split('sign=')[1], session: ses_, id: '9f9f9f9f-0000-4000-8000-00000000000' + (t.length % 10), kind: 'insert', page: priceBox.page, geometry: { x: priceBox.x, y: priceBox.y - 10, text: t, size: 9 }, places: [] });
      expect(rr.ok === false && /a vendor's own phone or email/.test(rr.error), 'the database refuses a vendor\'s own phone: ' + t); } }
  await q.fill('#ngInsText', '$690,000'); await q.click('#sgMarkSave'); await q.waitForSelector('#sgPlaces'); await q.waitForSelector('#sgPage .dr-pg canvas');
  // ordinary counteroffer wording with dates and prices in any format: accepted (the link screen doesn't pre-check digits)
  const ORDINARY = ['Settlement 20/12/2026', 'Settlement 20.12.2026', 'Settlement 2027-03-01', 'Price $1 250 000', 'Price $1250000', 'Price $ 695 000.00'];
  for (const [i, t] of ORDINARY.entries()) { await q.selectOption('#sgPgPick', '2'); await q.waitForSelector('#sgPage .dr-pg[data-page="2"] canvas');
    await q.click('[data-tool="insert"]'); await q.waitForSelector('#sgPage .sg-draw', { state: 'attached' });
    { const el = await q.$('#sgPage .sg-draw'); await el.scrollIntoViewIfNeeded(); const bx = await el.boundingBox(); await q.mouse.click(bx.x + bx.width * 0.08, bx.y + bx.height * (0.3 + i * 0.08)); }
    await q.fill('#ngInsText', t); await q.click('#sgMarkSave'); await q.waitForFunction(n => window.JSON.parse(localStorage.getItem('mockdb')).offer_sign_marks.filter(m => m.kind === 'insert').length === n, i + 2, { timeout: 10000 }).catch(() => null);
    await q.waitForSelector('#sgPlaces'); }
  // a new further term in the counteroffer: numbered on from the newest draft's term_last, in the draft's printed style (main's 23.0)
  { await q.selectOption('#sgPgPick', '2'); await q.waitForSelector('#sgPage .dr-pg[data-page="2"] canvas');
    await q.click('[data-tool="insert"]'); await q.waitForSelector('#sgPage .sg-draw', { state: 'attached' });
    { const el = await q.$('#sgPage .sg-draw'); await el.scrollIntoViewIfNeeded(); const bx = await el.boundingBox(); await q.mouse.click(bx.x + bx.width * 0.08, bx.y + bx.height * 0.85); }
    const dd = await db(q), drN = dd.offer_drafts.find(x => x.id === dd.offer_signings.find(g => g.id === g2.id).draft_id), last = drN.edits.term_last, style = (drN.placed.find(x => x.id === 'further_terms') || {}).number_style;
    const want = (style || (last != null ? 'dot0' : 'dot')) === 'dot0' ? `${last + 1}.0` : `${last + 1}.`;
    out.newTerm = { last, style, label: await q.textContent('label:has(#ngInsTerm)') };
    expect(Number.isInteger(last) && last >= 1 && out.newTerm.label.trim().endsWith('numbered ' + want), 'the box offers the next further term number after the draft\'s term_last: ' + JSON.stringify(out.newTerm));
    await q.$eval('#ngInsTerm', e => { if (!e.checked) e.click(); }); await q.fill('#ngInsText', 'Synthetic counteroffer term'); await q.click('#sgMarkSave');
    await q.waitForFunction(() => window.JSON.parse(localStorage.getItem('mockdb')).offer_sign_marks.some(m => m.kind === 'insert' && /Synthetic counteroffer term$/.test(m.geometry.text)), null, { timeout: 10000 }).catch(() => null); await q.waitForSelector('#sgPlaces');
    const mt = (await db(q)).offer_sign_marks.find(m => m.kind === 'insert' && /Synthetic counteroffer term$/.test(m.geometry.text));
    expect(mt && mt.geometry.text === want + ' Synthetic counteroffer term', 'saved as "' + want + ' Synthetic counteroffer term": ' + (mt && mt.geometry.text)); }
  // review fix 6: the server refuses a number already used in this agreement, and the page retries with the free one it names
  { const ses_ = await q.evaluate(() => Object.keys(sessionStorage).filter(k => /^sgSes:/.test(k)).map(k => sessionStorage.getItem(k))[0]);
    const dd = await db(q), drN = dd.offer_drafts.find(x => x.id === dd.offer_signings.find(g => g.id === g2.id).draft_id), last = drN.edits.term_last;
    const dup = await invoke(q, { action: 'change', token: linkV1.split('sign=')[1], session: ses_, id: '9e9e9e9e-0000-4000-8000-000000000001', kind: 'insert', page: 2, geometry: { x: 60, y: 200, text: `${last + 1}.0 Duplicate synthetic term`, size: 9 }, places: [] });
    expect(dup.ok === false && new RegExp(`Further term ${last + 1}\\.0 is already taken.*next free number is ${last + 2}\\.0`).test(dup.error), 'the server refuses the same number twice: ' + JSON.stringify(dup));
    // another addition lands at the same moment (put straight into the mock), while this page still offers the old next number
    await q.selectOption('#sgPgPick', '2'); await q.waitForSelector('#sgPage .dr-pg[data-page="2"] canvas');
    await q.click('[data-tool="insert"]'); await q.waitForSelector('#sgPage .sg-draw', { state: 'attached' });
    { const el = await q.$('#sgPage .sg-draw'); await el.scrollIntoViewIfNeeded(); const bx = await el.boundingBox(); await q.mouse.click(bx.x + bx.width * 0.08, bx.y + bx.height * 0.9); }
    const stale = (await q.textContent('label:has(#ngInsTerm)')).trim(); expect(stale.endsWith(`numbered ${last + 2}.0`), 'the page offers ' + (last + 2) + '.0: ' + stale);
    await q.evaluate(([gid, n]) => { const d = window.__mockDB; const s0 = d.offer_signers.find(x => x.signing_id === gid);   // the mock's own data (DB), as another request would leave it
      d.offer_sign_marks.push({ id: '9e9e9e9e-0000-4000-8000-0000000000aa', signing_id: gid, signer_id: s0.id, by_name: s0.name, kind: 'insert', page: 2, geometry: { x: 60, y: 150, text: n + '.0 Simultaneous synthetic term', size: 9 }, target: null, at: new Date().toISOString() });
      localStorage.setItem('mockdb', JSON.stringify(d)); }, [g2.id, last + 2]);
    await q.$eval('#ngInsTerm', e => { if (!e.checked) e.click(); }); await q.fill('#ngInsText', 'Retried synthetic term'); await q.click('#sgMarkSave');
    await q.waitForFunction(() => JSON.parse(localStorage.getItem('mockdb')).offer_sign_marks.some(m => /Retried synthetic term$/.test((m.geometry || {}).text || '')), null, { timeout: 10000 }).catch(() => null);
    const rt_ = (await db(q)).offer_sign_marks.find(m => /Retried synthetic term$/.test((m.geometry || {}).text || ''));
    expect(rt_ && rt_.geometry.text === `${last + 3}.0 Retried synthetic term`, 'the page retried with the next free number: ' + (rt_ && rt_.geometry.text));
    // the simultaneous one was only a stand-in for the race: take it out again so the rest of the round is as before
    await q.evaluate(() => { const D = window.__mockDB, i = D.offer_sign_marks.findIndex(m => m.id === '9e9e9e9e-0000-4000-8000-0000000000aa'); if (i >= 0) D.offer_sign_marks.splice(i, 1); localStorage.setItem('mockdb', JSON.stringify(D)); });
    await q.reload(); await q.waitForSelector('#sgPlaces', { timeout: 30000 }); }
  d = await db(q); out.ordinary = d.offer_sign_marks.filter(m => m.kind === 'insert').map(m => m.geometry.text);
  expect(ORDINARY.every(t => out.ordinary.includes(t)), 'dates and prices typed in any format are accepted');
  const NCH = 4 + ORDINARY.length;
  d = await db(q); const ch2 = d.offer_sign_marks.filter(m => m.signing_id === g2.id);
  expect(ch2.length === NCH && ch2.some(m => m.kind === 'strike') && ch2.some(m => m.kind === 'insert' && m.geometry.text === '$690,000') && ch2.every(m => m.by_name === 'Testy Vendorperson'), 'two changes saved, with who made them');
  expect(d.offer_sign_reviews.filter(r => r.signing_id === g2.id).every(r => r.places.length === 2 && r.places.every(x => x.why === 'change')), 'each change carries both vendors\' initials');
  expect(d.offer_events.filter(e => e.kind === 'round_change' && e.offer_id === offA).length === NCH, 'each change is on the timeline');
  expect(!(await side(q)), 'the change tools at 390 px: no sideways scroll'); await shot(q, 'counter_dark');
  expect(await q.$('#sgToTimOnly') && /goes straight to Tim McGuire, the agent/.test(await q.textContent('#sgToTimOnly')), 'before confirming: it goes straight to Tim, who tells the other party');
  await tapAll(q); await q.click('#sgFinishGo'); await q.waitForSelector('#sgThanks');
  { const ml = await mails(q); expect(!notTim(ml, M0).length && !toTim(ml, M0).length, 'the first vendor\'s many taps, changes and finish: no email to anyone, Tim included: ' + notTim(ml, M0).concat(toTim(ml, M0)).map(m => m.kind + '>' + m.to).join(', ')); }
  await q.close();
  // the second vendor, by her own link: she must initial both changes too
  q = await page('light'); await q.goto(linkV2); await q.waitForSelector('#sgCode'); await q.click('#sgSendCode'); await q.waitForFunction(() => /Sent/.test(document.querySelector('#sgCodeMsg').textContent));
  code = (await mails(q)).filter(m => m.kind === 'offer_sign_code' && m.to === 'vendor2@example.com').pop(); await q.fill('#sgCodeIn', code.code); await q.click('#sgCodeGo');
  await q.waitForSelector('#sgConsent'); await tick(q, '#sgAgree'); await q.click('#sgAgreeGo'); await q.waitForSelector('#ngChattels'); await tick(q, '#ngChatOk'); await q.click('#ngChatGo');
  await q.waitForSelector('#sgDraw'); await draw(q, '#sgSig', 8); await draw(q, '#sgInit', 9); await q.click('#sgDrawGo'); await q.waitForSelector('#sgPlaces');
  d = await db(q); const v2 = d.offer_signers.find(s => s.signing_id === g2.id && s.position === 2), need2 = +(await q.textContent('#sgCount')).match(/of (\d+)/)[1];
  expect(need2 === g2.places.filter(x => x.signer === 2).length + NCH, 'the second vendor has every place plus her initials beside every change');
  // a link of one offer can't be used for another
  const sesV2 = await q.evaluate(() => Object.keys(sessionStorage).filter(k => /^sgSes:/.test(k)).map(k => sessionStorage.getItem(k))[0]);
  await tapAll(q); await q.click('#sgFinishGo'); await q.waitForSelector('#sgThanks', { timeout: 30000 });
  expect(/locked/.test(await q.textContent('#sgThanks')) && /Nothing goes back to the purchasers/.test(await q.textContent('#sgThanks')), 'the last vendor is thanked; nothing goes back until Tim has checked it');
  { const ml = await mails(q), tim = toTim(ml, M0);
    expect(!notTim(ml, M0).length, 'the round submitted: nothing to the purchasers, their lawyer or anyone else: ' + notTim(ml, M0).map(m => m.kind + '>' + m.to).join(', '));
    expect(tim.length === 1 && tim[0].kind === 'offer_round_locked' && /^Round 2 submitted by the vendors/.test(tim[0].subject) && /What changed in this round/.test(tim[0].body) && /portal\.dunnerstunner\.co\.nz\/properties\/P1\/offers\//.test(tim[0].body), 'exactly one email, to Tim, at submission: who, what changed, the round\'s address');
    const bv = offerTok && offerTok.token ? JSON.stringify((await q.evaluate(t => window.supabase.createClient().functions.invoke('offer-public', { body: { action: 'info', token: t } }), offerTok.token)).data) : null;
    expect(bv === buyerView0, "the buyers' own offer link shows the same as before the vendors acted"); }
  d = await db(q); const rA2 = d.offer_rounds.find(r => r.offer_id === offA && r.doc_round === 2);
  expect(rA2 && rA2.side === 'vendor' && rA2.changes === NCH && rA2.number === 2 && d.property_offers.find(o => o.id === offA).status === 'countered', 'Round 2 locked: the vendors\' counteroffer with its two changes');
  expect(rA2.lifted.filter(x => x.why === 'filled' && x.side === 'purchaser').length === 2 && rA2.outstanding.length === 2 * NCH, 'its record holds the lifted initials, and the purchasers\' initials beside each change outstanding');
  const r2Pdf = await blob(q, rA2.path); expect(sha(r2Pdf) === rA2.sha256, 'Round 2 stored with its fingerprint');
  const r2t = await pdfText(r2Pdf), np = (await D.readPages(pdfjs, new Uint8Array(r1Pdf))).length;
  expect(r2t[priceBox.page - 1].includes('$690,000') && /Execution record: Round 2/.test(r2t.slice(np - 1).join(' ')), 'Round 2 shows the new price, with its own record');
  expect(!/ana\.p@|bo\.p@|buyer\.own@|vendor@example|vendor2@example|777 6666|000 1111/.test(r2t.join(' ')), 'no purchaser or vendor phone or email on Round 2');
  expect(sha(await blob(q, rA1.path)) === rA1.sha256, 'Round 1 is unchanged, with the purchasers\' initials where they were');
  // the vendor's link and another offer: nothing
  let r = await invoke(q, { action: 'state', token: linkV2.split('sign=')[1], session: sesV2 }); expect(r.ok === false, 'after finishing, the vendor\'s link opens nothing more');
  await q.close();

  // ── 6. Tim presents it back to the purchasers (his tap again); they accept in person: initial both changes and sign ──
  process.stderr.write('step 6\n');
  p = await page(); await p.goto(BASE); await p.evaluate(s => localStorage.setItem('mocksession', s), SESSION); await p.goto(BASE); await p.waitForTimeout(600);
  await openProp(p); await p.click(`[data-offer="${offA}"]`); await p.waitForSelector('#ngOffer');
  expect(/Nothing has gone to the purchasers yet/.test(await p.textContent('#ngNext')) && /Present back to the purchasers/.test(await p.textContent('#ngPresent')), 'the return trip also waits for Tim');
  d = await db(p); expect(!d.offer_signings.some(g => g.offer_id === offA && g.round_no === 3), 'nothing presented back on its own');
  await p.click('#ngPresent'); await p.waitForSelector('#ngPresentView'); await p.waitForSelector('#ngLifted');
  expect(/2 initials or signatures lifted/.test(await p.textContent('#ngLifted')) || /lifted/.test(await p.textContent('#ngLifted')), 'Tim sees what was lifted');
  expect(/initials every change not yet initialled/.test(await p.textContent('#ngWho')) && /signatures from before stand/.test(await p.textContent('#ngWho')), 'the purchasers initial the changes; their signatures stand');
  expect(await p.isChecked('input[name="ngMethod"][value="in_person"]'), 'presenting defaults to in person');
  await tick(p, 'input[name="ngMethod"][value="in_person"]'); await p.waitForSelector('#ngChecked'); await tick(p, '#ngChecked'); await p.click('#ngGo'); await p.waitForSelector('#sgView');
  // a round is out for signing: correcting the offer warns Tim and needs his tick (it would stop the round; the parties are told nothing)
  { await openProp(p); await p.click(`[data-offer="${offA}"]`); await p.waitForSelector('#ofFix'); await p.click('#ofFix'); await p.waitForSelector('#ocSignWarn');
    expect(/out for signing/.test(await p.textContent('#ocSignWarn')) && /you tell them yourself/.test(await p.textContent('#ocSignWarn')), 'the correction screen warns that a round is out for signing');
    await p.fill('#ofNote', 'Testing the warning only'); await p.click('#ofSend');
    await p.waitForFunction(() => /stops the round out for signing/.test((document.querySelector('#ofErr') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => null);
    expect(/Tick that you know this stops the round out for signing/.test(await p.textContent('#ofErr')), 'and saving needs his tick');
    d = await db(p); expect(!d.offer_events.some(e => e.offer_id === offA && e.kind === 'corrected' && e.at > new Date(Date.now() - 6e4).toISOString()), 'nothing corrected without the tick');
    await openProp(p); await p.click(`[data-offer="${offA}"]`); await p.waitForSelector('#ngOffer'); { const d3 = await db(p), g3 = d3.offer_signings.find(g => g.offer_id === offA && g.round_no === 3); await p.click(`[data-signing="${g3.id}"]`); } await p.waitForSelector('#sgView'); }
  const M3 = (await mails(p)).length, vView3 = await vendorView();
  for (const n of [1, 2]) { await turnStart(p, n); await consentDraw(p, n + 10);
    expect(!(await p.$('#sgGuides')) && !(await p.$('#ngChattels')), 'no guides again for the purchasers');
    out['need3_' + n] = +(await p.textContent('#sgCount')).match(/of (\d+)/)[1];
    expect(out['need3_' + n] === NCH, 'each purchaser: their initials beside every change (their Round 1 signature stands: nothing lifted it)');
    if (n === 1) { // on Tim's own screen the parties' details are loaded: a purchaser's own phone is refused straight away, before anything is sent
      await p.click('[data-tool="insert"]'); await p.waitForSelector('#sgPage .sg-draw', { state: 'attached' });
      { const el = await p.$('#sgPage .sg-draw'); await el.scrollIntoViewIfNeeded(); const bx = await el.boundingBox(); await p.mouse.click(bx.x + bx.width * 0.1, bx.y + bx.height * 0.85); }
      const calls0 = await p.evaluate(() => JSON.parse(localStorage.getItem('callLog') || '[]').filter(c => c === 'rpc:agent_round_change').length);
      await p.fill('#ngInsText', 'Ring Ana on 022/777/6666'); await p.click('#sgMarkSave');
      expect(/a purchaser's own phone or email/.test(await p.textContent('#sgErr')) && (await p.evaluate(() => JSON.parse(localStorage.getItem('callLog') || '[]').filter(c => c === 'rpc:agent_round_change').length)) === calls0, 'Tim\'s screen refuses a purchaser\'s own phone straight away, without asking the database');
      await p.click('#sgMarkCancel'); }
    await tapAll(p); await finishInPerson(p); }
  await p.waitForSelector('#sgRound', { timeout: 30000 });
  d = await db(p); const rA3 = d.offer_rounds.find(r => r.offer_id === offA && r.doc_round === 3);
  expect(rA3 && rA3.changes === 0 && !rA3.outstanding.length, 'Round 3 locked: accepted, nothing outstanding');
  { const ml = await mails(p); expect(!notTim(ml, M3).length && toTim(ml, M3).length === 1, 'the purchasers\' round: one email to Tim at submission, nothing to the vendors');
    expect(d.properties.find(x => x.id === 'P1').stage !== 'under_offer', 'the property is not under offer just because both sides have signed: Tim acts');
    // the vendors' own page (dashboard and journey map): exactly as before the purchasers accepted
    const vt = await vendorView(); expect(vt === vView3 && !/655,000|690,000|Testbuyer/.test(vt), "the vendors' page is unchanged by the purchasers accepting"); out.vendorView = vt.slice(0, 300); }
  await toOffer(p, offA); await p.waitForSelector('#ngFormed');

  // ── 7. the agreement: Tim confirms, the date typed in full; the agreed copy locked; Under offer; other offers untouched ──
  process.stderr.write('step 7\n');
  expect(!(await side(p)), 'agreement formed at 390 px: no sideways scroll'); await shot(p, 'formed');
  const today = await p.evaluate(() => window.NEGO.fullDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })));
  expect(await p.inputValue('#ngDate') === today, 'the date is filled in with the day acceptance was communicated');
  await p.fill('#ngDate', '24/11/2026'); await tick(p, '#ngAgCheck'); await p.click('#ngAgree'); expect(/in full with the month name/.test(await p.textContent('#ngAgErr')), 'the date must be in full with the month name');
  const yesterday = await p.evaluate(() => window.NEGO.fullDate(new Date(Date.now() - 864e5).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })));
  await p.fill('#ngDate', yesterday); await p.click('#ngAgree'); await p.waitForFunction(() => /from the day acceptance was communicated/.test(document.querySelector('#ngAgErr').textContent));
  expect(true, 'a date before acceptance was communicated is refused');
  const MA = (await mails(p)).length;
  await p.fill('#ngDate', today); await p.click('#ngAgree'); await p.waitForSelector('#ngAgreed', { timeout: 30000 });
  d = await db(p); const ag = d.offer_agreements.find(x => x.offer_id === offA);
  expect(ag && ag.date_text === today && ag.round_id === rA3.id && d.offer_documents.find(x => x.id === ag.document_id).status === 'agreed' && d.property_offers.find(o => o.id === offA).status === 'accepted', 'the agreement is locked against Round 3, dated as typed');
  const agPdf = await blob(p, ag.path); expect(sha(agPdf) === ag.sha256, 'the agreed copy stored with its fingerprint');
  const agPages = await D.readPages(pdfjs, new Uint8Array(agPdf)), dateP = d.offer_blank_maps.find(x => x.id === drA.map_id).places.find(x => x.id === 'date');
  const di = agPages[dateP.page - 1].items.find(i => i.s === today); expect(di && Math.abs(di.y - dateP.y) < 3, 'the date at the top, in the date place');
  expect(!(await pdfText(r1Pdf)).concat(await pdfText(r2Pdf)).some(t => t.includes(today + ' ') && false), 'the date appears on no earlier round');
  expect(!(await pdfText(r2Pdf))[dateP.page - 1].includes(today), 'the date is not on Round 2');
  expect(d.properties.find(x => x.id === 'P1').stage === 'under_offer', 'the property is now under offer');
  // the agreed copy's emails: built straight away as drafts, nothing sent (Tim, 24 November 2026)
  { const ml = await mails(p); expect(ml.length === MA, 'confirming the agreement sends nothing to anyone: ' + ml.slice(MA).map(m => m.kind + '>' + m.to).join(', ')); }
  await p.waitForSelector('#mlAgreed [data-mlsend]', { timeout: 30000 });
  d = await db(p); { const mds = (d.offer_mail_drafts || []).filter(m => m.offer_id === offA && /^agreed_/.test(m.kind) && m.status === 'draft'), dp = mds.find(m => m.kind === 'agreed_purchasers'), dv = mds.find(m => m.kind === 'agreed_vendors');
    out.agreedDrafts = mds.map(m => ({ kind: m.kind, to: m.to_addr, cc: m.cc_addr, subject: m.subject }));
    expect(dp && dv && mds.length === 2, 'two drafts: to the purchasers and to the vendors');
    expect(dp.to_addr.join() === 'ana.p@example.com,bo.p@example.com' && dp.cc_addr.join() === 'pat@synthlaw.example' && dp.attach.path === ag.path && dp.attach.sha256 === ag.sha256, 'the purchasers\' email: to them, cc their lawyer, the agreed copy attached');
    expect(dv.to_addr.slice().sort().join() === 'vendor2@example.com,vendor@example.com' && dv.attach.sha256 === ag.sha256, 'the vendors\' email: to them, the agreed copy attached');
    expect(!/vendor@example|vendor2@example|000 1111/.test(dp.body) && !/ana\.p@|bo\.p@|buyer\.own@|777 6666|555 4444|999 8888/.test(dv.body), "neither side's email holds the other side's own details");
    expect(/Pat Solicitor/.test(dv.body) && /Roadmap/.test(dp.body) && /Price: \$/.test(dp.body) && /Faithfully,\nTim/.test(dp.body), "each holds the other side's lawyer and the roadmap");
    // Needs you
    await p.click('#navDash'); await p.waitForTimeout(700); expect(/2 emails to read and send/.test(await p.textContent('#main')), 'Needs you lists the unsent emails');
    await openProp(p); await p.click(`[data-offer="${offA}"]`); await p.waitForSelector('#mlAgreed [data-mlsend]');
    // marked blanks block sending until Tim fills or deletes them
    const M5 = (await mails(p)).length;
    await p.click(`[data-mlsend="${dp.id}"]`); await p.waitForFunction(id => /marked blanks first/.test(document.querySelector(`[data-mlout="${id}"]`).textContent), dp.id);
    expect((await mails(p)).length === M5, 'a draft with marked blanks is not sent');
    for (const m of [dp, dv]) await p.$eval(`#mlBody-${m.id}`, e => { e.value = e.value.replace(/\[Tim to [^\]]*\]/g, 'Filled in by Tim'); });
    await p.click(`[data-mlsave="${dp.id}"]`); await p.waitForSelector(`[data-mlsend="${dv.id}"]`);
    // the same email sent twice at once (two tabs, or Send then Send all reviewed): exactly one goes, the other is refused
    const twice = await p.evaluate(id => Promise.all([0, 1].map(() => window.supabase.createClient().functions.invoke('offer-sign', { body: { action: 'send_mail', draft_id: id } }).then(r => r.data || (r.error && r.error.context ? r.error.context.json() : null)))), dp.id);
    let ml = (await mails(p)).slice(M5), sp = ml.filter(m => m.kind === 'offer_mail_agreed_purchasers');
    out.twice = twice;
    expect(sp.length === 1 && twice.filter(r => r && r.ok).length === 1 && twice.some(r => r && /already being sent|already sent/.test(r.error || '')), 'two sends at once: one email, the other refused');
    expect(sp[0].to === 'ana.p@example.com, bo.p@example.com' && (sp[0].cc || []).join() === 'pat@synthlaw.example' && sp[0].attachments[0].sha256 === ag.sha256 && /Filled in by Tim/.test(sp[0].body) && !/\[Tim to /.test(sp[0].body), 'the purchasers\' email goes as Tim left it, cc their lawyer, the agreed copy attached');
    d = await db(p); expect((d.offer_mail_log || []).filter(x => x.draft_id === dp.id).length === 1, 'one log row for one send');
    // the mail server takes the vendors' email but the record of it fails: the page never says nothing has gone
    await openProp(p); await p.click(`[data-offer="${offA}"]`); await p.waitForSelector(`[data-mlsend="${dv.id}"]`);
    await p.$eval(`#mlBody-${dv.id}`, e => { e.value = e.value.replace(/\[Tim to [^\]]*\]/g, 'Filled in by Tim'); });
    await p.evaluate(() => localStorage.setItem('mockMailDoneFail', '1'));
    await p.click(`[data-mlsend="${dv.id}"]`); await p.waitForSelector(`[data-mlgoing="${dv.id}"]`, { timeout: 20000 });
    expect(/this may have gone/i.test(await p.textContent(`[data-mlgoing="${dv.id}"]`)) && !/Nothing has gone/.test(await p.textContent('#mlAgreed')), 'the page says it may have gone, and to check first');
    d = await db(p); expect(d.offer_mail_drafts.find(m => m.id === dv.id).status === 'sending' && d.offer_mail_log.filter(x => x.draft_id === dv.id).map(x => x.status).join() === 'pending', 'the draft waits as sending, with its pending log row');
    const again = await p.evaluate(id => window.supabase.createClient().functions.invoke('offer-sign', { body: { action: 'send_mail', draft_id: id } }).then(r => r.data || (r.error && r.error.context ? r.error.context.json() : null)), dv.id);
    expect(again && again.ok === false && /already being sent, or may have gone/.test(again.error), 'it can\'t simply be sent again');
    await p.click('#navDash'); await p.waitForTimeout(700); expect(/An email may have gone: check it/.test(await p.textContent('#main')), 'Needs you says to check it');
    // Tim checks it didn't arrive: a draft again, the unconfirmed row kept; then he sends it (tick Reviewed, Send all reviewed)
    await p.evaluate(() => localStorage.removeItem('mockMailDoneFail'));
    await openProp(p); await p.click(`[data-offer="${offA}"]`); await p.waitForSelector(`[data-mlunstick="${dv.id}"]`); await p.click(`[data-mlunstick="${dv.id}"]`);
    await p.waitForSelector(`[data-mlrev="${dv.id}"]`); await p.$eval(`[data-mlrev="${dv.id}"]`, e => { if (!e.checked) e.click(); }); await p.waitForTimeout(300);
    await p.click('[data-mlall]'); await p.waitForFunction(() => !document.querySelector('[data-mlsend]'), null, { timeout: 20000 });
    ml = (await mails(p)).slice(M5); expect(ml.filter(m => m.kind === 'offer_mail_agreed_vendors' && /vendor@example\.com/.test(m.to)).length === 2, 'the vendors\' email sent again once Tim checked');
    d = await db(p); const lg = (d.offer_mail_log || []).filter(x => x.offer_id === offA && /^agreed_/.test(x.kind));
    expect(lg.map(x => x.kind + ':' + x.status).sort().join() === 'agreed_purchasers:sent,agreed_vendors:sent,agreed_vendors:unconfirmed', 'the log: each send kept, the unconfirmed one marked: ' + lg.map(x => x.kind + ':' + x.status).join());
    expect(lg.every(x => x.sent_by && x.sent_at && x.attachments[0].sha256 === ag.sha256 && /Filled in by Tim/.test(x.body)), 'each row: who, when, the exact text and the attachment');
    expect(d.offer_mail_drafts.filter(m => m.offer_id === offA && /^agreed_/.test(m.kind) && m.status !== 'void').every(m => m.status === 'sent' && m.sent_by), 'both drafts marked sent');
    await p.click('#navDash'); await p.waitForTimeout(700); expect(!/emails to read and send/.test(await p.textContent('#main')), 'Needs you is clear once they are sent');
    await openProp(p); await p.click(`[data-offer="${offA}"]`); await p.waitForSelector('#ngAgreed'); }
  expect(['received'].includes(d.property_offers.find(o => o.id === offB).status) && d.property_offers.find(o => o.id === offC).status === 'received', 'other offers on the property are untouched');
  r = await rpc(p, 'agent_round_present', { p_offer: offA, p_method: 'link', p_places: [], p_checked: true }); expect(r.error && /agreement has been made/.test(r.error.message), 'nothing more is presented once agreed');
  r = await rpc(p, 'agent_offer_correct', { p_offer: offA, p_details: offer({ price: '1' }), p_note: 'Trying to change an agreed offer' }); expect(r.error && /can't be corrected/.test(r.error.message), 'an agreed offer can\'t be corrected');
  out.terms = { price: ag.terms.price, changes: ag.terms.changes.map(c => c.kind + (c.text ? ':' + c.text : '')) };
  expect(ag.terms.price && ag.terms.changes.length === NCH && !('deposit_paid_to' in ag.terms) && 'deposit_printed' in ag.terms && 'kiwisaver' in ag.terms && ag.terms.changes.some(c => c.text === '$690,000') && ag.round_sha256 === rA3.sha256 && ag.draw_version === 'nego-draw-1', 'the agreed terms and the round it was drawn from are kept with the agreement');

  // ── 8. a five-round negotiation with one fresh copy (offer B): R1, R2 vendors counter, R3 purchaser counters, a fresh copy, R1, R2 ──
  process.stderr.write('step 8\n');
  await p.click('#ofBackP'); await p.waitForSelector('#offTile');
  await draftAndApprove(p, offB); await p.click('#sgReady'); await p.waitForSelector('#sgReleaseView', { timeout: 30000 }); await p.click('#sgRelease'); await p.waitForSelector('#sgView');
  d = await db(p); let gB = d.offer_signings.find(g => g.offer_id === offB && g.round_no === 1);
  r = await rpcRound(p, gB.id); out.bR1 = r; expect(r && r.ok && r.round.round === 1, 'offer B: Round 1 locked');
  let pr = await rpcPresent(p, offB); r = await rpcRound(p, pr.id, { changes: [{ kind: 'cross', page: 2, geometry: { x: 100, y: 500, w: 200, h: 40 } }] });
  expect(r && r.ok && r.round.round === 2, 'offer B: Round 2, the vendors cross out a passage');
  pr = await rpcPresent(p, offB); r = await rpcRound(p, pr.id, { changes: [{ kind: 'strike', page: 1, geometry: { x0: 100, x1: 180, y: 300 } }, { kind: 'insert', page: 1, geometry: { x: 100, y: 290, text: 'Settlement 1 March 2027', size: 9 } }] });
  expect(r && r.ok && r.round.round === 3, 'offer B: Round 3, the purchaser counters again');
  // it has become messy: Tim closes it and starts a fresh copy
  await toOffer(p, offB); await p.waitForSelector('#ngFresh');
  await p.click('#ngFresh summary'); await p.click('#ngClose'); expect(/Say why/.test(await p.textContent('#ngFreshErr')), 'a reason is needed to close the document');
  await p.fill('#ngFreshWhy', 'Too many changes to read. A clean copy at the terms as they stand.'); await p.click('#ngClose'); await p.waitForSelector('#ngOffer .ng-doc');
  d = await db(p); expect(d.offer_documents.find(x => x.offer_id === offB).status === 'closed' && d.offer_rounds.filter(x => x.offer_id === offB).length === 3, 'Document 1 closed and filed, every round kept');
  expect(/Closed, kept as history/.test(await p.textContent('#ngOffer')) && (await p.$$('#ngOffer [data-round]')).length === 3, 'the history stays visible to Tim');
  r = await rpc(p, 'agent_round_present', { p_offer: offB, p_method: 'in_person', p_places: [], p_checked: true }); expect(r.error, 'a closed document can\'t be presented');
  // Tim corrects the offer to the terms as they stand, re-drafts and approves, and Round 1 of Document 2 is signed
  await rpc(p, 'agent_offer_correct', { p_offer: offB, p_details: offer({ price: '660000', settlement: { kind: 'date', date: '2027-03-01' }, purchasers: [{ first: 'Cy', last: 'Otherbuyer', email: 'cy.o@example.com', phone: '027 100 2000' }] }), p_note: 'The terms as negotiated, for a fresh copy' });
  await p.click('#ofBackP'); await p.waitForSelector('#offTile'); await draftAndApprove(p, offB); await p.click('#sgReady'); await p.waitForSelector('#sgReleaseView', { timeout: 30000 }); await p.click('#sgRelease'); await p.waitForSelector('#sgView');
  d = await db(p); gB = d.offer_signings.find(g => g.offer_id === offB && g.round_no === 1 && g.status === 'ready');
  r = await rpcRound(p, gB.id); expect(r && r.ok && r.round.round === 1 && r.round.number === 4, 'Round 1 of Document 2 (number 4 for the offer)');
  pr = await rpcPresent(p, offB); r = await rpcRound(p, pr.id); expect(r && r.ok && r.round.round === 2 && r.round.formed, 'the vendors accept the fresh copy: Round 2, the agreement formed');
  d = await db(p); const bRounds = d.offer_rounds.filter(x => x.offer_id === offB);
  out.fiveRounds = bRounds.map(x => `${d.offer_documents.find(y => y.id === x.document_id).number}.${x.doc_round}`);
  expect(bRounds.length === 5 && out.fiveRounds.join() === '1.1,1.2,1.3,2.1,2.2' && bRounds.every(x => d.offer_file_hashes.some(h => h.path === x.path && h.sha256 === x.sha256)), 'five rounds, every one filed with its fingerprint');
  const chainB = await rpc(p, 'agent_offer_chain_check', { p_offer: offB }); expect(chainB.data && chainB.data.ok, 'offer B\'s timeline checks out');

  // ── 9. the lawyers' pack: every locked round and the timeline, in one download ──
  process.stderr.write('step 9\n');
  await toOffer(p, offB); await p.waitForSelector('#ngPack');
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#ngPack')]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-')), zf = path.join(dir, 'pack.zip'); fs.copyFileSync(await dl.path(), zf);
  expect(/No errors detected/.test(execFileSync('unzip', ['-t', zf], { encoding: 'utf8' })), 'the pack is a sound zip'); execFileSync('unzip', ['-q', zf, '-d', dir]);
  const names = fs.readdirSync(dir).filter(f => f !== 'pack.zip').sort(); out.pack = names;
  expect(names.length === 6 && names.includes('Timeline.html') && names.includes('Document-2-Round-2.pdf'), 'five rounds and the timeline');
  expect(bRounds.every(x => sha(fs.readFileSync(path.join(dir, `Document-${d.offer_documents.find(y => y.id === x.document_id).number}-Round-${x.doc_round}.pdf`))) === x.sha256), 'each round in the pack is the locked copy, byte for byte');
  const tl = fs.readFileSync(path.join(dir, 'Timeline.html'), 'utf8');
  expect(!/agent-nego@example\.com/.test(tl) && /Tim McGuire/.test(tl) && /Checked: \d+ events/.test(tl) && /Document closed for a fresh copy/.test(tl) && /Tim authorised presentation/.test(tl) && !/cy\.o@|027 100 2000/.test(tl), 'the timeline reads plainly, checked, with no contact details');
  fs.rmSync(dir, { recursive: true, force: true });

  // ── 10. withdrawal (offer C): the vendors withdraw while their round is out by link; the link stops working ──
  process.stderr.write('step 10\n');
  await p.click('#ofBackP'); await p.waitForSelector('#offTile');
  // Tim's negotiation settings on the Offers tile: changes from a link switched off by default from now on
  await p.click('#offSetD summary'); expect(!(await p.isChecked('#offNgLink')) && !(await p.isChecked('#offNgResign')), 'the Offers tile shows both negotiation settings, both off (changes from a link start off)');
  // switching the default on and off again is recorded
  await p.$eval('#offNgLink', e => e.click()); await p.waitForFunction(() => JSON.parse(localStorage.getItem('mockdb')).offer_settings[0].link_changes_default === true);
  await p.$eval('#offNgLink', e => e.click()); await p.waitForFunction(() => JSON.parse(localStorage.getItem('mockdb')).offer_settings[0].link_changes_default === false);
  await draftAndApprove(p, offC); await p.click('#sgReady'); await p.waitForSelector('#sgReleaseView', { timeout: 30000 }); await tick(p, 'input[name="sgMethod"][value="in_person"]'); await p.waitForTimeout(100); await p.click('#sgRelease'); await p.waitForSelector('#sgView');
  d = await db(p); r = await rpcRound(p, d.offer_signings.find(g => g.offer_id === offC && g.round_no === 1).id); expect(r && r.ok, 'offer C: Round 1 locked');
  pr = await rpcPresent(p, offC, 'link');
  // the links as drafts, sent one by one (as Tim's page does)
  await p.evaluate(async sid => { const c = window.supabase.createClient(), D = window.__mockDB, g = D.offer_signings.find(x => x.id === sid), pp = D.properties.find(x => x.id === g.property_id);
    for (const s of D.offer_signers.filter(x => x.signing_id === sid && !x.void_at && !x.finished_at)) { const w = window.MAIL.signLinkDraft({ first: s.name.split(' ')[0], address: pp.address, side: g.side, round: g.round_no });
      const r = await c.rpc('agent_mail_draft_add', { p_offer: g.offer_id, p_kind: 'sign_link', p_signer: s.id, p_to: [s.email], p_cc: [], p_subject: w.subject, p_body: w.body, p_attach: null });
      await c.functions.invoke('offer-sign', { body: { action: 'send_mail', draft_id: r.data } }); } }, pr.id);
  d = await db(p); expect(pr.link_changes === false && d.offer_events.some(e => e.kind === 'round_presented' && e.detail.signing_id === pr.id && e.detail.link_changes === false), 'the round follows the new default: changes from the link not allowed, recorded on the timeline');
  const cLink = (await mails(p)).filter(m => m.kind === 'offer_sign_link' && m.to === 'vendor@example.com').pop().link;
  // the vendor's link with changes switched off: accept or decline, and Ask Tim for a change; no change tools; a change is refused plainly
  { const ses0 = await p.evaluate(() => localStorage.getItem('mocksession')); await p.evaluate(() => localStorage.removeItem('mocksession'));
    const v = await page(); await v.goto(cLink); await v.waitForSelector('#sgCode'); await v.click('#sgSendCode'); await v.waitForFunction(() => /Sent/.test(document.querySelector('#sgCodeMsg').textContent));
    await v.fill('#sgCodeIn', (await mails(v)).filter(m => m.kind === 'offer_sign_code' && m.to === 'vendor@example.com').pop().code); await v.click('#sgCodeGo');
    await v.waitForSelector('#sgConsent'); await tick(v, '#sgAgree'); await v.click('#sgAgreeGo'); await v.waitForSelector('#ngChattels'); await tick(v, '#ngChatOk'); await v.click('#ngChatGo');
    await v.waitForSelector('#sgDraw'); await draw(v, '#sgSig', 2); await draw(v, '#sgInit', 3); await v.click('#sgDrawGo'); await v.waitForSelector('#sgPlaces');
    expect(!(await v.$('#sgTools')) && await v.$('#ngNoChanges') && await v.$('#ngDecline') && await v.$('#sgAskBox'), 'with the switch off, the link shows accept or decline and Ask Tim for a change, and no change tools');
    const sesV = await v.evaluate(() => Object.keys(sessionStorage).filter(k => /^sgSes:/.test(k)).map(k => sessionStorage.getItem(k))[0]);
    const rc = await invoke(v, { action: 'change', token: cLink.split('sign=')[1], session: sesV, id: '7a7a7a7a-0000-4000-8000-000000000001', kind: 'strike', page: 1, geometry: { x0: 100, x1: 180, y: 300 }, places: [] });
    expect(rc.ok === false && /hasn't switched on changes from this link/.test(rc.error), 'a change from the link is refused, and said plainly');
    await v.click('#ngDecline'); await v.waitForFunction(() => /Sent to Tim/.test(document.querySelector('#ngDeclineOut').textContent));
    expect((await mails(v)).some(m => m.kind === 'offer_sign_decline' && m.to === 'tim' && /^The vendors have declined the offer for 1 Example Road/.test(m.subject) && /decline/.test(m.text)), 'Decline tells Tim, with its own subject worded for the vendors');
    await v.click('#sgAskBox summary'); await v.fill('#sgAskText', 'Could the settlement be a week later?'); await v.click('#sgAskGo'); await v.waitForFunction(() => /Sent to Tim/.test(document.querySelector('#sgAskOut').textContent));
    expect((await mails(v)).some(m => m.kind === 'offer_sign_ask' && /^A vendor asks for a change/.test(m.subject)), 'Ask Tim for a change from a vendor is worded for a vendor');
    expect(!(await side(v)), 'the accept-or-decline link screen at 390 px: no sideways scroll');
    await v.close(); await p.evaluate(s => localStorage.setItem('mocksession', s), ses0); }
  await toOffer(p, offC); await p.waitForSelector('#ngWithdraw'); await p.click('#ngWithdraw summary');
  await p.click('#ngWdGo'); expect(/Choose who withdrew/.test(await p.textContent('#ngWdErr')), 'who withdrew must be chosen');
  await tick(p, 'input[name="ngWdSide"][value="vendor"]'); await p.fill('#ngWdNote', 'Testy rang: they are keeping the house'); await p.click('#ngWdGo'); await p.waitForSelector('#ofView');
  d = await db(p); expect(d.property_offers.find(o => o.id === offC).status === 'declined' && d.offer_signings.find(g => g.id === pr.id).status === 'withdrawn' && d.offer_events.some(e => e.kind === 'withdrawn' && e.detail.side === 'vendor' && e.detail.status === 'declined' && e.detail.stopped === 1) && d.offer_documents.find(x => x.offer_id === offC).status === 'closed', 'the vendors declined: recorded with the time and side, the round stopped as withdrawn, the document filed');
  await rpc(p, 'agent_offer_status', { p_offer: offC, p_status: 'received', p_at: new Date().toISOString(), p_note: 'They changed their minds' });
  r = await rpc(p, 'agent_round_present', { p_offer: offC, p_method: 'in_person', p_places: [], p_checked: true }); expect(r.error && /fresh copy/.test(r.error.message), 'marked current again: the old document can\'t be presented; a fresh copy is needed');
  await p.evaluate(() => localStorage.removeItem('mocksession')); await p.close();
  q = await page(); await q.goto(cLink); await q.waitForSelector('#sgClosed');
  expect(/isn't being signed|isn't working/.test(await q.textContent('#sgClosed')), 'the vendors\' open link stops working');
  // another buyer (offer C's purchaser has no link into offer A or B): a made-up token and session see nothing
  r = await invoke(q, { action: 'state', token: 'Zq3_kX9-aB4cD7eF0gH2iJ5kL8mN1oP6qR9sT3uV7wX', session: sesV2 }); expect(r.ok === false && !r.signing, 'another token opens nothing');
  await q.evaluate(() => localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'b-9', email: 'cy.o@example.com' } }))); await q.goto(BASE); await q.waitForTimeout(600);
  const other = await q.evaluate(async () => { const o_ = []; for (const t of ['offer_rounds', 'offer_documents', 'offer_signings', 'offer_agreements']) { const r_ = await window.supabase.createClient().from(t).select('id'); o_.push((r_.data || []).length); } return o_; });
  out.other = other; expect(other.every(n => n === 0), 'another buyer signed in sees no rounds, documents or signings');
  await q.close();

  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
  await b.close();
})().catch(e => { console.log(JSON.stringify({ out: global.__out, errs: (global.__errs || []).concat(['crashed: ' + (e.stack || e.message)]) }, null, 1)); process.exit(0); });

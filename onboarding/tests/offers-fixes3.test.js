// Offers fixes 3 (Tim, 25 and 26 November 2026), against the mock database with a synthetic blank made at test time
// (tests/synthetic-blank.js). Covers: undo in every signing turn (in person: "Undo my last step" takes back the last place tapped, the
// place can be tapped again; "Start my turn again" with the drawing cleared, drawn again; by link: the same box, nobody told); Tim
// starting an open round again from its start (every tap undone, anyone finished opened again, the same people carrying on); a freeze
// with Tim unfreezing and going back to the last sealed round in one step (the open round stopped, what it held listed as discarded,
// every row kept); a party's own link offering "go back" only after a freeze on their round was lifted, their request going to Tim
// first (an urgent email to him alone, red on Home and the offer), Tim releasing it; and "Confirm the agreement" pressed while frozen
// held, not locked, sealed or dated, nothing emailed, discarded or completed once unfrozen (the agreement then made exactly as before,
// Tim's own email with the dated copy). Sealed rounds never change. 390 px with no sideways scroll; light and dark.
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

  const dialogs = []; const acceptDialogs = p => p.on('dialog', d => { dialogs.push(d.message()); });   // page() accepts each one
  const fresh = async p => { await p.goto(BASE); await p.waitForTimeout(500); };
  const toOfferPage = async (p, oid) => { await fresh(p); await openProp(p); await p.click(`[data-offer="${oid}"]`); await p.waitForSelector('#ofView'); };
  const toSigning = async (p, oid, sid) => { await toOfferPage(p, oid); await p.waitForSelector(`[data-signing="${sid}"]`, { timeout: 30000 }); await p.click(`[data-signing="${sid}"]`); await p.waitForSelector('#sgView'); };
  const evs = async (p, oid) => (await db(p)).offer_events.filter(e => e.offer_id === oid);
  // part of a round through Tim's database calls: start, agree, receipts, draw; then the places given (by each signer's position)
  const rpcPart = async (p, sid, taps) => p.evaluate(async ([sid, taps]) => { const c = window.supabase.createClient(), M = r => { if (r.error) throw new Error(r.error.message); return r.data; };
    const D_ = JSON.parse(localStorage.getItem('mockdb')), g = D_.offer_signings.find(x => x.id === sid), cv = document.createElement('canvas'); cv.width = 240; cv.height = 70; const g_ = cv.getContext('2d'); g_.strokeStyle = '#123'; g_.lineWidth = 3; g_.beginPath(); for (let i = 0; i < 24; i++) g_.lineTo(10 + i * 9, 35 + Math.sin(i) * 20); g_.stroke(); const png = cv.toDataURL('image/png');
    if (g.status === 'ready') M(await c.rpc('agent_signing_start', { p_signing: sid }));
    const ss = D_.offer_signers.filter(x => x.signing_id === sid && !x.void_at).sort((a, z) => a.position - z.position);
    for (const s of ss) { M(await c.rpc('agent_signing_consent', { p_signer: s.id, p_ua: 'ua' })); if (g.side === 'vendor') M(await c.rpc('agent_signing_receipt', { p_signer: s.id, p_guide: 'chattels', p_version: null, p_file: null, p_sha256: null, p_pages: null })); M(await c.rpc('agent_signing_marks', { p_signer: s.id, p_sig: png, p_init: png })); }
    for (const [pos, n] of taps) { const s = ss.find(x => x.position === pos), mine = g.places.filter(x => x.signer === pos).slice(0, n); for (const pl of mine) M(await c.rpc('agent_signing_tap', { p_signer: s.id, p_place: pl.id })); }
    return ss.map(s => s.id); }, [sid, taps]);
  // pdf.js's worker, as the app sets it once it has drawn a page (a fresh page load hasn't yet)
  const pdfReady = p => p.evaluate(async () => { const m = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/legacy/build/pdf.mjs'); if (!m.GlobalWorkerOptions.workerSrc) m.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/legacy/build/pdf.worker.mjs'; });
  const live = (d, sid) => (d.offer_sign_taps || []).filter(t => t.signing_id === sid).filter(t => { const u = (d.offer_sign_undos || []).filter(x => x.tap_id === t.id).sort((a, z) => z.id - a.id)[0]; return !u || u.action === 'redo'; });

  // ── 1. set-up: an offer, the blank approved, the draft approved and released for signing in person ──
  process.stderr.write('step 1\n');
  let p = await page(); acceptDialogs(p); await asAgent(p);
  await rpc(p, 'agent_offer_link', { p_property: 'P1', p_action: 'open' });
  const offA = (await rpc(p, 'agent_offer_add', { p_property: 'P1', p_offer: offer() })).data;
  await openProp(p);
  const blank = Buffer.from(await SB.make({ cca: true }));
  await p.setInputFiles('#drFile', { name: 'Agreement pack.pdf', mimeType: 'application/pdf', buffer: blank });
  await p.waitForSelector('#drMap', { timeout: 30000 }); await p.click('#drApprove'); await p.waitForSelector('#offTile');
  await draftAndApprove(p, offA); await p.click('#sgReady'); await p.waitForSelector('#sgReleaseView', { timeout: 30000 }); await p.click('#sgRelease'); await p.waitForSelector('#sgView');
  let d = await db(p); const g1 = d.offer_signings.find(g => g.offer_id === offA && (g.round_no || 1) === 1);
  const ana = d.offer_signers.find(s => s.signing_id === g1.id && s.position === 1);

  // ── 2. Ana's turn in person: undo her last step, tap it again, then start her turn again with her drawing cleared ──
  process.stderr.write('step 2\n');
  await turnStart(p, 1); await p.waitForSelector('#sgConsent'); await tick(p, '#sgAgree'); await p.click('#sgAgreeGo'); await p.waitForSelector('#sgCcaPages .dr-pg canvas');
  await tick(p, '#sgCcaOk'); await tick(p, '#sgSpOk'); await p.click('#sgGuidesGo'); await p.waitForSelector('#sgDraw'); await draw(p, '#sgSig', 1); await draw(p, '#sgInit', 4); await p.click('#sgDrawGo'); await p.waitForSelector('#sgPlaces');
  expect(await p.$eval('#sgUndoLast', b => b.disabled) && /Nothing to undo yet/.test(await p.textContent('#sgUndoWhat')), 'before any tap: "Nothing to undo yet", the button off');
  const tapOne = async () => { await p.waitForSelector('#sgPage .sg-todo', { timeout: 20000 }); const c0 = await count(p); const t = await p.$('#sgPage .sg-todo'); await p.evaluate(el => el.click(), t); await p.waitForFunction(c => +document.querySelector('#sgCount').textContent.match(/(\d+) of/)[1] > c, c0); };
  await tapOne(); await tapOne();
  const what = (await p.textContent('#sgUndoWhat')).trim(); out.undoWhat = what;
  expect(/^Your last step: Your (initials|signature) on page \d+\.$/.test(what), 'the box names the last step in plain words: ' + what);
  expect(await count(p) === 2, 'two places done before the undo');
  await p.click('#sgUndoLast'); await p.waitForSelector('#sgPlaces'); await p.waitForFunction(() => +document.querySelector('#sgCount').textContent.match(/(\d+) of/)[1] === 1);
  d = await db(p);
  expect(d.offer_sign_taps.filter(t => t.signer_id === ana.id).length === 2 && live(d, g1.id).length === 1, 'undo keeps both taps on the record and one stands');
  expect(d.offer_sign_undos.some(u => u.signer_id === ana.id && u.scope === 'last' && u.by_name === 'Ana Testbuyer'), 'the undo is recorded, by Ana');
  await tapOne(); d = await db(p);
  expect(live(d, g1.id).length === 2 && d.offer_sign_taps.filter(t => t.signer_id === ana.id).length === 2 && d.offer_sign_undos.some(u => u.action === 'redo'), 'the same place tapped again: it stands again, no new tap row (a redo)');
  // start her turn again, clearing her drawing
  await p.click('#sgUndoTurnBox summary'); await tick(p, '#sgUndoClear'); await p.click('#sgUndoTurn'); await p.waitForSelector('#sgDraw');
  expect(dialogs.some(m => /Start your turn again\? Everything you have done on this round is taken back, and your signature and initials are cleared/.test(m)), 'a confirm first: ' + dialogs.slice(-1)[0]);
  expect(/You cleared your signature and initials when you started your turn again/.test(await p.textContent('#sgDraw')), 'the draw step says why it is back');
  d = await db(p); const first = d.offer_signers.find(s => s.id === ana.id).sig_png;
  expect(live(d, g1.id).length === 0 && d.offer_sign_redraws.filter(r => r.signer_id === ana.id).length === 1, 'every tap of hers undone and her drawing cleared (a row of its own)');
  await draw(p, '#sgSig', 7); await draw(p, '#sgInit', 9); await p.click('#sgDrawGo'); await p.waitForSelector('#sgPlaces');
  d = await db(p);
  expect(d.offer_signers.find(s => s.id === ana.id).sig_png === first && d.offer_sign_redraws.filter(r => r.signer_id === ana.id && r.sig_png).length === 1, 'drawn again: her first drawing is kept as it was, the new one added');
  const newInk = d.offer_sign_redraws.filter(r => r.signer_id === ana.id && r.sig_png).pop().sig_png;
  expect(!(await side(p)), 'the undo box: no sideways scroll at 390 px');
  await tapAll(p); await finishInPerson(p);
  // Bo's whole turn
  await round1Turn(p, 2);
  await p.waitForSelector('#sgRound', { timeout: 60000 });
  d = await db(p); const r1 = d.offer_rounds.find(r => r.signing_id === g1.id);
  expect(r1 && r1.doc_round === 1, 'Round 1 sealed');
  { const blb = await blob(p, r1.path); const txt = (await pdfText(blb)).join(' '); out.r1len = blb.length;
    expect(blb && blb.length > 1000, 'the sealed Round 1 is stored'); }
  // the round was made with Ana's drawing as it stands (the new one) and only the taps that stand
  { const m = await p.evaluate(sid => { const D_ = JSON.parse(localStorage.getItem('mockdb')); return D_.offer_rounds.find(r => r.signing_id === sid).execution; }, g1.id);
    expect(m && m.signers && m.signers[0].places === d.offer_sign_taps.filter(t => t.signer_id === ana.id).filter(t => { const u = d.offer_sign_undos.filter(x => x.tap_id === t.id).sort((a, z) => z.id - a.id)[0]; return !u || u.action === 'redo'; }).length, 'the record counts the places that stand'); }
  out.newInkUsed = newInk.length > 100;

  // ── 3. Round 2 to the vendors in person; part signed; Tim starts it again from its start ──
  process.stderr.write('step 3\n');
  await pdfReady(p); const pr2 = await rpcPresent(p, offA, 'in_person'); const g2 = pr2.id;
  await rpcPart(p, g2, [[1, 2], [2, 1]]);
  // a change in the counteroffer (typed words), with both vendors' initials beside it; Ula initials it; Una undoes it: the change and its
  // initials places go (kept on the record), and the further term number it took is free again
  { const r = await p.evaluate(async sid => { const c = window.supabase.createClient(), M = r => { if (r.error) throw new Error(r.error.message); return r.data; };
      const D_ = JSON.parse(localStorage.getItem('mockdb')), g = D_.offer_signings.find(x => x.id === sid), ss = D_.offer_signers.filter(x => x.signing_id === sid && !x.void_at).sort((a, z) => a.position - z.position);
      const lay = M(await c.rpc('agent_offer_layers', { p_offer: g.offer_id, p_document: g.document_id })).layers.filter(L => L.doc_round < g.round_no), st = window.NEGO.standing(lay, { doc_round: g.round_no, side: g.side, signing_id: 'c', marks: [] });
      const pages = g.pages.map((w, i) => ({ n: i + 1, w: w[0], h: w[1] })), ch = { id: crypto.randomUUID(), kind: 'insert', page: 1, geometry: { x: 120, y: 420, text: '23.0 The vendors keep the shed', size: 9 } };
      const places = window.NEGO.changePlaces(ch, ss.map(s => ({ position: s.position, name: s.name })), pages, st, g.places);
      const req = pos => { const D2 = JSON.parse(localStorage.getItem('mockdb')); return D2.offer_signings.find(x => x.id === sid).places.concat(D2.offer_sign_reviews.filter(r => r.signing_id === sid && (!(r.marks || []).length || r.marks.some(k => !(D2.offer_sign_undos || []).some(u => u.mark_id === k)))).flatMap(r => r.places)).filter(x => x.signer === pos).length; };
      M(await c.rpc('agent_round_change', { p_signer: ss[0].id, p_id: ch.id, p_kind: ch.kind, p_page: ch.page, p_geometry: ch.geometry, p_target: null, p_places: places }));
      const before = req(2); M(await c.rpc('agent_signing_tap', { p_signer: ss[1].id, p_place: 'chg:' + ch.id + ':s2' }));
      const u = M(await c.rpc('agent_signing_undo', { p_signer: ss[0].id, p_scope: 'last', p_clear: false })), after = req(2);
      const ch2 = { id: crypto.randomUUID(), kind: 'insert', page: 1, geometry: { x: 120, y: 420, text: '23.0 The vendors keep the garden shed', size: 9 } };
      const again = await c.rpc('agent_round_change', { p_signer: ss[0].id, p_id: ch2.id, p_kind: ch2.kind, p_page: 1, p_geometry: ch2.geometry, p_target: null, p_places: window.NEGO.changePlaces(ch2, ss.map(s => ({ position: s.position, name: s.name })), pages, st, g.places) });
      if (!again.error) M(await c.rpc('agent_signing_undo', { p_signer: ss[0].id, p_scope: 'last', p_clear: false }));   // back as it was, for the restart below
      const D3 = JSON.parse(localStorage.getItem('mockdb')); return { before, after, changes: u.changes, kept: D3.offer_sign_marks.filter(m => m.signing_id === sid).length - (again.error ? 0 : 1), again: again.error ? again.error.message : 'ok' }; }, g2);
    out.changeUndo = r;
    expect(r.changes === 1 && r.after === r.before - 1 && r.kept === 1, 'a change undone takes its initials places with it, the change kept on the record: ' + JSON.stringify(r));
    expect(!/already taken/.test(r.again), 'the further term number an undone change took is free again: ' + r.again); }
  await toSigning(p, offA, g2);
  await p.click('#sgResetBox summary'); await p.click('#sgResetGo');
  expect(/Say why you are starting it again/.test(await p.textContent('#sgResetErr')), 'a reason first');
  await p.fill('#sgResetWhy', 'The vendors want to read it again'); await p.click('#sgResetGo'); await p.waitForSelector('#sgView'); await p.waitForTimeout(300);
  d = await db(p);
  expect(live(d, g2).length === 0 && d.offer_sign_taps.filter(t => t.signing_id === g2).length === 4 && d.offer_sign_undos.filter(u => u.signing_id === g2 && u.scope === 'round' && u.tap_id).length === 4, 'every tap that stood undone by Tim (Ula\'s initial beside the undone change too), all four kept on the record');
  expect(d.offer_signings.find(g => g.id === g2).status === 'signing' && (await evs(p, offA)).some(e => e.kind === 'round_reset'), 'the round carries on, and the timeline says Tim started it again');
  expect(/steps undone on this round/.test(await p.textContent('#sgView')), 'the round page says how many steps were undone: ' + (await p.textContent('#sgUndone')));
  expect(d.offer_rounds.find(r => r.signing_id === g1.id).sha256 === r1.sha256, 'Round 1 sealed as it was');

  // ── 4. frozen: a vendor's undo is refused; Tim unfreezes and goes back to Round 1 in one step ──
  process.stderr.write('step 4\n');
  await rpcPart(p, g2, [[1, 1]]);
  await toOfferPage(p, offA); await p.fill('#hdFrWhy', 'The building report came back'); await p.click('#hdFreeze'); await p.waitForSelector('#hdFrozen');
  { d = await db(p); const v1 = d.offer_signers.find(s => s.signing_id === g2 && s.position === 1); const r = await rpc(p, 'agent_signing_undo', { p_signer: v1.id, p_scope: 'last', p_clear: false });
    expect(r.error && /no longer being signed/.test(r.error.message), 'frozen: nobody undoes (' + JSON.stringify(r.error) + ')'); }
  expect(await p.$('#hdBackBox'), 'the frozen panel offers "Unfreeze and go back to Round 1"');
  expect(/Unfreeze and go back to Round 1/.test(await p.textContent('#hdBackBox summary')), 'named for the last sealed round');
  await p.click('#hdBackBox summary'); await p.click('#hdUnBack');
  expect(/Say why you are going back/.test(await p.textContent('#hdErr')), 'a reason first (the one above)');
  await p.fill('#hdUnNote', 'The report changed things'); await p.click('#hdUnBack'); await p.waitForSelector('#ofView'); await p.waitForTimeout(400);
  d = await db(p);
  const ev4 = (await evs(p, offA)).filter(e => e.kind === 'round_reverted').pop();
  expect(d.offer_signings.find(g => g.id === g2).status === 'cancelled' && !d.offer_holds.some(h => h.offer_id === offA && h.kind === 'freeze' && !h.lifted_at), 'Round 2 stopped and the offer unfrozen in the same step');
  expect(ev4 && ev4.detail.to_round === 1 && ev4.detail.discarded[0].taps === 1 && ev4.detail.unfrozen === true, 'the timeline lists what was discarded: ' + JSON.stringify(ev4 && ev4.detail));
  expect(d.offer_sign_taps.filter(t => t.signing_id === g2).length === 4 && d.offer_sign_undos.filter(u => u.signing_id === g2 && u.action === 'redo').length === 1 && d.offer_rounds.filter(r => r.offer_id === offA).length === 1, 'every row kept (the place tapped again is a redo, not a new tap), and Round 1 is still the newest sealed round');
  expect(await p.$('#ngPresent'), 'Tim can present Round 1 again');
  await toSigning(p, offA, g2); expect(/you went back to Round 1 as it was sealed/.test(await p.textContent('#sgCancelled')), 'the stopped round says Tim went back');

  // ── 5. by link: the vendor's undo box; "go back" offered only after a freeze on their round was lifted; their request goes to Tim first ──
  process.stderr.write('step 5\n');
  await pdfReady(p); const pr3 = await rpcPresent(p, offA, 'link'); const g3 = pr3.id;
  await toSigning(p, offA, g3); const m0 = (await mails(p)).length; await prepAndSend(p);
  const vLink = (await mails(p)).filter(m => m.kind === 'offer_sign_link' && m.to === 'vendor@example.com').pop();
  let q = await page('dark'); acceptDialogs(q); await q.goto(vLink.link); await q.waitForSelector('#sgCode');
  await q.click('#sgSendCode'); await q.waitForFunction(() => /Sent/.test(document.querySelector('#sgCodeMsg').textContent));
  const code = (await mails(q)).filter(m => m.kind === 'offer_sign_code' && m.to === 'vendor@example.com').pop(); await q.fill('#sgCodeIn', code.code); await q.click('#sgCodeGo');
  await q.waitForSelector('#sgConsent'); await tick(q, '#sgAgree'); await q.click('#sgAgreeGo'); await q.waitForSelector('#ngChattels'); await tick(q, '#ngChatOk'); await q.click('#ngChatGo');
  await q.waitForSelector('#sgDraw'); await draw(q, '#sgSig', 5); await draw(q, '#sgInit', 6); await q.click('#sgDrawGo'); await q.waitForSelector('#sgPlaces');
  { await q.waitForSelector('#sgPage .sg-todo', { timeout: 20000 }); const c0 = await count(q); const t = await q.$('#sgPage .sg-todo'); await q.evaluate(el => el.click(), t); await q.waitForFunction(c => +document.querySelector('#sgCount').textContent.match(/(\d+) of/)[1] > c, c0); }
  expect(/Your last step: Your (initials|signature) on page \d+\./.test(await q.textContent('#sgUndoWhat')), 'the link page names the last step too');
  await q.click('#sgUndoLast'); await q.waitForSelector('#sgPlaces'); await q.waitForFunction(() => +document.querySelector('#sgCount').textContent.match(/(\d+) of/)[1] === 0);
  expect(!(await side(q)), 'the link page: no sideways scroll at 390 px (dark)');
  { const bg = await q.$eval('#sgUndoBox', e => getComputedStyle(e).backgroundColor); out.undoBoxDark = bg; }
  expect(!(await q.$('input[name="sgReqKind"][value="revert"]')), 'before any freeze: no "go back" on the link');
  expect(notTim(await mails(p), m0).filter(m => m.kind !== 'offer_sign_link').length === 0, 'nobody but Tim is emailed (the links Tim sent himself aside)');
  await fresh(p); await rpc(p, 'agent_offer_freeze', { p_offer: offA, p_reason: 'A call from the vendors', p_asked_by: null, p_request: null }); await rpc(p, 'agent_offer_unfreeze', { p_offer: offA, p_note: 'All fine now' });
  await q.goto(q.url()); await q.waitForSelector('#sgPlaces').catch(async e => { out.qText = (await q.textContent('#main')).replace(/\s+/g, ' ').slice(0, 400); throw e; });
  expect(await q.$('input[name="sgReqKind"][value="revert"]') && /Go back to Round 1 as it was signed/.test(await q.textContent('#sgReqBox')), 'after the freeze was lifted: "Go back to Round 1 as it was signed"');
  const t0 = (await mails(q)).length;
  await q.$eval('input[name="sgReqKind"][value="revert"]', e => e.click()); await q.selectOption('#sgReqWhy', 'material_change'); await q.click('#sgReqGo'); await q.waitForSelector('#sgReqSent');
  const urg = (await mails(q)).slice(t0); out.urgent = urg.map(m => m.to + ': ' + m.subject);
  expect(urg.length === 1 && urg[0].to === 'tim' && /^URGENT: a vendor asks to go back to Round 1: 1 Example Road/.test(urg[0].subject), 'one urgent email, to Tim alone: ' + JSON.stringify(out.urgent));
  await fresh(p); await p.waitForSelector('#hdUrgentHome, .urgentc', { timeout: 15000 }).catch(() => null);
  out.home = ((await p.$$eval('.urgentc', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()))) || []).join(' | ').slice(0, 300);
  expect(/asks to go back to Round 1 as it was signed/.test(out.home), 'red on Home, in plain words: ' + out.home);
  await toOfferPage(p, offA); await p.waitForSelector('[data-hdback]');
  expect(/Going back stops Round 2/.test(await p.textContent('[data-hdreq]')), 'the request card says what going back does');
  await p.click('[data-hdback]'); await p.waitForSelector('#ofView'); await p.waitForTimeout(400);
  d = await db(p);
  expect(d.offer_requests.find(r => r.kind === 'revert').handled_as === 'revert' && d.offer_signings.find(g => g.id === g3).status === 'cancelled', 'Tim released it: the round stopped, the request handled');
  await q.goto(q.url()); await q.waitForSelector('#sgClosed'); expect(/This link isn't working/.test(await q.textContent('#sgClosed')), 'their old link no longer works');

  // ── 6. "Confirm the agreement" while frozen: held, not locked, sealed or dated, nothing emailed; discarded, held again, completed ──
  process.stderr.write('step 6\n');
  await pdfReady(p); const pr4 = await rpcPresent(p, offA, 'in_person'); const lk4 = await rpcRound(p, pr4.id); expect(lk4 && lk4.ok && lk4.round && lk4.round.formed, 'the vendors accept as it stands: formed ' + JSON.stringify(lk4));
  await rpc(p, 'agent_offer_freeze', { p_offer: offA, p_reason: 'Checking the title', p_asked_by: null, p_request: null });
  await toOfferPage(p, offA); await p.waitForSelector('#ngFormed');
  expect(/The offer is frozen\. Confirm now holds your confirmation: it is not locked, sealed or dated, and nothing is emailed/.test(await p.textContent('#ngFrozenNote')), 'the formed card says what Confirm does while frozen');
  const mailsBefore = (await mails(p)).length;
  await tick(p, '#ngAgCheck'); await p.click('#ngAgree'); await p.waitForSelector('#ngHeld');
  d = await db(p);
  expect(/Held while frozen: not locked, sealed or dated/.test(await p.textContent('#ngHeld')) && !(d.offer_agreements || []).some(a => a.offer_id === offA), 'held, shown on the offer page, no agreement made');
  expect((await mails(p)).length === mailsBefore, 'nothing emailed (Tim included)');
  expect(!(await p.$('#ngHeldGo')) && /Unfreeze the offer to complete it/.test(await p.textContent('#ngHeldFrozen')), 'while frozen it can only be discarded');
  expect(!(await side(p)), 'the held card: no sideways scroll at 390 px');
  await p.click('#ngHeldDrop'); await p.waitForSelector('#ngFormed');
  d = await db(p); expect(d.offer_confirm_holds.filter(x => x.offer_id === offA).map(x => x.resolved_as).join() === 'discarded', 'discarded, kept');
  await tick(p, '#ngAgCheck'); await p.click('#ngAgree'); await p.waitForSelector('#ngHeld');
  await p.fill('#hdUnNote', 'Title is fine'); await p.click('#hdUnfreeze'); await p.waitForSelector('#ngHeldGo');
  const heldRow = (await db(p)).offer_confirm_holds.filter(x => x.offer_id === offA && !x.resolved_at)[0];
  await p.click('#ngHeldGo'); await p.waitForSelector('#ngAgreed', { timeout: 60000 });
  d = await db(p); const ag = d.offer_agreements.find(a => a.offer_id === offA);
  expect(ag && ag.date_text === heldRow.date_text && ag.accepted_at === heldRow.accepted_at, 'completed: locked, sealed and dated with what was held');
  expect(d.offer_confirm_holds.find(x => x.id === heldRow.id).resolved_as === 'completed', 'the held confirmation is completed');
  expect((await mails(p)).slice(mailsBefore).filter(m => m.kind === 'offer_agreed_copy' && m.to === 'tim').length === 1, 'Tim\'s own email with the dated copy, once, when it was completed');
  expect(notTim(await mails(p), mailsBefore).length === 0, 'nobody else emailed');
  // the lawyers' pack timeline says it in words
  { const words = await p.evaluate(oid => { const D_ = JSON.parse(localStorage.getItem('mockdb')); return D_.offer_events.filter(e => e.offer_id === oid).map(e => window.NEGO.eventWords ? window.NEGO.eventWords(e) : '').join('\n'); }, offA);
    out.words = words.split('\n').filter(l => /Undone|started the round again|went back|held while frozen|discarded/i.test(l)).slice(0, 12);
    const html = await p.evaluate(oid => { const D_ = JSON.parse(localStorage.getItem('mockdb')); return window.NEGO.timelineHtml(D_.offer_events.filter(e => e.offer_id === oid), { address: 'x', offer_ref: 'y', made_at: new Date().toISOString(), check: null, files: [] }); }, offA);
    expect(/Undone \(kept on the record\)/.test(html) && /Tim started the round again/.test(html) && /Tim went back to the last sealed round/.test(html) && /Confirmation held while frozen/.test(html), 'the lawyers\' pack timeline names each in words'); }
  expect(d.offer_rounds.find(r => r.signing_id === g1.id).sha256 === r1.sha256, 'Round 1 still sealed exactly as it was');
  await shot(p, 'fixes3_agreed');
  await b.close();
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => { console.log(JSON.stringify({ errs: ['crashed: ' + (e.stack || e.message)].concat(global.__errs || []), out: global.__out })); process.exit(0); });

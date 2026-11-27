// Appraisal comparables, phase C2 (migration 035), against the mock database, with invented data only and the model and the fetch
// mocked. Covers: uploading a report (PDF): filed in the one store as agency papers, read by the AI (logged with the appraisal), shown as
// a review list where every item is unticked with the page it came from; nothing imported without a tick; only ticked items go through
// the existing import, so Tim's ticked wording is kept; the ticks recorded; a report set aside; reading switched off, then read again;
// not a PDF refused. Photos from a listing page: a bad link refused, photos fetched and shown unticked, nothing filed until Kept, the
// kept ones filed with the image and page links and the rest deleted, the pack's photo links used, closing deletes what was fetched, a
// site that turns the fetch away said plainly with the download folder. Case-by-case suburbs: the mode on the never-mix list, the AI
// check (mocked), a mismatch flagged as a suggestion and nothing hidden, a match not flagged, a failure or "unclear" with a plain note
// and no flag, and the verdicts never on the appraisal, the presentation or print. 390 px with no sideways scroll, light and dark. A
// sent appraisal has none of the new tools. The phase C screen is otherwise unchanged (appraisal-comps.test.js still passes).
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const bundle = fs.readFileSync(path.join(__dirname, '..', 'portal.js'), 'utf8');
const shell = fs.readFileSync(path.join(ROOT, 'portal', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(ROOT, 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const PDF = fs.readFileSync(path.join(__dirname, 'files', 'invented-comps-report.pdf'));
const PK = 'https://packages.dunnerstunner.co.nz', PB = PK + '/portal/';
const out = {}; const errs = [];
const expect = (c, m) => { if (!c) errs.push(m); };
const now = new Date().toISOString();
const day = n => new Date(Date.now() - n * 864e5).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const PHASEA = { id: 'AVA', property_id: 'P2', title: '40 Rbcomp Road, Testville: Market Appraisal', address: '40 Rbcomp Road, Testville', prepared_for: 'Robin', prepared_on: day(0), status: 'draft', created_by: 'agent-test@example.com', created_at: now, updated_at: now,
  setup: { v: 1, suburb: 'Testville', campaign: { kind: 'standard' }, method: 'deadline', plan: 'premium', basis: 'comparables' }, kind: 'standard', private_notes: '',
  fields: { ranges: [{ key: 'A', option: 'Your home', involves: '', low: 520000, high: 575000 }], method: { name: 'Deadline sale', key: 'deadline', text: 'I\'d recommend a deadline sale.' } },
  sections: [{ type: 'byline', text: 'Prepared for Robin by Tim McGuire' }, { type: 'heading', text: 'My opinion of price' }, { type: 'opinion' }, { type: 'heading', text: 'How I would sell it' }, { type: 'method' }] };
const SENT = Object.assign(JSON.parse(JSON.stringify(PHASEA)), { id: 'AVS', property_id: 'P3', title: '44 Rbcomp Road, Testville: Market Appraisal', address: '44 Rbcomp Road, Testville', status: 'sent' });
const prop = (id, address) => ({ id, address, title_ref: null, legal_description: null, owners_on_title: null, ownership: {}, description: {}, disclosures: {}, found: {}, provenance: {}, stage: 'appraisal', stage_at: now, cycle_at: null, created_at: now, updated_at: now });
const comp = (id, o) => Object.assign({ id, appraisal_id: 'AVA', position: 1, shown: true, status: 'sold', address: '', suburb: 'Testville', price: 530000, sold_on: day(30), method: 'Deadline sale', compare_text: '', compare_ticked: false, private_note: '', ring: 'suburb', source: 'tim', source_ref: null, source_url: null, photo_hints: [], created_at: now, updated_at: now }, o);
const SEED = () => ({ properties: [prop('P2', '40 Rbcomp Road, Testville'), prop('P3', '44 Rbcomp Road, Testville')],
  property_people: [], agreements: [], agreement_people: [], agreement_events: [], prelistings: [], property_documents: [],
  appraisal_views: [JSON.parse(JSON.stringify(PHASEA)), JSON.parse(JSON.stringify(SENT))],
  appraisal_comps: [comp('CT1', { position: 1, address: 'RB 5 Read Road, Testville', compare_text: 'Tim\'s own ticked wording for 5.', compare_ticked: true, private_note: 'Tim only: a note.' }),
    comp('CM1', { position: 2, address: 'RB 7 Mix Road, Rbmix', suburb: 'Rbmix', price: 600000, bedrooms: 6, floor_m2: 130, ad_text: 'Fully tenanted, strong yield.', source_url: 'https://listings.example.com/rb/7', photo_hints: [{ url: 'https://photos.example.com/rb/hint-1.jpg' }, { file: 'RB7_1.jpg' }] }),
    comp('CM2', { position: 3, address: 'RB 9 Mix Road, Rbmix', suburb: 'Rbmix', price: 540000, bedrooms: 3, floor_m2: 140 }),
    comp('CS1', { appraisal_id: 'AVS', address: '46 Rbcomp Road, Testville' })],
  appraisal_media: [], suburb_groups: [{ id: 'G1', name: 'RB mixed area', kind: 'never_mix', mode: 'case_by_case', suburbs: ['Rbmix'], note: '', created_at: now, updated_at: now }], market_months: [], market_sales: [], appraisal_reports: [], appraisal_buyer_checks: [], ai_calls: [] });
// what the (mocked) reader finds in the invented report: every value made up; one address matches Tim's comparable with ticked wording
const READING = { report: { source: 'relab', title: 'RB Invented Comparables Report', date: '2026-11-20' },
  comps: [{ id: 'c1', page: 1, address: 'RB 3 Read Road, Testville', suburb: 'Testville', status: 'sold', price: 512000, sold_on: '2026-10-03', bedrooms: 3, bathrooms: 1, floor_m2: 120, land_m2: 650, method: 'Deadline sale' },
    { id: 'c2', page: 1, address: 'RB 5 Read Road, Testville', suburb: 'Testville', status: 'sold', price: 498000, sold_on: '2026-09-14', method: 'Auction' },
    { id: 'c3', page: 2, address: 'RB 11 Listing Road, Testville <img src=x onerror=alert(1)>', status: 'listed', price: 610000 }],
  market: [{ id: 'm1', page: 2, area: 'Testville', month: '2026-10', median: 520000, lower_quartile: 430000, upper_quartile: 640000, sales: 18, days_to_sell: 27 }] };

(async () => {
  const b = await chromium.launch();
  const mk = async (w, scheme) => {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, colorScheme: scheme, hasTouch: w < 500, isMobile: w < 500 }); ctx.setDefaultTimeout(8000);
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
    await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    await ctx.route(PK + '/**', r => r.fulfill({ status: 404, contentType: 'text/html', body: shell }));
    await ctx.route(PK + '/portal**', r => r.fulfill({ status: 200, contentType: 'text/html', body: shell }));
    await ctx.route(PK + '/onboarding/portal.js', r => r.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: bundle }));
    await ctx.route(PK + '/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
    await ctx.route(/example\.com/, r => { errs.push('the page fetched an outside link itself: ' + r.request().url()); r.abort(); });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push('page: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|permission denied|Failed to fetch|sent copy never changes|row-level security|Agent only/.test(m.text())) errs.push('console: ' + m.text()); });
    p.on('dialog', d => d.accept());
    return { ctx, p };
  };
  const side = p => p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth);
  const wait = (p, ms) => p.waitForTimeout(ms || 600);
  const signIn = async (p, email, seed) => { await p.goto(PB); await p.evaluate(([s, e]) => { localStorage.clear(); localStorage.setItem('mockAgents', JSON.stringify(['agent-test@example.com'])); localStorage.setItem('mocksession', JSON.stringify({ user: { id: e === 'agent-test@example.com' ? 'agent-1' : 'v-1', email: e } })); localStorage.setItem('mockdb', JSON.stringify(s)); }, [seed || SEED(), email]); };
  const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb')));
  const note = (p, id) => p.evaluate(i => { const n = document.getElementById('bn-' + i); return n && !n.hidden ? n.textContent + '|' + n.dataset.kind : null; }, id);
  const setLS = (p, o) => p.evaluate(x => { Object.entries(x).forEach(([k, v]) => v == null ? localStorage.removeItem(k) : localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))); }, o);
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'out', `appraisal_c2_${n}.png`), fullPage: true });
  const comps = async p => ((await db(p)).appraisal_comps || []).filter(c => c.appraisal_id === 'AVA').sort((x, y) => x.position - y.position);
  const ruleItems = p => p.$$eval('#cmpRuleList li', l => l.map(x => x.dataset.kind + ':' + x.textContent));
  const page = id => PB + 'appraisals/' + id + '/comps';
  const tick = (p, sel) => p.evaluate(q => { const i = document.querySelector(q); if (!i) throw new Error('no ' + q); if (!i.checked) i.click(); }, sel);
  const pdf = name => ({ name, mimeType: 'application/pdf', buffer: PDF });

  let X = await mk(390, 'light'), p = X.p;
  await signIn(p, 'agent-test@example.com'); await setLS(p, { reportResult: READING }); await p.goto(page('AVA')); await wait(p, 900);

  // ── 1. Upload a report: filed as agency papers, read, shown for ticking ──
  expect(!!(await p.$('#cmpReportCard')) && /Upload a report \(PDF\)/.test(await p.textContent('#cmpReportCard')), 'the upload card sits beside the import box');
  await p.setInputFiles('#cmpReport', [{ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<html>not a pdf</html>') }]); await wait(p, 500);
  out.notPdf = await note(p, 'cmpReportPick'); expect(/isn't a PDF/.test(out.notPdf || '') && !(await db(p)).property_documents.length, 'not a PDF by its bytes: refused, nothing filed: ' + out.notPdf);
  const before = (await comps(p)).length;
  await p.setInputFiles('#cmpReport', [pdf('rb-invented-report.pdf')]); await wait(p, 1200);
  out.read = await note(p, 'cmpReportPick');
  expect(/^Read\. It found 3 comparables and 1 month of market figures\. Tick what to bring in below\.\|ok$/.test(out.read || ''), 'read, said under the button: ' + out.read);
  let d = await db(p); const doc = d.property_documents[0];
  expect(d.property_documents.length === 1 && doc.kind === 'Comparables or market report' && doc.folder === 'agency' && doc.property_id === 'P2' && doc.path.startsWith('properties/P2/docs/') && doc.mime_type === 'application/pdf' && doc.size_bytes === PDF.length && /^[0-9a-f]{64}$/.test(doc.sha256) && d.storage_objects[doc.path], 'filed in the one store, agency papers, with its fingerprint: ' + JSON.stringify(doc));
  expect(d.ai_calls.length === 1 && d.ai_calls[0].purpose === 'appraisal report read' && d.ai_calls[0].appraisal_id === 'AVA' && d.ai_calls[0].model === 'claude-haiku-5-5', 'the model call is logged with the appraisal');
  expect(d.appraisal_reports.length === 1 && d.appraisal_reports[0].document_id === doc.id && !d.appraisal_reports[0].imported_at, 'the reading saved, not yet ticked');
  expect((await comps(p)).length === before, 'nothing imported without a tick');
  out.review = await p.evaluate(() => { const c = document.querySelector('.cmp-review'); return { boxes: Array.from(c.querySelectorAll('input[type=checkbox]')).map(i => i.checked), lines: Array.from(c.querySelectorAll('.cd')).map(x => x.textContent), head: c.querySelector('h3').textContent, img: !!c.querySelector('img'), text: c.innerText }; });
  expect(out.review.boxes.length === 4 && out.review.boxes.every(x => x === false), 'every comparable and figure starts unticked: ' + JSON.stringify(out.review.boxes));
  expect(/^Page 1: Testville, \$512,000, sold 3 October 2026, Deadline sale, 3 bed, 1 bath, 120 m² floor, 650 m² land$/.test(out.review.lines[0]) && /^Page 2: median \$520,000, middle half \$430,000 to \$640,000, 18 sold, 27 days to sell$/.test(out.review.lines[3]), 'what the reader found, beside its page: ' + JSON.stringify(out.review.lines));
  expect(!out.review.img && /onerror=alert/.test(out.review.text) && /From Relab, dated [A-Za-z]*,? ?20 November 2026/.test(out.review.text), 'text from the report drawn as text, never markup');
  expect(!(await side(p)), 'review list: no sideways scroll at 390 light'); await shot(p, 'review_390_light');

  // ── 2. Only ticked items come in, through the existing import; Tim's ticked wording kept ──
  const rid = d.appraisal_reports[0].id;
  await p.click('#rvImp-' + rid); await wait(p, 300);
  expect(/Tick at least one item first/.test((await note(p, 'rvImp-' + rid)) || ''), 'nothing ticked: refused');
  await tick(p, '[data-rv-c="c1"]'); await tick(p, '[data-rv-c="c2"]'); await tick(p, '[data-rv-m="m1"]');
  await p.click('#rvImp-' + rid); await wait(p, 1000);
  out.imp = await note(p, 'cmpReportPick');
  expect(/^Comparables: added 1, updated 1\. Market months: 1 added, 0 updated\.\|ok$/.test(out.imp || ''), 'brought in, said plainly: ' + out.imp);
  let cs = await comps(p); const n3 = cs.find(c => c.address === 'RB 3 Read Road, Testville'), n5 = cs.find(c => c.id === 'CT1');
  expect(cs.length === before + 1 && n3 && n3.source === 'relab' && n3.price === 512000 && n3.gathered_at === new Date('2026-11-20T12:00:00+13:00').toISOString() && !n3.compare_ticked && !cs.some(c => /Listing Road/.test(c.address)), 'only the ticked ones, with the report as their source and date: ' + JSON.stringify(n3));
  expect(n5.compare_text === 'Tim\'s own ticked wording for 5.' && n5.compare_ticked && n5.private_note === 'Tim only: a note.' && n5.price === 498000, 'a match keeps Tim\'s ticked wording and note; the figures refresh: ' + JSON.stringify(n5));
  d = await db(p);
  expect(d.market_months.length === 1 && d.market_months[0].area === 'Testville' && d.market_months[0].median === 520000, 'the ticked market month went into the shared store');
  expect(JSON.stringify(d.appraisal_reports[0].imported) === '{"comps":["c1","c2"],"months":["m1"]}' && d.appraisal_reports[0].imported_by === 'agent-test@example.com' && !(await p.$('.cmp-review')), 'the ticks recorded, and the reading leaves the list');

  // ── 3. A report set aside; reading switched off, then read again ──
  await p.setInputFiles('#cmpReport', [pdf('rb-second.pdf')]); await wait(p, 1200);
  const rid2 = (await db(p)).appraisal_reports[1].id; await p.click('#rvSkip-' + rid2); await wait(p, 700);
  d = await db(p); expect(/^Set aside\. Nothing was brought in/.test((await note(p, 'cmpReportPick')) || '') && JSON.stringify(d.appraisal_reports[1].imported) === '{"comps":[],"months":[]}' && (await comps(p)).length === before + 1, 'set aside: recorded, nothing brought in');
  await setLS(p, { reportMode: 'off' }); await p.setInputFiles('#cmpReport', [pdf('rb-third.pdf')]); await wait(p, 1000);
  out.off = await note(p, 'cmpReportPick'); d = await db(p);
  expect(/isn't switched on yet\. Your report is saved/.test(out.off || '') && d.property_documents.length === 3 && d.appraisal_reports.length === 2 && !!(await p.$('#cmpReportRetry')), 'off: the report is kept, said plainly, and can be read again: ' + out.off);
  await setLS(p, { reportMode: 'fail' }); await p.click('#cmpReportRetry'); await wait(p, 900);
  out.fail = await note(p, 'cmpReportRetry'); expect(/didn't give a usable answer/.test(out.fail || '') && (await db(p)).ai_calls.some(x => x.ok === false && x.appraisal_id === 'AVA'), 'a failed reading is soft, and logged as not ok: ' + out.fail);
  await setLS(p, { reportMode: null }); await p.click('#cmpReportRetry'); await wait(p, 1000);
  d = await db(p); expect(/^Read\./.test((await note(p, 'cmpReportPick')) || '') && d.appraisal_reports.length === 3 && d.appraisal_reports[2].document_id === d.property_documents[2].id && !(await p.$('#cmpReportRetry')), 'read again from the saved report');
  await p.click('#rvSkip-' + d.appraisal_reports[2].id); await wait(p, 600);

  // ── 4. Photos from a listing page ──
  await p.click('#cmpFetch-CM1'); await wait(p, 400);
  expect(await p.$eval('#cfPage', e => e.value) === 'https://listings.example.com/rb/7', 'the comparable\'s own link is offered first');
  await p.fill('#cfPage', 'ftp://listings.example.com/rb/7'); await p.click('#cfFetchGo'); await wait(p, 300);
  expect(/starting with https/.test((await note(p, 'cfFetchGo')) || ''), 'not a web link: refused on the page');
  await p.fill('#cfPage', 'https://listings.example.com/rb/7'); await p.click('#cfFetchGo'); await wait(p, 900);
  out.fetched = await note(p, 'cfFetchGo'); d = await db(p);
  const staged = Object.keys(d.storage_objects).filter(k => /\/comps\/CM1\/fetch-/.test(k));
  expect(/^Fetched 4 photos\. Tick the ones to keep\. 1 more couldn't be used\.\|ok$/.test(out.fetched || '') && staged.length === 4 && !d.appraisal_media.length, 'fetched and staged, nothing filed yet: ' + out.fetched);
  expect((await p.$$eval('.cmp-fetched input[type=checkbox]', l => l.map(i => i.checked))).join() === 'false,false,false,false', 'fetched photos start unticked');
  expect(!(await side(p)), 'fetched photos: no sideways scroll at 390 light'); await shot(p, 'fetch_390_light');
  await p.click('#cfKeep'); await wait(p, 300); expect(/Tick the photos to keep first/.test((await note(p, 'cfKeep')) || ''), 'keep with none ticked: refused');
  await tick(p, '#cfx-0'); await tick(p, '#cfx-2'); await p.click('#cfKeep'); await wait(p, 1000);
  out.kept = await note(p, 'cmpPh-CM1'); d = await db(p);
  const med = d.appraisal_media.filter(m => m.comp_id === 'CM1');
  expect(/^Kept 2 photos from the listing\. 2 left out and deleted\.\|ok$/.test(out.kept || '') && med.length === 2 && med.every(m => m.source === 'url' && m.page_url === 'https://listings.example.com/rb/7' && /^https:\/\/photos\.example\.com\//.test(m.source_url)) && Object.keys(d.storage_objects).filter(k => /\/comps\/CM1\/fetch-/.test(k)).length === 2, 'kept ones filed with their links; the rest deleted: ' + out.kept);
  expect((await p.$$eval('[data-cmp="CM1"] .cmp-photos img', l => l.length)) === 2 && !(await p.$('#cmpFetchBox')), 'the kept photos show on the comparable');
  // the pack's photo links; closing deletes what was fetched
  await p.click('#cmpFetch-CM1'); await wait(p, 400); await p.click('#cfFetchHints'); await wait(p, 900);
  d = await db(p); expect(/^Fetched 1 photo\./.test((await note(p, 'cfFetchHints')) || '') && Object.keys(d.storage_objects).filter(k => /\/comps\/CM1\/fetch-/.test(k)).length === 3, 'the pack\'s photo link fetched');
  expect(JSON.parse(await p.evaluate(() => localStorage.getItem('c2Calls'))).some(c => c.fn === 'appraisal-fetch' && c.action === 'fetch' && JSON.stringify(c.image_urls) === '["https://photos.example.com/rb/hint-1.jpg"]'), 'only the hint\'s https link is sent (not its file name)');
  await p.click('#cfFetchClose'); await wait(p, 800);
  d = await db(p); expect(/^Closed\. No fetched photos were kept\./.test((await note(p, 'cmpFetch-CM1')) || '') && Object.keys(d.storage_objects).filter(k => /\/comps\/CM1\/fetch-/.test(k)).length === 2 && d.appraisal_media.filter(m => m.comp_id === 'CM1').length === 2, 'closing deletes the fetched photos not kept');
  await setLS(p, { fetchMode: 'blocked' }); await p.click('#cmpFetch-CM2'); await wait(p, 400); await p.fill('#cfPage', 'https://blocked.example.com/rb/9'); await p.click('#cfFetchGo'); await wait(p, 700);
  out.blocked = await note(p, 'cfFetchGo'); expect(/wouldn't let the photos be fetched.*download folder/.test(out.blocked || '') && /\|err$/.test(out.blocked), 'a site that blocks: said plainly, with the download folder: ' + out.blocked);
  await setLS(p, { fetchMode: null }); await p.click('#cfFetchClose'); await wait(p, 500);

  // ── 5. Case-by-case suburbs: the AI check, mismatch flagged, nothing hidden ──
  let items = await ruleItems(p);
  expect(items.some(x => x === 'info:2 sales are in a suburb you check case by case (RB mixed area). Use "Check who they appeal to" and the AI will look at each one.'), 'not yet checked: a plain note: ' + JSON.stringify(items));
  expect(!items.some(x => /never-mix list/.test(x)), 'a case-by-case suburb\'s sales are counted, not kept apart');
  await setLS(p, { buyerMode: 'fail' }); await p.click('#cmpBuyers'); await wait(p, 700);
  expect(/nothing is flagged/.test((await note(p, 'cmpBuyers')) || '') && !(await db(p)).appraisal_buyer_checks.length, 'a failure: no flag, a plain note');
  await setLS(p, { buyerMode: null, buyerResult: { subject: { verdict: 'owner', reason: 'Three bedrooms on a family section.' }, byAddress: { 'RB 7 Mix Road, Rbmix': { verdict: 'investor', reason: 'Six bedrooms in 130 m2, advertised as tenanted.' }, 'RB 9 Mix Road, Rbmix': { verdict: 'owner', reason: 'Three bedrooms in 140 m2.' } } } });
  await p.click('#cmpBuyers'); await wait(p, 900);
  out.buyers = await note(p, 'cmpBuyers'); items = await ruleItems(p); d = await db(p);
  expect(/^Checked 2 sales\./.test(out.buyers || '') && d.ai_calls.some(x => x.purpose === 'appraisal buyer check' && x.ok && x.appraisal_id === 'AVA'), 'checked and logged: ' + out.buyers);
  expect(items.includes('warn:RB 7 Mix Road, Rbmix looks like an investor or student sale (Six bedrooms in 130 m2, advertised as tenanted), and your home looks like an owner-occupier home. A suggestion only: keep it, hide it, or mark it for context only.') && !items.some(x => /RB 9 Mix Road, Rbmix looks like/.test(x)), 'only the mismatch is flagged, as a suggestion: ' + JSON.stringify(items));
  expect((await comps(p)).every(c => c.shown !== false), 'nothing is hidden for Tim');
  out.verdictRow = await p.$eval('[data-cmp="CM1"] .cmp-buyer', e => e.textContent);
  expect(/^Who it likely appealed to \(AI, only you see this\): Likely an investor or student sale\. Six bedrooms/.test(out.verdictRow), 'the verdict and reason on Tim\'s screen: ' + out.verdictRow);
  // an investor subject: the owner-occupier sale is the mismatch; an unclear subject flags nothing
  await setLS(p, { buyerResult: { subject: { verdict: 'investor', reason: 'Five bedrooms near campus.' }, byAddress: { 'RB 7 Mix Road, Rbmix': { verdict: 'investor', reason: 'Tenanted.' }, 'RB 9 Mix Road, Rbmix': { verdict: 'owner', reason: 'Family home.' } } } });
  await p.click('#cmpBuyers'); await wait(p, 900); items = await ruleItems(p);
  expect(items.some(x => /^warn:RB 9 Mix Road, Rbmix looks like a family or owner-occupier sale \(Family home\), and your home looks like it would appeal to investors\./.test(x)) && !items.some(x => /RB 7 Mix Road.*looks like/.test(x)), 'an investor subject: a matching investor sale is fine: ' + JSON.stringify(items));
  await setLS(p, { buyerResult: { subject: { verdict: 'unclear', reason: '' }, byAddress: { 'RB 7 Mix Road, Rbmix': { verdict: 'investor', reason: 'Tenanted.' } } } });
  await p.click('#cmpBuyers'); await wait(p, 900); items = await ruleItems(p);
  expect(items.some(x => x === 'info:The AI couldn\'t tell who your home would appeal to, so no case-by-case sale is flagged. Check them yourself.') && !items.some(x => /looks like/.test(x)), 'unclear: no flag, a plain note: ' + JSON.stringify(items));
  await setLS(p, { buyerResult: { subject: { verdict: 'owner', reason: 'Family home.' }, byAddress: { 'RB 7 Mix Road, Rbmix': { verdict: 'investor', reason: 'Tenanted, strong yield.' } } } });
  await p.click('#cmpBuyers'); await wait(p, 900);
  // the never-mix list: its mode, and a new case-by-case group
  expect(await p.$eval('#grpM-G1', e => e.value) === 'case_by_case', 'the group shows its mode');
  await p.fill('#grpName', 'RB student pocket'); await p.fill('#grpSuburbs', 'Rbstudent'); await p.selectOption('#grpMode', 'case_by_case'); await p.click('#grpAdd'); await wait(p, 600);
  d = await db(p); expect(/checked case by case/.test((await note(p, 'grpAdd')) || '') && d.suburb_groups.find(g => g.name === 'RB student pocket').mode === 'case_by_case', 'a new case-by-case group');
  await p.selectOption('#grpM-G1', 'never_mix'); await p.click('#grpSave-G1'); await wait(p, 600);
  items = await ruleItems(p); d = await db(p);
  expect(d.suburb_groups.find(g => g.id === 'G1').mode === 'never_mix' && items.some(x => /RB 7 Mix Road, Rbmix is in Rbmix, on your never-mix list/.test(x)), 'switched back to never mix: the old rule applies');
  await p.selectOption('#grpM-G1', 'case_by_case'); await p.click('#grpSave-G1'); await wait(p, 600);
  expect(!(await side(p)), 'comparables screen with the new tools: no sideways scroll at 390 light'); await shot(p, 'full_390_light');

  // ── 6. The verdicts never reach the appraisal, the presentation or print ──
  for (const u of [PB + 'appraisals/AVA', PB + 'appraisals/AVA/present']) {
    await p.goto(u); await wait(p, 1200);
    const t = await p.evaluate(() => document.querySelector('#apvDoc').innerText);
    const hit = t.replace(/Fully tenanted, strong yield\./g, '').match(/investor|owner-occupier|appealed|Tenanted, strong yield|Six bedrooms in 130|only you see this/i);
    expect(!hit, 'no verdict or reason on ' + u + ': ' + (hit && t.slice(Math.max(0, hit.index - 80), hit.index + 80)));
    expect(/RB 3 Read Road/.test(t), 'the imported comparable shows on ' + u);
  }
  await p.emulateMedia({ media: 'print' }); expect(!/appealed|only you see this/i.test(await p.evaluate(() => document.body.innerText)), 'none in print'); await p.emulateMedia({ media: 'screen' });
  await X.ctx.close();

  // ── 7. Dark at 390, and a sent appraisal has none of the new tools ──
  X = await mk(390, 'dark'); p = X.p;
  const seed = SEED(); seed.appraisal_reports.push({ id: 'R1', appraisal_id: 'AVA', document_id: 'D1', result: READING, model: 'claude-haiku-5-5', pages: 2, read_by: 'agent-test@example.com', read_at: now, imported: null });
  await signIn(p, 'agent-test@example.com', seed); await p.goto(page('AVA')); await wait(p, 1000);
  await p.click('#cmpFetch-CM1'); await wait(p, 400); await p.click('#cfFetchGo'); await wait(p, 900);
  const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg === 'rgb(24, 23, 22)' && !(await side(p)) && !!(await p.$('.cmp-review')) && !!(await p.$('.cmp-fetched')), 'dark: review list and fetched photos, no sideways scroll at 390: ' + bg); await shot(p, 'comps_390_dark');
  await p.click('#cfFetchClose'); await wait(p, 500);
  await p.goto(page('AVS')); await wait(p, 900);
  out.sent = await p.evaluate(() => ({ card: !!document.querySelector('#cmpReportCard'), fetch: !!document.querySelector('[data-cmp-fetch]'), buyers: !!document.querySelector('#cmpBuyers') }));
  expect(!out.sent.card && !out.sent.fetch && !out.sent.buyers, 'a sent appraisal: no upload, no fetch, no check: ' + JSON.stringify(out.sent));
  await X.ctx.close();

  // ── 8. A vendor gets nothing from the new functions or tables ──
  X = await mk(390, 'light'); p = X.p;
  await signIn(p, 'rb-vendor@example.com'); await p.goto(PB); await wait(p, 600);
  out.vendor = await p.evaluate(async () => { const c = window.supabase.createClient('x', 'y'), r = {};
    r.reports = (await c.from('appraisal_reports').select('*')).data.length; r.checks = (await c.from('appraisal_buyer_checks').select('*')).data.length;
    r.fetch = (await c.functions.invoke('appraisal-fetch', { body: { action: 'fetch', appraisal_id: 'AVA', comp_id: 'CM1', page_url: 'https://listings.example.com/rb/7' } })).error ? 'refused' : 'ran';
    r.read = (await c.functions.invoke('doc-prefill', { body: { mode: 'buyer_check', appraisal_id: 'AVA' } })).error ? 'refused' : 'ran';
    r.tick = (await c.rpc('agent_report_imported', { p_report: 'x', p_comps: [], p_months: [] })).error ? 'refused' : 'ran'; return r; });
  expect(JSON.stringify(out.vendor) === '{"reports":0,"checks":0,"fetch":"refused","read":"refused","tick":"refused"}', 'a vendor: nothing: ' + JSON.stringify(out.vendor));
  await X.ctx.close();
  await b.close();
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => { console.log(JSON.stringify({ errs: ['crashed: ' + (e && e.stack || e)] }, null, 1)); process.exit(0); });

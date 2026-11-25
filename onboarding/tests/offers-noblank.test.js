// Offers fix (Tim, 25 November 2026): before an offer is processed, it is obvious when the property has no REINZ agreement blank
// ready (none loaded, or one loaded whose places aren't approved). Against the mock database, with blanks and maps seeded directly
// (no PDF is read here). Covers the four places the warning card shows: "Fill in an offer for a buyer" (from the Offers tile and from
// Home's "Draft an offer"), the property's Offers tile (form on, or any offer), the offer page (#drNoBlank, now a card), and "Needs
// you" (the Dashboard and the portal's Home), one item per property with a live offer; both states, with the right button; a usable
// blank, a withdrawn offer, and a property with the form off and no offers showing nothing; everything gone once a usable blank exists;
// the buyer's public form unchanged; 390 px with no sideways scroll in light and dark.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const bundle = fs.readFileSync(path.join(__dirname, '..', 'portal.js'), 'utf8');
const shell = fs.readFileSync(path.join(ROOT, 'portal', 'index.html'), 'utf8');
const notFound = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');
const cat = fs.readFileSync(path.join(ROOT, 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const AGENT = 'agent-noblank@example.com';
const PK = 'https://packages.dunnerstunner.co.nz', OB = PK + '/onboarding/', PB = PK + '/portal/';
(async () => {
  const b = await chromium.launch(); const out = {}; const errs = [];
  const expect = (c, m) => { if (!c) errs.push(m); };
  const mk = async scheme => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, hasTouch: true, isMobile: true }); ctx.setDefaultTimeout(15000);
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
    await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    await ctx.route(PK + '/**', r => r.fulfill({ status: 404, contentType: 'text/html', body: notFound }));
    await ctx.route(PK + '/onboarding/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await ctx.route(PK + '/portal**', r => { const u = new URL(r.request().url()); if (u.pathname === '/portal/' || u.pathname === '/portal/index.html') return r.fulfill({ contentType: 'text/html', body: shell }); return r.fulfill({ status: 404, contentType: 'text/html', body: notFound }); });
    await ctx.route(PK + '/onboarding/portal.js', r => r.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: bundle }));
    await ctx.route(PK + '/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push('page: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    p.on('dialog', d => d.accept());
    return { ctx, p };
  };
  const now = new Date().toISOString();
  const prop = (id, address, stage) => ({ id, address, title_ref: null, owners_on_title: null, ownership: {}, description: {}, disclosures: {}, found: {}, provenance: {}, stage, stage_at: now, created_at: now, updated_at: now });
  const blank = (id, pid, checked) => ({ id, property_id: pid, document_id: 'doc-' + id, sha256: 'ab'.repeat(32), size: 1000, file_name: 'Agreement pack ' + pid + '.pdf', pages: 10, sizes: [], edition: checked ? 'Eleventh Edition 2022 (4)' : 'Ninth Edition 2012', edition_checked: checked, created_at: now });
  const map = (id, bid, approved) => ({ id, blank_id: bid, version: 1, places: [], proposals: [], chattels: [], missing: [], approved, created_at: now });
  const seed = { agreements: [], agreement_people: [], agreement_events: [], signatures: [], lawyer_links: [], aml_files: [], aml_events: [], email_log: [], cancellation_requests: [], prelistings: [], agreement_variations: [], prior_agency_notices: [],
    properties: [prop('P1', '1 Noblank Road, Testville', 'live'), prop('P2', '2 Unapproved Street, Testville', 'live'), prop('P3', '3 Ready Lane, Testville', 'live'), prop('P4', '4 Formon Avenue, Testville', 'live'), prop('P5', '5 Withdrawn Way, Testville', 'live'), prop('P6', '6 Quiet Close, Testville', 'live')],
    property_people: [],
    offer_blanks: [blank('B2', 'P2', true), blank('B3', 'P3', true)],
    offer_blank_maps: [map('M2', 'B2', false), map('M3', 'B3', true)] };
  const offer = { email: 'buyer.own@example.com', phone: '021 999 8888', seen_docs: 'yes', sign: 'in_person', price: '655000', settlement: { kind: 'relative', days: 15 }, conditions: [{ key: 'finance', days: 10 }],
    kiwisaver: false, entity: '', nominee: false, purchasers: [{ first: 'Ana', last: 'Testbuyer', email: 'ana.p@example.com', phone: '022 777 6666' }], comments: '',
    lawyer: { firm: 'Synthetic Law', person: 'Pat Solicitor', email: '', phone: '' }, related: false, date_help: false, privacy: true, chattels_add: [], chattels_exclude: [], gst_registered: null, gst_number: null };
  const side = p => p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth);
  const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb')));
  const setDb = (p, d) => p.evaluate(d => localStorage.setItem('mockdb', JSON.stringify(d)), d);
  const rpc = (p, fn, args) => p.evaluate(([fn, args]) => window.supabase.createClient().rpc(fn, args), [fn, args]);
  const text = async (p, s) => ((await p.$(s)) ? (await p.textContent(s)).replace(/\s+/g, ' ').trim() : '');
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'out', `noblank_${n}.png`), fullPage: true });
  const nbItems = p => p.$$eval('ul.needs li', e => e.filter(li => /Offer waiting: no agreement blank ready/.test(li.textContent)).map(li => li.textContent.replace(/\s+/g, ' ').trim()));
  const dash = async p => { await p.click('#navDash'); await p.waitForSelector('#d-needs'); await p.waitForTimeout(500); };
  const openProp = async (p, pid) => { await p.click('#navDash'); await p.waitForTimeout(400); await p.click(`tr[data-prop="${pid}"]`); await p.waitForSelector('#offTile'); await p.waitForTimeout(200); };
  // the card's parts: its state, heading, wording, button and the blank the button opens; and whether it comes before the form
  const card = (p, sel) => p.evaluate(sel => { const c = document.querySelector(sel); if (!c) return null; const btn = c.querySelector('[data-blankgo]');
    return { state: c.dataset.blankwarn, warnc: c.classList.contains('card') && c.classList.contains('warnc'), head: (c.querySelector('h3') || {}).textContent || '', text: c.textContent.replace(/\s+/g, ' ').trim(), btn: btn ? btn.textContent.trim() : '', go: btn ? btn.dataset.blankgo : null, visible: !!(c.offsetWidth || c.offsetHeight) }; }, sel);

  // ── 1. set up: offers on P1 (no blank), P2 (blank loaded, places not approved), P3 (a usable blank), P5 (withdrawn); P4's form on ──
  process.stderr.write('step 1\n');
  const A = await mk('light'); const p = A.p;
  await p.goto(OB); await p.evaluate(([s, a]) => { localStorage.clear(); localStorage.setItem('mockAgents', JSON.stringify([a])); localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'agent-1', email: a } })); localStorage.setItem('mockdb', JSON.stringify(s)); }, [seed, AGENT]);
  await p.goto(OB); await p.waitForTimeout(600);
  for (const pid of ['P1', 'P4']) await rpc(p, 'agent_offer_link', { p_property: pid, p_action: 'open' });
  const ids = {}; for (const pid of ['P1', 'P2', 'P3', 'P5']) ids[pid] = (await rpc(p, 'agent_offer_add', { p_property: pid, p_offer: offer })).data;
  let d = await db(p); d.property_offers.find(o => o.id === ids.P5).status = 'withdrawn'; await setDb(p, d);
  expect(Object.values(ids).every(Boolean), 'offers added: ' + JSON.stringify(ids));

  // ── 2. "Needs you" on the Dashboard: one item per property with a live offer and no usable blank ──
  process.stderr.write('step 2\n');
  await p.reload(); await p.waitForTimeout(600); await dash(p);
  out.needs = await nbItems(p);
  expect(out.needs.length === 2, 'two "Offer waiting: no agreement blank ready" items: ' + JSON.stringify(out.needs));
  expect(out.needs.some(t => /1 Noblank Road/.test(t) && /Load the REINZ agreement blank/.test(t)), 'P1: no blank loaded');
  expect(out.needs.some(t => /2 Unapproved Street/.test(t) && /places aren't approved yet/.test(t)), 'P2: places not approved');
  expect(!out.needs.some(t => /Ready Lane|Withdrawn Way|Formon Avenue|Quiet Close/.test(t)), 'nothing for a usable blank, a withdrawn offer, or a property with no offer');
  expect(!(await side(p)), 'Dashboard at 390 px: no sideways scroll');
  // Open goes to the property's Offers tile, at the warning
  await p.evaluate(() => { const li = [...document.querySelectorAll('ul.needs li')].find(x => /1 Noblank Road/.test(x.textContent) && /no agreement blank ready/.test(x.textContent)); li.querySelector('[data-need]').click(); });
  await p.waitForSelector('#offTile'); await p.waitForTimeout(300);
  expect(/1 Noblank Road/.test(await text(p, 'main')) && !!(await p.$('#offNoBlank')), 'Open goes to the property, with the warning on its Offers tile');

  // ── 3. the Offers tile ──
  process.stderr.write('step 3\n');
  let c = await card(p, '#offTile #offNoBlank'); out.tile1 = c;
  expect(c && c.warnc && c.visible && c.state === 'none' && c.head === 'No REINZ agreement blank is ready for this property.' && /can't be placed on the agreement until you load the blank and approve its places/.test(c.text) && c.btn === 'Load the agreement blank' && c.go === '', 'P1 tile: no blank card, with Load the agreement blank: ' + JSON.stringify(c));
  expect(await p.evaluate(() => { const t = document.querySelector('#offTile'), w = document.querySelector('#offNoBlank'), l = t.querySelector('.of-list, #drBlank'); return !!(l && (w.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING)); }), 'the card is near the top of the Offers section, above the offers and the blank');
  await p.evaluate(() => window.scrollTo(0, 0)); await p.click('#offNoBlank [data-blankgo]'); await p.waitForTimeout(400);
  expect(await p.evaluate(() => { const r = document.querySelector('#drBlank').getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; }) && !!(await p.$('#drLoadBtn')), 'Load the agreement blank goes to the blank section');
  expect(!(await side(p)), 'tile with the card at 390 px: no sideways scroll'); await shot(p, 'tile_none');
  await openProp(p, 'P2'); c = await card(p, '#offTile #offNoBlank'); out.tile2 = c;
  expect(c && c.warnc && c.state === 'unapproved' && c.head === 'The agreement blank is loaded, but its places aren\'t approved yet.' && /until you check and approve the places on the blank/.test(c.text) && c.btn === 'Check the places on the blank' && c.go === 'B2', 'P2 tile: loaded but not approved, with Check the places on the blank: ' + JSON.stringify(c));
  await openProp(p, 'P3'); expect(!(await p.$('#offNoBlank')) && !(await p.$('[data-blankwarn]')), 'P3 tile (usable blank): no card');
  await openProp(p, 'P4'); c = await card(p, '#offTile #offNoBlank'); expect(c && c.state === 'none', 'P4 tile (form on, no offers yet): the card shows');
  await openProp(p, 'P6'); expect(!(await p.$('#offNoBlank')), 'P6 tile (form off, no offers): no card');

  // ── 4. "Fill in an offer for a buyer", from the tile and from Home's "Draft an offer" ──
  process.stderr.write('step 4\n');
  await openProp(p, 'P1'); await p.click('#offNew'); await p.waitForSelector('#ofForm');
  c = await card(p, '#ofForm #ofNoBlank'); out.entry1 = c;
  expect(c && c.warnc && c.state === 'none' && c.head === 'No REINZ agreement blank is ready for this property.' && /You can take the offer details now, but it can't be placed on the agreement until you load the blank and approve its places\./.test(c.text) && c.btn === 'Load the agreement blank', 'entry: the card, worded for taking the details now: ' + JSON.stringify(c));
  expect(await p.evaluate(() => { const w = document.querySelector('#ofNoBlank'), s = document.querySelector('#ofForm .of-sec'); return !!(s && (w.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING)); }), 'entry: the card comes before the form');
  expect(!(await p.$eval('#ofPrice', e => e.disabled)) && await p.isVisible('#ofPrice'), 'entry is not blocked: the form is there to fill in');
  expect(!(await side(p)), 'entry with the card at 390 px: no sideways scroll'); await shot(p, 'entry_none');
  await p.click('#ofNoBlank [data-blankgo]'); await p.waitForSelector('#offTile'); await p.waitForTimeout(300);
  expect(/1 Noblank Road/.test(await text(p, 'main')) && await p.evaluate(() => { const r = document.querySelector('#drBlank').getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; }), 'entry: Load the agreement blank opens the property at its blank section');
  // Home's "Draft an offer"
  await p.click('#navHome').catch(() => null); await p.waitForTimeout(300); if (!(await p.$('#homeOffer'))) { await p.goto(OB); await p.waitForTimeout(600); }
  await p.click('#homeOffer'); await p.waitForSelector('[data-pick-new="P2"]'); await p.click('[data-pick-new="P2"]'); await p.waitForSelector('#ofForm');
  c = await card(p, '#ofForm #ofNoBlank'); out.entry2 = c;
  expect(c && c.state === 'unapproved' && c.head === 'The agreement blank is loaded, but its places aren\'t approved yet.' && /You can take the offer details now, but it can't be placed on the agreement until you check and approve the places on the blank\./.test(c.text) && c.btn === 'Check the places on the blank' && c.go === 'B2', 'entry from Home, P2: loaded but not approved: ' + JSON.stringify(c));
  await p.click('#homeOffer').catch(() => null);
  await p.goto(OB); await p.waitForTimeout(600); await p.click('#homeOffer'); await p.waitForSelector('[data-pick-new="P3"]'); await p.click('[data-pick-new="P3"]'); await p.waitForSelector('#ofForm');
  expect(!(await p.$('#ofNoBlank')) && !(await p.$('[data-blankwarn]')), 'entry for P3 (usable blank): no card');

  // ── 5. the offer page: #drNoBlank is now the card ──
  process.stderr.write('step 5\n');
  await openProp(p, 'P1'); await p.click(`[data-offer="${ids.P1}"]`); await p.waitForSelector('#drOffer');
  c = await card(p, '#drNoBlank'); out.offer1 = c;
  expect(c && c.warnc && c.state === 'none' && c.head === 'No REINZ agreement blank is ready for this property.' && /This offer can't be placed on the agreement until you load the blank and approve its places\./.test(c.text) && c.btn === 'Load the agreement blank' && !(await p.$('#drDraftBtn')), 'offer page P1: #drNoBlank is the card: ' + JSON.stringify(c));
  expect(!(await side(p)), 'offer page with the card at 390 px: no sideways scroll'); await shot(p, 'offer_none');
  await p.click('#drNoBlank [data-blankgo]'); await p.waitForSelector('#offTile'); await p.waitForTimeout(300);
  expect(/1 Noblank Road/.test(await text(p, 'main')) && !!(await p.$('#drBlank')), 'offer page: Load the agreement blank opens the property at its blank section');
  await openProp(p, 'P2'); await p.click(`[data-offer="${ids.P2}"]`); await p.waitForSelector('#drOffer');
  c = await card(p, '#drNoBlank'); expect(c && c.state === 'unapproved' && c.btn === 'Check the places on the blank' && c.go === 'B2' && /This offer can't be placed on the agreement until you check and approve the places on the blank\./.test(c.text), 'offer page P2: loaded but not approved: ' + JSON.stringify(c));
  await openProp(p, 'P3'); await p.click(`[data-offer="${ids.P3}"]`); await p.waitForSelector('#drOffer');
  expect(!(await p.$('#drNoBlank')) && !!(await p.$('#drDraftBtn')), 'offer page P3 (usable blank): no card, the Draft button instead');

  // ── 6. a blank of an unchecked edition only: the card still shows, worded for it ──
  await rpc(p, 'agent_offer_add', { p_property: 'P6', p_offer: offer });
  d = await db(p); d.offer_blanks.push(blank('B6', 'P6', false)); await setDb(p, d);
  await p.reload(); await p.waitForTimeout(600); await openProp(p, 'P6'); c = await card(p, '#offNoBlank');
  expect(c && c.state === 'unchecked' && /edition hasn't been checked yet/.test(c.head) && c.btn === 'Load the agreement blank', 'unchecked edition: the card says so: ' + JSON.stringify(c));
  await dash(p); expect((await nbItems(p)).some(t => /6 Quiet Close/.test(t) && /edition hasn't been checked/.test(t)), 'unchecked edition: listed in Needs you');

  // ── 7. the portal's Home lists them too ──
  process.stderr.write('step 7\n');
  await p.goto(PB); await p.waitForSelector('#pNeeds ul.needs, #pNeeds .okc', { timeout: 20000 }); await p.waitForTimeout(300);
  out.portalNeeds = await nbItems(p);
  expect(out.portalNeeds.length === 3 && out.portalNeeds.some(t => /1 Noblank Road/.test(t)) && out.portalNeeds.some(t => /2 Unapproved Street/.test(t)), 'portal Home "Needs you" lists them: ' + JSON.stringify(out.portalNeeds));
  expect(!(await side(p)), 'portal Home at 390 px: no sideways scroll');

  // ── 8. once a usable blank exists, every warning goes ──
  process.stderr.write('step 8\n');
  d = await db(p); d.offer_blanks.push(blank('B1', 'P1', true)); d.offer_blank_maps.push(map('M1', 'B1', true)); d.offer_blank_maps.find(m => m.id === 'M2').approved = true; await setDb(p, d);
  await p.goto(PB); await p.waitForSelector('#pNeeds ul.needs, #pNeeds .okc', { timeout: 20000 }); await p.waitForTimeout(300);
  out.portalAfter = await nbItems(p);
  expect(out.portalAfter.length === 1 && /6 Quiet Close/.test(out.portalAfter[0]), 'portal Home: P1 and P2 gone once their blanks are usable: ' + JSON.stringify(out.portalAfter));
  await p.goto(OB); await p.waitForTimeout(600); await dash(p);
  expect(!(await nbItems(p)).some(t => /Noblank Road|Unapproved Street/.test(t)), 'Dashboard: P1 and P2 gone');
  await openProp(p, 'P1'); expect(!(await p.$('#offNoBlank')), 'P1 tile: no card once usable');
  await p.click('#offNew'); await p.waitForSelector('#ofForm'); expect(!(await p.$('#ofNoBlank')), 'P1 entry: no card once usable');
  await openProp(p, 'P1'); await p.click(`[data-offer="${ids.P1}"]`); await p.waitForSelector('#drOffer');
  expect(!(await p.$('#drNoBlank')) && !!(await p.$('#drDraftBtn')), 'P1 offer page: no card, the Draft button instead');
  await openProp(p, 'P2'); expect(!(await p.$('#offNoBlank')), 'P2 tile: no card once its places are approved');

  // ── 9. dark mode, and the buyer's public form unchanged ──
  process.stderr.write('step 9\n');
  const B = await mk('dark'); const q = B.p;
  d = await db(p); d.offer_blanks = d.offer_blanks.filter(x => x.id !== 'B1'); d.offer_blank_maps = d.offer_blank_maps.filter(x => x.id !== 'M1');
  await q.goto(OB); await q.evaluate(([s, a]) => { localStorage.clear(); localStorage.setItem('mockAgents', JSON.stringify([a])); localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'agent-1', email: a } })); localStorage.setItem('mockdb', JSON.stringify(s)); }, [d, AGENT]);
  await q.goto(OB); await q.waitForTimeout(600); await openProp(q, 'P1');
  c = await card(q, '#offNoBlank'); expect(c && c.state === 'none' && c.visible, 'dark: the tile card shows');
  const look = await q.evaluate(() => { const s = getComputedStyle(document.querySelector('#offNoBlank')), bg = getComputedStyle(document.body); return { bg: s.backgroundColor, fg: s.color, body: bg.backgroundColor }; });
  expect(look.bg !== look.fg && look.bg !== 'rgba(0, 0, 0, 0)', 'dark: the card has its own colours: ' + JSON.stringify(look));
  await q.click('#offNew'); await q.waitForSelector('#ofNoBlank'); expect(!(await side(q)), 'dark: entry with the card at 390 px, no sideways scroll'); await shot(q, 'entry_dark');
  const token = (await db(q)).offer_links.find(x => x.property_id === 'P1').token;
  const C = await mk('light'); const v = C.p;
  await v.goto(OB); await v.evaluate(d => { localStorage.clear(); localStorage.setItem('mockdb', JSON.stringify(d)); }, await db(q));
  await v.goto(OB + '?offer=' + encodeURIComponent(token)); await v.waitForSelector('#ofForm'); await v.waitForTimeout(300);
  expect((await text(v, 'h1')) === 'Make an offer' && !(await v.$('[data-blankwarn]')) && !/agreement blank|REINZ/.test(await text(v, 'main')), 'the buyer\'s form shows nothing about the blank');

  // ── 10. the wording: NZ English, no em or en dashes ──
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8'), i0 = src.indexOf('function drBlankState'), i1 = src.indexOf('function drBlankGoWire');
  expect(i0 > 0 && i1 > i0 && !/[—–]/.test(src.slice(i0, i1)), 'no dashes in the card wording');
  await b.close();
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => { console.log(JSON.stringify({ errs: ['crashed: ' + (e && e.stack || e)] }, null, 1)); process.exit(0); });

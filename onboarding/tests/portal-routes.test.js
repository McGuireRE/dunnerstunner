// The portal (PORTAL-PLAN.md, phase P1), against the mock database. The portal shell is served the way GitHub Pages serves it:
// /portal/ is portal/index.html, and any other missing address gets the root 404.html (status 404), which is the same shell.
// Covers: every address opens its page directly (also after the sign-in link brings Tim back), and by the footer menu, the up
// link and other links; back and forward; the unsaved-work warning on the menu, a link, back and forward; the menu and up link
// hidden while signing or going through the agreement in person; the menu and the Back and Continue bar not overlapping; no
// sideways scroll at 390 px, light and dark; addresses holding ids only; the same shell at the root of portal.dunnerstunner.co.nz;
// every link for vendors and buyers still pointing at packages.dunnerstunner.co.nz/onboarding; a vendor signing in at the portal;
// any other missing address saying "not found"; and the onboarding app itself (not the portal) behaving exactly as before.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const bundle = fs.readFileSync(path.join(__dirname, '..', 'portal.js'), 'utf8');
const shell = fs.readFileSync(path.join(ROOT, 'portal', 'index.html'), 'utf8');
const notFound = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');
const rootIndex = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(ROOT, 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const PK = 'https://packages.dunnerstunner.co.nz', PB = PK + '/portal/', PR = 'https://portal.dunnerstunner.co.nz/';
const out = {}; const errs = [];
(async () => {
  const b = await chromium.launch();
  const expect = (c, m) => { if (!c) errs.push(m); };
  const seen = new Set();   // every address the portal showed
  let answer = true, asked = [];   // the unsaved-work question: what Tim answers, and what was asked
  const mk = async (w, scheme) => {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, colorScheme: scheme, hasTouch: w < 500, isMobile: w < 500 }); ctx.setDefaultTimeout(8000);
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
    await ctx.route('https://cdn.jsdelivr.net/npm/pdf*/**', r => r.fulfill({ status: 404, body: '' }));   // the PDF tools are not needed here
    await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    // GitHub Pages for packages.dunnerstunner.co.nz: real files, or 404.html with status 404
    await ctx.route(PK + '/**', r => { const u = new URL(r.request().url()); if (u.pathname === '/' || u.pathname === '/index.html') return r.fulfill({ contentType: 'text/html', body: rootIndex }); return r.fulfill({ status: 404, contentType: 'text/html', body: notFound }); });
    await ctx.route(PK + '/onboarding/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await ctx.route(PK + '/portal**', r => { const u = new URL(r.request().url()); if (u.pathname === '/portal/' || u.pathname === '/portal/index.html') return r.fulfill({ contentType: 'text/html', body: shell }); return r.fulfill({ status: 404, contentType: 'text/html', body: notFound }); });
    await ctx.route(PK + '/onboarding/portal.js', r => r.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: bundle }));
    await ctx.route(PK + '/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
    // the portal repository (index.html and 404.html are both the shell)
    await ctx.route(PR + '**', r => { const u = new URL(r.request().url()); return r.fulfill({ status: u.pathname === '/' || u.pathname === '/index.html' ? 200 : 404, contentType: 'text/html', body: shell }); });
    const p = await ctx.newPage(); p.on('pageerror', e => { errs.push('page: ' + e.message); }); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    p.on('dialog', async d => { asked.push(d.message()); if (answer) await d.accept(); else await d.dismiss(); });
    p.on('framenavigated', f => { if (f === p.mainFrame()) { const u = new URL(f.url()); if (/^\/portal\//.test(u.pathname) || u.host === 'portal.dunnerstunner.co.nz') seen.add(u.pathname); } });
    return { ctx, p };
  };
  const side = (p, w) => p.evaluate(w => Math.max(document.documentElement.scrollWidth, window.innerWidth) > w, w || 390);
  const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb')));
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'out', `portal_${n}.png`), fullPage: true });
  const wait = (p, ms) => p.waitForTimeout(ms || 500);
  const now = new Date().toISOString();
  const prop = (id, address, stage) => ({ id, address, title_ref: null, owners_on_title: null, ownership: {}, description: {}, disclosures: {}, found: {}, provenance: {}, stage, stage_at: now, created_at: now, updated_at: now });
  const NAMES = ['Vera Vendor', 'Sam Seller', 'Carol Contact', 'vendor@example.com', 'sam@example.com', 'carol@example.com', '021 000 0000', '0210000000'];
  const seed = {
    properties: [prop('P1', '12 Pine Hill Road, Dunedin', 'live'), prop('P2', '3 Early Street, Dunedin', 'questionnaire'), prop('P3', '7 Quiet Lane, Dunedin', 'appraisal')],
    property_people: [{ id: 'PP1', property_id: 'P1', position: 1, legal_name: 'Vera Vendor', pref_name: 'Vee', email: 'vendor@example.com', phone: '021 000 0000', user_id: 'v-1', role: 'owner', source: 'agreement', name_from: 'agreement' },
      { id: 'PP2', property_id: 'P2', position: 1, legal_name: 'Sam Seller', pref_name: '', email: 'sam@example.com', phone: '', user_id: null, role: 'owner', source: 'appraisal', name_from: 'appraisal' },
      { id: 'PP3', property_id: 'P2', position: 2, legal_name: 'Carol Contact', pref_name: '', email: 'carol@example.com', phone: '', user_id: null, role: 'contact', source: 'appraisal', name_from: 'appraisal' }],
    agreements: [{ id: 'A1', ref: 'MRE-2026-1001', address: '12 Pine Hill Road, Dunedin', property_id: 'P1', status: 'countersigned', config: {}, answers: {}, legal: {}, created_at: now, updated_at: now, signed_at: now, countersigned_at: now },
      { id: 'A2', ref: 'MRE-2026-1002', address: '3 Early Street, Dunedin', property_id: 'P2', status: 'draft', config: {}, answers: {}, legal: {}, created_at: now, updated_at: now }],
    agreement_people: [{ id: 'AP1', agreement_id: 'A1', position: 1, legal_name: 'Vera Vendor', pref_name: 'Vee', email: 'vendor@example.com', phone: '021 000 0000', user_id: 'v-1', signed_at: now },
      { id: 'AP2', agreement_id: 'A2', position: 1, legal_name: 'Sam Seller', pref_name: '', email: 'sam@example.com', phone: '' }],
    agreement_events: [], signatures: [], lawyer_links: [], aml_files: [], aml_events: [], email_log: [], cancellation_requests: [], prior_agency_notices: [],
    prelistings: [{ id: 'L1', address: '3 Early Street, Dunedin', property_id: 'P2', contact_name: 'Sam Seller', contact_email: 'sam@example.com', status: 'submitted', appraisal: {}, answers: {}, plan: {}, created_at: now, updated_at: now }],
    agreement_variations: [{ id: 'V1', agreement_id: 'A1', number: 1, status: 'draft', changes: {}, created_at: now, updated_at: now }],
    property_forms: [{ id: 'F1', agreement_id: 'A1', property_id: 'P1', kind: 'healthy_homes', status: 'draft', data: {}, agent_data: {}, created_at: now, updated_at: now }],
    property_offers: [{ id: 'O1', property_id: 'P1', source: 'manual', amount: 650000, details: { price: 650000 }, status: 'received', as_at: now.slice(0, 10), received_at: now, read_at: now, created_at: now }],
    offer_blanks: [{ id: 'B1', property_id: 'P1', document_id: 'DOC1', sha256: 'a'.repeat(64), size: 1000, file_name: 'blank.pdf', pages: 1, sizes: [[595, 842]], edition: 'Eleventh Edition 2022 (4)', edition_checked: true, path: 'P1/blank.pdf', created_at: now }],
    offer_drafts: [{ id: 'D1', offer_id: 'O1', property_id: 'P1', number: 1, blank_id: 'B1', blank_sha256: 'a'.repeat(64), map_id: null, details: { price: 650000 }, edits: {}, placed: [], needs: [], path: 'P1/draft-1.pdf', sha256: 'b'.repeat(64), created_at: now }],
    property_inspections: [{ id: 'I1', property_id: 'P1', status: 'in_progress', facts: {}, declaration: {}, notes: {}, photos: [], stamps: {}, applied: {}, conflicts: {}, resolved: {}, sent_form_id: null, sent_at: null, created_by: 'agent-test@example.com', started_at: now, finished_at: null, created_at: now, updated_at: now }],
  };
  const signIn = async (p, base, sess) => { await p.goto(base); await p.evaluate(([s, se]) => { localStorage.clear(); localStorage.setItem('mockAgents', JSON.stringify(['agent-test@example.com'])); localStorage.setItem('mocksession', JSON.stringify(se || { user: { id: 'agent-1', email: 'agent-test@example.com' } })); localStorage.setItem('mockdb', JSON.stringify(s)); }, [seed, sess]); };
  const at = p => p.evaluate(() => location.pathname);
  const chrome = p => p.evaluate(() => { const n = document.getElementById('pNav'), u = document.getElementById('pUpRow'), up = document.getElementById('pUp');
    const vis = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none';
    return { nav: vis(n), up: vis(u) ? up.getAttribute('href') : null, current: n ? (Array.from(n.querySelectorAll('a')).find(a => a.getAttribute('aria-current') === 'page') || {}).textContent || null : null }; });
  const open = async (p, addr, ms) => { await p.goto(PB + addr); await wait(p, ms || 700); };

  // ── 1. Not signed in: the portal asks for a sign-in, remembers the page, and the sign-in link brings Tim back to it ──
  process.stderr.write('step 1\n');
  let A = await mk(390, 'light'), p = A.p;
  await p.goto(PB + 'properties/P1'); await p.evaluate(() => localStorage.clear()); await p.goto(PB + 'properties/P1'); await wait(p);
  out.loginH1 = await p.textContent('h1'); let c = await chrome(p);
  expect(out.loginH1 === 'Your portal' && !c.nav && !c.up, 'signed out: the sign-in page, no menu: ' + out.loginH1 + JSON.stringify(c));
  expect(!(await p.isVisible('#journeyBtn')), 'no journey button in the portal');
  await p.fill('#loginEmail', 'agent-test@example.com'); await p.click('#loginBtn'); await wait(p, 300);
  out.otp = await p.evaluate(() => JSON.parse(localStorage.getItem('otpLog') || '[]').pop());
  expect(out.otp && out.otp.options && out.otp.options.emailRedirectTo === PB, 'the sign-in link comes back to the portal front door: ' + JSON.stringify(out.otp));
  expect(JSON.parse(await p.evaluate(() => localStorage.getItem('portalReturn'))).p === 'properties/P1', 'the page asked for is remembered');
  await p.evaluate(s => { localStorage.setItem('mockAgents', JSON.stringify(['agent-test@example.com'])); localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'agent-1', email: 'agent-test@example.com' } })); localStorage.setItem('mockdb', JSON.stringify(s)); }, seed);
  await p.goto(PB); await wait(p, 800);   // the sign-in link opens the front door
  out.afterLink = await at(p);
  expect(out.afterLink === '/portal/properties/P1' && (await p.textContent('#stepName')) === 'Property file', 'after the sign-in link: back on the page asked for: ' + out.afterLink);
  expect(!(await p.evaluate(() => localStorage.getItem('portalReturn'))), 'and the remembered page is used once');
  c = await chrome(p); expect(c.nav && c.current === 'Properties' && c.up === '/portal/properties', 'menu shown, Properties current, up to Properties: ' + JSON.stringify(c));
  expect(!(await p.isVisible('#agentNav')) && !(await p.isVisible('#pfBack')), 'the old Home and Dashboard buttons and the old Dashboard button on the page are gone');
  await A.ctx.close();

  // ── 2. Every address opens its page directly ──
  process.stderr.write('step 2\n');
  A = await mk(390, 'light'); p = A.p; await signIn(p, PB);
  const T = {
    '': async () => (await p.$('#pHome')) && /Write their updated plan/.test(await p.textContent('#pNeeds')),
    'properties': async () => (await p.textContent('h1')) === 'Properties' && !!(await p.$('tr[data-prop="P1"]')) && !(await p.$('#d-needs')),
    'properties/P1': async () => (await p.textContent('#stepName')) === 'Property file' && /12 Pine Hill Road/.test(await p.textContent('main')),
    'properties/P1/offers': async () => !!(await p.$('#offTile')),
    'properties/P1/documents': async () => !!(await p.$('#repo')),
    'properties/P1/records': async () => !!(await p.$('#crTile')),
    'properties/P1/agreement/A1': async () => (await p.textContent('#stepName')) === 'Agreement' && /MRE-2026-1001/.test(await p.textContent('main')),
    'properties/P2/agreement/A2/edit': async () => !!(await p.$('.ttab.on[data-tp="0"]')) && (await p.inputValue('#tAddr')) === '3 Early Street, Dunedin',
    'properties/P2/agreement/A2/edit/2': async () => !!(await p.$('.ttab.on[data-tp="1"]')),
    'properties/P2/agreement/new': async () => !!(await p.$('.ttabs')) && (await p.inputValue('#tAddr')) === '3 Early Street, Dunedin',
    'properties/P2/appraisal/L1': async () => (await p.inputValue('#plAddr')) === '3 Early Street, Dunedin',
    'properties/P2/appraisal/new': async () => (await p.inputValue('#plAddr')) === '3 Early Street, Dunedin' && (await p.inputValue('#plCName')) === 'Sam Seller',
    'properties/P1/inspection/I1': async () => !!(await p.$('.insp')) && !!(await p.$('.insp-tab.on[data-isecn="0"]')),
    'properties/P1/inspection/I1/3': async () => !!(await p.$('.insp-tab.on[data-isecn="2"]')),
    'properties/P1/aml/AP1': async () => (await p.textContent('#stepName')) === 'AML file',
    'properties/P1/variations/V1': async () => (await p.textContent('#stepName')) === 'Vary or extend',
    'properties/P1/forms/F1': async () => (await p.textContent('#stepName')) === 'Document',
    'properties/P1/offers/O1': async () => !!(await p.$('#ofView')),
    'properties/P1/offers/O1/correct': async () => (await p.textContent('#stepName')) === 'Correct an offer',
    'properties/P1/offers/new': async () => (await p.textContent('#stepName')) === 'Offer for a buyer',
    'properties/P1/offers/clauses': async () => !!(await p.$('#drLib')),
    'properties/P1/offers/blank/B1': async () => (await p.textContent('#stepName')) === 'Places on the blank',
    'properties/P1/offers/O1/draft/D1': async () => (await p.textContent('#stepName')) === 'Draft agreement' && !!(await p.$('#drReview')),
    'people': async () => !!(await p.$('#pPeople')),
    'processes': async () => (await p.$$('#pProc button.home-tile')).length === 5 && JSON.stringify(await p.$$eval('#pProc .home-tile.soon', l => l.map(x => [x.tagName, x.querySelector('.kick').textContent, x.querySelector('.ttl').textContent]))) === JSON.stringify([['DIV', 'Coming soon', 'Improvements and preparation assessment'], ['DIV', 'Coming soon', 'Desktop analysis']]) && !/appraisal/i.test(await p.$$eval('#pProc .home-tile.soon', l => l.map(x => x.textContent).join(' '))),
    'processes/appraisal': async () => (await p.inputValue('#plAddr')) === '',
    'processes/agreement': async () => !!(await p.$('.ttabs')) && (await p.inputValue('#tAddr')) === '',
    'processes/inspection': async () => !!(await p.$('#insAddr')),
    'processes/offer': async () => !!(await p.$('[data-pick-new="P1"]')),
    'processes/forms': async () => !!(await p.$('#pForms a[data-plink="properties/P1/forms/F1"]')),
    'processes/assessment': async () => !!(await p.$('#pMissing')) && !(await p.$('#pAssess')),
    'nothing/here': async () => !!(await p.$('#pMissing')),
  };
  // what the menu and up link should be on each: [current menu item, up link] (null: none). In person: no menu and no up link.
  const UP = { '': ['Home', null], 'properties': ['Properties', null], 'properties/P1': ['Properties', 'properties'], 'properties/P1/agreement/A1': ['Properties', 'properties/P1'],
    'properties/P1/offers/O1/correct': ['Properties', 'properties/P1/offers/O1'], 'properties/P1/offers/clauses': ['Properties', 'properties/P1/offers'], 'properties/P1/offers/blank/B1': ['Properties', 'properties/P1/offers'], 'properties/P1/offers/O1/draft/D1': ['Properties', 'properties/P1/offers/O1'], 'processes/inspection': ['Processes', 'processes'],
    'people': ['People', null], 'processes': ['Processes', null], 'properties/P2/agreement/A2/edit': 'inperson', 'properties/P2/agreement/new': 'inperson', 'processes/agreement': 'inperson' };
  out.direct = {};
  for (const [addr, check] of Object.entries(T)) {
    await open(p, addr, addr.includes('inspection') ? 1000 : 800);
    const ok = await check().catch(e => 'threw ' + e.message);
    const s = await side(p); c = await chrome(p);
    out.direct[addr] = { ok, at: await at(p), side: s, nav: c.nav, up: c.up, current: c.current };
    expect(ok === true, `${addr || '(home)'}: opens its page directly (${ok})`);
    expect(!s, `${addr || '(home)'}: no sideways scroll at 390 px`);
    expect(out.direct[addr].at === '/portal/' + addr, `${addr || '(home)'}: the address stays: ${out.direct[addr].at}`);
    const u = UP[addr];
    if (u === 'inperson') expect(!c.nav && !c.up, `${addr}: in person, so no menu and no up link: ${JSON.stringify(c)}`);
    else if (u) expect(c.nav && c.current === u[0] && c.up === (u[1] === null ? null : '/portal/' + u[1]), `${addr || '(home)'}: menu ${u[0]}, up ${u[1]}: ${JSON.stringify(c)}`);
    if (['', 'properties', 'properties/P1', 'people', 'processes', 'properties/P1/inspection/I1'].includes(addr)) await shot(p, 'direct_' + (addr.replace(/\//g, '_') || 'home') + '_390');
  }
  // an address that is the property's agreement, without saying which: the one in force, and the address says so
  await open(p, 'properties/P1/agreement'); out.agreementPick = await at(p);
  expect(out.agreementPick === '/portal/properties/P1/agreement/A1' && (await p.textContent('#stepName')) === 'Agreement', 'properties/<id>/agreement opens the agreement in force: ' + out.agreementPick);
  // People: the names already on property files, each with its property, linking to it, and a short note
  await open(p, 'people');
  out.people = await p.$$eval('#pPeopleList li', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  expect(out.people.length === 3 && out.people.some(x => /Carol Contact.*Contact.*3 Early Street/.test(x)) && out.people.some(x => /Vera Vendor.*goes by Vee.*12 Pine Hill Road/.test(x)), 'People lists everyone with their property: ' + JSON.stringify(out.people));
  expect(/full people database is coming/.test(await p.textContent('#pPeople')), 'with a note that the full database is coming');
  await p.fill('#pPeopleQ', 'early'); await wait(p, 200);
  out.peopleFound = await p.$$eval('#pPeopleList li:not([hidden])', l => l.length);
  expect(out.peopleFound === 2, 'search narrows the list: ' + out.peopleFound);
  answer = false; asked = [];
  await p.click('#pPeopleList a[data-plink="properties/P2"] >> nth=0'); await wait(p, 700);
  expect(!asked.length && (await at(p)) === '/portal/properties/P2', 'searching is not unsaved work; the link opens the property: ' + asked.length);
  answer = true;
  // the Needs you list on Home opens its page with its address
  await open(p, ''); await p.click('[data-need]'); await wait(p, 800);
  out.needOpened = await at(p);
  expect(/^\/portal\/properties\/P[12]\/(appraisal|inspection|forms|agreement)\//.test(out.needOpened), 'a Needs you item opens its page with its address: ' + out.needOpened);
  await A.ctx.close();

  // ── 3. The menu, links, back and forward ──
  process.stderr.write('step 3\n');
  A = await mk(390, 'light'); p = A.p; await signIn(p, PB); await open(p, '');
  const menu = async t => { await p.click(`#pNav a:has-text("${t}")`); await wait(p, 700); };
  await menu('Properties'); out.m1 = [await at(p), (await chrome(p)).current];
  await p.click('tr[data-prop="P1"]'); await wait(p, 700); out.m2 = [await at(p), (await chrome(p)).up];
  await p.click('[data-agopen]'); await wait(p, 700); out.m3 = await at(p);
  await p.click('#pUp'); await wait(p, 700); out.m4 = await at(p);
  await menu('People'); out.m5 = await at(p);
  await menu('Processes'); out.m6 = await at(p);
  await p.click('#soonPrep'); await wait(p, 400); await p.click('#soonDesk'); await wait(p, 400);
  out.soonStays = await at(p); expect(out.soonStays === '/portal/processes', 'the Coming soon tiles do nothing when tapped: ' + out.soonStays);
  await p.click('#homeBegin'); await wait(p, 700); out.m7 = [await at(p), (await chrome(p)).up];
  await menu('Home'); out.m8 = await at(p);
  expect(out.m1[0] === '/portal/properties' && out.m1[1] === 'Properties', 'menu: Properties ' + out.m1);
  expect(out.m2[0] === '/portal/properties/P1' && out.m2[1] === '/portal/properties', 'a property row: its address, up to Properties ' + out.m2);
  expect(out.m3 === '/portal/properties/P1/agreement/A1', 'Open the agreement: its address ' + out.m3);
  expect(out.m4 === '/portal/properties/P1', 'up link: back to the property ' + out.m4);
  expect(out.m5 === '/portal/people' && out.m6 === '/portal/processes' && out.m7[0] === '/portal/processes/appraisal' && out.m7[1] === '/portal/processes' && out.m8 === '/portal/', 'menu and Processes tiles: ' + [out.m5, out.m6, out.m7, out.m8]);
  // back and forward, each showing the right page
  const back = [];
  for (const want of ['/portal/processes/appraisal', '/portal/processes', '/portal/people', '/portal/properties/P1', '/portal/properties/P1/agreement/A1']) { await p.goBack(); await wait(p, 700); back.push([await at(p), await p.textContent('#stepName')]); expect((await at(p)) === want, 'back to ' + want + ', got ' + (await at(p))); }
  out.back = back;
  expect(back[0][1] === 'Pre-listing' && back[3][1] === 'Property file' && back[4][1] === 'Agreement', 'back shows the right page each time: ' + JSON.stringify(back));
  await p.goForward(); await wait(p, 700); out.fwd = [await at(p), await p.textContent('#stepName')];
  expect(out.fwd[0] === '/portal/properties/P1' && out.fwd[1] === 'Property file', 'forward: ' + out.fwd);
  // the inspection: each section has its own address (it replaces as Tim moves on, so Back leaves the walk-round)
  await open(p, 'properties/P1'); await open(p, 'properties/P1/inspection/I1', 1000);
  await p.click('#next'); await wait(p, 400); out.sec2 = await at(p);
  expect(out.sec2 === '/portal/properties/P1/inspection/I1/2', 'the next section has its own address: ' + out.sec2);
  await p.reload(); await wait(p, 1000); expect(!!(await p.$('.insp-tab.on[data-isecn="1"]')), 'reloading opens the same section');
  c = await chrome(p); const boxes = await p.evaluate(() => { const r = e => e.getBoundingClientRect(); return { nav: r(document.getElementById('pNav')), bar: r(document.getElementById('actions')) }; });
  out.stack = { nav: c.nav, barBottom: Math.round(boxes.bar.bottom), navTop: Math.round(boxes.nav.top) };
  expect(c.nav && boxes.bar.bottom <= boxes.nav.top + 1 && boxes.bar.height > 0, 'the Back and Continue bar sits above the menu, not under it: ' + JSON.stringify(out.stack));
  await shot(p, 'inspection_bar_and_menu_390');
  await p.goBack(); await wait(p, 800); out.leaveWalk = await at(p);
  expect(out.leaveWalk === '/portal/properties/P1', 'back from the walk-round goes to the page before it: ' + out.leaveWalk);
  await A.ctx.close();

  // ── 4. Unsaved work: asked on the menu, a link, back and forward; staying put keeps the page and its address ──
  process.stderr.write('step 4\n');
  A = await mk(390, 'light'); p = A.p; await signIn(p, PB); await open(p, 'properties'); await p.click('tr[data-prop="P3"]'); await wait(p, 700);
  const unsavedMsg = /not saved yet/;
  await p.fill('#pfAddr', '7 Quiet Lane, Dunedin North');
  answer = false; asked = [];
  await p.click('#pNav a:has-text("Home")'); await wait(p, 500);
  expect(asked.length === 1 && unsavedMsg.test(asked[0]) && (await at(p)) === '/portal/properties/P3' && (await p.inputValue('#pfAddr')) === '7 Quiet Lane, Dunedin North', 'menu: asked, and staying keeps what was typed: ' + JSON.stringify(asked));
  asked = []; await p.click('#pUp'); await wait(p, 500);
  expect(asked.length === 1 && (await at(p)) === '/portal/properties/P3', 'up link: asked');
  asked = []; await p.goBack(); await wait(p, 700);
  expect(asked.length === 1 && (await at(p)) === '/portal/properties/P3' && (await p.inputValue('#pfAddr')) === '7 Quiet Lane, Dunedin North', 'back: asked, and staying puts the address back: ' + (await at(p)));
  answer = true; asked = []; await p.click('#pNav a:has-text("Processes")'); await wait(p, 700);
  expect(asked.length === 1 && (await at(p)) === '/portal/processes', 'going anyway: the page changes');
  await p.goBack(); await wait(p, 700); expect((await at(p)) === '/portal/properties/P3', 'and back again');
  await p.fill('#pfAddr', 'x'); answer = false; asked = []; await p.goForward(); await wait(p, 700);
  expect(asked.length === 1 && (await at(p)) === '/portal/properties/P3', 'forward: asked too');
  // leaving the portal's page altogether (a reload): the browser asks too
  answer = false; asked = []; await p.fill('#pfAddr', 'y'); await p.reload().catch(() => null); await wait(p, 500);
  expect(asked.length === 1 && (await p.inputValue('#pfAddr').catch(() => '')) === 'y', 'a reload with unsaved work: the browser asks first: ' + asked.length);
  answer = true;
  await A.ctx.close();

  // ── 5. In person: back, forward and the logo never leave the appointment, a pad vendors sign on, or signing together ──
  process.stderr.write('step 5\n');
  A = await mk(1024, 'dark'); p = A.p; await signIn(p, PB);
  const draw = async sel => { const bx = await (await p.$(sel)).boundingBox(); await p.mouse.move(bx.x + 30, bx.y + 30); await p.mouse.down(); await p.mouse.move(bx.x + 120, bx.y + 60, { steps: 6 }); await p.mouse.up(); await wait(p, 150); };
  const stuck = async (want, what) => {   // Back three times, Forward once, the logo: still on the same page, no menu, nothing asked
    asked = [];
    for (let i = 0; i < 3; i++) { await p.goBack(); await wait(p, 500); expect((await at(p)) === want, `${what}: Back ${i + 1} stays put: ${await at(p)}`); }
    await p.goForward(); await wait(p, 500); expect((await at(p)) === want, `${what}: Forward stays put: ${await at(p)}`);
    await p.click('.brand img.logo-dark'); await wait(p, 500); expect((await at(p)) === want, `${what}: the logo does nothing: ${await at(p)}`);
    c = await chrome(p); expect(!c.nav && !c.up && !asked.length, `${what}: no menu, no up link, no question: ${JSON.stringify(c)} ${asked.length}`);
  };
  // the appointment's signing page, reached the way Tim gets there (Properties, the property, its agreement, the appointment, Signing)
  await open(p, 'properties'); await p.click('tr[data-prop="P2"]'); await wait(p, 700); await p.click('[data-agopen]'); await wait(p, 700);
  await p.click('#editAg'); await wait(p, 700); await p.click('.ttab[data-tp="2"]'); await wait(p, 700);
  out.signAt = await at(p);
  expect(out.signAt === '/portal/properties/P2/agreement/A2/edit/3', 'the signing page has its address: ' + out.signAt);
  await stuck('/portal/properties/P2/agreement/A2/edit/3', 'appointment signing page');
  expect(!!(await p.$('.ttab.on[data-tp="2"]')), 'still on the signing page');
  await shot(p, 'inperson_signing_1024_dark');
  // every live appointment page has a visible way out to the agreement
  out.exits = [];
  for (const [tp, sel, txt] of [[0, '#back', 'Save and close'], [1, '#tSaveClose', 'Save and close'], [2, '#next', 'Save and close']]) {
    await p.click(`.ttab[data-tp="${tp}"]`); await wait(p, 600);
    const ok = (await p.isVisible(sel)) && (await p.textContent(sel)).trim() === txt; out.exits.push([tp + 1, sel, ok]);
    expect(ok, `appointment page ${tp + 1}: "${txt}" is visible (${sel})`);
  }
  await p.click('.ttab[data-tp="1"]'); await wait(p, 600); await p.click('#tSaveClose'); await wait(p, 800);
  out.savedClose = await at(p); c = await chrome(p);
  expect(out.savedClose === '/portal/properties/P2/agreement/A2' && c.nav, 'Save and close on page 2 goes to the agreement, menu back: ' + out.savedClose);
  // read-only review of a signed agreement: not in person, so the menu and up link show
  await open(p, 'properties/P1/agreement/A1/edit'); c = await chrome(p);
  expect(!!(await p.$('.ttabs')) && c.nav && c.up === '/portal/properties/P1/agreement/A1', 'review only (signed): menu, and up to the agreement: ' + JSON.stringify(c));
  // a new agreement: once saved its address is its own; Back, Forward and a reload never make a second draft or property file
  const count = async () => { const d = await db(p); return [d.agreements.length, d.properties.length]; };
  await open(p, 'processes'); await p.click('#homeAgree'); await wait(p, 700);
  expect((await at(p)) === '/portal/processes/agreement', 'Let\'s agree from Processes');
  const before = await count();
  await p.fill('#tAddr', '21 Fresh Street, Dunedin');
  await p.click('.ttab[data-tp="1"]'); await wait(p, 900);
  const made = await count(); const nid = (await db(p)).agreements.find(a => a.address === '21 Fresh Street, Dunedin');
  out.newAt = await at(p);
  expect(nid && made[0] === before[0] + 1 && made[1] === before[1] + 1 && out.newAt === `/portal/properties/${nid.property_id}/agreement/${nid.id}/edit/2`, 'saved once: one agreement and one property file, and the address is its own: ' + out.newAt + ' ' + JSON.stringify([before, made]));
  await p.goBack(); await wait(p, 700); await p.goForward(); await wait(p, 700); await p.goBack(); await wait(p, 700);
  expect(JSON.stringify(await count()) === JSON.stringify(made) && (await at(p)) === out.newAt, 'after Back, Forward, Back: no second draft: ' + JSON.stringify(await count()) + ' ' + (await at(p)));
  await p.reload(); await wait(p, 900);
  expect(JSON.stringify(await count()) === JSON.stringify(made) && (await at(p)) === out.newAt && !!(await p.$('.ttab.on[data-tp="1"]')), 'reload: the same agreement page, no second draft: ' + JSON.stringify(await count()));
  // a new agreement with nothing saved: Leave without saving
  await open(p, 'processes'); await p.click('#homeAgree'); await wait(p, 700); await p.fill('#tAddr', '99 Never Saved Road');
  answer = true; asked = []; await p.click('#tLeave'); await wait(p, 700);
  expect(asked.length === 1 && (await at(p)) === '/portal/processes' && JSON.stringify(await count()) === JSON.stringify(made), 'Leave without saving: asked, back at Processes, nothing made: ' + (await at(p)));
  // Tim's own countersigning pad: not in person (menu shown), but a drawn, unsaved signature is never dropped without asking
  const seed2 = JSON.parse(JSON.stringify(seed)); seed2.property_forms = [{ id: 'F2', agreement_id: 'A1', property_id: 'P1', kind: 'vendor_declaration', status: 'signed', signed_at: now, countersigned_at: null, data: { answers: {} }, agent_data: {}, created_at: now, updated_at: now }];
  seed2.form_signatures = [{ id: 'FS1', form_id: 'F2', person_id: 'AP1', signed_at: now, image: '' }];
  await p.evaluate(s => localStorage.setItem('mockdb', JSON.stringify(s)), seed2);
  await open(p, 'properties/P1'); await p.click('[data-fopen="F2"]').catch(() => null); await wait(p, 800);
  if ((await at(p)) !== '/portal/properties/P1/forms/F2') await open(p, 'properties/P1/forms/F2', 900);
  out.counterPad = !!(await p.$('#fSigA')); c = await chrome(p);
  expect(out.counterPad && c.nav && c.up === '/portal/properties/P1', 'countersigning: Tim\'s own pad, the menu and up link stay: ' + JSON.stringify(c));
  answer = true; asked = []; await p.goBack(); await wait(p, 700); await p.goForward(); await wait(p, 800);
  expect(!asked.length && (await at(p)) === '/portal/properties/P1/forms/F2', 'nothing drawn: Back and Forward move freely');
  await draw('#fSigA'); expect(!!(await p.$('#main .sig-wrap .unsaved')), 'the drawn signature is marked not saved');
  answer = false; asked = [];
  await p.goBack(); await wait(p, 600);
  expect(asked.length === 1 && /signature/.test(asked[0]) && (await at(p)) === '/portal/properties/P1/forms/F2' && !!(await p.$('#main .sig-wrap .unsaved')), 'Back with an unsaved signature: asked, and staying keeps it: ' + JSON.stringify(asked));
  asked = []; await p.click('#pNav a:has-text("Home")'); await wait(p, 500);
  expect(asked.length === 1 && (await at(p)) === '/portal/properties/P1/forms/F2', 'the menu with an unsaved signature: asked');
  asked = []; await p.click('#pUp'); await wait(p, 500);
  expect(asked.length === 1 && (await at(p)) === '/portal/properties/P1/forms/F2', 'the up link with an unsaved signature: asked');
  answer = true;
  await open(p, 'properties'); c = await chrome(p);
  expect(c.nav && c.current === 'Properties' && !(await side(p, 1024)), 'the menu on the next page; no sideways scroll at 1024 px dark');
  await shot(p, 'properties_1024_dark');
  // signing a variation together on this device: Back and Forward stay put, and a drawn signature stays
  await p.evaluate(s => localStorage.setItem('mockdb', JSON.stringify(s)), seed);
  await open(p, 'properties/P1/variations/V1/together'); out.draftTogether = await at(p);
  expect(out.draftTogether === '/portal/properties/P1/agreement/A1', 'a draft variation is not signed together: the agreement opens, and the address says so: ' + out.draftTogether);
  const seed3 = JSON.parse(JSON.stringify(seed)); Object.assign(seed3.agreement_variations[0], { status: 'sent', summary: [], sent_at: now });
  await p.evaluate(s => localStorage.setItem('mockdb', JSON.stringify(s)), seed3);
  await open(p, 'properties/P1/agreement/A1'); await p.click('[data-vtogether="V1"]'); await wait(p, 800);
  out.together = [await at(p), await p.textContent('h1')];
  expect(out.together[0] === '/portal/properties/P1/variations/V1/together', 'signing together has its address: ' + out.together[0]);
  await draw('#main canvas[data-vcv]');
  await stuck('/portal/properties/P1/variations/V1/together', 'signing a variation together');
  expect(!!(await p.$('#main .sig-wrap .unsaved')), 'signing together: the drawn signature is still there');
  await A.ctx.close();

  // ── 6. Dark mode at 390 px, and the root of portal.dunnerstunner.co.nz (the same shell, base /) ──
  process.stderr.write('step 6\n');
  A = await mk(390, 'dark'); p = A.p; await signIn(p, PR);
  for (const addr of ['', 'properties/P1', 'people', 'processes']) {
    await p.goto(PR + addr); await wait(p, 800);
    const where = await at(p); c = await chrome(p);
    expect(where === '/' + addr && c.nav && !(await side(p)), `root ${addr || '(home)'}: opens, menu shown, no sideways scroll: ${where} ${JSON.stringify(c)}`);
  }
  await p.goto(PR + 'properties/P1'); await wait(p, 800);
  out.rootLinks = await p.$$eval('#pNav a', l => l.map(a => a.getAttribute('href')));
  c = await chrome(p);
  expect(JSON.stringify(out.rootLinks) === JSON.stringify(['/', '/properties', '/people', '/processes']) && c.up === '/properties', 'at the root the menu and up link have no /portal/: ' + JSON.stringify(out.rootLinks) + ' ' + c.up);
  await p.click('#pNav a:has-text("Processes")'); await wait(p, 600); expect((await at(p)) === '/processes', 'root: the menu moves to /processes');
  await shot(p, 'root_processes_390_dark');
  await p.evaluate(() => localStorage.removeItem('mocksession')); await p.goto(PR + 'people'); await wait(p, 600);
  await p.fill('#loginEmail', 'agent-test@example.com'); await p.click('#loginBtn'); await wait(p, 300);
  out.rootOtp = await p.evaluate(() => JSON.parse(localStorage.getItem('otpLog') || '[]').pop());
  expect(out.rootOtp.options.emailRedirectTo === PR, 'root: the sign-in link comes back to portal.dunnerstunner.co.nz: ' + out.rootOtp.options.emailRedirectTo);
  await A.ctx.close();

  // ── 7. Links for vendors and buyers still point at the onboarding app; a vendor at the portal; other missing addresses ──
  process.stderr.write('step 7\n');
  A = await mk(390, 'light'); p = A.p; await signIn(p, PB); await open(p, 'properties/P1/offers');
  await p.click('#offOn'); await wait(p, 600);
  out.offerUrl = (await p.textContent('#offUrl')).trim();
  const tok = (await db(p)).offer_links[0].token;
  expect(out.offerUrl === PK + '/onboarding/?offer=' + tok, 'the offer link made in the portal is the onboarding app\'s: ' + out.offerUrl);
  await p.goto(PB + '?offer=' + tok); await wait(p, 800); out.offerRedirect = p.url();
  expect(out.offerRedirect === PK + '/onboarding/?offer=' + tok, 'an offer link opened at the portal goes to the onboarding app: ' + out.offerRedirect);
  await A.ctx.close();
  A = await mk(390, 'light'); p = A.p; await signIn(p, PB, { user: { id: 'v-1', email: 'vendor@example.com' } }); await open(p, 'properties/P1');
  c = await chrome(p); out.vendorH1 = await p.textContent('h1');
  expect(out.vendorH1 === 'This page is for Tim' && !c.nav && !c.up && !/12 Pine Hill Road/.test(await p.textContent('main')), 'a vendor signed in at the portal sees only where their own page is: ' + out.vendorH1);
  await p.goto(PK + '/nothing-here'); await wait(p, 500);
  out.missing = [await p.textContent('h1'), await p.evaluate(() => !!window.MRE_PORTAL), !!(await p.$('#main'))];
  expect(out.missing[0] === 'Page not found' && !out.missing[1] && !out.missing[2], 'any other missing address: "Page not found", no portal: ' + JSON.stringify(out.missing));
  out.titles = { raw404: (/<title>([^<]*)<\/title>/.exec(notFound) || [])[1], missingPage: await p.title() };
  await open(p, 'people'); out.titles.portal = await p.title();
  expect(out.titles.raw404 === 'Page not found' && out.titles.missingPage === 'Page not found' && out.titles.portal === 'Portal · McGuire Real Estate', 'titles: the raw page says "Page not found"; only the portal says Portal: ' + JSON.stringify(out.titles));
  await A.ctx.close();
  // the portal's script can't load: a plain message, not a blank page
  A = await mk(390, 'light'); p = A.p; await A.ctx.route(PK + '/onboarding/portal.js', r => r.fulfill({ status: 404, body: '' }));
  const keepErrs = errs.length; await p.goto(PB + 'properties/P1'); await wait(p, 800);
  out.loadFail = await p.textContent('#shellFail').catch(() => null);
  expect(/The portal could not load\. Check your connection and try again\./.test(out.loadFail || ''), 'portal.js missing: a plain message: ' + out.loadFail);
  errs.splice(keepErrs);   // the failed load itself is expected here
  await A.ctx.close();

  // ── 8. The onboarding app (not the portal) behaves exactly as before ──
  process.stderr.write('step 8\n');
  A = await mk(390, 'light'); p = A.p; await signIn(p, PK + '/onboarding/'); await p.goto(PK + '/onboarding/'); await wait(p, 700);
  out.onb = { h1: await p.textContent('h1'), nav: await p.isVisible('#agentNav'), pnav: !!(await p.$('#pNav')), up: !!(await p.$('#pUpRow')), portal: await p.evaluate(() => document.body.classList.contains('portal')) };
  await p.click('#navDash'); await wait(p, 500); await p.click('tr[data-prop="P1"]'); await wait(p, 600);
  out.onb.at = await at(p); out.onb.pfBack = await p.isVisible('#pfBack'); out.onb.dashNeeds = null;
  await p.click('#pfBack'); await wait(p, 500); out.onb.dashNeeds = !!(await p.$('#d-needs'));
  expect(/^(Morning|Afternoon|Evening), Tim$/.test(out.onb.h1) && out.onb.nav && !out.onb.pnav && !out.onb.up && !out.onb.portal, 'onboarding: the old Home, top-bar menu and no portal parts: ' + JSON.stringify(out.onb));
  expect(out.onb.at === '/onboarding/' && out.onb.pfBack && out.onb.dashNeeds, 'onboarding: no addresses change, the Dashboard button and the Needs you list are there: ' + JSON.stringify(out.onb));
  await p.goto(PK + '/onboarding/#journey'); await wait(p, 800);
  out.onbJourney = [await p.textContent('#pTitle').catch(() => null), await p.title(), await p.isVisible('#pTitle').catch(() => false)];
  expect(out.onbJourney[0] === 'Your selling journey' && out.onbJourney[1] === 'Your selling journey · McGuire Real Estate' && out.onbJourney[2], 'onboarding: #journey opens the journey page itself: ' + JSON.stringify(out.onbJourney));
  await A.ctx.close();

  // ── 9. Addresses hold database ids only ──
  out.seen = Array.from(seen);
  const bad = out.seen.filter(u => !/^\/[A-Za-z0-9_\/-]*$/.test(u) || NAMES.some(n => u.toLowerCase().includes(n.toLowerCase().replace(/\s+/g, '')) || u.toLowerCase().includes(n.toLowerCase().split(' ')[0])) || /@|%40/.test(u) || u.replace(/\D/g, ' ').split(' ').some(d => d.length >= 9));   // a phone number would be 9 or more digits in a row
  expect(out.seen.length > 20 && !bad.length, 'every address is ids and words only: ' + JSON.stringify(bad));

  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1)); await b.close();
})().catch(e => { errs.push('crashed: ' + (e && e.stack || e)); console.log(JSON.stringify(Object.assign(out, { errs }), null, 1)); process.exit(1); });

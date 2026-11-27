// Appraisal views (migration 032), against the mock database, with invented sample data only. Covers: the Appraisals list and the
// Home shortcut; one appraisal page drawing every kind of section (headings, lede, lists, tables, the options ranges, the recommended
// method, the buyer-wave graph and the ways-to-sell table); editing each range, the bedrooms and the recommended method, saving (the
// result under the Save button), the page updating and the edit kept after a reload; refusing a low above a high, and "as is" or a fee
// in what Tim types; presentation mode with no editing controls, no menu and larger type; no "as is" and no fee or commission
// anywhere on the page; no sideways scroll at 390 px in light and dark; print hiding the top bar; and a vendor never seeing it.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const bundle = fs.readFileSync(path.join(__dirname, '..', 'portal.js'), 'utf8');
const shell = fs.readFileSync(path.join(ROOT, 'portal', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(ROOT, 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const PK = 'https://packages.dunnerstunner.co.nz', PB = PK + '/portal/';
const out = {}; const errs = [];
const now = new Date().toISOString();
// an invented appraisal: every section type, nothing from any real property
const SAMPLE = {
  id: 'AV1', property_id: null, title: '7 Sample Street, Testville: Market Appraisal', address: '7 Sample Street, Testville', prepared_for: 'Pat Sample', status: 'draft', created_at: now, updated_at: now,
  fields: { ranges: [{ key: 'A', option: 'A. Sell in its current condition', involves: 'A tidy, then to market', low: 400000, high: 450000 }, { key: 'B', option: 'B. Light preparation first', involves: 'Small repairs and staging', low: 430000, high: 480000 }],
    bedrooms: '2 or 3 bedrooms (to confirm on site)', method: { name: 'Deadline sale', text: 'I\'d recommend a deadline sale that closes after the second open home.' } },
  sections: [
    { type: 'byline', text: 'Prepared for Pat Sample' },
    { type: 'para', cls: 'lede', text: 'My view: in its current condition the home sits at about **{{range:A}}**.' },
    { type: 'heading', text: 'What I heard' },
    { type: 'list', items: ['**Plans:** moving somewhere bigger.', '**Timing:** after summer.'] },
    { type: 'heading', text: 'Your property on record' },
    { type: 'table', head: ['Item', 'Record'], rows: [['Home', 'Sample weatherboard, 100 m²'], ['Rooms', '{{bedrooms}}, 1 bathroom']] },
    { type: 'heading', text: 'Comparable sales' },
    { type: 'table', head: ['Address', 'Sold', 'Price', 'Home', 'Compared with yours'], rows: [['1 Example Road', 'Jan 2026', '$410,000', '3 bed, 1 bath, 110 m² on 600 m², a long description so the cell must wrap neatly on a phone without pushing the page sideways', 'Similar size'], ['9 Example Road', 'Feb 2026', '$455,000', '3 bed', 'Renovated']] },
    { type: 'note', text: 'Sample figures, invented for this test. More at https://example.com/sample-source' },
    { type: 'heading', text: 'My appraisal' },
    { type: 'ranges', head: ['Option', 'What it involves', 'Where I\'d expect buyers to land'] },
    { type: 'heading', text: 'How I would sell it' },
    { type: 'method' },
    { type: 'wave', title: 'Most buyers come early', subtitle: '{{early}}% of interested buyers visit by week 3', bars: [{ label: 'Week 1', pct: 40 }, { label: 'Week 2', pct: 20 }, { label: 'Week 3', pct: 10 }, { label: 'Week 4', pct: 5 }], marker: 3, markerLabel: 'Offers close after the 3rd open home', trickle: 'then a trickle', tail: 'Week 5 on', caption: 'A sample caption.' },
    { type: 'methods', head: ['Method', 'How it works', 'Worth knowing'], rows: [['Deadline sale', 'Offers by a date', 'Urgency'], ['Negotiation, with or without an asking price', 'Offers any time', 'Flexible'], ['Tender', 'Sealed offers', 'Private'], ['Auction', 'Bidding on the day', 'Final']] },
    { type: 'heading', text: 'Next steps' },
    { type: 'list', ordered: true, items: ['We walk through.', 'I firm up the figures.'] },
  ],
};
(async () => {
  const b = await chromium.launch();
  const expect = (c, m) => { if (!c) errs.push(m); };
  const mk = async (w, scheme) => {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, colorScheme: scheme, hasTouch: w < 500, isMobile: w < 500 }); ctx.setDefaultTimeout(8000);
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
    await ctx.route('https://cdn.jsdelivr.net/npm/pdf*/**', r => r.fulfill({ status: 404, body: '' }));
    await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    await ctx.route(PK + '/**', r => r.fulfill({ status: 404, contentType: 'text/html', body: shell }));
    await ctx.route(PK + '/portal**', r => r.fulfill({ status: 200, contentType: 'text/html', body: shell }));
    await ctx.route(PK + '/onboarding/portal.js', r => r.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: bundle }));
    await ctx.route(PK + '/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push('page: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|permission denied for table appraisal_views/.test(m.text())) errs.push('console: ' + m.text()); });
    p.on('dialog', d => d.accept());
    return { ctx, p };
  };
  const side = p => p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth);
  const wait = (p, ms) => p.waitForTimeout(ms || 600);
  const seed = { properties: [], property_people: [], agreements: [], prelistings: [], appraisal_views: [SAMPLE] };
  const signIn = async (p, email) => { await p.goto(PB); await p.evaluate(([s, e]) => { localStorage.clear(); localStorage.setItem('mockAgents', JSON.stringify(['agent-test@example.com'])); localStorage.setItem('mocksession', JSON.stringify({ user: { id: e === 'agent-test@example.com' ? 'agent-1' : 'v-1', email: e } })); localStorage.setItem('mockdb', JSON.stringify(s)); }, [seed, email]); };
  const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb')).appraisal_views[0]);
  const docText = p => p.evaluate(() => document.querySelector('#main').innerText);
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'out', `appraisal_${n}.png`), fullPage: true });
  const banned = t => /\bas[\s-]+is\b/i.test(t) || /\bfees?\b/i.test(t) || /\bcommissions?\b/i.test(t);

  // ── 1. Home shortcut and the list ──
  let A = await mk(390, 'light'), p = A.p;
  await signIn(p, 'agent-test@example.com'); await p.goto(PB); await wait(p);
  out.homeLink = await p.$$eval('#pHome a[data-plink="appraisals"]', a => a.length);
  expect(out.homeLink === 1, 'Home has an Appraisals shortcut');
  // the Appraisals tile in the portal menu, beside Home, Properties, People and Processes, all fitting at 390 px
  out.tile = await p.evaluate(() => { const n = document.getElementById('pNav'), as = Array.from(n.querySelectorAll('a'));
    return { names: as.map(a => a.textContent).join('|'), fit: as.every(a => a.scrollWidth <= a.clientWidth + 1 && a.getBoundingClientRect().right <= innerWidth + 0.5), shown: !n.hidden }; });
  expect(out.tile.shown && out.tile.names === 'Home|Properties|People|Processes|Appraisals' && out.tile.fit, 'Appraisals tile in the menu, all five fit: ' + JSON.stringify(out.tile));
  expect(!(await side(p)), 'Home with five menu tiles: no sideways scroll at 390');
  await p.click('#pNav a[data-plink="appraisals"]'); await wait(p);
  out.tileHere = await p.evaluate(() => [location.pathname, document.querySelector('#pNav a[data-plink="appraisals"]').getAttribute('aria-current')]);
  expect(out.tileHere[0] === '/portal/appraisals' && out.tileHere[1] === 'page', 'the tile opens the list and shows as current: ' + out.tileHere);
  await p.goto(PB); await wait(p);
  await p.click('#pHome a[data-plink="appraisals"]'); await wait(p);
  out.listPath = await p.evaluate(() => location.pathname); out.listH1 = await p.textContent('h1');
  expect(out.listPath === '/portal/appraisals' && out.listH1 === 'Appraisals', 'the list opens: ' + out.listPath + ' ' + out.listH1);
  expect(await p.$('#apvList a[data-plink="appraisals/AV1"]') && await p.$('#apvList a[data-plink="appraisals/AV1/present"]'), 'the list links to the appraisal and its presentation');

  // ── 2. The appraisal page draws every section ──
  await p.click('#apvList a[data-plink="appraisals/AV1"]'); await wait(p);
  out.path = await p.evaluate(() => location.pathname);
  expect(out.path === '/portal/appraisals/AV1', 'appraisal address: ' + out.path);
  const s = await p.evaluate(() => { const d = document.querySelector('#apvDoc'); return {
    h1: d.querySelector('h1').textContent, h2: Array.from(d.querySelectorAll('h2')).map(x => x.textContent), lede: d.querySelector('.apv-lede').textContent,
    tables: d.querySelectorAll('table.apv-tbl').length, ranges: Array.from(d.querySelectorAll('.apv-ranges tbody tr')).map(r => r.lastElementChild.textContent),
    method: d.querySelector('.apv-method').textContent, bars: d.querySelectorAll('.apv-wbar').length, wsub: d.querySelector('.apv-wave figcaption span').textContent,
    rec: Array.from(d.querySelectorAll('.apv-methods tr.apv-rec')).map(r => r.firstElementChild.textContent), ol: d.querySelectorAll('ol.apv-list li').length,
    rooms: d.querySelector('[data-f="bedrooms"]').textContent, link: !!d.querySelector('a[href="https://example.com/sample-source"]'), bold: d.querySelectorAll('strong').length }; });
  out.sections = s;
  expect(s.h1 === SAMPLE.title, 'title'); expect(s.h2.join('|') === 'What I heard|Your property on record|Comparable sales|My appraisal|How I would sell it|Next steps', 'headings: ' + s.h2.join('|'));
  expect(s.lede.includes('$400,000 to $450,000'), 'lede fills its range: ' + s.lede);
  expect(s.tables === 4, 'four tables: ' + s.tables); expect(s.ranges.join('|') === '$400,000 to $450,000|$430,000 to $480,000', 'ranges: ' + s.ranges);
  expect(s.method === SAMPLE.fields.method.text, 'method sentence'); expect(s.bars === 4 && s.wsub === '70% of interested buyers visit by week 3', 'wave: ' + s.bars + ' ' + s.wsub);
  expect(s.rec.length === 1 && /^Recommended Deadline sale/.test(s.rec[0]), 'recommended method marked: ' + s.rec); expect(s.ol === 2, 'ordered list');
  expect(s.rooms === '2 or 3 bedrooms (to confirm on site)' && s.link && s.bold >= 3, 'bedrooms, link and bold');
  expect(await p.$('#apvEdit') && await p.$('#apvSave'), 'editing controls in the edit view');
  expect(!banned(await docText(p)), 'no "as is", fee or commission on the page');
  expect(!(await side(p)), 'edit view: no sideways scroll at 390 light'); await shot(p, 'edit_390_light');

  // ── 3. Edits save and show ──
  await p.fill('#apvLo0', '410,000'); await p.fill('#apvHi0', '$465000'); await p.fill('#apvBeds', '3 bedrooms'); await p.selectOption('#apvMethod', 'Tender');
  await p.fill('#apvMethodText', 'I\'d recommend a tender closing after the third open home.');
  await p.click('#apvSave'); await wait(p);
  out.saveNote = await p.evaluate(() => { const n = document.getElementById('bn-apvSave'); return n && !n.hidden ? n.textContent + '|' + n.dataset.kind : null; });
  expect(out.saveNote && /^Saved/.test(out.saveNote) && /\|ok$/.test(out.saveNote), 'save note under the button: ' + out.saveNote);
  let r = await db(p);
  expect(r.fields.ranges[0].low === 410000 && r.fields.ranges[0].high === 465000 && r.fields.bedrooms === '3 bedrooms' && r.fields.method.name === 'Tender', 'saved to the database: ' + JSON.stringify(r.fields));
  expect(r.fields.ranges[1].low === 430000 && r.fields.ranges[1].high === 480000, 'the other range is unchanged');
  const upd = await p.evaluate(() => ({ lede: document.querySelector('.apv-lede').textContent, rooms: document.querySelector('[data-f="bedrooms"]').textContent, rec: Array.from(document.querySelectorAll('.apv-methods tr.apv-rec')).map(r => r.firstElementChild.textContent), m: document.querySelector('.apv-method').textContent }));
  expect(upd.lede.includes('$410,000 to $465,000') && upd.rooms === '3 bedrooms' && upd.rec.length === 1 && /Tender/.test(upd.rec[0]) && /tender/.test(upd.m), 'the page shows the edits: ' + JSON.stringify(upd));
  await p.reload(); await wait(p, 900);
  expect((await p.textContent('.apv-lede')).includes('$410,000 to $465,000') && await p.inputValue('#apvBeds') === '3 bedrooms', 'the edits are kept after a reload');

  // ── 4. Refused: a low above its high, "as is", a fee ──
  await p.fill('#apvLo1', '500000'); await p.click('#apvSave'); await wait(p, 300);
  out.badRange = await p.evaluate(() => { const n = document.getElementById('bn-apvSave'); return n ? n.textContent + '|' + n.dataset.kind : null; });
  expect(/low figure must be below/.test(out.badRange || '') && /\|err$/.test(out.badRange), 'low above high refused: ' + out.badRange);
  await p.fill('#apvLo1', '430000'); await p.fill('#apvBeds', '3 bedrooms, sold as is'); await p.click('#apvSave'); await wait(p, 300);
  out.asIs = await p.textContent('#bn-apvSave'); expect(/current condition/.test(out.asIs), '"as is" refused: ' + out.asIs);
  await p.fill('#apvBeds', '3 bedrooms'); await p.fill('#apvMethodText', 'Tender, and my fee is low'); await p.click('#apvSave'); await wait(p, 300);
  out.fee = await p.textContent('#bn-apvSave'); expect(/never shown/.test(out.fee), 'a fee refused: ' + out.fee);
  r = await db(p); expect(r.fields.ranges[1].low === 430000 && r.fields.bedrooms === '3 bedrooms' && !/fee/.test(r.fields.method.text), 'nothing refused was saved');
  await p.fill('#apvMethodText', 'I\'d recommend a tender closing after the third open home.'); await p.click('#apvSave'); await wait(p);   // back to saved, so leaving asks nothing

  // ── 5. Presentation mode ──
  await p.click('#apvTools a[data-plink="appraisals/AV1/present"]'); await wait(p);
  const pr = await p.evaluate(() => ({ path: location.pathname, edit: !!document.querySelector('#apvEdit'), controls: document.querySelectorAll('#main input, #main select, #main textarea, #main button').length, flag: !!document.querySelector('#main .agent-flag'),
    nav: (() => { const n = document.getElementById('pNav'); return !!n && getComputedStyle(n).display !== 'none' && !n.hidden; })(), up: (() => { const n = document.getElementById('pUpRow'); return !!n && getComputedStyle(n).display !== 'none' && !n.hidden; })(),
    body: parseFloat(getComputedStyle(document.querySelector('.apv-doc')).fontSize), lede: document.querySelector('.apv-lede').textContent, exit: !!document.querySelector('.apv-exit a[data-plink="appraisals/AV1"]') }));
  out.present = pr;
  expect(pr.path === '/portal/appraisals/AV1/present' && !pr.edit && pr.controls === 0 && !pr.flag && !pr.nav && !pr.up, 'presentation has no editing chrome: ' + JSON.stringify(pr));
  expect(pr.body >= 19 && pr.lede.includes('$410,000 to $465,000') && pr.exit, 'large type, the saved figures, and a way out');
  // presenting: no Sign out, and the logo goes nowhere (Home lists other clients)
  out.presChrome = await p.evaluate(() => ({ so: getComputedStyle(document.getElementById('signOut')).display, logo: Array.from(document.querySelectorAll('.brand img')).every(i => getComputedStyle(i).pointerEvents === 'none') }));
  expect(out.presChrome.so === 'none' && out.presChrome.logo, 'presentation hides Sign out and the logo link: ' + JSON.stringify(out.presChrome));
  await p.evaluate(() => { const i = Array.from(document.querySelectorAll('.brand img')).find(x => x.offsetParent); if (i) i.click(); }); await wait(p, 300);
  expect(await p.evaluate(() => location.pathname) === '/portal/appraisals/AV1/present', 'a tap on the logo stays on the presentation');
  expect(!banned(await docText(p)), 'presentation: no "as is", fee or commission');
  expect(!(await side(p)), 'presentation: no sideways scroll at 390 light'); await shot(p, 'present_390_light');
  await p.emulateMedia({ media: 'print' });
  out.print = await p.evaluate(() => getComputedStyle(document.querySelector('header.top')).display);
  expect(out.print === 'none', 'print hides the top bar: ' + out.print);
  await p.emulateMedia({ media: 'screen' });
  await p.click('.apv-exit a'); await wait(p);
  expect(await p.$('#apvEdit') && !(await p.evaluate(() => document.body.classList.contains('apv-present'))), 'finishing goes back to the edit view');
  await A.ctx.close();

  // ── 6. Dark mode at 390, both views ──
  A = await mk(390, 'dark'); p = A.p;
  await signIn(p, 'agent-test@example.com'); await p.goto(PB + 'appraisals/AV1/present'); await wait(p, 900);
  out.dark = await p.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, tbl: getComputedStyle(document.querySelector('.apv-tbl')).backgroundColor }));
  expect(out.dark.bg === 'rgb(24, 23, 22)' && out.dark.tbl === 'rgb(34, 33, 32)', 'dark colours: ' + JSON.stringify(out.dark));
  expect(!(await side(p)), 'presentation: no sideways scroll at 390 dark'); await shot(p, 'present_390_dark');
  await p.goto(PB + 'appraisals/AV1'); await wait(p, 900);
  expect(await p.$('#apvEdit') && !(await side(p)), 'edit view: no sideways scroll at 390 dark'); await shot(p, 'edit_390_dark');
  await A.ctx.close();

  // ── 7. Wide screen (a laptop or TV): tables stay tables ──
  A = await mk(1280, 'light'); p = A.p;
  await signIn(p, 'agent-test@example.com'); await p.goto(PB + 'appraisals/AV1/present'); await wait(p, 900);
  out.wideHead = await p.evaluate(() => getComputedStyle(document.querySelector('.apv-tbl thead')).display);
  expect(out.wideHead === 'table-header-group' && !(await side(p)), 'wide: tables keep their headings: ' + out.wideHead); await shot(p, 'present_1280_light');
  await A.ctx.close();

  // ── 8. A vendor never sees it ──
  A = await mk(390, 'light'); p = A.p;
  await signIn(p, 'vendor@example.com'); await p.goto(PB + 'appraisals/AV1'); await wait(p, 900);
  out.vendor = await p.evaluate(() => ({ doc: !!document.querySelector('#apvDoc'), text: document.querySelector('#main').innerText }));
  expect(!out.vendor.doc && !out.vendor.text.includes('Sample Street'), 'a vendor does not see the appraisal');
  await A.ctx.close();

  await b.close();
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 2));
})().catch(e => { console.log(JSON.stringify({ crashed: String(e && e.stack || e), errs: ['crash'] }, null, 2)); process.exit(1); });

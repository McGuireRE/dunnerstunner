// Appraisal set-up (LW3 phase A, migration 033), against the mock database, with invented data only. Covers: New appraisal from the
// Appraisals list, the Processes "Appraisal report" tile and a property file; starting from an address (a new property file) and from a
// property on file (its owners offered as who it's for), an address already on file chosen rather than filed twice, and the council
// lookup's "Start the appraisal and use these"; the browser tabs checklist saying what is still to open; a range per part typed by Tim,
// a part added, a low above its high and a missing figure refused; the campaign length asked every time, and each length changing the
// wave; the method changing the chart's marker and the steps; the plan Tim picks shown first and marked; the Dalmore line only for Pine
// Hill, Liberton and Dalmore, and Tim's own suburb link elsewhere; the opinion labelled "not a registered valuation"; no fee,
// commission or "as is" anywhere, and each refused; the result of every button under it; private notes never on the vendor's page;
// the present and print views (every method open in print); 390 px with no sideways scroll in light and dark; a vendor kept out; and
// the record loaded by hand before 033 unchanged and drawing as it did.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const bundle = fs.readFileSync(path.join(__dirname, '..', 'portal.js'), 'utf8');
const shell = fs.readFileSync(path.join(ROOT, 'portal', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(ROOT, 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const { makeFetch } = require('./files/council-fixtures.js');
const PK = 'https://packages.dunnerstunner.co.nz', PB = PK + '/portal/';
const out = {}; const errs = [];
const now = new Date().toISOString();
// the record loaded by hand before 033 (invented, the same shape as the live one: no set-up)
const HAND = {
  id: 'AV1', property_id: null, title: '7 Sample Street, Testville: Market Appraisal', address: '7 Sample Street, Testville', prepared_for: 'Pat Sample', prepared_on: null, status: 'draft', created_by: 'agent-test@example.com', created_at: now, updated_at: now,
  fields: { ranges: [{ key: 'A', option: 'A. Sell in its current condition', involves: 'A tidy, then to market', low: 400000, high: 450000 }], bedrooms: '3 bedrooms', method: { name: 'Deadline sale', text: 'I\'d recommend a deadline sale.' } },
  sections: [{ type: 'byline', text: 'Prepared for Pat Sample' }, { type: 'para', cls: 'lede', text: 'My view: about **{{range:A}}**.' }, { type: 'heading', text: 'My appraisal' }, { type: 'ranges' }, { type: 'heading', text: 'How I would sell it' }, { type: 'method' },
    { type: 'methods', head: ['Method', 'How it works'], rows: [['Deadline sale', 'Offers by a date'], ['Tender', 'Sealed offers']] }],
};
const prop = (id, address) => ({ id, address, title_ref: null, legal_description: null, owners_on_title: null, ownership: {}, description: {}, disclosures: {}, found: {}, provenance: {}, stage: 'appraisal', stage_at: now, cycle_at: null, created_at: now, updated_at: now });
const SEED = () => ({ properties: [prop('P1', '12 Sample Road, Liberton, Dunedin 9010'), prop('P2', '5 Example Avenue, Mornington, Dunedin')],
  property_people: [{ id: 'PP1', property_id: 'P1', position: 1, legal_name: 'Robin Example Tester', pref_name: 'Robin', email: 'robin@example.com', phone: '', role: 'owner', source: 'agent', created_at: now, updated_at: now },
    { id: 'PP2', property_id: 'P1', position: 2, legal_name: 'Sam Example Tester', pref_name: '', email: 'sam@example.com', phone: '', role: 'owner', source: 'agent', created_at: now, updated_at: now }],
  agreements: [], agreement_people: [], agreement_events: [], prelistings: [], property_documents: [], appraisal_views: [JSON.parse(JSON.stringify(HAND))] });
const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// every section type 032 drew, in one invented record, for comparing the renderer as 032 shipped it with today's
const ALL032 = JSON.parse(JSON.stringify(HAND)); ALL032.sections = ALL032.sections.concat([{ type: 'heading', text: 'Rooms' }, { type: 'note', text: 'Small print, https://example.com/x' }, { type: 'list', items: ['**One**', 'Two {{bedrooms}}'] }, { type: 'list', ordered: true, items: ['a', 'b'] },
  { type: 'table', head: ['Item', 'Record'], rows: [['Home', '{{bedrooms}}'], ['Link', '[words](https://example.com/y)']] }, { type: 'wave', title: 'Most buyers come early', subtitle: '{{early}}% by week 3', bars: [{ label: 'Week 1', pct: 40 }, { label: 'Week 2', pct: 20 }, { label: 'Week 3', pct: 10 }], marker: 2, markerLabel: 'Offers close', trickle: 'then a trickle', tail: 'Week 4 on', caption: 'Cap.' }]);
function renderWith(src, rec) { const vm = require('vm'); const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(src, ctx); return ctx.window.APPR.render(rec); }
{ const { execFileSync } = require('child_process');
  let old = ''; try { old = execFileSync('git', ['-C', ROOT, 'show', '49e4528:onboarding/src/appraisal-core.js'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (_) { old = ''; }
  const now_ = fs.readFileSync(path.join(__dirname, '..', 'src', 'appraisal-core.js'), 'utf8');
  if (old) { out.render032 = renderWith(old, ALL032) === renderWith(now_, ALL032) && renderWith(old, HAND) === renderWith(now_, HAND); if (!out.render032) errs.push('the 032 section types draw differently from how 032 drew them'); }
  else out.render032 = 'the 032 renderer is not in this checkout, so the comparison was skipped'; }
(async () => {
  const core = await import(path.join(ROOT, 'fn', 'property_lookup_core.ts'));
  const RESULTS = { [norm('20 Thames Street, Oamaru')]: await core.lookup({ address: '20 Thames Street, Oamaru' }, { fetch: makeFetch('waitaki'), timeoutMs: 400 }) };
  const b = await chromium.launch();
  const expect = (c, m) => { if (!c) errs.push(m); };
  const mk = async (w, scheme) => {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, colorScheme: scheme, hasTouch: w < 500, isMobile: w < 500 }); ctx.setDefaultTimeout(8000);
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
    await ctx.route('https://cdn.jsdelivr.net/npm/pdf*/**', r => r.fulfill({ status: 404, body: '' }));
    await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    await ctx.route(/arcgis|orc\.govt|dunedin\.govt|cluthadc|waitaki\.govt|codc\.govt/, r => { errs.push('the page asked a council server: ' + r.request().url()); r.abort(); });
    await ctx.route(PK + '/**', r => r.fulfill({ status: 404, contentType: 'text/html', body: shell }));
    await ctx.route(PK + '/portal**', r => r.fulfill({ status: 200, contentType: 'text/html', body: shell }));
    await ctx.route(PK + '/onboarding/portal.js', r => r.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: bundle }));
    await ctx.route(PK + '/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push('page: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|permission denied for table appraisal_views|Failed to fetch/.test(m.text())) errs.push('console: ' + m.text()); });
    p.on('dialog', d => d.accept());
    return { ctx, p };
  };
  const side = p => p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth);
  const wait = (p, ms) => p.waitForTimeout(ms || 600);
  const signIn = async (p, email, seed) => { await p.goto(PB); await p.evaluate(([s, e, res]) => { localStorage.clear(); localStorage.setItem('mockAgents', JSON.stringify(['agent-test@example.com'])); localStorage.setItem('mocksession', JSON.stringify({ user: { id: e === 'agent-test@example.com' ? 'agent-1' : 'v-1', email: e } })); localStorage.setItem('mockdb', JSON.stringify(s)); localStorage.setItem('councilResults', JSON.stringify(res)); }, [seed || SEED(), email, RESULTS]); };
  const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb')));
  const at = p => p.evaluate(() => location.pathname);
  const note = (p, id) => p.evaluate(i => { const n = document.getElementById('bn-' + i); return n && !n.hidden ? n.textContent + '|' + n.dataset.kind : null; }, id);
  const docText = p => p.evaluate(() => document.querySelector('#main').innerText);
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'out', `appraisal_setup_${n}.png`), fullPage: true });
  const banned = t => /\bas[\s-]+is\b/i.test(t) || /\bfees?\b/i.test(t) || /\bcommissions?\b/i.test(t);
  // the choice inputs are hidden behind their labels (as across the app): set one as a tap would, with the events the page listens for
  const tick = (p, sel) => p.evaluate(q => { const i = document.querySelector(q); if (!i) throw new Error('no ' + q); if (!i.checked) { i.click(); } }, sel);
  const pick = (p, name, v) => tick(p, `input[name="${name}"][value="${v}"]`);
  // fills the set-up with a good standard appraisal; saves; returns the note under the button
  const fillGood = async (p, o) => { o = o || {};
    if (!(await p.$eval('[data-aps-tab="reinz"]', e => e.checked))) await tick(p, '[data-aps-tab="reinz"]');
    await p.fill('#apsPart0', o.part || 'Your home'); await p.fill('#apsLo0', o.lo || '520,000'); await p.fill('#apsHi0', o.hi || '$575000');
    await pick(p, 'apsCamp', o.camp || 'standard'); if (o.weeks) await p.fill('#apsWeeks', String(o.weeks));
    await pick(p, 'apsMethod', o.method || 'deadline'); await pick(p, 'apsPlan', o.plan || 'premium');
    if (o.suburb != null) await p.fill('#apsSuburb', o.suburb);
    await p.click('#apsSave'); await wait(p, 500); return note(p, 'apsSave'); };
  const docInfo = p => p.evaluate(() => { const d = document.querySelector('#apvDoc'); if (!d) return null; const w = d.querySelector('.apv-camp'); return {
    h2: Array.from(d.querySelectorAll('h2')).map(x => x.textContent), by: (d.querySelector('.apv-by') || {}).textContent || '', lede: (d.querySelector('.apv-lede') || {}).textContent || '',
    fig: Array.from(d.querySelectorAll('.apv-opinion .apv-fig, .apv-opinion .apv-ranges td:last-child')).map(x => x.textContent), valn: (d.querySelector('.apv-valn') || {}).textContent || '',
    method: (d.querySelector('.apv-method') || {}).textContent || '', bars: w ? Array.from(w.querySelectorAll('.apv-wlab')).map(x => x.textContent) : [], pcts: w ? Array.from(w.querySelectorAll('.apv-wpct')).map(x => +x.textContent.replace('%', '')) : [],
    mark: w && w.querySelector('.apv-wmark') ? w.querySelector('.apv-wmark').textContent : '', on: w ? w.querySelectorAll('.apv-wcol.on').length : 0, sub: w ? w.querySelector('figcaption span').textContent : '',
    steps: Array.from(d.querySelectorAll('ol.apv-list li')).map(x => x.textContent), mcs: Array.from(d.querySelectorAll('details.apv-mc')).map(x => [x.dataset.method, x.open, x.classList.contains('apv-rec')]),
    plans: Array.from(d.querySelectorAll('.apv-plan')).map(x => [x.dataset.plan, !!x.querySelector('.apv-tag')]), panel: (d.querySelector('.apv-panel') || {}).textContent || '' }; });

  // ── 1. Ways in: the Appraisals list, the Processes tile, a property file ──
  let A = await mk(390, 'light'), p = A.p;
  await signIn(p, 'agent-test@example.com'); await p.goto(PB + 'appraisals'); await wait(p);
  expect(!!(await p.$('#apvNewRow a[data-plink="appraisals/new"]')), 'the Appraisals list has New appraisal');
  await p.click('#apvNewRow a'); await wait(p);
  out.newPath = await at(p); expect(out.newPath === '/portal/appraisals/new' && !!(await p.$('#apsAddr')), 'New appraisal opens the chooser: ' + out.newPath);
  out.newUp = await p.evaluate(() => { const u = document.getElementById('pUpRow'); return u && !u.hidden ? document.getElementById('pUp').dataset.plink : null; });
  expect(out.newUp === 'appraisals', 'its up link goes to Appraisals: ' + out.newUp);
  expect(!(await side(p)), 'chooser: no sideways scroll at 390 light'); await shot(p, 'new_390_light');
  await p.goto(PB + 'processes'); await wait(p);
  out.tile = await p.evaluate(() => { const t = document.getElementById('homeReport'); return t ? [t.tagName, t.querySelector('.ttl').textContent, t.classList.contains('soon')] : null; });
  expect(out.tile && out.tile[0] === 'BUTTON' && out.tile[1] === 'Appraisal report' && !out.tile[2], 'Processes: the Appraisal report tile is live: ' + JSON.stringify(out.tile));
  await p.click('#homeReport'); await wait(p); expect((await at(p)) === '/portal/appraisals/new', 'the tile opens New appraisal');
  await p.goto(PB + 'properties/P1'); await wait(p, 900);
  expect(!!(await p.$('#apsTile a[data-plink="appraisals/new/P1"]')), 'the property file has an Appraisal report entry');
  await p.click('#apsTile a[data-plink="appraisals/new/P1"]'); await wait(p);
  out.fromProp = { at: await at(p), lede: await p.textContent('#apsNew .lede') };
  expect(out.fromProp.at === '/portal/appraisals/new/P1' && /12 Sample Road, Liberton/.test(out.fromProp.lede), 'opened for that property: ' + JSON.stringify(out.fromProp));

  // ── 2. From a property on file ──
  await p.click('#apsStartProp'); await wait(p, 900);
  out.setupAt = await at(p);
  let d = await db(p); const fromProp = d.appraisal_views.find(r => r.property_id === 'P1');
  expect(fromProp && out.setupAt === '/portal/appraisals/' + fromProp.id + '/setup', 'started from the property, the set-up opens: ' + out.setupAt);
  expect(fromProp && fromProp.setup.v === 1 && fromProp.kind === 'standard' && fromProp.title === '12 Sample Road, Liberton, Dunedin 9010: Market Appraisal' && d.properties.length === 2, 'one appraisal on the property, no new file');
  out.prefill = { who: await p.inputValue('#apsFor'), suburb: await p.inputValue('#apsSuburb'), note: await p.inputValue('#apsNote') };
  expect(out.prefill.who === 'Robin and Sam' && out.prefill.suburb === 'Liberton' && /Thank you for having me through your home/.test(out.prefill.note), 'who it\'s for, the suburb and the note are offered: ' + JSON.stringify(out.prefill));
  // the tabs checklist: REINZ is missing until ticked
  out.tabs0 = await p.textContent('#apsTabsMissing');
  expect(/Still to open: REINZ Statistics Portal/.test(out.tabs0) && (await p.$$('[data-aps-tab]')).length === 4 && /Council records need nothing open/.test(await p.textContent('#apsTabs')), 'tabs checklist: four tabs, REINZ missing, council needs nothing: ' + out.tabs0);
  expect(/Dunedin NZ Visual Library/.test(await p.textContent('#apsTabs')) && /Relab, signed in/.test(await p.textContent('#apsTabs')) && /still on the market/.test(await p.textContent('#apsTabs')), 'every tab of the plan is listed');
  await tick(p, '[data-aps-tab="reinz"]'); await wait(p, 100);
  out.tabs1 = await p.textContent('#apsTabsMissing'); expect(/REINZ is open/.test(out.tabs1), 'REINZ ticked: nothing missing: ' + out.tabs1);
  // the pricing basis: comparables, the other two coming later; the header: Leave it to Claude by default
  out.basis = await p.evaluate(() => Array.from(document.querySelectorAll('input[name="apsBasis"]')).map(i => [i.value, i.checked, i.disabled, i.closest('label').textContent]));
  expect(JSON.stringify(out.basis.map(x => x.slice(0, 3))) === JSON.stringify([['comparables', true, false], ['nocomps', false, true], ['yield', false, true]]) && out.basis.slice(1).every(x => /Coming later/.test(x[3])), 'pricing basis: comparables, then two coming later: ' + JSON.stringify(out.basis));
  expect(await p.$eval('input[name="apsHeader"][value="claude"]', e => e.checked), 'header: Leave it to Claude by default');
  out.plans = await p.$$eval('input[name="apsPlan"]', l => l.map(i => i.value)); expect(out.plans.join() === 'digital,premium,elite,custom', 'the plans come from the catalogue, with Build your own: ' + out.plans);
  expect(!(await side(p)), 'set-up: no sideways scroll at 390 light'); await shot(p, 'setup_390_light');
  // the campaign length is asked every time: nothing chosen yet, so saving says so
  await p.fill('#apsLo0', '520000'); await p.fill('#apsHi0', '575000'); await pick(p, 'apsPlan', 'premium');
  await p.click('#apsSave'); await wait(p, 300);
  out.noCamp = await note(p, 'apsSave'); expect(/Choose how long the campaign should be/.test(out.noCamp || '') && /\|err$/.test(out.noCamp), 'campaign length asked every time: ' + out.noCamp);
  // ranges typed by Tim: a low above its high, a missing figure, a part with no name, all refused under the button
  await pick(p, 'apsCamp', 'standard'); await p.fill('#apsLo0', '600000'); await p.click('#apsSave'); await wait(p, 300);
  out.badRange = await note(p, 'apsSave'); expect(/low figure must be below the high figure \(Your home\)/.test(out.badRange || '') && /\|err$/.test(out.badRange), 'low above high refused: ' + out.badRange);
  await p.fill('#apsLo0', ''); await p.click('#apsSave'); await wait(p, 300);
  out.noFig = await note(p, 'apsSave'); expect(/needs a low and a high figure/.test(out.noFig || ''), 'a missing figure refused: ' + out.noFig);
  d = await db(p); expect(!(d.appraisal_views.find(r => r.id === fromProp.id).fields.ranges), 'nothing refused was saved');
  // "as is" or a fee in what Tim types: refused before it goes anywhere
  await p.fill('#apsLo0', '520000'); await p.fill('#apsNote', 'It will sell as is, quickly.'); await p.click('#apsSave'); await wait(p, 300);
  out.asIs = await note(p, 'apsSave'); expect(/current condition/.test(out.asIs || ''), '"as is" refused: ' + out.asIs);
  await p.fill('#apsNote', 'Thank you.'); await p.fill('#apsMethodText', 'A deadline sale, and my fee is fair.'); await p.click('#apsSave'); await wait(p, 300);
  out.fee = await note(p, 'apsSave'); expect(/never shown/.test(out.fee || ''), 'a fee refused: ' + out.fee);
  await p.fill('#apsMethodText', '');
  // a second part, then a good save, with Tim's private notes
  await p.click('#apsAddPart'); await wait(p, 100);
  await p.fill('#apsPart1', 'The back section'); await p.fill('#apsLo1', '150000'); await p.fill('#apsHi1', '180000');
  await p.fill('#apsNote', 'Thank you for having me through.\n\nCall me any time.');
  await p.fill('#apsPrivate', 'Weak point: the invented sample roof needs work.');
  out.saved = await fillGood(p, { plan: 'elite' });
  expect(/^Saved\. The appraisal is written/.test(out.saved || '') && /\|ok$/.test(out.saved), 'feedback under the button: ' + out.saved);
  d = await db(p); let r = d.appraisal_views.find(x => x.id === fromProp.id);
  out.savedRow = { ranges: r.fields.ranges, setup: { tabs: r.setup.tabs, campaign: r.setup.campaign, method: r.setup.method, plan: r.setup.plan, basis: r.setup.basis, header: r.setup.header }, notes: r.private_notes, n: r.sections.length };
  expect(r.fields.ranges.length === 2 && r.fields.ranges[0].low === 520000 && r.fields.ranges[0].high === 575000 && r.fields.ranges[1].option === 'The back section' && r.fields.ranges[1].high === 180000, 'both ranges saved as Tim typed them: ' + JSON.stringify(r.fields.ranges));
  expect(r.setup.tabs.reinz === true && r.setup.tabs.relab === false && r.setup.campaign.kind === 'standard' && r.setup.method === 'deadline' && r.setup.plan === 'elite' && r.setup.basis === 'comparables' && r.setup.header === 'claude', 'the set-up saved: ' + JSON.stringify(out.savedRow.setup));
  expect(r.private_notes === 'Weak point: the invented sample roof needs work.' && r.prepared_for === 'Robin and Sam' && !!r.prepared_on, 'private notes, who it is for and the date saved');
  const calls = await p.evaluate(() => JSON.parse(localStorage.getItem('mockApprCalls') || '[]').map(c => c.name));
  expect(calls.filter(c => c === 'agent_appraisal_save').length === 1 && calls.includes('agent_appraisal_create'), 'only the good save reached the database: ' + calls);
  expect(!banned(JSON.stringify(r.sections)), 'nothing written says "as is", fee or commission');

  // ── 3. The written appraisal: the agreed order and what each section says ──
  await p.click('#apsAfter a[data-plink$="' + fromProp.id + '"]'); await wait(p, 800);
  let s = await docInfo(p); out.written = s;
  expect(s.h2.join('|') === 'A note from Tim|My opinion of price|How I would sell it|Every way to sell, explained|Marketing plans|Tim is not like other agents', 'the standard sections in the agreed order: ' + s.h2.join('|'));
  expect(/^Prepared for Robin and Sam by Tim McGuire, McGuire Real Estate, \d{1,2} [A-Z][a-z]+ 20\d\d$/.test(s.by), 'byline: ' + s.by);
  expect(s.lede === 'Thank you for having me through.', 'Tim\'s note, first paragraph as the lede: ' + s.lede);
  expect(s.fig.join('|') === '$520,000 to $575,000|$150,000 to $180,000', 'the opinion shows each part\'s range: ' + s.fig);
  expect(/not a registered valuation/.test(s.valn) && /^This is an appraisal/.test(s.valn), 'the opinion is labelled an appraisal, not a registered valuation: ' + s.valn);
  expect(s.bars.join(',') === 'Week 1,Week 2,Week 3,Week 4,Week 5 on' && s.pcts.join(',') === '35,25,15,5' && s.on === 3 && s.sub === '75% of interested buyers visit by week 3', 'standard wave: ' + JSON.stringify([s.bars, s.pcts, s.on, s.sub]));
  expect(s.mark === 'Offers due after the third open home' && /deadline sale, with offers due after the third open home/.test(s.method), 'deadline: marker and sentence: ' + s.mark + ' / ' + s.method);
  expect(s.steps.length === 4 && /Offers due after the third open home/.test(s.steps[2]), 'deadline steps: ' + s.steps);
  expect(JSON.stringify(s.mcs) === JSON.stringify([['deadline', true, true], ['tender', false, false], ['auction', false, false], ['eoi', false, false], ['negotiation', false, false]]), 'every method explained, the recommended one marked and open: ' + JSON.stringify(s.mcs));
  expect(s.plans[0][0] === 'elite' && s.plans[0][1] && s.plans.filter(x => x[1]).length === 1 && s.plans.map(x => x[0]).sort().join() === 'custom,digital,elite,premium', 'the plan Tim picked shows first, marked: ' + JSON.stringify(s.plans));
  expect(s.panel.includes('head and shoulders above the rest') && s.panel.includes('He lives in Dalmore and knows the buyers who look here'), 'Liberton: the head-and-shoulders line and the Dalmore line: ' + s.panel);
  out.editText = await docText(p);
  expect(!banned(out.editText), 'no "as is", fee or commission on the page');
  expect(!!(await p.$('#apsNotes')) && (await p.$eval('#apsNotes', e => e.textContent.includes('Weak point') && !e.closest('#apvDoc'))), 'private notes in Tim\'s own box on his page');
  expect(!(await p.evaluate(() => document.querySelector('#apvDoc').innerText.includes('Weak point'))), 'private notes are not in the appraisal itself');
  expect(!!(await p.$('#apvTools a[data-plink="appraisals/' + fromProp.id + '/setup"]')) && !(await p.$('#apvEdit')), 'Tim\'s tools: change the set-up, no hand-loaded editor');
  expect(!(await side(p)), 'appraisal: no sideways scroll at 390 light'); await shot(p, 'written_390_light');
  // the plans swipe inside their own strip; the page never scrolls sideways
  out.strip = await p.evaluate(() => { const s = document.querySelector('.apv-plans'); return { scrolls: s.scrollWidth > s.clientWidth, inside: s.getBoundingClientRect().right <= innerWidth + 0.5 }; });
  expect(out.strip.scrolls && out.strip.inside, 'plans: a swipeable strip within the page: ' + JSON.stringify(out.strip));

  // ── 4. Each campaign length changes the wave; each method changes the marker and the steps ──
  const viaSetup = async o => { await p.goto(PB + 'appraisals/' + fromProp.id + '/setup'); await wait(p, 700); const n = await fillGood(p, o); await p.goto(PB + 'appraisals/' + fromProp.id); await wait(p, 700); return [n, await docInfo(p)]; };
  let n;
  [n, s] = await viaSetup({ camp: 'larger', method: 'tender' }); out.larger = [n, s.bars, s.pcts, s.mark, s.steps];
  expect(s.bars.length === 9 && s.bars[7] === 'Week 8' && s.pcts.reduce((a, x) => a + x, 0) === 80 && s.on === 6 && s.mark === 'Tenders close in week 6' && s.steps.some(x => /^Tenders close in week 6/.test(x)), 'larger home with a tender: 8 weeks, marker at week 6: ' + JSON.stringify(out.larger));
  expect(JSON.stringify(s.mcs.find(x => x[0] === 'tender')) === '["tender",true,true]' && s.mcs.filter(x => x[2]).length === 1, 'the recommended method follows the pick');
  [n, s] = await viaSetup({ camp: 'land', method: 'auction' }); out.land = [s.bars, s.pcts, s.mark, s.sub];
  expect(s.bars[0] === 'Month 1' && s.bars.length === 7 && s.pcts.join() === '25,18,13,10,8,6' && s.mark === 'Auction day in month 5' && /by month 5/.test(s.sub) && s.steps.some(x => /^Auction day in month 5/.test(x)) && s.steps.some(x => /finance and reports before the day/.test(x)), 'sections and bare land, by month, with an auction: ' + JSON.stringify(out.land));
  [n, s] = await viaSetup({ camp: 'weeks', weeks: 5, method: 'eoi' }); out.weeks = [s.bars, s.pcts, s.mark];
  expect(s.bars.length === 6 && s.bars[4] === 'Week 5' && s.pcts.reduce((a, x) => a + x, 0) === 80 && s.pcts[0] >= s.pcts[4] && s.mark === 'Expressions of interest close in week 4', 'five weeks with expressions of interest: ' + JSON.stringify(out.weeks));
  [n, s] = await viaSetup({ camp: 'standard', method: 'negotiation', plan: 'custom' }); out.nego = [s.mark, s.on, s.steps, s.sub, s.plans[0]];
  expect(s.mark === '' && s.on === 0 && s.steps.some(x => /^Offers any time/.test(x)) && /About 80% of interested buyers visit in the first 4 weeks/.test(s.sub), 'negotiation: no closing marker, offers any time: ' + JSON.stringify(out.nego));
  expect(s.plans[0][0] === 'custom' && s.plans[0][1], 'Build your own picked: it shows first, marked');
  // a long run of weeks stays on the page at 390 px
  [n, s] = await viaSetup({ camp: 'weeks', weeks: 26, method: 'deadline' });
  expect(s.bars.length === 27 && !(await side(p)), '26 weeks: no sideways scroll at 390: ' + s.bars.length);
  await p.goto(PB + 'appraisals/' + fromProp.id + '/setup'); await wait(p, 700);
  n = await fillGood(p, { camp: 'weeks', weeks: 40 }); expect(/from 1 to 26/.test(n || ''), 'more than 26 weeks refused: ' + n);
  // the method chooser offers the whole list, each campaign kind too, in the pure core as well
  out.unit = await p.evaluate(() => ['standard', 'larger', 'land'].map(k => APPR.waveFor({ kind: k }, 'deadline').bars.reduce((a, x) => a + x.pct, 0)));
  expect(out.unit.join() === '80,80,80', 'each campaign curve adds to 80%: ' + out.unit);

  // ── 5. The Dalmore line only for Pine Hill, Liberton and Dalmore; Tim's suburb link elsewhere ──
  const hillOf = async (sub, link) => { await p.goto(PB + 'appraisals/' + fromProp.id + '/setup'); await wait(p, 700); await p.fill('#apsSuburb', sub); await wait(p, 100);
    const hidden = await p.$eval('#apsLinkWrap', e => e.hidden); if (link != null && !hidden) await p.fill('#apsLink', link);
    await fillGood(p, {}); await p.goto(PB + 'appraisals/' + fromProp.id); await wait(p, 700); return [hidden, (await docInfo(p)).panel]; };
  out.hill = {};
  for (const sub of ['Pine Hill', 'dalmore', 'Liberton']) { const [h, pn] = await hillOf(sub); out.hill[sub] = h; expect(h && pn.includes('He lives in Dalmore'), sub + ': the Dalmore line, and no suburb link box'); }
  { const [h, pn] = await hillOf('Mornington', ''); out.hill.Mornington = h; expect(!h && !pn.includes('Dalmore') && !/lives in/i.test(pn), 'Mornington: no Dalmore line and no mention of where Tim lives: ' + pn); }
  { const [h, pn] = await hillOf('Roslyn', 'Tim grew up a few streets from here.'); expect(!h && pn.includes('Tim grew up a few streets from here.') && !pn.includes('Dalmore'), 'elsewhere: Tim\'s own suburb link shows, only as he wrote it: ' + pn); }
  { const [, pn] = await hillOf('Dalmore', null); expect(!pn.includes('Tim grew up'), 'back to a hill suburb: the suburb link is not shown'); }

  // ── 6. Present and print ──
  await p.goto(PB + 'appraisals/' + fromProp.id + '/present'); await wait(p, 900);
  out.present = await p.evaluate(() => ({ controls: document.querySelectorAll('#main input, #main select, #main textarea, #main button').length, flag: !!document.querySelector('#main .agent-flag'), tools: !!document.querySelector('#apvTools'),
    notes: document.querySelector('#main').innerText.includes('Weak point'), nav: (() => { const n = document.getElementById('pNav'); return !!n && getComputedStyle(n).display !== 'none' && !n.hidden; })(), body: parseFloat(getComputedStyle(document.querySelector('.apv-doc')).fontSize), exit: !!document.querySelector('.apv-exit a') }));
  expect(out.present.controls === 0 && !out.present.flag && !out.present.tools && !out.present.notes && !out.present.nav && out.present.body >= 19 && out.present.exit, 'presentation: no editing, no private notes, no menu, large type: ' + JSON.stringify(out.present));
  expect(!banned(await docText(p)), 'presentation: no "as is", fee or commission');
  expect(!(await side(p)), 'presentation: no sideways scroll at 390 light'); await shot(p, 'present_390_light');
  await p.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await wait(p, 100);
  out.printOpen = await p.$$eval('details.apv-mc', l => l.map(x => x.open));
  expect(out.printOpen.length === 5 && out.printOpen.every(Boolean), 'printing opens every method: ' + out.printOpen);
  await p.emulateMedia({ media: 'print' });
  out.print = await p.evaluate(() => ({ top: getComputedStyle(document.querySelector('header.top')).display, plans: getComputedStyle(document.querySelector('.apv-plans')).flexWrap }));
  expect(out.print.top === 'none' && out.print.plans === 'wrap', 'print: no top bar, every plan on the page: ' + JSON.stringify(out.print));
  await p.emulateMedia({ media: 'screen' });
  await p.click('.apv-exit a'); await wait(p, 700);
  expect((await at(p)) === '/portal/appraisals/' + fromProp.id && !(await p.evaluate(() => document.body.classList.contains('apv-present'))), 'finishing goes back to Tim\'s page');
  // the Print button on Tim's page opens every method, then prints
  await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await p.click('#apvPrint'); out.printBtn = await p.evaluate(() => [window.__printed, Array.from(document.querySelectorAll('details.apv-mc')).every(x => x.open)]);
  expect(out.printBtn[0] === 1 && out.printBtn[1], 'Print: every method open, then the print dialog: ' + out.printBtn);
  await A.ctx.close();

  // ── 7. From an address: a new property file; an address on file is chosen, never filed twice; the council lookup ──
  A = await mk(390, 'light'); p = A.p;
  await signIn(p, 'agent-test@example.com'); await p.goto(PB + 'appraisals/new'); await wait(p);
  await p.fill('#apsAddr', '12 Sample Road, Liberton, Dunedin 9010'); await wait(p, 200);
  out.onFile = await p.evaluate(() => ({ match: !!document.querySelector('[data-aps-prop="P1"]'), disabled: document.getElementById('apsNewAddr').disabled, note: (document.getElementById('bn-apsNewAddr') || {}).textContent || '' }));
  expect(out.onFile.match && out.onFile.disabled, 'an address already on file is offered to choose, and the new one is held back: ' + JSON.stringify(out.onFile));
  await wait(p, 200); out.onFileNote = await note(p, 'apsNewAddr');
  expect(/already on file/.test(out.onFileNote || ''), 'and it says so under the button: ' + out.onFileNote);
  await p.fill('#apsAddr', '44 Invented Crescent, Mornington, Dunedin'); await wait(p, 200);
  await p.click('#apsNewAddr'); await wait(p, 900);
  d = await db(p); const np = d.properties.find(x => x.address === '44 Invented Crescent, Mornington, Dunedin'); const na = np && d.appraisal_views.find(x => x.property_id === np.id);
  expect(np && na && (await at(p)) === '/portal/appraisals/' + na.id + '/setup' && d.properties.length === 3, 'from an address: a new property file and the set-up: ' + (await at(p)));
  expect((await p.inputValue('#apsSuburb')) === 'Mornington' && (await p.inputValue('#apsFor')) === '' && !(await p.$eval('#apsLinkWrap', e => e.hidden)), 'suburb from the address; nobody to prefill; the suburb link offered');
  // the council lookup: start the appraisal and use the ticked values, in one go
  await p.goto(PB + 'appraisals/new'); await wait(p);
  await p.fill('#apsAddr', '20 Thames Street, Oamaru'); await p.press('#apsAddr', 'Tab'); await wait(p, 800);
  const useBtn = '#crAps [data-cr-use]';
  out.crLabel = await p.evaluate(s => { const b = document.querySelector(s); return b ? b.textContent.trim() : null; }, useBtn);
  expect(out.crLabel === 'Start the appraisal and use these', 'the lookup offers to start the appraisal and use its values: ' + out.crLabel);
  if (out.crLabel) {
    for (const k of ['title_ref', 'land_area']) { const t = await p.$(`#crAps [data-cr-tick="${k}"]`); if (t) await t.check(); }
    await p.click(useBtn); await wait(p, 1000);
    d = await db(p); const cp = d.properties.find(x => x.address === '20 Thames Street, Oamaru'); const ca = cp && d.appraisal_views.find(x => x.property_id === cp.id);
    expect(cp && ca && cp.title_ref && (await at(p)) === '/portal/appraisals/' + ca.id + '/setup' && d.appraisal_views.filter(x => x.property_id === cp.id).length === 1, 'lookup: one appraisal, the values on its new file, the set-up open: ' + (await at(p)));
  }
  await A.ctx.close();

  // ── 8. Dark mode at 390: the chooser, the set-up, the appraisal and the presentation ──
  A = await mk(390, 'dark'); p = A.p;
  const seedDark = SEED(); seedDark.appraisal_views.push({ id: 'AVS', property_id: 'P1', title: '12 Sample Road: Market Appraisal', address: '12 Sample Road, Liberton, Dunedin 9010', prepared_for: '', prepared_on: null, status: 'draft', created_by: 'agent-test@example.com', created_at: now, updated_at: now, setup: { v: 1 }, kind: 'standard', private_notes: '', sections: [], fields: {} });
  await signIn(p, 'agent-test@example.com', seedDark);
  await p.goto(PB + 'appraisals/new'); await wait(p, 800); expect(!(await side(p)), 'chooser: no sideways scroll at 390 dark'); await shot(p, 'new_390_dark');
  await p.goto(PB + 'appraisals/AVS/setup'); await wait(p, 800);
  out.darkSetup = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(out.darkSetup === 'rgb(24, 23, 22)' && !(await side(p)), 'set-up: dark, no sideways scroll at 390: ' + out.darkSetup); await shot(p, 'setup_390_dark');
  n = await fillGood(p, { camp: 'larger', method: 'deadline', plan: 'digital' }); expect(/^Saved/.test(n || ''), 'saved in dark: ' + n);
  await p.goto(PB + 'appraisals/AVS'); await wait(p, 800); expect(!(await side(p)), 'appraisal: no sideways scroll at 390 dark'); await shot(p, 'written_390_dark');
  await p.goto(PB + 'appraisals/AVS/present'); await wait(p, 800);
  out.darkPresent = await p.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, mc: getComputedStyle(document.querySelector('.apv-mc')).backgroundColor, plan: getComputedStyle(document.querySelector('.apv-plan')).backgroundColor }));
  expect(out.darkPresent.bg === 'rgb(24, 23, 22)' && out.darkPresent.plan === 'rgb(34, 33, 32)' && !(await side(p)), 'presentation: dark, no sideways scroll at 390: ' + JSON.stringify(out.darkPresent)); await shot(p, 'present_390_dark');
  expect(!banned(await docText(p)), 'dark presentation: no "as is", fee or commission');
  await A.ctx.close();

  // ── 9. Wide screen, a vendor, and the record loaded by hand ──
  A = await mk(1280, 'light'); p = A.p;
  await signIn(p, 'agent-test@example.com', seedDark);
  await p.goto(PB + 'appraisals/AVS/setup'); await wait(p, 800); await fillGood(p, {});
  await p.goto(PB + 'appraisals/AVS/present'); await wait(p, 800); expect(!(await side(p)), 'wide: no sideways scroll'); await shot(p, 'present_1280_light');
  // the record loaded by hand: still drawn as before, with its own editor; its set-up page sends Tim back to it; its row unchanged
  await p.goto(PB + 'appraisals/AV1'); await wait(p, 800);
  out.hand = await p.evaluate(() => ({ edit: !!document.querySelector('#apvEdit'), beds: !!document.querySelector('#apvBeds'), h2: Array.from(document.querySelectorAll('#apvDoc h2')).map(x => x.textContent), lede: document.querySelector('.apv-lede').textContent, rec: document.querySelectorAll('.apv-methods tr.apv-rec').length, html: document.querySelector('#apvDoc').innerHTML.length }));
  expect(out.hand.edit && out.hand.beds && out.hand.h2.join('|') === 'My appraisal|How I would sell it' && out.hand.lede.includes('$400,000 to $450,000') && out.hand.rec === 1, 'the hand-loaded record draws as it did, with its own editor: ' + JSON.stringify(out.hand));
  // the page as drawn, against the record drawn on its own (added after drawing, site-wide: the heading's tabindex for focus, and
  // translate="no" around each dollar figure so a browser's translation never changes a figure)
  out.handSame = await p.evaluate(h => { const t = document.createElement('div'); t.innerHTML = window.APPR.render(h); const a = document.querySelector('#apvDoc').innerHTML.replace(/ tabindex="-1"/g, '').replace(/<span translate="no">([^<]*)<\/span>/g, '$1'), b = t.innerHTML;
    let i = 0; while (i < a.length && a[i] === b[i]) i++; return a === b ? true : [i, a.slice(Math.max(0, i - 60), i + 100), b.slice(Math.max(0, i - 60), i + 100)]; }, HAND);
  expect(out.handSame === true, 'the hand-loaded record draws exactly as the 032 renderer draws it: ' + JSON.stringify(out.handSame));
  await p.goto(PB + 'appraisals/AV1/setup'); await wait(p, 700);
  expect(!!(await p.$('#apsHand a[data-plink="appraisals/AV1"]')) && !(await p.$('#apsSave')), 'the hand-loaded record has no set-up; Tim is sent to its page');
  d = await db(p); expect(JSON.stringify(d.appraisal_views.find(x => x.id === 'AV1')) === JSON.stringify(HAND), 'the hand-loaded row is unchanged');
  await A.ctx.close();
  A = await mk(390, 'light'); p = A.p;
  await signIn(p, 'vendor@example.com', seedDark);
  for (const a of ['appraisals/AVS/setup', 'appraisals/new', 'appraisals/new/P1', 'appraisals/AVS/present']) {
    await p.goto(PB + a); await wait(p, 800);
    const v = await p.evaluate(() => ({ doc: !!document.querySelector('#apvDoc, #apsPage, #apsNew'), text: document.querySelector('#main') ? document.querySelector('#main').innerText : '' }));
    expect(!v.doc && !v.text.includes('Sample Road'), 'a vendor does not see ' + a);
  }
  const vCreate = await p.evaluate(async () => { const r = await window.supabase.createClient('x', 'y').rpc('agent_appraisal_create', { p_property: null, p_address: '1 Vendor Street, Testville' }); return r.error && r.error.message; }).catch(e => 'threw ' + e.message);
  expect(/Agent only/.test(vCreate || ''), 'a vendor cannot start an appraisal: ' + vCreate);
  await A.ctx.close();

  await b.close();
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 2));
})().catch(e => { console.log(JSON.stringify({ crashed: String(e && e.stack || e), errs: ['crash'] }, null, 2)); process.exit(1); });

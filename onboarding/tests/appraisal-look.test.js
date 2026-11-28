// The appraisal's look (Tim, 28 November 2026: the live appraisal "is not looking like the original example"): a fully filled
// appraisal, every figure, name, photo and address invented, drawn in the portal at 390 px and 1280 px, light and dark, and in print,
// with screenshots in tests/out. Checks the approved sample's key elements are there: the top bar with the logo and the jump chips, the
// kicker and the title over the header, What I heard as cards, the mockup with its carousel and facts grid, the price dots, every
// comparable as a card with its carousel, pills and table, the market tiles and charts, the opinion card, the buyer wave with its
// bracket, the steps, the ways to sell, the swipeable plan cards with arrows and dots, the panel and the closing line. Then the
// controls: a jump chip moves to its section, All / Sold / On the market narrows the list, a dot opens its home, the plan arrows and
// dots move the strip. And: the sample's fonts and colours, no sideways scroll, the rest of the portal unchanged (scoped styles), no
// private note anywhere, and print as the sample's paper (no chips or buttons, one photo per home).
// Set LOOK_FONTS=1 to let the page load its Google fonts (for comparison screenshots); by default they are stubbed, as in every test.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const bundle = fs.readFileSync(path.join(__dirname, '..', 'portal.js'), 'utf8');
const shell = fs.readFileSync(path.join(ROOT, 'portal', 'index.html'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(ROOT, 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const PK = 'https://packages.dunnerstunner.co.nz', PB = PK + '/portal/';
const out = {}; const errs = [];
const expect = (c, m) => { if (!c) errs.push(m); };
const now = new Date().toISOString();
const day = n => new Date(Date.now() - n * 864e5).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const monthsAgo = n => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return d.toLocaleDateString('en-CA').slice(0, 7) + '-01'; };

// invented pictures: a sky, two hills and a simple house in a colour of its own. Nothing photographed, nothing real.
function scene(i) {
  const sky = ['#9cc7e8', '#f2c9a0', '#b9d6c2', '#c9c2e8', '#e8d39c', '#a8c8d8', '#d8b4a8', '#b4d8b0'][i % 8];
  const wall = ['#b85c46', '#e6e0d2', '#6b8fa8', '#d9b26a', '#8a9a6b', '#c47a5a', '#7d7f86', '#e3c9b0'][i % 8];
  const roof = ['#4a4a52', '#7a3b2e', '#33414d', '#5c4a3a'][i % 4];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>`
    + `<rect width="900" height="600" fill="url(#s)"/><path d="M0 380 Q220 ${250 + i * 9} 460 360 T900 330 V600 H0Z" fill="#7fa36a"/><path d="M0 470 Q300 400 600 460 T900 440 V600 H0Z" fill="#5f8a4e"/>`
    + `<rect x="${260 + i * 14}" y="300" width="330" height="170" fill="${wall}"/><path d="M${240 + i * 14} 305 L${425 + i * 14} 200 L${610 + i * 14} 305Z" fill="${roof}"/>`
    + `<rect x="${300 + i * 14}" y="350" width="70" height="60" fill="#dfeaf2"/><rect x="${470 + i * 14}" y="350" width="70" height="60" fill="#dfeaf2"/><rect x="${400 + i * 14}" y="380" width="44" height="90" fill="#3b2f2a"/></svg>`;
}
const HERO = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><defs><linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fb8d8"/><stop offset="1" stop-color="#e9eef2"/></linearGradient></defs><rect width="1600" height="900" fill="url(#h)"/><path d="M0 560 Q300 330 650 520 T1250 420 T1600 470 V900 H0Z" fill="#6f8f5d"/><path d="M0 700 Q500 560 900 660 T1600 610 V900 H0Z" fill="#4f7244"/><path d="M0 820 Q700 760 1600 800 V900 H0Z" fill="#3f5f6f"/></svg>`;

const COMPS = [
  ['C1', 'sold', 'RB 12 Look Road', 548000, 20, 3, 1, 128, 640, 510000, 'suburb', 300, 4],
  ['C2', 'sold', 'RB 30 Look Road', 565000, 45, 4, 2, 150, 700, 540000, 'suburb', 520, 3],
  ['C3', 'listed', 'RB 8 Sample Crescent', 579000, 12, 3, 1, 118, 590, 500000, '750m', 680, 2],
  ['C4', 'sold', 'RB 41 Example Street', 532000, 70, 3, 1, 110, 812, 495000, '750m', 740, 3],
  ['C5', 'context', 'RB 2 Testing Lane', 610000, 95, 4, 2, 176, 520, 600000, '1500m', 1300, 1],
  ['C6', 'sold', 'RB 19 Look Road', 589000, 30, 4, 1, 140, 760, 560000, 'suburb', 210, 0],
];
const comp = ([id, st, address, price, ago, bed, bath, floor, land, cv, ring, dist], i) => ({ id, appraisal_id: 'AVL', position: i + 1, shown: true, status: st, address, suburb: 'Rbvale', price,
  sold_on: st === 'listed' ? null : day(ago), listed_on: st === 'listed' ? day(ago) : day(ago + 21), method: st === 'listed' ? 'Deadline sale' : 'Private treaty', days_to_sell: st === 'listed' ? null : 14 + i * 3,
  bedrooms: bed, bathrooms: bath, floor_m2: floor, land_m2: land, cv, agency: i === 1 ? 'McGuire Real Estate' : 'RB Test Realty', sold_by_tim: i === 1,
  ad_text: i % 2 ? '' : 'Invented advertisement wording: sun all day, a big garden and room for the boat.', compare_text: 'Invented comparison ' + (i + 1) + ': a similar home, a little smaller than yours.', compare_ticked: true,
  private_note: 'TIM-ONLY-LOOK note ' + id, ring, distance_m: dist, source: 'reinz', photo_hints: [], created_at: now, updated_at: now });
const MEDIA = [], OBJECTS = {}, BLOBS = {};
COMPS.forEach((c, i) => { for (let k = 0; k < c[12]; k++) { const pth = `appraisals/AVL/comps/${c[0]}/p${k}.svg`; MEDIA.push({ id: 'M' + c[0] + k, appraisal_id: 'AVL', comp_id: c[0], path: pth, cover: k === 0, position: k, source: 'upload', created_at: now }); OBJECTS[pth] = { size: 2000, mime: 'image/svg+xml', bucket: 'appraisal-media' }; BLOBS[pth] = scene(i + k); } });
const photo = (id, room, k) => { const pth = 'properties/P1/photos/' + id + '.svg'; BLOBS[pth] = scene(k + 3); return { id, property_id: 'P1', kind: 'Photo', folder: 'photos', name: id + '.svg', path: pth, bucket: 'property-files', room, caption: room, mime_type: 'image/svg+xml', size_bytes: 2000, archived_at: null, created_at: now, updated_at: now, source: 'agent', created_by: 'agent-test@example.com' }; };
const MONTHS = Array.from({ length: 12 }, (_, i) => ({ id: 'MM' + i, area: 'Dunedin', month: monthsAgo(12 - i), median: 540000 + i * 4000 + (i % 3) * 6000, lower_quartile: 440000 + i * 3000, upper_quartile: 660000 + i * 4000, sales: 130 + (i % 4) * 20, days_to_sell: 40 - i, source: 'reinz', gathered_at: now,
  bands: i === 11 ? [{ to: 400000, count: 22 }, { from: 400000, to: 500000, count: 41 }, { from: 500000, to: 600000, count: 56 }, { from: 600000, to: 700000, count: 33 }, { from: 700000, count: 18 }] : [] }));
const SETUP = { v: 1, suburb: 'Rbvale', preparedFor: 'Robin and Sam', note: 'Robin and Sam, thank you for having me through your home. Everything you need to weigh up a sale is on this one page.\n\nThe homes below are not direct comparisons, but each one helps show how buyers will see yours.',
  campaign: { kind: 'standard' }, method: 'deadline', plan: 'premium', basis: 'comparables', header: 'claude', tabs: { reinz: true }, market: true,
  headerOpt: { url: 'https://library.rbtest.invalid/rb-hills.svg', focus: { x: 50, y: 60 }, zoom: 1, bright: 1 },
  heard: { lines: ['You are moving north for work, and would like to be settled by autumn.', 'You would like a quiet campaign with no fuss for the neighbours.', 'You asked me to be straight with you about the market.', 'You value regular, honest updates over spin.'].map((text, i) => ({ id: 'l' + i, text, ticked: true })) },
  home: { on: true, photos: ['D1', 'D2', 'D3'], facts: {}, details: [['Rooms', 'Four bedrooms, a study and two living areas'], ['Bathrooms', '1'], ['Floor area', '138 m²'], ['Land area', '760 m²'], ['Year built', '1962'], ['Construction', 'Brick and tile'], ['Heating', 'Heat pump and a wood burner'], ['Outlook', 'Hills and harbour']],
    ad: { title: 'To wake up to the hills', body: 'Morning light fills the lounge, and the view is all hills and sky. This is an invented advertisement for a test.\n\nSo, to discover the ease of a sunny home, call me, Tim, to see it today.', ticked: true } },
  buyers: { text: 'From what you have told me, families and keen gardeners will love this home.', tags: ['Young families', 'Gardeners', 'Working from home'], ticked: true }, reviews: { on: true } };
const SEED = () => ({ properties: [{ id: 'P1', address: 'RB 7 Look Road, Rbvale', title_ref: null, legal_description: null, owners_on_title: null, ownership: {}, description: {}, disclosures: {}, found: {}, provenance: {}, stage: 'appraisal', stage_at: now, cycle_at: null, created_at: now, updated_at: now }],
  property_people: [], agreements: [], agreement_people: [], agreement_events: [], prelistings: [], property_documents: [photo('D1', 'Living', 0), photo('D2', 'Kitchen', 1), photo('D3', 'Garden', 2)],
  appraisal_views: [{ id: 'AVL', property_id: 'P1', title: 'RB 7 Look Road, Rbvale: Market Appraisal', address: 'RB 7 Look Road, Rbvale', prepared_for: 'Robin and Sam', prepared_on: day(0), status: 'draft', created_by: 'agent-test@example.com', created_at: now, updated_at: now,
    setup: SETUP, kind: 'standard', private_notes: 'TIM-ONLY-LOOK private: the hallway carpet is worn.', fields: {}, sections: [] }],
  appraisal_comps: COMPS.map(comp), appraisal_media: MEDIA, storage_objects: OBJECTS, suburb_groups: [], market_months: MONTHS, market_sales: [], appraisal_reports: [], appraisal_buyer_checks: [], appraisal_assets: [], appraisal_drafts: [], ai_calls: [],
  tim_reviews: [['Sam', 5, 12, 'Tim was brilliant from start to finish, and kept us in the loop every week.'], ['J.', 5, 40, 'Honest, calm and a strong negotiator.'], ['Ari T.', 4, 70, 'Great communication throughout.']].map(([reviewer, rating, ago, body], i) => ({ id: 'RV' + i, ref: 'g' + i, reviewer, rating, reviewed_on: day(ago), body, url: 'https://g.rbtest.invalid/r' + i, ticked: true, removed_at: null, created_at: now, updated_at: now })) });
SEED();   // fills BLOBS with the mockup's photos too, before the first browser is made, so every view draws them
const FONTS = path.join(__dirname, '..', 'assets', 'fonts');
const GREQ = [], FREQ = [];   // requests to Google's fonts, and to the site's own font files

(async () => {
  const b = await chromium.launch();
  const mk = async (w, scheme, reduced) => {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme, hasTouch: w < 500, isMobile: w < 500, reducedMotion: reduced ? 'reduce' : 'no-preference' }); ctx.setDefaultTimeout(10000);
    ctx.on('request', r => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) GREQ.push(r.url()); if (/\/onboarding\/assets\/fonts\//.test(r.url())) FREQ.push(r.url()); });
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
    if (!process.env.LOOK_FONTS) await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    await ctx.route(PK + '/**', r => r.fulfill({ status: 404, contentType: 'text/html', body: shell }));
    await ctx.route(PK + '/portal**', r => r.fulfill({ status: 200, contentType: 'text/html', body: shell }));
    await ctx.route(PK + '/onboarding/portal.js', r => r.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: bundle }));
    await ctx.route(PK + '/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
    // the appraisal's own font files, as the site serves them (registered after the catch-all, so this one answers)
    await ctx.route(PK + '/onboarding/assets/fonts/**', r => { const f = path.join(FONTS, path.basename(new URL(r.request().url()).pathname)); return fs.existsSync(f) ? r.fulfill({ contentType: 'font/woff2', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: '' }); });
    await ctx.route('https://library.rbtest.invalid/**', r => r.fulfill({ contentType: 'image/svg+xml', body: HERO }));
    await ctx.route('https://g.rbtest.invalid/**', r => r.fulfill({ status: 404, body: '' }));
    // the invented photos, as the mock's storage hands them out
    await ctx.addInitScript(bl => { window.__repoBlobs = {}; Object.entries(bl).forEach(([k, v]) => { window.__repoBlobs[k] = new Blob([v], { type: 'image/svg+xml' }); }); }, BLOBS);
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push('page: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|permission denied|Failed to fetch|net::ERR/.test(m.text())) errs.push('console: ' + m.text()); });
    return { ctx, p };
  };
  const side = p => p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth);
  const wait = (p, ms) => p.waitForTimeout(ms || 600);
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'out', `appraisal_look_${n}.png`), fullPage: true });
  const banned = t => /\bas[\s-]+is\b/i.test(t) || /\bfees?\b/i.test(t) || /\bcommissions?\b/i.test(t);
  // signs Tim in, then writes the appraisal's sections exactly as the set-up page does (APPR.writeStandard with the shared catalogue)
  const signIn = async p => {
    await p.goto(PB); await p.evaluate(s => { localStorage.clear(); localStorage.setItem('mockAgents', JSON.stringify(['agent-test@example.com'])); localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'agent-1', email: 'agent-test@example.com' } })); localStorage.setItem('mockdb', JSON.stringify(s)); }, SEED());
    await p.goto(PB + 'appraisals'); await wait(p, 600);
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('mockdb')), r = d.appraisal_views[0];
      const w = window.APPR.writeStandard(r.setup, [{ key: 'A', option: 'Your home', low: 555000, high: 595000 }], { address: r.address, preparedOn: r.prepared_on, cat: { PACKAGES, ITEMS, CATALOGUE } });
      Object.assign(r, { sections: w.sections, fields: w.fields, title: w.title }); localStorage.setItem('mockdb', JSON.stringify(d)); });
  };
  const info = p => p.evaluate(() => { const d = document.querySelector('#apvDoc .apv-doc'); if (!d) return null; const cs = e => e ? getComputedStyle(e) : {};
    return {
      top: !!d.querySelector('.apv-top .apv-logo img.logo-light'), chips: Array.from(d.querySelectorAll('.apv-jump .apv-chip')).map(x => x.textContent),
      kick: (d.querySelector('.apv-hero .apv-kick') || {}).textContent || '', h1: (d.querySelector('.apv-hero h1') || {}).textContent || '',
      heard: d.querySelectorAll('.apv-heard-list li').length, facts: d.querySelectorAll('.apv-home .apv-facts > div').length, homeCar: d.querySelectorAll('.apv-home .apv-car img').length, adTitle: (d.querySelector('.apv-adraft h3') || {}).textContent || '',
      mockPill: (d.querySelector('.apv-mock .apv-tag.mock') || {}).textContent || '', dots: d.querySelectorAll('.mk-v.n .mk-dot').length, dotsShown: Array.from(d.querySelectorAll('.mk-dots svg.mk-v')).filter(v => getComputedStyle(v).display !== 'none').map(v => v.getAttribute('class')).join(),
      cards: Array.from(d.querySelectorAll('.apv-comp')).map(c => ({ n: c.dataset.n, st: c.dataset.st, car: c.querySelectorAll('.apv-car img').length, rows: c.querySelectorAll('.apv-cmp-tbl tbody tr').length, pills: Array.from(c.querySelectorAll('.apv-comp-tags .apv-tag')).map(t => t.textContent), price: (c.querySelector('.apv-comp-price') || {}).textContent || '' })),
      filters: Array.from(d.querySelectorAll('[data-apv-f]')).map(x => x.textContent), tiles: d.querySelectorAll('.mk-tile').length, charts: Array.from(d.querySelectorAll('[data-chart]')).map(x => x.dataset.chart),
      opinion: (d.querySelector('.apv-opin-card .apv-opin-fig') || {}).textContent || '', opinKick: (d.querySelector('.apv-opin-card .apv-kick') || {}).textContent || '',
      brack: (d.querySelector('.apv-wbrack') || {}).textContent || '', steps: d.querySelectorAll('ol.apv-steps li').length, methods: d.querySelectorAll('.apv-mcard details.apv-mc').length,
      plans: Array.from(d.querySelectorAll('.apv-plan')).map(x => [x.dataset.plan, x.classList.contains('apv-rec')]), pdots: d.querySelectorAll('.apv-pdot').length, planPrice: (() => { const e = d.querySelector('.apv-plan-price'); const t = e && (e.querySelector('span') || e); return t ? parseFloat(getComputedStyle(t).fontSize) : 0; })(), panel: !!d.querySelector('.apv-panel .apv-panel-h'),
      close: (d.querySelector('.apv-close h2') || {}).textContent || '', reviews: d.querySelectorAll('.apv-rev').length, buyers: d.querySelectorAll('.apv-buyers .apv-tag').length,
      homeImgs: Array.from(d.querySelectorAll('.apv-home .apv-car img')).map(i => ({ blob: /^blob:/.test(i.src), ok: i.complete && i.naturalWidth > 100, w: Math.round(i.getBoundingClientRect().width) })),
      swipe: (d.querySelector('.apv-evidence .apv-lede.no-print') || {}).innerText || '', planNote: (d.querySelector('.apv-plans-h + .apv-note') || {}).innerText || '',
      rangeLab: Array.from(d.querySelectorAll('.mk-dots .mk-range-lab')).map(x => x.textContent), pyr: (d.querySelector('.apv-opinion .apv-pyr-svg') || { getAttribute: () => null }).getAttribute('aria-label'), sig: (d.querySelector('.apv-sig') || {}).textContent || '',
      by: (() => { const e = d.querySelector('.apv-by'); return e ? getComputedStyle(e).display : 'none'; })(), noteK: /note from Tim/i.test(d.innerText),
      jump: (() => { const j = d.querySelector('.apv-jump'); return { wrap: getComputedStyle(j).flexWrap, ox: getComputedStyle(j).overflowX, allIn: Array.from(j.children).every(c => { const r = c.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth; }) }; })(),
      fontH1: cs(d.querySelector('h1')).fontFamily || '', fontBody: cs(d).fontFamily || '', mainW: cs(document.querySelector('main')).maxWidth, text: d.innerText };
  });

  // ── 1. Phone, light: every key element of the sample, and its controls ──
  let X = await mk(390, 'light'), p = X.p;
  await signIn(p);
  // the rest of the portal keeps its own width: the Appraisals list is not the appraisal page
  out.listW = await p.evaluate(() => getComputedStyle(document.querySelector('main')).maxWidth);
  // the fonts are the site's own on every page: no Google link in either page head, and Tim's other pages load the same files
  expect(!/fonts\.googleapis|fonts\.gstatic/.test(html) && !/fonts\.googleapis|fonts\.gstatic/.test(shell), 'no Google font link in the onboarding page or the portal shell');
  GREQ.length = 0; FREQ.length = 0;
  await p.goto(PB); await wait(p, 1200); await p.evaluate(() => document.fonts.ready);
  out.homeFonts = { google: GREQ.slice(), own: FREQ.length, ok: await p.evaluate(() => document.fonts.check('16px "Barlow"') && document.fonts.check('30px "Cormorant Garamond"')) };
  expect(!out.homeFonts.google.length && out.homeFonts.own >= 2 && out.homeFonts.ok, 'site-wide: Tim\'s home page loads the site\'s own fonts, never Google\'s: ' + JSON.stringify(out.homeFonts));
  GREQ.length = 0; FREQ.length = 0;
  await p.goto(PB + 'appraisals/AVL'); await wait(p, 1400);
  await p.evaluate(() => document.fonts.ready);
  out.fonts = await p.evaluate(() => ({ barlow: document.fonts.check('16px "Barlow"'), cormorant: document.fonts.check('30px "Cormorant Garamond"') }));
  out.fontReq = { google: GREQ.slice(), own: FREQ.length };
  expect(!out.fontReq.google.length && out.fontReq.own >= 2 && out.fonts.barlow && out.fonts.cormorant, 'the appraisal\'s fonts come from the site itself, never from Google: ' + JSON.stringify([out.fontReq, out.fonts]));
  let s = await info(p); out.phone = Object.assign({}, s, { text: undefined });
  expect(s && s.top && s.chips.join('|') === 'What I heard|Your home|Your buyers|Price evidence|Sales and listings|Dunedin market|My opinion|Campaign|Reviews', 'the top bar: the logo and a jump chip for each section: ' + JSON.stringify(s && s.chips));
  expect(/^Appraisal · /.test(s.kick) && s.h1 === 'RB 7 Look Road, Rbvale', 'the kicker and the address over the header: ' + JSON.stringify([s.kick, s.h1]));
  expect(s.heard === 4 && s.facts === 8 && s.homeCar === 3 && s.adTitle === 'To wake up to the hills' && s.mockPill === 'Mockup', 'What I heard as cards; the mockup with its carousel, advertisement and facts grid: ' + JSON.stringify([s.heard, s.facts, s.homeCar, s.adTitle, s.mockPill]));
  expect(s.dots === 6 && s.dotsShown === 'mk-v n' && s.cards.length === 6 && s.cards.filter(c => c.car).length === 5 && s.cards.every(c => c.rows === 5 && c.pills.length >= 2 && c.price) && s.cards.find(c => c.n === '2').pills.includes('Sold by Tim') && s.cards.find(c => c.n === '3').price === 'Asking $579,000',
    'the comparables: a card each, with carousel, pills, price in large type and the figures table: ' + JSON.stringify(s.cards));
  expect(s.filters.join('|') === 'All|Sold|On the market', 'All, Sold and On the market, as in the sample: ' + s.filters);
  expect(s.tiles === 4 && s.charts.join() === 'median,days_to_sell,sales,bands', 'the market tiles and charts: ' + JSON.stringify([s.tiles, s.charts]));
  expect(s.opinion === '$555,000 to $595,000' && /would expect your home to sell between/i.test(s.opinKick), 'the opinion of price card: ' + JSON.stringify([s.opinion, s.opinKick]));
  expect(s.brack === '80% of buyers' && s.steps === 4 && s.methods === 5, 'the buyer wave with its bracket, the steps and the ways to sell: ' + JSON.stringify([s.brack, s.steps, s.methods]));
  expect(s.plans.length >= 3 && s.plans[0][0] === 'premium' && s.plans[0][1] && s.pdots === s.plans.length && s.panel && s.close === 'When you\'re ready, I\'m ready', 'the plans (recommended first, a dot each), the panel and the closing line: ' + JSON.stringify([s.plans, s.pdots, s.close]));
  expect(s.planPrice >= 30, 'each plan\'s price in large display type, as in the sample: ' + s.planPrice);
  expect(s.reviews === 3 && s.buyers === 3, 'reviews and the ideal buyers drawn: ' + JSON.stringify([s.reviews, s.buyers]));
  expect(s.homeImgs.length === 3 && s.homeImgs.every(x => x.blob) && s.homeImgs[0].ok && s.homeImgs[0].w > 200, 'phone: the mockup\'s own photos have loaded, with real size: ' + JSON.stringify(s.homeImgs));
  expect(/^Swipe through each home's photos/.test(s.swipe) && /^Swipe to compare the plans/.test(s.planNote), 'phone: the sample\'s swipe wording: ' + JSON.stringify([s.swipe, s.planNote]));
  expect(s.rangeLab.length === 0 && s.pyr === 'Appraisal range $555,000 to $595,000. Above it, the top price is set by competition between buyers.', 'no range over the dots; the range first shows in the opinion, as the pyramid: ' + JSON.stringify([s.rangeLab, s.pyr]));
  expect(s.sig === 'Tim McGuire · 027 562 7207 · tim@mcguire.co.nz' && s.by === 'none' && !s.noteK, 'the letter ends with the signature line; no heading over it; "Prepared for" on paper only: ' + JSON.stringify([s.sig, s.by, s.noteK]));
  expect(s.jump.ox === 'auto' && s.jump.wrap === 'nowrap', 'phone: the chips stay one sideways strip: ' + JSON.stringify(s.jump));
  expect(/^"?Cormorant Garamond"?,/.test(s.fontH1) && /^"?Barlow"?,/.test(s.fontBody) && !/MRE/.test(s.fontH1 + s.fontBody), 'the sample\'s fonts, under the site\'s plain names (with fallbacks): ' + JSON.stringify([s.fontH1, s.fontBody]));
  expect(!/TIM-ONLY-LOOK/.test(s.text) && !banned(s.text.replace(/Fees/g, '')), 'no private note, no "as is", fee or commission');
  expect(!(await side(p)), 'phone, light: no sideways scroll'); await shot(p, '390_light');
  // the controls: a jump chip, the filters, a price dot, the plans' arrows and dots
  out.jump = await p.evaluate(async () => { const c = Array.from(document.querySelectorAll('.apv-jump .apv-chip')).find(x => x.textContent === 'My opinion'); c.click(); await new Promise(r => setTimeout(r, 1800)); const h = document.getElementById(c.dataset.apvGo).getBoundingClientRect().top; return { top: Math.round(h), path: location.pathname }; });
  expect(out.jump.top >= -2 && out.jump.top < 200 && out.jump.path === '/portal/appraisals/AVL', 'a jump chip scrolls to its section and stays on the page: ' + JSON.stringify(out.jump));
  // from the keyboard: Enter on a chip moves focus to its section
  await p.evaluate(() => Array.from(document.querySelectorAll('.apv-jump .apv-chip')).find(x => x.textContent === 'Campaign').focus()); await p.keyboard.press('Enter'); await wait(p, 1200);
  out.keyJump = await p.evaluate(() => { const c = Array.from(document.querySelectorAll('.apv-jump .apv-chip')).find(x => x.textContent === 'Campaign'); return { focus: document.activeElement && document.activeElement.id, want: c.dataset.apvGo }; });
  expect(out.keyJump.focus === out.keyJump.want, 'Enter on a chip moves focus to its section: ' + JSON.stringify(out.keyJump));
  await p.click('[data-apv-f="listed"]'); await wait(p, 200);
  out.filt = await p.evaluate(() => Array.from(document.querySelectorAll('.apv-comp')).filter(c => !c.hidden).map(c => c.dataset.n).join());
  await p.click('[data-apv-f="all"]'); await wait(p, 200);
  out.filtAll = await p.evaluate(() => document.querySelectorAll('.apv-comp:not([hidden])').length);
  expect(out.filt === '3' && out.filtAll === 6, 'On the market shows only the listing, All shows every home: ' + JSON.stringify([out.filt, out.filtAll]));
  await p.click('[data-apv-f="sold"]'); await wait(p, 200);
  await p.evaluate(() => document.querySelector('.mk-dot[data-n="3"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))); await wait(p, 900);
  out.dot = await p.evaluate(() => { const c = document.querySelector('.apv-comp[data-n="3"]'), r = c.getBoundingClientRect(); return { shown: !c.hidden, inView: r.top < innerHeight && r.bottom > 0, all: document.querySelectorAll('.apv-comp:not([hidden])').length }; });
  expect(out.dot.shown && out.dot.inView && out.dot.all === 6, 'a price dot opens its home (the list shows everything again): ' + JSON.stringify(out.dot));
  await p.evaluate(() => document.querySelector('.apv-plans').scrollIntoView()); await p.click('.apv-pbtn[data-apv-plan="1"]'); await wait(p, 900);
  out.plan = await p.evaluate(() => ({ left: document.querySelector('.apv-plans').scrollLeft, on: Array.from(document.querySelectorAll('.apv-pdot')).findIndex(d => d.classList.contains('on')), cur: Array.from(document.querySelectorAll('.apv-pdot')).map(d => d.getAttribute('aria-current')).join() }));
  expect(out.plan.cur === ',true,,', 'the plan in view is marked aria-current on its dot: ' + out.plan.cur);
  await p.click('.apv-pdot[data-apv-plan-i="0"]'); await wait(p, 900);
  out.plan0 = await p.evaluate(() => ({ left: document.querySelector('.apv-plans').scrollLeft, on: Array.from(document.querySelectorAll('.apv-pdot')).findIndex(d => d.classList.contains('on')) }));
  expect(out.plan.left > 100 && out.plan.on === 1 && out.plan0.left < 5 && out.plan0.on === 0, 'the plan arrows and dots move the strip, the dot follows: ' + JSON.stringify([out.plan, out.plan0]));
  // the carousel's arrows sit over the photo, with the count in its corner
  out.car = await p.evaluate(() => { const c = document.querySelector('.apv-comp .apv-car'), r = c.getBoundingClientRect(), bt = c.querySelector('.apv-car-btn.next').getBoundingClientRect(), at = c.querySelector('.apv-car-at').getBoundingClientRect();
    return { over: bt.top > r.top && bt.bottom < r.bottom && bt.right <= r.right, count: at.bottom <= r.bottom && at.right <= r.right, text: c.querySelector('.apv-car-at').textContent }; });
  expect(out.car.over && out.car.count && out.car.text === '1 of 4', 'carousel arrows and count over the photo: ' + JSON.stringify(out.car));
  out.apvW = s.mainW;
  expect(out.listW === '640px' && out.apvW === '920px', 'the appraisal page is the sample\'s 920 px wide; the rest of the portal keeps its own width: ' + JSON.stringify([out.listW, out.apvW]));
  // presenting: the portal's own bar gives way to the appraisal's (logo and chips), sticky at the top
  await p.goto(PB + 'appraisals/AVL/present'); await wait(p, 1400);
  out.present = await p.evaluate(() => { window.scrollTo(0, 3000); const t = document.querySelector('.apv-top'); return { portalBar: getComputedStyle(document.querySelector('header.top')).display, sticky: getComputedStyle(t).position, at: Math.round(t.getBoundingClientRect().top), text: document.querySelector('#main').innerText }; });
  expect(out.present.portalBar === 'none' && out.present.sticky === 'sticky' && out.present.at <= 1 && !/TIM-ONLY-LOOK/.test(out.present.text), 'presenting: the appraisal\'s own sticky top bar, no private notes: ' + JSON.stringify(Object.assign({}, out.present, { text: undefined })));
  expect(!(await side(p)), 'presenting, phone: no sideways scroll'); await p.evaluate(() => window.scrollTo(0, 0)); await shot(p, 'present_390_light');
  await X.ctx.close();

  // ── 2. Phone, dark ──
  X = await mk(390, 'dark'); p = X.p; await signIn(p);
  await p.goto(PB + 'appraisals/AVL'); await wait(p, 1400);
  out.dark = await p.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, card: getComputedStyle(document.querySelector('.apv-comp')).backgroundColor, logo: getComputedStyle(document.querySelector('.apv-logo .logo-dark')).display, ink: getComputedStyle(document.querySelector('.apv-doc h1')).color }));
  expect(out.dark.bg === 'rgb(24, 23, 22)' && out.dark.card === 'rgb(34, 33, 32)' && out.dark.logo !== 'none', 'dark: the sample\'s dark colours and the light logo: ' + JSON.stringify(out.dark));
  expect(!(await side(p)), 'phone, dark: no sideways scroll'); await shot(p, '390_dark');
  await p.goto(PB + 'appraisals/AVL/present'); await wait(p, 1400); expect(!(await side(p)), 'presenting, phone, dark: no sideways scroll'); await shot(p, 'present_390_dark');
  await X.ctx.close();

  // ── 3. Wide, light and dark: the two-column comparables and the four-across facts and tiles ──
  for (const scheme of ['light', 'dark']) {
    X = await mk(1280, scheme); p = X.p; await signIn(p);
    await p.goto(PB + 'appraisals/AVL'); await wait(p, 1400);
    const w = await p.evaluate(() => { const c = document.querySelector('.apv-comp .apv-two'), car = c.children[0].getBoundingClientRect(), body = c.children[1].getBoundingClientRect(), hero = document.querySelector('.apv-hero').getBoundingClientRect();
      return { dots: Array.from(document.querySelectorAll('.mk-dots svg.mk-v')).filter(v => getComputedStyle(v).display !== 'none').map(v => v.getAttribute('class')).join(), side: car.right <= body.left && Math.abs(car.top - body.top) < 4, facts: getComputedStyle(document.querySelector('.apv-facts')).gridTemplateColumns.split(' ').length, tiles: getComputedStyle(document.querySelector('.mk-tiles')).gridTemplateColumns.split(' ').length, heroW: Math.round(hero.width), heroL: Math.round(hero.left), vw: innerWidth }; });
    out['wide_' + scheme] = w;
    const iw = await info(p); out['wideInfo_' + scheme] = { homeImgs: iw.homeImgs, swipe: iw.swipe, jump: iw.jump };
    expect(iw.homeImgs.length === 3 && iw.homeImgs.every(x => x.blob) && iw.homeImgs[0].ok && iw.homeImgs[0].w > 300, 'wide ' + scheme + ': the mockup\'s own photos have loaded, with real size: ' + JSON.stringify(iw.homeImgs));
    expect(/^Use the arrows to see each home's photos/.test(iw.swipe) && /^Use the arrows to compare the plans/.test(iw.planNote), 'wide: "Use the arrows", not "Swipe": ' + JSON.stringify([iw.swipe, iw.planNote]));
    expect(iw.jump.wrap === 'wrap' && iw.jump.allIn, 'wide: the chips wrap, every one on the screen and reachable with a mouse: ' + JSON.stringify(iw.jump));
    expect(w.dots === 'mk-v w' && w.side && w.facts === 4 && w.tiles === 4 && w.heroL <= 0 && w.heroW >= w.vw - 20, 'wide ' + scheme + ': photos beside the figures, four across, the header the full width: ' + JSON.stringify(w));
    expect(!(await side(p)), 'wide ' + scheme + ': no sideways scroll'); await shot(p, '1280_' + scheme);
    await p.goto(PB + 'appraisals/AVL/present'); await wait(p, 1400); expect(!(await side(p)), 'presenting, wide ' + scheme + ': no sideways scroll'); await shot(p, 'present_1280_' + scheme);
    await p.goto(PB + 'appraisals/AVL'); await wait(p, 1400);
    if (scheme === 'light') {
      // ── 4. Print, as the sample's paper: the logo, no chips or buttons, one photo per home, every plan and method on the page ──
      await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      await p.emulateMedia({ media: 'print' }); await wait(p, 300);
      out.print = await p.evaluate(() => { const vis = e => !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0;
        return { logo: vis(document.querySelector('.apv-logo img.logo-light')), chips: vis(document.querySelector('.apv-jump')), filters: vis(document.querySelector('.apv-filters')), pnav: vis(document.querySelector('.apv-pnav')), carBtn: Array.from(document.querySelectorAll('.apv-car-btn')).some(vis),
          by: vis(document.querySelector('.apv-by')), swipe: vis(document.querySelector('.apv-evidence .apv-lede.no-print')), hero: (() => { const r = document.querySelector('.apv-hero').getBoundingClientRect(); return { l: Math.round(r.left), w: Math.round(r.width), vw: innerWidth }; })(),
          photos: Array.from(document.querySelectorAll('.apv-comp')).map(c => Array.from(c.querySelectorAll('.apv-car img')).filter(vis).length), plans: Array.from(document.querySelectorAll('.apv-plan')).filter(vis).length, open: Array.from(document.querySelectorAll('details.apv-mc')).every(d => d.open), portalBar: vis(document.querySelector('header.top')) }; });
      expect(out.print.by && !out.print.swipe && out.print.hero.l <= 0 && out.print.hero.w >= out.print.hero.vw - 2, 'print: "Prepared for" shown, no swipe wording, the header to the paper\'s edge: ' + JSON.stringify([out.print.by, out.print.swipe, out.print.hero]));
      expect(out.print.logo && !out.print.chips && !out.print.filters && !out.print.pnav && !out.print.carBtn && !out.print.portalBar && out.print.photos.every(n => n <= 1) && out.print.photos.filter(n => n === 1).length === 5 && out.print.plans >= 3 && out.print.open,
        'print: the logo, no chips or buttons, one photo per home, every plan and method: ' + JSON.stringify(out.print));
      await shot(p, 'print'); await p.pdf({ path: path.join(__dirname, 'out', 'appraisal_look_print.pdf'), format: 'A4', printBackground: true });
      await p.emulateMedia({ media: 'screen' });
    }
    await X.ctx.close();
  }

  // ── 4b. Reduced motion: a carousel arrow moves at once, with no sliding ──
  X = await mk(390, 'light', true); p = X.p; await signIn(p);
  await p.goto(PB + 'appraisals/AVL'); await wait(p, 1400);
  out.reduced = await p.evaluate(() => { const c = document.querySelector('.apv-comp .apv-car'), s = c.querySelector('.apv-car-strip'); c.querySelector('.apv-car-btn.next').click(); return { left: Math.round(s.scrollLeft), w: s.clientWidth }; });
  expect(out.reduced.left === out.reduced.w && out.reduced.w > 100, 'reduced motion: the carousel moves at once: ' + JSON.stringify(out.reduced));
  await X.ctx.close();

  // ── 5. Another screen keeps its own look: vendor onboarding's appraisal list and Tim's Home are not restyled ──
  X = await mk(390, 'light'); p = X.p; await signIn(p);
  await p.goto(PB + 'appraisals/AVL/setup'); await wait(p, 900);
  out.setupLook = await p.evaluate(() => ({ main: getComputedStyle(document.querySelector('main')).maxWidth, h1: getComputedStyle(document.querySelector('#apsPage h1')).fontSize, bar: getComputedStyle(document.querySelector('header.top')).display, overflow: getComputedStyle(document.body).overflowX }));
  expect(out.setupLook.main === '640px' && out.setupLook.bar !== 'none' && out.setupLook.overflow !== 'clip', 'the set-up page keeps the portal\'s own look: ' + JSON.stringify(out.setupLook));
  await X.ctx.close();

  await b.close();
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => { console.log(JSON.stringify({ crashed: String(e && e.stack || e), errs: ['crashed'] })); process.exit(1); });

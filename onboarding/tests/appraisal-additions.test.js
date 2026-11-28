// Tim's additions to the appraisal (28 November 2026, migration 038), against the mock database, with invented data only.
// A. The "Yours" column and the difference tags on every comparable: their figures from the property profile (bedrooms only from
//    Tim's room calls, never a value from Relab, the rating valuation only when Tim ticks it), a row only when both homes have a figure;
//    "Draft the comparison" and "Draft all" (doc-prefill, part compare, Sonnet) arriving unticked, weak points to Tim's private note;
//    the reminder to mention both homes.
// B. The order (comparables, the market, everything sold in the suburb last month, then the opinion) and the suburb table: every sale
//    held for that suburb and the latest full month, full street addresses, the month's totals, comparables marked; none held, no
//    section, and Tim is prompted.
// C. A YouTube or Vimeo personal address above the letter: only those links, the player's address built by the page, nothing loaded
//    until pressed, sandboxed, hidden when empty or in print, and it wins over an uploaded introduction.
// D. One settings page (settings/about): the picture made square and small, name and licence, phone and email, the two About tabs,
//    the ways to reach Tim (on or off, in order, each checked as its service writes it).
// E. The picture in a circle in every page's header (the portal, the vendor's pages, the appraisal's own top bar), opening one
//    accessible overlay: picture, name, the ways to reach him, the two About tabs; "Send a message" for signed-in people (saved through
//    contact_send, five a day, on Needs you, emailed to Tim once), a preview on Tim's own view, not offered to people not signed in.
// Screenshots: tests/out/appraisal_add_*.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const bundle = fs.readFileSync(path.join(__dirname, '..', 'portal.js'), 'utf8');
const shell = fs.readFileSync(path.join(ROOT, 'portal', 'index.html'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(ROOT, 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const PK = 'https://packages.dunnerstunner.co.nz', PB = PK + '/portal/', OB = PK + '/onboarding/';
const FONTS = path.join(__dirname, '..', 'assets', 'fonts');
const out = {}; const errs = [];
const expect = (c, m) => { if (!c) errs.push(m); };
const now = new Date().toISOString();
const day = n => new Date(Date.now() - n * 864e5).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const TIM_PRICE_WORDING = 'How buyers set the price. Buyers stack up like a pyramid: many at the base, fewer at each level, and at the top the one buyer who wants your home more than anyone else. That buyer only reaches their best price while the buyers beneath them are still in the running. My job is to keep every genuine buyer in contention, so competition does the lifting. The range above is where I expect the market to land today. It is a guide, not a ceiling, and nothing pleases me more than proving it wrong.';
const LM = (() => { const y = +today.slice(0, 4), m = +today.slice(5, 7); return m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0'); })();
const OLD = (() => { const [y, m] = LM.split('-').map(Number); return m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0'); })();
const svg = (c, w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w || 900}" height="${h || 600}"><rect width="100%" height="100%" fill="${c}"/><circle cx="50%" cy="45%" r="22%" fill="#fff" opacity=".7"/></svg>`;
const BLOBS = { 'appraisals/AVX/comps/C1/p0.svg': svg('#b85c46'), 'appraisals/AVX/comps/C2/p0.svg': svg('#6b8fa8'), 'about/rb-agency.svg': svg('#2D5', 400, 200) };
const fv = (id, key, value, source) => ({ id, property_id: 'P1', key, value, display: null, source, source_name: source, source_ref: null, as_of: null, recorded_at: now, recorded_by: 'agent' });
const pr = (key, vid, ticked) => ({ property_id: 'P1', key, value_id: vid, chosen_by: 'tim', chosen_at: now, ticked: !!ticked });
const comp = (id, st, address, price, ago, bed, bath, floor, land, cv, i) => ({ id, appraisal_id: 'AVX', position: i + 1, shown: true, status: st, address, suburb: 'Rbvale', price, sold_on: st === 'listed' ? null : day(ago), listed_on: st === 'listed' ? day(ago) : null,
  method: 'Private treaty', days_to_sell: 20, bedrooms: bed, bathrooms: bath, floor_m2: floor, land_m2: land, cv, agency: 'RB Test Realty', sold_by_tim: false, ad_text: '', compare_text: '', compare_ticked: false, private_note: 'TIM-ONLY ' + id,
  ring: 'suburb', distance_m: 300, source: 'reinz', photo_hints: [], created_at: now, updated_at: now });
const sale = (i, suburb, month, dd, price, address, bed) => ({ id: 'MS' + i, suburb, sold_on: month + '-' + String(dd).padStart(2, '0'), price, address, bedrooms: bed, bathrooms: 1, floor_m2: 110 + i, land_m2: 600 + i * 10, property_type: 'house', days_to_sell: 18 + i, source: 'reinz', source_ref: 'R' + i, gathered_at: now });
const SETUP = { v: 1, suburb: 'Rbvale', preparedFor: 'Robin', note: 'Robin, thank you for having me through.', campaign: { kind: 'standard' }, method: 'deadline', plan: 'premium', basis: 'comparables', header: 'claude', tabs: { reinz: true }, market: false };
const SEED = () => ({ properties: [{ id: 'P1', address: 'RB 4 Add Road, Rbvale', title_ref: null, legal_description: null, owners_on_title: null, ownership: {}, description: {}, disclosures: {}, found: {}, provenance: {}, stage: 'appraisal', stage_at: now, cycle_at: null, created_at: now, updated_at: now }],
  property_people: [], agreements: [], agreement_people: [], agreement_events: [], prelistings: [], property_documents: [],
  property_rooms: [{ id: 'R1', property_id: 'P1', base: 'bedroom', label: 'Bedroom', position: 1, tim_class: 'bedroom', archived_at: null }, { id: 'R2', property_id: 'P1', base: 'bedroom', label: 'Bedroom 2', position: 2, tim_class: 'bedroom', archived_at: null },
    { id: 'R3', property_id: 'P1', base: 'bedroom', label: 'Bedroom 3', position: 3, tim_class: 'bedroom', archived_at: null }, { id: 'R4', property_id: 'P1', base: 'bedroom', label: 'Bedroom 4', position: 4, tim_class: 'study', archived_at: null }],
  property_fact_values: [fv('F1', 'pBath', '2', 'tim'), fv('F2', 'pLand', '760', 'council'), fv('F3', 'pFloor', '999', 'relab'), fv('F4', 'capital_value', '610000', 'council'), fv('F5', 'pBed', '7', 'relab')],
  property_profile: [pr('pBath', 'F1', true), pr('pLand', 'F2'), pr('pFloor', 'F3', true), pr('capital_value', 'F4'), pr('pBed', 'F5', true)],
  appraisal_views: [{ id: 'AVX', property_id: 'P1', title: 'x', address: 'RB 4 Add Road, Rbvale', prepared_for: 'Robin', prepared_on: day(0), status: 'draft', created_by: 'agent-test@example.com', created_at: now, updated_at: now, setup: SETUP, kind: 'standard', private_notes: '', fields: {}, sections: [] }],
  appraisal_comps: [comp('C1', 'sold', 'RB 12 Add Road, Rbvale', 560000, 20, 3, 1, 120, 640, 520000, 0), comp('C2', 'listed', 'RB 30 Add Road, Rbvale', 590000, 9, 4, 2, 150, 0, null, 1)],
  appraisal_media: [{ id: 'M1', appraisal_id: 'AVX', comp_id: 'C1', path: 'appraisals/AVX/comps/C1/p0.svg', cover: true, position: 0, source: 'upload', created_at: now }, { id: 'M2', appraisal_id: 'AVX', comp_id: 'C2', path: 'appraisals/AVX/comps/C2/p0.svg', cover: true, position: 0, source: 'upload', created_at: now }],
  storage_objects: { 'appraisals/AVX/comps/C1/p0.svg': { size: 900, mime: 'image/svg+xml', bucket: 'appraisal-media' }, 'appraisals/AVX/comps/C2/p0.svg': { size: 900, mime: 'image/svg+xml', bucket: 'appraisal-media' } },
  suburb_groups: [], market_months: [], appraisal_reports: [], appraisal_buyer_checks: [], appraisal_assets: [], appraisal_drafts: [], tim_reviews: [], ai_calls: [],
  market_sales: [sale(1, 'Rbvale', LM, 3, 548000, 'RB 2 Add Road, Rbvale', 3), sale(2, 'Rbvale', LM, 9, 560000, 'RB 12 Add Road, Rbvale', 3), sale(3, 'Rbvale', LM, 21, 612000, 'RB 9 Other Street, Rbvale', 4),
    sale(4, 'Othervale', LM, 5, 999000, 'RB 1 Elsewhere Road, Othervale', 5), sale(5, 'Rbvale', OLD, 15, 480000, 'RB 77 Older Road, Rbvale', 2)],
  contact_messages: [] });

(async () => {
  const b = await chromium.launch();
  const REQ = [], DLG = { no: false }, DLGS = [];
  const mk = async (w, scheme, o) => {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme || 'light', hasTouch: w < 500, isMobile: w < 500 }); ctx.setDefaultTimeout(10000);
    ctx.on('request', r => REQ.push(r.url()));
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
    await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    await ctx.route(PK + '/**', r => r.fulfill({ status: 404, contentType: 'text/html', body: shell }));
    await ctx.route(PK + '/portal**', r => r.fulfill({ status: 200, contentType: 'text/html', body: shell }));
    await ctx.route(OB + '**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await ctx.route(PK + '/onboarding/portal.js', r => r.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: bundle }));
    await ctx.route(PK + '/onboarding/assets/fonts/**', r => { const f = path.join(FONTS, path.basename(new URL(r.request().url()).pathname)); return fs.existsSync(f) ? r.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: '' }); });
    await ctx.route(PK + '/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
    await ctx.route(/youtube|vimeo|ytimg/, r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>stand-in player</title><p>player</p>' }));
    await ctx.addInitScript(bl => { window.__repoBlobs = window.__repoBlobs || {}; Object.entries(bl).forEach(([k, v]) => { window.__repoBlobs[k] = new Blob([v], { type: 'image/svg+xml' }); }); }, BLOBS);
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push('page: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|permission denied|Failed to fetch|net::ERR|row-level security|Agent only/.test(m.text())) errs.push('console: ' + m.text()); });
    p.on('dialog', d => { DLGS.push(d.message()); return DLG.no ? d.dismiss() : d.accept(); });
    return { ctx, p };
  };
  const wait = (p, ms) => p.waitForTimeout(ms || 600);
  const side = p => p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth);
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'out', `appraisal_add_${n}.png`), fullPage: true });
  const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb')));
  const tick = (p, sel) => p.evaluate(q => { const i = document.querySelector(q); if (!i) throw new Error('no ' + q); if (!i.checked) i.click(); }, sel);
  const note = (p, id) => p.evaluate(i => { const n = document.getElementById('bn-' + i); return n && !n.hidden ? n.textContent + '|' + n.dataset.kind : null; }, id);
  const edit = (p, fn) => p.evaluate(s => { const d = JSON.parse(localStorage.getItem('mockdb')); (new Function('d', s))(d); localStorage.setItem('mockdb', JSON.stringify(d)); }, fn);
  const signIn = async (p, email, seed) => {
    await p.goto(PB); await p.evaluate(([s, em]) => { localStorage.clear(); localStorage.setItem('mockAgents', JSON.stringify(['agent-test@example.com'])); localStorage.setItem('mocksession', JSON.stringify({ user: { id: em === 'agent-test@example.com' ? 'agent-1' : 'vendor-1', email: em } })); localStorage.setItem('mockdb', JSON.stringify(s)); }, [seed || SEED(), email]);
  };
  const write = async p => { await p.goto(PB + 'appraisals'); await wait(p, 600);
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('mockdb')), r = d.appraisal_views[0];
      const w = window.APPR.writeStandard(r.setup, [{ key: 'A', option: 'Your home', low: 555000, high: 595000 }], { address: r.address, preparedOn: r.prepared_on, cat: { PACKAGES, ITEMS, CATALOGUE } });
      Object.assign(r, { sections: w.sections, fields: w.fields, title: w.title }); localStorage.setItem('mockdb', JSON.stringify(d)); }); };

  // ── D. Tim's settings: picture, details, ways to reach him, About ──
  let X = await mk(390), p = X.p;
  await signIn(p, 'agent-test@example.com'); await write(p);
  await p.goto(PB + 'settings/about'); await wait(p, 900);
  out.spSeed = await p.evaluate(() => ({ name: document.querySelector('#spName').value, phone: document.querySelector('#spPhone').value, email: document.querySelector('#spEmail').value, avatar: !document.querySelector('#hdrAvatar').hidden }));
  expect(out.spSeed.name === 'Tim McGuire' && out.spSeed.phone === '027 562 7207' && out.spSeed.email === 'tim@mcguire.co.nz' && !out.spSeed.avatar, 'settings: seeded with the phone and email the vendor pages use; no picture, no circle: ' + JSON.stringify(out.spSeed));
  expect(!(await side(p)), 'settings: no sideways scroll at 390'); await shot(p, 'settings_390');
  // a wide picture becomes square, about 512 px
  const big = await p.evaluate(async () => { const c = document.createElement('canvas'); c.width = 1600; c.height = 900; const g = c.getContext('2d'); g.fillStyle = '#c47a5a'; g.fillRect(0, 0, 1600, 900); g.fillStyle = '#fff'; g.beginPath(); g.arc(800, 450, 300, 0, 7); g.fill();
    const bl = await new Promise(r => c.toBlob(r, 'image/png')); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); });
  await p.setInputFiles('#spPhoto', { name: 'tim.png', mimeType: 'image/png', buffer: Buffer.from(big, 'base64') }); await wait(p, 1500);
  let d = await db(p); const ph = d.site_profile[0].photo_path;
  out.photo = await p.evaluate(async pth => { const bl = window.__repoBlobs[pth]; if (!bl) return null; const im = await createImageBitmap(bl); return { w: im.width, h: im.height, type: bl.type }; }, ph);
  expect(/^profile\//.test(ph || '') && out.photo && out.photo.w === 512 && out.photo.h === 512 && out.photo.type === 'image/jpeg', 'the picture: made square, 512 px, a JPEG, in profile/: ' + JSON.stringify([ph, out.photo]));
  out.hdr = await p.evaluate(() => { const a = document.querySelector('#hdrAvatar'), r = a.getBoundingClientRect(), l = document.querySelector('header.top .logo-light').getBoundingClientRect(); return { shown: !a.hidden, round: getComputedStyle(a).borderRadius, right: r.left > l.right, w: Math.round(r.width), logoH: Math.round(l.height) }; });
  expect(out.hdr.shown && out.hdr.round === '50%' && out.hdr.right && out.hdr.w === 40 && out.hdr.logoH === 30, 'the circle in the header, opposite the logo, which is larger now: ' + JSON.stringify(out.hdr));
  // details, About, and the ways to reach him
  await p.fill('#spLic', 'Licensed salesperson, REAA 2008'); await p.fill('#spH-tim', 'About Tim'); await p.fill('#spB-tim', 'Invented words about Tim for a test.\n\nA second paragraph.');
  await p.fill('[data-ch-val="whatsapp"]', 'https://wa.me/123'); await tick(p, '[data-ch-on="whatsapp"]'); await p.click('#spSave'); await wait(p, 600);
  out.badWa = await note(p, 'spSave'); expect(/WhatsApp detail doesn't look right/.test(out.badWa || ''), 'a whole link pasted as the WhatsApp number is refused: ' + out.badWa);
  await p.fill('[data-ch-val="whatsapp"]', '+64 27 000 0000'); await p.fill('[data-ch-val="telegram"]', 'rbtester'); await tick(p, '[data-ch-on="telegram"]');
  await p.click('[data-ch-up="4"]'); await wait(p, 300);   // WhatsApp moved above "Send a message"
  await p.click('#spSave'); await wait(p, 900);
  out.spSaved = await note(p, 'spSave'); d = await db(p);
  expect(/^Saved/.test(out.spSaved || '') && d.site_profile[0].licence === 'Licensed salesperson, REAA 2008' && d.site_profile[0].about.tim.heading === 'About Tim' && d.site_profile[0].channels.map(c => c.key).slice(0, 5).join() === 'call,text,email,whatsapp,form', 'settings saved, in Tim\'s order: ' + JSON.stringify([out.spSaved, d.site_profile[0].channels.map(c => c.key)]));
  // replacing the picture deletes the old file; when the delete comes back short (as it did without Tim's read rule), he is told
  const pic2 = Buffer.from(big, 'base64');
  await p.setInputFiles('#spPhoto', { name: 'tim2.png', mimeType: 'image/png', buffer: pic2 }); await wait(p, 1500);
  d = await db(p); const ph2 = d.site_profile[0].photo_path;
  out.replace = { old: !!d.storage_objects[ph], now: !!d.storage_objects[ph2], note: await note(p, 'spPhotoPick') };
  expect(ph2 !== ph && !out.replace.old && out.replace.now && /\|ok$/.test(out.replace.note || ''), 'replace: the old picture file is gone, the new one kept: ' + JSON.stringify(out.replace));
  await p.evaluate(() => localStorage.setItem('mockSiteRemoveFail', '1'));
  await p.setInputFiles('#spPhoto', { name: 'tim3.png', mimeType: 'image/png', buffer: pic2 }); await wait(p, 1500);
  d = await db(p); const ph3 = d.site_profile[0].photo_path;
  out.replaceFail = { old: !!d.storage_objects[ph2], note: await note(p, 'spPhotoPick') };
  expect(ph3 !== ph2 && out.replaceFail.old && /could not be deleted/.test(out.replaceFail.note || '') && /\|err$/.test(out.replaceFail.note || ''), 'a delete that removes nothing is reported plainly under the button: ' + JSON.stringify(out.replaceFail));
  await p.click('#spPhotoRm'); await wait(p, 900); d = await db(p);
  out.removeFail = { path: d.site_profile[0].photo_path, file: !!d.storage_objects[ph3], note: await note(p, 'spPhotoPick') };
  expect(out.removeFail.path === null && out.removeFail.file && /could not be deleted/.test(out.removeFail.note || ''), 'remove: taken off, and the file left behind is reported: ' + JSON.stringify(out.removeFail));
  await p.evaluate(() => localStorage.removeItem('mockSiteRemoveFail'));
  await p.setInputFiles('#spPhoto', { name: 'tim4.png', mimeType: 'image/png', buffer: pic2 }); await wait(p, 1500);
  d = await db(p); const ph4 = d.site_profile[0].photo_path; await p.click('#spPhotoRm'); await wait(p, 900); d = await db(p);
  out.remove = { path: d.site_profile[0].photo_path, file: !!d.storage_objects[ph4], note: await note(p, 'spPhotoPick') };
  expect(out.remove.path === null && !out.remove.file && /^Removed/.test(out.remove.note || ''), 'remove: the file is deleted too: ' + JSON.stringify(out.remove));
  await p.setInputFiles('#spPhoto', { name: 'tim5.png', mimeType: 'image/png', buffer: pic2 }); await wait(p, 1500);
  // the agency tab's image (an About image, public read)
  await edit(p, "d.site_profile[0].about.agency={heading:'',body:'',image_path:'about/rb-agency.svg'};");

  // ── A and B on Tim's copy: Yours, tags, the suburb table, the order ──
  await p.goto(PB + 'appraisals/AVX'); await wait(p, 1500);
  const info = () => p.evaluate(() => { const D = document.querySelector('#apvDoc'); return {
    h2: Array.from(D.querySelectorAll('h2')).map(x => x.textContent),
    cards: Array.from(D.querySelectorAll('.apv-comp')).map(c => ({ head: Array.from(c.querySelectorAll('thead th')).map(x => x.textContent), rows: Array.from(c.querySelectorAll('tbody tr')).map(r => Array.from(r.children).map(x => x.textContent).join('|')), tags: Array.from(c.querySelectorAll('.apv-dtag')).map(x => x.textContent) })),
    sub: (() => { const s = D.querySelector('.apv-suburb'); return s ? { tiles: Array.from(s.querySelectorAll('.mk-tile')).map(t => t.querySelector('.k').textContent + '=' + t.querySelector('.v').textContent), rows: Array.from(s.querySelectorAll('tbody tr')).map(r => r.children[1].textContent), comp: Array.from(s.querySelectorAll('tr.apv-sub-comp')).map(r => r.children[1].textContent) } : null; })(),
    avatar: !!D.querySelector('.apv-top .apv-avatar img'), aboutBtn: !!D.querySelector('.apv-panel [data-about-open]'), text: D.innerText }; });
  let s = await info(); out.tim = Object.assign({}, s, { text: undefined });
  const c1 = s.cards[0];
  expect(c1.head.join('|') === 'Figure|This home|Yours' && c1.rows.join(';') === 'Bedrooms|3|3;Bathrooms|1|2;Land|640 m²|760 m²', 'A: Yours beside This home; a row only when both have it; bedrooms from Tim\'s room calls (3, not Relab\'s 7); no Relab floor area; no rating valuation until ticked: ' + JSON.stringify(c1));
  expect(c1.tags.join('|') === 'Yours has 1 more bathroom|Yours has 120 m² more land', 'A: the difference tags, from the figures: ' + JSON.stringify(c1.tags));
  expect(!/TIM-ONLY/.test(s.text), 'A: no private note on the page');
  expect(s.h2.join('|') === 'The price evidence at a glance|Sales and current listings|Everything that sold in Rbvale last month|My opinion of price|How I would sell it|When you\'re ready, I\'m ready', 'B: the comparables, then everything sold last month, then the opinion: ' + s.h2.join('|'));
  expect(s.sub && s.sub.rows.join('|') === 'RB 2 Add Road, Rbvale|Comparable 1 RB 12 Add Road, Rbvale|RB 9 Other Street, Rbvale' && s.sub.comp.length === 1, 'B: every sale in Rbvale last month (not another suburb or month), full street addresses, the comparable marked: ' + JSON.stringify(s.sub));
  expect(s.sub && s.sub.tiles.join('|') === 'Homes sold=3|Median sale price=$560,000|Lowest to highest=$548,000 to $612,000|Median days to sell=20', 'B: the month\'s totals: ' + JSON.stringify(s.sub && s.sub.tiles));
  expect(s.avatar && s.aboutBtn, 'E: the circle in the appraisal\'s top bar, and the About button on the panel');
  expect(!(await side(p)), 'Tim\'s copy: no sideways scroll at 390'); await shot(p, 'tim_390');

  // A: drafting the comparisons, unticked; Tim's own text reminded to mention both homes; the rating valuation when ticked
  await p.goto(PB + 'appraisals/AVX/comps'); await wait(p, 1000);
  await p.evaluate(() => localStorage.setItem('draftResult_compare', JSON.stringify({ text: 'This home has three bedrooms like yours, on a smaller section than yours.', private_note: 'Their carpet is worn.', problems: [] })));
  await p.click('#cmpDraft-C1'); await wait(p, 900);
  d = await db(p); const dc1 = d.appraisal_comps.find(c => c.id === 'C1');
  out.draft = { note: await note(p, 'cmpDraft-C1'), text: dc1.compare_text, ticked: dc1.compare_ticked, priv: dc1.private_note, ai: d.ai_calls.filter(a => a.purpose === 'appraisal compare draft').length, saved: d.appraisal_drafts.filter(x => x.part === 'compare').length };
  expect(/^Drafted\. It is unticked/.test(out.draft.note || '') && /smaller section than yours/.test(out.draft.text) && out.draft.ticked === false && /AI: Their carpet is worn\./.test(out.draft.priv) && out.draft.ai === 1 && out.draft.saved === 1, 'A: a drafted comparison arrives unticked; the weak point goes to Tim\'s private note; logged: ' + JSON.stringify(out.draft));
  await p.click('#cmpDraftAll'); await wait(p, 1500);
  d = await db(p); out.draftAll = { note: await note(p, 'cmpDraftAll'), n: d.appraisal_drafts.filter(x => x.part === 'compare').length, ticked: d.appraisal_comps.map(c => c.compare_ticked) };
  expect(/^Drafted 2 of 2/.test(out.draftAll.note || '') && out.draftAll.n === 3 && out.draftAll.ticked.every(t => t === false), 'A: Draft all, each unticked: ' + JSON.stringify(out.draftAll));
  await p.click('#cmpEdit-C1'); await wait(p, 400); await p.fill('#cfCmp', 'A lovely sunny home.'); await wait(p, 100);
  out.hint = await p.evaluate(() => [document.querySelector('#cfCmpHint').textContent, document.querySelector('#cfCmpHint').dataset.kind]);
  await p.fill('#cfCmp', 'This home is close to yours in size.'); out.hint2 = await p.evaluate(() => document.querySelector('#cfCmpHint').dataset.kind);
  expect(/should mention both homes/.test(out.hint[0]) && out.hint[1] === 'err' && out.hint2 === '', 'A: typing his own words, Tim is reminded to mention both homes: ' + JSON.stringify([out.hint, out.hint2]));
  await tick(p, '#cfTick'); await p.click('#cfSave'); await wait(p, 700);
  await tick(p, '#cmpShowCv'); await wait(p, 700);
  // A: drafting never replaces ticked wording; Draft all skips ticked and hidden, asks before replacing unticked wording, says why
  const aiN = async () => (await db(p)).ai_calls.filter(a => a.purpose === 'appraisal compare draft').length;
  let ai0 = await aiN(); DLGS.length = 0;
  await p.click('#cmpDraft-C1'); await wait(p, 600); d = await db(p);
  out.dTicked = { note: await note(p, 'cmpDraft-C1'), text: d.appraisal_comps.find(c => c.id === 'C1').compare_text, ai: (await aiN()) - ai0, asked: DLGS.length };
  expect(/ticked, so it is kept/.test(out.dTicked.note || '') && /close to yours in size/.test(out.dTicked.text) && out.dTicked.ai === 0 && out.dTicked.asked === 0, 'A: a single draft never replaces ticked wording, and costs nothing: ' + JSON.stringify(out.dTicked));
  await edit(p, "d.appraisal_comps.find(c=>c.id==='C2').shown=false;"); await p.reload(); await wait(p, 1000);
  await p.click('#cmpDraftAll'); await wait(p, 1000); d = await db(p);
  out.dAllSkip = { note: await note(p, 'cmpDraftAll'), c1: d.appraisal_comps.find(c => c.id === 'C1').compare_text, ai: (await aiN()) - ai0 };
  expect(/^Nothing to draft\. Skipped 2: 1 ticked, so kept, 1 hidden from the page\./.test(out.dAllSkip.note || '') && /close to yours in size/.test(out.dAllSkip.c1) && out.dAllSkip.ai === 0, 'A: Draft all skips ticked and hidden comparables and says why: ' + JSON.stringify(out.dAllSkip));
  await edit(p, "d.appraisal_comps.find(c=>c.id==='C2').shown=true;"); await p.reload(); await wait(p, 1000);
  const c2t = (await db(p)).appraisal_comps.find(c => c.id === 'C2').compare_text; DLG.no = true; DLGS.length = 0;
  await p.click('#cmpDraftAll'); await wait(p, 1000); d = await db(p);
  out.dAllKeep = { note: await note(p, 'cmpDraftAll'), same: d.appraisal_comps.find(c => c.id === 'C2').compare_text === c2t, ai: (await aiN()) - ai0, asked: DLGS.slice() };
  expect(/^Nothing to draft\. Skipped 2: 1 ticked, so kept, 1 with your own wording kept\./.test(out.dAllKeep.note || '') && out.dAllKeep.same && out.dAllKeep.ai === 0 && out.dAllKeep.asked.length === 1 && /haven't ticked/.test(out.dAllKeep.asked[0]), 'A: Draft all asks before replacing unticked wording; Cancel keeps it: ' + JSON.stringify(out.dAllKeep));
  DLGS.length = 0; await p.click('#cmpDraft-C2'); await wait(p, 600);
  out.dOneKeep = { note: await note(p, 'cmpDraft-C2'), asked: DLGS.length, ai: (await aiN()) - ai0 };
  expect(/^Kept your wording/.test(out.dOneKeep.note || '') && out.dOneKeep.asked === 1 && out.dOneKeep.ai === 0, 'A: a single draft asks first when there is unticked wording: ' + JSON.stringify(out.dOneKeep));
  DLG.no = false;
  await p.evaluate(() => { window.__mockDB.appraisal_comps.find(c => c.id === 'C2').compare_ticked = true; });   // ticked in another tab; this page still shows it unticked
  await p.click('#cmpDraft-C2'); await wait(p, 900); d = await db(p);
  out.dLate = { note: await note(p, 'cmpDraft-C2'), same: d.appraisal_comps.find(c => c.id === 'C2').compare_text === c2t, ticked: d.appraisal_comps.find(c => c.id === 'C2').compare_ticked };
  expect(/ticked or changed meanwhile/.test(out.dLate.note || '') && out.dLate.same && out.dLate.ticked === true, 'A: wording ticked meanwhile is kept: the save only touches an unticked row: ' + JSON.stringify(out.dLate));
  await edit(p, "d.appraisal_comps.find(c=>c.id==='C2').compare_ticked=false;");
  // and the other race: the page shows no wording, another tab writes some (unticked) meanwhile; Draft all doesn't replace it
  await edit(p, "d.appraisal_comps.find(c=>c.id==='C2').compare_text='';"); await p.reload(); await wait(p, 1000);
  await p.evaluate(() => { window.__mockDB.appraisal_comps.find(c => c.id === 'C2').compare_text = 'Written in another tab.'; });
  ai0 = await aiN(); DLGS.length = 0; await p.click('#cmpDraftAll'); await wait(p, 1200); d = await db(p);
  out.dLateText = { note: await note(p, 'cmpDraftAll'), text: d.appraisal_comps.find(c => c.id === 'C2').compare_text, asked: DLGS.length };
  expect(out.dLateText.text === 'Written in another tab.' && out.dLateText.asked === 0 && /Drafted 0 of 1\. Skipped 2: 1 ticked, so kept, 1 ticked or changed in another tab meanwhile, so kept\./.test(out.dLateText.note || ''), 'A: unticked wording written in another tab meanwhile is kept by Draft all, and said so: ' + JSON.stringify(out.dLateText));
  // the range is never on the early charts (Tim, 28 November 2026): the price evidence and the market charts show the sales alone, and
  // the range first appears in the opinion of price, as the pyramid
  out.rgSwitch = await p.evaluate(() => !!document.querySelector('#cmpRangeCharts'));
  expect(!out.rgSwitch, 'no switch for the range on the charts: it is the rule');
  await p.goto(PB + 'appraisals/AVX'); await wait(p, 1400);
  out.rgEarly = await p.evaluate(() => { const D = document.querySelector('#apvDoc'), figs = Array.from(D.querySelectorAll('.mk-fig')).filter(f => !f.closest('.apv-opinion')), op = D.querySelector('.apv-opinion');
    return { figs: figs.length, range: figs.some(f => f.querySelector('.mk-range, .mk-ref') || /My range|range is marked/i.test(f.textContent)), pyr: op ? op.querySelectorAll('.apv-pyr svg').length : 0, opinion: /\$555,000/.test(op ? op.innerText : '') }; });
  expect(out.rgEarly.figs > 0 && !out.rgEarly.range && out.rgEarly.pyr === 1 && out.rgEarly.opinion, 'the price evidence shows the sales alone; the range first appears in the opinion, with the pyramid: ' + JSON.stringify(out.rgEarly));
  out.rgMarket = await p.evaluate(() => { const months = []; for (let i = 0; i < 6; i++) months.push({ area: 'Dunedin', month: '2026-0' + (i + 1) + '-01', median: 500000 + i * 5000, lower_quartile: 420000, upper_quartile: 600000, sales: 100 + i, days_to_sell: 30, bands: [{ from: 0, to: 500000, count: 40 }, { from: 500000, to: 700000, count: 50 }, { from: 700000, to: null, count: 20 }], source: 'reinz' });
    const rec = JSON.parse(localStorage.getItem('mockdb')).appraisal_views[0], x = document.createElement('div'); x.innerHTML = window.APPR.render(rec, { comps: [], months, market: true, area: 'Dunedin' });
    const figs = Array.from(x.querySelectorAll('.mk-fig')); return { figs: figs.length, mine: figs.filter(f => /My range|range is marked/i.test(f.textContent) || f.querySelector('.mk-band.on, .mk-ref, .mk-range')).length, bandCols: Array.from(x.querySelectorAll('[data-chart="bands"] th')).map(t => t.textContent) }; });
  expect(out.rgMarket.figs >= 4 && out.rgMarket.mine === 0 && !out.rgMarket.bandCols.includes('My range'), 'the market charts show no range, no "My range" line, label or note: ' + JSON.stringify(out.rgMarket));
  await p.goto(PB + 'appraisals/AVX'); await wait(p, 1400); s = await info();
  expect(s.cards[0].rows.includes('Rating valuation|$520,000|$610,000') && /close to yours in size/.test(s.text) && !/smaller section than yours/.test(s.text), 'A: the rating valuation once ticked; only the ticked comparison shows: ' + JSON.stringify(s.cards[0].rows));

  // E: the overlay from the circle on Tim's own view: preview form, tabs, contact actions; Esc closes and focus returns
  await p.click('#apvDoc .apv-avatar'); await wait(p, 400);
  out.dlgTim = await p.evaluate(() => { const g = document.querySelector('#aboutDlg'); return { open: !g.hidden, inside: g.contains(document.activeElement), acts: Array.from(g.querySelectorAll('.ab-act')).map(a => (a.getAttribute('href') || a.id) + '|' + a.textContent),
    tabs: Array.from(g.querySelectorAll('[role="tab"]')).map(t => t.textContent + ':' + t.getAttribute('aria-selected')), form: !!g.querySelector('#abForm, #abFormBtn'), preview: /Preview|Only you see/.test(g.textContent), settings: !!g.querySelector('[data-plink="settings/about"]'), photo: !!g.querySelector('.ab-photo') }; });
  expect(out.dlgTim.open && out.dlgTim.inside && out.dlgTim.photo, 'E: the circle opens the overlay with focus inside it: ' + JSON.stringify(out.dlgTim));
  expect(out.dlgTim.acts.join(',') === 'tel:+64275627207|Call,sms:+64275627207|Text,mailto:tim@mcguire.co.nz|Email,https://wa.me/64270000000|WhatsApp,https://t.me/rbtester|Telegram', 'E: the ways to reach Tim, in his order, as each service writes its links (no form on his copy of an appraisal): ' + JSON.stringify(out.dlgTim.acts));
  expect(out.dlgTim.tabs.join() === 'Tim:true,McGuire Real Estate:false' && !out.dlgTim.form && !out.dlgTim.preview && !out.dlgTim.settings, 'E: both tabs (the agency one has only its image); on Tim\'s copy only what a vendor sees: no preview form, no settings link: ' + JSON.stringify(out.dlgTim));
  await p.focus('#abTab-tim'); await p.keyboard.press('ArrowRight'); await wait(p, 100);
  out.tabKey = await p.evaluate(() => [document.activeElement.id, document.querySelector('#abPanel-tim').hidden, document.querySelector('#abPanel-agency').hidden]);
  expect(out.tabKey.join() === 'abTab-agency,true,false', 'E: the arrow keys move between the tabs: ' + out.tabKey);
  for (let i = 0; i < 25; i++) await p.keyboard.press('Tab');
  out.trap = await p.evaluate(() => document.querySelector('#aboutDlg').contains(document.activeElement));
  await p.keyboard.press('Escape'); await wait(p, 200);
  out.esc = await p.evaluate(() => ({ closed: document.querySelector('#aboutDlg').hidden, back: !!(document.activeElement && document.activeElement.classList.contains('apv-avatar')) }));
  expect(out.trap && out.esc.closed && out.esc.back, 'E: Tab stays inside the dialog; Esc closes it and focus goes back to the circle: ' + JSON.stringify([out.trap, out.esc]));
  await p.click('#apvDoc .apv-panel [data-about-open]'); await wait(p, 300);
  expect(await p.evaluate(() => !document.querySelector('#aboutDlg').hidden), 'E: the panel\'s About button opens the same overlay'); await shot(p, 'overlay_tim_390');
  await p.keyboard.press('Escape');
  // print: the contact line and the About in full under the panel, no form, no circle
  await p.emulateMedia({ media: 'print' });
  out.print = await p.evaluate(() => { const vis = e => !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; const ap = document.querySelector('.apv-about-print');
    return { about: vis(ap) && /About Tim/.test(ap.innerText) && /second paragraph/.test(ap.innerText) && /027 562 7207/.test(ap.innerText), btn: vis(document.querySelector('.apv-about-btn')), avatar: vis(document.querySelector('.apv-avatar')), dlg: vis(document.querySelector('#aboutDlg')) }; });
  expect(out.print.about && !out.print.btn && !out.print.avatar && !out.print.dlg, 'E: print shows the contact line and both About sections, no buttons: ' + JSON.stringify(out.print));
  await p.emulateMedia({ media: 'screen' });

  // E: Tim's own lines (the preview form, "your About is empty", the settings link) only on his other pages: never while presenting,
  // on his copy of an appraisal, or on a page done in person with the vendor
  const dlgOn = () => p.evaluate(() => { const g = document.querySelector('#aboutDlg'); return { open: !g.hidden, form: !!g.querySelector('#abForm, #abFormBtn'), disabled: !!g.querySelector('#abFSend[disabled]'), preview: /Preview/.test(g.textContent), empty: /Your About is empty|Only you see/.test(g.textContent), settings: !!g.querySelector('[data-plink="settings/about"]') }; });
  const saveAbout = await p.evaluate(() => JSON.stringify(window.__mockDB.site_profile[0].about));
  await p.evaluate(() => { window.__mockDB.site_profile[0].about = {}; localStorage.setItem('mockdb', JSON.stringify(window.__mockDB)); });
  const modes = {};
  for (const [k, u, sel] of [['home', PB, '#hdrAvatar'], ['copy', PB + 'appraisals/AVX', '#apvDoc .apv-avatar'], ['present', PB + 'appraisals/AVX/present', '#apvDoc .apv-avatar'], ['inPerson', PB + 'properties/P1/agreement/new', '#hdrAvatar']]) {
    await p.goto(u); await wait(p, 1300);
    const has = await p.evaluate(q => { const e = document.querySelector(q); return !!e && e.getClientRects().length > 0; }, sel);
    if (!has) { modes[k] = 'no circle'; continue; }
    await p.click(sel); await wait(p, 400); modes[k] = await dlgOn(); await p.keyboard.press('Escape'); await wait(p, 150);
  }
  out.modes = modes;
  const vend = m => m && m.open && !m.form && !m.preview && !m.empty && !m.settings;
  expect(modes.home && modes.home.open && modes.home.form && modes.home.disabled && modes.home.preview && modes.home.empty && modes.home.settings, 'E: on Tim\'s own pages, the preview form and the "About is empty" line with its settings link: ' + JSON.stringify(modes.home));
  expect(vend(modes.copy) && vend(modes.present), 'E: on his copy and while presenting, only what a vendor sees: ' + JSON.stringify([modes.copy, modes.present]));
  expect(vend(modes.inPerson), 'E: on a page done in person, only what a vendor sees: ' + JSON.stringify(modes.inPerson));
  await p.evaluate(a => { window.__mockDB.site_profile[0].about = JSON.parse(a); localStorage.setItem('mockdb', JSON.stringify(window.__mockDB)); }, saveAbout);

  // off means off (Tim, 28 November 2026): one function decides the phone and email on the appraisal (signature, closing, print), and
  // site_profile_public() leaves out a phone or email whose switches are all off
  out.contactFor = await p.evaluate(() => { const A = window.APPR, S = (call, text, email) => ({ name: 'Tim', phone: '021 000 000', email: 'tim@example.test', channels: [{ key: 'call', on: call }, { key: 'text', on: text }, { key: 'email', on: email }] });
    const v = (c, t) => A.reachVerb(A.contactFor(S(c, t, true)));
    return { off: A.contactFor(S(false, false, false)), on: A.contactFor(S(true, true, true)), verbs: [v(true, true), v(true, false), v(false, true), v(false, false)], none: A.contactFor({}) }; });
  expect(out.contactFor.off.phone === '' && out.contactFor.off.email === '' && out.contactFor.on.phone === '021 000 000' && out.contactFor.on.email === 'tim@example.test' && out.contactFor.verbs.join('|') === 'Call or text|Call|Text|' && out.contactFor.none.phone === '',
    'contact: off means off; the closing line reads Call or text, Call, or Text: ' + JSON.stringify(out.contactFor));
  const look = async () => { await p.goto(PB + 'appraisals/AVX'); await wait(p, 1400);
    const r = await p.evaluate(() => { const D = document.querySelector('#apvDoc'), c = D.querySelector('.apv-close'), pr = D.querySelector('.apv-about-contact');
      return { sig: (D.querySelector('.apv-sig') || {}).textContent || '', close: c ? c.textContent : null, print: pr ? pr.textContent : null, all: D.innerHTML }; });
    await p.click('#apvDoc .apv-avatar'); await wait(p, 300);
    r.dlg = await p.evaluate(() => { const g = document.querySelector('#aboutDlg'); return { acts: Array.from(g.querySelectorAll('.ab-act')).map(a => a.textContent), html: g.innerHTML }; }); await p.keyboard.press('Escape');
    r.pub = await p.evaluate(async () => (await window.supabase.createClient('x', 'y').rpc('site_profile_public')).data); return r; };
  const setCh = on => p.evaluate(o => { const r = window.__mockDB.site_profile[0]; r.channels.forEach(c => { if (c.key in o) c.on = o[c.key]; }); localStorage.setItem('mockdb', JSON.stringify(window.__mockDB)); }, on);
  await setCh({ call: false, text: true }); let cv = await look();
  out.textOnly = { sig: cv.sig, close: cv.close, acts: cv.dlg.acts };
  expect(/Questions at any stage\? Text Tim on 027 562 7207\./.test(cv.close || '') && /027 562 7207/.test(cv.sig) && !cv.dlg.acts.includes('Call') && cv.dlg.acts.includes('Text'), 'switches: Text alone reads "Text Tim on ..."; no Call button: ' + JSON.stringify(out.textOnly));
  await setCh({ call: false, text: false, email: false }); cv = await look();
  out.allOff = { sig: cv.sig, close: cv.close, print: cv.print, acts: cv.dlg.acts, pub: { phone: cv.pub && cv.pub.phone, email: cv.pub && cv.pub.email } };
  expect(cv.close === null && !/027 562 7207|562 7207|tim@mcguire\.co\.nz/.test(cv.all + cv.dlg.html) && !cv.dlg.acts.some(a => /Call|Text|Email/.test(a)) && cv.pub && cv.pub.phone === '' && cv.pub.email === '',
    'switches: Call, Text and Email off: the phone and email appear nowhere a vendor sees (signature, closing, print, overlay), and site_profile_public leaves them out: ' + JSON.stringify(out.allOff));
  await setCh({ call: true, text: true, email: true }); cv = await look();
  expect(/Call or text Tim on/.test(cv.close || '') && /tim@mcguire\.co\.nz/.test(cv.sig), 'switches back on: Call or text, and the email in the signature');
  { const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'appraisal-core.js'), 'utf8'), cfBody = (/function contactFor\(S\) \{[\s\S]*?\n  \}/.exec(src) || [''])[0], uses = (src.replace(cfBody, '').match(/\bS\.(phone|email)\b/g) || []).length;
    expect(cfBody && uses === 0 && /CF\.phone, CF\.email/.test(src) && /if \(written && CF\.phone\)/.test(src) && /cf = contactFor\(S\)/.test(src), 'contact: the signature, closing and print lines all go through contactFor (' + uses + ' direct uses)'); }

  // C: the personal video: sections screen, then the appraisal; nothing from YouTube until pressed
  await p.goto(PB + 'appraisals/AVX/sections'); await wait(p, 1000);
  await p.fill('#absPvUrl', 'https://evil.example/watch?v=dQw4w9WgXcQ'); await p.click('#absSave'); await wait(p, 500);
  out.pvBad = await note(p, 'absSave'); expect(/YouTube or Vimeo/.test(out.pvBad || ''), 'C: a link that isn\'t YouTube or Vimeo is refused: ' + out.pvBad);
  await p.fill('#absPvUrl', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12'); await p.click('#absSave'); await wait(p, 700);
  d = await db(p); const av = d.appraisal_views[0];
  out.pvSec = av.sections.filter(x => x.type === 'pvideo');
  expect(out.pvSec.length === 1 && out.pvSec[0].id === 'dQw4w9WgXcQ' && out.pvSec[0].provider === 'youtube' && !JSON.stringify(out.pvSec).includes('watch?v') && av.sections.findIndex(x => x.type === 'pvideo') < av.sections.findIndex(x => x.type === 'heading'), 'C: only the video\'s id is kept, above the letter: ' + JSON.stringify(out.pvSec));
  out.pvSetup = av.setup.pvideo;
  expect(JSON.stringify(out.pvSetup) === '{"provider":"youtube","id":"dQw4w9WgXcQ"}', 'C: the set-up keeps the provider and id only, not the link as typed: ' + JSON.stringify(out.pvSetup));
  await p.goto(PB + 'appraisals/AVX/sections'); await wait(p, 1000);
  out.pvField = await p.inputValue('#absPvUrl');
  expect(out.pvField === 'https://youtu.be/dQw4w9WgXcQ', 'C: the field shows a plain link rebuilt from the id: ' + out.pvField);
  out.pvVimeo = await p.evaluate(() => { const A = window.APPR, e = A.videoEmbed('https://vimeo.com/123456789/abcdef1234?share=copy'); return { e, back: A.videoUrl(A.pvOf({ provider: 'vimeo', id: e.id, hash: e.hash })), old: A.pvOf({ url: 'https://youtu.be/dQw4w9WgXcQ' }), bad: A.pvOf({ provider: 'youtube', id: 'x"><script>' }) }; });
  expect(out.pvVimeo.back === 'https://vimeo.com/123456789/abcdef1234' && out.pvVimeo.old && out.pvVimeo.old.id === 'dQw4w9WgXcQ' && out.pvVimeo.bad === null, 'C: Vimeo keeps its privacy hash; an older set-up\'s link still reads; a bad id reads as nothing: ' + JSON.stringify(out.pvVimeo));
  REQ.length = 0; await p.goto(PB + 'appraisals/AVX'); await wait(p, 1400);
  out.pv = await p.evaluate(() => ({ poster: !!document.querySelector('.apv-pvideo .apv-pv-play'), iframe: !!document.querySelector('.apv-pvideo iframe'), before: (() => { const a = document.querySelector('.apv-pvideo'), l = document.querySelector('.apv-sig'); return !!(a && l && (a.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING)); })() }));
  out.pvCalls0 = REQ.filter(u => /youtube|vimeo|ytimg/.test(u)).length;
  expect(out.pv.poster && !out.pv.iframe && out.pv.before && out.pvCalls0 === 0, 'C: a poster above the letter; nothing loaded from YouTube until pressed: ' + JSON.stringify([out.pv, out.pvCalls0]));
  await p.click('.apv-pv-play'); await wait(p, 700);
  out.pvIf = await p.evaluate(() => { const f = document.querySelector('.apv-pvideo iframe'); return f ? { src: f.src, sandbox: f.getAttribute('sandbox'), ref: f.getAttribute('referrerpolicy'), title: f.title } : null; });
  expect(out.pvIf && out.pvIf.src === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&autoplay=1' && /allow-scripts/.test(out.pvIf.sandbox) && !/allow-top-navigation/.test(out.pvIf.sandbox) && out.pvIf.ref === 'strict-origin-when-cross-origin', 'C: pressed, the player loads from the address the page built, sandboxed: ' + JSON.stringify(out.pvIf));
  await p.emulateMedia({ media: 'print' }); out.pvPrint = await p.evaluate(() => getComputedStyle(document.querySelector('.apv-pvideo')).display); await p.emulateMedia({ media: 'screen' });
  expect(out.pvPrint === 'none', 'C: print shows nothing for the video');
  // with an uploaded introduction too, the link wins
  const W = await p.evaluate(() => window.APPR.writeStandard(Object.assign({}, JSON.parse(localStorage.getItem('mockdb')).appraisal_views[0].setup, { intro: { asset: 'A1' } }), [{ key: 'A', option: 'Your home', low: 1, high: 2 }], { cat: {} }).sections.map(x => x.type));
  expect(W.includes('pvideo') && !W.includes('intro'), 'C: the link wins over an uploaded introduction: ' + W.join());
  await X.ctx.close();

  // ── E: a vendor, signed in, on the vendor's pages: the circle, the overlay, "Send a message" ──
  X = await mk(390); p = X.p;
  await p.goto(OB); await p.evaluate(sd => { localStorage.clear(); sd.site_profile = [{ id: true, name: 'Tim McGuire', licence: 'Licensed salesperson, REAA 2008', phone: '027 562 7207', email: 'tim@mcguire.co.nz', photo_path: 'profile/rb.svg', about: { tim: { heading: 'About Tim', body: 'Invented words.' }, agency: {} },
    channels: [{ key: 'call', on: true }, { key: 'text', on: false }, { key: 'email', on: true }, { key: 'form', on: true }, { key: 'whatsapp', on: true, value: '' }] }]; sd.storage_objects['profile/rb.svg'] = { size: 900, mime: 'image/svg+xml', bucket: 'site-public' };
    localStorage.setItem('mockdb', JSON.stringify(sd)); localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'vendor-1', email: 'robin@example.com' } })); }, SEED());
  await p.addInitScript(() => { window.__repoBlobs = window.__repoBlobs || {}; window.__repoBlobs['profile/rb.svg'] = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="30" fill="#D9432C"/></svg>'], { type: 'image/svg+xml' }); });
  await p.goto(OB); await wait(p, 1400);
  out.vend = await p.evaluate(() => { const a = document.querySelector('#hdrAvatar'); return { shown: !a.hidden, img: a.querySelector('img').naturalWidth > 0 }; });
  expect(out.vend.shown && out.vend.img, 'E: the circle on the vendor\'s pages: ' + JSON.stringify(out.vend)); await shot(p, 'vendor_header_390');
  await p.click('#hdrAvatar'); await wait(p, 400);
  out.vdlg = await p.evaluate(() => { const g = document.querySelector('#aboutDlg'); return { acts: Array.from(g.querySelectorAll('.ab-act')).map(a => a.textContent), tabs: g.querySelectorAll('[role="tab"]').length, panels: Array.from(g.querySelectorAll('.ab-tabp h3')).map(h => h.textContent) }; });
  expect(out.vdlg.acts.join() === 'Call,Email,Send a message' && out.vdlg.tabs === 0 && out.vdlg.panels.join() === 'About Tim', 'E: only ways that are on and complete; one tab with content, so no tab list: ' + JSON.stringify(out.vdlg));
  expect(!(await side(p)), 'E: overlay at 390, no sideways scroll'); await shot(p, 'overlay_vendor_390');
  await p.click('#abFormBtn'); await p.fill('#abFName', 'Robin'); await p.fill('#abFMsg', 'Hello Tim, <b>a question</b> about the campaign.'); await p.click('#abFSend'); await wait(p, 700);
  out.sent = await note(p, 'abFSend'); d = await db(p);
  const cm = d.contact_messages[0] || {};
  out.mails = await p.evaluate(() => JSON.parse(localStorage.getItem('contactMails') || '[]'));
  expect(/^Sent\./.test(out.sent || '') && cm.from_email === 'robin@example.com' && cm.name === 'Robin' && cm.emailed_at && out.mails.length === 1 && out.mails[0].to === 'tim@mcguire.co.nz', 'E: the message is saved as the signed-in vendor and emailed to Tim once: ' + JSON.stringify([out.sent, cm.from_email, out.mails]));
  await p.click('#abFSend'); await wait(p, 300); out.empty = await note(p, 'abFSend'); expect(/Write your message/.test(out.empty || ''), 'E: an empty message is refused: ' + out.empty);
  for (let i = 0; i < 4; i++) { await p.fill('#abFMsg', 'Again ' + i); await p.click('#abFSend'); await wait(p, 350); }
  await p.fill('#abFMsg', 'Sixth'); await p.click('#abFSend'); await wait(p, 400); out.sixth = await note(p, 'abFSend');
  expect(/five messages today/.test(out.sixth || '') && (await db(p)).contact_messages.length === 5, 'E: five a day each: ' + out.sixth);
  await X.ctx.close();

  // ── E: not signed in: the public pages show the circle and the overlay, with no form ──
  X = await mk(390); p = X.p;
  await p.goto(OB); await p.evaluate(sd => { localStorage.clear(); sd.site_profile = [{ id: true, name: 'Tim McGuire', licence: '', phone: '027 562 7207', email: 'tim@mcguire.co.nz', photo_path: 'profile/rb.svg', about: {}, channels: [{ key: 'call', on: true }, { key: 'form', on: true }] }]; localStorage.setItem('mockdb', JSON.stringify(sd)); }, SEED());
  await p.addInitScript(() => { window.__repoBlobs = window.__repoBlobs || {}; window.__repoBlobs['profile/rb.svg'] = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="30" fill="#2D5BFF"/></svg>'], { type: 'image/svg+xml' }); });
  await p.goto(OB + '#journey'); await p.reload(); await wait(p, 1400);
  const hasAv = await p.evaluate(() => !document.querySelector('#hdrAvatar').hidden);
  if (hasAv) { await p.click('#hdrAvatar'); await wait(p, 300); }
  out.anon = await p.evaluate(() => ({ form: !!document.querySelector('#abFormBtn'), acts: Array.from(document.querySelectorAll('#aboutDlg .ab-act')).map(a => a.textContent) }));
  expect(hasAv && !out.anon.form && out.anon.acts.join() === 'Call', 'E: not signed in: the circle and the overlay, Call, and no form: ' + JSON.stringify([hasAv, out.anon]));
  await X.ctx.close();

  // ── E: Tim reads the message on Needs you and marks it done; wide and dark; nothing there, nothing shown ──
  X = await mk(1280, 'dark'); p = X.p;
  const seed2 = SEED(); seed2.contact_messages = [{ id: '5b0f7d1e-2c3a-4d5e-8f90-123456789abc', from_email: 'robin@example.com', name: 'Robin <b>', phone: '', preferred: 'email', message: 'Hi <script>x</script>', appraisal_id: null, page: '', sent_at: now, emailed_at: now, done_at: null, done_by: null }];
  await signIn(p, 'agent-test@example.com', seed2); await write(p);
  await p.goto(PB); await wait(p, 1400);
  out.needs = await p.evaluate(() => Array.from(document.querySelectorAll('.needs li strong')).map(x => x.textContent));
  expect(out.needs.includes('Message from Robin <b>'), 'E: the message is on Needs you (as text): ' + JSON.stringify(out.needs));
  await p.goto(PB + 'messages/5b0f7d1e-2c3a-4d5e-8f90-123456789abc'); await wait(p, 900);
  out.msg = await p.evaluate(() => ({ text: document.querySelector('.cm-msg').textContent, script: !!document.querySelector('#cmPage script') }));
  await p.click('#cmDone'); await wait(p, 500);
  expect(out.msg.text === 'Hi <script>x</script>' && !out.msg.script && (await db(p)).contact_messages[0].done_at, 'E: shown as written, never as markup; Done takes it off: ' + JSON.stringify(out.msg));
  // no picture and no About: no circle, no About button; no sales held for last month: no suburb section, and Tim is prompted
  await edit(p, "d.market_sales=[]; d.site_profile=[{id:true,name:'Tim McGuire',licence:'',phone:'',email:'',photo_path:null,about:{},channels:[]}];");
  await p.goto(PB + 'appraisals/AVX'); await wait(p, 1400);
  out.none = await p.evaluate(() => ({ av: !!document.querySelector('#apvDoc .apv-avatar'), hdr: !document.querySelector('#hdrAvatar').hidden, btn: !!document.querySelector('#apvDoc [data-about-open]'), sub: !!document.querySelector('.apv-suburb'), close: !!document.querySelector('.apv-close'), prompt: (document.querySelector('#apvPrompts') || {}).innerText || '' }));
  expect(!out.none.av && !out.none.hdr && !out.none.btn && !out.none.sub && !out.none.close && /No sales are loaded for Rbvale/.test(out.none.prompt) && /Your About is empty/.test(out.none.prompt), 'G: nothing there, nothing shown, and Tim is prompted: ' + JSON.stringify(out.none));
  expect(!(await side(p)), 'wide dark: no sideways scroll'); await shot(p, 'tim_1280_dark');
  await X.ctx.close();

  // ── the price pyramid in the opinion of price (Tim, 28 November 2026): one range, two ranges, phone, wide, dark and print ──
  const pyr = () => p.evaluate(() => { const op = document.querySelector('#apvDoc .apv-opinion'); if (!op) return null;
    return Array.from(op.querySelectorAll('.apv-pyr')).map(f => { const svg = f.querySelector('svg'), poly = k => { const ys = svg.querySelector('.apv-pyr-' + k).getAttribute('points').split(' ').map(pt => +pt.split(',')[1]); return [Math.min(...ys), Math.max(...ys)]; };
      const br = svg.querySelector('.apv-pyr-br').getAttribute('d'), m = /^M[\d.]+,([\d.]+) h8 V([\d.]+)/.exec(br), texts = Array.from(svg.querySelectorAll('text')).map(t => ({ t: t.textContent, y: +t.getAttribute('y'), h: Math.round(parseFloat(getComputedStyle(t).fontSize) * svg.getBoundingClientRect().width / svg.viewBox.baseVal.width * 10) / 10 }));
      const r = f.getBoundingClientRect(), bands = ['red', 'orange', 'yellow', 'green'].map(k => [k, poly(k)]), red = bands[0][1], green = bands[3][1];
      return { cap: (f.querySelector('.apv-pyr-cap') || {}).textContent || '', alt: svg.getAttribute('aria-label'), role: svg.getAttribute('role'), top: m ? +m[1] : null, bottom: m ? +m[2] : null, red, green,
        fills: ['red', 'orange', 'yellow', 'green'].map(k => getComputedStyle(svg.querySelector('.apv-pyr-' + k)).fill), texts, left: Math.round(r.left), w: Math.round(r.width), smallest: Math.min(...texts.map(x => x.h)) }; }); });
  const words = () => p.evaluate(() => { const w = document.querySelector('#apvDoc .apv-opinion .apv-pw'); return w ? w.innerText : ''; });
  X = await mk(390); p = X.p;
  await signIn(p, 'agent-test@example.com'); await write(p);
  await p.goto(PB + 'appraisals/AVX'); await wait(p, 1400);
  let P = await pyr(); out.pyr1 = P;
  const p1 = P && P[0];
  expect(P && P.length === 1 && p1.role === 'img' && p1.alt === 'Appraisal range $555,000 to $595,000. Above it, the top price is set by competition between buyers.', 'pyramid: one, with the text alternative: ' + JSON.stringify(P && P.map(x => x.alt)));
  expect(p1 && p1.fills.join('|') === 'rgb(226, 75, 74)|rgb(239, 159, 39)|rgb(250, 199, 117)|rgb(151, 196, 89)', 'pyramid: Tim\'s colours, red, orange, yellow and green: ' + JSON.stringify(p1 && p1.fills));
  expect(p1 && p1.bottom === p1.green[0] && Math.abs(p1.top - (p1.red[0] + p1.red[1]) / 2) < 1 && (p1.red[1] - p1.red[0]) >= 70, 'pyramid: the range runs from the top of the green to halfway up the (enlarged) red peak: ' + JSON.stringify(p1 && { top: p1.top, bottom: p1.bottom, red: p1.red, green: p1.green }));
  const T = t => p1 && p1.texts.find(x => x.t === t);
  expect(p1 && T('$555,000') && T('$595,000') && T('Got to be better than') && T('Top of range') && T('Appraisal range') && T('Cherry on top:') && T('set by competition between buyers') && T('Widest base: the most buyers') && Math.abs(T('$595,000').y - p1.top) < 20 && Math.abs(T('$555,000').y - p1.bottom) < 20,
    'pyramid: the bracket carries Tim\'s figures at "Got to be better than" and "Top of range"; the labels name every part: ' + JSON.stringify(p1 && p1.texts.map(x => x.t)));
  expect(p1 && !p1.texts.some(x => /\$/.test(x.t) && x.y < p1.top - 1), 'pyramid: nothing above the top of the range carries a number: ' + JSON.stringify(p1 && p1.texts.filter(x => /\$/.test(x.t))));
  expect(p1 && p1.smallest >= 12 && p1.w <= 390 && p1.w >= 330, 'pyramid: the full width of the card and readable at 390 (smallest label drawn at ' + (p1 && p1.smallest) + ' px, width ' + (p1 && p1.w) + '), within the screen');
  out.pw1 = await words();
  out.pwOrder = await p.evaluate(() => { const o = document.querySelector('#apvDoc .apv-opinion'), w = o.querySelector('.apv-pw'), y = o.querySelector('.apv-pyrs'), c = o.querySelector('.apv-opin-card'); return !!(w && y && c && (y.compareDocumentPosition(w) & 4) && (c.compareDocumentPosition(w) & 4) && w.querySelector('strong').textContent === 'How buyers set the price.'); });
  expect(out.pw1.trim() === TIM_PRICE_WORDING && out.pwOrder && !/cherr|How I think about price/i.test(out.pw1), 'pyramid: Tim\'s price wording beside it: ' + out.pw1.slice(0, 80));
  expect(/\$555,000 to \$595,000/.test(await p.evaluate(() => document.querySelector('#apvDoc .apv-opin-fig').textContent)), 'the large range figures stay in the opinion card');
  expect(!(await side(p)), 'pyramid: no sideways scroll at 390'); await p.locator('#apvDoc .apv-opinion').screenshot({ path: path.join(__dirname, 'out', 'appraisal_add_pyramid_390.png') });
  // print: drawn, in colour, inside the page
  await p.emulateMedia({ media: 'print' });
  out.pyrPrint = await p.evaluate(() => { const f = document.querySelector('#apvDoc .apv-pyr'), r = f.getBoundingClientRect(); return { shown: getComputedStyle(f).display !== 'none' && r.height > 100, adjust: getComputedStyle(f.querySelector('svg')).printColorAdjust || getComputedStyle(f.querySelector('svg')).webkitPrintColorAdjust }; });
  expect(out.pyrPrint.shown && out.pyrPrint.adjust === 'exact', 'pyramid: printed, in its colours: ' + JSON.stringify(out.pyrPrint));
  await p.pdf({ path: path.join(__dirname, 'out', 'appraisal_add_pyramid_print.pdf') }).catch(() => {});
  await p.emulateMedia({ media: 'screen' });
  // two options: a pyramid each with its own label; the price table keeps its column headings; stacked on a phone
  await edit(p, "const r=d.appraisal_views[0]; r.fields.ranges=[{key:'A',option:'Current condition',involves:'',low:540000,high:580000},{key:'B',option:'With light preparation',involves:'',low:575000,high:620000}];");
  await p.goto(PB + 'appraisals/AVX'); await wait(p, 1400);
  P = await pyr(); out.pyr2 = P && P.map(x => ({ cap: x.cap, alt: x.alt, left: x.left, w: x.w }));
  out.pyr2Head = await p.evaluate(() => Array.from(document.querySelectorAll('#apvDoc .apv-opinion .apv-ranges th')).map(t => t.textContent));
  expect(P && P.length === 2 && P[0].cap === 'Current condition' && P[1].cap === 'With light preparation' && /\$540,000 to \$580,000/.test(P[0].alt) && /\$575,000 to \$620,000/.test(P[1].alt) && P[0].left === P[1].left, 'pyramid: two options, one each with its own label, stacked on a phone: ' + JSON.stringify(out.pyr2));
  expect(out.pyr2Head.length === 2 && out.pyr2Head.every(Boolean), 'pyramid: the multi-option price table keeps its column headings: ' + JSON.stringify(out.pyr2Head));
  expect(!(await side(p)), 'two pyramids: no sideways scroll at 390'); await p.locator('#apvDoc .apv-opinion').screenshot({ path: path.join(__dirname, 'out', 'appraisal_add_pyramid2_390.png') });
  const twoRanges = await db(p);
  await X.ctx.close();
  X = await mk(1280, 'dark'); p = X.p;
  await signIn(p, 'agent-test@example.com', twoRanges);
  await p.goto(PB + 'appraisals/AVX'); await wait(p, 1400);
  P = await pyr(); out.pyr2Wide = P && P.map(x => ({ left: x.left, w: x.w, smallest: x.smallest }));
  expect(P && P.length === 2 && P[1].left > P[0].left + 100 && P.every(x => x.smallest >= 12), 'pyramid: side by side on a wide screen: ' + JSON.stringify(out.pyr2Wide));
  out.pyrDark = await p.evaluate(() => { const t = document.querySelector('#apvDoc .apv-pyr-svg text'); return getComputedStyle(t).fill; });
  expect(out.pyrDark !== 'rgb(30, 29, 27)', 'pyramid: its labels follow the dark theme: ' + out.pyrDark);
  await p.locator('#apvDoc .apv-opinion').screenshot({ path: path.join(__dirname, 'out', 'appraisal_add_pyramid2_1280_dark.png') });
  await edit(p, "d.appraisal_views[0].fields.ranges=[{key:'A',option:'Your home',involves:'',low:555000,high:595000}];"); await p.goto(PB + 'appraisals/AVX'); await wait(p, 1400);
  P = await pyr(); out.pyr1Wide = P && P.map(x => ({ w: x.w, smallest: x.smallest }));
  expect(P && P.length === 1 && P[0].w >= 440 && P[0].smallest >= 12, 'pyramid: one alone at 1280 draws at its full width, labels at least 12 px: ' + JSON.stringify(out.pyr1Wide));
  await p.locator('#apvDoc .apv-opinion').screenshot({ path: path.join(__dirname, 'out', 'appraisal_add_pyramid_1280_dark.png') });
  await X.ctx.close();

  // ── off means off in the letter too: the default note's "Any questions at all" sentence follows the switches ──
  const seedNote = (ch) => { const sd = SEED(), st = Object.assign({}, SETUP); delete st.note; sd.appraisal_views[0].setup = st;
    sd.site_profile = [{ id: true, name: 'Tim McGuire', licence: '', phone: '027 562 7207', email: 'tim@mcguire.co.nz', photo_path: null, about: {}, channels: ['call', 'text', 'email', 'form'].map(k => ({ key: k, on: ch.includes(k), value: '' })), updated_at: now }]; return sd; };
  const noteLook = async () => { await p.goto(PB + 'appraisals/AVX'); await wait(p, 1400);
    const scr = await p.evaluate(() => ({ html: document.querySelector('#apvDoc').innerHTML, text: document.querySelector('#apvDoc').innerText }));
    await p.emulateMedia({ media: 'print' }); const prt = await p.evaluate(() => document.querySelector('#apvDoc').innerText); await p.emulateMedia({ media: 'screen' });
    return { scr, prt }; };
  const PH = /027 ?562 ?7207|\+?64 ?27 ?562 ?7207/;
  X = await mk(390); p = X.p;
  for (const [ch, want] of [[['form'], null], [['call', 'text', 'email', 'form'], 'Any questions at all, call or text me on 027 562 7207.'], [['text'], 'Any questions at all, text me on 027 562 7207.'], [['email', 'form'], 'Any questions at all, email me at tim@mcguire.co.nz.']]) {
    await signIn(p, 'agent-test@example.com', seedNote(ch)); await write(p);
    const r = await noteLook(), line = (/Any questions at all[^\n]*/.exec(r.scr.text) || [null])[0];
    out['note_' + ch.join('_')] = { line, phoneScreen: PH.test(r.scr.html), phonePrint: PH.test(r.prt) };
    if (want === null) expect(!line && !PH.test(r.scr.html) && !PH.test(r.prt), 'off means off: with only the form on, the default note has no phone, and no phone shows anywhere on screen or in print: ' + JSON.stringify(out['note_form']));
    else expect(line === want, 'the default note follows the switches (' + ch.join(', ') + '): ' + JSON.stringify(line));
  }
  await X.ctx.close();

  await b.close();
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => { console.log(JSON.stringify({ crashed: String(e && e.stack || e), errs: ['crashed'] })); process.exit(1); });

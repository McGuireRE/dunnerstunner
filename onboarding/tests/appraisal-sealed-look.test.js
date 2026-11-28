// The sealed copy carries the whole look (lw3e on lw3-look, 28 November 2026), against the mock database, with invented data only.
// Tim's live page and the copy sealed when he presses Send draw exactly the same appraisal: the "Yours" figures on each comparable,
// everything that sold in the suburb last month with full addresses, the personal video, Tim's About and contact as they were (a switch
// that was off stays off), the ticked comparison only, and the price wording and pyramid. Images are compared by place, not by link
// (every link is made fresh). Then Tim changes his picture, name and switches, a sale is added, the property's figures change and the
// appraisal's record is edited behind the guard: the sealed copy, its About overlay and its seal are as they were.
// Screenshots: tests/out/appraisal_sealed_look_*.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
const bundle = fs.readFileSync(path.join(__dirname, '..', 'portal.js'), 'utf8');
const shell = fs.readFileSync(path.join(ROOT, 'portal', 'index.html'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(ROOT, 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const PK = 'https://packages.dunnerstunner.co.nz', PB = PK + '/portal/', OB = PK + '/onboarding/';
const out = {}; const errs = [];
const expect = (c, m) => { if (!c) errs.push(m); };
const now = new Date().toISOString();
const day = n => new Date(Date.now() - n * 864e5).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const LM = (() => { const y = +today.slice(0, 4), m = +today.slice(5, 7); return m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0'); })();
const AV = '11111111-aaaa-4aaa-8aaa-0000000000a1', P1 = '22222222-bbbb-4bbb-8bbb-0000000000a1', C1 = '33333333-cccc-4ccc-8ccc-0000000000a1', C2 = '33333333-cccc-4ccc-8ccc-0000000000a2';
const TIM = 'agent-test@example.com', OWNER = 'rb-owner@example.com';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const svg = c => `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="100%" height="100%" fill="${c}"/></svg>`;
const BLOBS = { [`appraisals/${AV}/comps/${C1}/p0.svg`]: svg('#b85c46'), [`appraisals/${AV}/comps/${C2}/p0.svg`]: svg('#6b8fa8') };
const fv = (id, key, value, source) => ({ id, property_id: P1, key, value, display: null, source, source_name: source, source_ref: null, as_of: null, recorded_at: now, recorded_by: 'agent' });
const pr = (key, vid) => ({ property_id: P1, key, value_id: vid, chosen_by: 'tim', chosen_at: now, ticked: false });
const comp = (id, i, address, price, o) => Object.assign({ id, appraisal_id: AV, position: i + 1, shown: true, status: 'sold', address, suburb: 'Rbvale', price, sold_on: day(20 + i), listed_on: null,
  method: 'Private treaty', days_to_sell: 20, bedrooms: 3 + i, bathrooms: 1 + i, floor_m2: 120 + i * 30, land_m2: 640, cv: 520000, agency: 'RB Test Realty', sold_by_tim: false, ad_text: '', compare_text: '', compare_ticked: false,
  private_note: 'TIM-ONLY ' + id, ring: 'suburb', distance_m: 300, source: 'reinz', photo_hints: [], created_at: now, updated_at: now }, o || {});
const sale = (i, suburb, month, dd, price, address, bed) => ({ id: 'MS' + i, suburb, sold_on: month + '-' + String(dd).padStart(2, '0'), price, address, bedrooms: bed, bathrooms: 1, floor_m2: 110 + i, land_m2: 600 + i * 10, property_type: 'house', days_to_sell: 20 + i, source: 'reinz', source_ref: 'RB-' + i, gathered_at: now });
const SETUP = { v: 1, suburb: 'Rbvale', preparedFor: 'Robin', note: 'Robin, thank you for having me through.', campaign: { kind: 'standard' }, method: 'deadline', plan: 'premium', basis: 'comparables', header: 'claude', tabs: { reinz: true }, market: false,
  pvideo: { provider: 'vimeo', id: '123456789', hash: 'abc123def0' } };
const SEED = () => ({ properties: [{ id: P1, address: 'RB 4 Seal Road, Rbvale', title_ref: null, legal_description: null, owners_on_title: null, ownership: {}, description: {}, disclosures: {}, found: {}, provenance: {}, stage: 'appraisal', stage_at: now, cycle_at: null, created_at: now, updated_at: now }],
  property_people: [{ id: '44444444-dddd-4ddd-8ddd-0000000000a1', property_id: P1, position: 1, legal_name: 'Robin Rbowner', pref_name: 'Robin', email: OWNER, phone: '', user_id: null, source: 'agreement', name_from: 'agreement', role: 'owner', created_at: now, updated_at: now }],
  agreements: [], agreement_people: [], agreement_events: [], prelistings: [], property_documents: [],
  property_rooms: [1, 2, 3].map(i => ({ id: 'R' + i, property_id: P1, base: 'bedroom', label: 'Bedroom ' + i, position: i, tim_class: 'bedroom', archived_at: null })),
  property_fact_values: [fv('F1', 'pBath', '2', 'tim'), fv('F2', 'pLand', '760', 'council'), fv('F4', 'capital_value', '610000', 'council')],
  property_profile: [pr('pBath', 'F1'), pr('pLand', 'F2'), pr('capital_value', 'F4')],
  appraisal_views: [{ id: AV, property_id: P1, title: 'x', address: 'RB 4 Seal Road, Rbvale', prepared_for: 'Robin', prepared_on: day(0), status: 'draft', created_by: TIM, created_at: now, updated_at: now, setup: SETUP, kind: 'standard', private_notes: 'RB-PRIVATE', fields: {}, sections: [] }],
  appraisal_comps: [comp(C1, 0, 'RB 12 Seal Road, Rbvale', 560000, { compare_text: 'RB-TICKED: a little smaller than yours.', compare_ticked: true }), comp(C2, 1, 'RB 30 Seal Road, Rbvale', 590000, { compare_text: 'RB-UNTICKED draft', compare_ticked: false })],
  appraisal_media: [{ id: 'M1', appraisal_id: AV, comp_id: C1, path: `appraisals/${AV}/comps/${C1}/p0.svg`, cover: true, position: 0, source: 'upload', created_at: now }, { id: 'M2', appraisal_id: AV, comp_id: C2, path: `appraisals/${AV}/comps/${C2}/p0.svg`, cover: true, position: 0, source: 'upload', created_at: now }],
  storage_objects: { [`appraisals/${AV}/comps/${C1}/p0.svg`]: { size: 900, mime: 'image/svg+xml', bucket: 'appraisal-media' }, [`appraisals/${AV}/comps/${C2}/p0.svg`]: { size: 900, mime: 'image/svg+xml', bucket: 'appraisal-media' },
    'profile/rb-me.png': { size: 70, mime: 'image/png', bucket: 'site-public' }, 'about/rb-tim.png': { size: 70, mime: 'image/png', bucket: 'site-public' } },
  site_profile: [{ id: true, name: 'RB Tim', licence: 'RB licence line', phone: '027 000 1111', email: 'rb-tim@example.com', photo_path: 'profile/rb-me.png',
    about: { tim: { heading: 'About RB Tim', body: 'RB about words.\n\nA second paragraph.', image_path: 'about/rb-tim.png' }, agency: { heading: '', body: 'RB agency words.', image_path: null } },
    channels: [{ key: 'call', on: false }, { key: 'text', on: true }, { key: 'email', on: true }, { key: 'form', on: true }, { key: 'whatsapp', on: false, value: '+64 27 000 2222' }, { key: 'telegram', on: true, value: 'rbtester' }], updated_at: now }],
  suburb_groups: [], market_months: [], appraisal_reports: [], appraisal_buyer_checks: [], appraisal_assets: [], appraisal_drafts: [], tim_reviews: [], ai_calls: [], contact_messages: [],
  market_sales: [sale(1, 'Rbvale', LM, 3, 548000, 'RB 2 Seal Road, Rbvale', 3), sale(2, 'Rbvale', LM, 9, 560000, 'RB 12 Seal Road, Rbvale', 3), sale(3, 'Rbvale', LM, 21, 612000, 'RB 9 Other Street, Rbvale', 4), sale(4, 'Othervale', LM, 5, 999000, 'RB-OTHER-SUBURB', 5)] });

(async () => {
  const b = await chromium.launch();
  const mk = async w => {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: 'light', hasTouch: w < 500, isMobile: w < 500 }); ctx.setDefaultTimeout(10000);
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
    await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    await ctx.route(PK + '/**', r => r.fulfill({ status: 404, contentType: 'text/html', body: shell }));
    await ctx.route(PK + '/portal**', r => r.fulfill({ status: 200, contentType: 'text/html', body: shell }));
    await ctx.route(OB + '**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await ctx.route(PK + '/onboarding/portal.js', r => r.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: bundle }));
    await ctx.route(PK + '/onboarding/assets/**', r => r.fulfill({ status: 404, body: '' }));
    await ctx.route(PK + '/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
    await ctx.route(/youtube|vimeo|ytimg/, r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>stand-in player</title>' }));
    await ctx.addInitScript(([bl, png]) => { window.__repoBlobs = window.__repoBlobs || {}; Object.entries(bl).forEach(([k, v]) => { window.__repoBlobs[k] = new Blob([v], { type: 'image/svg+xml' }); });
      const u = Uint8Array.from(atob(png), c => c.charCodeAt(0)); ['profile/rb-me.png', 'about/rb-tim.png'].forEach(k => { window.__repoBlobs[k] = new Blob([u], { type: 'image/png' }); }); }, [BLOBS, PNG]);
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push('page: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|permission denied|Failed to fetch|net::ERR|row-level security|Agent only/.test(m.text())) errs.push('console: ' + m.text()); });
    p.on('dialog', d => d.accept());
    return { ctx, p };
  };
  const wait = (p, ms) => p.waitForTimeout(ms || 600);
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'out', `appraisal_sealed_look_${n}.png`), fullPage: true });
  const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb')));
  const edit = (p, fn) => p.evaluate(s => { const d = JSON.parse(localStorage.getItem('mockdb')); (new Function('d', s))(d); localStorage.setItem('mockdb', JSON.stringify(d)); }, fn);
  const signIn = async (p, email, seed) => { await p.goto(PB); await p.evaluate(([s, em, tim]) => { if (s) { localStorage.clear(); localStorage.setItem('mockdb', JSON.stringify(s)); } localStorage.setItem('mockAgents', JSON.stringify([tim])); localStorage.setItem('mocksession', JSON.stringify({ user: { id: em === tim ? 'agent-1' : 'vendor-1', email: em } })); }, [seed || null, email, TIM]); };
  // the appraisal as drawn, every image or file link replaced by its place (links are made fresh each time), ids left as they are
  // (the vendor's own "Build your own plan" link, added to their page after drawing, is left out of the comparison)
  const drawn = p => p.evaluate(() => { const d0 = document.querySelector('#apvDoc'); if (!d0) return ''; const d = d0.cloneNode(true); d.querySelectorAll('#apvBuild, #bn-apvBuild').forEach(x => x.remove()); return d.innerHTML.replace(/(src|href|poster)="(blob:|data:|https:\/\/[^"]*token)[^"]*"/g, '$1="LINK"'); });
  const sha = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex');

  // ── Tim writes it, and reads his live page ──
  let X = await mk(390), p = X.p;
  await signIn(p, TIM, SEED());
  await p.goto(PB + 'appraisals'); await wait(p, 600);
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('mockdb')), r = d.appraisal_views[0];
    const w = window.APPR.writeStandard(r.setup, [{ key: 'A', option: 'Your home', low: 555000, high: 595000 }], { address: r.address, preparedOn: r.prepared_on, cat: { PACKAGES, ITEMS, CATALOGUE } });
    // a line built round {{reach}} (how to reach Tim, as his switches allow), so the test sees the contact line it renders
    w.sections.push({ type: 'para', text: 'RB-REACH: any questions, {{reach}}.' });
    Object.assign(r, { sections: w.sections, fields: w.fields, title: w.title }); localStorage.setItem('mockdb', JSON.stringify(d)); });
  await p.goto(PB + 'appraisals/' + AV); await wait(p, 1800); await shot(p, 'live');
  const live = await drawn(p);
  out.live = { length: live.length, yours: /Yours/.test(live), suburb: /Everything that sold in Rbvale last month/.test(live), video: /apv-pvideo/.test(live), pyramid: /apv-pyr/.test(live), wording: /How buyers set the price\./.test(live) };
  expect(Object.values(out.live).every(Boolean) && /RB-TICKED: a little smaller than yours\./.test(live) && !/RB-UNTICKED draft/.test(live) && /RB 9 Other Street, Rbvale/.test(live) && /RB Tim/.test(live) && /027 000 1111/.test(live),
    'the live page draws the whole look (Yours, the suburb last month with addresses, the video, the pyramid and wording, the ticked comparison, Tim\'s contact): ' + JSON.stringify(out.live));
  expect(!/RB-OTHER-SUBURB/.test(live), 'only the suburb\'s own sales');
  const plain = h => h.replace(/<[^>]+>/g, ''); out.reachLive = (/RB-REACH: any questions, ([^.]*)\./.exec(plain(live)) || [])[1];
  expect(out.reachLive === 'text me on 027 000 1111' && !/\{\{reach\}\}/.test(live), 'the contact line renders as the switches allow (Call off, Text on): ' + out.reachLive);

  // ── Send ──
  await p.goto(PB + 'appraisals/' + AV + '/send'); await wait(p, 1500);
  await p.evaluate(() => { document.querySelectorAll('[data-apto]').forEach(x => { if (!x.checked) x.click(); }); const r = document.querySelector('#apRead'); if (!r.checked) r.click(); });
  await p.click('#apSendBtn'); await wait(p, 2500);
  let d = await db(p); const S = (d.appraisal_snapshots || [])[0];
  expect(!!S, 'sent and sealed');
  out.sealedKeys = S ? Object.keys(S.content).filter(k => ['subject', 'suburbSales', 'site'].includes(k)) : [];
  expect(S && S.content.subject && S.content.subject.bedrooms === 3 && S.content.subject.bathrooms === 2 && S.content.subject.land_m2 === 760 && !('cv' in S.content.subject), 'Yours sealed: bedrooms from the room calls, the chosen figures, no rating valuation unless shown: ' + JSON.stringify(S && S.content.subject));
  expect(S && S.content.suburbSales && S.content.suburbSales.month === LM && S.content.suburbSales.rows.length === 3 && S.content.suburbSales.rows.every(r => !('source_ref' in r) && !('id' in r) && !('property_type' in r)), 'the suburb\'s sales sealed: that suburb and month, drawn fields only');
  expect(S && S.content.site && S.content.site.phone === '027 000 1111' && S.content.site.photo === `appraisals/${AV}/site/profile-rb-me.png` && S.content.site.about.tim.image === `appraisals/${AV}/site/about-rb-tim.png`
    && JSON.stringify(S.content.site.channels) === JSON.stringify([{ key: 'text', value: '' }, { key: 'email', value: '' }, { key: 'form', value: '' }, { key: 'telegram', value: 'rbtester' }]) && !JSON.stringify(S.content.site).includes('+64 27 000 2222'),
    'Tim\'s About and contact sealed as they were, off staying off, with copies of his pictures: ' + JSON.stringify(S && S.content.site));
  expect(S && d.storage_objects[`appraisals/${AV}/site/profile-rb-me.png`] && S.files.some(f => f.path === `appraisals/${AV}/site/profile-rb-me.png`) && S.files.some(f => f.path === `appraisals/${AV}/site/about-rb-tim.png`), 'the picture copies are in the appraisal\'s own folder, and sealed');
  expect(S && S.content.sections.some(s => s.type === 'pvideo' && s.provider === 'vimeo' && s.id === '123456789' && s.hash === 'abc123def0') && S.content.sections.some(s => s.type === 'opinion' && /How buyers set the price\./.test(s.wording || '')), 'the video and the price wording sealed');
  expect(S && !JSON.stringify(S.content).includes('RB-UNTICKED') && !JSON.stringify(S.content).includes('TIM-ONLY') && !JSON.stringify(S.content).includes('RB-PRIVATE'), 'nothing Tim keeps to himself');

  // ── the sealed copy draws exactly as the live page did ──
  await p.goto(PB + 'appraisals/' + AV + '/copy'); await wait(p, 1800); await shot(p, 'copy');
  const copy = await drawn(p);
  out.same = copy === live;
  if (!out.same) { let i = 0; while (i < copy.length && copy[i] === live[i]) i++; out.firstDiff = { at: i, live: live.slice(Math.max(0, i - 120), i + 200), copy: copy.slice(Math.max(0, i - 120), i + 200) }; }
  expect(out.same, 'Tim\'s look at the sealed copy draws exactly as his live page did at Send');
  const chk = await p.evaluate(async id => { const c = window.supabase.createClient(); return (await c.rpc('agent_appraisal_seal_check', { p_snapshot: id })).data; }, S.id);
  const st = JSON.parse(chk.seal_text);
  expect(chk.ok && sha(chk.seal_text) === S.seal_sha256 && st.content.site && st.content.suburbSales && st.content.subject && st.files.some(f => /\/site\//.test(f.path)), 'the seal covers the look\'s fields and the picture copies');

  // ── the vendor's own page draws the same ──
  const Y = await mk(390); await signIn(Y.p, OWNER, await db(p));
  await Y.p.goto(OB + '?appraisal=' + AV); await wait(Y.p, 2000); await shot(Y.p, 'vendor');
  const vend = await drawn(Y.p); out.vendorSame = vend === live;
  if (!out.vendorSame) { let i = 0; while (i < vend.length && vend[i] === live[i]) i++; out.vendorDiff = { at: i, live: live.slice(Math.max(0, i - 150), i + 250), vendor: vend.slice(Math.max(0, i - 150), i + 250) }; }
  expect(out.vendorSame, 'the vendor\'s page draws exactly the same');
  await Y.p.click('[data-about-open]'); await wait(Y.p, 600);
  out.vendorAbout = (await Y.p.textContent('#aboutDlg')).replace(/\s+/g, ' ');
  out.vendorChans = await Y.p.evaluate(() => [...document.querySelectorAll('#aboutDlg [data-ch]')].map(x => x.dataset.ch).join());
  expect(/RB Tim/.test(out.vendorAbout) && /About RB Tim/.test(out.vendorAbout) && out.vendorChans === 'text,email,telegram', 'the vendor\'s About overlay: as sealed, Call off staying off: ' + out.vendorChans);
  await Y.ctx.close();

  // ── later: Tim changes his picture, name and switches, a sale is added, the property's figures change, and the record is edited ──
  await edit(p, `const s = d.site_profile[0]; delete d.storage_objects[s.photo_path]; s.photo_path = 'profile/rb-new.png'; s.name = 'RB Renamed'; s.phone = '027 999 9999';
    s.about = { tim: { heading: 'RB new about', body: 'RB new words.', image_path: null } }; s.channels = [{ key: 'call', on: true }, { key: 'text', on: true }, { key: 'email', on: false }];
    d.market_sales.push({ id: 'MS9', suburb: 'Rbvale', sold_on: '${LM}-15', price: 700000, address: 'RB-LATER-SALE', bedrooms: 5, bathrooms: 3, source: 'reinz' });
    d.property_fact_values.push({ id: 'F9', property_id: '${P1}', key: 'pFloor', value: '333', source: 'tim' }); d.property_profile.push({ property_id: '${P1}', key: 'pFloor', value_id: 'F9', chosen_by: 'tim', chosen_at: '${now}' });
    d.appraisal_views[0].setup.pvideo = { provider: 'youtube', id: 'Rb_Later-12' }; d.appraisal_views[0].sections = d.appraisal_views[0].sections.filter(x => x.type !== 'pvideo');`);
  await p.goto(PB + 'appraisals/' + AV + '/copy'); await wait(p, 1800);
  const after = await drawn(p); out.afterSame = after === copy;
  out.reachAfter = (/RB-REACH: any questions, ([^.]*)\./.exec(plain(after)) || [])[1];
  expect(out.reachAfter === 'text me on 027 000 1111' && !/\{\{reach\}\}|027 999 9999|call or text/.test(after), 'the sealed contact line stays as it rendered at Send, not today\'s switches or phone: ' + out.reachAfter);
  expect(out.afterSame, 'after Tim\'s later changes the sealed copy draws exactly as before');
  await p.click('[data-about-open]'); await wait(p, 600);
  out.copyAbout = (await p.textContent('#aboutDlg')).replace(/\s+/g, ' ');
  expect(/RB Tim/.test(out.copyAbout) && !/RB Renamed|RB new about|027 999 9999/.test(out.copyAbout), 'its About overlay: as sealed, not today\'s: ' + out.copyAbout.slice(0, 200));
  const chk2 = await p.evaluate(async id => { const c = window.supabase.createClient(); return (await c.rpc('agent_appraisal_seal_check', { p_snapshot: id })).data; }, S.id);
  expect(chk2.ok && chk2.files_ok, 'and its seal still matches, every file as sealed');
  expect(!(await p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth)), 'the copy: no sideways scroll at 390 px');
  await b.close();
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => { console.log(JSON.stringify({ errs: ['crash: ' + e.message] })); process.exit(1); });

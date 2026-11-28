// Appraisal report, phase E (migration 037): sending to the vendor, their private signed-in view, "I'd like to proceed", "Build your
// own", what they did, and an updated version. Against the mock database, with invented data only (every address and name marked RB,
// every email at example.com); the notify function is mocked, so nothing is sent to anyone.
//   Tim: the Send page lists the property's owners and contacts (never another property's people), the owners ticked; the email is a
//   draft in his voice with [the appraisal link]; nothing goes until he ticks that he has read it; sending makes a frozen copy (ticked
//   wording and shown comparables only, never his private notes, an unticked comparison, a hidden comparable or an advertisement
//   saying "as is", which is listed as left out), marks it sent, and the email goes to exactly the people chosen with their link.
//   The appraisal page then shows what was sent, the email's status and what they did; "See their copy" draws the copy.
//   The vendor: the appraisal link before sign-in says "Your appraisal" and is remembered through the sign-in; the owner reads the copy
//   through the same renderer, photos through short-lived links for listed files only (a photo outside the copy is refused); another
//   property's owner and a contact it wasn't sent to see "This appraisal isn't here"; "Build your own" opens the packages page builder
//   with "Back to your appraisal" and brings the plan back to their appraisal; "I'd like to proceed" opens Questions before we meet,
//   linked to this appraisal. Tim is told (notify) and sees each on his Needs you list until he ticks Done.
//   An updated version: copied with its photos, sent as version 2; the vendor sees the newest. An email that fails can be sent again.
//   After the review of 7a1eea5: each section rebuilt from its own keys (no AI notes, nested private notes or unticked lines in the copy);
//   a plan built twice keeps one current plan and tells Tim once; a plan that didn't save (no signal, or refused) is said under the
//   button; #custom without ?ap= is the packages page as before; an updated version whose copying was cut short never names the sent
//   version's header, warns on its page and before sending, and finishes copying on "Finish copying photos and videos".
//   390 px with no sideways scroll, light and dark.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const bundle = fs.readFileSync(path.join(__dirname, '..', 'portal.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const pkgs = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const shell = fs.readFileSync(path.join(ROOT, 'portal', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(ROOT, 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const PK = 'https://packages.dunnerstunner.co.nz', PB = PK + '/portal/', OB = PK + '/onboarding/';
const out = {}; const errs = [];
const expect = (c, m) => { if (!c) errs.push(m); };
const now = new Date().toISOString();
const day = n => new Date(Date.now() - n * 864e5).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const AV = '11111111-aaaa-4aaa-8aaa-000000000001', P1 = '22222222-bbbb-4bbb-8bbb-000000000001', P2 = '22222222-bbbb-4bbb-8bbb-000000000002';
const C1 = '33333333-cccc-4ccc-8ccc-000000000001', C2 = '33333333-cccc-4ccc-8ccc-000000000002', C3 = '33333333-cccc-4ccc-8ccc-000000000003', D1 = '44444444-dddd-4ddd-8ddd-000000000001';
const M1 = `appraisals/${AV}/comps/${C1}/rb-a.jpg`, M3 = `appraisals/${AV}/comps/${C3}/rb-hidden.jpg`, H1 = `properties/${P1}/photos/rb-kitchen.jpg`;
const prop = (id, address) => ({ id, address, title_ref: null, legal_description: null, owners_on_title: null, ownership: {}, description: {}, disclosures: {}, found: {}, provenance: {}, stage: 'appraisal', stage_at: now, cycle_at: null, created_at: now, updated_at: now });
const pp = (id, pid, pos, legal, pref, email, role) => ({ id, property_id: pid, position: pos, legal_name: legal, pref_name: pref, email, phone: '', user_id: null, source: 'agreement', name_from: 'agreement', role, created_at: now, updated_at: now });
const comp = (id, pos, o) => Object.assign({ id, appraisal_id: AV, position: pos, shown: true, status: 'sold', address: 'RB ' + pos + ' Near Street, Rbvale', suburb: 'Rbvale', price: 500000 + pos * 10000, sold_on: day(20 + pos), listed_on: null, method: 'Deadline sale', days_to_sell: 20,
  bedrooms: 3, bathrooms: 1, floor_m2: 120, land_m2: 600, cv: null, agency: 'RB Agency', sold_by_tim: false, ad_text: '', compare_text: '', compare_ticked: false, private_note: '', ring: 'suburb', distance_m: 300, source: 'tim', source_ref: null, source_url: null, gathered_at: now, photo_hints: [], created_by: 'agent-test@example.com', created_at: now, updated_at: now }, o);
const HA = '55555555-eeee-4eee-8eee-000000000001', HP = `appraisals/${AV}/header/rb-hero.jpg`;
const SECTIONS = [{ type: 'header', stage: 1, src: 'asset', asset: HA, kind: 'image', credit: 'RB credit', ai_note: 'RB-AI-NOTE-HEADER' },
  { type: 'byline', text: 'Prepared for Robin by Tim McGuire' }, { type: 'heading', text: 'A note from Tim' }, { type: 'para', cls: 'lede', text: 'Thanks for having me through. Any questions, call me on 027 562 7207.' },
  { type: 'heard', stage: 1, ai_note: 'RB-AI-NOTE-HEARD', items: ['RB plain heard line.', { text: 'RB-TICKED-LINE', ticked: true, private_note: 'RB-LINE-PRIVATE' }, { text: 'RB-UNTICKED-LINE', ticked: false }] },
  { type: 'home', stage: 2, label: 'A mockup.', photos: [D1], details: [['Heating', 'Heat pump']], ad: { title: 'RB To wake up to the sun', paras: ['Morning sun.'] } },
  { type: 'heading', text: 'My opinion of price' }, { type: 'opinion' }, { type: 'heading', text: 'How I would sell it' }, { type: 'method' },
  { type: 'heading', text: 'Marketing plans' }, { type: 'plans', items: [{ key: 'premium', name: 'Premium', price: 4000, tagline: 'RB premium', items: ['Photos'], rec: true, private_note: 'RB-PLAN-PRIVATE' }, { key: 'digital', name: 'Digital', price: 2000, items: [] }, { key: 'custom', name: 'Build your own', price: 0, tagline: 'We choose each part together.', items: [] }] },
  { type: 'panel', title: 'Tim is not like other agents', items: ['Head and shoulders.'] }, { type: 'reviews', stage: 3, max: 6 }];
const SEED = () => ({ properties: [prop(P1, 'RB 9 Send Street, Rbvale'), prop(P2, 'RB 11 Other Street, Rbvale')],
  property_people: [pp('pp1', P1, 1, 'Robin Rbowner', 'Robin', 'rb-owner@example.com', 'owner'), pp('pp2', P1, 2, 'Casey Rbcontact', '', 'rb-contact@example.com', 'contact'), pp('pp3', P2, 1, 'Olly Rbother', '', 'rb-other@example.com', 'owner')],
  agreements: [], agreement_people: [], agreement_events: [], prelistings: [],
  property_documents: [{ id: D1, property_id: P1, kind: 'Photo', folder: 'photos', name: 'rb-kitchen.jpg', path: H1, bucket: 'property-files', room: 'Kitchen', mime_type: 'image/jpeg', size_bytes: 5000, archived_at: null, created_at: now, updated_at: now, source: 'uploaded', created_by: 'agent-test@example.com' }],
  storage_objects: { [M1]: { size: 5000, mime: 'image/jpeg', bucket: 'appraisal-media' }, [M3]: { size: 5000, mime: 'image/jpeg', bucket: 'appraisal-media' }, [H1]: { size: 5000, mime: 'image/jpeg' }, [HP]: { size: 5000, mime: 'image/jpeg', bucket: 'appraisal-media' } },
  appraisal_views: [{ id: AV, property_id: P1, title: 'RB 9 Send Street, Rbvale: Market Appraisal', address: 'RB 9 Send Street, Rbvale', prepared_for: 'Robin', prepared_on: day(0), status: 'draft', created_by: 'agent-test@example.com', created_at: now, updated_at: now,
    setup: { v: 1, suburb: 'Rbvale', campaign: { kind: 'standard' }, method: 'deadline', plan: 'premium', basis: 'comparables', header: 'own', headerOpt: { asset: HA, kind: 'image', credit: 'RB credit' } }, kind: 'standard', private_notes: 'TIM-PRIVATE: the hallway carpet is worn.',
    fields: { ranges: [{ key: 'A', option: 'Your home', involves: '', low: 520000, high: 575000 }], method: { name: 'Deadline sale', key: 'deadline', text: 'I\'d recommend a deadline sale.' } }, sections: SECTIONS }],
  appraisal_comps: [comp(C1, 1, { compare_text: 'RB-TICKED: smaller than yours.', compare_ticked: true, ad_text: 'A sunny family home.', private_note: 'RB-COMP-PRIVATE' }), comp(C2, 2, { compare_text: 'RB-UNTICKED-COMPARE', ad_text: 'Sold as is, where is.' }),
    comp(C3, 3, { shown: false, address: 'RB-HIDDEN Street, Rbvale' })],
  appraisal_media: [{ id: 'm1', appraisal_id: AV, comp_id: C1, path: M1, file_name: 'rb-a.jpg', mime_type: 'image/jpeg', size_bytes: 5000, position: 1, cover: true, source: 'upload', created_at: now }, { id: 'm3', appraisal_id: AV, comp_id: C3, path: M3, file_name: 'rb-hidden.jpg', mime_type: 'image/jpeg', size_bytes: 5000, position: 1, cover: false, source: 'upload', created_at: now }],
  suburb_groups: [], market_months: [], market_sales: [], appraisal_reports: [], appraisal_buyer_checks: [], appraisal_drafts: [], ai_calls: [],
  appraisal_assets: [{ id: HA, appraisal_id: AV, role: 'header', kind: 'image', bucket: 'appraisal-media', path: HP, still_path: null, file_name: 'rb-hero.jpg', mime_type: 'image/jpeg', size_bytes: 5000, created_by: 'agent-test@example.com', created_at: now }],
  tim_reviews: [{ id: 'rv1', source: 'google', profile: 'Tim McGuire', ref: 'g1', reviewer: 'Sam', rating: 5, reviewed_on: day(5), body: 'RB brilliant from start to finish.', url: null, ticked: true, removed_at: null, gathered_at: now },
    { id: 'rv2', source: 'google', profile: 'Tim McGuire', ref: 'g2', reviewer: 'Jo', rating: 5, reviewed_on: day(6), body: 'RB-UNTICKED-REVIEW', url: null, ticked: false, removed_at: null, gathered_at: now }] });

const dialogs = []; let dlgNo = false;
(async () => {
  const b = await chromium.launch();
  const mk = async (w, scheme) => {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, colorScheme: scheme, hasTouch: w < 500, isMobile: w < 500 }); ctx.setDefaultTimeout(10000);
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
    await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    await ctx.route(PK + '/**', r => r.fulfill({ status: 404, contentType: 'text/html', body: shell }));
    await ctx.route(u => new URL(u).origin === PK && new URL(u).pathname === '/', r => r.fulfill({ contentType: 'text/html', body: pkgs }));
    await ctx.route(PK + '/onboarding/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await ctx.route(PK + '/portal**', r => r.fulfill({ contentType: 'text/html', body: shell }));
    await ctx.route(PK + '/onboarding/portal.js', r => r.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: bundle }));
    await ctx.route(PK + '/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push('page: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|permission denied|Not found|net::ERR|Agent only|sent copy never changes/.test(m.text())) errs.push('console: ' + m.text()); });
    p.on('dialog', d => { dialogs.push(d.message()); if (dlgNo) d.dismiss(); else d.accept(); });
    return { ctx, p };
  };
  const wait = (p, ms) => p.waitForTimeout(ms || 700);
  const side = p => p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth);
  const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb')));
  const ls = (p, k) => p.evaluate(x => JSON.parse(localStorage.getItem(x) || 'null'), k);
  const note = (p, id) => p.evaluate(i => { const n = document.getElementById('bn-' + i); return n && !n.hidden ? n.textContent + '|' + n.dataset.kind : null; }, id);
  const as = async (p, who, seed) => { await p.goto(OB + '?blank=1'); await p.evaluate(([w, s]) => { if (s) localStorage.clear(); localStorage.setItem('mockAgents', JSON.stringify(['agent-test@example.com']));
    if (w) localStorage.setItem('mocksession', JSON.stringify({ user: { id: w.id, email: w.email } })); else localStorage.removeItem('mocksession'); if (s) localStorage.setItem('mockdb', JSON.stringify(s)); }, [who, seed || null]); };
  const TIM = { id: 'agent-1', email: 'agent-test@example.com' }, OWNER = { id: 'v-1', email: 'rb-owner@example.com' }, OTHER = { id: 'v-2', email: 'rb-other@example.com' }, CONTACT = { id: 'v-3', email: 'rb-contact@example.com' };
  const tickRead = p => p.evaluate(() => { const i = document.querySelector('#apRead'); if (!i.checked) i.click(); });
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'out', `appraisal_send_${n}.png`), fullPage: true });

  let X = await mk(390, 'light'), p = X.p;
  // ── 1. Tim: the Send page ──
  await as(p, TIM, SEED());
  await p.goto(PB + 'appraisals/' + AV); await wait(p, 1000);
  expect(!!(await p.$(`#apvTools a[data-plink="appraisals/${AV}/send"]`)), 'the appraisal offers Send to the vendor');
  expect(!(await p.$('#apSent')), 'not sent yet: no sent card');
  await p.goto(PB + 'appraisals/' + AV + '/send'); await wait(p, 1000); await shot(p, '1_send');
  expect(!(await side(p)), 'the Send page: no sideways scroll at 390 px');
  out.to = await p.$$eval('#apTo .choice', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim() + (x.querySelector('input').checked ? ' [x]' : '')));
  expect(out.to.length === 2 && /rb-owner@example\.com.*Owner.*\[x\]/.test(out.to[0]) && /rb-contact@example\.com.*Contact/.test(out.to[1]) && !/\[x\]/.test(out.to[1]), 'the owner (ticked) and the contact (not ticked); never another property\'s people: ' + out.to.join(' | '));
  const sub = await p.inputValue('#apSub'), body = await p.inputValue('#apBody'); out.email = { sub, body };
  expect(sub === 'Your appraisal: RB 9 Send Street, Rbvale' && /^Hello Robin,/.test(body) && body.includes('[the appraisal link]') && /I'd like to proceed/.test(body) && !/fee|commission|—/i.test(body), 'the draft in Tim\'s voice: ' + sub);
  await p.click('#apSendBtn'); await wait(p, 400);
  expect(/Tick that you've read/.test(await note(p, 'apSendBtn') || ''), 'nothing goes until Tim ticks that he has read it');
  await p.fill('#apBody', body + '\n\nMy fee is the lowest.'); await tickRead(p); await p.click('#apSendBtn'); await wait(p, 400);
  expect(/Fees and commission/.test(await note(p, 'apSendBtn') || '') && !(await db(p)).appraisal_snapshots, 'fee wording in the email: refused at the button, nothing sent');
  await p.fill('#apBody', body); await p.click('#apSendBtn'); await wait(p, 1500); await shot(p, '2_sent');
  let d = await db(p); const snap = (d.appraisal_snapshots || [])[0]; const mail = await ls(p, 'apMail');
  expect(!!snap && snap.version === 1 && d.appraisal_views.find(v => v.id === AV).status === 'sent', 'sent: a copy, version 1, the appraisal marked sent');
  expect(/Sent: version 1/.test(await p.textContent('#apSentNote')), 'the page says it was sent');
  expect(mail && mail.length === 1 && JSON.stringify(mail[0].to) === '["rb-owner@example.com"]' && mail[0].link === OB + '?appraisal=' + AV && mail[0].html.includes('Open my appraisal'), 'the email to exactly the owner, with their link as a button');
  expect(mail.every(m => [].concat(m.to).every(t => t === 'tim' || /@example\.com$/.test(t))), 'no real address anywhere in a test');
  const sc = JSON.stringify(snap.content);
  ['TIM-PRIVATE', 'RB-COMP-PRIVATE', 'RB-UNTICKED-COMPARE', 'RB-HIDDEN', 'as is', 'RB-UNTICKED-REVIEW', 'private_note', 'source_url', 'ai_note', 'RB-AI-NOTE', 'RB-LINE-PRIVATE', 'RB-UNTICKED-LINE', 'RB-PLAN-PRIVATE', '"ticked":false'].forEach(t => expect(!sc.includes(t), 'the copy never holds ' + t));
  ['RB-TICKED: smaller than yours.', 'A sunny family home.', 'RB brilliant', 'Heat pump', 'RB-TICKED-LINE', 'RB plain heard line.'].forEach(t => expect(sc.includes(t), 'the copy holds ' + t));
  expect(JSON.stringify(snap.content.sections.find(s => s.type === 'heard')) === '{"type":"heard","stage":1,"items":["RB plain heard line.","RB-TICKED-LINE"]}', 'What I heard: rebuilt from its own keys, ticked lines only');
  expect(snap.paths.length === 3 && [M1, H1, HP].every(p => snap.paths.some(x => x.path === p)) && !snap.paths.some(x => x.path === M3), 'the copy lists the shown photo, the header and the mockup photo only');
  expect(/advertisement wording for RB 2 Near Street/.test(await p.textContent('#apSentNote')), 'the advertisement saying "as is" is listed as left out');
  // the appraisal page: sent, the email, what they did; their copy
  await p.goto(PB + 'appraisals/' + AV); await wait(p, 1000);
  const sent = await p.textContent('#apSent'); out.sentCard = sent.replace(/\s+/g, ' ').slice(0, 300);
  expect(/Version 1/.test(sent) && /Email sent/.test(sent) && /Not opened yet/.test(sent) && !!(await p.$('#apNewVer')), 'the sent card: version, email sent, not opened yet, Make an updated version');
  expect(!(await p.$(`#apvTools a[data-plink="appraisals/${AV}/send"]`)), 'a sent appraisal is not sent again');
  await p.goto(PB + 'appraisals/' + AV + '/copy'); await wait(p, 1000);
  const cp = await p.innerHTML('#apvDoc'); expect(/RB-TICKED/.test(cp) && !/RB-UNTICKED-COMPARE|TIM-PRIVATE/.test(cp), 'See their copy: drawn from the copy');

  // ── 2. the vendor: the link before sign-in, remembered through it ──
  await as(p, null); await p.goto(OB + '?appraisal=' + AV); await wait(p, 800);
  expect(/Your appraisal/.test(await p.textContent('h1')) && (await p.evaluate(() => localStorage.getItem('apOpen'))) === AV, 'before sign-in: "Your appraisal", the link remembered');
  await shot(p, '3_signin');
  await p.evaluate(() => localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'v-1', email: 'rb-owner@example.com' } })));
  await p.goto(OB); await wait(p, 1500); await shot(p, '4_vendor');
  let v = await p.innerHTML('#apvDoc').catch(() => '');
  expect(/RB 9 Send Street, Rbvale: Market Appraisal/.test(v) && /RB-TICKED: smaller than yours\./.test(v) && /A sunny family home/.test(v) && /RB brilliant/.test(v) && /RB-TICKED-LINE/.test(v) && /apv-hero/.test(v), 'after sign-in their appraisal opens, drawn by the same renderer (header and What I heard included)');
  ['TIM-PRIVATE', 'RB-COMP-PRIVATE', 'RB-UNTICKED-COMPARE', 'RB-HIDDEN', 'Sold as is', 'RB-UNTICKED-REVIEW', 'RB-UNTICKED-LINE', 'RB-AI-NOTE'].forEach(t => expect(!v.includes(t), 'the vendor never sees ' + t));
  expect(!(await p.evaluate(() => localStorage.getItem('apOpen'))), 'the remembered link is used once');
  expect(!(await side(p)), 'the vendor view: no sideways scroll at 390 px');
  const links = await ls(p, 'apLinks'); out.links = links;
  expect(links && links.includes('appraisal-media:' + M1) && links.includes('property-files:' + H1) && links.includes('appraisal-media:' + HP), 'photos through short-lived links, for the listed files');
  expect(((await ls(p, 'inv')) || []).includes('notify:ap_event'), 'Tim is told it was opened');
  // a photo outside the copy is refused, asked as the vendor
  out.refused = await p.evaluate(async ([s, m]) => { const c = window.supabase.createClient(); const r = await c.functions.invoke('repo-link', { body: { snapshot: s, bucket: 'appraisal-media', path: m } }); return r.error ? r.error.status : 200; }, [snap.id, M3]);
  expect(out.refused === 403, 'a photo outside the copy: refused (' + out.refused + ')');
  // the Build your own card links to the packages page builder, starting from Tim's pick
  const build = await p.getAttribute('#apvBuild', 'href'); out.build = build;
  expect(build === PK + '/?ap=' + AV + '&from=premium#custom', 'Build your own: the packages page builder, with the way back');

  // ── 3. Build your own, and back ──
  // an ordinary visitor with #custom gets the packages page exactly as before
  await p.goto(PK + '/#custom'); await wait(p, 700);
  expect(await p.evaluate(() => document.getElementById('cover').classList.contains('active') && !document.getElementById('custom').classList.contains('active') && !document.getElementById('ap-back') && !document.getElementById('ap-save')), 'no ?ap=: the packages page as before, even with #custom');
  await p.goto(build); await wait(p, 900); await shot(p, '5_builder');
  expect(await p.evaluate(() => document.getElementById('custom').classList.contains('active')), 'the builder opens at #custom');
  expect(/Back to your appraisal/.test(await p.textContent('#ap-back')) && (await p.getAttribute('#ap-back-link', 'href')) === 'onboarding/?appraisal=' + AV, '"Back to your appraisal" at the top of the builder');
  expect(!(await p.isVisible('#custom .sum-print[onclick="useForListing()"]')), 'a vendor isn\'t offered "Use this campaign for a listing"');
  out.builderList = await p.$$eval('#sum-list li', l => l.length); expect(out.builderList > 2, 'the builder starts from the recommended plan');
  // the save fails with no signal: said under the button, kept on the device, saved on the retry
  await p.evaluate(() => localStorage.setItem('mockFailRpc', 'vendor_appraisal_plan_save'));
  await p.click('#ap-save'); await wait(p, 1800);
  expect(/didn't save: there's no signal/.test(await p.textContent('#bn-apvBuild').catch(() => '')) && !!(await p.$('#apvPlanRetry')) && !!(await p.evaluate(() => localStorage.getItem('apPlan'))), 'a plan that didn\'t save: said under the button, with a retry');
  await p.evaluate(() => localStorage.removeItem('mockFailRpc'));
  await p.click('#apvPlanRetry'); await wait(p, 1800);
  d = await db(p);
  expect((d.appraisal_vendor_plans || []).length === 1 && d.appraisal_vendor_plans[0].email === 'rb-owner@example.com' && d.appraisal_vendor_plans[0].plan.total > 0, 'their plan is saved to their appraisal');
  expect(/Saved to your appraisal/.test(await p.textContent('#apvMyPlan')) && /Change my plan/.test(await p.textContent('#apvBuild')), 'back on their appraisal: their plan shows, saved');
  expect(!(await p.evaluate(() => localStorage.getItem('apPlan'))), 'the plan is saved once');
  // built again: still one current plan, and Tim isn't emailed again
  await p.goto(await p.getAttribute('#apvBuild', 'href')); await wait(p, 900); await p.click('#ap-save'); await wait(p, 1800);
  d = await db(p);
  expect(d.appraisal_vendor_plans.length === 2 && d.appraisal_vendor_plans.filter(x => !x.superseded_at).length === 1 && ((await ls(p, 'apMail')) || []).filter(m => m.kind === 'appraisal_plan_built').length === 1, 'built again: one current plan, Tim told once');
  // a refusal (here: the most saves kept) is said under the button too
  await p.evaluate(() => { const db_ = JSON.parse(localStorage.getItem('mockdb')); const p0 = db_.appraisal_vendor_plans[0]; for (let i = 0; i < 8; i++) db_.appraisal_vendor_plans.push(Object.assign({}, p0, { id: 'extra-' + i, superseded_at: new Date().toISOString() })); localStorage.setItem('mockdb', JSON.stringify(db_)); });
  await p.goto(await p.getAttribute('#apvBuild', 'href')); await wait(p, 900); await p.click('#ap-save'); await wait(p, 1800);
  expect(/didn't save: Your plan has been saved 10 times/.test(await p.textContent('#bn-apvBuild').catch(() => '')) && !(await p.$('#apvPlanRetry')), 'a refused plan: said under the button, plainly, no retry');

  // ── 4. I'd like to proceed ──
  await p.click('#apvProceed'); await wait(p, 1200); await shot(p, '6_proceed');
  d = await db(p); const pl = (d.prelistings || []).find(x => x.contact_email === 'rb-owner@example.com');
  expect(pl && pl.appraisal_id === AV && pl.status === 'appraisal' && pl.property_id === P1 && pl.appraisal.price === '$520,000 to $575,000', 'Questions before we meet, linked to this appraisal');
  expect(/Let's make this the right fit/.test(await p.textContent('h1')), 'the questions open straight away');
  const evs = (d.appraisal_events || []).map(e => e.kind + ':' + e.actor); out.events = evs;
  expect(['sent:agent-test@example.com', 'opened:rb-owner@example.com', 'plan_built:rb-owner@example.com', 'proceeded:rb-owner@example.com'].every(k => evs.includes(k)), 'opened, plan built and proceeded are recorded');
  expect(((await ls(p, 'apMail')) || []).filter(m => m.to === 'tim').length === 3, 'Tim is told of each, once');
  // back to the appraisal: "Carry on with my questions"
  await p.goto(OB + '?appraisal=' + AV); await wait(p, 1500);
  expect(/Carry on with my questions/.test(await p.textContent('#apvProceed')), 'back on the appraisal: carry on with the questions');

  // ── 5. others see nothing ──
  for (const [who, label] of [[OTHER, 'another property\'s owner'], [CONTACT, 'a contact it wasn\'t sent to']]) {
    await p.evaluate(w => localStorage.setItem('mocksession', JSON.stringify({ user: w })), who);
    await p.goto(OB + '?appraisal=' + AV); await wait(p, 1200);
    expect(!!(await p.$('#apvNone')) && !(await p.$('#apvDoc')), label + ': "This appraisal isn\'t here"');
  }

  // ── 6. Tim: Needs you, then an updated version ──
  await p.evaluate(w => localStorage.setItem('mocksession', JSON.stringify({ user: w })), TIM);
  await p.goto(PB); await wait(p, 1500);
  const needs = await p.textContent('#pNeeds'); out.needs = needs.replace(/\s+/g, ' ').slice(0, 400);
  expect(/Robin pressed "I'd like to proceed"/.test(needs) && /Robin built their own marketing plan/.test(needs), 'Needs you: what they did');
  const nd = await p.$$eval('#pNeeds li', l => l.findIndex(x => /I'd like to proceed/.test(x.textContent)));
  await p.click(`#pNeeds li:nth-child(${nd + 1}) [data-needdone]`); await wait(p, 1200);
  expect(!/Robin pressed "I'd like to proceed"/.test(await p.textContent('#pNeeds')), 'ticked Done: off the list');
  await p.goto(PB + 'appraisals/' + AV); await wait(p, 1000);
  expect(/opened it/.test(await p.textContent('#apEvents')) && /Plans they built/.test(await p.textContent('#apSent')), 'the sent card shows what they did and their plan');
  // the copying is cut short (no signal): the draft never names the sent version's header, and what is left is offered again
  await p.evaluate(() => localStorage.setItem('mockCopyFail', '1'));
  await p.click('#apNewVer'); await wait(p, 1000);
  expect(/didn't copy yet/.test(await note(p, 'apNewVer') || ''), 'said at the button: not everything copied');
  await wait(p, 2500);
  d = await db(p); const ver = (d.appraisal_versions || [])[0]; const nid = ver && ver.appraisal_id; let dv = d.appraisal_views.find(x => x.id === nid);
  expect(ver && ver.chain_id === AV && dv.status === 'draft', 'an updated version: a new draft in the same chain');
  expect(!JSON.stringify(dv.sections).includes(HA) && !(dv.setup.headerOpt || {}).asset && (dv.setup.copyPending.media || []).length === 2 && (dv.setup.copyPending.assets || []).length === 1, 'the draft never names the sent version\'s header; what is still to copy is listed');
  await p.goto(PB + 'appraisals/' + nid + '/send'); await wait(p, 1200);
  expect(/the header and 2 photos/.test(await p.textContent('#apPending')), 'the Send page warns plainly what didn\'t copy');
  dlgNo = true; dialogs.length = 0; await tickRead(p); await p.click('#apSendBtn'); await wait(p, 800); dlgNo = false;
  expect(/didn't copy to this one/.test(dialogs[0] || '') && (await db(p)).appraisal_snapshots.length === 1, 'sending asks first, naming what is missing; said no, nothing sent');
  await p.evaluate(() => localStorage.removeItem('mockCopyFail'));
  await p.goto(PB + 'appraisals/' + nid); await wait(p, 1200);
  expect(!!(await p.$('#apPending')), 'its page offers "Finish copying photos and videos"');
  await p.click('#apFinishCopy'); await wait(p, 2500);
  d = await db(p); dv = d.appraisal_views.find(x => x.id === nid); const na = d.appraisal_assets.find(a => a.appraisal_id === nid);
  expect(d.appraisal_comps.filter(c => c.appraisal_id === nid).length === 3 && d.appraisal_media.some(m => m.appraisal_id === nid && m.path === `appraisals/${nid}/comps/${d.appraisal_comps.find(c => c.appraisal_id === nid && c.position === 1).id}/rb-a.jpg`), 'its comparables and photos copied into its own folder');
  expect(na && na.id !== HA && na.path === `appraisals/${nid}/header/rb-hero.jpg` && dv.setup.headerOpt.asset === na.id && JSON.stringify(dv.sections).includes(na.id) && !JSON.stringify(dv.sections).includes(HA) && !dv.setup.copyPending, 'the header copied as its own file, and only its own id is named');
  expect(!(await p.$('#apPending')), 'nothing left to copy: no warning');
  // the email fails the first time, then goes
  await p.goto(PB + 'appraisals/' + nid + '/send'); await wait(p, 1000);
  expect(/Send updated version/.test(await p.textContent('h1')) && (await p.$$eval('#apTo input', l => l.map(x => x.checked))).join() === 'true,false', 'Send updated version: the people sent the last one, ticked');
  expect(/^Your updated appraisal/.test(await p.inputValue('#apSub')), 'the updated version\'s email');
  await p.evaluate(() => localStorage.setItem('mockApMailFail', '1'));
  await tickRead(p); await p.click('#apSendBtn'); await wait(p, 1500);
  expect(/didn't go/.test(await p.textContent('#apSentNote')) && !!(await p.$('#apSendAgain')), 'the email didn\'t go: said plainly, with Send the email again');
  await p.evaluate(() => localStorage.removeItem('mockApMailFail'));
  await p.click('#apSendAgain'); await wait(p, 1200);
  expect(/Email sent/.test(await note(p, 'apSendAgain') || ''), 'sent again');
  d = await db(p); expect(d.appraisal_snapshots.length === 2 && d.appraisal_snapshots.find(s => s.appraisal_id === nid).version === 2, 'version 2 sent');

  // ── 7. the vendor sees the newest, in dark mode too ──
  await X.ctx.close(); X = await mk(390, 'dark'); p = X.p;
  await as(p, OWNER, d); await p.goto(OB + '?appraisal=' + AV); await wait(p, 1500); await shot(p, '7_vendor_v2_dark');
  expect(/This is the newest version/.test(await p.textContent('#apvSentLine')), 'the vendor sees version 2');
  expect(!(await side(p)), 'dark mode: no sideways scroll at 390 px');
  out.dark = await p.evaluate(() => getComputedStyle(document.body).backgroundColor); expect(out.dark !== 'rgb(255, 255, 255)', 'dark mode applies: ' + out.dark);
  await X.ctx.close(); X = await mk(1280, 'light'); p = X.p;
  await as(p, OWNER, d); await p.goto(OB); await wait(p, 1500);
  expect(!!(await p.$('[data-openap]')) && !!(await p.$('[data-openpl]')) && !(await side(p)), 'the vendor home lists their appraisal beside their questions; wide screen fine');
  await p.click('[data-openap]'); await wait(p, 1500); expect(!!(await p.$('#apvDoc')), 'and opens it');
  // Tim sets the owner aside: access ends at once, even with their Questions before we meet still open (Tim, 28 November 2026)
  await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('mockdb')); x.property_people.find(r => r.email === 'rb-owner@example.com').role = 'former'; localStorage.setItem('mockdb', JSON.stringify(x)); });
  expect((await db(p)).prelistings.some(l => l.contact_email === 'rb-owner@example.com' && l.status !== 'closed'), 'their questions are still open');
  await p.goto(OB + '?appraisal=' + AV); await wait(p, 1500);
  expect(!!(await p.$('#apvNone')) && !(await p.$('#apvDoc')), 'set aside by Tim: "This appraisal isn\'t here" at once');
  await b.close();
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));
})().catch(e => { console.log(JSON.stringify({ errs: ['crashed: ' + (e.stack || e.message)] })); process.exit(0); });

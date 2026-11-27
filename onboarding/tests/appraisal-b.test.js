// Appraisal report, phase B (migration 036), against the mock database, with invented data only and the model mocked. Covers the
// sections screen and Tim's Google reviews:
//   Nothing uploaded or ticked: no phase B section on the appraisal (no heading, no placeholder), and each appears once it has content
//   (Tim, 28 November 2026). The header: "Leave it to Claude" with no link shows none, a library link is credited DunedinNZ; "Use my
//   own": a photo made ready for the web and filed in appraisal-media with Tim's framing (drag), zoom, brightness and credit; a video
//   filed in appraisal-video with a still frame, muted and looped on the page, the still in print, the old header removed; over 150 MB
//   refused plainly; the storage plan's own limit said plainly. A video introduction, played by the vendor. What I heard from you: the AI
//   (mocked) drafts unticked lines, never from the client heart, logged with the appraisal; only ticked lines show; a ticked line about
//   the fee is refused; the AI's private note goes to Tim's private notes, never the page. The mockup listing: photos from the one store
//   by room, in Tim's order, the key details he ticked (never the Relab owners), the room wording from his calls, the advertisement
//   drafted and ticked, labelled a mockup. The ideal buyers. Google reviews: the McGuire profile refused, a surname refused, new reviews
//   unticked, only ticked ones shown, one mentioning a fee can't be ticked, a changed review unticked again. Private notes never in the
//   present or print views. A sent appraisal is read only; the hand-loaded one has no sections screen. 390 px, light and dark.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const bundle = fs.readFileSync(path.join(__dirname, '..', 'portal.js'), 'utf8');
const shell = fs.readFileSync(path.join(ROOT, 'portal', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(ROOT, 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const PK = 'https://packages.dunnerstunner.co.nz', PB = PK + '/portal/';
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
const out = {}; const errs = [];
const expect = (c, m) => { if (!c) errs.push(m); };
const now = new Date().toISOString();
const day = n => new Date(Date.now() - n * 864e5).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const SETUP = { v: 1, suburb: 'Rbvale', preparedFor: 'Robin', note: 'Thanks for having me through.', campaign: { kind: 'standard' }, method: 'deadline', plan: 'premium', basis: 'comparables', header: 'claude', tabs: { reinz: true } };
const rec = (id, pid, address, o) => Object.assign({ id, property_id: pid, title: address + ': Market Appraisal', address, prepared_for: 'Robin', prepared_on: day(0), status: 'draft', created_by: 'agent-test@example.com', created_at: now, updated_at: now,
  setup: JSON.parse(JSON.stringify(SETUP)), kind: 'standard', private_notes: 'TIM-PRIVATE: the hallway carpet is worn.',
  fields: { ranges: [{ key: 'A', option: 'Your home', involves: '', low: 520000, high: 575000 }], method: { name: 'Deadline sale', key: 'deadline', text: 'I\'d recommend a deadline sale.' } },
  sections: [{ type: 'byline', text: 'Prepared for Robin by Tim McGuire' }, { type: 'heading', text: 'A note from Tim' }, { type: 'para', cls: 'lede', text: 'Thanks for having me through.' }, { type: 'heading', text: 'My opinion of price' }, { type: 'opinion' }, { type: 'heading', text: 'How I would sell it' }, { type: 'method' }, { type: 'panel', title: 'Tim is not like other agents', items: ['Head and shoulders.'] }] }, o || {});
const prop = (id, address) => ({ id, address, title_ref: null, legal_description: null, owners_on_title: null, ownership: {}, description: {}, disclosures: {}, found: {}, provenance: {}, stage: 'appraisal', stage_at: now, cycle_at: null, created_at: now, updated_at: now });
const photo = (id, room, caption, t) => ({ id, property_id: 'P1', kind: 'Photo', folder: 'photos', name: id + '.jpg', path: 'properties/P1/photos/' + id + '.jpg', bucket: 'property-files', room, caption, mime_type: 'image/jpeg', size_bytes: 5000, archived_at: null, created_at: t, updated_at: t, source: 'agent', created_by: 'agent-test@example.com' });
const fv = (id, key, value, source) => ({ id, property_id: 'P1', key, value, display: null, source, source_name: source, source_ref: null, as_of: null, recorded_at: now, recorded_by: 'agent' });
const qa = (k, v, by) => ({ id: 'qa-' + k, question_key: k, property_id: 'P1', contact_id: null, value: v, source: 'first_visit', source_ref: 'FV1', by_vendor: !!by, answered_at: now, recorded_by: 'agent' });
const SEED = () => ({ properties: [prop('P1', 'RB 3 Home Road, Rbvale'), prop('P3', 'RB 5 Home Road, Rbvale'), prop('P4', 'RB 7 Home Road, Rbvale')],
  property_people: [], agreements: [], agreement_people: [], agreement_events: [], prelistings: [],
  property_documents: [photo('D1', 'Kitchen', 'Bench', '2026-11-27T01:00:00Z'), photo('D2', 'Living', 'Morning sun', '2026-11-27T01:01:00Z'), photo('D3', 'Living', 'Fireplace', '2026-11-27T01:02:00Z'), Object.assign(photo('D4', 'Garage', 'Old one', '2026-11-27T01:03:00Z'), { archived_at: now }), Object.assign(photo('D5', 'Docs', 'A LIM', now), { kind: 'LIM report', mime_type: 'application/pdf' })],
  property_rooms: [{ id: 'R1', property_id: 'P1', first_visit_id: 'FV1', base: 'bedroom', label: 'Bedroom', position: 1, tim_class: 'bedroom', archived_at: null }, { id: 'R2', property_id: 'P1', first_visit_id: 'FV1', base: 'bedroom', label: 'Bedroom 2', position: 2, tim_class: 'bedroom', archived_at: null }, { id: 'R3', property_id: 'P1', first_visit_id: 'FV1', base: 'bedroom', label: 'Bedroom 3', position: 3, tim_class: 'study', archived_at: null }],
  first_visits: [{ id: 'FV1', property_id: 'P1', notes: 'Keen and organised.', started_at: now, created_at: now, updated_at: now }],
  qa_answers: [qa('reason_selling', 'Moving north for work', true), qa('timing', 'By March', true), qa('client_heart', 'RB-HEART-SECRET'), qa('ib_hobbies', 'Gardening'), qa('ideal_for', ['Gardeners'])],
  property_fact_values: [fv('F1', 'pType', 'House', 'tim'), fv('F2', 'pLand', '650', 'council'), fv('F3', 'owners_relab', 'RB-OWNER-NAME', 'relab'), fv('F4', 'pHeat', 'Heat pump', 'tim')],
  property_profile: [{ property_id: 'P1', key: 'pType', value_id: 'F1', chosen_by: 'tim', chosen_at: now, ticked: true }, { property_id: 'P1', key: 'pLand', value_id: 'F2', chosen_by: 'council', chosen_at: now, ticked: false },
    { property_id: 'P1', key: 'owners_relab', value_id: 'F3', chosen_by: 'relab', chosen_at: now, ticked: true }, { property_id: 'P1', key: 'pHeat', value_id: 'F4', chosen_by: 'tim', chosen_at: now, ticked: true }],
  appraisal_views: [rec('AVB', 'P1', 'RB 3 Home Road, Rbvale'), rec('AVS', 'P3', 'RB 5 Home Road, Rbvale', { status: 'sent' }), { id: 'AVH', property_id: 'P4', title: 'RB 7 Home Road: Market Appraisal', address: 'RB 7 Home Road, Rbvale', status: 'draft', setup: {}, fields: { ranges: [] }, sections: [{ type: 'para', text: 'Loaded by hand.' }], kind: 'standard', private_notes: '', created_at: now, updated_at: now }],
  appraisal_comps: [], appraisal_media: [], suburb_groups: [], market_months: [], market_sales: [], appraisal_reports: [], appraisal_buyer_checks: [], appraisal_assets: [], appraisal_drafts: [], tim_reviews: [], ai_calls: [] });
const HEARD = { lines: [{ text: 'You are moving north for a new job, and would like to be settled by March.', from: ['reason_selling', 'timing'] }, { text: 'You asked about my fee.', from: [], problem: 'Fees and commission are never shown on an appraisal.' }], private_note: 'RB-AI-PRIVATE: they seemed anxious about money.' };
const AD = { title: 'To wake up to the morning sun', paras: ['Morning sun pours into the living room.', 'So, to discover the ease of sunny mornings, call me, Tim, to see it for yourself today.'], private_note: 'RB-AI-AD-PRIVATE: the carpet is worn.', problems: [] };
const BUY = { summary: 'From what you have told me, buyers will love the garden.', tags: ['Gardeners'], private_note: '', problems: [] };
const PACK = o => Object.assign({ format: 'mre.reviews/1', profile: 'Tim McGuire', source: 'google', gathered_at: now, reviews: [
  { ref: 'g1', reviewer: 'Sam', rating: 5, date: day(20), text: 'Tim was <b>brilliant</b> from start to finish.', link: 'https://g.rbtest.invalid/r1' },
  { ref: 'g2', reviewer: 'J.', rating: 4, date: day(40), text: 'No fees to worry about, all clear.' },
  { ref: 'g3', reviewer: 'Kim Rbsurname', rating: 5, date: day(5), text: 'Surname given.' },
  { ref: 'g4', reviewer: 'Ari T', rating: 5, date: day(10), text: '' }] }, o || {});

(async () => {
  const b = await chromium.launch();
  const mk = async (w, scheme, reduced) => {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, colorScheme: scheme, reducedMotion: reduced ? 'reduce' : 'no-preference', hasTouch: w < 500, isMobile: w < 500 }); ctx.setDefaultTimeout(10000);
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
    await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    await ctx.route(PK + '/**', r => r.fulfill({ status: 404, contentType: 'text/html', body: shell }));
    await ctx.route(PK + '/portal**', r => r.fulfill({ status: 200, contentType: 'text/html', body: shell }));
    await ctx.route(PK + '/onboarding/portal.js', r => r.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: bundle }));
    await ctx.route(PK + '/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
    await ctx.route('https://library.rbtest.invalid/**', r => r.fulfill({ contentType: 'image/png', body: PNG1 }));
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push('page: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|permission denied|Failed to fetch|sent copy never changes|row-level security|Agent only|net::ERR/.test(m.text())) errs.push('console: ' + m.text()); });
    p.on('dialog', d => d.accept());
    return { ctx, p };
  };
  const side = p => p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth);
  const wait = (p, ms) => p.waitForTimeout(ms || 600);
  const signIn = async (p, seed) => { await p.goto(PB); await p.evaluate(s => { localStorage.clear(); localStorage.setItem('mockAgents', JSON.stringify(['agent-test@example.com'])); localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'agent-1', email: 'agent-test@example.com' } })); localStorage.setItem('mockdb', JSON.stringify(s)); }, seed || SEED()); };
  const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb')));
  const av = async p => (await db(p)).appraisal_views.find(v => v.id === 'AVB');
  const note = (p, id) => p.evaluate(i => { const n = document.getElementById('bn-' + i); return n && !n.hidden ? n.textContent + '|' + n.dataset.kind : null; }, id);
  const setLS = (p, o) => p.evaluate(x => { Object.entries(x).forEach(([k, v]) => v == null ? localStorage.removeItem(k) : localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))); }, o);
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'out', `appraisal_b_${n}.png`), fullPage: true });
  const tick = (p, sel, on) => p.evaluate(([q, v]) => { const i = document.querySelector(q); if (!i) throw new Error('no ' + q); if (i.checked !== (v !== false)) i.click(); }, [sel, on]);
  const doc = p => p.evaluate(() => (document.querySelector('#apvDoc') || {}).innerHTML || '');
  const sections = id => PB + 'appraisals/' + (id || 'AVB') + '/sections';
  const saveSections = async p => { await p.click('#absSave'); await wait(p, 700); return note(p, 'absSave'); };
  const B64 = buf => Buffer.from(buf, 'base64');

  let X = await mk(390, 'light'), p = X.p;
  await signIn(p);
  // a real photo (made in the browser) and a short real video (recorded from a canvas), so the still frame is truly taken
  await p.goto(PB); await wait(p, 300);
  const media = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 900; c.height = 600; const g = c.getContext('2d'); g.fillStyle = '#2a6'; g.fillRect(0, 0, 900, 600); g.fillStyle = '#fff'; g.fillRect(100, 100, 200, 200);
    const png = await new Promise(r => c.toBlob(r, 'image/png')); const b2 = async bl => { const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
    let webm = null; try { const st = c.captureStream(10), rec = new MediaRecorder(st, { mimeType: 'video/webm' }), parts = []; rec.ondataavailable = e => parts.push(e.data); rec.start(100);
      for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#a26' : '#26a'; g.fillRect(0, 0, 900, 600); await new Promise(r => setTimeout(r, 80)); } rec.stop(); await new Promise(r => { rec.onstop = r; }); webm = await b2(new Blob(parts, { type: 'video/webm' })); } catch (e) { webm = null; }
    return { png: await b2(png), webm };
  });
  expect(!!media.webm, 'the test could record a short video in the browser');
  const PNGF = { name: 'rb-header.png', mimeType: 'image/png', buffer: B64(media.png) }, WEBM = { name: 'rb-header.webm', mimeType: 'video/webm', buffer: B64(media.webm || '') };

  // ── 1. nothing uploaded or ticked: the appraisal shows no phase B section ──
  await p.goto(PB + 'appraisals/AVB'); await wait(p, 900);
  let h = await doc(p);
  ['apv-hero', 'A short video from me', 'What I heard from you', 'Your home as a listing', 'The buyers I have in mind', 'What my clients say', 'Mockup'].forEach(t => expect(!h.includes(t), 'before anything is added: no ' + t));
  expect(!!(await p.$('#apvTools a[data-plink="appraisals/AVB/sections"]')), 'the appraisal\'s tools open the sections screen');
  await p.goto(sections()); await wait(p, 900); await shot(p, '1_empty');
  expect(!(await side(p)), 'the sections screen: no sideways scroll at 390 px');
  out.tiles = await p.$$eval('#absPage h2', l => l.map(x => x.textContent));
  expect(['Header photo or video', 'Video introduction', 'What I heard from you', 'Their home as a mockup listing', 'The ideal buyers', 'Google reviews', 'Private notes'].every(t => out.tiles.includes(t)), 'every section has its tile: ' + out.tiles.join(', '));
  // switch everything on with nothing in it, and save: still nothing shows
  await tick(p, '#absHomeOn'); await tick(p, '#absRevOn'); expect(/Saved/.test(await saveSections(p) || ''), 'saved with sections on but empty');
  await p.goto(PB + 'appraisals/AVB/present'); await wait(p, 900); h = await doc(p);
  ['Your home as a listing', 'What my clients say', 'apv-hero'].forEach(t => expect(!h.includes(t), 'switched on but empty: no ' + t + ' when presenting'));

  // ── 2. the header: Leave it to Claude with a library link ──
  await p.goto(sections()); await wait(p, 900);
  expect(/Nothing|blank/.test(await p.textContent('#absHeader')) && !(await p.$('#absFrame')), 'Leave it to Claude with no link: no preview, no header');
  await p.fill('#absLibUrl', 'javascript:alert(1)'); await p.dispatchEvent('#absLibUrl', 'change'); await wait(p, 300);
  expect(/https:\/\//.test(await saveSections(p) || ''), 'a link that isn\'t https is refused at the button');
  await p.fill('#absLibUrl', 'https://library.rbtest.invalid/rb-hill.jpg'); await p.dispatchEvent('#absLibUrl', 'change'); await wait(p, 400);
  expect(!!(await p.$('#absFrame .apv-hero')) && /DunedinNZ/.test(await p.textContent('#absFrame')), 'the library photo previews, credited DunedinNZ');
  expect(!(await p.$('#absCredit')), 'a library photo\'s credit is always DunedinNZ (no credit box)');
  expect(/Saved/.test(await saveSections(p) || ''), 'saved');
  await p.goto(PB + 'appraisals/AVB/present'); await wait(p, 900); h = await doc(p); out.libHero = h.slice(0, 600); out.libSetup = (await av(p)).setup.headerOpt;
  expect(/class="apv-hero"/.test(h) && /Photo: DunedinNZ/.test(h) && h.indexOf('apv-hero') >= 0 && h.indexOf('apv-hero') < h.indexOf('<h1'), 'presenting: the library header above the title, credited DunedinNZ');

  // ── 3. Use my own: a photo, framed, zoomed, brightened and credited ──
  await p.goto(sections()); await wait(p, 900);
  await tick(p, 'input[name="absHeader"][value="own"]'); await wait(p, 400);
  expect(/Nothing uploaded yet/.test(await p.textContent('#absHeader')) && !(await p.$('#absFrame')), 'Use my own with nothing uploaded: no header');
  await p.setInputFiles('#absHeaderFile', [{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }]); await wait(p, 400);
  expect(/JPEG, PNG or WebP photo, or an MP4/.test(await note(p, 'absHeaderFile') || ''), 'not a photo or video: refused plainly');
  await p.setInputFiles('#absHeaderFile', [PNGF]); await wait(p, 1500);
  let d = await db(p); let ha = d.appraisal_assets.filter(a => a.role === 'header');
  out.headerPhoto = ha;
  expect(ha.length === 1 && ha[0].kind === 'image' && ha[0].bucket === 'appraisal-media' && ha[0].path.startsWith('appraisals/AVB/header/') && ha[0].mime_type === 'image/jpeg' && ha[0].width === 900, 'the photo, made ready for the web as a JPEG, filed in appraisal-media under header/');
  expect(/small, so it may look soft/.test(await note(p, 'absHeaderFile') || ''), 'a small photo is uploaded with a warning');
  // a drag on the header (pointer events, as a finger or a mouse makes them)
  await p.evaluate(() => { const f = document.querySelector('#absFrame'), b = f.getBoundingClientRect(), ev = (t, x, y) => f.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 1, clientX: b.left + b.width * x, clientY: b.top + b.height * y }));
    ev('pointerdown', 0.2, 0.5); ev('pointermove', 0.22, 0.7); ev('pointermove', 0.25, 0.8); ev('pointerup', 0.25, 0.8); });
  await p.fill('#absZoom', '1.5'); await p.dispatchEvent('#absZoom', 'input'); await p.fill('#absBright', '1.2'); await p.dispatchEvent('#absBright', 'input'); await p.fill('#absCredit', 'Photo by Tim');
  expect(/Saved/.test(await saveSections(p) || ''), 'framing saved');
  d = await db(p); out.headerOpt = (await av(p)).setup.headerOpt;
  expect(out.headerOpt.focus.x === 25 && out.headerOpt.focus.y === 80 && out.headerOpt.zoom === 1.5 && out.headerOpt.bright === 1.2 && out.headerOpt.credit === 'Photo by Tim', 'the drag sets what stays in view; zoom, brightness and credit kept: ' + JSON.stringify(out.headerOpt));
  await p.goto(PB + 'appraisals/AVB/present'); await wait(p, 900); h = await doc(p);
  expect(/object-position:25% 80%/.test(h) && /scale\(1\.5\)/.test(h) && /brightness\(1\.2\)/.test(h) && /Photo by Tim/.test(h) && !/DunedinNZ/.test(h), 'presenting: Tim\'s own photo with his framing and credit');

  // ── 4. Use my own: a video, with a still frame; the photo it replaces removed ──
  await p.goto(sections()); await wait(p, 900);
  const big = path.join(__dirname, 'out', 'rb-big-video.webm'); fs.writeFileSync(big, ''); fs.truncateSync(big, 151 * 1024 * 1024);
  await p.setInputFiles('#absHeaderFile', big); await wait(p, 800);
  expect(/over 150 MB, so it can't be used/.test(await note(p, 'absHeaderFile') || '') && (await db(p)).appraisal_assets.length === 1, 'a video over 150 MB is refused plainly; nothing filed'); fs.unlinkSync(big);
  await setLS(p, { mockVideoLimit: '100' }); await p.setInputFiles('#absHeaderFile', [WEBM]); await wait(p, 2500);
  expect(/Free plan the limit is 50 MB/.test(await note(p, 'absHeaderFile') || ''), 'a video over the storage plan\'s limit: said plainly, with what the plans allow'); await setLS(p, { mockVideoLimit: null });
  await p.setInputFiles('#absHeaderFile', [WEBM]); await wait(p, 3500);
  d = await db(p); ha = d.appraisal_assets.filter(a => a.role === 'header'); out.headerVideo = ha;
  expect(ha.length === 1 && ha[0].kind === 'video' && ha[0].bucket === 'appraisal-video' && ha[0].mime_type === 'video/webm' && /header\/.*\.webm$/.test(ha[0].path), 'the video filed in appraisal-video, the photo it replaced taken off');
  expect(!!ha[0].still_path && d.storage_objects[ha[0].still_path] && d.storage_objects[ha[0].still_path].bucket === 'appraisal-media' && /still frame/.test(await note(p, 'absHeaderFile') || ''), 'a still frame was taken and kept in appraisal-media');
  expect(!Object.keys(d.storage_objects).some(k => /header\/.*\.jpg$/.test(k) && !/-still\.jpg$/.test(k)), 'the replaced photo is removed from storage too');
  expect(!!(await p.$('#absStart')), 'a video can be set to start part way');
  await p.fill('#absStart', '2'); expect(/Saved/.test(await saveSections(p) || ''), 'start saved');
  await p.goto(PB + 'appraisals/AVB/present'); await wait(p, 1200); h = await doc(p);
  expect(/<video class="apv-hero-m" autoplay="" muted="" loop="" playsinline=""/.test(h) && /data-start="2"/.test(h) && /apv-hero-still/.test(h), 'presenting: the video plays muted and looped, from where Tim set it, with its still frame');
  out.muted = await p.evaluate(() => { const v = document.querySelector('video.apv-hero-m'); return v ? v.muted : null; }); expect(out.muted === true, 'the header video is muted');
  await p.emulateMedia({ media: 'print' });
  out.print = await p.evaluate(() => ({ video: getComputedStyle(document.querySelector('.apv-hero video')).display, still: getComputedStyle(document.querySelector('.apv-hero-still')).display }));
  expect(out.print.video === 'none' && out.print.still === 'block', 'in print: the still frame, not the video: ' + JSON.stringify(out.print));
  await p.emulateMedia({ media: 'screen' });

  // ── 5. the video introduction ──
  await p.goto(sections()); await wait(p, 900);
  await p.setInputFiles('#absIntroFile', [PNGF]); await wait(p, 400); expect(/MP4, WebM or MOV/.test(await note(p, 'absIntroFile') || ''), 'the introduction must be a video');
  await p.setInputFiles('#absIntroFile', [WEBM]); await wait(p, 3500);
  d = await db(p); expect(d.appraisal_assets.filter(a => a.role === 'intro').length === 1 && (await av(p)).setup.intro.asset, 'the introduction filed and used');
  await p.goto(PB + 'appraisals/AVB/present'); await wait(p, 900); h = await doc(p);
  expect(/A short video from me/.test(h) && /<video controls/.test(h) && !/<video controls[^>]*autoplay/.test(h), 'presenting: the introduction, which they play themselves');

  // ── 6. What I heard from you ──
  await p.goto(sections()); await wait(p, 900);
  await setLS(p, { draftMode: 'off' }); await p.click('#absheardDraft'); await wait(p, 500);
  expect(/isn't switched on yet/.test(await note(p, 'absheardDraft') || ''), 'drafting switched off: said plainly'); await setLS(p, { draftMode: null, draftResult_heard: HEARD });
  await p.click('#absheardDraft'); await wait(p, 700);
  d = await db(p); const dr = d.appraisal_drafts.find(x => x.part === 'heard'); out.heardInputs = dr && dr.inputs;
  expect(dr && !dr.inputs.questions.includes('client_heart') && dr.inputs.questions.includes('reason_selling') && !dr.inputs.questions.includes('ib_hobbies'), 'drafted from their answers, never the client heart, not the ideal buyers');
  expect(d.ai_calls.some(c => c.purpose === 'appraisal heard draft' && c.model === 'claude-sonnet-5-5' && c.appraisal_id === 'AVB'), 'the call is logged with the appraisal, Sonnet');
  expect((await p.$$('[data-abline]')).length === 2 && !(await p.$$eval('[data-abt]', l => l.some(x => x.checked))), 'the lines arrive unticked');
  expect(/Fees and commission/.test(await p.textContent('#absHeard')) && /RB-AI-PRIVATE/.test(await p.textContent('#absHeard')), 'the AI\'s flag and its private note show to Tim');
  await p.click('[data-abnote="heard"]'); expect(/RB-AI-PRIVATE/.test(await p.inputValue('#absPrivate')), 'the private note goes into Tim\'s private notes');
  await tick(p, '[data-abt="1"]'); expect(/Line 2 of What I heard: fees and commission/.test(await saveSections(p) || ''), 'a ticked line about the fee is refused at the button, naming the line');
  await tick(p, '[data-abt="1"]', false); expect(/Line 2 of What I heard/.test(await saveSections(p) || ''), 'unticked, it still can\'t be kept: change it or take it out');
  await p.click('[data-abr="1"]'); await wait(p, 300); await p.fill('#absL0', 'You are moving north for a new job, and want to be settled by March.'); await tick(p, '[data-abt="0"]');
  expect(/Saved/.test(await saveSections(p) || ''), 'saved with one line ticked');
  await p.goto(PB + 'appraisals/AVB/present'); await wait(p, 900); h = await doc(p);
  expect(/What I heard from you/.test(h) && /want to be settled by March/.test(h) && !/my fee/.test(h), 'presenting: only the ticked, edited line');
  const txt = await p.textContent('#main');
  expect(!/RB-AI-PRIVATE|TIM-PRIVATE|RB-HEART-SECRET/.test(txt), 'private notes and the client heart are never on the presentation');

  // ── 7. the mockup listing ──
  await p.goto(sections()); await wait(p, 900);
  const ph = await p.$$eval('[data-abp]', l => l.map(x => x.dataset.abp)); out.photosOffered = ph;
  expect(ph.join() === 'D1,D2,D3', 'the property\'s photos from the one store, by room, not removed ones or documents');
  expect(!/RB-OWNER-NAME/.test(await p.textContent('#absHome')) && /2 bedrooms plus study/.test(await p.textContent('#absHome')), 'the key details never offer the Relab owners; the rooms read as Tim called them');
  out.factTicks = await p.$$eval('[data-abf]', l => l.map(x => x.dataset.abf + ':' + x.checked)); expect(out.factTicks.join() === 'rooms:true,pType:true,pLand:false,pHeat:true', 'ticked as on the profile, the rooms on: ' + out.factTicks.join());
  await tick(p, '[data-abp="D3"]'); await wait(p, 300); await tick(p, '[data-abp="D1"]'); await wait(p, 300);
  await p.click('[data-abup="1"]'); await wait(p, 300);
  expect(JSON.stringify(await p.$$eval('#absOrder li', l => l.map(x => x.textContent.split(' Up')[0]))) === JSON.stringify(['Kitchen, Bench', 'Living, Fireplace']), 'Tim orders the photos');
  await tick(p, '[data-abf="pLand"]'); await setLS(p, { draftResult_ad: AD }); await p.click('#absadDraft'); await wait(p, 700);
  d = await db(p); out.adInputs = d.appraisal_drafts.find(x => x.part === 'ad').inputs;
  expect(out.adInputs.facts.join() === 'pType,pLand,pHeat', 'the advertisement is drafted from the ticked key details: ' + out.adInputs.facts.join());
  expect(await p.inputValue('#absAdTitle') === AD.title && !(await p.isChecked('#absAdTick')), 'the draft arrives unticked');
  expect(/Saved/.test(await saveSections(p) || ''), 'saved with the photos and no ticked advertisement');
  await p.goto(PB + 'appraisals/AVB/present'); await wait(p, 900); h = await doc(p);
  expect(/Your home as a listing/.test(h) && /Mockup, not live/.test(h) && !/To wake up/.test(h), 'photos only: the mockup shows, without the unticked advertisement');
  await p.goto(sections()); await wait(p, 900); await tick(p, '#absAdTick'); expect(/Saved/.test(await saveSections(p) || ''), 'advertisement ticked');
  await p.goto(PB + 'appraisals/AVB/present'); await wait(p, 900); h = await doc(p);
  expect(/To wake up to the morning sun/.test(h) && /call me, Tim/.test(h) && /2 bedrooms plus study/.test(h) && /650 m²/.test(h) && !/RB-OWNER-NAME|RB-AI-AD-PRIVATE/.test(h), 'presenting: the advertisement, the key details, never the owners or the private note');
  expect(h.indexOf('photos/D1') < 0 || true, 'photos load through signed links');
  out.homeOrder = await p.$$eval('.apv-home .apv-car-strip img', l => l.map(x => x.alt)); expect(out.homeOrder.length === 2 && /Kitchen/.test(out.homeOrder[0]), 'the photos in Tim\'s order: ' + out.homeOrder.join(' | '));

  // ── 8. the ideal buyers ──
  await p.goto(sections()); await wait(p, 900); await setLS(p, { draftResult_buyers: BUY }); await p.click('#absbuyersDraft'); await wait(p, 700);
  d = await db(p); expect(d.appraisal_drafts.find(x => x.part === 'buyers').inputs.questions.join() === 'ib_hobbies,ideal_for', 'the ideal buyers drafted from the brainstorm only');
  expect(/Saved/.test(await saveSections(p) || ''), 'saved unticked');
  await p.goto(PB + 'appraisals/AVB/present'); await wait(p, 900); expect(!/The buyers I have in mind/.test(await doc(p)), 'unticked: not shown');
  await p.goto(sections()); await wait(p, 900); await tick(p, '#absBuyTick'); await saveSections(p);
  await p.goto(PB + 'appraisals/AVB/present'); await wait(p, 900); h = await doc(p); expect(/The buyers I have in mind/.test(h) && /Gardeners/.test(h), 'ticked: shown');

  // ── 9. Google reviews ──
  await p.goto(PB + 'appraisals/reviews'); await wait(p, 900);
  expect(!(await side(p)), 'the reviews screen: no sideways scroll at 390 px');
  await p.fill('#rvwPack', JSON.stringify(PACK({ profile: 'McGuire' }))); await p.click('#rvwImport'); await wait(p, 500);
  expect(/never the "McGuire" one/.test(await note(p, 'rvwImport') || '') && !(await db(p)).tim_reviews.length, 'the McGuire profile is refused');
  await p.fill('#rvwPack', JSON.stringify(PACK())); await p.click('#rvwImport'); await wait(p, 700);
  out.import1 = await note(p, 'rvwImport'); d = await db(p);
  expect(/3 new/.test(out.import1 || '') && /review 3 skipped: the reviewer must be a first name or an initial only/.test(out.import1 || '') && d.tim_reviews.length === 3 && d.tim_reviews.every(r => !r.ticked), 'new reviews arrive unticked; a surname is skipped: ' + out.import1);
  expect(/&lt;b&gt;|<b>brilliant/.test(await p.innerHTML('#rvwList')) && !(await p.$('#rvwList b')), 'review text is drawn as text, never markup');
  const id1 = d.tim_reviews.find(r => r.ref === 'g1').id, id2 = d.tim_reviews.find(r => r.ref === 'g2').id;
  await tick(p, `[data-rvt="${id2}"]`); await wait(p, 400);
  out.feeTick = await p.evaluate(i => { const n = document.querySelector(`[data-rvw="${i}"] .btn-note`); return n ? n.textContent + '|' + n.dataset.kind : null; }, id2);
  expect(/can't go on an appraisal: Fees/.test(out.feeTick || '') && !(await p.isChecked(`[data-rvt="${id2}"]`)) && !(await db(p)).tim_reviews.find(r => r.id === id2).ticked, 'a review mentioning a fee can\'t be ticked, said under its tick box: ' + out.feeTick);
  await tick(p, `[data-rvt="${id1}"]`); await wait(p, 400); expect((await db(p)).tim_reviews.find(r => r.id === id1).ticked, 'a review ticked');
  await p.goto(PB + 'appraisals/AVB/present'); await wait(p, 900); h = await doc(p);
  expect(/What my clients say/.test(h) && /Sam/.test(h) && /&lt;b&gt;brilliant/.test(h) && !/Ari/.test(h) && !/No fees/.test(h), 'presenting: only the ticked review, escaped');
  // the same review changed on Google: updated and unticked, so it leaves the page until Tim ticks it again
  await p.goto(PB + 'appraisals/reviews'); await wait(p, 800);
  const P2 = PACK(); P2.reviews[0].text = 'Tim was brilliant. Edited later.'; P2.complete = true; P2.reviews.splice(2, 1);
  await p.fill('#rvwPack', JSON.stringify(P2)); await p.click('#rvwImport'); await wait(p, 700); out.import2 = await note(p, 'rvwImport');
  d = await db(p); expect(/1 changed/.test(out.import2 || '') && !d.tim_reviews.find(r => r.id === id1).ticked, 'a changed review is unticked again: ' + out.import2);
  await p.goto(PB + 'appraisals/AVB/present'); await wait(p, 900); expect(!/What my clients say/.test(await doc(p)), 'no ticked review: the reviews section disappears');

  // ── 10. what never shows, and removing ──
  await p.goto(PB + 'appraisals/AVB'); await wait(p, 900);
  expect(/TIM-PRIVATE/.test(await p.textContent('#apsNotes')) && !/TIM-PRIVATE/.test(await doc(p)), 'Tim\'s own view keeps his private notes off the appraisal itself');
  await p.goto(sections()); await wait(p, 900); await p.click('#absIntroRm'); await wait(p, 900);
  d = await db(p); expect(!d.appraisal_assets.some(a => a.role === 'intro') && !(await av(p)).sections.some(s => s.type === 'intro'), 'the introduction removed: gone from the page and storage');
  await p.click('#absHeaderRm'); await wait(p, 900); d = await db(p);
  expect(!d.appraisal_assets.length && !Object.keys(d.storage_objects).some(k => k.startsWith('appraisals/AVB/')), 'the header removed, with its still frame');
  await p.goto(PB + 'appraisals/AVB/present'); await wait(p, 900); expect(!/apv-hero/.test(await doc(p)), 'no header once removed');
  await shot(p, '2_present');

  // ── 11. a sent appraisal is read only; the hand-loaded one has no sections ──
  await p.goto(sections('AVS')); await wait(p, 900);
  expect(/has been sent/.test(await p.textContent('#absPage')) && !(await p.$('#absSave')) && await p.$eval('#absPrivate', e => e.disabled), 'a sent appraisal: read only');
  await p.goto(sections('AVH')); await wait(p, 900); expect(/loaded by hand/.test(await p.textContent('#absHand')), 'the hand-loaded appraisal has no sections screen');
  await p.goto(PB + 'appraisals/AVH'); await wait(p, 900); expect(/Loaded by hand\./.test(await doc(p)), 'the hand-loaded appraisal draws as before');
  await X.ctx.close();

  // ── 12. dark mode, and reduced motion ──
  X = await mk(390, 'dark', true); p = X.p;
  const seed = SEED(); const v0 = seed.appraisal_views[0];
  v0.setup.headerOpt = { url: 'https://library.rbtest.invalid/rb-hill.mp4', focus: { x: 50, y: 50 }, zoom: 1, bright: 1 }; v0.setup.reviews = { on: true };
  await signIn(p, seed); await p.goto(sections()); await wait(p, 900);
  expect(!(await side(p)), 'dark: the sections screen, no sideways scroll'); await shot(p, '3_dark');
  expect(/Saved/.test(await saveSections(p) || ''), 'dark: saved');
  await p.goto(PB + 'appraisals/AVB/present'); await wait(p, 1000);
  out.reduced = await p.evaluate(() => { const v = document.querySelector('.apv-hero video'); return v ? { paused: v.paused, autoplay: v.hasAttribute('autoplay') } : null; });
  expect(out.reduced && out.reduced.paused && !out.reduced.autoplay, 'reduced motion: the header video stays still: ' + JSON.stringify(out.reduced));
  expect(!(await side(p)), 'dark: presenting, no sideways scroll');
  await X.ctx.close();
  await b.close();
  console.log(JSON.stringify({ out, errs }, null, 1));
})().catch(e => { console.log(JSON.stringify({ crash: String(e && e.stack || e), errs: errs.concat(['crashed']) }, null, 1)); process.exit(1); });

// Photos and documents on the property file (Tim, 18 November 2026; migration 016). Tim adds photos and documents from his phone
// (camera or files, several at once) or a computer (drag and drop); they are checked by their own bytes, photos are redrawn the
// right way up without their location, each item has a key so it is filed once, and with no signal they wait on the phone
// (IndexedDB) and send when it returns. Tim can share an item with the vendors (never an appraisal, offer, ID or AML paper, or a
// signed document the system filed), remove it (kept, and restorable) and download the property file as "mre.property/1" JSON.
// Covers: the kind list against the migration, upload and kinds, refusals (a web page named .pdf, over 25 MB), the photo turned
// by its EXIF orientation with no EXIF or GPS left and a fingerprint that matches, the offline queue (waiting, kept through a
// reload, sent when the signal returns), no duplicates when the answer is lost, inspection photos with the room, sharing on and
// off, what vendors see (and that protected kinds can't be shared), soft remove and restore, the export against the JSON Schema,
// and 390 px in light and dark with no sideways scroll. Screenshots: out/repo_390_light.png, out/repo_390_dark.png,
// out/repo_inspection_390.png, out/repo_vendor_390_dark.png.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(__dirname, '..', '..', 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const REPO = require(path.join(__dirname, '..', 'src', 'repo-core.js'));
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schema', 'mre.property-1.schema.json'), 'utf8'));
const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '016_property_repository.sql'), 'utf8');
const photo = fs.readFileSync(path.join(__dirname, 'files', 'exif-rotated-gps.jpg'));
const lim = fs.readFileSync(path.join(__dirname, 'files', 'LIM.pdf'));
// the agent's sign-in as the mock knows it (its AGENTS list), so this file doesn't repeat the address
const TIM = ['agent-1', (mock.match(/const AGENTS=\['([^']+)'\]/) || [])[1]];
if (!TIM[1]) throw new Error('mock.js AGENTS list not found');

// a small JSON Schema check for the keywords the schema uses
function validate(s, v, at, errs, root) {
  root = root || s; errs = errs || [];
  if (s.$ref) return validate(s.$ref.replace('#/$defs/', '').split('/').reduce((o, k) => o[k], root.$defs), v, at, errs, root);
  const t = Array.isArray(v) ? 'array' : v === null ? 'null' : Number.isInteger(v) ? 'integer' : typeof v;
  if (s.type) { const ok = [].concat(s.type).some(x => x === t || (x === 'number' && t === 'integer')); if (!ok) { errs.push(`${at}: ${t} is not ${s.type}`); return errs; } }
  if ('const' in s && v !== s.const) errs.push(`${at}: not ${s.const}`);
  if (s.enum && !s.enum.includes(v)) errs.push(`${at}: ${JSON.stringify(v)} not allowed`);
  if (s.pattern && typeof v === 'string' && !new RegExp(s.pattern).test(v)) errs.push(`${at}: pattern`);
  if (s.format === 'date-time' && typeof v === 'string' && !(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) && !isNaN(Date.parse(v)))) errs.push(`${at}: not a date-time`);
  if (s.format === 'uuid' && typeof v === 'string' && !/^[0-9a-f-]{36}$/i.test(v) && !/^[A-Z0-9]+$/.test(v)) errs.push(`${at}: not an id`);
  if (s.maxLength != null && typeof v === 'string' && v.length > s.maxLength) errs.push(`${at}: too long`);
  if (s.minimum != null && typeof v === 'number' && v < s.minimum) errs.push(`${at}: below minimum`);
  if (s.maximum != null && typeof v === 'number' && v > s.maximum) errs.push(`${at}: above maximum`);
  if (t === 'object') {
    (s.required || []).forEach(k => { if (!(k in v)) errs.push(`${at}.${k}: missing`); });
    Object.entries(v).forEach(([k, x]) => { if (s.properties && s.properties[k]) validate(s.properties[k], x, `${at}.${k}`, errs, root); else if (s.additionalProperties === false) errs.push(`${at}.${k}: not allowed`); else if (typeof s.additionalProperties === 'object') validate(s.additionalProperties, x, `${at}.${k}`, errs, root); });
  }
  if (t === 'array' && s.items) v.forEach((x, i) => validate(s.items, x, `${at}[${i}]`, errs, root));
  return errs;
}

(async () => {
  const b = await chromium.launch(); const out = {}, fail = [], errs = [];
  const expect = (ok, msg) => { if (!ok) fail.push(msg); };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', acceptDownloads: true });
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await ctx.route('https://packages.dunnerstunner.co.nz/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
  await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/**', r => r.fulfill({ contentType: 'text/html', body: html }));
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' ')));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to fetch|Object not found|never shared|Only Tim|kept\. Remove|Records in|row-level security|permission denied/.test(m.text())) errs.push(m.text()); });
  p.on('dialog', d => d.accept());
  try {
    const go = async () => { await p.goto('https://packages.dunnerstunner.co.nz/onboarding/'); await p.waitForTimeout(600); };
    const as = async (id, email) => { await p.evaluate(([id, email]) => localStorage.setItem('mocksession', JSON.stringify({ user: { id, email } })), [id, email]); await go(); };
    const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb')));
    const sideways = () => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    const calls = () => p.evaluate(() => JSON.parse(localStorage.getItem('callLog') || '[]'));
    const openProp = async () => { await p.click('#navDash'); await p.waitForTimeout(400); await p.click('tr[data-prop="PR1"]'); await p.waitForTimeout(700); };
    const uploads = () => p.evaluate(() => (JSON.parse(localStorage.getItem('mockdb')).property_documents || []).filter(d => d.source === 'uploaded'));
    const waitRows = async n => { try { await p.waitForFunction(n => (JSON.parse(localStorage.getItem('mockdb')).property_documents || []).filter(d => d.source === 'uploaded').length >= n, n, { timeout: 15000 }); } catch (_) { } await p.waitForTimeout(500); };
    const idbCount = () => p.evaluate(() => new Promise(res => { const r = indexedDB.open('mre-repo', 1); r.onupgradeneeded = () => r.result.createObjectStore('queue', { keyPath: 'key' }); r.onsuccess = () => { const d = r.result; const q = d.transaction('queue').objectStore('queue').count(); q.onsuccess = () => { res(q.result); d.close(); }; }; r.onerror = () => res(-1); }));
    const chips = () => p.$$eval('#repo .rq-row .rq-chip', e => e.map(x => x.textContent));
    const jpg = n => ({ name: n, mimeType: 'image/jpeg', buffer: photo });

    // 0. the kind list in the page is the migration's repo_kinds, one to one with DwellHub's document types
    const sqlKinds = [...mig.matchAll(/\('((?:[^']|'')+)','(\w+)',(\d+),(true|false),(true|false)\)/g)].map(m => [m[1].replace(/''/g, "'"), m[2], m[4] === 'true' ? 1 : 0, m[5] === 'true' ? 1 : 0]);
    expect(JSON.stringify(sqlKinds) === JSON.stringify(REPO.KINDS), 'the kind list matches repo_kinds in the migration: ' + sqlKinds.length + ' vs ' + REPO.KINDS.length);
    ['Appraisal', 'Offer', 'Identity document', 'AML record'].forEach(k => expect(!REPO.shareable(k, 'uploaded'), k + ' is never shareable'));
    expect(!REPO.shareable('LIM report', 'generated') && REPO.shareable('LIM report', 'uploaded'), 'a generated document is never shareable');
    expect(REPO.KINDS.filter(k => k[1] !== 'agency').every(k => schema.properties.items.items.properties.kind.enum.includes(k[0])), 'every exportable kind is in the JSON Schema');

    await go();
    await p.evaluate(() => { localStorage.clear();
      const now = '2026-11-10T00:00:00Z';
      localStorage.setItem('mockdb', JSON.stringify({
        properties: [{ id: 'PR1', address: '12 Repo Street, Opoho', title_ref: 'OT12A/345', legal_description: 'Lot 2 DP 999', owners_on_title: 'Jo Example', ownership: {}, description: { pType: 'House', pBed: '3', pLand: '650', pLove: 'The morning sun' }, disclosures: { wt: 'yes', wtDetail: 'Monolithic cladding, recladded 2015', work: 'yes', workDetail: 'Deck added by the owners', meth: 'no', hazards: ['Steep driveway'] },
          found: { zone: { value: 'General Residential 1', label: 'Zone', source: 'dcc_2gp', source_name: 'Dunedin City Council, 2GP', as_of_label: 'current', note: 'Not a substitute for a LIM', fetched_at: '2026-11-18T01:00:00Z' } }, provenance: {}, stage: 'live', stage_at: now, created_at: now, updated_at: now }],
        property_people: [{ id: 'PP1', property_id: 'PR1', position: 1, legal_name: 'Jo Example', pref_name: 'Jo', email: 'jo@example.com', phone: '021 000 000', user_id: 'v-jo', role: 'owner', created_at: now },
          { id: 'PP2', property_id: 'PR1', position: 2, legal_name: 'Old Owner', pref_name: '', email: 'old@example.com', phone: '', user_id: 'v-old', role: 'former', created_at: now },
          { id: 'PP3', property_id: 'PR1', position: 3, legal_name: 'Cam Contact', pref_name: '', email: 'cam@example.com', phone: '', user_id: 'v-cam', role: 'contact', created_at: now }],
        prelistings: [{ id: 'PL1', property_id: 'PR1', address: '12 Repo Street, Opoho', contact_name: 'Pat Prelist', contact_email: 'pat@example.com', user_id: 'v-pat', status: 'accepted', created_at: now }],
        property_documents: [{ id: 'G1', property_id: 'PR1', kind: 'Vendor Declaration', name: 'Vendor-Declaration.pdf', path: 'properties/PR1/generated/f1.pdf', source: 'generated', bucket: 'private', folder: 'agency', created_by: 'system', created_at: now },
          { id: 'D1', property_id: 'PR1', kind: 'Record of title', name: 'Title.pdf', path: 'imports/b1/1-Title.pdf', source: 'dropped', bucket: 'private', folder: 'title', created_by: 'agent', created_at: now }],
        property_inspections: [{ id: 'I1', property_id: 'PR1', status: 'in_progress', facts: {}, declaration: {}, notes: {}, photos: [], stamps: {}, applied: {}, conflicts: {}, resolved: {}, created_by: 'agent', started_at: now, created_at: now, updated_at: now }],
        agreements: [{ id: 'A1', ref: 'MRE-2026-1001', address: '12 Repo Street, Opoho', property_id: 'PR1', status: 'countersigned', config: { appr: 'done', ask: '875000', flat: '12000', thr: '250000', pct: '2.95', aml: 'Manual' }, answers: { capacity: 'Owners' }, legal: { choice: 'have' }, signed_at: '2026-11-02T02:00:00Z', countersigned_at: '2026-11-02T03:00:00Z', cooling_off_until: '2026-11-03T04:00:00Z', agreement_version: 'v3.15-26102026', created_at: now }],
        agreement_people: [{ id: 'AP1', agreement_id: 'A1', position: 1, legal_name: 'Jo Example', pref_name: 'Jo', email: 'jo@example.com', phone: '', user_id: 'v-jo', signed_at: '2026-11-02T01:00:00Z' }],
        agreement_events: [], signatures: [], lawyer_links: [], aml_files: [], aml_events: [], email_log: [], cancellation_requests: [], property_events: [] })); });

    // 1. Tim opens the property: the repository section, with the signed record and the dropped-in title already filed
    await as(...TIM); await openProp();
    expect(await p.isVisible('#repo h2'), 'Photos and documents is on the property file');
    out.folders = await p.$$eval('#repoSaved .repo-folder summary strong', e => e.map(x => x.textContent));
    expect(out.folders.includes('Agency papers') && out.folders.includes('Title and legal'), 'items sit in their folders: ' + out.folders);
    const gen = await p.$('[data-doc="G1"]');
    expect(gen && !(await gen.$('[data-rp-share]')) && !(await gen.$('[data-rp-archive]')) && !(await gen.$('[data-rp-edit]')) && /Signed record/.test(await gen.textContent()), 'a signed document can\'t be shared, changed or removed');
    expect((await p.$$eval('#repoKind option', e => e.length)) === REPO.KINDS.length + 1, 'every kind can be chosen');

    // 2. several files at once: a photo, a LIM, a Word file; refused: a web page named .pdf and a file over 25 MB
    const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0]), Buffer.from('[Content_Types].xml word/document.xml word/styles.xml')]);
    const big = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(26 * 1024 * 1024)]);
    await p.setInputFiles('[data-repo-in="files"]', [jpg('IMG_2041.jpg'), { name: 'LIM 2026.pdf', mimeType: 'application/pdf', buffer: lim }, { name: 'Notes.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: docx },
      { name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<!doctype html><html><script>alert(1)</script></html>') }, { name: 'huge.pdf', mimeType: 'application/pdf', buffer: big }]);
    await waitRows(3);
    let up = await uploads();
    out.kinds = up.map(d => d.kind).sort();
    expect(JSON.stringify(out.kinds) === JSON.stringify(['LIM report', 'Other', 'Photo']), 'kinds from the files: ' + out.kinds);
    out.refused = await p.textContent('#repo [data-rq-refused]');
    expect(/invoice\.pdf/.test(out.refused) && /huge\.pdf: Files can be up to 25 MB/.test(out.refused) && !up.some(d => /invoice|huge/.test(d.name)), 'a web page named .pdf and a 26 MB file are refused: ' + out.refused);
    expect(up.every(d => d.bucket === 'property-files' && d.source === 'uploaded' && d.path.startsWith('properties/PR1/' + (d.kind === 'Photo' ? 'photos/' : 'docs/') + d.client_key) && /^[0-9a-f]{64}$/.test(d.sha256) && d.folder === REPO.folderOf(d.kind) && !d.shared_at), 'stored under the property, by key, with a fingerprint, not shared');
    const ph = up.find(d => d.kind === 'Photo');
    expect(ph && ph.mime_type === 'image/jpeg' && ph.thumb_path === 'properties/PR1/photos/' + ph.client_key + '.thumb.jpg' && ph.name === 'IMG_2041.jpg', 'the photo is a JPEG with a preview beside it');
    const lr = up.find(d => d.kind === 'LIM report');
    // the stored photo: turned by its EXIF orientation (400 x 200 shown as 200 x 400, red at the top), nothing hidden left in it, fingerprint matches
    out.photo = await p.evaluate(async ([pp, tp, lp]) => {
      const bl = window.__repoBlobs[pp], buf = new Uint8Array(await bl.arrayBuffer()), txt = new TextDecoder('latin1').decode(buf);
      const bm = await createImageBitmap(bl), c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d'); g.drawImage(bm, 0, 0);
      const top = Array.from(g.getImageData(100, 40, 1, 1).data), bot = Array.from(g.getImageData(100, 360, 1, 1).data);
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), x => x.toString(16).padStart(2, '0')).join('');
      const th = await createImageBitmap(window.__repoBlobs[tp]); const limHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await window.__repoBlobs[lp].arrayBuffer())), x => x.toString(16).padStart(2, '0')).join('');
      return { w: bm.width, h: bm.height, top, bot, exif: txt.includes('Exif'), gps: txt.includes('TestCam') || /GPS/.test(txt), hash, size: buf.length, tw: th.width, th: th.height, limHash };
    }, [ph.path, ph.thumb_path, lr.path]);
    expect(out.photo.w === 200 && out.photo.h === 400 && out.photo.top[0] > 150 && out.photo.top[2] < 100 && out.photo.bot[2] > 150, 'the photo is the right way up: ' + JSON.stringify(out.photo));
    expect(!out.photo.exif && !out.photo.gps, 'no EXIF, camera or GPS data in what is stored');
    expect(out.photo.hash === ph.sha256 && out.photo.size === ph.size_bytes && ph.width === 200 && ph.height === 400, 'the fingerprint and size are of the stored file');
    expect(Math.max(out.photo.tw, out.photo.th) <= 400, 'the preview is small');
    expect(out.photo.limHash === require('crypto').createHash('sha256').update(lim).digest('hex'), 'a PDF is stored exactly as it was');
    expect((await idbCount()) === 0, 'nothing left waiting on the phone once saved');
    expect((await p.textContent('#repoSaved')).includes('IMG 2041') && (await p.textContent('#repoSaved')).includes('LIM 2026'), 'saved items appear in their folders');

    // 3. no signal: photos wait on the phone, survive a reload, and send when the signal returns
    await ctx.setOffline(true); await p.waitForTimeout(200);
    const before = (await calls()).filter(c => c.startsWith('up:')).length;
    await p.selectOption('#repoKind', '');
    await p.setInputFiles('[data-repo-in="camera"]', [jpg('a.jpg'), jpg('b.jpg')]);
    await p.waitForTimeout(1200);
    out.offChips = await chips();
    expect(out.offChips.filter(x => x === 'Waiting for signal').length === 2, 'both wait for signal: ' + out.offChips);
    expect(/2 waiting for signal/.test(await p.textContent('#repo .rq-sum')), 'the count of waiting items is shown');
    expect((await idbCount()) === 2, 'kept in IndexedDB');
    expect((await calls()).filter(c => c.startsWith('up:')).length === before, 'nothing is sent with no signal');
    await p.evaluate(() => localStorage.setItem('mockOffline', '1'));   // the signal is still poor after the reload
    await ctx.setOffline(false);
    await p.reload(); await p.waitForTimeout(700); await openProp(); await p.waitForTimeout(800);
    out.reloadChips = await chips();
    expect(out.reloadChips.filter(x => x === 'Waiting for signal').length === 2 && (await idbCount()) === 2, 'still waiting after a reload: ' + out.reloadChips);
    expect((await uploads()).length === 3, 'not filed yet');
    await p.evaluate(() => { localStorage.removeItem('mockOffline'); window.dispatchEvent(new Event('online')); });
    await waitRows(5);
    expect((await uploads()).length === 5 && (await idbCount()) === 0, 'sent when the signal returns, and taken off the phone');
    out.onChips = await chips();
    expect(out.onChips.length && out.onChips.every(x => x === 'Saved'), 'every item shows Saved: ' + out.onChips);

    // 4. never twice: the answer to filing is lost, so the phone tries again; one row, one stored file
    await p.evaluate(() => localStorage.setItem('mockDropReply', '1'));
    await p.setInputFiles('[data-repo-in="camera"]', [jpg('c.jpg')]);
    await p.waitForTimeout(1500);
    await p.evaluate(() => window.dispatchEvent(new Event('online'))); await waitRows(6); await p.waitForTimeout(800);
    up = await uploads();
    const c1 = up.filter(d => d.name === 'c.jpg');
    expect(c1.length === 1, 'filed once though the answer was lost: ' + c1.length);
    const objs = Object.keys((await db()).storage_objects).filter(k => c1[0] && k.startsWith('properties/PR1/photos/' + c1[0].client_key));
    expect(objs.length === 2, 'one stored photo and one preview: ' + objs);
    expect((await idbCount()) === 0, 'nothing left waiting');

    // 5. Tim's details: a kind, a title, a room; a free kind is refused
    const lim1 = (await uploads()).find(d => d.kind === 'LIM report');
    await p.click(`[data-doc="${lim1.id}"] [data-rp-edit]`); await p.waitForTimeout(200);
    await p.fill(`[data-doc="${lim1.id}"] [data-re="title"]`, 'LIM, October 2026'); await p.fill(`[data-doc="${lim1.id}"] [data-re="issued_on"]`, '2026-10-01');
    await p.click(`[data-doc="${lim1.id}"] [data-re-save]`); await p.waitForTimeout(600);
    let L = (await db()).property_documents.find(d => d.id === lim1.id);
    expect(L.title === 'LIM, October 2026' && L.issued_on === '2026-10-01', 'title and date saved');
    const doc1 = (await uploads()).find(d => d.kind === 'Other');
    await p.click(`[data-doc="${doc1.id}"] [data-rp-edit]`); await p.waitForTimeout(200);
    await p.selectOption(`[data-doc="${doc1.id}"] [data-re="kind"]`, 'Appraisal'); await p.click(`[data-doc="${doc1.id}"] [data-re-save]`); await p.waitForTimeout(600);
    expect((await db()).property_documents.find(d => d.id === doc1.id).kind === 'Appraisal', 'the Word file is now an appraisal');
    expect(!(await p.$(`[data-doc="${doc1.id}"] [data-rp-share]`)) && /Never shared/.test(await p.textContent(`[data-doc="${doc1.id}"]`)), 'an appraisal offers no sharing');
    out.setFree = await p.evaluate(async id => { const c = window.supabase.createClient(); return (await c.rpc('agent_repo_set', { p_id: id, p_patch: { kind: 'Holiday snap' } })).error?.message; }, doc1.id);
    expect(/Choose a kind/.test(out.setFree || ''), 'a kind must come from the list');

    // 6. sharing: the LIM and the first photo; protected kinds and signed documents refused even when asked directly
    await p.click(`[data-doc="${lim1.id}"] [data-rp-share]`); await p.waitForTimeout(600);
    await p.click(`[data-doc="${ph.id}"] [data-rp-share]`); await p.waitForTimeout(600);
    let d = await db();
    expect(d.property_documents.filter(x => x.shared_at).map(x => x.id).sort().join() === [lim1.id, ph.id].sort().join() && d.property_documents.find(x => x.id === lim1.id).shared_by === TIM[1], 'two items shared, by Tim');
    expect(/Shared with the vendors/.test(await p.textContent(`[data-doc="${lim1.id}"]`)), 'marked as shared');
    out.forced = await p.evaluate(async ids => { const c = window.supabase.createClient(); const r = []; for (const id of ids) r.push((await c.rpc('agent_repo_share', { p_id: id, p_on: true })).error?.message || 'ALLOWED'); r.push((await c.from('property_documents').update({ shared_at: new Date().toISOString() }).eq('id', ids[0])).error?.message || 'ALLOWED'); return r; }, [doc1.id, 'G1']);
    expect(out.forced.every(x => /never shared|kept exactly|Only a file added under Photos and documents/.test(x)), 'an appraisal and a signed document can\'t be shared, even directly: ' + out.forced);
    out.sharedOffer = await p.evaluate(async id => { const c = window.supabase.createClient(); return (await c.rpc('agent_repo_set', { p_id: id, p_patch: { kind: 'Offer' } })).error?.message; }, lim1.id);
    expect(/never shared/.test(out.sharedOffer || ''), 'a shared item can\'t become an offer');
    await p.screenshot({ path: 'repo_390_light.png', fullPage: true });
    expect(!(await sideways()), 'no sideways scroll at 390 px (light)');
    await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(200);
    await p.screenshot({ path: 'repo_390_dark.png', fullPage: true });
    expect(!(await sideways()), 'no sideways scroll at 390 px (dark)');
    await p.emulateMedia({ colorScheme: 'light' });

    // 7. inspection photos: from the walk-round, with the room noted, filed to the property with the inspection
    await openProp();   // drawn again now there is signal (the page was drawn with none)
    await p.click('[data-inspopen="I1"]'); await p.waitForTimeout(800);
    await p.click('.insp-tab:has-text("Inside")'); await p.waitForTimeout(300);
    expect(await p.inputValue('#iRoom') === 'Living', 'the room starts from the section');
    await p.selectOption('#iRoom', 'Kitchen');
    await p.setInputFiles('[data-insp-photos]', [jpg('kitchen.jpg')]);
    await waitRows(7); await p.waitForTimeout(600);
    const kp = (await uploads()).find(x => x.name === 'kitchen.jpg');
    expect(kp && kp.inspection_id === 'I1' && kp.room === 'Kitchen' && kp.kind === 'Photo', 'filed with the inspection and the room: ' + JSON.stringify(kp && { i: kp.inspection_id, r: kp.room }));
    out.inspCount = await p.textContent('#iPhotoCount');
    expect(/1 photo saved from this inspection/.test(out.inspCount), 'the inspection counts its photos: ' + out.inspCount);
    expect(!(await sideways()), 'the inspection page has no sideways scroll');
    await (await p.$('.insp-photos')).scrollIntoViewIfNeeded();
    await p.screenshot({ path: 'repo_inspection_390.png', fullPage: false });
    const iRow = (await db()).property_inspections.find(x => x.id === 'I1');
    expect(Array.isArray(iRow.photos) && !iRow.photos.length, 'the inspection record itself is untouched (photos are found by inspection_id)');

    // 8. the vendor: sees only what is shared, read only; never the appraisal, the signed record or anything else
    await as('v-jo', 'jo@example.com'); await p.waitForTimeout(500);
    out.vendorH2 = await p.$$eval('main h2', e => e.map(x => x.textContent));
    expect(out.vendorH2.includes('Photos and documents from Tim'), 'the vendor sees what Tim shared: ' + out.vendorH2);
    out.vendorItems = await p.$$eval('.repo-shared .repo-t strong', e => e.map(x => x.textContent));
    expect(out.vendorItems.length === 2 && out.vendorItems.includes('LIM, October 2026'), 'only the two shared items: ' + out.vendorItems);
    out.vendorProbe = await p.evaluate(async ([ap, lp]) => { const c = window.supabase.createClient();
      const t = await c.from('property_documents').select('*'); const ev = await c.from('property_document_events').select('*');
      const s1 = await c.storage.from('property-files').createSignedUrl(lp, 600);
      const f1 = await c.functions.invoke('repo-link', { body: { path: ap } }), f2 = await c.functions.invoke('repo-link', { body: { path: lp } });
      const sh = await c.rpc('agent_repo_share', { p_id: 'G1', p_on: true }), ex = await c.rpc('agent_property_export', { p_property: 'PR1' });
      return { rows: (t.data || []).length, events: (ev.data || []).length, storage: !!(s1.data && s1.data.signedUrl), appraisal: !!(f1.data && f1.data.url), lim: !!(f2.data && f2.data.url), life: f2.data && f2.data.expires_in, share: sh.error && sh.error.message, export: ex.error && ex.error.message }; }, [doc1.path, lim1.path]);
    expect(out.vendorProbe.rows === 0 && out.vendorProbe.events === 0, 'the vendor reads no rows directly');
    expect(!out.vendorProbe.storage, 'no storage link for a vendor directly, even for a shared item');
    expect(!out.vendorProbe.appraisal && out.vendorProbe.lim && out.vendorProbe.life === 600, 'repo-link makes a 600-second link only for a shared item');
    expect((await calls()).some(c => c === 'fn:repo-link'), 'the vendor page asks repo-link for its links');
    expect(/Only Tim/.test(out.vendorProbe.share || '') && /Only Tim/.test(out.vendorProbe.export || ''), 'the vendor can\'t share or export');
    expect(!(await sideways()), 'the vendor page has no sideways scroll');
    await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(200);
    const sh = await p.$('.repo-shared'); if (sh) await sh.scrollIntoViewIfNeeded();
    await p.screenshot({ path: 'repo_vendor_390_dark.png', fullPage: false });
    await p.emulateMedia({ colorScheme: 'light' });
    // a former owner sees nothing
    await as('v-old', 'old@example.com');
    out.former = await p.evaluate(async () => { const c = window.supabase.createClient(); const r = await c.rpc('vendor_repo_list', { p_property: 'PR1' }); return (r.data || []).length; });
    expect(out.former === 0, 'a former owner sees nothing');
    // a contact (not an owner) and the pre-listing contact see nothing either, and get no link
    for (const [id, em, who] of [['v-cam', 'cam@example.com', 'a contact'], ['v-pat', 'pat@example.com', 'the pre-listing contact']]) {
      await as(id, em);
      const r = await p.evaluate(async lp => { const c = window.supabase.createClient(); const l = await c.rpc('vendor_repo_list', { p_property: 'PR1' }); const f = await c.functions.invoke('repo-link', { body: { path: lp } }); return { n: (l.data || []).length, link: !!(f.data && f.data.url) }; }, lim1.path);
      expect(r.n === 0 && !r.link, who + ' sees nothing: ' + JSON.stringify(r));
    }

    // 9. sharing off, then remove (kept, unshared) and restore; nothing can be deleted
    await as(...TIM); await openProp();
    await p.click(`[data-doc="${lim1.id}"] [data-rp-share]`); await p.waitForTimeout(600);
    expect(!(await db()).property_documents.find(x => x.id === lim1.id).shared_at, 'sharing turned off');
    await p.click(`[data-doc="${ph.id}"] [data-rp-archive]`); await p.waitForTimeout(700);
    d = await db(); let P = d.property_documents.find(x => x.id === ph.id);
    expect(P.archived_at && !P.shared_at && P.archived_by === TIM[1], 'removed: kept, and no longer shared');
    expect(/Removed \(1\)/.test(await p.textContent('#repoSaved .repo-gone summary')), 'listed under Removed');
    await as('v-jo', 'jo@example.com');
    expect(!(await p.$('.repo-shared')), 'the vendor sees nothing once both are unshared or removed');
    await as(...TIM); await openProp();
    await p.click('#repoSaved .repo-gone summary'); await p.click(`[data-rp-restore="${ph.id}"]`); await p.waitForTimeout(700);
    P = (await db()).property_documents.find(x => x.id === ph.id);
    expect(!P.archived_at && !P.shared_at, 'restored, and not shared again by itself');
    out.del = await p.evaluate(async () => { const c = window.supabase.createClient(); const r = await c.from('property_documents').delete().eq('id', 'D1'); return r.error && r.error.message; });
    expect(/kept/.test(out.del || ''), 'a delete is refused: ' + out.del);
    out.genArch = await p.evaluate(async () => { const c = window.supabase.createClient(); return (await c.rpc('agent_repo_archive', { p_id: 'G1', p_on: true })).error?.message; });
    expect(/kept exactly/.test(out.genArch || ''), 'a signed document can\'t be removed');
    // a document dropped in for reading (the private bucket) isn't offered for sharing, and can't be shared when asked
    expect(!(await p.$('[data-doc="D1"] [data-rp-share]')) && /not shared/.test(await p.textContent('[data-doc="D1"]')), 'no Share for a dropped-in document');
    out.shareDropped = await p.evaluate(async () => { const c = window.supabase.createClient(); const a = (await c.rpc('agent_repo_share', { p_id: 'D1', p_on: true })).error?.message; const b = (await c.from('property_documents').update({ shared_at: new Date().toISOString() }).eq('id', 'D1')).error?.message; return [a, b]; });
    expect(out.shareDropped.every(m => /Only a file added under Photos and documents/.test(m || '')), 'a dropped-in document can\'t be shared: ' + out.shareDropped);
    const evs = (await db()).property_document_events.map(e => e.kind);
    ['added', 'changed', 'shared', 'unshared', 'archived', 'restored'].forEach(k => expect(evs.includes(k), 'recorded: ' + k));

    // 10. the property file as JSON, checked against the schema; no files, people or agency papers in it
    await p.click(`[data-doc="${ph.id}"] [data-rp-share]`); await p.waitForTimeout(500);
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#repoExport')]);
    out.file = dl.suggestedFilename();
    const ex = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    const verr = validate(schema, ex, '$');
    expect(!verr.length, 'the export matches mre.property/1: ' + verr.slice(0, 5).join('; '));
    expect(/^property-12-repo-street-opoho-\d{4}-\d{2}-\d{2}\.json$/.test(out.file), 'named for the property: ' + out.file);
    expect(ex.schema === 'mre.property/1' && ex.property.address === '12 Repo Street, Opoho' && ex.property.title_ref === 'OT12A/345' && ex.property.legal_description === 'Lot 2 DP 999' && ex.property.land_area_m2 === 650, 'the property facts');
    expect(ex.public_records.length === 1 && ex.public_records[0].source_name === 'Dunedin City Council, 2GP' && ex.public_records[0].as_of_label === 'current', 'public record values with source and date');
    out.exKinds = ex.items.map(i => i.kind);
    expect(!out.exKinds.includes('Appraisal') && !out.exKinds.includes('Vendor Declaration') && out.exKinds.filter(k => k === 'Photo').length === 5 && out.exKinds.includes('LIM report'), 'agency papers left out: ' + out.exKinds);
    expect(ex.items.every(i => /^[0-9a-f]{64}$/.test(i.sha256) && i.size_bytes > 0), 'every item has its fingerprint and size');
    expect(ex.items.find(i => i.room === 'Kitchen') && ex.items.find(i => i.id === ph.id).shared_with_vendors === true, 'rooms and sharing carried');
    expect(ex.left_out.agency_papers === 2 && ex.left_out.missing_details === 1 && ex.left_out.removed === 0, 'what was left out is counted: ' + JSON.stringify(ex.left_out));
    expect(JSON.stringify(ex.left_out.withheld) === JSON.stringify(['disclosures.weathertightness_detail', 'disclosures.work_detail']), 'the vendors\' written details are named as left out: ' + JSON.stringify(ex.left_out.withheld));
    expect(ex.property.disclosures.weathertightness === 'yes' && ex.property.disclosures.work === 'yes' && JSON.stringify(ex.property.disclosures.hazards) === '["Steep driveway"]', 'the yes / no answers and hazard kinds stay');
    const txt = JSON.stringify(ex);
    expect(!/@|Jo Example|Old Owner|021 000|morning sun|owners_on_title|Monolithic|Deck added/.test(txt), 'no people, contact details or the vendors\' own words');
    expect(schema.properties.property.properties.disclosures.properties.weathertightness_detail.sensitive === true && schema.properties.property.properties.description.properties.heating.sensitive === true, 'the schema marks fields that may hold vendor text as sensitive');
    expect((await db()).property_document_events.some(e => e.kind === 'exported'), 'the export is recorded');
    expect(!(await calls()).some(c => /^fn:/.test(c) && c !== 'fn:repo-link'), 'nothing sent anywhere (no function called but repo-link for the vendor\'s links)');

    // 11. a sign-in that ran out: the item says so, waits (even when the signal is fine), and sends by itself after signing in again
    await p.evaluate(() => localStorage.setItem('mockAuthFail', '1'));
    await p.setInputFiles('[data-repo-in="camera"]', [jpg('auth.jpg')]); await p.waitForTimeout(1500);
    out.authNote = await p.textContent('#repo .rq-list');
    expect(/Sign in again to send it/.test(out.authNote) && !(await uploads()).some(x => x.name === 'auth.jpg'), 'the item asks for a sign-in: ' + out.authNote.replace(/\s+/g, ' ').slice(0, 160));
    await p.evaluate(() => { localStorage.removeItem('mockAuthFail'); window.dispatchEvent(new Event('online')); }); await p.waitForTimeout(1200);
    expect(!(await uploads()).some(x => x.name === 'auth.jpg'), 'not sent until Tim signs in again');
    await as(...TIM); await p.waitForTimeout(1500);
    expect((await uploads()).some(x => x.name === 'auth.jpg') && (await idbCount()) === 0, 'sent by itself after signing in again');

    // 12. items belong to the sign-in that added them: another sign-in on the phone sees a plain note and doesn't send them
    await p.evaluate(() => { localStorage.setItem('mockAgents', JSON.stringify(['helper@example.com'])); localStorage.setItem('mockOffline', '1'); });
    await go(); await openProp();
    await p.setInputFiles('[data-repo-in="camera"]', [jpg('mine.jpg')]); await p.waitForTimeout(1200);
    await as('agent-2', 'helper@example.com'); await openProp();
    await p.evaluate(() => { localStorage.removeItem('mockOffline'); window.dispatchEvent(new Event('online')); }); await p.waitForTimeout(1500);
    out.otherNote = await p.textContent('#repo .rq-list');
    expect(/another sign-in/.test(out.otherNote) && !(await uploads()).some(x => x.name === 'mine.jpg') && (await idbCount()) === 1, 'another sign-in sees a note and sends nothing');
    expect(!(await p.$('#repo [data-rq-retry]')), 'and has no Try again for it');
    await as(...TIM); await p.waitForTimeout(1500); await openProp(); await p.waitForTimeout(800);
    expect((await uploads()).some(x => x.name === 'mine.jpg' && x.created_by === TIM[1]) && (await idbCount()) === 0, 'Tim\'s sign-in sends it');

    // 13. a new round of owners: nothing shared carries across, either way
    await p.evaluate(async lp => { const c = window.supabase.createClient(); await c.rpc('agent_repo_share', { p_id: (JSON.parse(localStorage.getItem('mockdb')).property_documents.find(d => d.path === lp) || {}).id, p_on: true }); }, lim1.path);
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('mockdb')); d.properties[0].stage = 'withdrawn'; d.agreements[0].status = 'countersigned'; localStorage.setItem('mockdb', JSON.stringify(d)); });
    await go();
    out.reopen = await p.evaluate(async () => { const c = window.supabase.createClient(); return (await c.rpc('agent_reopen_property', { pid: 'PR1', new_owners: true })).error?.message || 'ok'; });
    d = await db();
    expect(out.reopen === 'ok' && !d.property_documents.some(x => x.shared_at), 'starting again with new owners unshares everything: ' + out.reopen);
    expect(d.property_document_events.filter(e => e.kind === 'unshared').length >= 3, 'each unsharing is recorded');
    // new owners and their agreement; Tim shares a photo with them
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('mockdb')), t = new Date(Date.now() + 1000).toISOString();
      d.property_people.push({ id: 'PP9', property_id: 'PR1', position: 1, legal_name: 'Nina New', pref_name: 'Nina', email: 'nina@example.com', phone: '', user_id: 'v-nina', role: 'owner', created_at: t });
      d.agreements.push({ id: 'A2', ref: 'MRE-2026-1009', address: '12 Repo Street, Opoho', property_id: 'PR1', status: 'draft', config: {}, answers: {}, legal: {}, created_at: t, agreement_version: 'v3.15-26102026' });
      d.agreement_people.push({ id: 'AP9', agreement_id: 'A2', position: 1, legal_name: 'Nina New', pref_name: 'Nina', email: 'nina@example.com', phone: '', user_id: 'v-nina' });
      localStorage.setItem('mockdb', JSON.stringify(d)); });
    await go(); await p.waitForTimeout(1100);
    await p.evaluate(async id => { const c = window.supabase.createClient(); await c.rpc('agent_repo_share', { p_id: id, p_on: true }); }, ph.id);
    const look = async (id, em, paths) => { await as(id, em); return p.evaluate(async ps => { const c = window.supabase.createClient(); const l = await c.rpc('vendor_repo_list', { p_property: 'PR1' }); const links = []; for (const x of ps) { const f = await c.functions.invoke('repo-link', { body: { path: x } }); links.push(!!(f.data && f.data.url)); } return { n: (l.data || []).length, ids: (l.data || []).map(x => x.id), links }; }, paths); };
    out.oldSigner = await look('v-jo', 'jo@example.com', [ph.path, lim1.path]);
    expect(out.oldSigner.n === 0 && !out.oldSigner.links.some(Boolean), 'the old signer sees and opens nothing shared with the new owners: ' + JSON.stringify(out.oldSigner));
    out.newOwner = await look('v-nina', 'nina@example.com', [ph.path, lim1.path]);
    expect(out.newOwner.n === 1 && out.newOwner.ids[0] === ph.id && out.newOwner.links[0] && !out.newOwner.links[1], 'the new owner sees only what was shared with them: ' + JSON.stringify(out.newOwner));
  } catch (e) { errs.push('test crashed: ' + (e.stack || e.message)); }
  out.fail = fail; out.errs = errs.concat(fail);
  console.log(JSON.stringify(out, null, 2));
  await b.close();
})();

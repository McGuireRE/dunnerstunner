// LW1, the First visit page (migration 031), in the portal at 390 px, against the mock database. Covers the whole flow: starting with
// nothing at all; Who's here; room by room (tap to add, Tim's call on each room, his compliance note and the vendor's view, features, a
// dictated note, photos into the one store with their room and caption); the property's tap lists from Appendix D (one choice, many,
// counts, chattels with counts, his own additions); documents; the ideal buyers page into the question bank, per person and for everyone;
// "Now or come back?". All of it without signal first: kept on the phone (IndexedDB) across a reload, nothing sent, the state said plainly;
// then the address added, and once the signal returns everything uploads by itself: the visit files to the property already on file at that
// address (never a second property), the people to the property's people and one person record each (never a duplicate), the rooms to
// property_rooms, the bedroom count and the room wording only from Tim's calls (the council's count stays beside), the tap lists to the
// property profile as his own ("First visit") with the property file following, the answers to the question bank (Tim's notes, never the
// vendor's words), and the photos and documents to the store. Also: messages at the button; starting from an appointment and from the
// property file; dictation where the browser has none; a vendor reading none of it; and no sideways scroll, light and dark.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const bundle = fs.readFileSync(path.join(__dirname, '..', 'portal.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const shell = fs.readFileSync(path.join(ROOT, 'portal', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(ROOT, 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const PK = 'https://packages.dunnerstunner.co.nz', PB = PK + '/portal/';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const errs = [], out = {};
const expect = (c, m) => { if (!c) errs.push(m); };
(async () => {
  const b = await chromium.launch();
  const now = new Date().toISOString();
  const prop = (id, address, extra) => Object.assign({ id, address, title_ref: null, owners_on_title: null, ownership: {}, description: {}, disclosures: {}, found: {}, provenance: {}, stage: 'appraisal', stage_at: now, created_at: now, updated_at: now }, extra || {});
  const seed = () => ({
    properties: [prop('P1', '12 Pine Hill Road, Dunedin', { found: { bedrooms: { key: 'bedrooms', field: 'pBed', written: true, value: '4', display: '4', as_of_label: '2026-2027 rating year', source_name: 'Dunedin City Council rates', label: 'Bedrooms' } } }),
      prop('P2', '5 Roslyn Terrace, Dunedin')],
    property_people: [{ id: 'PP1', property_id: 'P1', position: 1, legal_name: 'Robin Rowe', pref_name: 'Rob', email: 'robin@example.com', phone: '021 555 0101', role: 'owner', source: 'agent', name_from: 'agent', created_at: now }],
    prelistings: [{ id: 'L2', address: '5 Roslyn Terrace, Dunedin', property_id: 'P2', contact_name: 'Sam Seller', contact_email: 'sam@example.com', status: 'submitted', appraisal: {}, answers: {}, plan: {}, created_at: now, updated_at: now }],
    agreements: [], agreement_people: [], agreement_events: [], signatures: [], lawyer_links: [], aml_files: [], aml_events: [], email_log: [], cancellation_requests: [], prior_agency_notices: [],
  });
  for (const scheme of ['light', 'dark']) {
    const tag = scheme; out[tag] = {};
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, hasTouch: true, isMobile: true }); ctx.setDefaultTimeout(8000);
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
    await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    await ctx.route(PK + '/**', r => r.fulfill({ status: 404, contentType: 'text/html', body: shell }));
    await ctx.route(PK + '/onboarding/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await ctx.route(PK + '/portal**', r => r.fulfill({ contentType: 'text/html', body: shell }));
    await ctx.route(PK + '/onboarding/portal.js', r => r.fulfill({ contentType: 'application/javascript', body: bundle }));
    await ctx.route(PK + '/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(tag + ' page: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Failed to fetch/.test(m.text()) && m.text() !== 'Object') errs.push(tag + ' console: ' + m.text()); });
    p.on('dialog', d => d.accept());
    const wait = ms => p.waitForTimeout(ms || 500);
    const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb')));
    const at = () => p.evaluate(() => location.pathname);
    // sideways scroll, or anything Tim taps or types in running past the right edge of the phone
    const side = () => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth || Array.from(document.querySelectorAll('#main input, #main textarea, #main button, #main select, #main .card')).filter(e => e.offsetParent && e.type !== 'file').some(e => e.getBoundingClientRect().right > window.innerWidth + 0.5));
    const sync = () => p.textContent('#fvSync .fv-sync-t');
    const note = id => p.evaluate(id => { const n = document.getElementById('bn-' + id); return n && !n.hidden ? n.textContent : null; }, id);
    const noteNear = sel => p.evaluate(sel => { const b = document.querySelector(sel); if (!b) return null; let n = b.parentElement; for (let i = 0; i < 4 && n; i++, n = n.parentElement) { const x = n.querySelector('.btn-note'); if (x && !x.hidden && x.textContent) return x.textContent; } return null; }, sel);
    const step = async k => { await p.click(`[data-fvsec="${k}"]`); await wait(350); expect(!(await side()), `${tag} ${k}: no sideways scroll at 390 px`); };
    const sideAll = async n => expect(!(await side()), `${tag} ${n}: no sideways scroll at 390 px`);
    await p.goto(PB);
    await p.evaluate(s => { localStorage.clear(); localStorage.setItem('mockAgents', JSON.stringify(['agent-test@example.com'])); localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'agent-1', email: 'agent-test@example.com' } })); localStorage.setItem('mockdb', JSON.stringify(s)); }, seed());
    await p.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('mre-fv'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
    try {
      // ── 1. Processes: First visit is real now, and opens its start page ──
      await p.goto(PB + 'processes'); await wait(800);
      expect(!(await p.$('#soonFirst')) && !!(await p.$('#homeFirst')), tag + ': the First visit tile is real, not "Coming soon"');
      await p.click('#homeFirst'); await wait(700);
      expect((await at()) === '/portal/processes/first-visit' && !!(await p.$('#fvStartNone')), tag + ': processes/first-visit opens the start: ' + (await at()));
      expect(/From an appointment/.test(await p.textContent('#fvStart')) && !!(await p.$('[data-fvpl="L2"]')), tag + ': an appointment to start from');
      await sideAll('start');

      // ── 2. No signal from here. Start with nothing at all ──
      await p.evaluate(() => localStorage.setItem('mockOffline', '1'));
      await p.click('#fvStartNone'); await wait(700);
      const vid = await p.getAttribute('#fvPage', 'data-visit');
      expect((await at()) === `/portal/processes/first-visit/${vid}`, tag + ': a visit with no property lives under Processes: ' + (await at()));
      out[tag].sync0 = await sync(); expect(/Add the address/.test(out[tag].sync0), tag + ': says plainly it waits for the address: ' + out[tag].sync0);
      expect((await p.$$('[data-fvsec]')).length === 7, tag + ': seven steps');
      await p.fill('#fvNotes', 'Lovely people, keen on Wanaka');
      // dictation: the browser's own speech to text (a stand-in here), added to the notes
      await p.evaluate(() => { window.SpeechRecognition = class { start() { setTimeout(() => { this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'the garden gets sun all day' }], { isFinal: true })] }); this.onend && this.onend(); }, 50); } stop() { this.onend && this.onend(); } }; });
      await p.click('#fvNotes_d'); await wait(300);
      out[tag].dictated = await p.inputValue('#fvNotes');
      expect(/keen on Wanaka the garden gets sun all day$/.test(out[tag].dictated), tag + ': a dictated note joins the typed one: ' + out[tag].dictated);
      expect(/Added to your notes/.test(await note('fvNotes_d') || ''), tag + ': dictation says so under its button: ' + (await note('fvNotes_d')));

      // Who's here: all optional; why they want to talk and the client heart per person
      await step('who');
      await p.click('#fvAddPerson'); await wait(300);
      expect(/Added/.test(await note('fvAddPerson') || ''), tag + ': Add someone says so under the button');
      await p.fill('#fvp0n', 'Rob'); await p.fill('#fvp0e', 'ROBIN@example.com'); await p.fill('#fvp0ph', '021 555 0101');
      await p.click('[data-fvperson] [data-fvpb="dm"] + span');
      await p.fill('#fvp0w', 'Moving to Wanaka next winter'); await p.fill('#fvp0h', 'Worried about timing with school');
      await p.click('#fvAddPerson'); await wait(300);
      await p.fill('#fvp1n', 'Jo'); await p.click('[data-fvperson]:nth-of-type(2) [data-fvpb="owner"] + span');   // a friend helping, not an owner
      await p.click('#fvAddPerson'); await wait(300);
      await p.fill('#fvp2n', 'Bron'); await p.fill('#fvp2e', 'bron@example.com'); await p.click('[data-fvperson]:nth-of-type(3) [data-fvpb="dm"] + span');

      // Room by room: tap to add, Tim's call on each habitable room
      await step('rooms');
      expect(/not called yet/.test(await p.textContent('#fvBeds')), tag + ': no bedroom count before Tim makes a call');
      const addRoom = async (base, n) => { await p.click(`#fvAddRooms [data-fvaddroom="${base}"]`); await wait(250); };
      await addRoom('bedroom');
      expect(/Bedroom added/.test(await noteNear('#fvAddRooms [data-fvaddroom="bedroom"]') || ''), tag + ': adding a room says so under its button');
      const openRoom = () => p.evaluate(() => document.querySelector('.fv-room.open').dataset.fvroomid);
      const r1 = await openRoom();
      const callIt = async c => { await p.click(`.fv-room.open [data-fvchips^="class_"] input[value="${c}"] + span`); await wait(150); };
      await callIt('bedroom');
      await p.click('.fv-room.open [data-fvchips^="feat_"] input[value="Heat pump"] + span'); await p.click('.fv-room.open [data-fvchips^="feat_"] input[value="Built-in wardrobe"] + span');
      await p.fill('.fv-room.open [data-fvrf="notes"]', 'Sunny, looks over the garden');
      await p.fill('.fv-room.open [data-fvcap]', 'View from the window');
      await p.setInputFiles('.fv-room.open [data-fvphoto]', [{ name: 'room.png', mimeType: 'image/png', buffer: PNG }]); await wait(900);
      out[tag].photoNote = await noteNear('.fv-room.open [data-fvphoto]');
      expect(/1 photo added\. Kept on this phone/.test(out[tag].photoNote || ''), tag + ': the photo says it is kept on the phone, under its button: ' + out[tag].photoNote);
      expect((await p.$$('.fv-room.open .fv-thumbs img')).length === 1, tag + ': the photo shows in its room');
      await addRoom('bedroom'); await callIt('bedroom');
      await addRoom('bedroom'); const r3 = await openRoom();
      expect((await p.inputValue('.fv-room.open [data-fvrf="label"]')) === 'Bedroom 3', tag + ': rooms number themselves');
      await callIt('study');
      await p.fill('.fv-room.open [data-fvrf="tim_note"]', 'No window that opens'); await p.fill('.fv-room.open [data-fvrf="vendor_view"]', 'They call it the third bedroom');
      await p.click('#fvAddRooms [data-fvaddroom="living"]'); await wait(250);
      await p.click('summary:has-text("More spaces")'); await p.click('.fv-more [data-fvaddroom="sleepout"]'); await wait(250); await callIt('sleepout');
      await p.click('.fv-more summary').catch(() => null);
      await p.click('#fvAddRooms [data-fvaddroom="kitchen"]'); await wait(250);
      expect(!(await p.$('.fv-room.open [data-fvchips^="class_"]')), tag + ': a kitchen gets no bedroom call');
      out[tag].beds = (await p.textContent('#fvBeds')).replace(/\s+/g, ' ');
      expect(/your call: 2/.test(out[tag].beds) && /"2 bedrooms plus study and sleepout"/.test(out[tag].beds), tag + ': the count and wording from Tim\'s calls only: ' + out[tag].beds);
      await sideAll('rooms');

      // The property: Appendix D tap lists; bedrooms are not a tap list
      await step('property');
      expect(!(await p.$('[data-fvfact="pBed"]')), tag + ': bedrooms are never a tap list');
      await p.click('[data-fvfact="pType"] input[value="House"] + span');
      await p.click('[data-fvfact="pBath"] [data-fvcnt="1"]'); await p.click('[data-fvfact="pBath"] [data-fvcnt="1"]');
      expect((await p.textContent('[data-fvfact="pBath"] output')) === '2', tag + ': a count steps up');
      await p.click('summary:has-text("Outdoors and outlook")'); await p.click('[data-fvfact="outlook"] input[value="Harbour views"] + span');
      await p.click('summary:has-text("Chattels")'); await p.click('[data-fvfact="chattels_featured"] input[value="Woodburner"] + span'); await wait(200);
      await p.click('[data-fvfact="chattels_featured"] [data-fvchat="Woodburner"] [data-fvchn="1"]'); await wait(150);
      // Tim's own item, without signal: on this phone, said under the button
      await p.fill('[data-fvfact="outlook"] [data-fvown-in]', 'Lighthouse views'); await p.click('#fvown_outlook'); await wait(400);
      out[tag].ownNote = await note('fvown_outlook');
      expect(/Added on this phone/.test(out[tag].ownNote || ''), tag + ': his own item offline says so under Add: ' + out[tag].ownNote);
      expect(await p.isChecked('[data-fvfact="outlook"] input[value="Lighthouse views"]'), tag + ': his own item is ticked straight away');

      // Documents: the title, into the one store
      await step('documents');
      await p.setInputFiles('[data-fvdoc="Record of title"]', [{ name: 'title.pdf', mimeType: 'application/pdf', buffer: PDF }]); await wait(700);
      expect(/1 added\. Kept on this phone/.test(await noteNear('[data-fvdoc="Record of title"]') || ''), tag + ': the document says it is kept on the phone');
      expect(/kept on this phone/i.test(await p.textContent('[data-rq]')), tag + ': the queue says it waits for the visit to be filed: ' + (await p.textContent('[data-rq]')));

      // Ideal buyers: their story, the ideal buyers and "ideal for", for everyone and per person
      await step('buyers');
      await p.fill('#fvq_story_bought', '2009, for the sun and the school zone');
      await p.fill('#fvq_ib_stage', 'Young family');
      await p.click('[data-fvchips="ideal_for"] input[value="Young families"] + span'); await p.click('[data-fvchips="ideal_for"] input[value="Gardeners"] + span');
      const bronKey = await p.evaluate(() => Array.from(document.querySelectorAll('#fvWho option')).find(o => o.textContent === 'Bron').value);
      await p.selectOption('#fvWho', bronKey); await wait(300);
      expect((await p.inputValue('#fvq_story_bought')) === '', tag + ': each person has their own words');
      await p.fill('#fvq_story_surprised', 'How quiet it is at night');
      await sideAll('buyers');

      // Now or come back?
      await step('finish');
      expect(/Decision makers here: Rob, Bron/.test(await p.textContent('#fvSec')), tag + ': the decision makers marked');
      await p.click('#fvBook'); await wait(300);
      expect(/Saved on this phone\. It uploads by itself when the signal returns/.test(await note('fvBook') || ''), tag + ': the choice says it is on the phone, under the button: ' + (await note('fvBook')));
      await p.fill('#fvNextNote', 'Tuesday 4pm, with Jo there');
      await p.click('#fvSendQ'); await wait(200);
      expect(/filed to its property first/.test(await note('fvSendQ') || ''), tag + ': Questions before we meet waits for the property, said under the button');
      await wait(800);
      let d = await db();
      expect(!(d.first_visits || []).length && !(d.property_rooms || []).length && !(d.qa_answers || []).some(a => a.source === 'first_visit'), tag + ': nothing sent without signal');

      // ── 3. Reload, still no signal: everything is still on the phone ──
      await p.reload(); await wait(1500);
      expect((await at()) === `/portal/processes/first-visit/${vid}/finish`, tag + ': the reload opens the same visit and step: ' + (await at()));
      expect((await p.inputValue('#fvNextNote')) === 'Tuesday 4pm, with Jo there' && (await p.getAttribute('#fvBook', 'class')).includes('primary'), tag + ': the choice and note survived the reload');
      await step(''); expect(/garden gets sun all day/.test(await p.inputValue('#fvNotes')), tag + ': the notes survived the reload');
      await step('rooms'); expect((await p.$$('.fv-room')).length === 6, tag + ': the six rooms survived the reload');
      // the address, still without signal: it is on file already (this phone kept the list), so the visit will file there
      await step('');
      await p.fill('#fvAddrEdit', '12 pine hill road, dunedin'); await p.click('#fvAddrSave'); await wait(600);
      expect(/Saved on this phone/.test(await note('fvAddrSave') || ''), tag + ': the address is kept on the phone: ' + (await note('fvAddrSave')));
      await ctx.setOffline(true); await wait(200);
      out[tag].syncOff = await sync(); expect(/upload by itself when the signal returns/.test(out[tag].syncOff), tag + ': the sync state says plainly it waits for signal: ' + out[tag].syncOff);

      // ── 4. The signal returns: everything uploads by itself ──
      await ctx.setOffline(false); await p.evaluate(() => { localStorage.removeItem('mockOffline'); window.dispatchEvent(new Event('online')); }); await wait(3500);
      out[tag].syncOn = await sync(); expect(/All saved to the property/.test(out[tag].syncOn), tag + ': all saved: ' + out[tag].syncOn);
      expect((await at()) === `/portal/properties/P1/first-visit/${vid}`, tag + ': filed under its property now: ' + (await at()));
      d = await db();
      const fv = (d.first_visits || []).find(x => x.id === vid) || {};
      expect(fv.property_id === 'P1' && d.properties.length === 2, tag + ': filed to the property on file at that address, never a second one');
      expect(fv.decision === 'book' && fv.next_note === 'Tuesday 4pm, with Jo there' && /sun all day/.test(fv.notes || ''), tag + ': notes and "Now or come back?" saved');
      // people: never a duplicate; the friend in touch, not an owner
      const p1 = d.property_people.filter(x => x.property_id === 'P1');
      out[tag].people = p1.map(x => [x.legal_name, x.email, x.role]);
      expect(p1.length === 3 && p1.filter(x => x.email === 'robin@example.com').length === 1, tag + ': Rob is Robin, never a second record: ' + JSON.stringify(out[tag].people));
      expect((p1.find(x => x.email === 'robin@example.com') || {}).legal_name === 'Robin Rowe', tag + ': an informal name never replaces a checked one');
      expect((p1.find(x => x.legal_name === 'Jo') || {}).role === 'contact' && (p1.find(x => x.legal_name === 'Bron') || {}).role === 'owner', tag + ': the friend is in touch, Bron an owner');
      const robinC = (p1.find(x => x.email === 'robin@example.com') || {}).contact_id;
      expect(robinC && (d.crm_property_links || []).some(l => l.contact_id === robinC && l.property_id === 'P1' && l.role === 'owner'), tag + ': one person record linked to the property');
      // the question bank: Tim's notes, per person and for everyone
      const qa = (d.qa_answers || []).filter(a => a.source === 'first_visit');
      const fvp = (d.first_visit_people || []).filter(x => x.first_visit_id === vid);
      const robKey = (fvp.find(x => x.contact_id === robinC) || {}).id;
      out[tag].qa = qa.map(a => a.question_key + (a.source_ref === vid ? '/all' : '')).sort();
      expect(qa.find(a => a.question_key === 'why_talk' && a.source_ref === robKey && a.contact_id === robinC && a.value === 'Moving to Wanaka next winter'), tag + ': why they want to talk, filed to Rob');
      expect(qa.find(a => a.question_key === 'client_heart' && a.source_ref === robKey), tag + ': the client heart filed (agent only)');
      expect(qa.find(a => a.question_key === 'story_bought' && a.source_ref === vid && a.contact_id == null), tag + ': their story for everyone there');
      expect(qa.find(a => a.question_key === 'ideal_for' && a.source_ref === vid && JSON.stringify(a.value) === JSON.stringify(['Young families', 'Gardeners'])), tag + ': ideal for tags');
      expect(qa.find(a => a.question_key === 'story_surprised' && a.source_ref === bronKey), tag + ': Bron\'s own words, filed to Bron');
      expect(qa.every(a => a.by_vendor === false), tag + ': Tim\'s notes, never the vendor\'s own words');
      // rooms, and the bedroom count only from Tim's calls
      const rooms = (d.property_rooms || []).filter(x => x.property_id === 'P1');
      expect(rooms.length === 6 && (rooms.find(x => x.id === r3) || {}).tim_class === 'study' && (rooms.find(x => x.id === r3) || {}).tim_note === 'No window that opens' && (rooms.find(x => x.id === r3) || {}).vendor_view === 'They call it the third bedroom', tag + ': the rooms, his call, his note and the vendor\'s view');
      const room1 = rooms.find(x => x.id === r1) || {};
      expect(JSON.stringify(room1.features) === JSON.stringify(['Built-in wardrobe', 'Heat pump']) || JSON.stringify(room1.features) === JSON.stringify(['Heat pump', 'Built-in wardrobe']), tag + ': features on the room: ' + JSON.stringify(room1.features));
      const chosen = k => { const c = (d.property_profile || []).find(x => x.property_id === 'P1' && x.key === k); const f = c && d.property_fact_values.find(v => v.id === c.value_id); return f ? [f.value, f.source, f.source_name, c.ticked] : null; };
      out[tag].pBed = chosen('pBed'); out[tag].words = chosen('rooms_summary');
      expect(out[tag].pBed && out[tag].pBed[0] === '2' && out[tag].pBed[1] === 'tim' && /First visit/.test(out[tag].pBed[2]), tag + ': the bedroom count is Tim\'s call: ' + JSON.stringify(out[tag].pBed));
      expect(d.properties.find(x => x.id === 'P1').description.pBed === '2', tag + ': the property file follows his count');
      expect(d.property_fact_values.some(f => f.property_id === 'P1' && f.key === 'pBed' && f.source === 'council' && f.value === '4'), tag + ': the council\'s 4 stays beside, never used');
      expect(out[tag].words && out[tag].words[0] === '2 bedrooms plus study and sleepout', tag + ': the room wording: ' + JSON.stringify(out[tag].words));
      // tap lists on the profile as his own
      expect(JSON.stringify(chosen('pType')) === JSON.stringify(['House', 'tim', 'First visit', true]) && d.properties.find(x => x.id === 'P1').description.pType === 'House', tag + ': property type on the profile and the file: ' + JSON.stringify(chosen('pType')));
      expect((chosen('pBath') || [])[0] === '2', tag + ': bathrooms counted');
      expect(JSON.stringify((chosen('outlook') || [])[0]) === JSON.stringify(['Harbour views', 'Lighthouse views']), tag + ': outlook with his own item: ' + JSON.stringify(chosen('outlook')));
      expect(JSON.stringify((chosen('chattels_featured') || [])[0]) === JSON.stringify(['Woodburner (2)']), tag + ': chattels with counts: ' + JSON.stringify(chosen('chattels_featured')));
      // photos and documents in the one store, with room and caption; the room points at its photo
      const docs = (d.property_documents || []).filter(x => x.property_id === 'P1');
      const photo = docs.find(x => x.kind === 'Photo');
      expect(photo && photo.room === 'Bedroom' && photo.caption === 'View from the window' && String(photo.path).startsWith('properties/P1/photos/'), tag + ': the photo filed to the property with its room and caption: ' + JSON.stringify(photo && [photo.room, photo.caption, photo.path]));
      expect(photo && (room1.photo_keys || []).includes(photo.client_key), tag + ': the room points at its photo');
      expect(docs.some(x => x.kind === 'Record of title' && String(x.path).startsWith('properties/P1/docs/')), tag + ': the title filed to the property');

      // Who's here, now online: the people already on file, tap to say they are here (never typed again, never twice)
      await step('who'); await wait(500);
      expect(!(await p.$('#fvOnFile [data-fvhere]')), tag + ': Rob is already here, so not offered again');
      // Now or come back: Present now links to what exists
      await step('finish'); await p.click('#fvNow'); await wait(300);
      expect(/later steps/.test(await p.textContent('#fvDecided')) && !!(await p.$('#fvDecided a[data-plink="properties/P1/records"]')), tag + ': Present now: a clear placeholder and the property profile');
      await p.click('#fvBook'); await wait(200); await p.click('#fvSendQ'); await wait(900);
      expect((await at()) === '/portal/properties/P1/appraisal/new', tag + ': Book the presentation offers their Questions before we meet: ' + (await at()));

      // ── 5. From the property file, and from an appointment ──
      await p.goto(PB + 'properties/P1'); await wait(900);
      expect(!!(await p.$(`#fvTile [data-fvopen="${vid}"]`)), tag + ': the property file lists its first visit');
      await p.click(`#fvTile [data-fvopen="${vid}"]`); await wait(800);
      expect((await at()).startsWith(`/portal/properties/P1/first-visit/${vid}`), tag + ': and opens it: ' + (await at()));
      await p.goto(PB + 'processes/first-visit'); await wait(800);
      await p.click('[data-fvpl="L2"]'); await wait(1500);
      const v2 = await p.getAttribute('#fvPage', 'data-visit');
      expect((await at()) === `/portal/properties/P2/first-visit/${v2}`, tag + ': from an appointment, filed to its property: ' + (await at()));
      await step('who'); expect((await p.inputValue('#fvp0n')) === 'Sam Seller' && (await p.inputValue('#fvp0e')) === 'sam@example.com', tag + ': the appointment\'s person comes with it');
      d = await db(); expect(d.property_people.filter(x => x.property_id === 'P2' && x.email === 'sam@example.com').length === 1, tag + ': still one Sam');
      // a person is sent once Tim stops typing: a half-typed email is never filed (a known email is never replaced afterwards)
      await p.click('#fvAddPerson'); await wait(200); await p.fill('#fvp1n', 'Kim'); await p.fill('#fvp1e', 'kim@exam'); await wait(1800);
      d = await db(); expect(!d.property_people.some(x => x.property_id === 'P2' && /^kim/.test(x.email)), tag + ': nothing filed while typing');
      await p.fill('#fvp1e', 'kim@example.com'); await p.click('#fvp1ph'); await p.click('h2'); await wait(1800);
      d = await db(); out[tag].kim = d.property_people.filter(x => x.property_id === 'P2' && /kim/i.test(x.legal_name + x.email)).map(x => x.email);
      expect(JSON.stringify(out[tag].kim) === '["kim@example.com"]', tag + ': filed once, with the whole email, when Tim moves on: ' + JSON.stringify(out[tag].kim));
      // dictation where the browser has none: the keyboard's microphone, said under the button
      await p.evaluate(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
      await step(''); await p.click('#fvNotes_d'); await wait(200);
      expect(/microphone on your keyboard/.test(await note('fvNotes_d') || ''), tag + ': no speech to text here: the keyboard\'s microphone, said under the button');
      await p.goto(PB + 'properties/P1/first-visit/new'); await wait(1200);
      expect(/^\/portal\/properties\/P1\/first-visit\/[0-9a-f-]{36}$/.test(await at()), tag + ': starting from a property files to it: ' + (await at()));

      // ── 6. A vendor reads none of it and runs none of it ──
      await p.evaluate(() => localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'v-1', email: 'robin@example.com' } }))); await p.goto(PK + '/onboarding/'); await wait(700);
      const vend = await p.evaluate(async () => {
        const c = window.supabase.createClient('x', 'y'); const out = {};
        for (const t of ['first_visits', 'first_visit_people', 'property_rooms', 'tap_list_extras']) out[t] = ((await c.from(t).select('*')).data || []).length;
        out.qa = ((await c.from('qa_answers').select('*')).data || []).filter(a => a.source === 'first_visit').length;
        out.start = (await c.rpc('agent_fv_start', { p_id: crypto.randomUUID(), p_property: null, p_address: '1 Vendor Way', p_from: 'address', p_prelisting: null, p_started_at: new Date().toISOString() })).error;
        out.write = (await c.from('property_rooms').insert({ id: crypto.randomUUID(), property_id: 'P1', base: 'bedroom', label: 'X' })).error;
        return out; });
      expect(!vend.first_visits && !vend.first_visit_people && !vend.property_rooms && !vend.tap_list_extras && !vend.qa && vend.start && vend.write, tag + ': a vendor reads and writes none of it: ' + JSON.stringify(vend));
      await p.screenshot({ path: path.join(__dirname, 'out', `first_visit_${tag}.png`), fullPage: true });
    } catch (e) { errs.push(tag + ' threw: ' + (e && e.stack || e)); }
    await ctx.close();
  }
  await b.close();
  console.log(JSON.stringify({ out, errs }, null, 1));
})();

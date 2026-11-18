// Property inspection (Tim, 18 November 2026; migration 012). Tim walks round a property on his phone with only the address:
// property facts go to the property file (and from there to a new agreement's page 1); the Vendor Declaration answers are his
// notes, kept on the inspection, and reach the vendors only as marked answers they must confirm or change before signing.
// Covers: starting with only an address (nothing else made, nothing sent), choosing an existing property by address, answers
// saving as tapped, no signal (queued in the browser, survives a reload, syncs when the signal returns), resuming from the
// dashboard and the property page, facts into page 1, differences with an agreement in force, "send to the vendors" after
// listing, never overwriting a vendor's answer or a signed declaration, vendors unable to read inspections, the vendors' own
// start of the declaration prefilled, and 390 px in light and dark. Screenshots: out/insp_section.png and out/insp_finish.png.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(__dirname, '..', '..', 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const TIM = ['agent-1', 'hello@timmcguire.co.nz'];
(async () => {
  const b = await chromium.launch(); const out = {}, fail = [], errs = [];
  const expect = (ok, msg) => { if (!ok) fail.push(msg); };
  const page = async scheme => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme || 'light' });
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
    await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    await ctx.route('https://packages.dunnerstunner.co.nz/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
    await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' '))); p.on('console', m => { if (m.type() === 'error' && !/Failed to fetch/.test(m.text())) errs.push(m.text()); });
    return { ctx, p };
  };
  const { p } = await page();
  try {
  const go = async () => { await p.goto('https://packages.dunnerstunner.co.nz/onboarding/'); await p.waitForTimeout(600); };
  const as = async (id, email) => { await p.evaluate(([id, email]) => localStorage.setItem('mocksession', JSON.stringify({ user: { id, email } })), [id, email]); await go(); };
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb')));
  const setDb = fn => p.evaluate(`(()=>{ const d=JSON.parse(localStorage.getItem('mockdb')); (${fn})(d); localStorage.setItem('mockdb', JSON.stringify(d)); })()`);
  const sideways = () => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  const status = () => p.textContent('#inspStatus');
  const tap = async (it, v) => { await p.click(`[data-ik="${it}"] input[value="${v}"] + span`); await p.waitForTimeout(250); };
  const typeIn = async (sel, v) => { await p.fill(sel, v); await p.waitForTimeout(900); };
  const tab = async name => { await p.click(`.insp-tab:has-text("${name}")`); await p.waitForTimeout(300); };
  const pick = sel => p.$eval(sel, e => { e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); });
  const errText = () => p.textContent('.err');
  const draw = async sel => { const el = await p.$(sel); await el.scrollIntoViewIfNeeded(); const bx = await el.boundingBox(); await p.mouse.move(bx.x + 20, bx.y + 40); await p.mouse.down(); await p.mouse.move(bx.x + 120, bx.y + 90, { steps: 6 }); await p.mouse.move(bx.x + 220, bx.y + 50, { steps: 6 }); await p.mouse.up(); };
  const insp = async addr => { const d = await db(); const pr = d.properties.find(x => x.address === addr); return { d, pr, i: (d.property_inspections || []).filter(x => pr && x.property_id === pr.id).pop() }; };

  await go();
  await p.evaluate(() => { localStorage.clear();
    const now = '2026-11-10T00:00:00Z';
    localStorage.setItem('mockdb', JSON.stringify({ properties: [{ id: 'PR1', address: '22 Queens Drive, Belleknowes', ownership: {}, description: {}, disclosures: {}, stage: 'signed', stage_at: now, created_at: now, updated_at: now },
        { id: 'PR3', address: '5 Draft Street, Opoho', ownership: {}, description: { pLand: '500' }, disclosures: {}, stage: 'agreement', stage_at: now, created_at: now, updated_at: now }],
      property_people: [], agreements: [{ id: 'A3', ref: 'MRE-2026-1003', address: '5 Draft Street, Opoho', property_id: 'PR3', status: 'draft', config: {}, answers: { pBed: '3' }, legal: {}, agreement_version: 'v3.15-26102026', created_at: now }, { id: 'A2', ref: 'MRE-2026-1002', address: '22 Queens Drive, Belleknowes', property_id: 'PR1', status: 'signed', config: {}, answers: {}, legal: { choice: 'have' }, signed_at: now, agreement_version: 'v3.15-26102026', created_at: now }],
      agreement_people: [{ id: 'S1', agreement_id: 'A2', position: 1, legal_name: 'Sam Lee', pref_name: 'Sam', email: 'sam@example.com', phone: '', user_id: 'v-sam', signed_at: now }],
      agreement_events: [], signatures: [], lawyer_links: [], aml_files: [], aml_events: [], email_log: [], cancellation_requests: [] })); });

  // 1. Tim's home page: Inspect a property. An address already on file is offered, to keep one record of the property
  await as(...TIM);
  expect(await p.isVisible('#homeInspect'), 'Inspect a property is on the home page');
  await p.click('#homeInspect'); await p.waitForTimeout(500);
  out.startH1 = await p.textContent('main h1');
  await p.fill('#insAddr', '22 queens drive'); await p.waitForTimeout(200);
  out.matches = await p.$$eval('.insp-match strong', e => e.map(x => x.textContent));
  expect(out.matches.includes('22 Queens Drive, Belleknowes'), 'the existing property is offered by address: ' + out.matches);
  await p.fill('#insAddr', '22 Queens Drive, Belleknowes'); await p.waitForTimeout(200);
  expect(await p.$eval('#insNew', e => e.disabled), 'an exact match can\'t be filed twice');
  await p.click('[data-insp-prop="PR1"]'); await p.waitForTimeout(600);
  expect(await p.textContent('main h1') === 'Outside', 'the walk-round opens on Outside');
  await tab('Services'); await tap('d:water', 'yes'); await tap('d:sewer', 'yes');
  let d = await db(); expect((d.property_inspections || []).length === 1 && d.property_inspections[0].property_id === 'PR1' && d.property_inspections[0].declaration.water.a === 'yes', 'the inspection is on the existing property, saved as tapped');
  await p.click('#navHome'); await p.waitForTimeout(400);

  // 2. a new address alone: a property file at Appraisal, nobody on it, no pre-listing or agreement, nothing sent
  await p.click('#homeInspect'); await p.waitForTimeout(500);
  await p.fill('#insAddr', '9 Test Road, Roslyn'); await p.waitForTimeout(200);
  expect(!(await p.$$('.insp-match')).length, 'no false matches');
  await p.click('#insNew'); await p.waitForTimeout(700);
  let { pr, i } = await insp('9 Test Road, Roslyn');
  d = await db();
  expect(pr && pr.stage === 'appraisal', 'the new property sits at Appraisal: ' + (pr && pr.stage));
  expect(!d.property_people.some(x => x.property_id === pr.id) && !(d.prelistings || []).some(x => x.property_id === pr.id) && !d.agreements.some(x => x.property_id === pr.id), 'no vendor, pre-listing or agreement made');
  expect(i && i.status === 'in_progress' && Array.isArray(i.photos) && !i.photos.length, 'an inspection is started, with an empty place for photos');
  let inv = await p.evaluate(() => JSON.parse(localStorage.getItem('inv') || '[]')); expect(!inv.length && !d.email_log.length, 'nothing is sent to anyone');

  // 3. answers save as tapped: facts to the property file, declaration answers to the inspection only
  out.status0 = await status(); expect(out.status0 === 'Saved', 'Saved shows in the top bar');
  await tap('f:pType', 'House'); await tap('d:pegs', 'yes'); await p.click('[data-ik="f:hazards"] input[value="Steep driveway or steps"] + span'); await p.waitForTimeout(250);
  await typeIn('[data-itext="f:pLand"]', '650');
  ({ pr, i } = await insp('9 Test Road, Roslyn'));
  expect(pr.description.pType === 'House' && pr.description.pLand === '650' && (pr.disclosures.hazards || []).includes('Steep driveway or steps'), 'facts are on the property file as soon as they are tapped');
  expect(i.declaration.pegs.a === 'yes' && !pr.description.pegs && !pr.disclosures.pegs, 'the declaration answer stays on the inspection');
  out.count = await p.textContent('[data-iseccount="outside"]'); expect(out.count === '4 of 8 answered', 'progress count per section: ' + out.count);
  await typeIn('#inote', 'Tidy section, north facing');
  ({ i } = await insp('9 Test Road, Roslyn')); expect(i.notes.outside === 'Tidy section, north facing', 'a note per section');
  // clearing an answer takes it off again
  await tap('d:pegs', 'no'); await p.click('[data-iclear="d:pegs"]'); await p.waitForTimeout(250);
  ({ i } = await insp('9 Test Road, Roslyn')); expect(!i.declaration.pegs, 'an answer can be left blank again');
  await tap('d:pegs', 'yes');
  expect(!(await sideways()), 'Outside fits 390 px');

  // 4. structure, mid-way (screenshot)
  await p.click('#next'); await p.waitForTimeout(300);
  expect(await p.textContent('main h1') === 'Structure and cladding', 'Next goes to the next section');
  await tap('d:era', 'no'); await tap('f:wt', 'no'); await tap('d:asbestos', 'unknown');
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(150);
  expect(await p.isVisible('#inspStatus'), 'the saved status is on screen at 390 px');
  await p.screenshot({ path: path.join(__dirname, 'out', 'insp_section.png'), fullPage: false });

  // 5. no signal: answers wait in the browser, survive a reload, and sync when the signal returns
  await p.evaluate(() => localStorage.setItem('mockOffline', '1'));
  await tap('d:dux', 'no'); await p.fill('[data-itext="f:pYear"]', '1998'); await p.waitForTimeout(900);
  out.offStatus = await status(); expect(/Waiting for signal/.test(out.offStatus), 'Waiting for signal shows: ' + out.offStatus);
  ({ i } = await insp('9 Test Road, Roslyn')); expect(!i.declaration.dux && !i.facts.pYear, 'nothing reached the database without signal');
  out.queued = await p.evaluate(id => JSON.parse(localStorage.getItem('inspQ:' + id)).pending, i.id);
  expect(out.queued.decl.dux && out.queued.decl.dux.a === 'no' && out.queued.facts.pYear === '1998', 'the answers are kept in the browser');
  await p.reload(); await p.waitForTimeout(900);
  out.afterReload = await p.textContent('main h1'); expect(out.afterReload === 'Structure and cladding' || out.afterReload === 'Outside', 'a reload goes straight back to the inspection: ' + out.afterReload);
  if (out.afterReload !== 'Structure and cladding') await tab('Structure');
  expect(await p.$eval('[data-ik="d:dux"] input[value="no"]', e => e.checked) && (await p.inputValue('[data-itext="f:pYear"]')) === '1998', 'answers survive the reload');
  expect(/Waiting for signal/.test(await status()), 'still waiting after the reload');
  await p.evaluate(() => { localStorage.removeItem('mockOffline'); window.dispatchEvent(new Event('online')); }); await p.waitForTimeout(800);
  ({ pr, i } = await insp('9 Test Road, Roslyn'));
  expect(i.declaration.dux && i.declaration.dux.a === 'no' && i.facts.pYear === '1998' && pr.description.pYear === '1998', 'synced when the signal returned');
  expect(await status() === 'Saved', 'Saved again');
  expect(!pendingLeft(await p.evaluate(id => JSON.parse(localStorage.getItem('inspQ:' + id)), i.id)), 'nothing left waiting');

  // 5b. a batch the server refuses: only the answer it names is dropped (and Tim is told which); the rest is saved
  await p.evaluate(() => localStorage.setItem('mockOffline', '1'));
  await tap('d:dux', 'unknown'); await tap('d:wt', 'no');
  await p.evaluate(() => { localStorage.setItem('mockRefuse', 'd:dux'); localStorage.removeItem('mockOffline'); window.dispatchEvent(new Event('online')); }); await p.waitForTimeout(900);
  ({ i } = await insp('9 Test Road, Roslyn'));
  out.refused = await status();
  expect(i.declaration.wt && i.declaration.wt.a === 'no' && i.declaration.dux.a === 'no', 'the rest of the batch is saved; the refused answer is not: ' + JSON.stringify([i.declaration.wt, i.declaration.dux]));
  expect(/^Not saved: Is the Vendor aware of any Dux Qest/.test(out.refused), 'the status names the refused answer: ' + out.refused);
  expect(!pendingLeft(await p.evaluate(id => JSON.parse(localStorage.getItem('inspQ:' + id)), i.id)), 'only that answer was dropped, nothing else waits');
  // a refusal that names no answer: everything stays queued, with Try again
  await p.evaluate(() => localStorage.setItem('mockRefuse', 'all'));
  await tap('d:wt', 'yes');
  out.fail = await status(); expect(/^Not saved: Something went wrong/.test(out.fail) && await p.isVisible('#inspRetry'), 'Not saved, with a retry: ' + out.fail);
  expect(pendingLeft(await p.evaluate(id => JSON.parse(localStorage.getItem('inspQ:' + id)), i.id)) === 1, 'the answer is kept on the phone');
  await p.evaluate(() => localStorage.removeItem('mockRefuse')); await p.click('#inspRetry'); await p.waitForTimeout(600);
  ({ i } = await insp('9 Test Road, Roslyn')); expect(i.declaration.wt.a === 'yes' && await status() === 'Saved', 'Try again saves it');
  // an expired sign-in: kept, asked to sign in again, saved once signed in
  await p.evaluate(() => localStorage.setItem('mockAuthFail', '1'));
  await tap('d:wt', 'no');
  out.auth = await status(); expect(/sign-in has run out/.test(out.auth) && (await p.textContent('#inspRetry')) === 'Sign in again', 'asks to sign in again: ' + out.auth);
  await p.click('#inspRetry'); await p.waitForTimeout(300); out.authToast = await p.textContent('#toast');
  expect(/Check your email for a sign-in link/.test(out.authToast), 'a sign-in link is sent: ' + out.authToast);
  ({ i } = await insp('9 Test Road, Roslyn')); expect(i.declaration.wt.a === 'yes', 'nothing saved while signed out');
  await p.evaluate(() => localStorage.removeItem('mockAuthFail')); await p.reload(); await p.waitForTimeout(1200);
  ({ i } = await insp('9 Test Road, Roslyn')); expect(i.declaration.wt.a === 'no' && await status() === 'Saved', 'saved once signed in again');
  expect(await p.$eval('#inote', e => e.maxLength) === 4000 && await p.$eval('[data-itext="d:wt"]', e => e.maxLength) === 4000, 'notes and details stop at the server\'s limit');
  // an older answer from another phone never replaces a newer one
  out.older = await p.evaluate(async id => { const c = window.supabase.createClient(); const r = await c.rpc('agent_inspection_save', { iid: id, p_facts: {}, p_decl: { wt: { a: 'unknown', d: '' } }, p_notes: {}, p_stamps: { 'd:wt': '2000-01-01T00:00:00Z' } }); return r.data && r.data.skipped; }, i.id);
  ({ i } = await insp('9 Test Road, Roslyn')); expect(out.older && 'd:wt' in out.older && i.declaration.wt.a === 'no', 'the server keeps the newer answer: ' + JSON.stringify(out.older));

  // 6. resume from the dashboard ("Needs you", quiet) and from the property page
  await p.click('#navDash'); await p.waitForTimeout(600);
  out.needs = await p.$$eval('.needs li', e => e.map(x => x.textContent.replace(/\s+/g, ' ')));
  const ni = out.needs.findIndex(t => t.includes('Inspection started, not finished') && t.includes('9 Test Road'));
  expect(ni >= 0, 'Needs you: Inspection started, not finished');
  expect(await p.$eval(`[data-need="${ni}"]`, e => e.classList.contains('ghost')), 'it is a quiet item');
  expect(!(await p.evaluate(() => localStorage.getItem('inspOpen'))), 'leaving the walk-round forgets it for reloads');
  out.leftOnPhone = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('inspQ:')));
  expect(!out.leftOnPhone.length, 'nothing is left on the phone once saved and closed: ' + out.leftOnPhone);
  expect(await p.isVisible('#newInsp'), 'Inspect a property on the dashboard');
  await p.click(`[data-need="${ni}"]`); await p.waitForTimeout(600);
  expect(await p.textContent('main h1') === 'Outside' && await p.$eval('[data-ik="d:pegs"] input[value="yes"]', e => e.checked), 'resumed with the answers');
  await p.click('#back'); await p.waitForTimeout(700);
  out.tile = await p.textContent('#inspTile'); expect(/Started, not finished/.test(out.tile) && /Carry on/.test(out.tile), 'Inspection tile on the property page: ' + out.tile.replace(/\s+/g, ' '));
  await p.click('#inspTile [data-inspopen]'); await p.waitForTimeout(600);

  // 7. the rest of the walk-round
  await tab('Inside'); await tap('f:pBed', '3'); await tap('f:pBath', '2'); await typeIn('[data-itext="f:pHeat"]', 'Heat pump, ceiling insulation');
  await tab('Services'); await tap('d:water', 'yes');
  await tab('Consents'); await tap('f:work', 'yes'); await typeIn('[data-itext="f:workDetail"]', 'Deck 2019, consented'); await tap('f:meth', 'no');
  expect(await p.isVisible('[data-iuse="meth"]'), 'Use my answer above is offered for the matching declaration question');
  await p.click('[data-iuse="meth"]'); await p.waitForTimeout(400);
  expect(await p.$eval('[data-ik="d:meth"] input[value="no"]', e => e.checked), 'one tap copies it across');
  await tab('Tenancy'); await tap('d:tenanted', 'no');
  const keys = await p.evaluate(() => [...new Set([...document.querySelectorAll('.insp-tab')].map(x => x.textContent))]);
  // every Vendor Declaration question is in the walk-round, with Tim's wording
  const allQs = await p.evaluate(async () => { const n = []; for (const b of [...document.querySelectorAll('[data-isecn]')]) { b.click(); await new Promise(r => setTimeout(r, 120)); document.querySelectorAll('.vdq-i h3').forEach(h => n.push(h.textContent)); } return n; });
  expect(allQs.length === 27 && allQs.includes('Is the Vendor aware of any Dux Qest plumbing, Weatherside cladding, or Monolithic cladding?') && allQs.includes('Can the Vendor identify the location of ALL boundary pegs?'), 'all 27 declaration questions, in Tim\'s words: ' + allQs.length);
  out.tabs = keys.length;

  // 8. finish (screenshot); no agreement yet, so the declaration answers wait for the vendors' own start. Finish pressed while a
  //    save is still on its way waits for it rather than saying "Not saved yet"
  await p.evaluate(() => { localStorage.setItem('mockSaveDelay', '1500'); const t = [...document.querySelectorAll('.insp-tab')].find(b => b.textContent.startsWith('Tenancy')); t.click(); });
  await p.waitForTimeout(200); await tap('d:tenanted', 'now'); await tap('d:tenanted', 'no');
  await p.click('#insGoFinish'); await p.waitForTimeout(3500); await p.evaluate(() => localStorage.removeItem('mockSaveDelay'));
  out.finishH1 = await p.textContent('main h1'); expect(out.finishH1 === 'Inspection finished', 'finished: ' + out.finishH1);
  out.finishDecl = await p.textContent('#insDecl'); expect(/When the vendors start their Vendor Declaration/.test(out.finishDecl), 'before listing: the answers wait for the vendors');
  expect(!(await sideways()), 'the finish screen fits 390 px');
  await p.screenshot({ path: path.join(__dirname, 'out', 'insp_finish.png'), fullPage: false });
  ({ i } = await insp('9 Test Road, Roslyn')); expect(i.status === 'finished' && i.finished_at, 'marked finished');
  await p.click('#navDash'); await p.waitForTimeout(600);
  out.needs2 = await p.$$eval('.needs li', e => e.map(x => x.textContent)); expect(!out.needs2.some(t => t.includes('9 Test Road')), 'the dashboard item goes once finished');

  // 9. property facts flow into a new agreement's page 1
  await p.click('tr[data-prop]:has-text("9 Test Road")'); await p.waitForTimeout(600);
  await p.click('#pfAgree'); await p.waitForTimeout(600);
  out.page1 = { type: await p.inputValue('#t_pType'), year: await p.inputValue('#t_pYear'), bed: await p.inputValue('#t_pBed'), heat: await p.inputValue('#t_pHeat'), work: await p.$eval('input[name="t_an_work"][value="yes"]', e => e.checked), wd: await p.inputValue('#t_workDetail'), haz: await p.$eval('[data-tmulti="hazards"][value="Steep driveway or steps"]', e => e.checked) };
  expect(out.page1.type === 'House' && out.page1.year === '1998' && out.page1.bed === '3' && /Heat pump/.test(out.page1.heat) && out.page1.work && /Deck 2019/.test(out.page1.wd) && out.page1.haz, 'page 1 is filled from the inspection: ' + JSON.stringify(out.page1));
  d = await db(); expect(!d.agreements.some(a => a.address === '9 Test Road, Roslyn'), 'opening page 1 makes nothing until Tim saves');

  // 9b. a draft agreement: its blank answers never wipe the property file; the inspection fills its blanks; "Use mine" changes
  //     a draft, but not one that has been sent; facts kept as the agreement's aren't counted as on the property file
  await p.evaluate(async () => { const c = window.supabase.createClient(); await c.from('agreements').update({ answers: { pBed: '3', pLand: '', hazards: [] } }).eq('id', 'A3'); });
  d = await db(); expect(d.properties.find(x => x.id === 'PR3').description.pLand === '500', 'a blank on the draft doesn\'t wipe the property file');
  await go(); await p.click('#homeInspect'); await p.waitForTimeout(400);   // (not Home from page 1, which would save it as a draft)
  await p.fill('#insAddr', '5 Draft'); await p.waitForTimeout(200); await p.click('[data-insp-prop="PR3"]'); await p.waitForTimeout(600);
  await tab('Inside'); await tap('f:pBath', '2');
  d = await db(); expect(d.agreements.find(a => a.id === 'A3').answers.pBath === '2', 'the draft agreement gets the value it didn\'t have');
  await tap('f:pBed', '4'); await p.click('#insGoFinish'); await p.waitForTimeout(800);
  await p.click('[data-iresolve="pBed"][data-use="inspection"]'); await p.waitForTimeout(800);
  d = await db(); expect(d.agreements.find(a => a.id === 'A3').answers.pBed === '4' && d.properties.find(x => x.id === 'PR3').description.pBed === '4', 'Use mine changes the draft and the file');
  await setDb(`d => { d.agreements.find(a => a.id === 'A3').status = 'sent'; }`); await go(); await p.click('#insBackWalk'); await p.waitForTimeout(500);
  await tab('Inside'); await tap('f:pBed', '5'); await tap('f:pBath', '3');
  await p.click('#insGoFinish'); await p.waitForTimeout(800);
  await p.click('[data-iresolve="pBed"][data-use="inspection"]'); await p.waitForTimeout(800);
  d = await db(); out.sentNote = await p.textContent('#insResolveNote');
  expect(d.agreements.find(a => a.id === 'A3').answers.pBed === '4' && d.properties.find(x => x.id === 'PR3').description.pBed === '5', 'a sent agreement isn\'t changed; the file is');
  expect(/MRE-2026-1003 has been sent, so it wasn't changed. Recall it, or raise the change with the vendors/.test(out.sentNote), 'Tim is told to recall it or raise it: ' + out.sentNote);
  await p.click('[data-iresolve="pBath"][data-use="agreement"]'); await p.waitForTimeout(800);
  out.factCount = (await p.textContent('.view-pad.insp')).match(/(\d+) details? (?:is|are) on the property file/);
  expect(out.factCount && out.factCount[1] === '1', 'facts kept as the agreement\'s aren\'t counted: ' + (out.factCount && out.factCount[0]));

  // 10. after listing: a signed agreement on the property (Jane and Rob). 3 bedrooms signed; Tim notes 4
  ({ pr, i } = await insp('9 Test Road, Roslyn'));
  await setDb(`d => { const pid='${pr.id}', t='2026-11-12T00:00:00Z'; d.agreements.push({ id:'A1', ref:'MRE-2026-1001', address:'9 Test Road, Roslyn', property_id:pid, status:'signed', config:{}, answers:{ pBed:'3', pType:'House' }, legal:{ choice:'have' }, signed_at:t, agreement_version:'v3.15-26102026', created_at:t });
    d.agreement_people.push({ id:'P1', agreement_id:'A1', position:1, legal_name:'Jane Mary Smith', pref_name:'Jane', email:'jane@example.com', phone:'', user_id:'v-jane', signed_at:t }, { id:'P2', agreement_id:'A1', position:2, legal_name:'Robert Smith', pref_name:'Rob', email:'rob@example.com', phone:'', user_id:'v-rob', signed_at:t }); }`);
  await go();
  await p.click('#navDash'); await p.waitForTimeout(500); await p.click('tr[data-prop]:has-text("9 Test Road")'); await p.waitForTimeout(600);
  await p.click('#inspTile [data-inspopen]'); await p.waitForTimeout(600);
  await tab('Inside'); await tap('f:pBed', '4');
  out.conf = await p.textContent('[data-iconf="pBed"]'); expect(/MRE-2026-1001 says 3/.test(out.conf), 'the difference shows where it was tapped: ' + out.conf);
  ({ pr } = await insp('9 Test Road, Roslyn')); expect(pr.description.pBed === '3', 'the agreement\'s value is not overwritten');
  await p.click('#insGoFinish'); await p.waitForTimeout(800);
  expect(await p.isVisible('[data-iconflict="pBed"]'), 'the finish screen asks Tim to choose');
  await p.click('[data-iresolve="pBed"][data-use="inspection"]'); await p.waitForTimeout(800);
  d = await db(); ({ pr } = await insp('9 Test Road, Roslyn'));
  expect(pr.description.pBed === '4' && d.agreements.find(a => a.id === 'A1').answers.pBed === '3', 'Use mine: the property file changes, the signed agreement does not');

  // 11. Send to the vendors to check and sign: a draft declaration with Tim's notes marked, nothing confirmed for them
  expect(await p.isVisible('#insSend'), 'Send to the vendors is offered once the agreement is signed');
  await p.click('#insSend'); await p.waitForTimeout(700);
  expect(await p.isVisible('#insSent'), 'sent');
  d = await db(); let vd = (d.property_forms || []).find(f => f.agreement_id === 'A1' && f.kind === 'vendor_declaration');
  expect(vd && vd.status === 'draft' && vd.data.insp && vd.data.pre.pegs === 'inspection' && vd.data.pre.tenanted === 'inspection' && vd.data.answers.dux.a === 'no' && vd.data.tenanted === 'no', 'the draft holds Tim\'s notes, marked');
  expect(!Object.keys(vd.data.checked || {}).length && !(d.form_signatures || []).length, 'nothing is confirmed or signed for the vendors');
  inv = await p.evaluate(() => JSON.parse(localStorage.getItem('inv') || '[]')); expect(!inv.length && !d.email_log.length, 'no email to anyone');
  // Tim can't tick them off himself
  const forge = await p.evaluate(async id => { const c = window.supabase.createClient(); const f = JSON.parse(localStorage.getItem('mockdb')).property_forms.find(x => x.id === id); const r = await c.from('property_forms').update({ data: Object.assign({}, f.data, { checked: { pegs: true } }) }).eq('id', id); return r.error && r.error.message; }, vd.id);
  expect(/Only the vendors fill in their declaration/.test(forge || ''), 'a direct write can\'t confirm for the vendors: ' + forge);
  const direct = await p.evaluate(async id => { const c = window.supabase.createClient(); const f = JSON.parse(localStorage.getItem('mockdb')).property_forms.find(x => x.id === id);
    const u = await c.from('property_forms').update({ data: Object.assign({}, f.data, { answers: Object.assign({}, f.data.answers, { history: { a: 'no', d: '' } }) }) }).eq('id', id);
    const x = await c.from('property_forms').delete().eq('id', id); return [u.error && u.error.message, x.error && x.error.message]; }, vd.id);
  expect(/Only the vendors fill in/.test(direct[0] || '') && /can't be removed/.test(direct[1] || ''), 'a direct agent update or delete of the declaration is refused: ' + JSON.stringify(direct));
  d = await db(); expect(d.property_forms.some(f => f.id === vd.id && !f.data.answers.history), 'the declaration is untouched');

  // 12. vendors can't read the inspection, or call its functions
  await as('v-jane', 'jane@example.com');
  const peek = await p.evaluate(async () => { const c = window.supabase.createClient(); const a = await c.from('property_inspections').select('*'); const r = await c.rpc('agent_inspection_send', { iid: 'x' }); return [(a.data || []).length, r.error && r.error.message]; });
  expect(peek[0] === 0 && /Agent only/.test(peek[1] || ''), 'vendors read no inspections and can\'t send: ' + JSON.stringify(peek));

  // 13. Jane: the paperwork tile says Tim has noted answers; each must be confirmed or changed before signing
  out.vTile = await p.evaluate(() => [...document.querySelectorAll('.ptile')].map(t => t.textContent.replace(/\s+/g, ' ')).find(t => t.includes('Vendor Declaration')));
  expect(/Tim has noted some answers from his inspection/.test(out.vTile || ''), 'Paperwork still to do: ' + out.vTile);
  const early = await p.evaluate(async id => { const c = window.supabase.createClient(); const r = await c.rpc('vendor_form_sign', { f: id, p_image_path: 'agreements/A1/signatures/form-' + id + '-P1-1.png', p_snapshot: {}, p_user_agent: 'x' }); return r.error && r.error.message; }, vd.id);
  expect(/Please check each answer Tim noted/.test(early || ''), 'signing is refused while Tim\'s notes are unchecked: ' + early);
  await p.click('[data-form="vendor_declaration"]'); await p.waitForTimeout(600);
  await pick('input[name="vfFile"][value="ok"]'); await p.click('#next'); await p.waitForTimeout(400);
  out.badges = await p.$$eval('.vdq', e => e.filter(c => c.querySelector('.insp-badge')).map(c => c.dataset.q));
  expect(['pegs', 'era', 'dux', 'asbestos', 'meth'].every(k => out.badges.includes(k)), 'Tim\'s notes are marked: ' + out.badges);
  out.badgeText = await p.textContent('[data-q="pegs"] .insp-badge'); expect(/Noted by Tim at the inspection on .*2026\. Please check/.test(out.badgeText), out.badgeText);
  expect(await p.$eval('[data-q="pegs"] .insp-badge [translate="no"]', e => /2026/.test(e.textContent)), 'the date is marked translate="no"');
  await p.$$eval('.vdq', cs => cs.forEach(c => { if (!c.querySelector('input:checked') && c.querySelector('input[value="no"]')) c.querySelector('input[value="no"]').checked = true; }));
  for (const k of ['faults', 'reno']) { const v = await p.inputValue(`[data-qd="${k}"]`); if (!v) await p.fill(`[data-qd="${k}"]`, 'None known'); }
  await p.click('#next'); await p.waitForTimeout(300); out.vErr = await errText();
  expect(/Please check each answer Tim noted/.test(out.vErr), 'Continue needs each of Tim\'s notes checked: ' + out.vErr);
  await p.click('[data-q="pegs"] input[value="unknown"] + .mark'); await p.waitForTimeout(100);
  expect(await p.$eval('[data-qc="pegs"]', e => e.checked), 'changing an answer counts as checking it');
  for (const k of out.badges.filter(k => k !== 'pegs')) await p.click(`[data-q="${k}"] .iconfirm`);
  await p.click('#next'); await p.waitForTimeout(500);
  out.sent1 = await p.evaluate(() => JSON.parse(localStorage.getItem('lastVendorSave') || '{}'));
  expect(out.sent1.answers && 'pegs' in out.sent1.answers && !('era' in out.sent1.answers) && out.sent1.checked.era === true && !('pre' in out.sent1) && !('insp' in out.sent1),
    'the page sends only the answers Jane changed, and a tick per note; never pre or insp: ' + JSON.stringify(Object.keys(out.sent1.answers || {})));
  expect(await p.textContent('main h1') === 'Services and Features', 'on to step 2 once checked');
  expect(await p.isVisible('[data-q="water"] .insp-badge') && await p.isVisible('[data-qc="tenanted"]'), 'services and tenancy notes are marked too');
  await p.$$eval('.vdq', cs => cs.forEach(c => { const r = c.querySelector('input[value="yes"]'); if (r && !c.querySelector('input:checked')) r.checked = true; }));
  await pick('input[name="vq_hai"][value="no"]'); await pick('input[name="vq_burner"][value="no"]');
  await p.fill('[data-qd="internet"]', 'Fibre'); await p.fill('[data-qd="glazing"]', 'Double glazed'); if (!(await p.inputValue('[data-qd="insulation"]'))) await p.fill('[data-qd="insulation"]', 'Ceiling');
  await p.click('#next'); await p.waitForTimeout(300); expect(/Please check each answer Tim noted/.test(await errText()), 'step 2 too');
  await p.click('[data-q="water"] .iconfirm'); await p.click('.vdq-ten .iconfirm');
  await p.click('#next'); await p.waitForTimeout(500);
  expect(/Vendor Statement and signing/.test(await p.textContent('main h1')), 'at signing');
  expect(!(await sideways()), 'the vendor screens fit 390 px');
  await p.click('#back'); await p.waitForTimeout(300); await p.click('#back'); await p.waitForTimeout(300); await p.click('#back'); await p.waitForTimeout(300); await p.click('#back'); await p.waitForTimeout(400);

  d = await db(); vd = d.property_forms.find(f => f.id === vd.id);
  expect(vd.data.checked.pegs && vd.data.checked.pegs.name === 'Jane Mary Smith' && vd.data.checked.pegs.by === 'P1' && vd.data.checked.dux.name === 'Jane Mary Smith', 'the server records who checked each note: ' + JSON.stringify(vd.data.checked.pegs));
  // Rob, before signing: one owner's check is enough, and he sees which answers came from Tim and who checked them
  await as('v-rob', 'rob@example.com');
  await p.click('[data-form="vendor_declaration"]'); await p.waitForTimeout(600);
  out.robSees = (await p.textContent('main')).replace(/\s+/g, ' ');
  expect(/Noted by Tim McGuire at the inspection on .*2026; checked by Jane Mary Smith/.test(out.robSees), 'Rob sees Tim\'s notes and who checked them');
  await p.click('#back'); await p.waitForTimeout(300);

  // 14. Tim notes something else for a question Jane has answered: her answer stays, and he sees the difference
  await as(...TIM);
  await p.click('#navDash'); await p.waitForTimeout(500); await p.click('tr[data-prop]:has-text("9 Test Road")'); await p.waitForTimeout(600);
  await p.click('#inspTile [data-inspopen]'); await p.waitForTimeout(600);
  await tap('d:pegs', 'no'); await tab('Consents'); await tap('d:lim', 'yes');
  await p.click('#insGoFinish'); await p.waitForTimeout(800);
  await p.click('#insSend'); await p.waitForTimeout(700);
  out.kept = await p.$$eval('[data-ikept]', e => e.map(x => x.dataset.ikept + ': ' + x.textContent.replace(/\s+/g, ' ')));
  expect(out.kept.some(t => t.startsWith('pegs') && /They said: Unknown/.test(t) && /You noted: No/.test(t)), 'the difference is shown: ' + out.kept);
  d = await db(); vd = d.property_forms.find(f => f.id === vd.id);
  expect(vd.data.answers.pegs.a === 'unknown' && vd.data.checked.pegs.name === 'Jane Mary Smith', 'Jane\'s answer is never overwritten');
  expect(out.kept.some(t => t.startsWith('lim') && /They said: No/.test(t)) && vd.data.answers.lim.a === 'no' && vd.data.pre.lim !== 'inspection', 'a question Jane answered herself stays hers: ' + JSON.stringify(vd.data.answers.lim));
  // a vendor's save from a page that hasn't seen Tim's new note can't remove it, or the markers
  await as('v-jane', 'jane@example.com');
  out.stale = await p.evaluate(async id => { const c = window.supabase.createClient(); const r = await c.rpc('vendor_form_save', { f: id, patch: { answers: { history: { a: 'yes', d: 'A new road' } }, pre: {}, insp: null, checked: { meth: false, dux: { by: 'x', name: 'Forged' } } } }); return r.error && r.error.message; }, vd.id);
  d = await db(); const vd2 = d.property_forms.find(f => f.id === vd.id);
  expect(!out.stale && vd2.data.answers.history.a === 'yes' && vd2.data.answers.lim.a === 'no' && vd2.data.answers.pegs.a === 'unknown' && vd2.data.pre.pegs === 'inspection' && vd2.data.insp && vd2.data.checked.dux.name === 'Jane Mary Smith' && !vd2.data.checked.meth,
    'the save merges per question, nothing unsent is removed, pre and insp aren\'t taken from the page, and a confirmation is only set by the server: ' + JSON.stringify(vd2.data.checked.dux));
  vd = vd2;

  // 15. Jane signs; then the inspection can't change it
  await go();
  await p.click('[data-form="vendor_declaration"]'); await p.waitForTimeout(600);
  for (let n = 0; n < 4 && !/Vendor Statement and signing/.test(await p.textContent('main h1')); n++) { await p.click('#next'); await p.waitForTimeout(400); }
  await pick('#vfOk'); await draw('#vfSig'); await p.click('#next'); await p.waitForTimeout(400);
  out.methErr = await errText(); expect(/Please check each answer Tim noted/.test(out.methErr), 'a note left unchecked stops signing: ' + out.methErr);
  await p.click('#back'); await p.waitForTimeout(300); await p.click('#back'); await p.waitForTimeout(300);
  await p.click('[data-q="meth"] .iconfirm'); await p.click('#next'); await p.waitForTimeout(400); await p.click('#next'); await p.waitForTimeout(400);
  await pick('#vfOk'); await draw('#vfSig'); await p.click('#next'); await p.waitForTimeout(3600);
  d = await db(); const sig = (d.form_signatures || []).find(s => s.form_id === vd.id);
  expect(sig && sig.snapshot.form_data.pre.pegs === 'inspection' && sig.snapshot.form_data.checked.pegs.name === 'Jane Mary Smith' && sig.snapshot.form_data.checked.meth.name === 'Jane Mary Smith' && sig.snapshot.form_data.answers.pegs.a === 'unknown', 'what was signed is the stored form, with the vendor\'s checks');
  // Rob, after Jane has signed: the locked declaration shows Tim's notes and who checked them
  await as('v-rob', 'rob@example.com'); await p.click('[data-form="vendor_declaration"]'); await p.waitForTimeout(600);
  out.robLocked = (await p.textContent('main')).replace(/\s+/g, ' ');
  expect(/Check and sign the Vendor Declaration/.test(out.robLocked) && /Noted by Tim McGuire at the inspection on .*; checked by Jane Mary Smith/.test(out.robLocked), 'the locked view shows the marker and who checked');
  await as(...TIM);
  const late = await p.evaluate(async id => { const c = window.supabase.createClient(); const r = await c.rpc('agent_inspection_send', { iid: id }); return r.error && r.error.message; }, i.id);
  expect(/has been signed, so the inspection can't change it/.test(late || ''), 'a signed declaration can\'t be changed by the inspection: ' + late);
  await p.click('#navDash'); await p.waitForTimeout(500); await p.click('tr[data-prop]:has-text("9 Test Road")'); await p.waitForTimeout(600);
  await p.click('#inspTile [data-inspopen]'); await p.waitForTimeout(600); await p.click('#insGoFinish'); await p.waitForTimeout(800);
  out.signedMsg = await p.textContent('#insDecl'); expect(/has been signed, so your inspection can't change it/.test(out.signedMsg) && !(await p.$('#insSend')), 'the finish screen says so and offers no send');
  expect(/Signed: Unknown/.test(out.signedMsg) && /You noted: No/.test(out.signedMsg), 'and shows where the notes differ from what was signed');

  // 16. a vendor who starts the declaration themselves gets Tim's notes, marked (Sam, 22 Queens Drive), from every inspection of
  //     the property: a new inspection doesn't drop the earlier one's notes
  await p.evaluate(async () => { const c = window.supabase.createClient(); const d = JSON.parse(localStorage.getItem('mockdb')); const first = d.property_inspections.find(x => x.property_id === 'PR1');
    await c.rpc('agent_inspection_finish', { iid: first.id }); const r = await c.rpc('agent_inspection_start', { p_property: 'PR1', p_address: null });
    await c.rpc('agent_inspection_save', { iid: r.data.inspection_id, p_facts: {}, p_decl: { storm: { a: 'yes', d: '' } }, p_notes: {} }); });
  await as('v-sam', 'sam@example.com');
  await p.click('[data-form="vendor_declaration"]'); await p.waitForTimeout(600);
  d = await db(); const sv = d.property_forms.find(f => f.agreement_id === 'A2' && f.kind === 'vendor_declaration');
  expect(sv && sv.data.pre.water === 'inspection' && sv.data.answers.water.a === 'yes' && sv.data.pre.storm === 'inspection' && sv.data.insp, 'vendor_form_start fills in the notes from every inspection: ' + JSON.stringify(sv && sv.data.pre));
  await pick('input[name="vfFile"][value="ok"]'); await p.click('#next'); await p.waitForTimeout(300);
  await p.$$eval('.vdq', cs => cs.forEach(c => { const r = c.querySelector('input[value="no"]'); if (r) r.checked = true; })); for (const k of ['faults', 'reno']) await p.fill(`[data-qd="${k}"]`, 'None known');
  await p.click('#next'); await p.waitForTimeout(400);
  expect(await p.isVisible('[data-q="water"] .insp-badge') && await p.isVisible('[data-qc="water"]'), 'marked for Sam too');

  // 17. no em dashes on Tim's screens; dark mode at 390 px
  await as(...TIM); expect(await p.textContent('main h1') === 'Inspection finished', 'Tim lands back where he left off'); await p.click('#navHome'); await p.waitForTimeout(300); await p.click('#homeInspect'); await p.waitForTimeout(400);
  expect(await p.evaluate(() => !document.body.innerText.includes('—')), 'no em dashes');
  const dk = await page('dark'); const q = dk.p;
  await q.goto('https://packages.dunnerstunner.co.nz/onboarding/'); await q.waitForTimeout(300);
  await q.evaluate(([s, dbs]) => { localStorage.setItem('mocksession', s); localStorage.setItem('mockdb', dbs); }, [JSON.stringify({ user: { id: TIM[0], email: TIM[1] } }), JSON.stringify(await db())]);
  await q.goto('https://packages.dunnerstunner.co.nz/onboarding/'); await q.waitForTimeout(600);
  await q.click('#navDash'); await q.waitForTimeout(500); await q.click('tr[data-prop]:has-text("9 Test Road")'); await q.waitForTimeout(600);
  await q.click('#inspTile [data-inspopen]'); await q.waitForTimeout(600);
  out.dark = await q.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, side: document.documentElement.scrollWidth > window.innerWidth, chip: getComputedStyle(document.querySelector('.ichip span')).backgroundColor }));
  expect(out.dark.bg !== 'rgb(247, 245, 242)' && !out.dark.side, 'dark mode, no sideways scroll: ' + JSON.stringify(out.dark));
  await q.screenshot({ path: path.join(__dirname, 'out', 'insp_dark.png'), fullPage: false });
  await dk.ctx.close();

  // 18. signing out: a warning while answers wait (cancel keeps them), then every inspection copy is wiped from the phone
  await p.click('#navDash'); await p.waitForTimeout(500); await p.click('tr[data-prop]:has-text("9 Test Road")'); await p.waitForTimeout(600);
  await p.click('#inspTile [data-inspopen]'); await p.waitForTimeout(600);
  await p.evaluate(() => localStorage.setItem('mockOffline', '1')); await tap('d:pipes', 'no');
  let dialog = ''; p.once('dialog', dg => { dialog = dg.message(); dg.dismiss(); });
  await p.click('#signOut'); await p.waitForTimeout(500);
  expect(/1 inspection answer hasn't been saved yet/.test(dialog) && await p.isVisible('#signOut') && (await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('inspQ:')).length)) > 0, 'cancel keeps him signed in, with the answer: ' + dialog);
  p.once('dialog', dg => dg.accept());
  await p.click('#signOut'); await p.waitForTimeout(800);
  out.afterSignOut = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('insp')));
  await p.evaluate(() => localStorage.removeItem('mockOffline')); await go();
  expect(!out.afterSignOut.length && /Your agency agreement/.test(await p.textContent('main h1')), 'signed out, and nothing of the inspection is left on the phone: ' + out.afterSignOut);
  } catch (e) { fail.push('CRASHED: ' + e.message.split('\n').slice(0, 3).join(' | ')); }
  console.log(JSON.stringify(Object.assign(out, { errs: errs.concat(fail) }), null, 1)); await b.close();
})();
function pendingLeft(c) { const P = (c || {}).pending || {}; return Object.keys(P.facts || {}).length + Object.keys(P.decl || {}).length + Object.keys(P.notes || {}).length; }

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
  await tap('f:pType', 'House'); await tap('d:pegs', 'yes'); await tap('d:hazard', 'yes'); await p.click('[data-ik="d:hazard"] input[value="Steep driveway or steps"] + span'); await p.waitForTimeout(250);
  await typeIn('[data-itext="f:pLand"]', '650');
  ({ pr, i } = await insp('9 Test Road, Roslyn'));
  expect(pr.description.pType === 'House' && pr.description.pLand === '650' && (pr.disclosures.hazards || []).includes('Steep driveway or steps'), 'facts are on the property file as soon as they are tapped');
  expect(i.declaration.pegs.a === 'yes' && !pr.description.pegs && !pr.disclosures.pegs, 'the declaration answer stays on the inspection');
  out.count = await p.textContent('[data-iseccount="outside"]'); expect(out.count === '4 of 6 answered', 'progress count per section: ' + out.count);
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
  await tap('d:era', 'no'); await tap('d:wt', 'no'); await tap('d:asbestos', 'unknown');
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
  expect(pendingLeft(await p.evaluate(id => JSON.parse(localStorage.getItem('inspQ:' + id)), i.id)) === 2, 'the answer is kept on the phone (the weathertightness answer and the fact it fills)');
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
  expect(await p.$eval('#inote', e => e.maxLength) === 4000 && await p.$eval('[data-itext="d:faults"]', e => e.maxLength) === 4000, 'notes and details stop at the server\'s limit');
  // an older answer from another phone never replaces a newer one
  out.older = await p.evaluate(async id => { const c = window.supabase.createClient(); const r = await c.rpc('agent_inspection_save', { iid: id, p_facts: {}, p_decl: { wt: { a: 'unknown', d: '' } }, p_notes: {}, p_stamps: { 'd:wt': '2000-01-01T00:00:00Z' } }); return r.data && r.data.skipped; }, i.id);
  ({ i } = await insp('9 Test Road, Roslyn')); expect(out.older && 'd:wt' in out.older && i.declaration.wt.a === 'no', 'the server keeps the newer answer: ' + JSON.stringify(out.older));

  // 6. resume from the dashboard ("Needs you", quiet) and from the property page
  await p.click('#navDash'); await p.waitForTimeout(600);
  out.needs = await p.$$eval('.needs li', e => e.map(x => x.textContent.replace(/\s+/g, ' ')));
  const ni = out.needs.findIndex(t => t.includes('Disclosures check started, not finished') && t.includes('9 Test Road'));
  expect(ni >= 0, 'Needs you: Disclosures check started, not finished');
  expect(await p.$eval(`[data-need="${ni}"]`, e => e.classList.contains('ghost')), 'it is a quiet item');
  expect(!(await p.evaluate(() => localStorage.getItem('inspOpen'))), 'leaving the walk-round forgets it for reloads');
  out.leftOnPhone = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('inspQ:')));
  expect(!out.leftOnPhone.length, 'nothing is left on the phone once saved and closed: ' + out.leftOnPhone);
  expect(await p.isVisible('#newInsp'), 'Inspect a property on the dashboard');
  await p.click(`[data-need="${ni}"]`); await p.waitForTimeout(600);
  expect(await p.textContent('main h1') === 'Outside' && await p.$eval('[data-ik="d:pegs"] input[value="yes"]', e => e.checked), 'resumed with the answers');
  out.openCopy = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('inspQ:')));
  expect(!out.openCopy.length, 'loaded from the server with nothing waiting: no copy is kept on the phone, even while open: ' + out.openCopy);
  await tap('d:pegs', 'no'); await tap('d:pegs', 'yes');
  expect(!(await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('inspQ:')).length)), 'and none once a new answer has saved');
  await p.click('#back'); await p.waitForTimeout(700);
  out.tile = await p.textContent('#inspTile'); expect(/Started, not finished/.test(out.tile) && /Carry on/.test(out.tile), 'Inspection tile on the property page: ' + out.tile.replace(/\s+/g, ' '));
  await p.click('#inspTile [data-inspopen]'); await p.waitForTimeout(600);

  // 7. the rest of the walk-round
  await tab('Inside'); await tap('f:pBed', '3'); await tap('f:pBath', '2'); await typeIn('[data-itext="f:pHeat"]', 'Heat pump, ceiling insulation');
  await tab('Services'); await tap('d:water', 'yes');
  await tab('Consents'); await tap('d:reno', 'yes'); await typeIn('[data-itext="d:reno"]', 'Deck 2019, consented');
  await p.click('input[name="idf_meth_aware"][value="no"] + span'); await p.waitForTimeout(250); await p.click('input[name="idf_meth_tested"][value="no"] + span'); await p.waitForTimeout(250);
  expect(!(await p.$('[data-iuse]')) && !(await p.$('[data-ik="f:meth"]')), 'no separate fact question and no "Use my answer above"');
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
  out.finishH1 = await p.textContent('main h1'); expect(out.finishH1 === 'Disclosures check finished', 'finished: ' + out.finishH1);
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
  // a large queue from a long time without signal (27 long answers, more than one save can take): the phone sends it in smaller
  // batches, and when the server still says a batch is too much (here its limit is lowered to 20000), halves it until all is saved
  await p.evaluate(() => { localStorage.setItem('mockOffline', '1'); localStorage.setItem('mockMaxBatch', '20000'); localStorage.removeItem('mockBatchLog'); });
  // each question answered Unknown (or Yes for the renovations question, which has no Unknown) so its details box shows
  for (const sec of ['Outside', 'Structure', 'Inside', 'Services', 'Consents']) { await tab(sec);
    for (const k of await p.$$eval('.vdq-i', e => e.map(c => c.dataset.ik))) { const u = (await p.$(`[data-ik="${k}"] input[data-is="a"][value="unknown"]`)) || (await p.$(`[data-ik="${k}"] input[data-is="fu:aware"][value="unknown"]`)) || (await p.$(`[data-ik="${k}"] input[data-is="a"][value="yes"]`)); if (u) { await u.evaluate(e => e.click()); await p.waitForTimeout(80); } }
    for (const t of await p.$$('textarea[data-itext^="d:"]')) await t.fill('x'.repeat(3500)); await p.waitForTimeout(900); }
  out.bigQueued = await p.evaluate(() => { const k = Object.keys(localStorage).find(x => x.startsWith('inspQ:')); return k ? Object.keys(JSON.parse(localStorage.getItem(k)).pending.decl).length : 0; });
  await p.evaluate(() => { localStorage.removeItem('mockOffline'); window.dispatchEvent(new Event('online')); }); await p.waitForTimeout(3000);
  out.batchLog = await p.evaluate(() => JSON.parse(localStorage.getItem('mockBatchLog') || '[]'));
  d = await db(); out.bigSaved = Object.values((d.property_inspections || []).filter(x => x.property_id === 'PR3').pop().declaration).filter(v => (v.d || '').length >= 3500).length;
  expect(out.bigQueued === 27 && out.bigSaved === 27 && out.batchLog.some(x => x.startsWith('refused:')) && out.batchLog.filter(x => x.startsWith('saved:')).length > 1 && await status() === 'Saved'
    && !(await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('inspQ:')).length)), 'a queue too big for one save is split and halved until every answer is saved: ' + JSON.stringify([out.bigQueued, out.bigSaved, out.batchLog]));
  await p.evaluate(() => localStorage.removeItem('mockMaxBatch'));
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
  expect(out.factCount && out.factCount[1] === '2', 'facts kept as the agreement\'s aren\'t counted: ' + (out.factCount && out.factCount[0]));

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
  // Tim's own page for the declaration says plainly that the vendors check his notes on their own sign-in, and how many are left
  await p.click('#insProp'); await p.waitForTimeout(700); await p.click(`[data-fopen="${vd.id}"]`); await p.waitForTimeout(700);
  out.timWait = (await p.textContent('#fInspWait').catch(() => '')).replace(/\s+/g, ' ');
  const nNotes = Object.values(vd.data.pre).filter(v => v === 'inspection').length;
  expect(out.timWait.includes('The vendors need to check the answers you noted at the inspection from their own sign-in before anyone can sign here. You can\'t confirm your own notes for them.') && out.timWait.includes(`${nNotes} answers are still to check.`) && !(await p.$('[data-fsigner]')),
    'Tim is told the vendors check his notes themselves, with the count, and offered no in-person signing: ' + out.timWait);
  expect(!(await sideways()), 'Tim\'s form page fits 390 px');

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
  // Tim's Unknown (asbestos) is a question for Jane to answer: nothing chosen for her, and no "This is right" to tick
  out.askBadge = await p.textContent('[data-q="asbestos"] .insp-badge');
  expect(/^Tim noted this as Unknown at the inspection on .*2026\. Please answer it from what you know$/.test(out.askBadge) && !(await p.$('[data-q="asbestos"] input:checked')) && !(await p.$('[data-q="asbestos"] .iconfirm')),
    'an Unknown note asks the vendor to answer, with nothing chosen and nothing to tick: ' + out.askBadge);
  await p.click('#next'); await p.waitForTimeout(300); out.askErr = await errText();
  expect(/Please answer each question Tim couldn't answer at the inspection/.test(out.askErr), 'Continue asks for an answer to it: ' + out.askErr);
  await p.$$eval('.vdq', cs => cs.forEach(c => { if (!c.querySelector('input:checked') && c.querySelector('input[value="no"]') && !c.querySelector('.insp-ask')) c.querySelector('input[value="no"]').checked = true; }));
  for (const k of ['faults', 'reno']) { const v = await p.inputValue(`[data-qd="${k}"]`); if (!v) await p.fill(`[data-qd="${k}"]`, 'None known'); }
  await p.click('[data-q="asbestos"] input[value="unknown"] + .mark');   // Jane doesn't know either: Unknown is her own answer
  await p.click('#next'); await p.waitForTimeout(300); out.vErr = await errText();
  expect(/Please check each answer Tim noted/.test(out.vErr), 'Continue needs each of Tim\'s notes checked: ' + out.vErr);
  await p.click('[data-q="pegs"] input[value="unknown"] + .mark'); await p.waitForTimeout(100);
  expect(await p.$eval('[data-qc="pegs"]', e => e.checked), 'changing an answer counts as checking it');
  for (const k of out.badges.filter(k => k !== 'pegs')) await p.click(await p.$(`[data-q="${k}"] .insp-ask`) ? `[data-q="${k}"] input[value="unknown"] + .mark` : `[data-q="${k}"] .iconfirm`);
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
  expect(vd.data.checked.pegs.changed === true && vd.data.checked.dux.changed === false && vd.data.noted.pegs.a === 'yes', 'pegs was changed from Tim\'s note (Yes to Unknown); dux was left as he noted it: ' + JSON.stringify([vd.data.checked.pegs, vd.data.checked.dux]));
  // Rob, before signing: one owner's check is enough, and he sees which answers came from Tim and who checked them
  await as('v-rob', 'rob@example.com');
  await p.click('[data-form="vendor_declaration"]'); await p.waitForTimeout(600);
  out.robSees = (await p.textContent('main')).replace(/\s+/g, ' ');
  expect(/Noted by Timothy McGuire at the inspection on [^;]*2026; checked by Jane Mary Smith\./.test(out.robSees), 'Rob sees Tim\'s notes and who checked them');
  expect(/Unknown\.? ?Timothy McGuire noted Yes at the inspection on [^;]*2026; changed by Jane Mary Smith\./.test(out.robSees) && !/boundary pegs\?Unknown\.? ?Noted by/.test(out.robSees), 'and the one Jane changed says what Tim noted and that Jane changed it: ' + (out.robSees.match(/boundary pegs\?.{0,140}/) || [''])[0]);
  expect(/Tenancy ?Is the property tenanted, or will it be before settlement\? ?No\.? ?Noted by Timothy McGuire at the inspection on [^;]*; checked by Jane Mary Smith\./.test(out.robSees), 'including the tenancy Tim noted: ' + (out.robSees.match(/Tenancy.{0,160}/) || [''])[0]);
  // Rob goes back a step and carries on: nothing he didn't change is sent, so Jane's checks and answers stay hers
  await p.click('#back'); await p.waitForTimeout(400);
  expect(await p.isVisible('[data-q="water"] .insp-checked'), 'the question shows who checked it: ' + await p.textContent('[data-q="water"]').catch(() => ''));
  await p.click('#next'); await p.waitForTimeout(500);
  out.robSent = await p.evaluate(() => JSON.parse(localStorage.getItem('lastVendorSave') || '{}'));
  expect(!Object.keys(out.robSent.checked || {}).length && !Object.keys(out.robSent.answers || {}).length && !('tenanted' in out.robSent), 'an unchanged page sends no ticks, answers or tenancy: ' + JSON.stringify(out.robSent));
  d = await db(); expect(d.property_forms.find(f => f.id === vd.id).data.checked.water.name === 'Jane Mary Smith', 'Jane\'s check stands');
  // Jane confirmed Tim's "Yes" for town water; Rob changes it to No: Rob is now the one who dealt with it, as a change
  await p.click('#back'); await p.waitForTimeout(400);
  await p.click('[data-q="water"] input[value="no"] + .mark'); await p.waitForTimeout(100); await p.click('#next'); await p.waitForTimeout(500);
  d = await db(); out.robWater = d.property_forms.find(f => f.id === vd.id).data.checked.water;
  expect(d.property_forms.find(f => f.id === vd.id).data.answers.water.a === 'no' && out.robWater.name === 'Robert Smith' && out.robWater.by === 'P2' && out.robWater.changed === true, 'Rob\'s change replaces Jane as the checker, marked changed: ' + JSON.stringify(out.robWater));
  await p.click('#back'); await p.waitForTimeout(400);
  out.robBadge = (await p.textContent('[data-q="water"] .insp-badge')).replace(/\s+/g, ' ');
  expect(/^Timothy McGuire noted Yes at the inspection on [^;]*2026; changed by Robert Smith\.$/.test(out.robBadge), 'on screen too: ' + out.robBadge);
  await p.click('#next'); await p.waitForTimeout(400);
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
  const snapDoc = JSON.stringify((sig || {}).snapshot && sig.snapshot.doc || {});
  expect(/Timothy McGuire noted Yes at the inspection on [^;]*; changed by Robert Smith\./.test(snapDoc) && /Noted by Timothy McGuire at the inspection on [^;]*; checked by Jane Mary Smith\./.test(snapDoc) && !/Tim McGuire (at|noted)|by Tim McGuire/.test(snapDoc),
    'the signed snapshot says Timothy McGuire, with who checked and who changed: ' + (snapDoc.match(/town water supply.{0,140}/) || [''])[0]);
  // Rob, after Jane has signed: the locked declaration shows Tim's notes and who checked them
  await as('v-rob', 'rob@example.com'); await p.click('[data-form="vendor_declaration"]'); await p.waitForTimeout(600);
  out.robLocked = (await p.textContent('main')).replace(/\s+/g, ' ');
  expect(/Check and sign the Vendor Declaration/.test(out.robLocked) && /Noted by Timothy McGuire at the inspection on [^;]*; checked by Jane Mary Smith\./.test(out.robLocked)
    && /Timothy McGuire noted Yes at the inspection on [^;]*; changed by Robert Smith\./.test(out.robLocked), 'the locked view shows the marker, who checked, and who changed');
  await as(...TIM);
  const late = await p.evaluate(async id => { const c = window.supabase.createClient(); const r = await c.rpc('agent_inspection_send', { iid: id }); return r.error && r.error.message; }, i.id);
  expect(/has been signed, so the inspection can't change it/.test(late || ''), 'a signed declaration can\'t be changed by the inspection: ' + late);
  await p.click('#navDash'); await p.waitForTimeout(500); await p.click('tr[data-prop]:has-text("9 Test Road")'); await p.waitForTimeout(600);
  await p.click('#inspTile [data-inspopen]'); await p.waitForTimeout(600); await p.click('#insGoFinish'); await p.waitForTimeout(800);
  out.signedMsg = await p.textContent('#insDecl'); expect(/has been signed, so your disclosures check can't change it/.test(out.signedMsg) && !(await p.$('#insSend')), 'the finish screen says so and offers no send');
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
  // Sam alone: changing Tim's note is recorded as a change by Sam; changing it back (same answer, keys in another order) is a check
  out.samChk = await p.evaluate(async id => { const c = window.supabase.createClient(), get = () => JSON.parse(localStorage.getItem('mockdb')).property_forms.find(x => x.id === id).data;
    const noted = get().noted.water; await c.rpc('vendor_form_save', { f: id, patch: { answers: { water: { a: 'no', d: 'Tank' } } } }); const one = get().checked.water;
    await c.rpc('vendor_form_save', { f: id, patch: { answers: { water: { d: noted.d || '', a: noted.a } } } }); const two = get().checked.water;
    await c.rpc('vendor_form_save', { f: id, patch: { checked: { water: true } } }); const three = get().checked.water; return [noted, one, two, three]; }, sv.id);
  expect(out.samChk[1].name === 'Sam Lee' && out.samChk[1].changed === true && out.samChk[2].name === 'Sam Lee' && out.samChk[2].changed === false && out.samChk[3].changed === false && out.samChk[3].at === out.samChk[2].at,
    'a single vendor: change is recorded as changed, changing back as a check, a tick after that changes nothing: ' + JSON.stringify(out.samChk));

  // 17. no em dashes on Tim's screens; dark mode at 390 px
  await as(...TIM); expect(await p.textContent('main h1') === 'Disclosures check finished', 'Tim lands back where he left off'); await p.click('#navHome'); await p.waitForTimeout(300); await p.click('#homeInspect'); await p.waitForTimeout(400);
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
  // the signal returns and a save is on its way (slowly) when he signs out: when it answers, nothing is written back to the phone
  await p.evaluate(() => { localStorage.removeItem('mockOffline'); localStorage.setItem('mockSaveDelay', '1500'); });
  await tap('d:pipes', 'yes');
  p.once('dialog', dg => dg.accept());
  await p.click('#signOut'); await p.waitForTimeout(2500);
  out.afterSignOut = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('insp')));
  await p.evaluate(() => { localStorage.removeItem('mockOffline'); localStorage.removeItem('mockSaveDelay'); }); await go();
  expect(!out.afterSignOut.length && /Your agency agreement/.test(await p.textContent('main h1')), 'signed out, and nothing of the inspection is left on the phone: ' + out.afterSignOut);

  // 19. Tim's on-site report (18 November 2026): questions asked once, follow-ups from each question's own wording, the right
  //     issue on each question, Unknown sent to the vendors to answer. A listed property (3 Kiln Street, Kim Brown).
  await setDb(`d => { const t='2026-11-12T00:00:00Z'; d.properties.push({ id:'PR9', address:'3 Kiln Street, Opoho', ownership:{}, description:{}, disclosures:{}, stage:'signed', stage_at:t, created_at:t, updated_at:t });
    d.agreements.push({ id:'A9', ref:'MRE-2026-1009', address:'3 Kiln Street, Opoho', property_id:'PR9', status:'signed', config:{}, answers:{}, legal:{ choice:'have' }, signed_at:t, agreement_version:'v3.15-26102026', created_at:t });
    d.agreement_people.push({ id:'P9', agreement_id:'A9', position:1, legal_name:'Kim Brown', pref_name:'Kim', email:'kim@example.com', phone:'', user_id:'v-kim', signed_at:t }); }`);
  await as(...TIM); await p.click('#navHome').catch(() => {}); await p.waitForTimeout(300);
  await p.click('#homeInspect'); await p.waitForTimeout(400); await p.fill('#insAddr', '3 Kiln'); await p.waitForTimeout(200);
  await p.click('[data-insp-prop="PR9"]'); await p.waitForTimeout(700);
  const tapn = async (name, v) => { await p.click(`input[name="${name}"][value="${v}"] + span`); await p.waitForTimeout(300); };
  const k9 = async () => { const r = await insp('3 Kiln Street, Opoho'); return { decl: r.i.declaration, facts: r.i.facts, pr: r.pr }; };
  const FT = new Function('return ' + fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8').match(/const FORM_TEXT = (\{[\s\S]*?\n  \});/)[1])();
  const VDQ = Object.fromEntries(FT.VD_SECTIONS.flatMap(x => x[1]).map(x => [x.k, x.q]));

  // 19a. every declaration question once, its text exactly FORM_TEXT's for its key; no fact asked twice
  const shown = await p.evaluate(async () => { const n = []; for (const b of [...document.querySelectorAll('[data-isecn]')]) { b.click(); await new Promise(r => setTimeout(r, 150));
    document.querySelectorAll('.vdq-i').forEach(c => n.push([c.dataset.ik.slice(2), c.querySelector('h3').textContent])); n.push(...[...document.querySelectorAll('[data-ik^="f:"]')].map(c => ['fact', c.dataset.ik])); } return n; });
  const dq = shown.filter(x => x[0] !== 'fact'), facts9 = shown.filter(x => x[0] === 'fact').map(x => x[1]);
  out.textMismatch = dq.filter(([k, q]) => VDQ[k] !== q).map(x => x[0]);
  expect(dq.length === 27 && new Set(dq.map(x => x[0])).size === 27 && Object.keys(VDQ).every(k => dq.some(x => x[0] === k)) && !out.textMismatch.length, 'each of the 27 questions once, with FORM_TEXT\'s text for its key: ' + dq.length + ' ' + out.textMismatch);
  expect(!['f:meth', 'f:wt', 'f:work', 'f:hazards', 'f:hazOther', 'f:wtDetail', 'f:workDetail', 'f:methDetail'].some(f => facts9.includes(f)), 'facts asked inside a declaration question are not asked again: ' + facts9);
  expect(!(await p.$('[data-iuse]')), 'no "Use my answer above"');

  // 19b. wood burner: Yes asks the question's own follow-ups; the certificate's availability only once it exists; No shows nothing more
  await tab('Inside');
  expect(!(await p.$('[data-ik="d:burner"] .ifu')) && !(await p.$('[data-ik="d:burner"] textarea')), 'nothing more before an answer');
  await tapn('id_burner', 'yes');
  out.burnerQs = await p.$$eval('[data-ik="d:burner"] .ifq', e => e.map(x => x.textContent));
  expect(out.burnerQs.join('|') === 'Does it have a Code Compliance Certificate?', 'Yes asks about the certificate: ' + out.burnerQs);
  expect(await p.$$eval('[data-ik="d:burner"] [data-ifu="ccc"] input', e => e.map(x => x.value).join()) === 'yes,no,unknown', 'certificate: Yes / No / Unknown');
  await tapn('idf_burner_ccc', 'no'); expect(!(await p.$('[data-ik="d:burner"] [data-ifu="avail"]')), 'no certificate: availability isn\'t asked');
  await tapn('idf_burner_ccc', 'yes');
  expect(await p.$$eval('[data-ik="d:burner"] [data-ifu="avail"] input', e => e.map(x => x.value).join()) === 'yes,no', 'a certificate: is it available, Yes / No');
  await tapn('idf_burner_avail', 'no');
  out.burnerLabel = await p.textContent('[data-ik="d:burner"] label[for="idd_burner"]');
  expect(/^What kind of fire, and where\?/.test(out.burnerLabel) && !/Details \(optional\)/.test(out.burnerLabel), 'a details prompt for this question: ' + out.burnerLabel);
  await typeIn('[data-itext="d:burner"]', 'Wood burner in the lounge');
  let r9 = await k9();
  expect(isEq(r9.decl.burner, { a: 'yes', d: 'Code Compliance Certificate: yes. Certificate available: no. Wood burner in the lounge' }), 'the follow-ups are written into the details as a readable sentence: ' + JSON.stringify(r9.decl.burner));
  expect(!(await sideways()), 'the burner question fits 390 px');
  await (await p.$('[data-ik="d:burner"]')).screenshot({ path: path.join(__dirname, 'out', 'insp_burner.png') });
  await p.reload(); await p.waitForTimeout(900); if ((await p.textContent('main h1')) !== 'Inside') await tab('Inside');
  expect(await p.$eval('input[name="idf_burner_ccc"][value="yes"]', e => e.checked) && await p.$eval('input[name="idf_burner_avail"][value="no"]', e => e.checked) && (await p.inputValue('[data-itext="d:burner"]')) === 'Wood burner in the lounge', 'read back into the follow-ups after a reload');
  await tapn('id_burner', 'no');
  expect(!(await p.$('[data-ik="d:burner"] .ifu')) && !(await p.$('[data-ik="d:burner"] textarea')), 'No: nothing more shows');
  r9 = await k9(); expect(isEq(r9.decl.burner, { a: 'no', d: '' }), 'and the details are not kept with No: ' + JSON.stringify(r9.decl.burner));
  await tapn('id_burner', 'yes'); await tapn('idf_burner_ccc', 'yes'); await tapn('idf_burner_avail', 'no');
  // the other questions whose wording asks more on Yes ("If 'Yes', ...", "If so, ...") get their follow-ups too
  out.ifYes = Object.entries(VDQ).filter(([, q]) => /If 'Yes'|If so/.test(q)).map(x => x[0]);
  for (const k of out.ifYes.filter(k => k !== 'burner')) { const sec = { hai: 'Consents', lim: 'Consents', reports: 'Consents' }[k]; await tab(sec); await tapn('id_' + k, 'yes');
    expect((await p.$$(`[data-ik="d:${k}"] .ifu`)).length >= 1, 'follow-ups for ' + k); await p.click(`[data-iclear="d:${k}"]`); await p.waitForTimeout(250); }
  expect(out.ifYes.sort().join() === 'burner,hai,lim,reports', 'the questions with an "If Yes" part: ' + out.ifYes);
  await tapn('id_lim', 'yes'); await typeIn('#idf_lim_when', 'March 2025.'); await tapn('idf_lim_avail', 'yes');
  r9 = await k9(); expect(r9.decl.lim.d === 'Obtained: March 2025. Available for review: yes', 'LIM follow-ups: ' + r9.decl.lim.d);
  // a details box only where the answer asks for one: town water Yes has none, No asks what it uses instead
  await tab('Services'); await tapn('id_water', 'yes'); expect(!(await p.$('[data-ik="d:water"] textarea')), 'town water Yes: no details box');
  await tapn('id_water', 'no'); out.waterNo = await p.textContent('[data-ik="d:water"] label.f');
  expect(/What does it use instead\?.*the vendors are asked for this/.test(out.waterNo), 'No: a specific prompt, marked as expected: ' + out.waterNo);
  await tapn('id_water', 'yes');

  // 19c. methamphetamine: asked once, with its two parts. "Not that they know of" fills the fact and never says "not tested"
  await tab('Consents');
  out.methCards = await p.$$eval('.iq h3', e => e.filter(x => /methamphetamine/i.test(x.textContent)).length);
  expect(out.methCards === 1 && !(await p.$('[data-ik="d:meth"] input[data-is="a"]')), 'one methamphetamine question, no plain Yes / No: ' + out.methCards);
  await tapn('idf_meth_aware', 'no');
  r9 = await k9();
  expect(r9.decl.meth && !r9.decl.meth.a && r9.decl.meth.d === 'Known or suspected contamination: not that they know of' && !/test/i.test(r9.decl.meth.d) && r9.pr.disclosures.meth === 'no',
    'fills the fact (Not that they know of) and the declaration note, with no answer and nothing about testing: ' + JSON.stringify([r9.decl.meth, r9.pr.disclosures.meth]));
  await (await p.$('[data-ik="d:meth"]')).screenshot({ path: path.join(__dirname, 'out', 'insp_meth.png') });
  await tapn('idf_meth_tested', 'no'); r9 = await k9();
  expect(isEq(r9.decl.meth, { a: 'no', d: 'Known or suspected contamination: not that they know of. Tested: no' }), 'No only when both parts are No: ' + JSON.stringify(r9.decl.meth));
  await tapn('idf_meth_tested', 'yes'); await typeIn('[data-itext="d:meth"]', 'Tested 2024, clear'); r9 = await k9();
  expect(r9.decl.meth.a === 'yes' && r9.pr.disclosures.meth === 'no' && !r9.pr.disclosures.methDetail, 'tested: the answer is Yes, the fact stays "not that they know of": ' + JSON.stringify(r9.decl.meth));
  await tapn('idf_meth_aware', 'yes'); r9 = await k9();
  expect(r9.pr.disclosures.meth === 'yes' && r9.pr.disclosures.methDetail === 'Tested 2024, clear' && /^Known or suspected contamination: yes\. Tested: yes\. Tested 2024, clear$/.test(r9.decl.meth.d), 'page 1\'s detail gets the details text only, the note the full sentence: ' + JSON.stringify([r9.pr.disclosures.methDetail, r9.decl.meth.d]));
  await tapn('idf_meth_aware', 'unknown'); await p.click('[data-ik="d:meth"] input[name="idf_meth_tested"][value="yes"] + span').catch(() => {}); await p.waitForTimeout(200);
  await p.click('[data-iclear="d:meth"]'); await p.waitForTimeout(300); await tapn('idf_meth_aware', 'unknown');
  r9 = await k9(); expect(r9.decl.meth.a === 'unknown' && !r9.pr.disclosures.meth && await p.isVisible('[data-ik="d:meth"] .ihint'), 'Unknown: no fact, and Tim is told the vendors answer it: ' + JSON.stringify([r9.decl.meth, r9.pr.disclosures]));

  // 19d. the other questions asked once: weathertightness, renovations, hazards; each answer fills the fact too
  await tab('Structure'); await tapn('id_wt', 'yes'); await typeIn('[data-itext="d:wt"]', 'Old leak at the back door, fixed 2023');
  await tab('Consents'); await tapn('id_reno', 'no'); expect(await p.isVisible('[data-iclear="d:reno"]'), 'the renovations question has a Clear button');
  await tab('Outside'); await tapn('id_hazard', 'yes'); await p.click('[data-ik="d:hazard"] input[value="Dog or other pets"] + span'); await p.waitForTimeout(300); await typeIn('#iho_hazard', 'Loose step at the back');
  r9 = await k9(); const D9 = r9.pr.disclosures;
  expect(r9.decl.wt.a === 'yes' && r9.decl.wt.d === 'Old leak at the back door, fixed 2023' && D9.wt === 'yes' && D9.wtDetail === 'Old leak at the back door, fixed 2023', 'weathertightness fills both: ' + JSON.stringify([r9.decl.wt, D9.wt]));
  expect(isEq(r9.decl.reno, { d: 'None known' }) && D9.work === 'no', 'renovations: None known fills both: ' + JSON.stringify([r9.decl.reno, D9.work]));
  expect(r9.decl.hazard.a === 'yes' && r9.decl.hazard.d === 'Dog or other pets. Loose step at the back' && isEq(D9.hazards, ['Dog or other pets']) && D9.hazOther === 'Loose step at the back', 'hazards fill both: ' + JSON.stringify([r9.decl.hazard, D9.hazards]));
  await tapn('id_hazard', 'no'); r9 = await k9();
  expect(isEq(r9.decl.hazard, { a: 'no', d: '' }) && !(r9.pr.disclosures.hazards || []).length && !r9.pr.disclosures.hazOther, 'No hazards takes the chips back off the file');
  // only partly the same question: kept apart, the link explained, and copying offered (never filled in for him)
  await tab('Inside'); await typeIn('[data-itext="f:pHeat"]', 'Heat pump, ceiling insulation');
  out.copyIns = await p.textContent('[data-icopy="insulation"]').catch(() => '');
  expect(out.copyIns === 'Copy my heating and insulation note: Heat pump, ceiling insulation' && /goes on the agreement/.test(await p.textContent('[data-ik="d:insulation"] .ilink')), 'insulation: the whole heating note offered, never split: ' + out.copyIns);
  r9 = await k9(); expect(!r9.decl.insulation, 'not filled in until he copies it');
  await p.click('[data-icopy="insulation"]'); await p.waitForTimeout(300); r9 = await k9(); expect(isEq(r9.decl.insulation, { d: 'Heat pump, ceiling insulation' }) && (await p.inputValue('[data-itext="d:insulation"]')) === 'Heat pump, ceiling insulation', 'copied whole, for Tim to edit');
  expect(/don't work/.test(await p.textContent('[data-ik="d:chattels"] .ilink')), 'chattels not working is told apart from what stays');

  // 19e. derived: the 1995 to 2004 question from the year built, shown as answered with the reason, and Tim can change it
  await tab('Structure'); await typeIn('[data-itext="f:pYear"]', '1999');
  r9 = await k9(); out.eraHint = await p.textContent('[data-ik="d:era"] .iderived').catch(() => '');
  expect(isEq(r9.decl.era, { a: 'yes', d: 'Built about 1999' }) && await p.$eval('[data-ik="d:era"] input[value="yes"]', e => e.checked) && /Answered from the year built \(about 1999\)/.test(out.eraHint), 'answered Yes from the year built: ' + JSON.stringify(r9.decl.era) + ' ' + out.eraHint);
  await typeIn('[data-itext="f:pYear"]', '1970'); r9 = await k9(); out.eraOut = await p.textContent('[data-ik="d:era"]');
  expect(!r9.decl.era && /outside 1995 to 2004\. Answer No unless an addition/.test(out.eraOut), 'outside the period: not answered for him, with a hint: ' + JSON.stringify(r9.decl.era));
  await typeIn('[data-itext="f:pYear"]', '2001'); await tapn('id_era', 'no'); await typeIn('[data-itext="f:pYear"]', '2002');
  r9 = await k9(); expect(r9.decl.era.a === 'no' && /year built \(about 2002\) is in this period/.test(await p.textContent('[data-ik="d:era"]')), 'Tim\'s own answer is kept, with a warning: ' + JSON.stringify(r9.decl.era));
  await tapn('id_era', 'yes');
  out.eraLabel = await p.textContent('[data-ik="d:era"] label.f').catch(() => '');
  expect(!/\(optional\).*\(optional\)/.test(out.eraLabel) && /\(optional\)/.test(out.eraLabel), 'one "(optional)" on the label: ' + out.eraLabel);
  expect(!(await sideways()), 'the walk-round fits 390 px');

  // 19f. dark mode, 390 px, with the follow-ups open
  { const dk2 = await page('dark'); const q2 = dk2.p;
    await q2.goto('https://packages.dunnerstunner.co.nz/onboarding/'); await q2.waitForTimeout(300);
    await q2.evaluate(([s, dbs, o]) => { localStorage.setItem('mocksession', s); localStorage.setItem('mockdb', dbs); localStorage.setItem('inspOpen', o); }, [JSON.stringify({ user: { id: TIM[0], email: TIM[1] } }), JSON.stringify(await db()), (await insp('3 Kiln Street, Opoho')).i.id + ':2']);
    await q2.goto('https://packages.dunnerstunner.co.nz/onboarding/'); await q2.waitForTimeout(900);
    out.dark2 = await q2.evaluate(() => ({ h1: document.querySelector('main h1').textContent, side: document.documentElement.scrollWidth > window.innerWidth, fu: !!document.querySelector('[data-ik="d:burner"] [data-ifu="avail"]'), bg: getComputedStyle(document.body).backgroundColor }));
    expect(out.dark2.h1 === 'Inside' && out.dark2.fu && !out.dark2.side && out.dark2.bg !== 'rgb(247, 245, 242)', 'dark, 390 px, follow-ups shown, no sideways scroll: ' + JSON.stringify(out.dark2));
    await (await q2.$('[data-ik="d:burner"]')).screenshot({ path: path.join(__dirname, 'out', 'insp_burner_dark.png') });
    await dk2.ctx.close(); }

  // 19g. sent to Kim: the composed details read as a sentence on her screens; the Unknown is hers to answer
  await p.click('#insGoFinish'); await p.waitForTimeout(900); await p.click('#insSend'); await p.waitForTimeout(700);
  await as('v-kim', 'kim@example.com'); await p.click('[data-form="vendor_declaration"]'); await p.waitForTimeout(600);
  await pick('input[name="vfFile"][value="ok"]'); await p.click('#next'); await p.waitForTimeout(400);
  expect(await p.$('[data-q="meth"] .insp-ask') && !(await p.$('[data-q="meth"] input:checked')) && !(await p.$('[data-q="meth"] .iconfirm')), 'Kim answers the methamphetamine question Tim noted as Unknown');
  // the reviewer's case: Kim types in the details without choosing, goes Back, then Continue. Nothing is recorded or sent for
  // the note, Tim's note is intact, and what she typed is still on her screen
  const kimBefore = (await db()).property_forms.find(f => f.agreement_id === 'A9').data;
  await p.fill('[data-qd="meth"]', 'Not sure'); await p.click('#back'); await p.waitForTimeout(400); await p.click('#next'); await p.waitForTimeout(500);
  out.backSent = await p.evaluate(() => JSON.parse(localStorage.getItem('lastVendorSave') || '{}'));
  const kimAfter = (await db()).property_forms.find(f => f.agreement_id === 'A9').data;
  expect(!('meth' in (out.backSent.answers || {})) && !('meth' in (out.backSent.checked || {})) && isEq(kimAfter.answers.meth, kimBefore.answers.meth) && !(kimAfter.checked || {}).meth,
    'Back then Continue records nothing for the note and leaves Tim\'s note intact: ' + JSON.stringify([out.backSent.answers, kimAfter.answers.meth, kimAfter.checked]));
  expect((await p.inputValue('[data-qd="meth"]')) === 'Not sure' && !(await p.$('[data-q="meth"] input:checked')), 'her typing is still there, nothing chosen');
  await p.click('#next'); await p.waitForTimeout(300); expect(/Please answer each question Tim couldn't answer/.test(await errText()), 'Continue still asks her to answer it');
  // the server refuses a note sent back with no choice, as a change or as a tick (migration 014, mirrored in the mock)
  out.kimForge = await p.evaluate(async () => { const c = window.supabase.createClient(), f = JSON.parse(localStorage.getItem('mockdb')).property_forms.find(x => x.agreement_id === 'A9');
    const a = await c.rpc('vendor_form_save', { f: f.id, patch: { answers: { meth: { d: 'stripped' } } } });
    return [a.error && a.error.message]; });
  expect(out.kimForge.every(m => /Please answer each question Tim noted at the inspection/.test(m || '')), 'the server refuses an unanswered note: ' + JSON.stringify(out.kimForge));
  await p.$$eval('.vdq', cs => cs.forEach(c => { if (!c.querySelector('input:checked') && c.querySelector('input[value="no"]') && !c.querySelector('.insp-ask')) c.querySelector('input[value="no"]').checked = true; }));
  for (const k of ['faults']) if (!(await p.inputValue(`[data-qd="${k}"]`))) await p.fill(`[data-qd="${k}"]`, 'None known');
  await p.click('[data-q="meth"] input[value="no"] + .mark');
  for (const c of await p.$$('.vdq .iconfirm')) await c.click();
  await p.click('#next'); await p.waitForTimeout(500);
  out.kimBurner = await p.inputValue('[data-qd="burner"]');
  expect(out.kimBurner === 'Code Compliance Certificate: yes. Certificate available: no. Wood burner in the lounge' && await p.$eval('input[name="vq_burner"][value="yes"]', e => e.checked), 'Kim sees the follow-ups as a sentence in the details: ' + out.kimBurner);
  await p.$$eval('.vdq', cs => cs.forEach(c => { if (!c.querySelector('input:checked') && c.querySelector('input[value="no"]')) c.querySelector('input[value="no"]').checked = true; }));
  for (const k of ['internet', 'glazing']) if (!(await p.inputValue(`[data-qd="${k}"]`))) await p.fill(`[data-qd="${k}"]`, 'Fibre');
  for (const c of await p.$$('.vdq .iconfirm')) await c.click();
  await pick('input[name="vfTen"][value="no"]'); await p.click('#next'); await p.waitForTimeout(600);
  out.kimH1 = await p.textContent('main h1');
  out.kimDoc = (await p.textContent('main')).replace(/\s+/g, ' ');
  expect(/Vendor Statement and signing/.test(out.kimH1) && /certificate available\?Yes\. Code Compliance Certificate: yes\. Certificate available: no\. Wood burner in the lounge\. Noted by Timothy McGuire at the inspection on [^;]*; checked by Kim Brown\./.test(out.kimDoc),
    'the declaration row reads cleanly, one full stop before the marker: ' + out.kimH1 + ' ' + (out.kimDoc.match(/certificate available\?.{0,160}/) || [''])[0]);
  d = await db(); const kf = d.property_forms.find(f => f.agreement_id === 'A9');
  expect(kf.data.answers.meth.a === 'no' && kf.data.checked.meth && kf.data.checked.meth.changed === true && kf.data.answers.burner.d === out.kimBurner, 'Kim\'s own methamphetamine answer is recorded as hers; the stored answer keeps its shape: ' + JSON.stringify(kf.data.checked.meth));

  // 20. an inspection noted before these fixes (old shapes, as on the live database): every card opens on what is stored, nothing
  //     is written on open, and where the note and the fact disagree Tim sees both and chooses. A signed agreement lists hazards.
  await setDb(`d => { const t='2026-11-17T00:00:00Z'; d.properties.push({ id:'PR10', address:'7 Old Shape Road, Roslyn', ownership:{}, description:{ pHeat:'Heatpump, Woodfire' }, disclosures:{ wt:'yes', wtDetail:'Leak at the chimney', hazards:['Uneven paths'], meth:'no' }, stage:'signed', stage_at:t, created_at:t, updated_at:t });
    d.agreements.push({ id:'A10', ref:'MRE-2026-1010', address:'7 Old Shape Road, Roslyn', property_id:'PR10', status:'signed', config:{}, answers:{ hazards:['Uneven paths'] }, legal:{ choice:'have' }, signed_at:t, agreement_version:'v3.15-26102026', created_at:t });
    d.agreement_people.push({ id:'P10', agreement_id:'A10', position:1, legal_name:'Lee Old', pref_name:'Lee', email:'lee@example.com', phone:'', user_id:'v-lee', signed_at:t });
    (d.property_inspections ||= []).push({ id:'I10', property_id:'PR10', status:'in_progress', created_by:'hello@timmcguire.co.nz', started_at:t, created_at:t, updated_at:t, finished_at:null, sent_at:null, sent_form_id:null, photos:[], notes:{}, stamps:{}, applied:{}, conflicts:{}, resolved:{},
      facts:{ pHeat:'Heatpump, Woodfire', wt:'yes', wtDetail:'Leak at the chimney', meth:'no', hazards:['Uneven paths', 'Dog or other pets'], hazOther:'the dog' },
      declaration:{ meth:{ a:'no', d:'' }, reno:{ d:'New deck 2020, consented' }, wt:{ a:'no', d:'' }, hazard:{ a:'no', d:'' }, burner:{ a:'unknown', d:'Code Compliance Certificate: yes. Owner unsure where it is' }, lim:{ a:'yes', d:'Obtained: 2019.' } } }); }`);
  await as(...TIM); await p.goto('https://packages.dunnerstunner.co.nz/onboarding/'); await p.waitForTimeout(500);
  await p.evaluate(() => localStorage.setItem('inspOpen', 'I10:4')); await go(); await p.waitForTimeout(400);
  const i10 = async () => (await db()).property_inspections.find(x => x.id === 'I10');
  const before10 = JSON.stringify(await i10());
  // renovations: the stored note's text, not the fact; the old one-answer meth note shown as it was, with a prompt for both parts
  expect(await p.textContent('main h1') === 'Consents and history', 'opened on Consents: ' + await p.textContent('main h1'));
  expect(await p.$eval('[data-ik="d:reno"] input[value="yes"]', e => e.checked) && (await p.inputValue('[data-itext="d:reno"]')) === 'New deck 2020, consented', 'renovations open on the stored note');
  out.legacy = await p.textContent('[data-ik="d:meth"] .ilegacy').catch(() => '');
  expect(/answered this as one question: No\. It stays until you answer both parts/.test(out.legacy) && /page 1 fact says: Not that they know of/.test(out.legacy) && !(await p.$('[data-ik="d:meth"] input:checked')), 'the earlier meth answer is shown, with both parts to answer: ' + out.legacy);
  // follow-up text that doesn't fit the answer, or doesn't come out the same, stays as the details (the reviewer's example)
  expect(await p.$eval('input[name="id_lim"][value="yes"]', e => e.checked) && (await p.inputValue('[data-itext="d:lim"]')) === 'Obtained: 2019.' && !(await p.$eval('#idf_lim_when', e => e.value).catch(() => '')), 'LIM text that isn\'t the follow-ups is kept whole as details');
  await tab('Inside');
  expect(await p.$eval('input[name="id_burner"][value="unknown"]', e => e.checked) && (await p.inputValue('[data-itext="d:burner"]')) === 'Code Compliance Certificate: yes. Owner unsure where it is' && !(await p.$('[data-ik="d:burner"] .ifu')), 'burner Unknown keeps its typed details whole');
  expect(/You mentioned a fire under heating\./.test(await p.textContent('[data-ik="d:burner"]')), 'a fire under heating is pointed out on the burner question, not answered');
  // the note and the fact disagree: both shown, nothing changed until Tim chooses
  await tab('Structure');
  out.wtDiff = (await p.textContent('[data-idiff="wt"]').catch(() => '')).replace(/\s+/g, ' ');
  expect(/Declaration note ?No/.test(out.wtDiff) && /Page 1 fact ?Yes: Leak at the chimney/.test(out.wtDiff), 'weathertightness note and fact both shown: ' + out.wtDiff);
  await tab('Outside');
  out.hazDiff = (await p.textContent('[data-idiff="hazard"]').catch(() => '')).replace(/\s+/g, ' ');
  expect(/Declaration note ?No/.test(out.hazDiff) && /Uneven paths, Dog or other pets\. the dog/.test(out.hazDiff), 'hazards note and fact both shown: ' + out.hazDiff);
  await p.waitForTimeout(600);
  expect(JSON.stringify(await i10()) === before10 && !(await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('inspQ:')).length)), 'opening every section wrote nothing');
  await tab('Structure'); await p.click('[data-idiff="wt"] [data-iside="fact"]'); await p.waitForTimeout(500);
  let x10 = await i10(); expect(isEq(x10.declaration.wt, { a: 'yes', d: 'Leak at the chimney' }) && x10.facts.wt === 'yes' && !(await p.$('[data-idiff="wt"]')), 'Use the fact for both: ' + JSON.stringify(x10.declaration.wt));
  // the meth parts: the earlier No stands until both are answered, then the parts decide
  await tab('Consents'); await tapn('idf_meth_aware', 'no'); x10 = await i10();
  expect(x10.declaration.meth.a === 'no' && await p.isVisible('[data-ik="d:meth"] .ilegacy'), 'one part answered: the earlier No stands: ' + JSON.stringify(x10.declaration.meth));
  await tapn('idf_meth_tested', 'yes'); x10 = await i10();
  expect(x10.declaration.meth.a === 'yes' && !(await p.$('[data-ik="d:meth"] .ilegacy')), 'both parts: the parts decide: ' + JSON.stringify(x10.declaration.meth));
  // hazards: the note says No and the agreement lists hazards. Keeping the note asks Tim, rather than clearing silently
  await tab('Outside'); await p.click('[data-idiff="hazard"] [data-iside="note"]'); await p.waitForTimeout(700);
  x10 = await i10(); out.hazConf = await p.textContent('[data-ik="d:hazard"] [data-iconf="hazards"]').catch(() => '');
  expect(x10.conflicts.hazards && /MRE-2026-1010 says Uneven paths/.test(out.hazConf) && isEq((await db()).properties.find(q => q.id === 'PR10').disclosures.hazards, ['Uneven paths']), 'the agreement\'s hazards are shown as a difference, not cleared: ' + out.hazConf);
  await p.click('#insGoFinish'); await p.waitForTimeout(900);
  out.hazFinish = (await p.textContent('[data-iconflict="hazards"]').catch(() => '')).replace(/\s+/g, ' ');
  expect(/Uneven paths/.test(out.hazFinish) && /You noted ?None/.test(out.hazFinish), 'the finish screen asks Tim to choose: ' + out.hazFinish);
  await p.click('[data-iresolve="hazards"][data-use="inspection"]'); await p.waitForTimeout(800);
  d = await db(); expect(isEq(d.properties.find(q => q.id === 'PR10').disclosures.hazards, []) && isEq(d.agreements.find(g => g.id === 'A10').answers.hazards, ['Uneven paths']), 'Use mine: the property file says none; the signed agreement keeps what was signed');

  // 21. the re-review's three sequences
  // 21a. a card whose note and fact disagree holds the fact back while Tim types: one character in the renovations details
  //      changes neither the page 1 fact nor the unsigned draft agreement, until he chooses
  await setDb(`d => { const t='2026-11-17T00:00:00Z'; d.properties.push({ id:'PR11', address:'1 Old Road, Roslyn', ownership:{}, description:{}, disclosures:{ work:'yes', workDetail:'Bathroom 2010' }, stage:'agreement', stage_at:t, created_at:t, updated_at:t });
    d.agreements.push({ id:'A11', ref:'MRE-2026-1011', address:'1 Old Road, Roslyn', property_id:'PR11', status:'draft', config:{}, answers:{}, legal:{}, agreement_version:'v3.15-26102026', created_at:t });
    d.property_inspections.push({ id:'I11', property_id:'PR11', status:'in_progress', created_by:'hello@timmcguire.co.nz', started_at:t, created_at:t, updated_at:t, finished_at:null, sent_at:null, sent_form_id:null, photos:[], notes:{}, stamps:{}, applied:{}, conflicts:{}, resolved:{},
      facts:{ work:'yes', workDetail:'Bathroom 2010' }, declaration:{ reno:{ d:'Kitchen 2015, bathroom 2010' } } }); }`);
  await p.evaluate(() => localStorage.setItem('inspOpen', 'I11:4')); await go(); await p.waitForTimeout(300);
  expect(await p.isVisible('[data-idiff="reno"]'), 'the renovations note and fact disagree, so both are shown');
  await p.click('[data-itext="d:reno"]'); await p.keyboard.press('End'); await p.keyboard.type('.'); await p.waitForTimeout(1300);
  d = await db(); let x11 = d.property_inspections.find(x => x.id === 'I11');
  expect(x11.declaration.reno.d === 'Kitchen 2015, bathroom 2010.' && x11.facts.workDetail === 'Bathroom 2010' && d.properties.find(q => q.id === 'PR11').disclosures.workDetail === 'Bathroom 2010'
    && !('workDetail' in d.agreements.find(g => g.id === 'A11').answers) && await p.isVisible('[data-idiff="reno"]'), 'typing changes the note only; the fact and the draft agreement wait: ' + JSON.stringify([x11.declaration.reno, await p.isVisible('[data-idiff="reno"]'), x11.facts.workDetail, d.agreements.find(g => g.id === 'A11').answers]));
  await tapn('id_reno', 'yes'); d = await db();
  expect(d.properties.find(q => q.id === 'PR11').disclosures.workDetail === 'Bathroom 2010' && await p.isVisible('[data-idiff="reno"]'), 'tapping an answer waits too, until he chooses');
  await p.click('[data-idiff="reno"] [data-iside="note"]'); await p.waitForTimeout(700); d = await db();
  expect(d.properties.find(q => q.id === 'PR11').disclosures.workDetail === 'Kitchen 2015, bathroom 2010.' && d.agreements.find(g => g.id === 'A11').answers.workDetail === 'Kitchen 2015, bathroom 2010.' && !(await p.$('[data-idiff="reno"]')),
    'Use the note for both: then the fact and the draft follow');

  // 21b. hazards: Unknown sends no facts (nothing flagged, nothing for "Use mine" to clear); a Yes with no extra text doesn't flag
  //      the agreement's text as "None"; only No means none
  await setDb(`d => { d.agreements.find(g => g.id === 'A9').answers = { hazards:['Pool or spa'], hazOther:'Gate code 1234' }; d.properties.find(q => q.id === 'PR9').disclosures.hazards = ['Pool or spa']; d.properties.find(q => q.id === 'PR9').disclosures.hazOther = 'Gate code 1234'; }`);
  await go(); await p.click('#navHome'); await p.waitForTimeout(300); await p.click('#homeInspect'); await p.waitForTimeout(400); await p.fill('#insAddr', '3 Kiln'); await p.waitForTimeout(200); await p.click('[data-insp-prop="PR9"]'); await p.waitForTimeout(800);
  const i9 = async () => (await db()).property_inspections.filter(x => x.property_id === 'PR9').pop();
  if (await p.$('[data-iclear="d:hazard"]')) { await p.click('[data-iclear="d:hazard"]'); await p.waitForTimeout(400); }
  await tapn('id_hazard', 'unknown'); let h9 = await i9();
  expect(!('hazards' in h9.facts) && !('hazOther' in h9.facts) && !h9.conflicts.hazards && !h9.conflicts.hazOther && isEq((await db()).properties.find(q => q.id === 'PR9').disclosures.hazards, ['Pool or spa']), 'Unknown: no hazard facts, no difference, the file untouched: ' + JSON.stringify([h9.id, h9.declaration.hazard, h9.facts, Object.keys(h9.conflicts), (await db()).properties.find(q => q.id === 'PR9').disclosures, await p.textContent('main h1')]));
  await tapn('id_hazard', 'yes'); await p.click('[data-ik="d:hazard"] input[value="Pool or spa"] + span'); await p.waitForTimeout(500); h9 = await i9();
  expect(isEq(h9.facts.hazards, ['Pool or spa']) && !('hazOther' in h9.facts) && !h9.conflicts.hazOther && !h9.conflicts.hazards, 'Yes with ticks and no extra text: nothing flagged against the agreement\'s text: ' + JSON.stringify([h9.facts, Object.keys(h9.conflicts)]));
  await tapn('id_hazard', 'no'); h9 = await i9();
  expect(h9.conflicts.hazards && h9.conflicts.hazOther, 'No: both are a difference with the agreement: ' + JSON.stringify(Object.keys(h9.conflicts)));
  await tapn('id_hazard', 'unknown'); await p.click('#insGoFinish'); await p.waitForTimeout(900);
  expect(!(await p.$('[data-iconflict="hazards"]')), 'Unknown: the finish screen asks nothing about hazards');

  // 21c. a description note Tim made (glazing) emptied on the vendor's Services step, then Back, then Continue from the step
  //      before: the save goes through (the emptied note isn't sent), and Services asks for it again. No stuck page.
  await setDb(`d => { const f=d.property_forms.find(f=>f.agreement_id==='A9'); f.data.answers.glazing={d:'Double glazed'}; f.data.pre.glazing='inspection'; f.data.noted.glazing={d:'Double glazed'}; delete (f.data.checked||{}).glazing; }`);
  await as('v-kim', 'kim@example.com'); await p.click('[data-form="vendor_declaration"]'); await p.waitForTimeout(700);
  for (let n = 0; n < 4 && (await p.textContent('main h1')) !== 'Services and Features'; n++) { await p.click('#back'); await p.waitForTimeout(400); }
  expect(await p.textContent('main h1') === 'Services and Features', 'on Services');
  await p.fill('[data-qd="glazing"]', ''); await p.click('#back'); await p.waitForTimeout(400);
  await p.click('#next'); await p.waitForTimeout(700);
  out.glazSent = await p.evaluate(() => JSON.parse(localStorage.getItem('lastVendorSave') || '{}'));
  out.glazAfter = { h1: await p.textContent('main h1'), toast: await p.textContent('#toast').catch(() => '') };
  d = await db(); const g9 = d.property_forms.find(f => f.agreement_id === 'A9').data;
  expect(out.glazAfter.h1 === 'Services and Features' && !('glazing' in (out.glazSent.answers || {})) && isEq(g9.answers.glazing, { d: 'Double glazed' }) && !(g9.checked || {}).glazing,
    'Continue saves without the emptied note, and moves on; Tim\'s note is intact: ' + JSON.stringify([out.glazAfter, out.glazSent.answers]));
  expect((await p.inputValue('[data-qd="glazing"]')) === '', 'her emptied answer is still on her screen');
  await p.click('#next'); await p.waitForTimeout(500);
  expect(await p.textContent('main h1') === 'Services and Features' && /Please (answer|check) each/.test(await errText()), 'Services asks for it, on the page: ' + await errText());
  await p.fill('[data-qd="glazing"]', 'Single glazed'); await p.click('#next'); await p.waitForTimeout(600);
  d = await db(); const g9b = d.property_forms.find(f => f.agreement_id === 'A9').data;
  expect(/Vendor Statement and signing/.test(await p.textContent('main h1')) && g9b.answers.glazing.d === 'Single glazed' && g9b.checked.glazing && g9b.checked.glazing.changed === true, 'answered: saved and recorded as her change');
  } catch (e) { fail.push('CRASHED: ' + e.message.split('\n').slice(0, 3).join(' | ')); }
  console.log(JSON.stringify(Object.assign(out, { errs: errs.concat(fail) }), null, 1)); await b.close();
})();
function isEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function pendingLeft(c) { const P = (c || {}).pending || {}; return Object.keys(P.facts || {}).length + Object.keys(P.decl || {}).length + Object.keys(P.notes || {}).length; }

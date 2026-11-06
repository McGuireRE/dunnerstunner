// Shared by the translation tests: drives the vendor screens in the mock database through every page and the states
// that show different wording (errors, branches), and hands the text units on screen to visit(label, units).
// The fixture data (names, addresses) is listed in DATA so a test can tell wording from data.
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(__dirname, '..', '..', 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const URL = 'https://packages.dunnerstunner.co.nz/onboarding/';
const PDF = '%PDF-1.4\n% test fixture, not a real guide\n';
const SHA = require('crypto').createHash('sha256').update(PDF).digest('hex');
const GUIDES = {
  agency: { file: 'test-agency-guide.pdf', version: 'TEST-1', sha256: SHA, translations: { mi: { file: 'test-agency-guide-mi.pdf', language: 'te reo Māori' }, sm: { file: 'test-agency-guide-sm.pdf', language: 'Samoan' }, zh: { file: 'test-agency-guide-zh.pdf', language: 'Simplified Chinese' } } },
  sale_purchase: { file: 'test-sale-guide.pdf', version: 'TEST-2', sha256: SHA, translations: { sm: { file: 'test-sale-guide-sm.pdf', language: 'Samoan' } } },
};
const DATA = ['22 Queens Drive, Belleknowes', 'Jane Mary Smith', 'Robert Smith', 'Jane', 'Rob', 'jane@example.com', 'rob@example.com', 'MRE-2026-1001', 'Test Agency Ltd', 'Pat Brown', 'pat@agency.example', 'Auction', '$850,000', 'Premium package', 'Early February', 'Anna Lawyer', 'Law Firm', 'Sam Buyer', 'MRE-2026-1002', 'Lorna Lawyer'];
const T0 = '2026-11-01T00:00:00Z';
const BASE = { agreements: [], agreement_people: [], agreement_events: [], signatures: [], lawyer_links: [], aml_files: [], aml_events: [], email_log: [], cancellation_requests: [], prelistings: [], properties: [], property_people: [], property_documents: [] };
const cfg = (x) => Object.assign({ appr: 'done', ask: '875000', flat: '12000', thr: '250000', pct: '2.95', aml: 'Manual', approach: 'invited' }, x || {});
const answers = (x) => Object.assign({ _step: 0, capacity: 'Owners', titleOk: true, gst: 'no', pType: 'House', pBed: '3', pBath: '1', work: 'no', wt: 'no', meth: 'no', def: 'no', prior: 'none' }, x || {});
const ag = (id, status, extra) => Object.assign({ id, ref: 'MRE-2026-' + (id === 'A1' ? '1001' : '1002'), address: '22 Queens Drive, Belleknowes', property_id: 'PR1', status, config: cfg(), answers: answers(), legal: {}, agreement_version: 'v3.15-26102026', created_at: T0 }, extra || {});
const person = (id, a, pos, name, pref, email, user, signed, verified) => ({ id, agreement_id: a, position: pos, legal_name: name, pref_name: pref, email, phone: '021 555 0100', user_id: user, signed_at: signed || null, id_verified_at: verified || null });
const prop = (stage) => ({ id: 'PR1', address: '22 Queens Drive, Belleknowes', title_ref: 'OT12A/345', owners_on_title: 'Jane Mary Smith, Robert Smith', ownership: { capacity: 'Owners' }, description: { pType: 'House', pYear: '1998', pBed: '3', pBath: '1' }, disclosures: { work: 'no', wt: 'no', meth: 'no', def: 'no' }, stage, stage_at: T0, created_at: T0, updated_at: T0 });
const people = (a, signedBoth) => [person('P1', a, 1, 'Jane Mary Smith', 'Jane', 'jane@example.com', 'v-jane', signedBoth ? '2026-11-02T01:00:00Z' : null), person('P2', a, 2, 'Robert Smith', 'Rob', 'rob@example.com', 'v-rob', signedBoth ? '2026-11-02T02:00:00Z' : null)];
const GA = ['0', '1', '2', '3', '4', '5', '6', '7'], AK = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

async function setup(b, opts) {
  opts = opts || {};
  const ctx = await b.newContext({ viewport: { width: opts.width || 390, height: 844 } });
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await ctx.route('https://packages.dunnerstunner.co.nz/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
  await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/assets/guides/**', r => { const u = r.request().url(); if (opts.noGuides) return r.fulfill({ status: 404, body: '' }); if (u.endsWith('guides.json')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify(opts.guides || GUIDES) }); if (u.endsWith('.pdf')) return r.fulfill({ contentType: 'application/pdf', body: PDF }); return r.fulfill({ status: 404, body: '' }); });
  await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/**', r => { if (r.request().url().includes('/assets/guides/')) return r.fallback(); return r.fulfill({ contentType: 'text/html', body: html }); });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  return { ctx, p, errs };
}
const helpers = (p) => {
  const h = {
    seed: (db) => p.evaluate(db => { localStorage.setItem('mockdb', JSON.stringify(db)); }, Object.assign({}, BASE, db)),
    reset: async () => { await p.goto(URL); await p.evaluate(() => localStorage.clear()); },
    login: async (id, email) => { await p.evaluate(([id, email]) => localStorage.setItem('mocksession', JSON.stringify({ user: { id, email } })), [id, email]); await p.goto(URL); await p.waitForTimeout(700); },
    logout: async () => { await p.evaluate(() => localStorage.removeItem('mocksession')); await p.goto(URL); await p.waitForTimeout(400); },
    db: () => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb'))),
    next: async (w) => { await p.click('#next'); await p.waitForTimeout(w || 450); },
    back: async (w) => { await p.click('#back'); await p.waitForTimeout(w || 350); },
    tick: (sel) => p.$$eval(sel, els => els.forEach(e => { e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); })),
    pick: (sel) => p.$eval(sel, e => { e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); }),
    draw: async (sel) => { const el = await p.$(sel); await el.scrollIntoViewIfNeeded(); const bx = await el.boundingBox(); await p.mouse.move(bx.x + 20, bx.y + 40); await p.mouse.down(); await p.mouse.move(bx.x + 120, bx.y + 90, { steps: 6 }); await p.mouse.move(bx.x + 220, bx.y + 50, { steps: 6 }); await p.mouse.up(); },
    units: () => p.evaluate(() => I18N.units(document.body).map(u => u.key)),
    allUnits: () => p.evaluate(() => I18N.units(document.body, true).map(u => u.key)),
    sideways: () => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
  };
  return h;
};

// walk every vendor screen. visit(label, [keys]) is called at each state.
async function walkVendor(b, visit) {
  const { ctx, p, errs } = await setup(b); const h = helpers(p);
  const V = async (label) => { await p.waitForTimeout(120); visit(label, await h.units(), await h.allUnits()); };
  const clickIf = async (sel) => { const e = await p.$(sel); if (e) { await e.click(); await p.waitForTimeout(300); return true; } return false; };
  await h.reset();
  // 1. signed out
  await h.seed({}); await p.goto(URL); await p.waitForTimeout(500); await V('login');
  await p.fill('#loginEmail', 'nope'); await p.click('#loginBtn'); await p.waitForTimeout(150); await V('login error');
  await p.fill('#loginEmail', 'jane@example.com'); await p.click('#loginBtn'); await p.waitForTimeout(300); await V('login sent');
  await p.evaluate(() => localStorage.setItem('pendingCampaign', '{}')); await p.goto(URL); await p.waitForTimeout(400); await V('login campaign'); await p.evaluate(() => localStorage.removeItem('pendingCampaign'));
  await p.click('#journeyBtn'); await p.waitForSelector('#journey:not([hidden]) svg.jmap'); await V('journey signed out'); await p.click('#jClose');
  // 2. nothing to sign / lists
  await h.seed({}); await h.login('v-nobody', 'nobody@example.com'); await V('nothing to sign');
  await h.seed({ properties: [prop('agreement')], agreements: [ag('A1', 'sent'), ag('A2', 'signed', { ref: 'MRE-2026-1002' })], agreement_people: people('A1').concat(people('A2', true).map(x => Object.assign({}, x, { id: x.id + 'b' }))) });
  await h.login('v-jane', 'jane@example.com'); await V('list of agreements');
  await h.seed({ properties: [prop('questionnaire')], agreements: [ag('A1', 'sent')], agreement_people: people('A1'), prelistings: [{ id: 'L1', property_id: 'PR1', address: '22 Queens Drive, Belleknowes', contact_name: 'Jane Smith', contact_email: 'jane@example.com', status: 'appraisal', appraisal: {}, answers: {}, plan: {}, created_at: T0 }] });
  await h.login('v-jane', 'jane@example.com'); await V('list with appraisal');

  // 3. the agreement, step by step, with the mistakes that show a message
  const flow = async (c, an, label) => {
    await h.seed({ properties: [prop('agreement')], agreements: [ag('A1', 'sent', { config: c, answers: an })], agreement_people: people('A1') });
    await h.login('v-jane', 'jane@example.com'); await V(label + ' step 0');
    await h.next(); await V(label + ' step 1');
    await p.evaluate(() => { const e = document.querySelector('[data-a="titleOk"]'); if (e) e.checked = false; }); await h.next(250); await V(label + ' step 1 error title');
    await p.evaluate(() => { document.querySelector('#people [data-pk=legal_name]').value = ''; }); await h.next(250); await V(label + ' step 1 error name');
    await p.reload(); await p.waitForTimeout(600); await h.next(); // back to step 1 with saved state
    await p.click('#addPerson'); await h.next(250); await V(label + ' step 1 error email');
    await p.reload(); await p.waitForTimeout(600);
  };
  await flow(cfg(), answers(), 'A');
  // step by step from each saved step
  const atStep = async (n, c, an, label, fn) => {
    await h.seed({ properties: [prop('agreement')], agreements: [ag('A1', 'sent', { config: c, answers: Object.assign(answers(), { _step: n }, an || {}) })], agreement_people: people('A1') });
    await h.login('v-jane', 'jane@example.com'); await V(label + ' step ' + n); if (fn) await fn();
  };
  await atStep(1, cfg(), { titleOk: false, capacity: 'Trustee', _from_prelisting: true }, 'trust', async () => { await h.next(250); await V('trust error'); await p.fill('[data-a="entity"]', 'Smith Family Trust'); await h.pick('[data-a="gst"][value="yes"]'); await V('gst yes'); await h.next(250); await V('gst error'); });
  await atStep(2, cfg(), { work: '', wt: '', meth: '', def: '' }, 'property', async () => { await h.next(250); await V('property error'); await h.pick('[data-a="work"][value="yes"]'); await h.pick('[data-a="wt"][value="no"]'); await h.pick('[data-a="meth"][value="no"]'); await h.pick('[data-a="def"][value="no"]'); await V('property work yes'); await h.next(250); await V('property detail error'); });
  await atStep(3, cfg(), {}, 'visits');
  await atStep(4, cfg(), { prior: 'yes', interested: [{ name: 'Sam Buyer', phone: '', email: '', exclude: false }] }, 'sale', async () => { await V('sale prior'); await h.next(250); await V('sale prior error'); await p.fill('[data-pa=agency]', 'Test Agency Ltd'); await h.next(250); await V('sale prior error 2'); });
  await atStep(4, cfg({ appr: 'pending', aboveType: 'none', method: 'Auction', start: '2026-12-01' }), {}, 'sale pending');
  await atStep(4, cfg({ aboveType: 'amount', aboveAmt: '5000', method: 'Auction' }), {}, 'sale amount');
  await atStep(5, cfg({ pkg: 'Custom|0', custom: '3000', schedule: { phases: [] } }), { mkt: 'go' }, 'marketing custom');
  await atStep(5, cfg({ pkg: 'Later|0' }), {}, 'marketing later');
  await atStep(5, cfg({ appr: 'pending', pkg: 'Custom|0', custom: '3000', lim: 0, limOn: false, adminOn: false }), { mkt: 'later' }, 'marketing none');
  await atStep(6, cfg(), { guide: [] }, 'guide', async () => { await h.next(250); await V('guide error'); await p.click('[data-tickall="guide"]'); await V('guide ticked'); });
  await atStep(7, cfg(), { guide: GA, acks: [] }, 'acks', async () => { await h.next(250); await V('acks error legal'); await h.pick('input[name="legal"][value="send"]'); await V('acks send to lawyer'); await p.click('#sendLaw'); await p.waitForTimeout(250); await V('acks lawyer error'); await h.pick('input[name="legal"][value="have"]'); await h.next(250); await V('acks error ticks'); });
  await atStep(7, cfg({ appr: 'pending', lim: '0', limOn: false }), { guide: GA, acks: [] }, 'acks pending');
  // parked for a lawyer
  await h.seed({ properties: [prop('agreement')], agreements: [ag('A1', 'parked', { answers: answers({ _step: 7, guide: GA, acks: AK }), legal: { choice: 'send', status: 'sent', lawyer: 'Anna Lawyer', firm: 'Law Firm' } })], agreement_people: people('A1') });
  await h.login('v-jane', 'jane@example.com'); await V('parked'); await h.next(); await V('after parked (legal sent)');
  await atStep(7, cfg(), { guide: GA, acks: [] }, 'acks after lawyer', null);
  await h.seed({ properties: [prop('agreement')], agreements: [ag('A1', 'sent', { answers: answers({ _step: 8, guide: GA, acks: AK }), legal: { choice: 'have' } })], agreement_people: people('A1') });
  await h.login('v-jane', 'jane@example.com'); await V('identity manual');
  await h.seed({ properties: [prop('agreement')], agreements: [ag('A1', 'sent', { config: cfg({ aml: 'Vouch' }), answers: answers({ _step: 8, guide: GA, acks: AK }), legal: { choice: 'have' } })], agreement_people: people('A1').map((x, i) => i ? x : Object.assign({}, x, { id_verified_at: '2026-11-02T00:00:00Z' })) });
  await h.login('v-jane', 'jane@example.com'); await V('identity vouch');
  const sign = async (c, an, label) => {
    await h.seed({ properties: [prop('agreement')], agreements: [ag('A1', 'sent', { config: c, answers: answers(Object.assign({ _step: 9, guide: GA, acks: AK }, an)), legal: { choice: 'have' } })], agreement_people: people('A1') });
    await h.login('v-jane', 'jane@example.com'); await V(label + ' sign');
    await h.next(250); await V(label + ' sign error');
  };
  await sign(cfg(), { prior: 'yes', priorAgencies: [{ agency: 'Test Agency Ltd', agent: 'Pat Brown', email: 'pat@agency.example', kind: 'Sole agency', dated: '1 Oct 2026' }, { agency: 'Other Agency', agent: '', email: '', kind: 'General agency', dated: '' }] }, 'with notices');
  await h.draw('#sig0'); await h.next(250); await V('sign notice error'); await V('sign saved');
  await sign(cfg({ appr: 'pending', method: 'Auction', pkg: 'Later|0', lim: '', adminOn: false }), { capacity: 'Trustee', entity: 'Smith Family Trust', gst: 'yes', gstNo: '123-456-789', vNotice: '48 hours' }, 'pending');
  await h.seed({ properties: [prop('agreement')], agreements: [ag('A1', 'sent', { answers: answers({ _step: 9, guide: GA, acks: AK }), legal: { choice: 'waive' } })], agreement_people: [Object.assign(people('A1')[0], { signed_at: '2026-11-02T02:00:00Z' }), people('A1')[1]] });
  await h.login('v-rob', 'rob@example.com'); await V('sign second signer'); await h.draw('#sig0'); await h.next(3400); await V('done one waiting');

  // 4. signed: the done page, paperwork, forms, guide, variations, cancellation
  const signedDb = (extra) => Object.assign({
    properties: [prop('signed')], agreements: [ag('A1', 'signed', { signed_at: '2026-11-02T02:00:00Z', cooling_off_until: '2026-11-03T04:00:00Z', answers: answers({ _step: 9, prior: 'yes', priorAgencies: [{ agency: 'Test Agency Ltd', agent: 'Pat Brown', email: 'pat@agency.example', kind: 'Sole agency', dated: '' }] }), legal: { choice: 'have' } })],
    agreement_people: people('A1', true),
    prior_agency_notices: [{ id: 'N1', agreement_id: 'A1', idx: 0, agency: 'Test Agency Ltd', agent_name: 'Pat Brown', email: 'pat@agency.example', kind: 'Sole agency', status: 'to_send' }, { id: 'N2', agreement_id: 'A1', idx: 1, agency: 'Other Agency', status: 'sent', sent_at: '2026-11-03T00:00:00Z', sent_to: 'x@y.example' }],
    agreement_variations: [{ id: 'V1', agreement_id: 'A1', number: 1, status: 'signed', changes: {}, summary: [{ label: 'Review date', from: 'Mon, 1 Feb 2027', to: 'Mon, 1 Mar 2027, the new end of the fixed period' }], reason: 'More time for the spring market', sent_at: '2026-11-04T00:00:00Z', signed_at: '2026-11-05T00:00:00Z' }, { id: 'V2', agreement_id: 'A1', number: 2, status: 'sent', changes: {}, summary: [{ label: 'Commission', from: '', to: '$12,000 flat fee, plus GST' }, { label: 'Other change', from: '', to: 'Photos on Saturday' }], reason: '', sent_at: '2026-11-06T00:00:00Z' }],
    variation_signatures: [], property_forms: [],
  }, extra || {});
  await h.seed(signedDb()); await h.login('v-jane', 'jane@example.com'); await V('variation to sign');
  await p.click('#next'); await p.waitForTimeout(200); await V('variation sign error'); await h.pick('#vOk'); await p.click('#next'); await p.waitForTimeout(250); await V('variation sign error 2');
  await h.back(); await V('done page with guides');
  await clickIf('#spOpen'); await V('before you sell'); await h.next(250); await V('before you sell error'); await h.back();
  await clickIf('[data-form="vendor_declaration"]'); await V('declaration 1'); await h.next(250); await V('declaration 1 error');
  await h.pick('input[name="vfFile"][value="changed"]'); await h.next(250); await V('declaration 1 error changes'); await h.pick('input[name="vfFile"][value="ok"]'); await h.next(500); await V('declaration 2'); await h.next(250); await V('declaration 2 error');
  await p.$$eval('.vdq', cs => cs.forEach(c => { const r = c.querySelector('input[value="yes"]'); if (r) r.checked = true; })); await p.$$eval('.vdq', cs => cs.forEach(c => { const t = c.querySelector('textarea'); if (t && !t.value) t.value = 'Details'; })); await h.next(500); await V('declaration 3'); await h.next(250); await V('declaration 3 error');
  await p.$$eval('.vdq', cs => cs.forEach(c => { const r = c.querySelector('input[value="yes"]'); if (r) r.checked = true; const t = c.querySelector('textarea'); if (t && !t.value) t.value = 'Details'; })); await h.pick('input[name="vfTen"][value="now"]'); await V('declaration 3 tenanted'); await h.next(250); await V('declaration 3 error hh'); await h.pick('input[name="vfHH"][value="yes"]'); await h.next(600); await V('declaration 4');
  await h.next(250); await V('declaration 4 error'); await h.pick('#vfOk'); await h.next(250); await V('declaration 4 error sign');
  await h.seed(signedDb({ property_forms: [{ id: 'F2', property_id: 'PR1', agreement_id: 'A1', kind: 'healthy_homes', form_version: 'HH-2026-11', status: 'ready', data: {}, agent_data: {}, created_at: T0 }, { id: 'F1', property_id: 'PR1', agreement_id: 'A1', kind: 'vendor_declaration', form_version: 'VD-2026-11', status: 'draft', data: { answers: {}, pre: {}, facts: [], complete: true, _step: 3 }, agent_data: {}, created_at: T0 }], form_signatures: [{ id: 'FS1', form_id: 'F1', agreement_id: 'A1', person_id: 'P2', signer_role: 'client', signer_name: 'Robert Smith', snapshot: {}, signed_at: T0 }] }));
  await h.login('v-jane', 'jane@example.com'); await V('done page forms ready');
  await clickIf('[data-form="vendor_declaration"]'); await V('declaration locked'); await h.back();
  await clickIf('[data-form="healthy_homes"]'); await V('healthy homes sign'); await h.back();
  await h.seed(signedDb({ property_forms: [{ id: 'F1', property_id: 'PR1', agreement_id: 'A1', kind: 'vendor_declaration', form_version: 'VD-2026-11', status: 'signed', signed_at: T0, countersigned_at: T0, data: {}, agent_data: {}, created_at: T0 }, { id: 'F2', property_id: 'PR1', agreement_id: 'A1', kind: 'healthy_homes', form_version: 'HH-2026-11', status: 'draft', data: {}, agent_data: {}, created_at: T0 }], form_signatures: [{ id: 'FS1', form_id: 'F1', agreement_id: 'A1', person_id: 'P1', signer_role: 'client', signer_name: 'Jane Mary Smith', snapshot: {}, signed_at: T0 }, { id: 'FS2', form_id: 'F1', agreement_id: 'A1', person_id: 'P2', signer_role: 'client', signer_name: 'Robert Smith', snapshot: {}, signed_at: T0 }], guide_receipts: [{ id: 1, agreement_id: 'A1', person_id: 'P1', guide: 'sale_purchase', version: 'TEST-2', file: 'test-sale-guide.pdf', received_at: T0 }], agreement_variations: [{ id: 'V1', agreement_id: 'A1', number: 1, status: 'sent', changes: {}, summary: [{ label: 'Other change', from: '', to: 'x' }], sent_at: T0 }], variation_signatures: [{ id: 'VS1', variation_id: 'V1', agreement_id: 'A1', person_id: 'P1', signer_role: 'client', snapshot: {}, signed_at: T0 }] }));
  await h.login('v-jane', 'jane@example.com'); await V('done page all signed');
  await h.seed(signedDb({ cancellation_requests: [], agreement_variations: [] })); await h.login('v-jane', 'jane@example.com');
  if (await clickIf('#cancelLink')) { await V('cancel 1'); await h.next(250); await V('cancel 1 error'); await h.tick('#crC1,#crC2'); await p.fill('#crPhone', ''); await h.next(250); await V('cancel 1 error phone'); await p.fill('#crPhone', '021 555 0100'); await p.fill('#crWhy', 'Plans changed'); await h.next(300); await V('cancel 2'); await h.next(250); await V('cancel 2 error'); await h.tick('#crFinal'); await h.next(500); await V('cancel sent'); await h.next(400); await V('done page with cancel request'); }
  await h.seed(signedDb({ agreements: [ag('A1', 'signed', { signed_at: '2026-11-02T02:00:00Z', cooling_off_until: '2026-10-03T04:00:00Z', config: cfg({ approach: 'unsolicited' }), answers: answers({ _step: 9 }), legal: { choice: 'have' } })], agreement_variations: [] })); await h.login('v-jane', 'jane@example.com'); await V('done page after cooling off');
  await clickIf('#cancelLink'); await V('cancel after cooling off');
  await h.seed(signedDb({ agreements: [ag('A1', 'ended', { signed_at: '2026-11-02T02:00:00Z', answers: answers({ _step: 9 }), legal: { choice: 'have' } })], agreement_variations: [] })); await h.login('v-jane', 'jane@example.com'); await V('done page ended');
  await h.seed(signedDb({ agreements: [ag('A1', 'signed', { signed_at: '2026-11-02T02:00:00Z', cooling_off_until: '2026-11-30T04:00:00Z', config: cfg({ appr: 'pending', pkg: 'Later|0' }), answers: answers({ _step: 9 }), legal: { choice: 'have' } })], agreement_variations: [] })); await h.login('v-jane', 'jane@example.com'); await V('done page pending appraisal');
  await p.fill('#fwdN', 'Anna Lawyer'); await p.click('#fwdGo'); await p.waitForTimeout(250); await V('forward error'); await p.fill('#fwdN', 'Anna Lawyer'); await p.fill('#fwdE', 'anna@law.example'); await p.click('#fwdGo'); await p.waitForTimeout(400); await V('forward sent');

  // 5. the pre-listing
  const PL = (st, x) => Object.assign({ id: 'L1', property_id: 'PR1', address: '22 Queens Drive, Belleknowes', contact_name: 'Jane Smith', contact_email: 'jane@example.com', status: st, appraisal: { method: 'Auction', price: '$850,000', start: 'Early February', marketing: 'Premium package', note: 'Lovely home.\nGreat light.', link: 'https://example.com/a.pdf' }, answers: { owners: [{ name: 'Jane Mary Smith', pref: 'Jane', email: 'jane@example.com', mobile: '' }] }, plan: { intro: 'Thanks for your answers.\nHere is what I changed.', pairs: [{ said: 'Worried about price', changed: 'I will set the price after open homes' }] }, created_at: T0 }, x || {});
  await h.seed({ properties: [prop('appraisal')], prelistings: [PL('appraisal')] }); await h.login('v-jane', 'jane@example.com'); await V('appraisal');
  for (let n = 1; n <= 6; n++) { await h.next(350); await V('questionnaire ' + n); }
  await p.evaluate(() => { document.querySelector('[data-o=name]').value = ''; }); await h.next(250); await V('questionnaire error name');
  await p.evaluate(() => { document.querySelector('[data-o=name]').value = 'Jane Mary Smith'; document.querySelector('[data-o=email]').value = 'bad'; }); await h.next(250); await V('questionnaire error email');
  await p.click('#plAddO'); await V('questionnaire add owner');
  await p.evaluate(() => { document.querySelector('[data-o=email]').value = 'jane@example.com'; }); await p.evaluate(() => { [...document.querySelectorAll('.plo')].slice(1).forEach(c => c.remove()); }); await h.next(500); await V('thanks');
  await h.seed({ properties: [prop('plan')], prelistings: [PL('plan')] }); await h.login('v-jane', 'jane@example.com'); await V('plan');
  await p.click('#plAsk'); await p.click('#plQGo'); await p.waitForTimeout(200); await V('plan question error');
  await h.seed({ properties: [prop('plan')], prelistings: [PL('plan', { plan: {}, appraisal: { method: '', price: '' } })] }); await h.login('v-jane', 'jane@example.com'); await V('plan empty');
  await h.seed({ properties: [prop('plan')], prelistings: [PL('question', { question: 'Can we talk about the price?' })] }); await h.login('v-jane', 'jane@example.com'); await V('question sent');
  await h.seed({ properties: [prop('accepted')], prelistings: [PL('accepted', { agreement_id: 'A9' })], agreements: [] }); await h.login('v-jane', 'jane@example.com'); await V('onward');

  // 6. the journey panel, at a few stages
  for (const [stage, label] of [['appraisal', 'appraisal'], ['signed', 'signed'], ['withdrawn', 'withdrawn'], ['settled', 'settled']]) {
    await h.seed({ properties: [prop(stage)], agreements: [ag('A1', stage === 'signed' ? 'signed' : 'sent', { signed_at: stage === 'signed' ? T0 : null })], agreement_people: people('A1', stage === 'signed'), prelistings: [PL('submitted')], property_forms: [{ id: 'F1', property_id: 'PR1', agreement_id: 'A1', kind: 'vendor_declaration', status: 'signed' }] });
    await h.login('v-jane', 'jane@example.com'); await p.click('#journeyBtn'); await p.waitForSelector('#journey:not([hidden]) svg.jmap'); await p.waitForTimeout(200); await V('journey ' + label); await p.click('#jClose');
  }
  await h.seed({ properties: [prop('agreement'), Object.assign(prop('agreement'), { id: 'PR2', address: '9 Other Street' })], agreements: [ag('A1', 'sent')], agreement_people: people('A1'), property_people: [{ id: 'PP1', property_id: 'PR1', position: 1, legal_name: 'Jane Mary Smith', email: 'jane@example.com', user_id: 'v-jane', role: 'owner' }, { id: 'PP2', property_id: 'PR2', position: 1, legal_name: 'Jane Mary Smith', email: 'jane@example.com', user_id: 'v-jane', role: 'owner' }] });
  await h.login('v-jane', 'jane@example.com'); await p.evaluate(() => { document.querySelector('#journeyBtn').click(); }); await p.waitForTimeout(500); await V('journey choose');
  await ctx.close();
  return errs;
}
module.exports = { walkVendor, setup, helpers, DATA, URL, GUIDES, BASE, ag, person, people, prop, cfg, answers, T0, GA, AK, html, cat, mock };

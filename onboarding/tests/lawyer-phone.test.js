// The vendors' lawyer's phone, where the lawyer is recorded on the agency agreement (030, lawyer_links.phone; Tim, 26 November 2026).
// Made-up people and a made-up property, against the mock database. Covers: the vendor's "Send a copy to your lawyer" form with an
// optional phone (a wordy phone refused with plain words; a phone stored with the link; none means none, through the four-argument
// function as before); Tim's own "Forward the signed agreement to a lawyer" on the agreement page with a phone (stored, logged, shown
// in the list of lawyer links); no sideways scroll at 390 px.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(__dirname, '..', '..', 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const errs = [], out = {}; const expect = (c, m) => { if (!c) errs.push(m); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await ctx.route('https://packages.dunnerstunner.co.nz/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
  await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/**', r => r.fulfill({ contentType: 'text/html', body: html }));
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push('page: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  const go = async () => { await p.goto('https://packages.dunnerstunner.co.nz/onboarding/'); await p.waitForTimeout(500); };
  const as = async u => p.evaluate(u => localStorage.setItem('mocksession', JSON.stringify({ user: u })), u);
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb')));
  const side = () => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await go(); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('mockAgents', JSON.stringify(['agent@example.com']));
    const now = new Date().toISOString();
    localStorage.setItem('mockdb', JSON.stringify({ agreements: [{ id: 'A1', ref: 'MRE-2026-1001', address: '14 Example Road, Testville', status: 'countersigned', config: { approach: 'invited', flat: '10000', thr: '250000', pct: '3.5', ask: '900000', appr: 'done' },
      answers: { _step: 9, guide: ['0', '1', '2', '3', '4', '5', '6', '7'], acks: [] }, legal: { choice: 'have' }, signed_at: now, countersigned_at: now, cooling_off_until: new Date(Date.now() + 864e5).toISOString(), agreement_version: 'v3.15-26102026', created_at: now, updated_at: now }],
      agreement_people: [{ id: 'P1', agreement_id: 'A1', position: 1, legal_name: 'Vera Testvendor', pref_name: 'Vee', email: 'vera@vendor.example', phone: '021 000 1111', user_id: 'v-vera', signed_at: now }],
      agreement_events: [], signatures: [], lawyer_links: [], aml_files: [], aml_events: [], email_log: [], cancellation_requests: [] })); });
  // 1. the vendor, after signing: the form has an optional phone
  await as({ id: 'v-vera', email: 'vera@vendor.example' }); await go();
  await p.waitForSelector('#fwdP'); expect(/Phone/.test(await p.textContent('label[for="fwdP"]')) && /optional/.test(await p.textContent('label[for="fwdP"]')), 'the vendor\'s form: Phone (optional)');
  await p.fill('#fwdN', 'Sam Counsel'); await p.fill('#fwdF', 'Counsel and Co'); await p.fill('#fwdE', 'sam@counsel.example'); await p.fill('#fwdP', 'ring Sam');
  await p.click('#fwdGo'); await p.waitForTimeout(200);
  expect(/Check the lawyer's phone number/.test(await p.textContent('#fwdErr')) && !(await db()).lawyer_links.length, 'a phone that isn\'t a number: refused in plain words, nothing sent');
  await p.fill('#fwdP', '03 455 0000'); await p.click('#fwdGo'); await p.waitForSelector('#fwdOk:not([hidden])', { timeout: 10000 });
  let L = (await db()).lawyer_links; out.vendorLink = L[0];
  expect(L.length === 1 && L[0].phone === '03 455 0000' && L[0].email === 'sam@counsel.example' && L[0].lawyer_name === 'Sam Counsel', 'the vendor\'s forward: the phone stored with the lawyer');
  expect(await p.inputValue('#fwdP') === '', 'the form is cleared after sending, the phone too');
  await p.fill('#fwdN', 'Pat Other'); await p.fill('#fwdE', 'pat@other.example'); await p.click('#fwdGo'); await p.waitForTimeout(600);
  L = (await db()).lawyer_links; expect(L.length === 2 && L.find(x => x.email === 'pat@other.example').phone == null, 'no phone: none stored (the four-argument call, as before)');
  expect(!(await side()), 'the vendor\'s form at 390 px: no sideways scroll');
  // 2. Tim, on the agreement page: "Forward the signed agreement to a lawyer", with a phone
  await as({ id: 'agent-x', email: 'agent@example.com' }); await p.setViewportSize({ width: 1024, height: 900 }); await go();
  await p.click('#navDash'); await p.waitForTimeout(500); await p.click('tr[data-ag="A1"]'); await p.waitForTimeout(500); await p.click('[data-agopen="A1"]'); await p.waitForSelector('#afwdP');
  expect(/Sam Counsel/.test(await p.textContent('main')) && (await p.textContent('main')).includes('sam@counsel.example · 03 455 0000'), 'the list of lawyer links shows the phone');
  await p.fill('#afwdN', 'Sam Counsel'); await p.fill('#afwdE', 'sam@counsel.example'); await p.fill('#afwdP', '+64 3 455 0001'); await p.click('#afwdGo'); await p.waitForTimeout(800);
  const d = await db(); L = d.lawyer_links; const mine = L.filter(x => x.sent_by && !/Vera/.test(x.sent_by)).pop() || {};
  out.agentLink = mine;
  expect(mine.phone === '+64 3 455 0001' && mine.email === 'sam@counsel.example', "Tim's forward: the phone stored with the lawyer");
  expect(d.agreement_events.some(e => e.kind === 'forwarded_to_lawyer' && (e.detail || {}).phone === '+64 3 455 0001'), "Tim's forward: the phone in the record of events");
  await p.setViewportSize({ width: 390, height: 900 }); await p.waitForTimeout(200); expect(!(await side()), 'the agreement page at 390 px: no sideways scroll');
  await b.close();
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1)); process.exit(errs.length ? 1 : 0);
})().catch(e => { console.log(JSON.stringify({ errs: errs.concat(['crashed: ' + (e.stack || e.message)]) }, null, 1)); process.exit(1); });

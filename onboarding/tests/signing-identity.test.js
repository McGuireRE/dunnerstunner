// Identity on Tim's device and vendors with no email (Tim, 26 November 2026; migration 029). Against the mock database (which mirrors
// 029's guard_signature_identity), at 390 px on a phone:
//  - the agency agreement in person: a vendor with NO email can sign on Tim's device; Tim is reminded right under the save button to
//    print or hand them their signed copy, and his tick is recorded on the agreement's timeline ("Copy handed over by Tim", with the time);
//  - Tim may sign a vendor without an ID check only after a clear warning right under the button and a second tap; the signed snapshot
//    then says "Signed in person without an identity check" with his name and the time; an empty choice is refused;
//  - the other vendor signs with the photo ID type and Tim's tick (the normal path), with no ID number kept;
//  - by link, an email is still needed: "Send to their phones" refuses a vendor with no email.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(__dirname, '..', '..', 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const AGENT = 'agent-identity@example.com';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await ctx.route('https://packages.dunnerstunner.co.nz/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
  await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/**', r => r.fulfill({ contentType: 'text/html', body: html }));
  const p = await ctx.newPage(); const errs = [], out = {}; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const expect = (c, m) => { if (!c) errs.push(m); };
  const tick = sel => p.$$eval(sel, els => els.forEach(el => { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }));
  const go = async () => { await p.goto('https://packages.dunnerstunner.co.nz/onboarding/'); await p.waitForTimeout(500); };
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb')));
  const noteOf = sel => p.$eval(sel, b => { const n = b.closest('.toolbar') && b.closest('.toolbar').nextElementSibling; return n && n.classList.contains('btn-note') && !n.hidden ? n.textContent : ''; });
  const side = () => p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth);
  const draw = async sel => { const el = await p.$(sel); await el.evaluate(e => e.scrollIntoView({ block: 'center' })); const bx = await el.boundingBox(); await p.mouse.move(bx.x + 20, bx.y + 40); await p.mouse.down(); await p.mouse.move(bx.x + 120, bx.y + 80, { steps: 6 }); await p.mouse.move(bx.x + 220, bx.y + 50, { steps: 6 }); await p.mouse.up(); };
  await go(); await p.evaluate(a => { localStorage.clear(); localStorage.setItem('mockAgents', JSON.stringify([a])); localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'agent-1', email: a } })); }, AGENT); await go();
  // an agreement with two vendors: Margaret has an email, Peter has none
  await p.click('#navDash'); await p.waitForTimeout(500); await p.click('#newAg'); await p.waitForTimeout(300);
  await p.fill('#tAddr', '14 Highgate, Maori Hill, Dunedin'); await p.fill('#t_owners', 'Margaret Anne Smith, Peter Smith');
  await p.fill('#tPeople [data-pk=legal_name]', 'Margaret Anne Smith'); await p.fill('#tPeople [data-pk=email]', 'maggie@example.com');
  await p.click('#tAddP'); await p.fill('#tPeople [data-i="1"] [data-pk=legal_name]', 'Peter Smith');
  await tick('[data-an=titleOk]'); await p.fill('#t_ask', '1150000'); await p.fill('#t_pBed', '5'); await p.fill('#t_pBath', '2');
  for (const k of ['work', 'wt', 'meth', 'def']) await tick(`input[name=t_an_${k}][value=no]`);
  await p.click('#next'); await p.waitForTimeout(400);
  await p.fill('#t_flat', '10000'); await p.fill('#t_pct', '3.5'); await p.click('#next'); await p.waitForTimeout(400);
  await tick('[data-tmulti=guide]'); await tick('[data-tmulti=acks]'); await tick('input[name=tLegal][value=have]');
  const people = (await db()).agreement_people, maggie = people.find(x => /Margaret/.test(x.legal_name)), peter = people.find(x => /Peter/.test(x.legal_name));
  expect(maggie && peter && !peter.email, 'Peter is on the agreement with no email');
  // by link an email is still needed
  await p.click('#tSendPhones'); await p.waitForTimeout(600); out.phonesErr = await p.textContent('.err');
  expect(/Add an email on page 1 for everyone still to sign/.test(out.phonesErr), 'by link an email is still needed: ' + out.phonesErr);
  // Peter, no email, signs on Tim's device: the copy reminder sits right under his save button
  expect(await p.$(`[data-signer="${peter.id}"] [data-copyfor="${peter.id}"]`) && !(await p.$(`[data-signer="${maggie.id}"] [data-copyfor]`)), 'a reminder to hand over the signed copy only for the vendor with no email');
  expect(await p.evaluate(id => { const c = document.querySelector(`[data-signer="${id}"]`), s = c.querySelector('[data-signnow]').closest('.toolbar'), n = c.querySelector('[data-copyfor]'); return !!(s.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING); }, peter.id), 'the reminder is right under the save button');
  await draw('#pad_' + peter.id);
  // an empty ID choice is refused, said under his save button
  await p.click(`[data-signnow="${peter.id}"]`); await p.waitForTimeout(300); out.emptyNote = await noteOf(`[data-signnow="${peter.id}"]`);
  expect(/Choose the photo ID you checked for Peter Smith, or tap Sign without an ID check/.test(out.emptyNote), 'an empty ID choice is refused, said under the button: ' + out.emptyNote);
  // the first tap on "Sign without an ID check" warns, right under it; the second confirms and saves
  await tick(`[data-tcopy="${peter.id}"]`);
  await p.click(`[data-noid="${peter.id}"]`); await p.waitForTimeout(200); out.warn = await noteOf(`[data-noid="${peter.id}"]`);
  expect(/No identification has been checked for Peter Smith\. Finish anyway\?/.test(out.warn) && !(await db()).agreement_people.find(x => x.id === peter.id).signed_at, 'the first tap only warns, right under the button; nothing is signed yet');
  await p.click(`[data-noid="${peter.id}"]`); await p.waitForTimeout(3500);
  let d = await db(); const sp = (d.signatures || []).find(s => s.person_id === peter.id);
  expect(sp && sp.snapshot.id_check && sp.snapshot.id_check.type === 'none' && sp.snapshot.id_check.warned === true && sp.snapshot.id_check.note === 'Signed in person without an identity check' && sp.snapshot.id_check.by === 'Tim McGuire' && sp.snapshot.id_check.at, 'the second tap signs, and the snapshot says plainly "Signed in person without an identity check", by Tim, with the time');
  const ev = (d.agreement_events || []).find(e => e.kind === 'copy_handed_over' && (e.detail || {}).person_id === peter.id);
  expect(ev && ev.detail.note === 'Copy handed over by Tim' && ev.at, 'Tim\'s tick that he handed over the signed copy is on the timeline, with the time');
  // Margaret signs the normal way: the photo ID type and Tim's tick, no number kept
  await p.waitForSelector(`[data-signnow="${maggie.id}"]`); await draw('#pad_' + maggie.id);
  await p.selectOption(`[data-idtype="${maggie.id}"]`, 'nz_driver_licence'); await tick(`[data-idok="${maggie.id}"]`);
  await p.click(`[data-signnow="${maggie.id}"]`); await p.waitForTimeout(3500);
  d = await db(); const sm = (d.signatures || []).find(s => s.person_id === maggie.id);
  expect(sm && sm.snapshot.id_check.type === 'nz_driver_licence' && sm.snapshot.id_check.checked === true && !('number' in sm.snapshot.id_check), 'the other vendor signs with the photo ID type and Tim\'s tick, never a number');
  expect(!(await side()), 'no sideways scroll at 390 px');
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1)); await b.close();
})().catch(e => { console.log(JSON.stringify({ errs: ['crashed: ' + (e.stack || e.message)] })); process.exit(0); });

// Offers phase 1: the "Make an offer" form, against the mock database. Covers Tim switching a property's offer link on (only at a
// stage that takes offers), the link, copy and QR code; the public form with no sign-in (only the address learned from the token,
// 390 px with no sideways scroll, light and dark), the conditions chooser and its overlays (tap and hover; REINZ conditions by
// clause number only; Tim's own wording or "Tim will confirm"; Specified Due Diligence folded away and never ticked), working days
// or a date for each condition with both shown, the one-week gap check and "I need Tim's help with dates", the KiwiSaver deposit
// rule and both KiwiSaver warnings, the lawyer's approval note, as many purchasers as needed, the AI condition helper (a marked
// draft, and failing soft), save and resume on the same device, escaping what a buyer types, the on-screen copy at submit time;
// then Tim's side (Needs you, the Offers tile with flags, the detail view, the gap override with his reason, a correction with the
// original kept, withdrawn with a time, filling in an offer for a buyer), switching off and making a new link (old links stop at
// once), the rate limit, and that a signed-in vendor (and anyone not signed in) can read nothing about offers.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(__dirname, '..', '..', 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const AGENT = 'agent-test@example.com';
(async () => {
  const b = await chromium.launch(); const out = {}; const errs = [];
  const expect = (c, m) => { if (!c) errs.push(m); };
  const mk = async (w, scheme) => {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, colorScheme: scheme, hasTouch: w < 500, isMobile: w < 500 }); ctx.setDefaultTimeout(8000);
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
    await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    await ctx.route('https://packages.dunnerstunner.co.nz/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
    await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    const p = await ctx.newPage(); p.on('pageerror', e => { errs.push('page: ' + e.message); }); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    p.on('dialog', d => d.accept());
    return { ctx, p };
  };
  const BASE = 'https://packages.dunnerstunner.co.nz/onboarding/';
  // wider than the screen? (a phone widens its layout instead of scrolling, so compare with the screen's own width)
  const side = (p, w) => p.evaluate(w => Math.max(document.documentElement.scrollWidth, window.innerWidth) > w, w || 390);
  const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb')));
  const shot = (p, n) => p.screenshot({ path: path.join(__dirname, 'out', `offers_${n}.png`), fullPage: true });
  const now = new Date().toISOString();
  const prop = (id, address, stage) => ({ id, address, title_ref: null, owners_on_title: null, ownership: {}, description: {}, disclosures: {}, found: {}, provenance: {}, stage, stage_at: now, created_at: now, updated_at: now });
  const seed = { agreements: [{ id: 'A1', ref: 'MRE-2026-1001', address: '12 Pine Hill Road, Dunedin', property_id: 'P1', status: 'countersigned', config: {}, answers: {}, legal: {}, created_at: now, updated_at: now, countersigned_at: now }],
    agreement_people: [{ id: 'AP1', agreement_id: 'A1', position: 1, legal_name: 'Vera Vendor', pref_name: '', email: 'vendor@example.com', user_id: 'v-1', signed_at: now }],
    agreement_events: [], signatures: [], lawyer_links: [], aml_files: [], aml_events: [], email_log: [], cancellation_requests: [], prelistings: [], agreement_variations: [], prior_agency_notices: [],
    properties: [prop('P1', '12 Pine Hill Road, Dunedin', 'live'), prop('P2', '3 Early Street, Dunedin', 'appraisal')],
    property_people: [{ id: 'PP1', property_id: 'P1', position: 1, legal_name: 'Vera Vendor', pref_name: '', email: 'vendor@example.com', phone: '021 000 0000', user_id: 'v-1', role: 'owner', source: 'agreement', name_from: 'agreement' }] };
  const asAgent = async p => { await p.goto(BASE); await p.evaluate(([s, a]) => { localStorage.clear(); localStorage.setItem('mockAgents', JSON.stringify([a])); localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'agent-1', email: a } })); localStorage.setItem('mockdb', JSON.stringify(s)); }, [seed, AGENT]); await p.goto(BASE); await p.waitForTimeout(600); };
  const keepDb = async (from, to, extra) => { const d = await db(from); await to.evaluate(([d, e]) => { localStorage.clear(); localStorage.setItem('mockdb', JSON.stringify(d)); Object.entries(e || {}).forEach(([k, v]) => localStorage.setItem(k, v)); }, [d, extra || {}]); };

  process.stderr.write('step 1\n');
  // ── 1. Tim switches the offer form on ──
  const A = await mk(390, 'light'); let p = A.p;
  await asAgent(p); await p.click('#navDash'); await p.waitForTimeout(400); await p.click('tr[data-prop="P2"]'); await p.waitForTimeout(500);
  out.earlyTile = !!(await p.$('#offTile'));
  expect(!out.earlyTile, 'no Offers tile on a property at appraisal');
  await p.click('#navDash'); await p.waitForTimeout(400); await p.click('tr[data-prop="P1"]'); await p.waitForTimeout(500);
  out.tileOff = (await p.textContent('#offState')).trim();
  expect(/is off/.test(out.tileOff) && !(await p.$('#offUrl')), 'off by default, no link shown');
  const r0 = await p.evaluate(() => window.supabase.createClient().rpc('agent_offer_link', { p_property: 'P2', p_action: 'open' }));
  expect(r0.error && /on the market/.test(r0.error.message) && !((await db(p)).offer_links || []).length, 'opening at appraisal is refused, and nothing is made');
  await p.click('#offOn'); await p.waitForTimeout(500);
  let d = await db(p); const link = d.offer_links.find(x => x.property_id === 'P1'); const TOKEN = link.token;
  out.token = { len: TOKEN.length, open: link.open, province: link.province };
  expect(link.open && /^[A-Za-z0-9_-]{43}$/.test(TOKEN) && link.province === 'otago', 'switched on with an unguessable token and Otago holidays');
  out.url = await p.textContent('#offUrl'); expect(out.url.trim() === BASE + '?offer=' + TOKEN, 'the link shown is the form link');
  await p.click('#offCopy'); await p.waitForTimeout(200);
  await p.click('#offQrBtn'); await p.waitForTimeout(200);
  expect(await p.isVisible('#offQr svg'), 'QR code shown'); out.qrMatches = await p.evaluate(u => { const q = window.QR.encode(u); return document.querySelector('#offQr path').getAttribute('d').split('M').length - 1 === q.modules.flat().filter(Boolean).length; }, BASE + '?offer=' + TOKEN);
  expect(out.qrMatches, 'the QR code draws the link');
  expect(!(await side(p)), 'tile at 390 px: no sideways scroll');
  await p.click('#offSetD summary'); await p.fill('#offW_electrical', 'Tim electrical wording: a registered electrician\'s report satisfactory to the purchaser.'); await p.click('#offWSave'); await p.waitForTimeout(300);
  d = await db(p); expect((d.offer_clauses || []).some(c => c.key === 'electrical' && /registered electrician/.test(c.wording)), 'Tim saves his own clause wording');
  const r1 = await p.evaluate(() => window.supabase.createClient().rpc('agent_offer_clause', { p_key: 'finance', p_wording: 'x' }));
  expect(r1.error, 'REINZ clause wording is never stored');
  await p.click('#offChD summary'); await p.fill('#offCh', 'Fixed floor coverings\nBlinds\n\nHeat pump'); await p.click('#offChSave'); await p.waitForTimeout(500);
  d = await db(p); expect(JSON.stringify(d.offer_links.find(x => x.property_id === 'P1').chattels) === JSON.stringify(['Fixed floor coverings', 'Blinds', 'Heat pump']), 'Tim types the chattels list on the property');
  await shot(p, 'tile');

  process.stderr.write('step 2\n');
  // ── 2. a buyer opens the form (no sign-in, 390 px) ──
  const B = await mk(390, 'light'); const q = B.p;
  await q.goto(BASE); await keepDb(p, q); await q.goto(BASE + '?offer=' + TOKEN); await q.waitForTimeout(700);
  out.pubH1 = await q.textContent('h1'); out.pubAddr = (await q.textContent('.of-addr')).trim();
  expect(out.pubH1 === 'Make an offer' && out.pubAddr === '12 Pine Hill Road, Dunedin', 'the form opens with the address filled in');
  const pageText = await q.textContent('body');
  expect(!/Vera|vendor@example/.test(pageText), 'nothing about the owners on the page');
  expect(JSON.parse(await q.evaluate(() => localStorage.getItem('offerCalls'))).join() === 'info', 'the page asked only for info');
  expect(!(await side(q)), 'public form at 390 px: no sideways scroll');
  // the conditions chooser
  out.typical = await q.$$eval('#ofCondsTypical [data-cond]', e => e.map(x => x.dataset.cond));
  expect(out.typical.join() === 'builders,finance,lim,lawyer,electrical,technical', 'typical conditions first');
  expect(!(await q.$eval('#ofOther', e => e.open)) && !(await q.isVisible('[data-cond="sdd"]')), 'other conditions folded away, Specified Due Diligence hidden');
  expect(!(await q.$$eval('[data-cond]', e => e.some(x => x.checked))), 'nothing ticked to start');
  expect(!(await q.$eval('[data-cond="lawyer"]', e => e.checked)), "lawyer's approval unticked by default");
  const ovText = async k => { await q.click(`[data-cinfo="${k}"]`); await q.waitForTimeout(150); const t = await q.textContent('#ofOv'); const box = await q.$eval('#ofOv', e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth }; }); await q.click('#ofOvX'); return { t, box }; };
  let o = await ovText('finance'); out.ovFinance = o.t;
  expect(/clause 9\.1/.test(o.t) && /arranging the lending/.test(o.t) && o.box.l >= 0 && o.box.r <= o.box.w, 'finance overlay: plain summary and clause number, inside the screen');
  o = await ovText('electrical'); expect(/registered electrician's report satisfactory/.test(o.t) && /The wording Tim uses/.test(o.t), "Tim's own wording shown");
  o = await ovText('technical'); expect(/Tim will confirm the exact wording with you/.test(o.t), 'no wording held: Tim will confirm');
  o = await ovText('lawyer'); expect(/talk to a lawyer at any time/.test(o.t) && /legal advice before you sign/.test(o.t), "lawyer's approval overlay: talk to a lawyer");
  expect(await q.isHidden('#ofOv'), 'overlay closes');
  await q.click('#ofOther summary'); await q.waitForTimeout(100);
  o = await ovText('sdd'); expect(/plant or complex tenancies/.test(o.t) && /commercial, lifestyle and farm/.test(o.t) && /Not usually needed for a family home/.test(o.t), 'Specified Due Diligence described for commercial, lifestyle and farms');
  expect(!(await q.$eval('[data-cond="sdd"]', e => e.checked)), 'Specified Due Diligence never ticked for them');
  // chattels, GST, advice prompts, lawyer and contact wording (Tim, 23 November 2026)
  out.chattels = await q.$$eval('.of-chl li', e => e.map(x => x.textContent));
  expect(out.chattels.join() === 'Fixed floor coverings,Blinds,Heat pump' && /full working order at settlement/.test(await q.textContent('.of-chnote')), 'the chattels list Tim typed, with the working-order note');
  await q.click('[data-chadd="add"]'); await q.fill('#ofch_add_0', 'Garden shed'); await q.click('[data-chadd="exclude"]'); await q.fill('#ofch_exclude_0', 'Dining room chandelier');
  await q.click('[data-chadd="exclude"]'); await q.click('[data-chrm="exclude:1"]'); expect((await q.$$('[data-ch^="exclude"]')).length === 1, 'chattel rows can be added and removed');
  expect(!(await q.$eval('#ofGst', e => e.open)) && !(await q.isVisible('#ofGstNo')), 'GST folded away by default');
  await q.click('#ofGst summary'); out.gstText = await q.textContent('#ofGst');
  expect(/unrelated business does not count/.test(out.gstText) && /check with your accountant/.test(out.gstText) && /financial adviser/.test(out.gstText), 'GST: unrelated business does not count, accountant, financial adviser');
  expect(!(await q.isVisible('#ofGstNo')), 'GST details only once they say yes');
  await q.click('input[name="of_gst"][value="yes"] + .mark'); expect(await q.isVisible('#ofGstNo'), 'GST yes: details open'); await q.fill('#ofGstNo', '123-456-789');
  expect(/builder or a technical professional/.test(await q.textContent('#ofSec_conds')), 'advice prompt at the conditions step');
  expect(/only the lawyers' details go on the agreement/i.test(await q.textContent('.of-lawwhy')) && /never go on the agreement/.test(await q.textContent('.of-contactnote')) && /never go on the agreement/.test(await q.textContent('.of-privacy')), 'lawyer asked for, with why; own contact details never on the agreement');
  // the form
  await q.fill('#ofEmail', 'buyer@example.com'); await q.fill('#ofPhone', '021 555 0100');
  await q.click('input[name="of_seen_docs"][value="yes"] + .mark');
  await q.fill('#ofPrice', 'six fifty'); expect(/type the price in numbers/.test(await q.textContent('#ofPriceSay')), 'letters: asked for the full number');
  await q.fill('#ofPrice', '$1.2m'); expect((await q.textContent('#ofPriceSay')) === '$1,200,000: one million, two hundred thousand dollars', '$1.2m read back in figures and words');
  await q.fill('#ofPrice', '650k'); out.priceSay = await q.textContent('#ofPriceSay'); expect(out.priceSay === '$650,000: six hundred and fifty thousand dollars', 'price read back in figures and words: ' + out.priceSay);
  await q.click('label:has([data-cond="finance"]) .mark'); await q.fill('#ofd_finance', '10'); await q.waitForTimeout(100);
  out.finCalc = await q.textContent('[data-ccalc="finance"]'); expect(/^That is \w{3}, \d+ \w+ \d{4}\.$/.test(out.finCalc), 'working days show the date: ' + out.finCalc);
  await q.click('label:has([data-cond="builders"]) .mark');
  expect(/talk to a builder or building inspector/.test(await q.textContent('[data-crow="builders"] .of-advice')), "builder's report: talk to a builder");
  const today = await q.evaluate(() => window.OFFERS.nzToday()); const addWD = (n) => q.evaluate(([t, n]) => window.OFFERS.addWorkingDays(t, n), [today, n]);
  const b12 = await addWD(12); await q.fill('#ofdt_builders', b12); await q.waitForTimeout(100);
  out.bCalc = await q.textContent('[data-ccalc="builders"]'); expect(/^12 working days from today/.test(out.bCalc), 'a date shows its working days: ' + out.bCalc);
  // a date in the Christmas break: said plainly, with the first working day after it
  const xmasYear = +today.slice(0, 4) + (today.slice(5) > '12-20' ? 1 : 0), xmas = `${xmasYear}-12-28`;
  const after = await q.evaluate(d => window.OFFERS.longDate(window.OFFERS.addWorkingDays(d, 1)), xmas);
  await q.fill('#ofdt_builders', xmas); await q.waitForTimeout(100); out.xmasCalc = await q.textContent('[data-ccalc="builders"]');
  expect(/falls in the Christmas break \(24 December to 5 January\), which doesn't count as working days/.test(out.xmasCalc) && out.xmasCalc.includes('The first working day after it is ' + after), 'Christmas break date explained: ' + out.xmasCalc);
  await q.fill('#ofdt_builders', b12); await q.waitForTimeout(100);
  // the dates panel and the one-week gap
  out.dates1 = await q.textContent('#ofDates'); expect(/Settlement/.test(out.dates1) && /15 working days after it goes unconditional/.test(out.dates1) && !(await q.$('[data-prob="gap"]')), 'usual settlement: no gap problem');
  await q.click('input[name="of_settle"][value="date"] + .mark'); const close = await q.evaluate(([d]) => window.OFFERS.addDays(d, 3), [b12]); await q.fill('#ofSetDate', close); await q.waitForTimeout(100);
  expect(await q.isVisible('[data-prob="gap"]'), 'last condition under a week before settlement: asked to change');
  // KiwiSaver: the deposit rule and both warnings
  await q.click('input[name="of_kiwisaver"][value="yes"] + .mark'); await q.waitForTimeout(100);
  out.depYes = await q.textContent('#ofDeposit');
  expect(/lawyer's trust account/.test(out.depYes) && /21\.3/.test(out.depYes) && await q.isVisible('[data-dep="lawyer"]'), "KiwiSaver: the whole deposit to the vendor's lawyer's trust account");
  expect(await q.isVisible('[data-warn="ks_deposit"]') && /21\.1/.test(await q.textContent('[data-warn="ks_deposit"]')), 'KiwiSaver deposit timing warning, citing clause 21.1');
  expect(await q.isVisible('[data-warn="ks_settle"]'), 'KiwiSaver settlement warning when settlement is close');
  await q.click('input[name="of_kiwisaver"][value="no"] + .mark'); await q.waitForTimeout(100);
  out.depNo = await q.textContent('#ofDeposit');
  expect(/Public Trust for NZ Real Estate Trust/.test(out.depNo) && !(await q.$('[data-warn]')), 'no KiwiSaver: NZ Real Estate Trust, no KiwiSaver warnings');
  await q.click('input[name="of_kiwisaver"][value="yes"] + .mark');
  // lawyer's approval note
  await q.click('label:has([data-cond="lawyer"]) .mark'); await q.fill('#ofd_lawyer', '3');
  expect(/Tim recommends you get legal advice before you sign anything/.test(await q.textContent('.of-lawnote')), "lawyer's approval ticked: talk to a lawyer at any time");
  // purchasers: as many as needed
  await q.fill('#ofp0f', 'Aroha Mere'); await q.fill('#ofp0l', 'Smith');
  for (let i = 1; i <= 4; i++) { await q.click('#ofAddP'); await q.fill(`#ofp${i}f`, 'Person ' + i); await q.fill(`#ofp${i}l`, 'Buyer'); }
  await q.click('[data-prm="2"]'); out.people = await q.$$eval('.of-person', e => e.length); expect(out.people === 4, 'five added, one removed: four purchasers (no cap at four)');
  // the custom condition and its helper
  await q.click('label:has([data-cond="custom"]) .mark'); await q.fill('#ofd_custom', '8'); await q.fill('#ofReq', 'I need the heat pump checked and working');
  await q.click('#ofAi'); await q.waitForTimeout(300);
  out.aiWord = await q.inputValue('#ofWord'); out.aiMsg = await q.textContent('#ofAiMsg');
  expect(/heat pump/.test(out.aiWord) && await q.isVisible('#ofAiBadge') && /draft/i.test(out.aiMsg) && /approves the wording/.test(out.aiMsg), 'AI help gives a draft, clearly marked, for Tim to approve');
  d = await q.evaluate(() => JSON.parse(localStorage.getItem('mockdb'))); expect((d.ai_calls || []).some(x => x.purpose === 'offer condition draft' && x.model === 'claude-sonnet-5-5'), 'the helper is logged as a Sonnet call');
  await q.evaluate(() => localStorage.setItem('offerAiMode', 'off')); await q.click('#ofAi'); await q.waitForTimeout(200);
  expect(/isn't available right now/.test(await q.textContent('#ofAiMsg')) && (await q.inputValue('#ofWord')) === out.aiWord, 'helper off: fails soft, their wording kept');
  await q.evaluate(() => localStorage.removeItem('offerAiMode'));
  await q.fill('#ofComments', 'We love it. <img src=x onerror="window.__xss=1"> <b>bold</b>');
  await q.click('input[name="of_related"][value="yes"] + .mark'); await q.click('input[name="of_sign"][value="in_person"] + .mark');
  await q.fill('#ofLFirm', 'Law & Co <script>'); await q.fill('#ofLEmail', 'lawyer@example.com');
  expect(!(await side(q)), 'filled form at 390 px: no sideways scroll');
  await shot(q, 'form390');
  // save and come back later on the same device
  await q.reload(); await q.waitForTimeout(700);
  out.restored = { banner: await q.isVisible('#ofRestored'), price: await q.inputValue('#ofPrice'), people: await q.$$eval('.of-person', e => e.length), conds: await q.$$eval('[data-cond]:checked', e => e.map(x => x.dataset.cond)), word: await q.inputValue('#ofWord'), ks: await q.$eval('input[name="of_kiwisaver"][value="yes"]', e => e.checked) };
  expect(out.restored.banner && out.restored.price === '650k' && out.restored.people === 4 && out.restored.conds.slice().sort().join() === 'builders,custom,finance,lawyer' && out.restored.word === out.aiWord && out.restored.ks, 'save and resume keeps everything');
  // sending: the gap blocks until they change dates or ask for help, and the privacy tick is needed
  await q.click('#ofSend'); await q.waitForTimeout(200);
  out.blocked = { dates: await q.$eval('#ofSec_dates', e => e.classList.contains('of-bad')), privacy: await q.$eval('#ofSec_privacy', e => e.classList.contains('of-bad')), err: await q.textContent('#ofErr') };
  expect(out.blocked.dates && out.blocked.privacy && /things to fix/.test(out.blocked.err), 'gap and privacy stop sending');
  expect(JSON.parse(await q.evaluate(() => localStorage.getItem('offerCalls'))).filter(x => x === 'submit').length === 0, 'nothing sent while there are problems');
  await q.click('label.of-help .mark'); await q.click('label:has([data-fb="privacy"]) .mark');
  out.privacy = await q.textContent('.of-privacy');
  expect(/collects these details/.test(out.privacy) && /presented to the sellers/.test(out.privacy) && /not given to the sellers/.test(out.privacy) && /see or correct/.test(out.privacy), 'privacy note: who, why, presented, not given, access and correction');
  await q.click('#ofSend'); await q.waitForTimeout(500);
  out.thanks = await q.textContent('#ofDone h1'); out.ref = await q.textContent('#ofDone strong');
  expect(/Your offer is with Tim/.test(out.thanks) && /^[0-9A-F]{8}$/.test(out.ref), 'confirmation with a reference');
  const sumText = await q.textContent('#ofDone'); out.sumHas = { comments: sumText.includes('<img src=x onerror="window.__xss=1">'), law: sumText.includes('Law & Co <script>'), purchasers: sumText.includes('Person 4 Buyer') };
  expect(out.sumHas.comments && out.sumHas.law && out.sumHas.purchasers, 'the copy shows what they typed, as text');
  expect(!(await q.$('#ofDone img')) && !(await q.evaluate(() => window.__xss)), 'nothing they typed runs as HTML');
  expect(await q.isVisible('#ofPrint'), 'print or save a copy');
  expect(!(await q.evaluate(t => localStorage.getItem('offerDraft:' + t.slice(0, 20)), TOKEN)), 'the saved draft is cleared once sent');
  expect(!(await side(q)), 'confirmation at 390 px: no sideways scroll');
  await shot(q, 'thanks390');
  d = await db(q); const off1 = d.property_offers.find(x => x.source === 'buyer');
  out.stored = { flags: [off1.related_party, off1.needs_date_help, off1.kiwisaver, off1.lawyer_approval], n: off1.details.purchasers.length, read: off1.read_at };
  expect(JSON.stringify([off1.details.chattels_add, off1.details.chattels_exclude, off1.details.chattels_listed, off1.details.gst_registered, off1.details.gst_number]) === JSON.stringify([['Garden shed'], ['Dining room chandelier'], ['Fixed floor coverings', 'Blinds', 'Heat pump'], true, '123-456-789']), 'chattels and GST recorded on the offer');
  expect(off1.details.email === 'buyer@example.com' && off1.details.lawyer.firm === 'Law & Co <script>' && !('email' in off1.details.lawyer && off1.details.lawyer.email === off1.details.email), "the buyer's contact and the lawyer's details are separate fields");
  expect(off1 && off1.related_party && off1.needs_date_help && off1.kiwisaver && off1.lawyer_approval && off1.details.purchasers.length === 4 && !off1.read_at, 'the offer is filed on the property with its flags');
  expect(d.email_log.some(e => e.kind === 'offer_received' && e.mock && e.recipients === 'tim'), 'Tim notified (mock email only)');
  // a reload after sending can't read it back
  await q.goto(BASE + '?offer=' + TOKEN); await q.waitForTimeout(600); expect(!(await q.$('#ofRestored')) && (await q.inputValue('#ofPrice')) === '', 'a fresh form afterwards: nothing to read back');

  process.stderr.write('step 3\n');
  // ── 3. desktop, dark: hover shows the overlay ──
  const C = await mk(1024, 'dark'); const r = C.p;
  await r.goto(BASE); await keepDb(q, r); await r.goto(BASE + '?offer=' + TOKEN); await r.waitForTimeout(700);
  await r.hover('[data-crow="lim"] .ct'); await r.waitForTimeout(150);
  out.hover = (await r.isVisible('#ofOv')) && /clause 9\.3/.test(await r.textContent('#ofOv'));
  expect(out.hover, 'hovering a condition on a computer opens its overlay');
  await r.mouse.move(5, 5); await r.waitForTimeout(150); expect(await r.isHidden('#ofOv'), 'moving away closes it');
  out.darkBg = await r.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await shot(r, 'form1024dark'); await C.ctx.close();

  process.stderr.write('step 4\n');
  // ── 4. Tim's side ──
  await keepDb(q, p, { mockAgents: JSON.stringify([AGENT]), mocksession: JSON.stringify({ user: { id: 'agent-1', email: AGENT } }) });
  await p.goto(BASE); await p.waitForTimeout(600); await p.click('#navDash'); await p.waitForTimeout(500);
  out.needs = await p.$$eval('.needs strong', e => e.map(x => x.textContent));
  expect(out.needs.includes('New offer: a purchaser is connected with you'), 'Needs you: the new offer, flagged');
  await p.click('tr[data-prop="P1"]'); await p.waitForTimeout(500);
  out.tileRow = await p.textContent('.of-row'); out.flags = await p.$$eval('.of-row .pill', e => e.map(x => x.textContent));
  expect(/\$650,000/.test(out.tileRow) && /Aroha Mere Smith/.test(out.tileRow) && ['New', 'Connected to you', 'Wants help with dates', 'Dates under a week apart', 'KiwiSaver'].every(f => out.flags.includes(f)), 'Offers tile lists it with its flags');
  await p.click('.of-row'); await p.waitForTimeout(600);
  expect(await p.isVisible('.of-related') && await p.isVisible('.of-helpflag') && await p.isVisible('#ofGap'), 'detail: connected, help with dates, short gap');
  const vtext = await p.textContent('#ofView'); expect(vtext.includes('<img src=x onerror="window.__xss=1">') && !(await p.$('#ofView img')) && !(await p.evaluate(() => window.__xss)), "Tim sees the buyer's text as text");
  expect(/heat pump/.test(vtext) && /drafted with AI help, for Tim to approve/.test(vtext), 'the custom condition shows as a draft to approve');
  d = await db(p); expect(d.property_offers.find(x => x.id === off1.id).read_at, 'opened: marked read');
  await p.fill('#ofGapWhy', 'ok'); await p.click('#ofGapOk'); await p.waitForTimeout(200); expect(/Give your reason/.test(await p.textContent('#ofGapErr')), 'a reason is needed');
  await p.fill('#ofGapWhy', 'Buyer and vendor both want an early settlement'); await p.click('#ofGapOk'); await p.waitForTimeout(500);
  expect(/You accepted these dates: "Buyer and vendor both want an early settlement"/.test(await p.textContent('#ofGapDone')), 'override shows a warning and his reason');
  d = await db(p); let o1 = d.property_offers.find(x => x.id === off1.id); expect(o1.gap_override_reason === 'Buyer and vendor both want an early settlement' && o1.gap_override_by === AGENT && d.offer_events.some(e => e.kind === 'gap_override'), 'the reason is recorded on the offer');
  // a correction by phone: the original is kept alongside
  await p.click('#ofFix'); await p.waitForTimeout(500);
  expect((await p.inputValue('#ofPrice')) === '650000' && (await p.$$eval('.of-person', e => e.length)) === 4, 'the correction form opens with the offer');
  await p.fill('#ofPrice', '665000'); await p.click('#ofSend'); await p.waitForTimeout(200); expect(/Say what changed/.test(await p.textContent('#ofErr')), 'a correction needs a note');
  await p.fill('#ofNote', 'Buyer rang: price up to $665,000'); await p.click('#ofSend'); await p.waitForTimeout(600);
  out.afterFix = { h1: await p.textContent('h1'), orig: await p.textContent('#ofOrig') };
  expect(/665,000/.test(out.afterFix.h1) && /650,000/.test(out.afterFix.orig) && /Buyer rang/.test(await p.textContent('#ofView')), 'corrected, with what they sent kept and the note shown');
  d = await db(p); o1 = d.property_offers.find(x => x.id === off1.id); expect(o1.submission.price === 650000 && o1.details.price === 665000, 'submission unchanged, details corrected');
  const r2 = await p.evaluate(id => window.supabase.createClient().from('property_offers').update({ amount: 1 }).eq('id', id), off1.id); expect(r2.error, 'a direct edit of a form offer is refused');
  // withdrawn, with the time
  await p.fill('#ofStNote', 'Bought elsewhere'); await p.click('[data-ofst="withdrawn"]'); await p.waitForTimeout(500);
  expect(/Withdrawn at/.test(await p.textContent('#ofStatus')), 'withdrawn, with the time');
  d = await db(p); o1 = d.property_offers.find(x => x.id === off1.id); expect(o1.status === 'withdrawn' && o1.status_at && d.offer_events.some(e => e.kind === 'status' && e.detail.note === 'Bought elsewhere'), 'status and time recorded');
  expect(!(await side(p)), 'offer view at 390 px: no sideways scroll');
  await shot(p, 'offer390');
  // Tim fills in an offer for a buyer
  await p.click('#ofBackP'); await p.waitForTimeout(500); await p.click('#offNew'); await p.waitForTimeout(500);
  expect((await p.textContent('h1')) === 'Fill in an offer for a buyer' && !(await p.$('#ofAi')), 'the same form for Tim (no AI helper without a link token)');
  await p.fill('#ofPhone', '027 111 2222'); await p.click('input[name="of_seen_docs"][value="no"] + .mark'); await p.fill('#ofPrice', '640000');
  await p.click('input[name="of_kiwisaver"][value="no"] + .mark'); await p.fill('#ofp0f', 'Phone'); await p.fill('#ofp0l', 'Buyer');
  await p.click('input[name="of_related"][value="no"] + .mark'); await p.click('input[name="of_sign"][value="digital"] + .mark'); await p.click('label:has([data-fb="privacy"]) .mark');
  await p.click('#ofSend'); await p.waitForTimeout(600);
  d = await db(p); const off2 = d.property_offers.find(x => x.source === 'agent'); expect(off2 && off2.amount === 640000 && off2.read_at && off2.entered_by === AGENT, 'Tim\'s offer saved (already read)');
  await p.click('#ofBackP'); await p.waitForTimeout(500); out.rows = await p.$$eval('.of-row', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  expect(out.rows.length === 2 && out.rows.some(x => /entered by you/.test(x)) && out.rows.some(x => /Withdrawn/.test(x)), 'both offers on the tile');
  await p.click('#navDash'); await p.waitForTimeout(400); expect(!(await p.$$eval('.needs strong', e => e.map(x => x.textContent))).some(t => /New offer/.test(t)), 'read offers leave Needs you');

  process.stderr.write('step 5\n');
  // ── 5. switching off and a new link stop the form at once ──
  await p.click('tr[data-prop="P1"]'); await p.waitForTimeout(500); await p.click('#offOff'); await p.waitForTimeout(400);
  await keepDb(p, q); await q.goto(BASE + '?offer=' + TOKEN); await q.waitForTimeout(600);
  expect(await q.isVisible('#ofClosed'), 'switched off: the form is closed');
  await keepDb(q, p, { mockAgents: JSON.stringify([AGENT]), mocksession: JSON.stringify({ user: { id: 'agent-1', email: AGENT } }) }); await p.goto(BASE); await p.waitForTimeout(500);
  await p.evaluate(async () => { const c = window.supabase.createClient(); await c.rpc('agent_offer_link', { p_property: 'P1', p_action: 'open' }); await c.rpc('agent_offer_link', { p_property: 'P1', p_action: 'regenerate' }); });
  d = await db(p); const TOKEN2 = d.offer_links.find(x => x.property_id === 'P1').token; expect(TOKEN2 !== TOKEN, 'a new token');
  await p.evaluate(() => window.supabase.createClient().rpc('agent_offer_chattels', { p_property: 'P1', p_items: [] }));
  await keepDb(p, q); await q.goto(BASE + '?offer=' + TOKEN); await q.waitForTimeout(600); expect(await q.isVisible('#ofClosed'), 'the old link stops at once');
  out.closedText = await q.textContent('#ofClosed'); expect(!/Pine Hill/.test(out.closedText), 'a closed link reveals nothing');
  await q.goto(BASE + '?offer=' + TOKEN2); await q.waitForTimeout(600); expect((await q.textContent('h1')) === 'Make an offer', 'the new link works');
  expect(/Tim will confirm the chattels list with you/.test(await q.textContent('.of-chnone')) && await q.isVisible('[data-chadd="add"]') && await q.isVisible('[data-chadd="exclude"]'), 'no chattels held: Tim will confirm, and they can still add and exclude');
  // a submit against a switched-off link, straight to the door
  const inv = (tok, body) => q.evaluate(([t, b]) => window.supabase.createClient().functions.invoke('offer-public', { body: Object.assign({ action: 'submit', token: t }, b) }).then(r => r.data), [tok, body]);
  const goodOffer = { email: 'x@example.com', phone: '021 000 1111', seen_docs: 'yes', sign: 'digital', price: '500000', settlement: { kind: 'relative', days: 15 }, conditions: [], kiwisaver: false, related: false, purchasers: [{ first: 'A', last: 'B' }], privacy: true };
  out.oldSubmit = await inv(TOKEN, { offer: goodOffer }); expect(out.oldSubmit.ok === false && out.oldSubmit.reason === 'closed', 'old token: submit refused');
  // the rate limit: three from one network in ten minutes
  await q.evaluate(() => localStorage.setItem('mockNet', 'net-busy'));
  const res = []; for (let i = 0; i < 4; i++) res.push(await inv(TOKEN2, { offer: goodOffer }));
  out.rate = res.map(x => x.ok ? 'ok' : x.reason); expect(out.rate.join() === 'ok,ok,ok,busy_network', 'rate limited per network, and says so: ' + out.rate);
  // a busy day: ten buyers on ten networks, one property, within ten minutes: all get through
  const ten = []; for (let i = 0; i < 10; i++) { await q.evaluate(i => localStorage.setItem('mockNet', 'buyer-' + i), i); ten.push((await inv(TOKEN2, { offer: goodOffer })).ok); }
  expect(ten.every(Boolean), 'ten buyers on ten networks all get through: ' + ten);
  // the refusal on screen names the limit and says to call or email Tim
  await q.evaluate(() => localStorage.setItem('mockNet', 'net-busy')); await q.goto(BASE + '?offer=' + TOKEN2); await q.waitForTimeout(600);
  await q.fill('#ofEmail', 'x@example.com'); await q.fill('#ofPhone', '021 000 1111'); await q.click('input[name="of_seen_docs"][value="yes"] + .mark'); await q.fill('#ofPrice', '500000');
  await q.click('input[name="of_kiwisaver"][value="no"] + .mark'); await q.fill('#ofp0f', 'A'); await q.fill('#ofp0l', 'B'); await q.click('input[name="of_related"][value="no"] + .mark');
  await q.click('input[name="of_sign"][value="digital"] + .mark'); await q.click('label:has([data-fb="privacy"]) .mark'); await q.click('#ofSend'); await q.waitForTimeout(400);
  out.busyMsg = await q.textContent('#ofErr'); expect(/from your internet connection/.test(out.busyMsg) && /call Tim on 027 562 7207 or email tim@mcguire\.co\.nz/.test(out.busyMsg), 'the busy message names the limit and says to call or email Tim: ' + out.busyMsg);
  // the hidden field filled: told it was received (it was), kept and flagged, nobody emailed
  await q.evaluate(() => localStorage.setItem('mockNet', 'net-spam')); const mails0 = (await db(q)).email_log.length;
  out.spam = await inv(TOKEN2, { offer: Object.assign({}, goodOffer, { price: '1' }), website: 'http://spam.example' });
  d = await db(q); const sp = d.property_offers.find(x => x.suspected_spam);
  expect(out.spam.ok && sp && sp.amount === 1 && d.email_log.length === mails0, 'honeypot: kept and flagged, no email');
  await q.evaluate(() => localStorage.setItem('mockNet', 'net-other')); out.otherNet = (await inv(TOKEN2, { offer: goodOffer })).ok; expect(out.otherNet, 'another network still gets through');
  out.bad = await q.evaluate(([t, o]) => window.supabase.createClient().functions.invoke('offer-public', { body: { action: 'submit', token: t, offer: Object.assign({}, o, { email: 'nope' }) } }).then(async r => r.data || await r.error.context.json()), [TOKEN2, goodOffer]);
  expect(out.bad.ok === false && /email/.test(out.bad.error), 'bad fields refused with a plain message');
  // anyone not signed in reads nothing directly
  out.anon = await q.evaluate(async () => { const c = window.supabase.createClient(); const a = await c.from('property_offers').select('*'); const b2 = await c.from('offer_links').select('*'); const r3 = await c.rpc('offer_public_submit', {}); return [!!a.error, !!b2.error, !!r3.error]; });
  expect(out.anon.every(Boolean), 'not signed in: no table or function access');
  // Tim sees the possible spam apart, and it isn't in Needs you
  await keepDb(q, p, { mockAgents: JSON.stringify([AGENT]), mocksession: JSON.stringify({ user: { id: 'agent-1', email: AGENT } }) }); await p.goto(BASE); await p.waitForTimeout(500);
  await p.click('#navDash'); await p.waitForTimeout(500); out.needsAfter = await p.$$eval('.needs strong', e => e.map(x => x.textContent));
  await p.click('tr[data-prop="P1"]'); await p.waitForTimeout(500);
  out.spamFold = { summary: await p.textContent('#offSpam summary'), inMain: await p.$$eval('#offTile > .of-list .of-row', e => e.some(x => /\$1(\D|$)/.test(x.textContent))) };
  expect(/Possible spam \(1\)/.test(out.spamFold.summary) && !out.spamFold.inMain && !(await p.$eval('#offSpam', e => e.open)), 'possible spam in its own closed fold');
  const unread = (await db(p)).property_offers.filter(x => x.source === 'buyer' && !x.read_at);
  expect(out.needsAfter.filter(t => /New offer/.test(t)).length === unread.filter(x => !x.suspected_spam).length && unread.some(x => x.suspected_spam), 'Needs you lists the real new offers, not the spam');
  // a quiet Needs you line for it, opening the fold
  out.spamNeed = out.needsAfter.filter(t => /possible spam/.test(t)); expect(out.spamNeed.join() === '1 possible spam offer to check', 'Needs you: ' + out.spamNeed);
  await p.click('#navDash'); await p.waitForTimeout(500);
  const si = await p.$$eval('.needs strong', e => e.findIndex(x => /possible spam/.test(x.textContent))); await p.click(`[data-need="${si}"]`); await p.waitForTimeout(600);
  expect(await p.$eval('#offSpam', e => e.open), 'the line opens the property\'s Possible spam fold');
  await p.click('#offSpam .of-row'); await p.waitForTimeout(500); expect(await p.isVisible('.of-spamflag'), 'the spam offer says so');
  // Not spam: back into the main list as a new, unread offer, in Needs you
  const mailsBefore = (await db(p)).email_log.length;
  await p.click('#ofNotSpam'); await p.waitForTimeout(600);
  out.afterNotSpam = { fold: !!(await p.$('#offSpam')), main: await p.$$eval('#offTile > .of-list .of-row', e => e.filter(x => /\$1(\D|$)/.test(x.textContent)).map(x => x.textContent.includes('New'))) };
  expect(!out.afterNotSpam.fold && out.afterNotSpam.main.join() === 'true', 'moved into the main list, marked New');
  d = await db(p); const ns = d.property_offers.find(x => x.id === sp.id); expect(!ns.suspected_spam && !ns.read_at && d.offer_events.some(e => e.offer_id === sp.id && e.kind === 'not_spam') && d.email_log.length === mailsBefore, 'flag cleared, unread, recorded, still no email');
  await p.click('#navDash'); await p.waitForTimeout(500); const nn = await p.$$eval('.needs strong', e => e.map(x => x.textContent));
  expect(!nn.some(t => /possible spam/.test(t)) && nn.filter(t => /New offer/.test(t)).length === out.needsAfter.filter(t => /New offer/.test(t)).length + 1, 'Needs you: one more new offer, no spam line');
  await p.click('tr[data-prop="P1"]'); await p.waitForTimeout(500); await p.click('#offTile > .of-list .of-row'); await p.waitForTimeout(400);
  // a form offer: notes and expiry may change directly, nothing else
  out.direct = await p.evaluate(async id => { const c = window.supabase.createClient(); const a = await c.from('property_offers').update({ notes: 'rang them' }).eq('id', id); const b2 = await c.from('property_offers').update({ read_by: 'x' }).eq('id', id); return [!a.error, !!b2.error]; }, sp.id);
  expect(out.direct.every(Boolean), 'notes editable, other columns locked');

  process.stderr.write('step 6\n');
  // ── 6. the vendor sees nothing about offers ──
  const V = await mk(390, 'light'); const v = V.p; await v.goto(BASE); await keepDb(q, v, { mocksession: JSON.stringify({ user: { id: 'v-1', email: 'vendor@example.com' } }) });
  await v.goto(BASE); await v.waitForTimeout(900);
  out.vendor = await v.evaluate(async () => { const c = window.supabase.createClient(); const g = async t => { const r = await c.from(t).select('*'); return r.error ? 'error' : r.data.length; };
    return { prop: await g('properties'), offers: await g('property_offers'), links: await g('offer_links'), events: await g('offer_events'), settings: await g('offer_settings'), clauses: await g('offer_clauses'),
      link: (await c.rpc('agent_offer_link', { p_property: 'P1', p_action: 'get' })).error?.message, read: (await c.rpc('agent_offer_read', { p_offer: 'x' })).error?.message, pub: (await c.rpc('offer_public_info', {})).error?.message,
      upd: (await c.from('property_offers').update({ notes: 'x' }).eq('property_id', 'P1')).error ? 'refused' : 'allowed' }; });
  expect(out.vendor.prop === 1 && [out.vendor.offers, out.vendor.links, out.vendor.events, out.vendor.settings, out.vendor.clauses].every(n => n === 0), 'vendor reads no offer rows, links, events, settings or wording');
  expect(/Only Tim/.test(out.vendor.link) && /Only Tim/.test(out.vendor.read) && /permission denied/.test(out.vendor.pub) && out.vendor.upd === 'refused', 'vendor can call no offer function');
  const vtxt = await v.innerText('body'); out.vendorHit = (vtxt.match(/.{0,60}(650,000|665,000|640,000|Offers|offer form|Aroha).{0,60}/) || [''])[0]; expect(!/650,000|665,000|640,000|Offers|offer form|Aroha/.test(vtxt), 'nothing about offers on the vendor\'s screens');
  const jb = await v.$('#journeyBtn'); expect(jb && await jb.isVisible(), 'the vendor has the Journey button');
  if (jb && await jb.isVisible()) { await jb.click(); await v.waitForTimeout(500); const jt = await v.innerText('#journey'); out.journeyLen = jt.length; expect(jt.length > 100 && !/650,000|665,000|Aroha|offer form/.test(jt), 'nothing about offers on the journey map'); }
  // ── 7. Home's "Draft an offer" tile: choose the property, then fill in an offer or open its Offers tile (phone width) ──
  const H = await mk(390, 'dark'); const h = H.p; await asAgent(h);
  expect(await h.isVisible('#homeOffer') && /Draft an offer/.test(await h.textContent('#homeOffer')), 'Home has a Draft an offer tile');
  expect(!(await side(h)), 'home has no sideways scroll at 390 px');
  await h.click('#homeOffer'); await h.waitForTimeout(500);
  out.pick = { h1: await h.textContent('main h1'), ready: await h.$$eval('.view-pad > .of-picklist [data-pick-new]', e => e.map(x => x.dataset.pickNew)), later: await h.$$eval('details .of-picklist [data-pick-new]', e => e.map(x => x.dataset.pickNew)) };
  expect(out.pick.h1 === 'Draft an offer' && out.pick.ready.join() === 'P1' && out.pick.later.join() === 'P2', 'the chooser lists P1 ready and P2 folded away: ' + JSON.stringify(out.pick));
  expect(!(await side(h)), 'the chooser has no sideways scroll at 390 px');
  await h.click('[data-pick-new="P1"]'); await h.waitForTimeout(600);
  expect(/12 Pine Hill Road/.test(await h.innerText('main')) && !!(await h.$('[data-cond="finance"]')), 'Draft an offer opens the offer form for that property');
  await h.click('#navHome'); await h.waitForTimeout(400); await h.click('#homeOffer'); await h.waitForTimeout(500);
  await h.click('[data-pick-see="P1"]'); await h.waitForTimeout(700);
  expect(!!(await h.$('#offTile')), 'Offers and link opens the property with its Offers tile');
  await H.ctx.close();
  await V.ctx.close(); await A.ctx.close(); await B.ctx.close();
  console.log(JSON.stringify(Object.assign(out, { errs }), null, 1)); await b.close();
})().catch(e => console.log(JSON.stringify({ errs: ['crashed: ' + e.stack] })));

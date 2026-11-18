// Public council records (Tim, 18 November 2026; migration 013, fn/property_lookup.ts). The lookup's answers here are made by the
// real core (fn/property_lookup_core.ts) from the recorded council responses (files/council-fixtures.js), then served by the mock.
// Covers: a Dunedin property from its Public records tile (matched address, "Not the right property?", sources, dates, labels and
// LIM notes, nothing used until ticked, a value already on the file never replaced without a choice, keep or use, provenance and
// the quiet line under the field), the 30-day reuse and "Look again", a weak address refused and a suggestion chosen, a partial
// upstream failure, Inspect a property in another district (Waitaki) with "Start the inspection and use these", the lookup never
// holding up starting an inspection, the offline card, a signed agreement never changed, Let's agree page 1 filled, vendors
// unable to read lookups or use them, a direct write of found refused, and 390 px without sideways scroll in light and dark.
// Screenshots: out/council_card.png (light) and out/council_card_dark.png.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(__dirname, '..', '..', 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const { makeFetch } = require('./files/council-fixtures.js');
const TIM = ['agent-1', 'hello@timmcguire.co.nz'], SAM = ['v-sam', 'sam@example.com'];
const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
(async () => {
  const errs = [], out = {}, fail = [];
  const expect = (ok, msg) => { if (!ok) fail.push(msg); };
  // the lookup's answers, from the real core
  const core = await import(path.join(__dirname, '..', '..', 'fn', 'property_lookup_core.ts'));
  const look = (name, address, opts) => core.lookup({ address }, { fetch: makeFetch(name, opts), timeoutMs: (opts && opts.timeoutMs) || 400 });
  const RESULTS = {
    [norm('100 Gladstone Road, Dunedin')]: await look('dunedinHazards', '100 Gladstone Road, Dunedin'),
    [norm('100 Gladstone Rd, Dunedin')]: await look('dunedin', '100 Gladstone Rd, Dunedin', { fail: ['apps.dunedin.govt.nz'], slow: ['LINZ_NZ_Property_Boundaries'], timeoutMs: 200 }),
    [norm('20 Thames Street, Oamaru')]: await look('waitaki', '20 Thames Street, Oamaru'),
    [norm('15 Clyde Street, Balclutha')]: await look('weak', '15 Clyde Street, Balclutha'),
    [norm('15 High Street, Balclutha')]: await look('clutha', '15 High Street, Balclutha'),
    [norm('24 Tarbert Street, Alexandra')]: await look('centralOtago', '24 Tarbert Street, Alexandra'),
  };
  const b = await chromium.launch();
  const page = async scheme => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme || 'light' });
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
    await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    await ctx.route('https://packages.dunnerstunner.co.nz/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
    await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    // nothing on the page ever talks to a council server: the edge function does
    await ctx.route(/arcgis|orc\.govt|dunedin\.govt|cluthadc|waitaki\.govt|codc\.govt/, r => { errs.push('the page asked a council server: ' + r.request().url()); r.abort(); });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' '))); p.on('console', m => { if (m.type() === 'error' && !/Failed to fetch|Failed to send/.test(m.text())) errs.push(m.text()); });
    return { ctx, p };
  };
  const { p } = await page();
  try {
  const go = async () => { await p.goto('https://packages.dunnerstunner.co.nz/onboarding/'); await p.waitForTimeout(600); };
  const as = async (id, email) => { await p.evaluate(([id, email]) => localStorage.setItem('mocksession', JSON.stringify({ user: { id, email } })), [id, email]); await go(); };
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb')));
  const calls = () => p.evaluate(() => JSON.parse(localStorage.getItem('callLog') || '[]').filter(x => x === 'fn:property-lookup:lookup').length);
  const sideways = () => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  const card = () => p.textContent('[data-cr-card]');
  const openProp = async addr => { await p.click('#navDash'); await p.waitForTimeout(500); await p.click(`tr[data-prop]:has-text("${addr}")`); await p.waitForTimeout(600); };
  const useBtn = '[data-cr-use]';

  await go();
  await p.evaluate(results => { localStorage.clear();
    const now = '2026-11-10T00:00:00Z';
    localStorage.setItem('councilResults', JSON.stringify(results));
    localStorage.setItem('mockdb', JSON.stringify({
      properties: [
        // the title document gave one of the two titles
        { id: 'PR1', address: '100 Gladstone Road, Dunedin', title_ref: '430432', ownership: {}, description: {}, disclosures: {}, found: {}, provenance: {}, stage: 'appraisal', stage_at: now, created_at: now, updated_at: now },
        { id: 'PR3', address: '24 Tarbert Street, Alexandra', title_ref: '', ownership: {}, description: { pLand: '2000' }, disclosures: {}, found: {}, provenance: {}, stage: 'signed', stage_at: now, created_at: now, updated_at: now }],
      property_people: [{ id: 'PP3', property_id: 'PR3', position: 1, legal_name: 'Sam Lee', pref_name: 'Sam', email: 'sam@example.com', phone: '', user_id: 'v-sam', role: 'owner', source: 'agreement', name_from: 'agreement' }],
      agreements: [{ id: 'A3', ref: 'MRE-2026-1003', address: '24 Tarbert Street, Alexandra', property_id: 'PR3', status: 'signed', config: { title: '' }, answers: { pLand: '2000' }, legal: { choice: 'have' }, signed_at: now, agreement_version: 'v3.15-26102026', created_at: now }],
      agreement_people: [{ id: 'S1', agreement_id: 'A3', position: 1, legal_name: 'Sam Lee', pref_name: 'Sam', email: 'sam@example.com', phone: '', user_id: 'v-sam', signed_at: now }],
      agreement_events: [], signatures: [], lawyer_links: [], aml_files: [], aml_events: [], email_log: [], cancellation_requests: [] })); }, RESULTS);

  // 1. Dunedin, from the property page's Public records tile
  await as(...TIM);
  await openProp('100 Gladstone Road, Dunedin');
  expect(await p.isVisible('#crTile'), 'Public records tile on the property page');
  expect((await p.textContent('#crStart')).trim() === 'Look up public records', 'tile button: Look up public records');
  await p.click('#crStart'); await p.waitForTimeout(500);
  out.card1 = (await card()).replace(/\s+/g, ' ').slice(0, 400);
  expect(/Found on public records/.test(out.card1), 'card title');
  expect((await p.textContent('.cr-match strong')) === '100 Gladstone Road, Dalmore, Dunedin', 'matched address shown prominently');
  expect(await p.isVisible('[data-cr-wrong]:has-text("Not the right property?")'), 'Not the right property?');
  expect(await calls() === 1, 'one lookup');
  const row = async k => (await p.textContent(`[data-cr-key="${k}"]`)).replace(/\s+/g, ' ');
  out.cv = await row('capital_value');
  expect(/\$1,110,000/.test(out.cv) && /Council rating valuation \(as at 2026-2027 rating year\), not a market value\./.test(out.cv) && /From Dunedin City Council rates, as at 2026-2027 rating year\. Found 18 Nov 2026|From Dunedin City Council rates, as at 2026-2027 rating year\. Found \d+ \w+ 2026\. Not checked\./.test(out.cv), 'capital value label, source and date: ' + out.cv);
  expect(/Otago Regional Council, ORC Properties has \$1,160,000 \(as at 15 Nov 2026\)/.test(out.cv), 'ORC value beside it');
  expect(/Council rating valuation .*not a market value/.test(await row('rates_council')), 'rates labelled');
  expect(/Not a substitute for a LIM\./.test(await row('zone')), 'zone LIM note');
  const hz = await p.$$eval('[data-cr-key^="hazard_orc_"]', e => e.map(x => x.textContent.replace(/\s+/g, ' ')));
  out.hazards = hz.map(x => x.slice(0, 120));
  expect(hz.length >= 2 && hz.every(x => /Not a substitute for a LIM\./.test(x)) && hz.some(x => /Moderate to high/.test(x)), 'hazards with LIM notes');
  expect(await p.$eval('[data-cr-key="capital_value"] .cr-src a', a => a.href.startsWith('https://apps.dunedin.govt.nz/') && a.target === '_blank'), 'source link');
  const all = await card();
  expect(!/verified/i.test(all) && /Not checked/.test(all) && !/—/.test(all), 'wording: not checked, never verified, no em dash');
  expect(/LINZ Data Service licensed for reuse under CC BY 4\.0/.test(all), 'LINZ credit');
  // a value already on the file: both shown, a choice asked for up front
  expect(/On the file now: 430432/.test(await row('title_ref')), 'title on file shown beside the public record');
  expect(!(await sideways()), 'no sideways scroll at 390 px with the card open');
  await p.$eval('[data-cr-key="capital_value"]', e => e.scrollIntoView({ block: 'center' }));
  await p.$eval('[data-cr-card]', e => e.scrollIntoView({ block: 'start' }));
  await p.screenshot({ path: path.join(__dirname, 'out', 'council_card.png'), fullPage: false });

  // nothing used until ticked, and a choice is needed where the file differs
  await p.click(useBtn); await p.waitForTimeout(200);
  expect((await p.textContent('[data-cr-err]')) === 'Tick what you want to use.', 'nothing ticked: nothing used');
  for (const k of ['title_ref', 'land_area', 'capital_value', 'zone', 'legal_description']) await p.check(`[data-cr-tick="${k}"]`);
  await p.click(useBtn); await p.waitForTimeout(200);
  expect(/Choose which to keep for title reference/.test(await p.textContent('[data-cr-err]')), 'choice needed for the title');
  let d = await db(); expect(!Object.keys(d.properties.find(x => x.id === 'PR1').found || {}).length, 'still nothing used');
  await p.check('input[data-cr-ch="title_ref"][value="keep"]');
  await p.click(useBtn); await p.waitForTimeout(700);
  d = await db(); let pr = d.properties.find(x => x.id === 'PR1');
  out.used = { title: pr.title_ref, legal: pr.legal_description, pLand: pr.description.pLand, found: Object.keys(pr.found), prov: Object.keys(pr.provenance) };
  expect(pr.title_ref === '430432' && pr.found.title_ref.written === false && pr.found.title_ref.value === '430431, 430432', 'title kept, the public record stored beside it');
  expect(pr.description.pLand === '3647' && pr.provenance.pLand.from === 'public_records' && pr.provenance.pLand.source === 'dcc_rates' && pr.provenance.pLand.as_of === '2026-2027', 'land area used, with provenance');
  expect(pr.legal_description === 'Lot 8 DP 608, Lot 10 DP 608, Lot 11 DP 608' && pr.provenance.legal_description.source === 'linz_boundaries', 'legal description used, with provenance');
  expect(/not a market value/.test(pr.found.capital_value.note) && pr.found.capital_value.value === 1110000 && pr.found.capital_value.as_of === '2026-2027' && pr.found.capital_value.used_by === TIM[1], 'capital value stored in found with its label, date and who');
  expect(/Not a substitute for a LIM\./.test(pr.found.zone.note), 'zone stored with LIM note');
  expect(d.council_lookups[0].property_id === 'PR1', 'the lookup is tied to the property');
  // back on the property page: the tile lists what was used, with sources; the quiet line under the land area
  const tile = (await p.textContent('#crTile')).replace(/\s+/g, ' ');
  expect(/You kept your own/.test(tile) && /On the file: 430432/.test(tile) && /Public record: 430431, 430432/.test(tile) && !/@/.test(tile) && /Capital value/.test(tile) && /not a market value/.test(tile) && /Not checked/.test(tile), 'tile lists found values: ' + tile.slice(0, 200));
  expect((await p.textContent('#crStart')).trim() === 'Look again', 'tile button: Look again');
  expect(/From Dunedin City Council rates, 2026-2027\. Not checked/.test(await p.textContent('label[for="pfd_pLand"]')), 'quiet line under the land area');
  expect(!/From/.test(await p.textContent('label[for="pfTitle"]')), 'no line under the title (Tim kept his own)');
  // Tim edits the land area: the line goes, the public record stays on the tile
  await p.fill('#pfd_pLand', '3650'); await p.click('#pfSave'); await p.waitForTimeout(600);
  expect(!/From Dunedin/.test(await p.textContent('label[for="pfd_pLand"]')), 'edited by Tim: the line goes');
  d = await db(); expect(d.properties.find(x => x.id === 'PR1').found.land_area.value === 3647, 'found keeps the public record after an edit');

  // 2. 30-day reuse: Let's begin from the property shows the stored lookup without asking again; "Look again" asks again
  const n1 = await calls();
  await p.click('#pfBegin'); await p.waitForTimeout(700);
  expect(/Found on public records/.test(await card()) && /Looked up/.test(await card()), 'Let\'s begin shows the stored lookup');
  expect(await calls() === n1, 'no new lookup within 30 days');
  await p.click('[data-cr-again]'); await p.waitForTimeout(600);
  expect(await calls() === n1 + 1 && /Found on public records/.test(await card()), 'Look again asks again');

  // 3. a weak address is refused; a suggestion is chosen
  await p.click('[data-cr-wrong]'); await p.fill('[data-cr-addr]', '15 Clyde Street, Balclutha'); await p.click('[data-cr-other-go]'); await p.waitForTimeout(500);
  out.weak = (await card()).replace(/\s+/g, ' ');
  expect(/No clear match for 15 Clyde Street, Balclutha/.test(out.weak) && !(await p.$('[data-cr-tick]')) && !(await p.$(useBtn)), 'weak match refused, nothing to tick');
  await p.click('[data-cr-cand="0"]'); await p.waitForTimeout(500);
  expect((await p.textContent('.cr-match strong')) === '15 High Street, Balclutha' && /Clutha District Council/.test(await card()), 'the suggestion chosen');
  expect(/as at 14 Aug 2025/.test(await row('rates_council')), 'Clutha rates with their date');

  // 4. a partial upstream failure: what answered is shown, and what didn't is named
  await p.click('[data-cr-wrong]'); await p.fill('[data-cr-addr]', '100 Gladstone Rd, Dunedin'); await p.click('[data-cr-other-go]'); await p.waitForTimeout(500);
  out.partial = await p.textContent('.cr-down');
  expect(/Didn't answer this time: .*Dunedin City Council rates.*LINZ NZ Property Boundaries/.test(out.partial), 'failures named: ' + out.partial);
  expect(/\$1,160,000/.test(await row('capital_value')) && /ORC Properties/.test(await row('capital_value')), 'falls back to ORC');
  expect(!(await p.$('[data-cr-key="title_ref"]')), 'no title without LINZ');

  // 5. Inspect a property: the lookup never holds up starting
  await p.click('#navHome'); await p.waitForTimeout(400);
  await p.evaluate(() => localStorage.setItem('councilMode', 'hang'));
  await p.click('#homeInspect'); await p.waitForTimeout(400);
  await p.fill('#insAddr', '7 Slow Street, Dunedin'); await p.press('#insAddr', 'Tab'); await p.waitForTimeout(300);
  expect(/Looking up/.test(await card()), 'lookup under way');
  const t0 = Date.now(); await p.click('#insNew'); await p.waitForTimeout(600);
  expect((await p.textContent('main h1')) === 'Outside' && Date.now() - t0 < 3000, 'the inspection starts without waiting for the lookup');
  // with no signal: the address step works and the card says so
  await p.click('#navHome'); await p.waitForTimeout(400);
  await p.evaluate(() => localStorage.setItem('councilMode', 'offline'));
  await p.click('#homeInspect'); await p.waitForTimeout(400);
  await p.fill('#insAddr', '9 Quiet Road, Dunedin'); await p.press('#insAddr', 'Tab'); await p.waitForTimeout(500);
  expect(/will be available when there's signal/.test(await card()), 'offline card');
  expect(!(await p.$eval('#insNew', e => e.disabled)), 'Start still available offline');
  await p.evaluate(() => localStorage.removeItem('councilMode'));
  // another district (Waitaki): start and use the ticked values in one go
  await p.fill('#insAddr', '20 Thames Street, Oamaru'); await p.press('#insAddr', 'Tab'); await p.waitForTimeout(600);
  expect((await p.textContent('.cr-match strong')) === '20 Thames Street, Oamaru' && /Waitaki District Council/.test(await card()), 'Waitaki card');
  expect(/BUSINESS H \(HERITAGE\) ZONE/.test(await row('zone')) && /Not a substitute for a LIM/.test(await row('zone')), 'Waitaki zone with LIM note');
  expect(await p.isVisible('a[href="https://opencitiesfrontend.waitaki.govt.nz/propertyrating?assessmentNo=112719"]'), 'link to the council\'s own page');
  for (const k of ['title_ref', 'land_area', 'capital_value', 'zone']) await p.check(`[data-cr-tick="${k}"]`);
  expect((await p.textContent(useBtn)).trim() === 'Start the inspection and use these', 'start-and-use button');
  await p.click(useBtn); await p.waitForTimeout(800);
  expect((await p.textContent('main h1')) === 'Outside', 'inspection opened');
  d = await db(); pr = d.properties.find(x => x.address === '20 Thames Street, Oamaru');
  expect(pr && pr.title_ref === 'OT13A/1386' && pr.description.pLand === '2071' && pr.found.capital_value.source === 'wdc_parcels' && pr.found.zone, 'Waitaki values on the new property file');
  expect((d.property_inspections || []).some(i => i.property_id === pr.id), 'and an inspection on it');

  // 6. a signed agreement is never changed
  await openProp('24 Tarbert Street, Alexandra');
  await p.click('#crStart'); await p.waitForTimeout(500);
  expect(/Central Otago District Council doesn't publish its zone map/.test(await card()) && await p.isVisible('a[href="https://www.codc.govt.nz/do-it-online/rating-and-property-search"]'), 'Central Otago: note and the council\'s search page');
  await p.check('[data-cr-tick="land_area"]'); await p.check('input[data-cr-ch="land_area"][value="replace"]');
  await p.click(useBtn); await p.waitForTimeout(500);
  out.signed = (await row('land_area')).slice(0, 300);
  expect(/The signed agreement MRE-2026-1003 says 2000\. It stays as it is\./.test(out.signed) && !(await p.$('input[data-cr-ch="land_area"][value="replace"]')), 'signed agreement: only keep offered');
  d = await db(); expect(d.agreements.find(x => x.id === 'A3').answers.pLand === '2000' && d.properties.find(x => x.id === 'PR3').description.pLand === '2000' && !Object.keys(d.properties.find(x => x.id === 'PR3').found).length, 'nothing changed or stored yet');
  await p.check('input[data-cr-ch="land_area"][value="keep"]'); await p.click(useBtn); await p.waitForTimeout(700);
  d = await db(); const p3 = d.properties.find(x => x.id === 'PR3');
  expect(d.agreements.find(x => x.id === 'A3').answers.pLand === '2000' && p3.description.pLand === '2000' && p3.found.land_area.written === false, 'kept: agreement and file unchanged, the public record beside');

  // 7. Let's agree, page 1: saved, then used; page 1 shows the land area
  // (the Balclutha lookup in step 3 was made from the Dunedin property's card, so it belongs to that property and is not reused here)
  await p.click('#navHome'); await p.waitForTimeout(400); await p.click('#homeAgree'); await p.waitForTimeout(500);
  const n7 = await calls();
  await p.fill('#tAddr', '15 High Street, Balclutha'); await p.press('#tAddr', 'Tab'); await p.waitForTimeout(600);
  expect(/Found on public records/.test(await card()) && !/Looked up/.test(await card()) && await calls() === n7 + 1, 'page 1 looks the address up afresh: another property\'s lookup is never reused');
  await p.check('[data-cr-tick="land_area"]'); await p.check('[data-cr-tick="legal_description"]');
  await p.click(useBtn); await p.waitForTimeout(900);
  expect((await p.inputValue('#t_pLand')) === '726', 'page 1 land area filled: ' + await p.inputValue('#t_pLand'));
  d = await db(); const ag = d.agreements.find(x => x.address === '15 High Street, Balclutha'); const pb = ag && d.properties.find(x => x.id === ag.property_id);
  expect(ag && ag.answers.pLand === '726' && pb.legal_description === 'LOT 1 DP 11505' && pb.provenance.pLand.source === 'cdc_property', 'agreement and property file filled with provenance');
  expect(!(await sideways()), 'page 1 at 390 px');

  // 8. a direct write of found is refused, even for Tim
  const direct = await p.evaluate(async () => { const c = window.supabase.createClient(); const r = await c.from('properties').update({ found: { x: { value: 1 } } }).eq('id', 'PR1'); return r.error && r.error.message; });
  expect(/only saved with Use these/.test(direct || ''), 'direct write of found refused');

  // 9. vendors can't read lookups or use them
  await as(...SAM);
  const v = await p.evaluate(async () => { const c = window.supabase.createClient(); const a = await c.from('council_lookups').select('*'); const b = await c.rpc('agent_council_cached', { p_asked: '24 Tarbert Street, Alexandra', p_property: 'PR3' }); const d = await c.rpc('agent_council_accept', { p_property: 'PR3', p_lookup: 'x', p_keys: ['zone'] }); const e = await c.functions.invoke('property-lookup', { body: { mode: 'lookup', address: '24 Tarbert Street, Alexandra' } }); return { rows: (a.data || []).length, cached: b.error && b.error.message, accept: d.error && d.error.message, fn: !!e.error }; });
  out.vendor = v;
  expect(v.rows === 0 && v.cached === 'Agent only' && v.accept === 'Agent only' && v.fn, 'vendor: no lookups, no functions');
  expect(!/Found on public records|Public records/.test(await p.textContent('main')), 'no public records on vendor screens');

  // 10. dark mode at 390 px
  const { p: q } = await page('dark');
  await q.goto('https://packages.dunnerstunner.co.nz/onboarding/'); await q.waitForTimeout(300);
  await q.evaluate(([s, dbs, res]) => { localStorage.setItem('mocksession', s); localStorage.setItem('mockdb', dbs); localStorage.setItem('councilResults', res); }, [JSON.stringify({ user: { id: TIM[0], email: TIM[1] } }), JSON.stringify(await db()), JSON.stringify(RESULTS)]);
  await q.goto('https://packages.dunnerstunner.co.nz/onboarding/'); await q.waitForTimeout(600);
  await q.click('#navDash'); await q.waitForTimeout(500); await q.click('tr[data-prop]:has-text("100 Gladstone Road, Dunedin")'); await q.waitForTimeout(600);
  await q.click('#crStart'); await q.waitForTimeout(500);
  expect(!(await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'dark: no sideways scroll');
  const bg = await q.$eval('[data-cr-card] .cr-match', e => getComputedStyle(e).backgroundColor);
  expect(bg === 'rgb(24, 23, 22)', 'dark: card colours from the dark tokens: ' + bg);
  await q.$eval('[data-cr-card]', e => e.scrollIntoView({ block: 'start' }));
  await q.screenshot({ path: path.join(__dirname, 'out', 'council_card_dark.png'), fullPage: false });
  } catch (e) { errs.push('crashed: ' + e.stack); }
  await b.close();
  console.log(JSON.stringify(Object.assign(out, { fail, errs: errs.concat(fail) }), null, 1));
})();

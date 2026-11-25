// LW0, the shared records (Tim's central build plan, 26 November 2026; migration 028), against the mock database (mock.js keeps the
// shared records in step after every write, as 028's triggers do). Covers: the new names (no "Let's begin", "pre-listing" or "Inspect a
// property" on Tim's pages; /processes/appraisal still opens); the disclosures check writing to the property profile with its source and
// date, chosen and ticked; an agreement saying something else kept as another value, shown beside it, and Tim choosing it (the property
// file follows, the agreement is unchanged); the disclosures check reading the profile first ("On the property profile ... Use this");
// Tim's own entry on the property file going to the profile; "Tick all"; one person record for the same person across the property's
// people, the agreement and the questions before we meet; the same email with a different name kept apart and flagged for Tim; a
// signed person never given a contact on their own row (linked aside); the vendor's answers to the questions before we meet saved to the
// question bank as they answer; a vendor reading their own profile only (never Relab), seeing none of the people records, and unable to
// write any shared record; and 390 px in light and dark with no sideways scroll.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cat = fs.readFileSync(path.join(__dirname, '..', '..', 'catalogue.js'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const TIM = ['agent-1', 'hello@timmcguire.co.nz'];
(async () => {
  const b = await chromium.launch(); const out = {}, fail = [], errs = [];
  const expect = (ok, msg) => { if (!ok) fail.push(msg); };
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: mock }));
    await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    await ctx.route('https://packages.dunnerstunner.co.nz/catalogue.js', r => r.fulfill({ contentType: 'application/javascript', body: cat }));
    await ctx.route('https://packages.dunnerstunner.co.nz/onboarding/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to fetch/.test(m.text())) errs.push(m.text()); });
    p.on('dialog', d => d.accept());
    const go = async () => { await p.goto('https://packages.dunnerstunner.co.nz/onboarding/'); await p.waitForTimeout(700); };
    const as = async (id, email) => { await p.evaluate(([id, email]) => localStorage.setItem('mocksession', JSON.stringify({ user: { id, email } })), [id, email]); await go(); };
    const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('mockdb')));
    const sideways = () => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    const rpc = (name, args) => p.evaluate(async ([n, a]) => { const r = await window.supabase.createClient('x', 'y').rpc(n, a); return r; }, [name, args]);
    const table = (t) => p.evaluate(async t => { const r = await window.supabase.createClient('x', 'y').from(t).select('*'); return r; }, t);
    const write = (t) => p.evaluate(async t => { const r = await window.supabase.createClient('x', 'y').from(t).insert({ x: 1 }); return r.error ? r.error.message : 'WROTE'; }, t);
    const openProp = async id => { await p.click('#navDash'); await p.waitForTimeout(500); await p.click(`tr[data-prop="${id}"]`); await p.waitForTimeout(900); };
    const profRow = k => p.evaluate(k => { const r = document.querySelector(`#pfProfTbl tr[data-prof="${k}"]`); return r ? r.textContent.replace(/\s+/g, ' ').trim() : null; }, k);
    const tag = scheme;
    try {
      await go();
      const now = '2026-11-20T00:00:00Z';
      await p.evaluate(now => { localStorage.clear(); localStorage.setItem('mockdb', JSON.stringify({
        properties: [
          { id: 'PA', address: '4 Profile Road, Roslyn', ownership: {}, description: {}, disclosures: {}, provenance: {}, stage: 'appraisal', stage_at: now, created_at: now, updated_at: now,
            found: { land_area: { key: 'land_area', field: 'pLand', written: true, value: 640, display: '640 m²', as_of_label: '2026-2027 rating year', source_name: 'Dunedin City Council rates', label: 'Land area' },
                     capital_value: { key: 'capital_value', value: 780000, display: '$780,000', as_of: '2026-2027', source_name: 'Dunedin City Council rates', label: 'Capital value' } } },
          { id: 'PB', address: '9 Signed Street, Maori Hill', ownership: {}, description: {}, disclosures: {}, found: {}, provenance: {}, stage: 'signed', stage_at: now, created_at: now, updated_at: now }],
        property_people: [
          { id: 'PPA1', property_id: 'PA', position: 1, legal_name: 'Robin Rowe', pref_name: 'Rob', email: 'robin@example.com', phone: '021 555 0101', role: 'owner', source: 'agent', name_from: 'agent', created_at: now },
          { id: 'PPA2', property_id: 'PA', position: 2, legal_name: 'Jordan Rowe', pref_name: '', email: 'robin@example.com', phone: '', role: 'owner', source: 'agent', name_from: 'agent', created_at: now },
          { id: 'PPB1', property_id: 'PB', position: 1, legal_name: 'Sam Signer', pref_name: '', email: 'sam@example.com', phone: '', user_id: 'v-sam', role: 'owner', source: 'agreement', name_from: 'agreement', created_at: now }],
        agreements: [{ id: 'AB', ref: 'MRE-2026-1009', address: '9 Signed Street, Maori Hill', property_id: 'PB', status: 'signed', config: {}, answers: { pBed: '3' }, legal: {}, agreement_version: 'v3.15-26102026', created_at: now, updated_at: now }],
        agreement_people: [{ id: 'APB1', agreement_id: 'AB', position: 1, legal_name: 'Sam Signer', pref_name: '', email: 'sam@example.com', phone: '', user_id: 'v-sam', signed_at: now, contact_id: null }],
        prelistings: [{ id: 'LA', address: '4 Profile Road, Roslyn', property_id: 'PA', contact_name: 'Rob', contact_email: 'robin@example.com', status: 'appraisal', appraisal: { method: 'Auction' }, answers: {}, plan: {}, created_at: now, updated_at: now }],
        agreement_events: [], signatures: [], lawyer_links: [], aml_files: [], aml_events: [], email_log: [], cancellation_requests: [] })); }, now);
      await as(...TIM);

      // 1. names: no "Let's begin", "pre-listing" or "Inspect a property" on Tim's pages
      out[tag] = { tiles: await p.$$eval('.home-tile .ttl', e => e.map(x => x.textContent)) };
      expect(JSON.stringify(out[tag].tiles) === JSON.stringify(['Questions before we meet', 'Disclosures check', "Let's agree", 'Draft an offer']), 'home tiles renamed: ' + out[tag].tiles);
      const oldNames = () => p.evaluate(() => /let.s begin|pre-listing|inspect a property/i.test(document.body.innerText));
      expect(!(await oldNames()), 'home: no old names');
      await p.click('#navDash'); await p.waitForTimeout(500); expect(!(await oldNames()), 'dashboard: no old names');
      await p.click('tr[data-prop="PA"]'); await p.waitForTimeout(900); expect(!(await oldNames()), 'property page: no old names');
      await p.click('#homeBegin').catch(() => null);
      await p.click('[data-plopen="LA"]'); await p.waitForTimeout(700);
      out[tag].plHead = await p.textContent('#stepName').catch(() => ''); expect(!(await oldNames()) && out[tag].plHead === 'Questions before we meet', 'the questions page: new name, no old names: ' + out[tag].plHead);

      // 2. the backfill: council values Tim used are on the profile, chosen and ticked, with their source and date; one person record
      let d = await db();
      out[tag].profile0 = (d.property_profile || []).filter(x => x.property_id === 'PA').map(x => x.key).sort();
      expect(JSON.stringify(out[tag].profile0) === JSON.stringify(['capital_value', 'pLand']), 'council values on the profile: ' + out[tag].profile0);
      const linkOf = (src, id) => (d.person_links || []).find(l => l.source === src && l.source_id === id) || {};
      expect(linkOf('property_people', 'PPA1').contact_id && linkOf('property_people', 'PPA1').contact_id === linkOf('prelisting', 'LA').contact_id, 'the questions before we meet and the owner are one person (the informal "Rob" with the same email)');
      expect(linkOf('property_people', 'PPA2').contact_id && linkOf('property_people', 'PPA2').contact_id !== linkOf('property_people', 'PPA1').contact_id && /different name/.test(linkOf('property_people', 'PPA2').doubt || ''), 'the same email with a different name: kept apart and flagged for Tim');
      expect(linkOf('agreement_people', 'APB1').contact_id && linkOf('agreement_people', 'APB1').contact_id === linkOf('property_people', 'PPB1').contact_id, 'the signed person and the owner are one person');
      expect(d.agreement_people.find(x => x.id === 'APB1').contact_id === null, 'a signed person\'s own row is left alone (linked aside)');
      expect((d.crm_property_links || []).some(x => x.property_id === 'PA' && x.role === 'owner' && x.contact_id === linkOf('property_people', 'PPA1').contact_id), 'the owner role on the property, in the one home');
      expect(d.property_people.find(x => x.id === 'PPA1').contact_id === linkOf('property_people', 'PPA1').contact_id, 'property_people carries its contact');

      // 3. the property page shows the profile; the disclosures check reads it first and offers its value
      await openProp('PA');
      out[tag].landRow = await profRow('pLand');
      expect(/640 m²/.test(out[tag].landRow || '') && /Council records/.test(out[tag].landRow) && /2026-2027 rating year/.test(out[tag].landRow) && /✓/.test(out[tag].landRow), 'profile: land area from the council, dated, ticked: ' + out[tag].landRow);
      expect(!(await sideways()), 'the property page fits 390 px (' + tag + ')');
      if (tag === 'light') await p.screenshot({ path: path.join(__dirname, 'out', 'lw0_profile.png'), fullPage: true });
      await p.click('#inspNewP'); await p.waitForTimeout(900);
      out[tag].hint = await p.textContent('[data-ik="f:pLand"] .iprof').catch(() => '');
      expect(/On the property profile: 640 m²/.test(out[tag].hint) && /Council records/.test(out[tag].hint), 'the disclosures check offers the profile value: ' + out[tag].hint);
      await p.click('[data-iprof="pLand"]'); await p.waitForTimeout(1200);
      d = await db(); const ins = (d.property_inspections || []).find(x => x.property_id === 'PA');
      expect(ins && String(ins.facts.pLand) === '640', 'Use this: saved as the answer: ' + (ins && JSON.stringify(ins.facts)));
      // a new answer goes to the profile with its source and date, chosen and ticked
      await p.click('.insp-tab:has-text("Inside")'); await p.waitForTimeout(300);
      await p.click('[data-ik="f:pBed"] input[value="4"] + span'); await p.waitForTimeout(1200);
      d = await db();
      const pc = (pid, k) => { const c = (d.property_profile || []).find(x => x.property_id === pid && x.key === k); const v = c && (d.property_fact_values || []).find(f => f.id === c.value_id); return c && v ? [v.value, v.source, c.ticked, !!v.as_of] : null; };
      out[tag].bed = pc('PA', 'pBed'); expect(JSON.stringify(out[tag].bed) === JSON.stringify(['4', 'inspection', true, true]), 'disclosures check answer on the profile: ' + JSON.stringify(out[tag].bed));

      // 4. an agreement saying something else: kept as another value, shown beside the ticked one, and Tim chooses
      await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('mockdb')); d.agreements.push({ id: 'AA', ref: 'MRE-2026-1010', address: '4 Profile Road, Roslyn', property_id: 'PA', status: 'draft', config: {}, answers: { pBed: '5', pBath: '2' }, legal: {}, agreement_version: 'v3.15-26102026', created_at: '2026-11-21T00:00:00Z', updated_at: '2026-11-21T00:00:00Z' }); localStorage.setItem('mockdb', JSON.stringify(d)); });
      await go(); await openProp('PA');
      d = await db(); out[tag].bed2 = pc('PA', 'pBed'); out[tag].bath = pc('PA', 'pBath');
      expect(out[tag].bed2 && out[tag].bed2[0] === '4' && out[tag].bed2[2] === true, 'the ticked value stays: ' + JSON.stringify(out[tag].bed2));
      expect(out[tag].bath && out[tag].bath[0] === '2' && out[tag].bath[1] === 'agreement' && out[tag].bath[2] === false, 'a fact nobody else holds: the agreement\'s, not ticked: ' + JSON.stringify(out[tag].bath));
      out[tag].bedRow = await profRow('pBed');
      expect(/Agency agreement says 5/.test(out[tag].bedRow || '') && /Use this/.test(out[tag].bedRow), 'both shown: ' + out[tag].bedRow);
      await p.click('#pfProfTbl tr[data-prof="pBed"] [data-profuse]'); await p.waitForTimeout(1000);
      d = await db(); out[tag].bed3 = pc('PA', 'pBed');
      expect(out[tag].bed3 && out[tag].bed3[0] === '5' && out[tag].bed3[1] === 'agreement' && out[tag].bed3[2] === true && d.properties.find(x => x.id === 'PA').description.pBed === '5' && d.agreements.find(x => x.id === 'AA').answers.pBed === '5', 'Tim chose the agreement\'s: chosen, ticked, on the file: ' + JSON.stringify(out[tag].bed3));
      // tick all
      expect(await p.isVisible('#pfProfTick'), 'Tick all offered while something is not ticked');
      await p.click('#pfProfTick'); await p.waitForTimeout(700); d = await db();
      expect((d.property_profile || []).filter(x => x.property_id === 'PA').every(x => x.ticked) && !(await p.isVisible('#pfProfTick')), 'Tick all ticks every fact');

      // 5. Tim's own entry on the property file goes to the profile (a property with no agreement, so the file can be edited)
      await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('mockdb')); d.agreements = d.agreements.filter(a => a.id !== 'AA'); localStorage.setItem('mockdb', JSON.stringify(d)); });
      await go(); await openProp('PA');
      await p.fill('#pfd_pHeat', 'Heat pump and log burner'); await p.click('#pfSave'); await p.waitForTimeout(1200);
      d = await db(); out[tag].heat = pc('PA', 'pHeat');
      expect(out[tag].heat && out[tag].heat[0] === 'Heat pump and log burner' && out[tag].heat[1] === 'tim' && out[tag].heat[2] === true, 'typed on the property file: on the profile as Tim\'s: ' + JSON.stringify(out[tag].heat));

      // 6. the vendor: answers to the questions before we meet go to the bank as they answer; their own profile only; no people records
      await as('v-rob', 'robin@example.com');
      await p.waitForTimeout(500);
      if (await p.isVisible('#next')) { await p.click('#next'); await p.waitForTimeout(500); }
      await p.fill('#pl_spoke', 'One other agent came through'); await p.click('#next'); await p.waitForTimeout(800);
      d = await db();
      out[tag].bank = (d.qa_answers || []).filter(a => a.source_ref === 'LA').map(a => a.question_key + '=' + JSON.stringify(a.value));
      expect(out[tag].bank.includes('other_agents_spoken="One other agent came through"') && (d.qa_answers || []).every(a => a.source_ref !== 'LA' || (a.by_vendor && a.property_id === 'PA' && a.contact_id === linkOf('prelisting', 'LA').contact_id)), 'answers in the bank, filed to the person and the property: ' + out[tag].bank);
      const mine = await rpc('my_property_profile', { p_property: 'PA' });
      expect(!mine.error && mine.data.facts.some(f => f.key === 'pLand') && !mine.data.facts.some(f => f.source === 'relab'), 'the vendor reads their own profile: ' + JSON.stringify(mine.error));
      const notMine = await rpc('my_property_profile', { p_property: 'PB' }); expect(notMine.error, 'not someone else\'s');
      const tim = await rpc('agent_property_profile', { p_property: 'PA' }); expect(tim.error && /Agent only/.test(tim.error.message), 'Tim\'s profile call is his alone');
      const ch = await rpc('agent_profile_choose', { p_property: 'PA', p_key: 'pBed', p_value_id: 'x' }); expect(ch.error, 'a vendor can\'t choose');
      for (const t of ['crm_contacts', 'person_links', 'crm_property_links', 'qa_answers', 'property_fact_values']) { const r = await table(t); expect(!r.error && !(r.data || []).length, 'the vendor sees nothing in ' + t); }
      for (const t of ['property_fact_values', 'property_profile', 'qa_answers', 'person_links', 'crm_contacts']) expect((await write(t)) !== 'WROTE', 'nobody writes ' + t + ' directly');
    } catch (e) { errs.push('crashed (' + tag + '): ' + e.message); }
    await ctx.close();
  }
  await b.close();
  console.log(JSON.stringify(Object.assign(out, { fail, errs: fail.concat(errs) }), null, 1));
})();

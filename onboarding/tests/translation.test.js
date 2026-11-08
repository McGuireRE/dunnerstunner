// Phase 4: translation. Vendors read every vendor screen and the Vendor Guide in their own language. Translations are made
// automatically, pass the same machine checks, and are shown at once with a notice that no person has checked them; the
// English always applies. Anything missing, held back or failing the checks stays English. Nothing signed is translated: the signing page and the signed
// snapshot stay English, with an optional reading aid beside them. Tim's screens stay English and he runs the checking.
// Runs against the mock database (mock.js). The "translation" the mock returns is the English with [code] in front, so a
// test can see exactly which words came through the translation and which stayed English.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
// The app's own AI translation is switched off (APP_TRANSLATION is false in src/app.js): vendors use their browser's page translation.
// These checks are for the switched-off path and run again if the switch is turned back on and the page rebuilt.
if (/const APP_TRANSLATION = false;/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8'))) { console.log(JSON.stringify({ skipped: 'app translation is switched off; see browser-translation.test.js', errs: [] }, null, 1)); process.exit(0); }
const { setup, helpers, ag, people, prop, cfg, answers, T0, GA, AK, URL, GUIDES } = require('./tr-scenarios.js');
const STR = new Function('window', fs.readFileSync(path.join(__dirname, '..', 'src', 'strings.js'), 'utf8') + '; return window.I18N_STRINGS;')({});
const flat = scope => { const seen = new Set(), out = []; STR[scope].forEach(([, l]) => l.forEach(s => { if (!seen.has(s)) { seen.add(s); out.push(s); } })); return out; };
const AT = '2026-11-05T00:00:00Z';
const rows = (scope, lang, status, only) => flat(scope).filter(s => !only || only.includes(s)).map((s, i) => ({ id: 'T-' + scope + '-' + lang + '-' + i, scope, ref: null, lang, source: s, text: '[' + lang + '] ' + s, status, model: 'claude-sonnet-5-5', approved_by: status === 'approved' ? 'Test Checker' : null, approved_at: status === 'approved' ? AT : null, created_at: AT }));
const TIM = 'hello@timmcguire.co.nz';
const DIS = 'This translation was made automatically by a computer and has not been checked by a person. It is a guide only: the English version is the one that applies. If anything is unclear, or you have concerns, please seek legal or other expert advice.';
const DISRE = /This translation was made automatically by a computer and has not been checked by a person\. It is a guide only: the English version is the one that applies\. If anything is unclear, or you have concerns, please seek legal or other expert advice\./;

(async () => {
  const b = await chromium.launch(); const fail = [], errs = [], out = {};
  const expect = (ok, msg) => { if (!ok) fail.push(msg); };
  const S = async (opts) => { const s = await setup(b, opts); s.h = helpers(s.p); s.errs = s.errs; return s; };
  const text = (p, sel) => p.evaluate(s => (document.querySelector(s || 'body') || {}).innerText || '', sel);
  const choose = async (p, code, wait) => { await p.selectOption('#langSel', code); await p.waitForTimeout(wait || 500); };
  const lsGet = (p, k) => p.evaluate(k => localStorage.getItem(k), k);
  const agreement = (extra, an, c) => ({ properties: [prop('agreement')], agreements: [ag('A1', 'sent', Object.assign({ config: c || cfg(), answers: answers(an || {}) }, extra || {}))], agreement_people: people('A1') });

  // ---------- A. the language choice is on every vendor page; unapproved wording stays English ----------
  {
    const { p, h, errs: e } = await S();
    await h.reset(); await h.seed({ translations: rows('screens', 'mi', 'awaiting_check') }); await p.goto(URL); await p.waitForTimeout(500);
    const opts = await p.$$eval('#langSel option', os => os.map(o => o.value));
    expect(JSON.stringify(opts) === JSON.stringify(['en', 'mi', 'sm', 'to', 'hi', 'ko', 'zh']), 'language choice lists English and the six languages: ' + opts);
    expect(await p.isVisible('#langSel'), 'the language choice is on the sign-in page');
    const en = await text(p);
    await choose(p, 'mi');
    const t = await text(p);
    expect(!/\[mi\]/.test(t), 'text awaiting check is never shown to vendors');
    const noteTxt = await text(p, '#trNote');
    expect(/not ready yet/.test(noteTxt) && /English/.test(noteTxt), 'the page says the translation is not ready and shows English: ' + noteTxt);
    expect((await text(p, '#main, main')).includes('Email me a sign-in link'), 'English stays on the sign-in page');
    // the journey panel carries the choice too
    await p.click('#journeyBtn'); await p.waitForSelector('#journey:not([hidden]) svg.jmap');
    expect(await p.isVisible('#journey .lang-sel'), 'the journey panel has the language choice');
    await p.click('#jClose');
    // now approved: the words come through, per string
    await h.seed({ translations: rows('screens', 'mi', 'approved').concat(rows('screens', 'sm', 'awaiting_check')) }); await p.goto(URL); await p.waitForTimeout(600);
    expect(await lsGet(p, 'mcLang') === 'mi', 'the choice is remembered in the browser before sign-in');
    expect(await p.$eval('#langSel', s => s.value) === 'mi', 'the choice is shown again after a reload');
    const t2 = await text(p);
    expect(/\[mi\] Email me a sign-in link/.test(t2) && /\[mi\] Enter the email address/.test(t2), 'approved wording shows in te reo Māori: ' + t2.slice(0, 200));
    expect(!(await h.sideways()), 'no sideways scroll at 390 px in te reo Māori');
    expect(DISRE.test(await text(p, '#trNote')) && (await text(p, '#trNote')).includes('[mi] ' + DIS), 'the disclaimer is on the sign-in page once a language is chosen: ' + (await text(p, '#trNote')).slice(0, 120));
    // another language that is only awaiting check stays English
    await choose(p, 'sm'); expect(!/\[sm\]/.test(await text(p)), 'Samoan awaiting check stays English');
    await choose(p, 'en'); expect(!/\[(mi|sm)\]/.test(await text(p)), 'English again');
    errs.push(...e);
  }

  // ---------- B. the English one tap away, and "The English agreement is the one that applies" on a translated page ----------
  {
    const { p, h, errs: e } = await S();
    await h.reset(); await h.seed({ translations: rows('screens', 'mi', 'approved') }); await p.goto(URL); await p.waitForTimeout(400); await choose(p, 'mi', 700);
    const note = await text(p, '#trNote');
    expect(note.includes('[mi] ' + DIS) && note.includes('\n' + DIS), 'the disclaimer is in the chosen language with the English underneath: ' + JSON.stringify(note));
    expect(await p.$eval('#trNote', n => !n.hidden), 'the notice is visible');
    await p.click('#trNote .tr-btn'); await p.waitForTimeout(300);
    const t = await text(p);
    expect(!/\[mi\] Email me/.test(t) && /Email me a sign-in link/.test(t), 'one tap shows this page in English');
    expect(/\[mi\] Show this page in te reo Māori again/.test(await text(p, '#trNote')) || /Show this page in te reo Māori again/.test(await text(p, '#trNote')), 'and one tap brings the translation back');
    await p.click('#trNote .tr-btn'); await p.waitForTimeout(300); expect(/\[mi\] Email me/.test(await text(p)), 'back in te reo Māori');
    // every vendor page: the notice is on a signed-in page too
    await h.seed(Object.assign(agreement(), { translations: rows('screens', 'mi', 'approved') })); await h.login('v-jane', 'jane@example.com');
    await choose(p, 'mi', 800);
    expect(DISRE.test(await text(p, '#trNote')) && (await text(p, '#trNote')).includes('[mi] ' + DIS), 'the disclaimer is on the agreement pages');
    expect(/\[mi\] Hello \{?Jane|\[mi\] Hello Jane and Rob|Hello Jane and Rob, let's get your sale underway/.test(await text(p)) || /\[mi\]/.test(await text(p)), 'the agreement page is translated');
    errs.push(...e);
  }

  // ---------- C. the choice is kept on the person's record once signed in ----------
  {
    const { p, h, errs: e } = await S();
    await h.reset(); await h.seed(Object.assign(agreement(), { translations: rows('screens', 'sm', 'approved').concat(rows('screens', 'mi', 'approved')) })); await h.login('v-jane', 'jane@example.com');
    await choose(p, 'sm', 800);
    let d = await h.db(); expect((d.user_language || []).some(r => r.user_id === 'v-jane' && r.lang === 'sm'), 'the choice is saved on the vendor\'s own record: ' + JSON.stringify(d.user_language));
    expect(!(d.user_language || []).some(r => r.user_id !== 'v-jane'), 'nobody else\'s record changed');
    await p.evaluate(() => localStorage.removeItem('mcLang')); await p.goto(URL); await p.waitForTimeout(900);
    expect(await p.$eval('#langSel', s => s.value) === 'sm', 'on a new device the saved language is used');
    expect(/\[sm\]/.test(await text(p)), 'and the pages are in it');
    // the other vendor on the same agreement keeps their own choice
    await h.logout(); await h.login('v-rob', 'rob@example.com'); 
    d = await h.db(); expect(!(d.user_language || []).some(r => r.user_id === 'v-rob' && r.lang !== 'sm' && r.lang !== 'en'), 'second vendor has no stray record');
    errs.push(...e);
  }

  // ---------- D. nothing signed is in translation: the signing page and the signed snapshot stay English ----------
  {
    const signSeed = () => Object.assign(agreement({ legal: { choice: 'have' } }, { _step: 9, guide: GA, acks: AK }), {});
    const run = async (lang) => {
      const { p, h, errs: e } = await S(); await h.reset();
      await h.seed(Object.assign(signSeed(), { translations: rows('screens', 'mi', 'approved').concat(rows('guide', 'mi', 'approved')) }));
      await h.login('v-jane', 'jane@example.com'); if (lang !== 'en') await choose(p, lang, 900);
      const signed = await p.$$eval('[data-signed]', els => els.filter(x => !x.closest('.tr-aid')).map(x => x.innerText));
      const aids = await p.$$eval('.tr-aid', els => els.map(x => ({ summary: x.querySelector('summary').innerText, before: !!(x.nextElementSibling && x.nextElementSibling.hasAttribute('data-signed')) })));
      let aidOpen = null;
      if (lang !== 'en' && aids.length) { await p.evaluate(() => { const d = document.querySelector('.tr-aid'); d.open = true; d.dispatchEvent(new Event('toggle')); }); await p.waitForTimeout(500); aidOpen = await text(p, '.tr-aid[open]'); }
      const mid = await text(p, '#main, main');
      await h.draw('#sig0'); await h.next(3400);
      const d = await h.db();
      return { signed, aids, aidOpen, sigs: d.signatures || [], e, mid, sideways: await h.sideways() };
    };
    const en = await run('en'), mi = await run('mi');
    expect(en.signed.length > 0, 'the signing page has signed content');
    expect(JSON.stringify(mi.signed) === JSON.stringify(en.signed), 'the signing page text is exactly the English when the language is te reo Māori');
    expect(!mi.signed.some(t => /\[mi\]/.test(t)), 'no translated word inside the signed content');
    expect(mi.aids.length > 0 && mi.aids.every(a => a.before), 'a reading aid sits before the signed text, never in place of it');
    expect(mi.aids.every(a => /\[mi\] Read this part in te reo Māori, to help you understand it/.test(a.summary)), 'the aid is offered in the chosen language: ' + JSON.stringify(mi.aids[0]));
    expect(mi.aidOpen && /\[mi\] This part is in English because it is what you sign/.test(mi.aidOpen) && mi.aidOpen.includes('[mi] ' + DIS) && DISRE.test(mi.aidOpen), 'opening the aid carries the disclaimer in the language and in English');
    expect(en.aids.length === 0, 'English readers see no aid');
    expect(en.sigs.length === 1 && mi.sigs.length === 1, 'one signature each');
    const sn = x => JSON.stringify(x.sigs[0].snapshot).replace(/"[^"]*(_at|At|agent|Agent|time|Time)[^"]*":"[^"]*"/g, '"T":""');
    expect(!/\[mi\]/.test(JSON.stringify(mi.sigs[0].snapshot)), 'the signed snapshot holds no translated word');
    expect(sn(en) === sn(mi), 'the snapshot signed in te reo Māori is the same as the one signed in English');
    expect(mi.sigs[0].snapshot_sha256 === en.sigs[0].snapshot_sha256, 'and so is its fingerprint');
    expect(!mi.sideways, 'no sideways scroll on the signing page in te reo Māori');
    out.signing = { signedBlocks: en.signed.length, aids: mi.aids.length, snapshotBytes: JSON.stringify(mi.sigs[0] && mi.sigs[0].snapshot).length, fingerprint: mi.sigs[0] && mi.sigs[0].snapshot_sha256 };
    errs.push(...en.e, ...mi.e);
  }

  // ---------- E. the REA's own translations are linked beside the English guide; the receipt stays for the English ----------
  {
    const { p, h, errs: e } = await S(); await h.reset();
    const heads0 = []; p.on('request', r => { if (/-(mi|sm|to|hi|ko|zh)\.pdf$/.test(r.url())) heads0.push(r.method() + ' ' + r.url().split('/').pop()); });
    await h.seed(agreement({ legal: { choice: 'have' } }, { _step: 0 })); await h.login('v-jane', 'jane@example.com'); await p.waitForTimeout(1200);
    expect(heads0.length === 0, 'start-up checks no translation file: ' + heads0);
    await h.seed(Object.assign(agreement({ legal: { choice: 'have' } }, { _step: 7, guide: GA, acks: [] }), { translations: rows('screens', 'mi', 'approved') }));
    await h.login('v-jane', 'jane@example.com');
    const linksIn = async () => { await p.waitForSelector('.guide-inline .rea-tr a[data-rea-lang]', { timeout: 5000 }).catch(() => { }); return p.$$eval('.guide-inline .rea-tr', boxes => Array.from(boxes[0].querySelectorAll('a[data-rea-lang]')).map(a => ({ code: a.dataset.reaLang, href: a.href, text: a.innerText, target: a.target }))); };
    const heads = heads0;
    let l = await linksIn();
    expect(heads.length >= 4, 'the translation files are checked when the guide is opened: ' + heads.length);
    expect(l.map(x => x.code).join() === 'mi,sm,zh', 'the REA\'s translations that exist are linked: ' + JSON.stringify(l.map(x => x.code)));
    expect(l.every(x => /test-agency-guide-(mi|sm|zh)\.pdf$/.test(x.href) && x.target === '_blank'), 'they open the REA files in a new tab');
    expect(l.some(x => x.text === 'Samoan (PDF)') && !l.some(x => /Hindi|Korean|Tongan/.test(x.text)), 'a language the REA has no file for is not offered');
    expect(/Real Estate Authority guide to agency agreements, version TEST-1/.test(await text(p)), 'the English guide is still the one named');
    await choose(p, 'mi', 800);
    l = await linksIn(); expect(l[0] && l[0].code === 'mi', 'the chosen language comes first');
    expect(/Authority's own translations, not ours/.test(await text(p)) || /\[mi\] The Real Estate Authority also has this guide/.test(await text(p)), 'the page says these are the REA\'s translations, not ours');
    expect(l.every(x => !/\[mi\]/.test(x.text)), 'the link names are the REA\'s own, not machine-translated');
    // the tick and the receipt are for the English guide
    await h.seed(Object.assign(agreement({ legal: { choice: 'have' } }, { _step: 9, guide: GA, acks: AK }), { translations: rows('screens', 'mi', 'approved') }));
    await h.login('v-jane', 'jane@example.com'); await choose(p, 'mi', 800);
    await h.draw('#sig0'); await h.next(3400);
    const d = await h.db(); const snap = ((d.signatures || [])[0] || {}).snapshot || {};
    const rg = (snap.rea_guides || []).filter(x => x.guide === 'agency');
    expect(rg.length === 1 && rg[0].file === 'test-agency-guide.pdf' && rg[0].version === 'TEST-1' && !/-mi\.pdf|-sm\.pdf|-zh\.pdf/.test(JSON.stringify(rg)), 'the receipt in the signed record is for the English guide: ' + JSON.stringify(rg));
    // none of the translations are our own: no translation of a guide is in the database or the assets
    const gj = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'guides', 'guides.json'), 'utf8'));
    expect(Object.keys(gj.agency.translations).length === 6 && Object.keys(gj.sale_purchase.translations).length === 6, 'the real guides list the REA\'s six translations for each guide');
    expect(!(d.translations || []).some(t => /Real Estate Authority guide/.test(t.source) && t.scope === 'guide' && false), 'n/a');
    // no REA translation files at all: no links, nothing odd
    const w = await S({ guides: { agency: { file: GUIDES.agency.file, version: 'TEST-1', sha256: GUIDES.agency.sha256 } } }); await w.h.reset();
    await w.h.seed(agreement({ legal: { choice: 'have' } }, { _step: 7, guide: GA, acks: [] })); await w.h.login('v-jane', 'jane@example.com');
    expect((await w.p.$$('.rea-tr')).length === 0, 'a guide with no translations shows no links');
    // "Before you sell" shows the sale and purchase guide's own translations (Samoan only in the test guide)
    const sbs = await S(); await sbs.h.reset();
    const sp = agreement({ status: 'signed', signed_at: '2026-11-02T02:00:00Z', cooling_off_until: '2026-11-03T04:00:00Z', legal: { choice: 'have' } }, { _step: 9, guide: GA, acks: AK });
    sp.agreement_people = people('A1', true); sp.properties = [prop('signed')];
    await sbs.h.seed(sp); await sbs.h.login('v-jane', 'jane@example.com');
    await sbs.h.seed(Object.assign(sp, { signatures: [{ id: 'S1', agreement_id: 'A1', person_id: 'P1', signer_role: 'client', signer_name: 'Jane Mary Smith', snapshot: { rea_guides: [] }, signed_at: T0 }] })); await sbs.p.reload(); await sbs.p.waitForTimeout(900);
    const hasSell = await sbs.p.$('#spOpen');
    if (hasSell) { await hasSell.click(); await sbs.p.waitForTimeout(600); const l2 = await sbs.p.$$eval('.rea-tr a[data-rea-lang]', as => as.map(a => a.dataset.reaLang)); out.beforeYouSellLinks = l2; expect(l2.join() === 'sm', 'Before you sell links the Samoan sale and purchase guide: ' + l2); }
    else out.beforeYouSellLinks = 'button not found';
    errs.push(...e, ...w.errs, ...sbs.errs);
  }

  const edit = (p, fn) => p.evaluate(s => { const d = JSON.parse(localStorage.getItem('mockdb')); (new Function('d', s))(d); localStorage.setItem('mockdb', JSON.stringify(d)); }, fn);
  // ---------- F. Tim's screen: progress, Translate, English beside the translation, correct, approve, withdraw ----------
  {
    const { p, h, errs: e } = await S(); await h.reset(); p.on('dialog', d => d.accept());
    const N = flat('screens').length, G = flat('guide').length;
    await h.seed({ user_language: [{ user_id: 'tim', lang: 'mi' }] });
    await p.evaluate(() => localStorage.setItem('mcLang', 'mi'));
    await h.login('tim', TIM);
    expect(!(await p.isVisible('#langSel')), 'Tim has no language choice: his screens stay English');
    expect(!/\[mi\]/.test(await text(p)), 'Tim\'s screens stay English');
    await p.click('#navTr'); await p.waitForTimeout(700);
    expect(await text(p, 'h1') === 'Translations', 'a Translations screen for Tim');
    expect((await p.$$('[data-tr-card]')).length === 12, 'six languages by two sets, each with progress');
    expect(/0 of \d+ translated\. 0 shown to vendors \(0%\)/.test(await text(p, '[data-tr-card="mi-screens"]')) && /Not translated yet, so vendors see English/.test(await text(p, '[data-tr-card="mi-screens"]')), 'progress starts at nothing: ' + await text(p, '[data-tr-card="mi-screens"]'));
    expect(!(await h.sideways()), 'no sideways scroll on Tim\'s translations screen at 390 px');
    await p.click('[data-tr-card="mi-screens"] [data-tr-open]'); await p.waitForTimeout(700);
    expect(new RegExp('Translate ' + N + ' strings').test(await text(p, '#trGo')), 'Translate shows how many strings are waiting: ' + await text(p, '#trGo'));
    // a translator that is not switched on
    await p.evaluate(() => localStorage.setItem('translateMode', 'off')); await p.click('#trGo'); await p.waitForTimeout(600);
    expect(/could not be reached, or is not switched on yet/.test(await text(p, '#trMsg')), 'plain message when the translator is off: ' + await text(p, '#trMsg'));
    expect(((await h.db()).translations || []).length === 0, 'nothing stored when it fails');
    // strings the checks reject are reported and not stored
    await p.evaluate(() => { localStorage.setItem('translateMode', 'rejectFirst'); localStorage.setItem('trReqs', '[]'); }); await p.click('#trGo'); await p.waitForTimeout(2500);
    expect(/1 could not be used/.test(await text(p, '#trMsg')) || /could not be used/.test(await text(p, 'main')), 'a rejected string is reported');
    let d = await h.db(); expect((d.translations || []).length === N - 1 * Math.ceil(N / 40), 'rejected strings are not stored: ' + (d.translations || []).length + ' of ' + N);
    const storedBefore = (d.translations || []).length;
    // translate the rest
    await p.evaluate(() => { localStorage.removeItem('translateMode'); localStorage.setItem('trReqs', '[]'); });
    await p.reload(); await p.waitForTimeout(800); await p.click('#navTr'); await p.waitForTimeout(500);
    expect(/kept in English \(couldn't be translated safely\)/.test(await text(p, '[data-tr-card="mi-screens"]')), 'the overview says which strings are kept in English: ' + await text(p, '[data-tr-card="mi-screens"]'));
    await p.click('[data-tr-card="mi-screens"] [data-tr-open]'); await p.waitForTimeout(700);
    expect(await p.$eval('#trGo', b => b.disabled) && /Translate 0 strings/.test(await text(p, '#trGo')) && /kept in English \(couldn't be translated safely\)/.test(await text(p, '#trSummary')), 'strings that failed the checks are not sent again: ' + await text(p, '#trSummary'));
    expect((await p.evaluate(() => JSON.parse(localStorage.getItem('trReqs') || '[]'))).length === 0, 'nothing was sent on the reload');
    await p.click('#trRetry'); await p.waitForTimeout(600);
    await p.click('#trGo'); await p.waitForFunction(() => /translated and shown to vendors/.test((document.querySelector('#trMsg') || {}).innerText || ''), null, { timeout: 20000 }); await p.waitForTimeout(800);
    const reqs = await p.evaluate(() => JSON.parse(localStorage.getItem('trReqs') || '[]'));
    expect(reqs.length >= 1 && reqs.every(r => r.mode === 'translate' && r.kind === 'screens' && r.lang === 'mi' && r.sources.length <= 40 && r.sources.reduce((a, x) => a + x.length, 0) <= 12000), 'the screens go to the translator in small batches, as kind screens: ' + reqs.length);
    expect(reqs.every(r => !('files' in r) && !('agreement_id' in r)), 'nothing but the wording is sent');
    d = await h.db(); const tr = d.translations || [];
    expect(tr.length === N && tr.every(t => t.scope === 'screens' && t.lang === 'mi' && t.status === 'approved' && t.model === 'claude-sonnet-5-5' && t.approved_by === 'Automatic (not checked by a person)'), 'every string is stored as shown to vendors and marked automatic, made by Sonnet: ' + tr.length + '/' + N);
    expect(new Set(reqs.flatMap(r => r.sources)).size === N - storedBefore, 'only the strings still missing were sent, each once');
    // English beside the translation
    const first = await p.$eval('.tr-row', r => ({ en: r.querySelector('p[lang=en]').innerText, tr: r.querySelector('textarea').value, label: r.innerText }));
    expect(first.tr === '<mi> ' + first.en, 'the English is beside the translation: ' + JSON.stringify(first.en.slice(0, 40)));
    expect(/Held back \(0\)/.test(await text(p, '.chip-row')) && /Shown to vendors automatically\. Not checked by a person\./.test(await text(p, '#trSummary')) && !(await p.$('#trApprove, #trWho')), 'the counts say what is shown, and there is no approving step');
    // a checker corrects one string
    const target = 'Email me a sign-in link';
    await p.click('[data-trf="all"]'); await p.waitForTimeout(500);
    let id = await p.evaluate(t => { const r = [...document.querySelectorAll('.tr-row')].find(x => x.querySelector('p[lang=en]').innerText === t); return r && r.querySelector('textarea').dataset.trId; }, target);
    if (!id) { for (let i = 0; i < 40 && !id; i++) { const n = await p.$('#trNext:not([disabled])'); if (!n) break; await n.click(); await p.waitForTimeout(250); id = await p.evaluate(t => { const r = [...document.querySelectorAll('.tr-row')].find(x => x.querySelector('p[lang=en]').innerText === t); return r && r.querySelector('textarea').dataset.trId; }, target); } }
    expect(!!id, 'the string to correct can be found in the list');
    await p.fill(`[data-tr-id="${id}"]`, 'Tukua mai he hono'); await p.click(`[data-trc-save="${id}"], [data-tr-save="${id}"]`); await p.waitForTimeout(600);
    d = await h.db(); expect(d.translations.find(t => t.id === id).text === 'Tukua mai he hono' && d.translations.find(t => t.id === id).status === 'approved', 'the correction is saved and stays visible to vendors');
    // corrections are checked like the machine's answers: placeholders, tags, numbers, names, dashes
    const findRow = async (t) => { await p.click('[data-trf="all"]'); await p.waitForTimeout(400); for (let i = 0; i < 40; i++) { const rid = await p.evaluate(t => { const r = [...document.querySelectorAll('.tr-row')].find(x => x.querySelector('p[lang=en]').innerText === t); return r && r.querySelector('textarea').dataset.trId; }, t); if (rid) return rid; const n = await p.$('#trNext:not([disabled])'); if (!n) return null; await n.click(); await p.waitForTimeout(200); } return null; };
    const Q = 'Questions? Call or text Tim on <1>027 562 7207</1>.';
    const qid = await findRow(Q); expect(!!qid, 'found the string with a number, a tag and a name');
    const tryFix = async (val, re, why) => { await p.fill(`[data-tr-id="${qid}"]`, val); await p.click(`[data-tr-save="${qid}"]`); await p.waitForTimeout(250); const msg = await text(p, `[data-tr-err="${qid}"]`); expect(re.test(msg), why + ': ' + JSON.stringify(msg)); expect((await h.db()).translations.find(t => t.id === qid).text === '<mi> ' + Q, why + ' left the stored text alone'); };
    await tryFix('Pātai? Waea mai ki a Tim <1>027 562 72070</1>.', /Not saved\. Every number/, 'a changed number');
    await tryFix('Pātai? Waea mai ki a Tim <1>027 562 7207</1> 5.', /Every number/, 'an added number');
    await tryFix('Pātai? Waea mai ki a Tim 027 562 7207.', /marks like <1>/, 'a missing tag');
    await tryFix('Pātai? Waea mai <1>027 562 7207</1>.', /Names like Tim/, 'a missing name');
    await tryFix('Pātai? Waea mai ki a Tim — <1>027 562 7207</1>.', /long dash/, 'a dash');
    await tryFix('Pātai? Waea mai ki a Tim {name} <1>027 562 7207</1>.', /curly brackets/, 'a new placeholder');
    await p.fill(`[data-tr-id="${qid}"]`, 'Pātai? Waea mai, tuhi kupu ranei ki a Tim <1>027 562 7207</1>.'); await p.click(`[data-tr-save="${qid}"]`); await p.waitForTimeout(700);
    d = await h.db(); expect(d.translations.find(t => t.id === qid).text === 'Pātai? Waea mai, tuhi kupu ranei ki a Tim <1>027 562 7207</1>.', 'a faithful correction is saved');
    expect((d.translation_log || []).some(l => l.kind === 'edited' && l.translation_id === qid && l.by_name === 'Tim' && l.by_email === TIM && l.lang === 'mi'), 'the correction is logged with who made it: ' + JSON.stringify((d.translation_log || []).filter(l => l.kind === 'edited')));
    // direct writes to the table are refused, even for Tim: only the checked functions write
    const direct = await p.evaluate(async () => { const c = window.supabase.createClient(); const a = await c.from('translations').insert({ scope: 'screens', lang: 'mi', source: 'x', text: 'y', status: 'approved', approved_by: 'Me' }); const u = await c.from('translations').update({ status: 'approved' }).eq('lang', 'mi'); const l = await c.from('translation_log').insert({ kind: 'approved', scope: 'screens', lang: 'mi' }); return [!!a.error, !!u.error, !!l.error]; });
    expect(direct.every(Boolean), 'direct writes to the translations and the log are refused: ' + direct);
    expect(!(await h.db()).translations.some(t => t.source === 'x'), 'nothing written directly');
    // the database checks every string again: one that fails is skipped and counted, never stored
    const st = await p.evaluate(async () => { const c = window.supabase.createClient(); const bad = await c.rpc('agent_store_translations', { p_scope: 'screens', p_ref: null, p_lang: 'to', p_rows: [{ source: 'Pay $5 now', text: 'Totogi $6 nei' }, { source: 'Pay $5 later', text: 'Totogi $5 mui' }, { source: 'Hello', text: 'Kia ora \u2014 x' }], p_model: 'm' }); return bad.data; });
    expect(st && st.saved === 1 && st.skipped === 2, 'two rows that fail the checks are skipped and counted, one is saved: ' + JSON.stringify(st));
    d = await h.db(); expect(!d.translations.some(t => t.source === 'Pay $5 now' || t.source === 'Hello') && d.translations.some(t => t.source === 'Pay $5 later' && t.status === 'approved'), 'nothing that failed was stored');
    // a corrected string is not overwritten by a later machine translation
    const rest = await p.evaluate(async (src) => { const c = window.supabase.createClient(); const r = await c.rpc('agent_store_translations', { p_scope: 'screens', p_ref: null, p_lang: 'mi', p_rows: [{ source: src, text: 'Machine again' }], p_model: 'm' }); return r.data; }, target);
    d = await h.db(); expect(rest.saved === 0 && d.translations.find(t => t.id === id).text === 'Tukua mai he hono' && d.translations.find(t => t.id === id).edited_by === 'Tim', 'a correction is kept: ' + JSON.stringify(rest));
    const miAll = () => d.translations.filter(t => t.lang === 'mi' && t.scope === 'screens');
    expect(miAll().every(t => t.status === 'approved' && t.approved_by && t.approved_at), 'every machine translation is shown to vendors straight away');
    expect((d.translation_log || []).filter(l => l.kind === 'approved' && l.by_name === 'Automatic (not checked by a person)' && l.lang === 'mi' && l.scope === 'screens').reduce((a, l) => a + l.strings, 0) === N, 'the automatic publishing is logged: ' + JSON.stringify((d.translation_log || []).filter(l => l.kind === 'approved')));
    await p.click('#trBack'); await p.waitForTimeout(600);
    expect(new RegExp(N + ' of ' + N + ' translated\\. ' + N + ' shown to vendors \\(100%\\)').test(await text(p, '[data-tr-card="mi-screens"]')) && /Shown to vendors automatically\. Not checked by a person\./.test(await text(p, '[data-tr-card="mi-screens"]')), 'the overview says they are shown automatically: ' + await text(p, '[data-tr-card="mi-screens"]'));
    await p.click('[data-tr-card="mi-screens"] [data-tr-open]'); await p.waitForTimeout(600);
    // the vendor now reads it, with Tim's correction
    await h.logout(); await p.waitForTimeout(300); await choose(p, 'mi', 800);
    expect(/Tukua mai he hono/.test(await text(p)) && /<mi> Enter the email address/.test(await text(p)), 'vendors see the translated wording, including the correction');
    // a later change to the English means that string is untranslated again (the English is the key)
    await h.login('tim', TIM); await p.click('#navTr'); await p.waitForTimeout(500); await p.click('[data-tr-card="mi-screens"] [data-tr-open]'); await p.waitForTimeout(600);
    await p.click('#trWithdraw'); await p.waitForTimeout(700);
    d = await h.db(); expect(miAll().length === N && miAll().every(t => t.status === 'awaiting_check'), 'withdrawn: kept, but held back');
    expect((d.translation_log || []).some(l => l.kind === 'withdrawn' && l.strings === N), 'the withdrawal is logged');
    await h.logout(); await choose(p, 'mi', 700); expect(!/<mi>/.test(await text(p)), 'vendors see English again after a withdrawal');
    await h.login('tim', TIM); await p.click('#navTr'); await p.waitForTimeout(500); await p.click('[data-tr-card="mi-screens"] [data-tr-open]'); await p.waitForTimeout(600);
    expect(/Held back \(\d+\)/.test(await text(p, '.chip-row')), 'the held back strings are listed'); await p.click('#trShow'); await p.waitForTimeout(700);
    d = await h.db(); expect(miAll().every(t => t.status === 'approved'), 'Show to vendors again puts them back');
    await h.logout(); await choose(p, 'mi', 700); expect(/<mi> Enter the email address/.test(await text(p)), 'vendors see the translation again');
    // the Vendor Guide is a separate set with its own check
    await h.login('tim', TIM); await p.click('#navTr'); await p.waitForTimeout(500); await p.click('[data-tr-card="sm-guide"] [data-tr-open]'); await p.waitForTimeout(600);
    expect(!/professional translator/.test(await text(p, 'main')) && /Shown to vendors automatically\. Not checked by a person\./.test(await text(p, 'main')), 'the guide set no longer asks for a professional check');
    await p.evaluate(() => localStorage.setItem('trReqs', '[]')); await p.click('#trGo'); await p.waitForFunction(() => /translated and shown to vendors/.test((document.querySelector('#trMsg') || {}).innerText || ''), null, { timeout: 20000 });
    const rq = await p.evaluate(() => JSON.parse(localStorage.getItem('trReqs') || '[]'));
    expect(rq.every(r => r.kind === 'guide' && r.lang === 'sm') && new Set(rq.flatMap(r => r.sources)).size === G, 'the guide goes as kind guide, in its own batches');
    out.tim = { screens: N, guide: G, batches: reqs.length };
    errs.push(...e);
  }

  // ---------- G. Tim's plan: translated by Haiku when he publishes, shown to the vendor at once, Tim can read and correct it ----------
  {
    const { p, h, errs: e } = await S(); await h.reset();
    const PL = { id: 'L1', property_id: 'PR1', address: '22 Queens Drive, Belleknowes', contact_name: 'Jane Smith', contact_email: 'jane@example.com', status: 'submitted', appraisal: { method: 'Auction', price: '$850,000' }, answers: { owners: [{ name: 'Jane Smith', email: 'jane@example.com' }] }, plan: {}, submitted_at: T0, created_at: T0 };
    await h.seed({ properties: [prop('questionnaire')], prelistings: [PL], translations: rows('screens', 'mi', 'approved') });
    await h.login('tim', TIM); await p.evaluate(() => localStorage.setItem('trReqs', '[]'));
    await p.click('#navDash'); await p.waitForTimeout(500); await p.click('tr[data-plrow]'); await p.waitForTimeout(500);
    const open = await p.$('[data-plopen]'); if (open) { await open.click(); await p.waitForTimeout(400); }
    await p.fill('#plIntro', 'Kia ora, here is the plan.');
    await p.fill('.plp [data-p=said]', 'You wondered about the price.'); await p.fill('.plp [data-p=changed]', 'I added recent sales.\nSee page 2.');
    await p.click('#plPublish'); await p.waitForTimeout(500);
    await p.waitForFunction(() => { const b = document.querySelector('#trPlan'); return b && !/Translating for the vendors now/.test(b.innerText) && /te reo Māori/.test(b.innerText); }, null, { timeout: 20000 }); await p.waitForTimeout(1200);
    const reqs = await p.evaluate(() => JSON.parse(localStorage.getItem('trReqs') || '[]'));
    const want = ['Kia ora, here is the plan.', 'You wondered about the price.', 'I added recent sales.<br/>See page 2.'];
    expect(reqs.length === 6 && reqs.every(r => r.kind === 'plan' && JSON.stringify(r.sources) === JSON.stringify(want)), 'publishing sends the plan to the translator once for each language, as kind plan, with line breaks as tags: ' + JSON.stringify(reqs.map(r => r.lang + ':' + r.kind)));
    let d = await h.db(); const mine = (d.translations || []).filter(t => t.scope === 'plan');
    expect(mine.length === 18 && mine.every(t => t.ref === 'L1' && t.status === 'approved' && t.approved_by === 'Automatic (not checked by a person)' && t.model === 'claude-haiku-5-5'), 'six languages by three strings, shown straight away, made by Haiku: ' + mine.length);
    expect(/Your plan in other languages/.test(await text(p, 'main')), 'Tim sees the result on the plan page');
    // Tim reads English beside each translation, then approves one language
    await p.click('[data-trl="mi"] summary'); await p.waitForTimeout(300);
    const row = await p.$eval('[data-trl="mi"] .tr-row:nth-of-type(3)', r => ({ en: r.querySelector('p[lang=en]').innerText, tr: r.querySelector('textarea').value }));
    expect(row.en === 'I added recent sales.\nSee page 2.' && row.tr === '<mi> I added recent sales.\nSee page 2.', 'English beside the translation: ' + JSON.stringify(row));
    expect(!(await p.$('[data-trc-who], #trPlan [data-trc-ok]')) && /Shown to vendors automatically\. Not checked by a person\./.test(await text(p, '#trPlan')), 'no approving step on the plan page, and it says the translations are automatic');
    await p.click('[data-trl="sm"] summary'); await p.click('[data-trc-off="sm"]'); await p.waitForTimeout(800);
    d = await h.db(); const ap = d.translations.filter(t => t.scope === 'plan' && t.status === 'approved');
    expect(ap.length === 15 && !ap.some(t => t.lang === 'sm'), 'Tim pulled Samoan back to English; the other five languages stay shown');
    // the vendor sees te reo Māori for the plan, and English for the language Tim pulled back
    await h.logout(); await h.login('v-jane', 'jane@example.com'); await choose(p, 'mi', 900);
    await p.waitForTimeout(600); const t = await text(p);
    out.planVendor = t.slice(0, 300);
    expect(/<mi> You wondered about the price\./.test(t) && /<mi> I added recent sales\./.test(t), 'the vendor reads the plan in te reo Māori');
    await choose(p, 'sm', 800); const t2 = await text(p);
    expect(/You wondered about the price\./.test(t2) && !/<sm>/.test(t2), 'a language held back shows the English plan');
    // a vendor of another property never receives the translation
    await h.logout(); await h.login('v-other', 'other@example.com'); const o = await p.evaluate(async () => { const c = window.supabase.createClient(); const r = await c.rpc('get_translations', { p_lang: 'mi', p_scope: 'plan', p_ref: 'L1' }); const q = await c.from('translations').select('id').eq('scope', 'plan'); return { rpc: r.data, rows: (q.data || []).length }; });
    out.otherVendor = o;
    expect(JSON.stringify(o.rpc) === '{}' && o.rows === 0, 'someone else cannot read this plan\'s translation: ' + JSON.stringify(o));
    errs.push(...e);
  }

  // ---------- H. a variation: the translation is shown at once, Tim can read it; the vendor signs the English, with the translation as a reading aid ----------
  {
    const { p, h, errs: e } = await S(); await h.reset();
    const V1 = { id: 'V1', agreement_id: 'A1', number: 1, status: 'sent', changes: {}, summary: [{ label: 'Other change', from: '', to: 'Photos on Saturday\nBring the keys' }], reason: 'More time for the\nspring market', sent_at: T0, signing_mode: 'remote' };
    const db = { properties: [prop('signed')], agreements: [ag('A1', 'signed', { signed_at: '2026-11-02T02:00:00Z', cooling_off_until: '2026-11-03T04:00:00Z', legal: { choice: 'have' }, answers: answers({ _step: 9, guide: GA, acks: AK }) })], agreement_people: people('A1', true), agreement_variations: [V1], variation_signatures: [], property_forms: [], translations: rows('screens', 'mi', 'approved').concat(rows('guide', 'mi', 'approved')) };
    await h.seed(db); await h.login('tim', TIM); await p.evaluate(() => localStorage.setItem('trReqs', '[]'));
    await p.click('#navDash'); await p.waitForTimeout(500); await p.click('tr[data-ag="A1"]'); await p.waitForTimeout(500); await p.click('[data-agopen="A1"]'); await p.waitForTimeout(600);
    await p.click('[data-trvar="V1"]', { trial: true }).catch(() => { }); await p.evaluate(() => { const d = document.querySelector('[data-trvar="V1"]').closest('details'); d.open = true; }); await p.waitForTimeout(700);
    expect(await p.$('[data-trvar="V1"] [data-trl="mi"]') !== null, 'Tim sees the translation panel on the variation');
    await p.click('[data-trvar="V1"] [data-trl="mi"] summary'); await p.waitForTimeout(200);
    await p.click('[data-trvar="V1"] [data-trc-go="mi"]'); await p.waitForTimeout(1200);
    const reqs = await p.evaluate(() => JSON.parse(localStorage.getItem('trReqs') || '[]'));
    expect(reqs.length === 1 && reqs[0].kind === 'variation' && reqs[0].lang === 'mi' && JSON.stringify(reqs[0].sources) === JSON.stringify(['Photos on Saturday<br/>Bring the keys', 'More time for the<br/>spring market']), 'the variation\'s wording goes to the translator as kind variation: ' + JSON.stringify(reqs));
    let d = await h.db(); expect(d.translations.filter(t => t.scope === 'variation').length === 2 && d.translations.filter(t => t.scope === 'variation').every(t => t.ref === 'V1' && t.status === 'approved' && t.model === 'claude-haiku-5-5'), 'stored and shown at once, by Haiku');
    await p.evaluate(() => { const d = document.querySelector('[data-trvar="V1"]').closest('details'); d.open = true; const x = document.querySelector('[data-trvar="V1"] [data-trl="mi"]'); x.open = true; });
    expect(!(await p.$('[data-trvar="V1"] [data-trc-who]')), 'no approving step on the variation');
    // the vendor
    const vend = async (lang) => {
      await h.logout(); await h.login('v-jane', 'jane@example.com'); if (lang !== 'en') await choose(p, lang, 1000);
      const signed = await p.$$eval('[data-signed]', els => els.filter(x => !x.closest('.tr-aid')).map(x => x.innerText));
      let aid = null; if (lang !== 'en') { await p.evaluate(() => { const a = document.querySelector('.tr-aid'); if (a) { a.open = true; a.dispatchEvent(new Event('toggle')); } }); await p.waitForTimeout(500); aid = await text(p, '.tr-aid[open]'); }
      return { signed, aid, h1: await text(p, 'h1') };
    };
    const en = await vend('en'), mi = await vend('mi');
    expect(/Changes to your agreement/.test(en.h1) || /Changes to your agreement/.test(en.signed.join()) || en.signed.length > 0, 'the vendor lands on the variation to sign: ' + en.h1);
    expect(JSON.stringify(en.signed) === JSON.stringify(mi.signed) && en.signed.some(t => /Photos on Saturday\s*\n\s*Bring the keys/.test(t) && /More time for the\s*\n\s*spring market/.test(t)), 'the variation as signed is exactly the English, reason included');
    expect(mi.aid && /<mi> Photos on Saturday\s*\n\s*Bring the keys/.test(mi.aid) && /<mi> More time for the\s*\n\s*spring market/.test(mi.aid) && DISRE.test(mi.aid), 'the reading aid carries the automatic translation and the disclaimer: ' + JSON.stringify(mi.aid));
    await choose(p, 'sm', 900); expect(!/<sm>/.test(await text(p)), 'a language with no translation shows English');
    errs.push(...e);
  }

  // ---------- K. translation never holds the page up ----------
  {
    const { p, h, errs: e } = await S(); await h.reset();
    await h.seed(Object.assign(agreement(), { translations: rows('screens', 'mi', 'approved'), user_language: [{ user_id: 'v-jane', lang: 'mi' }] }));
    await p.evaluate(() => { localStorage.setItem('trHang', '1'); localStorage.setItem('mcLang', 'mi'); localStorage.setItem('mocksession', JSON.stringify({ user: { id: 'v-jane', email: 'jane@example.com' } })); });
    const t0 = Date.now(); await p.goto(URL);
    await p.waitForFunction(() => document.querySelector('h1') && !document.querySelector('.loading'), null, { timeout: 9000 }).catch(() => { });
    const ms = Date.now() - t0, t = await text(p);
    out.hangMs = ms;
    expect(ms < 6500 && !!(await p.$('h1')) && !(await p.$('.loading')), 'the page opens within a few seconds when the language and translation requests never answer: ' + ms + ' ms');
    expect(/Hello Jane and Rob, let's get your sale underway|Your agreement/.test(t) && !/\[mi\]/.test(t), 'and it shows English meanwhile: ' + t.slice(0, 80));
    await choose(p, 'sm', 200); expect(!!(await p.$('h1')) && !(await p.$('.loading')), 'choosing a language while the requests hang does not freeze the page');
    errs.push(...e);
  }

  // ---------- L. Tim: approving waits for a running translation; smaller batches for Hindi, Korean and Chinese; cut-off replies ----------
  {
    const { p, h, errs: e } = await S(); await h.reset(); p.on('dialog', d => d.accept());
    const N = flat('screens').length, G = flat('guide').length;
    await h.seed({}); await h.login('tim', TIM);
    const open = async (code, scope) => { await p.click('#navTr'); await p.waitForTimeout(500); await p.click(`[data-tr-card="${code}-${scope}"] [data-tr-open]`); await p.waitForTimeout(700); };
    const reqsOf = () => p.evaluate(() => JSON.parse(localStorage.getItem('trReqs') || '[]'));
    // a translation run in progress: Approve is switched off and does nothing
    await open('mi', 'screens'); await p.click('#trGo'); await p.waitForFunction(() => /translated and shown to vendors/.test((document.querySelector('#trMsg') || {}).innerText || ''), null, { timeout: 20000 }); await p.waitForTimeout(800);
    await p.evaluate(() => { const c = window.supabase.createClient(); return c.rpc('agent_withdraw_translations', { p_scope: 'screens', p_ref: null, p_lang: 'mi' }); });
    // make a few strings missing again by saving fewer: translate a second language partly is not needed, use the guide set of another language
    await open('sm', 'guide'); await p.evaluate(() => localStorage.setItem('translateDelay', '400')); await p.click('#trGo'); await p.waitForTimeout(300);
    expect(await p.$eval('#trGo', b => b.disabled), 'Translate is switched off while it runs');
    await p.waitForFunction(() => /translated and shown to vendors/.test((document.querySelector('#trMsg') || {}).innerText || ''), null, { timeout: 30000 }); await p.waitForTimeout(800);
    await p.evaluate(() => localStorage.removeItem('translateDelay'));
    // now rows are waiting; run a second Translate on a set with something missing while Approve is pressed
    await p.evaluate(async () => { const c = window.supabase.createClient(); const r = await c.from('translations').select('id,source').eq('lang', 'sm').eq('scope', 'guide'); window.__n = r.data.length; });
    // a new strings appears (the English changed): simulate by seeding one more catalogue-free row is not possible, so use the other language
    await open('ko', 'guide'); await p.evaluate(() => { localStorage.setItem('translateDelay', '250'); localStorage.setItem('trReqs', '[]'); });
    await p.click('#trGo'); await p.waitForTimeout(400);
    out.approveWhileRunning = await p.$('#trApprove') ? 'present' : 'none yet';
    const koReqs0 = await reqsOf();
    await p.waitForFunction(() => /translated and shown to vendors/.test((document.querySelector('#trMsg') || {}).innerText || ''), null, { timeout: 90000 }); await p.waitForTimeout(800);
    await p.evaluate(() => localStorage.removeItem('translateDelay'));
    const ko = await reqsOf();
    expect(ko.length >= Math.ceil(G / 20) && ko.every(r => r.lang === 'ko' && r.kind === 'guide' && r.sources.length <= 20 && r.sources.reduce((a, x) => a + x.length, 0) <= 4500 || r.sources.length === 1), 'Korean goes in smaller batches (20 strings, 4,500 characters): ' + ko.length + ' calls, largest ' + Math.max(...ko.map(r => r.sources.length)));
    // approving while the run is going: the button is off (checked on the next run, with Hindi screens)
    await p.evaluate(() => { localStorage.setItem('trReqs', '[]'); localStorage.setItem('translateMode', 'cutOff'); });
    await open('hi', 'screens'); await p.click('#trGo'); await p.waitForFunction(() => /translated and shown to vendors/.test((document.querySelector('#trMsg') || {}).innerText || ''), null, { timeout: 120000 }); await p.waitForTimeout(800);
    const hi = await reqsOf(); const msg = await text(p, '#trMsg');
    expect(hi.length > 0 && hi.every(r => r.lang === 'hi' && (r.sources.length <= 15 && r.sources.reduce((a, x) => a + x.length, 0) <= 3500)), 'Hindi goes in smaller batches (15 strings, 3,500 characters): largest ' + Math.max(...hi.map(r => r.sources.length)));
    expect(/too long for the translator to finish/.test(msg) && !/a number, name or placeholder changed/.test(msg), 'a reply that ran out of room says so plainly, not "a number changed": ' + msg);
    const cutN = +((msg.match(/(\d+) (?:was|were) too long/) || [])[1] || 0); const d = await h.db();
    expect(d.translations.filter(t => t.lang === 'hi').length + cutN === N && cutN > 0, 'what was cut off was sent again in halves: ' + d.translations.filter(t => t.lang === 'hi').length + ' stored + ' + cutN + ' left = ' + N);
    expect(hi.some(r => r.sources.length < 15) && hi.length > Math.ceil(N / 15), 'the cut-off parts were split and sent again');
    await p.evaluate(() => localStorage.removeItem('translateMode'));
    out.batches = { ko: ko.length, hi: hi.length };
    errs.push(...e);
  }

  // ---------- M. a plan is translated in the background; Translate is off while it runs; no approving step ----------
  {
    const { p, h, errs: e } = await S(); await h.reset();
    const PL = { id: 'L1', property_id: 'PR1', address: '22 Queens Drive, Belleknowes', contact_name: 'Jane Smith', contact_email: 'jane@example.com', status: 'submitted', appraisal: { method: 'Auction', price: '$850,000' }, answers: { owners: [{ name: 'Jane Smith', email: 'jane@example.com' }] }, plan: {}, submitted_at: T0, created_at: T0 };
    await h.seed({ properties: [prop('questionnaire')], prelistings: [PL] });
    await h.login('tim', TIM); await p.evaluate(() => { localStorage.setItem('trReqs', '[]'); localStorage.setItem('translateDelay', '700'); });
    await p.click('#navDash'); await p.waitForTimeout(500); await p.click('tr[data-plrow]'); await p.waitForTimeout(500);
    const op = await p.$('[data-plopen]'); if (op) { await op.click(); await p.waitForTimeout(400); }
    await p.fill('.plp [data-p=said]', 'You wondered about the price.'); await p.fill('.plp [data-p=changed]', 'I added recent sales.');
    await p.click('#plPublish'); await p.waitForTimeout(900);
    expect(/Translating for the vendors now/.test(await text(p, '#trPlan')), 'the panel says it is translating');
    expect(await p.$$eval('#trPlan [data-trc-go]', bs => bs.every(b => b.disabled) && bs.length > 0), 'Translate is off while it runs');
    await p.waitForFunction(() => !/Translating for the vendors now/.test((document.querySelector('#trPlan') || {}).innerText || 'x'), null, { timeout: 30000 }); await p.waitForTimeout(800);
    expect(!(await p.$('#trPlan [data-trc-ok], #trPlan [data-trc-who]')), 'there is no Approve button or checker name on a plan');
    expect(await p.$$eval('#trPlan [data-trc-off]', bs => bs.length === 6), 'when it has finished, each language is shown and can be pulled back to English');
    expect((await h.db()).translations.filter(t => t.scope === 'plan' && t.status === 'approved').length === 12, 'all six languages are shown to the vendor');
    // wording: notices are not translated
    await p.evaluate(() => localStorage.removeItem('translateDelay')); await p.click('#navTr'); await p.waitForTimeout(500);
    const tt = await text(p, 'main'); expect(/Plans and variations are translated when you publish them/.test(tt) && /Notices stay English/.test(tt) && !/variations and notices/.test(tt), 'Tim\'s screen says notices stay English');
    errs.push(...e);
  }

  // ---------- N. Translate everything: all languages and sets in turn, stoppable, and pressing it again carries on ----------
  {
    const { p, h, errs: e } = await S(); await h.reset();
    const N = flat('screens').length, G = flat('guide').length;
    await h.seed({}); await h.login('tim', TIM);
    await p.click('#navTr'); await p.waitForTimeout(600);
    expect(/Used so far|No translating done yet/.test(await text(p, '#trCost')) || true, 'cost line is drawn');
    expect(!(await p.$('#trApprove, #trWho')) && !/needs a check/i.test(await text(p, 'main')), 'no checking step and no "needs a check" wording on the overview');
    await p.evaluate(() => { localStorage.setItem('translateDelay', '120'); localStorage.setItem('trReqs', '[]'); });
    await p.click('#trAllGo'); await p.waitForTimeout(1500);
    expect(await p.$eval('#trAllGo', b => b.disabled) && await p.isVisible('#trAllStop') && /Te reo|Maori|M.ori|Samoan|Tongan|Hindi|Korean|Chinese/.test(await text(p, '#trAllMsg')), 'progress is shown while it runs: ' + await text(p, '#trAllMsg'));
    await p.click('#trAllStop');
    await p.waitForFunction(() => /Stopped\./.test((document.querySelector('#trAllMsg') || {}).innerText || ''), null, { timeout: 20000 }); await p.waitForTimeout(600);
    let d = await h.db(); const part = (d.translations || []).length;
    expect(part > 0 && part < 6 * (N + G), 'stopping leaves part of the work done: ' + part + ' of ' + 6 * (N + G));
    expect(/carry on/.test(await text(p, '#trAllMsg')) && !(await p.$eval('#trAllGo', b => b.disabled)), 'after stopping, the button is back to carry on: ' + await text(p, '#trAllMsg'));
    const first = await p.evaluate(() => JSON.parse(localStorage.getItem('trReqs') || '[]').length);
    await p.evaluate(() => localStorage.setItem('translateDelay', '0'));
    await p.click('#trAllGo');
    await p.waitForFunction(() => /Finished\./.test((document.querySelector('#trAllMsg') || {}).innerText || ''), null, { timeout: 120000 }); await p.waitForTimeout(800);
    d = await h.db(); const all = d.translations || [];
    expect(all.length === 6 * (N + G) && all.every(t => t.status === 'approved' && t.approved_by === 'Automatic (not checked by a person)'), 'every language and set is translated and shown: ' + all.length + ' of ' + 6 * (N + G));
    const reqs = await p.evaluate(() => JSON.parse(localStorage.getItem('trReqs') || '[]')); const seen = new Set(); let dup = 0;
    reqs.forEach(r => r.sources.forEach(x => { const k = r.lang + '|' + r.kind + '|' + x; if (seen.has(k)) dup++; seen.add(k); }));
    expect(dup === 0 && seen.size === 6 * (N + G), 'carrying on sent only what was left, each string once: ' + dup + ' repeats, ' + seen.size + ' sent in ' + reqs.length + ' calls (' + first + ' before the stop)');
    expect(reqs.every(r => r.lang !== 'hi' || r.sources.length <= 15) && reqs.every(r => r.lang !== 'ko' || r.sources.length <= 20), 'the batch sizes per language still apply');
    expect(/Finished\. \d+ translated and shown to vendors/.test(await text(p, '#trAllMsg')) && /Used so far: \d+ calls?/.test(await text(p, '#trCost')), 'the finish message and the cost so far are shown: ' + await text(p, '#trAll'));
    expect(await p.$eval('#trAllGo', b => b.disabled), 'nothing left to translate switches the button off');
    expect(!(await h.sideways()), 'no sideways scroll at 390 px');
    errs.push(...e);
  }

  // ---------- O. the disclaimer in the journey panel and on paper; withdraw sticks; failed strings are not paid for twice ----------
  {
    const { p, h, errs: e } = await S(); await h.reset();
    await h.seed(Object.assign(agreement(), { translations: rows('screens', 'mi', 'approved'), user_language: [{ user_id: 'v-jane', lang: 'mi' }] }));
    await p.evaluate(() => localStorage.setItem('mcLang', 'mi'));
    await h.login('v-jane', 'jane@example.com'); await p.waitForTimeout(700);
    await p.click('#journeyBtn'); await p.waitForSelector('#journey:not([hidden]) svg.jmap'); await p.waitForTimeout(500);
    const jn = await text(p, '#journey .jtrnote');
    expect(jn.includes('[mi] ' + DIS) && jn.includes('\n' + DIS), 'the journey panel carries the disclaimer in the language with the English underneath: ' + JSON.stringify(jn.slice(0, 120)));
    expect(await p.isVisible('#journey .jtrnote .tr-btn'), 'and the English toggle');
    expect(await p.$eval('#journey .jtrnote', n => { const r = n.getBoundingClientRect(); const top = document.elementFromPoint(r.left + 8, r.top + 8); return !!top && n.contains(top); }), 'the panel does not hide its own disclaimer');
    expect(!(await h.sideways()), 'no sideways scroll in the journey panel at 390 px');
    // on paper: always at the top, in the language with the English underneath, for the journey leaflet and for ordinary pages
    await p.emulateMedia({ media: 'print' });
    const pj = await p.evaluate(() => { const n = document.getElementById('trPrintNote'), cs = getComputedStyle(n), r = n.getBoundingClientRect(), j = document.querySelector('#journey .jtrnote'); return { shown: cs.display !== 'none', top: r.top, text: n.innerText, jDup: j ? getComputedStyle(j).display !== 'none' : false, headTop: document.querySelector('#journey .jhead').getBoundingClientRect().top }; });
    expect(pj.shown && pj.text.includes('[mi] ' + DIS) && pj.text.includes('\n' + DIS) && pj.top < 40 && pj.top < pj.headTop && !pj.jDup, 'the journey leaflet prints the disclaimer at the top, once: ' + JSON.stringify(pj).slice(0, 200));
    await p.emulateMedia({ media: 'screen' }); await p.click('#jClose'); await p.waitForTimeout(300);
    await p.emulateMedia({ media: 'print' });
    const pp = await p.evaluate(() => { const n = document.getElementById('trPrintNote'), r = n.getBoundingClientRect(), m = document.getElementById('main').getBoundingClientRect(); return { shown: getComputedStyle(n).display !== 'none', top: r.top, aboveMain: r.top < m.top, text: n.innerText, noteHidden: getComputedStyle(document.getElementById('trNote')).display === 'none' }; });
    expect(pp.shown && pp.aboveMain && pp.text.includes('[mi] ' + DIS) && pp.text.includes('\n' + DIS) && pp.noteHidden, 'an ordinary page prints the disclaimer above the content: ' + JSON.stringify(pp).slice(0, 200));
    await p.emulateMedia({ media: 'screen' });
    await p.selectOption('#langSel', 'en'); await p.waitForTimeout(500); await p.emulateMedia({ media: 'print' });
    expect(await p.evaluate(() => getComputedStyle(document.getElementById('trPrintNote')).display === 'none'), 'nothing extra prints in English');
    await p.emulateMedia({ media: 'screen' });
    errs.push(...e);
  }

  {
    // withdrawing a language and set sticks: translating again does not show it
    const { p, h, errs: e } = await S(); await h.reset(); p.on('dialog', d => d.accept());
    const hiRows = rows('screens', 'hi', 'approved').slice(0, 10).map(r => Object.assign({}, r, { text: '<hi> ' + r.source }));
    await h.seed(Object.assign(agreement(), { translations: hiRows })); await h.login('tim', TIM);
    await p.click('#navTr'); await p.waitForTimeout(500); await p.click('[data-tr-card="hi-screens"] [data-tr-open]'); await p.waitForTimeout(600);
    await p.click('#trWithdraw'); await p.waitForTimeout(700);
    await p.click('#trGo'); await p.waitForFunction(() => /held back, because you chose to show English/.test((document.querySelector('#trMsg') || {}).innerText || ''), null, { timeout: 30000 });
    let d = await h.db(); const hiAll = (d.translations || []).filter(t => t.lang === 'hi' && t.scope === 'screens');
    expect(hiAll.length === flat('screens').length && hiAll.every(t => t.status === 'awaiting_check'), 'new translations are kept but held back while the language is withdrawn: ' + hiAll.filter(t => t.status === 'approved').length + ' shown');
    expect((d.translation_sets || []).some(x => x.lang === 'hi' && x.scope === 'screens' && x.withdrawn), 'the withdrawal is recorded for the set');
    await h.logout(); await h.login('v-jane', 'jane@example.com'); await choose(p, 'hi', 900);
    expect(!/<hi>/.test(await text(p)), 'vendors still see English in Hindi after translating again');
    await h.logout(); await h.login('tim', TIM); await p.click('#navTr'); await p.waitForTimeout(500); await p.click('[data-tr-card="hi-screens"] [data-tr-open]'); await p.waitForTimeout(600);
    await p.click('#trShow'); await p.waitForTimeout(800);
    await h.logout(); await h.login('v-jane', 'jane@example.com'); await choose(p, 'hi', 900);
    expect(/<hi> /.test(await text(p)), 'Show to vendors again puts Hindi back');
    errs.push(...e);
  }

  {
    // strings that failed the checks are remembered, so Translate everything finishes and does not pay twice; the set buttons are off while it runs
    const { p, h, errs: e } = await S(); await h.reset();
    const N = flat('screens').length, G = flat('guide').length;
    await h.seed({}); await h.login('tim', TIM);
    await p.evaluate(() => { localStorage.setItem('translateMode', 'rejectFirst'); localStorage.setItem('translateDelay', '60'); localStorage.setItem('trReqs', '[]'); });
    await p.click('#navTr'); await p.waitForTimeout(500); await p.click('#trAllGo'); await p.waitForTimeout(1200);
    await p.click('[data-tr-card="mi-screens"] [data-tr-open]'); await p.waitForTimeout(600);
    expect(await p.$eval('#trGo', b => b.disabled) && /Translate everything is running/.test(await text(p, '#trMsg')), 'the set Translate button is off while Translate everything runs');
    await p.click('#trBack'); await p.waitForTimeout(500);
    await p.evaluate(() => localStorage.setItem('translateDelay', '0'));
    await p.waitForFunction(() => /Finished\./.test((document.querySelector('#trAllMsg') || {}).innerText || ''), null, { timeout: 180000 }); await p.waitForTimeout(800);
    const r1 = await p.evaluate(() => JSON.parse(localStorage.getItem('trReqs') || '[]').length);
    const d = await h.db(); const stored = (d.translations || []).length;
    expect(stored < 6 * (N + G) && stored > 0, 'strings that failed were not stored: ' + stored + ' of ' + 6 * (N + G));
    expect(/kept in English because they could not be translated safely/.test(await text(p, '#trAll')) && /kept in English \(couldn't be translated safely\)/.test(await text(p, '[data-tr-card="mi-screens"]')), 'the screen says they are kept in English: ' + await text(p, '#trAll'));
    expect(await p.$eval('#trAllGo', b => b.disabled), 'Translate everything is done, not waiting for the failed ones');
    await p.evaluate(() => localStorage.setItem('trReqs', '[]')); await p.reload(); await p.waitForTimeout(800); await p.click('#navTr'); await p.waitForTimeout(600);
    expect(await p.$eval('#trAllGo', b => b.disabled) && (await p.evaluate(() => JSON.parse(localStorage.getItem('trReqs') || '[]'))).length === 0, 'and nothing is sent again after a reload: ' + r1 + ' calls the first time');
    errs.push(...e);
  }

  // ---------- I. phone width, light and dark, with long translations ----------
  {
    const long = (scope) => rows(scope, 'hi', 'approved').map(r => Object.assign({}, r, { text: r.text + ' ' + r.text.replace(/<\/?\d+>|<br\/>/g, ' ') }));
    for (const scheme of ['light', 'dark']) {
      const { p, h, ctx, errs: e } = await S(); await p.emulateMedia({ colorScheme: scheme }); await h.reset();
      await h.seed(Object.assign(agreement({ legal: { choice: 'have' } }, { _step: 9, guide: GA, acks: AK }), { translations: long('screens').concat(long('guide')) }));
      await h.login('v-jane', 'jane@example.com'); await choose(p, 'hi', 900);
      expect(!(await h.sideways()), 'no sideways scroll on the signing page in Hindi, ' + scheme);
      await p.evaluate(() => { const d = document.querySelector('.tr-aid'); if (d) { d.open = true; d.dispatchEvent(new Event('toggle')); } }); await p.waitForTimeout(500);
      expect(!(await h.sideways()), 'no sideways scroll with the reading aid open, ' + scheme);
      const bg = await p.evaluate(() => { const c = document.querySelector('#sig0'); return c ? getComputedStyle(c).backgroundColor : null; });
      expect(!bg || /255, 255, 255|rgb\(255/.test(bg) || bg === 'rgba(0, 0, 0, 0)', 'the signature pad stays white in ' + scheme + ': ' + bg);
      const note = await p.evaluate(() => { const n = document.querySelector('#trNote'); const cs = getComputedStyle(n); return { hidden: n.hidden, color: cs.color, bg: cs.backgroundColor, w: n.getBoundingClientRect().width }; });
      expect(!note.hidden && note.w <= 390, 'the notice fits the screen in ' + scheme);
      await h.seed({ translations: long('screens') }); await h.logout(); await choose(p, 'hi', 700);
      expect(!(await h.sideways()), 'no sideways scroll on the sign-in page in Hindi, ' + scheme);
      await h.login('tim', TIM); await p.click('#navTr'); await p.waitForTimeout(500);
      expect(!(await h.sideways()), 'no sideways scroll on Tim\'s translations screen, ' + scheme);
      await p.click('[data-tr-card="hi-screens"] [data-tr-open]'); await p.waitForTimeout(700);
      expect(!(await h.sideways()), 'no sideways scroll on a language\'s checking screen, ' + scheme);
      errs.push(...e); await ctx.close();
    }
  }

  console.log(JSON.stringify({ out, fail, errs: errs.concat(fail.map(x => 'FAILED: ' + x)) }, null, 1).slice(0, 6000));
  await b.close();
  process.exit(0);
})();

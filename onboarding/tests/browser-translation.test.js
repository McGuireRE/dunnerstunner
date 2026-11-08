// Translation by the browser (Tim, 9 November 2026). The app's own AI translation is switched off; vendors use Chrome, Edge or
// Safari's built-in page translation. This checks: no language picker, no translation or language requests, the guidance line
// and the disclaimer on every vendor screen (the sign-in page, the pages, the journey panel and on paper), translate="no" on
// names, addresses, amounts and references, no Translations screen for Tim, the REA's own guides still linked, and that a page
// rewritten by a browser translation can never change what is signed.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const { setup, helpers, ag, people, prop, cfg, answers, T0, GA, AK, URL } = require('./tr-scenarios.js');
const TIM = 'hello@timmcguire.co.nz';
const GUIDE = 'Need this in another language? Your browser can translate this page: in Chrome, tap the menu then Translate; on an iPhone, tap aA then Translate.';
const DISC = 'Translations are made automatically by your browser and have not been checked by a person. They are a guide only: the English version is the one that applies. If anything is unclear, or you have concerns, please seek legal or other expert advice.';
const SW = /const APP_TRANSLATION = false;/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8'));

(async () => {
  const b = await chromium.launch(); const fail = [], errs = [], out = {};
  const expect = (ok, msg) => { if (!ok) fail.push(msg); };
  const S = async (opts) => { const s = await setup(b, opts); s.h = helpers(s.p); return s; };
  const text = (p, sel) => p.evaluate(s => (document.querySelector(s || 'body') || {}).innerText || '', sel);
  const calls = p => p.evaluate(() => JSON.parse(localStorage.getItem('callLog') || '[]'));
  const agreement = (extra, an, c) => ({ properties: [prop('agreement')], agreements: [ag('A1', 'sent', Object.assign({ config: c || cfg(), answers: answers(an || {}) }, extra || {}))], agreement_people: people('A1') });
  expect(SW, 'the switch for the app\'s own translation is off (APP_TRANSLATION = false)');
  // what Chrome does: wraps every piece of text in <font>, sets the page language and adds a class to the root
  const chromeTranslate = p => p.evaluate(() => {
    const go = root => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const ns = []; while (w.nextNode()) ns.push(w.currentNode);
      ns.forEach(n => { const par = n.parentElement; if (!par || par.closest('script,style,textarea,input,select,option,[translate="no"]') || !n.nodeValue.trim() || par.tagName === 'FONT') return; const f = document.createElement('font'); f.style.verticalAlign = 'inherit'; f.textContent = '<xx> ' + n.nodeValue; n.parentNode.replaceChild(f, n); }); };
    go(document.body); document.documentElement.setAttribute('lang', 'mi'); document.documentElement.classList.add('translated-ltr');
    window.__fake = new MutationObserver(ms => { ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1 && n.tagName !== 'FONT') go(n); })); }); window.__fake.observe(document.body, { childList: true, subtree: true });
  });
  // what Safari does: rewrites the text, with no marker on the page
  const safariTranslate = p => p.evaluate(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const ns = []; while (w.nextNode()) ns.push(w.currentNode); ns.forEach(n => { const par = n.parentElement; if (par && !par.closest('script,style,textarea,input,select,option,[translate="no"]') && n.nodeValue.trim()) n.nodeValue = '<xx> ' + n.nodeValue; }); });

  // ---------- A. no picker, no translation or language requests, however the page starts ----------
  {
    const { p, h, errs: e } = await S(); await h.reset();
    await h.seed(Object.assign(agreement(), { translations: [{ id: 'T1', scope: 'screens', ref: null, lang: 'mi', source: 'Email me a sign-in link', text: '[mi] Email me a sign-in link', status: 'approved' }], user_language: [{ user_id: 'v-jane', lang: 'mi' }] }));
    await p.evaluate(() => { localStorage.setItem('mcLang', 'mi'); localStorage.removeItem('callLog'); }); await p.goto(URL); await p.waitForTimeout(900);
    expect(!(await p.isVisible('#langSel')) && !(await p.isVisible('#langWrap')), 'no language picker on the sign-in page');
    expect(await p.evaluate(() => document.documentElement.getAttribute('lang')) === 'en', 'the page is marked lang="en"');
    expect(/Email me a sign-in link/.test(await text(p)) && !/\[mi\]/.test(await text(p)), 'the sign-in page is plain English even when a language was once chosen');
    expect(!(await p.$('meta[name="google"], meta[content*="notranslate" i], [translate="no"][class="login-card"], main[translate="no"], body[translate="no"]')), 'nothing tells the browser not to translate the page');
    await h.login('v-jane', 'jane@example.com'); await p.waitForTimeout(600);
    await p.click('#journeyBtn'); await p.waitForSelector('#journey:not([hidden]) svg.jmap'); await p.waitForTimeout(400);
    expect((await p.$$('.lang-sel')).length === 0 || !(await p.$$eval('.lang-sel', ss => ss.some(s => s.offsetParent !== null))), 'no language picker in the journey panel');
    await p.click('#jClose');
    const c = await calls(p);
    const bad = c.filter(x => /translat|user_language|set_my_language|get_translations|^fn:doc-prefill/.test(x));
    expect(bad.length === 0, 'no translation or language request is made: ' + JSON.stringify(bad));
    errs.push(...e);
  }

  // ---------- B. the guidance line and the disclaimer: sign-in page, vendor pages, journey panel, paper ----------
  {
    const { p, h, errs: e } = await S(); await h.reset(); await p.goto(URL); await p.waitForTimeout(600);
    const T = async sel => (await text(p, sel)).replace(/\s+/g, ' ').trim();
    const shown = await T('#trHelp');
    expect(shown.includes(GUIDE) && shown.includes(DISC), 'the sign-in page has the guidance line and the disclaimer: ' + shown.slice(0, 100));
    expect(!/In English:/.test(shown) && !(await p.isVisible('#trHelp .bt-en')), 'the English copy is not shown while the page is in English');
    expect(await p.$eval('#trHelp .bt-en', n => n.getAttribute('translate') === 'no' && n.getAttribute('lang') === 'en'), 'the English copy is marked translate="no"');
    expect(!(await p.$eval('#trHelp .bt-disc', n => !!n.closest('[translate="no"]'))) && !(await p.$eval('#trHelp .bt-guide', n => !!n.closest('[translate="no"]'))), 'the guidance and the translatable disclaimer are left for the browser to translate');
    expect(!/[—–]/.test(GUIDE + DISC), 'no em dashes');
    expect(!(await h.sideways()), 'no sideways scroll at 390 px');
    // a Chrome or Edge translation: the English copy appears, labelled, and stays English
    await chromeTranslate(p); await p.waitForTimeout(400);
    const tr = await T('#trHelp');
    expect(await p.isVisible('#trHelp .bt-en') && /In English: Translations are made automatically by your browser/.test(tr) && tr.includes('<xx> ' + GUIDE.slice(0, 20)), 'once Chrome has translated the page, the English disclaimer shows underneath: ' + tr.slice(0, 160));
    await h.reset(); await p.goto(URL); await p.waitForTimeout(500);
    // a Safari translation: the text is rewritten, with no marker
    await safariTranslate(p); await p.waitForTimeout(400);
    expect(await p.isVisible('#trHelp .bt-en') && /In English: Translations are made automatically/.test(await T('#trHelp')), 'and when Safari rewrites the text, the English copy shows too');
    // vendor pages
    await h.reset(); await h.seed(agreement()); await h.login('v-jane', 'jane@example.com'); await p.waitForTimeout(500);
    expect((await T('#trHelp')).includes(GUIDE) && (await p.isVisible('#trHelp')), 'a vendor page has the guidance and the disclaimer');
    // the journey panel covers the page, so it has its own
    await p.click('#journeyBtn'); await p.waitForSelector('#journey:not([hidden]) svg.jmap'); await p.waitForTimeout(500);
    const jt = await T('#journey .tr-help');
    expect(jt.includes(GUIDE) && jt.includes(DISC) && await p.isVisible('#journey .tr-help'), 'the journey panel has the guidance and the disclaimer: ' + jt.slice(0, 80));
    expect(await p.$eval('#journey .tr-help', n => { const r = n.getBoundingClientRect(), t = document.elementFromPoint(r.left + 6, r.top + 6); return !!t && n.contains(t); }), 'and nothing covers it');
    expect(!(await h.sideways()), 'no sideways scroll in the journey panel');
    // on paper: the disclaimer prints at the top (the journey leaflet too), the guidance line does not, once
    await p.emulateMedia({ media: 'print' });
    const pj = await p.evaluate(() => { const top = document.getElementById('trHelp'), inp = document.querySelector('#journey .tr-help'), r = inp.getBoundingClientRect(); return { shown: getComputedStyle(inp).display !== 'none', text: inp.innerText, guide: getComputedStyle(inp.querySelector('.bt-guide')).display, top: r.top, headTop: document.querySelector('#journey .jhead').getBoundingClientRect().top, dup: getComputedStyle(top).display !== 'none' }; });
    expect(pj.shown && pj.text.includes(DISC) && pj.guide === 'none' && !pj.dup && pj.top < pj.headTop, 'the journey leaflet prints the disclaimer once, at the top, without the guidance line: ' + JSON.stringify(pj).slice(0, 200));
    await p.emulateMedia({ media: 'screen' }); await p.click('#jClose'); await p.waitForTimeout(300);
    await p.emulateMedia({ media: 'print' });
    const pp = await p.evaluate(() => { const t = document.getElementById('trHelp'), m = document.getElementById('main'); return { shown: getComputedStyle(t).display !== 'none', above: t.getBoundingClientRect().top < m.getBoundingClientRect().top, text: t.innerText }; });
    expect(pp.shown && pp.above && pp.text.includes(DISC), 'an ordinary page prints the disclaimer above the content');
    await p.emulateMedia({ media: 'screen' });
    await chromeTranslate(p); await p.waitForTimeout(300); await p.emulateMedia({ media: 'print' });
    expect(await p.evaluate(() => { const e = document.querySelector('#trHelp .bt-en'); return getComputedStyle(e).display !== 'none' && /In English:/.test(e.innerText); }), 'a translated page prints the English disclaimer as well');
    await p.emulateMedia({ media: 'screen' });
    // light and dark: readable
    for (const scheme of ['light', 'dark']) {
      await p.emulateMedia({ colorScheme: scheme }); await p.waitForTimeout(200);
      const ratio = await p.evaluate(() => { const el = document.querySelector('#trHelp .bt-disc'), cs = getComputedStyle(el); const rgb = s => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number); const lum = c => { const [r, g, bl] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; }; let bg = null, n = el; while (n && !bg) { const c = rgb(getComputedStyle(n).backgroundColor); const a = (getComputedStyle(n).backgroundColor.match(/[\d.]+/g) || [])[3]; if (c.length === 3 && !(a !== undefined && +a === 0)) bg = c; n = n.parentElement; } bg = bg || rgb(getComputedStyle(document.body).backgroundColor); const l1 = lum(rgb(cs.color)), l2 = lum(bg); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); });
      expect(ratio >= 4.5, 'the note is readable in ' + scheme + ' mode: contrast ' + ratio.toFixed(1));
    }
    errs.push(...e);
  }

  // ---------- C. names, addresses, amounts, dates and references are left alone ----------
  {
    const { p, h, errs: e } = await S(); await h.reset();
    await h.seed(agreement({}, { _step: 0 })); await h.login('v-jane', 'jane@example.com'); await p.waitForTimeout(800);
    const prot = async (needle) => p.evaluate(n => { const w = document.createTreeWalker(document.querySelector('#main'), NodeFilter.SHOW_TEXT); while (w.nextNode()) { const t = w.currentNode; if (t.nodeValue.includes(n)) return !!t.parentElement.closest('[translate="no"]'); } return null; }, needle);
    const found = {};
    for (const n of ['22 Queens Drive, Belleknowes', 'Jane', 'MRE-2026-1001']) found[n] = await prot(n);
    expect(found['22 Queens Drive, Belleknowes'] === true, 'the property address is marked translate="no": ' + JSON.stringify(found));
    expect(found['MRE-2026-1001'] !== false, 'the reference is marked translate="no" when it is on the page');
    expect(await p.$eval('header .brand', n => n.getAttribute('translate') === 'no'), 'the McGuire logo and wordmark are marked translate="no"');
    // the shared pass: text drawn later is marked as well (amounts, percentages, emails, phone numbers, dates, references, Tim's name and licence)
    await p.evaluate(() => { const d = document.createElement('div'); d.id = 'probe'; d.innerHTML = '<p id="pp">Fee $12,000 plus 2.95% above $250,000. Ref MRE-2026-1003. Email jane@example.com or call 027 562 7207 by 12 November 2026. Tim McGuire, REA#20117983, McGuire Real Estate Limited. Some ordinary words.</p><textarea id="ta">typing 5 here</textarea>'; document.getElementById('main').appendChild(d); });
    await p.waitForTimeout(400);
    const marked = await p.$$eval('#pp [translate="no"]', ns => ns.map(n => n.textContent));
    for (const want of ['$12,000', '2.95%', '$250,000', 'MRE-2026-1003', 'jane@example.com', '027 562 7207', '12 November 2026', 'Tim McGuire', 'REA#20117983', 'McGuire Real Estate Limited']) expect(marked.includes(want), 'marked translate="no": ' + want + ' in ' + JSON.stringify(marked));
    expect(!marked.some(m => /ordinary|Fee|plus|above/.test(m)), 'ordinary words are left for the browser to translate');
    expect(await p.$eval('#pp', n => n.textContent) === 'Fee $12,000 plus 2.95% above $250,000. Ref MRE-2026-1003. Email jane@example.com or call 027 562 7207 by 12 November 2026. Tim McGuire, REA#20117983, McGuire Real Estate Limited. Some ordinary words.', 'the words on the page are unchanged by the marking');
    expect(await p.$eval('#ta', n => n.value) === 'typing 5 here' && !(await p.$('#ta [translate]')), 'what a person is typing into is never touched');
    // once the browser has taken the page over, the marking steps back
    await chromeTranslate(p); await p.waitForTimeout(300);
    expect(await p.$$eval('font', fs => fs.length > 0), 'the faked translation is in place');
    errs.push(...e);
  }

  // ---------- D. a translated page cannot change what is signed, and typing survives ----------
  {
    const signSeed = () => agreement({ legal: { choice: 'have' } }, { _step: 9, guide: GA, acks: AK });
    const run = async (fake) => {
      const { p, h, errs: e } = await S(); await h.reset(); await h.seed(signSeed()); await h.login('v-jane', 'jane@example.com');
      if (fake) { await chromeTranslate(p); await p.waitForTimeout(500); }
      const signed = await p.$$eval('[data-signed]', els => els.map(x => x.innerText.replace(/<xx> /g, '')));
      await h.draw('#sig0'); await h.next(3400);
      const d = await h.db(); return { sigs: d.signatures || [], signed, e, fonts: fake ? await p.$$eval('font', f => f.length) : 0 };
    };
    const en = await run(false), tr = await run(true);
    expect(en.sigs.length === 1 && tr.sigs.length === 1, 'one signature each, with the page translated by a browser or not: ' + [en.sigs.length, tr.sigs.length]);
    const sn = x => JSON.stringify(x.sigs[0].snapshot).replace(/"[^"]*(_at|At|agent|Agent|time|Time)[^"]*":"[^"]*"/g, '"T":""');
    expect(!/<xx>/.test(JSON.stringify(tr.sigs[0].snapshot)), 'the signed snapshot holds no translated word');
    expect(sn(en) === sn(tr), 'the snapshot signed on a translated page is the same as on an English page');
    expect(tr.sigs[0].snapshot_sha256 === en.sigs[0].snapshot_sha256, 'and so is its fingerprint');
    expect(tr.fonts > 0, 'the page really had been rewritten when it was signed: ' + tr.fonts + ' font tags');
    // typing is not lost when a browser rewrites the page around it
    const { p, h, errs: e2 } = await S(); await h.reset(); await p.goto(URL); await p.waitForTimeout(500);
    const field = await p.$('input[type=email]'); if (field) { await field.fill('jane@example.com'); await chromeTranslate(p); await p.waitForTimeout(400); expect(await field.inputValue() === 'jane@example.com', 'what a person has typed stays after the page is translated'); }
    errs.push(...en.e, ...tr.e, ...e2);
  }

  // ---------- E. Tim: no Translations screen, no translating of plans or variations, the REA's guides still linked ----------
  {
    const { p, h, errs: e } = await S(); await h.reset(); p.on('dialog', d => d.accept());
    const PL = { id: 'L1', property_id: 'PR1', address: '22 Queens Drive, Belleknowes', contact_name: 'Jane Smith', contact_email: 'jane@example.com', status: 'submitted', appraisal: { method: 'Auction', price: '$850,000' }, answers: { owners: [{ name: 'Jane Smith', email: 'jane@example.com' }] }, plan: {}, submitted_at: T0, created_at: T0 };
    await h.seed({ properties: [prop('questionnaire')], prelistings: [PL] }); await h.login('tim', TIM);
    expect(!(await p.isVisible('#navTr')) && !(await p.isVisible('#langWrap')) && (await p.isVisible('#navDash')), 'Tim\'s bar has no Translations button and no language choice');
    expect(!/Translations/.test(await text(p, '#agentNav')), 'nothing named Translations in Tim\'s bar');
    expect(!(await p.isVisible('#trHelp')), 'the guidance for vendors is not shown on Tim\'s screens');
    await p.evaluate(() => localStorage.removeItem('callLog'));
    await p.click('#navDash'); await p.waitForTimeout(500); await p.click('tr[data-plrow]'); await p.waitForTimeout(500);
    const open = await p.$('[data-plopen]'); if (open) { await open.click(); await p.waitForTimeout(400); }
    await p.fill('.plp [data-p=said]', 'You wondered about the price.'); await p.fill('.plp [data-p=changed]', 'I added recent sales.');
    await p.click('#plPublish'); await p.waitForTimeout(1500);
    expect(!(await p.$('#trPlan')) && !/Your plan in other languages/.test(await text(p, 'main')), 'publishing a plan shows no translation panel');
    const c = await calls(p);
    expect(!c.some(x => /doc-prefill|translat|agent_save|agent_store/.test(x)), 'publishing a plan makes no translation request: ' + JSON.stringify(c.filter(x => /doc-prefill|translat/.test(x))));
    const w = await S({ guides: undefined }); await w.h.reset();
    await w.h.seed(agreement({ legal: { choice: 'have' } }, { _step: 7, guide: GA, acks: [] })); await w.h.login('v-jane', 'jane@example.com');
    await w.p.waitForSelector('.guide-inline .rea-tr a[data-rea-lang]', { timeout: 6000 }).catch(() => { });
    const l = await w.p.$$eval('.guide-inline .rea-tr', boxes => Array.from(boxes[0].querySelectorAll('a[data-rea-lang]')).map(a => ({ code: a.dataset.reaLang, href: a.getAttribute('href'), target: a.target })));
    expect(l.map(x => x.code).join() === 'mi,sm,zh' && l.every(x => /test-agency-guide-(mi|sm|zh)\.pdf$/.test(x.href) && x.target === '_blank'), 'the REA\'s own translated guides are still linked beside the English one: ' + JSON.stringify(l));
    expect(/Authority's own translations, not ours/.test(await text(w.p)), 'and the page says they are the Authority\'s own');
    errs.push(...e, ...w.errs);
  }

  out.checked = { fails: fail.length };
  await b.close();
  console.log(JSON.stringify({ out, fail, errs: errs.concat(fail.map(x => 'FAILED: ' + x)) }, null, 1));
})().catch(e => { console.log(JSON.stringify({ crashed: String(e && e.stack || e), errs: ['CRASH'] })); process.exit(1); });

// Phase 4: the catalogue of vendor wording (src/strings.js) keeps up with the screens. Walks every vendor screen and the
// states that change the wording (mistakes, branches, signed pages), and fails if any wording on screen is missing from the
// catalogue, which is how a new sentence would slip through untranslated. Also checks the catalogue itself.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const { walkVendor, DATA } = require('./tr-scenarios.js');
const STR = new Function('window', fs.readFileSync(path.join(__dirname, '..', 'src', 'strings.js'), 'utf8') + '; return window.I18N_STRINGS;')({});
const fail = [], out = {}; const expect = (ok, msg) => { if (!ok) fail.push(msg); };
const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
(async () => {
  const all = []; Object.entries(STR).forEach(([scope, groups]) => groups.forEach(([g, list]) => list.forEach(s => all.push({ scope, g, s }))));
  const strs = all.map(x => x.s);
  expect(Object.keys(STR).sort().join() === 'guide,screens', 'two sets: screens and guide');
  expect(strs.length > 700, 'the catalogue is not empty: ' + strs.length);
  expect(new Set(strs).size === strs.length, 'no string is listed twice: ' + strs.filter((s, i) => strs.indexOf(s) !== i).slice(0, 3));
  expect(!strs.some(s => /[—–]/.test(s)), 'no dashes in the wording: ' + strs.filter(s => /[—–]/.test(s)).slice(0, 2));
  expect(!strs.some(s => !s.trim() || s !== s.trim() || /\s{2,}/.test(s) || s.length > 8000), 'no blank, padded or enormous strings');
  const tagsOk = s => { const st = []; for (const t of s.match(/<br\/>|<\/?\d+>/g) || []) { if (t === '<br/>') continue; if (t[1] !== '/') st.push(t.slice(2 - 1, -1)); else if (st.pop() !== t.slice(2, -1)) return false; } return !st.length; };
  expect(strs.every(tagsOk), 'tags are balanced in every string: ' + strs.filter(s => !tagsOk(s)).slice(0, 2));
  expect(!strs.some(s => /<(?!\/?\d+>|br\/>)[a-z]/i.test(s)), 'no raw HTML in the wording');
  const phs = strs.flatMap(s => s.match(/\{[^}]*\}/g) || []);
  expect(phs.every(p => /^\{[a-z][a-z0-9]*\}$/.test(p)), 'placeholders are plain names: ' + phs.filter(p => !/^\{[a-z][a-z0-9]*\}$/.test(p)).slice(0, 3));
  expect(!strs.some(s => { const m = s.match(/\{[a-z0-9]+\}/g) || []; return new Set(m).size !== m.length; }), 'a placeholder is never repeated inside one string');
  const pure = strs.filter(s => !/[A-Za-z]{2,}/.test(s.replace(/\{[a-z0-9]+\}|<\/?\d+>|<br\/>/g, '')));
  expect(!pure.length, 'every string has wording, not only data: ' + pure.slice(0, 3));
  // data (names, addresses, dates) is never in the catalogue as itself
  expect(!strs.some(s => DATA.includes(s)), 'fixture data is not wording');
  expect(!strs.some(s => /Queens Drive|Jane|Smith|example\.com|MRE-2026/.test(s)), 'no customer data in the catalogue');
  // Tim's own screens are not translated: nothing that only Tim sees is listed
  const timOnly = ['Only you see this', 'Let\'s begin', 'Let\'s agree', 'Countersign', 'Dashboard', 'Property file'];
  out.timOnlyFound = timOnly.filter(t => strs.includes(t));
  expect(!out.timOnlyFound.length, 'Tim\'s screens are not in the catalogue: ' + out.timOnlyFound);
  // wording the engine builds in pieces
  ['{n} of 9: {stop}.', 'Done', 'You are here', 'Still ahead', 'Opens this page.', 'Shows what happens at this stop.', 'Read this page in English', 'Show this page in {language} again', 'This translation was made automatically by a computer and has not been checked by a person. It is a guide only: the English version is the one that applies. If anything is unclear, or you have concerns, please seek legal or other expert advice.', 'Read this part in {language}, to help you understand it'].forEach(k => expect(strs.includes(k), 'engine wording is listed: ' + k));
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  const pieces = [...app.matchAll(/\btrs\('((?:[^'\\]|\\.)*)'/g)].map(m => m[1].replace(/\\'/g, '\''));
  pieces.forEach(k => expect(strs.includes(k), 'wording built in pieces is listed: ' + k.slice(0, 60)));
  // every vendor screen
  const b = await chromium.launch(); const unknown = new Map();
  const pats = strs.filter(s => /\{[a-z0-9]+\}/.test(s)).map(s => new RegExp('^' + s.split(/\{[a-z0-9]+\}/).map(esc).join('(.+?)') + '$', 's'));
  const known = new Set(strs); const isKnown = k => known.has(k) || pats.some(r => r.test(k));
  const data = new Set(DATA); const DATEISH = /^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun), )?\d{1,2} [A-Z][a-z]+ 20\d\d$/;
  let units = 0;
  const errs = await walkVendor(b, (label, keys, allKeys) => { allKeys.forEach(k => { units++; if (!data.has(k) && !DATEISH.test(k) && !isKnown(k) && !/^(x|22 Queens Drive, Belleknowes \(MRE-2026-100\d\))$/.test(k) && !/^Jane Mary Smith and Robert Smith$/.test(k)) unknown.set(k, label); }); });
  await b.close();
  out.unitsChecked = units; out.missing = [...unknown.entries()].slice(0, 15).map(([k, l]) => l + ': ' + k.slice(0, 90));
  expect(unknown.size === 0, unknown.size + ' pieces of vendor wording are not in src/strings.js, so they would never be translated. Add them: ' + out.missing.join(' | '));
  console.log(JSON.stringify({ out, fail, errs: errs.concat(fail.map(x => 'FAILED: ' + x)) }, null, 1));
})();

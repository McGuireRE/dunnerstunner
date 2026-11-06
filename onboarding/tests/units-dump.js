// Developer tool, not a test: lists every piece of vendor-screen text that is not yet in strings.js.
// Run: python3 onboarding/src/build.py && node onboarding/tests/units-dump.js > /tmp/units.txt
const { chromium } = require('playwright'); const { walkVendor, DATA } = require('./tr-scenarios.js');
(async () => {
  const b = await chromium.launch(); const seen = new Map(); const cat = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'strings.js'), 'utf8');
  const known = new Function('window', cat + '; return window.I18N_STRINGS;')({});
  const all = new Set(); Object.values(known).forEach(g => g.forEach(([, l]) => l.forEach(s => all.add(s))));
  const normal = new Set();
  const errs = await walkVendor(b, (label, keys, all) => { keys.forEach(k => normal.add(k)); all.forEach(k => { if (!seen.has(k)) seen.set(k, label); }); });
  const data = new Set(DATA);
  const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const pats = [...all].filter(x => /\{\w+\}/.test(x)).map(x => new RegExp('^' + x.split(/\{\w+\}/).map(esc).join('(.+?)') + '$', 's'));
  const isKnown = k => all.has(k) || pats.some(r => r.test(k));
  [...seen.entries()].filter(([k]) => !data.has(k) && !isKnown(k)).forEach(([k, l]) => console.log((normal.has(k) ? '' : 'S ') + l + '\t' + k));
  console.error('units', seen.size, 'errors', JSON.stringify(errs.slice(0, 5)));
  await b.close();
})();

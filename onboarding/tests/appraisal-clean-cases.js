// Real section sets for the whitelist (appraisal_section_clean, migration 037), shared by tests/appraisal-clean.test.js and the rollback
// test (tests/appraisal-send-rollback.js puts them in the SQL). Built with APPR.writeStandard for every campaign kind and sale method,
// with one and two price ranges, plus hand-loaded sections with no column headings. Invented data only. (Not a .test.js file.)
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = path.join(__dirname, '..', 'src');
function loadAppr() {
  const win = {}; const ctx = vm.createContext({ window: win, console, Date, Math, JSON, Intl, Number, String, Array, Object, RegExp, isFinite, Set });
  vm.runInContext(fs.readFileSync(path.join(SRC, 'market-core.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(SRC, 'appraisal-core.js'), 'utf8'), ctx);
  return win.APPR;
}
// the mock's own cleaner (tests/mock.js, the lines from appraisal_section_clean() to apBuild), run as it is
function loadMockClean() {
  const m = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
  const a = m.indexOf('// appraisal_section_clean(): each section'), b = m.indexOf('function apBuild(');
  if (a < 0 || b < a) throw new Error('the mock\'s cleaner was not found');
  return vm.runInContext(m.slice(a, b) + '\n;apSecClean', vm.createContext({ JSON, Object, Array, String, Number }));
}
const APPR = loadAppr(), clean = loadMockClean();
const cat = { PACKAGES: { digital: { name: 'Digital', price: 1500, tagline: 'Online first.', items: { TM: 1 } }, premium: { name: 'Premium', price: 3000, tagline: 'More reach.', items: { TM: 1 } } }, ITEMS: {},
  CATALOGUE: [{ items: [{ name: 'Signboard' }, { name: 'Photos' }] }] };
const ctx = { address: 'RB 3 Clean Road, Rbvale', preparedOn: '2026-11-28', cat };
const R1 = [{ key: 'A', option: 'Your home', low: 510000, high: 560000 }];
const R2 = R1.concat([{ key: 'B', option: 'Renovated', low: 600000, high: 650000 }]);
const campaigns = [{ kind: 'standard' }, { kind: 'larger' }, { kind: 'land' }, { kind: 'weeks', weeks: 1 }, { kind: 'weeks', weeks: 10 }];
function cases() {
  const out = [];
  for (const cp of campaigns) for (const m of APPR.METHODS) for (const [rn, rs] of [['1 range', R1], ['2 ranges', R2]]) {
    const s = { v: 1, suburb: 'Rbvale', preparedFor: 'Robin', campaign: cp, method: m.key, plan: 'premium', basis: 'comparables', header: 'claude' };
    const w = APPR.writeStandard(s, rs, ctx);
    out.push({ name: `${cp.kind}${cp.weeks ? cp.weeks : ''}/${m.key}/${rn}`, rec: { title: w.title, setup: s, fields: w.fields, sections: w.sections } });
  }
  // hand-loaded sections with no headings: the renderer's own headings must show after cleaning too
  const hand = secs => ({ title: 'RB hand', setup: {}, fields: { ranges: R2, method: { name: 'Deadline sale', key: 'deadline', text: 'A deadline sale.' } }, sections: secs });
  out.push({ name: 'hand/opinion-table', rec: hand([{ type: 'opinion', table: true }, { type: 'ranges' }]) });
  out.push({ name: 'hand/tables', rec: hand([{ type: 'table', rows: [['a', 'b']] }, { type: 'methods', rows: [['Deadline sale', 'Yes']] }, { type: 'opinion' }]) });
  out.push({ name: 'hand/one-range', rec: Object.assign(hand([{ type: 'opinion' }, { type: 'ranges' }]), { fields: { ranges: R1 } }) });
  return out.map(c => Object.assign(c, { expected: c.rec.sections.map(clean).filter(Boolean) }));
}
module.exports = { APPR, clean, cases };

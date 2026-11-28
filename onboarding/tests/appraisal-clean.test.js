// The whitelist never changes how an appraisal draws (re-review of f73d2fb). Run in Node with invented data only.
// For real section sets (APPR.writeStandard, every campaign kind and sale method, one and two price ranges, and hand-loaded sections with
// no column headings), APPR.render before and after cleaning (the mock's appraisal_section_clean, which the rollback test shows the
// database matches exactly) must be byte-identical. The old rule (a missing heading list written as []) is shown to have broken it, so
// this test bites. A non-text table cell is blanked, never dropped.
const { APPR, clean, cases } = require('./appraisal-clean-cases.js');
const errs = [], out = {};
const expect = (c, m) => { if (!c) errs.push(m); };
const draw = (rec, secs) => APPR.render(Object.assign({}, rec, { sections: secs }), { comps: [], photos: {}, months: [], market: false });
const all = cases(); out.cases = all.length;
let two = 0;
for (const c of all) {
  const before = draw(c.rec, c.rec.sections), after = draw(c.rec, c.expected);
  expect(before === after, c.name + ': draws differently after cleaning');
  if (c.rec.fields.ranges.length === 2) {
    two++;
    if (c.rec.sections.some(s => s.type === 'opinion' && !s.head)) expect(/<th[^>]*>Part<\/th>/.test(after) && /Where I would expect buyers to land/.test(after), c.name + ': the price table keeps its column headings');
  }
}
expect(all.length >= 50 && two >= 25, 'enough cases: ' + all.length);
// the old rule ([] for a missing heading list) draws the two-range price table without its headings: the case this test guards
const old = s => s && ['opinion', 'ranges', 'table', 'methods'].includes(s.type) && !('head' in s) ? Object.assign({}, s, { head: [] }) : s;
const c2 = all.find(c => c.name === 'standard/deadline/2 ranges');
out.oldBroke = draw(c2.rec, c2.expected.map(old)) !== draw(c2.rec, c2.rec.sections);
expect(out.oldBroke, 'the old rule would have changed the drawing (so this test catches it)');
// the cleaner itself
expect(JSON.stringify(clean({ type: 'opinion' })) === '{"type":"opinion"}', 'a missing heading list stays missing');
expect(JSON.stringify(clean({ type: 'opinion', head: [] })) === '{"type":"opinion","head":[]}', 'an empty heading list stays empty');
expect(JSON.stringify(clean({ type: 'ranges', head: 'Part' })) === '{"type":"ranges"}', 'a heading that isn\'t a list is left out');
expect(JSON.stringify(clean({ type: 'table', head: ['A', 'B', 'C', 'D'], rows: [['a', null, 3, { x: 1 }], 'bad'] })) === '{"type":"table","head":["A","B","C","D"],"rows":[["a","","3",""]]}', 'a non-text cell is blanked, not dropped');
const tb = { type: 'table', head: ['A', 'B', 'C'], rows: [['x', null, 'z']] };
expect(APPR.render({ title: 'RB', setup: {}, fields: {}, sections: [clean(tb)] }).includes('>z<'), 'the columns stay in line after a blanked cell');
console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));

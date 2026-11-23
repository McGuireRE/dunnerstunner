// Unit tests for onboarding/src/offers-core.js: working days as the agreement defines them (weekends, the national holidays and
// their Monday rule, the 24 December to 5 January period and its LIM variant to 15 January, the provincial anniversary, Matariki,
// Easter computed), counting, the clause 1.3 rule for a chosen date, the condition list, and every date check and warning.
const path = require('path');
const O = require(path.join(__dirname, '..', 'src', 'offers-core.js'));
const errs = [], out = {};
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) errs.push(`${msg}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); };
const ok = (c, msg) => { if (!c) errs.push(msg); };

// Easter Sunday, computed
eq(['2024', '2025', '2026', '2027', '2028', '2029', '2030', '2031', '2035'].map(y => O.easterSunday(+y)), ['2024-03-31', '2025-04-20', '2026-04-05', '2027-03-28', '2028-04-16', '2029-04-01', '2030-04-21', '2031-04-13', '2035-03-25'], 'Easter Sundays');
// Matariki held as data, one per year, always a Friday
Object.entries(O.MATARIKI).forEach(([y, d]) => { ok(d.startsWith(y + '-') && O.dow(d) === 5, 'Matariki ' + y + ' is a Friday in its year'); });
eq([2026, 2027, 2028, 2029, 2030].map(y => O.MATARIKI[y]), ['2026-07-10', '2027-06-25', '2028-07-14', '2029-07-06', '2030-06-21'], 'Matariki dates for the next several years');
ok(!O.isWorkingDay('2026-07-10') && !O.isWorkingDay('2027-06-25') && !O.isWorkingDay('2028-07-14'), 'Matariki is not a working day');
ok(O.yearKnown(2026) && O.yearKnown(2035) && !O.yearKnown(2036), 'years covered by the Matariki data');
// Otago Anniversary Day: the Monday nearest 23 March
eq([2026, 2027, 2028, 2029, 2030, 2031].map(y => O.PROVINCES.otago.day(y)), ['2026-03-23', '2027-03-22', '2028-03-20', '2029-03-26', '2030-03-25', '2031-03-24'], 'Otago Anniversary Days');
ok(!O.isWorkingDay('2027-03-22', { province: 'otago' }) && O.isWorkingDay('2027-03-22', { province: 'southland' }), 'the anniversary day belongs to the province');
eq(O.notWorkingBecause('2027-03-22', { province: 'otago' }), 'Otago Anniversary Day', 'named');
eq(O.PROVINCES.southland.day(2027), '2027-03-30', 'Southland: Easter Tuesday');
eq(O.PROVINCES.canterbury.day(2026), '2026-11-13', 'Christchurch Show Day 2026');
eq(O.PROVINCES.wellington.day(2027), '2027-01-25', 'Wellington Anniversary 2027');
eq(O.PROVINCES.auckland.day(2027), '2027-02-01', 'Auckland Anniversary 2027');
eq(O.PROVINCES.south_canterbury.day(2026), '2026-09-28', 'South Canterbury 2026');
// national days and the Monday rule (Waitangi and Anzac only)
eq(['2026-02-06', '2026-04-03', '2026-04-06', '2026-04-25', '2026-04-27', '2026-06-01', '2026-10-26'].map(d => O.isWorkingDay(d)), [false, false, false, false, false, false, false], 'national days 2026 (Anzac on a Saturday: Monday 27th too)');
ok(O.isWorkingDay('2026-04-28'), 'the Tuesday after the Anzac Monday is a working day');
ok(!O.isWorkingDay('2027-02-08') && !O.isWorkingDay('2027-04-26'), '2027: Waitangi (Saturday) and Anzac (Sunday) move to Monday');
eq(O.notWorkingBecause('2027-02-08'), 'Waitangi Day (Monday after)', 'Waitangi Monday named');
ok(O.isWorkingDay('2027-06-08') && !O.isWorkingDay('2027-06-07') && !O.isWorkingDay('2027-10-25'), "2027 Sovereign's Birthday and Labour Day");
ok(!O.isWorkingDay('2022-09-26'), 'a day the Government declared (2022 memorial day)');
// the Christmas and New Year period
['2026-12-24', '2026-12-25', '2026-12-31', '2027-01-01', '2027-01-04', '2027-01-05'].forEach(d => ok(!O.isWorkingDay(d), 'holiday period: ' + d));
ok(O.isWorkingDay('2026-12-23') && O.isWorkingDay('2027-01-06'), 'the days either side are working days');
ok(O.isWorkingDay('2027-01-06') && !O.isWorkingDay('2027-01-06', { lim: true }) && !O.isWorkingDay('2027-01-15', { lim: true }) && O.isWorkingDay('2027-01-18', { lim: true }), 'for the LIM date the period runs to 15 January');
ok(!O.isWorkingDay('2026-11-21') && !O.isWorkingDay('2026-11-22'), 'weekends');
// counting
eq(O.addWorkingDays('2026-11-23', 15), '2026-12-14', '15 working days from Monday 23 November 2026');
eq(O.addWorkingDays('2026-12-18', 15), '2027-01-21', '15 working days across the summer break');
eq(O.addWorkingDays('2026-12-18', 10, { lim: true }), '2027-01-26', 'LIM: 10 working days across the summer break');
eq(O.addWorkingDays('2026-03-20', 1), '2026-03-24', 'Otago Anniversary Day skipped (default province)');
eq(O.addWorkingDays('2026-04-02', 2), '2026-04-08', 'Easter skipped');
eq(O.addWorkingDays('2026-11-23', 0), '2026-11-23', 'zero days');
eq(O.countWorkingDays('2026-11-23', '2026-12-14'), 15, 'counted back');
eq(O.countWorkingDays('2026-12-18', '2027-01-21'), 15, 'counted back across the break');
eq(O.countWorkingDays('2026-12-14', '2026-11-23'), 0, 'nothing when the end is earlier');
for (let i = 1; i <= 60; i += 7) { const d = O.addWorkingDays('2026-11-23', i); eq(O.countWorkingDays('2026-11-23', d), i, 'round trip ' + i); }
// clause 1.3: a chosen day that is not a working day becomes the last working day before it
eq(O.onOrBefore('2026-12-26'), '2026-12-23', 'Boxing Day becomes 23 December');
eq(O.onOrBefore('2026-11-22'), '2026-11-20', 'Sunday becomes Friday');
eq(O.onOrBefore('2027-01-12', { lim: true }), '2026-12-23', 'LIM date in early January');
eq(O.onOrBefore('2026-11-24'), '2026-11-24', 'a working day stays');
// province from the address
eq(['12 Pine Hill Road, Dunedin', '3 Elm St, Invercargill', '9 Main Rd, Timaru', '1 Queen St, Auckland', 'Arrowtown', '4 Thames St, Oamaru'].map(O.provinceFor), ['otago', 'southland', 'south_canterbury', 'auckland', 'otago', 'otago'], 'province guesses');

// the condition list
const keys = O.CONDITIONS.map(c => c.key);
eq(O.CONDITIONS.filter(c => c.group === 'typical').map(c => c.key), ['builders', 'finance', 'lim', 'lawyer', 'electrical', 'technical'], 'typical group, in order');
eq(O.CONDITIONS.filter(c => c.group === 'other').map(c => c.key), ['toxicology', 'oia', 'land_act', 'sale', 'sdd'], 'other group');
eq(O.CONDITIONS.filter(c => c.source === 'reinz').map(c => c.key + ' ' + c.clause), ['builders 9.4', 'finance 9.1', 'lim 9.3', 'toxicology 9.5', 'oia 9.6', 'land_act 9.7'], 'REINZ conditions refer to their clause numbers');
ok(O.CONDITIONS.every(c => c.summary && c.summary.length < 240 && !/[–—]/.test(c.summary)), 'every condition has a short plain summary with no dashes');
ok(new Set(keys).size === keys.length, 'keys are unique');
const sdd = O.condInfo('sdd'); ok(sdd.group === 'other' && /plant or complex tenancies/.test(sdd.summary) && /commercial, lifestyle and farm/.test(sdd.summary), 'Specified Due Diligence: folded group, described for commercial, lifestyle and farms');
eq(O.wordingFor(O.condInfo('finance'), { finance: 'anything' }).kind, 'ref', 'REINZ wording is never shown, even if a table held some');
eq(O.wordingFor(O.condInfo('electrical'), {}), { kind: 'pending', text: 'Tim will confirm the exact wording with you.' }, 'no wording held yet');
eq(O.wordingFor(O.condInfo('electrical'), { electrical: '  Tim words  ' }), { kind: 'tim', text: 'Tim words' }, "Tim's own wording");
// deposit
ok(/Public Trust for NZ Real Estate Trust/.test(O.depositText(false)) && /10%/.test(O.depositText(false)), 'no KiwiSaver: NZ Real Estate Trust');
ok(/lawyer's trust account/.test(O.depositText(true)) && /21\.3/.test(O.depositText(true)), "KiwiSaver: the vendor's lawyer's trust account");

// date checks
const asAt = '2026-11-23';
let d = O.checkDates({ conditions: [{ key: 'finance', days: 10 }, { key: 'lim', date: '2026-12-11' }], settlement: { kind: 'relative', days: 15 }, kiwisaver: false }, { asAt });
eq([d.conditions[0].date, d.conditions[1].date, d.conditions[1].days], ['2026-12-07', '2026-12-11', 14], 'condition dates from days and from a date (and both shown)');
eq([d.lastCondition, d.confirmation, d.settlement, d.gapOk, d.problems.length, d.warnings.length], ['2026-12-11', '2026-12-11', '2027-01-14', true, 0, 0], 'relative settlement from confirmation');
d = O.checkDates({ conditions: [{ key: 'builders', days: 10 }], settlement: { kind: 'date', date: '2026-12-10' } }, { asAt });
eq([d.lastCondition, d.settlement, d.gapDays, d.gapOk], ['2026-12-07', '2026-12-10', 3, false], 'gap under a week');
ok(d.problems.some(p => p.kind === 'gap'), 'gap is a problem');
d = O.checkDates({ conditions: [{ key: 'builders', days: 10 }], settlement: { kind: 'date', date: '2026-12-14' } }, { asAt });
eq([d.gapDays, d.gapOk], [7, true], 'exactly a week is fine');
d = O.checkDates({ conditions: [{ key: 'builders', date: '2026-12-26' }], settlement: { kind: 'date', date: '2027-02-01' } }, { asAt });
eq([d.conditions[0].date, d.conditions[0].adjusted], ['2026-12-23', true], 'a chosen holiday moves to the working day before');
d = O.checkDates({ conditions: [{ key: 'finance' }], settlement: { kind: 'relative', days: 15 } }, { asAt });
ok(d.problems.some(p => p.kind === 'cond_missing'), 'a ticked condition needs days or a date');
d = O.checkDates({ conditions: [{ key: 'finance', date: '2026-11-20' }], settlement: { kind: 'relative', days: 15 } }, { asAt });
ok(d.problems.some(p => p.kind === 'cond_past'), 'a condition date in the past');
d = O.checkDates({ conditions: [], settlement: {} }, { asAt }); ok(d.problems.some(p => p.kind === 'settle_missing'), 'settlement needed');
// KiwiSaver warnings: settlement under the threshold (a setting, default 15 working days), and the deposit due on the unconditional date
d = O.checkDates({ conditions: [{ key: 'finance', days: 10 }], settlement: { kind: 'date', date: '2026-12-18' }, kiwisaver: true }, { asAt });
eq([d.ksSettleDays, d.ksWarnSettle, d.ksWarnDeposit], [9, true, true], 'KiwiSaver: settlement 9 working days after confirmation');
ok(d.warnings.some(w => w.kind === 'ks_settle') && d.warnings.some(w => w.kind === 'ks_deposit' && /21\.1/.test(w.text) && /interest/.test(w.text)), 'both KiwiSaver warnings, the deposit one citing clause 21.1');
ok(!d.problems.some(p => /ks/.test(p.kind)), 'warnings do not block');
d = O.checkDates({ conditions: [{ key: 'finance', days: 10 }], settlement: { kind: 'date', date: '2026-12-18' }, kiwisaver: true }, { asAt, ksDays: 5 });
eq([d.ksWarnSettle, d.ksWarnDeposit], [false, true], 'threshold is a setting');
d = O.checkDates({ conditions: [{ key: 'finance', days: 10 }], settlement: { kind: 'relative', days: 15 }, kiwisaver: true }, { asAt });
eq(d.ksWarnSettle, false, 'the usual 15 working days is not warned');
d = O.checkDates({ conditions: [{ key: 'finance', days: 10 }], settlement: { kind: 'date', date: '2026-12-18' }, kiwisaver: false }, { asAt });
eq([d.ksWarnSettle, d.ksWarnDeposit, d.warnings.length], [false, false, 0], 'no KiwiSaver, no KiwiSaver warnings');
d = O.checkDates({ conditions: [], settlement: { kind: 'relative', days: 15 }, kiwisaver: true }, { asAt });
ok(d.warnings.some(w => w.kind === 'ks_deposit' && /no conditions/i.test(w.text)), 'unconditional: deposit due on signing');

// validation
const good = { email: 'buyer@example.com', phone: '021 555 0100', seen_docs: 'yes', sign: 'in_person', price: '650,000', kiwisaver: false, related: false, purchasers: [{ first: 'Aroha Mere', last: 'Smith', email: '', phone: '' }], conditions: [{ key: 'finance', days: 10 }], settlement: { kind: 'relative', days: 15 }, privacy: true };
eq(O.validate(good, { asAt }), [], 'a good offer');
eq(O.validate(Object.assign({}, good, { conditions: [{ key: 'technical', days: 10 }] }), { asAt }).map(e => e.field), ['c_technical'], 'technical report needs its kind');
eq(O.validate(Object.assign({}, good, { conditions: [{ key: 'sale', days: 20 }] }), { asAt }).map(e => e.field), ['sale_address'], 'sale of another property needs its address');
const gap = Object.assign({}, good, { conditions: [{ key: 'builders', days: 10 }], settlement: { kind: 'date', date: '2026-12-10' } });
eq(O.validate(gap, { asAt }).map(e => e.field), ['gap'], 'gap stops sending');
eq(O.validate(Object.assign({}, gap, { date_help: true }), { asAt }), [], "I need Tim's help with dates lets it through");
eq(O.validate(Object.assign({}, good, { purchasers: Array.from({ length: 13 }, () => ({ first: 'A', last: 'B' })) }), { asAt }).map(e => e.field), ['purchasers'], 'purchaser cap');
eq(O.validate(Object.assign({}, good, { privacy: false, kiwisaver: null }), { asAt }).map(e => e.field).sort(), ['kiwisaver', 'privacy'], 'KiwiSaver answer and privacy tick needed');
eq(O.conditionsLine(good), 'Finance', 'conditions line'); eq(O.conditionsLine({ conditions: [] }), 'No conditions (unconditional)', 'unconditional line');
out.checked = 'done';
console.log(JSON.stringify(Object.assign(out, { errs }), null, 1));

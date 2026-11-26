// LW1: the First visit's shared lists (src/property-lists.js) and rules (src/fv-core.js), with no browser. Checks: the bedroom count and the
// room wording come only from Tim's calls, the same as the database (fv_rooms_profile, migration 031, whose cases the rollback test runs);
// Tim's Appendix D and Appendix F lists are all there; every tap-list fact is a profile fact in 031 and one the first visit may record
// (fv_fact_keys, and the mock's list); every question on the ideal buyers page is in the question bank (031); bedrooms are never a tap
// list; and no em dash or "St Clair" anywhere in the new files.
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src');
require(path.join(SRC, 'property-lists.js')); require(path.join(SRC, 'fv-core.js'));
const { PLISTS, FVC } = globalThis;
const errs = [], out = {};
const expect = (c, m) => { if (!c) errs.push(m); };
const room = (base, cls, pos, archived) => ({ base, tim_class: cls || '', position: pos || 0, archived: !!archived });
// the count and wording
expect(FVC.bedrooms([]) === null && FVC.wording([]) === null, 'no rooms: nothing');
expect(FVC.bedrooms([room('bedroom')]) === null, 'a bedroom not yet called: nothing');
expect(FVC.bedrooms([room('bedroom', 'bedroom'), room('bedroom')]) === 1, 'one called, one not: the one Tim called');
const R = [room('bedroom', 'bedroom', 1), room('bedroom', 'bedroom', 2), room('bedroom', 'study', 3), room('sleepout', 'sleepout', 4), room('kitchen', '', 5)];
out.w1 = FVC.wording(R); expect(out.w1 === '2 bedrooms plus study and sleepout', 'the wording: ' + out.w1);
out.w2 = FVC.wording(R.concat([room('rumpus', 'flexible', 6), room('study', 'study', 7)])); expect(out.w2 === '2 bedrooms plus 2 studies, sleepout and flexible room', 'several: ' + out.w2);
out.w3 = FVC.wording([room('bedroom', 'bedroom', 1, true), room('bedroom', 'bedroom', 2)]); expect(out.w3 === '1 bedroom', 'a room taken off the list counts for nothing: ' + out.w3);
out.w4 = FVC.wording([room('bedroom', 'flexible', 1)]); expect(out.w4 === '0 bedrooms plus flexible room', 'no bedrooms only by Tim\'s own call: ' + out.w4);
expect(FVC.bedrooms([room('living', '')]) === null, 'a living room not called: nothing');
expect(FVC.nextLabel([room('bedroom')].map(r => Object.assign(r, { label: 'Bedroom' })), 'bedroom', 'Bedroom') === 'Bedroom 2' && FVC.nextLabel([], 'living', 'Living') === 'Living', 'rooms number themselves');
expect(FVC.chattelText('Heat pumps', 2) === 'Heat pumps (2)' && FVC.chattelText('Oven', 1) === 'Oven' && JSON.stringify(FVC.chattelRead('Heat pumps (2)')) === '["Heat pumps",2]', 'chattels with counts');
expect(FVC.pending({ server: true, meta: { rev: 1, srev: 1 }, people: [{ rev: 2, srev: 1 }], rooms: [{ rev: 0, srev: 0 }], facts: { a: { rev: 1, srev: 0 } }, answers: {} }) === 2, 'pending counts what is still to send');
// one chattels list: the same as the database's fv_chattels_agreement (the rollback test's own case), and the same map
out.chat = FVC.chattelsAgreement(['Heat pumps (2)', 'Blinds', 'Oven'], ['Woodburner', 'Refrigerator', 'Freezer'], ['Freezer']);
expect(JSON.stringify(out.chat) === JSON.stringify({ chattels: ['Blinds', 'Heat pump', 'Fridge'], chatOther: 'Also staying: Heat pumps (2), Oven, Woodburner. Going with the vendors: Freezer.' }), 'chattels for the agreement: ' + JSON.stringify(out.chat));
expect(JSON.stringify(FVC.chattelsAgreement([], [], [])) === JSON.stringify({ chattels: [], chatOther: null }), 'no chattels: nothing');
{ const m31 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '031_first_visit.sql'), 'utf8');
  const sqlMap = JSON.parse((m31.match(/fv_chattel_map\(\)[\s\S]*?select '(\{[^']*\})'::jsonb/) || [])[1] || 'null');
  expect(JSON.stringify(sqlMap) === JSON.stringify(FVC.CHATTEL_MAP), 'the database\'s chattel map is the page\'s');
  const app0 = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8'), ch = JSON.parse((app0.match(/const CHATTELS = (\[[^\]]*\]);/) || [])[1].replace(/'/g, '"'));
  expect(JSON.stringify(ch) === JSON.stringify(FVC.AGREEMENT_CHATTELS), 'the agreement\'s chips are the agreement form\'s own list');
  const sqlAg = [...((m31.match(/fv_agreement_chattels\(\)[\s\S]*?array\[([^\]]*)\]/) || [])[1] || '').matchAll(/'([^']+)'/g)].map(m => m[1]);
  expect(JSON.stringify(sqlAg) === JSON.stringify(ch), 'and the database\'s');
  Object.keys(FVC.CHATTEL_MAP).forEach(k => expect(PLISTS.STANDARD_CHATTELS.includes(k) || PLISTS.FEATURED_CHATTELS.includes(k), 'a mapped chattel is on Tim\'s lists: ' + k)); }
// Tim's lists
const L = PLISTS;
out.featured = L.FEATURED_CHATTELS.length; expect(out.featured >= 48, 'about 50 featured chattels: ' + out.featured);
['Air conditioning', 'EV charger', 'Power wall', 'Spa pool', 'Woodburner', 'Coal burner', 'Aviary or coop', 'Wind turbine'].forEach(x => expect(L.FEATURED_CHATTELS.includes(x), 'featured chattel ' + x));
['study', 'sleepout', 'rumpus', 'studio', 'flat', 'workshop', 'gym', 'conservatory', 'guest_house', 'games_room', 'cinema', 'storage', 'attic'].forEach(x => expect(L.EXTRA_ROOMS.some(r => r[0] === x), 'extra space ' + x));
['living', 'dining', 'kitchen', 'bedroom', 'bathroom', 'ensuite', 'toilet', 'laundry', 'garage'].forEach(x => expect(L.ROOMS.some(r => r[0] === x), 'room ' + x));
expect(JSON.stringify(L.ROOM_CLASSES.map(c => c[0])) === JSON.stringify(['bedroom', 'study', 'office', 'living', 'studio', 'sleepout', 'flexible']), 'Tim\'s calls');
['Drive-on access', 'Boat ramp', 'Fully fenced'].forEach(x => expect(L.OUTDOOR.includes(x), 'outdoor ' + x));
expect(L.OUTLOOK.length === 12 && L.OUTLOOK.includes('CBD views'), 'outlook');
['Growing families', 'Carefree, lock and leave', 'Hosts and B&B operators', 'Luxury and sports cars', 'Work from homers'].forEach(x => expect(L.IDEAL_FOR.includes(x), 'ideal for ' + x));
expect(L.STORY.length === 6 && L.IDEAL_BUYER.length === 8, 'their story and the ideal buyers');
expect(!L.FACTS.some(f => f[0] === 'pBed'), 'bedrooms are never a tap list');
const grouped = L.FACT_GROUPS.flatMap(g => g[1]); expect(grouped.length === L.FACTS.length && L.FACTS.every(f => grouped.includes(f[0])), 'every fact is on the page once');
// the database and the mock agree with the lists
const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '031_first_visit.sql'), 'utf8');
const m028 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '028_shared_records.sql'), 'utf8');
const keysIn = s => new Set([...s.matchAll(/\('([A-Za-z_]+)', '[^']*', '[a-z_]+', \d+, (?:true|false), (?:null|'[a-z_]+')\)/g)].map(m => m[1]));
const profileKeys = new Set([...keysIn(mig), ...keysIn(m028)]);
L.FACTS.forEach(f => expect(profileKeys.has(f[0]), 'a profile fact in 028 or 031: ' + f[0]));
const fk = (mig.match(/fv_fact_keys\(\)[\s\S]*?array\[([\s\S]*?)\]/) || [])[1] || '';
const fvKeys = [...fk.matchAll(/'([A-Za-z_]+)'/g)].map(m => m[1]);
expect(JSON.stringify(fvKeys.slice().sort()) === JSON.stringify(L.FACTS.map(f => f[0]).sort()), 'fv_fact_keys() is the tap lists: ' + fvKeys);
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const mk = JSON.parse((mock.match(/const FV_FACTS=(\[[^\]]*\])/) || [])[1].replace(/'/g, '"'));
expect(JSON.stringify(mk.slice().sort()) === JSON.stringify(fvKeys.slice().sort()), 'the mock records the same facts');
const qs = new Set([...mig.matchAll(/\('([a-z_]+)', '[^']*(?:''[^']*)*', '(?:text|list|choice|scale)'/g)].map(m => m[1]));
L.STORY.concat(L.IDEAL_BUYER).map(x => x[0]).concat(['ideal_for', 'why_talk', 'client_heart']).forEach(k => expect(qs.has(k), 'in the question bank (031): ' + k));
expect(['why_talk', 'client_heart'].every(k => mig.split('\n').some(l => l.trim().startsWith(`('${k}',`) && /, false\),?$/.test(l.trim()))), 'why they want to talk and the client heart are never for vendors');
// wording rules in the new files
for (const f of [path.join(SRC, 'property-lists.js'), path.join(SRC, 'fv-core.js'), path.join(__dirname, '..', 'migrations', '031_first_visit.sql')]) {
  const t = fs.readFileSync(f, 'utf8');
  expect(!/—/.test(t), 'no em dash in ' + path.basename(f));
  expect(!/\bSt\.? Clair\b/.test(t), 'Saint Clair, never the short form, in ' + path.basename(f));
}
const app = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8'), sec = app.slice(app.indexOf('LW1: THE FIRST VISIT'), app.indexOf('PORTAL (PORTAL-PLAN.md'));
expect(sec.length > 1000 && !/[–—]/.test(sec), 'no em or en dash on the First visit page');
console.log(JSON.stringify({ out, errs }, null, 1));

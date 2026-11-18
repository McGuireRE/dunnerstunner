// Builds the rollback test for migration 013: the migration and a real lookup result (fn/property_lookup_core.ts run on the
// recorded Dunedin answers) are put inside the test's DO block, so one statement creates everything, runs the checks and then
// raises, which undoes it all. Run: node onboarding/tests/council-rollback.js > <file>.sql and execute the output against the
// project. Nothing is kept. (Named .js, not .test.js, so run-all.js doesn't run it.)
const fs = require('fs'), path = require('path');
const { makeFetch, SCENARIOS } = require('./files/council-fixtures.js');
(async () => {
  const core = await import(path.join(__dirname, '..', '..', 'fn', 'property_lookup_core.ts'));
  const res = await core.lookup({ address: SCENARIOS.dunedin.asked }, { fetch: makeFetch('dunedin'), now: () => new Date('2026-11-18T01:00:00Z') });
  const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '013_council_lookup.sql'), 'utf8');
  // only the values the test uses, without the per-source list, to keep the statement small (each value exactly as the core made it)
  const KEYS = ['title_ref', 'legal_description', 'land_area', 'capital_value', 'zone', 'hazard_dcc_none'];
  const json = JSON.stringify(Object.assign({}, res, { sources: [], info: [], values: res.values.filter(v => KEYS.includes(v.key)) }));
  for (const tag of ['$mig$', '$t$', '$res$']) if (mig.includes(tag) || json.includes(tag)) throw new Error('tag clash ' + tag);
  process.stdout.write(fs.readFileSync(path.join(__dirname, 'council-rollback.sql'), 'utf8').replace('$mig$__MIGRATION__$mig$', () => '$mig$' + mig + '$mig$').replace('$res$__RESULT__$res$', () => '$res$' + json + '$res$'));
})();

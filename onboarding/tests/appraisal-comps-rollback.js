// Builds the rollback test for migration 034 (appraisal comparables, photos, never-mix list, market store, and the two safety fixes):
// the whole migration goes inside the test's DO block, and the near-duplicate address cases from tests/files/addr-cases.json (the
// same list the browser test runs through APPR.addrMatch) go in as a values list. Run:
//   node onboarding/tests/appraisal-comps-rollback.js > <file>.sql
// and execute the output against the local stand-in (tests/appraisal-comps-standin.sql says how it is built). Nothing is kept.
// (Named .js, not .test.js, so run-all.js doesn't run it.)
const fs = require('fs'), path = require('path');
// whole-line comments are left out to keep the statement small; nothing else changes. Statements run in order inside the block.
const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '034_appraisal_comps.sql'), 'utf8').split('\n').filter(l => !/^\s*--/.test(l)).join('\n')
  .trim().replace(/;\s*$/, '');
for (const tag of ['$mig$', '$t$']) if (mig.includes(tag)) throw new Error('tag clash ' + tag);
const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'files', 'addr-cases.json'), 'utf8')).cases;
const vals = cases.map(([a, b, w], i) => `(${i + 1}, ${q(a)}, ${q(b)}, ${q(w)})`).join(',\n    ');
process.stdout.write(fs.readFileSync(path.join(__dirname, 'appraisal-comps-rollback.sql'), 'utf8')
  .replace('$mig$__MIGRATION__$mig$', () => mig).replace('__ADDR_CASES__', () => vals));

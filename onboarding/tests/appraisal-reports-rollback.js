// Builds the rollback test for migration 035 (comparables from an uploaded report, photos from a listing page, case-by-case suburbs):
// the whole migration goes inside the test's DO block. Run:
//   node onboarding/tests/appraisal-reports-rollback.js > <file>.sql
// and execute the output against the local stand-in (tests/appraisal-reports-standin.sql says how it is built). Nothing is kept.
// (Named .js, not .test.js, so run-all.js doesn't run it.)
const fs = require('fs'), path = require('path');
// whole-line comments are left out to keep the statement small; nothing else changes. Statements run in order inside the block.
const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '035_appraisal_reports_photos.sql'), 'utf8').split('\n').filter(l => !/^\s*--/.test(l)).join('\n')
  .trim().replace(/;\s*$/, '');
for (const tag of ['$mig$', '$t$']) if (mig.includes(tag)) throw new Error('tag clash ' + tag);
process.stdout.write(fs.readFileSync(path.join(__dirname, 'appraisal-reports-rollback.sql'), 'utf8').replace('$mig$__MIGRATION__$mig$', () => mig));

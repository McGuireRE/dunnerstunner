// Builds the rollback test for migration 036 (LW3 phase B: the header, a video introduction, What I heard, the mockup listing, the
// ideal buyers and Google reviews): the whole migration goes inside the test's DO block. Run:
//   node onboarding/tests/appraisal-home-rollback.js > <file>.sql
// and execute the output against the local stand-in (tests/appraisal-home-standin.sql says how it is built), or read-only on live
// (it raises at the end, so nothing is kept). (Named .js, not .test.js, so run-all.js doesn't run it.)
const fs = require('fs'), path = require('path');
// whole-line comments are left out to keep the statement small; nothing else changes. Statements run in order inside the block.
const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '036_appraisal_home.sql'), 'utf8').split('\n').filter(l => !/^\s*--/.test(l)).join('\n')
  .trim().replace(/;\s*$/, '');
for (const tag of ['$mig$', '$t$']) if (mig.includes(tag)) throw new Error('tag clash ' + tag);
process.stdout.write(fs.readFileSync(path.join(__dirname, 'appraisal-home-rollback.sql'), 'utf8').replace('$mig$__MIGRATION__$mig$', () => mig));

// Builds the rollback test for migration 033 (appraisal set-up): the whole migration goes inside the test's DO block. Run:
// node onboarding/tests/appraisal-setup-rollback.js > <file>.sql and execute the output against a database with the live schema (the
// local stand-in tests/appraisal-setup-standin.sql, built on an empty database; or the live project, as a check that changes nothing).
// Nothing is kept. (Named .js, not .test.js, so run-all.js doesn't run it.)
const fs = require('fs'), path = require('path');
// whole-line comments are left out to keep the statement small; nothing else changes. Statements run in order inside the block.
const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '033_appraisal_setup.sql'), 'utf8').split('\n').filter(l => !/^\s*--/.test(l)).join('\n')
  .trim().replace(/;\s*$/, '');
for (const tag of ['$mig$', '$t$']) if (mig.includes(tag)) throw new Error('tag clash ' + tag);
process.stdout.write(fs.readFileSync(path.join(__dirname, 'appraisal-setup-rollback.sql'), 'utf8').replace('$mig$__MIGRATION__$mig$', () => mig));

// Builds the rollback test for migration 032 (appraisal views): the whole migration goes inside the test's DO block. Run:
// node onboarding/tests/appraisal-views-rollback.js > <file>.sql and execute the output against a database with the live schema (the
// live project, or the local stand-in tests/pg-standin.sql). Nothing is kept. (Named .js, not .test.js, so run-all.js doesn't run it.)
const fs = require('fs'), path = require('path');
// whole-line comments are left out to keep the statement small; nothing else changes. Statements run in order inside the block.
const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '032_appraisal_views.sql'), 'utf8').split('\n').filter(l => !/^\s*--/.test(l)).join('\n')
  .trim().replace(/;\s*$/, '');
for (const tag of ['$mig$', '$t$']) if (mig.includes(tag)) throw new Error('tag clash ' + tag);
// DDL inside a plpgsql block runs as plain statements; each statement of the migration becomes one line of the block
process.stdout.write(fs.readFileSync(path.join(__dirname, 'appraisal-views-rollback.sql'), 'utf8').replace('$mig$__MIGRATION__$mig$', () => mig));

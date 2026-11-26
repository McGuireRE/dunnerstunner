// Builds the rollback test for migration 028 (LW0, the shared records): the whole migration goes inside the test's DO block. Run:
// node onboarding/tests/shared-records-rollback.js > <file>.sql and execute the output against the live project (it raises at the end, so
// nothing is kept) or a local stand-in built through 030 (tests/pg-standin.sql, 010, 016 part A, 018, 019, 021 to 026,
// tests/pg-standin-signatures.sql, 029, tests/pg-standin-agency.sql, 030, then tests/lw0-standin-030.sql, which brings what 028 builds on to
// its live definitions).
// (Named .js, not .test.js, so run-all.js doesn't run it.)
const fs = require('fs'), path = require('path');
// whole-line comments are left out to keep the statement small; nothing else changes
const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '028_shared_records.sql'), 'utf8').split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
for (const tag of ['$mig$', '$t$']) if (mig.includes(tag)) throw new Error('tag clash ' + tag);
process.stdout.write(fs.readFileSync(path.join(__dirname, 'shared-records-rollback.sql'), 'utf8').replace('$mig$__MIGRATION__$mig$', () => '$mig$' + mig + '$mig$'));

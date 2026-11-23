// Builds the rollback test for migration 022 (condition timing): the whole migration goes inside the test's DO block. Run:
// node onboarding/tests/offer-timing-rollback.js > <file>.sql and execute the output against a database that has 018 applied.
// Nothing is kept. (Named .js, not .test.js, so run-all.js doesn't run it.)
const fs = require('fs'), path = require('path');
// whole-line comments are left out to keep the statement small; nothing else changes
const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '022_offer_condition_timing.sql'), 'utf8').split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
for (const tag of ['$mig$', '$t$']) if (mig.includes(tag)) throw new Error('tag clash ' + tag);
process.stdout.write(fs.readFileSync(path.join(__dirname, 'offer-timing-rollback.sql'), 'utf8').replace('$mig$__MIGRATION__$mig$', () => '$mig$' + mig + '$mig$'));

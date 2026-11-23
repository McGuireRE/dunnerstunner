// Builds the rollback test for migration 020 (purchaser signing): the whole migration goes inside the test's DO block. Run:
// node onboarding/tests/offer-sign-rollback.js > <file>.sql and execute the output against a database that has 019 (and 018, 016,
// 010) applied. Nothing is kept. (Named .js, not .test.js, so run-all.js doesn't run it.)
const fs = require('fs'), path = require('path');
// whole-line comments are left out to keep the statement small; nothing else changes
const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '020_offer_signing.sql'), 'utf8').split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
for (const tag of ['$mig$', '$t$']) if (mig.includes(tag)) throw new Error('tag clash ' + tag);
process.stdout.write(fs.readFileSync(path.join(__dirname, 'offer-sign-rollback.sql'), 'utf8').replace('$mig$__MIGRATION__$mig$', () => '$mig$' + mig + '$mig$'));

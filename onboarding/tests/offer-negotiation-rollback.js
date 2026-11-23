// Builds the rollback test for migration 021 (presentation and counteroffers): the whole migration goes inside the test's DO block.
// Run: node onboarding/tests/offer-negotiation-rollback.js > <file>.sql and execute the output against a database that has 020 (and
// 019, 018, 016, 010) applied. Nothing is kept. (Named .js, not .test.js, so run-all.js doesn't run it.)
const fs = require('fs'), path = require('path');
// whole-line comments are left out to keep the statement small; nothing else changes
const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '021_offer_negotiation.sql'), 'utf8').split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
for (const tag of ['$mig$', '$t$', '$f$', '$b$']) if (mig.includes(tag)) throw new Error('tag clash ' + tag);
process.stdout.write(fs.readFileSync(path.join(__dirname, 'offer-negotiation-rollback.sql'), 'utf8').replace('$mig$__MIGRATION__$mig$', () => '$mig$' + mig + '$mig$'));

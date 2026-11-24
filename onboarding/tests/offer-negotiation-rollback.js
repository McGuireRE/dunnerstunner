// Builds the rollback test for migration 024 (presentation and counteroffers; built as 021): the whole migration goes inside the test's
// DO block. Run: node onboarding/tests/offer-negotiation-rollback.js > <file>.sql and execute the output against a database that has
// 023 (and 019, 018, 016, 010) applied. With --with-023, migration 023 runs first inside the same block, so the test can run on a
// database that has neither (the live project before either is applied): both are undone. Nothing is kept. (Named .js, not .test.js,
// so run-all.js doesn't run it.)
const fs = require('fs'), path = require('path');
// whole-line comments are left out to keep the statement small; nothing else changes
const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '024_offer_negotiation.sql'), 'utf8').split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
for (const tag of ['$mig$', '$t$', '$f$', '$b$', '$m23$']) if (mig.includes(tag)) throw new Error('tag clash ' + tag);
const with23 = process.argv.includes('--with-023');
const m23 = with23 ? fs.readFileSync(path.join(__dirname, '..', 'migrations', '023_offer_signing.sql'), 'utf8').split('\n').filter(l => !/^\s*--/.test(l)).join('\n') : '';
if (with23) for (const tag of ['$m23$', '$t$', '$f$', '$b$', '$mig$']) if (m23.includes(tag)) throw new Error('tag clash in 023 ' + tag);
process.stdout.write(fs.readFileSync(path.join(__dirname, 'offer-negotiation-rollback.sql'), 'utf8').replace('$mig$__MIGRATION__$mig$', () => (with23 ? '$m23$' + m23 + '$m23$; execute ' : '') + '$mig$' + mig + '$mig$'));

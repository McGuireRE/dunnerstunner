// Builds the rollback test for migration 026 (Offers fixes 3: undo in a signing turn, Tim starting a round again, going back to the last
// sealed round, and "Confirm the agreement" held while frozen): the whole migration goes inside the test's DO block. Run:
// node onboarding/tests/offer-undo-rollback.js > <file>.sql and execute the output against a database that has 025 applied (the live
// project, or the local stand-in). Nothing is kept. (Named .js, not .test.js, so run-all.js doesn't run it.)
const fs = require('fs'), path = require('path');
// whole-line comments are left out to keep the statement small; nothing else changes
const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '026_offer_undo_revert_hold.sql'), 'utf8').split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
for (const tag of ['$mig$', '$t$', '$f$', '$b$']) if (mig.includes(tag)) throw new Error('tag clash ' + tag);
process.stdout.write(fs.readFileSync(path.join(__dirname, 'offer-undo-rollback.sql'), 'utf8').replace('$mig$__MIGRATION__$mig$', () => '$mig$' + mig + '$mig$'));

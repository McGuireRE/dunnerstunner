// Builds the rollback test for migration 029 (signing: chattels initials, four more marks, Tim's own changes to the places): the whole
// migration goes inside the test's DO block. Run:
// node onboarding/tests/signing-marks-rollback.js > <file>.sql and execute the output against a database that has 026 applied (the live
// project, or the local stand-in). Nothing is kept. (Named .js, not .test.js, so run-all.js doesn't run it.)
const fs = require('fs'), path = require('path');
// whole-line comments are left out to keep the statement small; nothing else changes
const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '029_signing_places_marks.sql'), 'utf8').split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
for (const tag of ['$mig$', '$t$', '$f$', '$b$']) if (mig.includes(tag)) throw new Error('tag clash ' + tag);
process.stdout.write(fs.readFileSync(path.join(__dirname, 'signing-marks-rollback.sql'), 'utf8').replace('$mig$__MIGRATION__$mig$', () => '$mig$' + mig + '$mig$'));

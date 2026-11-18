// Builds the rollback test for migration 015: puts the migration inside the test's DO block, so one statement creates everything,
// runs the checks and then raises, which undoes it all. Run: node onboarding/tests/orc-route-rollback.js > <file>.sql and execute the
// output against the project. Nothing is kept. (Named .js, not .test.js, so run-all.js doesn't run it.)
const fs = require('fs'), path = require('path');
const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '015_orc_by_database.sql'), 'utf8');
if (mig.includes('$mig$') || mig.includes('$t$')) throw new Error('tag clash');
process.stdout.write(fs.readFileSync(path.join(__dirname, 'orc-route-rollback.sql'), 'utf8').replace('$mig$__MIGRATION__$mig$', () => '$mig$' + mig + '$mig$'));

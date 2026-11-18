// Builds the rollback test for migration 016: PART A of the migration is put inside the test's DO block (PART B, the
// storage bucket and its policies, is left out: it is run once when the migration is applied). Run:
// node onboarding/tests/repo-rollback.js > <file>.sql and execute the output against the project. Nothing is kept.
// (Named .js, not .test.js, so run-all.js doesn't run it.)
const fs = require('fs'), path = require('path');
const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '016_property_repository.sql'), 'utf8');
const cut = mig.indexOf('-- ═══════════════ PART B');
if (cut < 0) throw new Error('PART B marker missing');
const partA = mig.slice(0, cut);
for (const tag of ['$mig$', '$t$']) if (partA.includes(tag)) throw new Error('tag clash ' + tag);
process.stdout.write(fs.readFileSync(path.join(__dirname, 'repo-rollback.sql'), 'utf8').replace('$mig$__MIGRATION__$mig$', () => '$mig$' + partA + '$mig$'));

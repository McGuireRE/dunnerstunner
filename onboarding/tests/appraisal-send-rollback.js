// Builds the rollback test for migration 037 (LW3 phase E: sending an appraisal to the vendor): the whole migration goes inside the
// test's DO block. Run:
//   node onboarding/tests/appraisal-send-rollback.js > <file>.sql
// and execute the output against the local stand-in (tests/appraisal-send-standin.sql says how it is built). It raises at the end,
// so nothing is kept. (Named .js, not .test.js, so run-all.js doesn't run it.)
const fs = require('fs'), path = require('path');
// whole-line comments are left out to keep the statement small; nothing else changes. Statements run in order inside the block.
const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '037_appraisal_send.sql'), 'utf8').split('\n').filter(l => !/^\s*--/.test(l)).join('\n')
  .trim().replace(/;\s*$/, '');
// the whitelist's real section sets (tests/appraisal-clean-cases.js): what the mock's cleaner gives, for the database to match exactly
const cases = JSON.stringify(require('./appraisal-clean-cases.js').cases().map(c => ({ name: c.name, sections: c.rec.sections, expected: c.expected })));
for (const tag of ['$mig$', '$t$', '$cases$']) if (mig.includes(tag) || cases.includes(tag)) throw new Error('tag clash ' + tag);
process.stdout.write(fs.readFileSync(path.join(__dirname, 'appraisal-send-rollback.sql'), 'utf8').replace('$mig$__MIGRATION__$mig$', () => mig)
  .replace('$cases$__CLEAN_CASES__$cases$', () => '$cases$' + cases + '$cases$'));

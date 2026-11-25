// Builds the rollback test for migration 025 (Offers fixes 2: the agent's own contact details in the email privacy check, and the agreed
// copy's email to Tim): the whole migration goes inside the test's DO block. Run: node onboarding/tests/offer-mail-own-rollback.js > <file>.sql
// and execute the output against a database that has 024 applied (the live project, or the local stand-in). Nothing is kept. (Named .js,
// not .test.js, so run-all.js doesn't run it.)
const fs = require('fs'), path = require('path');
// whole-line comments are left out to keep the statement small; nothing else changes
const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '025_offer_mail_agent_own.sql'), 'utf8').split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
for (const tag of ['$mig$', '$t$']) if (mig.includes(tag)) throw new Error('tag clash ' + tag);
process.stdout.write(fs.readFileSync(path.join(__dirname, 'offer-mail-own-rollback.sql'), 'utf8').replace('$mig$__MIGRATION__$mig$', () => '$mig$' + mig + '$mig$'));

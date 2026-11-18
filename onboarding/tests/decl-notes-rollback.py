# Builds the rollback test for migration 014: the migration is put inside the test's DO block, so one statement creates
# everything, runs the checks and then raises, which undoes it all. Run: python3 onboarding/tests/decl-notes-rollback.py > /tmp/x.sql
# and execute the output against the project. Nothing is kept.
import os
here = os.path.dirname(os.path.abspath(__file__))
mig = open(os.path.join(here, '..', 'migrations', '014_decl_notes_need_answers.sql')).read()
assert '$mig$' not in mig and '$t$' not in mig
print(open(os.path.join(here, 'decl-notes-rollback.sql')).read().replace('__MIGRATION__', mig))

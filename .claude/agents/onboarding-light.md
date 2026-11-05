---
name: onboarding-light
description: Builds the lighter phases of the onboarding plan (3, 4 and 5): the journey map, translation, and stages after signing. Use for onboarding/BUILD-PLAN.md phases marked onboarding-light.
model: sonnet
---
You build part of Tim McGuire's vendor onboarding system in the dunnerstunner repository.

Before writing anything, read: `CLAUDE.md`, `onboarding/BUILD-PLAN.md` (your phase), and
`onboarding/migrations/000_schema_reference.md`. Read the live database with the Supabase tools when unsure.

Work in small steps. After each step, rebuild (`python3 onboarding/src/build.py`) and run the tests
(`node onboarding/tests/run-all.js`). Add a test for everything you add, using the mock in
`onboarding/tests/mock.js` (extend the mock for new tables and functions so it behaves like the database).

Database changes: additive only, applied with the Supabase migration tool, each saved as the exact SQL in
`onboarding/migrations/NNN_name.sql`. Test every new function with a rollback block before relying on it.
Never weaken the triggers that protect signed records, and never change an existing signature or fingerprint.

Do not push to GitHub and do not deploy edge functions. When the phase is complete and every test passes,
report: what changed (screens, database, PDFs, emails), the migration files, the tests added, and anything
left undone or needing Tim. Keep the report factual; the reviewer reads it next.

-- 022: tighten the default table privileges of the two client roles. Revoke only; no table, row, policy, trigger or function changes.
-- Supabase's defaults gave anon and authenticated TRUNCATE, TRIGGER and REFERENCES on every public table. Row Level Security does not
-- apply to TRUNCATE, so a role holding it could empty a table outright (the website API cannot issue TRUNCATE, so this was reachable
-- only with a direct database login, but it should not exist at all). The site never needs any of the three. Security-definer
-- functions run as the table owner and are unaffected; service_role and the owner keep everything.
-- Approved by Tim, 24 November 2026. Numbered 022: the next free number when applied.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from anon, authenticated;

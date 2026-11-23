-- 24 November 2026, at Tim's request. Applied to the live database.
-- tim@mcguire.co.nz was listed as an agent login but had never been used to sign in (no auth.users row).
-- A second mailbox that can open the agent side is a spare key. hello@timmcguire.co.nz is now the only agent login.
-- The address is still Tim's public contact and reply-to address in emails and PDFs; that is unchanged.
-- To undo: insert into public.agents (email, name) values ('tim@mcguire.co.nz', 'Tim McGuire');
delete from public.agents where lower(email) = 'tim@mcguire.co.nz';

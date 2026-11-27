-- A local PostgreSQL 16 stand-in for migration 034's rollback test (tests/appraisal-comps-rollback.js). NEVER run on the live project.
-- Run on an empty database, in this order (each with psql -v ON_ERROR_STOP=1 -f):
--   1. tests/appraisal-setup-standin.sql   every table and helper 032 and 033 touch, at their live definitions, and 032 as applied
--   2. migrations/033_appraisal_setup.sql  exactly as applied live (27 November 2026)
--   3. this file                           what 034 adds to: the storage schema as live, an appraisal written in phase A, and a
--                                          check that 033's functions here are word for word the live ones
-- Then the rollback block. Read from the live project with SELECTs on pg_catalog, information_schema and storage (nothing was written
-- there) on 27 November 2026: the storage.buckets and storage.objects columns 034 uses, Row Level Security on both, the live grants
-- (anon and authenticated may select, insert, update and delete on both; their policies decide), storage.foldername word for word, the
-- three live buckets by name, and two of the live storage policies (kept here so the test can show 034 leaves them as they were).
-- The md5 of each 033 function body below was read live; the block at the end refuses to finish if this stand-in differs.

create schema if not exists storage;
create table storage.buckets (id text not null primary key, name text not null, owner uuid, created_at timestamptz default now(), updated_at timestamptz default now(),
  public boolean default false, avif_autodetection boolean default false, file_size_limit bigint, allowed_mime_types text[], owner_id text);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid,
  created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz default now(), metadata jsonb, path_tokens text[], version text, owner_id text, user_metadata jsonb);
CREATE OR REPLACE FUNCTION storage.foldername(name text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$function$;
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.buckets, storage.objects to anon, authenticated;
grant all on storage.buckets, storage.objects to service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
insert into storage.buckets (id, name, public) values ('private', 'private', false), ('ql-public', 'ql-public', true), ('property-files', 'property-files', false);
create policy agent_all_files on storage.objects using (bucket_id = 'private' and public.is_agent()) with check (bucket_id = 'private' and public.is_agent());
create policy repo_agent_read on storage.objects for select to authenticated using (bucket_id = 'property-files' and public.is_agent());

-- an invented appraisal written from its phase A set-up (the test checks 034 leaves every value of it, and of the hand-loaded row, as it was)
insert into public.properties (address) values ('RB 2 Phase Street, Testville');
insert into public.appraisal_views (property_id, title, address, prepared_for, prepared_on, status, setup, kind, sections, fields)
  select id, 'RB 2 Phase Street, Testville: Market Appraisal', 'RB 2 Phase Street, Testville', 'Phase Person', date '2026-11-27', 'ready',
    '{"v":1,"campaign":{"kind":"standard"},"method":"deadline","plan":"premium","basis":"comparables"}'::jsonb, 'standard',
    '[{"type":"heading","text":"My opinion of price"},{"type":"opinion"},{"type":"heading","text":"How I would sell it"},{"type":"method"}]'::jsonb,
    '{"ranges":[{"key":"A","option":"Your home","involves":"","low":500000,"high":550000}],"method":{"name":"Deadline sale","key":"deadline","text":"I would recommend a deadline sale."}}'::jsonb
  from public.properties where address = 'RB 2 Phase Street, Testville';

-- 033's functions here must be the live ones, word for word (md5 of each body, read live on 27 November 2026)
do $c$
declare x text;
begin
  select string_agg(proname || '=' || md5(prosrc), ',' order by proname) into x from pg_proc
    where pronamespace = 'public'::regnamespace and proname in ('agent_appraisal_create', 'agent_appraisal_save', 'appraisal_wording_problem');
  if x is distinct from 'agent_appraisal_create=795488f8fea6f7d2362ac4d080c5a2fc,agent_appraisal_save=bbaa0522878b3d8d56f7ad24ff8a08dc,appraisal_wording_problem=82febcc6c04844b2d10db201ea6d6923' then
    raise exception 'stand-in differs from live 033: %', x;
  end if;
end $c$;

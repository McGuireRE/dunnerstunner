-- A local PostgreSQL 16 stand-in for migration 033's rollback test (tests/appraisal-setup-rollback.js). NEVER run on the live project.
-- Every table and helper 033 and its test touch, at its LIVE definition, read with SELECTs on pg_catalog and information_schema on
-- 27 November 2026 (nothing was written to the live project): the columns with their types, defaults and NOT NULLs, the checks, the
-- foreign keys, Row Level Security with the live policies, the live grants, the live default privileges (Supabase grants execute on
-- every new function to anon and authenticated, which is why 033 revokes it), and these functions word for word: is_agent,
-- touch_updated, guard_found; with the live triggers on properties (profile_from_found is left out: it fires only on an update of found,
-- which the test never makes). Then 032 exactly as applied.
-- Run once on an empty database: psql -v ON_ERROR_STOP=1 -f tests/appraisal-setup-standin.sql, then the rollback block.
do $r$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $r$;
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
create schema if not exists auth;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth, extensions, public to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
-- the live default privileges in public (for objects made by postgres)
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete, references on tables to anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select, update on sequences to anon, authenticated, service_role;
set search_path = public, extensions;

-- agents: as live (email and name NOT NULL, no default for name); one invented agent
create table public.agents (email text not null, name text not null, created_at timestamptz not null default now());
insert into public.agents (email, name) values ('agent@example.test', 'Stand-in Agent');

CREATE OR REPLACE FUNCTION public.is_agent()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.agents a where lower(a.email) = lower(coalesce(auth.jwt()->>'email','')));
$function$;
CREATE OR REPLACE FUNCTION public.touch_updated()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ begin new.updated_at := now(); return new; end $function$;
CREATE OR REPLACE FUNCTION public.guard_found()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('app.council_accept', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.found, '{}'::jsonb) <> '{}'::jsonb or coalesce(new.provenance, '{}'::jsonb) <> '{}'::jsonb then
      raise exception 'Public record values are only saved with Use these';
    end if;
  elsif new.found is distinct from old.found or new.provenance is distinct from old.provenance then
    raise exception 'Public record values are only saved with Use these';
  end if;
  return new;
end $function$;

-- properties: every live column, the stage check, the live triggers and policies
create table public.properties (
  id uuid not null default gen_random_uuid() primary key,
  address text not null default ''::text,
  title_ref text, legal_description text, owners_on_title text,
  ownership jsonb not null default '{}'::jsonb, description jsonb not null default '{}'::jsonb, disclosures jsonb not null default '{}'::jsonb,
  stage text not null default 'appraisal'::text check (stage = any (array['appraisal'::text, 'questionnaire'::text, 'plan'::text, 'accepted'::text, 'agreement'::text, 'signed'::text, 'live'::text, 'under_offer'::text, 'sold'::text, 'settled'::text, 'withdrawn'::text])),
  stage_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  cycle_at timestamptz, found jsonb not null default '{}'::jsonb, provenance jsonb not null default '{}'::jsonb);
create trigger guard_found before insert or update on public.properties for each row execute function public.guard_found();
create trigger touch_properties before update on public.properties for each row execute function public.touch_updated();
alter table public.properties enable row level security;
create policy prop_agent on public.properties using (public.is_agent()) with check (public.is_agent());

-- agreements: only what ai_calls' foreign key needs (the key itself)
create table public.agreements (id uuid not null default gen_random_uuid() primary key);

-- ai_calls: every live column with its NOT NULLs and defaults, the live foreign key, RLS with the one live policy, the live grants
create table public.ai_calls (
  id bigserial primary key, at timestamptz not null default now(), purpose text not null, model text not null, ok boolean not null,
  error text, input_tokens integer default 0, output_tokens integer default 0, files integer,
  agreement_id uuid references public.agreements(id) on delete set null, agent text);
alter table public.ai_calls enable row level security;
create policy ai_calls_agent_read on public.ai_calls for select using (public.is_agent());
grant select, insert, update, delete on public.ai_calls to anon, authenticated;

-- 032 exactly as applied live
create table public.appraisal_views (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete set null,
  title text not null default '',
  address text not null default '',
  prepared_for text not null default '',
  prepared_on date,
  status text not null default 'draft' check (status in ('draft', 'presented', 'archived')),
  sections jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  fields jsonb not null default '{}'::jsonb check (jsonb_typeof(fields) = 'object'),
  created_by text not null default coalesce(auth.jwt()->>'email', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index appraisal_views_property_idx on public.appraisal_views (property_id);
alter table public.appraisal_views enable row level security;
create policy appraisal_views_agent_select on public.appraisal_views for select to authenticated using (public.is_agent());
create policy appraisal_views_agent_insert on public.appraisal_views for insert to authenticated with check (public.is_agent());
create policy appraisal_views_agent_update on public.appraisal_views for update to authenticated using (public.is_agent()) with check (public.is_agent());
revoke all on public.appraisal_views from anon;
revoke delete, truncate, trigger, references on public.appraisal_views from authenticated;
create trigger appraisal_views_touch before update on public.appraisal_views for each row execute function public.touch_updated();

-- an invented row loaded by hand, as the live one was: the test checks 033 leaves every value of it as it was
insert into public.appraisal_views (title, address, prepared_for, sections, fields)
  values ('RB 1 Hand Street: Market Appraisal', 'RB 1 Hand Street, Testville', 'Hand Person',
    '[{"type":"heading","text":"My appraisal"},{"type":"ranges"},{"type":"method"}]'::jsonb,
    '{"ranges":[{"key":"A","option":"A. Option one","involves":"Sample","low":400000,"high":450000}],"bedrooms":"3 bedrooms","method":{"name":"Deadline sale","text":"Sample"}}'::jsonb);
reset search_path;

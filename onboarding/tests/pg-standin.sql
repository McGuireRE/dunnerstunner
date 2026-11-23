-- A minimal Supabase-like stand-in for testing migrations on a local PostgreSQL 16 (never the live project). Used for 019 to 021
-- (property_people.phone added for 021's privacy check, as the live table has it):
--   psql -f tests/pg-standin.sql, then 010, 016 (part A), 018 as the migrations are written, then the rollback block.
-- Roles anon, authenticated and service_role; auth.jwt() from request.jwt.claims; pgcrypto in extensions; storage.objects
-- with the size and type in metadata; the few tables and helpers the offer migrations build on.
do $r$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; end if; end $r$;
create schema extensions; create extension pgcrypto schema extensions;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
create schema storage;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb, created_at timestamptz default now());
grant usage on schema auth, extensions, public to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant execute on all functions in schema extensions to anon, authenticated, service_role;
create table public.agents (email text, name text, created_at timestamptz default now());
insert into public.agents (email) values ('agent@example.test');
create table public.properties (id uuid primary key default gen_random_uuid(), address text, stage text default 'appraisal', cycle_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.property_people (id uuid primary key default gen_random_uuid(), property_id uuid references public.properties(id), position int, legal_name text, email text, phone text not null default '', user_id uuid, role text default 'owner');
create table public.agreements (id uuid primary key default gen_random_uuid(), property_id uuid, status text default 'draft', created_at timestamptz default now());
create table public.agreement_people (id uuid primary key default gen_random_uuid(), agreement_id uuid, user_id uuid);
create table public.property_inspections (id uuid primary key default gen_random_uuid(), property_id uuid);
create table public.property_documents (id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on delete cascade, kind text, name text not null, path text not null,
  source text not null default 'dropped' check (source in ('dropped','uploaded','generated')), read_result jsonb, created_by text, created_at timestamptz not null default now());
create function public.is_agent() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.agents a where lower(a.email) = lower(coalesce(auth.jwt()->>'email',''))) $$;
create function public.touch_updated() returns trigger language plpgsql set search_path = public as $$ begin new.updated_at := now(); return new; end $$;
create function public.no_change() returns trigger language plpgsql as $$ begin raise exception 'This record can''t be changed'; end $$;
alter table public.properties enable row level security;
create policy p_agent on public.properties for select using (public.is_agent());
create policy p_party on public.properties for select using (exists (select 1 from public.property_people pp where pp.property_id = id and lower(pp.email) = lower(auth.jwt()->>'email')));
alter table public.property_documents enable row level security;
create policy pd_agent on public.property_documents for all using (public.is_agent()) with check (public.is_agent());
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant select on storage.objects to service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

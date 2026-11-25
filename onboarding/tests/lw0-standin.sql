-- A local PostgreSQL 16 stand-in for checking migration 028 (LW0) quickly before its rollback test runs on the live project. Never the
-- live project. Tables are copied from the live columns (26 November 2026), with the helpers 028 builds on; the inspection functions
-- are left out (the live rollback test covers them). Run: psql -f tests/lw0-standin.sql, then the 028 rollback block's own checks.
do $r$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; end if; end $r$;
create schema if not exists extensions; create extension if not exists pgcrypto;
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
create table public.agents (email text not null, name text not null default '', created_at timestamptz default now() not null);
insert into public.agents (email) values ('agent@example.test');
create table public.properties (id uuid default gen_random_uuid() primary key, address text default '' not null, title_ref text, legal_description text, owners_on_title text, ownership jsonb default '{}' not null, description jsonb default '{}' not null, disclosures jsonb default '{}' not null, stage text default 'appraisal' not null, stage_at timestamptz default now() not null, created_at timestamptz default now() not null, updated_at timestamptz default now() not null, cycle_at timestamptz, found jsonb default '{}' not null, provenance jsonb default '{}' not null);
create table public.crm_contacts (id uuid default gen_random_uuid() primary key, kind text default 'person' not null, display_name text not null, first_name text, last_name text, preferred_name text, legal_name text, salutation text, organisation_name text, status text default 'active' not null, lead_source text, primary_agent_email text, summary text, notes text, marketing_consent text default 'unknown' not null, consent_source text, consent_at timestamptz, lockedon_client_id text, external_ids jsonb default '{}' not null, custom jsonb default '{}' not null, last_contacted_at timestamptz, created_at timestamptz default now() not null, updated_at timestamptz default now() not null, archived_at timestamptz, aml_status text default 'none' not null, aml_checked_at timestamptz, aml_cdd_level text, aml_risk text, aml_pep text, aml_next_review_on date, aml_latest_file_id uuid);
create table public.property_people (id uuid default gen_random_uuid() primary key, property_id uuid not null references public.properties(id) on delete cascade, position integer default 1 not null, legal_name text default '' not null, pref_name text default '' not null, email text default '' not null, phone text default '' not null, user_id uuid, source text, created_at timestamptz default now() not null, updated_at timestamptz default now() not null, role text default 'owner' not null check (role in ('owner','contact','former')), name_from text, contact_id uuid references public.crm_contacts(id) on delete set null);
create table public.agreements (id uuid default gen_random_uuid() primary key, ref text, address text default '' not null, status text default 'draft' not null, agreement_version text default 'v' not null, config jsonb default '{}' not null, answers jsonb default '{}' not null, legal jsonb default '{}' not null, signed_at timestamptz, created_at timestamptz default now() not null, updated_at timestamptz default now() not null, property_id uuid);
create table public.agreement_people (id uuid default gen_random_uuid() primary key, agreement_id uuid not null references public.agreements(id) on delete cascade, position integer default 1 not null, legal_name text default '' not null, pref_name text default '' not null, email text default '' not null, phone text default '' not null, user_id uuid, id_verified_at timestamptz, signed_at timestamptz, created_at timestamptz default now() not null, contact_id uuid references public.crm_contacts(id) on delete set null);
create table public.signatures (id uuid default gen_random_uuid() primary key, agreement_id uuid not null, person_id uuid, signer_role text not null, signer_name text not null, snapshot jsonb not null, snapshot_sha256 text not null, signed_at timestamptz default now() not null);
create table public.lawyer_links (id uuid default gen_random_uuid() primary key, agreement_id uuid not null, lawyer_name text not null, firm text default '' not null, email text not null, sent_at timestamptz default now() not null);
create table public.aml_files (id uuid default gen_random_uuid() primary key, agreement_id uuid not null, person_id uuid unique, data jsonb default '{}' not null, locked_at timestamptz, created_at timestamptz default now() not null, updated_at timestamptz default now() not null, contact_id uuid references public.crm_contacts(id) on delete restrict);
create table public.prelistings (id uuid default gen_random_uuid() primary key, address text not null, contact_name text, contact_email text not null, status text default 'appraisal' not null, appraisal jsonb default '{}' not null, answers jsonb default '{}' not null, plan jsonb default '{}' not null, user_id uuid, created_at timestamptz default now() not null, updated_at timestamptz default now() not null, proceeded_at timestamptz, property_id uuid references public.properties(id));
create table public.property_inspections (id uuid default gen_random_uuid() primary key, property_id uuid not null references public.properties(id), status text default 'in_progress' not null, facts jsonb default '{}' not null, declaration jsonb default '{}' not null, notes jsonb default '{}' not null, photos jsonb default '[]' not null, stamps jsonb default '{}' not null, applied jsonb default '{}' not null, conflicts jsonb default '{}' not null, resolved jsonb default '{}' not null, created_by text not null, started_at timestamptz default now() not null, finished_at timestamptz, created_at timestamptz default now() not null, updated_at timestamptz default now() not null);
create table public.property_documents (id uuid default gen_random_uuid() primary key, property_id uuid not null references public.properties(id), kind text, name text not null, path text not null, source text default 'dropped' not null, created_at timestamptz default now() not null, folder text, inspection_id uuid, taken_at timestamptz, archived_at timestamptz, updated_at timestamptz default now() not null);
create table public.crm_contact_methods (id uuid default gen_random_uuid() primary key, contact_id uuid not null references public.crm_contacts(id) on delete cascade, kind text not null check (kind in ('email','mobile','phone','address','website','social')), label text, value text not null, value_norm text default '' not null, is_primary boolean default false not null, opted_out_at timestamptz, bounced_at timestamptz, source text, created_at timestamptz default now() not null, unique (contact_id, kind, value_norm));
create table public.crm_property_links (id uuid default gen_random_uuid() primary key, contact_id uuid not null references public.crm_contacts(id) on delete cascade, property_id uuid not null references public.properties(id) on delete cascade, role text not null constraint crm_property_links_role_check check (role in ('owner','vendor','purchaser','prospective_buyer','tenant','landlord','occupier','solicitor','broker','enquirer','open_home_attendee','neighbour','referrer','other')), is_current boolean default true not null, started_on date, ended_on date, notes text, source text, created_at timestamptz default now() not null, updated_at timestamptz default now() not null, unique (contact_id, property_id, role));
create table public.crm_profiles (id uuid default gen_random_uuid() primary key, contact_id uuid not null references public.crm_contacts(id) on delete cascade, profile_type text not null, status text default 'active' not null, property_id uuid, motivation text, timeframe text, price_expectation numeric, notes text, created_at timestamptz default now() not null, updated_at timestamptz default now() not null);
create table public.ql_listings (id uuid default gen_random_uuid() primary key, ref text, status text default 'draft' not null, headline text, suburb text, property_type text, beds integer, baths numeric, living integer, parking integer, land_m2 numeric, floor_m2 numeric, year_built text, features text[] default '{}' not null, rv numeric, photos jsonb default '[]' not null, created_at timestamptz default now() not null, updated_at timestamptz default now() not null, vendor_name text, vendor_email text, vendor_phone text, m_price text, m_motivation text, m_time text, m_notes text);
create table public.ql_seller_leads (id uuid default gen_random_uuid() primary key, created_at timestamptz default now() not null, name text not null, email text not null, phone text not null, address text not null, property_type text, beds text, expected_price text, appraised text, reason text, motivation text, "time" text, time_when text, privacy text, also_buying boolean default false not null, comments text, status text default 'new' not null, listing_id uuid references public.ql_listings(id) on delete set null);
create table public.offer_signings (id uuid default gen_random_uuid() primary key, property_id uuid not null, side text default 'purchaser' not null, status text default 'ready' not null);
create table public.offer_signers (id uuid default gen_random_uuid() primary key, signing_id uuid not null, position integer not null, name text not null, email text, person_id uuid, finished_at timestamptz);
alter table public.properties enable row level security; alter table public.property_people enable row level security; alter table public.crm_contacts enable row level security;
alter table public.crm_contact_methods enable row level security; alter table public.crm_property_links enable row level security; alter table public.prelistings enable row level security;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;   -- as Supabase does
create function public.is_agent() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.agents a where lower(a.email) = lower(coalesce(auth.jwt()->>'email',''))) $$;
create policy a on public.properties for all using (public.is_agent()) with check (public.is_agent());
create policy a on public.property_people for all using (public.is_agent()) with check (public.is_agent());
create policy a on public.crm_contacts for all to authenticated using (public.is_agent()) with check (public.is_agent());
create policy a on public.crm_contact_methods for all to authenticated using (public.is_agent()) with check (public.is_agent());
create policy a on public.crm_property_links for all to authenticated using (public.is_agent()) with check (public.is_agent());
create policy a on public.prelistings for all using (public.is_agent()) with check (public.is_agent());
create function public.jblank(v jsonb) returns boolean language sql immutable as $$ select v is null or v = 'null'::jsonb or v = '""'::jsonb or v = '[]'::jsonb or v = '{}'::jsonb $$;
create function public.norm_name(s text) returns text language sql immutable as $$ select lower(trim(regexp_replace(coalesce(s,''), '\s+', ' ', 'g'))) $$;
create function public.same_person_name(a text, b text) returns boolean language sql immutable as $$
  select public.norm_name(a) <> '' and public.norm_name(b) <> '' and (public.norm_name(a) = public.norm_name(b) or (
    split_part(public.norm_name(a), ' ', 1) = split_part(public.norm_name(b), ' ', 1) and regexp_replace(public.norm_name(a), '^.* ', '') = regexp_replace(public.norm_name(b), '^.* ', '')
    and position(' ' in public.norm_name(a)) > 0 and position(' ' in public.norm_name(b)) > 0)) $$;
create function public.desc_keys() returns text[] language sql immutable as $$ select array['pType','pYear','pBed','pBath','pFloor','pLand','pBuild','pPark','pHeat','pLove','chattels','chatOther'] $$;
create function public.stamp_ts(t text) returns timestamptz language plpgsql immutable as $$ begin if t is null or t !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' then return null; end if; return t::timestamptz; exception when others then return null; end $$;
create function public.crm_norm_value(p_kind text, p_value text) returns text language plpgsql immutable set search_path = public as $$
declare v text := coalesce(trim(p_value),'');
begin
  if p_kind = 'email' then return lower(v); end if;
  if p_kind in ('mobile','phone') then v := regexp_replace(v, '[^0-9+]', '', 'g'); if v like '+64%' then v := '0' || substr(v, 4); elsif v like '64%' and length(v) >= 10 then v := '0' || substr(v, 3); end if; return v; end if;
  return lower(regexp_replace(v, '\s+', ' ', 'g'));
end $$;
create function public.crm_methods_before() returns trigger language plpgsql set search_path = public as $$ begin new.value_norm := public.crm_norm_value(new.kind, new.value); return new; end $$;
create trigger crm_methods_norm before insert or update on public.crm_contact_methods for each row execute function public.crm_methods_before();
create function public.is_property_party(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from public.property_people pp where pp.property_id = pid and pp.role <> 'former' and (pp.user_id = auth.uid() or (pp.email <> '' and lower(pp.email) = lower(coalesce(auth.jwt()->>'email','')))))
    or exists (select 1 from public.prelistings pl where pl.property_id = pid and pl.status <> 'closed' and (pl.user_id = auth.uid() or lower(pl.contact_email) = lower(coalesce(auth.jwt()->>'email',''))))) $$;
create function public.guard_signed_person() returns trigger language plpgsql set search_path = public as $$
begin if old.signed_at is not null and (new.legal_name is distinct from old.legal_name or new.email is distinct from old.email or new.position is distinct from old.position) then raise exception 'This person has signed, so their name and email can no longer be changed'; end if; return new; end $$;
create trigger guard_signed_person before update on public.agreement_people for each row execute function public.guard_signed_person();
create function public.pl_save(p uuid, patch jsonb) returns void language plpgsql security definer set search_path = public as $$
declare r public.prelistings;
begin
  select * into r from public.prelistings where id = p;
  if r.id is null or r.status = 'closed' or not (r.user_id = auth.uid() or lower(r.contact_email) = lower(coalesce(auth.jwt()->>'email',''))) then raise exception 'Not found'; end if;
  update public.prelistings set answers = answers || coalesce(patch,'{}'::jsonb), proceeded_at = coalesce(proceeded_at, now()) where id = p;
end $$;
-- simplified stand-ins for Inspect a property (the real ones, migration 012 and 014, run in the live rollback test): facts saved as
-- given, a blank clears, the file's description follows
create function public.agent_inspection_start(p_property uuid, p_address text) returns jsonb language plpgsql security definer set search_path = public as $$
declare pid uuid := p_property; iid uuid;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if pid is null then insert into public.properties (address) values (p_address) returning id into pid; end if;
  insert into public.property_inspections (property_id, created_by) values (pid, coalesce(auth.jwt()->>'email', 'agent')) returning id into iid;
  return jsonb_build_object('inspection_id', iid, 'property_id', pid);
end $$;
create function public.agent_inspection_save(iid uuid, p_facts jsonb, p_decl jsonb, p_notes jsonb, p_stamps jsonb default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare i public.property_inspections; k text; v jsonb;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  select * into i from public.property_inspections where id = iid for update;
  for k, v in select * from jsonb_each(coalesce(p_facts, '{}')) loop
    if public.jblank(v) then i.facts := i.facts - k; update public.properties set description = description - k where id = i.property_id;
    else i.facts := i.facts || jsonb_build_object(k, v); update public.properties set description = description || jsonb_build_object(k, v) where id = i.property_id; end if;
  end loop;
  update public.property_inspections set facts = i.facts where id = iid;
  return '{}'::jsonb;
end $$;

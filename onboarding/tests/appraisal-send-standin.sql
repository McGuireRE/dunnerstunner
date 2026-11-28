-- A local PostgreSQL 16 stand-in for migration 037's rollback test (tests/appraisal-send-rollback.js). NEVER run on the live project.
-- Run on an empty database, in this order (each with psql -v ON_ERROR_STOP=1 -f):
--   1. tests/appraisal-setup-standin.sql, 2. migrations/033_appraisal_setup.sql, 3. tests/appraisal-comps-standin.sql,
--   4. migrations/034_appraisal_comps.sql, 5. tests/appraisal-reports-standin.sql, 6. migrations/035_appraisal_reports_photos.sql,
--   7. tests/appraisal-home-standin.sql, 8. migrations/036_appraisal_home.sql, 9. this file. Then the rollback block.
-- What 037 leans on beyond that chain, at its LIVE definition, read with SELECTs on pg_catalog and information_schema on 28 November
-- 2026 (nothing was written to the live project): auth.uid() as Supabase's; property_people and prelistings with every live column,
-- default, NOT NULL, check, foreign key, grant and Row Level Security policy 037 relies on; and these functions word for word, with
-- the live triggers that call them: norm_name, same_person_name, name_rank, stage_rank, bump_stage, merge_property_person,
-- prelisting_before, prelisting_after, touch_prelisting, pl_mine, pl_save. The block at the end refuses to finish if any of them, or
-- the 032 to 036 functions 037 calls, differs from live (md5 of each definition, read live).
-- Known differences, none of which 037 reads or writes:
--   * the LW0 triggers person_link_pp (property_people) and person_link_after and qa_from_prelisting (prelistings) are left out: they
--     file people and answers into the CRM and the question bank (028), which needs the whole LW0 stand-in. On live they fire when
--     "I'd like to proceed" makes a Questions before we meet, exactly as when Tim makes one from the portal today.
--   * pp_party_read (property_people) is left out: it calls is_property_party, which needs the agreements tables. 037's functions are
--     security definer and never read through it.
--   * storage.protect_delete is the stand-in's own (live's is Supabase's); both refuse a direct delete unless
--     storage.allow_delete_query is 'true'. 037 deletes nothing from storage.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.norm_name(s text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select lower(trim(regexp_replace(coalesce(s,''), '\s+', ' ', 'g')));
$function$;
CREATE OR REPLACE FUNCTION public.same_person_name(a text, b text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select public.norm_name(a) <> '' and public.norm_name(b) <> '' and (public.norm_name(a) = public.norm_name(b) or (
    split_part(public.norm_name(a), ' ', 1) = split_part(public.norm_name(b), ' ', 1)
    and regexp_replace(public.norm_name(a), '^.* ', '') = regexp_replace(public.norm_name(b), '^.* ', '')
    and position(' ' in public.norm_name(a)) > 0 and position(' ' in public.norm_name(b)) > 0));
$function$;
CREATE OR REPLACE FUNCTION public.name_rank(s text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case s when 'appraisal' then 1 when 'questionnaire' then 2 else 3 end;
$function$;
CREATE OR REPLACE FUNCTION public.stage_rank(s text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select array_position(array['appraisal','questionnaire','plan','accepted','agreement','signed','live','under_offer','sold','settled'], s);
$function$;
CREATE OR REPLACE FUNCTION public.bump_stage(pid uuid, s text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.properties set stage = s, stage_at = now()
   where id = pid and stage <> 'withdrawn' and coalesce(public.stage_rank(stage), 0) < public.stage_rank(s);
end $function$;

-- property_people: every live column, default and NOT NULL, the role check, the foreign key, the live grants, pp_agent, touch
create table public.property_people (
  id uuid not null default gen_random_uuid() primary key,
  property_id uuid not null references public.properties(id) on delete cascade,
  position integer not null default 1, legal_name text not null default ''::text, pref_name text not null default ''::text,
  email text not null default ''::text, phone text not null default ''::text, user_id uuid, source text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  role text not null default 'owner'::text, name_from text, contact_id uuid,
  constraint property_people_role_check check ((role = any (array['owner'::text, 'contact'::text, 'former'::text]))));
create trigger touch_property_people before update on public.property_people for each row execute function public.touch_updated();
alter table public.property_people enable row level security;
create policy pp_agent on public.property_people using (public.is_agent()) with check (public.is_agent());
grant select, insert, update, delete on public.property_people to anon, authenticated;

CREATE OR REPLACE FUNCTION public.merge_property_person(pid uuid, p_name text, p_pref text, p_email text, p_phone text, p_user uuid, p_source text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.property_people; em text := lower(trim(coalesce(p_email,''))); nm text := trim(regexp_replace(coalesce(p_name,''), '\s+', ' ', 'g'));
begin
  if nm = '' and em = '' then return null; end if;
  select * into r from public.property_people where property_id = pid and role <> 'former' and em <> '' and lower(email) = em order by position limit 1;
  if r.id is null and nm <> '' then select * into r from public.property_people where property_id = pid and role <> 'former' and (em = '' or email = '') and public.same_person_name(legal_name, nm) order by position limit 1; end if;   -- never merge two people with different emails
  if r.id is null then
    insert into public.property_people (property_id, position, legal_name, pref_name, email, phone, user_id, source, name_from, role)
    values (pid, coalesce((select max(position) from public.property_people where property_id = pid and role <> 'former'), 0) + 1, nm, coalesce(trim(p_pref),''), em, coalesce(trim(p_phone),''), p_user, p_source, p_source, 'owner')
    returning id into r.id;
  else
    update public.property_people set
      legal_name = case when nm <> '' and (legal_name = '' or public.name_rank(p_source) >= public.name_rank(coalesce(name_from, source))) then nm else legal_name end,
      name_from = case when nm <> '' and (legal_name = '' or public.name_rank(p_source) >= public.name_rank(coalesce(name_from, source))) then p_source else name_from end,
      pref_name = case when coalesce(trim(p_pref),'') <> '' then trim(p_pref) else pref_name end,
      email = case when em <> '' and email = '' then em else email end,   -- an email once known is never replaced by a merge
      phone = case when coalesce(trim(p_phone),'') <> '' then trim(p_phone) else phone end,
      user_id = coalesce(user_id, p_user),
      role = case when role = 'contact' and p_source <> 'appraisal' then 'owner' else role end
     where id = r.id;
  end if;
  return r.id;
end $function$;

-- prelistings (the questionnaire, Questions before we meet): every live column, default and NOT NULL, the status check, the foreign
-- keys (agreements here is the stand-in's key-only table), the live policies and grants, and its live triggers but the two LW0 ones
create table public.prelistings (
  id uuid not null default gen_random_uuid() primary key, address text not null, contact_name text, contact_email text not null,
  status text not null default 'appraisal'::text, appraisal jsonb not null default '{}'::jsonb, answers jsonb not null default '{}'::jsonb,
  plan jsonb not null default '{}'::jsonb, question text, agreement_id uuid references public.agreements(id) on delete set null, user_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), invited_at timestamptz, proceeded_at timestamptz,
  submitted_at timestamptz, plan_published_at timestamptz, question_at timestamptz, accepted_at timestamptz,
  property_id uuid references public.properties(id),
  constraint prelistings_status_check check ((status = any (array['appraisal'::text, 'submitted'::text, 'plan'::text, 'question'::text, 'accepted'::text, 'closed'::text]))));
alter table public.prelistings enable row level security;
create policy pl_agent_all on public.prelistings using (public.is_agent()) with check (public.is_agent());
create policy pl_party_read on public.prelistings for select using (((status <> 'closed'::text) AND ((user_id = auth.uid()) OR (lower(contact_email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text))))));
grant select, insert, update, delete on public.prelistings to anon, authenticated;

CREATE OR REPLACE FUNCTION public.prelisting_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pid uuid;
begin
  if new.property_id is null then
    insert into public.properties (address) values (coalesce(new.address,'')) returning id into pid;
    new.property_id := pid;
  end if;
  perform public.merge_property_person(new.property_id, coalesce(new.contact_name,''), '', new.contact_email, '', new.user_id, 'appraisal');
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.prelisting_after()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o jsonb; ids uuid[] := '{}'; rid uuid;
begin
  if new.property_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.address is distinct from old.address and not exists (select 1 from public.agreements a where a.property_id = new.property_id and a.status not in ('ended','cancelled')) then
    update public.properties set address = new.address where id = new.property_id;
  end if;
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    for o in select * from jsonb_array_elements(coalesce(new.answers->'owners','[]'::jsonb)) loop
      rid := public.merge_property_person(new.property_id, o->>'name', o->>'pref', o->>'email', o->>'mobile', null, 'questionnaire');
      if rid is not null then ids := ids || rid; end if;
    end loop;
    if array_length(ids, 1) > 0 then
      update public.property_people set role = 'contact'
       where property_id = new.property_id and role = 'owner' and source = 'appraisal' and not (id = any(ids));
    end if;
  end if;
  perform public.bump_stage(new.property_id, case new.status
    when 'appraisal' then case when new.proceeded_at is not null then 'questionnaire' else 'appraisal' end
    when 'submitted' then 'questionnaire' when 'plan' then 'plan' when 'question' then 'plan' when 'accepted' then 'accepted' else 'appraisal' end);
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.touch_prelisting()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ begin new.updated_at := now(); return new; end $function$;
CREATE OR REPLACE FUNCTION public.pl_mine(p uuid)
 RETURNS prelistings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.prelistings;
begin
  select * into r from public.prelistings where id = p;
  if r.id is null or r.status = 'closed' or not (r.user_id = auth.uid() or lower(r.contact_email) = lower(coalesce(auth.jwt()->>'email',''))) then raise exception 'Not found'; end if;
  if r.user_id is null then update public.prelistings set user_id = auth.uid() where id = p; end if;
  return r;
end $function$;
CREATE OR REPLACE FUNCTION public.pl_save(p uuid, patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.prelistings;
begin
  r := public.pl_mine(p);
  if r.status <> 'appraisal' then raise exception 'Your answers have already been sent to Tim'; end if;
  update public.prelistings set answers = answers || coalesce(patch,'{}'::jsonb), proceeded_at = coalesce(proceeded_at, now()) where id = p;
end $function$;
create trigger prelisting_property_before before insert on public.prelistings for each row execute function prelisting_before();
create trigger prelisting_property_after after insert or update on public.prelistings for each row execute function prelisting_after();
create trigger touch_prelisting before update on public.prelistings for each row execute function touch_prelisting();
-- the agreements the triggers above ask about (key-only in the chain): the two live columns they read
alter table public.agreements add column property_id uuid, add column status text not null default 'draft';
-- the agreement's appraisal link (037, Tim 28 November 2026: "Just the permalink"): the rest of the live agreements columns, the live
-- status check, agreement_people's live columns, and the live guard on signed agreements with its trigger (read live 28 November 2026).
-- Left out: agreements_ref, agreement_property_before/after, agreement_signed_notices, profile_from_agreement and profile_fv_chattels
-- (they set the reference, file the property, make notices and file answers; none reads or blocks config->'apprLink'). 037's trigger
-- agreement_appr_link runs beside guard_signed_agreement and never weakens it.
alter table public.agreements add column ref text unique, add column address text not null default ''::text,
  add column agreement_version text not null default 'v3.15-26102026'::text, add column config jsonb not null default '{}'::jsonb,
  add column answers jsonb not null default '{}'::jsonb, add column legal jsonb not null default '{}'::jsonb, add column sent_at timestamptz,
  add column signed_at timestamptz, add column copy_sent_at timestamptz, add column cooling_off_until timestamptz, add column countersigned_at timestamptz,
  add column ended_at timestamptz, add column created_at timestamptz not null default now(), add column updated_at timestamptz not null default now(),
  add column copy_error text,
  add constraint agreements_status_check check ((status = any (array['draft'::text, 'sent'::text, 'parked'::text, 'signed'::text, 'countersigned'::text, 'cancelled'::text, 'ended'::text])));
create table if not exists public.agreement_people (id uuid primary key default gen_random_uuid(), agreement_id uuid not null references public.agreements(id),
  position integer not null default 1, legal_name text not null default ''::text, pref_name text not null default ''::text, email text not null default ''::text,
  phone text not null default ''::text, user_id uuid, id_verified_at timestamptz, signed_at timestamptz, created_at timestamptz not null default now(), contact_id uuid);
CREATE OR REPLACE FUNCTION public.guard_signed_agreement()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare signed boolean;
begin
  select exists (select 1 from public.agreement_people where agreement_id = old.id and signed_at is not null) into signed;
  if not signed then return new; end if;
  if new.address is distinct from old.address or new.answers is distinct from old.answers
     or (new.config - 'agent_notes') is distinct from (old.config - 'agent_notes') then
    raise exception 'This agreement has been signed, so its terms can no longer be changed';
  end if;
  return new;
end $function$
;
create trigger guard_signed_agreement before update on public.agreements for each row execute function guard_signed_agreement();
-- live Row Level Security on both (party_read_agreements and party_read_people are left out: they call is_party, which needs the
-- signing tables; Tim's agent_all policies are what the agreement editor writes through)
alter table public.agreements enable row level security; alter table public.agreement_people enable row level security;
create policy agent_all_agreements on public.agreements for all to authenticated using (is_agent()) with check (is_agent());
create policy agent_all_people on public.agreement_people for all to authenticated using (is_agent()) with check (is_agent());
grant all on public.agreement_people to authenticated;

-- every function 037 calls or runs beside, word for word as live (md5 of pg_get_functiondef, read live on 28 November 2026)
do $chk$
declare want constant jsonb := '{
  "agent_appraisal_create(uuid,text,text,boolean)": "bb1a8fb62017763124077cbf0347887b",
  "agent_appraisal_save(uuid,jsonb,jsonb,jsonb,text,text,text,text)": "015be31150f445b9fd7f3bc13cc4aaa0",
  "appraisal_wording_problem(jsonb)": "7f82cf1770e34b3d4052bf7c4cc7b20d",
  "guard_appraisal_view()": "3d0147dba9b2bd39b6f33cde991e1365",
  "guard_appraisal_comp()": "07e37dd5d7525e6dfab8fa86d93823f6",
  "guard_appraisal_media()": "5628573dbcee813645efb228e89c3135",
  "guard_appraisal_asset()": "577dabdf8236f2aa21f4773f6582b80d",
  "is_agent()": "861ed6ee5d819f8e3b21387775ef053e",
  "touch_updated()": "05a815bdf8eb39f6d190da40c9565c86",
  "norm_name(text)": "ed1ff53d99b7edfb2c8c19485b0d2e35",
  "same_person_name(text,text)": "0a0b22b630d9084bd124dd6fcedf49d9",
  "name_rank(text)": "cb2967540c707918aeb29b4851e43706",
  "stage_rank(text)": "5cc59d081ee406051a4087e66641c784",
  "bump_stage(uuid,text)": "8850ce70bef565f67d221782cdd34e43",
  "merge_property_person(uuid,text,text,text,text,uuid,text)": "1d249954fbe2206235f2dde3e458e636",
  "prelisting_before()": "03a17b21a24d40e1f4410e9a4a7b2c79",
  "prelisting_after()": "86cfc2e804055a8d65d962a960fc9df0",
  "touch_prelisting()": "3c6b39871eeace95df979cd9c9be6c88",
  "pl_mine(uuid)": "1ebd350dbd1821d71820ea0e6c6838d2",
  "pl_save(uuid,jsonb)": "373d33970229a9e341f4ca249def06c1",
  "guard_signed_agreement()": "760e3d102c39745128881f89f0bf8534",
  "storage.foldername(text)": "93671af66e1fe108a56068ad4137d001"}';
  k text; got text; bad text := '';
begin
  for k in select jsonb_object_keys(want) loop
    select md5(pg_get_functiondef(k::regprocedure)) into got;
    if got is distinct from want->>k then bad := bad || k || ' '; end if;
  end loop;
  if to_regclass('public.appraisal_snapshots') is not null then bad := bad || '037 already applied '; end if;
  if bad <> '' then raise exception 'THE STAND-IN DIFFERS FROM LIVE: %', bad; end if;
  raise notice 'stand-in matches live where 037 leans on it';
end $chk$;

-- Added to the local PostgreSQL stand-in (tests/pg-standin.sql) for migration 030's rollback test: the agency agreement's tables that
-- 030's fixtures write (agreements, agreement_people, agreement_events, lawyer_links, properties, property_people) brought to their live
-- definitions, and auth.users, read with SELECTs on information_schema and pg_catalog on 27 November 2026: the same columns, types,
-- defaults, NOT NULLs, checks, unique keys, foreign keys (agreement_people.user_id to auth.users included), triggers and the functions
-- the triggers call, word for word; is_party, require_open and log_event as live; the three four-argument lawyer functions as live
-- (their live fingerprints: agent_send_to_lawyer 4703fa91, vendor_forward_to_lawyer a84c4ddb, vendor_send_to_lawyer 3bc41a15).
-- Left out: the crm_contacts keys on contact_id (no crm_contacts here; no fixture sets contact_id), and prior_agency_notices, which only
-- on_agreement_signed reaches, on a change of status to signed (no fixture makes one). auth.users here holds only the columns live
-- requires (id, is_sso_user, is_anonymous) and email, with live's unique email index; on live it has RLS with no policies, which the
-- postgres role bypasses (rolbypassrls), as the stand-in's superuser does.
-- Run once on the stand-in after 029 (and pg-standin-signatures.sql). Only adds what is missing. NEVER on the live project.
do $$ begin if current_database() = 'postgres' then raise exception 'This file is for the local stand-in only'; end if; end $$;

-- auth.users (only what the fixtures need, with live's NOT NULLs and email index)
create table if not exists auth.users (id uuid primary key, email character varying(255), is_sso_user boolean not null default false, is_anonymous boolean not null default false);
create unique index if not exists users_email_partial_key on auth.users using btree (email) where (is_sso_user = false);
alter table auth.users enable row level security;

-- properties
alter table public.properties add column if not exists title_ref text, add column if not exists legal_description text, add column if not exists owners_on_title text,
  add column if not exists ownership jsonb not null default '{}'::jsonb, add column if not exists description jsonb not null default '{}'::jsonb,
  add column if not exists disclosures jsonb not null default '{}'::jsonb, add column if not exists stage_at timestamptz not null default now(),
  add column if not exists found jsonb not null default '{}'::jsonb, add column if not exists provenance jsonb not null default '{}'::jsonb;
alter table public.properties alter column address set default '', alter column address set not null, alter column stage set default 'appraisal', alter column stage set not null,
  alter column created_at set default now(), alter column created_at set not null, alter column updated_at set default now(), alter column updated_at set not null;

-- property_people
alter table public.property_people add column if not exists pref_name text not null default '', add column if not exists source text, add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(), add column if not exists name_from text, add column if not exists contact_id uuid;
alter table public.property_people alter column position set default 1, alter column position set not null, alter column legal_name set default '', alter column legal_name set not null,
  alter column email set default '', alter column email set not null, alter column phone set default '', alter column phone set not null, alter column role set default 'owner', alter column role set not null;

-- agreements
alter table public.agreements add column if not exists ref text, add column if not exists address text not null default '', add column if not exists agreement_version text not null default 'v3.15-26102026',
  add column if not exists config jsonb not null default '{}'::jsonb, add column if not exists answers jsonb not null default '{}'::jsonb, add column if not exists legal jsonb not null default '{}'::jsonb,
  add column if not exists sent_at timestamptz, add column if not exists signed_at timestamptz, add column if not exists copy_sent_at timestamptz, add column if not exists cooling_off_until timestamptz,
  add column if not exists countersigned_at timestamptz, add column if not exists ended_at timestamptz, add column if not exists updated_at timestamptz not null default now(), add column if not exists copy_error text;
alter table public.agreements alter column status set default 'draft', alter column status set not null, alter column created_at set default now(), alter column created_at set not null;
create sequence if not exists public.agreement_ref_seq start 1001;

-- agreement_people
alter table public.agreement_people add column if not exists position integer not null default 1, add column if not exists pref_name text not null default '',
  add column if not exists id_verified_at timestamptz, add column if not exists created_at timestamptz not null default now(), add column if not exists contact_id uuid;
alter table public.agreement_people alter column agreement_id set not null, alter column legal_name set default '', alter column legal_name set not null,
  alter column email set default '', alter column email set not null, alter column phone set default '', alter column phone set not null;

-- agreement_events
create table if not exists public.agreement_events (id bigint generated always as identity primary key, agreement_id uuid not null, at timestamptz not null default now(), actor text not null, kind text not null, detail jsonb not null default '{}'::jsonb);

-- lawyer_links
alter table public.lawyer_links add column if not exists token text not null default encode(extensions.gen_random_bytes(24), 'hex'), add column if not exists first_opened_at timestamptz,
  add column if not exists last_opened_at timestamptz, add column if not exists open_count integer not null default 0, add column if not exists expires_at timestamptz not null default (now() + '30 days'::interval),
  add column if not exists emailed_at timestamptz, add column if not exists email_error text, add column if not exists sent_by text;
alter table public.lawyer_links alter column agreement_id set not null, alter column lawyer_name set not null, alter column firm set default '', alter column firm set not null,
  alter column email set not null, alter column sent_at set default now(), alter column sent_at set not null;

-- the checks, unique keys and foreign keys as live (only where missing)
do $c$
declare r record;
begin
  for r in select * from (values
    ('public.agreements', 'agreements_ref_key', 'unique (ref)'),
    ('public.agreements', 'agreements_status_check', 'check (status = any (array[''draft'', ''sent'', ''parked'', ''signed'', ''countersigned'', ''cancelled'', ''ended'']))'),
    ('public.agreements', 'agreements_property_id_fkey', 'foreign key (property_id) references public.properties(id)'),
    ('public.agreement_people', 'agreement_people_agreement_id_fkey', 'foreign key (agreement_id) references public.agreements(id) on delete cascade'),
    ('public.agreement_people', 'agreement_people_user_id_fkey', 'foreign key (user_id) references auth.users(id)'),
    ('public.agreement_events', 'agreement_events_agreement_id_fkey', 'foreign key (agreement_id) references public.agreements(id) on delete cascade'),
    ('public.lawyer_links', 'lawyer_links_agreement_id_fkey', 'foreign key (agreement_id) references public.agreements(id) on delete cascade'),
    ('public.lawyer_links', 'lawyer_links_token_key', 'unique (token)'),
    ('public.properties', 'properties_stage_check', 'check (stage = any (array[''appraisal'', ''questionnaire'', ''plan'', ''accepted'', ''agreement'', ''signed'', ''live'', ''under_offer'', ''sold'', ''settled'', ''withdrawn'']))'),
    ('public.property_people', 'property_people_property_id_fkey', 'foreign key (property_id) references public.properties(id) on delete cascade'),
    ('public.property_people', 'property_people_role_check', 'check (role = any (array[''owner'', ''contact'', ''former'']))')) v(tbl, name, def)
  loop
    -- a stand-in key on the same columns under another name is replaced by live's
    if not exists (select 1 from pg_constraint where conname = r.name and conrelid = r.tbl::regclass) then
      execute format('alter table %s add constraint %I %s', r.tbl, r.name, r.def);
    end if;
  end loop;
end $c$;

-- the functions the triggers call, and the agency agreement helpers, as live
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
CREATE OR REPLACE FUNCTION public.jblank(v jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select v is null or v = 'null'::jsonb or v = '""'::jsonb or v = '[]'::jsonb or v = '{}'::jsonb;
$function$;
CREATE OR REPLACE FUNCTION public.stage_rank(s text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select array_position(array['appraisal','questionnaire','plan','accepted','agreement','signed','live','under_offer','sold','settled'], s);
$function$;
CREATE OR REPLACE FUNCTION public.desc_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$ select array['pType','pYear','pBed','pBath','pFloor','pLand','pBuild','pPark','pHeat','pLove','chattels','chatOther'] $function$;
CREATE OR REPLACE FUNCTION public.disc_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$ select array['work','workDetail','wt','wtDetail','meth','methDetail','def','defDetail','hazards','hazOther'] $function$;
CREATE OR REPLACE FUNCTION public.pick(j jsonb, keys text[])
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce(jsonb_object_agg(k, j->k), '{}'::jsonb) from unnest(keys) k where j ? k;
$function$;
CREATE OR REPLACE FUNCTION public.pick_keep(cur jsonb, j jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(coalesce(j, '{}'::jsonb)) e
   where not (public.jblank(e.value) and not public.jblank(coalesce(cur, '{}'::jsonb) -> e.key));
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
CREATE OR REPLACE FUNCTION public.make_prior_notices(a uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ag public.agreements; x jsonb; i int := 0;
begin
  select * into ag from public.agreements where id = a;
  if coalesce(ag.answers->>'prior','') <> 'yes' then return; end if;
  for x in select * from jsonb_array_elements(coalesce(ag.answers->'priorAgencies','[]'::jsonb)) loop
    if coalesce(trim(x->>'agency'),'') <> '' then
      insert into public.prior_agency_notices (agreement_id, idx, agency, agent_name, email, kind, dated)
      values (a, i, trim(x->>'agency'), nullif(trim(x->>'agent'),''), nullif(lower(trim(x->>'email')),''), nullif(x->>'kind',''), nullif(trim(x->>'dated'),''))
      on conflict (agreement_id, idx) do nothing;
    end if;
    i := i + 1;
  end loop;
  if found then perform public.log_event(a, 'system', 'prior_notices_ready', '{}'::jsonb); end if;
end $function$;
CREATE OR REPLACE FUNCTION public.no_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin raise exception 'Records in % cannot be changed or deleted', tg_table_name; end $function$;
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
CREATE OR REPLACE FUNCTION public.set_agreement_ref()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.ref is null then new.ref := 'MRE-' || to_char(now(),'YYYY') || '-' || nextval('public.agreement_ref_seq'); end if;
  new.updated_at := now();
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.agreement_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pid uuid;
begin
  if new.property_id is null then
    insert into public.properties (address, title_ref, owners_on_title) values (coalesce(new.address,''), nullif(new.config->>'title',''), nullif(new.config->>'owners','')) returning id into pid;
    new.property_id := pid;
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.agreement_after()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.property_id is null then return new; end if;
  if new.status not in ('ended','cancelled')
     and not exists (select 1 from public.agreements x where x.property_id = new.property_id and x.id <> new.id and x.status not in ('ended','cancelled') and x.created_at > new.created_at)
     and (tg_op = 'INSERT' or new.address is distinct from old.address or new.config is distinct from old.config or new.answers is distinct from old.answers) then
    update public.properties set
      address = case when coalesce(new.address,'') <> '' then new.address else address end,
      title_ref = coalesce(nullif(new.config->>'title',''), title_ref),
      owners_on_title = coalesce(nullif(new.config->>'owners',''), owners_on_title),
      ownership = ownership || public.pick_keep(ownership, public.pick(new.answers, array['capacity','entity'])),
      description = description || public.pick_keep(description, public.pick(new.answers, public.desc_keys())),
      disclosures = disclosures || public.pick_keep(disclosures, public.pick(new.answers, public.disc_keys()))
     where id = new.property_id;
  end if;
  if new.status in ('ended','cancelled') then
    if tg_op = 'UPDATE' and old.status not in ('ended','cancelled')
       and not exists (select 1 from public.agreements x where x.property_id = new.property_id and x.id <> new.id and x.status not in ('ended','cancelled')) then
      update public.properties set stage = 'withdrawn', stage_at = now() where id = new.property_id and stage not in ('settled','withdrawn');
    end if;
  else
    perform public.bump_stage(new.property_id, case when new.status in ('signed','countersigned') then 'signed' else 'agreement' end);
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.on_agreement_signed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'signed' and old.status is distinct from 'signed' then perform public.make_prior_notices(new.id); end if;
  return new;
end $function$;
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
end $function$;
CREATE OR REPLACE FUNCTION public.guard_signed_person()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if old.signed_at is not null and (new.legal_name is distinct from old.legal_name or new.email is distinct from old.email or new.position is distinct from old.position) then
    raise exception 'This person has signed, so their name and email can no longer be changed';
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.agreement_person_after()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ag public.agreements; r public.agreement_people;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  select * into ag from public.agreements where id = r.agreement_id;
  if ag.property_id is null or ag.status in ('ended','cancelled') then return null; end if;
  if tg_op = 'DELETE' then
    update public.property_people pp set role = 'former'
     where pp.property_id = ag.property_id and pp.role <> 'former'
       and ((r.email <> '' and lower(pp.email) = lower(r.email)) or (coalesce(r.email,'') = '' and public.norm_name(pp.legal_name) = public.norm_name(r.legal_name)))
       and not exists (select 1 from public.agreements x join public.agreement_people y on y.agreement_id = x.id
                        where x.property_id = ag.property_id and x.id <> ag.id and x.status not in ('ended','cancelled')
                          and ((pp.email <> '' and lower(y.email) = lower(pp.email)) or public.norm_name(y.legal_name) = public.norm_name(pp.legal_name)));
  else
    -- an email corrected on the agreement corrects the same person on the property
    if tg_op = 'UPDATE' and coalesce(old.email,'') <> '' and lower(old.email) <> lower(coalesce(new.email,'')) and coalesce(new.email,'') <> ''
       and not exists (select 1 from public.property_people where property_id = ag.property_id and role <> 'former' and lower(email) = lower(new.email)) then
      update public.property_people set email = lower(trim(new.email)) where property_id = ag.property_id and role <> 'former' and lower(email) = lower(old.email);
    end if;
    perform public.merge_property_person(ag.property_id, r.legal_name, r.pref_name, r.email, r.phone, r.user_id, 'agreement');
  end if;
  return null;
end $function$;
CREATE OR REPLACE FUNCTION public.is_party(a uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.agreement_people p where p.agreement_id = a and p.user_id = auth.uid());
$function$;
CREATE OR REPLACE FUNCTION public.log_event(a uuid, actor text, kind text, detail jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into public.agreement_events (agreement_id, actor, kind, detail) values (a, actor, kind, detail);
$function$;
CREATE OR REPLACE FUNCTION public.require_open(a uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_party(a) then raise exception 'Not your agreement'; end if;
  if not exists (select 1 from public.agreements where id = a and status in ('sent','parked')) then
    raise exception 'This agreement can no longer be changed';
  end if;
end $function$;

-- the three four-argument lawyer functions, as live (030 adds five-argument ones beside them)
CREATE OR REPLACE FUNCTION public.agent_send_to_lawyer(a uuid, l_name text, l_firm text, l_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare lid uuid; who text;
begin
  if not public.is_agent() then raise exception 'Not allowed'; end if;
  select string_agg(coalesce(nullif(pref_name,''), split_part(legal_name,' ',1)), ' and ') into who from public.agreement_people where agreement_id = a and legal_name <> '';
  insert into public.lawyer_links (agreement_id, lawyer_name, firm, email, sent_by) values (a, l_name, coalesce(l_firm,''), l_email, coalesce(who, 'Your client')) returning id into lid;
  update public.agreements set status = 'parked', sent_at = coalesce(sent_at, now()), legal = legal || jsonb_build_object('status','sent','lawyer',l_name,'firm',l_firm,'sent_at',now()) where id = a and status in ('draft','sent','parked');
  perform public.log_event(a, coalesce(auth.jwt()->>'email','agent'), 'sent_to_lawyer', jsonb_build_object('lawyer', l_name, 'firm', l_firm, 'email', l_email, 'recorded', 'at appointment'));
  return lid;
end $function$;
CREATE OR REPLACE FUNCTION public.vendor_forward_to_lawyer(a uuid, l_name text, l_firm text, l_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare lid uuid; who text;
begin
  if not public.is_party(a) then raise exception 'Not your agreement'; end if;
  if not exists (select 1 from public.agreements where id = a and status in ('signed','countersigned','ended')) then
    raise exception 'The agreement has not been signed yet';
  end if;
  if coalesce(trim(l_name),'') = '' or l_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Add the lawyer''s name and a valid email'; end if;
  select coalesce(nullif(legal_name,''), email) into who from public.agreement_people where agreement_id = a and user_id = auth.uid() limit 1;
  insert into public.lawyer_links (agreement_id, lawyer_name, firm, email, sent_by, expires_at)
  values (a, l_name, coalesce(l_firm,''), l_email, who, now() + interval '90 days') returning id into lid;
  perform public.log_event(a, coalesce(auth.jwt()->>'email','vendor'), 'forwarded_to_lawyer', jsonb_build_object('lawyer', l_name, 'firm', l_firm, 'email', l_email, 'by', who));
  return lid;
end $function$;
CREATE OR REPLACE FUNCTION public.vendor_send_to_lawyer(a uuid, l_name text, l_firm text, l_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare lid uuid; who text;
begin
  perform public.require_open(a);
  select coalesce(nullif(legal_name,''), email) into who from public.agreement_people where agreement_id = a and user_id = auth.uid() limit 1;
  insert into public.lawyer_links (agreement_id, lawyer_name, firm, email, sent_by) values (a, l_name, coalesce(l_firm,''), l_email, who) returning id into lid;
  update public.agreements set status = 'parked', legal = legal || jsonb_build_object('status','sent','lawyer',l_name,'firm',l_firm,'sent_at',now()) where id = a;
  perform public.log_event(a, coalesce(auth.jwt()->>'email','vendor'), 'sent_to_lawyer', jsonb_build_object('lawyer', l_name, 'firm', l_firm, 'email', l_email));
  return lid;
end $function$;
revoke execute on function public.agent_send_to_lawyer(uuid, text, text, text), public.vendor_forward_to_lawyer(uuid, text, text, text), public.vendor_send_to_lawyer(uuid, text, text, text) from public, anon;
grant execute on function public.agent_send_to_lawyer(uuid, text, text, text), public.vendor_forward_to_lawyer(uuid, text, text, text), public.vendor_send_to_lawyer(uuid, text, text, text) to authenticated, service_role;

-- the triggers, as live (only where missing)
do $g$
declare r record;
begin
  for r in select * from (values
    ('public.agreement_events', 'agreement_events_immutable', 'BEFORE DELETE OR UPDATE ON public.agreement_events FOR EACH ROW EXECUTE FUNCTION public.no_change()'),
    ('public.agreement_people', 'agreement_person_property', 'AFTER INSERT OR DELETE OR UPDATE ON public.agreement_people FOR EACH ROW EXECUTE FUNCTION public.agreement_person_after()'),
    ('public.agreement_people', 'guard_signed_person', 'BEFORE UPDATE ON public.agreement_people FOR EACH ROW EXECUTE FUNCTION public.guard_signed_person()'),
    ('public.agreements', 'agreement_property_after', 'AFTER INSERT OR UPDATE ON public.agreements FOR EACH ROW EXECUTE FUNCTION public.agreement_after()'),
    ('public.agreements', 'agreement_property_before', 'BEFORE INSERT ON public.agreements FOR EACH ROW EXECUTE FUNCTION public.agreement_before()'),
    ('public.agreements', 'agreement_signed_notices', 'AFTER UPDATE OF status ON public.agreements FOR EACH ROW EXECUTE FUNCTION public.on_agreement_signed()'),
    ('public.agreements', 'agreements_ref', 'BEFORE INSERT OR UPDATE ON public.agreements FOR EACH ROW EXECUTE FUNCTION public.set_agreement_ref()'),
    ('public.agreements', 'guard_signed_agreement', 'BEFORE UPDATE ON public.agreements FOR EACH ROW EXECUTE FUNCTION public.guard_signed_agreement()'),
    ('public.properties', 'guard_found', 'BEFORE INSERT OR UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.guard_found()'),
    ('public.properties', 'touch_properties', 'BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.touch_updated()'),
    ('public.property_people', 'touch_property_people', 'BEFORE UPDATE ON public.property_people FOR EACH ROW EXECUTE FUNCTION public.touch_updated()')) v(tbl, name, def)
  loop
    if not exists (select 1 from pg_trigger where tgname = r.name and tgrelid = r.tbl::regclass) then execute format('create trigger %I %s', r.name, r.def); end if;
  end loop;
end $g$;

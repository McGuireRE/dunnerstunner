-- Phase 1: one property file. Every page reads and writes one record of the property and its owners.
-- Additive: existing agreements, signatures and PDFs are untouched. Pre-listings and agreements link to a
-- property; the property is kept up to date from them by triggers (one direction only, so no loops).
-- Property -> agreement happens once, when an agreement is made from a property (pl_accept, or the app).

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  address text not null default '',
  title_ref text,
  legal_description text,
  owners_on_title text,
  ownership jsonb not null default '{}'::jsonb,     -- capacity (Owners, Trustee, ...), entity
  description jsonb not null default '{}'::jsonb,   -- pType, pYear, pBed, pBath, pFloor, pLand, pBuild, pPark, pHeat, pLove, chattels, chatOther
  disclosures jsonb not null default '{}'::jsonb,   -- work, wt, meth, def (+ Detail), hazards, hazOther
  stage text not null default 'appraisal' check (stage in ('appraisal','questionnaire','plan','accepted','agreement','signed','live','under_offer','sold','settled','withdrawn')),
  stage_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.property_people (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  position int not null default 1,
  legal_name text not null default '',
  pref_name text not null default '',
  email text not null default '',
  phone text not null default '',
  user_id uuid,
  source text,                                      -- appraisal, questionnaire, title, agreement, agent
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.property_people (property_id);
create index on public.property_people (lower(email));
create table public.property_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  kind text,                                        -- what the reader called it: Record of title, LIM report, ...
  name text not null,
  path text not null,
  source text not null default 'dropped' check (source in ('dropped','uploaded','generated')),
  read_result jsonb,
  created_by text,
  created_at timestamptz not null default now()
);
create index on public.property_documents (property_id);
alter table public.prelistings add column property_id uuid references public.properties(id);
alter table public.agreements add column property_id uuid references public.properties(id);
create index on public.prelistings (property_id);
create index on public.agreements (property_id);

-- who may read a property: the agent, an owner on it, a party to one of its agreements, or its pre-listing contact
create or replace function public.is_property_party(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from public.property_people pp where pp.property_id = pid and (pp.user_id = auth.uid() or (pp.email <> '' and lower(pp.email) = lower(coalesce(auth.jwt()->>'email','')))))
    or exists (select 1 from public.agreements a where a.property_id = pid and public.is_party(a.id))
    or exists (select 1 from public.prelistings pl where pl.property_id = pid and pl.status <> 'closed' and (pl.user_id = auth.uid() or lower(pl.contact_email) = lower(coalesce(auth.jwt()->>'email','')))));
$$;
revoke execute on function public.is_property_party(uuid) from public, anon;
grant execute on function public.is_property_party(uuid) to authenticated;

alter table public.properties enable row level security;
alter table public.property_people enable row level security;
alter table public.property_documents enable row level security;
create policy prop_agent on public.properties for all using (public.is_agent()) with check (public.is_agent());
create policy prop_party_read on public.properties for select using (public.is_property_party(id));
create policy pp_agent on public.property_people for all using (public.is_agent()) with check (public.is_agent());
create policy pp_party_read on public.property_people for select using (public.is_property_party(property_id));
create policy pd_agent on public.property_documents for all using (public.is_agent()) with check (public.is_agent());
-- vendors don't see the documents Tim drops in (titles, LIMs, CRM exports are his working papers)

create or replace function public.touch_updated() returns trigger language plpgsql set search_path = public as $$ begin new.updated_at := now(); return new; end $$;
create trigger touch_properties before update on public.properties for each row execute function public.touch_updated();
create trigger touch_property_people before update on public.property_people for each row execute function public.touch_updated();

-- stage only ever moves forward on its own; ending an agency sets it outright
create or replace function public.stage_rank(s text) returns int language sql immutable as $$
  select array_position(array['appraisal','questionnaire','plan','accepted','agreement','signed','live','under_offer','sold','settled'], s);
$$;
create or replace function public.bump_stage(pid uuid, s text) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.properties set stage = s, stage_at = now()
   where id = pid and stage <> 'withdrawn' and coalesce(public.stage_rank(stage), 0) < public.stage_rank(s);
end $$;

-- answers keys that describe the property, and those that disclose things about it
create or replace function public.pick(j jsonb, keys text[]) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, j->k), '{}'::jsonb) from unnest(keys) k where j ? k;
$$;
create or replace function public.desc_keys() returns text[] language sql immutable as $$ select array['pType','pYear','pBed','pBath','pFloor','pLand','pBuild','pPark','pHeat','pLove','chattels','chatOther'] $$;
create or replace function public.disc_keys() returns text[] language sql immutable as $$ select array['work','workDetail','wt','wtDetail','meth','methDetail','def','defDetail','hazards','hazOther'] $$;

-- add or update an owner on the property, matched by email, else by name
create or replace function public.merge_property_person(pid uuid, p_name text, p_pref text, p_email text, p_phone text, p_user uuid, p_source text) returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid; em text := lower(trim(coalesce(p_email,''))); nm text := trim(coalesce(p_name,''));
begin
  if nm = '' and em = '' then return null; end if;
  select id into rid from public.property_people where property_id = pid and em <> '' and lower(email) = em limit 1;
  if rid is null and nm <> '' then select id into rid from public.property_people where property_id = pid and lower(regexp_replace(legal_name, '\s+', ' ', 'g')) = lower(regexp_replace(nm, '\s+', ' ', 'g')) limit 1; end if;
  if rid is null then
    insert into public.property_people (property_id, position, legal_name, pref_name, email, phone, user_id, source)
    values (pid, coalesce((select max(position) from public.property_people where property_id = pid), 0) + 1, nm, coalesce(trim(p_pref),''), em, coalesce(trim(p_phone),''), p_user, p_source)
    returning id into rid;
  else
    update public.property_people set
      legal_name = case when nm <> '' then nm else legal_name end,
      pref_name = case when coalesce(trim(p_pref),'') <> '' then trim(p_pref) else pref_name end,
      email = case when em <> '' then em else email end,
      phone = case when coalesce(trim(p_phone),'') <> '' then trim(p_phone) else phone end,
      user_id = coalesce(p_user, user_id)
     where id = rid;
  end if;
  return rid;
end $$;

-- pre-listings: make the property at Let's begin, keep it current, sync owners on submit, move the stage
create or replace function public.prelisting_before() returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if new.property_id is null then
    insert into public.properties (address) values (coalesce(new.address,'')) returning id into pid;
    new.property_id := pid;
    perform public.merge_property_person(pid, coalesce(new.contact_name,''), '', new.contact_email, '', new.user_id, 'appraisal');
  end if;
  return new;
end $$;
create or replace function public.prelisting_after() returns trigger language plpgsql security definer set search_path = public as $$
declare o jsonb;
begin
  if new.property_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.address is distinct from old.address and not exists (select 1 from public.agreements a where a.property_id = new.property_id and a.status in ('signed','countersigned')) then
    update public.properties set address = new.address where id = new.property_id;
  end if;
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    for o in select * from jsonb_array_elements(coalesce(new.answers->'owners','[]'::jsonb)) loop
      perform public.merge_property_person(new.property_id, o->>'name', o->>'pref', o->>'email', o->>'mobile', null, 'questionnaire');
    end loop;
  end if;
  perform public.bump_stage(new.property_id, case new.status
    when 'appraisal' then case when new.proceeded_at is not null then 'questionnaire' else 'appraisal' end
    when 'submitted' then 'questionnaire' when 'plan' then 'plan' when 'question' then 'plan' when 'accepted' then 'accepted' else 'appraisal' end);
  return new;
end $$;
create trigger prelisting_property_before before insert on public.prelistings for each row execute function public.prelisting_before();
create trigger prelisting_property_after after insert or update on public.prelistings for each row execute function public.prelisting_after();

-- agreements: make or link the property, keep it current while the agreement is the live one, move the stage
create or replace function public.agreement_before() returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if new.property_id is null then
    insert into public.properties (address, title_ref, owners_on_title) values (coalesce(new.address,''), nullif(new.config->>'title',''), nullif(new.config->>'owners','')) returning id into pid;
    new.property_id := pid;
  end if;
  return new;
end $$;
create or replace function public.agreement_after() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.property_id is null then return new; end if;
  if new.status not in ('ended','cancelled') then
    update public.properties set
      address = case when coalesce(new.address,'') <> '' then new.address else address end,
      title_ref = coalesce(nullif(new.config->>'title',''), title_ref),
      owners_on_title = coalesce(nullif(new.config->>'owners',''), owners_on_title),
      ownership = ownership || public.pick(new.answers, array['capacity','entity']),
      description = description || public.pick(new.answers, public.desc_keys()),
      disclosures = disclosures || public.pick(new.answers, public.disc_keys())
     where id = new.property_id;
  end if;
  perform public.bump_stage(new.property_id, case when new.status in ('signed','countersigned') then 'signed' when new.status in ('draft','sent','parked') then 'agreement' else 'appraisal' end);
  return new;
end $$;
create trigger agreement_property_before before insert on public.agreements for each row execute function public.agreement_before();
create trigger agreement_property_after after insert or update on public.agreements for each row execute function public.agreement_after();

-- agreement people -> property people, while that agreement is the live one
create or replace function public.agreement_person_after() returns trigger language plpgsql security definer set search_path = public as $$
declare ag public.agreements; r public.agreement_people;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  select * into ag from public.agreements where id = r.agreement_id;
  if ag.property_id is null or ag.status in ('ended','cancelled') then return null; end if;
  if tg_op = 'DELETE' then
    delete from public.property_people where property_id = ag.property_id
      and ((r.email <> '' and lower(email) = lower(r.email)) or (r.email = '' and lower(legal_name) = lower(r.legal_name)));
  else
    perform public.merge_property_person(ag.property_id, r.legal_name, r.pref_name, r.email, r.phone, r.user_id, 'agreement');
  end if;
  return null;
end $$;
create trigger agreement_person_property after insert or update or delete on public.agreement_people for each row execute function public.agreement_person_after();

-- pl_accept now makes the agreement from the property file (people, description, disclosures), not from answers
create or replace function public.pl_accept(p uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare r public.prelistings; pr public.properties; aid uuid; pp public.property_people; pos int := 1; meth text; nums numeric[]; ask numeric;
begin
  r := public.pl_mine(p);
  if r.status <> 'plan' then raise exception 'Please tick that the plan addresses your concerns first'; end if;
  select * into pr from public.properties where id = r.property_id;
  if r.agreement_id is null then
    meth := r.appraisal->>'method';
    if meth not in ('Auction','Tender','Deadline sale','Price by negotiation','Fixed price','Expressions of interest','Timed sale','Ballot') then meth := ''; end if;
    select array_agg(replace(m[1], ',', '')::numeric) into nums from regexp_matches(coalesce(r.appraisal->>'price',''), '([0-9][0-9,]{4,})', 'g') m;
    ask := case when nums is null then null when array_length(nums,1) >= 2 then round((nums[1] + nums[2]) / 2) else nums[1] end;
    insert into public.agreements (address, property_id, config, answers)
    values (coalesce(nullif(pr.address,''), r.address), r.property_id,
      jsonb_build_object('appr','done','ask',coalesce(ask::text,''),'askBasis', case when array_length(nums,1) >= 2 then 'median' else 'asking' end,'flat','','thr','250000','pct','','aml','Manual','approach','invited','method',meth,'prelisting_id',r.id,
        'title', coalesce(pr.title_ref,''), 'owners', coalesce(pr.owners_on_title,'')),
      coalesce(pr.description,'{}'::jsonb) || coalesce(pr.disclosures,'{}'::jsonb) || coalesce(pr.ownership,'{}'::jsonb) || jsonb_build_object('_from_prelisting', true))
    returning id into aid;
    for pp in select * from public.property_people where property_id = r.property_id order by position loop
      if pp.legal_name <> '' or pp.email <> '' then
        insert into public.agreement_people (agreement_id, position, legal_name, pref_name, email, phone)
        values (aid, pos, pp.legal_name, pp.pref_name, pp.email, pp.phone);
        pos := pos + 1;
      end if;
    end loop;
    perform public.log_event(aid, 'system', 'created', jsonb_build_object('via', 'pre-listing questionnaire'));
  else aid := r.agreement_id; end if;
  update public.prelistings set status = 'accepted', accepted_at = now(), agreement_id = aid where id = p;
  insert into public.prelisting_events (prelisting_id, actor, kind) values (p, auth.jwt()->>'email', 'plan_accepted');
  return aid;
end $$;

-- ending an agency settles the stage
create or replace function public.agent_end_agency(a uuid, reason text) returns void language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  update public.agreements set status = 'ended', ended_at = now() where id = a returning property_id into pid;
  update public.aml_files set retain_until = (now() at time zone 'Pacific/Auckland')::date + interval '5 years' where agreement_id = a and retain_until is null;
  perform public.log_event(a, coalesce(auth.jwt()->>'email','agent'), 'agency_ended', jsonb_build_object('reason', reason));
  if pid is not null and not exists (select 1 from public.agreements x where x.property_id = pid and x.id <> a and x.status not in ('ended','cancelled')) then
    update public.properties set stage = case when reason = 'Sold and settled' then 'settled' else 'withdrawn' end, stage_at = now() where id = pid;
  end if;
end $$;

-- the agent can move a withdrawn property back into play (a new appraisal)
create or replace function public.agent_reopen_property(pid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  update public.properties set stage = 'appraisal', stage_at = now() where id = pid and stage in ('withdrawn','settled');
end $$;

-- internal helpers are not callable from outside (is_prelisting_party is unused; dropping it waits for Tim's OK)
revoke execute on function public.bump_stage(uuid,text), public.merge_property_person(uuid,text,text,text,text,uuid,text),
  public.prelisting_before(), public.prelisting_after(), public.agreement_before(), public.agreement_after(), public.agreement_person_after(),
  public.on_agreement_signed() from public, anon, authenticated;
revoke execute on function public.agent_reopen_property(uuid) from public, anon;
grant execute on function public.agent_reopen_property(uuid) to authenticated;

-- backfill: one property per distinct address across existing agreements (oldest first) and pre-listings
do $$
declare ag record; pl record; pid uuid; pp record;
begin
  for ag in select * from public.agreements where property_id is null order by created_at loop
    select id into pid from public.properties where lower(trim(address)) = lower(trim(ag.address)) and trim(ag.address) <> '' limit 1;
    if pid is null then
      insert into public.properties (address, title_ref, owners_on_title, ownership, description, disclosures)
      values (coalesce(ag.address,''), nullif(ag.config->>'title',''), nullif(ag.config->>'owners',''), public.pick(ag.answers, array['capacity','entity']), public.pick(ag.answers, public.desc_keys()), public.pick(ag.answers, public.disc_keys()))
      returning id into pid;
    end if;
    update public.agreements set property_id = pid where id = ag.id;   -- address etc unchanged, so the signed-terms guard allows it
    for pp in select * from public.agreement_people where agreement_id = ag.id order by position loop
      perform public.merge_property_person(pid, pp.legal_name, pp.pref_name, pp.email, pp.phone, pp.user_id, 'agreement');
    end loop;
    insert into public.property_documents (property_id, name, path, source, created_by)
      select pid, f->>'name', f->>'path', 'dropped', 'backfill' from jsonb_array_elements(coalesce(ag.config->'import'->'files','[]'::jsonb)) f
      where not exists (select 1 from public.property_documents d where d.property_id = pid and d.path = f->>'path');
  end loop;
  for pl in select * from public.prelistings where property_id is null loop
    pid := (select property_id from public.agreements where id = pl.agreement_id);
    if pid is null then select id into pid from public.properties where lower(trim(address)) = lower(trim(pl.address)) and trim(pl.address) <> '' limit 1; end if;
    if pid is null then insert into public.properties (address) values (pl.address) returning id into pid; end if;
    update public.prelistings set property_id = pid where id = pl.id;
    perform public.merge_property_person(pid, coalesce(pl.contact_name,''), '', pl.contact_email, '', pl.user_id, 'appraisal');
  end loop;
end $$;
-- stages for backfilled properties, from what's linked to them
update public.properties p set stage = coalesce((
  select case
    when bool_or(a.status in ('signed','countersigned')) then 'signed'
    when bool_or(a.status in ('draft','sent','parked')) then 'agreement'
    when bool_and(a.status = 'ended') then 'withdrawn' end
  from public.agreements a where a.property_id = p.id), (
  select case pl.status when 'accepted' then 'accepted' when 'plan' then 'plan' when 'question' then 'plan' when 'submitted' then 'questionnaire' else 'appraisal' end
  from public.prelistings pl where pl.property_id = p.id order by pl.updated_at desc limit 1), 'appraisal');

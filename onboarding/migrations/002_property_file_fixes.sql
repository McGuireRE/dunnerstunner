-- Phase 1 fixes from the independent review (5 November 2026).
-- 1. Reopening for new owners sets the old owners aside and ends their access.
-- 2. The appraisal contact stops being a signer when the questionnaire names other owners.
-- 3. A checked legal name (title, agreement, Tim) is never replaced by a less certain one.
-- 4. A cancelled or ended agreement leaves the property Withdrawn, so it can be started again.
-- 5. With two live agreements on one property, only the newest keeps the property current.
-- 6. Removing someone from an agreement sets them aside on the property instead of deleting them.
-- Signed records are untouched: nothing here writes to agreements, agreement_people or signatures.

alter table public.property_people add column role text not null default 'owner' check (role in ('owner','contact','former'));
alter table public.property_people add column name_from text;
update public.property_people set name_from = source where name_from is null;
alter table public.properties add column cycle_at timestamptz;   -- set when the property starts again with new owners

create or replace function public.name_rank(s text) returns int language sql immutable as $$
  select case s when 'appraisal' then 1 when 'questionnaire' then 2 else 3 end;   -- title, agreement, agent: checked
$$;
create or replace function public.norm_name(s text) returns text language sql immutable as $$
  select lower(trim(regexp_replace(coalesce(s,''), '\s+', ' ', 'g')));
$$;
-- same first and last name ("William Jones" and "William Robert Jones"), as the app's matching does
create or replace function public.same_person_name(a text, b text) returns boolean language sql immutable as $$
  select public.norm_name(a) <> '' and public.norm_name(b) <> '' and (public.norm_name(a) = public.norm_name(b) or (
    split_part(public.norm_name(a), ' ', 1) = split_part(public.norm_name(b), ' ', 1)
    and regexp_replace(public.norm_name(a), '^.* ', '') = regexp_replace(public.norm_name(b), '^.* ', '')
    and position(' ' in public.norm_name(a)) > 0 and position(' ' in public.norm_name(b)) > 0));
$$;

create or replace function public.merge_property_person(pid uuid, p_name text, p_pref text, p_email text, p_phone text, p_user uuid, p_source text) returns uuid language plpgsql security definer set search_path = public as $$
declare r public.property_people; em text := lower(trim(coalesce(p_email,''))); nm text := trim(regexp_replace(coalesce(p_name,''), '\s+', ' ', 'g'));
begin
  if nm = '' and em = '' then return null; end if;
  select * into r from public.property_people where property_id = pid and role <> 'former' and em <> '' and lower(email) = em order by position limit 1;
  if r.id is null and nm <> '' then select * into r from public.property_people where property_id = pid and role <> 'former' and public.same_person_name(legal_name, nm) order by position limit 1; end if;
  if r.id is null then
    insert into public.property_people (property_id, position, legal_name, pref_name, email, phone, user_id, source, name_from, role)
    values (pid, coalesce((select max(position) from public.property_people where property_id = pid and role <> 'former'), 0) + 1, nm, coalesce(trim(p_pref),''), em, coalesce(trim(p_phone),''), p_user, p_source, p_source, 'owner')
    returning id into r.id;
  else
    update public.property_people set
      legal_name = case when nm <> '' and (legal_name = '' or public.name_rank(p_source) >= public.name_rank(coalesce(name_from, source))) then nm else legal_name end,
      name_from = case when nm <> '' and (legal_name = '' or public.name_rank(p_source) >= public.name_rank(coalesce(name_from, source))) then p_source else name_from end,
      pref_name = case when coalesce(trim(p_pref),'') <> '' then trim(p_pref) else pref_name end,
      email = case when em <> '' and user_id is null then em else email end,
      phone = case when coalesce(trim(p_phone),'') <> '' then trim(p_phone) else phone end,
      user_id = coalesce(user_id, p_user),
      role = case when role = 'contact' and p_source <> 'appraisal' then 'owner' else role end
     where id = r.id;
  end if;
  return r.id;
end $$;

-- who may read a property: an owner or contact on it now, a party to a live agreement, or the contact of a
-- pre-listing made since the property last started again
create or replace function public.is_property_party(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from public.property_people pp where pp.property_id = pid and pp.role <> 'former' and (pp.user_id = auth.uid() or (pp.email <> '' and lower(pp.email) = lower(coalesce(auth.jwt()->>'email','')))))
    or exists (select 1 from public.agreements a where a.property_id = pid and a.status not in ('ended','cancelled') and public.is_party(a.id))
    or exists (select 1 from public.prelistings pl join public.properties p on p.id = pl.property_id where pl.property_id = pid and pl.status <> 'closed'
               and pl.created_at >= coalesce(p.cycle_at, '-infinity'::timestamptz)
               and (pl.user_id = auth.uid() or lower(pl.contact_email) = lower(coalesce(auth.jwt()->>'email','')))));
$$;
-- vendors never see people set aside from a property
alter policy pp_party_read on public.property_people using (role <> 'former' and public.is_property_party(property_id));

-- Let's begin from an existing property also records who Tim is talking to
create or replace function public.prelisting_before() returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if new.property_id is null then
    insert into public.properties (address) values (coalesce(new.address,'')) returning id into pid;
    new.property_id := pid;
  end if;
  perform public.merge_property_person(new.property_id, coalesce(new.contact_name,''), '', new.contact_email, '', new.user_id, 'appraisal');
  return new;
end $$;

-- on submit the questionnaire's owners are the owners: an appraisal contact who isn't one becomes a contact
create or replace function public.prelisting_after() returns trigger language plpgsql security definer set search_path = public as $$
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
end $$;

-- only the newest live agreement keeps the property current; ending or cancelling the last one withdraws it
create or replace function public.agreement_after() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.property_id is null then return new; end if;
  if new.status not in ('ended','cancelled')
     and not exists (select 1 from public.agreements x where x.property_id = new.property_id and x.id <> new.id and x.status not in ('ended','cancelled') and x.created_at > new.created_at)
     and (tg_op = 'INSERT' or new.address is distinct from old.address or new.config is distinct from old.config or new.answers is distinct from old.answers) then
    update public.properties set
      address = case when coalesce(new.address,'') <> '' then new.address else address end,
      title_ref = coalesce(nullif(new.config->>'title',''), title_ref),
      owners_on_title = coalesce(nullif(new.config->>'owners',''), owners_on_title),
      ownership = ownership || public.pick(new.answers, array['capacity','entity']),
      description = description || public.pick(new.answers, public.desc_keys()),
      disclosures = disclosures || public.pick(new.answers, public.disc_keys())
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
end $$;

-- agreement people -> property people while that agreement is live; a removal sets the person aside
create or replace function public.agreement_person_after() returns trigger language plpgsql security definer set search_path = public as $$
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
    perform public.merge_property_person(ag.property_id, r.legal_name, r.pref_name, r.email, r.phone, r.user_id, 'agreement');
  end if;
  return null;
end $$;

-- agreements are made from the owners only (never a contact or someone set aside)
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
    for pp in select * from public.property_people where property_id = r.property_id and role = 'owner' order by position loop
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

-- ending an agency: a cancelled agreement stays cancelled, and the first end date stands
create or replace function public.agent_end_agency(a uuid, reason text) returns void language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  update public.agreements set status = case when status = 'cancelled' then status else 'ended' end, ended_at = coalesce(ended_at, now()) where id = a returning property_id into pid;
  update public.aml_files set retain_until = (now() at time zone 'Pacific/Auckland')::date + interval '5 years' where agreement_id = a and retain_until is null;
  perform public.log_event(a, coalesce(auth.jwt()->>'email','agent'), 'agency_ended', jsonb_build_object('reason', reason));
  if pid is not null and not exists (select 1 from public.agreements x where x.property_id = pid and x.id <> a and x.status not in ('ended','cancelled')) then
    update public.properties set stage = case when reason = 'Sold and settled' then 'settled' else 'withdrawn' end, stage_at = now() where id = pid;
  end if;
end $$;

-- starting again: with the same owners, or with new owners (the old ones are set aside and lose access)
create or replace function public.agent_reopen_property(pid uuid, new_owners boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if not exists (select 1 from public.properties where id = pid and stage in ('withdrawn','settled')) then raise exception 'Only a withdrawn or settled property can start again'; end if;
  if new_owners then
    update public.property_people set role = 'former' where property_id = pid and role <> 'former';
    update public.properties set owners_on_title = null, ownership = '{}'::jsonb, disclosures = '{}'::jsonb, cycle_at = now() where id = pid;
  end if;
  update public.properties set stage = 'appraisal', stage_at = now() where id = pid;
end $$;
create or replace function public.agent_reopen_property(pid uuid) returns void language sql security definer set search_path = public as $$
  select public.agent_reopen_property(pid, false);
$$;

revoke execute on function public.merge_property_person(uuid,text,text,text,text,uuid,text),
  public.prelisting_before(), public.prelisting_after(), public.agreement_after(), public.agreement_person_after() from public, anon, authenticated;
revoke execute on function public.agent_reopen_property(uuid, boolean), public.agent_reopen_property(uuid) from public, anon;
grant execute on function public.agent_reopen_property(uuid, boolean), public.agent_reopen_property(uuid) to authenticated;

-- repair what the first backfill did
-- a legal name from the newest live agreement wins over an informal one
update public.property_people pp set legal_name = y.legal_name, name_from = 'agreement'
  from (select distinct on (a.property_id, lower(ap.email)) a.property_id, lower(ap.email) em, ap.legal_name
          from public.agreements a join public.agreement_people ap on ap.agreement_id = a.id
         where a.status not in ('ended','cancelled') and ap.email <> '' and ap.legal_name <> ''
         order by a.property_id, lower(ap.email), a.created_at desc) y
 where pp.property_id = y.property_id and lower(pp.email) = y.em and pp.legal_name is distinct from y.legal_name;
-- someone only on an ended or cancelled agreement, where a live one exists, is set aside
update public.property_people pp set role = 'former'
 where pp.role = 'owner' and pp.source = 'agreement'
   and exists (select 1 from public.agreements a where a.property_id = pp.property_id and a.status not in ('ended','cancelled'))
   and not exists (select 1 from public.agreements a join public.agreement_people ap on ap.agreement_id = a.id
                    where a.property_id = pp.property_id and a.status not in ('ended','cancelled')
                      and ((pp.email <> '' and lower(ap.email) = lower(pp.email)) or public.norm_name(ap.legal_name) = public.norm_name(pp.legal_name)));
-- a property whose agreements are all cancelled or ended is withdrawn, not stuck at Signed
update public.properties p set stage = 'withdrawn', stage_at = now()
 where p.stage not in ('settled','withdrawn')
   and exists (select 1 from public.agreements a where a.property_id = p.id)
   and not exists (select 1 from public.agreements a where a.property_id = p.id and a.status not in ('ended','cancelled'))
   and not exists (select 1 from public.prelistings pl where pl.property_id = p.id and pl.status not in ('closed','accepted'));

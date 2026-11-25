-- LW0, the shared records map (Tim's central build plan, "LW0: the shared records map", 26 November 2026). Additive only.
-- One home for each fact; pages read from it and save back; every value carries where it came from and when; if sources disagree
-- both are kept and Tim chooses; nothing Tim ticked is moved by anything else; signed and sent records keep their own frozen copies
-- (agreements, signatures, offer rounds and forms are not touched here at all).
--
-- What it adds:
--   1. Property profile: profile_keys (the facts, once), property_fact_values (every value from every source, with its date; never
--      changed or removed) and property_profile (the value chosen for each fact on a property, and whether Tim ticked it). Filled by
--      triggers from the council lookup (properties.found), Inspect a property (property_inspections.facts), agreements (answers) and the
--      Quiet List (ql_listings), and by Tim through agent_profile_set / agent_profile_choose / agent_profile_tick. Read with
--      agent_property_profile. Choosing writes back to the property file (properties.description, title_ref, legal_description), never
--      to an agreement.
--   2. Person: person_links ties every name list to one crm_contacts record (property_people, agreement_people, prelistings, offer
--      signers, lawyer links, Quiet List listings and seller leads). Matching: the same email with a name that fits; with no email, the
--      same legal name on the same property. Two different checked names on one email are never merged: a second contact is made and
--      the link carries a doubt for Tim (agent_person_link_resolve). property_people.contact_id is filled; agreement_people.contact_id
--      only while the person has not signed (a signed person is linked through person_links alone); offer signers through
--      person_links alone (their rows are guarded); aml_files.contact_id only for files not locked, and for new files.
--   3. Property and person link: crm_property_links is the home (role and dates, agent only). property_people stays the working list of
--      this round's owners and contacts (signing and vendor access read it) and is kept in step with crm_property_links by trigger.
--      Roles gain trustee, executor and contact.
--   4. Question bank: qa_questions (asked once, defined once) and qa_answers (per person and property, with source and date). The
--      questions before we meet (the old "Let's begin" questionnaire, prelistings.answers), the Quiet List seller form, Tim's Quiet List
--      notes and seller profiles all save into it by trigger.
--   5. Photos and documents: property_documents stays the one store. ql_listings.photo_doc_ids points the Quiet List at it
--      (agent_ql_set_photos, ql_listing_photos); inspection photos are the store's items with inspection_id (inspection_photos). No
--      files move.
-- Every trigger here catches its own errors and records them in shared_record_log, so a slip in this layer can never stop a vendor's
-- questionnaire, a signing or an offer.
-- RLS on every new table. Tim reads everything; vendors read only their own property profile (never anything from Relab) and their
-- own answers to questions that are theirs to see; nobody writes these tables directly.

-- ───── 0. a log of anything this layer could not do ─────
create table public.shared_record_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  what text not null,
  detail jsonb not null default '{}'::jsonb
);
alter table public.shared_record_log enable row level security;
create policy srl_agent_read on public.shared_record_log for select to authenticated using (public.is_agent());
revoke insert, update, delete, truncate on public.shared_record_log from anon, authenticated;

create or replace function public.shared_note(p_what text, p_detail jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.shared_record_log (what, detail) values (left(p_what, 200), coalesce(p_detail, '{}'::jsonb));
$$;

-- ───── 1. property profile ─────
create table public.profile_keys (
  key text primary key,
  label text not null,
  grp text not null,
  position integer not null,
  vendor boolean not null default true,    -- a vendor may read it on their own property
  ql_column text                            -- the Quiet List column that holds the same fact
);
insert into public.profile_keys (key, label, grp, position, vendor, ql_column) values
  ('pType', 'Type of property', 'home', 10, true, 'property_type'),
  ('pYear', 'Year built', 'home', 20, true, 'year_built'),
  ('pBed', 'Bedrooms', 'home', 30, true, 'beds'),
  ('pBath', 'Bathrooms', 'home', 40, true, 'baths'),
  ('pFloor', 'Floor area (m²)', 'home', 50, true, 'floor_m2'),
  ('pLand', 'Land area (m²)', 'land', 60, true, 'land_m2'),
  ('pBuild', 'Construction', 'home', 70, true, null),
  ('pPark', 'Parking', 'home', 80, true, 'parking'),
  ('pHeat', 'Heating', 'home', 90, true, null),
  ('pLove', 'What they love about it', 'home', 100, true, null),
  ('chattels', 'Chattels', 'home', 110, true, null),
  ('chatOther', 'Other chattels', 'home', 120, true, null),
  ('title_ref', 'Title reference', 'land', 130, true, null),
  ('legal_description', 'Legal description', 'land', 140, true, null),
  ('title_type', 'Title type', 'land', 150, true, null),
  ('capital_value', 'Capital value', 'council', 160, true, 'rv'),
  ('land_value', 'Land value', 'council', 170, true, null),
  ('improvements_value', 'Value of improvements', 'council', 180, true, null),
  ('valuation_ref', 'Valuation reference', 'council', 190, true, null),
  ('rates_council', 'City or district rates', 'council', 200, true, null),
  ('rates_orc', 'Regional rates', 'council', 210, true, null),
  ('zone', 'District plan zone', 'plan', 220, true, null),
  ('land_use', 'Land use', 'plan', 230, true, null),
  ('owners_relab', 'Owners (Relab)', 'agent', 900, false, null);
alter table public.profile_keys enable row level security;
create policy pk_read on public.profile_keys for select to authenticated using (true);
revoke insert, update, delete, truncate on public.profile_keys from anon, authenticated;

-- where a value can come from; 'record' sources are public or bought records, 'person' sources are someone's own entry
create or replace function public.profile_source_kind(s text) returns text language sql immutable as $$
  select case when s in ('council', 'reinz', 'relab') then 'record' else 'person' end;
$$;

create table public.property_fact_values (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  key text not null check (key ~ '^[A-Za-z][A-Za-z0-9_]{0,100}$'),
  value jsonb,                                -- null: this source cleared it
  display text,                               -- the words the source gave, where it gave any (council records)
  label text,                                 -- the source's own name for the fact (council records that aren't in profile_keys)
  source text not null check (source in ('council', 'reinz', 'relab', 'inspection', 'agreement', 'tim', 'first_visit', 'questionnaire', 'quiet_list')),
  source_name text,                           -- for example "Dunedin City Council rates"
  source_ref uuid,                            -- the lookup, inspection, agreement or listing it came from
  as_of text,                                 -- the date the source gives for it (for example "2026-2027 rating year")
  recorded_at timestamptz not null default clock_timestamp(),   -- the moment itself, so several values in one transaction keep their order
  recorded_by text
);
create index property_fact_values_pk on public.property_fact_values (property_id, key, source, recorded_at desc);
alter table public.property_fact_values enable row level security;
revoke insert, update, delete, truncate on public.property_fact_values from anon, authenticated;

create table public.property_profile (
  property_id uuid not null references public.properties(id) on delete cascade,
  key text not null,
  value_id uuid not null references public.property_fact_values(id),
  chosen_by text not null default 'auto' check (chosen_by in ('auto', 'tim')),
  chosen_at timestamptz not null default now(),
  ticked boolean not null default false,
  ticked_at timestamptz,
  ticked_by text,
  primary key (property_id, key)
);
alter table public.property_profile enable row level security;
revoke insert, update, delete, truncate on public.property_profile from anon, authenticated;

-- a value, once recorded, never changes and is never removed (only with its property)
create or replace function public.guard_fact_value() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.properties where id = old.property_id) then return old; end if;
  raise exception 'A recorded property fact is kept as it was. Record a new value instead';
end $$;
create trigger guard_fact_value before update or delete on public.property_fact_values for each row execute function public.guard_fact_value();

-- who may read: Tim everything; a vendor (a party to the property, migration 002) the facts that are theirs to see, never Relab
create or replace function public.profile_vendor_key(k text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select vendor from public.profile_keys where key = k), true);
$$;
create policy pfv_agent on public.property_fact_values for select to authenticated using (public.is_agent());
create policy pfv_vendor on public.property_fact_values for select to authenticated
  using (source <> 'relab' and public.profile_vendor_key(key) and public.is_property_party(property_id));
create policy pp_agent on public.property_profile for select to authenticated using (public.is_agent());
create policy pp_vendor on public.property_profile for select to authenticated
  using (public.profile_vendor_key(key) and public.is_property_party(property_id)
         and exists (select 1 from public.property_fact_values v where v.id = value_id and v.source <> 'relab'));

-- record one value from one source, and decide whether it becomes the profile's value.
--   p_choose 'auto': chosen when nothing is chosen yet, or when what is chosen is not ticked and is from the same source, or a person's
--                    entry replacing another person's entry or a record; a record never replaces a person's entry by itself; the same
--                    value as the one chosen changes nothing.
--   p_choose 'tim':  Tim entered or accepted it himself: chosen and ticked.
--   p_choose 'never': kept as a value only (for example an inspection answer that differs from the agreement in force).
-- A source clearing its value: if that source's value was chosen (and not ticked by Tim, unless Tim cleared it), the newest value from
-- another source is chosen instead, or the fact has no value.
create or replace function public.profile_record(p_property uuid, p_key text, p_value jsonb, p_source text, p_ref uuid, p_as_of text,
  p_source_name text, p_display text, p_label text, p_by text, p_choose text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v jsonb := case when public.jblank(p_value) then null else p_value end; last public.property_fact_values; vid uuid;
  c public.property_profile; cv public.property_fact_values; alt uuid; move boolean := false;
begin
  if p_property is null or p_key is null then return null; end if;
  if p_choose not in ('auto', 'tim', 'never') then raise exception 'profile_record: bad choice'; end if;
  if not exists (select 1 from public.profile_keys where key = p_key) and p_source <> 'council' then return null; end if;
  select * into last from public.property_fact_values where property_id = p_property and key = p_key and source = p_source order by recorded_at desc, id desc limit 1;
  if last.id is not null and last.value is not distinct from v and coalesce(last.display, '') = coalesce(p_display, '') and last.source_ref is not distinct from p_ref then
    vid := last.id;
  else
    if last.id is null and v is null then return null; end if;   -- nothing to clear
    insert into public.property_fact_values (property_id, key, value, display, label, source, source_name, source_ref, as_of, recorded_by)
    values (p_property, p_key, v, nullif(left(p_display, 2000), ''), nullif(left(p_label, 200), ''), p_source, nullif(left(p_source_name, 200), ''), p_ref, nullif(left(p_as_of, 100), ''), coalesce(p_by, auth.jwt()->>'email', 'system'))
    returning id into vid;
  end if;
  select * into c from public.property_profile where property_id = p_property and key = p_key for update;
  if c.property_id is not null then select * into cv from public.property_fact_values where id = c.value_id; end if;
  if v is null then
    if c.property_id is not null and cv.source = p_source and (not c.ticked or p_choose = 'tim') then
      select x.id into alt from (select distinct on (f.source) f.id, f.value, f.recorded_at from public.property_fact_values f
                                  where f.property_id = p_property and f.key = p_key and f.source <> p_source order by f.source, f.recorded_at desc, f.id desc) x
       where x.value is not null order by x.recorded_at desc limit 1;
      if alt is null then delete from public.property_profile where property_id = p_property and key = p_key;
      else update public.property_profile set value_id = alt, chosen_by = 'auto', chosen_at = now(), ticked = false, ticked_at = null, ticked_by = null where property_id = p_property and key = p_key; end if;
    end if;
    return vid;
  end if;
  if p_choose = 'never' then return vid; end if;
  if p_choose = 'tim' then
    insert into public.property_profile as pp (property_id, key, value_id, chosen_by, ticked, ticked_at, ticked_by)
    values (p_property, p_key, vid, 'tim', true, now(), coalesce(p_by, auth.jwt()->>'email', 'agent'))
    on conflict (property_id, key) do update set value_id = excluded.value_id, chosen_by = 'tim', chosen_at = now(), ticked = true, ticked_at = now(), ticked_by = excluded.ticked_by;
    return vid;
  end if;
  if c.property_id is null then move := true;
  elsif cv.value is not distinct from v then move := false;
  elsif c.ticked then move := false;
  elsif cv.source = p_source then move := true;
  elsif public.profile_source_kind(p_source) = 'record' and public.profile_source_kind(cv.source) = 'person' then move := false;
  else move := true; end if;
  if move then
    insert into public.property_profile (property_id, key, value_id, chosen_by) values (p_property, p_key, vid, 'auto')
    on conflict (property_id, key) do update set value_id = excluded.value_id, chosen_by = 'auto', chosen_at = now(), ticked = false, ticked_at = null, ticked_by = null;
  end if;
  return vid;
end $$;
revoke execute on function public.profile_record(uuid, text, jsonb, text, uuid, text, text, text, text, text, text) from public, anon, authenticated;

-- the profile as it stands: each fact with its value, source and date, whether Tim ticked it, and every other source's newest value
-- where it differs (so both are shown and Tim chooses)
create or replace function public.profile_read(p_property uuid, p_vendor boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  with latest as (
    select distinct on (f.key, f.source) f.* from public.property_fact_values f
     where f.property_id = p_property and (not p_vendor or (f.source <> 'relab' and public.profile_vendor_key(f.key)))
     order by f.key, f.source, f.recorded_at desc, f.id desc),
  keys as (select distinct key from latest)
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.position, x.key), '[]'::jsonb) from (
    select k.key, coalesce(pk.label, (select l.label from latest l where l.key = k.key and l.label is not null limit 1), k.key) as label,
           coalesce(pk.grp, 'council') as grp, coalesce(pk.position, 500) as position,
           cv.id as value_id, cv.value, cv.display, cv.source, cv.source_name, cv.as_of, cv.recorded_at,
           coalesce(c.ticked, false) as ticked, c.chosen_by,
           coalesce((select jsonb_agg(jsonb_build_object('value_id', l.id, 'value', l.value, 'display', l.display, 'source', l.source, 'source_name', l.source_name, 'as_of', l.as_of, 'recorded_at', l.recorded_at) order by l.recorded_at desc)
                       from latest l where l.key = k.key and l.value is not null and (cv.id is null or (l.id <> cv.id and l.value is distinct from cv.value))), '[]'::jsonb) as others
      from keys k
      left join public.profile_keys pk on pk.key = k.key
      left join public.property_profile c on c.property_id = p_property and c.key = k.key
      left join public.property_fact_values cv on cv.id = c.value_id and (not p_vendor or cv.source <> 'relab')
  ) x where x.value_id is not null or jsonb_array_length(x.others) > 0;
$$;
revoke execute on function public.profile_read(uuid, boolean) from public, anon, authenticated;

create or replace function public.agent_property_profile(p_property uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  return jsonb_build_object('property_id', p_property, 'facts', public.profile_read(p_property, false));
end $$;
-- a vendor reads their own property's profile (the same rules as the tables' vendor policies)
create or replace function public.my_property_profile(p_property uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_property_party(p_property) then raise exception 'Not found'; end if;
  return jsonb_build_object('property_id', p_property, 'facts', public.profile_read(p_property, true));
end $$;

-- choosing writes back to the property file, so every existing page reads the same value; never to an agreement
create or replace function public.profile_write_back(p_property uuid, p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare txt text := case when p_value is null then null when jsonb_typeof(p_value) = 'string' then p_value #>> '{}' else p_value::text end;
begin
  if p_key = any (public.desc_keys()) then
    update public.properties set description = case when p_value is null then description - p_key
      when p_key = 'chattels' and jsonb_typeof(p_value) = 'array' then description || jsonb_build_object(p_key, p_value)
      else description || jsonb_build_object(p_key, to_jsonb(txt)) end where id = p_property;
  elsif p_key = 'title_ref' then update public.properties set title_ref = txt where id = p_property;
  elsif p_key = 'legal_description' then update public.properties set legal_description = txt where id = p_property;
  end if;
end $$;
revoke execute on function public.profile_write_back(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.agent_profile_set(p_property uuid, p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare vid uuid;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if not exists (select 1 from public.properties where id = p_property) then raise exception 'Property not found'; end if;
  if not exists (select 1 from public.profile_keys where key = p_key) then raise exception 'Not a property fact'; end if;
  if p_value is not null and length(p_value::text) > 6000 then raise exception 'Too long'; end if;
  perform 1 from public.properties where id = p_property for update;
  vid := public.profile_record(p_property, p_key, p_value, 'tim', null, to_char(now() at time zone 'Pacific/Auckland', 'FMDD Mon YYYY'), 'Tim', null, null, null, 'tim');
  perform public.profile_write_back(p_property, p_key, case when public.jblank(p_value) then null else p_value end);
  return public.agent_property_profile(p_property);
end $$;

create or replace function public.agent_profile_choose(p_property uuid, p_key text, p_value_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f public.property_fact_values;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  perform 1 from public.properties where id = p_property for update;
  select * into f from public.property_fact_values where id = p_value_id and property_id = p_property and key = p_key;
  if f.id is null or f.value is null then raise exception 'That value is not on this property'; end if;
  insert into public.property_profile (property_id, key, value_id, chosen_by, ticked, ticked_at, ticked_by)
  values (p_property, p_key, f.id, 'tim', true, now(), coalesce(auth.jwt()->>'email', 'agent'))
  on conflict (property_id, key) do update set value_id = excluded.value_id, chosen_by = 'tim', chosen_at = now(), ticked = true, ticked_at = now(), ticked_by = excluded.ticked_by;
  perform public.profile_write_back(p_property, p_key, f.value);
  return public.agent_property_profile(p_property);
end $$;

-- tick or untick facts as they stand (p_keys null: every fact on the property, for "select all")
create or replace function public.agent_profile_tick(p_property uuid, p_keys text[], p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  update public.property_profile set ticked = coalesce(p_on, false), ticked_at = case when p_on then now() end, ticked_by = case when p_on then coalesce(auth.jwt()->>'email', 'agent') end
   where property_id = p_property and (p_keys is null or key = any (p_keys));
  return public.agent_property_profile(p_property);
end $$;

-- the council lookup: values Tim used (properties.found, written only by "Use these") are his choice; a value that waited because the
-- file or the agreement held something else is kept as a value only
create or replace function public.profile_from_found() returns trigger language plpgsql security definer set search_path = public as $$
declare k text; v jsonb; o jsonb; pk text; ch text;
begin
  begin
    for k in select x from jsonb_object_keys(coalesce(new.found, '{}'::jsonb)) x union select x from jsonb_object_keys(coalesce(old.found, '{}'::jsonb)) x loop
      v := new.found -> k; o := old.found -> k;
      if v is not distinct from o then continue; end if;
      pk := coalesce(case when coalesce(v, o)->>'field' in ('title_ref', 'legal_description') or coalesce(v, o)->>'field' = any (public.desc_keys()) then coalesce(v, o)->>'field' end, k);
      ch := case when v is null then 'tim' when coalesce(v->>'field', '') <> '' and coalesce((v->>'written')::boolean, false) = false then 'never' else 'tim' end;
      perform public.profile_record(new.id, pk, case when v is null then null else v->'value' end, 'council', null,
        coalesce(v->>'as_of_label', v->>'as_of', left(v->>'fetched_at', 10)), v->>'source_name', v->>'display', v->>'label', coalesce(auth.jwt()->>'email', 'agent'), ch);
    end loop;
  exception when others then perform public.shared_note('profile_from_found', jsonb_build_object('property', new.id, 'error', sqlerrm)); end;
  return null;
end $$;
create trigger profile_from_found after update of found on public.properties for each row execute function public.profile_from_found();

-- Inspect a property: Tim's own answers, chosen and ticked, unless the agreement in force holds a different value (then kept as a
-- value until he chooses on the inspection, as now); his choice there is applied here too
create or replace function public.profile_from_inspection() returns trigger language plpgsql security definer set search_path = public as $$
declare k text; v jsonb; r jsonb; f public.property_fact_values; asof text := to_char(now() at time zone 'Pacific/Auckland', 'FMDD Mon YYYY');
begin
  begin
    for k in select x from jsonb_object_keys(coalesce(new.facts, '{}'::jsonb)) x union select x from jsonb_object_keys(coalesce(old.facts, '{}'::jsonb)) x loop
      if not (k = any (public.desc_keys())) then continue; end if;
      v := new.facts -> k;
      if tg_op = 'UPDATE' and v is not distinct from (old.facts -> k) then continue; end if;
      perform public.profile_record(new.property_id, k, v, 'inspection', new.id, asof, 'Inspect a property', null, null, new.created_by,
        case when coalesce(new.conflicts, '{}'::jsonb) ? k then 'never' else 'tim' end);
    end loop;
    if tg_op = 'UPDATE' then
      for k, r in select * from jsonb_each(coalesce(new.resolved, '{}'::jsonb)) loop
        if not (k = any (public.desc_keys())) or (old.resolved -> k) is not distinct from r then continue; end if;
        select * into f from public.property_fact_values where property_id = new.property_id and key = k
           and source = case when r->>'use' = 'inspection' then 'inspection' else 'agreement' end and value is not null
         order by recorded_at desc, id desc limit 1;
        if r->>'use' = 'agreement' and f.id is null and (old.conflicts -> k) is not null then
          perform public.profile_record(new.property_id, k, old.conflicts -> k -> 'agreement', 'agreement', (old.conflicts -> k ->> 'agreement_id')::uuid, asof, 'Agency agreement', null, null, new.created_by, 'tim');
        elsif f.id is not null then
          insert into public.property_profile (property_id, key, value_id, chosen_by, ticked, ticked_at, ticked_by) values (new.property_id, k, f.id, 'tim', true, now(), coalesce(auth.jwt()->>'email', new.created_by))
          on conflict (property_id, key) do update set value_id = excluded.value_id, chosen_by = 'tim', chosen_at = now(), ticked = true, ticked_at = now(), ticked_by = excluded.ticked_by;
        end if;
      end loop;
    end if;
  exception when others then perform public.shared_note('profile_from_inspection', jsonb_build_object('inspection', new.id, 'error', sqlerrm)); end;
  return null;
end $$;
create trigger profile_from_inspection after insert or update of facts, resolved on public.property_inspections for each row execute function public.profile_from_inspection();

-- agreements: what page 1 says about the property, as a value from the agreement (the agreement itself is never changed)
create or replace function public.profile_from_agreement() returns trigger language plpgsql security definer set search_path = public as $$
declare k text; v jsonb;
begin
  if new.property_id is null or new.status in ('ended', 'cancelled') then return null; end if;
  begin
    foreach k in array public.desc_keys() loop
      v := coalesce(new.answers, '{}'::jsonb) -> k;
      if tg_op = 'UPDATE' and v is not distinct from (coalesce(old.answers, '{}'::jsonb) -> k) and new.property_id is not distinct from old.property_id then continue; end if;
      if public.jblank(v) and (tg_op = 'INSERT' or public.jblank(coalesce(old.answers, '{}'::jsonb) -> k)) then continue; end if;
      perform public.profile_record(new.property_id, k, v, 'agreement', new.id, to_char(coalesce(new.updated_at, now()) at time zone 'Pacific/Auckland', 'FMDD Mon YYYY'), 'Agency agreement ' || coalesce(new.ref, ''), null, null, coalesce(auth.jwt()->>'email', 'agent'), 'auto');
    end loop;
  exception when others then perform public.shared_note('profile_from_agreement', jsonb_build_object('agreement', new.id, 'error', sqlerrm)); end;
  return null;
end $$;
create trigger profile_from_agreement after insert or update of answers, property_id, status on public.agreements for each row execute function public.profile_from_agreement();

-- ───── 2. person ─────
alter table public.crm_property_links drop constraint crm_property_links_role_check;
alter table public.crm_property_links add constraint crm_property_links_role_check check (role = any (array['owner', 'vendor', 'purchaser', 'prospective_buyer',
  'tenant', 'landlord', 'occupier', 'solicitor', 'broker', 'enquirer', 'open_home_attendee', 'neighbour', 'referrer', 'other', 'trustee', 'executor', 'contact']));

create table public.person_links (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  source text not null check (source in ('property_people', 'agreement_people', 'prelisting', 'offer_signer', 'lawyer_link', 'ql_listing', 'ql_seller_lead')),
  source_id uuid not null,
  property_id uuid references public.properties(id) on delete set null,
  role text,                                  -- the role it gave the person on the property (crm_property_links), if any
  matched_by text not null check (matched_by in ('email', 'name', 'record', 'new', 'tim')),
  doubt text,                                 -- why Tim should check this one (never merged silently)
  doubt_contact_id uuid references public.crm_contacts(id) on delete set null,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);
create index person_links_contact on public.person_links (contact_id);
create index person_links_property on public.person_links (property_id);
alter table public.person_links enable row level security;
create policy pl_agent_read on public.person_links for select to authenticated using (public.is_agent());
revoke insert, update, delete, truncate on public.person_links from anon, authenticated;

create or replace function public.person_first(s text) returns text language sql immutable as $$ select split_part(public.norm_name(s), ' ', 1) $$;

-- does this name fit this contact? An informal name (typed by Tim at an appraisal, a Quiet List form) fits on its first name or the
-- preferred name; a checked name must be the same person's name (same_person_name, migration 003); a contact known only informally
-- fits any name
create or replace function public.person_name_fits(p_contact uuid, p_name text, p_informal boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select public.norm_name(p_name) = '' or exists (select 1 from public.crm_contacts c where c.id = p_contact and (
    c.legal_name is null
    or public.same_person_name(c.legal_name, p_name)
    or public.norm_name(c.legal_name) = public.norm_name(p_name)
    or (p_informal and (public.person_first(c.legal_name) = public.person_first(p_name) or public.norm_name(c.preferred_name) = public.norm_name(p_name)
                        or public.norm_name(c.display_name) = public.norm_name(p_name)))));
$$;

-- find or make the contact for one person. Returns the contact, how it matched and any doubt.
create or replace function public.person_find(p_name text, p_pref text, p_email text, p_property uuid, p_informal boolean, p_source text,
  out contact_id uuid, out matched_by text, out doubt text, out doubt_contact uuid)
language plpgsql security definer set search_path = public as $$
declare em text := lower(trim(coalesce(p_email, ''))); nm text := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  c record; fits uuid[] := '{}'; best uuid; other uuid; n int := 0;
begin
  if em <> '' then
    for c in select ct.id, ct.legal_name from public.crm_contacts ct
              where ct.archived_at is null and exists (select 1 from public.crm_contact_methods m where m.contact_id = ct.id and m.kind = 'email' and m.value_norm = em)
              order by ct.created_at, ct.id loop
      n := n + 1; if other is null then other := c.id; end if;
      if public.person_name_fits(c.id, nm, p_informal) then
        fits := fits || c.id;
        if best is null and c.legal_name is not null and nm <> '' and (public.same_person_name(c.legal_name, nm) or public.norm_name(c.legal_name) = public.norm_name(nm)) then best := c.id; end if;
      end if;
    end loop;
    if array_length(fits, 1) = 1 then contact_id := fits[1]; matched_by := 'email'; return; end if;
    if array_length(fits, 1) > 1 then
      contact_id := coalesce(best, fits[1]); matched_by := 'email';
      if best is null then doubt := 'The same email belongs to more than one person. Check this is the right one.'; doubt_contact := (select x from unnest(fits) x where x <> contact_id limit 1); end if;
      return;
    end if;
    if n > 0 and p_informal then
      contact_id := other; matched_by := 'email';
      doubt := 'Same email as this person, but the name given here (' || left(nm, 80) || ') does not match. Check it is the same person.'; return;
    end if;
    if n > 0 then doubt := 'Same email as another person with a different name, so kept as a separate person. Check whether they are the same.'; doubt_contact := other; end if;
  elsif nm <> '' and p_property is not null then
    select array_agg(distinct l.contact_id) into fits from public.person_links l join public.crm_contacts ct on ct.id = l.contact_id
     where l.property_id = p_property and ct.archived_at is null
       and (public.norm_name(ct.legal_name) = public.norm_name(nm) or (p_informal and public.norm_name(ct.display_name) = public.norm_name(nm)));
    if array_length(fits, 1) >= 1 then
      contact_id := fits[1]; matched_by := 'name';
      if array_length(fits, 1) > 1 then doubt := 'More than one person on this property has this name. Check this is the right one.'; doubt_contact := fits[2]; end if;
      return;
    end if;
  end if;
  if nm = '' and em = '' then return; end if;
  insert into public.crm_contacts (kind, display_name, legal_name, preferred_name, lead_source, marketing_consent)
  values ('person', left(coalesce(nullif(trim(coalesce(p_pref, '')), ''), nullif(nm, ''), em), 200), case when p_informal then null else nullif(nm, '') end,
          nullif(trim(coalesce(p_pref, '')), ''), p_source, 'unknown')
  returning id into contact_id;
  matched_by := 'new';
end $$;
revoke execute on function public.person_find(text, text, text, uuid, boolean, text) from public, anon, authenticated;

-- link one row of a name list to its contact (and the property, with a role). Called by the triggers below; returns the contact.
create or replace function public.person_link(p_source text, p_source_id uuid, p_property uuid, p_name text, p_pref text, p_email text,
  p_phone text, p_informal boolean, p_role text, p_current boolean, p_contact uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare l public.person_links; mb text; dbt text; dc uuid; cid uuid; em text := lower(trim(coalesce(p_email, ''))); nm text := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  ph text := trim(coalesce(p_phone, '')); keep boolean := false; old_contact uuid; old_role text;
begin
  if p_source_id is null then return null; end if;
  select * into l from public.person_links where source = p_source and source_id = p_source_id for update;
  if nm = '' and em = '' and p_contact is null then return l.contact_id; end if;
  old_contact := l.contact_id; old_role := l.role;
  if l.id is not null then
    keep := l.matched_by = 'tim'
      or (p_contact is not null and l.contact_id = p_contact)
      or (p_contact is null and (em = '' or exists (select 1 from public.crm_contact_methods m where m.contact_id = l.contact_id and m.kind = 'email' and m.value_norm = em))
          and public.person_name_fits(l.contact_id, nm, p_informal));
  end if;
  if keep then
    cid := l.contact_id;
    update public.person_links set property_id = coalesce(p_property, property_id), role = coalesce(p_role, role), updated_at = now() where id = l.id;
  else
    if p_contact is not null then cid := p_contact; mb := 'record';
    else select x.contact_id, x.matched_by, x.doubt, x.doubt_contact into cid, mb, dbt, dc from public.person_find(nm, p_pref, em, p_property, p_informal, p_source) x; end if;
    if cid is null then return null; end if;
    insert into public.person_links (contact_id, source, source_id, property_id, role, matched_by, doubt, doubt_contact_id)
    values (cid, p_source, p_source_id, p_property, p_role, mb, dbt, dc)
    on conflict (source, source_id) do update set contact_id = excluded.contact_id, property_id = coalesce(excluded.property_id, person_links.property_id), role = excluded.role,
      matched_by = excluded.matched_by, doubt = excluded.doubt, doubt_contact_id = excluded.doubt_contact_id, resolved_at = null, resolved_by = null, updated_at = now();
    -- moved to another person: the old person's role from this row ends
    if old_contact is not null and old_contact <> cid and old_role is not null and p_property is not null then
      update public.crm_property_links set is_current = false, ended_on = coalesce(ended_on, current_date)
       where contact_id = old_contact and property_id = p_property and role = old_role and source = p_source;
    end if;
  end if;
  if em <> '' then
    insert into public.crm_contact_methods (contact_id, kind, value, is_primary, source)
    values (cid, 'email', em, not exists (select 1 from public.crm_contact_methods where contact_id = cid and kind = 'email'), p_source)
    on conflict (contact_id, kind, value_norm) do nothing;
  end if;
  if ph <> '' and public.crm_norm_value('phone', ph) <> '' then
    insert into public.crm_contact_methods (contact_id, kind, value, is_primary, source)
    values (cid, case when public.crm_norm_value('mobile', ph) like '02%' then 'mobile' else 'phone' end, ph,
            not exists (select 1 from public.crm_contact_methods where contact_id = cid and kind in ('mobile', 'phone')), p_source)
    on conflict (contact_id, kind, value_norm) do nothing;
  end if;
  -- a checked name fills in a contact known only informally; a legal name already on the contact is never replaced
  update public.crm_contacts set legal_name = coalesce(legal_name, case when not p_informal then nullif(nm, '') end),
         preferred_name = coalesce(preferred_name, nullif(trim(coalesce(p_pref, '')), '')),
         display_name = case when legal_name is null and not p_informal and nm <> '' and display_name = em then nm else display_name end
   where id = cid and ((legal_name is null and not p_informal and nm <> '') or (preferred_name is null and trim(coalesce(p_pref, '')) <> ''));
  if p_property is not null and p_role is not null then
    insert into public.crm_property_links as x (contact_id, property_id, role, is_current, started_on, ended_on, source)
    values (cid, p_property, p_role, coalesce(p_current, true), current_date, case when not coalesce(p_current, true) then current_date end, p_source)
    on conflict (contact_id, property_id, role) do update set
      is_current = case when x.source = excluded.source then excluded.is_current else x.is_current or excluded.is_current end,
      ended_on = case when (case when x.source = excluded.source then excluded.is_current else x.is_current or excluded.is_current end) then null else coalesce(x.ended_on, current_date) end;
  end if;
  return cid;
end $$;
revoke execute on function public.person_link(text, uuid, uuid, text, text, text, text, boolean, text, boolean, uuid) from public, anon, authenticated;

-- property_people: the working list of this round's owners and contacts. Its contact_id is filled as it is written.
create or replace function public.person_link_pp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    new.contact_id := coalesce(public.person_link('property_people', new.id, new.property_id, new.legal_name, new.pref_name, new.email, new.phone,
      coalesce(new.name_from, new.source, '') = 'appraisal', case when new.role = 'contact' then 'contact' else 'owner' end, new.role <> 'former'), new.contact_id);
  exception when others then perform public.shared_note('person_link_pp', jsonb_build_object('row', new.id, 'error', sqlerrm)); end;
  return new;
end $$;
create trigger person_link_pp before insert or update of legal_name, pref_name, email, phone, role, name_from on public.property_people for each row execute function public.person_link_pp();

-- agreement_people: linked through person_links; contact_id is filled only while the person has not signed
create or replace function public.agreement_role(p_capacity text) returns text language sql immutable as $$
  select case when coalesce(p_capacity, 'Owners') = 'Owners' then null when p_capacity = 'Trustee' then 'trustee' else 'vendor' end;
$$;
create or replace function public.person_link_ap() returns trigger language plpgsql security definer set search_path = public as $$
declare ag public.agreements; cid uuid;
begin
  begin
    select * into ag from public.agreements where id = new.agreement_id;
    cid := public.person_link('agreement_people', new.id, ag.property_id, new.legal_name, new.pref_name, new.email, new.phone, false,
      public.agreement_role(ag.answers->>'capacity'), coalesce(ag.status, 'draft') not in ('ended', 'cancelled'));
    if new.signed_at is null and cid is not null then new.contact_id := cid; end if;
  exception when others then perform public.shared_note('person_link_ap', jsonb_build_object('row', new.id, 'error', sqlerrm)); end;
  return new;
end $$;
create trigger person_link_ap before insert or update of legal_name, pref_name, email, phone on public.agreement_people for each row execute function public.person_link_ap();

-- the rest are linked after they are written, and their own rows are not changed
create or replace function public.person_link_after() returns trigger language plpgsql security definer set search_path = public as $$
declare g public.offer_signings; pc uuid; pid uuid; st text;
begin
  begin
    if tg_table_name = 'prelistings' then
      perform public.person_link('prelisting', new.id, new.property_id, new.contact_name, null, new.contact_email, null, true, null, new.status <> 'closed');
    elsif tg_table_name = 'offer_signers' then
      select * into g from public.offer_signings where id = new.signing_id;
      if new.person_id is not null then select contact_id into pc from public.property_people where id = new.person_id; end if;
      perform public.person_link('offer_signer', new.id, g.property_id, new.name, null, new.email, null, false,
        case when coalesce(g.side, 'purchaser') = 'purchaser' then 'purchaser' end, true, pc);
    elsif tg_table_name = 'lawyer_links' then
      select property_id into pid from public.agreements where id = new.agreement_id;
      pc := public.person_link('lawyer_link', new.id, pid, new.lawyer_name, null, new.email, null, false, 'solicitor', true);
      if pc is not null and coalesce(trim(new.firm), '') <> '' then update public.crm_contacts set organisation_name = coalesce(organisation_name, left(trim(new.firm), 200)) where id = pc; end if;
    elsif tg_table_name = 'ql_seller_leads' then
      select property_id into pid from public.ql_listings where id = new.listing_id;
      perform public.person_link('ql_seller_lead', new.id, pid, new.name, null, new.email, new.phone, true, case when pid is not null then 'vendor' end, new.status <> 'not_proceeding');
    end if;
  exception when others then perform public.shared_note('person_link_' || tg_table_name, jsonb_build_object('row', new.id, 'error', sqlerrm)); end;
  return null;
end $$;
create trigger person_link_after after insert or update of contact_name, contact_email, property_id, status on public.prelistings for each row execute function public.person_link_after();
create trigger person_link_after after insert on public.offer_signers for each row execute function public.person_link_after();
create trigger person_link_after after insert or update of lawyer_name, email, firm on public.lawyer_links for each row execute function public.person_link_after();
create trigger person_link_after after insert or update of name, email, phone, listing_id, status on public.ql_seller_leads for each row execute function public.person_link_after();

-- a new AML file is filed with its person's contact (crm_aml_sync then keeps the contact's AML summary); locked files are never touched
create or replace function public.aml_file_contact() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.contact_id is null and new.person_id is not null then
    begin
      select contact_id into new.contact_id from public.person_links where source = 'agreement_people' and source_id = new.person_id;
    exception when others then perform public.shared_note('aml_file_contact', jsonb_build_object('row', new.id, 'error', sqlerrm)); end;
  end if;
  return new;
end $$;
create trigger aml_file_contact before insert on public.aml_files for each row execute function public.aml_file_contact();

-- Tim settles a doubt: the same person (the link moves to the other contact, and a contact left with nothing is archived) or two
-- different people (the doubt is cleared). Either way the link is then his, and no later match moves it.
create or replace function public.agent_person_link_resolve(p_link uuid, p_same boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.person_links; target uuid;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  select * into l from public.person_links where id = p_link for update;
  if l.id is null then raise exception 'Not found'; end if;
  if l.doubt is null then raise exception 'Nothing to check here'; end if;
  if p_same then
    target := l.doubt_contact_id;
    if target is null then raise exception 'There is no other person to join this to'; end if;
    update public.person_links set contact_id = target, matched_by = 'tim', doubt = null, doubt_contact_id = null, resolved_at = now(), resolved_by = auth.jwt()->>'email', updated_at = now() where id = l.id;
    insert into public.crm_contact_methods (contact_id, kind, label, value, value_norm, is_primary, opted_out_at, bounced_at, source)
      select target, m.kind, m.label, m.value, m.value_norm, false, m.opted_out_at, m.bounced_at, m.source from public.crm_contact_methods m where m.contact_id = l.contact_id
      on conflict (contact_id, kind, value_norm) do nothing;
    if l.property_id is not null and l.role is not null then
      insert into public.crm_property_links (contact_id, property_id, role, is_current, started_on, source) values (target, l.property_id, l.role, true, current_date, l.source)
      on conflict (contact_id, property_id, role) do update set is_current = true, ended_on = null;
    end if;
    if not exists (select 1 from public.person_links where contact_id = l.contact_id) and not exists (select 1 from public.aml_files where contact_id = l.contact_id) then
      update public.crm_property_links set is_current = false, ended_on = coalesce(ended_on, current_date) where contact_id = l.contact_id;
      update public.crm_contacts set archived_at = now(), status = 'archived', notes = concat_ws(E'\n', notes, 'Joined to another record by Tim on ' || to_char(now() at time zone 'Pacific/Auckland', 'FMDD Mon YYYY')) where id = l.contact_id;
    end if;
  else
    update public.person_links set matched_by = 'tim', doubt = null, doubt_contact_id = null, resolved_at = now(), resolved_by = auth.jwt()->>'email', updated_at = now() where id = l.id;
  end if;
  return (select to_jsonb(x) from public.person_links x where x.id = l.id);
end $$;

-- who is who on a property, from the one home (agent only; security invoker, so crm_property_links' own rules apply)
create view public.property_person_roles with (security_invoker = true) as
  select x.property_id, x.contact_id, c.display_name, c.legal_name, c.preferred_name, x.role, x.is_current, x.started_on, x.ended_on, x.source
    from public.crm_property_links x join public.crm_contacts c on c.id = x.contact_id;
revoke insert, update, delete, truncate on public.property_person_roles from anon, authenticated;

-- ───── 4. question bank ─────
create table public.qa_questions (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,60}$'),
  text text not null,
  kind text not null default 'text' check (kind in ('text', 'choice', 'scale', 'list')),
  choices jsonb,
  grp text not null,
  position integer not null,
  vendor_visible boolean not null default true,   -- the vendor may see their own answer (Tim's own notes never)
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.qa_questions (key, text, kind, grp, position, vendor_visible) values
  ('goals', 'What are you hoping a sale will do for you?', 'text', 'goals', 10, true),
  ('timing', 'When are you thinking of selling?', 'text', 'timing', 20, true),
  ('timing_when', 'Is there a date that matters, for example a move or a settlement elsewhere?', 'text', 'timing', 30, true),
  ('reason_selling', 'What has you thinking about selling?', 'text', 'goals', 40, true),
  ('motivation', 'How keen are you to sell?', 'text', 'goals', 50, true),
  ('price_thoughts', 'What price do you have in mind, or what have you heard it might be worth?', 'text', 'price', 60, true),
  ('appraised_before', 'Has anyone appraised or valued it recently?', 'text', 'price', 70, true),
  ('plans_after', 'Where are you heading after the sale?', 'text', 'plans', 80, true),
  ('also_buying', 'Are you buying another property too?', 'choice', 'plans', 90, true),
  ('best_of_home', 'What do you love most about your home?', 'text', 'home', 100, true),
  ('best_of_area', 'What do you love most about the area?', 'text', 'home', 110, true),
  ('other_agents_spoken', 'Have you spoken with anyone else about selling?', 'text', 'agents', 120, true),
  ('other_agents_feel', 'Was there anything you liked, anything that put you off, or anything that left you wondering?', 'text', 'agents', 130, true),
  ('preferred_agent', 'Have you got a preferred agent to work with?', 'text', 'agents', 140, true),
  ('agent_choice_same_fee', 'If every agent charged exactly the same, who would you choose?', 'text', 'agents', 150, true),
  ('agent_choice_why', 'What''s behind that choice?', 'text', 'agents', 160, true),
  ('plan_ideas', 'Are there any other ideas you''d like built into our plan?', 'text', 'plan', 170, true),
  ('plan_confidence', 'How confident are you in each part of the plan so far (1 to 5)?', 'scale', 'plan', 180, true),
  ('plan_like_most', 'What do you like most about the plan so far?', 'text', 'plan', 190, true),
  ('easy_yes', 'What would need to be true for working together to be an easy yes?', 'text', 'plan', 200, true),
  ('meeting_times', 'When suits you to meet?', 'list', 'meeting', 210, true),
  ('privacy', 'How private would you like the sale to be?', 'text', 'plans', 220, true),
  ('own_words', 'Anything else, in your own words?', 'text', 'own_words', 230, true),
  ('tim_price_fit', 'Price: does their expectation fit the market?', 'choice', 'tim', 900, false),
  ('tim_motivation_fit', 'Motivation: are they ready to sell?', 'choice', 'tim', 910, false),
  ('tim_time_fit', 'Time: does their timing work?', 'choice', 'tim', 920, false),
  ('tim_notes', 'Tim''s notes', 'text', 'tim', 930, false);
alter table public.qa_questions enable row level security;
create policy qa_q_read on public.qa_questions for select to authenticated using (true);
revoke insert, update, delete, truncate on public.qa_questions from anon, authenticated;

create table public.qa_answers (
  id uuid primary key default gen_random_uuid(),
  question_key text not null references public.qa_questions(key),
  property_id uuid references public.properties(id) on delete set null,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  value jsonb not null,
  source text not null check (source in ('appointment_confirmation', 'first_visit', 'questionnaire', 'quiet_list_seller_form', 'quiet_list_listing', 'seller_profile', 'tim')),
  source_ref uuid,                              -- the questionnaire (prelisting), Quiet List lead or listing, or seller profile
  by_vendor boolean not null,                   -- the vendor's own words (they may see them); otherwise Tim's note (Tim only)
  answered_at timestamptz not null default now(),
  recorded_by text,
  unique (question_key, source, source_ref)
);
create index qa_answers_property on public.qa_answers (property_id);
create index qa_answers_contact on public.qa_answers (contact_id);
alter table public.qa_answers enable row level security;
revoke insert, update, delete, truncate on public.qa_answers from anon, authenticated;

-- is this answer the signed-in vendor's own? Their questionnaire, or an answer filed to them (their contact's email or sign-in)
create or replace function public.qa_mine(p_source text, p_ref uuid, p_contact uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    (p_source = 'questionnaire' and exists (select 1 from public.prelistings pl where pl.id = p_ref and pl.status <> 'closed'
        and (pl.user_id = auth.uid() or lower(pl.contact_email) = lower(coalesce(auth.jwt()->>'email', '')))))
    or (p_contact is not null and coalesce(auth.jwt()->>'email', '') <> '' and exists (select 1 from public.crm_contact_methods m
        where m.contact_id = p_contact and m.kind = 'email' and m.value_norm = lower(auth.jwt()->>'email'))));
$$;
create policy qa_agent on public.qa_answers for select to authenticated using (public.is_agent());
create policy qa_vendor on public.qa_answers for select to authenticated
  using (by_vendor and exists (select 1 from public.qa_questions q where q.key = question_key and q.vendor_visible) and public.qa_mine(source, source_ref, contact_id));

create or replace function public.qa_put(p_key text, p_property uuid, p_contact uuid, p_value jsonb, p_source text, p_ref uuid, p_by_vendor boolean, p_by text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.jblank(p_value) or (jsonb_typeof(p_value) = 'string' and trim(p_value #>> '{}') = '') then
    delete from public.qa_answers where question_key = p_key and source = p_source and source_ref is not distinct from p_ref and p_ref is not null;
    return;
  end if;
  if p_ref is null then
    insert into public.qa_answers (question_key, property_id, contact_id, value, source, source_ref, by_vendor, recorded_by)
    values (p_key, p_property, p_contact, p_value, p_source, null, p_by_vendor, p_by);
    return;
  end if;
  insert into public.qa_answers as a (question_key, property_id, contact_id, value, source, source_ref, by_vendor, recorded_by)
  values (p_key, p_property, p_contact, p_value, p_source, p_ref, p_by_vendor, p_by)
  on conflict (question_key, source, source_ref) do update set value = excluded.value, property_id = coalesce(excluded.property_id, a.property_id),
    contact_id = coalesce(excluded.contact_id, a.contact_id), answered_at = case when a.value is distinct from excluded.value then now() else a.answered_at end, recorded_by = excluded.recorded_by;
end $$;
revoke execute on function public.qa_put(text, uuid, uuid, jsonb, text, uuid, boolean, text) from public, anon, authenticated;

-- the questions before we meet (prelistings.answers, the old "Let's begin" questionnaire): every answer also goes to the bank
create or replace function public.qa_prelisting_map() returns jsonb language sql immutable as $$
  select '{"spoke":"other_agents_spoken","spokeFeel":"other_agents_feel","choose":"agent_choice_same_fee","chooseWhy":"agent_choice_why","ideas":"plan_ideas","conf":"plan_confidence","likeMost":"plan_like_most","easyYes":"easy_yes","meet":"meeting_times"}'::jsonb;
$$;
create or replace function public.qa_from_prelisting() returns trigger language plpgsql security definer set search_path = public as $$
declare k text; q text; cid uuid;
begin
  begin
    select contact_id into cid from public.person_links where source = 'prelisting' and source_id = new.id;
    for k, q in select * from jsonb_each_text(public.qa_prelisting_map()) loop
      if tg_op = 'UPDATE' and (new.answers -> k) is not distinct from (old.answers -> k) and new.property_id is not distinct from old.property_id then continue; end if;
      perform public.qa_put(q, new.property_id, cid, new.answers -> k, 'questionnaire', new.id, true, coalesce(auth.jwt()->>'email', new.contact_email));
    end loop;
  exception when others then perform public.shared_note('qa_from_prelisting', jsonb_build_object('row', new.id, 'error', sqlerrm)); end;
  return null;
end $$;
-- named to run after person_link_after (triggers run in name order), so the answers carry the contact
create trigger qa_from_prelisting after insert or update of answers, property_id on public.prelistings for each row execute function public.qa_from_prelisting();

-- the Quiet List seller form: the seller's own words
create or replace function public.qa_from_seller_lead() returns trigger language plpgsql security definer set search_path = public as $$
declare cid uuid; pid uuid; j jsonb := to_jsonb(new); oj jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end; k text; q text;
begin
  begin
    select contact_id into cid from public.person_links where source = 'ql_seller_lead' and source_id = new.id;
    select property_id into pid from public.ql_listings where id = new.listing_id;
    for k, q in select * from jsonb_each_text('{"reason":"reason_selling","motivation":"motivation","time":"timing","time_when":"timing_when","expected_price":"price_thoughts","appraised":"appraised_before","privacy":"privacy","also_buying":"also_buying","comments":"own_words"}'::jsonb) loop
      if tg_op = 'UPDATE' and (j -> k) is not distinct from (oj -> k) and new.listing_id is not distinct from old.listing_id then continue; end if;
      perform public.qa_put(q, pid, cid, case when k = 'also_buying' and not new.also_buying then null else j -> k end, 'quiet_list_seller_form', new.id, true, new.email);
    end loop;
  exception when others then perform public.shared_note('qa_from_seller_lead', jsonb_build_object('row', new.id, 'error', sqlerrm)); end;
  return null;
end $$;
create trigger qa_from_seller_lead after insert or update on public.ql_seller_leads for each row execute function public.qa_from_seller_lead();

-- seller profiles (crm_profiles, Tim's notes): motivation, timeframe and price expectation, Tim only
create or replace function public.qa_from_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.profile_type <> 'seller' then return null; end if;
  begin
    perform public.qa_put('motivation', new.property_id, new.contact_id, to_jsonb(new.motivation), 'seller_profile', new.id, false, auth.jwt()->>'email');
    perform public.qa_put('timing', new.property_id, new.contact_id, to_jsonb(new.timeframe), 'seller_profile', new.id, false, auth.jwt()->>'email');
    perform public.qa_put('price_thoughts', new.property_id, new.contact_id, case when new.price_expectation is null then null else to_jsonb(new.price_expectation) end, 'seller_profile', new.id, false, auth.jwt()->>'email');
  exception when others then perform public.shared_note('qa_from_profile', jsonb_build_object('row', new.id, 'error', sqlerrm)); end;
  return null;
end $$;
create trigger qa_from_profile after insert or update of motivation, timeframe, price_expectation, property_id, contact_id on public.crm_profiles for each row execute function public.qa_from_profile();

-- Tim records an answer himself (first visit, a phone call): by_vendor false unless he is writing down the vendor's own words
create or replace function public.agent_qa_answer(p_question text, p_property uuid, p_contact uuid, p_value jsonb, p_source text, p_by_vendor boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare aid uuid;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if not exists (select 1 from public.qa_questions where key = p_question and active) then raise exception 'Not a question in the bank'; end if;
  if coalesce(p_source, '') not in ('first_visit', 'tim', 'appointment_confirmation') then raise exception 'Choose where the answer came from'; end if;
  if public.jblank(p_value) or length(p_value::text) > 8000 then raise exception 'Add an answer (up to 8000 characters)'; end if;
  if p_property is null and p_contact is null then raise exception 'File it to a property or a person'; end if;
  insert into public.qa_answers (question_key, property_id, contact_id, value, source, source_ref, by_vendor, recorded_by)
  values (p_question, p_property, p_contact, p_value, p_source, null, coalesce(p_by_vendor, false), auth.jwt()->>'email') returning id into aid;
  return aid;
end $$;

-- ───── 5 and the Quiet List: the listing reads the shared property profile and person record ─────
alter table public.ql_listings add column property_id uuid references public.properties(id) on delete set null;
alter table public.ql_listings add column vendor_contact_id uuid references public.crm_contacts(id) on delete set null;
alter table public.ql_listings add column photo_doc_ids uuid[] not null default '{}';   -- photos from property_documents, in order

create or replace function public.ql_num(v jsonb) returns numeric language plpgsql immutable as $$
declare t text := case when v is null then null when jsonb_typeof(v) = 'number' then v::text else regexp_replace(v #>> '{}', '[, ]', '', 'g') end; m text;
begin
  if t is null then return null; end if;
  m := substring(t from '[0-9]+(?:\.[0-9]+)?'); if m is null then return null; end if;
  return m::numeric;
exception when others then return null;
end $$;

-- before a listing is written: when it is tied to a property, its empty fact columns are filled from the profile, and its vendor
-- is linked to their person record
create or replace function public.ql_listing_before() returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v jsonb;
begin
  begin
    if new.property_id is not null and (tg_op = 'INSERT' or new.property_id is distinct from old.property_id) then
      for r in select pk.key, pk.ql_column, fv.value from public.profile_keys pk join public.property_profile c on c.property_id = new.property_id and c.key = pk.key
                 join public.property_fact_values fv on fv.id = c.value_id where pk.ql_column is not null loop
        v := r.value;
        if r.ql_column = 'property_type' and new.property_type is null then new.property_type := left(v #>> '{}', 100);
        elsif r.ql_column = 'year_built' and new.year_built is null then new.year_built := left(v #>> '{}', 20);
        elsif r.ql_column = 'beds' and new.beds is null then new.beds := floor(public.ql_num(v))::int;
        elsif r.ql_column = 'baths' and new.baths is null then new.baths := public.ql_num(v);
        elsif r.ql_column = 'parking' and new.parking is null then new.parking := floor(public.ql_num(v))::int;
        elsif r.ql_column = 'land_m2' and new.land_m2 is null then new.land_m2 := public.ql_num(v);
        elsif r.ql_column = 'floor_m2' and new.floor_m2 is null then new.floor_m2 := public.ql_num(v);
        elsif r.ql_column = 'rv' and new.rv is null then new.rv := public.ql_num(v);
        end if;
      end loop;
    end if;
    if tg_op = 'INSERT' or new.vendor_name is distinct from old.vendor_name or new.vendor_email is distinct from old.vendor_email
       or new.vendor_phone is distinct from old.vendor_phone or new.property_id is distinct from old.property_id or new.status is distinct from old.status then
      new.vendor_contact_id := coalesce(public.person_link('ql_listing', new.id, new.property_id, new.vendor_name, null, new.vendor_email, new.vendor_phone, true,
        case when new.property_id is not null then 'vendor' end, new.status not in ('sold', 'withdrawn')), new.vendor_contact_id);
    end if;
  exception when others then perform public.shared_note('ql_listing_before', jsonb_build_object('row', new.id, 'error', sqlerrm)); end;
  return new;
end $$;
create trigger ql_listing_shared before insert or update on public.ql_listings for each row execute function public.ql_listing_before();

-- after: the listing's facts are values from the Quiet List on the profile (a same value changes nothing), and Tim's price, motivation
-- and time notes go to the bank (Tim only)
create or replace function public.ql_listing_after() returns trigger language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new); oj jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end; r record; v jsonb; k text; q text;
begin
  begin
    if new.property_id is not null then
      for r in select key, ql_column from public.profile_keys where ql_column is not null loop
        v := j -> r.ql_column;
        if tg_op = 'UPDATE' and v is not distinct from (oj -> r.ql_column) and new.property_id is not distinct from old.property_id then continue; end if;
        if public.jblank(v) and (tg_op = 'INSERT' or public.jblank(oj -> r.ql_column)) then continue; end if;
        perform public.profile_record(new.property_id, r.key, case when v is null then null when jsonb_typeof(v) = 'number' then to_jsonb(v::text) else v end,
          'quiet_list', new.id, to_char(now() at time zone 'Pacific/Auckland', 'FMDD Mon YYYY'), 'Quiet List ' || coalesce(new.ref, ''), null, null, coalesce(auth.jwt()->>'email', 'agent'), 'auto');
      end loop;
    end if;
    for k, q in select * from jsonb_each_text('{"m_price":"tim_price_fit","m_motivation":"tim_motivation_fit","m_time":"tim_time_fit","m_notes":"tim_notes"}'::jsonb) loop
      if tg_op = 'UPDATE' and (j -> k) is not distinct from (oj -> k) and new.property_id is not distinct from old.property_id and new.vendor_contact_id is not distinct from old.vendor_contact_id then continue; end if;
      perform public.qa_put(q, new.property_id, new.vendor_contact_id, j -> k, 'quiet_list_listing', new.id, false, coalesce(auth.jwt()->>'email', 'agent'));
    end loop;
  exception when others then perform public.shared_note('ql_listing_after', jsonb_build_object('row', new.id, 'error', sqlerrm)); end;
  return null;
end $$;
create trigger ql_listing_shared_after after insert or update on public.ql_listings for each row execute function public.ql_listing_after();

-- the Quiet List's photos come from the one store: items of the listing's property, in the photos folder, not archived
create or replace function public.agent_ql_set_photos(p_listing uuid, p_docs uuid[]) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare l public.ql_listings; bad int;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  select * into l from public.ql_listings where id = p_listing for update;
  if l.id is null then raise exception 'Listing not found'; end if;
  if l.property_id is null then raise exception 'Tie the listing to its property first'; end if;
  if coalesce(array_length(p_docs, 1), 0) > 60 then raise exception 'Up to 60 photos'; end if;
  if (select count(distinct x) from unnest(coalesce(p_docs, '{}')) x) <> coalesce(array_length(p_docs, 1), 0) then raise exception 'A photo is listed twice'; end if;
  select count(*) into bad from unnest(coalesce(p_docs, '{}')) x
   where not exists (select 1 from public.property_documents d where d.id = x and d.property_id = l.property_id and d.folder = 'photos' and d.archived_at is null);
  if bad > 0 then raise exception 'Only photos of this property, not archived, can be used'; end if;
  update public.ql_listings set photo_doc_ids = coalesce(p_docs, '{}') where id = p_listing;
  return coalesce(p_docs, '{}');
end $$;

create or replace function public.ql_listing_photos(p_listing uuid) returns setof public.property_documents
language sql stable security definer set search_path = public as $$
  select d.* from public.ql_listings l, unnest(l.photo_doc_ids) with ordinality u(doc_id, n)
    join public.property_documents d on d.id = u.doc_id
   where l.id = p_listing and public.is_agent() and d.archived_at is null and d.property_id = l.property_id
   order by u.n;
$$;

-- the inspection's photos are the store's items filed with the inspection (property_inspections.photos is no longer used)
create or replace function public.inspection_photos(p_inspection uuid) returns setof public.property_documents
language sql stable security definer set search_path = public as $$
  select d.* from public.property_documents d where d.inspection_id = p_inspection and public.is_agent() and d.archived_at is null
   order by coalesce(d.taken_at, d.created_at);
$$;
comment on column public.property_inspections.photos is 'Not used (LW0): an inspection''s photos are property_documents with inspection_id; read them with inspection_photos().';
comment on column public.ql_listings.photos is 'Kept working for the Quiet List pages. New photos come from property_documents through photo_doc_ids (agent_ql_set_photos, ql_listing_photos).';
comment on column public.property_people.contact_id is 'The person record (crm_contacts), filled by person_link_pp as the row is written (LW0).';
comment on column public.agreement_people.contact_id is 'Filled only while the person has not signed; every agreement person is linked through person_links (LW0).';

-- ───── privileges on the new functions ─────
revoke execute on function public.shared_note(text, jsonb) from public, anon, authenticated;
revoke execute on function public.agent_property_profile(uuid), public.agent_profile_set(uuid, text, jsonb), public.agent_profile_choose(uuid, text, uuid),
  public.agent_profile_tick(uuid, text[], boolean), public.agent_person_link_resolve(uuid, boolean), public.agent_qa_answer(text, uuid, uuid, jsonb, text, boolean),
  public.agent_ql_set_photos(uuid, uuid[]), public.ql_listing_photos(uuid), public.inspection_photos(uuid), public.my_property_profile(uuid) from public, anon;
grant execute on function public.agent_property_profile(uuid), public.agent_profile_set(uuid, text, jsonb), public.agent_profile_choose(uuid, text, uuid),
  public.agent_profile_tick(uuid, text[], boolean), public.agent_person_link_resolve(uuid, boolean), public.agent_qa_answer(text, uuid, uuid, jsonb, text, boolean),
  public.agent_ql_set_photos(uuid, uuid[]), public.ql_listing_photos(uuid), public.inspection_photos(uuid), public.my_property_profile(uuid) to authenticated;
revoke execute on function public.profile_from_found(), public.profile_from_inspection(), public.profile_from_agreement(), public.person_link_pp(), public.person_link_ap(),
  public.person_link_after(), public.aml_file_contact(), public.qa_from_prelisting(), public.qa_from_seller_lead(), public.qa_from_profile(), public.ql_listing_before(),
  public.ql_listing_after(), public.guard_fact_value() from public, anon, authenticated;
revoke execute on function public.profile_vendor_key(text), public.person_name_fits(uuid, text, boolean), public.qa_mine(text, uuid, uuid) from anon;

-- ───── backfill (today's records are test records; nothing signed is changed) ─────
do $bf$
declare r record; k text; v jsonb; q text; cid uuid;
begin
  -- people, checked names first: agreement people (signed ones through person_links only), then the property's people, then the rest
  for r in select ap.*, a.property_id as pid, a.status as ag_status, a.answers->>'capacity' as cap from public.agreement_people ap join public.agreements a on a.id = ap.agreement_id order by a.created_at, ap.position loop
    cid := public.person_link('agreement_people', r.id, r.pid, r.legal_name, r.pref_name, r.email, r.phone, false, public.agreement_role(r.cap), r.ag_status not in ('ended', 'cancelled'));
    if r.signed_at is null and cid is not null and r.contact_id is null then update public.agreement_people set contact_id = cid where id = r.id; end if;
  end loop;
  for r in select * from public.property_people order by created_at, position loop
    cid := public.person_link('property_people', r.id, r.property_id, r.legal_name, r.pref_name, r.email, r.phone, coalesce(r.name_from, r.source, '') = 'appraisal',
      case when r.role = 'contact' then 'contact' else 'owner' end, r.role <> 'former');
    if cid is not null and r.contact_id is distinct from cid then update public.property_people set contact_id = cid where id = r.id; end if;
  end loop;
  for r in select s.*, g.property_id as pid, g.side from public.offer_signers s join public.offer_signings g on g.id = s.signing_id order by s.id loop
    perform public.person_link('offer_signer', r.id, r.pid, r.name, null, r.email, null, false, case when coalesce(r.side, 'purchaser') = 'purchaser' then 'purchaser' end, true,
      (select contact_id from public.property_people where id = r.person_id));
  end loop;
  for r in select l.*, a.property_id as pid from public.lawyer_links l join public.agreements a on a.id = l.agreement_id order by l.sent_at nulls last, l.id loop
    cid := public.person_link('lawyer_link', r.id, r.pid, r.lawyer_name, null, r.email, null, false, 'solicitor', true);
    if cid is not null and coalesce(trim(r.firm), '') <> '' then update public.crm_contacts set organisation_name = coalesce(organisation_name, left(trim(r.firm), 200)) where id = cid; end if;
  end loop;
  for r in select * from public.prelistings order by created_at loop
    perform public.person_link('prelisting', r.id, r.property_id, r.contact_name, null, r.contact_email, null, true, null, r.status <> 'closed');
  end loop;
  for r in select sl.*, l.property_id as pid from public.ql_seller_leads sl left join public.ql_listings l on l.id = sl.listing_id order by sl.created_at loop
    perform public.person_link('ql_seller_lead', r.id, r.pid, r.name, null, r.email, r.phone, true, case when r.pid is not null then 'vendor' end, r.status <> 'not_proceeding');
  end loop;
  -- AML: files not locked are filed with their contact (crm_aml_sync sets "in progress"); locked files stay as they are, and their
  -- contact's summary is copied from them
  update public.aml_files f set contact_id = l.contact_id from public.person_links l
   where f.contact_id is null and f.locked_at is null and l.source = 'agreement_people' and l.source_id = f.person_id;
  for r in select f.*, l.contact_id as cid2 from public.aml_files f join public.person_links l on l.source = 'agreement_people' and l.source_id = f.person_id where f.locked_at is not null order by f.locked_at loop
    update public.crm_contacts c set aml_status = 'verified', aml_checked_at = r.locked_at, aml_cdd_level = r.data->>'cdd', aml_risk = r.data->>'risk', aml_pep = r.data->>'pep', aml_latest_file_id = r.id
     where c.id = r.cid2 and (c.aml_checked_at is null or c.aml_checked_at <= r.locked_at);
  end loop;
  -- the property profile: council values Tim used, then agreements and inspections in the order they were made
  for r in select * from public.properties loop
    for k, v in select * from jsonb_each(coalesce(r.found, '{}'::jsonb)) loop
      perform public.profile_record(r.id, coalesce(case when v->>'field' in ('title_ref', 'legal_description') or v->>'field' = any (public.desc_keys()) then v->>'field' end, k), v->'value', 'council', null,
        coalesce(v->>'as_of_label', v->>'as_of', left(v->>'fetched_at', 10)), v->>'source_name', v->>'display', v->>'label', 'backfill',
        case when coalesce(v->>'field', '') <> '' and coalesce((v->>'written')::boolean, false) = false then 'never' else 'tim' end);
    end loop;
  end loop;
  for r in select * from public.agreements where property_id is not null and status not in ('ended', 'cancelled') order by created_at loop
    foreach k in array public.desc_keys() loop
      if not public.jblank(r.answers -> k) then
        perform public.profile_record(r.property_id, k, r.answers -> k, 'agreement', r.id, to_char(r.updated_at at time zone 'Pacific/Auckland', 'FMDD Mon YYYY'), 'Agency agreement ' || coalesce(r.ref, ''), null, null, 'backfill', 'auto');
      end if;
    end loop;
  end loop;
  for r in select * from public.property_inspections order by started_at loop
    for k, v in select * from jsonb_each(coalesce(r.facts, '{}'::jsonb)) loop
      if k = any (public.desc_keys()) and not public.jblank(v) then
        perform public.profile_record(r.property_id, k, v, 'inspection', r.id, to_char(coalesce(public.stamp_ts(r.stamps->>('f:' || k)), r.updated_at) at time zone 'Pacific/Auckland', 'FMDD Mon YYYY'),
          'Inspect a property', null, null, r.created_by, case when coalesce(r.conflicts, '{}'::jsonb) ? k then 'never' else 'tim' end);
      end if;
    end loop;
  end loop;
  -- the questions before we meet, into the bank
  for r in select * from public.prelistings loop
    cid := (select contact_id from public.person_links where source = 'prelisting' and source_id = r.id);
    for k, q in select * from jsonb_each_text(public.qa_prelisting_map()) loop
      perform public.qa_put(q, r.property_id, cid, r.answers -> k, 'questionnaire', r.id, true, 'backfill');
    end loop;
  end loop;
end $bf$;

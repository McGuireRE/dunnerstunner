-- LW1, the First visit page (Tim's central build plan, "Listing workflow", the LW1 bullets, "Rooms, room by room", "Property description
-- fields, from Tim's own forms" and "Ideal buyers page", 25 to 27 November 2026). Additive only: new tables, new rows in profile_keys and
-- qa_questions, new functions. No existing table, function, trigger or signed record is changed.
--
-- The first visit is about rapport, not detail: nothing is compulsory. Everything Tim notes goes to the LW0 shared records, never a copy:
--   * Who's here: the property's people (property_people through merge_property_person, the informal 'appraisal' source, so a name typed
--     at the door never replaces a checked one), which LW0's triggers tie to one person record (crm_contacts) and the property and person
--     link (crm_property_links). first_visit_people only says who was at this visit and who decides; the names live on the person record.
--   * Room by room: property_rooms, one row per room (the room-by-room record Tim asked for on 27 November 2026, shared with LW2's
--     property profile). What Tim calls each room is his judgement: the bedroom count and the room wording on the property profile come
--     only from his classifications (LW0: pBed is Tim's alone).
--   * The tap lists from his "McGuire Property Description (Appendix D)": the property profile, through profile_record, as his own entry
--     (source 'tim', named "First visit"), with the disclosures check's rule ('check'): his choice, except that an official figure from a
--     record of title or survey plan holds. New facts are added to profile_keys.
--   * Their story and the ideal buyers (Appendix F), why they wanted to talk and the client heart: the question bank (qa_answers, source
--     'first_visit'), per person and property. Tim's notes are never the vendor's own words (by_vendor false), so vendors never read them;
--     why they wanted to talk and the client heart are also not vendor_visible.
--   * Photos and documents: property_documents, as LW0 says (the app files them through agent_repo_add with the room and a caption).
-- Tim's own additions to the tap lists: tap_list_extras.
-- One chattels list (Tim, 27 November 2026): the first visit's chattels fill an unsigned draft agency agreement's chattels (and the
-- property file, so a later agreement starts with them); his later edits on the agreement win and come back to the lists (section 4b).
-- RLS on every new table: Tim reads; nobody writes them directly (only these functions, which check is_agent). Vendors read none of them.

-- ───── 1. new facts on the property profile (Appendix D) ─────
insert into public.profile_keys (key, label, grp, position, vendor, ql_column) values
  ('rooms_summary', 'Rooms (your wording)', 'home', 31, true, null),
  ('dwellings', 'Dwellings', 'home', 32, true, null),
  ('living_dining', 'Living and dining areas', 'home', 34, true, null),
  ('extra_spaces', 'Extra spaces', 'home', 36, true, null),
  ('ensuites', 'Ensuites', 'home', 42, true, null),
  ('toilets', 'Toilets', 'home', 44, true, null),
  ('garaging', 'Garaging', 'home', 82, true, null),
  ('parking_spaces', 'Parking spaces', 'home', 84, true, null),
  ('cladding', 'Cladding', 'build', 300, true, null),
  ('roofing', 'Roofing', 'build', 310, true, null),
  ('insulation', 'Insulation', 'build', 320, true, null),
  ('flooring', 'Flooring', 'build', 330, true, null),
  ('glazing', 'Glazing', 'build', 340, true, null),
  ('levels', 'Levels', 'build', 350, true, null),
  ('chattels_std', 'Standard chattels', 'home', 112, true, null),
  ('chattels_featured', 'Featured chattels', 'home', 114, true, null),
  ('chattels_removed', 'Chattels to be removed before settlement', 'home', 116, true, null),
  ('outdoor', 'Outdoor features', 'outdoors', 400, true, null),
  ('outlook', 'Outlook', 'outdoors', 410, true, null)
on conflict (key) do nothing;

-- ───── 2. new questions in the bank (the first visit, their story and the ideal buyers, Appendix F) ─────
insert into public.qa_questions (key, text, kind, grp, position, vendor_visible) values
  ('why_talk', 'Why did they want to talk?', 'text', 'first_visit', 240, false),
  ('client_heart', 'Client heart: motivation, family, worries (only you see this)', 'text', 'first_visit', 250, false),
  ('story_bought', 'When did you buy, and what drew you to it?', 'text', 'story', 300, true),
  ('story_surprised', 'What surprised you when you moved in?', 'text', 'story', 310, true),
  ('story_setting', 'What do you appreciate about the setting and outlook?', 'text', 'story', 320, true),
  ('story_layout', 'What do you appreciate about the layout and spaces?', 'text', 'story', 330, true),
  ('story_location', 'What do you appreciate about the location and amenities?', 'text', 'story', 340, true),
  ('story_use', 'How do you use the property, and what else could it be used for?', 'text', 'story', 350, true),
  ('ib_stage', 'Ideal buyers: age or stage of life', 'text', 'ideal_buyers', 400, true),
  ('ib_pets', 'Ideal buyers: pets', 'text', 'ideal_buyers', 410, true),
  ('ib_hobbies', 'Ideal buyers: hobbies', 'text', 'ideal_buyers', 420, true),
  ('ib_children', 'Ideal buyers: children and their ages', 'text', 'ideal_buyers', 430, true),
  ('ib_mobility', 'Ideal buyers: mobility or fitness', 'text', 'ideal_buyers', 440, true),
  ('ib_vehicles', 'Ideal buyers: vehicles', 'text', 'ideal_buyers', 450, true),
  ('ib_leanings', 'Ideal buyers: sociopolitical leanings', 'text', 'ideal_buyers', 460, true),
  ('ib_situation', 'Ideal buyers: current situation (for example transferring, downsizing)', 'text', 'ideal_buyers', 470, true),
  ('ideal_for', 'Ideal for', 'list', 'ideal_buyers', 480, true)
on conflict (key) do nothing;

-- ───── 3. the first visit, who was there, and the rooms ─────
create table public.first_visits (
  id uuid primary key,                          -- made on the phone, so the visit is the same record before and after it is sent
  property_id uuid not null references public.properties(id) on delete cascade,
  started_from text not null default 'nothing' check (started_from in ('address', 'appointment', 'nothing')),
  prelisting_id uuid references public.prelistings(id) on delete set null,   -- the appointment it started from (Questions before we meet)
  notes text check (length(notes) <= 20000),     -- Tim's own notes on the visit (agent only)
  decision text check (decision in ('present_now', 'book')),   -- "Now or come back?"
  decision_at timestamptz,
  next_note text check (length(next_note) <= 2000),           -- when to come back, in his words (booking itself is LW5)
  started_at timestamptz not null default now(),             -- the phone's time
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index first_visits_property on public.first_visits (property_id);
alter table public.first_visits enable row level security;
create policy fv_agent_read on public.first_visits for select to authenticated using (public.is_agent());
revoke insert, update, delete, truncate on public.first_visits from anon, authenticated;

create table public.first_visit_people (
  id uuid primary key,                          -- the phone's key for this person at this visit
  first_visit_id uuid not null references public.first_visits(id) on delete cascade,
  property_person_id uuid references public.property_people(id) on delete set null,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  decision_maker boolean,
  here boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index first_visit_people_visit on public.first_visit_people (first_visit_id);
alter table public.first_visit_people enable row level security;
create policy fvp_agent_read on public.first_visit_people for select to authenticated using (public.is_agent());
revoke insert, update, delete, truncate on public.first_visit_people from anon, authenticated;

create or replace function public.room_class_ok(c text) returns boolean language sql immutable as $$
  select c is null or c in ('bedroom', 'study', 'office', 'living', 'studio', 'sleepout', 'flexible');
$$;
create table public.property_rooms (
  id uuid primary key,                          -- made on the phone
  property_id uuid not null references public.properties(id) on delete cascade,
  first_visit_id uuid references public.first_visits(id) on delete set null,
  base text not null check (base ~ '^[a-z][a-z_]{1,40}$'),     -- what was tapped: living, bedroom, study, sleepout ...
  label text not null check (length(label) between 1 and 60),  -- "Bedroom 2", "Sleepout by the garage"
  position integer not null default 0,
  notes text check (length(notes) <= 20000),     -- typed and dictated notes
  measurements text check (length(measurements) <= 500),   -- optional, any time
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  use_now text check (length(use_now) <= 500),   -- how it is used now
  tim_class text check (public.room_class_ok(tim_class)),   -- what Tim calls it: his judgement, the only source of the bedroom count
  tim_note text check (length(tim_note) <= 4000),   -- his compliance note (why it isn't called a bedroom)
  vendor_view text check (length(vendor_view) <= 4000),   -- the vendor's view, beside his
  photo_keys uuid[] not null default '{}',       -- the room's photos in property_documents, by their client_key
  archived_at timestamptz,                       -- a room taken off the list is kept, never deleted
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
create index property_rooms_property on public.property_rooms (property_id);
alter table public.property_rooms enable row level security;
create policy pr_agent_read on public.property_rooms for select to authenticated using (public.is_agent());
revoke insert, update, delete, truncate on public.property_rooms from anon, authenticated;

-- Tim's own additions to the tap lists (the lists themselves are in src/property-lists.js, shared by every page)
create table public.tap_list_extras (
  id bigserial primary key,
  list text not null check (list ~ '^[a-z][a-z_]{1,40}$'),
  item text not null check (length(trim(item)) between 1 and 80),
  created_by text,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index tap_list_extras_item on public.tap_list_extras (list, lower(trim(item)));
alter table public.tap_list_extras enable row level security;
create policy tle_agent_read on public.tap_list_extras for select to authenticated using (public.is_agent());
revoke insert, update, delete, truncate on public.tap_list_extras from anon, authenticated;
revoke usage, select, update on sequence public.tap_list_extras_id_seq from anon, authenticated;

-- ───── 4. the functions (agent only) ─────
create or replace function public.fv_today() returns text language sql stable as $$ select to_char(now() at time zone 'Pacific/Auckland', 'FMDD Mon YYYY') $$;

-- start (or find) a first visit. Made on the phone with its own id, so sending it again returns the same visit. The property: the one
-- given, if it exists; else the one already on file at the same address (the phone may have been offline when it was started, so the
-- app moves anything it holds over to that property); else a new property with the phone's id for it.
create or replace function public.agent_fv_start(p_id uuid, p_property uuid, p_address text, p_from text, p_prelisting uuid, p_started_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.first_visits; pid uuid; addr text := trim(regexp_replace(coalesce(p_address, ''), '\s+', ' ', 'g')); made boolean := false; matched boolean := false; pl public.prelistings;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if p_id is null then raise exception 'The visit needs its own key'; end if;
  select * into v from public.first_visits where id = p_id;
  if v.id is not null then return jsonb_build_object('id', v.id, 'property_id', v.property_id, 'created_property', false, 'matched', false, 'existing', true); end if;
  if coalesce(p_from, 'nothing') not in ('address', 'appointment', 'nothing') then raise exception 'Start from an address, an appointment or nothing'; end if;
  if p_prelisting is not null then
    select * into pl from public.prelistings where id = p_prelisting;
    if pl.id is null then raise exception 'That appointment was not found'; end if;
  end if;
  if p_property is not null and exists (select 1 from public.properties where id = p_property) then pid := p_property;
  else
    if pl.id is not null and pl.property_id is not null then pid := pl.property_id; matched := p_property is distinct from pid;
    else
      if length(addr) < 3 then raise exception 'Add the address'; end if;
      perform pg_advisory_xact_lock(hashtext('lw1-address:' || lower(addr)));
      select id into pid from public.properties where lower(trim(regexp_replace(address, '\s+', ' ', 'g'))) = lower(addr) order by created_at limit 1;
      if pid is not null then matched := true;
      else
        insert into public.properties (id, address) values (coalesce(p_property, gen_random_uuid()), left(addr, 300)) returning id into pid;
        made := true;
      end if;
    end if;
  end if;
  if pl.id is not null and pl.property_id is not null and pl.property_id <> pid then raise exception 'That appointment is for another property'; end if;
  insert into public.first_visits (id, property_id, started_from, prelisting_id, started_at, created_by)
  values (p_id, pid, coalesce(p_from, 'nothing'), pl.id, least(coalesce(p_started_at, now()), now()), coalesce(auth.jwt()->>'email', 'agent'))
  on conflict (id) do nothing;
  select * into v from public.first_visits where id = p_id;
  return jsonb_build_object('id', v.id, 'property_id', v.property_id, 'created_property', made, 'matched', matched, 'existing', false);
end $$;

-- the visit's own notes and "Now or come back?" (a patch: only the keys given change; a blank clears)
create or replace function public.agent_fv_set(p_id uuid, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.first_visits;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'Nothing to save'; end if;
  select * into v from public.first_visits where id = p_id for update;
  if v.id is null then raise exception 'Visit not found'; end if;
  if p_patch ? 'decision' and nullif(p_patch->>'decision', '') is not null and p_patch->>'decision' not in ('present_now', 'book') then raise exception 'Choose present now or book the presentation'; end if;
  update public.first_visits set
    notes = case when p_patch ? 'notes' then nullif(left(p_patch->>'notes', 20000), '') else notes end,
    decision = case when p_patch ? 'decision' then nullif(p_patch->>'decision', '') else decision end,
    decision_at = case when p_patch ? 'decision' then case when nullif(p_patch->>'decision', '') is null then null when (p_patch->>'decision') is distinct from decision then now() else decision_at end else decision_at end,
    next_note = case when p_patch ? 'next_note' then nullif(left(p_patch->>'next_note', 2000), '') else next_note end,
    updated_at = now()
  where id = p_id returning * into v;
  return to_jsonb(v);
end $$;

-- who's here. Every person goes to the property's people (merge_property_person, the informal 'appraisal' source: a name typed at the
-- door never replaces a checked one, two people with different emails are never merged), and LW0's trigger ties them to one person
-- record. Sent again with the same key, the same person is updated: an informal name may be corrected; a checked name, an email already
-- known, and anyone who has signed are never changed. Nothing is compulsory: with no name and no email nobody is filed yet.
create or replace function public.agent_fv_person(p_visit uuid, p_key uuid, p_name text, p_email text, p_phone text, p_owner boolean, p_decision_maker boolean, p_here boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.first_visits; x public.first_visit_people; pp public.property_people; ppid uuid; n0 int; nm text := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  em text := lower(trim(coalesce(p_email, ''))); ph text := trim(coalesce(p_phone, ''));
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if p_key is null then raise exception 'The person needs their own key'; end if;
  if length(nm) > 200 or length(em) > 200 or length(ph) > 40 then raise exception 'Too long'; end if;
  if em <> '' and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Check the email address'; end if;
  select * into v from public.first_visits where id = p_visit;
  if v.id is null then raise exception 'Visit not found'; end if;
  select * into x from public.first_visit_people where id = p_key for update;
  if x.id is not null and x.first_visit_id <> p_visit then raise exception 'That person is on another visit'; end if;
  if x.property_person_id is not null then select * into pp from public.property_people where id = x.property_person_id; end if;
  if pp.id is not null and pp.role <> 'former' and em <> '' and pp.email = ''
     and exists (select 1 from public.property_people o where o.property_id = pp.property_id and o.id <> pp.id and o.role <> 'former' and lower(o.email) = em) then
    -- the email given is already someone else's on this property: that is who this is (never two signers with one email). This visit
    -- points at them; the row typed at the door without an email, if nobody else uses it, is set aside (never deleted).
    select id into ppid from public.property_people o where o.property_id = pp.property_id and o.id <> pp.id and o.role <> 'former' and lower(o.email) = em order by position limit 1;
    if ph <> '' then update public.property_people set phone = ph where id = ppid and phone is distinct from ph; end if;
    if coalesce(pp.name_from, pp.source, '') = 'appraisal' and pp.user_id is null
       and not exists (select 1 from public.first_visit_people f where f.property_person_id = pp.id and f.id <> p_key)
       and not exists (select 1 from public.offer_signers os where os.person_id = pp.id)
       and not exists (select 1 from public.agreement_people ap join public.agreements a on a.id = ap.agreement_id where a.property_id = pp.property_id and public.norm_name(ap.legal_name) = public.norm_name(pp.legal_name)) then
      update public.property_people set role = 'former' where id = pp.id;
    end if;
  elsif pp.id is not null and pp.role <> 'former' then
    -- the same person, corrected: only what was typed informally, and never an email already known or anyone who has signed
    if not exists (select 1 from public.agreement_people ap join public.agreements a on a.id = ap.agreement_id
                    where a.property_id = pp.property_id and ap.signed_at is not null and ((pp.email <> '' and lower(ap.email) = lower(pp.email)) or public.norm_name(ap.legal_name) = public.norm_name(pp.legal_name))) then
      update public.property_people set
        legal_name = case when nm <> '' and coalesce(name_from, source, '') = 'appraisal' then nm else legal_name end,
        email = case when em <> '' and email = '' then em else email end,
        phone = case when ph <> '' then ph else phone end
      where id = pp.id and (
        (nm <> '' and coalesce(name_from, source, '') = 'appraisal' and legal_name is distinct from nm) or (em <> '' and email = '') or (ph <> '' and phone is distinct from ph));
    end if;
    ppid := pp.id;
  elsif nm <> '' or em <> '' then
    select count(*) into n0 from public.property_people where property_id = v.property_id;
    ppid := public.merge_property_person(v.property_id, nm, '', em, ph, null, 'appraisal');
    -- someone new who isn't an owner (a friend, a family member helping): in touch, not a signer
    if ppid is not null and coalesce(p_owner, true) = false and (select count(*) from public.property_people where property_id = v.property_id) > n0 then
      update public.property_people set role = 'contact' where id = ppid and role = 'owner';
    end if;
  end if;
  insert into public.first_visit_people as f (id, first_visit_id, property_person_id, contact_id, decision_maker, here)
  values (p_key, p_visit, ppid, (select contact_id from public.property_people where id = ppid), p_decision_maker, coalesce(p_here, true))
  on conflict (id) do update set property_person_id = coalesce(excluded.property_person_id, f.property_person_id),
    contact_id = case when excluded.property_person_id is not null then coalesce(excluded.contact_id, f.contact_id) else f.contact_id end,
    decision_maker = excluded.decision_maker, here = excluded.here, updated_at = now();
  select * into x from public.first_visit_people where id = p_key;
  return jsonb_build_object('key', x.id, 'property_person_id', x.property_person_id, 'contact_id', x.contact_id, 'filed', x.property_person_id is not null);
end $$;

-- one answer in the question bank: for one person at the visit (p_person, their key), or for everyone there (p_person null). A blank
-- removes it. Tim's notes, never the vendor's own words, so vendors never read them.
create or replace function public.agent_fv_answer(p_visit uuid, p_person uuid, p_question text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.first_visits; x public.first_visit_people; ref uuid;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  select * into v from public.first_visits where id = p_visit;
  if v.id is null then raise exception 'Visit not found'; end if;
  if not exists (select 1 from public.qa_questions where key = p_question and active) then raise exception 'Not a question in the bank'; end if;
  if p_value is not null and length(p_value::text) > 8000 then raise exception 'Up to 8000 characters'; end if;
  if p_person is not null then
    select * into x from public.first_visit_people where id = p_person and first_visit_id = p_visit;
    if x.id is null then raise exception 'Send the person first'; end if;
    ref := x.id;
  else ref := v.id; end if;
  perform public.qa_put(p_question, v.property_id, x.contact_id, p_value, 'first_visit', ref, false, coalesce(auth.jwt()->>'email', 'agent'));
  return jsonb_build_object('question', p_question, 'ref', ref);
end $$;

-- the visit's own entry on the profile (after the first review, 27 November 2026). Written only when it says something new; and once
-- something else was chosen for the fact after the visit first noted it (Tim on the profile or the file, his draft agreement), the visit's
-- new values only sit beside it. So a later save of an unrelated room, or a tap sent again after a lost signal, never undoes his later choice.
create or replace function public.fv_record(p_property uuid, p_key text, p_value jsonb, p_visit uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare last public.property_fact_values; first_at timestamptz; c public.property_profile; cv public.property_fact_values;
begin
  select * into last from public.property_fact_values where property_id = p_property and key = p_key and source = 'tim' and source_ref = p_visit order by recorded_at desc, id desc limit 1;
  if last.id is not null and (last.value #>> '{}') is not distinct from (p_value #>> '{}') then return last.id; end if;   -- nothing new
  select min(recorded_at) into first_at from public.property_fact_values where property_id = p_property and key = p_key and source = 'tim' and source_ref = p_visit;
  select * into c from public.property_profile where property_id = p_property and key = p_key;
  if c.property_id is not null then select * into cv from public.property_fact_values where id = c.value_id; end if;
  -- something else was chosen after the visit first noted this fact: from then on the visit's values sit beside, until Tim chooses one
  if first_at is not null and c.property_id is not null and not (cv.source = 'tim' and cv.source_ref is not distinct from p_visit) and c.chosen_at > first_at then
    return public.profile_record(p_property, p_key, p_value, 'tim', p_visit, public.fv_today(), p_name, null, null, coalesce(auth.jwt()->>'email', 'agent'), 'never');
  end if;
  return public.profile_record(p_property, p_key, p_value, 'tim', p_visit, public.fv_today(), p_name, null, null, coalesce(auth.jwt()->>'email', 'agent'), 'check');
end $$;
-- the visit's own value cleared, where it is still the chosen one (as clearing it on the property file would): the file follows, and an
-- unsigned draft agreement that still says it lets it go. Anything Tim chose since stays.
create or replace function public.fv_clear(p_property uuid, p_key text, p_visit uuid, p_name text) returns boolean
language plpgsql security definer set search_path = public as $$
declare cv public.property_fact_values; vid uuid;
begin
  select f.* into cv from public.property_profile c join public.property_fact_values f on f.id = c.value_id where c.property_id = p_property and c.key = p_key;
  if cv.id is null or cv.source <> 'tim' or cv.source_ref is distinct from p_visit or cv.value is null then return false; end if;
  perform public.profile_write_back(p_property, p_key, null);
  insert into public.property_fact_values (property_id, key, value, source, source_name, source_ref, as_of, recorded_by)
  values (p_property, p_key, null, 'tim', p_name, p_visit, public.fv_today(), coalesce(auth.jwt()->>'email', 'agent')) returning id into vid;
  update public.property_profile set value_id = vid, chosen_by = 'profile', chosen_at = clock_timestamp(), ticked = false, ticked_at = null, ticked_by = null where property_id = p_property and key = p_key;
  if p_key = any (public.desc_keys()) then
    update public.agreements a set answers = a.answers - p_key where a.property_id = p_property and a.status = 'draft' and a.signed_at is null
       and (a.answers -> p_key) is not distinct from cv.value and not exists (select 1 from public.agreement_people x where x.agreement_id = a.id and x.signed_at is not null);
  end if;
  return true;
end $$;

-- the bedroom count and the room wording, from Tim's classifications only. Written when he has called at least one room a bedroom, or
-- has made a call on every room tapped as a bedroom (so "no bedrooms" is only ever his own call); otherwise nothing is written.
create or replace function public.fv_rooms_profile(p_property uuid, p_visit uuid) returns void
language plpgsql security definer set search_path = public as $$
declare nb int; open_beds int; extras text; words text; parts text[];
begin
  select count(*) filter (where tim_class = 'bedroom'), count(*) filter (where base = 'bedroom' and tim_class is null)
    into nb, open_beds from public.property_rooms where property_id = p_property and archived_at is null;
  if nb = 0 and (open_beds > 0 or not exists (select 1 from public.property_rooms where property_id = p_property and archived_at is null and (base = 'bedroom' or tim_class is not null))) then
    -- no call stands any more (every room taken off, or his call cleared): the visit's own count and wording go, unless Tim chose since
    perform public.fv_clear(p_property, 'pBed', p_visit, 'First visit: your call on each room');
    perform public.fv_clear(p_property, 'rooms_summary', p_visit, 'First visit: your call on each room');
    return;
  end if;
  select array_agg(case when s.n > 1 then s.n || ' ' || s.pl else s.one end order by s.o) into parts
    from (select tim_class, count(*) n, min(position) o,
                 case tim_class when 'flexible' then 'flexible room' else tim_class end one,
                 case tim_class when 'flexible' then 'flexible rooms' when 'study' then 'studies' when 'office' then 'offices' when 'studio' then 'studios' else 'sleepouts' end pl
            from public.property_rooms where property_id = p_property and archived_at is null and tim_class in ('study', 'office', 'studio', 'sleepout', 'flexible')
           group by tim_class) s;
  extras := case when parts is null then null when array_length(parts, 1) = 1 then parts[1]
                 else array_to_string(parts[1:array_length(parts, 1) - 1], ', ') || ' and ' || parts[array_length(parts, 1)] end;
  words := nb || ' bedroom' || case when nb = 1 then '' else 's' end || coalesce(' plus ' || extras, '');
  perform public.fv_record(p_property, 'pBed', to_jsonb(nb::text), p_visit, 'First visit: your call on each room');
  perform public.fv_record(p_property, 'rooms_summary', to_jsonb(words), p_visit, 'First visit: your call on each room');
end $$;

-- one room, saved whole (sent again with the same id, it is updated). p_room: id, base, label, position, notes, measurements, features
-- (a list), use_now, tim_class, tim_note, vendor_view, photo_keys (the client keys of its photos), archived (true takes it off the list).
create or replace function public.agent_fv_room(p_visit uuid, p_room jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.first_visits; r public.property_rooms; rid uuid; keys uuid[]; feats jsonb; cls text;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if p_room is null or jsonb_typeof(p_room) <> 'object' then raise exception 'Nothing to save'; end if;
  select * into v from public.first_visits where id = p_visit;
  if v.id is null then raise exception 'Visit not found'; end if;
  begin rid := (p_room->>'id')::uuid; exception when others then rid := null; end;
  if rid is null then raise exception 'The room needs its own key'; end if;
  select * into r from public.property_rooms where id = rid for update;
  if r.id is not null and r.property_id <> v.property_id then raise exception 'That room is on another property'; end if;
  cls := nullif(p_room->>'tim_class', '');
  if not public.room_class_ok(cls) then raise exception 'Choose bedroom, study, office, living, studio, sleepout or flexible room'; end if;
  feats := coalesce(p_room->'features', '[]'::jsonb);
  if jsonb_typeof(feats) <> 'array' or jsonb_array_length(feats) > 100 or exists (select 1 from jsonb_array_elements(feats) e where jsonb_typeof(e) <> 'string' or length(e #>> '{}') > 80) then raise exception 'Check the features'; end if;
  begin keys := coalesce(array(select (jsonb_array_elements_text(coalesce(p_room->'photo_keys', '[]'::jsonb)))::uuid), '{}'); exception when others then raise exception 'Check the photos'; end;
  if coalesce(array_length(keys, 1), 0) > 200 then raise exception 'Up to 200 photos a room'; end if;
  insert into public.property_rooms as x (id, property_id, first_visit_id, base, label, position, notes, measurements, features, use_now, tim_class, tim_note, vendor_view, photo_keys, archived_at, created_by, updated_by)
  values (rid, v.property_id, v.id, coalesce(nullif(p_room->>'base', ''), 'other'), coalesce(nullif(left(trim(coalesce(p_room->>'label', '')), 60), ''), 'Room'),
          coalesce((p_room->>'position')::int, 0), nullif(left(p_room->>'notes', 20000), ''), nullif(left(p_room->>'measurements', 500), ''), feats,
          nullif(left(p_room->>'use_now', 500), ''), cls, nullif(left(p_room->>'tim_note', 4000), ''), nullif(left(p_room->>'vendor_view', 4000), ''), keys,
          case when coalesce((p_room->>'archived')::boolean, false) then now() end, coalesce(auth.jwt()->>'email', 'agent'), coalesce(auth.jwt()->>'email', 'agent'))
  on conflict (id) do update set base = excluded.base, label = excluded.label, position = excluded.position, notes = excluded.notes, measurements = excluded.measurements,
    features = excluded.features, use_now = excluded.use_now, tim_class = excluded.tim_class, tim_note = excluded.tim_note, vendor_view = excluded.vendor_view,
    photo_keys = excluded.photo_keys, archived_at = case when excluded.archived_at is null then null else coalesce(x.archived_at, excluded.archived_at) end,
    updated_at = now(), updated_by = excluded.updated_by;
  perform public.fv_rooms_profile(v.property_id, v.id);
  select * into r from public.property_rooms where id = rid;
  return to_jsonb(r);
end $$;

-- a fact from the tap lists, as Tim's own entry on the property profile ("First visit"): his choice, with the disclosures check's rule
-- (an official figure from a record of title or survey plan holds, with his value beside it). Bedrooms never come from here: only his
-- call on each room. A blank clears the fact only when this visit's value is the one chosen (as clearing it on the property file
-- would); otherwise nothing changes.
create or replace function public.fv_fact_keys() returns text[] language sql immutable as $$
  select array['pType', 'title_type', 'dwellings', 'living_dining', 'pBath', 'ensuites', 'toilets', 'garaging', 'parking_spaces', 'cladding', 'roofing', 'insulation',
               'flooring', 'glazing', 'levels', 'extra_spaces', 'chattels_std', 'chattels_featured', 'chattels_removed', 'outdoor', 'outlook'];
$$;
create or replace function public.agent_fv_fact(p_visit uuid, p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.first_visits; vid uuid; val jsonb := p_value; cl boolean;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if p_key = 'pBed' then raise exception 'Bedrooms come only from your call on each room'; end if;
  if not (p_key = any (public.fv_fact_keys())) then raise exception 'Not a fact the first visit records'; end if;
  if val is not null and (length(val::text) > 6000 or jsonb_typeof(val) not in ('string', 'number', 'array')) then raise exception 'Check the value'; end if;
  if val is not null and jsonb_typeof(val) = 'array' and exists (select 1 from jsonb_array_elements(val) e where jsonb_typeof(e) <> 'string' or length(e #>> '{}') > 120) then raise exception 'Check the list'; end if;
  if val is not null and jsonb_typeof(val) = 'number' then val := to_jsonb(val #>> '{}'); end if;   -- counts are kept as the file keeps them, as text
  select * into v from public.first_visits where id = p_visit;
  if v.id is null then raise exception 'Visit not found'; end if;
  perform 1 from public.properties where id = v.property_id for update;
  if public.jblank(val) or (jsonb_typeof(val) = 'array' and jsonb_array_length(val) = 0) or (jsonb_typeof(val) = 'string' and trim(val #>> '{}') = '') then
    cl := public.fv_clear(v.property_id, p_key, v.id, 'First visit');
    if p_key in ('chattels_std', 'chattels_featured', 'chattels_removed') then perform public.fv_chattels_profile(v.property_id, v.id); end if;
    return jsonb_build_object('key', p_key, 'cleared', cl);
  end if;
  vid := public.fv_record(v.property_id, p_key, val, v.id, 'First visit');
  if p_key in ('chattels_std', 'chattels_featured', 'chattels_removed') then perform public.fv_chattels_profile(v.property_id, v.id); end if;   -- one chattels list
  return jsonb_build_object('key', p_key, 'value_id', vid,
    'chosen', exists (select 1 from public.property_profile where property_id = v.property_id and key = p_key and value_id = vid));
end $$;

-- Tim adds his own item to a tap list (or takes it off again; never deleted)
create or replace function public.agent_tap_extra(p_list text, p_item text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare it text := trim(regexp_replace(coalesce(p_item, ''), '\s+', ' ', 'g')); r public.tap_list_extras;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if coalesce(p_list, '') !~ '^[a-z][a-z_]{1,40}$' then raise exception 'Not a list'; end if;
  if length(it) < 1 or length(it) > 80 then raise exception 'Add up to 80 characters'; end if;
  if coalesce(p_on, true) then
    insert into public.tap_list_extras as x (list, item, created_by) values (p_list, it, coalesce(auth.jwt()->>'email', 'agent'))
    on conflict (list, lower(trim(item))) do update set archived_at = null returning * into r;
  else
    update public.tap_list_extras set archived_at = coalesce(archived_at, now()) where list = p_list and lower(trim(item)) = lower(it) returning * into r;
  end if;
  return to_jsonb(r);
end $$;

-- ───── 4b. one chattels list (Tim, 27 November 2026) ─────
-- The chattels tapped at the first visit (standard, featured, to be removed) fill the agency agreement's chattels: the profile's
-- 'chattels' (the agreement's own chips) and 'chatOther' (everything else staying, with counts, and what goes with the vendors), as Tim's
-- own entry, and through LW0's profile_sync_draft only an unsigned draft (never one sent, parked or signed). The property file follows,
-- so an agreement started later begins with them (and later the S&P chattels). Tim's later edits on the agreement win: once he has
-- changed the chattels on a draft after the first visit noted them, the first visit's list is kept beside and changes nothing. The
-- agreement's chips come back to the first visit's lists (fv_chattels_from_agreement), with their counts kept. No loops: the first
-- visit writes the agreement only from agent_fv_fact, and the agreement writes back only when its chips say something the first
-- visit's lists don't already say.
create or replace function public.fv_chattel_map() returns jsonb language sql immutable as $$
  select '{"Fixed floor coverings":"Fixed floor coverings","Blinds":"Blinds","Curtains":"Curtains","Light fittings":"Light fittings","Stove":"Stove","Rangehood":"Rangehood","Dishwasher":"Dishwasher","Heat pumps":"Heat pump","Extractor fan":"Extractor fans","Smoke detectors":"Smoke alarms","Garage door remote":"Garage door remote","Clothesline":"Clothesline","Refrigerator":"Fridge"}'::jsonb;
$$;
-- the agreement's chips, in its own order (CHATTELS in src/app.js)
create or replace function public.fv_agreement_chattels() returns text[] language sql immutable as $$
  select array['Fixed floor coverings', 'Blinds', 'Curtains', 'Light fittings', 'Stove', 'Rangehood', 'Dishwasher', 'Heat pump', 'Extractor fans', 'Smoke alarms', 'Garage door remote', 'Clothesline', 'Fridge', 'Washing machine'];
$$;
create or replace function public.fv_chattel_name(s text) returns text language sql immutable as $$ select regexp_replace(coalesce(s, ''), ' \(\d{1,3}\)$', '') $$;
create or replace function public.fv_chattel_count(s text) returns int language sql immutable as $$ select coalesce(substring(coalesce(s, '') from ' \((\d{1,3})\)$')::int, 1) $$;
-- the first visit's three lists as the agreement says them: {"chattels": [its chips], "chatOther": "Also staying: ... Going with the vendors: ..."}
create or replace function public.fv_chattels_agreement(p_std jsonb, p_feat jsonb, p_rem jsonb) returns jsonb language plpgsql immutable as $$
declare m jsonb := public.fv_chattel_map(); stay text[] := '{}'; gone text[] := '{}'; chips text[] := '{}'; extra text[] := '{}'; x text; nm text; other text;
begin
  select coalesce(array_agg(public.fv_chattel_name(e)), '{}') into gone from jsonb_array_elements_text(case when jsonb_typeof(p_rem) = 'array' then p_rem else '[]'::jsonb end) e;
  for x in select e from jsonb_array_elements_text(case when jsonb_typeof(p_std) = 'array' then p_std else '[]'::jsonb end) e
           union all select e from jsonb_array_elements_text(case when jsonb_typeof(p_feat) = 'array' then p_feat else '[]'::jsonb end) e loop
    nm := public.fv_chattel_name(x);
    if nm = any (gone) or nm = any (stay) then continue; end if;
    stay := stay || nm;
    if m ? nm then chips := chips || (m->>nm); if public.fv_chattel_count(x) > 1 then extra := extra || x; end if;
    else extra := extra || x; end if;
  end loop;
  other := concat_ws(' ', case when array_length(extra, 1) > 0 then 'Also staying: ' || array_to_string(extra, ', ') || '.' end,
                          case when array_length(gone, 1) > 0 then 'Going with the vendors: ' || array_to_string(gone, ', ') || '.' end);
  return jsonb_build_object('chattels', to_jsonb(array(select c from unnest(public.fv_agreement_chattels()) with ordinality a(c, n) where c = any (chips) order by n)),
                            'chatOther', nullif(other, ''));
end $$;
-- the profile's chosen value for one fact, or null
create or replace function public.fv_chosen(p_property uuid, p_key text) returns public.property_fact_values language sql stable security definer set search_path = public as $$
  select f.* from public.property_profile c join public.property_fact_values f on f.id = c.value_id where c.property_id = p_property and c.key = p_key;
$$;
create or replace function public.fv_chattels_profile(p_property uuid, p_visit uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a jsonb; k text; v jsonb; cv public.property_fact_values; first_at timestamptz; vid uuid; by_ text := coalesce(auth.jwt()->>'email', 'agent');
begin
  a := public.fv_chattels_agreement((public.fv_chosen(p_property, 'chattels_std')).value, (public.fv_chosen(p_property, 'chattels_featured')).value, (public.fv_chosen(p_property, 'chattels_removed')).value);
  select min(recorded_at) into first_at from public.property_fact_values where property_id = p_property and source_ref = p_visit and key in ('chattels_std', 'chattels_featured', 'chattels_removed');
  foreach k in array array['chattels', 'chatOther'] loop
    v := a -> k; cv := public.fv_chosen(p_property, k);
    -- Tim changed the chattels on a draft agreement after the first visit noted them: his agreement wins; this list sits beside
    if cv.id is not null and cv.source = 'agreement' and cv.recorded_at > coalesce(first_at, '-infinity'::timestamptz) then
      if not public.jblank(v) then perform public.profile_record(p_property, k, v, 'tim', p_visit, public.fv_today(), 'First visit chattels', null, null, by_, 'never'); end if;
      continue;
    end if;
    if public.jblank(v) or v = '[]'::jsonb then
      -- nothing left to say: what the first visit wrote is cleared (on the profile, the file, and an unsigned draft that still says it)
      perform public.fv_clear(p_property, k, p_visit, 'First visit chattels');
      continue;
    end if;
    vid := public.fv_record(p_property, k, v, p_visit, 'First visit chattels');
    if exists (select 1 from public.property_profile where property_id = p_property and key = k and value_id = vid) then perform public.profile_sync_draft(p_property, k); end if;   -- an unsigned draft agreement only; never one sent, parked or signed
  end loop;
end $$;
-- the agreement's chips back to the first visit's lists: a draft's chattels that say something the lists don't (Tim's edit on the
-- agreement) become the lists' values from the agreement (his choice, LW0's 'agreement' rule), counts kept; items with no chip stay
create or replace function public.fv_chattels_from_agreement() returns trigger language plpgsql security definer set search_path = public as $$
declare m jsonb := public.fv_chattel_map(); inv jsonb; ach text[]; std jsonb; feat jsonb; rem jsonb; nstd jsonb := '[]'; nfeat jsonb := '[]'; x text; nm text; cnt jsonb := '{}'; c text; std_names text[];
begin
  if new.property_id is null or new.status <> 'draft' or jsonb_typeof(coalesce(new.answers, '{}'::jsonb) -> 'chattels') is distinct from 'array'
     or (new.answers -> 'chattels') is not distinct from (coalesce(old.answers, '{}'::jsonb) -> 'chattels') then return null; end if;
  begin
    std := coalesce((public.fv_chosen(new.property_id, 'chattels_std')).value, '[]'); feat := coalesce((public.fv_chosen(new.property_id, 'chattels_featured')).value, '[]');
    rem := coalesce((public.fv_chosen(new.property_id, 'chattels_removed')).value, '[]');
    if jsonb_array_length(std) + jsonb_array_length(feat) = 0 then return null; end if;   -- the first visit noted no chattels here
    select array_agg(e) into ach from jsonb_array_elements_text(new.answers -> 'chattels') e;
    if (select coalesce(array_agg(e order by e), '{}') from jsonb_array_elements_text(public.fv_chattels_agreement(std, feat, rem) -> 'chattels') e)
       = (select coalesce(array_agg(e order by e), '{}') from unnest(coalesce(ach, '{}')) e) then return null; end if;   -- already says the same: nothing to bring back
    select jsonb_object_agg(value, key) into inv from jsonb_each_text(m);
    select coalesce(array_agg(e), '{}') into std_names from jsonb_array_elements_text('["Fixed floor coverings","Blinds","Curtains","Light fittings","Stove","Rangehood","Dishwasher","Heat pumps","Extractor fan","Smoke detectors","Garage door remote"]') e;
    for x in select e from jsonb_array_elements_text(std) e union all select e from jsonb_array_elements_text(feat) e loop cnt := cnt || jsonb_build_object(public.fv_chattel_name(x), x); end loop;
    -- what has no chip on the agreement stays as it was
    for x in select e from jsonb_array_elements_text(std) e loop if not (m ? public.fv_chattel_name(x)) then nstd := nstd || to_jsonb(x); end if; end loop;
    for x in select e from jsonb_array_elements_text(feat) e loop if not (m ? public.fv_chattel_name(x)) then nfeat := nfeat || to_jsonb(x); end if; end loop;
    foreach c in array coalesce(ach, '{}') loop
      nm := coalesce(inv->>c, c);
      x := coalesce(cnt->>nm, nm);
      if nm = any (std_names) then nstd := nstd || to_jsonb(x); else nfeat := nfeat || to_jsonb(x); end if;
    end loop;
    perform public.profile_record(new.property_id, 'chattels_std', nstd, 'agreement', new.id, public.fv_today(), 'Agency agreement ' || coalesce(new.ref, ''), null, null, coalesce(auth.jwt()->>'email', 'agent'), 'agreement');
    perform public.profile_record(new.property_id, 'chattels_featured', nfeat, 'agreement', new.id, public.fv_today(), 'Agency agreement ' || coalesce(new.ref, ''), null, null, coalesce(auth.jwt()->>'email', 'agent'), 'agreement');
  exception when others then perform public.shared_note('fv_chattels_from_agreement', jsonb_build_object('agreement', new.id, 'error', sqlerrm)); end;
  return null;
end $$;
create trigger profile_fv_chattels after update of answers on public.agreements for each row execute function public.fv_chattels_from_agreement();

-- ───── 5. privileges ─────
revoke execute on function public.agent_fv_start(uuid, uuid, text, text, uuid, timestamptz), public.agent_fv_set(uuid, jsonb),
  public.agent_fv_person(uuid, uuid, text, text, text, boolean, boolean, boolean), public.agent_fv_answer(uuid, uuid, text, jsonb),
  public.agent_fv_room(uuid, jsonb), public.agent_fv_fact(uuid, text, jsonb), public.agent_tap_extra(text, text, boolean) from public, anon;
grant execute on function public.agent_fv_start(uuid, uuid, text, text, uuid, timestamptz), public.agent_fv_set(uuid, jsonb),
  public.agent_fv_person(uuid, uuid, text, text, text, boolean, boolean, boolean), public.agent_fv_answer(uuid, uuid, text, jsonb),
  public.agent_fv_room(uuid, jsonb), public.agent_fv_fact(uuid, text, jsonb), public.agent_tap_extra(text, text, boolean) to authenticated;
revoke execute on function public.fv_rooms_profile(uuid, uuid), public.fv_fact_keys(), public.fv_today(), public.room_class_ok(text) from public, anon, authenticated;
revoke execute on function public.fv_record(uuid, text, jsonb, uuid, text), public.fv_clear(uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.fv_chattel_map(), public.fv_agreement_chattels(), public.fv_chattel_name(text), public.fv_chattel_count(text), public.fv_chattels_agreement(jsonb, jsonb, jsonb),
  public.fv_chosen(uuid, text), public.fv_chattels_profile(uuid, uuid), public.fv_chattels_from_agreement() from public, anon, authenticated;

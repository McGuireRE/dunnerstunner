-- Property inspection (Tim, 18 November 2026): Tim walks round a property on his phone and notes the property facts and
-- the Vendor Declaration questions, before or after listing, with no vendor, pre-listing or agreement needed.
--   * Property facts (the description and disclosure keys) go to the property file, so the phase 1 prefill carries them into
--     Let's begin, the questionnaire and a new agreement's page 1, and into a draft agreement where it has no value yet. A value
--     that an agreement in force already holds is never overwritten: it is kept as a difference for Tim to choose.
--   * Vendor Declaration answers are Tim's notes, not the vendor's declaration. They are kept on the inspection (agent only)
--     and copied into a Vendor Declaration draft marked as noted by Tim. The vendor confirms or changes each one (recorded
--     on the server with who and when); a vendor signature is refused while any of them is unconfirmed. Nothing is signed,
--     confirmed or locked for the vendor, and only the vendors' own save, the inspection send and the prefill change what a
--     declaration says.
-- Additive, plus two replaced functions, both with Tim's review: vendor_form_save (005) now merges per key and records
-- confirmations on the server, and agreement_after (002) no longer lets a blank answer wipe a value on the property file.
-- No signed record, snapshot, fingerprint, guard_form or signature trigger is changed.

create table public.property_inspections (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  status text not null default 'in_progress' check (status in ('in_progress','finished')),
  facts jsonb not null default '{}'::jsonb,         -- description and disclosure keys, as on the property file (desc_keys, disc_keys)
  declaration jsonb not null default '{}'::jsonb,   -- Vendor Declaration keys -> {a, d}; 'tenanted' -> {a: now, will or no}
  notes jsonb not null default '{}'::jsonb,         -- one free-text note per walk-round section
  photos jsonb not null default '[]'::jsonb,        -- reserved for photos later; nothing writes it yet
  stamps jsonb not null default '{}'::jsonb,        -- 'f:key', 'd:key', 'n:key' -> when the phone recorded that answer (newest wins)
  applied jsonb not null default '{}'::jsonb,       -- key -> {v, was}: what this inspection wrote to the property file, and what was there before
  conflicts jsonb not null default '{}'::jsonb,     -- key -> {agreement_id, ref, agreement, inspection}: not written, Tim chooses
  resolved jsonb not null default '{}'::jsonb,      -- key -> {use, at}: Tim's choice on a difference
  sent_form_id uuid references public.property_forms(id),
  sent_at timestamptz,
  created_by text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index property_inspections_property_idx on public.property_inspections (property_id, started_at desc);
create trigger touch_property_inspections before update on public.property_inspections for each row execute function public.touch_updated();
alter table public.property_inspections enable row level security;
create policy pi_agent_read on public.property_inspections for select using (public.is_agent());
-- vendors have no policy at all, so they never read it; nobody writes it directly (the functions below do)
revoke all on public.property_inspections from anon;
revoke insert, update, delete, truncate on public.property_inspections from authenticated;

-- the Vendor Declaration questions (keys of FORM_TEXT.VD_SECTIONS, VD-2026-11) and the tenancy question
create or replace function public.inspection_decl_keys() returns text[] language sql immutable as $$
  select array['pegs','unpaid','history','meth','chattels','repairs','faults','era','wt','dux','asbestos','pipes','reno','consents','lim','claims','reports','hazard',
               'water','sewer','storm','power','internet','insulation','glazing','hai','burner','tenanted'];
$$;
create or replace function public.inspection_note_keys() returns text[] language sql immutable as $$
  select array['outside','structure','inside','services','history','tenancy'];
$$;
create or replace function public.jblank(v jsonb) returns boolean language sql immutable as $$
  select v is null or v = 'null'::jsonb or v = '""'::jsonb or v = '[]'::jsonb or v = '{}'::jsonb;
$$;
-- an answer's values, without any blank that would wipe a value the property file already holds
create or replace function public.pick_keep(cur jsonb, j jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(coalesce(j, '{}'::jsonb)) e
   where not (public.jblank(e.value) and not public.jblank(coalesce(cur, '{}'::jsonb) -> e.key));
$$;
-- a confirmation from the vendors is an object {by, name, at} written by vendor_form_save
create or replace function public.is_confirmed(chk jsonb, k text) returns boolean language sql immutable as $$
  select coalesce(jsonb_typeof(coalesce(chk, '{}'::jsonb) -> k) = 'object', false);
$$;
-- a phone's timestamp for an answer, or null if it isn't one
create or replace function public.stamp_ts(t text) returns timestamptz language plpgsql immutable as $$
begin
  if t is null or t !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' then return null; end if;
  return t::timestamptz;
exception when others then return null;
end $$;

-- Phase 1's agreement_after (migration 002), unchanged except that a blank answer on a draft agreement ("", [] or null) no
-- longer wipes a value the property file already holds (for example one noted at an inspection).
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
end $$;

-- start an inspection: on an existing property, or on a new property file from an address alone (stage Appraisal, nobody on it,
-- nothing sent). An unfinished inspection on the property is carried on instead of starting a second.
create or replace function public.agent_inspection_start(p_property uuid, p_address text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pid uuid := p_property; addr text := trim(regexp_replace(coalesce(p_address, ''), '\s+', ' ', 'g')); iid uuid; made boolean := false; cyc timestamptz;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if pid is null then
    if length(addr) < 3 then raise exception 'Add the address'; end if;
    if exists (select 1 from public.properties where lower(trim(regexp_replace(address, '\s+', ' ', 'g'))) = lower(addr)) then
      raise exception 'That address is already on file. Choose it from the list';
    end if;
    insert into public.properties (address) values (addr) returning id into pid;
    made := true;
  elsif not exists (select 1 from public.properties where id = pid) then
    raise exception 'Property not found';
  end if;
  select cycle_at into cyc from public.properties where id = pid;
  select id into iid from public.property_inspections
   where property_id = pid and status = 'in_progress' and started_at >= coalesce(cyc, '-infinity'::timestamptz)
   order by started_at desc limit 1;
  if iid is not null then return jsonb_build_object('inspection_id', iid, 'property_id', pid, 'created_property', made, 'resumed', true); end if;
  insert into public.property_inspections (property_id, created_by) values (pid, coalesce(auth.jwt()->>'email', 'agent')) returning id into iid;
  return jsonb_build_object('inspection_id', iid, 'property_id', pid, 'created_property', made, 'resumed', false);
end $$;

-- save what was tapped. Each of p_facts, p_decl and p_notes is a patch: a key with a blank value clears it. p_stamps gives the
-- phone's time for each answer ('f:pBed', 'd:pegs', 'n:outside'); an answer older than the one already saved is skipped, and
-- returned with the saved value so the phone can show it. A refused answer is named in the error ("Not saved (d:pegs): ...") so
-- the phone can drop only that one. Facts are written to the property file at once, and into a draft agreement that has no value
-- for them, unless the newest agreement in force holds a different value: then it is kept as a difference.
create or replace function public.agent_inspection_save(iid uuid, p_facts jsonb, p_decl jsonb, p_notes jsonb, p_stamps jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  i public.property_inspections; pr public.properties; ag public.agreements;
  k text; v jsonb; tgt text; cur jsonb; was jsonb; dsc jsonb; dis jsonb; sk text; ts timestamptz; old_ts timestamptz;
  skipped jsonb := '{}'::jsonb; draft jsonb := '{}'::jsonb; draft_ok boolean := false;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  select * into i from public.property_inspections where id = iid for update;
  if not found then raise exception 'Inspection not found'; end if;
  if (p_facts is not null and jsonb_typeof(p_facts) <> 'object') or (p_decl is not null and jsonb_typeof(p_decl) <> 'object')
     or (p_notes is not null and jsonb_typeof(p_notes) <> 'object') or (p_stamps is not null and jsonb_typeof(p_stamps) <> 'object') then raise exception 'Bad answers'; end if;
  if length(coalesce(p_facts, '{}')::text) + length(coalesce(p_decl, '{}')::text) + length(coalesce(p_notes, '{}')::text) > 60000 then raise exception 'Too much to save at once'; end if;

  for k, v in select * from jsonb_each(coalesce(p_notes, '{}'::jsonb)) loop
    sk := 'n:' || k;
    if not (k = any (public.inspection_note_keys())) then raise exception 'Not saved (%): unknown section', sk; end if;
    ts := public.stamp_ts(p_stamps->>sk); old_ts := public.stamp_ts(i.stamps->>sk);
    if ts is not null and old_ts is not null and old_ts > ts then skipped := skipped || jsonb_build_object(sk, coalesce(i.notes->k, 'null'::jsonb)); continue; end if;
    i.stamps := i.stamps || jsonb_build_object(sk, coalesce(ts, clock_timestamp()));
    if public.jblank(v) then i.notes := i.notes - k;
    elsif jsonb_typeof(v) <> 'string' or length(v #>> '{}') > 4000 then raise exception 'Not saved (%): a note can be up to 4000 characters', sk;
    else i.notes := i.notes || jsonb_build_object(k, v); end if;
  end loop;

  for k, v in select * from jsonb_each(coalesce(p_decl, '{}'::jsonb)) loop
    sk := 'd:' || k;
    if not (k = any (public.inspection_decl_keys())) then raise exception 'Not saved (%): unknown question', sk; end if;
    ts := public.stamp_ts(p_stamps->>sk); old_ts := public.stamp_ts(i.stamps->>sk);
    if ts is not null and old_ts is not null and old_ts > ts then skipped := skipped || jsonb_build_object(sk, coalesce(i.declaration->k, 'null'::jsonb)); continue; end if;
    if public.jblank(v) or (jsonb_typeof(v) = 'object' and public.jblank(v->'a') and public.jblank(v->'d')) then
      i.declaration := i.declaration - k; i.stamps := i.stamps || jsonb_build_object(sk, coalesce(ts, clock_timestamp())); continue;
    end if;
    if jsonb_typeof(v) <> 'object' then raise exception 'Not saved (%): not an answer', sk; end if;
    if k = 'tenanted' then
      if coalesce(v->>'a', '') not in ('now','will','no') then raise exception 'Not saved (%): not one of the choices', sk; end if;
      i.declaration := i.declaration || jsonb_build_object(k, jsonb_build_object('a', v->>'a'));
    else
      if not public.jblank(v->'a') and coalesce(v->>'a', '') not in ('yes','no','unknown') then raise exception 'Not saved (%): not one of the choices', sk; end if;
      if length(coalesce(v->>'d', '')) > 4000 then raise exception 'Not saved (%): details can be up to 4000 characters', sk; end if;
      i.declaration := i.declaration || jsonb_build_object(k, jsonb_strip_nulls(jsonb_build_object('a', nullif(v->>'a', ''), 'd', coalesce(v->>'d', ''))));
    end if;
    i.stamps := i.stamps || jsonb_build_object(sk, coalesce(ts, clock_timestamp()));
  end loop;

  if p_facts is not null and p_facts <> '{}'::jsonb then
    select * into pr from public.properties where id = i.property_id for update;
    select * into ag from public.agreements where property_id = i.property_id and status not in ('ended','cancelled') order by created_at desc limit 1;
    draft_ok := ag.id is not null and ag.status = 'draft' and not exists (select 1 from public.agreement_people where agreement_id = ag.id and signed_at is not null);
    dsc := pr.description; dis := pr.disclosures;
    for k, v in select * from jsonb_each(p_facts) loop
      sk := 'f:' || k;
      if not (k = any (public.desc_keys() || public.disc_keys())) then raise exception 'Not saved (%): unknown property detail', sk; end if;
      if not public.jblank(v) and not (jsonb_typeof(v) = 'string' and length(v #>> '{}') <= 4000)
         and not (jsonb_typeof(v) = 'array' and jsonb_array_length(v) <= 40 and not exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'string')) then
        raise exception 'Not saved (%): not a property detail', sk;
      end if;
      ts := public.stamp_ts(p_stamps->>sk); old_ts := public.stamp_ts(i.stamps->>sk);
      if ts is not null and old_ts is not null and old_ts > ts then skipped := skipped || jsonb_build_object(sk, coalesce(i.facts->k, 'null'::jsonb)); continue; end if;
      i.stamps := i.stamps || jsonb_build_object(sk, coalesce(ts, clock_timestamp()));
      tgt := case when k = any (public.desc_keys()) then 'description' else 'disclosures' end;
      cur := case when tgt = 'description' then dsc -> k else dis -> k end;
      if public.jblank(v) then
        -- cleared: take back only what this inspection put there
        if i.applied ? k and cur is not distinct from (i.applied -> k -> 'v') then
          was := i.applied -> k -> 'was';
          if tgt = 'description' then dsc := case when public.jblank(was) then dsc - k else dsc || jsonb_build_object(k, was) end;
          else dis := case when public.jblank(was) then dis - k else dis || jsonb_build_object(k, was) end; end if;
        end if;
        i.facts := i.facts - k; i.conflicts := i.conflicts - k; i.applied := i.applied - k; i.resolved := i.resolved - k;
        continue;
      end if;
      i.facts := i.facts || jsonb_build_object(k, v);
      i.resolved := i.resolved - k;
      if ag.id is not null and not public.jblank(ag.answers -> k) and (ag.answers -> k) is distinct from v then
        i.conflicts := i.conflicts || jsonb_build_object(k, jsonb_build_object('agreement_id', ag.id, 'ref', ag.ref, 'agreement', ag.answers -> k, 'inspection', v));
        continue;
      end if;
      i.conflicts := i.conflicts - k;
      was := case when i.applied ? k then i.applied -> k -> 'was' else coalesce(cur, 'null'::jsonb) end;
      i.applied := i.applied || jsonb_build_object(k, jsonb_build_object('v', v, 'was', was));
      if tgt = 'description' then dsc := dsc || jsonb_build_object(k, v); else dis := dis || jsonb_build_object(k, v); end if;
      if draft_ok and (ag.answers -> k) is distinct from v then draft := draft || jsonb_build_object(k, v); end if;   -- the draft had no value for it
    end loop;
    if dsc is distinct from pr.description or dis is distinct from pr.disclosures then
      update public.properties set description = dsc, disclosures = dis where id = pr.id;
    end if;
    if draft <> '{}'::jsonb then
      update public.agreements set answers = answers || draft where id = ag.id;
      perform public.log_event(ag.id, coalesce(auth.jwt()->>'email', 'agent'), 'inspection_applied', jsonb_build_object('keys', (select jsonb_agg(x) from jsonb_object_keys(draft) x)));
    end if;
  end if;

  update public.property_inspections set facts = i.facts, declaration = i.declaration, notes = i.notes, applied = i.applied,
         conflicts = i.conflicts, resolved = i.resolved, stamps = i.stamps where id = iid;
  return jsonb_build_object('conflicts', i.conflicts, 'resolved', i.resolved, 'skipped', skipped);
end $$;

-- Tim chooses on a difference with an agreement in force. 'inspection' writes his value to the property file, and to the agreement
-- only while it is a draft nobody has signed. A sent or parked agreement is left alone (the vendors may be reading it): the result
-- says so, and Tim recalls it or raises the change with them. A signed agreement always keeps what was signed.
create or replace function public.agent_inspection_resolve(iid uuid, p_key text, p_use text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i public.property_inspections; pr public.properties; c jsonb; v jsonb; tgt text; cur jsonb; ag public.agreements; upd boolean := false;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if p_use not in ('inspection','agreement') then raise exception 'Choose which to keep'; end if;
  select * into i from public.property_inspections where id = iid for update;
  if not found then raise exception 'Inspection not found'; end if;
  c := i.conflicts -> p_key;
  if c is null then raise exception 'Nothing to choose here'; end if;
  select * into ag from public.agreements where id = (c->>'agreement_id')::uuid;
  if p_use = 'inspection' then
    v := i.facts -> p_key;
    select * into pr from public.properties where id = i.property_id for update;
    tgt := case when p_key = any (public.desc_keys()) then 'description' else 'disclosures' end;
    cur := case when tgt = 'description' then pr.description -> p_key else pr.disclosures -> p_key end;
    if tgt = 'description' then update public.properties set description = description || jsonb_build_object(p_key, v) where id = pr.id;
    else update public.properties set disclosures = disclosures || jsonb_build_object(p_key, v) where id = pr.id; end if;
    i.applied := i.applied || jsonb_build_object(p_key, jsonb_build_object('v', v, 'was', coalesce(cur, 'null'::jsonb)));
    if ag.status = 'draft' and not exists (select 1 from public.agreement_people where agreement_id = ag.id and signed_at is not null) then
      update public.agreements set answers = answers || jsonb_build_object(p_key, v) where id = ag.id;
      upd := true;
      perform public.log_event(ag.id, coalesce(auth.jwt()->>'email', 'agent'), 'inspection_applied', jsonb_build_object('key', p_key));
    end if;
  end if;
  update public.property_inspections set conflicts = conflicts - p_key, applied = i.applied,
         resolved = resolved || jsonb_build_object(p_key, jsonb_build_object('use', p_use, 'at', now())) where id = iid;
  return jsonb_build_object('agreement_updated', upd, 'agreement_status', ag.status, 'ref', ag.ref);
end $$;

create or replace function public.agent_inspection_finish(iid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  update public.property_inspections set status = 'finished', finished_at = coalesce(finished_at, now()) where id = iid;
  if not found then raise exception 'Inspection not found'; end if;
end $$;

-- Merge an inspection's declaration answers into a Vendor Declaration's data. A question is filled only when the vendor hasn't
-- answered it, or when it still holds Tim's earlier unconfirmed note. A vendor's own answer (typed, chosen or confirmed) is never
-- replaced: a different one is listed in "kept" for Tim to see. Tim's notes are marked pre = 'inspection', and the vendors'
-- confirmation (checked) is cleared for anything that changed.
create or replace function public.inspection_merge_decl(d jsonb, i public.property_inspections) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  ans jsonb := coalesce(d->'answers', '{}'::jsonb); pre jsonb := coalesce(d->'pre', '{}'::jsonb); chk jsonb := coalesce(d->'checked', '{}'::jsonb);
  k text; v jsonb; cur jsonb; tims boolean; added int := 0; updated int := 0; kept jsonb := '[]'::jsonb;
begin
  d := coalesce(d, '{}'::jsonb);
  if jsonb_typeof(d) <> 'object' then d := '{}'::jsonb; end if;
  if jsonb_typeof(ans) <> 'object' then ans := '{}'::jsonb; end if;
  if jsonb_typeof(pre) <> 'object' then pre := '{}'::jsonb; end if;
  if jsonb_typeof(chk) <> 'object' then chk := '{}'::jsonb; end if;
  -- Tim's earlier unconfirmed notes that are no longer in the inspection are taken back
  for k in select key from jsonb_each_text(pre) where value = 'inspection' loop
    if not (i.declaration ? k) and not public.is_confirmed(chk, k) then
      if k = 'tenanted' then d := d - 'tenanted'; else ans := ans - k; end if;
      pre := pre - k;
    end if;
  end loop;
  for k, v in select * from jsonb_each(i.declaration) loop
    cur := case when k = 'tenanted' then d->'tenanted' else ans->k end;
    tims := pre->>k = 'inspection' and not public.is_confirmed(chk, k);
    if k = 'tenanted' then
      if public.jblank(cur) or tims then
        if public.jblank(cur) then added := added + 1; elsif cur is distinct from (v->'a') then updated := updated + 1; end if;
        d := d || jsonb_build_object('tenanted', v->'a'); pre := pre || jsonb_build_object(k, 'inspection'); chk := chk - k;
      elsif cur is distinct from (v->'a') then kept := kept || jsonb_build_array(jsonb_build_object('k', k, 'vendor', jsonb_build_object('a', cur), 'inspection', v));
      end if;
    else
      if public.jblank(cur) or (public.jblank(cur->'a') and coalesce(cur->>'d', '') = '') or tims then
        if public.jblank(cur) or (public.jblank(cur->'a') and coalesce(cur->>'d', '') = '') then added := added + 1; elsif cur is distinct from v then updated := updated + 1; end if;
        ans := ans || jsonb_build_object(k, v); pre := pre || jsonb_build_object(k, 'inspection'); chk := chk - k;
      elsif coalesce(cur->>'a', '') is distinct from coalesce(v->>'a', '') or coalesce(cur->>'d', '') is distinct from coalesce(v->>'d', '') then
        kept := kept || jsonb_build_array(jsonb_build_object('k', k, 'vendor', cur, 'inspection', v));
      end if;
    end if;
  end loop;
  d := d || jsonb_build_object('answers', ans, 'pre', pre, 'checked', chk,
         'insp', jsonb_build_object('id', i.id, 'on', to_char((i.started_at at time zone 'Pacific/Auckland')::date, 'YYYY-MM-DD'), 'by', 'Tim McGuire'));
  if added + updated > 0 then d := d || jsonb_build_object('complete', false); end if;
  return jsonb_build_object('data', d, 'added', added, 'updated', updated, 'kept', kept);
end $$;

-- The declaration notes of this round of owners, across all of the property's inspections: for each question the newest answer
-- wins (by the phone's time, else when the inspection was saved), and a question cleared most recently stays cleared. The row
-- returned is the newest inspection, with that merged declaration.
create or replace function public.latest_inspection(pid uuid) returns public.property_inspections
language plpgsql stable security definer set search_path = public as $$
declare r public.property_inspections; m jsonb;
begin
  select pi.* into r from public.property_inspections pi join public.properties p on p.id = pi.property_id
   where pi.property_id = pid and pi.started_at >= coalesce(p.cycle_at, '-infinity'::timestamptz)
   order by coalesce(pi.finished_at, pi.updated_at) desc, pi.started_at desc limit 1;
  if r.id is null then return r; end if;
  select coalesce(jsonb_object_agg(y.key, y.val) filter (where not public.jblank(y.val)), '{}'::jsonb) into m from (
    select distinct on (x.key) x.key, x.val from (
      select k.key, pi.declaration -> k.key as val, coalesce(public.stamp_ts(pi.stamps ->> ('d:' || k.key)), pi.updated_at) as t
        from public.property_inspections pi join public.properties p on p.id = pi.property_id,
        lateral (select jsonb_object_keys(pi.declaration) as key union select substr(s, 3) from jsonb_object_keys(pi.stamps) s where s like 'd:%') k
       where pi.property_id = pid and pi.started_at >= coalesce(p.cycle_at, '-infinity'::timestamptz)
    ) x order by x.key, x.t desc) y;
  r.declaration := m;
  return r;
end $$;

-- A Vendor Declaration started by the vendors (vendor_form_start) opens with Tim's inspection notes filled in and marked.
create or replace function public.inspection_prefill_form() returns trigger language plpgsql security definer set search_path = public as $$
declare i public.property_inspections;
begin
  if new.kind <> 'vendor_declaration' or coalesce(new.data, '{}'::jsonb) ? 'insp' then return new; end if;
  i := public.latest_inspection(new.property_id);
  if i.id is null or i.declaration = '{}'::jsonb then return new; end if;
  new.data := (public.inspection_merge_decl(coalesce(new.data, '{}'::jsonb), i)) -> 'data';
  return new;
end $$;
create trigger inspection_prefill_form before insert on public.property_forms for each row execute function public.inspection_prefill_form();

-- The Vendor Declaration is the vendors' own statement. A direct write by a signed-in user (Tim included, through his agent
-- policy) can't add one with any answers, change what one says, or remove one: only vendor_form_save, agent_inspection_send and
-- the prefill above change it, and each checks who is asking. Healthy Homes forms (Tim's agent_data) are not affected.
-- Whatever the path, an answer that changes other than by the vendors' own save loses its confirmation.
-- Not security definer: it needs to see who is really writing.
create or replace function public.guard_form_checks() returns trigger language plpgsql set search_path = public as $$
declare direct boolean := current_user in ('authenticated', 'anon'); oa jsonb; na jsonb; chk jsonb; k text;
begin
  if tg_op = 'DELETE' then
    if old.kind = 'vendor_declaration' and direct then raise exception 'The Vendor Declaration is the vendors'' own record, so it can''t be removed here'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and direct and new.kind is distinct from old.kind and 'vendor_declaration' in (new.kind, old.kind) then
    raise exception 'Only the vendors fill in their declaration';
  end if;
  if new.kind <> 'vendor_declaration' then return new; end if;
  if direct and ((tg_op = 'INSERT' and not public.jblank(new.data)) or (tg_op = 'UPDATE' and new.data is distinct from old.data)) then
    raise exception 'Only the vendors fill in their declaration';
  end if;
  if tg_op = 'UPDATE' and coalesce(current_setting('app.vendor_form_save', true), '') <> new.id::text then
    oa := coalesce(old.data->'answers', '{}'::jsonb); na := coalesce(new.data->'answers', '{}'::jsonb); chk := coalesce(new.data->'checked', '{}'::jsonb);
    if jsonb_typeof(oa) <> 'object' then oa := '{}'::jsonb; end if;
    if jsonb_typeof(na) <> 'object' then na := '{}'::jsonb; end if;
    if jsonb_typeof(chk) = 'object' then
      for k in select key from jsonb_object_keys(chk) key loop
        if (k = 'tenanted' and (new.data->'tenanted') is distinct from (old.data->'tenanted')) or (k <> 'tenanted' and (na->k) is distinct from (oa->k)) then chk := chk - k; end if;
      end loop;
      if chk is distinct from new.data->'checked' then new.data := jsonb_set(new.data, '{checked}', chk); end if;
    end if;
  end if;
  return new;
end $$;
create trigger guard_form_checks before insert or update or delete on public.property_forms for each row execute function public.guard_form_checks();

-- The vendors' save (replaces migration 005's, which wrote data || patch). Merged key by key on the server:
--   answers: each question sent replaces that question only; tenanted, facts, fileOk, fileChanges, notes, hh, _step, complete and
--   fromFile (the vendor's own fields) are taken as sent; checked is a list of yes or no per question, and a confirmation is
--   recorded here as {by, name, at} for the vendor signed in, only for Tim's notes (never trusted from the page); pre and insp are
--   never taken from the page; nothing the page didn't send is removed. A vendor changing one of Tim's notes has confirmed it.
create or replace function public.vendor_form_save(f uuid, patch jsonb) returns void language plpgsql security definer set search_path = public as $$
declare fm public.property_forms; me public.agreement_people; d jsonb; ans jsonb; pre jsonb; chk jsonb; k text; v jsonb; mine jsonb;
begin
  select * into fm from public.property_forms where id = f for update;
  if fm.id is null or not public.is_party(fm.agreement_id) then raise exception 'Not found'; end if;
  if fm.kind <> 'vendor_declaration' then raise exception 'Tim fills in this one'; end if;
  if fm.status <> 'draft' then raise exception 'This document can no longer be changed'; end if;
  if jsonb_typeof(patch) <> 'object' or length(patch::text) > 60000 then raise exception 'Too much to save at once'; end if;
  select * into me from public.agreement_people where agreement_id = fm.agreement_id and user_id = auth.uid() order by position limit 1;
  if me.id is null then raise exception 'Not found'; end if;
  d := coalesce(fm.data, '{}'::jsonb); ans := coalesce(d->'answers', '{}'::jsonb); pre := coalesce(d->'pre', '{}'::jsonb); chk := coalesce(d->'checked', '{}'::jsonb);
  if jsonb_typeof(ans) <> 'object' then ans := '{}'::jsonb; end if;
  if jsonb_typeof(pre) <> 'object' then pre := '{}'::jsonb; end if;
  if jsonb_typeof(chk) <> 'object' then chk := '{}'::jsonb; end if;
  mine := jsonb_build_object('by', me.id, 'name', me.legal_name, 'at', now());
  if jsonb_typeof(patch->'answers') = 'object' then
    for k, v in select * from jsonb_each(patch->'answers') loop
      if jsonb_typeof(v) <> 'object' then raise exception 'Not an answer'; end if;
      if pre->>k = 'inspection' and (ans->k) is distinct from v and not public.is_confirmed(chk, k) then chk := chk || jsonb_build_object(k, mine); end if;
      ans := ans || jsonb_build_object(k, v);
    end loop;
  end if;
  if patch ? 'tenanted' and pre->>'tenanted' = 'inspection' and (d->'tenanted') is distinct from (patch->'tenanted') and not public.is_confirmed(chk, 'tenanted') then
    chk := chk || jsonb_build_object('tenanted', mine);
  end if;
  if jsonb_typeof(patch->'checked') = 'object' then
    for k, v in select * from jsonb_each(patch->'checked') loop
      if coalesce(pre->>k, '') <> 'inspection' then continue; end if;
      if v = 'true'::jsonb then if not public.is_confirmed(chk, k) then chk := chk || jsonb_build_object(k, mine); end if;
      elsif v = 'false'::jsonb then chk := chk - k; end if;
    end loop;
  end if;
  d := d || (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(patch) e
              where e.key in ('tenanted','facts','fileOk','fileChanges','notes','hh','_step','complete','fromFile'))
         || jsonb_build_object('answers', ans, 'checked', chk);
  perform set_config('app.vendor_form_save', f::text, true);
  update public.property_forms set data = d where id = f;
  perform set_config('app.vendor_form_save', '', true);
end $$;

-- A vendor can't sign the declaration while any of Tim's notes is unconfirmed (on their own phone or in person on Tim's).
create or replace function public.form_sign_needs_checks() returns trigger language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  if new.signer_role <> 'client' then return new; end if;
  select data into d from public.property_forms where id = new.form_id;
  if jsonb_typeof(d->'pre') = 'object' and exists (select 1 from jsonb_each_text(d->'pre') e where e.value = 'inspection' and not public.is_confirmed(d->'checked', e.key)) then
    raise exception 'Please check each answer Tim noted at the inspection before signing';
  end if;
  return new;
end $$;
create trigger form_sign_needs_checks before insert on public.form_signatures for each row execute function public.form_sign_needs_checks();

-- After listing: send Tim's notes (all of this round's inspections, newest answer per question) to the vendors to check and sign.
-- Starts the declaration on the agreement in force, or adds to a draft that nobody has signed. A signed declaration can't change
-- (guard_form would refuse too).
create or replace function public.agent_inspection_send(iid uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare i public.property_inspections; li public.property_inspections; ag public.agreements; fm public.property_forms; m jsonb; made boolean := false;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  select * into i from public.property_inspections where id = iid for update;
  if not found then raise exception 'Inspection not found'; end if;
  li := public.latest_inspection(i.property_id);
  if li.id is null or li.declaration = '{}'::jsonb then raise exception 'There are no Vendor Declaration answers to send'; end if;
  select * into ag from public.agreements where property_id = i.property_id and status in ('signed','countersigned') order by created_at desc limit 1;
  if ag.id is null then raise exception 'The agreement has to be signed first'; end if;
  select * into fm from public.property_forms where agreement_id = ag.id and kind = 'vendor_declaration' for update;
  if fm.id is not null and (fm.status <> 'draft' or exists (select 1 from public.form_signatures where form_id = fm.id)) then
    raise exception 'The Vendor Declaration has been signed, so the inspection can''t change it';
  end if;
  m := public.inspection_merge_decl(coalesce(fm.data, '{}'::jsonb), li);
  if fm.id is null then
    insert into public.property_forms (property_id, agreement_id, kind, form_version, created_by, data)
    values (ag.property_id, ag.id, 'vendor_declaration', public.form_version('vendor_declaration'), coalesce(auth.jwt()->>'email', 'agent'), m->'data')
    returning * into fm;
    made := true;
    perform public.log_event(ag.id, coalesce(auth.jwt()->>'email', 'agent'), 'form_started', jsonb_build_object('form', 'vendor_declaration', 'via', 'inspection'));
  else
    update public.property_forms set data = m->'data' where id = fm.id;
  end if;
  update public.property_inspections set sent_form_id = fm.id, sent_at = now() where id = iid;
  perform public.log_event(ag.id, coalesce(auth.jwt()->>'email', 'agent'), 'inspection_sent', jsonb_build_object('added', m->'added', 'updated', m->'updated', 'kept', jsonb_array_length(m->'kept')));
  return jsonb_build_object('form_id', fm.id, 'agreement_id', ag.id, 'created', made, 'added', m->'added', 'updated', m->'updated', 'kept', m->'kept');
end $$;

revoke execute on function public.agent_inspection_start(uuid, text), public.agent_inspection_save(uuid, jsonb, jsonb, jsonb, jsonb),
  public.agent_inspection_resolve(uuid, text, text), public.agent_inspection_finish(uuid), public.agent_inspection_send(uuid) from public, anon;
grant execute on function public.agent_inspection_start(uuid, text), public.agent_inspection_save(uuid, jsonb, jsonb, jsonb, jsonb),
  public.agent_inspection_resolve(uuid, text, text), public.agent_inspection_finish(uuid), public.agent_inspection_send(uuid) to authenticated;
revoke execute on function public.inspection_merge_decl(jsonb, public.property_inspections), public.latest_inspection(uuid),
  public.inspection_prefill_form(), public.guard_form_checks(), public.form_sign_needs_checks() from public, anon, authenticated;
revoke execute on function public.jblank(jsonb), public.inspection_decl_keys(), public.inspection_note_keys(), public.pick_keep(jsonb, jsonb),
  public.is_confirmed(jsonb, text), public.stamp_ts(text) from public, anon;
-- vendor_form_save keeps migration 005's grants (create or replace leaves them as they were)

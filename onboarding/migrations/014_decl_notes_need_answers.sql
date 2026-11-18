-- 014: Tim's inspection notes need real answers (review of the inspection fixes, 18 November 2026). Additive: two new helper
-- functions and three replaced ones (create or replace, grants kept); no table, column, row, trigger or signature changes.
--   * vendor_form_save: a check or change of one of Tim's notes is refused when the answer saved has no choice (blank a for a
--     Yes / No / Unknown question, blank d for a description question, no tenancy choice), so a page that sends a note back
--     unanswered can't count as the vendor having dealt with it. Unknown is a choice. Otherwise identical to the live one (012).
--   * form_sign_needs_checks: a vendor can't sign while any of Tim's notes has no answer. Otherwise identical (012).
--   * agent_inspection_save: "no hazards" (a cleared hazards or hazOther) while the agreement in force lists some is kept as a
--     difference for Tim ("Keep the agreement's" / "Use mine"), as a different value already is. Otherwise identical (012).
-- Not applied yet: needs Tim's OK. Tested in a rollback block (tests/decl-notes-rollback.sql via decl-notes-rollback.py).

-- the description questions of the Vendor Declaration (FORM_TEXT VD_SECTIONS, text: 1), stored as {d}
create or replace function public.decl_text_keys() returns text[] language sql immutable as $$
  select array['faults','reno','internet','insulation','glazing'];
$$;
-- an answer with a choice: tenancy now / will / no; a description with text; otherwise Yes, No or Unknown
create or replace function public.decl_has_answer(k text, v jsonb) returns boolean language sql immutable as $$
  select case when k = 'tenanted' then coalesce(case when jsonb_typeof(v) = 'string' then v #>> '{}' end, '') in ('now','will','no')
              when k = any (public.decl_text_keys()) then jsonb_typeof(v) = 'object' and coalesce(btrim(v->>'d'), '') <> ''
              else jsonb_typeof(v) = 'object' and coalesce(v->>'a', '') in ('yes','no','unknown') end;
$$;

create or replace function public.vendor_form_save(f uuid, patch jsonb) returns void language plpgsql security definer set search_path = public as $$
declare fm public.property_forms; me public.agreement_people; d jsonb; ans jsonb; pre jsonb; chk jsonb; nt jsonb; k text; v jsonb; mine jsonb; ten jsonb;
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
  nt := coalesce(d->'noted', '{}'::jsonb); if jsonb_typeof(nt) <> 'object' then nt := '{}'::jsonb; end if;
  mine := jsonb_build_object('by', me.id, 'name', me.legal_name, 'at', now());
  if jsonb_typeof(patch->'answers') = 'object' then
    for k, v in select * from jsonb_each(patch->'answers') loop
      if jsonb_typeof(v) <> 'object' then raise exception 'Not an answer'; end if;
      if pre->>k = 'inspection' and not public.decl_same(ans->k, v) then
        if not public.decl_has_answer(k, v) then raise exception 'Please choose an answer for each question Tim noted at the inspection'; end if;
        chk := chk || jsonb_build_object(k, mine || jsonb_build_object('changed', nt ? k and not public.decl_same(nt->k, v)));
      end if;
      ans := ans || jsonb_build_object(k, v);
    end loop;
  end if;
  ten := case when patch ? 'tenanted' then patch->'tenanted' else d->'tenanted' end;
  if patch ? 'tenanted' and pre->>'tenanted' = 'inspection' and not public.decl_same(d->'tenanted', patch->'tenanted') then
    if not public.decl_has_answer('tenanted', ten) then raise exception 'Please choose an answer for each question Tim noted at the inspection'; end if;
    chk := chk || jsonb_build_object('tenanted', mine || jsonb_build_object('changed', nt ? 'tenanted' and not public.decl_same(nt->'tenanted', ten)));
  end if;
  if jsonb_typeof(patch->'checked') = 'object' then
    for k, v in select * from jsonb_each(patch->'checked') loop
      if coalesce(pre->>k, '') <> 'inspection' then continue; end if;
      if v = 'true'::jsonb then
        if not public.is_confirmed(chk, k) then
          if not public.decl_has_answer(k, case when k = 'tenanted' then ten else ans->k end) then raise exception 'Please choose an answer for each question Tim noted at the inspection'; end if;
          chk := chk || jsonb_build_object(k, mine || jsonb_build_object('changed', nt ? k and not public.decl_same(nt->k, case when k = 'tenanted' then ten else ans->k end)));
        end if;
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

create or replace function public.form_sign_needs_checks() returns trigger language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  if new.signer_role <> 'client' then return new; end if;
  select data into d from public.property_forms where id = new.form_id;
  if jsonb_typeof(d->'pre') = 'object' and exists (select 1 from jsonb_each_text(d->'pre') e where e.value = 'inspection' and not public.is_confirmed(d->'checked', e.key)) then
    raise exception 'Please check each answer Tim noted at the inspection before signing';
  end if;
  if jsonb_typeof(d->'pre') = 'object' and exists (select 1 from jsonb_each_text(d->'pre') e where e.value = 'inspection'
       and not public.decl_has_answer(e.key, case when e.key = 'tenanted' then d->'tenanted' else d->'answers'->e.key end)) then
    raise exception 'Please answer each question Tim noted at the inspection before signing';
  end if;
  return new;
end $$;

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
        -- 014: "no hazards" noted while the agreement in force lists some is a difference for Tim to choose, not a silent clear
        if k in ('hazards', 'hazOther') and ag.id is not null and not public.jblank(ag.answers -> k) and (ag.answers -> k) is distinct from (i.applied -> k -> 'v') then
          i.facts := i.facts || jsonb_build_object(k, v); i.applied := i.applied - k; i.resolved := i.resolved - k;
          i.conflicts := i.conflicts || jsonb_build_object(k, jsonb_build_object('agreement_id', ag.id, 'ref', ag.ref, 'agreement', ag.answers -> k, 'inspection', v));
          continue;
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

revoke execute on function public.decl_text_keys(), public.decl_has_answer(text, jsonb) from public, anon;
-- vendor_form_save, form_sign_needs_checks and agent_inspection_save keep their grants (create or replace leaves them as they were)

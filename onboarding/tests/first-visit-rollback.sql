-- Rollback test for migration 031 (LW1, the First visit page). Run with onboarding/tests/first-visit-rollback.js, which puts the whole
-- migration inside the block, so one statement changes everything, runs the checks and then raises, which undoes it all. Nothing is kept.
-- The output is the exception message: values and refusals in lower case; a line in CAPITALS means something that should have been
-- refused was allowed, or a value was wrong. Needs 028 (and everything before it) applied: the live project, or the stand-in through 030
-- with tests/lw0-standin-030.sql and then 028. Its fixtures match the live schema (NOT NULLs, foreign keys incl. auth.users where they
-- apply, the property's people and LW0's own triggers); one that doesn't shows in capitals at the end. The agent is simulated with
-- request.jwt.claims; a vendor likewise. Test rows use example.com addresses only, and nothing sends email.
do $t$
declare out text := ''; r jsonb; fv1 uuid := gen_random_uuid(); fv2 uuid := gen_random_uuid(); fv3 uuid := gen_random_uuid(); fv4 uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid(); p2 uuid; p3 uuid; pid uuid; k1 uuid := gen_random_uuid(); k2 uuid := gen_random_uuid(); k3 uuid := gen_random_uuid(); k4 uuid := gen_random_uuid();
  r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid(); r3 uuid := gen_random_uuid(); r4 uuid := gen_random_uuid(); r5 uuid := gen_random_uuid(); r6 uuid := gen_random_uuid();
  n int; n2 int; x text; sig0 bigint; sigsha text; pre_signed text; pp1 uuid; c1 uuid; ph uuid := gen_random_uuid();
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text;
  vendor text := '{"email":"rb-lw1-vendor@example.com","sub":"11111111-1111-1111-1111-1111111110b1","role":"authenticated"}';
begin
  -- what must never change: every signature and every signed person
  select count(*), md5(string_agg(snapshot_sha256, ',' order by id)) into sig0, sigsha from public.signatures;
  select md5(string_agg(id::text || coalesce(contact_id::text, '-') || legal_name || email, ',' order by id)) into pre_signed from public.agreement_people where signed_at is not null;
  -- a property already on file, with a council bedroom count beside (as LW0 keeps it) and the vendor as one of its people
  insert into public.properties (address) values ('3 Lw1 Known Street, Rollbackville') returning id into p2;
  insert into public.property_people (property_id, legal_name, email, source, name_from, role) values (p2, 'Robin Lw1', 'rb-lw1-vendor@example.com', 'agent', 'agent', 'owner');
  perform public.profile_record(p2, 'pBed', '"5"', 'council', null, '2026-2027', 'Dunedin City Council rates', '5', null, 'test', 'auto');

  execute $mig$__MIGRATION__$mig$;

  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  -- 1. start: a new address makes the property with the phone's id; sending it again returns the same visit
  r := public.agent_fv_start(fv1, p1, '  9 Lw1 New   Road, Rollbackville ', 'address', null, now());
  out := out || 'start new: made=' || (r->>'created_property') || ' same id=' || ((r->>'property_id')::uuid = p1)::text || '; ';
  if (r->>'property_id')::uuid <> p1 then out := out || 'THE PHONE''S PROPERTY ID WAS NOT USED; '; end if;
  r := public.agent_fv_start(fv1, p1, '9 Lw1 New Road, Rollbackville', 'address', null, now());
  out := out || 'again: existing=' || (r->>'existing') || '; ';
  if (select count(*) from public.properties where address = '9 Lw1 New Road, Rollbackville') <> 1 then out := out || 'THE PROPERTY WAS MADE TWICE; '; end if;
  -- the same address typed offline on another visit: the property on file, never a second one
  r := public.agent_fv_start(fv2, gen_random_uuid(), '3 lw1 known street, rollbackville', 'address', null, now());
  out := out || 'start known: matched=' || (r->>'matched') || '; ';
  if (r->>'property_id')::uuid <> p2 then out := out || 'A SECOND PROPERTY WAS MADE FOR AN ADDRESS ON FILE; '; end if;
  begin perform public.agent_fv_start(fv3, null, '', 'nothing', null, now()); out := out || 'A VISIT WITH NO ADDRESS WAS FILED; '; exception when others then out := out || 'no address: ' || sqlerrm || '; '; end;
  begin perform public.agent_fv_start(fv3, null, 'x', 'sideways', null, now()); out := out || 'A BAD START WAS ALLOWED; '; exception when others then out := out || 'bad start: refused; '; end;

  -- 2. who's here: an informal name and an email, one person record; corrected, the same person; a second entry with the same email
  -- joins them, never a duplicate; someone who isn't an owner is in touch, not a signer; nobody with no name or email is filed
  r := public.agent_fv_person(fv2, k1, 'Rob', 'rb-lw1-vendor@example.com', '021 555 0199', true, true, true);
  select property_person_id, contact_id into pp1, c1 from public.first_visit_people where id = k1;
  out := out || 'person: filed=' || (r->>'filed') || ' same row=' || (pp1 = (select id from public.property_people where property_id = p2 and email = 'rb-lw1-vendor@example.com'))::text
    || ' legal name kept=' || ((select legal_name from public.property_people where id = pp1) = 'Robin Lw1')::text || ' contact=' || (c1 is not null)::text || '; ';
  if (select legal_name from public.property_people where id = pp1) <> 'Robin Lw1' then out := out || 'AN INFORMAL NAME REPLACED A CHECKED ONE; '; end if;
  if (select count(*) from public.property_people where property_id = p2) <> 1 then out := out || 'A DUPLICATE PERSON WAS MADE; '; end if;
  if c1 is null or c1 is distinct from (select contact_id from public.property_people where id = pp1) then out := out || 'THE PERSON RECORD IS NOT LINKED; '; end if;
  if not exists (select 1 from public.crm_property_links where contact_id = c1 and property_id = p2 and role = 'owner' and is_current) then out := out || 'NO OWNER LINK ON THE PROPERTY; '; end if;
  if (select phone from public.property_people where id = pp1) <> '021 555 0199' then out := out || 'THE PHONE WAS NOT KEPT; '; end if;
  perform public.agent_fv_person(fv2, k2, 'Bron', '', '', false, false, true);
  perform public.agent_fv_person(fv2, k2, 'Bronwyn Lw1', 'rb-lw1-bron@example.com', '', false, false, true);
  out := out || 'friend: rows=' || (select count(*) from public.property_people where property_id = p2) || ' role=' || (select role from public.property_people pp join public.first_visit_people f on f.property_person_id = pp.id where f.id = k2)
    || ' name=' || (select legal_name from public.property_people pp join public.first_visit_people f on f.property_person_id = pp.id where f.id = k2) || '; ';
  if (select count(*) from public.property_people where property_id = p2) <> 2 then out := out || 'CORRECTING A NAME MADE A SECOND PERSON; '; end if;
  if (select role from public.property_people pp join public.first_visit_people f on f.property_person_id = pp.id where f.id = k2) <> 'contact' then out := out || 'SOMEONE WHO ISN''T AN OWNER WAS MADE A SIGNER; '; end if;
  perform public.agent_fv_person(fv2, k3, 'Robin', 'RB-LW1-VENDOR@example.com', '', true, true, true);
  if (select property_person_id from public.first_visit_people where id = k3) <> pp1 then out := out || 'THE SAME EMAIL MADE A SECOND PERSON; '; end if;
  r := public.agent_fv_person(fv2, k4, '', '', '021 000 0000', true, null, true);
  out := out || 'phone only: filed=' || (r->>'filed') || '; ';
  begin perform public.agent_fv_person(fv2, gen_random_uuid(), 'X', 'not-an-email', '', true, null, true); out := out || 'A BAD EMAIL WAS FILED; '; exception when others then out := out || 'bad email: refused; '; end;
  begin perform public.agent_fv_person(fv1, k1, 'Rob', '', '', true, null, true); out := out || 'A PERSON MOVED TO ANOTHER VISIT; '; exception when others then out := out || 'other visit: refused; '; end;

  -- 3. their answers in the question bank: per person, and for everyone there; a blank removes it; Tim's notes, never the vendor's words
  perform public.agent_fv_answer(fv2, k1, 'why_talk', '"Moving to Wanaka"');
  perform public.agent_fv_answer(fv2, k1, 'why_talk', '"Moving to Wanaka next winter"');
  perform public.agent_fv_answer(fv2, null, 'story_bought', '"2009, for the sun"');
  perform public.agent_fv_answer(fv2, null, 'ideal_for', '["Young families","Gardeners"]');
  perform public.agent_fv_answer(fv2, k1, 'client_heart', '"Worried about timing"');
  select count(*) into n from public.qa_answers where source = 'first_visit' and property_id = p2;
  out := out || 'answers=' || n || ' why_talk=' || (select value #>> '{}' from public.qa_answers where source = 'first_visit' and source_ref = k1 and question_key = 'why_talk')
    || ' person=' || ((select contact_id from public.qa_answers where source = 'first_visit' and source_ref = k1 and question_key = 'why_talk') = c1)::text
    || ' everyone=' || (select count(*) from public.qa_answers where source = 'first_visit' and source_ref = fv2) || '; ';
  if n <> 4 then out := out || 'THE ANSWERS DID NOT FILE ONCE EACH; '; end if;
  if exists (select 1 from public.qa_answers where source = 'first_visit' and by_vendor) then out := out || 'TIM''S NOTES ARE MARKED AS THE VENDOR''S WORDS; '; end if;
  perform public.agent_fv_answer(fv2, null, 'story_bought', '""');
  if exists (select 1 from public.qa_answers where source = 'first_visit' and source_ref = fv2 and question_key = 'story_bought') then out := out || 'A BLANK DID NOT REMOVE THE ANSWER; '; end if;
  begin perform public.agent_fv_answer(fv2, null, 'no_such_question', '"x"'); out := out || 'AN ANSWER TO NO QUESTION WAS FILED; '; exception when others then out := out || 'unknown question: refused; '; end;
  begin perform public.agent_fv_answer(fv2, gen_random_uuid(), 'why_talk', '"x"'); out := out || 'AN ANSWER FOR NOBODY WAS FILED; '; exception when others then out := out || 'unknown person: refused; '; end;

  -- 4. rooms: the bedroom count and the room wording come only from Tim's calls. A room tapped as a bedroom and not yet called counts
  -- for nothing; the council's 5 stays beside.
  perform public.agent_fv_room(fv2, jsonb_build_object('id', r1, 'base', 'bedroom', 'label', 'Bedroom 1', 'position', 1));
  out := out || 'uncalled: pBed chosen=' || coalesce((select f.value #>> '{}' from public.property_profile c join public.property_fact_values f on f.id = c.value_id where c.property_id = p2 and c.key = 'pBed'), 'none') || '; ';
  if exists (select 1 from public.property_profile where property_id = p2 and key = 'pBed') then out := out || 'A BEDROOM COUNT WAS CHOSEN WITHOUT TIM''S CALL; '; end if;
  perform public.agent_fv_room(fv2, jsonb_build_object('id', r1, 'base', 'bedroom', 'label', 'Bedroom 1', 'position', 1, 'tim_class', 'bedroom', 'features', jsonb_build_array('Heat pump', 'Built-in wardrobe'), 'notes', 'Sunny', 'photo_keys', jsonb_build_array(ph)));
  perform public.agent_fv_room(fv2, jsonb_build_object('id', r2, 'base', 'bedroom', 'label', 'Bedroom 2', 'position', 2, 'tim_class', 'bedroom'));
  perform public.agent_fv_room(fv2, jsonb_build_object('id', r3, 'base', 'bedroom', 'label', 'Bedroom 3', 'position', 3, 'tim_class', 'study', 'tim_note', 'No window that opens', 'vendor_view', 'They call it the third bedroom'));
  perform public.agent_fv_room(fv2, jsonb_build_object('id', r4, 'base', 'sleepout', 'label', 'Sleepout', 'position', 4, 'tim_class', 'sleepout'));
  perform public.agent_fv_room(fv2, jsonb_build_object('id', r5, 'base', 'kitchen', 'label', 'Kitchen', 'position', 5));
  x := (select f.value #>> '{}' from public.property_profile c join public.property_fact_values f on f.id = c.value_id where c.property_id = p2 and c.key = 'pBed');
  out := out || 'pBed=' || coalesce(x, 'none') || ' source=' || coalesce((select f.source || '/' || f.source_name from public.property_profile c join public.property_fact_values f on f.id = c.value_id where c.property_id = p2 and c.key = 'pBed'), '-')
    || ' ticked=' || coalesce((select ticked::text from public.property_profile where property_id = p2 and key = 'pBed'), '-')
    || ' file=' || coalesce((select description->>'pBed' from public.properties where id = p2), 'none')
    || ' wording=' || coalesce((select f.value #>> '{}' from public.property_profile c join public.property_fact_values f on f.id = c.value_id where c.property_id = p2 and c.key = 'rooms_summary'), 'none')
    || ' council beside=' || (select count(*) from public.property_fact_values where property_id = p2 and key = 'pBed' and source = 'council') || '; ';
  if x is distinct from '2' then out := out || 'THE BEDROOM COUNT IS NOT TIM''S CALL; '; end if;
  if (select description->>'pBed' from public.properties where id = p2) is distinct from '2' then out := out || 'THE PROPERTY FILE DOES NOT FOLLOW THE BEDROOM COUNT; '; end if;
  if (select f.value #>> '{}' from public.property_profile c join public.property_fact_values f on f.id = c.value_id where c.property_id = p2 and c.key = 'rooms_summary') is distinct from '2 bedrooms plus study and sleepout' then out := out || 'THE ROOM WORDING IS WRONG; '; end if;
  -- a room taken off the list is kept, and the count follows
  perform public.agent_fv_room(fv2, jsonb_build_object('id', r2, 'base', 'bedroom', 'label', 'Bedroom 2', 'position', 2, 'tim_class', 'bedroom', 'archived', true));
  out := out || 'after removing one: pBed=' || coalesce((select f.value #>> '{}' from public.property_profile c join public.property_fact_values f on f.id = c.value_id where c.property_id = p2 and c.key = 'pBed'), 'none')
    || ' rooms kept=' || (select count(*) from public.property_rooms where property_id = p2) || '; ';
  if (select f.value #>> '{}' from public.property_profile c join public.property_fact_values f on f.id = c.value_id where c.property_id = p2 and c.key = 'pBed') is distinct from '1' then out := out || 'THE COUNT DID NOT FOLLOW A ROOM TAKEN OFF; '; end if;
  if (select count(*) from public.property_rooms where property_id = p2) <> 5 then out := out || 'A ROOM WAS DELETED; '; end if;
  if (select photo_keys from public.property_rooms where id = r1) <> array[ph] or (select features from public.property_rooms where id = r1) <> '["Heat pump","Built-in wardrobe"]'::jsonb then out := out || 'THE ROOM''S PHOTOS OR FEATURES WERE NOT KEPT; '; end if;
  begin perform public.agent_fv_room(fv2, jsonb_build_object('id', r6, 'base', 'bedroom', 'label', 'X', 'tim_class', 'dungeon')); out := out || 'A MADE-UP CLASS WAS ALLOWED; '; exception when others then out := out || 'bad class: refused; '; end;
  begin perform public.agent_fv_room(fv1, jsonb_build_object('id', r1, 'base', 'bedroom', 'label', 'Moved')); out := out || 'A ROOM MOVED TO ANOTHER PROPERTY; '; exception when others then out := out || 'room on other property: refused; '; end;
  -- every room called something else: "no bedrooms" is then Tim's own call, and the only way to get it
  perform public.agent_fv_room(fv1, jsonb_build_object('id', r6, 'base', 'bedroom', 'label', 'Bedroom', 'tim_class', 'flexible'));
  out := out || 'no bedrooms: pBed=' || coalesce((select f.value #>> '{}' from public.property_profile c join public.property_fact_values f on f.id = c.value_id where c.property_id = p1 and c.key = 'pBed'), 'none')
    || ' wording=' || coalesce((select f.value #>> '{}' from public.property_profile c join public.property_fact_values f on f.id = c.value_id where c.property_id = p1 and c.key = 'rooms_summary'), 'none') || '; ';

  -- 5. tap lists: his own entry on the profile ("First visit"), the file following; bedrooms never from here; a blank clears only this
  -- visit's own value
  r := public.agent_fv_fact(fv2, 'pType', '"House"');
  r := public.agent_fv_fact(fv2, 'outlook', '["Harbour views","Hill views"]');
  r := public.agent_fv_fact(fv2, 'pBath', '2');
  out := out || 'facts: pType=' || coalesce((select f.value #>> '{}' || '/' || f.source || '/' || f.source_name from public.property_profile c join public.property_fact_values f on f.id = c.value_id where c.property_id = p2 and c.key = 'pType'), 'none')
    || ' file pType=' || coalesce((select description->>'pType' from public.properties where id = p2), 'none') || ' file pBath=' || coalesce((select description->>'pBath' from public.properties where id = p2), 'none')
    || ' outlook=' || coalesce((select f.value::text from public.property_profile c join public.property_fact_values f on f.id = c.value_id where c.property_id = p2 and c.key = 'outlook'), 'none') || '; ';
  if (select description->>'pType' from public.properties where id = p2) is distinct from 'House' then out := out || 'THE FILE DOES NOT FOLLOW THE FIRST VISIT; '; end if;
  if (select description->>'pBath' from public.properties where id = p2) is distinct from '2' then out := out || 'A COUNT WAS NOT KEPT AS TEXT; '; end if;
  begin perform public.agent_fv_fact(fv2, 'pBed', '"4"'); out := out || 'A BEDROOM COUNT CAME FROM A TAP LIST; '; exception when others then out := out || 'pBed tap: refused; '; end;
  begin perform public.agent_fv_fact(fv2, 'owners_relab', '"x"'); out := out || 'RELAB WAS WRITTEN FROM THE FIRST VISIT; '; exception when others then out := out || 'other key: refused; '; end;
  r := public.agent_fv_fact(fv2, 'outlook', '[]');
  out := out || 'cleared ours=' || (r->>'cleared') || ' file pType still=' || coalesce((select description->>'pType' from public.properties where id = p2), 'none') || '; ';
  if exists (select 1 from public.property_profile c join public.property_fact_values f on f.id = c.value_id where c.property_id = p2 and c.key = 'outlook' and f.value is not null) then out := out || 'A CLEARED LIST STAYED; '; end if;
  perform public.agent_profile_set(p2, 'pType', '"Townhouse"');   -- Tim types it on the property file afterwards
  r := public.agent_fv_fact(fv2, 'pType', '""');                   -- the first visit's own value is no longer the chosen one: nothing changes
  if (select description->>'pType' from public.properties where id = p2) is distinct from 'Townhouse' then out := out || 'A BLANK ON THE FIRST VISIT CLEARED TIM''S LATER ENTRY; '; end if;

  -- 6. notes, "Now or come back?", and Tim's own tap-list items
  r := public.agent_fv_set(fv2, '{"notes":"Lovely people","decision":"book","next_note":"Tuesday 4pm, with their son"}');
  out := out || 'decision=' || (r->>'decision') || ' at=' || ((r->>'decision_at') is not null)::text || '; ';
  begin perform public.agent_fv_set(fv2, '{"decision":"maybe"}'); out := out || 'A MADE-UP DECISION WAS ALLOWED; '; exception when others then out := out || 'bad decision: refused; '; end;
  r := public.agent_tap_extra('ideal_for', 'Mountain bikers', true); r := public.agent_tap_extra('ideal_for', ' mountain  bikers ', true);
  out := out || 'extras=' || (select count(*) from public.tap_list_extras where list = 'ideal_for') || '; ';
  r := public.agent_tap_extra('ideal_for', 'Mountain bikers', false);
  if not exists (select 1 from public.tap_list_extras where list = 'ideal_for' and archived_at is not null) then out := out || 'AN EXTRA WAS DELETED, NOT SET ASIDE; '; end if;

  -- 7. a vendor of the property reads none of it, writes none of it, and runs none of the functions
  perform set_config('request.jwt.claims', vendor, true);
  out := out || 'vendor sees: visits=' || (select count(*) from public.first_visits) || ' people=' || (select count(*) from public.first_visit_people) || ' rooms=' || (select count(*) from public.property_rooms)
    || ' extras=' || (select count(*) from public.tap_list_extras) || ' first-visit answers=' || (select count(*) from public.qa_answers where source = 'first_visit') || '; ';
  if (select count(*) from public.first_visits) + (select count(*) from public.first_visit_people) + (select count(*) from public.property_rooms) + (select count(*) from public.tap_list_extras) + (select count(*) from public.qa_answers where source = 'first_visit') > 0 then out := out || 'A VENDOR READ TIM''S FIRST VISIT; '; end if;
  begin perform public.agent_fv_start(gen_random_uuid(), null, '1 Vendor Way', 'address', null, now()); out := out || 'A VENDOR STARTED A VISIT; '; exception when others then out := out || 'vendor start: refused; '; end;
  begin perform public.agent_fv_room(fv2, jsonb_build_object('id', gen_random_uuid(), 'base', 'bedroom', 'label', 'V', 'tim_class', 'bedroom')); out := out || 'A VENDOR CALLED A ROOM A BEDROOM; '; exception when others then out := out || 'vendor room: refused; '; end;
  begin insert into public.property_rooms (id, property_id, base, label) values (gen_random_uuid(), p2, 'bedroom', 'V'); out := out || 'A VENDOR WROTE A ROOM; '; exception when others then out := out || 'vendor insert: refused; '; end;
  perform set_config('request.jwt.claims', agent, true);
  begin insert into public.property_rooms (id, property_id, base, label) values (gen_random_uuid(), p2, 'bedroom', 'V'); out := out || 'THE TABLE WAS WRITTEN DIRECTLY; '; exception when others then out := out || 'direct insert: refused; '; end;
  begin perform public.fv_rooms_profile(p2, fv2); out := out || 'AN INTERNAL HELPER RAN FOR A SIGNED-IN USER; '; exception when others then out := out || 'helper: internal; '; end;
  execute 'reset role';

  -- 8. signed records untouched; nothing went wrong quietly
  if (select count(*) from public.signatures) <> sig0 or (select md5(string_agg(snapshot_sha256, ',' order by id)) from public.signatures) is distinct from sigsha then out := out || 'SIGNATURES CHANGED; '; end if;
  if (select md5(string_agg(id::text || coalesce(contact_id::text, '-') || legal_name || email, ',' order by id)) from public.agreement_people where signed_at is not null) is distinct from pre_signed then out := out || 'A SIGNED PERSON CHANGED; '; end if;
  out := out || 'signed untouched; log=' || (select count(*) from public.shared_record_log where at > now() - interval '1 hour') || coalesce(' ' || (select string_agg(what || ': ' || (detail->>'error'), ' | ') from public.shared_record_log where at > now() - interval '1 hour'), '') || '; ';
  if exists (select 1 from public.shared_record_log where at >= now()) then out := out || 'THE SHARED RECORDS LOGGED A PROBLEM; '; end if;
  -- a fixture that doesn't match the live schema shows as a refusal above; say so in capitals
  if out ~* 'null value in column|violates foreign key|violates unique|does not exist' then out := out || 'A FIXTURE DID NOT MATCH THE SCHEMA; '; end if;
  raise exception 'ROLLBACK %', out;
end $t$;

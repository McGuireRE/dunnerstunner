-- Rollback test for migration 028 (LW0, the shared records). Run with onboarding/tests/shared-records-rollback.js, which puts the whole
-- migration inside the block, so one statement changes everything, runs the checks and then raises, which undoes it all. Nothing is kept.
-- The output is the exception message: values and refusals in lower case; a line in CAPITALS means something that should have been
-- refused was allowed, or a value was wrong. Needs 026 (and everything before it) applied. The agent is simulated with
-- request.jwt.claims; a vendor likewise. Test rows use example.com addresses only, and nothing sends email.
do $t$
declare out text := ''; r jsonb; pid uuid; iid uuid; aid uuid; plid uuid; pp1 uuid; pp2 uuid; c1 uuid; c2 uuid; lk uuid; n int; n2 int; x text; vid uuid; qid uuid;
  sig0 bigint; sigsha text; apc text; pre_signed text;
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text;
  vendor text := '{"email":"rb-lw0-vendor@example.com","sub":"11111111-1111-1111-1111-1111111110a1","role":"authenticated"}';
  other text := '{"email":"rb-lw0-other@example.com","sub":"11111111-1111-1111-1111-1111111110a2","role":"authenticated"}';
begin
  -- what must never change: every signature and every signed person
  select count(*), md5(string_agg(snapshot_sha256, ',' order by id)) into sig0, sigsha from public.signatures;
  select md5(string_agg(id::text || coalesce(contact_id::text, '-') || legal_name || email, ',' order by id)) into pre_signed from public.agreement_people where signed_at is not null;

  execute $mig$__MIGRATION__$mig$;

  -- 0. the backfill
  out := out || 'backfill: contacts=' || (select count(*) from public.crm_contacts) || ' links=' || (select count(*) from public.person_links)
    || ' by source=' || coalesce((select string_agg(source || ':' || c, ',' order by source) from (select source, count(*) c from public.person_links group by source) s), 'none')
    || ' doubts=' || (select count(*) from public.person_links where doubt is not null)
    || ' pp without contact=' || (select count(*) from public.property_people where contact_id is null and (legal_name <> '' or email <> ''))
    || ' roles=' || coalesce((select string_agg(role || ':' || c, ',' order by role) from (select role, count(*) c from public.crm_property_links group by role) s), 'none')
    || ' facts=' || (select count(*) from public.property_fact_values) || ' chosen=' || (select count(*) from public.property_profile) || ' ticked=' || (select count(*) from public.property_profile where ticked)
    || ' answers=' || (select count(*) from public.qa_answers) || ' log=' || (select count(*) from public.shared_record_log) || '; ';
  if (select md5(string_agg(id::text || coalesce(contact_id::text, '-') || legal_name || email, ',' order by id)) from public.agreement_people where signed_at is not null) is distinct from pre_signed then out := out || 'A SIGNED PERSON CHANGED; '; end if;
  -- description and profile agree after the backfill, wherever the profile holds a chosen description fact
  select count(*) into n from public.property_profile c join public.property_fact_values f on f.id = c.value_id join public.properties p on p.id = c.property_id
   where c.key = any (public.desc_keys()) and (p.description -> c.key) is distinct from f.value;
  out := out || 'profile differs from file on ' || n || ' facts; ';

  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);

  -- 1. Inspect a property writes to the profile: Tim's answers, chosen and ticked, with source and date
  r := public.agent_inspection_start(null, '1 Lw0 Test Street, Rollbackville'); pid := (r->>'property_id')::uuid; iid := (r->>'inspection_id')::uuid;
  perform public.agent_inspection_save(iid, '{"pBed":"3","pType":"House","pLand":"612"}'::jsonb, null, null, null);
  r := public.agent_property_profile(pid);
  out := out || 'inspection: ' || (select string_agg(f->>'key' || '=' || (f->>'value') || '/' || (f->>'source') || '/' || (f->>'ticked') || '/' || case when f->>'as_of' is null then 'NO DATE' else 'dated' end, ',' order by f->>'key') from jsonb_array_elements(r->'facts') f) || '; ';

  -- 2. a council value for the same fact: kept as another value, the ticked one stays, both shown
  perform set_config('app.council_accept', 'on', true);
  update public.properties set found = jsonb_build_object('land_area', jsonb_build_object('key', 'land_area', 'field', 'pLand', 'written', false, 'value', 650, 'display', '650 m²', 'as_of_label', '2026-2027 rating year', 'source_name', 'Dunedin City Council rates', 'label', 'Land area'),
    'capital_value', jsonb_build_object('key', 'capital_value', 'value', 780000, 'display', '$780,000', 'as_of', '2026-2027', 'source_name', 'Dunedin City Council rates', 'label', 'Capital value')) where id = pid;
  perform set_config('app.council_accept', 'off', true);
  r := public.agent_property_profile(pid);
  select f into r from jsonb_array_elements(r->'facts') f where f->>'key' = 'pLand';
  out := out || 'pLand: chosen=' || (r->>'value') || ' ticked=' || (r->>'ticked') || ' others=' || (select string_agg((o->>'value') || '/' || (o->>'source') || '/' || coalesce(o->>'as_of', 'NO DATE'), ',') from jsonb_array_elements(r->'others') o) || '; ';
  out := out || 'capital value: ' || ((select f from jsonb_array_elements(public.agent_property_profile(pid)->'facts') f where f->>'key' = 'capital_value')->>'display') || '; ';

  -- 3. an agreement saying something else: a value from the agreement, the ticked one stays; Tim chooses, and the file follows
  insert into public.agreements (address, property_id, answers) values ('1 Lw0 Test Street, Rollbackville', pid, '{"pBed":"4","pBath":"2"}') returning id into aid;
  r := public.agent_property_profile(pid);
  out := out || 'agreement: pBed=' || ((select f from jsonb_array_elements(r->'facts') f where f->>'key' = 'pBed')->>'value') || ' others=' || coalesce((select string_agg(o->>'value' || '/' || (o->>'source'), ',') from jsonb_array_elements(r->'facts') f, jsonb_array_elements(f->'others') o where f->>'key' = 'pBed'), 'none')
    || ' pBath=' || ((select f from jsonb_array_elements(r->'facts') f where f->>'key' = 'pBath')->>'value') || '/' || ((select f from jsonb_array_elements(r->'facts') f where f->>'key' = 'pBath')->>'ticked') || '; ';
  vid := ((select o from jsonb_array_elements(r->'facts') f, jsonb_array_elements(f->'others') o where f->>'key' = 'pBed' limit 1)->>'value_id')::uuid;
  perform public.agent_profile_choose(pid, 'pBed', vid);
  out := out || 'chose agreement: file pBed=' || (select description->>'pBed' from public.properties where id = pid) || ' agreement answers kept=' || (select answers->>'pBed' from public.agreements where id = aid) || '; ';
  -- the inspection saving the same fact again (Tim) chooses it once more: his newest entry
  perform public.agent_inspection_save(iid, '{"pBed":"5"}'::jsonb, null, null, null);
  out := out || 'after a new inspection answer: ' || ((select f from jsonb_array_elements(public.agent_property_profile(pid)->'facts') f where f->>'key' = 'pBed')->>'value') || '; ';
  -- untick all, then a record source can't take a person's place, and choosing something not on the property is refused
  perform public.agent_profile_tick(pid, null, false);
  out := out || 'ticked after untick all=' || (select count(*) from public.property_profile where property_id = pid and ticked) || '; ';
  begin perform public.agent_profile_choose(pid, 'pBed', gen_random_uuid()); out := out || 'CHOSE A VALUE NOT ON THE PROPERTY; '; exception when others then out := out || 'choose: ' || sqlerrm || '; '; end;
  perform public.agent_profile_set(pid, 'pHeat', '"Heat pump"');
  out := out || 'Tim typed: ' || ((select f from jsonb_array_elements(public.agent_property_profile(pid)->'facts') f where f->>'key' = 'pHeat')->>'source') || ' file=' || (select description->>'pHeat' from public.properties where id = pid) || '; ';
  -- clearing on the inspection: the chosen value from the inspection goes, the newest other value takes its place
  perform public.agent_inspection_save(iid, '{"pType":""}'::jsonb, null, null, null);
  out := out || 'cleared pType: ' || coalesce(((select f from jsonb_array_elements(public.agent_property_profile(pid)->'facts') f where f->>'key' = 'pType')->>'value'), 'gone') || '; ';

  -- 4. people: the same email with the same name is one person; the same email with a different checked name is kept apart and flagged
  insert into public.property_people (property_id, position, legal_name, email, phone, source, name_from) values (pid, 1, 'Robin Lw0 Testing', 'rb-lw0-vendor@example.com', '021 555 0101', 'agreement', 'agreement') returning id, contact_id into pp1, c1;
  insert into public.agreement_people (agreement_id, position, legal_name, email) values (aid, 1, 'Robin Lw0 Testing', 'RB-LW0-VENDOR@example.com');
  out := out || 'same person: ' || case when (select contact_id from public.agreement_people where agreement_id = aid and position = 1) = c1 then 'one contact' else 'TWO CONTACTS' end
    || ' methods=' || (select string_agg(kind, ',' order by kind) from public.crm_contact_methods where contact_id = c1) || '; ';
  insert into public.property_people (property_id, position, legal_name, email, source, name_from) values (pid, 2, 'Jordan Lw0 Other', 'rb-lw0-vendor@example.com', 'agreement', 'agreement') returning id, contact_id into pp2, c2;
  select id, doubt into lk, x from public.person_links where source = 'property_people' and source_id = pp2;
  out := out || 'shared email, other name: ' || case when c2 is distinct from c1 then 'kept apart' else 'MERGED' end || ' doubt=' || coalesce(left(x, 40), 'NONE') || '; ';
  r := public.agent_person_link_resolve(lk, false);
  out := out || 'resolved different: matched_by=' || (r->>'matched_by') || ' doubt=' || coalesce(r->>'doubt', 'cleared') || '; ';
  -- an informal name (typed at an appraisal) joins the person with that email
  insert into public.prelistings (address, contact_name, contact_email, property_id) values ('1 Lw0 Test Street, Rollbackville', 'Robin', 'rb-lw0-vendor@example.com', pid) returning id into plid;
  out := out || 'questions before we meet: contact=' || case when (select contact_id from public.person_links where source = 'prelisting' and source_id = plid) = c1 then 'Robin' else 'WRONG' end || '; ';
  -- an owner set aside: the role ends, the person stays
  update public.property_people set role = 'former' where id = pp2;
  out := out || 'former: ' || (select string_agg(role || '/' || is_current::text, ',') from public.crm_property_links where contact_id = c2 and property_id = pid) || '; ';
  -- the roles on the property, from the one home
  out := out || 'roles: ' || (select string_agg(coalesce(legal_name, display_name) || '=' || role || case when is_current then '' else '(ended)' end, ', ' order by legal_name, role) from public.property_person_roles where property_id = pid) || '; ';
  -- a buyer signing on an offer would be linked by name on the property when there is no email (no offer is made here; the matcher is checked)
  execute 'reset role';
  out := out || 'no email, same name on the property: ' || case when (public.person_find('Robin Lw0 Testing', null, null, pid, false, 'offer_signer')).contact_id = c1 then 'matched' else 'NOT MATCHED' end || '; ';
  begin execute 'set local role authenticated'; perform public.person_find('x', null, null, pid, false, 'x'); out := out || 'A SIGNED-IN USER RAN THE MATCHER; '; exception when others then out := out || 'matcher: internal; '; end;
  execute 'reset role';

  -- 5. the question bank: the vendor's answers save to it as they answer; theirs to see, nobody else's
  execute 'reset role';
  update public.prelistings set user_id = '11111111-1111-1111-1111-1111111110a1' where id = plid;
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', vendor, true);
  perform public.pl_save(plid, '{"spoke":"Yes, one other agent","chooseWhy":"Local knowledge","conf":{"price":4},"meet":["Weekends"]}'::jsonb);
  out := out || 'vendor answers in the bank: ' || (select string_agg(question_key || '=' || (value::text), ',' order by question_key) from public.qa_answers where source_ref = plid) || '; ';
  perform public.pl_save(plid, '{"spoke":""}'::jsonb);
  out := out || 'cleared answer gone=' || (select count(*) = 0 from public.qa_answers where source_ref = plid and question_key = 'other_agents_spoken')::text || '; ';
  out := out || 'vendor sees answers=' || (select count(*) from public.qa_answers) || ' profile rows=' || (select count(*) from public.property_profile) || ' values=' || (select count(*) from public.property_fact_values)
    || ' links=' || (select count(*) from public.person_links) || ' contacts=' || (select count(*) from public.crm_contacts) || ' roles=' || (select count(*) from public.property_person_roles) || '; ';
  r := public.my_property_profile(pid);
  out := out || 'vendor profile facts=' || jsonb_array_length(r->'facts') || '; ';
  begin perform public.agent_property_profile(pid); out := out || 'A VENDOR READ TIM''S PROFILE CALL; '; exception when others then out := out || 'vendor: ' || sqlerrm || '; '; end;
  begin perform public.agent_profile_set(pid, 'pBed', '"9"'); out := out || 'A VENDOR SET A FACT; '; exception when others then out := out || 'vendor set: ' || sqlerrm || '; '; end;
  begin insert into public.qa_answers (question_key, value, source, by_vendor) values ('goals', '"x"', 'tim', true); out := out || 'A VENDOR WROTE AN ANSWER DIRECTLY; '; exception when others then out := out || 'direct answer: refused; '; end;
  begin insert into public.property_fact_values (property_id, key, value, source) values (pid, 'pBed', '"9"', 'tim'); out := out || 'A VENDOR WROTE A FACT DIRECTLY; '; exception when others then out := out || 'direct fact: refused; '; end;
  perform set_config('request.jwt.claims', other, true);
  out := out || 'someone else sees answers=' || (select count(*) from public.qa_answers) || ' profile=' || (select count(*) from public.property_profile) || '; ';
  begin perform public.my_property_profile(pid); out := out || 'SOMEONE ELSE READ THE PROFILE; '; exception when others then out := out || 'someone else: ' || sqlerrm || '; '; end;

  -- 6. Tim's own notes and Relab stay with Tim
  perform set_config('request.jwt.claims', agent, true);
  qid := public.agent_qa_answer('tim_notes', pid, c1, '"Keen, partner less so"', 'first_visit', false);
  execute 'reset role';
  perform public.profile_record(pid, 'owners_relab', '"R L Testing"', 'relab', null, '26 Nov 2026', 'Relab', null, null, 'agent', 'tim');
  perform public.profile_record(pid, 'pFloor', '"140"', 'relab', null, '26 Nov 2026', 'Relab', null, null, 'agent', 'tim');
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', vendor, true);
  out := out || 'vendor sees Tim''s note=' || (select count(*) from public.qa_answers where id = qid) || ' relab values=' || (select count(*) from public.property_fact_values where source = 'relab')
    || ' relab in their profile=' || (select count(*) from jsonb_array_elements(public.my_property_profile(pid)->'facts') f where f->>'source' = 'relab' or f->>'key' = 'owners_relab') || '; ';
  perform set_config('request.jwt.claims', agent, true);
  out := out || 'Tim sees relab=' || (select count(*) from jsonb_array_elements(public.agent_property_profile(pid)->'facts') f where f->>'source' = 'relab') || '; ';

  -- 7. the Quiet List reads the profile and the person record
  execute 'reset role';
  insert into public.ql_listings (headline, property_id, vendor_name, vendor_email, m_notes) values ('Rollback test', pid, 'Robin', 'rb-lw0-vendor@example.com', 'Wants it quiet') returning id into lk;
  out := out || 'quiet list: ' || (select concat_ws(',', 'beds=' || beds, 'land=' || land_m2, 'rv=' || rv, 'type=' || coalesce(property_type, 'none'), 'vendor=' || case when vendor_contact_id = c1 then 'Robin' else 'WRONG' end) from public.ql_listings where id = lk)
    || ' note in bank=' || (select count(*) from public.qa_answers where source_ref = lk and question_key = 'tim_notes' and not by_vendor) || '; ';
  update public.ql_listings set beds = 6 where id = lk;
  out := out || 'listing beds 6: profile ' || ((select f from jsonb_array_elements(public.profile_read(pid, false)) f where f->>'key' = 'pBed')->>'value') || ' with others ' || (select string_agg(o->>'value' || '/' || (o->>'source'), ',' order by o->>'source') from jsonb_array_elements(public.profile_read(pid, false)) f, jsonb_array_elements(f->'others') o where f->>'key' = 'pBed') || '; ';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_ql_set_photos(lk, array[gen_random_uuid()]); out := out || 'A PHOTO FROM NOWHERE WAS USED; '; exception when others then out := out || 'photos: ' || sqlerrm || '; '; end;
  out := out || 'ql photos=' || (select count(*) from public.ql_listing_photos(lk)) || ' inspection photos=' || (select count(*) from public.inspection_photos(iid)) || '; ';
  execute 'reset role';
  -- a seller lead from the Quiet List form: the person and their own words
  insert into public.ql_seller_leads (name, email, phone, address, reason, time, comments) values ('Robin', 'rb-lw0-vendor@example.com', '021 555 0101', '1 Lw0 Test Street', 'Downsizing', 'Within 6 months', 'Big garden') returning id into lk;
  out := out || 'seller lead: contact=' || case when (select contact_id from public.person_links where source = 'ql_seller_lead' and source_id = lk) = c1 then 'Robin' else 'WRONG' end
    || ' answers=' || (select string_agg(question_key, ',' order by question_key) from public.qa_answers where source_ref = lk) || '; ';

  -- 8. recorded values never change; signed records untouched; nothing went wrong quietly
  begin update public.property_fact_values set value = '"x"' where property_id = pid; out := out || 'A RECORDED VALUE CHANGED; '; exception when others then out := out || 'value change: ' || sqlerrm || '; '; end;
  begin delete from public.property_fact_values where property_id = pid; out := out || 'A RECORDED VALUE WAS REMOVED; '; exception when others then out := out || 'value delete: refused; '; end;
  if (select count(*) from public.signatures) <> sig0 or (select md5(string_agg(snapshot_sha256, ',' order by id)) from public.signatures) is distinct from sigsha then out := out || 'SIGNATURES CHANGED; '; end if;
  if (select md5(string_agg(id::text || coalesce(contact_id::text, '-') || legal_name || email, ',' order by id)) from public.agreement_people where signed_at is not null and agreement_id <> aid) is distinct from pre_signed then out := out || 'A SIGNED PERSON CHANGED; '; end if;
  out := out || 'signed untouched; log=' || (select count(*) from public.shared_record_log) || coalesce(' ' || (select string_agg(what || ': ' || (detail->>'error'), ' | ') from public.shared_record_log), '') || '; ';
  raise exception 'ROLLBACK %', out;
end $t$;

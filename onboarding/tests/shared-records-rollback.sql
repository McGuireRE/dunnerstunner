-- Rollback test for migration 028 (LW0, the shared records). Run with onboarding/tests/shared-records-rollback.js, which puts the whole
-- migration inside the block, so one statement changes everything, runs the checks and then raises, which undoes it all. Nothing is kept.
-- The output is the exception message: values and refusals in lower case; a line in CAPITALS means something that should have been
-- refused was allowed, or a value was wrong. Needs 026 (and everything before it) applied. The agent is simulated with
-- request.jwt.claims; a vendor likewise. Test rows use example.com addresses only, and nothing sends email.
do $t$
declare out text := ''; da uuid; sa uuid; p3 uuid; i3 uuid; p4 uuid; i4 uuid; bp uuid; ba uuid; bron uuid; c3 uuid; pp3 uuid; r jsonb; pid uuid; iid uuid; aid uuid; plid uuid; pp1 uuid; pp2 uuid; c1 uuid; c2 uuid; lk uuid; n int; n2 int; x text; vid uuid; qid uuid;
  sig0 bigint; sigsha text; apc text; pre_signed text;
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text;
  vendor text := '{"email":"rb-lw0-vendor@example.com","sub":"11111111-1111-1111-1111-1111111110a1","role":"authenticated"}';
  other text := '{"email":"rb-lw0-other@example.com","sub":"11111111-1111-1111-1111-1111111110a2","role":"authenticated"}';
begin
  -- what must never change: every signature and every signed person
  select count(*), md5(string_agg(snapshot_sha256, ',' order by id)) into sig0, sigsha from public.signatures;
  select md5(string_agg(id::text || coalesce(contact_id::text, '-') || legal_name || email, ',' order by id)) into pre_signed from public.agreement_people where signed_at is not null;

  -- before 028: a property file Tim filled in himself, and a draft agreement saying something else about the bedrooms
  insert into public.properties (address, description, title_ref) values ('2 Lw0 Backfill Lane, Rollbackville', '{"pHeat":"Wood burner","pBed":"2","pLand":"800"}', 'OT1/LW0') returning id into bp;
  -- and a council value Tim used once, which the file has since changed (800 on the file, 812 from the council)
  perform set_config('app.council_accept', 'on', true);
  update public.properties set found = '{"land_area":{"key":"land_area","field":"pLand","written":true,"value":812,"display":"812 m²","as_of_label":"2026-2027 rating year","source_name":"Dunedin City Council rates","label":"Land area"}}' where id = bp;
  perform set_config('app.council_accept', 'off', true);
  insert into public.agreements (address, property_id, answers) values ('2 Lw0 Backfill Lane, Rollbackville', bp, '{"pBed":"3"}') returning id into ba;

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
   where c.key = any (public.desc_keys()) and (p.description ->> c.key) is distinct from (f.value #>> '{}');
  -- every value a property file holds is on its profile: chosen, or shown beside the chosen one
  select count(*) into n2 from public.properties p, jsonb_each(p.description) d
   where d.key = any (public.desc_keys()) and not public.jblank(d.value)
     and not exists (select 1 from jsonb_array_elements(public.profile_read(p.id, false)) px where px->>'key' = d.key
                       and ((px->>'value_id') is not null and (px->'value' #>> '{}') = (d.value #>> '{}')
                            or exists (select 1 from jsonb_array_elements(px->'others') o where (o->'value' #>> '{}') = (d.value #>> '{}'))));
  out := out || 'profile differs from file on ' || n || ' chosen facts (shown beside); file values missing from the profile=' || n2 || '; ';
  if n2 > 0 then out := out || 'A FILE VALUE IS NOT ON THE PROFILE; '; end if;
  r := public.profile_read(bp, false);
  out := out || 'backfilled file: ' || (select string_agg(px->>'key' || '=' || (px->'value' #>> '{}') || '/' || (px->>'source') || coalesce('/' || (px->>'source_name'), '') || '/' || (px->>'ticked')
      || coalesce(' others ' || (select string_agg((o->'value' #>> '{}') || '/' || (o->>'source'), ',') from jsonb_array_elements(px->'others') o), ''), ', ' order by px->>'key') from jsonb_array_elements(r) px)
    || ' file unchanged=' || ((select description from public.properties where id = bp) = '{"pHeat":"Wood burner","pBed":"2","pLand":"800"}'::jsonb)::text || '; ';
  if (select description from public.properties where id = bp) <> '{"pHeat":"Wood burner","pBed":"2","pLand":"800"}'::jsonb then out := out || 'THE BACKFILL CHANGED A PROPERTY FILE; '; end if;
  if n > 0 then out := out || 'THE PROFILE AND THE FILE DISAGREE AFTER THE BACKFILL; '; end if;
  if ((select px from jsonb_array_elements(r) px where px->>'key' = 'pLand')->>'source') <> 'tim' then out := out || 'A COUNCIL VALUE REPLACED THE FILE''S LAND AREA; '; end if;
  -- in the backfill, an earlier check answer differing from the file's own value: the file's stays, the answer beside it
  perform set_config('app.profile_backfill', 'on', true);
  perform public.profile_record(bp, 'pHeat', '"Heat pump"', 'inspection', null, '26 Nov 2026', 'Inspect a property', null, null, 'agent', 'beside');
  perform set_config('app.profile_backfill', 'off', true);
  r := (select px from jsonb_array_elements(public.profile_read(bp, false)) px where px->>'key' = 'pHeat');
  out := out || 'backfill check answer against the file''s heating: chosen ' || (r->>'value') || '/' || (r->>'source') || ' beside it ' || coalesce((select string_agg((o->>'value') || '/' || (o->>'source'), ',') from jsonb_array_elements(r->'others') o), 'none')
    || ' file=' || (select description->>'pHeat' from public.properties where id = bp) || '; ';
  if r->>'value' <> 'Wood burner' or (select description->>'pHeat' from public.properties where id = bp) <> 'Wood burner' then out := out || 'A BACKFILLED VALUE REPLACED THE FILE''S OWN; '; end if;

  -- privileges: nothing new is open to anon or PUBLIC; the internal helpers are closed to signed-in users too
  select string_agg(p.proname, ',' order by p.proname) into x from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = any (array['shared_note','profile_record','profile_read','profile_write_back','profile_sync_file','profile_vendor_key',
     'agent_property_profile','my_property_profile','agent_profile_set','agent_profile_choose','agent_profile_tick','profile_from_found','profile_from_inspection','profile_from_agreement',
     'person_name_fits','person_find','person_link','person_link_pp','person_unlink_pp','person_link_ap','person_link_after','aml_file_contact','agent_person_link_resolve','qa_mine','qa_put',
     'qa_from_prelisting','qa_from_seller_lead','qa_from_profile','agent_qa_answer','ql_listing_before','ql_listing_after','agent_ql_set_photos','ql_listing_photos','inspection_photos',
     'guard_fact_value','person_joint','person_nick_fits','person_short_same','profile_file_value','profile_official_kinds','profile_from_document_row','profile_from_document','profile_sync_draft','person_first','profile_source_kind','agreement_role','qa_prelisting_map','ql_num'])
     and (has_function_privilege('anon', p.oid, 'EXECUTE') or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'));
  out := out || 'open to anon or PUBLIC: ' || coalesce(upper(x), 'none') || '; ';
  select string_agg(p.proname, ',' order by p.proname) into x from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = any (array['person_name_fits','person_find','person_link','profile_record','profile_read','profile_write_back','profile_sync_file','qa_put','shared_note','person_joint','person_unlink_pp','profile_file_value'])
     and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  out := out || 'internal open to signed-in users: ' || coalesce(upper(x), 'none') || '; ';
  begin execute 'set local role anon'; perform public.qa_mine('questionnaire', gen_random_uuid(), null); out := out || 'ANON RAN QA_MINE; '; exception when others then out := out || 'anon qa_mine: refused; '; end;
  execute 'reset role';
  begin execute 'set local role anon'; perform public.profile_vendor_key('pBed'); out := out || 'ANON RAN PROFILE_VENDOR_KEY; '; exception when others then out := out || 'anon profile_vendor_key: refused; '; end;
  execute 'reset role';
  begin execute 'set local role anon'; perform public.person_name_fits(gen_random_uuid(), 'x', false); out := out || 'ANON RAN PERSON_NAME_FITS; '; exception when others then out := out || 'anon person_name_fits: refused; '; end;
  execute 'reset role';

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
  -- the check saying something else (Tim, 26 November 2026): his check answer is his own choice; the agreement's value stays beside it
  perform public.agent_inspection_save(iid, '{"pBed":"5"}'::jsonb, null, null, null);
  r := (select f from jsonb_array_elements(public.agent_property_profile(pid)->'facts') f where f->>'key' = 'pBed');
  out := out || 'a different check answer: ticked ' || (r->>'value') || '/' || (r->>'source') || '/' || (r->>'ticked') || ' beside it ' || coalesce((select string_agg((o->>'value') || '/' || (o->>'source'), ',' order by o->>'source') from jsonb_array_elements(r->'others') o), 'none')
    || ' file=' || (select description->>'pBed' from public.properties where id = pid) || '; ';
  if r->>'value' <> '5' or (r->>'ticked')::boolean is not true or not (r->'others') @> '[{"value":"4","source":"agreement"}]' or (select description->>'pBed' from public.properties where id = pid) <> '5' then out := out || 'THE CHECK ANSWER DID NOT TAKE, OR THE AGREEMENT''S VALUE IS NOT SHOWN; '; end if;
  -- untick all, then a record source can't take a person's place, and choosing something not on the property is refused
  perform public.agent_profile_tick(pid, null, false);
  out := out || 'ticked after untick all=' || (select count(*) from public.property_profile where property_id = pid and ticked) || '; ';
  begin perform public.agent_profile_choose(pid, 'pBed', gen_random_uuid()); out := out || 'CHOSE A VALUE NOT ON THE PROPERTY; '; exception when others then out := out || 'choose: ' || sqlerrm || '; '; end;
  perform public.agent_profile_set(pid, 'pHeat', '"Heat pump"');
  out := out || 'Tim typed: ' || ((select f from jsonb_array_elements(public.agent_property_profile(pid)->'facts') f where f->>'key' = 'pHeat')->>'source') || ' file=' || (select description->>'pHeat' from public.properties where id = pid) || '; ';
  perform public.agent_profile_set(pid, 'pLand', null);
  r := (select f from jsonb_array_elements(public.agent_property_profile(pid)->'facts') f where f->>'key' = 'pLand');
  out := out || 'Tim cleared land on the file: chosen=' || coalesce(r->>'value_id', 'none') || ' ticked=' || (r->>'ticked') || ' still listed=' || (select string_agg((o->'value' #>> '{}') || '/' || (o->>'source'), ',' order by o->>'source') from jsonb_array_elements(r->'others') o)
    || ' file=' || coalesce((select description->>'pLand' from public.properties where id = pid), 'empty') || '; ';
  -- a fact Tim cleared stays cleared: a draft agreement saying something later is shown beside it, never fills it
  update public.agreements set answers = answers || '{"pLand":"700"}' where id = aid;
  r := (select f from jsonb_array_elements(public.agent_property_profile(pid)->'facts') f where f->>'key' = 'pLand');
  out := out || 'after the clear, a draft agreement says 700: cleared=' || (r->>'cleared') || ' chosen=' || coalesce(r->>'value_id', 'none') || ' beside it ' || (select string_agg((o->'value' #>> '{}') || '/' || (o->>'source'), ',' order by o->>'source') from jsonb_array_elements(r->'others') o)
    || ' file=' || coalesce((select description->>'pLand' from public.properties where id = pid), 'empty') || '; ';
  if r->>'value_id' is not null or (select description->>'pLand' from public.properties where id = pid) is not null then out := out || 'A CLEARED FACT WAS REFILLED; '; end if;
  -- Tim then answers it on the check (600): his own choice, so it fills it
  perform public.agent_inspection_save(iid, '{"pLand":"600"}'::jsonb, null, null, null);
  r := (select f from jsonb_array_elements(public.agent_property_profile(pid)->'facts') f where f->>'key' = 'pLand');
  out := out || 'then his check answer 600: chosen ' || coalesce(r->>'value', 'none') || '/' || coalesce(r->>'source', '-') || ' file=' || coalesce((select description->>'pLand' from public.properties where id = pid), 'empty') || '; ';
  if coalesce(r->>'value', '') <> '600' or (select description->>'pLand' from public.properties where id = pid) is distinct from '600' then out := out || 'HIS CHECK ANSWER DID NOT FILL THE CLEARED FACT; '; end if;
  -- Tim's decision (26 November 2026): his disclosures check answer is his own choice. The file said 800 (his entry), the check says 790:
  -- the profile, ticked, and the file say 790; the 800 is kept beside it
  r := public.agent_inspection_start(null, '3 Lw0 Check Road, Rollbackville'); p3 := (r->>'property_id')::uuid; i3 := (r->>'inspection_id')::uuid;
  perform public.agent_profile_set(p3, 'pLand', '"800"');
  perform public.agent_inspection_save(i3, '{"pLand":"790"}'::jsonb, null, null, null);
  r := (select f from jsonb_array_elements(public.agent_property_profile(p3)->'facts') f where f->>'key' = 'pLand');
  out := out || 'file 800, then the check 790: chosen ' || (r->>'value') || '/' || (r->>'source') || '/' || (r->>'ticked') || ' beside it ' || coalesce((select string_agg((o->>'value') || '/' || (o->>'source'), ',') from jsonb_array_elements(r->'others') o), 'none')
    || ' file=' || (select description->>'pLand' from public.properties where id = p3) || '; ';
  if r->>'value' <> '790' or (r->>'ticked')::boolean is not true or (select description->>'pLand' from public.properties where id = p3) <> '790' then out := out || 'THE CHECK ANSWER DID NOT TAKE; '; end if;
  -- a record of title arriving afterwards with 812: Tim's ticked 790 stays; the official figure is shown beside it, marked
  insert into public.property_documents (property_id, kind, name, path, read_result, created_by) values (p3, 'Record of title', 'title.pdf', 'lw0/title.pdf',
    '{"fields":[{"key":"pLand","value":"812 m²","source":"Record of title OT1/LW0"},{"key":"pBed","value":"9","source":"Record of title"}]}', 'agent');
  r := (select f from jsonb_array_elements(public.agent_property_profile(p3)->'facts') f where f->>'key' = 'pLand');
  out := out || 'title 812 after Tim ticked 790: chosen ' || (r->>'value') || ' beside it ' || coalesce((select string_agg((o->>'value') || '/' || (o->>'source'), ',' order by o->>'source') from jsonb_array_elements(r->'others') o), 'none')
    || ' file=' || (select description->>'pLand' from public.properties where id = p3) || ' other facts from it=' || (select count(*) from public.property_fact_values where property_id = p3 and source = 'title' and key <> 'pLand') || '; ';
  if r->>'value' <> '790' then out := out || 'THE OFFICIAL FIGURE OVERWROTE A TICKED VALUE; '; end if;
  -- the title already there (812), then the check says 790: the official figure stays chosen and on the file; 790 beside it
  r := public.agent_inspection_start(null, '4 Lw0 Title Road, Rollbackville'); p4 := (r->>'property_id')::uuid; i4 := (r->>'inspection_id')::uuid;
  -- an unsigned draft agreement saying 800, and a signed one saying 700 (never touched)
  execute 'reset role';
  insert into public.agreements (address, property_id, status, answers) values ('4 Lw0 Title Road, Rollbackville', p4, 'draft', '{"pLand":"800"}') returning id into da;
  insert into public.agreements (address, property_id, status, answers, signed_at) values ('4 Lw0 Title Road, Rollbackville', p4, 'signed', '{"pLand":"700"}', now()) returning id into sa;
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  insert into public.property_documents (property_id, kind, name, path, read_result, created_by) values (p4, 'Survey plan', 'plan.pdf', 'lw0/plan.pdf',
    '{"fields":[{"key":"pLand","value":"812","source":"Survey plan DP 608"}]}', 'agent') returning id into lk;
  out := out || 'survey plan 812: file=' || coalesce((select description->>'pLand' from public.properties where id = p4), 'empty') || ' draft=' || (select answers->>'pLand' from public.agreements where id = da) || ' signed=' || (select answers->>'pLand' from public.agreements where id = sa) || '; ';
  perform public.agent_inspection_save(i4, '{"pLand":"790"}'::jsonb, null, null, null);
  r := (select f from jsonb_array_elements(public.agent_property_profile(p4)->'facts') f where f->>'key' = 'pLand');
  out := out || 'then the check 790: chosen ' || (r->>'value') || '/' || (r->>'source') || ' beside it ' || coalesce((select string_agg((o->>'value') || '/' || (o->>'source'), ',') from jsonb_array_elements(r->'others') o), 'none')
    || ' file=' || (select description->>'pLand' from public.properties where id = p4) || '; ';
  if r->>'value' <> '812' or r->>'source' <> 'title' or (select description->>'pLand' from public.properties where id = p4) <> '812' or not (r->'others') @> '[{"value":"790","source":"inspection"}]' then out := out || 'THE OFFICIAL FIGURE DID NOT HOLD; '; end if;
  -- Tim's decision (26 November 2026): the official figure goes on the unsigned draft too; a signed agreement is never touched
  out := out || 'draft agreement=' || (select answers->>'pLand' from public.agreements where id = da) || ' signed agreement=' || (select answers->>'pLand' from public.agreements where id = sa) || '; ';
  if (select answers->>'pLand' from public.agreements where id = da) <> '812' then out := out || 'THE DRAFT DID NOT FOLLOW THE OFFICIAL FIGURE; '; end if;
  if (select answers->>'pLand' from public.agreements where id = sa) <> '700' then out := out || 'A SIGNED AGREEMENT WAS CHANGED; '; end if;
  -- Tim then chooses his 790 on the profile: the file and the unsigned draft follow; the signed agreement stays as it is
  perform public.agent_profile_choose(p4, 'pLand', ((select o from jsonb_array_elements(r->'others') o where o->>'source' = 'inspection' limit 1)->>'value_id')::uuid);
  out := out || 'Tim chose 790: file=' || (select description->>'pLand' from public.properties where id = p4) || ' draft=' || (select answers->>'pLand' from public.agreements where id = da) || ' signed=' || (select answers->>'pLand' from public.agreements where id = sa) || '; ';
  if (select description->>'pLand' from public.properties where id = p4) <> '790' or (select answers->>'pLand' from public.agreements where id = da) <> '790' or (select answers->>'pLand' from public.agreements where id = sa) <> '700' then out := out || 'HIS CHOICE DID NOT REACH THE FILE AND THE DRAFT, OR TOUCHED THE SIGNED ONE; '; end if;
  -- the plan archived: its figure goes, and the file's value takes its place
  update public.property_documents set archived_at = now() where id = lk;
  r := (select f from jsonb_array_elements(public.agent_property_profile(p4)->'facts') f where f->>'key' = 'pLand');
  out := out || 'plan archived: chosen ' || coalesce(r->>'value', 'none') || '/' || coalesce(r->>'source', '-') || '; ';
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
  -- someone known only by a first name ("Bron", from the questions before we meet): a different checked name on her email is someone else
  insert into public.prelistings (address, contact_name, contact_email, property_id) values ('1 Lw0 Test Street, Rollbackville', 'Bron', 'rb-lw0-bron@example.com', pid) returning id into lk;
  bron := (select contact_id from public.person_links where source = 'prelisting' and source_id = lk);
  insert into public.property_people (property_id, position, legal_name, email, source, name_from) values (pid, 3, 'Timothy John Smith', 'rb-lw0-bron@example.com', 'agreement', 'agreement') returning id, contact_id into pp3, c3;
  out := out || 'Bron, then Timothy John Smith on her email: ' || case when c3 is distinct from bron then 'kept apart' else 'JOINED' end
    || ' doubt=' || coalesce(left((select doubt from public.person_links where source = 'property_people' and source_id = pp3), 30), 'NONE')
    || ' Bron''s legal name=' || coalesce((select legal_name from public.crm_contacts where id = bron), 'still none') || '; ';
  -- a checked name that fits her ("Bronwyn ..."): joins, and fills her legal name
  insert into public.property_people (property_id, position, legal_name, email, source, name_from) values (pid, 4, 'Bronwyn Lw0 Testing', 'rb-lw0-bron@example.com', 'agreement', 'agreement') returning contact_id into c3;
  out := out || 'Bronwyn on her email: ' || case when c3 = bron then 'joined' else 'NOT JOINED' end || ' legal name=' || coalesce((select legal_name from public.crm_contacts where id = bron), 'NONE') || '; ';
  -- an informal "Robin Other" on Robin's email: a first name alone may fit, two words that differ never do
  insert into public.prelistings (address, contact_name, contact_email, property_id) values ('1 Lw0 Test Street, Rollbackville', 'Robin Brown', 'rb-lw0-vendor@example.com', pid) returning id into lk;
  out := out || 'informal Robin Brown on Robin Lw0 Testing''s email: ' || case when (select contact_id from public.person_links where source = 'prelisting' and source_id = lk) = c1 then 'JOINED' else 'kept apart' end
    || ' doubt=' || coalesce(left((select doubt from public.person_links where source = 'prelisting' and source_id = lk), 30), 'NONE') || '; ';
  -- one name holding two people: flagged to be split, never one legal name; writing the row again makes no second record
  insert into public.property_people (property_id, position, legal_name, email, source, name_from) values (pid, 5, 'Sam Lw0 Pair and Alex Lw0 Pair', 'rb-lw0-pair@example.com', 'agreement', 'agreement') returning id, contact_id into pp3, c3;
  out := out || 'two people in one name: legal name=' || coalesce((select legal_name from public.crm_contacts where id = c3), 'none') || ' doubt=' || coalesce(left((select doubt from public.person_links where source = 'property_people' and source_id = pp3), 35), 'NONE');
  update public.property_people set phone = '021 555 0199' where id = pp3;
  out := out || ' after writing it again: ' || case when (select contact_id from public.property_people where id = pp3) = c3 then 'same record' else 'A SECOND RECORD' end || '; ';
  insert into public.property_people (property_id, position, legal_name, email, source, name_from) values (pid, 6, 'A & B Lw0', '', 'agreement', 'agreement') returning id into pp3;
  out := out || 'A & B: ' || coalesce(left((select doubt from public.person_links where source = 'property_people' and source_id = pp3), 35), 'NOT FLAGGED') || '; ';
  -- two signers with the same email and name written at once: one record
  execute 'reset role';
  select count(distinct public.person_link('offer_signer', gen_random_uuid(), pid, 'Sam Lw0 Signer', null, 'rb-lw0-sam@example.com', null, false, 'purchaser', true)) into n from generate_series(1, 2);
  out := out || 'two signers, one email, at once: records=' || n || '; ';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  -- Tim says two records are the same person: the property's people row follows, the old record's role ends and it is archived
  insert into public.property_people (property_id, position, legal_name, email, source, name_from) values (pid, 7, 'Robyn Lw0 Testing', 'rb-lw0-vendor@example.com', 'agreement', 'agreement') returning id, contact_id into pp3, c3;
  select id into lk from public.person_links where source = 'property_people' and source_id = pp3;
  if (select doubt_contact_id from public.person_links where id = lk) is distinct from c1 then out := out || 'NO DOUBT TO JOIN; '; end if;
  perform public.agent_person_link_resolve(lk, true);
  out := out || 'joined by Tim: row=' || case when (select contact_id from public.property_people where id = pp3) = c1 then 'follows' else 'LEFT ON THE OLD RECORD' end
    || ' old record=' || (select status from public.crm_contacts where id = c3) || ' old role current=' || coalesce((select bool_or(is_current)::text from public.crm_property_links where contact_id = c3), 'none') || '; ';
  -- a row removed from the property's people: its link goes and the role it gave ends
  execute 'reset role';
  delete from public.property_people where id = pp3;
  out := out || 'row removed: link=' || (select count(*) from public.person_links where source = 'property_people' and source_id = pp3) || ' Robin still owner=' || coalesce((select is_current::text from public.crm_property_links where contact_id = c1 and property_id = pid and role = 'owner'), 'none') || '; ';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  -- an owner set aside: the role ends, the person stays
  update public.property_people set role = 'former' where id = pp2;
  out := out || 'former: ' || (select string_agg(role || '/' || is_current::text, ',') from public.crm_property_links where contact_id = c2 and property_id = pid) || '; ';
  -- the roles on the property, from the one home
  out := out || 'roles: ' || (select string_agg(coalesce(legal_name, display_name) || '=' || role || case when is_current then '' else '(ended)' end, ', ' order by legal_name, role) from public.property_person_roles where property_id = pid) || '; ';
  -- a buyer signing on an offer would be linked by name on the property when there is no email (no offer is made here; the matcher is checked)
  execute 'reset role';
  out := out || 'no email, same name on the property: ' || case when (public.person_find('Robin Lw0 Testing', null, null, pid, false, 'offer_signer')).contact_id = c1 then 'matched' else 'NOT MATCHED' end || '; ';
  r := to_jsonb(public.person_find('Rob Lw0 Testing', null, null, pid, false, 'offer_signer'));
  out := out || 'no email, a similar name on the property: ' || case when r->>'matched_by' = 'new' and (r->>'doubt_contact')::uuid = c1 then 'kept apart, flagged' else 'NOT FLAGGED ' || r::text end || '; ';
  out := out || 'Tim for Timothy, same surname, same email: ' || case when public.person_name_fits(c1, 'Rob Lw0 Testing', false) then 'fits' else 'DOES NOT FIT' end || '; ';
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
  out := out || 'listing beds 6: file pBed=' || (select description->>'pBed' from public.properties where id = pid) || '; ';
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

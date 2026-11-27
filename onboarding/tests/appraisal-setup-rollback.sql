-- Rollback test for migration 033 (appraisal set-up: new columns, two new status values, ai_calls.appraisal_id, the wording guard and
-- the agent functions to create and save an appraisal). Run with onboarding/tests/appraisal-setup-rollback.js, which puts the whole
-- migration inside the block, so one statement applies it, runs the checks and then raises, which undoes it all. Nothing is kept.
-- The output is the exception message: lower case reads as expected; a line in CAPITALS means something was wrong.
-- Needs 032 and what it builds on, as live (the local stand-in tests/appraisal-setup-standin.sql has them at their live definitions).
-- Test rows use invented example data only. The agent is the first row of public.agents, as in 032's test.
do $t$
declare out text := ''; x text; n int; j jsonb; aid uuid; aid2 uuid; pid uuid; pid2 uuid; hid uuid; hand_before text; hand_after text; cid bigint;
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text;
  vendor text := json_build_object('email', 'rb-vendor@example.com', 'sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text;
  good_fields jsonb := '{"ranges":[{"key":"A","option":"Your home","involves":"","low":500000,"high":550000}],"method":{"name":"Deadline sale","text":"I would recommend a deadline sale."}}'::jsonb;
  good_sections jsonb := '[{"type":"heading","text":"My opinion of price"},{"type":"opinion"}]'::jsonb;
begin
  -- the row loaded by hand before 033: every value, as text, to compare afterwards (the oldest row; the stand-in has one)
  select id, to_jsonb(v)::text into hid, hand_before from public.appraisal_views v order by created_at limit 1;

  $mig$__MIGRATION__$mig$;

  -- the hand-loaded row: every value it had is unchanged, and the new columns hold their defaults
  if hid is not null then
    select (to_jsonb(v) - 'setup' - 'kind' - 'private_notes')::text, v.setup::text || '|' || v.kind || '|' || v.private_notes into hand_after, x from public.appraisal_views v where id = hid;
    if hand_after is distinct from hand_before then out := out || 'THE HAND-LOADED ROW CHANGED; '; else out := out || 'hand-loaded row unchanged; '; end if;
    if x is distinct from '{}|standard|' then out := out || 'THE HAND-LOADED ROW GOT UNEXPECTED NEW VALUES: ' || x || '; '; else out := out || 'its new columns: defaults; '; end if;
  else out := out || 'no hand-loaded row to compare; '; end if;

  -- shape: columns, checks, the ai_calls link, the functions and who may call them
  select string_agg(column_name || ':' || data_type || ':' || is_nullable, ',' order by column_name) into x from information_schema.columns
    where table_schema = 'public' and table_name = 'appraisal_views' and column_name in ('setup', 'kind', 'private_notes');
  out := out || 'new columns: ' || coalesce(x, 'none') || '; ';
  if x is distinct from 'kind:text:NO,private_notes:text:NO,setup:jsonb:NO' then out := out || 'THE NEW COLUMNS ARE NOT AS WRITTEN; '; end if;
  select pg_get_constraintdef(oid) into x from pg_constraint where conrelid = 'public.appraisal_views'::regclass and conname = 'appraisal_views_status_check';
  if x !~ 'draft' or x !~ 'presented' or x !~ 'archived' or x !~ 'ready' or x !~ 'sent' then out := out || 'THE STATUS CHECK LOST A VALUE: ' || coalesce(x, 'none') || '; '; else out := out || 'status check: old values kept, ready and sent added; '; end if;
  select relrowsecurity::text into x from pg_class where oid = 'public.appraisal_views'::regclass;
  if x <> 'true' then out := out || 'ROW LEVEL SECURITY IS OFF; '; end if;
  select string_agg(policyname, ',' order by policyname) into x from pg_policies where schemaname = 'public' and tablename = 'appraisal_views';
  if x is distinct from 'appraisal_views_agent_insert,appraisal_views_agent_select,appraisal_views_agent_update' then out := out || 'THE POLICIES CHANGED: ' || coalesce(x, 'none') || '; '; else out := out || 'policies unchanged; '; end if;
  select pg_get_constraintdef(oid) into x from pg_constraint where conrelid = 'public.ai_calls'::regclass and contype = 'f' and pg_get_constraintdef(oid) ~ 'appraisal_views';
  if x is distinct from 'FOREIGN KEY (appraisal_id) REFERENCES appraisal_views(id) ON DELETE SET NULL' then out := out || 'AI_CALLS LINK NOT AS WRITTEN: ' || coalesce(x, 'none') || '; '; else out := out || 'ai_calls.appraisal_id links, clears on delete; '; end if;
  select string_agg(p.proname || ':' || p.prosecdef::text || ':' || coalesce(array_to_string(p.proconfig, ' '), '-'), ',' order by p.proname) into x
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('agent_appraisal_create', 'agent_appraisal_save', 'appraisal_wording_problem');
  out := out || 'functions: ' || coalesce(x, 'none') || '; ';
  if x is distinct from 'agent_appraisal_create:true:search_path=public,agent_appraisal_save:true:search_path=public,appraisal_wording_problem:false:search_path=public' then out := out || 'THE FUNCTIONS ARE NOT AS WRITTEN; '; end if;
  if has_function_privilege('anon', 'public.agent_appraisal_create(uuid,text,text)', 'execute') or has_function_privilege('anon', 'public.agent_appraisal_save(uuid,jsonb,jsonb,jsonb,text,text,text,text)', 'execute')
     or has_function_privilege('anon', 'public.appraisal_wording_problem(jsonb)', 'execute') then out := out || 'ANON MAY CALL A FUNCTION; '; else out := out || 'anon: no functions; '; end if;
  if not has_function_privilege('authenticated', 'public.agent_appraisal_create(uuid,text,text)', 'execute') or not has_function_privilege('authenticated', 'public.agent_appraisal_save(uuid,jsonb,jsonb,jsonb,text,text,text,text)', 'execute') then out := out || 'SIGNED-IN USERS CANNOT CALL THE AGENT FUNCTIONS; '; end if;
  if has_function_privilege('authenticated', 'public.appraisal_wording_problem(jsonb)', 'execute') then out := out || 'THE GUARD HELPER IS CALLABLE DIRECTLY; '; end if;

  -- the guard itself, on its own (run as the owner)
  if public.appraisal_wording_problem('["Sold As-Is"]') = '' or public.appraisal_wording_problem('{"a":{"b":["in its current condition, as  is"]}}') = '' then out := out || 'THE GUARD MISSED "AS IS"; '; end if;
  if public.appraisal_wording_problem('"my fee"') = '' or public.appraisal_wording_problem('[{"t":"Commission: 3%"}]') = '' or public.appraisal_wording_problem('"Fees"') = '' then out := out || 'THE GUARD MISSED A FEE OR COMMISSION; '; end if;
  if public.appraisal_wording_problem('["Basis of the price", "as it stands", "coffee", "feeling", "Kiss", "an oasis"]') <> '' then out := out || 'THE GUARD REFUSED FINE WORDING; '; else out := out || 'guard: refuses as is, fee, commission; passes fine words; '; end if;

  -- Tim starts one from an address (a new property file) and one from a property on file
  insert into public.properties (address) values ('RB 33 Sample Street, Testville') returning id into pid;
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  j := public.agent_appraisal_create(null, '  RB 34   Sample Street, Testville ', null);
  aid := (j->>'appraisal_id')::uuid; pid2 := (j->>'property_id')::uuid;
  select count(*) into n from public.properties where id = pid2 and address = 'RB 34 Sample Street, Testville';
  out := out || 'from an address: new file ' || n || ', created_property ' || (j->>'created_property') || '; ';
  if n <> 1 or (j->>'created_property') <> 'true' then out := out || 'NO PROPERTY FILE FOR THE ADDRESS; '; end if;
  select title || '|' || kind || '|' || status || '|' || setup::text into x from public.appraisal_views where id = aid;
  if x is distinct from 'RB 34 Sample Street, Testville: Market Appraisal|standard|draft|{"v": 1}' then out := out || 'THE NEW APPRAISAL IS NOT AS WRITTEN: ' || coalesce(x, 'none') || '; '; else out := out || 'new appraisal: titled, standard, draft, set-up v1; '; end if;
  j := public.agent_appraisal_create(pid, null, 'standard'); aid2 := (j->>'appraisal_id')::uuid;
  select count(*) into n from public.appraisal_views where id = aid2 and property_id = pid and address = 'RB 33 Sample Street, Testville';
  out := out || 'from a property: ' || n || ', created_property ' || (j->>'created_property') || '; ';
  if n <> 1 or (j->>'created_property') <> 'false' then out := out || 'NOT TIED TO THE PROPERTY ON FILE; '; end if;
  begin perform public.agent_appraisal_create(null, 'rb 33 sample street,  testville', null); out := out || 'A SECOND FILE FOR AN ADDRESS ON FILE; '; exception when others then out := out || 'address on file: ' || sqlerrm || '; '; end;
  begin perform public.agent_appraisal_create(null, 'RB', null); out := out || 'A TWO-LETTER ADDRESS WAS ACCEPTED; '; exception when others then out := out || 'short address: ' || sqlerrm || '; '; end;
  begin perform public.agent_appraisal_create(gen_random_uuid(), null, null); out := out || 'A MISSING PROPERTY WAS ACCEPTED; '; exception when others then out := out || 'missing property: ' || sqlerrm || '; '; end;
  begin perform public.agent_appraisal_create(pid, null, 'luxury'); out := out || 'AN UNKNOWN KIND WAS ACCEPTED; '; exception when others then out := out || 'unknown kind: refused; '; end;
  begin perform public.agent_appraisal_create(null, 'RB 9 Sold As Is Lane', null); out := out || 'AN "AS IS" ADDRESS WAS ACCEPTED; '; exception when others then out := out || 'as is in an address: refused; '; end;
  select count(*) into n from public.properties where address ilike '%As Is Lane%'; if n <> 0 then out := out || 'A REFUSED ADDRESS LEFT A PROPERTY FILE; '; end if;

  -- Tim saves the set-up and the sections written from it
  j := public.agent_appraisal_save(aid, '{"v":1,"campaign":{"kind":"standard"},"method":"deadline","plan":"premium"}'::jsonb, good_fields, good_sections,
    'RB 34 Sample Street: Market Appraisal', 'Sample Person', 'Weak point: the sample roof.', null);
  select setup->>'plan' || '|' || (fields->'ranges'->0->>'low') || '|' || jsonb_array_length(sections) || '|' || prepared_for || '|' || private_notes || '|' || (prepared_on is not null)::text into x from public.appraisal_views where id = aid;
  if x is distinct from 'premium|500000|2|Sample Person|Weak point: the sample roof.|true' then out := out || 'THE SAVE DID NOT KEEP EVERYTHING: ' || coalesce(x, 'none') || '; '; else out := out || 'saved: set-up, figures, sections, name, private notes, date; '; end if;
  -- a null leaves that part as it was
  perform public.agent_appraisal_save(aid, null, null, null, null, null, null, 'ready');
  select status || '|' || (setup->>'plan') || '|' || jsonb_array_length(sections) into x from public.appraisal_views where id = aid;
  if x is distinct from 'ready|premium|2' then out := out || 'A NULL CLEARED SOMETHING: ' || coalesce(x, 'none') || '; '; else out := out || 'nulls keep what is there; ready set; '; end if;
  -- refused: a low above its high, a missing figure, "as is", a fee, commission, setting sent, a non-list of sections
  begin perform public.agent_appraisal_save(aid, null, '{"ranges":[{"key":"A","option":"Your home","low":600000,"high":550000}]}'::jsonb, null, null, null, null, null); out := out || 'A LOW ABOVE ITS HIGH WAS SAVED; '; exception when others then out := out || 'low above high: ' || sqlerrm || '; '; end;
  begin perform public.agent_appraisal_save(aid, null, '{"ranges":[{"key":"A","option":"Your home","low":550000,"high":550000}]}'::jsonb, null, null, null, null, null); out := out || 'A LOW EQUAL TO ITS HIGH WAS SAVED; '; exception when others then out := out || 'low equal to high: refused; '; end;
  begin perform public.agent_appraisal_save(aid, null, '{"ranges":[{"key":"A","option":"Your home","low":"","high":550000}]}'::jsonb, null, null, null, null, null); out := out || 'A MISSING FIGURE WAS SAVED; '; exception when others then out := out || 'missing figure: ' || sqlerrm || '; '; end;
  begin perform public.agent_appraisal_save(aid, null, null, '[{"type":"para","text":"Sold as is, where is."}]'::jsonb, null, null, null, null); out := out || '"AS IS" WAS SAVED; '; exception when others then out := out || 'as is: ' || sqlerrm || '; '; end;
  begin perform public.agent_appraisal_save(aid, '{"v":1,"note":"My fee is low"}'::jsonb, null, null, null, null, null, null); out := out || 'A FEE IN THE SET-UP WAS SAVED; '; exception when others then out := out || 'fee in the set-up: ' || sqlerrm || '; '; end;
  begin perform public.agent_appraisal_save(aid, null, null, null, 'Commission free appraisal', null, null, null); out := out || 'COMMISSION IN THE TITLE WAS SAVED; '; exception when others then out := out || 'commission in the title: refused; '; end;
  begin perform public.agent_appraisal_save(aid, null, null, null, null, null, null, 'sent'); out := out || 'SENT WAS SET BY THE SAVE; '; exception when others then out := out || 'sent: ' || sqlerrm || '; '; end;
  begin perform public.agent_appraisal_save(aid, null, null, '{"not":"a list"}'::jsonb, null, null, null, null); out := out || 'SECTIONS ACCEPTED A NON-LIST; '; exception when others then out := out || 'sections must be a list; '; end;
  -- private notes are Tim's: weak points may be written plainly there (they are never on the vendor's page)
  perform public.agent_appraisal_save(aid, null, null, null, null, null, 'The vendor may expect to sell as is.', null);
  select private_notes into x from public.appraisal_views where id = aid;
  if x is distinct from 'The vendor may expect to sell as is.' then out := out || 'PRIVATE NOTES WERE REFUSED; '; else out := out || 'private notes: Tim''s own words kept; '; end if;
  select (fields->'ranges'->0->>'low') || '|' || jsonb_array_length(sections) || '|' || status into x from public.appraisal_views where id = aid;
  if x is distinct from '500000|2|ready' then out := out || 'A REFUSED SAVE CHANGED THE ROW: ' || coalesce(x, 'none') || '; '; else out := out || 'nothing refused was saved; '; end if;
  begin perform public.agent_appraisal_save(gen_random_uuid(), null, null, null, null, null, null, null); out := out || 'A MISSING APPRAISAL WAS SAVED; '; exception when others then out := out || 'missing appraisal: ' || sqlerrm || '; '; end;
  execute 'reset role';

  -- a sent appraisal never changes (only phase E will send; here the status is set as the owner)
  update public.appraisal_views set status = 'sent' where id = aid2;
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_appraisal_save(aid2, null, good_fields, null, null, null, null, null); out := out || 'A SENT APPRAISAL WAS CHANGED; '; exception when others then out := out || 'sent appraisal: ' || sqlerrm || '; '; end;
  execute 'reset role';

  -- a signed-in vendor: refused by both functions, and still sees no row
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', vendor, true);
  begin perform public.agent_appraisal_create(null, 'RB 35 Sample Street, Testville', null); out := out || 'A VENDOR STARTED AN APPRAISAL; '; exception when others then out := out || 'vendor create: ' || sqlerrm || '; '; end;
  begin perform public.agent_appraisal_save(aid, null, good_fields, null, null, null, null, null); out := out || 'A VENDOR SAVED AN APPRAISAL; '; exception when others then out := out || 'vendor save: ' || sqlerrm || '; '; end;
  select count(*) into n from public.appraisal_views; if n <> 0 then out := out || 'A VENDOR CAN SEE APPRAISALS; '; else out := out || 'vendor sees: 0; '; end if;
  execute 'reset role';
  select count(*) into n from public.properties where address = 'RB 35 Sample Street, Testville'; if n <> 0 then out := out || 'A VENDOR MADE A PROPERTY FILE; '; end if;

  -- anon: no function at all
  begin execute 'set local role anon'; perform public.agent_appraisal_create(null, 'RB 36 Sample Street, Testville', null); out := out || 'ANON STARTED AN APPRAISAL; '; exception when others then out := out || 'anon create: refused; '; end;
  execute 'reset role';

  -- a model call logged against an appraisal; the log keeps the call if the appraisal goes (the link clears)
  insert into public.ai_calls (purpose, model, ok, appraisal_id, agent) values ('rb appraisal test', 'stand-in-model', true, aid, 'rb') returning id into cid;
  select count(*) into n from public.ai_calls where id = cid and appraisal_id = aid; if n <> 1 then out := out || 'THE CALL WAS NOT LINKED; '; end if;
  delete from public.appraisal_views where id = aid;
  select count(*) into n from public.ai_calls where id = cid and appraisal_id is null; out := out || 'appraisal removed, call kept: ' || n || '; ';
  if n <> 1 then out := out || 'THE CALL WENT WITH THE APPRAISAL OR KEPT A DEAD LINK; '; end if;
  -- an older call with no appraisal still saves (the column is optional)
  insert into public.ai_calls (purpose, model, ok) values ('rb other test', 'stand-in-model', false);

  if out ~* 'null value in column|violates foreign key|violates unique|does not exist' then out := out || 'A FIXTURE DID NOT MATCH THE SCHEMA; '; end if;
  raise exception 'ROLLBACK %', out;
end $t$;

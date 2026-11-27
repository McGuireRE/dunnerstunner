-- Rollback test for migration 035 (comparables from an uploaded report, photos from a listing page, case-by-case suburbs). Run with
-- onboarding/tests/appraisal-reports-rollback.js, which puts the whole migration inside the block, so one statement applies it, runs the
-- checks and then raises, which undoes it all. Nothing is kept. The output is the exception message: lower case reads as expected; a
-- line in CAPITALS means something was wrong. Needs 034 and the one store for documents, as tests/appraisal-reports-standin.sql builds.
-- Test rows use invented example data only. The agent is the first row of public.agents, as in 032's to 034's tests.
do $t$
declare out text := ''; x text; n int; j jsonb; r record;
  pid uuid; pid2 uuid; aid uuid; aid2 uuid; hid uuid; c1 uuid; c2 uuid; cx uuid; d1 uuid; d2 uuid; dother uuid; dimg uuid; rep uuid; g0 uuid; m1 uuid; k1 uuid; k2 uuid; chk uuid;
  views_before text; views_after text; groups_before text; media_before text; kinds_before text;
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text;
  vendor text := json_build_object('email', 'rb-vendor@example.com', 'sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text;
  sha text := repeat('ab', 32); res jsonb;
begin
  -- what is there before 035: a phase A appraisal with a comparable and a photo, a never-mix group (all invented)
  select id into hid from public.appraisal_views where setup ? 'v' order by created_at limit 1;
  select property_id into pid from public.appraisal_views where id = hid;
  insert into public.appraisal_comps (appraisal_id, position, status, address, suburb, price, sold_on, ring) values (hid, 1, 'sold', 'RB 1 Before Road, Testville', 'Testville', 500000, date '2026-10-01', 'suburb') returning id into c1;
  insert into storage.objects (bucket_id, name, metadata) values ('appraisal-media', 'appraisals/' || hid || '/comps/' || c1 || '/before.jpg', '{"mimetype":"image/jpeg","size":1234}');
  insert into public.appraisal_media (appraisal_id, comp_id, path) values (hid, c1, 'appraisals/' || hid || '/comps/' || c1 || '/before.jpg') returning id into m1;
  insert into public.suburb_groups (name, suburbs) values ('RB student sales', array['Rbvale']) returning id into g0;
  select string_agg(to_jsonb(v)::text, '|' order by id) into views_before from public.appraisal_views v;
  select string_agg(to_jsonb(g)::text, '|' order by id) into groups_before from public.suburb_groups g;
  select string_agg(to_jsonb(m)::text, '|' order by id) into media_before from public.appraisal_media m;
  select string_agg(kind || folder || position || shareable || exportable, ',' order by kind) into kinds_before from public.repo_kinds;

  $mig$__MIGRATION__$mig$;

  -- nothing already there changed: appraisals, comparables' photos, the never-mix group (now marked never mix), the kinds
  select string_agg(to_jsonb(v)::text, '|' order by id) into views_after from public.appraisal_views v;
  if views_after is distinct from views_before then out := out || 'AN EXISTING APPRAISAL CHANGED; '; else out := out || 'appraisals unchanged; '; end if;
  select string_agg((to_jsonb(m) - 'page_url')::text, '|' order by id) into x from public.appraisal_media m;
  if x is distinct from media_before or exists (select 1 from public.appraisal_media where page_url is not null) then out := out || 'AN EXISTING PHOTO CHANGED; '; else out := out || 'photos unchanged, page_url empty; '; end if;
  select string_agg((to_jsonb(g) - 'mode')::text, '|' order by id) into x from public.suburb_groups g;
  if x is distinct from groups_before or (select mode from public.suburb_groups where id = g0) <> 'never_mix' then out := out || 'AN EXISTING GROUP CHANGED OR IS NOT NEVER MIX; '; else out := out || 'existing group: unchanged, never mix; '; end if;
  select string_agg(kind || folder || position || shareable || exportable, ',' order by kind) into x from public.repo_kinds where kind <> 'Comparables or market report';
  if x is distinct from kinds_before then out := out || 'AN EXISTING KIND CHANGED; '; end if;
  select folder || '|' || shareable || '|' || exportable into x from public.repo_kinds where kind = 'Comparables or market report';
  if x is distinct from 'agency|false|false' then out := out || 'THE NEW KIND IS NOT AS WRITTEN: ' || coalesce(x, 'none') || '; '; else out := out || 'new kind: agency papers, never shared or exported; '; end if;

  -- shape: Row Level Security, read-only policies for Tim, nothing for anon, no direct writes
  for r in select t from unnest(array['appraisal_reports', 'appraisal_buyer_checks']) t loop
    select relrowsecurity::text into x from pg_class where oid = ('public.' || r.t)::regclass;
    if x <> 'true' then out := out || 'ROW LEVEL SECURITY IS OFF ON ' || upper(r.t) || '; '; end if;
    select string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, '+') || ':' || qual, ',') into x from pg_policies where schemaname = 'public' and tablename = r.t;
    if x is distinct from r.t || '_agent_read:SELECT:authenticated:is_agent()' then out := out || 'POLICIES ON ' || upper(r.t) || ': ' || coalesce(x, 'none') || '; '; end if;
    if has_table_privilege('anon', 'public.' || r.t, 'select') or has_table_privilege('anon', 'public.' || r.t, 'insert') then out := out || 'ANON HAS A PRIVILEGE ON ' || upper(r.t) || '; '; end if;
    if has_table_privilege('authenticated', 'public.' || r.t, 'insert') or has_table_privilege('authenticated', 'public.' || r.t, 'update') or has_table_privilege('authenticated', 'public.' || r.t, 'delete') or has_table_privilege('authenticated', 'public.' || r.t, 'truncate') then out := out || 'SIGNED-IN USERS CAN WRITE ' || upper(r.t) || '; '; end if;
  end loop;
  out := out || 'two tables: rls on, Tim reads, nobody writes directly, nothing for anon; ';
  select string_agg(p.oid::regprocedure::text, ',' order by 1) into x from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('appraisal_report_source', 'appraisal_report_save', 'appraisal_buyer_save', 'guard_report_document', 'guard_appraisal_report', 'guard_media_page_url', 'guard_buyer_check', 'agent_report_imported')
    and (has_function_privilege('anon', p.oid, 'execute') or (p.proname <> 'agent_report_imported' and has_function_privilege('authenticated', p.oid, 'execute')));
  if x is not null then out := out || 'CALLABLE WHEN IT SHOULD NOT BE: ' || x || '; '; else out := out || 'service-role functions: not callable by anon or signed-in users; '; end if;
  if not has_function_privilege('service_role', 'public.appraisal_report_save(uuid,uuid,jsonb,text,integer,text)', 'execute') or not has_function_privilege('service_role', 'public.appraisal_buyer_save(uuid,jsonb,jsonb,text,text)', 'execute')
     or not has_function_privilege('service_role', 'public.appraisal_report_source(uuid,uuid)', 'execute') then out := out || 'THE SERVICE ROLE CANNOT SAVE; '; end if;
  if not has_function_privilege('authenticated', 'public.agent_report_imported(uuid,text[],text[])', 'execute') then out := out || 'TIM CANNOT RECORD HIS TICKS; '; end if;
  select string_agg(p.proname || ':' || coalesce(array_to_string(p.proconfig, ' '), '-'), ',' order by p.proname) into x from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('appraisal_report_source', 'appraisal_report_save', 'appraisal_buyer_save', 'guard_report_document', 'guard_appraisal_report', 'guard_media_page_url', 'guard_buyer_check', 'agent_report_imported') and coalesce(array_to_string(p.proconfig, ' '), '') <> 'search_path=public';
  if x is not null then out := out || 'SEARCH_PATH NOT SET: ' || x || '; '; end if;

  -- Tim files a report on the property (the existing uploader: storage, then agent_repo_add with the new kind)
  insert into public.properties (address) values ('RB 9 Other Road, Testville') returning id into pid2;
  insert into storage.objects (bucket_id, name, metadata) values
    ('property-files', 'properties/' || pid || '/docs/11111111-1111-4111-8111-111111111111-rb-report.pdf', '{"mimetype":"application/pdf","size":5000}'),
    ('property-files', 'properties/' || pid || '/docs/22222222-2222-4222-8222-222222222222-rb-lim.pdf', '{"mimetype":"application/pdf","size":5000}'),
    ('property-files', 'properties/' || pid2 || '/docs/33333333-3333-4333-8333-333333333333-rb-other.pdf', '{"mimetype":"application/pdf","size":5000}'),
    ('property-files', 'properties/' || pid || '/docs/44444444-4444-4444-8444-444444444444-rb-photo.jpg', '{"mimetype":"image/jpeg","size":5000}');
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  j := public.agent_repo_add(pid, jsonb_build_object('key', '11111111-1111-4111-8111-111111111111', 'kind', 'Comparables or market report', 'name', 'rb-report.pdf', 'title', 'Comparables report: rb-report.pdf',
    'path', 'properties/' || pid || '/docs/11111111-1111-4111-8111-111111111111-rb-report.pdf', 'mime_type', 'application/pdf', 'size_bytes', 5000, 'sha256', sha)); d1 := (j->>'id')::uuid;
  j := public.agent_repo_add(pid, jsonb_build_object('key', '22222222-2222-4222-8222-222222222222', 'kind', 'LIM report', 'name', 'rb-lim.pdf', 'path', 'properties/' || pid || '/docs/22222222-2222-4222-8222-222222222222-rb-lim.pdf', 'mime_type', 'application/pdf', 'size_bytes', 5000, 'sha256', sha)); d2 := (j->>'id')::uuid;
  j := public.agent_repo_add(pid2, jsonb_build_object('key', '33333333-3333-4333-8333-333333333333', 'kind', 'Comparables or market report', 'name', 'rb-other.pdf', 'path', 'properties/' || pid2 || '/docs/33333333-3333-4333-8333-333333333333-rb-other.pdf', 'mime_type', 'application/pdf', 'size_bytes', 5000, 'sha256', sha)); dother := (j->>'id')::uuid;
  j := public.agent_repo_add(pid, jsonb_build_object('key', '44444444-4444-4444-8444-444444444444', 'kind', 'Comparables or market report', 'name', 'rb-photo.jpg', 'path', 'properties/' || pid || '/docs/44444444-4444-4444-8444-444444444444-rb-photo.jpg', 'mime_type', 'image/jpeg', 'size_bytes', 5000, 'sha256', sha)); dimg := (j->>'id')::uuid;
  select folder into x from public.property_documents where id = d1;
  out := out || 'report filed in the one store, folder ' || coalesce(x, 'NONE') || '; ';
  -- it stays a report and is never shared; nothing else becomes one
  begin perform public.agent_repo_share(d1, true); out := out || 'A REPORT WAS SHARED; '; exception when undefined_function then
    begin update public.property_documents set shared_at = now() where id = d1; out := out || 'A REPORT WAS SHARED; '; exception when others then out := out || 'sharing a report: ' || sqlerrm || '; '; end; end;
  begin update public.property_documents set kind = 'Other' where id = d1; out := out || 'A REPORT BECAME ANOTHER KIND; '; exception when others then out := out || 'kind away: refused; '; end;
  begin update public.property_documents set kind = 'Comparables or market report' where id = d2; out := out || 'A LIM BECAME A REPORT; '; exception when others then out := out || 'kind to report: ' || sqlerrm || '; '; end;
  update public.property_documents set title = 'RB report, retitled' where id = d1; get diagnostics n = row_count; out := out || 'title change allowed: ' || n || '; ';
  -- Tim can't write a reading himself
  begin insert into public.appraisal_reports (appraisal_id, document_id, result, model, read_by) values (hid, d1, '{"comps":[],"market":[]}', 'm', 'x'); out := out || 'TIM WROTE A READING DIRECTLY; '; exception when others then out := out || 'direct reading: refused; '; end;
  begin perform public.appraisal_report_save(hid, d1, '{"comps":[],"market":[]}', 'm', 1, 'x'); out := out || 'TIM CALLED THE SAVE; '; exception when others then out := out || 'save as Tim: refused; '; end;
  execute 'reset role';

  -- as the doc-prefill function (service role): the source checks, then a reading
  execute 'set local role service_role';
  j := public.appraisal_report_source(hid, d1);
  if j->>'path' is distinct from 'properties/' || pid || '/docs/11111111-1111-4111-8111-111111111111-rb-report.pdf' then out := out || 'THE SOURCE PATH IS WRONG: ' || j::text || '; '; else out := out || 'source: the report''s path; '; end if;
  if j->>'subject' is distinct from (select address from public.appraisal_views where id = hid) then out := out || 'THE SOURCE DOES NOT NAME THE SUBJECT: ' || j::text || '; '; else out := out || 'source: names the subject property; '; end if;
  begin perform public.appraisal_report_source(hid, d2); out := out || 'A LIM WAS READ AS A REPORT; '; exception when others then out := out || 'a LIM: ' || sqlerrm || '; '; end;
  begin perform public.appraisal_report_source(hid, dother); out := out || 'ANOTHER PROPERTY''S REPORT WAS READ; '; exception when others then out := out || 'another property: ' || sqlerrm || '; '; end;
  begin perform public.appraisal_report_source(hid, dimg); out := out || 'A PHOTO WAS READ AS A REPORT; '; exception when others then out := out || 'not a PDF: refused; '; end;
  res := '{"report":{"source":"relab","title":"RB invented report"},"comps":[{"id":"c1","page":2,"address":"RB 3 Read Road, Testville","price":510000},{"id":"c2","page":3,"address":"RB 5 Read Road, Testville"}],"market":[{"id":"m1","page":4,"area":"Testville","month":"2026-10","median":520000}]}';
  rep := public.appraisal_report_save(hid, d1, res, 'claude-haiku-5-5', 6, 'agent@example.test');
  begin perform public.appraisal_report_save(hid, d1, '{"comps":"x"}', 'm', 1, 'a'); out := out || 'A BAD READING SAVED; '; exception when others then out := out || 'bad reading: refused; '; end;
  begin update public.appraisal_reports set result = '{"comps":[],"market":[]}' where id = rep; out := out || 'A READING CHANGED; '; exception when others then out := out || 'a reading never changes: ' || sqlerrm || '; '; end;
  begin delete from public.appraisal_reports where id = rep; out := out || 'A READING WAS REMOVED; '; exception when others then out := out || 'a reading is kept: refused; '; end;
  execute 'reset role';
  -- Tim records his ticks, once, only of items the reading holds
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  select count(*) into n from public.appraisal_reports; out := out || 'Tim reads ' || n || ' reading; ';
  begin perform public.agent_report_imported(rep, array['c9'], array[]::text[]); out := out || 'A TICK NOT IN THE READING WAS RECORDED; '; exception when others then out := out || 'tick not in the reading: ' || sqlerrm || '; '; end;
  j := public.agent_report_imported(rep, array['c1'], array['m1']);
  select imported::text || '|' || imported_by into x from public.appraisal_reports where id = rep;
  if x is distinct from '{"comps": ["c1"], "months": ["m1"]}|' || (agent::jsonb->>'email') then out := out || 'THE TICKS ARE NOT AS RECORDED: ' || coalesce(x, 'none') || '; '; else out := out || 'ticks recorded: c1 and m1, by Tim; '; end if;
  begin perform public.agent_report_imported(rep, array[]::text[], array[]::text[]); out := out || 'TICKS RECORDED TWICE; '; exception when others then out := out || 'ticks twice: refused; '; end;
  execute 'reset role';

  -- a fetched photo keeps the listing page it came from; it never changes afterwards
  insert into storage.objects (bucket_id, name, metadata) values ('appraisal-media', 'appraisals/' || hid || '/comps/' || c1 || '/fetch-' || repeat('a', 32) || '.jpg', '{"mimetype":"image/jpeg","size":4000}');
  execute 'set local role service_role';
  insert into public.appraisal_media (appraisal_id, comp_id, path, source, source_url, page_url, created_by) values (hid, c1, 'appraisals/' || hid || '/comps/' || c1 || '/fetch-' || repeat('a', 32) || '.jpg', 'url', 'https://photos.example.com/rb1.jpg', 'https://listings.example.com/rb1', 'agent@example.test') returning id into k1;
  execute 'reset role';
  select source || '|' || source_url || '|' || page_url || '|' || mime_type || '|' || created_by into x from public.appraisal_media where id = k1;
  if x is distinct from 'url|https://photos.example.com/rb1.jpg|https://listings.example.com/rb1|image/jpeg|agent@example.test' then out := out || 'THE FETCHED PHOTO IS NOT AS FILED: ' || coalesce(x, 'none') || '; '; else out := out || 'fetched photo filed with its image and page links; '; end if;
  begin update public.appraisal_media set page_url = 'https://elsewhere.example.com/' where id = k1; out := out || 'A PAGE LINK CHANGED; '; exception when others then out := out || 'page link change: refused; '; end;
  begin insert into public.appraisal_media (appraisal_id, comp_id, path, page_url) values (hid, c1, 'appraisals/' || hid || '/comps/' || c1 || '/before.jpg', 'ftp://x.example.com/'); out := out || 'AN FTP PAGE LINK SAVED; '; exception when others then out := out || 'ftp page link: refused; '; end;
  update public.appraisal_media set cover = true where id = k1; get diagnostics n = row_count; out := out || 'print photo still choosable: ' || n || '; ';

  -- case-by-case suburbs and the AI's verdicts
  insert into public.suburb_groups (name, suburbs, mode) values ('RB mixed area', array['Rbmix'], 'case_by_case');
  begin insert into public.suburb_groups (name, suburbs, mode) values ('RB bad', array['x'], 'sometimes'); out := out || 'AN UNKNOWN MODE SAVED; '; exception when others then out := out || 'unknown mode: refused; '; end;
  insert into public.appraisal_comps (appraisal_id, position, status, address, suburb) values (hid, 2, 'sold', 'RB 7 Mix Road, Rbmix', 'Rbmix') returning id into c2;
  select id into aid2 from public.appraisal_views where id <> hid and setup ? 'v' limit 1;
  execute 'set local role service_role';
  chk := public.appraisal_buyer_save(hid, '{"verdict":"owner","reason":"Three bedrooms on a family section."}', jsonb_build_object(c2::text, jsonb_build_object('verdict', 'investor', 'reason', 'Six bedrooms in 120 m2, advertised as tenanted.')), 'claude-haiku-5-5', 'agent@example.test');
  begin perform public.appraisal_buyer_save(hid, '{"verdict":"maybe"}', '{}', 'm', 'a'); out := out || 'A BAD VERDICT SAVED; '; exception when others then out := out || 'bad verdict: refused; '; end;
  begin perform public.appraisal_buyer_save(hid, '{"verdict":"owner"}', jsonb_build_object(gen_random_uuid()::text, jsonb_build_object('verdict', 'owner')), 'm', 'a'); out := out || 'A VERDICT FOR A STRANGER SAVED; '; exception when others then out := out || 'verdict for a comparable not on it: refused; '; end;
  begin update public.appraisal_buyer_checks set subject = '{"verdict":"investor"}' where id = chk; out := out || 'A CHECK CHANGED; '; exception when others then out := out || 'a check never changes: refused; '; end;
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  select (comps->c2::text->>'verdict') || '|' || (subject->>'verdict') into x from public.appraisal_buyer_checks where id = chk;
  if x is distinct from 'investor|owner' then out := out || 'TIM CAN''T READ THE CHECK: ' || coalesce(x, 'none') || '; '; else out := out || 'Tim reads the check; '; end if;
  begin insert into public.appraisal_buyer_checks (appraisal_id, subject, comps, model, checked_by) values (hid, '{"verdict":"owner"}', '{}', 'm', 'x'); out := out || 'TIM WROTE A CHECK DIRECTLY; '; exception when others then out := out || 'direct check: refused; '; end;
  update public.suburb_groups set mode = 'case_by_case' where id = g0; get diagnostics n = row_count; out := out || 'Tim switches a group to case by case: ' || n || '; ';
  execute 'reset role';

  -- a signed-in vendor sees and changes nothing; anon nothing
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', vendor, true);
  select (select count(*) from public.appraisal_reports) + (select count(*) from public.appraisal_buyer_checks) into n;
  if n <> 0 then out := out || 'A VENDOR SEES ' || n || ' ROWS; '; else out := out || 'vendor sees: 0; '; end if;
  begin perform public.agent_report_imported(rep, array[]::text[], array[]::text[]); out := out || 'A VENDOR RECORDED TICKS; '; exception when others then out := out || 'vendor ticks: refused; '; end;
  execute 'reset role';
  begin execute 'set local role anon'; perform count(*) from public.appraisal_reports; out := out || 'ANON READ THE READINGS; '; exception when others then out := out || 'anon read: refused; '; end;
  execute 'reset role';

  -- once sent, nothing more: no new reading, no new check, no ticks
  perform set_config('app.appraisal_send', 'on', true);
  update public.appraisal_views set status = 'sent' where id = hid;
  perform set_config('app.appraisal_send', '', true);
  execute 'set local role service_role';
  begin perform public.appraisal_report_save(hid, d1, res, 'm', 1, 'a'); out := out || 'A READING WAS ADDED TO A SENT APPRAISAL; '; exception when others then out := out || 'sent, reading: refused; '; end;
  begin perform public.appraisal_buyer_save(hid, '{"verdict":"owner"}', '{}', 'm', 'a'); out := out || 'A CHECK WAS ADDED TO A SENT APPRAISAL; '; exception when others then out := out || 'sent, check: refused; '; end;
  execute 'reset role';

  if out ~* 'null value in column|violates foreign key|violates unique|does not exist|syntax error|ambiguous' then out := out || 'A FIXTURE DID NOT MATCH THE SCHEMA; '; end if;
  raise exception 'ROLLBACK %', out;
end $t$;

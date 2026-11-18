-- Rollback test for migration 016 (photos and documents on the property file). Run with onboarding/tests/repo-rollback.js,
-- which puts PART A of the migration inside the block (PART B, the storage bucket and its policies, is not run), so one
-- statement creates everything, runs the checks and then raises, which undoes it all. Nothing is kept.
-- The stored files: repo_object() reads storage.objects in the bucket that PART B makes. The first checks use the real
-- function (nothing has arrived); then, inside this block only, it is replaced by a stand-in that answers from a list of
-- "uploaded" files, so filing can be tested without a bucket. The replacement is undone with everything else.
-- The output is the exception message: refusals read in lower case; a line in CAPITALS means something that should have
-- been refused was allowed, or a value was wrong. No DELETE anywhere, except the ones the test expects to be refused.
-- Last run: 18 November 2026 (after the first review: owner rounds, contacts, dropped-in items, withheld details, truncate,
-- indexes), live project hwpwyjxhdvlqrjwzxzqz, with PART A as committed (comment lines left out): every line as expected, no
-- CAPITALS, no [NULL]; afterwards the project had no repo_kinds, repo_party or other new function, property_documents had its
-- 9 columns as before, agent_reopen_property was the 013 body, and no test row, agreement or sign-in was left. PART B's storage
-- policies were created and rolled back separately to check they parse (the vendor read policy has since been removed); the
-- bucket row was not run.
do $t$
declare out text := ''; r jsonb; pid uuid; pid2 uuid; iid uuid; iid2 uuid; ph uuid; ap uuid; gen uuid; dr uuid; n int; x text; ex jsonb; lim uuid; aid uuid;
  cuid uuid := '11111111-1111-1111-1111-1111111111d3'; suid uuid := '11111111-1111-1111-1111-1111111111d4'; nuid uuid := '11111111-1111-1111-1111-1111111111d5';
  contact text := '{"email":"rb-repo-contact@example.com","sub":"11111111-1111-1111-1111-1111111111d3","role":"authenticated"}';
  signer text := '{"email":"rb-repo-signer@example.com","sub":"11111111-1111-1111-1111-1111111111d4","role":"authenticated"}';
  newown text := '{"email":"rb-repo-new@example.com","sub":"11111111-1111-1111-1111-1111111111d5","role":"authenticated"}';
  k1 uuid := 'aaaaaaaa-0000-4000-8000-000000000001'; k2 uuid := 'aaaaaaaa-0000-4000-8000-000000000002'; k3 uuid := 'aaaaaaaa-0000-4000-8000-000000000003';
  vuid uuid := '11111111-1111-1111-1111-1111111111d1'; ouid uuid := '11111111-1111-1111-1111-1111111111d2';
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text;
  vendor text := '{"email":"rb-repo-vendor@example.com","sub":"11111111-1111-1111-1111-1111111111d1","role":"authenticated"}';
  other text := '{"email":"rb-repo-other@example.com","sub":"11111111-1111-1111-1111-1111111111d2","role":"authenticated"}';
  sha text := repeat('ab', 32);
  item jsonb;
begin
  execute $mig$__MIGRATION__$mig$;
  insert into auth.users (id, email, aud, role) values (vuid, 'rb-repo-vendor@example.com', 'authenticated', 'authenticated'), (ouid, 'rb-repo-other@example.com', 'authenticated', 'authenticated'),
    (cuid, 'rb-repo-contact@example.com', 'authenticated', 'authenticated'), (suid, 'rb-repo-signer@example.com', 'authenticated', 'authenticated'), (nuid, 'rb-repo-new@example.com', 'authenticated', 'authenticated');
  insert into public.properties (address, description, disclosures, owners_on_title, title_ref, legal_description)
    values ('RB 16 Repo Street, Dunedin', '{"pBed":"3","pLand":"650 m2","pLove":"The morning sun","pType":"House"}', '{"meth":"no","wt":"yes","wtDetail":"Monolithic, 2001"}',
            'Jane Example and John Example', 'OT1/234', 'Lot 1 DP 1234') returning id into pid;
  perform set_config('app.council_accept', 'on', true);
  update public.properties set found = '{"zone":{"value":"General Residential 1","label":"Zone","source":"dcc_2gp","source_name":"Dunedin City Council, 2GP","as_of_label":"current","note":"Not a substitute for a LIM","fetched_at":"2026-11-18T01:00:00Z"}}' where id = pid;
  perform set_config('app.council_accept', '', true);
  insert into public.properties (address) values ('RB 17 Other Street, Dunedin') returning id into pid2;
  insert into public.property_people (property_id, position, legal_name, email, role) values (pid, 1, 'Jane Example', 'rb-repo-vendor@example.com', 'owner'),
    (pid, 2, 'Old Owner', 'rb-repo-other@example.com', 'former'), (pid, 3, 'Cam Contact', 'rb-repo-contact@example.com', 'contact');
  -- an agreement of this round, made yesterday, with a signer who is not on property_people
  insert into public.agreements (ref, address, property_id, status, config, answers, created_at) values ('RB-016-1', 'RB 16 Repo Street, Dunedin', pid, 'sent', '{}', '{}', now() - interval '1 day') returning id into aid;
  insert into public.agreement_people (agreement_id, position, legal_name, email, user_id) values (aid, 1, 'Sid Signer', 'rb-repo-signer@example.com', suid);
  insert into public.property_inspections (property_id, created_by) values (pid, 'rb') returning id into iid;
  insert into public.property_inspections (property_id, created_by) values (pid2, 'rb') returning id into iid2;
  out := out || 'kinds=' || (select count(*) from public.repo_kinds) || ' folders=' || (select count(distinct folder) from public.repo_kinds) || '; ';

  -- 1. the agent files a photo; nothing has arrived yet
  perform set_config('request.jwt.claims', agent, true);
  execute 'set local role authenticated';
  item := jsonb_build_object('key', k1, 'kind', 'Photo', 'name', 'IMG_0001.jpg', 'title', 'North face', 'path', 'properties/' || pid || '/photos/' || k1 || '.jpg',
    'thumb_path', 'properties/' || pid || '/photos/' || k1 || '.thumb.jpg', 'mime_type', 'image/jpeg', 'size_bytes', 812345, 'sha256', sha, 'room', 'Outside',
    'taken_at', '2026-11-18T01:02:03Z', 'width', 2560, 'height', 1920, 'inspection_id', iid);
  begin perform public.agent_repo_add(pid, item); out := out || 'FILED WITHOUT A FILE; '; exception when others then out := out || 'no file: ' || sqlerrm || '; '; end;
  execute 'reset role';
  -- a stand-in for storage: the files "uploaded" in this block
  create temp table rb_objects (name text primary key, size bigint, mime text) on commit drop;
  grant all on rb_objects to authenticated;
  execute $f$create or replace function public.repo_object(p_path text) returns jsonb language sql stable security definer set search_path = public, pg_temp as $q$
    select jsonb_build_object('size', size, 'mime', mime) from pg_temp.rb_objects where name = p_path $q$$f$;
  insert into rb_objects values ('properties/' || pid || '/photos/' || k1 || '.jpg', 812345, 'image/jpeg'), ('properties/' || pid || '/photos/' || k1 || '.thumb.jpg', 30000, 'image/jpeg'),
    ('properties/' || pid || '/docs/' || k2 || '-appraisal.pdf', 50000, 'application/pdf'), ('properties/' || pid || '/docs/' || k3 || '-LIM.pdf', 90000, 'application/pdf');
  perform set_config('request.jwt.claims', agent, true);
  execute 'set local role authenticated';
  begin perform public.agent_repo_add(pid, item || '{"size_bytes": 812346}'); out := out || 'SIZE MISMATCH FILED; '; exception when others then out := out || 'size mismatch: ' || sqlerrm || '; '; end;
  begin perform public.agent_repo_add(pid, item || '{"mime_type": "image/png"}'); out := out || 'PNG PHOTO FILED; '; exception when others then out := out || 'png photo: ' || sqlerrm || '; '; end;
  begin perform public.agent_repo_add(pid, item || '{"kind": "Holiday snap"}'); out := out || 'FREE KIND FILED; '; exception when others then out := out || 'free kind: ' || sqlerrm || '; '; end;
  begin perform public.agent_repo_add(pid, item || jsonb_build_object('path', 'properties/' || pid2 || '/photos/' || k1 || '.jpg')); out := out || 'OTHER PATH FILED; '; exception when others then out := out || 'other path: ' || sqlerrm || '; '; end;
  begin perform public.agent_repo_add(pid, item || '{"sha256": "nope"}'); out := out || 'NO FINGERPRINT FILED; '; exception when others then out := out || 'fingerprint: ' || sqlerrm || '; '; end;
  begin perform public.agent_repo_add(pid, item || '{"size_bytes": 30000000}'); out := out || 'TOO BIG FILED; '; exception when others then out := out || 'too big: ' || sqlerrm || '; '; end;
  begin perform public.agent_repo_add(pid, item || '{"mime_type": "text/html"}'); out := out || 'HTML FILED; '; exception when others then out := out || 'html: ' || sqlerrm || '; '; end;
  begin perform public.agent_repo_add(pid, item || jsonb_build_object('inspection_id', iid2)); out := out || 'OTHER INSPECTION FILED; '; exception when others then out := out || 'other inspection: ' || sqlerrm || '; '; end;
  r := public.agent_repo_add(pid, item); ph := (r->>'id')::uuid;
  out := out || 'photo filed existing=' || (r->>'existing') || '; ';
  r := public.agent_repo_add(pid, item);
  out := out || 'again same id=' || ((r->>'id')::uuid = ph) || ' existing=' || (r->>'existing') || ' rows=' || (select count(*) from public.property_documents where client_key = k1) || '; ';
  begin perform public.agent_repo_add(pid2, item); out := out || 'SAME KEY ON ANOTHER PROPERTY; '; exception when others then out := out || 'key elsewhere: ' || sqlerrm || '; '; end;
  select folder || '/' || bucket || '/' || source || '/' || coalesce(room, '-') || '/' || coalesce(inspection_id::text = iid::text, false) into x from public.property_documents where id = ph;
  out := out || 'photo row ' || x || '; ';
  r := public.agent_repo_add(pid, jsonb_build_object('key', k2, 'kind', 'Appraisal', 'name', 'appraisal.pdf', 'path', 'properties/' || pid || '/docs/' || k2 || '-appraisal.pdf', 'mime_type', 'application/pdf', 'size_bytes', 50000, 'sha256', sha));
  ap := (r->>'id')::uuid;
  r := public.agent_repo_add(pid, jsonb_build_object('key', k3, 'kind', 'LIM report', 'name', 'LIM.pdf', 'path', 'properties/' || pid || '/docs/' || k3 || '-LIM.pdf', 'mime_type', 'application/pdf', 'size_bytes', 90000, 'sha256', sha, 'issued_on', '2026-10-01'));
  lim := (r->>'id')::uuid;
  -- the dropped-in path (direct insert, as today) still works
  insert into public.property_documents (property_id, name, path, kind, source, created_by) values (pid, 'Title.pdf', 'imports/' || gen_random_uuid() || '/1-Title.pdf', 'Record of title', 'dropped', 'rb') returning id into dr;
  out := out || 'dropped insert folder=' || (select folder from public.property_documents where id = dr) || '; ';
  begin insert into public.property_documents (property_id, name, path, kind, source, shared_at) values (pid, 'x', 'imports/x/1-x', 'Other', 'dropped', now()); out := out || 'INSERTED SHARED; ';
  exception when others then out := out || 'insert shared: ' || sqlerrm || '; '; end;
  begin insert into public.property_documents (property_id, name, path, kind, source, bucket) values (pid, 'x', 'properties/' || pid2 || '/docs/x', 'Other', 'uploaded', 'property-files'); out := out || 'INSERTED INTO ANOTHER FOLDER; ';
  exception when others then out := out || 'insert elsewhere: ' || sqlerrm || '; '; end;

  -- 2. sharing: on, seen by the vendor (and the preview), off again
  perform public.agent_repo_share(ph, true);
  out := out || 'shared by=' || coalesce((select shared_by from public.property_documents where id = ph), '[NULL]') || '; ';
  begin perform public.agent_repo_share(ap, true); out := out || 'APPRAISAL SHARED; '; exception when others then out := out || 'share appraisal: ' || sqlerrm || '; '; end;
  begin update public.property_documents set shared_at = now() where id = ap; out := out || 'APPRAISAL SHARED DIRECTLY; '; exception when others then out := out || 'direct share appraisal: ' || sqlerrm || '; '; end;
  begin perform public.agent_repo_set(ph, '{"kind":"Offer"}'); out := out || 'SHARED ITEM BECAME AN OFFER; '; exception when others then out := out || 'shared to offer: ' || sqlerrm || '; '; end;
  begin perform public.agent_repo_set(ph, '{"kind":"Whatever"}'); out := out || 'FREE KIND SET; '; exception when others then out := out || 'set free kind: ' || sqlerrm || '; '; end;
  perform public.agent_repo_set(ph, '{"caption":"From the street","room":"Front"}');
  perform set_config('request.jwt.claims', vendor, true);
  select count(*) into n from public.vendor_repo_list(pid);
  out := out || 'vendor sees=' || n || ' read file=' || public.repo_vendor_can_read('properties/' || pid || '/photos/' || k1 || '.jpg')
    || ' read preview=' || public.repo_vendor_can_read('properties/' || pid || '/photos/' || k1 || '.thumb.jpg')
    || ' read appraisal=' || public.repo_vendor_can_read('properties/' || pid || '/docs/' || k2 || '-appraisal.pdf') || '; ';
  select count(*) into n from public.property_documents; out := out || 'vendor table rows=' || n || '; ';
  select count(*) into n from public.property_document_events; out := out || 'vendor event rows=' || n || '; ';
  begin perform public.agent_repo_share(ph, false); out := out || 'VENDOR UNSHARED; '; exception when others then out := out || 'vendor share: ' || sqlerrm || '; '; end;
  begin perform public.agent_repo_add(pid, item); out := out || 'VENDOR FILED; '; exception when others then out := out || 'vendor add: ' || sqlerrm || '; '; end;
  begin perform public.agent_property_export(pid); out := out || 'VENDOR EXPORTED; '; exception when others then out := out || 'vendor export: ' || sqlerrm || '; '; end;
  perform set_config('request.jwt.claims', other, true);
  select count(*) into n from public.vendor_repo_list(pid);
  out := out || 'former owner sees=' || n || ' reads=' || public.repo_vendor_can_read('properties/' || pid || '/photos/' || k1 || '.jpg') || '; ';
  perform set_config('request.jwt.claims', contact, true);
  out := out || 'contact sees=' || (select count(*) from public.vendor_repo_list(pid)) || ' reads=' || public.repo_vendor_can_read('properties/' || pid || '/photos/' || k1 || '.jpg')
    || ' is_property_party=' || public.is_property_party(pid) || '; ';
  perform set_config('request.jwt.claims', signer, true);
  out := out || 'signer (this round) sees=' || (select count(*) from public.vendor_repo_list(pid)) || ' reads=' || public.repo_vendor_can_read('properties/' || pid || '/photos/' || k1 || '.jpg') || '; ';
  perform set_config('request.jwt.claims', agent, true);
  perform public.agent_repo_share(ph, false);
  perform set_config('request.jwt.claims', vendor, true);
  out := out || 'after unshare vendor sees=' || (select count(*) from public.vendor_repo_list(pid)) || ' reads=' || public.repo_vendor_can_read('properties/' || pid || '/photos/' || k1 || '.jpg') || '; ';

  -- 3. remove (archive) and restore; never a delete
  perform set_config('request.jwt.claims', agent, true);
  perform public.agent_repo_share(ph, true);
  perform public.agent_repo_archive(ph, true);
  select (archived_at is not null) || '/' || (shared_at is null) || '/' || coalesce(archived_by, '[NULL]') into x from public.property_documents where id = ph;
  out := out || 'archived/unshared ' || x || '; ';
  begin perform public.agent_repo_share(ph, true); out := out || 'ARCHIVED SHARED; '; exception when others then out := out || 'share archived: ' || sqlerrm || '; '; end;
  perform set_config('request.jwt.claims', vendor, true);
  out := out || 'archived vendor sees=' || (select count(*) from public.vendor_repo_list(pid)) || '; ';
  perform set_config('request.jwt.claims', agent, true);
  perform public.agent_repo_archive(ph, false);
  out := out || 'restored shared=' || (select shared_at is not null from public.property_documents where id = ph) || '; ';
  begin delete from public.property_documents where id = ph; get diagnostics n = row_count; out := out || 'AGENT DELETE rows=' || n || '; '; exception when others then out := out || 'agent delete: ' || sqlerrm || '; '; end;
  begin update public.property_documents set path = 'imports/x' where id = ph; out := out || 'PATH CHANGED; '; exception when others then out := out || 'path change: ' || sqlerrm || '; '; end;
  begin update public.property_documents set sha256 = repeat('cd', 32) where id = ph; out := out || 'FINGERPRINT CHANGED; '; exception when others then out := out || 'fingerprint change: ' || sqlerrm || '; '; end;
  begin update public.property_documents set client_key = gen_random_uuid() where id = ph; out := out || 'KEY CHANGED; '; exception when others then out := out || 'key change: ' || sqlerrm || '; '; end;
  begin update public.property_documents set folder = 'agency' where id = ph; out := out || 'folder by hand=' || (select folder from public.property_documents where id = ph) || '; '; exception when others then out := out || 'FOLDER: ' || sqlerrm || '; '; end;
  execute 'reset role';
  begin delete from public.property_documents where id = dr; out := out || 'OWNER DELETE; '; exception when others then out := out || 'owner delete: ' || sqlerrm || '; '; end;

  -- 4. a generated (signed) document, filed as fn/notify.ts files it (service role): never changed, removed or shared
  execute 'set local role service_role';
  insert into public.property_documents (property_id, kind, name, path, source, created_by) values (pid, 'Vendor Declaration', 'VD.pdf', 'properties/' || pid || '/generated/x-VD.pdf', 'generated', 'system') returning id into gen;
  execute 'reset role';
  out := out || 'generated folder=' || (select folder from public.property_documents where id = gen) || '; ';
  perform set_config('request.jwt.claims', agent, true);
  execute 'set local role authenticated';
  begin update public.property_documents set name = 'changed.pdf' where id = gen; out := out || 'GENERATED RENAMED; '; exception when others then out := out || 'rename generated: ' || sqlerrm || '; '; end;
  begin perform public.agent_repo_archive(gen, true); out := out || 'GENERATED ARCHIVED; '; exception when others then out := out || 'archive generated: ' || sqlerrm || '; '; end;
  begin perform public.agent_repo_share(gen, true); out := out || 'GENERATED SHARED; '; exception when others then out := out || 'share generated: ' || sqlerrm || '; '; end;
  begin perform public.agent_repo_set(gen, '{"title":"x"}'); out := out || 'GENERATED TITLED; '; exception when others then out := out || 'title generated: ' || sqlerrm || '; '; end;
  begin delete from public.property_documents where id = gen; out := out || 'GENERATED DELETED; '; exception when others then out := out || 'delete generated: ' || sqlerrm || '; '; end;
  begin perform public.agent_repo_share(dr, true); out := out || 'DROPPED SHARED; '; exception when others then out := out || 'share dropped: ' || sqlerrm || '; '; end;
  begin update public.property_documents set shared_at = now() where id = dr; out := out || 'DROPPED SHARED DIRECTLY; '; exception when others then out := out || 'direct share dropped: ' || sqlerrm || '; '; end;

  -- 5. the export
  ex := public.agent_property_export(pid);
  out := out || 'export schema=' || (ex->>'schema') || ' items=' || jsonb_array_length(ex->'items') || ' kinds=' || (select string_agg(i->>'kind', ',') from jsonb_array_elements(ex->'items') i)
    || ' land=' || coalesce(ex->'property'->>'land_area_m2', '[NULL]') || ' records=' || jsonb_array_length(ex->'public_records')
    || ' record source=' || coalesce(ex->'public_records'->0->>'source_name', '[NULL]')
    || ' left_out=' || (ex->'left_out')::text || '; ';
  out := out || 'export has owners=' || (ex::text like '%Jane Example%') || ' email=' || (ex::text like '%@%') || ' love=' || (ex::text like '%morning sun%')
    || ' appraisal=' || (ex::text like '%appraisal.pdf%') || ' generated=' || (ex::text like '%VD.pdf%') || ' wt=' || coalesce(ex->'property'->'disclosures'->>'weathertightness', '[NULL]')
    || ' photo room=' || coalesce((select i->>'room' from jsonb_array_elements(ex->'items') i where i->>'kind' = 'Photo'), '[NULL]') || '; ';
  out := out || 'withheld=' || (ex->'left_out'->'withheld')::text || ' detail text=' || (ex::text like '%Monolithic%') || '; ';
  ex := public.agent_property_export(pid, true);
  out := out || 'with details: detail=' || coalesce(ex->'property'->'disclosures'->>'weathertightness_detail', '[NULL]') || ' withheld=' || (ex->'left_out'->'withheld')::text || '; ';
  out := out || 'events=' || (select string_agg(kind, ',' order by id) from public.property_document_events where property_id = pid) || '; ';
  begin update public.property_document_events set actor = 'x' where property_id = pid; out := out || 'EVENT CHANGED; '; exception when others then out := out || 'event change: ' || sqlerrm || '; '; end;
  begin insert into public.property_document_events (property_id, actor, kind) values (pid, 'x', 'added'); out := out || 'EVENT INSERTED; '; exception when others then out := out || 'event insert: ' || sqlerrm || '; '; end;
  begin insert into public.repo_kinds values ('Mine', 'other', 1, true, true); out := out || 'KIND ADDED; '; exception when others then out := out || 'kind insert: ' || sqlerrm || '; '; end;
  execute 'reset role';

  -- 6. a new round of owners: shared items stop being shared, and nothing crosses between the rounds
  perform set_config('request.jwt.claims', agent, true);
  execute 'set local role authenticated';
  perform public.agent_repo_share(ph, true); perform public.agent_repo_share(lim, true);
  execute 'reset role';
  perform set_config('request.jwt.claims', signer, true);
  out := out || 'before: signer sees=' || (select count(*) from public.vendor_repo_list(pid)) || '; ';
  update public.properties set stage = 'withdrawn' where id = pid;
  select count(*) into n from public.property_document_events where property_id = pid and kind = 'unshared';
  perform set_config('request.jwt.claims', agent, true);
  execute 'set local role authenticated';
  perform public.agent_reopen_property(pid, true);
  execute 'reset role';
  out := out || 'reopen: shared left=' || (select count(*) from public.property_documents where property_id = pid and shared_at is not null)
    || ' unshared logged=' || ((select count(*) from public.property_document_events where property_id = pid and kind = 'unshared') - n)
    || ' stage=' || (select stage from public.properties where id = pid) || ' found cleared=' || (select pq.found = '{}'::jsonb from public.properties pq where pq.id = pid) || '; ';
  insert into public.property_people (property_id, position, legal_name, email, role) values (pid, 1, 'Nina New', 'rb-repo-new@example.com', 'owner');
  perform set_config('request.jwt.claims', agent, true);
  execute 'set local role authenticated';
  perform public.agent_repo_share(ph, true);
  execute 'reset role';
  perform set_config('request.jwt.claims', signer, true);
  out := out || 'old signer sees=' || (select count(*) from public.vendor_repo_list(pid)) || ' reads photo=' || public.repo_vendor_can_read('properties/' || pid || '/photos/' || k1 || '.jpg') || '; ';
  perform set_config('request.jwt.claims', vendor, true);
  out := out || 'old owner sees=' || (select count(*) from public.vendor_repo_list(pid)) || ' reads photo=' || public.repo_vendor_can_read('properties/' || pid || '/photos/' || k1 || '.jpg') || '; ';
  perform set_config('request.jwt.claims', newown, true);
  out := out || 'new owner sees=' || (select count(*) from public.vendor_repo_list(pid)) || ' reads photo=' || public.repo_vendor_can_read('properties/' || pid || '/photos/' || k1 || '.jpg')
    || ' reads old LIM=' || public.repo_vendor_can_read('properties/' || pid || '/docs/' || k3 || '-LIM.pdf') || '; ';

  -- 7. anon and grants
  execute 'set local role anon';
  begin perform public.vendor_repo_list(pid); out := out || 'ANON LISTED; '; exception when others then out := out || 'anon: ' || sqlerrm || '; '; end;
  execute 'reset role';
  out := out || 'anon exec add=' || has_function_privilege('anon', 'public.agent_repo_add(uuid, jsonb)', 'execute')
    || ' anon exec export=' || has_function_privilege('anon', 'public.agent_property_export(uuid, boolean)', 'execute')
    || ' auth truncate docs=' || has_table_privilege('authenticated', 'public.property_documents', 'truncate') || ' anon truncate docs=' || has_table_privilege('anon', 'public.property_documents', 'truncate')
    || ' indexes=' || (select count(*) from pg_indexes where tablename = 'property_documents' and indexname in ('property_documents_path', 'property_documents_thumb_path'))
    || ' auth exec object=' || has_function_privilege('authenticated', 'public.repo_object(text)', 'execute')
    || ' auth exec guard=' || has_function_privilege('authenticated', 'public.guard_property_document()', 'execute')
    || ' rls=' || (select relrowsecurity from pg_class where oid = 'public.property_document_events'::regclass) || '/' || (select relrowsecurity from pg_class where oid = 'public.repo_kinds'::regclass) || '; ';
  raise exception 'ROLLBACK %', out;
end $t$;

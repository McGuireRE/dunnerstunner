-- Rollback test for migration 036 (the header, a video introduction, What I heard, the mockup listing, the ideal buyers and Google
-- reviews). Run with onboarding/tests/appraisal-home-rollback.js, which puts the whole migration inside the block, so one statement
-- applies it, runs the checks and then raises, which undoes it all. Nothing is kept. The output is the exception message: lower case
-- reads as expected; a line in CAPITALS means something was wrong. Needs 035 and its stand-ins (tests/appraisal-home-standin.sql says
-- how the stand-in is built). Self-contained: it makes every row it needs (invented data only), so it runs the same on a stand-in, on
-- one whose appraisal_views is empty, or on live. The agent is the first row of public.agents, as in 032's to 035's tests.
do $t$
declare out text := ''; x text; n int; j jsonb; r record;
  pid uuid; aid uuid; sid uuid; hid uuid; a1 uuid; a2 uuid; dr uuid; rv1 uuid; rv2 uuid; rv4 uuid;
  views_before text; views_after text; buckets_before text; pols_before text; objs_before text;
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text;
  vendor text := json_build_object('email', 'rb-vendor@example.com', 'sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text;
  pack jsonb; today date := (now() at time zone 'Pacific/Auckland')::date;
begin
  -- self-contained: an invented property, an appraisal written from its set-up, one sent, and one loaded by hand
  insert into public.properties (address) values ('RB 3 Home Road, Rbvale') returning id into pid;
  insert into public.appraisal_views (property_id, title, address, status, setup, sections, fields) values (pid, 'RB appraisal', 'RB 3 Home Road, Rbvale', 'draft', '{"v":1}', '[]', '{}') returning id into aid;
  insert into public.appraisal_views (property_id, title, address, status, setup, sections, fields) values (pid, 'RB hand', 'RB 3 Home Road, Rbvale', 'draft', '{}', '[{"type":"para","text":"Loaded by hand."}]', '{}') returning id into hid;
  perform set_config('app.appraisal_send', 'on', true);
  insert into public.appraisal_views (property_id, title, address, status, setup, sections, fields) values (pid, 'RB sent', 'RB 3 Home Road, Rbvale', 'sent', '{"v":1}', '[]', '{}') returning id into sid;
  perform set_config('app.appraisal_send', '', true);
  select string_agg(to_jsonb(v)::text, '|' order by id) into views_before from public.appraisal_views v;
  select string_agg(to_jsonb(b)::text, '|' order by id) into buckets_before from storage.buckets b;
  select string_agg(policyname || cmd || coalesce(qual, '') || coalesce(with_check, ''), '|' order by policyname) into pols_before from pg_policies where schemaname = 'storage' and tablename = 'objects';
  select string_agg(bucket_id || name, '|' order by name) into objs_before from storage.objects;

  $mig$__MIGRATION__$mig$;

  -- nothing already there changed
  select string_agg(to_jsonb(v)::text, '|' order by id) into views_after from public.appraisal_views v;
  if views_after is distinct from views_before then out := out || 'AN EXISTING APPRAISAL CHANGED; '; else out := out || 'appraisals unchanged; '; end if;
  select string_agg(to_jsonb(b)::text, '|' order by id) into x from storage.buckets b where id <> 'appraisal-video';
  if x is distinct from buckets_before then out := out || 'AN EXISTING BUCKET CHANGED; '; else out := out || 'buckets unchanged (appraisal-media still 15 MB, photos only); '; end if;
  select string_agg(policyname || cmd || coalesce(qual, '') || coalesce(with_check, ''), '|' order by policyname) into x from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname not in ('appraisal_video_agent_read', 'appraisal_video_agent_add', 'appraisal_video_agent_remove', 'appraisal_media_agent_add_header');
  if x is distinct from pols_before then out := out || 'AN EXISTING STORAGE POLICY CHANGED; '; else out := out || 'storage policies: only added; '; end if;
  select string_agg(bucket_id || name, '|' order by name) into x from storage.objects;
  if x is distinct from objs_before then out := out || 'STORED FILES CHANGED; '; end if;

  -- the new bucket
  select public::text || '|' || file_size_limit || '|' || array_to_string(allowed_mime_types, ',') into x from storage.buckets where id = 'appraisal-video';
  if x is distinct from 'false|52428800|video/mp4,video/webm,video/quicktime' then out := out || 'THE VIDEO BUCKET IS NOT AS WRITTEN: ' || coalesce(x, 'none') || '; '; else out := out || 'video bucket: private, 50 MB, MP4, WebM, MOV; '; end if;

  -- shape: Row Level Security, policies, privileges, functions
  for r in select t from unnest(array['appraisal_assets', 'appraisal_drafts', 'tim_reviews']) t loop
    select relrowsecurity::text into x from pg_class where oid = ('public.' || r.t)::regclass;
    if x <> 'true' then out := out || 'ROW LEVEL SECURITY IS OFF ON ' || upper(r.t) || '; '; end if;
    if has_table_privilege('anon', 'public.' || r.t, 'select') or has_table_privilege('anon', 'public.' || r.t, 'insert') then out := out || 'ANON HAS A PRIVILEGE ON ' || upper(r.t) || '; '; end if;
    if has_table_privilege('authenticated', 'public.' || r.t, 'update') or has_table_privilege('authenticated', 'public.' || r.t, 'truncate') then out := out || 'SIGNED-IN USERS CAN UPDATE ' || upper(r.t) || '; '; end if;
    if r.t <> 'appraisal_assets' and (has_table_privilege('authenticated', 'public.' || r.t, 'insert') or has_table_privilege('authenticated', 'public.' || r.t, 'delete')) then out := out || 'SIGNED-IN USERS CAN WRITE ' || upper(r.t) || '; '; end if;
  end loop;
  select string_agg(tablename || '.' || policyname || ':' || cmd || ':' || array_to_string(roles, '+') || ':' || coalesce(qual, '-') || ':' || coalesce(with_check, '-'), ',' order by tablename, policyname) into x
    from pg_policies where schemaname = 'public' and tablename in ('appraisal_assets', 'appraisal_drafts', 'tim_reviews');
  if x is distinct from 'appraisal_assets.appraisal_assets_agent_add:INSERT:authenticated:-:is_agent(),appraisal_assets.appraisal_assets_agent_read:SELECT:authenticated:is_agent():-,appraisal_assets.appraisal_assets_agent_remove:DELETE:authenticated:is_agent():-,appraisal_drafts.appraisal_drafts_agent_read:SELECT:authenticated:is_agent():-,tim_reviews.tim_reviews_agent_read:SELECT:authenticated:is_agent():-' then
    out := out || 'POLICIES NOT AS WRITTEN: ' || coalesce(x, 'none') || '; '; else out := out || 'three tables: rls on, Tim only, no updates, drafts and reviews written only by functions; '; end if;
  select string_agg(p.oid::regprocedure::text, ',' order by 1) into x from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('guard_appraisal_asset', 'guard_appraisal_draft', 'appraisal_draft_save', 'agent_reviews_import', 'agent_review_tick')
    and (has_function_privilege('anon', p.oid, 'execute') or (p.proname not like 'agent_%' and has_function_privilege('authenticated', p.oid, 'execute')));
  if x is not null then out := out || 'CALLABLE WHEN IT SHOULD NOT BE: ' || x || '; '; else out := out || 'functions: none for anon, the save for the service role only; '; end if;
  if not has_function_privilege('service_role', 'public.appraisal_draft_save(uuid,text,jsonb,jsonb,text,text)', 'execute') then out := out || 'THE SERVICE ROLE CANNOT SAVE A DRAFT; '; end if;
  if not has_function_privilege('authenticated', 'public.agent_reviews_import(jsonb)', 'execute') or not has_function_privilege('authenticated', 'public.agent_review_tick(uuid,boolean)', 'execute') then out := out || 'TIM CANNOT IMPORT OR TICK REVIEWS; '; end if;
  select string_agg(p.proname, ',') into x from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('guard_appraisal_asset', 'guard_appraisal_draft', 'appraisal_draft_save', 'agent_reviews_import', 'agent_review_tick') and coalesce(array_to_string(p.proconfig, ' '), '') <> 'search_path=public';
  if x is not null then out := out || 'NO SEARCH PATH: ' || x || '; '; end if;

  -- ── storage, as Tim: the video bucket and the header and intro folders; never once sent; never a vendor ──
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  insert into storage.objects (bucket_id, name, metadata) values ('appraisal-video', 'appraisals/' || aid || '/header/rb.webm', '{"mimetype":"video/webm","size":2000000}');
  insert into storage.objects (bucket_id, name, metadata) values ('appraisal-media', 'appraisals/' || aid || '/header/rb-still.jpg', '{"mimetype":"image/jpeg","size":40000}');
  insert into storage.objects (bucket_id, name, metadata) values ('appraisal-media', 'appraisals/' || aid || '/header/rb-photo.jpg', '{"mimetype":"image/jpeg","size":50000}');
  insert into storage.objects (bucket_id, name, metadata) values ('appraisal-video', 'appraisals/' || aid || '/intro/rb-hello.mp4', '{"mimetype":"video/mp4","size":52428801}');
  insert into storage.objects (bucket_id, name, metadata) values ('appraisal-video', 'appraisals/' || aid || '/intro/rb-ok.mp4', '{"mimetype":"video/mp4","size":30000000}');
  out := out || 'Tim adds a video, a still and a photo under header/ and intro/; ';
  begin insert into storage.objects (bucket_id, name, metadata) values ('appraisal-video', 'appraisals/' || aid || '/comps/rb.webm', '{}'); out := out || 'A VIDEO WENT INTO COMPS; '; exception when others then out := out || 'video outside header and intro: refused; '; end;
  begin insert into storage.objects (bucket_id, name, metadata) values ('appraisal-video', 'appraisals/' || sid || '/header/rb.webm', '{}'); out := out || 'A VIDEO WAS ADDED TO A SENT APPRAISAL; '; exception when others then out := out || 'sent, video: refused; '; end;
  begin insert into storage.objects (bucket_id, name, metadata) values ('appraisal-media', 'appraisals/' || sid || '/header/rb.jpg', '{}'); out := out || 'A PHOTO WAS ADDED TO A SENT APPRAISAL''S HEADER; '; exception when others then out := out || 'sent, header photo: refused; '; end;
  begin insert into storage.objects (bucket_id, name, metadata) values ('appraisal-video', 'appraisals/' || gen_random_uuid() || '/header/rb.webm', '{}'); out := out || 'A VIDEO WENT INTO A FOLDER WITH NO APPRAISAL; '; exception when others then out := out || 'video, no such appraisal: refused; '; end;
  begin insert into storage.objects (bucket_id, name, metadata) values ('appraisal-media', 'appraisals/not-an-id/intro/rb.jpg', '{}'); out := out || 'A PHOTO WENT INTO A FOLDER WITH NO APPRAISAL; '; exception when others then out := out || 'photo, no such appraisal: refused; '; end;
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', vendor, true);
  begin insert into storage.objects (bucket_id, name, metadata) values ('appraisal-video', 'appraisals/' || aid || '/header/rb-v.webm', '{}'); out := out || 'A VENDOR UPLOADED A VIDEO; '; exception when others then out := out || 'vendor upload: refused; '; end;
  select count(*) into n from storage.objects where bucket_id = 'appraisal-video';
  if n <> 0 then out := out || 'A VENDOR SEES ' || n || ' VIDEOS; '; else out := out || 'vendor sees no videos; '; end if;
  execute 'reset role';

  -- ── the assets, as Tim ──
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  insert into public.appraisal_assets (appraisal_id, role, kind, bucket, path, still_path, file_name, mime_type, size_bytes) values (aid, 'header', 'video', 'appraisal-video', 'appraisals/' || aid || '/header/rb.webm', 'appraisals/' || aid || '/header/rb-still.jpg', 'rb.webm', 'video/fake', 1) returning id into a1;
  select mime_type || '|' || size_bytes || '|' || still_mime into x from public.appraisal_assets where id = a1;
  if x is distinct from 'video/webm|2000000|image/jpeg' then out := out || 'THE TYPE AND SIZE WERE NOT READ FROM STORAGE: ' || coalesce(x, 'none') || '; '; else out := out || 'a header video filed, its type and size read from storage, not the page; '; end if;
  insert into public.appraisal_assets (appraisal_id, role, kind, bucket, path) values (aid, 'header', 'image', 'appraisal-media', 'appraisals/' || aid || '/header/rb-photo.jpg') returning id into a2;
  out := out || 'a header photo filed; ';
  begin insert into public.appraisal_assets (appraisal_id, role, kind, bucket, path) values (aid, 'intro', 'video', 'appraisal-video', 'appraisals/' || aid || '/intro/rb-hello.mp4'); out := out || 'A VIDEO OVER 50 MB WAS FILED; '; exception when others then out := out || 'one byte over 50 MB: ' || sqlerrm || '; '; end;
  insert into public.appraisal_assets (appraisal_id, role, kind, bucket, path) values (aid, 'intro', 'video', 'appraisal-video', 'appraisals/' || aid || '/intro/rb-ok.mp4');
  out := out || 'an introduction filed with no still frame; ';
  begin insert into public.appraisal_assets (appraisal_id, role, kind, bucket, path) values (aid, 'intro', 'image', 'appraisal-media', 'appraisals/' || aid || '/header/rb-photo.jpg'); out := out || 'A PHOTO BECAME AN INTRODUCTION; '; exception when others then out := out || 'a photo as the introduction: refused; '; end;
  begin insert into public.appraisal_assets (appraisal_id, role, kind, bucket, path) values (aid, 'header', 'image', 'appraisal-video', 'appraisals/' || aid || '/header/rb.webm'); out := out || 'A VIDEO WAS FILED AS A PHOTO; '; exception when others then out := out || 'photo in the video bucket: refused; '; end;
  begin insert into public.appraisal_assets (appraisal_id, role, kind, bucket, path) values (aid, 'header', 'video', 'appraisal-video', 'appraisals/' || sid || '/header/rb.webm'); out := out || 'ANOTHER APPRAISAL''S FILE WAS FILED; '; exception when others then out := out || 'another appraisal''s folder: refused; '; end;
  begin insert into public.appraisal_assets (appraisal_id, role, kind, bucket, path) values (aid, 'header', 'video', 'appraisal-video', 'appraisals/' || aid || '/header/missing.webm'); out := out || 'A FILE NOT IN STORAGE WAS FILED; '; exception when others then out := out || 'not in storage: refused; '; end;
  begin insert into public.appraisal_assets (appraisal_id, role, kind, bucket, path, still_path) values (aid, 'header', 'image', 'appraisal-media', 'appraisals/' || aid || '/header/rb-still.jpg', 'appraisals/' || aid || '/header/rb-photo.jpg'); out := out || 'A PHOTO GOT A STILL FRAME; '; exception when others then out := out || 'a still on a photo: refused; '; end;
  begin update public.appraisal_assets set file_name = 'changed' where id = a1; get diagnostics n = row_count; if n > 0 then out := out || 'AN ASSET CHANGED; '; else out := out || 'update: nothing; '; end if; exception when others then out := out || 'an asset never changes: refused; '; end;
  delete from public.appraisal_assets where id = a2; get diagnostics n = row_count; out := out || 'Tim removes one: ' || n || '; ';
  begin insert into public.appraisal_assets (appraisal_id, role, kind, bucket, path) values (sid, 'header', 'image', 'appraisal-media', 'appraisals/' || sid || '/header/x.jpg'); out := out || 'AN ASSET WAS ADDED TO A SENT APPRAISAL; '; exception when others then out := out || 'sent, asset: refused; '; end;
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', vendor, true);
  select count(*) into n from public.appraisal_assets; if n <> 0 then out := out || 'A VENDOR SEES ASSETS; '; else out := out || 'vendor sees no assets; '; end if;
  begin insert into public.appraisal_assets (appraisal_id, role, kind, bucket, path) values (aid, 'header', 'image', 'appraisal-media', 'appraisals/' || aid || '/header/rb-still.jpg'); out := out || 'A VENDOR FILED AN ASSET; '; exception when others then out := out || 'vendor asset: refused; '; end;
  execute 'reset role';

  -- ── drafts: only the doc-prefill function saves them, never from the client heart ──
  execute 'set local role service_role';
  dr := public.appraisal_draft_save(aid, 'heard', '{"lines":[{"text":"You are moving north."}]}', '{"questions":["reason_selling","timing"],"facts":[]}', 'claude-sonnet-5-5', 'agent@example.test');
  out := out || 'the function saves a draft; ';
  begin perform public.appraisal_draft_save(aid, 'heard', '{"lines":[]}', '{"questions":["client_heart"]}', 'm', 'a'); out := out || 'A DRAFT FROM THE CLIENT HEART WAS SAVED; '; exception when others then out := out || 'client heart: ' || sqlerrm || '; '; end;
  begin perform public.appraisal_draft_save(hid, 'ad', '{}', '{}', 'm', 'a'); out := out || 'A DRAFT WAS SAVED ON THE HAND-LOADED APPRAISAL; '; exception when others then out := out || 'hand-loaded: refused; '; end;
  begin perform public.appraisal_draft_save(sid, 'ad', '{}', '{}', 'm', 'a'); out := out || 'A DRAFT WAS SAVED ON A SENT APPRAISAL; '; exception when others then out := out || 'sent, draft: refused; '; end;
  begin perform public.appraisal_draft_save(aid, 'header', '{}', '{}', 'm', 'a'); out := out || 'AN UNKNOWN PART WAS SAVED; '; exception when others then out := out || 'unknown part: refused; '; end;
  begin update public.appraisal_drafts set result = '{}' where id = dr; out := out || 'A DRAFT CHANGED; '; exception when others then out := out || 'a draft never changes: refused; '; end;
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  select inputs::text into x from public.appraisal_drafts where id = dr;
  if x is null or x like '%client_heart%' then out := out || 'TIM CAN''T READ THE DRAFT, OR IT HOLDS THE CLIENT HEART; '; else out := out || 'Tim reads the draft and the keys sent; '; end if;
  begin insert into public.appraisal_drafts (appraisal_id, part, result, model, made_by) values (aid, 'ad', '{}', 'm', 'x'); out := out || 'TIM WROTE A DRAFT DIRECTLY; '; exception when others then out := out || 'direct draft: refused; '; end;
  begin perform public.appraisal_draft_save(aid, 'ad', '{}', '{}', 'm', 'a'); out := out || 'A SIGNED-IN USER CALLED THE SAVE; '; exception when others then out := out || 'the save, signed in: refused; '; end;

  -- ── Google reviews ──
  pack := jsonb_build_object('format', 'mre.reviews/1', 'profile', 'Tim McGuire', 'source', 'google', 'gathered_at', now()::text, 'reviews', jsonb_build_array(
    jsonb_build_object('ref', 'rb-g1', 'reviewer', 'Sam', 'rating', 5, 'date', (today - 20)::text, 'text', 'Tim was brilliant.', 'link', 'https://g.rbtest.invalid/r1'),
    jsonb_build_object('ref', 'rb-g2', 'reviewer', 'J.', 'rating', 4, 'date', (today - 40)::text, 'text', 'No fees to worry about.'),
    jsonb_build_object('ref', 'rb-g3', 'reviewer', 'Kim Rbsurname', 'rating', 5, 'date', (today - 5)::text, 'text', 'Surname given.'),
    jsonb_build_object('ref', 'rb-g4', 'reviewer', 'Ari T', 'rating', '5', 'date', to_char(today - 60, 'YYYY-MM'), 'text', ''),
    jsonb_build_object('ref', 'rb-g5', 'reviewer', 'Lee', 'rating', 4.5, 'date', (today - 3)::text),
    jsonb_build_object('ref', 'rb-g6', 'reviewer', 'Mo', 'rating', 5, 'date', (today + 9)::text),
    jsonb_build_object('ref', 'rb-g7', 'reviewer', 'Pat', 'rating', 5, 'date', (today - 1)::text, 'link', 'http://g.rbtest.invalid/r7')));
  begin perform public.agent_reviews_import(jsonb_set(pack, '{profile}', '"McGuire"')); out := out || 'THE MCGUIRE PROFILE WAS IMPORTED; '; exception when others then out := out || 'McGuire profile: refused; '; end;
  j := public.agent_reviews_import(pack);
  out := out || 'import: ' || (j->>'added') || ' added, skipped ' || (select string_agg((s->>'n') || ' (' || (s->>'why') || ')', ', ') from jsonb_array_elements(j->'skipped') s) || '; ';
  if (select count(*) from public.tim_reviews where ticked) <> 0 then out := out || 'A NEW REVIEW ARRIVED TICKED; '; end if;
  select id into rv1 from public.tim_reviews where ref = 'rb-g1'; select id into rv2 from public.tim_reviews where ref = 'rb-g2'; select id into rv4 from public.tim_reviews where ref = 'rb-g4';
  select reviewed_on::text into x from public.tim_reviews where id = rv4; if x is distinct from to_char(today - 60, 'YYYY-MM') || '-01' then out := out || 'A MONTH-ONLY DATE WAS NOT THE FIRST OF THE MONTH; '; end if;
  begin perform public.agent_review_tick(rv2, true); out := out || 'A REVIEW NAMING A FEE WAS TICKED; '; exception when others then
    if sqlerrm = 'This review mentions a fee or ''as is'', so it can''t be shown on an appraisal' then out := out || 'fee review: refused, in the agreed words; '; else out := out || 'THE FEE REVIEW MESSAGE IS: ' || sqlerrm || '; '; end if; end;
  j := public.agent_review_tick(rv1, true); out := out || 'Tim ticks one: ' || (j->>'ticked') || '; ';
  j := public.agent_reviews_import(pack); out := out || 'same pack again: ' || (j->>'added') || ' added, ' || (j->>'unchanged') || ' unchanged; ';
  if not (select ticked from public.tim_reviews where id = rv1) then out := out || 'AN UNCHANGED REVIEW WAS UNTICKED; '; end if;
  j := public.agent_reviews_import(jsonb_set(jsonb_set(pack, '{reviews,0,text}', '"Tim was brilliant. Edited."'), '{complete}', 'true'));
  out := out || 'changed text: ' || (j->>'updated') || ' updated; ';
  if (select ticked from public.tim_reviews where id = rv1) then out := out || 'A CHANGED REVIEW STAYED TICKED; '; else out := out || 'a changed review is unticked; '; end if;
  if (j->>'removed')::int <> 0 then out := out || 'A PACK WITH SKIPS REMOVED REVIEWS; '; else out := out || 'complete pack with skips: nothing marked removed; '; end if;
  j := public.agent_reviews_import(jsonb_build_object('format', 'mre.reviews/1', 'profile', 'Tim McGuire', 'complete', true, 'reviews', jsonb_build_array(jsonb_build_object('ref', 'rb-g1', 'reviewer', 'Sam', 'rating', 5, 'date', (today - 20)::text, 'text', 'Tim was brilliant. Edited.', 'link', 'https://g.rbtest.invalid/r1'))));
  out := out || 'a complete pack: ' || (j->>'removed') || ' gone from Google, kept; ';
  if (select count(*) from public.tim_reviews) <> 3 then out := out || 'A REVIEW WAS DELETED; '; end if;
  begin perform public.agent_review_tick(rv4, true); out := out || 'A REMOVED REVIEW WAS TICKED; '; exception when others then out := out || 'removed review: refused; '; end;
  begin insert into public.tim_reviews (profile, ref, reviewer, rating, reviewed_on, gathered_at) values ('Tim McGuire', 'x', 'Zed', 5, today, now()); out := out || 'TIM WROTE A REVIEW DIRECTLY; '; exception when others then out := out || 'direct review: refused; '; end;
  begin update public.tim_reviews set ticked = true where id = rv2; get diagnostics n = row_count; if n > 0 then out := out || 'A REVIEW WAS TICKED DIRECTLY; '; end if; exception when others then out := out || 'direct tick: refused; '; end;
  execute 'reset role';
  -- the table's own check holds even past the function
  begin insert into public.tim_reviews (profile, ref, reviewer, rating, reviewed_on, gathered_at) values ('McGuire', 'x', 'Zed', 5, today, now()); out := out || 'THE MCGUIRE PROFILE IS STORABLE; '; exception when others then out := out || 'table check: McGuire refused; '; end;
  begin insert into public.tim_reviews (profile, ref, reviewer, rating, reviewed_on, gathered_at) values ('Tim McGuire', 'y', 'Kim Rbsurname', 5, today, now()); out := out || 'A SURNAME IS STORABLE; '; exception when others then out := out || 'table check: surname refused; '; end;
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', vendor, true);
  select (select count(*) from public.tim_reviews) + (select count(*) from public.appraisal_drafts) into n;
  if n <> 0 then out := out || 'A VENDOR SEES ' || n || ' ROWS; '; else out := out || 'vendor sees no reviews or drafts; '; end if;
  begin perform public.agent_reviews_import(pack); out := out || 'A VENDOR IMPORTED REVIEWS; '; exception when others then out := out || 'vendor import: refused; '; end;
  begin perform public.agent_review_tick(rv1, true); out := out || 'A VENDOR TICKED A REVIEW; '; exception when others then out := out || 'vendor tick: refused; '; end;
  execute 'reset role';
  begin execute 'set local role anon'; perform public.agent_reviews_import(pack); out := out || 'ANON IMPORTED; '; exception when others then out := out || 'anon: refused; '; end;
  execute 'reset role';

  -- the guard on appraisal_views is unchanged: the wording guard still reads the whole set-up
  begin update public.appraisal_views set setup = '{"v":1,"heard":{"lines":[{"text":"About my fee","ticked":false}]}}' where id = aid; out := out || 'AN UNTICKED FEE LINE WAS KEPT IN THE SET-UP; '; exception when others then out := out || 'wording guard on the set-up: still on; '; end;

  if out ~* 'null value in column|violates foreign key|does not exist|syntax error|ambiguous' then out := out || 'A FIXTURE DID NOT MATCH THE SCHEMA; '; end if;
  raise exception 'ROLLBACK %', out;
end $t$;

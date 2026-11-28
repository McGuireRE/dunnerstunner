-- Rollback test for migration 037 (sending an appraisal to the vendor). Run with onboarding/tests/appraisal-send-rollback.js, which puts
-- the whole migration inside the block, so one statement applies it, runs the checks and then raises, which undoes it all. Nothing is
-- kept. The output is the exception message: lower case reads as expected; a line in CAPITALS means something was wrong. Needs 036, 038 and
-- the stand-ins (tests/appraisal-send-standin.sql says how the stand-in is built). Self-contained: it makes every row it needs
-- (invented data only, every name and address marked RB), so it runs the same on a stand-in or on one whose appraisal_views is empty.
-- The agent is the first row of public.agents, as in 032's to 036's tests.
do $t$
declare out text := ''; x text; x2 text; x3 text; jh jsonb; n int; j jsonb; j2 jsonb; r record; ok boolean; tz text;
  pid uuid; pid2 uuid; aid uuid; aid_bad uuid; hid uuid; c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; d1 uuid; d2 uuid; d3 uuid; hd uuid; it uuid; pl0 uuid;
  sid uuid; sid2 uuid; mid uuid; v2 uuid; v3 uuid; plid uuid; ev bigint; jh_ag uuid; jh_ag2 uuid; aid4 uuid; c6 uuid; sid4 uuid; lm date; j4 jsonb;
  views_before text; views_after text; pl_before text; pl_after text;
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text;
  owner text := json_build_object('email', 'rb-owner@example.com', 'sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text;
  owner_caps text := json_build_object('email', 'RB-Owner@Example.com', 'sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text;
  contact text := json_build_object('email', 'rb-contact@example.com', 'sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text;
  plc text := json_build_object('email', 'rb-pl@example.com', 'sub', '55555555-5555-5555-5555-555555555555', 'role', 'authenticated')::text;
  other text := json_build_object('email', 'rb-other@example.com', 'sub', '66666666-6666-6666-6666-666666666666', 'role', 'authenticated')::text;
  former text := json_build_object('email', 'rb-former@example.com', 'sub', '77777777-7777-7777-7777-777777777777', 'role', 'authenticated')::text;
  body text := E'Hello Robin,\n\nYour appraisal is ready.\n\n[the appraisal link]\n\nTim';
  today date := (now() at time zone 'Pacific/Auckland')::date;
begin
  -- ── self-contained: two invented properties with their people, an appraisal written from its set-up with every kind of section, its
  --    comparables, photos, files and reviews, everything a vendor must never see, and one loaded by hand ──
  insert into public.properties (address) values ('RB 9 Send Street, Rbvale') returning id into pid;
  insert into public.properties (address) values ('RB 11 Other Street, Rbvale') returning id into pid2;
  insert into public.property_people (property_id, position, legal_name, pref_name, email, role, source) values
    (pid, 1, 'Robin Rbowner', 'Robin', 'rb-owner@example.com', 'owner', 'agreement'),
    (pid, 2, 'Casey Rbcontact', '', 'rb-contact@example.com', 'contact', 'appraisal'),
    (pid, 3, 'Fran Rbformer', '', 'rb-former@example.com', 'former', 'agreement'),
    (pid, 4, 'Nell Rbnoemail', '', '', 'owner', 'agreement'),
    (pid2, 1, 'Olly Rbother', '', 'rb-other@example.com', 'owner', 'agreement');
  insert into public.prelistings (address, contact_name, contact_email, property_id, appraisal) values ('RB 9 Send Street, Rbvale', 'Pat Rbpl', 'rb-pl@example.com', pid, '{"price":"RB-PL-PRICE"}') returning id into pl0;
  -- the files, in storage first (as the guards ask)
  insert into storage.objects (bucket_id, name, metadata) values
    ('property-files', 'properties/' || pid || '/photos/rb-kitchen.jpg', '{"mimetype":"image/jpeg","size":5000}'),
    ('property-files', 'properties/' || pid || '/photos/rb-old.jpg', '{"mimetype":"image/jpeg","size":5000}'),
    ('property-files', 'properties/' || pid2 || '/photos/rb-elsewhere.jpg', '{"mimetype":"image/jpeg","size":5000}');
  insert into public.property_documents (property_id, kind, name, path, bucket, mime_type, room, source) values (pid, 'Photo', 'rb-kitchen.jpg', 'properties/' || pid || '/photos/rb-kitchen.jpg', 'property-files', 'image/jpeg', 'Kitchen', 'uploaded') returning id into d1;
  insert into public.property_documents (property_id, kind, name, path, bucket, mime_type, room, source) values (pid, 'Photo', 'rb-old.jpg', 'properties/' || pid || '/photos/rb-old.jpg', 'property-files', 'image/jpeg', 'Garage', 'uploaded') returning id into d2;
  update public.property_documents set archived_at = now() where id = d2;
  insert into public.property_documents (property_id, kind, name, path, bucket, mime_type, room, source) values (pid2, 'Photo', 'rb-elsewhere.jpg', 'properties/' || pid2 || '/photos/rb-elsewhere.jpg', 'property-files', 'image/jpeg', 'Lounge', 'uploaded') returning id into d3;
  insert into public.appraisal_views (property_id, title, address, prepared_for, status, setup, fields, sections, private_notes)
    values (pid, 'RB 9 Send Street, Rbvale: Market Appraisal', 'RB 9 Send Street, Rbvale', 'Robin', 'draft', '{"v":1,"market":true,"heard":{"lines":[{"text":"RB-UNTICKED-HEARD","ticked":false}]}}',
      '{"ranges":[{"key":"A","option":"Your home","involves":"","low":520000,"high":575000}],"bedrooms":"3 bedrooms","method":{"name":"Deadline sale","key":"deadline","text":"I would recommend a deadline sale."},"rb_extra":"RB-FIELD-EXTRA"}',
      '[]', 'RB-PRIVATE-NOTE: the hallway carpet is worn.') returning id into aid;
  insert into public.appraisal_views (property_id, title, address, status, setup, fields, sections) values (pid, 'RB hand', 'RB 9 Send Street, Rbvale', 'draft', '{}', '{"ranges":[{"key":"A","low":1,"high":2}]}', '[{"type":"para","text":"Loaded by hand."}]') returning id into hid;
  insert into public.appraisal_views (property_id, title, address, status, setup, fields, sections) values (pid, 'RB bad', 'RB 9 Send Street, Rbvale', 'draft', '{"v":1}', '{"ranges":[{"key":"A","option":"Your home","low":1,"high":2}]}', '[{"type":"para","text":"Call my colleague on 021 555 0101."}]') returning id into aid_bad;
  insert into storage.objects (bucket_id, name, metadata) values
    ('appraisal-media', 'appraisals/' || aid || '/header/rb-hero.jpg', '{"mimetype":"image/jpeg","size":40000}'),
    ('appraisal-video', 'appraisals/' || aid || '/intro/rb-hello.mp4', '{"mimetype":"video/mp4","size":3000000}'),
    ('appraisal-media', 'appraisals/' || aid || '/intro/rb-hello-still.jpg', '{"mimetype":"image/jpeg","size":30000}');
  insert into public.appraisal_assets (appraisal_id, role, kind, bucket, path) values (aid, 'header', 'image', 'appraisal-media', 'appraisals/' || aid || '/header/rb-hero.jpg') returning id into hd;
  insert into public.appraisal_assets (appraisal_id, role, kind, bucket, path, still_path) values (aid, 'intro', 'video', 'appraisal-video', 'appraisals/' || aid || '/intro/rb-hello.mp4', 'appraisals/' || aid || '/intro/rb-hello-still.jpg') returning id into it;
  update public.appraisal_views set setup = setup || jsonb_build_object('headerOpt', jsonb_build_object('asset', hd, 'zoom', 1), 'intro', jsonb_build_object('asset', it)),
    sections = jsonb_build_array(
      jsonb_build_object('type', 'header', 'stage', 1, 'src', 'asset', 'asset', hd, 'kind', 'image', 'credit', 'RB credit', 'ai_note', 'RB-AI-NOTE-HEADER', 'focus', jsonb_build_object('x', 40, 'y', 50, 'rb_secret', 'RB-NESTED-SECRET')),
      jsonb_build_object('type', 'byline', 'text', 'Prepared for Robin by Tim McGuire, McGuire Real Estate', 'tim_only', 'RB-TIM-ONLY-KEY'),
      jsonb_build_object('type', 'para', 'cls', 'lede', 'text', 'Any questions at all, call or text me on 027 562 7207.'),
      jsonb_build_object('type', 'intro', 'stage', 1, 'asset', it),
      jsonb_build_object('type', 'heard', 'stage', 1, 'ai_note', 'RB-AI-NOTE-HEARD', 'items', jsonb_build_array('You would like to be settled by March.',
        jsonb_build_object('text', 'RB-TICKED-LINE', 'ticked', true, 'from', jsonb_build_array('timing'), 'private_note', 'RB-LINE-PRIVATE'), jsonb_build_object('text', 'RB-UNTICKED-LINE', 'ticked', false), 42)),
      jsonb_build_object('type', 'home', 'stage', 2, 'label', 'A mockup.', 'photos', jsonb_build_array(d1, d2, d3), 'details', jsonb_build_array(jsonb_build_array('Heating', 'Heat pump'), jsonb_build_array('RB-BAD-DETAIL', 7)),
        'ad', jsonb_build_object('title', 'RB ad title', 'paras', jsonb_build_array('RB ad para'), 'private_note', 'RB-AD-PRIVATE')),
      jsonb_build_object('type', 'heading', 'text', 'My opinion of price'), jsonb_build_object('type', 'opinion'),
      jsonb_build_object('type', 'plans', 'items', jsonb_build_array(jsonb_build_object('key', 'premium', 'name', 'Premium', 'price', 4000, 'rec', true, 'private_note', 'RB-PLAN-PRIVATE'), jsonb_build_object('key', 'custom', 'name', 'Build your own', 'price', 0))),
      jsonb_build_object('type', 'rb_unknown', 'text', 'RB-UNKNOWN-SECTION'),
      jsonb_build_object('type', 'reviews', 'stage', 3, 'max', 6))
    where id = aid;
  insert into public.appraisal_comps (appraisal_id, position, shown, status, address, suburb, price, sold_on, agency, ad_text, compare_text, compare_ticked, private_note, source, source_ref, source_url, ring)
    values (aid, 1, true, 'sold', 'RB 1 Near Street, Rbvale', 'Rbvale', 540000, today - 20, 'RB Agency', 'A sunny family home with a big garden.', 'Smaller than yours, on a flatter section.', true, 'RB-COMP-PRIVATE', 'reinz', 'RB-REF-1', 'https://rbsource.example.com/1', 'suburb')
    returning id into c1;
  insert into public.appraisal_comps (appraisal_id, position, shown, status, address, price, ad_text, compare_text, compare_ticked, source)
    values (aid, 2, true, 'sold', 'RB 2 Near Street, Rbvale', 560000, 'Sold as is, where is.', 'RB-UNTICKED-COMPARE', false, 'tim') returning id into c2;
  insert into public.appraisal_comps (appraisal_id, position, shown, status, address, price, ad_text, source)
    values (aid, 3, true, 'listed', 'RB 3 Near Street, Rbvale', 600000, 'Call Jo on 021 555 0199 to view.', 'tim') returning id into c3;
  insert into public.appraisal_comps (appraisal_id, position, shown, status, address, price, ad_text, source)
    values (aid, 4, false, 'sold', 'RB-HIDDEN Street, Rbvale', 500000, 'RB-HIDDEN-AD', 'tim') returning id into c4;
  insert into public.appraisal_comps (appraisal_id, position, shown, status, address, price, compare_text, compare_ticked, source)
    values (aid_bad, 1, true, 'sold', 'RB 5 Near Street, Rbvale', 500000, 'See https://rbcompare.example.com', true, 'tim') returning id into c5;
  insert into storage.objects (bucket_id, name, metadata) values
    ('appraisal-media', 'appraisals/' || aid || '/comps/' || c1 || '/rb-a.jpg', '{"mimetype":"image/jpeg","size":5000}'),
    ('appraisal-media', 'appraisals/' || aid || '/comps/' || c1 || '/rb-b.jpg', '{"mimetype":"image/jpeg","size":5000}'),
    ('appraisal-media', 'appraisals/' || aid || '/comps/' || c4 || '/rb-hidden.jpg', '{"mimetype":"image/jpeg","size":5000}');
  insert into public.appraisal_media (appraisal_id, comp_id, path, position, cover) values
    (aid, c1, 'appraisals/' || aid || '/comps/' || c1 || '/rb-a.jpg', 1, false), (aid, c1, 'appraisals/' || aid || '/comps/' || c1 || '/rb-b.jpg', 2, true),
    (aid, c4, 'appraisals/' || aid || '/comps/' || c4 || '/rb-hidden.jpg', 1, false);
  -- the market store: Rbtown (another area, not drawn) and fourteen months of Dunedin (the report draws its latest twelve)
  insert into public.market_months (area, month, median, lower_quartile, upper_quartile, sales, days_to_sell, source_url)
    values ('Rbtown', date_trunc('month', today)::date - interval '1 month', 600000, 500000, 700000, 120, 30, 'https://rbmarket.example.com/x');
  insert into public.market_months (area, month, median, lower_quartile, upper_quartile, sales, days_to_sell)
    select 'Dunedin', (date_trunc('month', today)::date - make_interval(months => g))::date, 600000 + g, 500000, 700000, 100 + g, 30 from generate_series(1, 14) g;
  insert into public.market_sales (suburb, sold_on, price, address, source, source_ref) values ('Rbvale', today - 10, 555000, 'RB-SALE-ADDRESS 7 Hidden Road', 'reinz', 'RB-SALE-1');
  insert into public.tim_reviews (profile, ref, reviewer, rating, reviewed_on, body, url, ticked, gathered_at) values
    ('Tim McGuire', 'rb-r1', 'Sam', 5, today - 5, 'Tim was brilliant from start to finish.', 'https://g.rbtest.example.com/r1', true, now()),
    ('Tim McGuire', 'rb-r2', 'Jo', 4, today - 6, 'Ring my cousin on 021 555 0123 about Tim.', null, true, now()),
    ('Tim McGuire', 'rb-r3', 'Ari', 5, today - 7, 'RB-UNTICKED-REVIEW', null, false, now()),
    ('Tim McGuire', 'rb-r4', 'Kim', 5, today - 8, 'RB-REMOVED-REVIEW', null, true, now());
  update public.tim_reviews set removed_at = now() where ref = 'rb-r4';
  insert into public.appraisal_buyer_checks (appraisal_id, subject, comps, model, checked_by) values (aid, '{"verdict":"owner","reason":"RB-BUYER-VERDICT"}', '{}', 'test-model', 'agent');
  insert into public.appraisal_drafts (appraisal_id, part, result, model, made_by) values (aid, 'heard', '{"private_note":"RB-AI-PRIVATE-NOTE"}', 'test-model', 'agent');

  select string_agg(to_jsonb(v)::text, '|' order by id) into views_before from public.appraisal_views v;
  select string_agg(to_jsonb(p)::text, '|' order by id) into pl_before from public.prelistings p;

  $mig$__MIGRATION__$mig$;

  -- ── nothing already there changed ──
  select string_agg(to_jsonb(v)::text, '|' order by id) into views_after from public.appraisal_views v;
  if views_after is distinct from views_before then out := out || 'AN EXISTING APPRAISAL CHANGED; '; else out := out || 'appraisals unchanged; '; end if;
  select string_agg((to_jsonb(p) - 'appraisal_id')::text, '|' order by id) into pl_after from public.prelistings p;
  if pl_after is distinct from pl_before or exists (select 1 from public.prelistings where appraisal_id is not null) then out := out || 'AN EXISTING QUESTIONNAIRE CHANGED; '; else out := out || 'questionnaires unchanged (new column empty); '; end if;

  -- ── shape: Row Level Security, policies, privileges, functions ──
  for r in select t from unnest(array['appraisal_versions', 'appraisal_snapshots', 'appraisal_mail', 'appraisal_events', 'appraisal_vendor_plans']) t loop
    select relrowsecurity::text into x from pg_class where oid = ('public.' || r.t)::regclass;
    if x <> 'true' then out := out || 'ROW LEVEL SECURITY IS OFF ON ' || upper(r.t) || '; '; end if;
    if has_table_privilege('anon', 'public.' || r.t, 'select') or has_table_privilege('anon', 'public.' || r.t, 'insert') then out := out || 'ANON HAS A PRIVILEGE ON ' || upper(r.t) || '; '; end if;
    if has_table_privilege('authenticated', 'public.' || r.t, 'insert') or has_table_privilege('authenticated', 'public.' || r.t, 'update') or has_table_privilege('authenticated', 'public.' || r.t, 'delete')
       or has_table_privilege('authenticated', 'public.' || r.t, 'truncate') then out := out || 'SIGNED-IN USERS CAN WRITE ' || upper(r.t) || '; '; end if;
  end loop;
  select string_agg(tablename || ':' || cmd || ':' || array_to_string(roles, '+') || ':' || coalesce(qual, '-') || ':' || coalesce(with_check, '-'), ',' order by tablename) into x
    from pg_policies where schemaname = 'public' and tablename in ('appraisal_versions', 'appraisal_snapshots', 'appraisal_mail', 'appraisal_events', 'appraisal_vendor_plans');
  if x is distinct from 'appraisal_events:SELECT:authenticated:is_agent():-,appraisal_mail:SELECT:authenticated:is_agent():-,appraisal_snapshots:SELECT:authenticated:is_agent():-,appraisal_vendor_plans:SELECT:authenticated:is_agent():-,appraisal_versions:SELECT:authenticated:is_agent():-' then
    out := out || 'POLICIES NOT AS WRITTEN: ' || coalesce(x, 'none') || '; '; else out := out || 'five tables: rls on, Tim reads, nobody writes directly; '; end if;
  select string_agg(p.oid::regprocedure::text, ',' order by 1) into x from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('guard_appraisal_kept', 'guard_appraisal_mail', 'guard_appraisal_event', 'guard_prelisting_appraisal', 'appraisal_contact_problem', 'appraisal_contact_find', 'appraisal_chain_of',
      'appraisal_vendor_ok', 'appraisal_vendor_newest', 'appraisal_snapshot_build', 'agent_appraisal_send', 'agent_appraisal_new_version', 'agent_appraisal_events_seen', 'agent_appraisal_mail_unstick',
      'appraisal_seal_text', 'appraisal_seal_of', 'vendor_appraisal_ask_update', 'agent_appraisal_seal_check',
      'ap_s', 'ap_n', 'ap_b', 'ap_lines', 'ap_lines_opt', 'ap_rows', 'appraisal_section_clean',
      'vendor_appraisals_mine', 'vendor_appraisal_read', 'appraisal_vendor_can_read', 'vendor_appraisal_proceed', 'vendor_appraisal_plan_save', 'appraisal_event_mine')
    and (has_function_privilege('anon', p.oid, 'execute') or (p.proname !~ '^(agent_|vendor_)' and p.proname not in ('appraisal_vendor_can_read', 'appraisal_event_mine') and has_function_privilege('authenticated', p.oid, 'execute')));
  if x is not null then out := out || 'CALLABLE WHEN IT SHOULD NOT BE: ' || x || '; '; else out := out || 'functions: none for anon, the helpers for nobody; '; end if;
  select string_agg(p.proname, ',') into x from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('appraisal_snapshot_build', 'agent_appraisal_send', 'agent_appraisal_new_version',
      'vendor_appraisal_read', 'appraisal_vendor_can_read', 'vendor_appraisal_proceed', 'vendor_appraisal_plan_save', 'appraisal_vendor_ok', 'guard_appraisal_mail', 'guard_appraisal_event')
    and coalesce(array_to_string(p.proconfig, ' '), '') <> 'search_path=public';
  if x is not null then out := out || 'NO SEARCH PATH: ' || x || '; '; end if;

  -- ── the contact check: links, phone numbers and emails; Tim's own phone and email are his to give ──
  select string_agg(t || '=' || public.appraisal_contact_problem(t)::text, ' ') into x from unnest(array['Call me on 027 562 7207', 'Call Jo on 021 555 0199', 'tim@mcguire.co.nz',
    'jo@rb.example.com', 'see https://rb.example.com', 'www.rb.example.com', '[link](https://x.example.com)', '$540,000 to $600,000', 'Sold 2026-11-08 for $1,050,000', '+64 21 555 0199', 'Dunedin 9016']) t;
  if x is distinct from 'Call me on 027 562 7207=false Call Jo on 021 555 0199=true tim@mcguire.co.nz=false jo@rb.example.com=true see https://rb.example.com=true www.rb.example.com=true [link](https://x.example.com)=true $540,000 to $600,000=false Sold 2026-11-08 for $1,050,000=false +64 21 555 0199=true Dunedin 9016=false' then
    out := out || 'THE CONTACT CHECK IS WRONG: ' || x || '; '; else out := out || 'contact check: phones, emails and links caught, Tim''s own and prices not; '; end if;

  -- ── before sending: nobody but Tim sees anything ──
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', owner, true);
  begin j := public.vendor_appraisal_read(aid); out := out || 'A VENDOR READ AN APPRAISAL BEFORE IT WAS SENT; '; exception when others then out := out || 'not sent: not found (' || sqlerrm || '); '; end;
  begin perform public.agent_appraisal_send(aid, array['rb-owner@example.com'], 'RB', body); out := out || 'A VENDOR SENT AN APPRAISAL; '; exception when others then out := out || 'vendor sending: refused; '; end;
  select count(*) into n from public.appraisal_views; if n > 0 then out := out || 'A VENDOR SEES APPRAISAL_VIEWS; '; end if;
  execute 'reset role';
  execute 'set local role anon'; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin j := public.vendor_appraisal_read(aid); out := out || 'ANON READ AN APPRAISAL; '; exception when others then out := out || 'anon: refused; '; end;
  begin select count(*) into n from public.appraisal_snapshots; out := out || 'ANON READ THE SNAPSHOTS TABLE; '; exception when others then out := out || 'anon: no table; '; end;
  execute 'reset role';

  -- ── sending: who it may go to, and what may be sent ──
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_appraisal_send(aid, array['rb-stranger@example.com'], 'RB', body); out := out || 'SENT TO SOMEONE NOT ON THE PROPERTY; '; exception when others then out := out || 'stranger: refused; '; end;
  begin perform public.agent_appraisal_send(aid, array['rb-former@example.com'], 'RB', body); out := out || 'SENT TO A FORMER OWNER; '; exception when others then out := out || 'former owner: refused; '; end;
  begin perform public.agent_appraisal_send(aid, array['rb-other@example.com'], 'RB', body); out := out || 'SENT TO ANOTHER PROPERTY''S OWNER; '; exception when others then out := out || 'another property''s owner: refused; '; end;
  begin perform public.agent_appraisal_send(aid, '{}', 'RB', body); out := out || 'SENT TO NOBODY; '; exception when others then out := out || 'nobody: refused; '; end;
  begin perform public.agent_appraisal_send(aid, array['rb-owner@example.com'], 'RB', 'No link here.'); out := out || 'SENT WITHOUT THE LINK; '; exception when others then out := out || 'no link in the email: refused; '; end;
  begin perform public.agent_appraisal_send(aid, array['rb-owner@example.com'], 'RB', body || E'\n\nMy fee is low.'); out := out || 'FEE WORDING IN THE EMAIL; '; exception when others then out := out || 'fee in the email: refused; '; end;
  begin perform public.agent_appraisal_send(aid, array['rb-owner@example.com'], 'RB', body || E'\n\n[Tim to add the date]'); out := out || 'A MARKED BLANK WENT; '; exception when others then out := out || 'marked blank: refused; '; end;
  begin perform public.agent_appraisal_send(hid, array['rb-owner@example.com'], 'RB', body); out := out || 'THE HAND-LOADED APPRAISAL WAS SENT; '; exception when others then out := out || 'hand-loaded: refused; '; end;
  begin perform public.agent_appraisal_send(aid_bad, array['rb-owner@example.com'], 'RB', body); out := out || 'A PHONE NUMBER IN THE WORDING WENT; '; exception when others then out := out || 'someone else''s phone in the wording: refused (' || left(sqlerrm, 60) || '); '; end;
  update public.appraisal_views set sections = '[{"type":"para","text":"Fine."}]' where id = aid_bad;
  begin perform public.agent_appraisal_send(aid_bad, array['rb-owner@example.com'], 'RB', body); out := out || 'A LINK IN HOW IT COMPARES WENT; '; exception when others then out := out || 'a link in ticked comparison: refused; '; end;
  begin update public.appraisal_views set status = 'sent' where id = aid_bad; out := out || 'MARKED SENT WITHOUT SENDING; '; exception when others then out := out || 'sent without sending: refused; '; end;
  select count(*) into n from public.appraisal_snapshots; if n > 0 then out := out || 'A REFUSED SEND LEFT A COPY; '; end if;
  j := public.agent_appraisal_send(aid, array['RB-Owner@Example.com', 'rb-pl@example.com', 'rb-owner@example.com'], 'Your appraisal: RB 9 Send Street', body);
  sid := (j->>'snapshot_id')::uuid; mid := (j->>'mail_id')::uuid;
  if j->>'version' = '1' and (j->>'chain_id')::uuid = aid and jsonb_array_length(j->'recipients') = 2 then out := out || 'sent to the owner and the questionnaire contact, version 1; '; else out := out || 'SEND RESULT WRONG: ' || j::text || '; '; end if;
  if coalesce(current_setting('app.appraisal_send', true), '') <> '' then out := out || 'THE SEND SETTING WAS LEFT ON; '; else out := out || 'send setting back off; '; end if;
  select status into x from public.appraisal_views where id = aid; if x <> 'sent' then out := out || 'NOT MARKED SENT; '; end if;
  begin update public.appraisal_views set title = 'RB changed' where id = aid; out := out || 'A SENT APPRAISAL CHANGED; '; exception when others then out := out || 'sent appraisal: never changes; '; end;
  begin perform public.agent_appraisal_send(aid, array['rb-owner@example.com'], 'RB', body); out := out || 'SENT TWICE; '; exception when others then out := out || 'second send: refused; '; end;
  select to_jsonb(m) into j from public.appraisal_mail m where id = mid;
  if j->>'status' = 'queued' and j->'to_addr' = '["rb-owner@example.com", "rb-pl@example.com"]'::jsonb then out := out || 'email queued to both; '; else out := out || 'EMAIL ROW WRONG: ' || j::text || '; '; end if;
  execute 'reset role';

  -- ── the copy: the whitelist ──
  select content::text, paths, left_out into x, j, j2 from public.appraisal_snapshots where id = sid;
  for r in select t from unnest(array['RB-PRIVATE-NOTE', 'RB-COMP-PRIVATE', 'RB-UNTICKED-COMPARE', 'RB-HIDDEN', 'RB-UNTICKED-REVIEW', 'RB-REMOVED-REVIEW', 'RB-BUYER-VERDICT', 'RB-AI-PRIVATE-NOTE',
      'RB-SALE-ADDRESS', 'RB-UNTICKED-HEARD', 'RB-UNKNOWN-SECTION', 'RB-FIELD-EXTRA', 'rbsource.example.com', 'RB-REF-1', 'rbmarket.example.com', '021 555', 'as is', 'rb-elsewhere', 'rb-old', 'private_note', 'source_url', 'RB-PL-PRICE',
      'ai_note', 'RB-AI-NOTE', 'RB-NESTED-SECRET', 'rb_secret', 'RB-TIM-ONLY-KEY', 'tim_only', 'RB-LINE-PRIVATE', 'RB-UNTICKED-LINE', '"ticked": false', 'RB-AD-PRIVATE', 'RB-PLAN-PRIVATE', 'RB-BAD-DETAIL', '"from"', 'Rbtown']) t loop
    if position(r.t in x) > 0 then out := out || 'THE COPY HOLDS ' || upper(r.t) || '; '; end if;
  end loop;
  for r in select t from unnest(array['Smaller than yours, on a flatter section.', 'A sunny family home', '027 562 7207', 'You would like to be settled by March.', 'RB-TICKED-LINE', 'Tim was brilliant', 'RB credit', 'Heat pump', 'RB ad para', '"x": 40']) t loop
    if position(r.t in x) = 0 then out := out || 'THE COPY LACKS ' || upper(r.t) || '; '; end if;
  end loop;
  out := out || 'copy: each section rebuilt from its own keys (no AI notes, nested private notes, unticked lines or unknown keys), shown comparables, reviews and files only; no private notes, verdicts, sales addresses or sources; ';
  select jsonb_agg(e->'items') into jh from public.appraisal_snapshots s, jsonb_array_elements(s.content->'sections') e where s.id = sid and e->>'type' = 'heard';
  if jh is distinct from '[["You would like to be settled by March.", "RB-TICKED-LINE"]]'::jsonb then out := out || 'HEARD LINES WRONG: ' || coalesce(jh::text, 'none') || '; '; else out := out || 'What I heard: ticked lines only, as plain text; '; end if;
  select count(*), min(m->>'area'), max(m->>'area'), min(m->>'month') into n, x, x2, x3 from (select jsonb_array_elements(content->'months') m from public.appraisal_snapshots where id = sid) q;
  if n <> 12 or x <> 'Dunedin' or x2 <> 'Dunedin' or x3 <> to_char(date_trunc('month', today)::date - interval '12 months', 'YYYY-MM-DD') then out := out || 'MARKET MONTHS WRONG: ' || n || ' ' || coalesce(x, '') || ' ' || coalesce(x3, '') || '; ';
  else out := out || 'market: the drawn area''s latest twelve months only; '; end if;
  select string_agg(e->>'bucket' || ':' || regexp_replace(e->>'path', '^.*/', ''), ',' order by e->>'bucket', regexp_replace(e->>'path', '^.*/', '')) into x from jsonb_array_elements(j) e;
  if x is distinct from 'appraisal-media:rb-a.jpg,appraisal-media:rb-b.jpg,appraisal-media:rb-hello-still.jpg,appraisal-media:rb-hero.jpg,appraisal-video:rb-hello.mp4,property-files:rb-kitchen.jpg' then
    out := out || 'THE FILES LISTED ARE WRONG: ' || coalesce(x, 'none') || '; '; else out := out || 'files: the shown photos, the header, the video and its still, the mockup photo; '; end if;
  select string_agg(e->>'what', ',' order by e->>'what') into x from jsonb_array_elements(j2) e;
  if x is distinct from 'advertisement,advertisement,review' then out := out || 'LEFT OUT LIST WRONG: ' || coalesce(x, 'none') || '; '; else out := out || 'left out for Tim: two advertisements, one review; '; end if;
  begin update public.appraisal_snapshots set content = '{}' where id = sid; out := out || 'A COPY CHANGED; '; exception when others then out := out || 'copy: never changes; '; end;
  begin delete from public.appraisal_snapshots where id = sid; out := out || 'A COPY WAS REMOVED; '; exception when others then out := out || 'copy: never removed; '; end;
  begin update public.appraisal_mail set body = 'changed [the appraisal link]' where id = mid; out := out || 'THE EMAIL CHANGED; '; exception when others then out := out || 'email: never changes; '; end;
  begin update public.appraisal_mail set status = 'sent' where id = mid; out := out || 'EMAIL SENT WITHOUT SENDING; '; exception when others then out := out || 'email: queued can''t jump to sent; '; end;
  begin delete from public.appraisal_mail where id = mid; out := out || 'AN EMAIL WAS REMOVED; '; exception when others then out := out || 'email: kept; '; end;
  -- the notify function (service role) takes it and records the outcome
  execute 'set local role service_role';
  update public.appraisal_mail set status = 'sending' where id = mid and status in ('queued', 'failed');
  update public.appraisal_mail set status = 'sent', sent_at = now() where id = mid and status = 'sending';
  execute 'reset role';
  select status into x from public.appraisal_mail where id = mid; if x <> 'sent' then out := out || 'THE SERVICE ROLE COULDN''T RECORD THE SEND; '; else out := out || 'notify records the send; '; end if;

  -- ── the vendor's view ──
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', owner, true);
  select count(*) into n from public.appraisal_snapshots; if n > 0 then out := out || 'A VENDOR READS THE SNAPSHOTS TABLE; '; end if;
  select count(*) into n from public.appraisal_events; if n > 0 then out := out || 'A VENDOR READS THE EVENTS TABLE; '; end if;
  begin insert into public.appraisal_vendor_plans (snapshot_id, chain_id, property_id, email, plan) values (sid, aid, pid, 'x@example.com', '{}'); out := out || 'A VENDOR WROTE A PLAN DIRECTLY; '; exception when others then out := out || 'vendor: no direct writes; '; end;
  j := public.vendor_appraisal_read(aid);
  if (j->>'snapshot_id')::uuid = sid and j->>'version' = '1' and j->'content'->>'title' = 'RB 9 Send Street, Rbvale: Market Appraisal' and j->>'event_id' is not null then out := out || 'owner reads it by the appraisal; '; else out := out || 'OWNER READ WRONG: ' || left(j::text, 200) || '; '; end if;
  j := public.vendor_appraisal_read(sid);
  if (j->>'snapshot_id')::uuid = sid and j->>'event_id' is null then out := out || 'and by the copy, the opening recorded once; '; else out := out || 'SECOND READ WRONG; '; end if;
  if public.vendor_appraisals_mine() @> jsonb_build_array(jsonb_build_object('chain_id', aid, 'version', 1)) then out := out || 'listed as theirs; '; else out := out || 'NOT LISTED AS THEIRS; '; end if;
  if public.appraisal_vendor_can_read(sid, 'appraisal-media', 'appraisals/' || aid || '/comps/' || c1 || '/rb-a.jpg') and public.appraisal_vendor_can_read(sid, 'property-files', 'properties/' || pid || '/photos/rb-kitchen.jpg')
     and public.appraisal_vendor_can_read(sid, 'appraisal-video', 'appraisals/' || aid || '/intro/rb-hello.mp4') then out := out || 'listed files: a link may be made; '; else out := out || 'A LISTED FILE WAS REFUSED; '; end if;
  if public.appraisal_vendor_can_read(sid, 'appraisal-media', 'appraisals/' || aid || '/comps/' || c4 || '/rb-hidden.jpg') or public.appraisal_vendor_can_read(sid, 'property-files', 'properties/' || pid || '/photos/rb-old.jpg')
     or public.appraisal_vendor_can_read(sid, 'property-files', 'properties/' || pid2 || '/photos/rb-elsewhere.jpg') or public.appraisal_vendor_can_read(sid, 'appraisal-video', 'appraisals/' || aid || '/comps/' || c1 || '/rb-a.jpg')
     or public.appraisal_vendor_can_read(sid, 'private', 'appraisals/' || aid || '/comps/' || c1 || '/rb-a.jpg') then out := out || 'A FILE OUTSIDE THE COPY WAS ALLOWED; '; else out := out || 'files outside the copy, or in another bucket: refused; '; end if;
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', owner_caps, true);
  begin j := public.vendor_appraisal_read(aid); out := out || 'the same email in capitals reads it; '; exception when others then out := out || 'THE SAME EMAIL IN CAPITALS WAS REFUSED; '; end;
  execute 'reset role';
  for r in select * from (values ('contact (not sent to)', contact), ('another property''s owner', other), ('a former owner', former)) v(who, claims) loop
    execute 'set local role authenticated'; perform set_config('request.jwt.claims', r.claims, true);
    begin j := public.vendor_appraisal_read(aid); out := out || upper(r.who) || ' READ IT; '; exception when others then out := out || r.who || ': not found; '; end;
    begin j := public.vendor_appraisal_read(sid); out := out || upper(r.who) || ' READ THE COPY; '; exception when others then null; end;
    if public.appraisal_vendor_can_read(sid, 'appraisal-media', 'appraisals/' || aid || '/comps/' || c1 || '/rb-a.jpg') then out := out || upper(r.who) || ' GOT A PHOTO LINK; '; end if;
    begin j := public.vendor_appraisal_proceed(sid); out := out || upper(r.who) || ' PROCEEDED; '; exception when others then null; end;
    begin j := public.vendor_appraisal_plan_save(sid, '{"sel":{"lim":1},"total":0}'); out := out || upper(r.who) || ' SAVED A PLAN; '; exception when others then null; end;
    if jsonb_array_length(public.vendor_appraisals_mine()) > 0 then out := out || upper(r.who) || ' HAS IT LISTED; '; end if;
    execute 'reset role';
  end loop;

  -- ── I'd like to proceed ──
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', owner, true);
  j := public.vendor_appraisal_proceed(sid); plid := (j->>'prelisting_id')::uuid;
  select to_jsonb(p) into j2 from public.prelistings p where id = plid;
  if j2->>'contact_email' = 'rb-owner@example.com' and (j2->>'appraisal_id')::uuid = aid and j2->>'status' = 'appraisal' and j2->>'proceeded_at' is not null and (j2->>'property_id')::uuid = pid
     and j2->'appraisal'->>'price' = '$520,000 to $575,000' and j2->'appraisal'->>'marketing' = 'Premium' and j->>'event_id' is not null then out := out || 'proceed: their questions, linked to this appraisal; ';
  else out := out || 'PROCEED WRONG: ' || left(j2::text, 300) || '; '; end if;
  j := public.vendor_appraisal_proceed(sid);
  if (j->>'prelisting_id')::uuid = plid and j->>'event_id' is null then out := out || 'again: the same questions, told once; '; else out := out || 'SECOND PROCEED WRONG; '; end if;
  perform public.pl_save(plid, '{"spoke":"RB answer"}');
  if (public.vendor_appraisal_read(aid)->>'prelisting_id')::uuid = plid then out := out || 'the questionnaire carries on as before; '; else out := out || 'THE VIEW DOESN''T KNOW THEIR QUESTIONS; '; end if;
  -- the plan they built
  begin perform public.vendor_appraisal_plan_save(sid, '{"sel":{"DROP TABLE":1},"total":10}'); out := out || 'A BAD PLAN WAS SAVED; '; exception when others then out := out || 'bad plan: refused; '; end;
  begin perform public.vendor_appraisal_plan_save(sid, '{"sel":{"lim":1.5},"total":10}'); out := out || 'A HALF ITEM WAS SAVED; '; exception when others then out := out || 'half an item: refused; '; end;
  j := public.vendor_appraisal_plan_save(sid, '{"sel":{"lim":1,"photos_pro":1,"signboard":2},"band":"tm_mid","total":2450.5,"on_request":1,"extra":"dropped"}');
  if (public.vendor_appraisal_read(aid)->'plan') = '{"sel":{"lim":1,"photos_pro":1,"signboard":2},"band":"tm_mid","total":2450.5,"on_request":1}'::jsonb and j->>'event_id' is not null then out := out || 'their plan saved to their appraisal; ';
  else out := out || 'PLAN WRONG: ' || coalesce((public.vendor_appraisal_read(aid)->'plan')::text, 'none') || '; '; end if;
  -- saved again and again: one current plan, at most 10 kept, Tim told once
  for n in 2..10 loop j := public.vendor_appraisal_plan_save(sid, jsonb_build_object('sel', jsonb_build_object('lim', 1, 'signboard', n), 'total', 100 * n));
    if j->>'event_id' is not null then out := out || 'A LATER SAVE TOLD TIM AGAIN; '; end if; end loop;
  begin perform public.vendor_appraisal_plan_save(sid, '{"sel":{"lim":1},"total":1}'); out := out || 'AN 11TH SAVE WAS KEPT; '; exception when others then out := out || 'an 11th save: refused (' || left(sqlerrm, 45) || '); '; end;
  if (public.vendor_appraisal_read(aid)->'plan'->'sel'->>'signboard') = '10' then out := out || 'the newest plan is the one they see; '; else out := out || 'THE CURRENT PLAN ISN''T THE NEWEST; '; end if;
  execute 'reset role';
  select count(*) filter (where superseded_at is null), count(*) into n, ev from public.appraisal_vendor_plans where chain_id = aid and email = 'rb-owner@example.com';
  if n = 1 and ev = 10 then out := out || 'plans: one current, nine superseded, ten kept; '; else out := out || 'PLANS WRONG: ' || n || ' current of ' || ev || '; '; end if;
  select count(*) into n from public.appraisal_events where snapshot_id = sid and kind = 'plan_built' and actor = 'rb-owner@example.com';
  if n <> 1 then out := out || 'PLAN EVENTS: ' || n || '; '; else out := out || 'plan built: recorded once; '; end if;
  begin update public.appraisal_vendor_plans set plan = '{}' where chain_id = aid and superseded_at is null; out := out || 'A PLAN CHANGED; '; exception when others then out := out || 'a plan never changes; '; end;
  begin update public.appraisal_vendor_plans set superseded_at = now() where chain_id = aid and superseded_at is not null; out := out || 'SUPERSEDED TWICE; '; exception when others then out := out || 'superseded once only; '; end;
  begin delete from public.appraisal_vendor_plans where chain_id = aid; out := out || 'A PLAN WAS REMOVED; '; exception when others then out := out || 'plans kept; '; end;
  -- two reads or two presses at the same moment can't record twice: the database itself refuses the second
  begin insert into public.appraisal_events (snapshot_id, chain_id, property_id, kind, actor) values (sid, aid, pid, 'opened', 'rb-owner@example.com'); out := out || 'OPENED RECORDED TWICE; '; exception when unique_violation then out := out || 'opened: once, by the index; '; end;
  begin insert into public.appraisal_events (snapshot_id, chain_id, property_id, kind, actor) values (sid, aid, pid, 'proceeded', 'rb-owner@example.com'); out := out || 'PROCEEDED RECORDED TWICE; '; exception when unique_violation then out := out || 'proceeded: once, by the index; '; end;
  begin insert into public.appraisal_events (snapshot_id, chain_id, property_id, kind, actor) values (sid, aid, pid, 'plan_built', 'rb-owner@example.com'); out := out || 'PLAN BUILT RECORDED TWICE; '; exception when unique_violation then out := out || 'plan built: once, by the index; '; end;
  -- the questionnaire contact Tim also sent it to: their existing questions are linked, not doubled
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', plc, true);
  j := public.vendor_appraisal_read(aid);
  j := public.vendor_appraisal_proceed(sid);
  if (j->>'prelisting_id')::uuid = pl0 and (select appraisal_id from public.prelistings where id = pl0) = aid then out := out || 'questionnaire contact: their own questions, now linked; '; else out := out || 'QUESTIONNAIRE CONTACT PROCEED WRONG; '; end if;
  execute 'reset role';
  select count(*) into n from public.prelistings where property_id = pid; if n <> 2 then out := out || 'QUESTIONNAIRES: ' || n || '; '; end if;
  begin update public.prelistings set appraisal_id = hid where id = pl0; out := out || 'THE LINK TO THE APPRAISAL CHANGED; '; exception when others then out := out || 'the link to the appraisal stays; '; end;

  -- ── what happened, for Tim ──
  select string_agg(kind || ':' || actor, ',' order by id) into x from public.appraisal_events where chain_id = aid;
  if x is distinct from 'sent:' || (select email from public.agents order by created_at limit 1) || ',opened:rb-owner@example.com,proceeded:rb-owner@example.com,plan_built:rb-owner@example.com,opened:rb-pl@example.com,proceeded:rb-pl@example.com' then
    out := out || 'EVENTS WRONG: ' || coalesce(x, 'none') || '; '; else out := out || 'events: sent, opened, proceeded, plan built; '; end if;
  select id into ev from public.appraisal_events where kind = 'proceeded' and actor = 'rb-owner@example.com';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', owner, true);
  ok := public.appraisal_event_mine(ev);
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', other, true);
  if ok and not public.appraisal_event_mine(ev) then out := out || 'notify: only their own event; '; else out := out || 'EVENT OWNERSHIP WRONG; '; end if;
  execute 'reset role';
  execute 'set local role service_role';
  update public.appraisal_events set notified_at = now() where id = ev and notified_at is null;
  execute 'reset role';
  begin update public.appraisal_events set notified_at = now() + interval '1 day' where id = ev; out := out || 'TOLD TWICE; '; exception when others then out := out || 'told once; '; end;
  begin update public.appraisal_events set detail = '{}' where id = ev; out := out || 'AN EVENT CHANGED; '; exception when others then out := out || 'events never change; '; end;
  begin delete from public.appraisal_events where id = ev; out := out || 'AN EVENT WAS REMOVED; '; exception when others then out := out || 'events kept; '; end;
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  n := public.agent_appraisal_events_seen(array[ev]);
  if n = 1 and public.agent_appraisal_events_seen(array[ev]) = 0 then out := out || 'Tim marks it seen, once; '; else out := out || 'SEEN WRONG; '; end if;
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', owner, true);
  begin n := public.agent_appraisal_events_seen(array[ev]); out := out || 'A VENDOR MARKED AN EVENT SEEN; '; exception when others then out := out || 'vendor: can''t mark seen; '; end;
  execute 'reset role';

  -- ── Send updated version ──
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_appraisal_new_version(aid_bad); out := out || 'AN UNSENT APPRAISAL WAS VERSIONED; '; exception when others then out := out || 'unsent: no update needed; '; end;
  j := public.agent_appraisal_new_version(aid); v2 := (j->>'appraisal_id')::uuid;
  select count(*) into n from public.appraisal_comps where appraisal_id = v2;
  select setup into j2 from public.appraisal_views where id = v2;
  if j->>'existing' = 'false' and n = 4 and jsonb_array_length(j2->'copyPending'->'media') = 3 and jsonb_array_length(j2->'copyPending'->'assets') = 2 and (select chain_id from public.appraisal_versions where appraisal_id = v2) = aid
     and (j2->'copyPending'->'media'->0->>'comp')::uuid in (select id from public.appraisal_comps where appraisal_id = v2)
     and (select status from public.appraisal_views where id = v2) = 'draft' and (select private_notes from public.appraisal_views where id = v2) like 'RB-PRIVATE-NOTE%' then out := out || 'updated version: a draft with its comparables, and the photos and files still to copy listed; ';
  else out := out || 'NEW VERSION WRONG: ' || left(j2::text, 300) || ' comps ' || n || '; '; end if;
  select (sections::text || (setup - 'copyPending')::text) into x from public.appraisal_views where id = v2;
  if position(hd::text in x) > 0 or position(it::text in x) > 0 then out := out || 'THE DRAFT STILL NAMES THE SENT VERSION''S FILES; '; else out := out || 'the draft never names the sent version''s header or video; '; end if;
  if (public.agent_appraisal_new_version(aid)->>'appraisal_id')::uuid = v2 then out := out || 'asked again: the same draft; '; else out := out || 'A SECOND DRAFT WAS MADE; '; end if;
  perform public.agent_appraisal_save(v2, null, '{"ranges":[{"key":"A","option":"Your home","involves":"","low":530000,"high":585000}],"method":{"name":"Deadline sale","key":"deadline","text":"Updated."}}', '[{"type":"heading","text":"My opinion of price"},{"type":"opinion"}]', null, null, null, null);
  j := public.agent_appraisal_send(v2, array['rb-owner@example.com'], 'Your updated appraisal', body); sid2 := (j->>'snapshot_id')::uuid;
  if j->>'version' = '2' and (j->>'chain_id')::uuid = aid then out := out || 'updated version sent as version 2 of the same appraisal; '; else out := out || 'VERSION 2 WRONG: ' || j::text || '; '; end if;
  begin perform public.agent_appraisal_new_version(aid); out := out || 'AN OLD VERSION WAS UPDATED; '; exception when others then out := out || 'only the newest is updated; '; end;
  execute 'reset role';
  -- the 10-save cap counts per version (re-review of f73d2fb): the owner saved 10 on version 1, and may save on version 2
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', owner, true);
  begin j := public.vendor_appraisal_plan_save(sid2, '{"sel":{"lim":1,"signboard":11},"total":1100}'); out := out || 'ten saves on version 1, and version 2 saves again; ';
  exception when others then out := out || 'VERSION 2 PLAN REFUSED: ' || left(sqlerrm, 100) || '; '; end;
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', owner, true);
  j := public.vendor_appraisal_read(aid);
  if (j->>'snapshot_id')::uuid = sid2 and j->'content'->'fields'->'ranges'->0->>'low' = '530000' then out := out || 'owner now reads version 2; '; else out := out || 'OWNER DOESN''T SEE THE NEWEST; '; end if;
  -- each version's permanent link opens that version (Tim, 28 November 2026, 4:22pm), and says which is newest
  j := public.vendor_appraisal_read(sid);
  if (j->>'snapshot_id')::uuid = sid and j->>'version' = '1' and (j->'newest'->>'snapshot_id')::uuid = sid2 and j->'newest'->>'version' = '2' then out := out || 'version 1''s own link opens version 1, naming version 2 as newest; ';
  else out := out || 'THE OLD LINK DOESN''T OPEN ITS OWN VERSION: ' || left(j::text, 120) || '; '; end if;
  j := public.vendor_appraisal_read(aid, 1);
  if (j->>'snapshot_id')::uuid = sid then out := out || 'the appraisal with v=1 opens version 1; '; else out := out || 'V=1 OPENS ANOTHER VERSION; '; end if;
  j := public.vendor_appraisal_read(v2, 2);
  if (j->>'snapshot_id')::uuid = sid2 then out := out || 'and v=2 version 2; '; else out := out || 'V=2 WRONG; '; end if;
  begin j := public.vendor_appraisal_read(aid, 9); out := out || 'A VERSION THAT DOESN''T EXIST OPENED; '; exception when others then out := out || 'a version that doesn''t exist: not found; '; end;
  if public.appraisal_vendor_can_read(sid, 'appraisal-media', 'appraisals/' || aid || '/comps/' || c1 || '/rb-a.jpg') then out := out || 'the old version''s own photos still open from its link; '; else out := out || 'AN OLD VERSION''S PHOTOS ARE CLOSED; '; end if;
  begin perform public.vendor_appraisal_proceed(sid); out := out || 'PROCEEDED FROM AN OLD COPY; '; exception when others then out := out || 'old copy: no proceed; '; end;
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', plc, true);
  if (public.vendor_appraisal_read(aid)->>'snapshot_id')::uuid = sid then out := out || 'the contact not sent version 2 keeps version 1; '; else out := out || 'VERSION 2 REACHED SOMEONE IT WASN''T SENT TO; '; end if;
  execute 'reset role';
  -- an owner Tim sets aside loses access at once, even with their own Questions before we meet still open (Tim, 28 November 2026)
  update public.property_people set role = 'former' where property_id = pid and email = 'rb-owner@example.com';
  if (select status from public.prelistings where id = plid) = 'closed' then out := out || 'THE TEST''S QUESTIONS AREN''T OPEN; '; end if;
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', owner, true);
  begin j := public.vendor_appraisal_read(aid); out := out || 'A FORMER OWNER WITH OPEN QUESTIONS STILL READS IT; '; exception when others then out := out || 'owner set aside, questions still open: refused at once; '; end;
  begin j := public.vendor_appraisal_read(sid2); out := out || 'A FORMER OWNER READ THE COPY; '; exception when others then null; end;
  if public.appraisal_vendor_can_read(sid2, 'appraisal-media', 'appraisals/' || aid || '/header/rb-hero.jpg') or public.appraisal_vendor_can_read(sid, 'appraisal-media', 'appraisals/' || aid || '/comps/' || c1 || '/rb-a.jpg') then out := out || 'A FORMER OWNER STILL GETS PHOTO LINKS; '; end if;
  if jsonb_array_length(public.vendor_appraisals_mine()) > 0 then out := out || 'A FORMER OWNER STILL HAS IT LISTED; '; end if;
  begin j := public.vendor_appraisal_proceed(sid2); out := out || 'A FORMER OWNER PROCEEDED; '; exception when others then null; end;
  begin j := public.vendor_appraisal_plan_save(sid2, '{"sel":{"lim":1},"total":1}'); out := out || 'A FORMER OWNER SAVED A PLAN; '; exception when others then null; end;
  out := out || 'former owner: no copy, no links, no listing, no proceed, no plan; ';
  execute 'reset role';
  -- the questionnaire contact, never set aside, still reads it; version 2 wasn't sent to them, so its link isn't theirs
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', plc, true);
  begin j := public.vendor_appraisal_read(aid); out := out || 'the questionnaire contact still reads theirs; '; exception when others then out := out || 'THE QUESTIONNAIRE CONTACT LOST IT; '; end;
  begin j := public.vendor_appraisal_read(sid2); out := out || 'VERSION 2''S LINK OPENED FOR SOMEONE IT WASN''T SENT TO; '; exception when others then out := out || 'version 2''s link: not theirs, not found; '; end;
  execute 'reset role';
  -- Tim reads everything
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  select count(*) into n from public.appraisal_snapshots where chain_id = aid; if n <> 2 then out := out || 'TIM SEES ' || n || ' COPIES; '; else out := out || 'Tim sees both copies; '; end if;

  -- ── the seal: stored at sending, worked out again on "Check the seal" ──
  select to_jsonb(s) into j from public.appraisal_snapshots s where id = sid;
  if j->>'seal_sha256' ~ '^[0-9a-f]{64}$' and (j->>'sealed_at') is not null and jsonb_array_length(j->'files') = jsonb_array_length(j->'paths')
     and (select bool_and(f->>'size' is not null) from jsonb_array_elements(j->'files') f) then out := out || 'sealed: time, fingerprint, and every listed file with its size; ';
  else out := out || 'SEAL NOT STORED: ' || left(coalesce(j->>'seal_sha256', 'none') || ' ' || coalesce((j->'files')::text, ''), 200) || '; '; end if;
  j := public.agent_appraisal_seal_check(sid);
  if (j->>'ok')::boolean and j->>'stored' = j->>'computed' and (j->>'files_ok')::boolean and jsonb_array_length(j->'files') = 6 then out := out || 'Check the seal: it matches, and all 6 files are as sealed; '; else out := out || 'THE SEAL DOESN''T MATCH A COPY THAT WASN''T TOUCHED; '; end if;
  if (public.agent_appraisal_seal_check(sid2)->>'ok')::boolean then out := out || 'and version 2''s too; '; else out := out || 'VERSION 2''S SEAL DOESN''T MATCH; '; end if;
  execute 'reset role';
  begin update public.appraisal_snapshots set seal_sha256 = repeat('0', 64) where id = sid; out := out || 'THE SEAL CHANGED; '; exception when others then out := out || 'the seal never changes; '; end;
  begin update public.appraisal_snapshots set sealed_at = now() where id = sid; out := out || 'THE SEAL TIME CHANGED; '; exception when others then out := out || 'nor its time; '; end;
  begin update public.appraisal_snapshots set files = '[]' where id = sid; out := out || 'THE SEALED FILES CHANGED; '; exception when others then out := out || 'nor its files; '; end;
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', plc, true);
  begin j := public.agent_appraisal_seal_check(sid); out := out || 'A VENDOR CHECKED A SEAL; '; exception when others then out := out || 'vendor: no seal check; '; end;
  -- ── three months on: "Ask for an updated appraisal" ──
  begin j := public.vendor_appraisal_ask_update(sid); out := out || 'AN UPDATE WAS ASKED FOR A CURRENT APPRAISAL; '; exception when others then out := out || 'still current: no asking yet (' || sqlerrm || '); '; end;
  execute 'reset role';
  -- a test stand-in only: the guard set aside for a moment to age version 1 by three months and a day, as if that time had passed (this
  -- also tampers with the sealed copy, which "Check the seal" must then catch)
  alter table public.appraisal_snapshots disable trigger appraisal_snapshots_kept;
  update public.appraisal_snapshots set sealed_at = sealed_at - interval '3 months 1 day' where id = sid;
  alter table public.appraisal_snapshots enable trigger appraisal_snapshots_kept;
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', plc, true);
  j := public.vendor_appraisal_read(aid);
  if (j->>'expires_at')::timestamptz <= now() and not (j->>'asked')::boolean then out := out || 'three months and a day on: expired, not asked yet; '; else out := out || 'EXPIRY WRONG: ' || coalesce(j->>'expires_at', 'none') || '; '; end if;
  j := public.vendor_appraisal_ask_update(sid);
  if j->>'event_id' is not null and (public.vendor_appraisal_read(aid)->>'asked')::boolean then out := out || 'asked for an update: recorded; '; else out := out || 'ASK NOT RECORDED; '; end if;
  ev := (j->>'event_id')::bigint;
  if public.appraisal_event_mine(ev) then out := out || 'theirs to tell Tim about; '; else out := out || 'THE ASK CAN''T BE TOLD TO TIM; '; end if;
  j := public.vendor_appraisal_ask_update(sid);
  if j->>'event_id' is null then out := out || 'asked again: nothing new, Tim not told twice; '; else out := out || 'ASKED TWICE; '; end if;
  execute 'reset role';
  begin insert into public.appraisal_events (snapshot_id, chain_id, property_id, kind, actor) values (sid, aid, pid, 'update_asked', 'rb-pl@example.com'); out := out || 'UPDATE ASKED RECORDED TWICE; '; exception when unique_violation then out := out || 'update asked: once, by the index; '; end;
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', other, true);
  begin j := public.vendor_appraisal_ask_update(sid); out := out || 'ANOTHER PROPERTY''S OWNER ASKED; '; exception when others then out := out || 'someone else: not found; '; end;
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', owner, true);
  begin j := public.vendor_appraisal_ask_update(sid); out := out || 'A FORMER OWNER ASKED; '; exception when others then out := out || 'former owner: can''t ask; '; end;
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  if (public.agent_appraisal_seal_check(sid)->>'ok')::boolean then out := out || 'A TAMPERED COPY STILL PASSES THE SEAL CHECK; '; else out := out || 'a copy changed behind the guard: the seal check says it doesn''t match; '; end if;
  -- an appraisal whose wording is over 2 MB: a plain message at Send, not the table's check
  v3 := (public.agent_appraisal_new_version(v2)->>'appraisal_id')::uuid;
  update public.appraisal_views set sections = jsonb_build_array(jsonb_build_object('type', 'para', 'text', repeat('Sunny rooms and a big garden. ', 70000))) where id = v3;
  begin perform public.agent_appraisal_send(v3, array['rb-pl@example.com'], 'RB', body); out := out || 'A 2 MB APPRAISAL WAS SENT; ';
  exception when others then if sqlerrm like 'This appraisal is too long to send (its wording is over 2 MB)%' then out := out || 'over 2 MB: said plainly; '; else out := out || 'OVER 2 MB: ' || left(sqlerrm, 120) || '; '; end if; end;
  -- the seal text: what the downloaded copy carries; its SHA-256 is the fingerprint, and it names who it went to and who sent it
  j := public.agent_appraisal_seal_check(sid2);
  if encode(sha256(convert_to(j->>'seal_text', 'UTF8')), 'hex') = j->>'stored' and (j->>'seal_text')::jsonb->'recipients' = '[{"name":"Robin","email":"rb-owner@example.com"}]'::jsonb
     and (j->>'seal_text')::jsonb->>'sent_by' = agent::jsonb->>'email' and (j->>'files_ok')::boolean and jsonb_array_length(j->'files_changed') = 0
  then out := out || 'the seal text hashes to the fingerprint, with the recipients and the sender; files as sealed; ';
  else out := out || 'SEAL TEXT WRONG: ' || left(coalesce((j->>'seal_text')::jsonb->>'recipients', 'none') || ' ' || coalesce((j->>'seal_text')::jsonb->>'sent_by', 'none') || ' ' || coalesce(j->>'files_changed', ''), 200) || '; '; end if;
  execute 'reset role';
  -- a listed file missing from storage: never sealed; the send stops, naming it
  update public.appraisal_views set sections = (select sections from public.appraisal_views where id = aid) where id = v3;
  -- as the Storage API removes a file (its own setting, put back at once)
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'property-files' and name = 'properties/' || pid || '/photos/rb-kitchen.jpg';
  perform set_config('storage.allow_delete_query', 'false', true);
  x := (select f->>'path' from public.appraisal_snapshots s, jsonb_array_elements(s.files) f where s.id = sid and f->>'path' not like '%rb-kitchen.jpg' limit 1);
  update storage.objects set metadata = metadata || '{"size": 1}' where name = x;
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_appraisal_send(v3, array['rb-pl@example.com'], 'RB', body); out := out || 'SENT WITH A FILE MISSING; ';
  exception when others then if sqlerrm = 'A file in this appraisal is missing: rb-kitchen.jpg. Upload it again or take it out, then send again' then out := out || 'a missing file: not sealed, named; '; else out := out || 'MISSING FILE: ' || left(sqlerrm, 120) || '; '; end if; end;
  -- "Check the seal" compares each sealed file of version 1 with storage now: the gone one and the changed one named
  j := public.agent_appraisal_seal_check(sid);
  if not (j->>'files_ok')::boolean and jsonb_array_length(j->'files_changed') = 2
     and j->'files_changed' @> jsonb_build_array(jsonb_build_object('path', 'properties/' || pid || '/photos/rb-kitchen.jpg', 'status', 'gone'))
     and j->'files_changed' @> jsonb_build_array(jsonb_build_object('path', x, 'status', 'changed'))
  then out := out || 'Check the seal: a gone file and a changed file named; '; else out := out || 'FILES NOT CHECKED: ' || left(coalesce(j->>'files_changed', 'none'), 900) || '; '; end if;
  execute 'reset role';
  -- an old version when a newer one sent to them is still current: the newer one is their answer (version 1 is past three months)
  update public.property_people set role = 'owner' where property_id = pid and email = 'rb-owner@example.com';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', owner, true);
  j := public.vendor_appraisal_read(sid);
  if (j->>'expires_at')::timestamptz <= now() and (j->'newest'->>'expires_at')::timestamptz > now() and (j->'newest'->>'version')::int = 2 then out := out || 'version 1 expired, version 2 current, both told; '; else out := out || 'NEWEST EXPIRY NOT TOLD: ' || left(j->>'newest', 150) || '; '; end if;
  begin j := public.vendor_appraisal_ask_update(sid); out := out || 'ASKED ON AN OLD VERSION WITH A CURRENT NEWER ONE; ';
  exception when others then if sqlerrm like 'There''s a newer version of this appraisal%' then out := out || 'an old version with a current newer one: refused; '; else out := out || 'OLD VERSION ASK: ' || sqlerrm || '; '; end if; end;
  execute 'reset role';
  -- three months on the UTC calendar, clamped to the month's end as Postgres does, whatever the session's time zone (the portal's
  -- apExpiresAt gives the same, tests/appraisal-send.test.js)
  x := '';
  foreach tz in array array['UTC', 'Pacific/Auckland', 'America/Los_Angeles'] loop
    perform set_config('timezone', tz, true);
    for r in select * from (values ('2026-11-28T12:00:00Z', '2027-02-28T12:00:00Z'), ('2026-11-29T12:00:00Z', '2027-02-28T12:00:00Z'),
        ('2026-11-30T12:00:00Z', '2027-02-28T12:00:00Z'), ('2026-11-30T23:30:00Z', '2027-02-28T23:30:00Z'), ('2026-12-31T08:00:00Z', '2027-03-31T08:00:00Z'),
        ('2026-08-31T12:00:00Z', '2026-11-30T12:00:00Z'), ('2027-11-30T12:00:00Z', '2028-02-29T12:00:00Z'), ('2027-11-29T10:15:00.123456Z', '2028-02-29T10:15:00.123456Z')) as t(a, b) loop
      if public.appraisal_expires_at(r.a::timestamptz) <> r.b::timestamptz then x := x || tz || ':' || r.a || ' '; end if;
    end loop;
  end loop;
  perform set_config('timezone', 'UTC', true);
  if x = '' then out := out || 'expiry: three months, clamped to the month''s end, in any time zone; '; else out := out || 'EXPIRY DATES WRONG: ' || x || '; '; end if;
  -- ── the agency agreement's appraisal link (Tim, 28 November 2026: "Just the permalink", then "Make them one"): the one field is
  --    config.apprUrl (clause 23.1). Our appraisal links: drafts only, this property's sent versions only. Anything else typed by hand:
  --    exactly as today. guard_signed_agreement unchanged ──
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  x := 'https://packages.dunnerstunner.co.nz/onboarding/?appraisal=' || aid || '&v=2';
  insert into public.agreements (property_id, address, status, config) values (pid, 'RB 9 Send Street, Rbvale', 'draft', '{"appr":"done","ask":"550000"}') returning id into jh_ag;
  update public.agreements set config = config || jsonb_build_object('apprUrl', x) where id = jh_ag;
  if (select config->>'apprUrl' from public.agreements where id = jh_ag) = x and not ((select config from public.agreements where id = jh_ag) ? 'apprLink')
  then out := out || 'a draft takes the latest sealed version''s permanent link, in apprUrl only; '; else out := out || 'THE DRAFT DIDN''T TAKE THE LINK; '; end if;
  x2 := '';
  foreach x3 in array array['https://packages.dunnerstunner.co.nz/onboarding/?appraisal=' || aid || '&v=9', 'http://packages.dunnerstunner.co.nz/onboarding/?appraisal=' || aid || '&v=1',
      'https://packages.dunnerstunner.co.nz/onboarding/?appraisal=' || aid, 'https://packages.dunnerstunner.co.nz/onboarding/?appraisal=' || aid || '&v=1&x=1',
      'packages.dunnerstunner.co.nz/onboarding/?appraisal=' || aid || '&v=1', 'HTTPS://PACKAGES.DUNNERSTUNNER.CO.NZ/ONBOARDING/?APPRAISAL=' || upper(aid::text) || '&V=1'] loop
    begin update public.agreements set config = config || jsonb_build_object('apprUrl', x3) where id = jh_ag; x2 := x2 || x3 || ' ';
    exception when others then if sqlerrm not like 'That isn''t the permanent link of an appraisal sent for this property%' then x2 := x2 || sqlerrm || ' '; end if; end;
  end loop;
  if x2 = '' then out := out || 'anything that looks like our appraisal link but isn''t a sent version of it: refused, in plain words; '; else out := out || 'BAD LINKS TAKEN: ' || left(x2, 200) || '; '; end if;
  -- typed by hand, as before: any other address or words, on a draft or a sent agreement
  x2 := '';
  foreach x3 in array array['https://rbappraisals.example.com/robin', 'Given in writing on 20 November', '', 'https://packages.dunnerstunner.co.nz/quiet/'] loop
    begin update public.agreements set config = config || jsonb_build_object('apprUrl', x3) where id = jh_ag; exception when others then x2 := x2 || x3 || ': ' || sqlerrm || ' '; end;
  end loop;
  begin update public.agreements set config = config || '{"apprUrl": 42}' where id = jh_ag; exception when others then x2 := x2 || 'a number '; end;
  if x2 = '' then out := out || 'other typed text: as before; '; else out := out || 'TYPED TEXT REFUSED: ' || left(x2, 200) || '; '; end if;
  insert into public.agreements (property_id, address, status, config) values (pid2, 'RB 11 Other Street, Rbvale', 'draft', '{}') returning id into jh_ag2;
  begin update public.agreements set config = config || jsonb_build_object('apprUrl', x) where id = jh_ag2; out := out || 'ANOTHER PROPERTY''S APPRAISAL LINKED; ';
  exception when others then out := out || 'another property''s appraisal: refused; '; end;
  update public.agreements set config = config - 'apprUrl' where id = jh_ag;
  update public.agreements set config = config || jsonb_build_object('apprUrl', 'https://packages.dunnerstunner.co.nz/onboarding/?appraisal=' || aid || '&v=1') where id = jh_ag;
  out := out || 'removed and set to version 1 on a draft; ';
  -- sent: no appraisal link can be added; typed text and Tim's other changes pass as before
  update public.agreements set status = 'sent', sent_at = now() where id = jh_ag;
  begin update public.agreements set config = config || jsonb_build_object('apprUrl', x) where id = jh_ag; out := out || 'A SENT AGREEMENT TOOK A NEW APPRAISAL LINK; ';
  exception when others then if sqlerrm like 'An appraisal link can only be added on a draft agreement%' then out := out || 'sent: no new appraisal link; '; else out := out || 'SENT: ' || sqlerrm || '; '; end if; end;
  begin update public.agreements set config = config || '{"agent_notes":"RB note","ask":"560000"}' where id = jh_ag; out := out || 'other changes to a sent agreement pass as before; ';
  exception when others then out := out || 'THE LINK GUARD BLOCKED ANOTHER CHANGE: ' || sqlerrm || '; '; end;
  begin update public.agreements set config = config || '{"apprUrl":"https://rbappraisals.example.com/robin"}' where id = jh_ag; out := out || 'and typed text on a sent agreement, as before; ';
  exception when others then out := out || 'TYPED TEXT ON A SENT AGREEMENT REFUSED: ' || sqlerrm || '; '; end;
  begin insert into public.agreements (property_id, address, status, config) values (pid, 'RB 9', 'sent', jsonb_build_object('apprUrl', x)); out := out || 'A SENT AGREEMENT WAS MADE WITH A LINK; ';
  exception when others then out := out || 'a new agreement: only a draft takes an appraisal link; '; end;
  insert into public.agreements (property_id, address, status, config) values (pid, 'RB 9 Send Street, Rbvale', 'draft', jsonb_build_object('appr', 'done', 'apprUrl', x)) returning id into jh_ag2;
  out := out || 'a new draft may start with it; ';
  -- signed: guard_signed_agreement still refuses every change to the terms, the link included
  execute 'reset role';
  insert into public.agreement_people (agreement_id, position, legal_name, email, signed_at) values (jh_ag2, 1, 'Robin Rbowner', 'rb-owner@example.com', now());
  update public.agreements set status = 'signed', signed_at = now() where id = jh_ag2;
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  begin update public.agreements set config = config - 'apprUrl' where id = jh_ag2; out := out || 'A SIGNED AGREEMENT''S LINK WAS CLEARED; ';
  exception when others then if sqlerrm = 'This agreement has been signed, so its terms can no longer be changed' then out := out || 'signed: the link stays, by the signed-agreement guard; '; else out := out || 'SIGNED CLEAR: ' || sqlerrm || '; '; end if; end;
  begin update public.agreements set config = config || '{"apprUrl":"https://rbappraisals.example.com/robin"}' where id = jh_ag2; out := out || 'A SIGNED AGREEMENT TOOK TYPED TEXT; ';
  exception when others then if sqlerrm = 'This agreement has been signed, so its terms can no longer be changed' then out := out || 'nor typed over; '; else out := out || 'SIGNED TYPED: ' || sqlerrm || '; '; end if; end;
  begin update public.agreements set config = config || '{"ask":"1"}' where id = jh_ag2; out := out || 'A SIGNED AGREEMENT''S TERMS CHANGED; ';
  exception when others then if sqlerrm = 'This agreement has been signed, so its terms can no longer be changed' then out := out || 'and its terms stay, as before; '; else out := out || 'SIGNED: ' || sqlerrm || '; '; end if; end;
  update public.agreements set config = config || '{"agent_notes":"RB note"}' where id = jh_ag2;
  out := out || 'Tim''s own notes still change; ';
  execute 'reset role';

  -- Done on the expiry item: once per version, seen and notified at once (never a vendor's event to tell), Tim only
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', owner, true);
  begin perform public.agent_appraisal_expiry_done(sid2); out := out || 'A VENDOR TICKED THE EXPIRY DONE; '; exception when others then out := out || 'vendor: no expiry Done; '; end;
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  ok := public.agent_appraisal_expiry_done(sid2);
  if ok and not public.agent_appraisal_expiry_done(sid2) then out := out || 'expiry Done: recorded once; '; else out := out || 'EXPIRY DONE NOT ONCE; '; end if;
  execute 'reset role';
  select count(*) into n from public.appraisal_events where snapshot_id = sid2 and kind = 'expiry_done' and seen_at is not null and notified_at is not null;
  if n = 1 and not exists (select 1 from public.appraisal_events where snapshot_id = sid and kind = 'expiry_done') then out := out || 'for that version only, never told; '; else out := out || 'EXPIRY DONE ROWS: ' || n || '; '; end if;
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', owner, true);
  select id into ev from public.appraisal_events where snapshot_id = sid2 and kind = 'expiry_done';
  if public.appraisal_event_mine(ev) then out := out || 'EXPIRY DONE COULD BE TOLD; '; end if;
  execute 'reset role';

  -- ── the look (038) frozen with the copy: the "Yours" figures, the suburb's sales last month with full addresses, the personal video,
  --    the price wording, and Tim's About and contact as they were at Send (off stays off); later changes never reach a sealed copy ──
  lm := date_trunc('month', today - interval '1 month')::date;
  insert into public.appraisal_views (property_id, title, address, prepared_for, status, setup, fields, sections) values (pid, 'RB look', 'RB 9 Send Street, Rbvale', 'Robin', 'draft',
    '{"v":1,"suburb":" Rbvale ","showCv":false}', '{"ranges":[{"key":"A","option":"Your home","low":520000,"high":575000}]}',
    '[{"type":"pvideo","stage":1,"provider":"youtube","id":"Rb_Test-12a","hash":"","rb_secret":"RB-PV-SECRET"},{"type":"pvideo","provider":"rbtube","id":"RB-BAD-VIDEO"},{"type":"opinion","wording":"How buyers set the price. RB words.","ai_note":"RB-AI-OPINION"}]') returning id into aid4;
  insert into public.appraisal_comps (appraisal_id, position, shown, status, address, price, compare_text, compare_ticked, source) values (aid4, 1, true, 'sold', 'RB 12 Near Street, Rbvale', 560000, 'RB-UNTICKED-LOOK', false, 'tim') returning id into c6;
  insert into public.market_sales (suburb, sold_on, price, address, bedrooms, bathrooms, property_type, source, source_ref) values
    ('Rbvale', lm + 4, 548000, 'RB 2 Last Month Road, Rbvale', 3, 1.5, 'RB-TYPE', 'reinz', 'RB-LM-1'), ('rbvale ', lm + 20, 612000, 'RB 9 Last Month Road, Rbvale', 4, 2, '', 'other', 'RB-LM-2'),
    ('Othervale', lm + 5, 999000, 'RB-OTHER-SUBURB', 5, 3, '', 'reinz', 'RB-LM-3'), ('Rbvale', (lm - interval '1 month')::date + 3, 480000, 'RB-OLDER-MONTH', 2, 1, '', 'reinz', 'RB-LM-4');
  update public.site_profile set name = 'RB Tim', licence = 'RB licence', photo_path = 'profile/rb-me.jpg',
    about = '{"tim":{"heading":"RB about","body":"RB body.","image_path":"about/rb-a.jpg"},"agency":{"heading":"","body":"RB agency.","image_path":null}}',
    channels = '[{"key":"call","on":false},{"key":"text","on":false},{"key":"email","on":true},{"key":"form","on":true},{"key":"whatsapp","on":true,"value":"+64 21 555 0100"},{"key":"signal","on":false,"value":"+64 21 555 0101"}]'
   where id;
  insert into storage.objects (bucket_id, name, metadata) values ('appraisal-media', 'appraisals/' || aid4 || '/site/profile-rb-me.jpg', '{"mimetype":"image/jpeg","size":321}');
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  j := public.agent_appraisal_send(aid4, array['rb-pl@example.com'], 'RB look', body, '{"subject":{"bedrooms":3,"bathrooms":1.5,"cv":600000,"rb_secret":"RB-SUBJECT-SECRET","garaging":"call 021 555 0199","year_built":"1950s"}}');
  sid4 := (j->>'snapshot_id')::uuid;
  execute 'reset role';
  select to_jsonb(s) into j4 from public.appraisal_snapshots s where id = sid4;
  if j4->'content'->'subject' = '{"bedrooms":3,"bathrooms":1.5,"year_built":"1950s"}'::jsonb then out := out || 'Yours: only its figures, no rating valuation unless shown, nothing with contact details; ';
  else out := out || 'YOURS WRONG: ' || coalesce(j4->'content'->>'subject', 'none') || '; '; end if;
  if j4->'content'->'suburbSales'->>'suburb' = 'Rbvale' and j4->'content'->'suburbSales'->>'month' = to_char(lm, 'YYYY-MM') and jsonb_array_length(j4->'content'->'suburbSales'->'rows') = 2
     and j4->'content'->'suburbSales'->'rows'->0 = jsonb_build_object('suburb', 'Rbvale', 'sold_on', lm + 4, 'price', 548000, 'address', 'RB 2 Last Month Road, Rbvale', 'bedrooms', 3, 'bathrooms', 1.5, 'source', 'reinz')
     and j4->'content'->'suburbSales'->'rows'->1->>'address' = 'RB 9 Last Month Road, Rbvale'
  then out := out || 'the suburb''s sales last month, full addresses, drawn fields only; '; else out := out || 'SUBURB SALES WRONG: ' || left(coalesce(j4->'content'->>'suburbSales', 'none'), 300) || '; '; end if;
  x := (j4->'content')::text;
  for r in select t from unnest(array['RB-OTHER-SUBURB', 'RB-OLDER-MONTH', 'RB-TYPE', 'RB-LM-1', 'source_ref', 'property_type', 'RB-SUBJECT-SECRET', 'rb_secret', 'RB-PV-SECRET', 'RB-BAD-VIDEO', 'RB-AI-OPINION', 'RB-UNTICKED-LOOK', '021 555 0101', 'about/rb-a.jpg', 'profile/rb-me.jpg', '"on"']) t loop
    if position(r.t in x) > 0 then out := out || 'THE LOOK COPY HOLDS ' || upper(r.t) || '; '; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(j4->'content'->'sections') e where e = '{"type":"pvideo","stage":1,"provider":"youtube","id":"Rb_Test-12a"}'::jsonb) = 1
     and (select count(*) from jsonb_array_elements(j4->'content'->'sections') e where e = '{"type":"opinion","wording":"How buyers set the price. RB words."}'::jsonb) = 1
     and jsonb_array_length(j4->'content'->'sections') = 2
  then out := out || 'the personal video (id only) and the price wording, nothing else; '; else out := out || 'VIDEO OR WORDING WRONG: ' || left((j4->'content'->>'sections'), 300) || '; '; end if;
  if j4->'content'->'site' = jsonb_build_object('name', 'RB Tim', 'licence', 'RB licence', 'phone', '', 'email', (select email from public.site_profile where id), 'photo', 'appraisals/' || aid4 || '/site/profile-rb-me.jpg',
       'about', '{"tim":{"heading":"RB about","body":"RB body."},"agency":{"heading":"","body":"RB agency."}}'::jsonb,
       'channels', '[{"key":"email","value":""},{"key":"form","value":""},{"key":"whatsapp","value":"+64 21 555 0100"}]'::jsonb)
  then out := out || 'About and contact as at Send: Call and Text off so no phone, its own picture copy, no About image without a copy; ';
  else out := out || 'SITE WRONG: ' || left(coalesce(j4->'content'->>'site', 'none'), 400) || '; '; end if;
  if j4->'paths' @> jsonb_build_array(jsonb_build_object('bucket', 'appraisal-media', 'path', 'appraisals/' || aid4 || '/site/profile-rb-me.jpg'))
     and j4->'files' @> jsonb_build_array(jsonb_build_object('bucket', 'appraisal-media', 'path', 'appraisals/' || aid4 || '/site/profile-rb-me.jpg', 'size', 321))
     and j4->'left_out' @> '[{"what":"picture","which":"your About image"}]'::jsonb and not (j4->'left_out' @> '[{"which":"your profile picture"}]'::jsonb)
  then out := out || 'the picture copy listed and sealed; the About image without a copy left out, and listed for Tim; '; else out := out || 'SITE FILES WRONG: ' || left(coalesce((j4->'paths')::text, '') || (j4->'left_out')::text, 300) || '; '; end if;
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  j := public.agent_appraisal_seal_check(sid4);
  if (j->>'ok')::boolean and (j->>'files_ok')::boolean and (j->>'seal_text')::jsonb->'content' ? 'site' and (j->>'seal_text')::jsonb->'content' ? 'suburbSales' and (j->>'seal_text')::jsonb->'content' ? 'subject'
  then out := out || 'the seal covers the look''s fields; '; else out := out || 'SEAL OF THE LOOK WRONG; '; end if;
  -- later: Tim changes his profile, turns Call back on, removes his video; the sealed copy and its seal are as they were
  perform public.agent_site_profile_save(jsonb_build_object('name', 'RB Changed', 'licence', '', 'phone', '027 000 0000', 'email', 'rb-new@example.com', 'photo_path', null, 'about', '{}'::jsonb,
    'channels', '[{"key":"call","on":true},{"key":"text","on":true},{"key":"email","on":true}]'::jsonb));
  begin update public.appraisal_views set sections = '[]' where id = aid4; out := out || 'A SENT APPRAISAL''S VIDEO CHANGED; '; exception when others then null; end;
  j := public.agent_appraisal_seal_check(sid4);
  if (select content from public.appraisal_snapshots where id = sid4) = j4->'content' and (j->>'ok')::boolean
  then out := out || 'later profile, switch and video changes: the sealed copy and its seal unchanged; '; else out := out || 'A SEALED COPY CHANGED AFTER SEND; '; end if;
  execute 'reset role';
  alter table public.appraisal_snapshots disable trigger appraisal_snapshots_kept;
  update public.appraisal_snapshots set content = jsonb_set(content, '{site,phone}', '"027 000 0000"') where id = sid4;
  alter table public.appraisal_snapshots enable trigger appraisal_snapshots_kept;
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  if (public.agent_appraisal_seal_check(sid4)->>'ok')::boolean then out := out || 'A FORGED PHONE IN THE SEALED CONTACT PASSES; '; else out := out || 'a forged phone in the sealed contact: the seal check fails; '; end if;
  -- the agreement link rechecked when an agreement's property moves (a typed address moves freely, as before)
  x := 'https://packages.dunnerstunner.co.nz/onboarding/?appraisal=' || aid || '&v=2';
  insert into public.agreements (property_id, address, status, config) values (pid, 'RB 9 Send Street, Rbvale', 'draft', jsonb_build_object('appr', 'done', 'apprUrl', x)) returning id into jh_ag;
  begin update public.agreements set property_id = pid2 where id = jh_ag; out := out || 'AN AGREEMENT MOVED WITH ANOTHER PROPERTY''S APPRAISAL LINK; ';
  exception when others then if sqlerrm like 'That isn''t the permanent link of an appraisal sent for this property%' then out := out || 'moved to another property: the link is rechecked and refused; '; else out := out || 'MOVE: ' || sqlerrm || '; '; end if; end;
  update public.agreements set config = config || '{"apprUrl":"https://rbappraisals.example.com/robin"}' where id = jh_ag;
  update public.agreements set property_id = pid2 where id = jh_ag;
  out := out || 'a typed address moves with it, as before; ';
  execute 'reset role';

  -- ── the whitelist keeps what the renderer has a default for missing (re-review of f73d2fb): column headings stay missing when the
  -- section has none; [] stays []; a non-text table cell is blanked, not dropped; and real section sets from APPR.writeStandard (every
  -- campaign kind and method, one and two price ranges) clean to exactly what the mock's cleaner gives, which renders byte for byte as
  -- the uncleaned sections (tests/appraisal-clean.test.js) ──
  x := '';
  if public.appraisal_section_clean('{"type":"opinion"}') <> '{"type":"opinion"}'::jsonb then x := x || 'opinion '; end if;
  if public.appraisal_section_clean('{"type":"opinion","table":true}') <> '{"type":"opinion","table":true}'::jsonb then x := x || 'opinion-table '; end if;
  if public.appraisal_section_clean('{"type":"ranges"}') <> '{"type":"ranges"}'::jsonb then x := x || 'ranges '; end if;
  if public.appraisal_section_clean('{"type":"table","rows":[["a"]]}') <> '{"type":"table","rows":[["a"]]}'::jsonb then x := x || 'table '; end if;
  if public.appraisal_section_clean('{"type":"methods","rows":[]}') <> '{"type":"methods","rows":[]}'::jsonb then x := x || 'methods '; end if;
  if public.appraisal_section_clean('{"type":"opinion","head":[]}') <> '{"type":"opinion","head":[]}'::jsonb then x := x || 'empty-head '; end if;
  if public.appraisal_section_clean('{"type":"ranges","head":"Part"}') <> '{"type":"ranges"}'::jsonb then x := x || 'string-head '; end if;
  if public.appraisal_section_clean('{"type":"opinion","head":["Part",{"text":"Range","ticked":true},{"text":"x","ticked":false}]}') <> '{"type":"opinion","head":["Part","Range"]}'::jsonb then x := x || 'ticked-head '; end if;
  if public.appraisal_section_clean('{"type":"table","head":["A","B","C","D"],"rows":[["a",null,3,{"x":1}],"bad"]}') <> '{"type":"table","head":["A","B","C","D"],"rows":[["a","","3",""]]}'::jsonb then x := x || 'cells '; end if;
  if x = '' then out := out || 'missing headings stay missing, [] stays [], other cells blanked; '; else out := out || 'THE WHITELIST CHANGES A DEFAULT: ' || x || '; '; end if;
  n := 0; x := '';
  for r in select c->>'name' as nm, c->'sections' as secs, c->'expected' as exp from jsonb_array_elements($cases$__CLEAN_CASES__$cases$::jsonb) c loop
    n := n + 1;
    j := (select coalesce(jsonb_agg(public.appraisal_section_clean(s) order by i) filter (where public.appraisal_section_clean(s) is not null), '[]'::jsonb) from jsonb_array_elements(r.secs) with ordinality as e(s, i));
    if j is distinct from r.exp then x := x || r.nm || ' '; end if;
  end loop;
  if n >= 30 and x = '' then out := out || n || ' writeStandard section sets: cleaned exactly as the mock cleans them; '; else out := out || 'CLEANED DIFFERENTLY FROM THE MOCK (' || n || '): ' || left(x, 200) || '; '; end if;

  raise exception 'ROLLBACK %', out;
end $t$;

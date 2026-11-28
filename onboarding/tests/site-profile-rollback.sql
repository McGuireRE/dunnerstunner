-- Rollback test for migration 038 (comparison drafts, Tim's About and contact, the public images bucket, "Send a message"). Run with
-- onboarding/tests/site-profile-rollback.js, which puts the whole migration inside the block, so one statement applies it, runs the
-- checks and then raises, which undoes it all. Nothing is kept. The output is the exception message: lower case reads as expected; a
-- line in CAPITALS means something was wrong. Needs 036 and its stand-ins (tests/appraisal-home-standin.sql says how they are built).
-- Self-contained: it makes every row it needs (invented data only). The agent is the first row of public.agents.
do $t$
declare out text := ''; x text; n int; j jsonb; r record;
  pid uuid; aid uuid; cid uuid; other uuid; m1 uuid; i int;
  drafts_before text; views_before text; pols_before text; buckets_before text;
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text;
  vendor text := json_build_object('email', 'rb-vendor@example.com', 'sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text;
  vendor2 text := json_build_object('email', 'rb-other@example.com', 'sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text;
begin
  insert into public.properties (address) values ('RB 8 Site Road, Rbvale') returning id into pid;
  insert into public.appraisal_views (property_id, title, address, status, setup, sections, fields) values (pid, 'RB appraisal', 'RB 8 Site Road, Rbvale', 'draft', '{"v":1}', '[]', '{}') returning id into aid;
  insert into public.appraisal_views (property_id, title, address, status, setup, sections, fields) values (pid, 'RB other', 'RB 8 Site Road, Rbvale', 'draft', '{"v":1}', '[]', '{}') returning id into other;
  insert into public.appraisal_comps (appraisal_id, address, status) values (aid, 'RB 10 Site Road', 'sold') returning id into cid;
  select string_agg(to_jsonb(d)::text, '|' order by id) into drafts_before from public.appraisal_drafts d;
  select string_agg(to_jsonb(v)::text, '|' order by id) into views_before from public.appraisal_views v;
  select string_agg(policyname || cmd || coalesce(qual, '') || coalesce(with_check, ''), '|' order by policyname) into pols_before from pg_policies where schemaname = 'storage' and tablename = 'objects';
  select string_agg(to_jsonb(b)::text, '|' order by id) into buckets_before from storage.buckets b;

  $mig$__MIGRATION__$mig$;

  -- nothing already there changed
  select string_agg(to_jsonb(v)::text, '|' order by id) into x from public.appraisal_views v;
  if x is distinct from views_before then out := out || 'AN EXISTING APPRAISAL CHANGED; '; else out := out || 'appraisals unchanged; '; end if;
  select string_agg(to_jsonb(d)::text, '|' order by id) into x from public.appraisal_drafts d;
  if x is distinct from drafts_before then out := out || 'AN EXISTING DRAFT CHANGED; '; else out := out || 'drafts unchanged; '; end if;
  select string_agg(policyname || cmd || coalesce(qual, '') || coalesce(with_check, ''), '|' order by policyname) into x from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname not in ('site_public_agent_add', 'site_public_agent_update', 'site_public_agent_remove', 'site_public_agent_read');
  if x is distinct from pols_before then out := out || 'AN EXISTING STORAGE POLICY CHANGED; '; else out := out || 'storage policies: only added; '; end if;
  select string_agg(to_jsonb(b)::text, '|' order by id) into x from storage.buckets b where id <> 'site-public';
  if x is distinct from buckets_before then out := out || 'AN EXISTING BUCKET CHANGED; '; else out := out || 'buckets unchanged; '; end if;
  select public::text || '|' || file_size_limit || '|' || array_to_string(allowed_mime_types, ',') into x from storage.buckets where id = 'site-public';
  if x is distinct from 'true|2097152|image/jpeg,image/png,image/webp' then out := out || 'THE PUBLIC BUCKET IS NOT AS WRITTEN: ' || coalesce(x, 'none') || '; '; else out := out || 'site-public: public read, 2 MB, photos only; '; end if;

  -- shape: Row Level Security and privileges
  for r in select t from unnest(array['site_profile', 'contact_messages']) t loop
    select relrowsecurity::text into x from pg_class where oid = ('public.' || r.t)::regclass;
    if x <> 'true' then out := out || 'ROW LEVEL SECURITY IS OFF ON ' || upper(r.t) || '; '; end if;
    if has_table_privilege('anon', 'public.' || r.t, 'select') then out := out || 'ANON CAN READ ' || upper(r.t) || '; '; end if;
    if has_table_privilege('authenticated', 'public.' || r.t, 'insert') or has_table_privilege('authenticated', 'public.' || r.t, 'update') or has_table_privilege('authenticated', 'public.' || r.t, 'delete') then out := out || 'SIGNED-IN USERS CAN WRITE ' || upper(r.t) || '; '; end if;
  end loop;
  if has_function_privilege('anon', 'public.site_profile_public()', 'execute') and has_function_privilege('authenticated', 'public.site_profile_public()', 'execute') then out := out || 'public profile: anyone; '; else out := out || 'THE PUBLIC PROFILE IS NOT READABLE BY EVERYONE; '; end if;
  if has_function_privilege('anon', 'public.contact_send(text,text,text,text,uuid,text)', 'execute') then out := out || 'ANON CAN SEND A MESSAGE; '; end if;
  if has_function_privilege('authenticated', 'public.contact_mark_emailed(uuid,text)', 'execute') or has_function_privilege('anon', 'public.contact_mark_emailed(uuid,text)', 'execute') then out := out || 'MARK EMAILED IS OPEN; '; else out := out || 'mark emailed: service role only; '; end if;

  -- the seed: the phone and email the vendor pages use; no About and no picture yet
  j := public.site_profile_public();
  if j->>'phone' = '027 562 7207' and j->>'email' = 'tim@mcguire.co.nz' and j->>'photo_path' is null and (select count(*) from jsonb_array_elements(j->'channels')) = 4 then out := out || 'seed: phone, email, call, text, email and the form; '; else out := out || 'THE SEED IS WRONG: ' || j::text || '; '; end if;

  -- comparison drafts (service role, as doc-prefill saves them)
  begin perform public.appraisal_draft_save(aid, 'compare', '{"text":"x"}', jsonb_build_object('comp', cid::text, 'facts', '[]'::jsonb), 'claude-sonnet', 'agent'); out := out || 'compare draft: saved; '; exception when others then out := out || 'A COMPARE DRAFT WAS REFUSED: ' || sqlerrm || '; '; end;
  begin perform public.appraisal_draft_save(other, 'compare', '{"text":"x"}', jsonb_build_object('comp', cid::text), 'claude-sonnet', 'agent'); out := out || 'A COMPARE DRAFT FOR ANOTHER APPRAISAL''S COMPARABLE WAS SAVED; '; exception when others then out := out || 'another appraisal''s comparable: refused; '; end;
  begin perform public.appraisal_draft_save(aid, 'compare', '{"text":"x"}', jsonb_build_object('comp', cid::text, 'questions', '["client_heart"]'::jsonb), 'claude-sonnet', 'agent'); out := out || 'THE CLIENT HEART WAS SENT; '; exception when others then out := out || 'client heart: refused; '; end;
  begin perform public.appraisal_draft_save(aid, 'poem', '{}', '{}', 'm', 'agent'); out := out || 'ANY PART WAS SAVED; '; exception when others then out := out || 'unknown part: refused; '; end;
  begin insert into public.appraisal_drafts (appraisal_id, part, result, model, made_by) values (aid, 'other', '{}', 'm', 'a'); out := out || 'THE PART CHECK IS OFF; '; exception when others then out := out || 'part check: on; '; end;

  if (select prosrc from pg_proc where oid = 'public.contact_send(text,text,text,text,uuid,text)'::regprocedure) ~ 'pg_advisory_xact_lock\(hashtext\(''contact_send:'' \|\| me\)\)' then out := out || 'five a day: one sender at a time (lock); '; else out := out || 'CONTACT_SEND TAKES NO LOCK; '; end if;

  -- Tim's picture files: as Tim (through the Storage API, which turns storage.allow_delete_query on), a delete and a replace really
  -- remove the row. Without his read rule a delete finds no row and says nothing, which is how old pictures were being left behind.
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true); perform set_config('storage.allow_delete_query', 'true', true);
  insert into storage.objects (bucket_id, name) values ('site-public', 'profile/rb-old.jpg'), ('site-public', 'about/rb-old.jpg'), ('site-public', 'profile/rb-keep.jpg');
  select count(*) into n from storage.objects where bucket_id = 'site-public'; out := out || 'agent sees ' || n || ' picture rows; ';
  begin
    execute 'reset role'; execute 'drop policy site_public_agent_read on storage.objects';
    execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
    delete from storage.objects where bucket_id = 'site-public' and name = 'profile/rb-old.jpg'; get diagnostics n = row_count;
    raise exception 'undo %', n;
  exception when others then out := out || 'without the read rule a delete removes ' || coalesce(substring(sqlerrm from 'undo (\d+)'), sqlerrm) || '; '; end;
  delete from storage.objects where bucket_id = 'site-public' and name = 'profile/rb-old.jpg'; get diagnostics n = row_count; out := out || 'remove picture: ' || n || ' row; ';
  insert into storage.objects (bucket_id, name) values ('site-public', 'about/rb-new.jpg');
  delete from storage.objects where bucket_id = 'site-public' and name = 'about/rb-old.jpg'; get diagnostics n = row_count; out := out || 'replace About image: old ' || n || ' row removed; ';
  update storage.objects set metadata = '{"v":2}' where bucket_id = 'site-public' and name = 'profile/rb-keep.jpg'; get diagnostics n = row_count; out := out || 'overwrite in place: ' || n || ' row; ';
  execute 'reset role';
  select string_agg(name, ',' order by name) into x from storage.objects where bucket_id = 'site-public';
  if x is distinct from 'about/rb-new.jpg,profile/rb-keep.jpg' then out := out || 'THE OLD FILES ARE STILL THERE: ' || coalesce(x, 'none') || '; '; else out := out || 'left: only the new files; '; end if;
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', vendor, true);
  select count(*) into n from storage.objects where bucket_id = 'site-public'; if n <> 0 then out := out || 'A VENDOR LISTS TIM''S FILES; '; else out := out || 'vendor lists none; '; end if;
  delete from storage.objects where bucket_id = 'site-public'; get diagnostics n = row_count; if n <> 0 then out := out || 'A VENDOR DELETED TIM''S FILES; '; else out := out || 'vendor delete: none; '; end if;
  begin insert into storage.objects (bucket_id, name) values ('site-public', 'profile/rb-vendor.jpg'); out := out || 'A VENDOR UPLOADED A PICTURE; '; exception when others then out := out || 'vendor upload: refused; '; end;
  execute 'reset role';
  execute 'set local role anon'; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from storage.objects where bucket_id = 'site-public'; if n <> 0 then out := out || 'ANON LISTS TIM''S FILES; '; else out := out || 'anon lists none; '; end if;
  execute 'reset role';
  perform set_config('storage.allow_delete_query', 'false', true);

  -- Tim saves his profile; a vendor and anon can't
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  begin
    j := public.agent_site_profile_save('{"name":"Tim McGuire","licence":"Licensed salesperson, REAA 2008","phone":"027 562 7207","email":"tim@example.test","photo_path":"profile/rb.jpg",
      "about":{"tim":{"heading":"About Tim","body":"Invented words.","image_path":"about/rb-tim.jpg"},"agency":{"heading":"","body":""}},
      "channels":[{"key":"call","on":true},{"key":"form","on":true},{"key":"whatsapp","on":true,"value":"+64 27 000 0000"},{"key":"telegram","on":false,"value":""},{"key":"text","on":false}]}');
    out := out || 'agent save: ' || (j->>'email') || '; ';
  exception when others then out := out || 'THE AGENT COULD NOT SAVE: ' || sqlerrm || '; '; end;
  select string_agg(e->>'key', ',') into x from jsonb_array_elements(public.site_profile_public()->'channels') e;
  if x is distinct from 'call,form,whatsapp' then out := out || 'THE PUBLIC CHANNELS ARE WRONG: ' || coalesce(x, 'none') || '; '; else out := out || 'public channels: only those on and complete, in order; '; end if;
  -- off means off: Email isn't on, so no email; Call is on, so the phone shows; with Call and Text off, no phone either
  j := public.site_profile_public();
  if j->>'email' = '' and j->>'phone' = '027 562 7207' then out := out || 'public: phone with Call on, no email with Email off; '; else out := out || 'THE PUBLIC PHONE OR EMAIL IGNORES THE SWITCHES: ' || (j->>'phone') || ' ' || (j->>'email') || '; '; end if;
  perform public.agent_site_profile_save('{"name":"Tim McGuire","phone":"027 562 7207","email":"tim@example.test","channels":[{"key":"call","on":false},{"key":"text","on":false},{"key":"email","on":true},{"key":"form","on":true}]}');
  j := public.site_profile_public();
  if j->>'phone' = '' and j->>'email' = 'tim@example.test' then out := out || 'public: no phone with Call and Text off, email with Email on; '; else out := out || 'THE PUBLIC PHONE SHOWS WITH CALL AND TEXT OFF: ' || (j->>'phone') || ' ' || (j->>'email') || '; '; end if;
  begin perform public.agent_site_profile_save('{"channels":[{"key":"whatsapp","on":true,"value":"https://evil.example"}]}'); out := out || 'A BAD WHATSAPP NUMBER WAS KEPT; '; exception when others then out := out || 'bad channel value: refused; '; end;
  begin perform public.agent_site_profile_save('{"channels":[{"key":"myspace","on":true}]}'); out := out || 'AN UNKNOWN CHANNEL WAS KEPT; '; exception when others then out := out || 'unknown channel: refused; '; end;
  begin perform public.agent_site_profile_save('{"photo_path":"appraisals/x.jpg"}'); out := out || 'A PICTURE OUTSIDE ITS FOLDER WAS KEPT; '; exception when others then out := out || 'picture folder: checked; '; end;
  begin perform public.agent_site_profile_save('{"email":"not an email"}'); out := out || 'A BAD EMAIL WAS KEPT; '; exception when others then out := out || 'bad email: refused; '; end;
  execute 'reset role';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', vendor, true);
  begin perform public.agent_site_profile_save('{"name":"Hacked"}'); out := out || 'A VENDOR CHANGED THE PROFILE; '; exception when others then out := out || 'vendor save: refused; '; end;
  select count(*) into n from public.site_profile; if n <> 0 then out := out || 'A VENDOR READS THE PROFILE TABLE; '; end if;
  if (public.site_profile_public()->>'name') = 'Tim McGuire' then out := out || 'vendor reads the public profile; '; end if;

  -- a vendor sends messages: their own email, bounded, five a day
  begin m1 := public.contact_send('Robin', '021 000 000', 'Hello Tim, a question about the campaign.', 'text', aid, 'appraisals/x');
    out := out || 'vendor message: sent; ';
  exception when others then out := out || 'A VENDOR COULD NOT SEND: ' || sqlerrm || '; '; end;
  begin perform public.contact_send('', '', 'x', 'email', null, ''); out := out || 'A NAMELESS MESSAGE WAS SENT; '; exception when others then out := out || 'no name: refused; '; end;
  begin perform public.contact_send('Robin', '', repeat('x', 1001), 'email', null, ''); out := out || 'A TOO-LONG MESSAGE WAS SENT; '; exception when others then out := out || 'too long: refused; '; end;
  begin perform public.contact_send('Robin', 'call me maybe', 'x', 'email', null, ''); out := out || 'A BAD PHONE WAS KEPT; '; exception when others then out := out || 'bad phone: refused; '; end;
  for i in 1..4 loop perform public.contact_send('Robin', '', 'Message ' || i, 'email', null, ''); end loop;
  begin perform public.contact_send('Robin', '', 'Sixth', 'email', null, ''); out := out || 'A SIXTH MESSAGE IN A DAY WAS SENT; '; exception when others then out := out || 'sixth in a day: refused; '; end;
  select count(*) into n from public.contact_messages; if n <> 0 then out := out || 'A VENDOR READS MESSAGES; '; end if;
  begin perform public.agent_contact_done(m1); out := out || 'A VENDOR MARKED A MESSAGE DONE; '; exception when others then out := out || 'vendor done: refused; '; end;
  begin insert into public.contact_messages (from_email, name, message) values ('x@example.com', 'x', 'x'); out := out || 'A VENDOR INSERTED DIRECTLY; '; exception when others then out := out || 'direct insert: refused; '; end;
  execute 'reset role';
  select from_email into x from public.contact_messages where id = m1; out := out || 'from their own sign-in: ' || coalesce(x, 'nobody') || '; ';
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', vendor2, true);
  begin perform public.contact_send('Sam', '', 'Another person, their own five.', 'email', null, ''); out := out || 'another person: sent; '; exception when others then out := out || 'ANOTHER PERSON WAS BLOCKED BY SOMEONE ELSE''S LIMIT; '; end;
  execute 'reset role';
  begin execute 'set local role anon'; perform set_config('request.jwt.claims', '{"role":"anon"}', true); perform public.contact_send('Anon', '', 'x', 'email', null, ''); out := out || 'ANON SENT A MESSAGE; '; exception when others then out := out || 'anon send: refused; '; end;
  execute 'reset role';

  -- notify takes each message once, and only for its own sender
  j := public.contact_mark_emailed(m1, 'someone-else@example.com'); if j is not null then out := out || 'MARKED FOR ANOTHER SENDER; '; end if;
  j := public.contact_mark_emailed(m1, 'rb-vendor@example.com'); if j is null then out := out || 'NOT MARKED FOR ITS SENDER; '; else out := out || 'emailed once: ' || (j->>'name') || ', to ' || coalesce(j->>'tim_email', 'TIM_EMAIL') || '; '; end if;
  j := public.contact_mark_emailed(m1, 'rb-vendor@example.com'); if j is not null then out := out || 'EMAILED TWICE; '; else out := out || 'second time: nothing; '; end if;

  -- Tim reads and marks done
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  select count(*) into n from public.contact_messages; out := out || 'agent reads ' || n || ' messages; ';
  perform public.agent_contact_done(m1); select count(*) into n from public.contact_messages where done_at is not null; out := out || 'done: ' || n || '; ';
  execute 'reset role';

  if out ~* 'null value in column|violates foreign key|does not exist|syntax error|ambiguous' then out := out || 'A FIXTURE DID NOT MATCH THE SCHEMA; '; end if;
  raise exception 'ROLLBACK %', out;
end $t$;

-- Rollback test for migration 014 (Tim's inspection notes need real answers). Run with onboarding/tests/decl-notes-rollback.py,
-- which puts the migration inside the block, so one statement creates everything, runs the checks and raises: the final exception
-- undoes the migration and every test row. Refusals read in lower case ("blank:" ...); a line in CAPITALS means something that
-- should have been refused was allowed, or a value was wrong. No DELETE anywhere. The live draft declaration with Tim's Unknown
-- for "reports" is used read-only, and once inside the block (its vendor's check, undone with everything else).
-- Last run: 18 November 2026, live project hwpwyjxhdvlqrjwzxzqz: every line as expected, no CAPITALS (refusals for a blank change,
-- a blank tick, a stripped answer, a blank description, a blank tenancy and signing with an unanswered note; Unknown ticked and a
-- chosen answer recorded as before; hazards cleared against a signed agreement kept as differences; the live form: 0 unanswered
-- notes, its Unknown can be ticked, and can't be sent back blank). Afterwards no test row, sign-in or function was left, and the
-- live form's checks were still empty.
do $t$
declare out text := ''; r jsonb; pid uuid; iid uuid; aid uuid; fid uuid; d jsonb; n int; lf record; lu uuid;
  vuid uuid := '11111111-1111-1111-1111-1111111111b1';
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222')::text;
  vendor text := '{"email":"rb14-vendor@example.com","sub":"11111111-1111-1111-1111-1111111111b1","role":"authenticated"}';
begin
  execute $mig$__MIGRATION__$mig$;
  insert into auth.users (id, email, aud, role) values (vuid, 'rb14-vendor@example.com', 'authenticated', 'authenticated');
  out := out || 'anon has_answer=' || has_function_privilege('anon', 'public.decl_has_answer(text,jsonb)', 'execute') || ' textkeys=' || has_function_privilege('anon', 'public.decl_text_keys()', 'execute') || '; ';
  out := out || 'has: unknown=' || public.decl_has_answer('reports', '{"a":"unknown","d":""}') || ' blank=' || public.decl_has_answer('meth', '{"d":"Known or suspected contamination: not that they know of"}')
    || ' text=' || public.decl_has_answer('glazing', '{"d":"Single"}') || ' textblank=' || public.decl_has_answer('glazing', '{"d":" "}') || ' ten=' || public.decl_has_answer('tenanted', '"no"') || ' tenblank=' || public.decl_has_answer('tenanted', 'null') || '; ';

  -- 1. Tim's notes: one with no answer (meth, part noted), an Unknown, a description, a Yes, the tenancy; then a signed agreement
  --    with hazards on it, and the notes sent to the vendor
  perform set_config('request.jwt.claims', agent, true);
  r := public.agent_inspection_start(null, 'RB14 Rollback Lane, Nowhere'); iid := (r->>'inspection_id')::uuid; pid := (r->>'property_id')::uuid;
  perform public.agent_inspection_save(iid, null, '{"meth":{"d":"Known or suspected contamination: not that they know of"},"reports":{"a":"unknown"},"glazing":{"d":"Single"},"pegs":{"a":"yes"},"tenanted":{"a":"no"}}', null);
  insert into public.agreements (address, property_id, status, answers) values ('RB14 Rollback Lane, Nowhere', pid, 'draft', '{"hazards":["Uneven paths"],"hazOther":"Dog"}') returning id into aid;
  insert into public.agreement_people (agreement_id, position, legal_name, email, user_id, signed_at) values (aid, 1, 'Rb Fourteen', 'rb14-vendor@example.com', vuid, now());
  update public.agreements set status = 'signed', signed_at = now() where id = aid;
  r := public.agent_inspection_send(iid); fid := (r->>'form_id')::uuid;
  select data into d from public.property_forms where id = fid;
  out := out || 'sent pre meth=' || coalesce(d->'pre'->>'meth','NULL') || ' meth a=' || coalesce(d->'answers'->'meth'->>'a','none') || '; ';

  -- 2. the vendor: a note sent back with no choice is refused, as a change or a tick; nothing is recorded and Tim's note stays
  perform set_config('request.jwt.claims', vendor, true);
  begin perform public.vendor_form_save(fid, '{"answers":{"meth":{"d":"Known or suspected contamination: not that they know of"}},"fileOk":true,"_step":1}'); out := out || 'unchanged-meth-ok; '; exception when others then out := out || 'UNCHANGED-REFUSED:' || sqlerrm || '; '; end;
  begin perform public.vendor_form_save(fid, '{"answers":{"meth":{"d":"I typed this"}},"_step":0}'); out := out || 'BLANK-CHANGE-ALLOWED; '; exception when others then out := out || 'blankchange:' || sqlerrm || '; '; end;
  begin perform public.vendor_form_save(fid, '{"checked":{"meth":true}}'); out := out || 'BLANK-TICK-ALLOWED; '; exception when others then out := out || 'blanktick:' || sqlerrm || '; '; end;
  begin perform public.vendor_form_save(fid, '{"answers":{"pegs":{"d":""}}}'); out := out || 'STRIPPED-ALLOWED; '; exception when others then out := out || 'stripped:' || sqlerrm || '; '; end;
  begin perform public.vendor_form_save(fid, '{"answers":{"glazing":{"d":"  "}}}'); out := out || 'TEXT-BLANK-ALLOWED; '; exception when others then out := out || 'textblank:' || sqlerrm || '; '; end;
  begin perform public.vendor_form_save(fid, '{"tenanted":""}'); out := out || 'TEN-BLANK-ALLOWED; '; exception when others then out := out || 'tenblank:' || sqlerrm || '; '; end;
  select data into d from public.property_forms where id = fid;
  out := out || 'after refusals checked=' || (d->'checked')::text || ' meth=' || (d->'answers'->'meth')::text || ' pegs=' || (d->'answers'->'pegs')::text || ' step=' || coalesce(d->>'_step','NULL') || '; ';
  -- answers with a choice are recorded as before: Unknown ticked is a check; a chosen meth answer is a change
  perform public.vendor_form_save(fid, '{"checked":{"reports":true,"pegs":true,"glazing":true,"tenanted":true}}');
  perform public.vendor_form_save(fid, '{"answers":{"meth":{"a":"no","d":"Never tested"}}}');
  select data into d from public.property_forms where id = fid;
  out := out || 'recorded reports=' || coalesce(d->'checked'->'reports'->>'changed','NULL') || ' meth changed=' || coalesce(d->'checked'->'meth'->>'changed','NULL') || ' pegs=' || coalesce(d->'checked'->'pegs'->>'changed','NULL') || '; ';

  -- 3. signing: refused while a note has no answer, even with a check on it (as the old page could leave it)
  perform set_config('app.vendor_form_save', fid::text, true);
  update public.property_forms set data = jsonb_set(data, '{answers,pegs}', '{"d":""}') where id = fid;
  perform set_config('app.vendor_form_save', '', true);
  select data into d from public.property_forms where id = fid;
  out := out || 'forced pegs=' || (d->'answers'->'pegs')::text || ' checked=' || public.is_confirmed(d->'checked', 'pegs') || '; ';
  begin insert into public.form_signatures (form_id, agreement_id, person_id, signer_role, signer_name, snapshot, snapshot_sha256)
    values (fid, aid, (select id from public.agreement_people where agreement_id = aid and position = 1), 'client', 'Rb Fourteen', '{}', 'x'); out := out || 'UNANSWERED-SIGN-ALLOWED; ';
  exception when others then out := out || 'unansweredsign:' || sqlerrm || '; '; end;
  perform set_config('request.jwt.claims', vendor, true);
  perform public.vendor_form_save(fid, '{"answers":{"pegs":{"a":"yes","d":""}}}');
  insert into public.form_signatures (form_id, agreement_id, person_id, signer_role, signer_name, snapshot, snapshot_sha256)
    values (fid, aid, (select id from public.agreement_people where agreement_id = aid and position = 1), 'client', 'Rb Fourteen', '{}', 'x');
  out := out || 'signed once answered; ';

  -- 4. hazards: "none" noted while the signed agreement lists some is a difference, not a silent clear; "Use mine" changes the
  --    property file only; a value only this inspection put there is still simply taken back
  perform set_config('request.jwt.claims', agent, true);
  r := public.agent_inspection_save(iid, '{"hazards":[],"hazOther":""}', null, null);
  out := out || 'hazards conflicts=' || coalesce((select string_agg(k, ',' order by k) from jsonb_object_keys(r->'conflicts') k), 'none') || ' file=' || coalesce((select (disclosures->'hazards')::text from public.properties where id = pid), 'NULL') || '; ';
  r := public.agent_inspection_resolve(iid, 'hazards', 'inspection');
  out := out || 'use mine agUpd=' || (r->>'agreement_updated') || ' file=' || coalesce((select (disclosures->'hazards')::text from public.properties where id = pid), 'NULL')
    || ' agreement=' || (select (answers->'hazards')::text from public.agreements where id = aid) || '; ';
  r := public.agent_inspection_resolve(iid, 'hazOther', 'agreement');
  out := out || 'keep agreement file=' || coalesce((select disclosures->>'hazOther' from public.properties where id = pid), 'NULL') || ' left=' || (r->>'agreement_status') || '; ';
  r := public.agent_inspection_save(iid, '{"pBed":"3"}', null, null);
  r := public.agent_inspection_save(iid, '{"pBed":""}', null, null);
  out := out || 'other blanks unchanged conflicts=' || coalesce((select string_agg(k, ',') from jsonb_object_keys(r->'conflicts') k), 'none') || '; ';

  -- 5. the live draft declaration with Tim's Unknown for "reports": every note there has an answer, so nothing changes for it;
  --    its vendor can still tick the Unknown (a choice), and can't send it back blank (both undone by the final exception)
  select id, agreement_id, data into lf from public.property_forms where kind = 'vendor_declaration' and status = 'draft' and data->'pre'->>'reports' = 'inspection' and data->'answers'->'reports'->>'a' = 'unknown' limit 1;
  if lf.id is null then out := out || 'NO-LIVE-FORM; '; else
    select count(*) into n from jsonb_each_text(lf.data->'pre') e where e.value = 'inspection' and not public.decl_has_answer(e.key, case when e.key = 'tenanted' then lf.data->'tenanted' else lf.data->'answers'->e.key end);
    out := out || 'live unanswered=' || n || '; ';
    select user_id into lu from public.agreement_people where agreement_id = lf.agreement_id and user_id is not null order by position limit 1;
    perform set_config('request.jwt.claims', json_build_object('sub', lu, 'role', 'authenticated')::text, true);
    begin perform public.vendor_form_save(lf.id, '{"answers":{"reports":{"d":""}}}'); out := out || 'LIVE-BLANK-ALLOWED; '; exception when others then out := out || 'liveblank:' || sqlerrm || '; '; end;
    perform public.vendor_form_save(lf.id, '{"checked":{"reports":true}}');
    out := out || 'live tick changed=' || coalesce((select data->'checked'->'reports'->>'changed' from public.property_forms where id = lf.id), 'NULL') || '; ';
  end if;
  raise exception 'ROLLBACK %', out;
end $t$;

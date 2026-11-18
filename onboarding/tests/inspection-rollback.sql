-- Rollback test for migration 012 (property inspection). Run with onboarding/tests/inspection-rollback.py, which puts the
-- migration inside the block (the execute line below), so the whole thing is one statement: the final exception undoes the
-- migration and every test row, so nothing is kept. The output is the exception message: refusals read in lower case ("dup:",
-- "agentedit:" ...); a line in CAPITALS means something that should have been refused was allowed, or a value was wrong.
-- No DELETE anywhere (the refusal of a direct delete of a declaration is checked in inspection.test.js against the mock).
-- Last run: 18 November 2026 (review fixes), live project hwpwyjxhdvlqrjwzxzqz: every line as expected, no CAPITALS; afterwards
-- the project matched its state before the run (no table, function, trigger, row or test sign-in left).
do $t$
declare out text := ''; r jsonb; pid uuid; pid2 uuid; iid uuid; iid2 uuid; iid3 uuid; aid uuid; aid2 uuid; fid uuid; fid2 uuid; hid uuid; d jsonb; n int; st text; x text; li record;
  vuid uuid := '11111111-1111-1111-1111-1111111111a1'; vuid2 uuid := '11111111-1111-1111-1111-1111111111a2';
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222')::text;
  vendor text := '{"email":"rb-vendor@example.com","sub":"11111111-1111-1111-1111-1111111111a1","role":"authenticated"}';
begin
  execute $mig$__MIGRATION__$mig$;
  -- two throwaway sign-ins for the vendors (agreement_people.user_id refers to auth.users); undone with everything else
  insert into auth.users (id, email, aud, role) values (vuid, 'rb-vendor@example.com', 'authenticated', 'authenticated'), (vuid2, 'rb-vendor2@example.com', 'authenticated', 'authenticated');

  -- 1. outsiders are refused; helpers are not open to anon
  perform set_config('request.jwt.claims', vendor, true);
  begin perform public.agent_inspection_start(null, 'RB 1 Rollback Lane'); out := out || 'VENDOR-START-ALLOWED; '; exception when others then out := out || 'vstart:' || sqlerrm || '; '; end;
  out := out || 'anon jblank=' || has_function_privilege('anon', 'public.jblank(jsonb)', 'execute') || ' keys=' || has_function_privilege('anon', 'public.inspection_decl_keys()', 'execute')
    || ' notes=' || has_function_privilege('anon', 'public.inspection_note_keys()', 'execute') || ' save=' || has_function_privilege('anon', 'public.agent_inspection_save(uuid,jsonb,jsonb,jsonb,jsonb)', 'execute') || '; ';

  -- 2. Tim starts with only an address: a property at Appraisal, nobody on it, nothing else made
  perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_inspection_start(null, ' x '); out := out || 'SHORT-ALLOWED; '; exception when others then out := out || 'short:' || sqlerrm || '; '; end;
  r := public.agent_inspection_start(null, 'RB 1  Rollback Lane, Nowhere'); iid := (r->>'inspection_id')::uuid; pid := (r->>'property_id')::uuid;
  select stage into st from public.properties where id = pid;
  select count(*) into n from public.property_people where property_id = pid;
  out := out || 'start made=' || (r->>'created_property') || ' stage=' || st || ' people=' || n
    || ' pl=' || (select count(*) from public.prelistings where property_id = pid) || ' ag=' || (select count(*) from public.agreements where property_id = pid) || '; ';
  begin perform public.agent_inspection_start(null, 'rb 1 rollback lane, nowhere'); out := out || 'DUPLICATE-ALLOWED; '; exception when others then out := out || 'dup:' || sqlerrm || '; '; end;
  r := public.agent_inspection_start(pid, null); out := out || 'resume same=' || ((r->>'inspection_id')::uuid = iid) || ' resumed=' || (r->>'resumed') || '; ';

  -- 3. answers save; facts go to the property file; a clear takes back only what the inspection put there; older answers lose
  r := public.agent_inspection_save(iid, '{"pBed":"4","pType":"House","work":"yes","workDetail":"Deck 2019","hazards":["Steep driveway or steps"]}',
       '{"pegs":{"a":"yes","d":""},"meth":{"a":"no"},"tenanted":{"a":"no"},"faults":{"d":"Crack in garage slab"}}', '{"outside":"Tidy section"}');
  select description->>'pBed', disclosures->>'work' into st, x from public.properties where id = pid;
  out := out || 'saved pBed=' || coalesce(st,'NULL') || ' work=' || coalesce(x,'NULL') || ' conflicts=' || (r->'conflicts')::text || '; ';
  perform public.agent_inspection_save(iid, '{"pBed":""}', null, '{"outside":""}');
  out := out || 'cleared pBed on file=' || (select (description ? 'pBed')::text from public.properties where id = pid) || ' notes=' || (select notes::text from public.property_inspections where id = iid) || '; ';
  perform public.agent_inspection_save(iid, '{"pBed":"4"}', null, null);
  perform public.agent_inspection_save(iid, '{"pBath":"2"}', null, null, '{"f:pBath":"2026-11-18T10:00:00Z"}');
  r := public.agent_inspection_save(iid, '{"pBath":"1"}', null, null, '{"f:pBath":"2026-11-18T09:00:00Z"}');
  out := out || 'older answer: skipped=' || (r->'skipped')::text || ' kept=' || (select facts->>'pBath' from public.property_inspections where id = iid) || '; ';
  begin perform public.agent_inspection_save(iid, '{"bogus":"1"}', null, null); out := out || 'BOGUS-KEY-ALLOWED; '; exception when others then out := out || 'bogus:' || sqlerrm || '; '; end;
  begin perform public.agent_inspection_save(iid, null, '{"pegs":{"a":"maybe"}}', null); out := out || 'BAD-ANSWER-ALLOWED; '; exception when others then out := out || 'badans:' || sqlerrm || '; '; end;
  begin perform public.agent_inspection_save(iid, null, null, jsonb_build_object('inside', repeat('x', 4001))); out := out || 'LONG-NOTE-ALLOWED; '; exception when others then out := out || 'long:' || sqlerrm || '; '; end;
  begin perform public.agent_inspection_send(iid); out := out || 'SEND-UNSIGNED-ALLOWED; '; exception when others then out := out || 'sendearly:' || sqlerrm || '; '; end;

  -- 4. a draft agreement: its blank answers don't wipe the property file; the inspection fills its blanks; a held value is a
  --    difference; "Use mine" changes a draft, but not one that has been sent
  insert into public.agreements (address, property_id, status, answers) values ('RB 1 Rollback Lane, Nowhere', pid, 'draft', '{"pBed":"3","pBath":"","hazards":[]}') returning id into aid;
  select description->>'pBed', description->>'pBath' into st, x from public.properties where id = pid;
  out := out || 'draft made: file pBed=' || st || ' pBath=' || coalesce(x,'NULL') || ' hazards=' || (select (disclosures->'hazards')::text from public.properties where id = pid) || '; ';
  r := public.agent_inspection_save(iid, '{"pBed":"4","pFloor":"120"}', null, null);
  out := out || 'conflict keys=' || (select string_agg(k, ',') from jsonb_object_keys(r->'conflicts') k) || ' file pBed=' || (select description->>'pBed' from public.properties where id = pid)
    || ' draft pFloor=' || coalesce((select answers->>'pFloor' from public.agreements where id = aid),'NULL') || ' file pFloor=' || (select description->>'pFloor' from public.properties where id = pid) || '; ';
  r := public.agent_inspection_resolve(iid, 'pBed', 'inspection');
  out := out || 'resolved draft agUpd=' || (r->>'agreement_updated') || ' file pBed=' || (select description->>'pBed' from public.properties where id = pid)
    || ' ag pBed=' || (select answers->>'pBed' from public.agreements where id = aid) || '; ';
  begin perform public.agent_inspection_resolve(iid, 'pBed', 'inspection'); out := out || 'RESOLVE-TWICE-ALLOWED; '; exception when others then out := out || 'twice:' || sqlerrm || '; '; end;
  update public.agreements set status = 'sent' where id = aid;
  perform public.agent_inspection_save(iid, '{"pBed":"6"}', null, null);
  r := public.agent_inspection_resolve(iid, 'pBed', 'inspection');
  out := out || 'resolved sent agUpd=' || (r->>'agreement_updated') || ' status=' || (r->>'agreement_status') || ' file pBed=' || (select description->>'pBed' from public.properties where id = pid)
    || ' ag pBed=' || (select answers->>'pBed' from public.agreements where id = aid) || '; ';
  perform public.agent_inspection_save(iid, '{"pLand":"700"}', null, null);
  out := out || 'sent not filled: ag pLand=' || coalesce((select answers->>'pLand' from public.agreements where id = aid),'NULL') || '; ';

  -- 5. the agreement is signed: the property follows Tim's choice; the signed agreement never changes
  insert into public.agreement_people (agreement_id, position, legal_name, email, user_id, signed_at) values (aid, 1, 'Rb Vendor', 'rb-vendor@example.com', vuid, now());
  insert into public.agreement_people (agreement_id, position, legal_name, email, user_id, signed_at) values (aid, 2, 'Rb Vendor Two', 'rb-vendor2@example.com', vuid2, now());
  update public.agreements set status = 'signed', signed_at = now() where id = aid;
  r := public.agent_inspection_save(iid, '{"pBed":"5"}', null, null);
  perform public.agent_inspection_resolve(iid, 'pBed', 'inspection');
  out := out || 'signed: file pBed=' || (select description->>'pBed' from public.properties where id = pid) || ' ag pBed=' || (select answers->>'pBed' from public.agreements where id = aid) || '; ';

  -- 6. send to the vendors: a draft declaration with Tim's notes marked; nothing confirmed for them
  r := public.agent_inspection_send(iid); fid := (r->>'form_id')::uuid;
  select data into d from public.property_forms where id = fid;
  out := out || 'sent created=' || (r->>'created') || ' added=' || (r->>'added') || ' pre=' || (d->'pre')::text || ' checked=' || (d->'checked')::text
    || ' insp=' || ((d->'insp') ? 'on') || ' ten=' || (d->>'tenanted') || ' status=' || (select status from public.property_forms where id = fid) || '; ';

  -- 7. Tim can't write in the vendors' declaration directly (answers, markers or confirmations); vendors read no inspections
  execute 'set local role authenticated';
  begin update public.property_forms set data = data || '{"checked":{"pegs":true}}' where id = fid; out := out || 'AGENT-CHECKED-ALLOWED; '; exception when others then out := out || 'agentcheck:' || sqlerrm || '; '; end;
  begin update public.property_forms set data = jsonb_set(data, '{answers,history}', '{"a":"no","d":""}') where id = fid; out := out || 'AGENT-ANSWER-ALLOWED; '; exception when others then out := out || 'agentedit:' || sqlerrm || '; '; end;
  begin update public.property_forms set data = data - 'pre' where id = fid; out := out || 'AGENT-UNMARK-ALLOWED; '; exception when others then out := out || 'agentunmark:' || sqlerrm || '; '; end;
  begin insert into public.property_forms (property_id, agreement_id, kind, form_version, data) values (pid, aid, 'healthy_homes', 'HH-2026-11', '{}') returning id into hid;
        update public.property_forms set kind = 'vendor_declaration' where id = hid; out := out || 'AGENT-KIND-ALLOWED; '; exception when others then out := out || 'agentkind:' || sqlerrm || '; '; end;
  begin insert into public.property_forms (property_id, agreement_id, kind, form_version, data) values (pid, aid, 'vendor_declaration', 'VD-2026-11', '{"answers":{"pegs":{"a":"no"}}}');
        out := out || 'AGENT-INSERT-ANSWERS-ALLOWED; '; exception when others then out := out || 'agentinsert:' || sqlerrm || '; '; end;
  -- a direct change that leaves what the declaration says alone still works (here the PDF error note)
  begin update public.property_forms set pdf_error = null where id = fid; get diagnostics n = row_count; out := out || 'agent other column rows=' || n || '; ';
  exception when others then out := out || 'AGENT-OTHER-COLUMN-REFUSED:' || sqlerrm || '; '; end;
  perform set_config('request.jwt.claims', vendor, true);
  select count(*) into n from public.property_inspections; out := out || 'vendor reads inspections=' || n || '; ';
  select count(*) into n from public.property_forms where id = fid; out := out || 'vendor reads form=' || n || '; ';
  begin perform public.agent_inspection_send(iid); out := out || 'VENDOR-SEND-ALLOWED; '; exception when others then out := out || 'vsend:' || sqlerrm || '; '; end;
  begin update public.property_forms set data = '{}' where id = fid; get diagnostics n = row_count; out := out || 'vendor direct update rows=' || n || '; '; exception when others then out := out || 'vdirect:' || sqlerrm || '; '; end;
  execute 'reset role';

  -- 8. a signature is refused while any note is unconfirmed (written directly as the database owner, so only the new check applies)
  begin insert into public.form_signatures (form_id, agreement_id, person_id, signer_role, signer_name, snapshot, snapshot_sha256)
          values (fid, aid, (select id from public.agreement_people where agreement_id = aid and position = 1), 'client', 'Rb Vendor', '{}', 'x');
        out := out || 'SIGN-UNCHECKED-ALLOWED; '; exception when others then out := out || 'signunchecked:' || sqlerrm || '; '; end;

  -- 9. the vendor's save: per key, confirmations recorded on the server, markers never taken from the page, nothing removed
  perform set_config('request.jwt.claims', vendor, true);
  perform public.vendor_form_save(fid, '{"answers":{"meth":{"a":"unknown","d":""}},"checked":{"pegs":true,"history":true},"pre":{},"insp":null,"fileOk":true}'::jsonb);
  select data into d from public.property_forms where id = fid;
  out := out || 'vsave pegs.by=' || coalesce(d->'checked'->'pegs'->>'name','NULL') || ' meth auto=' || coalesce(d->'checked'->'meth'->>'name','NULL') || ' history=' || coalesce(d->'checked'->>'history','NULL')
    || ' pre kept=' || (d->'pre' ? 'pegs') || ' insp kept=' || (d ? 'insp' and d->'insp' <> 'null') || ' faults kept=' || (d->'answers' ? 'faults') || ' fileOk=' || (d->>'fileOk') || '; ';
  perform public.vendor_form_save(fid, '{"checked":{"faults":{"by":"x","name":"Forged"}}}'::jsonb);
  out := out || 'forged confirm=' || coalesce((select data->'checked'->>'faults' from public.property_forms where id = fid),'NULL') || '; ';
  -- any other path that changes a confirmed answer clears its confirmation (here the database owner, as a definer function would)
  update public.property_forms set data = jsonb_set(data, '{answers,pegs}', '{"a":"no","d":""}') where id = fid;
  out := out || 'other path cleared pegs=' || (not ((select data->'checked' from public.property_forms where id = fid) ? 'pegs')) || ' meth still=' || ((select data->'checked' from public.property_forms where id = fid) ? 'meth') || '; ';
  perform set_config('request.jwt.claims', vendor, true);
  perform public.vendor_form_save(fid, '{"checked":{"tenanted":true}}'::jsonb);
  out := out || 'ten confirmed=' || ((select data->'checked' from public.property_forms where id = fid) ? 'tenanted');
  update public.property_forms set data = jsonb_set(data, '{tenanted}', '"now"') where id = fid;
  out := out || ' other path cleared ten=' || (not ((select data->'checked' from public.property_forms where id = fid) ? 'tenanted')) || '; ';
  update public.property_forms set data = jsonb_set(data, '{tenanted}', '"no"') where id = fid;
  perform public.vendor_form_save(fid, '{"checked":{"pegs":true}}'::jsonb);
  perform set_config('request.jwt.claims', agent, true);
  perform public.agent_inspection_save(iid, null, '{"meth":{"a":"yes","d":"Tested 2024"},"faults":{"d":"Crack in garage slab, and a leak"},"dux":{"a":"no"}}', null);
  r := public.agent_inspection_send(iid);
  select data into d from public.property_forms where id = fid;
  out := out || 'resend added=' || (r->>'added') || ' updated=' || (r->>'updated') || ' kept=' || coalesce((select string_agg(e->>'k', ',') from jsonb_array_elements(r->'kept') e),'')
    || ' meth=' || (d->'answers'->'meth'->>'a') || ' faults=' || (d->'answers'->'faults'->>'d') || ' dux=' || coalesce(d->'answers'->'dux'->>'a','NULL') || '; ';

  -- 10. once everything is confirmed it can be signed; then the inspection can't change it
  perform set_config('request.jwt.claims', vendor, true);
  perform public.vendor_form_save(fid, '{"checked":{"faults":true,"tenanted":true,"dux":true}}');
  insert into public.form_signatures (form_id, agreement_id, person_id, signer_role, signer_name, snapshot, snapshot_sha256)
    values (fid, aid, (select id from public.agreement_people where agreement_id = aid and position = 1), 'client', 'Rb Vendor', '{}', 'x');
  out := out || 'signed after checks; ';
  perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_inspection_send(iid); out := out || 'SEND-AFTER-SIGN-ALLOWED; '; exception when others then out := out || 'sendsigned:' || sqlerrm || '; '; end;
  begin update public.property_forms set data = data || '{"notes":"x"}' where id = fid; out := out || 'SIGNED-CHANGE-ALLOWED; '; exception when others then out := out || 'guardform:' || sqlerrm || '; '; end;

  -- 11. a vendor who starts the declaration themselves gets Tim's notes, marked (second property); Healthy Homes is Tim's to fill
  r := public.agent_inspection_start(null, 'RB 2 Rollback Lane, Nowhere'); iid2 := (r->>'inspection_id')::uuid; pid2 := (r->>'property_id')::uuid;
  perform public.agent_inspection_save(iid2, null, '{"water":{"a":"yes"},"glazing":{"d":"Double glazed"}}', null);
  perform public.agent_inspection_finish(iid2);
  -- a second inspection later: earlier notes stay, the newest answer wins, a cleared one stays cleared
  r := public.agent_inspection_start(pid2, null); iid3 := (r->>'inspection_id')::uuid;
  perform public.agent_inspection_save(iid3, null, '{"sewer":{"a":"no"},"glazing":null}', null);
  select * into li from public.latest_inspection(pid2);
  out := out || 'merged=' || (select string_agg(k, ',' order by k) from jsonb_object_keys(li.declaration) k) || ' new=' || (iid3 <> iid2) || '; ';
  insert into public.agreements (address, property_id, status) values ('RB 2 Rollback Lane, Nowhere', pid2, 'draft') returning id into aid2;
  insert into public.agreement_people (agreement_id, position, legal_name, email, user_id, signed_at) values (aid2, 1, 'Rb Vendor', 'rb-vendor@example.com', vuid, now());
  update public.agreements set status = 'signed', signed_at = now() where id = aid2;
  perform set_config('request.jwt.claims', vendor, true);
  fid2 := public.vendor_form_start(aid2, 'vendor_declaration');
  select data into d from public.property_forms where id = fid2;
  out := out || 'vendor start pre=' || (d->'pre')::text || ' water=' || (d->'answers'->'water'->>'a') || ' on=' || (d->'insp'->>'on') || '; ';
  hid := public.vendor_form_start(aid2, 'healthy_homes');
  out := out || 'hh data=' || (select data::text from public.property_forms where id = hid) || '; ';
  perform set_config('request.jwt.claims', agent, true);
  execute 'set local role authenticated';
  begin update public.property_forms set agent_data = '{"c":{"heat1":{"a":"Y","n":""}}}', status = 'ready' where id = hid; get diagnostics n = row_count; out := out || 'hh agent save rows=' || n || '; ';
  exception when others then out := out || 'HH-SAVE-REFUSED:' || sqlerrm || '; '; end;
  execute 'reset role';

  -- 12. the declaration guard also runs on deletes (a direct delete is refused in its first lines; the delete itself is checked
  --     in inspection.test.js, as this test runs no DELETE). Trigger type bits: 2 before, 4 insert, 8 delete, 16 update.
  select tgtype into n from pg_trigger where tgrelid = 'public.property_forms'::regclass and tgname = 'guard_form_checks';
  out := out || 'guard on insert=' || ((n & 4) <> 0) || ' delete=' || ((n & 8) <> 0) || ' update=' || ((n & 16) <> 0) || ' before=' || ((n & 2) <> 0)
    || ' agreement_after pick_keep=' || (pg_get_functiondef('public.agreement_after()'::regprocedure) like '%pick_keep%') || '; ';

  raise exception 'ROLLBACK %', out;
end $t$;

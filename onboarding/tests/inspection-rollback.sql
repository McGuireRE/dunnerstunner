-- Rollback test for migration 012 (property inspection). Run with onboarding/tests/inspection-rollback.py, which puts the
-- migration inside the block (the execute line below), so the whole thing is one statement: the final exception undoes the migration and every
-- test row, so nothing is kept. The output is the exception message: refusals read in lower case ("dup:", "vread:" ...); a
-- line in CAPITALS means something that should have been refused was allowed, or a value was wrong.
-- No DELETE anywhere. Last run: 18 November 2026, live project hwpwyjxhdvlqrjwzxzqz: every line as expected (refusals in lower
-- case, values right), and afterwards no table, function, trigger, property or user from it was left behind.
do $t$
declare out text := ''; r jsonb; pid uuid; pid2 uuid; iid uuid; iid2 uuid; aid uuid; aid2 uuid; fid uuid; fid2 uuid; d jsonb; n int; st text; x text;
  vuid uuid := '11111111-1111-1111-1111-1111111111a1'; vuid2 uuid := '11111111-1111-1111-1111-1111111111a2';
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222')::text;
  vendor text := '{"email":"rb-vendor@example.com","sub":"11111111-1111-1111-1111-1111111111a1","role":"authenticated"}';
  vendor2 text := '{"email":"rb-vendor2@example.com","sub":"11111111-1111-1111-1111-1111111111a2","role":"authenticated"}';
begin
  execute $mig$__MIGRATION__$mig$;
  -- two throwaway sign-ins for the vendors (agreement_people.user_id refers to auth.users); undone with everything else
  insert into auth.users (id, email, aud, role) values (vuid, 'rb-vendor@example.com', 'authenticated', 'authenticated'), (vuid2, 'rb-vendor2@example.com', 'authenticated', 'authenticated');

  -- 1. outsiders are refused
  perform set_config('request.jwt.claims', vendor, true);
  begin perform public.agent_inspection_start(null, 'RB 1 Rollback Lane'); out := out || 'VENDOR-START-ALLOWED; '; exception when others then out := out || 'vstart:' || sqlerrm || '; '; end;

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

  -- 3. answers save; facts go to the property file; a clear takes back only what the inspection put there
  r := public.agent_inspection_save(iid, '{"pBed":"4","pType":"House","work":"yes","workDetail":"Deck 2019","hazards":["Steep driveway or steps"]}',
       '{"pegs":{"a":"yes","d":""},"meth":{"a":"no"},"tenanted":{"a":"no"},"faults":{"d":"Crack in garage slab"}}', '{"outside":"Tidy section"}');
  select description->>'pBed', disclosures->>'work' into st, x from public.properties where id = pid;
  out := out || 'saved pBed=' || coalesce(st,'NULL') || ' work=' || coalesce(x,'NULL') || ' conflicts=' || (r->'conflicts')::text || '; ';
  perform public.agent_inspection_save(iid, '{"pBed":""}', null, '{"outside":""}');
  select description ? 'pBed' into st from public.properties where id = pid;
  out := out || 'cleared pBed on file=' || st || ' notes=' || (select notes::text from public.property_inspections where id = iid) || '; ';
  perform public.agent_inspection_save(iid, '{"pBed":"4"}', null, null);
  begin perform public.agent_inspection_save(iid, '{"bogus":"1"}', null, null); out := out || 'BOGUS-KEY-ALLOWED; '; exception when others then out := out || 'bogus:' || sqlerrm || '; '; end;
  begin perform public.agent_inspection_save(iid, null, '{"pegs":{"a":"maybe"}}', null); out := out || 'BAD-ANSWER-ALLOWED; '; exception when others then out := out || 'badans:' || sqlerrm || '; '; end;
  begin perform public.agent_inspection_send(iid); out := out || 'SEND-UNSIGNED-ALLOWED; '; exception when others then out := out || 'sendearly:' || sqlerrm || '; '; end;

  -- 4. an agreement in force holds 3 bedrooms: the inspection's 4 is kept as a difference until Tim chooses
  insert into public.agreements (address, property_id, status, answers) values ('RB 1 Rollback Lane, Nowhere', pid, 'draft', '{"pBed":"3"}') returning id into aid;
  r := public.agent_inspection_save(iid, '{"pBed":"4","pBath":"2"}', null, null);
  select description->>'pBed', description->>'pBath' into st, x from public.properties where id = pid;
  out := out || 'conflict keys=' || (select string_agg(k, ',') from jsonb_object_keys(r->'conflicts') k) || ' file pBed=' || st || ' pBath=' || coalesce(x,'NULL') || '; ';
  r := public.agent_inspection_resolve(iid, 'pBed', 'inspection');
  out := out || 'resolved agUpd=' || (r->>'agreement_updated') || ' file pBed=' || (select description->>'pBed' from public.properties where id = pid)
    || ' ag pBed=' || (select answers->>'pBed' from public.agreements where id = aid) || '; ';
  begin perform public.agent_inspection_resolve(iid, 'pBed', 'inspection'); out := out || 'RESOLVE-TWICE-ALLOWED; '; exception when others then out := out || 'twice:' || sqlerrm || '; '; end;

  -- 5. the agreement is signed: the property keeps the signed answer; a difference stays a difference and never touches the agreement
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
    || ' insp=' || ((d->'insp') ? 'on') || ' pegs=' || (d->'answers'->'pegs')::text || ' ten=' || (d->>'tenanted') || ' status=' || (select status from public.property_forms where id = fid) || '; ';

  -- 7. Tim can't confirm for them, directly or by removing the markers
  perform set_config('request.jwt.claims', agent, true);
  execute 'set local role authenticated';
  begin update public.property_forms set data = data || '{"checked":{"pegs":true,"meth":true,"faults":true,"tenanted":true}}' where id = fid; out := out || 'AGENT-CHECKED-ALLOWED; '; exception when others then out := out || 'agentcheck:' || sqlerrm || '; '; end;
  begin update public.property_forms set data = data - 'pre' where id = fid; out := out || 'AGENT-UNMARK-ALLOWED; '; exception when others then out := out || 'agentunmark:' || sqlerrm || '; '; end;
  -- vendors never read inspections
  perform set_config('request.jwt.claims', vendor, true);
  select count(*) into n from public.property_inspections; out := out || 'vendor reads inspections=' || n || '; ';
  select count(*) into n from public.property_forms where id = fid; out := out || 'vendor reads form=' || n || '; ';
  begin perform public.agent_inspection_send(iid); out := out || 'VENDOR-SEND-ALLOWED; '; exception when others then out := out || 'vsend:' || sqlerrm || '; '; end;
  execute 'reset role';

  -- 8. a signature is refused while any note is unconfirmed (written directly as the database owner, so only the new check applies)
  begin insert into public.form_signatures (form_id, agreement_id, person_id, signer_role, signer_name, snapshot, snapshot_sha256)
          values (fid, aid, (select id from public.agreement_people where agreement_id = aid and position = 1), 'client', 'Rb Vendor', '{}', 'x');
        out := out || 'SIGN-UNCHECKED-ALLOWED; '; exception when others then out := out || 'signunchecked:' || sqlerrm || '; '; end;

  -- 9. the vendor confirms some, changes meth to their own answer; Tim's later notes never replace a vendor's answer
  perform set_config('request.jwt.claims', vendor, true);
  select data into d from public.property_forms where id = fid;
  perform public.vendor_form_save(fid, jsonb_build_object('answers', (d->'answers') || '{"meth":{"a":"unknown","d":""}}', 'checked', '{"pegs":true,"meth":true}'::jsonb));
  perform set_config('request.jwt.claims', agent, true);
  perform public.agent_inspection_save(iid, null, '{"meth":{"a":"yes","d":"Tested 2024"},"pegs":{"a":"no"},"faults":{"d":"Crack in garage slab, and a leak"},"dux":{"a":"no"}}', null);
  r := public.agent_inspection_send(iid);
  select data into d from public.property_forms where id = fid;
  out := out || 'resend added=' || (r->>'added') || ' updated=' || (r->>'updated') || ' kept=' || (select string_agg(e->>'k', ',') from jsonb_array_elements(r->'kept') e)
    || ' meth=' || (d->'answers'->'meth'->>'a') || ' pegs=' || (d->'answers'->'pegs'->>'a') || ' faults=' || (d->'answers'->'faults'->>'d') || ' dux=' || coalesce(d->'answers'->'dux'->>'a','NULL') || '; ';

  -- 10. once everything is confirmed it can be signed; then the inspection can't change it
  perform set_config('request.jwt.claims', vendor, true);
  perform public.vendor_form_save(fid, '{"checked":{"pegs":true,"meth":true,"faults":true,"tenanted":true,"dux":true}}');
  insert into public.form_signatures (form_id, agreement_id, person_id, signer_role, signer_name, snapshot, snapshot_sha256)
    values (fid, aid, (select id from public.agreement_people where agreement_id = aid and position = 1), 'client', 'Rb Vendor', '{}', 'x');
  out := out || 'signed after checks; ';
  perform set_config('request.jwt.claims', agent, true);
  begin perform public.agent_inspection_send(iid); out := out || 'SEND-AFTER-SIGN-ALLOWED; '; exception when others then out := out || 'sendsigned:' || sqlerrm || '; '; end;
  begin update public.property_forms set data = data || '{"notes":"x"}' where id = fid; out := out || 'SIGNED-CHANGE-ALLOWED; '; exception when others then out := out || 'guardform:' || sqlerrm || '; '; end;

  -- 11. a vendor who starts the declaration themselves gets Tim's notes, marked (second property)
  r := public.agent_inspection_start(null, 'RB 2 Rollback Lane, Nowhere'); iid2 := (r->>'inspection_id')::uuid; pid2 := (r->>'property_id')::uuid;
  perform public.agent_inspection_save(iid2, null, '{"water":{"a":"yes"},"glazing":{"d":"Double glazed"}}', null);
  perform public.agent_inspection_finish(iid2);
  insert into public.agreements (address, property_id, status) values ('RB 2 Rollback Lane, Nowhere', pid2, 'draft') returning id into aid2;
  insert into public.agreement_people (agreement_id, position, legal_name, email, user_id, signed_at) values (aid2, 1, 'Rb Vendor', 'rb-vendor@example.com', vuid, now());
  update public.agreements set status = 'signed', signed_at = now() where id = aid2;
  perform set_config('request.jwt.claims', vendor, true);
  fid2 := public.vendor_form_start(aid2, 'vendor_declaration');
  select data into d from public.property_forms where id = fid2;
  out := out || 'vendor start pre=' || (d->'pre')::text || ' water=' || (d->'answers'->'water'->>'a') || ' on=' || (d->'insp'->>'on')
    || ' finished=' || (select status from public.property_inspections where id = iid2) || '; ';
  -- Healthy Homes forms are left alone
  fid2 := public.vendor_form_start(aid2, 'healthy_homes');
  out := out || 'hh data=' || (select data::text from public.property_forms where id = fid2) || '; ';

  raise exception 'ROLLBACK %', out;
end $t$;

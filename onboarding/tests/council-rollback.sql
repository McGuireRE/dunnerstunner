-- Rollback test for migration 013 (public council records). Run with onboarding/tests/council-rollback.js, which puts the
-- migration inside the block and a real lookup result (from fn/property_lookup_core.ts and the recorded Dunedin answers) into
-- __RESULT__, so the whole thing is one statement: the final exception undoes the migration and every test row, so nothing is
-- kept. The output is the exception message: refusals read in lower case; a line in CAPITALS means something that should have
-- been refused was allowed, or a value was wrong. No DELETE anywhere.
-- Last run: 18 November 2026, live project hwpwyjxhdvlqrjwzxzqz: every line as expected, no CAPITALS; afterwards the project had
-- no council_lookups table, no found or provenance column, none of the new functions or the trigger, and no test row or sign-in.
do $t$
declare out text := ''; r jsonb; pid uuid; pid2 uuid; lid uuid; lid2 uuid; lid3 uuid; aid uuid; n int; x text; pr record;
  vuid uuid := '11111111-1111-1111-1111-1111111111c1';
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222')::text;
  vendor text := '{"email":"rb-council-vendor@example.com","sub":"11111111-1111-1111-1111-1111111111c1","role":"authenticated"}';
  res jsonb := $res$__RESULT__$res$::jsonb;
begin
  execute $mig$__MIGRATION__$mig$;
  insert into auth.users (id, email, aud, role) values (vuid, 'rb-council-vendor@example.com', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', agent, true);

  -- the existing writers of properties still work: an inspection creating one from an address (insert path), a direct agent update
  r := to_jsonb(public.agent_inspection_start(null, 'RB council test, 1 Nowhere Lane')); pid := (r->>'property_id')::uuid;
  out := out || 'inspection start ok=' || (pid is not null) || '; ';
  execute 'set local role authenticated';
  update public.properties set description = description || '{"pBed":"3"}'::jsonb where id = pid;
  get diagnostics n = row_count; out := out || 'agent direct update rows=' || n || '; ';
  -- a direct write of found or provenance is refused, even by Tim
  begin update public.properties set found = '{"x":{"value":1}}' where id = pid; out := out || 'FOUND DIRECT WRITE ALLOWED; ';
  exception when others then out := out || 'direct found: ' || sqlerrm || '; '; end;
  begin update public.properties set provenance = '{"pLand":{}}' where id = pid; out := out || 'PROVENANCE DIRECT WRITE ALLOWED; ';
  exception when others then out := out || 'direct provenance: ' || sqlerrm || '; '; end;
  begin insert into public.properties (address, found) values ('RB council insert', '{"x":1}'); out := out || 'INSERT WITH FOUND ALLOWED; ';
  exception when others then out := out || 'insert found: ' || sqlerrm || '; '; end;
  -- nobody writes lookups directly (the edge function does, as the service role)
  begin insert into public.council_lookups (asked, status, created_by) values ('x y z', 'ok', 'me'); out := out || 'LOOKUP DIRECT INSERT ALLOWED; ';
  exception when others then out := out || 'direct lookup insert: ' || sqlerrm || '; '; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', agent, true);
  out := out || 'guard_found on properties=' || exists (select 1 from pg_trigger where tgname = 'guard_found' and tgrelid = 'public.properties'::regclass) || '; ';

  -- a lookup as the edge function saves it (service role: here, the test's own role)
  insert into public.council_lookups (property_id, asked, matched_address, council, status, result, created_by)
  values (null, '100 Gladstone Road, Dunedin', res->>'matched_address', res->>'council', res->>'status', res, 'rb test') returning id into lid;
  insert into public.council_lookups (property_id, asked, matched_address, council, status, result, created_by)
  values (null, 'RB weak address', null, null, 'weak', '{"status":"weak","values":[]}', 'rb test') returning id into lid2;
  insert into public.council_lookups (property_id, asked, matched_address, council, status, result, created_by, created_at)
  values (null, 'RB old address', 'RB old address', null, 'ok', res, 'rb test', now() - interval '31 days') returning id into lid3;

  -- the cache: by address (any spelling), by matched address, never a weak or old one, never one tied to another property
  r := public.agent_council_cached('100 gladstone road  dunedin', pid);
  out := out || 'cached by address=' || coalesce((r->>'id')::uuid = lid, false) || '; ';
  r := public.agent_council_cached('100 Gladstone Road, Dalmore, Dunedin', null);
  out := out || 'cached by matched=' || coalesce((r->>'id')::uuid = lid, false) || '; ';
  out := out || 'weak cached=' || (public.agent_council_cached('RB weak address', null) is not null) || ' old cached=' || (public.agent_council_cached('RB old address', null) is not null) || '; ';

  -- accept into an empty file: title, legal description and land area are written; the rest stored in found
  r := public.agent_council_accept(pid, lid, array['title_ref', 'legal_description', 'land_area', 'capital_value', 'zone', 'hazard_dcc_none', 'not_a_key', 'BAD KEY']);
  select * into pr from public.properties where id = pid;
  out := out || 'accept1 written=' || (r->'written')::text || ' stored=' || jsonb_array_length(r->'stored') || ' skipped=' || (r->'skipped')::text || '; ';
  out := out || 'title=' || coalesce(pr.title_ref, 'NULL') || ' legal=' || coalesce(pr.legal_description, 'NULL') || ' pLand=' || coalesce(pr.description->>'pLand', 'NULL') || ' pBed kept=' || coalesce(pr.description->>'pBed', 'LOST') || '; ';
  out := out || 'cv note=' || (pr.found->'capital_value'->>'note') || ' | cv source=' || (pr.found->'capital_value'->>'source') || ' as_of=' || coalesce(pr.found->'capital_value'->>'as_of', 'NULL') || '; ';
  out := out || 'zone LIM=' || (position('Not a substitute for a LIM.' in pr.found->'zone'->>'note') > 0) || ' hazard LIM=' || (position('Not a substitute for a LIM.' in pr.found->'hazard_dcc_none'->>'note') > 0) || '; ';
  out := out || 'provenance pLand from=' || coalesce(pr.provenance->'pLand'->>'from', 'NULL') || ' source=' || coalesce(pr.provenance->'pLand'->>'source', 'NULL') || ' title by set=' || ((pr.provenance->'title_ref'->>'by') is not null) || ' capital in provenance=' || (pr.provenance ? 'capital_value') || '; ';
  out := out || 'lookup tied=' || ((select property_id from public.council_lookups where id = lid) = pid) || '; ';
  -- that lookup can't now be used on another property
  insert into public.properties (address) values ('RB council other') returning id into pid2;
  begin perform public.agent_council_accept(pid2, lid, array['title_ref']); out := out || 'OTHER PROPERTY ALLOWED; ';
  exception when others then out := out || 'other property: ' || sqlerrm || '; '; end;
  out := out || 'cached for other property=' || (public.agent_council_cached('100 Gladstone Road, Dunedin', pid2) is not null) || '; ';
  -- a weak or old lookup can't be used
  begin perform public.agent_council_accept(pid2, lid2, array['title_ref']); out := out || 'WEAK USED; '; exception when others then out := out || 'weak: ' || sqlerrm || '; '; end;
  begin perform public.agent_council_accept(pid2, lid3, array['title_ref']); out := out || 'OLD USED; '; exception when others then out := out || 'old: ' || sqlerrm || '; '; end;
  begin perform public.agent_council_accept(pid, lid, '{}'); out := out || 'EMPTY ALLOWED; '; exception when others then out := out || 'empty: ' || sqlerrm || '; '; end;

  -- a different value already on the file (as a title document would leave it): never overwritten without a choice
  update public.properties set title_ref = '999999', description = description || '{"pLand":"1874"}'::jsonb where id = pid;
  r := public.agent_council_accept(pid, lid, array['title_ref', 'land_area']);
  select * into pr from public.properties where id = pid;
  out := out || 'no choice: conflicts=' || jsonb_array_length(r->'conflicts') || ' where=' || (r->'conflicts'->0->>'where') || ' title=' || pr.title_ref || ' pLand=' || (pr.description->>'pLand') || '; ';
  -- kept: the file stays, the public record is stored beside it, not written
  r := public.agent_council_accept(pid, lid, array['title_ref'], '{}', array['title_ref']);
  select * into pr from public.properties where id = pid;
  out := out || 'keep: kept=' || (r->'kept')::text || ' title=' || pr.title_ref || ' found written=' || (pr.found->'title_ref'->>'written') || '; ';
  -- replaced: the public record goes in, with its provenance
  r := public.agent_council_accept(pid, lid, array['land_area'], array['land_area']);
  select * into pr from public.properties where id = pid;
  out := out || 'replace: pLand=' || (pr.description->>'pLand') || ' prov at set=' || ((pr.provenance->'pLand'->>'at') is not null) || '; ';
  -- the same land area written differently is the same ("3,647" against 3647), so no choice is needed
  update public.properties set description = description || '{"pLand":"3647.2"}'::jsonb where id = pid;
  r := public.agent_council_accept(pid, lid, array['land_area']);
  out := out || 'same value: conflicts=' || jsonb_array_length(r->'conflicts') || '; ';

  -- an unsigned agreement in force holding a different land area: a choice first, then brought into line
  insert into public.agreements (address, property_id, status, config, answers) values ('RB council test, 1 Nowhere Lane', pid, 'draft', '{"title":"999999"}', '{"pLand":"500"}') returning id into aid;
  r := public.agent_council_accept(pid, lid, array['land_area']);
  out := out || 'unsigned ag: where=' || coalesce(r->'conflicts'->0->>'where', 'NONE') || '; ';
  r := public.agent_council_accept(pid, lid, array['land_area', 'title_ref'], array['land_area', 'title_ref']);
  out := out || 'unsigned ag replaced: agreement pLand=' || ((select answers->>'pLand' from public.agreements where id = aid)) || ' title=' || ((select config->>'title' from public.agreements where id = aid)) || ' updated=' || (r->>'agreement_updated') || ' event=' || exists (select 1 from public.agreement_events where agreement_id = aid and kind = 'public_records_applied') || '; ';
  out := out || 'property after ag sync: pLand=' || ((select description->>'pLand' from public.properties where id = pid)) || ' title=' || ((select title_ref from public.properties where id = pid)) || '; ';

  -- a signed agreement is never changed, and a field it holds differently is never written, even with "replace"
  update public.agreements set answers = answers || '{"pLand":"700"}'::jsonb where id = aid;
  insert into public.agreement_people (agreement_id, position, legal_name, email, signed_at) values (aid, 1, 'RB Signer', 'rb-council-signer@example.com', now());
  update public.agreements set status = 'signed', signed_at = now() where id = aid;
  x := (select answers::text || config::text from public.agreements where id = aid);
  r := public.agent_council_accept(pid, lid, array['land_area'], array['land_area']);
  out := out || 'signed ag: where=' || coalesce(r->'conflicts'->0->>'where', 'NONE') || ' agreement unchanged=' || (x = (select answers::text || config::text from public.agreements where id = aid)) || '; ';
  r := public.agent_council_accept(pid, lid, array['land_area'], '{}', array['land_area']);
  out := out || 'signed keep: kept=' || (r->'kept')::text || ' agreement unchanged=' || (x = (select answers::text || config::text from public.agreements where id = aid)) || '; ';

  -- vendors: a party to the property reads the property (found included, by Tim's decision) but never a lookup, and can't use one
  insert into public.property_people (property_id, position, legal_name, email, user_id, role) values (pid, 1, 'RB Vendor', 'rb-council-vendor@example.com', vuid, 'owner');
  perform set_config('request.jwt.claims', vendor, true);
  begin perform public.agent_council_cached('100 Gladstone Road, Dunedin', pid); out := out || 'VENDOR READ CACHE; '; exception when others then out := out || 'vendor cache: ' || sqlerrm || '; '; end;
  begin perform public.agent_council_accept(pid, lid, array['zone']); out := out || 'VENDOR ACCEPTED; '; exception when others then out := out || 'vendor accept: ' || sqlerrm || '; '; end;
  execute 'set local role authenticated';
  select count(*) into n from public.council_lookups; out := out || 'vendor sees lookups=' || n || '; ';
  select count(*) into n from public.properties pp where pp.id = pid and pp.found ? 'zone'; out := out || 'vendor sees found=' || n || '; ';
  begin update public.properties set found = '{}' where id = pid; get diagnostics n = row_count; out := out || 'vendor found update rows=' || n || '; ';
  exception when others then out := out || 'vendor found update: ' || sqlerrm || '; '; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin perform public.agent_council_cached('x y z', null); out := out || 'ANON RAN CACHED; '; exception when others then out := out || 'anon: ' || sqlerrm || '; '; end;
  execute 'reset role';

  -- grants
  out := out || 'anon exec accept=' || has_function_privilege('anon', 'public.agent_council_accept(uuid, uuid, text[], text[], text[])', 'execute')
    || ' auth exec accept=' || has_function_privilege('authenticated', 'public.agent_council_accept(uuid, uuid, text[], text[], text[])', 'execute')
    || ' auth exec guard=' || has_function_privilege('authenticated', 'public.guard_found()', 'execute')
    || ' auth insert lookups=' || has_table_privilege('authenticated', 'public.council_lookups', 'insert')
    || ' anon select lookups=' || has_table_privilege('anon', 'public.council_lookups', 'select')
    || ' rls=' || (select relrowsecurity from pg_class where oid = 'public.council_lookups'::regclass) || '; ';
  raise exception 'ROLLBACK %', out;
end $t$;

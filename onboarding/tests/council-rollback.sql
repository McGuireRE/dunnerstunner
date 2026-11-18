-- Rollback test for migration 013 (public council records). Run with onboarding/tests/council-rollback.js, which puts the
-- migration inside the block and a real lookup result (from fn/property_lookup_core.ts and the recorded Dunedin answers) into
-- __RESULT__, so the whole thing is one statement: the final exception undoes the migration and every test row, so nothing is
-- kept. The output is the exception message: refusals read in lower case; a line in CAPITALS means something that should have
-- been refused was allowed, or a value was wrong. No DELETE anywhere.
-- Last run: 18 November 2026 (after the second review: removing a kept record, towns and units in the address fit), live project
-- hwpwyjxhdvlqrjwzxzqz, with migration 013's statements as committed: every line as expected, no CAPITALS, no [NULL]; afterwards the project had no council table, no found or provenance
-- column, none of the new functions or the trigger, agent_reopen_property as before, and no test row or sign-in.
do $t$
declare out text := ''; r jsonb; pid uuid; pid2 uuid; pid3 uuid; pid4 uuid; lid uuid; lid2 uuid; lid3 uuid; lid4 uuid; lid5 uuid; lid6 uuid; lid7 uuid; res2 jsonb; aid uuid; aid4 uuid; n int; x text; pr record;
  vuid uuid := '11111111-1111-1111-1111-1111111111c1';
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222')::text;
  vendor text := '{"email":"rb-council-vendor@example.com","sub":"11111111-1111-1111-1111-1111111111c1","role":"authenticated"}';
  res jsonb := $res$__RESULT__$res$::jsonb;
begin
  execute $mig$__MIGRATION__$mig$;
  insert into auth.users (id, email, aud, role) values (vuid, 'rb-council-vendor@example.com', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', agent, true);

  -- the existing writers of properties still work: an inspection creating one from an address (insert path), a direct agent update
  r := to_jsonb(public.agent_inspection_start(null, '9/100 Gladstone Road, Dunedin')); pid := (r->>'property_id')::uuid;
  out := out || coalesce('inspection start ok=' || (pid is not null), '[NULL]') || '; ';
  execute 'set local role authenticated';
  update public.properties set description = description || '{"pBed":"3"}'::jsonb where id = pid;
  get diagnostics n = row_count; out := out || 'agent direct update rows=' || n || '; ';
  begin update public.properties set found = '{"x":{"value":1}}' where id = pid; out := out || 'FOUND DIRECT WRITE ALLOWED; ';
  exception when others then out := out || 'direct found: ' || sqlerrm || '; '; end;
  begin update public.properties set provenance = '{"pLand":{}}' where id = pid; out := out || 'PROVENANCE DIRECT WRITE ALLOWED; ';
  exception when others then out := out || 'direct provenance: ' || sqlerrm || '; '; end;
  begin insert into public.properties (address, found) values ('RB council insert', '{"x":1}'); out := out || 'INSERT WITH FOUND ALLOWED; ';
  exception when others then out := out || 'insert found: ' || sqlerrm || '; '; end;
  begin insert into public.council_lookups (asked, status, created_by) values ('x y z', 'ok', 'me'); out := out || 'LOOKUP DIRECT INSERT ALLOWED; ';
  exception when others then out := out || 'direct lookup insert: ' || sqlerrm || '; '; end;
  begin insert into public.council_use_log (property_id, kind, actor) values (pid, 'used', 'me'); out := out || 'LOG DIRECT INSERT ALLOWED; ';
  exception when others then out := out || 'direct log insert: ' || sqlerrm || '; '; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', agent, true);

  -- lookups as the edge function saves them (service role: here, the test's own role)
  insert into public.council_lookups (property_id, asked, matched_address, council, status, result, created_by)
  values (null, '100 Gladstone Road, Dunedin', res->>'matched_address', res->>'council', res->>'status', res, 'rb test') returning id into lid;
  insert into public.council_lookups (property_id, asked, matched_address, council, status, result, created_by)
  values (null, 'RB weak address', null, null, 'weak', '{"status":"weak","values":[]}', 'rb test') returning id into lid2;
  insert into public.council_lookups (property_id, asked, matched_address, council, status, result, created_by, created_at)
  values (null, 'RB old address', 'RB old address', null, 'ok', res, 'rb test', now() - interval '31 days') returning id into lid3;

  -- the cache: by address (any spelling), by matched address, never a weak or old one
  r := public.agent_council_cached('100 gladstone road  dunedin', pid);
  out := out || coalesce('cached by address=' || coalesce((r->>'id')::uuid = lid, false), '[NULL]') || '; ';
  r := public.agent_council_cached('100 Gladstone Road, Dalmore, Dunedin', null);
  out := out || coalesce('cached by matched=' || coalesce((r->>'id')::uuid = lid, false) || ' created_by shown=' || (r ? 'created_by'), '[NULL]') || '; ';
  out := out || coalesce('weak cached=' || (public.agent_council_cached('RB weak address', null) is not null) || ' old cached=' || (public.agent_council_cached('RB old address', null) is not null), '[NULL]') || '; ';
  -- address fit
  out := out || 'fits: unit vs none=' || public.council_addr_fits('9/100 Gladstone Road, Dunedin', '100 Gladstone Road, Dalmore, Dunedin')
    || ' flat form=' || public.council_addr_fits('Flat 2, 20 Thames Street', '2/20 thames st') || ' other unit=' || public.council_addr_fits('1/20 Thames Street', '2/20 Thames Street')
    || ' other number=' || public.council_addr_fits('102 Gladstone Road', '100 Gladstone Road') || ' other street=' || public.council_addr_fits('100 Gladstone Road', '100 Highgate')
    || ' other town=' || public.council_addr_fits('20 High Street, Mosgiel', '20 High Street, Balclutha') || ' shared suburb=' || public.council_addr_fits('100 Gladstone Road, Dunedin', '100 Gladstone Road, Dalmore, Dunedin')
    || ' postcode ignored=' || public.council_addr_fits('20 Thames Street, Oamaru', '20 Thames Street, Oamaru 9400')
    || ' unit not chosen=' || public.council_addr_fits('20 Thames Street', '2/20 Thames Street') || ' unit chosen=' || public.council_addr_fits('20 Thames Street', '2/20 Thames Street', true) || '; ';

  -- accept into an empty file: title, legal description and land area are written; the rest stored in found
  r := public.agent_council_accept(pid, lid, array['title_ref', 'legal_description', 'land_area', 'capital_value', 'zone', 'hazard_dcc_none', 'rates_council', 'not_a_key', 'BAD KEY']);
  select * into pr from public.properties where id = pid;
  out := out || coalesce('accept1 written=' || (r->'written')::text || ' stored=' || jsonb_array_length(r->'stored') || ' skipped=' || (r->'skipped')::text, '[NULL]') || '; ';
  out := out || coalesce('title=' || coalesce(pr.title_ref, 'NULL') || ' legal=' || coalesce(pr.legal_description, 'NULL') || ' pLand=' || coalesce(pr.description->>'pLand', 'NULL') || ' pBed kept=' || coalesce(pr.description->>'pBed', 'LOST'), '[NULL]') || '; ';
  out := out || coalesce('cv note=' || (pr.found->'capital_value'->>'note') || ' | rates note=' || (pr.found->'rates_council'->>'note'), '[NULL]') || '; ';
  out := out || coalesce('zone LIM=' || (position('Not a substitute for a LIM.' in pr.found->'zone'->>'note') > 0) || ' hazard LIM=' || (position('Not a substitute for a LIM.' in pr.found->'hazard_dcc_none'->>'note') > 0), '[NULL]') || '; ';
  out := out || coalesce('provenance pLand from=' || coalesce(pr.provenance->'pLand'->>'from', 'NULL') || ' source=' || coalesce(pr.provenance->'pLand'->>'source', 'NULL') || ' as_of_label=' || coalesce(pr.provenance->'pLand'->>'as_of_label', 'NULL'), '[NULL]') || '; ';
  -- nothing personal and no lookup id where vendors who are a party can read
  out := out || coalesce('found has who or lookup=' || (pr.found::text ~ '(used_by|lookup_id|"by")') || ' provenance has who or lookup=' || (pr.provenance::text ~ '(used_by|lookup_id|"by")'), '[NULL]') || '; ';
  out := out || coalesce('use log: ' || (select string_agg(kind || ' ' || jsonb_array_length(keys) || ' by set=' || (actor <> '') || ' lookup=' || (lookup_id = lid), ', ') from public.council_use_log where property_id = pid), '[NULL]') || '; ';
  out := out || coalesce('lookup tied=' || ((select property_id from public.council_lookups where id = lid) = pid), '[NULL]') || '; ';
  -- the property's own lookup isn't offered when a different address is asked from its page ("Not the right property?")
  out := out || coalesce('cached for property, own address=' || (public.agent_council_cached('9/100 Gladstone Road, Dunedin', pid) is not null) || ' other address=' || (public.agent_council_cached('15 High Street, Balclutha', pid) is not null), '[NULL]') || '; ';
  -- that lookup can't now be used on another property; a lookup whose address doesn't fit the property's is refused
  insert into public.properties (address) values ('5 Other Street, Dunedin') returning id into pid2;
  begin perform public.agent_council_accept(pid2, lid, array['title_ref']); out := out || 'OTHER PROPERTY ALLOWED; ';
  exception when others then out := out || 'other property: ' || sqlerrm || '; '; end;
  insert into public.council_lookups (property_id, asked, matched_address, council, status, result, created_by)
  values (null, '100 Gladstone Road, Dunedin', res->>'matched_address', res->>'council', 'ok', res, 'rb test') returning id into lid4;
  begin perform public.agent_council_accept(pid2, lid4, array['title_ref']); out := out || 'ADDRESS MISFIT ALLOWED; ';
  exception when others then out := out || 'misfit: ' || sqlerrm || '; '; end;
  out := out || coalesce('cached for other property=' || (public.agent_council_cached('100 Gladstone Road, Dunedin', pid2) is not null), '[NULL]') || '; ';
  -- after the property's address changes, its old lookup isn't offered
  update public.properties set address = '12 Changed Street, Dunedin' where id = pid;
  out := out || coalesce('cached after address change=' || (public.agent_council_cached('100 Gladstone Road, Dunedin', pid) is not null), '[NULL]') || '; ';
  begin perform public.agent_council_accept(pid, lid, array['zone']); out := out || 'USED AFTER ADDRESS CHANGE; ';
  exception when others then out := out || 'after change: ' || substr(sqlerrm, 1, 40) || '; '; end;
  update public.properties set address = '9/100 Gladstone Road, Dunedin' where id = pid;
  begin perform public.agent_council_accept(pid2, lid2, array['title_ref']); out := out || 'WEAK USED; '; exception when others then out := out || 'weak: ' || sqlerrm || '; '; end;
  begin perform public.agent_council_accept(pid2, lid3, array['title_ref']); out := out || 'OLD USED; '; exception when others then out := out || 'old: ' || sqlerrm || '; '; end;
  begin perform public.agent_council_accept(pid, lid, '{}'); out := out || 'EMPTY ALLOWED; '; exception when others then out := out || 'empty: ' || sqlerrm || '; '; end;

  -- a different value already on the file (as a title document would leave it): never overwritten without a choice
  update public.properties set title_ref = '999999', description = description || '{"pLand":"1874"}'::jsonb where id = pid;
  r := public.agent_council_accept(pid, lid, array['title_ref', 'land_area']);
  select * into pr from public.properties where id = pid;
  out := out || coalesce('no choice: conflicts=' || jsonb_array_length(r->'conflicts') || ' where=' || (r->'conflicts'->0->>'where') || ' title=' || pr.title_ref || ' pLand=' || (pr.description->>'pLand'), '[NULL]') || '; ';
  r := public.agent_council_accept(pid, lid, array['title_ref'], '{}', array['title_ref']);
  select * into pr from public.properties where id = pid;
  out := out || coalesce('keep: kept=' || (r->'kept')::text || ' title=' || pr.title_ref || ' found written=' || (pr.found->'title_ref'->>'written'), '[NULL]') || '; ';
  r := public.agent_council_accept(pid, lid, array['land_area'], array['land_area']);
  select * into pr from public.properties where id = pid;
  out := out || coalesce('replace: pLand=' || (pr.description->>'pLand') || ' was=' || coalesce(pr.provenance->'pLand'->>'was', 'NULL'), '[NULL]') || '; ';
  update public.properties set description = description || '{"pLand":"3647.2"}'::jsonb where id = pid;
  r := public.agent_council_accept(pid, lid, array['land_area']);
  out := out || coalesce('same value: conflicts=' || jsonb_array_length(r->'conflicts'), '[NULL]') || '; ';

  -- a draft agreement holding a different land area: a choice first, then brought into line
  insert into public.agreements (address, property_id, status, config, answers) values ('9/100 Gladstone Road, Dunedin', pid, 'draft', '{"title":"999999"}', '{"pLand":"500"}') returning id into aid;
  r := public.agent_council_accept(pid, lid, array['land_area']);
  out := out || coalesce('draft ag: where=' || coalesce(r->'conflicts'->0->>'where', 'NONE'), '[NULL]') || '; ';
  r := public.agent_council_accept(pid, lid, array['land_area', 'title_ref'], array['land_area', 'title_ref']);
  out := out || coalesce('draft ag replaced: agreement pLand=' || ((select answers->>'pLand' from public.agreements where id = aid)) || ' title=' || ((select config->>'title' from public.agreements where id = aid)) || ' updated=' || (r->>'agreement_updated') || ' event=' || exists (select 1 from public.agreement_events where agreement_id = aid and kind = 'public_records_applied'), '[NULL]') || '; ';
  -- sent to the vendors (and then parked with their lawyer): the agreement is left alone; the property file takes the choice
  update public.agreements set status = 'sent', answers = answers || '{"pLand":"600"}'::jsonb where id = aid;
  x := (select answers::text || config::text from public.agreements where id = aid);
  r := public.agent_council_accept(pid, lid, array['land_area']);
  out := out || coalesce('sent ag: where=' || coalesce(r->'conflicts'->0->>'where', 'NONE'), '[NULL]') || '; ';
  r := public.agent_council_accept(pid, lid, array['land_area'], array['land_area']);
  out := out || coalesce('sent ag replaced: agreement unchanged=' || (x = (select answers::text || config::text from public.agreements where id = aid)) || ' left=' || coalesce(r->'agreement_left'->0->>'status', 'NONE') || ' updated=' || (r->>'agreement_updated') || ' property pLand=' || ((select description->>'pLand' from public.properties where id = pid)), '[NULL]') || '; ';
  update public.agreements set status = 'parked' where id = aid;
  update public.properties set description = description || '{"pLand":"1"}'::jsonb where id = pid;
  x := (select answers::text || config::text from public.agreements where id = aid);
  r := public.agent_council_accept(pid, lid, array['land_area'], array['land_area']);
  out := out || coalesce('parked ag: unchanged=' || (x = (select answers::text || config::text from public.agreements where id = aid)) || ' left=' || coalesce(r->'agreement_left'->0->>'status', 'NONE'), '[NULL]') || '; ';

  -- a signed agreement is never changed, and a field it holds differently is never written, even with "replace"
  update public.agreements set status = 'draft', answers = answers || '{"pLand":"700"}'::jsonb where id = aid;
  insert into public.agreement_people (agreement_id, position, legal_name, email, signed_at) values (aid, 1, 'RB Signer', 'rb-council-signer@example.com', now());
  update public.agreements set status = 'signed', signed_at = now() where id = aid;
  x := (select answers::text || config::text from public.agreements where id = aid);
  r := public.agent_council_accept(pid, lid, array['land_area'], array['land_area']);
  out := out || coalesce('signed ag: where=' || coalesce(r->'conflicts'->0->>'where', 'NONE') || ' agreement unchanged=' || (x = (select answers::text || config::text from public.agreements where id = aid)), '[NULL]') || '; ';
  r := public.agent_council_accept(pid, lid, array['land_area'], '{}', array['land_area']);
  out := out || coalesce('signed keep: kept=' || (r->'kept')::text || ' agreement unchanged=' || (x = (select answers::text || config::text from public.agreements where id = aid)), '[NULL]') || '; ';

  -- removing a used value: the field gets back what it held before; a value only in found just goes; all logged
  insert into public.properties (address, title_ref) values ('7/100 Gladstone Road, Dunedin', '123') returning id into pid4;
  insert into public.council_lookups (property_id, asked, matched_address, council, status, result, created_by)
  values (null, '7/100 Gladstone Road, Dunedin', res->>'matched_address', res->>'council', 'ok', res, 'rb test') returning id into lid5;
  r := public.agent_council_accept(pid4, lid5, array['title_ref', 'land_area', 'zone'], array['title_ref']);
  r := public.agent_council_remove(pid4, 'title_ref');
  select * into pr from public.properties where id = pid4;
  out := out || coalesce('remove title: restored=' || (r->>'restored') || ' title=' || coalesce(pr.title_ref, 'NULL') || ' in found=' || (pr.found ? 'title_ref') || ' provenance=' || (pr.provenance ? 'title_ref'), '[NULL]') || '; ';
  r := public.agent_council_remove(pid4, 'land_area');
  select * into pr from public.properties where id = pid4;
  out := out || coalesce('remove land: pLand=' || coalesce(pr.description->>'pLand', 'NONE'), '[NULL]') || '; ';
  r := public.agent_council_remove(pid4, 'zone');
  select * into pr from public.properties where id = pid4;
  out := out || coalesce('remove zone: found keys=' || (select count(*) from jsonb_object_keys(pr.found)), '[NULL]') || '; ';
  begin perform public.agent_council_remove(pid4, 'zone'); out := out || 'REMOVED TWICE; '; exception when others then out := out || 'remove again: ' || sqlerrm || '; '; end;
  -- a draft agreement now holding the public title: the field stays, and the result says why
  r := public.agent_council_accept(pid4, lid5, array['title_ref'], array['title_ref']);
  insert into public.agreements (address, property_id, status, config, answers) values ('7/100 Gladstone Road, Dunedin', pid4, 'draft', jsonb_build_object('title', '430431, 430432'), '{}') returning id into aid4;
  r := public.agent_council_remove(pid4, 'title_ref');
  select * into pr from public.properties where id = pid4;
  out := out || coalesce('remove held by agreement: restored=' || (r->>'restored') || ' holds=' || coalesce(r->>'agreement_holds', 'NONE') || ' title=' || pr.title_ref || ' in found=' || (pr.found ? 'title_ref'), '[NULL]') || '; ';
  out := out || coalesce('removals logged=' || (select count(*) from public.council_use_log where property_id = pid4 and kind = 'removed'), '[NULL]') || '; ';
  -- removing a KEPT record leaves the field and its provenance alone (the reviewer's sequence): the file says 800; Tim uses the
  -- public record; a newer lookup says something else and Tim keeps the first; removing the kept record keeps the field as it is
  insert into public.properties (address, description) values ('11/100 Gladstone Road, Dunedin', '{"pLand":"800"}') returning id into pid3;
  insert into public.council_lookups (property_id, asked, matched_address, council, status, result, created_by)
  values (null, '11/100 Gladstone Road, Dunedin', res->>'matched_address', res->>'council', 'ok', res, 'rb test') returning id into lid6;
  r := public.agent_council_accept(pid3, lid6, array['land_area'], array['land_area']);
  res2 := jsonb_set(res, '{values}', (select jsonb_agg(case when v->>'key' = 'land_area' then v || '{"value":3700,"display":"3,700 m²"}'::jsonb else v end) from jsonb_array_elements(res->'values') v));
  insert into public.council_lookups (property_id, asked, matched_address, council, status, result, created_by)
  values (null, '11/100 Gladstone Road, Dunedin', res2->>'matched_address', res2->>'council', 'ok', res2, 'rb test') returning id into lid7;
  r := public.agent_council_accept(pid3, lid7, array['land_area'], '{}', array['land_area']);
  select * into pr from public.properties where id = pid3;
  out := out || coalesce('kept newer: pLand=' || (pr.description->>'pLand') || ' found value=' || (pr.found->'land_area'->>'value') || ' written=' || (pr.found->'land_area'->>'written') || ' provenance value=' || (pr.provenance->'pLand'->>'value'), '[NULL]') || '; ';
  r := public.agent_council_remove(pid3, 'land_area');
  select * into pr from public.properties where id = pid3;
  out := out || coalesce('remove kept: restored=' || (r->>'restored') || ' pLand=' || coalesce(pr.description->>'pLand', 'NONE') || ' in found=' || (pr.found ? 'land_area') || ' provenance value=' || coalesce(pr.provenance->'pLand'->>'value', 'GONE'), '[NULL]') || '; ';

  -- starting again with new owners clears the public-record values (logged); with the same owners they stay
  r := public.agent_council_accept(pid4, lid5, array['zone']);
  update public.properties set stage = 'withdrawn' where id = pid4;
  perform public.agent_reopen_property(pid4, false);
  out := out || coalesce('reopen same owners: found kept=' || ((select pp.found ? 'zone' from public.properties pp where pp.id = pid4)), '[NULL]') || '; ';
  update public.properties set stage = 'withdrawn' where id = pid4;
  perform public.agent_reopen_property(pid4, true);
  select * into pr from public.properties where id = pid4;
  out := out || coalesce('reopen new owners: found=' || pr.found::text || ' provenance=' || pr.provenance::text || ' stage=' || pr.stage || ' logged=' || exists (select 1 from public.council_use_log where property_id = pid4 and kind = 'cleared'), '[NULL]') || '; ';

  -- vendors: a party to the property reads the property (found included, by Tim's decision) but never a lookup or the log
  insert into public.property_people (property_id, position, legal_name, email, user_id, role) values (pid, 1, 'RB Vendor', 'rb-council-vendor@example.com', vuid, 'owner');
  perform set_config('request.jwt.claims', vendor, true);
  begin perform public.agent_council_cached('100 Gladstone Road, Dunedin', pid); out := out || 'VENDOR READ CACHE; '; exception when others then out := out || 'vendor cache: ' || sqlerrm || '; '; end;
  begin perform public.agent_council_accept(pid, lid, array['zone']); out := out || 'VENDOR ACCEPTED; '; exception when others then out := out || 'vendor accept: ' || sqlerrm || '; '; end;
  begin perform public.agent_council_remove(pid, 'zone'); out := out || 'VENDOR REMOVED; '; exception when others then out := out || 'vendor remove: ' || sqlerrm || '; '; end;
  execute 'set local role authenticated';
  select count(*) into n from public.council_lookups; out := out || 'vendor sees lookups=' || n || '; ';
  select count(*) into n from public.council_use_log; out := out || 'vendor sees log=' || n || '; ';
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
    || ' anon exec remove=' || has_function_privilege('anon', 'public.agent_council_remove(uuid, text)', 'execute')
    || ' auth exec accept=' || has_function_privilege('authenticated', 'public.agent_council_accept(uuid, uuid, text[], text[], text[])', 'execute')
    || ' auth exec guard=' || has_function_privilege('authenticated', 'public.guard_found()', 'execute')
    || ' auth insert lookups=' || has_table_privilege('authenticated', 'public.council_lookups', 'insert')
    || ' auth insert log=' || has_table_privilege('authenticated', 'public.council_use_log', 'insert')
    || ' anon select lookups=' || has_table_privilege('anon', 'public.council_lookups', 'select')
    || ' rls=' || (select relrowsecurity from pg_class where oid = 'public.council_lookups'::regclass) || '/' || (select relrowsecurity from pg_class where oid = 'public.council_use_log'::regclass) || '; ';
  raise exception 'ROLLBACK %', out;
end $t$;

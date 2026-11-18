-- Rollback test for migration 015 (maps.orc.govt.nz through the database). Run with onboarding/tests/orc-route-rollback.js, which
-- puts the migration inside the block, so the whole thing is one statement and the final exception undoes it all. pg_net sends a
-- request only after the transaction that queued it commits, so nothing queued here is ever sent; to check real answers the test
-- uses responses pg_net already holds (kept 6 hours) from GETs made beforehand with net.http_get to ORC paths the lookup uses (the
-- address finder, ORC Properties) and to a web page, choosing each by what it contains. The output is the exception message: a line
-- in CAPITALS means something was allowed that should have been refused, or a value was wrong. No DELETE anywhere.
-- Last run: 18 November 2026, live project hwpwyjxhdvlqrjwzxzqz, with 015 as committed: every line as expected, no CAPITALS;
-- afterwards no orc_http_requests table, neither function, the http extension not installed, and nothing left in pg_net's queue.
do $t$
declare out text := ''; rid bigint; r jsonb; n int := 0; bad text; x text; rr record; ok boolean;
begin
  execute $mig$__MIGRATION__$mig$;

  -- start: queues one GET and records its id; its result is pending (never sent: this block rolls back)
  rid := public.orc_http_start('https://maps.orc.govt.nz/arcgis/rest/services/OtagoAddress_Locator/GeocodeServer?f=json');
  out := out || 'start: id set=' || (rid is not null) || ' recorded=' || exists(select 1 from public.orc_http_requests where id = rid)
         || ' queued=' || exists(select 1 from net.http_request_queue where id = rid) || '; result before sent=' || public.orc_http_result(rid)::text || E'\n';

  -- real answers pg_net already holds (recorded here as if made by orc_http_start)
  for rr in select id, status_code, content_type, content from net._http_response order by id desc limit 50 loop
    insert into public.orc_http_requests (id, url) values (rr.id, 'https://maps.orc.govt.nz/arcgis/rest/services/test') on conflict do nothing;
  end loop;
  select id into rid from net._http_response where status_code = 200 and content like '%"candidates"%' order by id desc limit 1;
  r := public.orc_http_result(rid);
  out := out || coalesce('address finder: status=' || (r->>'status') || ' first=' || (r#>>'{json,candidates,0,address}') || ' score=' || (r#>>'{json,candidates,0,score}')
         || ' raw text=' || (r ? 'content'), 'NO ADDRESS FINDER ANSWER HELD (make one first)') || E'\n';
  select id into rid from net._http_response where status_code = 200 and content like '%"features"%' and content not like '%"candidates"%' order by id desc limit 1;
  r := public.orc_http_result(rid);
  out := out || coalesce('ORC Properties: status=' || (r->>'status') || ' features=' || jsonb_array_length(r#>'{json,features}'), 'NO ORC PROPERTIES ANSWER HELD') || E'\n';
  select id into rid from net._http_response where content_type like 'text/html%' and status_code = 200 order by id desc limit 1;
  out := out || 'web page: ' || coalesce(public.orc_http_result(rid)::text, 'none held') || E'\n';
  select id into rid from net._http_response where status_code = 404 order by id desc limit 1;
  out := out || 'not found: ' || coalesce(public.orc_http_result(rid)::text, 'none held') || E'\n';

  -- an id it didn't make
  begin perform public.orc_http_result(-1); out := out || 'UNRECORDED ID ANSWERED' || E'\n';
  exception when others then out := out || 'unrecorded id: ' || sqlerrm || E'\n'; end;

  -- addresses refused
  foreach bad in array array[
    'http://maps.orc.govt.nz/arcgis/rest/services/x', 'https://maps.orc.govt.nz.evil.example/arcgis/rest/services/x',
    'https://user@maps.orc.govt.nz/arcgis/rest/services/x', 'https://maps.orc.govt.nz:8443/arcgis/rest/services/x',
    'https://maps.orc.govt.nz/arcgis/rest/services/../admin', 'https://maps.orc.govt.nz/arcgis/admin/x',
    'https://maps.orc.govt.nz/arcgis/rest/services/x y', 'https://maps.orc.govt.nz/arcgis/rest/services/x#y',
    'https://maps.orc.govt.nz/arcgis/rest/services/' || repeat('a', 2000), null] loop
    begin perform public.orc_http_start(bad); out := out || 'ALLOWED: ' || coalesce(left(bad, 80), 'null') || E'\n';
    exception when others then n := n + 1; end;
  end loop;
  out := out || 'refused ' || n || ' of 10 bad addresses' || E'\n';

  -- who can call
  out := out || 'grants: service_role=' || has_function_privilege('service_role', 'public.orc_http_start(text)', 'execute') || '/' || has_function_privilege('service_role', 'public.orc_http_result(bigint)', 'execute')
    || ' authenticated=' || has_function_privilege('authenticated', 'public.orc_http_start(text)', 'execute') || '/' || has_function_privilege('authenticated', 'public.orc_http_result(bigint)', 'execute')
    || ' anon=' || has_function_privilege('anon', 'public.orc_http_start(text)', 'execute') || '/' || has_function_privilege('anon', 'public.orc_http_result(bigint)', 'execute')
    || ' table to authenticated=' || has_table_privilege('authenticated', 'public.orc_http_requests', 'select')
    || ' rls=' || (select relrowsecurity from pg_class where oid = 'public.orc_http_requests'::regclass) || E'\n';
  foreach x in array array['authenticated', 'anon'] loop
    begin execute 'set local role ' || x; perform public.orc_http_start('https://maps.orc.govt.nz/arcgis/rest/services/x?f=json'); reset role; out := out || upper(x) || ' COULD START' || E'\n';
    exception when others then reset role; out := out || x || ': ' || sqlerrm || E'\n'; end;
  end loop;

  raise exception 'ROLLBACK %', out;
end $t$;

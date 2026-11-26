-- Rollback test for migration 032 (appraisal views: one presentable appraisal per row, Tim only). Run with
-- onboarding/tests/appraisal-views-rollback.js, which puts the whole migration inside the block, so one statement creates the table,
-- runs the checks and then raises, which undoes it all. Nothing is kept. The output is the exception message: lower case reads as
-- expected; a line in CAPITALS means something was wrong.
-- Needs public.agents, public.properties, public.is_agent() and public.touch_updated() as live (the local stand-in has them:
-- tests/pg-standin.sql). Test rows use invented example data only. The agent is the first row of public.agents, as in the LW0 test.
do $t$
declare out text := ''; x text; n int; aid uuid; pid uuid := gen_random_uuid(); t0 timestamptz;
  agent text := json_build_object('email', (select email from public.agents order by created_at limit 1), 'sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text;
  vendor text := json_build_object('email', 'rb-vendor@example.com', 'sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text;
begin
  $mig$__MIGRATION__$mig$;

  -- shape: Row Level Security on, the three agent policies, and no delete policy
  select relrowsecurity::text into x from pg_class where oid = 'public.appraisal_views'::regclass;
  out := out || 'rls on: ' || x || '; ';
  if x <> 'true' then out := out || 'ROW LEVEL SECURITY IS OFF; '; end if;
  select string_agg(policyname || ':' || cmd, ',' order by policyname) into x from pg_policies where schemaname = 'public' and tablename = 'appraisal_views';
  out := out || 'policies: ' || coalesce(x, 'none') || '; ';
  if x is distinct from 'appraisal_views_agent_insert:INSERT,appraisal_views_agent_select:SELECT,appraisal_views_agent_update:UPDATE' then out := out || 'POLICIES ARE NOT THE THREE AGENT ONES; '; end if;
  if has_table_privilege('anon', 'public.appraisal_views', 'SELECT') or has_table_privilege('anon', 'public.appraisal_views', 'INSERT') or has_table_privilege('anon', 'public.appraisal_views', 'UPDATE') then out := out || 'ANON HAS A PRIVILEGE ON THE TABLE; '; else out := out || 'anon: no privileges; '; end if;
  if has_table_privilege('authenticated', 'public.appraisal_views', 'DELETE') or has_table_privilege('authenticated', 'public.appraisal_views', 'TRUNCATE') then out := out || 'SIGNED-IN USERS MAY DELETE OR TRUNCATE; '; else out := out || 'signed-in: no delete or truncate; '; end if;

  -- a property for the link (invented)
  insert into public.properties (id, address) values (pid, 'RB 32 Sample Street, Testville');

  -- Tim adds, reads and changes a row
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', agent, true);
  insert into public.appraisal_views (property_id, title, address, prepared_for, sections, fields)
    values (pid, 'RB 32 Sample Street: Market Appraisal', 'RB 32 Sample Street, Testville', 'Sample Person',
      '[{"type":"heading","text":"My appraisal"},{"type":"ranges"}]'::jsonb,
      '{"ranges":[{"key":"A","option":"A. Option one","involves":"Sample","low":400000,"high":450000}],"bedrooms":"3 bedrooms","method":{"name":"Deadline sale","text":"Sample"}}'::jsonb)
    returning id into aid;
  select count(*) into n from public.appraisal_views where id = aid; out := out || 'agent reads own row: ' || n || '; ';
  if n <> 1 then out := out || 'AGENT CANNOT READ THE ROW; '; end if;
  select updated_at into t0 from public.appraisal_views where id = aid;
  update public.appraisal_views set fields = jsonb_set(fields, '{bedrooms}', '"4 bedrooms"') where id = aid;
  get diagnostics n = row_count; out := out || 'agent update rows: ' || n || '; ';
  select fields->>'bedrooms' into x from public.appraisal_views where id = aid;
  if x is distinct from '4 bedrooms' then out := out || 'THE EDIT DID NOT SAVE; '; else out := out || 'edit saved; '; end if;
  begin delete from public.appraisal_views where id = aid; out := out || 'AGENT DELETED A ROW; '; exception when others then out := out || 'agent delete: refused; '; end;
  begin update public.appraisal_views set sections = '{"not":"a list"}'::jsonb where id = aid; out := out || 'SECTIONS ACCEPTED A NON-LIST; '; exception when check_violation then out := out || 'sections must be a list; '; end;
  execute 'reset role';

  -- a signed-in vendor sees nothing and writes nothing
  execute 'set local role authenticated'; perform set_config('request.jwt.claims', vendor, true);
  select count(*) into n from public.appraisal_views; out := out || 'vendor sees: ' || n || '; ';
  if n <> 0 then out := out || 'A VENDOR CAN SEE APPRAISAL VIEWS; '; end if;
  begin insert into public.appraisal_views (title) values ('rb vendor'); out := out || 'A VENDOR ADDED A ROW; '; exception when others then out := out || 'vendor insert: refused; '; end;
  update public.appraisal_views set title = 'rb vendor' where id = aid; get diagnostics n = row_count;
  out := out || 'vendor update rows: ' || n || '; ';
  if n <> 0 then out := out || 'A VENDOR CHANGED A ROW; '; end if;
  execute 'reset role';

  -- anon: refused outright
  begin execute 'set local role anon'; perform count(*) from public.appraisal_views; out := out || 'ANON READ THE TABLE; '; exception when others then out := out || 'anon read: refused; '; end;
  execute 'reset role';

  -- the property file can be removed without losing the appraisal (the link clears)
  delete from public.properties where id = pid;
  select count(*) into n from public.appraisal_views where id = aid and property_id is null; out := out || 'property removed, appraisal kept: ' || n || '; ';
  if n <> 1 then out := out || 'THE APPRAISAL WENT WITH THE PROPERTY OR KEPT A DEAD LINK; '; end if;

  if out ~* 'null value in column|violates foreign key|violates unique|does not exist' then out := out || 'A FIXTURE DID NOT MATCH THE SCHEMA; '; end if;
  raise exception 'ROLLBACK %', out;
end $t$;

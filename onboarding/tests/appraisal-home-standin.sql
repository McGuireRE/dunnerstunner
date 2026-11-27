-- A local PostgreSQL 16 stand-in for migration 036's rollback test (tests/appraisal-home-rollback.js). NEVER run on the live project.
-- Run on an empty database, in this order (each with psql -v ON_ERROR_STOP=1 -f):
--   1. tests/appraisal-setup-standin.sql, 2. migrations/033_appraisal_setup.sql, 3. tests/appraisal-comps-standin.sql,
--   4. migrations/034_appraisal_comps.sql, 5. tests/appraisal-reports-standin.sql, 6. migrations/035_appraisal_reports_photos.sql,
--   7. this file. Then the rollback block.
-- 036 touches nothing beyond what those build: appraisal_views and its guard, the wording guard, the pack readers, is_agent, the
-- storage buckets and objects (with storage.foldername and the delete protection), and the appraisal-media policies. This file adds
-- nothing; it checks that the stand-in is faithful to live where 036 leans on it. Read with SELECTs on pg_catalog on 28 November 2026
-- (nothing was written to the live project): each function's definition md5 on live, and the live appraisal-media storage policies.
-- One known difference: storage.protect_delete is the stand-in's own (live's is Supabase's); both refuse a direct delete from
-- storage.objects unless storage.allow_delete_query is 'true', which is all the test relies on.
do $chk$
declare want constant jsonb := '{
  "agent_appraisal_save(uuid,jsonb,jsonb,jsonb,text,text,text,text)": "015be31150f445b9fd7f3bc13cc4aaa0",
  "appraisal_pack_date(jsonb,text)": "232640c442c10586f0a98976fd2c3e8c",
  "appraisal_pack_num(jsonb,numeric,numeric,text)": "d4ec1807c955bec03fd0f4afc40c4699",
  "appraisal_pack_text(jsonb,integer)": "7f7d8004320dd57fa99d82e8245f6312",
  "appraisal_pack_ts(jsonb)": "49193c6796e2445b81e03f3ab0c68876",
  "appraisal_pack_url(jsonb)": "721e614fc06ec6e345bd8ecee6697a66",
  "appraisal_wording_problem(jsonb)": "7f82cf1770e34b3d4052bf7c4cc7b20d",
  "guard_appraisal_view()": "3d0147dba9b2bd39b6f33cde991e1365",
  "is_agent()": "861ed6ee5d819f8e3b21387775ef053e",
  "storage.foldername(text)": "93671af66e1fe108a56068ad4137d001"}';
  k text; got text; bad text := '';
begin
  for k in select jsonb_object_keys(want) loop
    select md5(pg_get_functiondef(k::regprocedure)) into got;
    if got is distinct from want->>k then bad := bad || k || ' '; end if;
  end loop;
  select string_agg(policyname || ':' || cmd, ',' order by policyname) into got from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'appraisal_%';
  if got is distinct from 'appraisal_media_agent_add:INSERT,appraisal_media_agent_read:SELECT,appraisal_media_agent_remove:DELETE' then bad := bad || 'storage policies (' || coalesce(got, 'none') || ') '; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'storage.objects'::regclass and tgname = 'protect_objects_delete') then bad := bad || 'protect_objects_delete '; end if;
  if exists (select 1 from storage.buckets where id = 'appraisal-video') or to_regclass('public.appraisal_assets') is not null or to_regclass('public.tim_reviews') is not null then bad := bad || '036 already applied '; end if;
  if bad <> '' then raise exception 'THE STAND-IN DIFFERS FROM LIVE: %', bad; end if;
  raise notice 'stand-in matches live where 036 leans on it';
end $chk$;

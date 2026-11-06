-- Rollback test for migrations 009 and 010 (run AFTER, or wrapped around, the two migrations). It builds three properties,
-- walks agent_set_stage through every rule, checks vendors and anon are shut out, then raises an exception so nothing is kept.
-- The output is the exception message: every line should read as a refusal ("noconfirm:", "skip:" ...), never in CAPITALS
-- (capitals mean something that should have been refused was allowed).
-- Last run: 7 November 2026, on a scratch PostgreSQL 16 holding copies of the tables and the phase 1 functions it touches.
do $t$
declare out text := ''; p1 uuid; p2 uuid; p3 uuid; a1 uuid; a2 uuid; a3 uuid; r jsonb; n int; st text; ast text; vendor text := '{"email":"vendor@example.com","sub":"11111111-1111-1111-1111-111111111111"}';
  agent text := '{"email":"hello@timmcguire.co.nz","sub":"22222222-2222-2222-2222-222222222222"}';
begin
  perform set_config('request.jwt.claims', agent, true);
  insert into properties(address) values ('RB Test 1') returning id into p1;
  insert into agreements(address, property_id, status) values ('RB Test 1', p1, 'draft') returning id into a1;
  update agreements set status='countersigned' where id=a1;
  select stage into st from properties where id=p1; out := out || 'start=' || st || '; ';
  begin perform agent_set_stage(p1,'live','',false); out := out || 'NOCONFIRM-ALLOWED; '; exception when others then out := out || 'noconfirm:' || sqlerrm || '; '; end;
  begin perform agent_set_stage(p1,'sold',null,true); out := out || 'SKIP-ALLOWED; '; exception when others then out := out || 'skip:' || sqlerrm || '; '; end;
  begin perform agent_set_stage(p1,'bogus',null,true); out := out || 'BOGUS-ALLOWED; '; exception when others then out := out || 'bogus:' || sqlerrm || '; '; end;
  r := agent_set_stage(p1,'live',null,true); out := out || 'live:' || r::text || '; ';
  begin perform agent_set_stage(p1,'live',null,true); out := out || 'SAME-ALLOWED; '; exception when others then out := out || 'same:' || sqlerrm || '; '; end;
  begin perform agent_set_stage(p1,'settled','x',true); out := out || 'SETTLE-FROM-LIVE-ALLOWED; '; exception when others then out := out || 'settlelive:' || sqlerrm || '; '; end;
  perform agent_set_stage(p1,'under_offer',null,true);
  begin perform agent_set_stage(p1,'live',null,true); out := out || 'BACK-NOREASON-ALLOWED; '; exception when others then out := out || 'backnoreason:' || sqlerrm || '; '; end;
  begin perform agent_set_stage(p1,'live','  ',true); out := out || 'BACK-BLANK-ALLOWED; '; exception when others then out := out || 'backblank:' || sqlerrm || '; '; end;
  perform agent_set_stage(p1,'live','Offer fell through',true);
  select stage into st from properties where id=p1; out := out || 'afterback=' || st || '; ';
  perform agent_set_stage(p1,'under_offer',null,true); perform agent_set_stage(p1,'sold',null,true);
  perform agent_set_stage(p1,'settled',null,true);
  select stage into st from properties where id=p1; select status into ast from agreements where id=a1;
  out := out || 'settled stage=' || st || ' agreement=' || ast || '; ';
  begin perform agent_set_stage(p1,'live','again',true); out := out || 'MOVE-AFTER-SETTLED-ALLOWED; '; exception when others then out := out || 'finished:' || sqlerrm || '; '; end;
  select count(*) into n from property_events where property_id=p1; out := out || 'events=' || n || '; ';
  select string_agg(kind || ':' || (detail->>'from') || '>' || (detail->>'to') || coalesce('(' || (detail->>'reason') || ')',''), ', ' order by id) into st from property_events where property_id=p1; out := out || st || '; ';
  select count(*) into n from agreement_events where agreement_id=a1 and kind in ('stage_changed','stage_back','agency_ended'); out := out || 'agreement events=' || n || '; ';
  -- withdrawn path, and a signed-not-countersigned agreement
  insert into properties(address) values ('RB Test 2') returning id into p2;
  insert into agreements(address, property_id, status) values ('RB Test 2', p2, 'draft') returning id into a2;
  update agreements set status='countersigned' where id=a2;
  perform agent_set_stage(p2,'live',null,true); perform agent_set_stage(p2,'withdrawn','Vendors changed their minds',true);
  select stage into st from properties where id=p2; select status into ast from agreements where id=a2; out := out || 'withdrawn stage=' || st || ' agreement=' || ast || '; ';
  insert into properties(address) values ('RB Test 3') returning id into p3;
  insert into agreements(address, property_id, status) values ('RB Test 3', p3, 'draft') returning id into a3;
  update agreements set status='signed' where id=a3;
  begin perform agent_set_stage(p3,'live',null,true); out := out || 'UNCOUNTERSIGNED-ALLOWED; '; exception when others then out := out || 'notcounter:' || sqlerrm || '; '; end;
  -- events can't be changed
  begin update property_events set actor='x' where property_id=p1; out := out || 'EVENT-UPDATE-ALLOWED; '; exception when others then out := out || 'immutable:' || sqlerrm || '; '; end;
  -- reporting tables: agent can add and fix, not delete
  set local role authenticated;
  perform set_config('request.jwt.claims', agent, true);
  insert into campaign_stats(property_id, period_start, period_end, metrics) values (p1, '2026-11-01','2026-11-07','{"views":10}');
  insert into buyer_feedback(property_id, feedback) values (p1, 'Liked the kitchen');
  insert into property_offers(property_id, amount) values (p1, 900000);
  update property_offers set status='declined' where property_id=p1;
  select count(*) into n from property_offers; out := out || 'agent sees offers=' || n || '; ';
  begin delete from property_offers where property_id=p1; out := out || 'DELETE-ALLOWED; '; exception when others then out := out || 'nodelete:' || sqlerrm || '; '; end;
  select count(*) into n from property_events where property_id=p1; out := out || 'agent sees events=' || n || '; ';
  begin insert into property_events(property_id, actor, kind) values (p1,'x','y'); out := out || 'DIRECT-EVENT-INSERT-ALLOWED; '; exception when others then out := out || 'noinsert:' || sqlerrm || '; '; end;
  -- a vendor
  perform set_config('request.jwt.claims', vendor, true);
  begin perform agent_set_stage(p3,'live',null,true); out := out || 'VENDOR-SET-STAGE-ALLOWED; '; exception when others then out := out || 'vendor stage:' || sqlerrm || '; '; end;
  select count(*) into n from campaign_stats; out := out || 'vendor stats=' || n || '; ';
  select count(*) into n from buyer_feedback; out := out || 'vendor feedback=' || n || '; ';
  select count(*) into n from property_offers; out := out || 'vendor offers=' || n || '; ';
  select count(*) into n from property_events; out := out || 'vendor events=' || n || '; ';
  begin insert into property_offers(property_id, amount) values (p1, 1); out := out || 'VENDOR-INSERT-ALLOWED; '; exception when others then out := out || 'vendor insert:' || sqlerrm || '; '; end;
  update property_offers set amount=1; get diagnostics n = row_count; out := out || 'vendor updated rows=' || n || '; ';
  reset role;
  out := out || 'anon exec=' || has_function_privilege('anon','public.agent_set_stage(uuid,text,text,boolean)','execute') || '; ';
  out := out || 'anon table=' || has_table_privilege('anon','public.property_offers','select') || '; ';
  raise exception 'ROLLBACK %', out;
end
$t$;

-- Phase 5: after signing. Tim sets the stage of a property once its agreement is countersigned:
-- on the market (live), under offer, sold, settled or withdrawn.
-- Additive: one new table (property_events) and one new function (agent_set_stage). No existing function, trigger,
-- signed record, snapshot or fingerprint is changed. Settled and withdrawn end the agency through the existing
-- agent_end_agency(), so the AML retention and the agreement's own record of events are exactly as before.

-- A permanent, property-level record of stage changes (who, when, from, to, and the reason for going back).
-- Only the agent can read it; vendors cannot. Nobody writes to it directly: agent_set_stage does, and rows can't be
-- changed or removed afterwards.
create table public.property_events (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties(id),
  agreement_id uuid references public.agreements(id),
  at timestamptz not null default now(),
  actor text not null,
  kind text not null,
  detail jsonb not null default '{}'::jsonb
);
create index property_events_property_idx on public.property_events (property_id, at desc);
alter table public.property_events enable row level security;
create policy pe_agent_read on public.property_events for select using (public.is_agent());
create trigger property_events_immutable before update or delete on public.property_events for each row execute function public.no_change();
revoke all on public.property_events from anon;
revoke insert, update, delete, truncate on public.property_events from authenticated;

-- Where a property can go from here (Tim's rules):
--   forward:  signed -> live -> under_offer -> sold -> settled   (live, under_offer and sold may skip a step, but a
--             property goes on the market before anything else, and must be sold before it is settled)
--   back:     under_offer -> live, sold -> under_offer or live   (for example an offer falls through): needs a reason
--   ending:   withdrawn from signed, live, under_offer or sold; settled from sold. Both end the agency.
--   finished: settled and withdrawn properties don't move; they start again with agent_reopen_property.
-- Everything needs p_confirmed = true (the screen asks Tim first) and a governing agreement: the newest agreement in force
-- on the property that is countersigned. Stage events are logged against it. A newer agreement that is only signed doesn't
-- count. Settled and withdrawn finish the property, so they end every agreement in force on it, not only the governing one.
create or replace function public.agent_set_stage(pid uuid, p_stage text, p_reason text default null, p_confirmed boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pr public.properties;
  why text := nullif(trim(coalesce(p_reason, '')), '');
  who text := coalesce(auth.jwt()->>'email', 'agent');
  live_ids uuid[]; newest uuid; x uuid; cur int; nxt int; went_back boolean := false;
  rk constant text[] := array['signed','live','under_offer','sold'];
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if p_confirmed is not true then raise exception 'Please confirm the change first'; end if;
  if p_stage is null or p_stage not in ('live','under_offer','sold','settled','withdrawn') then raise exception 'That is not a stage you can set here'; end if;
  select * into pr from public.properties where id = pid for update;
  if not found then raise exception 'Property not found'; end if;
  if pr.stage in ('settled','withdrawn') then raise exception 'This property has finished. Start it again from an appraisal first'; end if;
  if pr.stage <> all (rk) then raise exception 'The agreement has to be signed and countersigned first'; end if;
  if pr.stage = p_stage then raise exception 'It is already at that stage'; end if;
  select array_agg(id order by created_at) into live_ids
    from public.agreements where property_id = pid and status not in ('ended','cancelled');
  if live_ids is null then raise exception 'There is no agreement in force on this property'; end if;
  select id into newest from public.agreements where id = any (live_ids) and status = 'countersigned' order by created_at desc, id limit 1;
  if newest is null then raise exception 'Countersign the agreement first'; end if;
  cur := array_position(rk, pr.stage);

  if p_stage in ('live','under_offer','sold') then
    nxt := array_position(rk, p_stage);
    if nxt < cur then
      went_back := true;
      if why is null or length(why) < 3 then raise exception 'Say why you are going back'; end if;
    elsif pr.stage = 'signed' and p_stage <> 'live' then
      raise exception 'Put it on the market first';
    end if;
    update public.properties set stage = p_stage, stage_at = now() where id = pid;
  elsif p_stage = 'settled' then
    if pr.stage <> 'sold' then raise exception 'Mark it sold before it is settled'; end if;
    foreach x in array live_ids loop perform public.agent_end_agency(x, 'Sold and settled'); end loop;
  else
    foreach x in array live_ids loop perform public.agent_end_agency(x, 'Withdrawn'); end loop;
  end if;

  insert into public.property_events (property_id, agreement_id, actor, kind, detail)
    values (pid, newest, who, case when went_back then 'stage_back' else 'stage_changed' end,
            jsonb_strip_nulls(jsonb_build_object('from', pr.stage, 'to', p_stage, 'reason', why)));
  perform public.log_event(newest, who, case when went_back then 'stage_back' else 'stage_changed' end,
            jsonb_strip_nulls(jsonb_build_object('from', pr.stage, 'to', p_stage, 'reason', why)));
  return jsonb_build_object('from', pr.stage, 'to', p_stage, 'agreement_id', newest);
end $$;
revoke execute on function public.agent_set_stage(uuid, text, text, boolean) from public, anon;
grant execute on function public.agent_set_stage(uuid, text, text, boolean) to authenticated;

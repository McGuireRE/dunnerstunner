-- Tim, 6 November 2026: signing in person on Tim's device is held to the same check as a vendor signing on their
-- own device (migration 006): every guide section read (0 to 7) and every acknowledgement ticked (0 to 10), so every
-- signed agreement records the guides the same way. Everything else in agent_sign_in_person is unchanged.

create or replace function public.agent_sign_in_person(a uuid, pid uuid, p_image_path text, p_snapshot jsonb, p_user_agent text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare pr public.agreement_people; ag public.agreements; remaining int; dl timestamptz; k text;
begin
  if not public.is_agent() then raise exception 'Not allowed'; end if;
  select * into ag from public.agreements where id = a;
  if ag.id is null or ag.status not in ('draft','sent') then raise exception 'This agreement can no longer be signed'; end if;
  if coalesce(ag.legal->>'choice','') not in ('have','waive') then raise exception 'Legal advice question not answered'; end if;
  if jsonb_typeof(ag.answers->'guide') is distinct from 'array' or jsonb_typeof(ag.answers->'acks') is distinct from 'array' then
    raise exception 'Tick each section of the plain-English guide once you''ve been through it together';
  end if;
  for k in select generate_series(0, 7)::text loop
    if not (ag.answers->'guide') ? k then raise exception 'Tick each section of the plain-English guide once you''ve been through it together'; end if;
  end loop;
  for k in select generate_series(0, 10)::text loop
    if not (ag.answers->'acks') ? k then raise exception 'Tick each item under "Before signing" first'; end if;
  end loop;
  select * into pr from public.agreement_people where id = pid and agreement_id = a;
  if pr.id is null or coalesce(pr.legal_name,'') = '' then raise exception 'Signer not found'; end if;
  if pr.signed_at is not null then raise exception 'Already signed'; end if;
  if p_image_path not like 'agreements/' || a::text || '/signatures/%' then raise exception 'Bad signature path'; end if;
  update public.agreements set status = 'sent', sent_at = coalesce(sent_at, now()) where id = a and status = 'draft';
  insert into public.signatures (agreement_id, person_id, signer_role, signer_name, image_path, snapshot, snapshot_sha256, user_agent)
  values (a, pr.id, 'client', pr.legal_name, p_image_path, p_snapshot || jsonb_build_object('signing_method', 'In person, on the licensee''s device', 'witnessed_by', 'Timothy McGuire'), encode(digest((p_snapshot || jsonb_build_object('signing_method', 'In person, on the licensee''s device', 'witnessed_by', 'Timothy McGuire'))::text, 'sha256'),'hex'), p_user_agent);
  update public.agreement_people set signed_at = now() where id = pr.id;
  perform public.log_event(a, coalesce(auth.jwt()->>'email','agent'), 'signed', jsonb_build_object('name', pr.legal_name, 'method', 'in person on licensee device'));
  select count(*) into remaining from public.agreement_people where agreement_id = a and signed_at is null and legal_name <> '';
  if remaining = 0 then
    dl := public.cooling_off_deadline(now(), coalesce((ag.config->>'approach') = 'unsolicited', false));
    update public.agreements set status = 'signed', signed_at = now(), cooling_off_until = dl where id = a;
    perform public.log_event(a, 'system', 'all_signed', jsonb_build_object('cooling_off_until', dl));
  end if;
  return jsonb_build_object('remaining', remaining, 'cooling_off_until', dl);
end $function$;

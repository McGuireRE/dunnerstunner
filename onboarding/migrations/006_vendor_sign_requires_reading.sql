-- Phase 3 review (6 November 2026): the server now refuses a vendor's signature unless the agreement's saved
-- answers show every section of the guide read (8) and every acknowledgement ticked (11), including the REA guides.
-- Before, only the legal advice answer was checked, so a page that skipped ahead could produce a signed agreement
-- with no record of the guides. Everything else in vendor_sign is unchanged.

create or replace function public.vendor_sign(a uuid, p_image_path text, p_snapshot jsonb, p_user_agent text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare me public.agreement_people; ag public.agreements; remaining int; dl timestamptz; k text;
begin
  perform public.require_open(a);
  select * into ag from public.agreements where id = a;
  if coalesce(ag.legal->>'choice','') not in ('have','waive') then raise exception 'Legal advice question not answered'; end if;
  if jsonb_typeof(ag.answers->'guide') is distinct from 'array' or jsonb_typeof(ag.answers->'acks') is distinct from 'array' then
    raise exception 'Please go through each part of the agreement before signing';
  end if;
  for k in select generate_series(0, 7)::text loop
    if not (ag.answers->'guide') ? k then raise exception 'Please go through each part of the agreement before signing'; end if;
  end loop;
  for k in select generate_series(0, 10)::text loop
    if not (ag.answers->'acks') ? k then raise exception 'Please tick each item on the Before you sign page first'; end if;
  end loop;
  select * into me from public.agreement_people where agreement_id = a and user_id = auth.uid() limit 1;
  if me.id is null then raise exception 'Signer not found'; end if;
  if me.signed_at is not null then raise exception 'Already signed'; end if;
  insert into public.signatures (agreement_id, person_id, signer_role, signer_name, image_path, snapshot, snapshot_sha256, user_agent)
  values (a, me.id, 'client', me.legal_name, p_image_path, p_snapshot, encode(digest(p_snapshot::text, 'sha256'),'hex'), p_user_agent);
  update public.agreement_people set signed_at = now() where id = me.id;
  perform public.log_event(a, coalesce(auth.jwt()->>'email','vendor'), 'signed', jsonb_build_object('name', me.legal_name));
  select count(*) into remaining from public.agreement_people where agreement_id = a and signed_at is null and legal_name <> '';
  if remaining = 0 then
    dl := public.cooling_off_deadline(now(), coalesce((ag.config->>'approach') = 'unsolicited', false));
    update public.agreements set status = 'signed', signed_at = now(), cooling_off_until = dl where id = a;
    perform public.log_event(a, 'system', 'all_signed', jsonb_build_object('cooling_off_until', dl));
  end if;
  return jsonb_build_object('remaining', remaining, 'cooling_off_until', dl);
end $function$;

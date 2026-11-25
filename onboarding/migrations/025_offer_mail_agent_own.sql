-- Offers fixes 2, item 5 (Tim's live link test, 25 November 2026): the privacy check on email drafts refused Tim's own sign-off.
-- offer_mail_side_hit (024) refuses a draft that holds the other side's own phone or email. Where Tim sells a property for himself he is
-- the vendor, so his own mobile in every email's sign-off (src/mail-core.js, TIM_PHONE) matched "a vendor's own phone"; and the other way
-- round, on a property Tim buys. Tim's own contact details are never a party's private details. Additive only: 024 is not edited.
--   offer_settings.agent_phone, agent_email   the phone and email Tim's emails carry (one place in the database; the defaults are the
--                                             values src/mail-core.js TIM_PHONE and fn/shared.ts TIM_EMAIL use, and a test keeps them equal)
--   offer_agent_own()                          the agent's own emails (every row in agents, and agent_email) and phone (as its national
--                                             significant number, compared as offer_nsn does)
--   offer_mail_side_hit                        as 024, except that a party email or phone equal to the agent's own is skipped. Everything
--                                             else is identical: a real vendor's (or purchaser's) own phone or email is still refused.
-- Nothing here touches agreements, signatures, signed records or their triggers.

alter table public.offer_settings add column if not exists agent_phone text not null default '027 562 7207' check (length(agent_phone) between 6 and 40);
alter table public.offer_settings add column if not exists agent_email text not null default 'hello@timmcguire.co.nz' check (length(agent_email) between 5 and 254 and position('@' in agent_email) > 1);

create or replace function public.offer_agent_own() returns table (emails text[], nsn text) language sql stable security definer set search_path = public as $$
  select (select coalesce(array_agg(distinct e), '{}') from (select lower(trim(a.email)) e from public.agents a union all select lower(trim(s.agent_email)) from public.offer_settings s) z where coalesce(e, '') <> ''),
         (select public.offer_nsn(s.agent_phone) from public.offer_settings s limit 1) $$;

create or replace function public.offer_mail_side_hit(p_offer uuid, p_forbid text, p_text text) returns text language plpgsql stable security definer set search_path = public as $$
declare o public.property_offers; t text := lower(public.offer_plain(p_text)); runs text[]; r record; v text; law text; own_e text[]; own_p text;
begin
  select * into o from public.property_offers where id = p_offer; if o.id is null or t = '' then return null; end if;
  select coalesce(array_agg(public.offer_nsn(m[1])), '{}') into runs from regexp_matches(t, '([+(]?\d[\d\s().\/_\-]{4,}\d)', 'g') m;
  law := lower(coalesce(o.details->'lawyer'->>'email', ''));
  -- the agent's own contact details (025): never a party's private details, even where the agent is the party
  select a.emails, a.nsn into own_e, own_p from public.offer_agent_own() a;
  for r in
    select 'a purchaser' who, o.details->>'email' email, o.details->>'phone' phone where p_forbid = 'purchaser'
    union all select 'a purchaser', q->>'email', q->>'phone' from jsonb_array_elements(coalesce(o.details->'purchasers', '[]'::jsonb)) q where p_forbid = 'purchaser'
    union all select 'a vendor', pp.email, pp.phone from public.property_people pp where pp.property_id = o.property_id and p_forbid = 'vendor'
    union all select 'a vendor', ap.email, ap.phone from public.agreement_people ap join public.agreements a on a.id = ap.agreement_id where a.property_id = o.property_id and p_forbid = 'vendor'
    union all select 'a vendor', s.email, null from public.offer_signers s join public.offer_signings g on g.id = s.signing_id where g.offer_id = p_offer and g.side = 'vendor' and p_forbid = 'vendor'
  loop
    v := lower(public.offer_plain(trim(coalesce(r.email, ''))));
    if length(v) >= 5 and position('@' in v) > 0 and v <> law and not (v = any(coalesce(own_e, '{}'))) and position(v in t) > 0 then return r.who; end if;
    v := public.offer_nsn(public.offer_plain(r.phone));
    if length(v) >= 7 and v is distinct from own_p and exists (select 1 from unnest(runs) x where length(x) >= 6 and position(v in x) > 0) then return r.who; end if;
  end loop;
  return null;
end $$;

revoke execute on function public.offer_agent_own(), public.offer_mail_side_hit(uuid, text, text) from public, anon, authenticated;

-- Offers fixes 2, item 6 (Tim: "it is most important that I get an email once the document is finalised"): what the offer-sign function
-- needs to email Tim himself the locked, dated agreed copy as soon as he confirms the agreement, and again when he asks. Read only;
-- service role only. Never used for an email to a party. The parties' own contact details are not in it.
create or replace function public.offer_agreed_notice_material(p_offer uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('offer_id', o.id, 'property_id', o.property_id, 'address', p.address, 'province', coalesce(o.province, (select l.province from public.offer_links l where l.property_id = o.property_id), 'otago'),
    'kiwisaver', coalesce((a.terms->>'kiwisaver')::boolean, false) or coalesce((o.details->>'kiwisaver')::boolean, false),
    'agreement', jsonb_build_object('id', a.id, 'agreement_date', a.agreement_date, 'date_text', a.date_text, 'sha256', a.sha256, 'path', a.path, 'size_bytes', a.size_bytes, 'accepted_at', a.accepted_at, 'terms', a.terms),
    'price_place', (select x from public.offer_drafts d, jsonb_array_elements(d.placed) x where d.id = doc.draft_id and x->>'id' = 'price' limit 1),
    'layers', public.offer_doc_layers(a.document_id, r.doc_round),
    'deposit_holder', (select jsonb_build_object('holder', h.holder, 'other', h.other_text, 'by_default', h.by_default) from public.offer_deposit_holders h where h.offer_id = o.id order by h.id desc limit 1))
  from public.offer_agreements a join public.property_offers o on o.id = a.offer_id join public.properties p on p.id = o.property_id
    join public.offer_documents doc on doc.id = a.document_id join public.offer_rounds r on r.id = a.round_id
  where a.offer_id = p_offer $$;
revoke execute on function public.offer_agreed_notice_material(uuid) from public, anon, authenticated;
grant execute on function public.offer_agreed_notice_material(uuid) to service_role;

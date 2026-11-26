-- LW0 backfill preview (for Tim, before 028 is applied). Run against a COPY of the live records with 028 applied (never the live project):
-- load the live rows into the local stand-in (tests/lw0-standin.sql), keep _before (properties: id, description, title_ref,
-- legal_description) and _signed_before (signed agreement_people: id, contact_id, legal_name, email), apply 028, then run this with psql.
-- Output: each name in each list and what it becomes; each property's facts with their source and any value shown beside them;
-- and that no property file and no signed person changed. The result goes to tests/out/lw0-backfill-preview.txt (not committed).
\pset format unaligned
\pset tuples_only on
with src as (
  select l.*, coalesce(p.address, '(no property)') as address,
    case l.source when 'property_people' then 'property''s people' when 'agreement_people' then 'agency agreement' when 'prelisting' then 'questions before we meet'
      when 'offer_signer' then 'offer signer' when 'lawyer_link' then 'lawyer' when 'ql_listing' then 'Quiet List listing' when 'ql_seller_lead' then 'Quiet List seller form' end as where_from,
    case l.source when 'property_people' then (select legal_name from public.property_people where id = l.source_id)
      when 'agreement_people' then (select legal_name || case when signed_at is not null then ' (signed)' else '' end from public.agreement_people where id = l.source_id)
      when 'prelisting' then (select contact_name from public.prelistings where id = l.source_id)
      when 'offer_signer' then (select name from public.offer_signers where id = l.source_id)
      when 'lawyer_link' then (select lawyer_name || coalesce(' (' || nullif(firm, '') || ')', '') from public.lawyer_links where id = l.source_id) end as given_name,
    case l.source when 'property_people' then (select email from public.property_people where id = l.source_id)
      when 'agreement_people' then (select email from public.agreement_people where id = l.source_id)
      when 'prelisting' then (select contact_email from public.prelistings where id = l.source_id)
      when 'offer_signer' then (select email from public.offer_signers where id = l.source_id)
      when 'lawyer_link' then (select email from public.lawyer_links where id = l.source_id) end as given_email
  from public.person_links l left join public.properties p on p.id = l.property_id),
firsts as (select contact_id, min(created_at) as first_at from public.person_links group by contact_id)
select address || E'\n' || string_agg('  - ' || where_from || ': ' || coalesce(nullif(given_name, ''), '(no name)') || ', ' || coalesce(nullif(given_email, ''), 'no email') || E'\n      becomes: '
  || case when s.doubt is not null and s.matched_by = 'new' then 'a new person, KEPT APART AND FLAGGED for you: ' || s.doubt
          when s.doubt is not null then 'joined to ' || c.display_name || ', FLAGGED for you: ' || s.doubt
          when s.matched_by = 'new' then 'a new person (' || c.display_name || ')'
          else 'joined to ' || c.display_name || ' (' || case s.matched_by when 'email' then 'same email, the name fits' when 'name' then 'same name on this property' when 'record' then 'the person already on the property' else s.matched_by end || ')' end
  || coalesce('; role: ' || s.role, ''), E'\n' order by s.source, s.created_at)
from src s join public.crm_contacts c on c.id = s.contact_id
group by address order by address;
select p.address || E'\n' || coalesce(string_agg('  - ' || (x->>'label') || ': '
  || coalesce((x->>'display'), (x->'value' #>> '{}'), 'nothing chosen') || coalesce(' (' || case x->>'source' when 'tim' then coalesce(x->>'source_name', 'Tim') when 'council' then 'council records' when 'inspection' then 'disclosures check' when 'agreement' then 'agency agreement' when 'quiet_list' then 'Quiet List' else x->>'source' end || ')', '')
  || case when (x->>'ticked')::boolean then ', ticked' else '' end
  || coalesce(E'\n      also: ' || (select string_agg(coalesce(o->>'display', o->'value' #>> '{}') || ' (' || case o->>'source' when 'tim' then 'property file' when 'council' then 'council records' when 'inspection' then 'disclosures check' when 'agreement' then 'agency agreement' else o->>'source' end || ')', '; ') from jsonb_array_elements(x->'others') o), ''),
  E'\n' order by (x->>'position')::int, x->>'key'), '  (no facts)')
from public.properties p left join lateral jsonb_array_elements(public.profile_read(p.id, false)) x on true
group by p.id, p.address order by p.address;
select 'Property files changed by the backfill: ' || count(*) from public.properties p join public._before b on b.id = p.id
 where p.description is distinct from b.description or p.title_ref is distinct from b.title_ref or p.legal_description is distinct from b.legal_description;
select 'Signed agreement people changed: ' || count(*) from public.agreement_people a join public._signed_before b on b.id = a.id
 where a.contact_id is distinct from b.contact_id or a.legal_name is distinct from b.legal_name or a.email is distinct from b.email;
select 'Problems logged: ' || count(*) || coalesce(' (' || string_agg(what || ': ' || (detail->>'error'), '; ') || ')', '') from public.shared_record_log;

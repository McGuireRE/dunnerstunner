-- 030 Agreed emails filled in (Tim, 26 November 2026)
-- The emails to the purchasers and the vendors after an offer is agreed now fill every contact detail from the records that hold it,
-- with each lawyer as the agreed contract's contact page has them (src/mail-core.js agreedDrafts, src/app.js mlAgreedContacts). The
-- purchasers' email is cc'd to their lawyer's email as it is on that page. 024 let the vendors' email go to the vendors' lawyer on the
-- agreed draft (vl_email, vl_service), but the purchasers' email only to the lawyer email on the offer itself, so a lawyer email Tim
-- corrected on the draft would be refused. This adds the purchasers' lawyer on the agreed draft (pl_email, pl_service), the same way.
--   offer_mail_allowed   as 024 (and as live, checked by fingerprint 26 November 2026), except the agreed_purchasers branch, which
--                        also allows the agreed draft's pl_email and pl_service. Nothing is taken away; every other branch is unchanged.
-- Additive: no table, column, trigger or signed record is touched. The privacy guard (offer_mail_side_hit) is unchanged.
create or replace function public.offer_mail_allowed(p_offer uuid, p_kind text, p_signer uuid) returns text[] language plpgsql stable security definer set search_path = public as $$
declare o public.property_offers; out_ text[] := '{}'; ag public.offer_agreements; side text;
begin
  select * into o from public.property_offers where id = p_offer; if o.id is null then return out_; end if;
  if p_kind in ('sign_link', 'reopened') then
    select coalesce(array_agg(lower(trim(s.email))), '{}') into out_ from public.offer_signers s join public.offer_signings g on g.id = s.signing_id where s.id = p_signer and g.offer_id = p_offer and coalesce(s.email, '') <> '';
  elsif p_kind = 'agreed_purchasers' then
    select * into ag from public.offer_agreements where offer_id = p_offer;
    select coalesce(array_agg(lower(trim(e))), '{}') into out_ from (select o.details->>'email' e union all select q->>'email' from jsonb_array_elements(coalesce(o.details->'purchasers', '[]'::jsonb)) q
      union all select o.details->'lawyer'->>'email'
      -- 030: the purchasers' lawyer as the agreed draft's contact page has them (their email, and the email for service of notices)
      union all select x->>'text' from public.offer_documents doc join public.offer_drafts d on d.id = doc.draft_id, jsonb_array_elements(d.placed) x where doc.id = ag.document_id and x->>'id' in ('pl_email', 'pl_service') and position('@' in coalesce(x->>'text', '')) > 1) z where coalesce(trim(e), '') <> '';
  elsif p_kind = 'agreed_vendors' then
    select * into ag from public.offer_agreements where offer_id = p_offer;
    select coalesce(array_agg(lower(trim(e))), '{}') into out_ from (
      -- the vendors who signed this negotiation (not everyone ever on the property's agreements), and the vendors' lawyer: on the agreed
      -- draft, or the lawyer link of the agency agreement in force (the newest signed one)
      select s.email e from public.offer_signers s join public.offer_signings g on g.id = s.signing_id where g.offer_id = p_offer and g.side = 'vendor' and s.void_at is null
      union all select ll.email from public.lawyer_links ll where ll.agreement_id = (select a.id from public.agreements a where a.property_id = o.property_id and a.status in ('signed', 'countersigned') order by a.created_at desc limit 1)
      union all select x->>'text' from public.offer_documents doc join public.offer_drafts d on d.id = doc.draft_id, jsonb_array_elements(d.placed) x where doc.id = ag.document_id and x->>'id' in ('vl_email', 'vl_service')) z
      where coalesce(trim(e), '') <> '' and position('@' in e) > 1;
  elsif p_kind in ('withdraw_party', 'withdraw_lawyer') then
    -- after Tim records a withdrawal: to the side that directed it (them and their own lawyer), or to the other side's lawyer alone
    side := public.offer_mail_wd_side(p_offer); if side is null then return out_; end if;
    if p_kind = 'withdraw_lawyer' then side := case when side = 'vendor' then 'purchaser' else 'vendor' end; end if;
    if side = 'purchaser' then
      select coalesce(array_agg(lower(trim(e))), '{}') into out_ from (select o.details->>'email' e where p_kind = 'withdraw_party' union all select q->>'email' from jsonb_array_elements(coalesce(o.details->'purchasers', '[]'::jsonb)) q where p_kind = 'withdraw_party'
        union all select o.details->'lawyer'->>'email') z where coalesce(trim(e), '') <> '' and position('@' in e) > 1;
    else
      select coalesce(array_agg(lower(trim(e))), '{}') into out_ from (
        select s.email e from public.offer_signers s join public.offer_signings g on g.id = s.signing_id where g.offer_id = p_offer and g.side = 'vendor' and p_kind = 'withdraw_party'   -- a withdrawal stops (voids) their places; they are still the vendors
        union all select pp.email from public.property_people pp where pp.property_id = o.property_id and pp.role = 'owner' and p_kind = 'withdraw_party'   -- the owners on the property file (never a contact or former owner)
        union all select ll.email from public.lawyer_links ll where ll.agreement_id = (select a.id from public.agreements a where a.property_id = o.property_id and a.status in ('signed', 'countersigned') order by a.created_at desc limit 1)
        union all select x->>'text' from public.offer_drafts d, jsonb_array_elements(d.placed) x where d.id = (select d2.id from public.offer_drafts d2 where d2.offer_id = p_offer order by d2.number desc limit 1) and x->>'id' in ('vl_email', 'vl_service')) z
        where coalesce(trim(e), '') <> '' and position('@' in e) > 1;
    end if;
  end if;
  return out_;
end $$;

revoke execute on function public.offer_mail_allowed(uuid, text, uuid) from public, anon, authenticated;

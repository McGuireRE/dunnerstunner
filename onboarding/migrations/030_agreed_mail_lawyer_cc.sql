-- 030 Agreed emails filled in (Tim, 26 November 2026)
-- The emails to the purchasers and the vendors after an offer is agreed now fill every contact detail from the records that hold it,
-- with each lawyer as the agreed contract's contact page has them (src/mail-core.js agreedDrafts, src/app.js mlAgreedContacts). The
-- purchasers' email is cc'd to their lawyer's email as it is on that page. 024 let the vendors' email go to the vendors' lawyer on the
-- agreed draft (vl_email, vl_service), but the purchasers' email only to the lawyer email on the offer itself, so a lawyer email Tim
-- corrected on the draft would be refused. This adds the purchasers' lawyer on the agreed draft (pl_email, pl_service), the same way.
--   offer_mail_allowed   as 024 (and as live, checked by fingerprint 26 November 2026), except the agreed_purchasers branch, which
--                        also allows the agreed draft's pl_email and pl_service, unless one is a vendor's own address. After review:
--                        the mirror on the vendors' side, a vendors' lawyer address (on the agreed draft, or the agency agreement's
--                        lawyer link) that is a purchaser's own is no longer allowed. The parties' own addresses and every other
--                        branch are unchanged.
--   offer_vendor_own_emails, offer_purchaser_own_emails (internal): each side's own addresses, as offer_mail_side_hit (024/025) reads
--                        them: Tim's own (offer_agent_own) are never a party's; the purchasers' lawyer's email on the offer isn't theirs.
-- Part 2 (Tim, 26 November 2026): the vendors' lawyer's phone, recorded where the lawyer is recorded on the agency agreement, so the
-- agreed emails (and the drafted contract's contact page) can use it.
--   lawyer_links.phone   new column, optional, the same check as the offer form's phones (offer_phone_ok, 018). Existing rows: null.
--   vendor_send_to_lawyer, vendor_forward_to_lawyer, agent_send_to_lawyer: a five-argument version of each (l_phone), beside the
--                        four-argument one, which is kept word for word (the live bodies, read 26 November 2026). Each new body is the
--                        old one with the phone checked, stored and logged. A call without l_phone still runs the old function, so
--                        nothing is ambiguous and the page works before and after this is applied. Same privileges as the old ones.
--                        Tim's own "Forward to a lawyer" on the agreement page inserts the row itself (his policy on lawyer_links).
-- Additive: one new nullable column and five new functions. No column, table or function is removed; no trigger or signed record
-- is touched. The privacy guard (offer_mail_side_hit) is unchanged.
create or replace function public.offer_vendor_own_emails(p_offer uuid) returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct lower(trim(e))), '{}') from public.property_offers o, lateral (
    select pp.email e from public.property_people pp where pp.property_id = o.property_id
    union all select ap.email from public.agreement_people ap join public.agreements a on a.id = ap.agreement_id where a.property_id = o.property_id
    union all select s.email from public.offer_signers s join public.offer_signings g on g.id = s.signing_id where g.offer_id = o.id and g.side = 'vendor') z
  where o.id = p_offer and coalesce(trim(e), '') <> '' and not (lower(trim(e)) = any(coalesce((select a.emails from public.offer_agent_own() a), '{}'))) $$;
create or replace function public.offer_purchaser_own_emails(p_offer uuid) returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct lower(trim(e))), '{}') from public.property_offers o, lateral (
    select o.details->>'email' e union all select q->>'email' from jsonb_array_elements(coalesce(o.details->'purchasers', '[]'::jsonb)) q) z
  where o.id = p_offer and coalesce(trim(e), '') <> '' and lower(trim(e)) <> lower(coalesce(trim(o.details->'lawyer'->>'email'), ''))
    and not (lower(trim(e)) = any(coalesce((select a.emails from public.offer_agent_own() a), '{}'))) $$;

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
      union all select x->>'text' from public.offer_documents doc join public.offer_drafts d on d.id = doc.draft_id, jsonb_array_elements(d.placed) x where doc.id = ag.document_id and x->>'id' in ('pl_email', 'pl_service') and position('@' in coalesce(x->>'text', '')) > 1
        and not (lower(trim(x->>'text')) = any(public.offer_vendor_own_emails(p_offer)))) z where coalesce(trim(e), '') <> '';
  elsif p_kind = 'agreed_vendors' then
    select * into ag from public.offer_agreements where offer_id = p_offer;
    select coalesce(array_agg(lower(trim(e))), '{}') into out_ from (
      -- the vendors who signed this negotiation (not everyone ever on the property's agreements), and the vendors' lawyer: on the agreed
      -- draft, or the lawyer link of the agency agreement in force (the newest signed one)
      select s.email e from public.offer_signers s join public.offer_signings g on g.id = s.signing_id where g.offer_id = p_offer and g.side = 'vendor' and s.void_at is null
      -- 030 after review: the vendors' lawyer's address is never a purchaser's own
      union all select ll.email from public.lawyer_links ll where ll.agreement_id = (select a.id from public.agreements a where a.property_id = o.property_id and a.status in ('signed', 'countersigned') order by a.created_at desc limit 1)
        and not (lower(trim(coalesce(ll.email, ''))) = any(public.offer_purchaser_own_emails(p_offer)))
      union all select x->>'text' from public.offer_documents doc join public.offer_drafts d on d.id = doc.draft_id, jsonb_array_elements(d.placed) x where doc.id = ag.document_id and x->>'id' in ('vl_email', 'vl_service')
        and not (lower(trim(coalesce(x->>'text', ''))) = any(public.offer_purchaser_own_emails(p_offer)))) z
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

revoke execute on function public.offer_mail_allowed(uuid, text, uuid), public.offer_vendor_own_emails(uuid), public.offer_purchaser_own_emails(uuid) from public, anon, authenticated;

-- ═══════════════ Part 2: the vendors' lawyer's phone ═══════════════
alter table public.lawyer_links add column if not exists phone text;
alter table public.lawyer_links add constraint lawyer_links_phone_check check (phone is null or phone ~ '^[0-9+()\-. ]{6,40}$');

create function public.vendor_send_to_lawyer(a uuid, l_name text, l_firm text, l_email text, l_phone text) returns uuid language plpgsql security definer set search_path = public as $$
declare lid uuid; who text; ph text := nullif(trim(coalesce(l_phone, '')), '');
begin
  perform public.require_open(a);
  if not public.offer_phone_ok(ph) then raise exception 'That phone number doesn''t look right'; end if;
  select coalesce(nullif(legal_name,''), email) into who from public.agreement_people where agreement_id = a and user_id = auth.uid() limit 1;
  insert into public.lawyer_links (agreement_id, lawyer_name, firm, email, phone, sent_by) values (a, l_name, coalesce(l_firm,''), l_email, ph, who) returning id into lid;
  update public.agreements set status = 'parked', legal = legal || jsonb_build_object('status','sent','lawyer',l_name,'firm',l_firm,'sent_at',now()) where id = a;
  perform public.log_event(a, coalesce(auth.jwt()->>'email','vendor'), 'sent_to_lawyer', jsonb_build_object('lawyer', l_name, 'firm', l_firm, 'email', l_email, 'phone', ph));
  return lid;
end $$;

create function public.vendor_forward_to_lawyer(a uuid, l_name text, l_firm text, l_email text, l_phone text) returns uuid language plpgsql security definer set search_path = public as $$
declare lid uuid; who text; ph text := nullif(trim(coalesce(l_phone, '')), '');
begin
  if not public.is_party(a) then raise exception 'Not your agreement'; end if;
  if not exists (select 1 from public.agreements where id = a and status in ('signed','countersigned','ended')) then
    raise exception 'The agreement has not been signed yet';
  end if;
  if coalesce(trim(l_name),'') = '' or l_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Add the lawyer''s name and a valid email'; end if;
  if not public.offer_phone_ok(ph) then raise exception 'That phone number doesn''t look right'; end if;
  select coalesce(nullif(legal_name,''), email) into who from public.agreement_people where agreement_id = a and user_id = auth.uid() limit 1;
  insert into public.lawyer_links (agreement_id, lawyer_name, firm, email, phone, sent_by, expires_at)
  values (a, l_name, coalesce(l_firm,''), l_email, ph, who, now() + interval '90 days') returning id into lid;
  perform public.log_event(a, coalesce(auth.jwt()->>'email','vendor'), 'forwarded_to_lawyer', jsonb_build_object('lawyer', l_name, 'firm', l_firm, 'email', l_email, 'phone', ph, 'by', who));
  return lid;
end $$;

create function public.agent_send_to_lawyer(a uuid, l_name text, l_firm text, l_email text, l_phone text) returns uuid language plpgsql security definer set search_path = public as $$
declare lid uuid; who text; ph text := nullif(trim(coalesce(l_phone, '')), '');
begin
  if not public.is_agent() then raise exception 'Not allowed'; end if;
  if not public.offer_phone_ok(ph) then raise exception 'That phone number doesn''t look right'; end if;
  select string_agg(coalesce(nullif(pref_name,''), split_part(legal_name,' ',1)), ' and ') into who from public.agreement_people where agreement_id = a and legal_name <> '';
  insert into public.lawyer_links (agreement_id, lawyer_name, firm, email, phone, sent_by) values (a, l_name, coalesce(l_firm,''), l_email, ph, coalesce(who, 'Your client')) returning id into lid;
  update public.agreements set status = 'parked', sent_at = coalesce(sent_at, now()), legal = legal || jsonb_build_object('status','sent','lawyer',l_name,'firm',l_firm,'sent_at',now()) where id = a and status in ('draft','sent','parked');
  perform public.log_event(a, coalesce(auth.jwt()->>'email','agent'), 'sent_to_lawyer', jsonb_build_object('lawyer', l_name, 'firm', l_firm, 'email', l_email, 'phone', ph, 'recorded', 'at appointment'));
  return lid;
end $$;

-- the same privileges as the four-argument versions: signed-in users and the service role, never anon
revoke execute on function public.vendor_send_to_lawyer(uuid, text, text, text, text), public.vendor_forward_to_lawyer(uuid, text, text, text, text), public.agent_send_to_lawyer(uuid, text, text, text, text) from public, anon;
grant execute on function public.vendor_send_to_lawyer(uuid, text, text, text, text), public.vendor_forward_to_lawyer(uuid, text, text, text, text), public.agent_send_to_lawyer(uuid, text, text, text, text) to authenticated, service_role;

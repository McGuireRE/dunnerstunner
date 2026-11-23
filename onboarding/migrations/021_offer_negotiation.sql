-- Offers phase 4: presentation and counteroffers. Additive only. Builds on 018 (offers, events, offer_agent, guard_offer_truncate),
-- 019 (drafts, offer_file_hashes, offer_file_confirm, guard_offer_record, repo_object) and 020 (signings, signers, taps, receipts,
-- marks, reviews, rounds, the hash chain). Nothing here touches agreements, signatures, signed records or their triggers.
--
-- How a negotiation is held (Tim, 24 November 2026): Round 1 is the purchasers' signed offer (phase 3). Nothing reaches the vendors
-- until Tim has looked at it and taps "Present" (agent_round_present); every trip back needs his tap too. The side presented to
-- accepts or counters on the same signing screens as phase 3 (in person on Tim's device, or by a personal link and an emailed code).
-- A counter is made with changes on top of the document: a line through text, a crossed-out box, typed words, a freehand note or a
-- reinstatement (offer_sign_marks, kind 'insert' added). Each change carries the initials of everyone on the countering side (the
-- places come with it, kept in offer_sign_reviews like phase 3's re-approved marks, so offer_sign_required, tapping and finishing work
-- as they do). Where a change is made, the other side's initials or signature are lifted from the working copy (worked out by the
-- negotiation core from the shapes, src/nego-core.js, the same in the browser and the edge function); every earlier locked round still
-- shows them. When everyone on that side has initialled every change and signed, the round is locked (offer_round_lock, now for any
-- round) as Round 2, 3 and so on, each with its execution record and fingerprint. The REINZ content is never altered.
--
-- What it adds:
--   * offer_documents: a negotiation "document" per offer: the approved draft it is built on, open, closed (a fresh copy was started:
--     filed as negotiation history, every round kept) or agreed. One open document per offer. Made when its Round 1 locks.
--   * offer_signings gain round_no (the round within the document), side (purchaser or vendor), document_id and base_round_id (the
--     locked round it answers). One live signing per draft and round (was: per draft).
--   * offer_signers gain person_id (a vendor's property_people row; their own email is used for the link and code only, never printed).
--   * offer_rounds gain document_id, doc_round, side, base_round_id, changes (how many), lifted and outstanding (from the core, when the
--     round is made). Their overall number keeps counting across documents, so it stays unique per offer.
--   * offer_agreements: the agreed agreement: the final copy with the date Tim typed at the top (the only time the date is added, as an
--     overlay), the time acceptance was communicated, the agreement date, and its fingerprint. Never changed or removed.
--   * offer_sign_receipts may hold 'chattels' (the vendors' reminder that every chattel must be in full working order at settlement).
--   * Withdrawal: agent_offer_status (018) and the new agent_negotiation_withdraw stop every signing in progress; open links stop working.
-- Vendors have no policy on any of these tables and no agent function. Their only door is a link Tim sends (or Tim's own device),
-- through the offer-sign edge function and the token-checked offer_sign_* functions, for one offer, after Tim authorises it.

-- ───── tables and columns ─────
create table public.offer_documents (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.property_offers(id),
  property_id uuid not null references public.properties(id),
  number integer not null check (number >= 1),
  draft_id uuid not null references public.offer_drafts(id),
  draft_sha256 text not null check (draft_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'open' check (status in ('open', 'closed', 'agreed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz, closed_by text, close_reason text check (close_reason is null or length(close_reason) between 3 and 500),
  agreed_at timestamptz,
  unique (offer_id, number),
  unique (draft_id)
);
create unique index offer_documents_open on public.offer_documents (offer_id) where status = 'open';
alter table public.offer_signings add column round_no integer not null default 1 check (round_no >= 1), add column side text not null default 'purchaser' check (side in ('purchaser', 'vendor')),
  add column document_id uuid references public.offer_documents(id), add column base_round_id uuid references public.offer_rounds(id);
alter table public.offer_signings add constraint offer_signings_round_doc check ((round_no = 1 and document_id is null and base_round_id is null and side = 'purchaser') or (round_no > 1 and document_id is not null and base_round_id is not null));
drop index public.offer_signings_draft_live;   -- one live signing per draft and round (round 1 as before)
create unique index offer_signings_draft_round_live on public.offer_signings (draft_id, round_no) where status <> 'cancelled';
alter table public.offer_signers add column person_id uuid references public.property_people(id);
alter table public.offer_rounds add column document_id uuid references public.offer_documents(id), add column doc_round integer check (doc_round is null or doc_round >= 1),
  add column side text not null default 'purchaser' check (side in ('purchaser', 'vendor')), add column base_round_id uuid references public.offer_rounds(id),
  add column changes integer not null default 0 check (changes >= 0), add column lifted jsonb not null default '[]'::jsonb check (jsonb_typeof(lifted) = 'array'),
  add column outstanding jsonb not null default '[]'::jsonb check (jsonb_typeof(outstanding) = 'array');
create unique index offer_rounds_doc_round on public.offer_rounds (document_id, doc_round) where document_id is not null;
alter table public.offer_sign_marks drop constraint offer_sign_marks_kind_check, add constraint offer_sign_marks_kind_check check (kind in ('note', 'strike', 'cross', 'reinstate', 'insert'));
alter table public.offer_sign_receipts drop constraint offer_sign_receipts_guide_check, add constraint offer_sign_receipts_guide_check check (guide in ('cca', 'sale_purchase', 'chattels'));
create table public.offer_agreements (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null unique references public.property_offers(id),
  property_id uuid not null references public.properties(id),
  document_id uuid not null unique references public.offer_documents(id),
  round_id uuid not null unique references public.offer_rounds(id),
  path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint not null check (size_bytes > 0),
  agreement_date date not null,
  date_text text not null check (length(date_text) between 10 and 20),
  accepted_at timestamptz not null,
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  chain_last text not null check (chain_last ~ '^[0-9a-f]{64}$'),
  confirmed_by text not null,
  locked_at timestamptz not null default now()
);

-- ───── records stay as made ─────
create trigger offer_agreements_fixed before update or delete on public.offer_agreements for each row execute function public.guard_offer_record();
create trigger offer_agreements_no_truncate before truncate on public.offer_agreements for each statement execute function public.guard_offer_truncate();
create trigger offer_documents_no_truncate before truncate on public.offer_documents for each statement execute function public.guard_offer_truncate();
-- a document changes only through the functions below, only from open, and only its status and when and why it closed
create or replace function public.guard_offer_document() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Negotiation records are never removed'; end if;
  if coalesce(current_setting('offers.fn', true), '') <> 'on' then raise exception 'A negotiation is changed only through the offer screens, so there is a record'; end if;
  if old.status <> 'open' then raise exception 'This document is filed and kept as it was'; end if;
  if (to_jsonb(new) - array['status', 'closed_at', 'closed_by', 'close_reason', 'agreed_at']) is distinct from (to_jsonb(old) - array['status', 'closed_at', 'closed_by', 'close_reason', 'agreed_at']) then
    raise exception 'What the document is built on is kept as it was'; end if;
  return new;
end $$;
create trigger guard_offer_document before update or delete on public.offer_documents for each row execute function public.guard_offer_document();

-- ───── who sees what: Tim only ─────
alter table public.offer_documents enable row level security;
alter table public.offer_agreements enable row level security;
create policy odc_agent_read on public.offer_documents for select using (public.is_agent());
create policy oag_agent_read on public.offer_agreements for select using (public.is_agent());
revoke all on public.offer_documents, public.offer_agreements from anon;
revoke insert, update, delete, truncate, references, trigger on public.offer_documents, public.offer_agreements from authenticated;
-- the new signer column is readable by Tim like the others (the link fingerprints still never are)
grant select (person_id) on public.offer_signers to authenticated;

-- ───── helpers (internal) ─────
-- 020's place check, with 'change' added: the initials beside a change made in a counteroffer
create or replace function public.offer_sign_places_ok(p_places jsonb, p_pages jsonb, p_signers int, p_need_all boolean default true) returns boolean language plpgsql immutable set search_path = public as $$
declare x jsonb; pg int; w numeric; h numeric; s int; n int := jsonb_array_length(p_pages);
begin
  if jsonb_typeof(p_places) <> 'array' or jsonb_array_length(p_places) > 6000 or length(p_places::text) > 3000000 then return false; end if;
  for x in select * from jsonb_array_elements(p_places) loop
    if jsonb_typeof(x) <> 'object' or coalesce(x->>'id', '') !~ '^[a-z]{3,8}:[A-Za-z0-9_.:-]{1,110}:s[0-9]{1,2}$' then return false; end if;
    if not public.offer_num_ok(x->'signer', 1, p_signers) or coalesce(x->>'kind', '') not in ('initial', 'signature', 'name') or coalesce(x->>'why', '') not in ('filled', 'foot', 'term', 'block', 'ack', 'mark', 'change') then return false; end if;
    if x->>'id' !~ (':s' || (x->>'signer') || '$') then return false; end if;
    if not public.offer_num_ok(x->'page', 1, n) then return false; end if;
    pg := (x->>'page')::int; w := (p_pages->(pg - 1)->>0)::numeric; h := (p_pages->(pg - 1)->>1)::numeric;
    if not (public.offer_num_ok(x->'x', -1, w + 1) and public.offer_num_ok(x->'y', -1, h + 1) and public.offer_num_ok(x->'w', 1, w + 1) and public.offer_num_ok(x->'h', 1, h + 1)) then return false; end if;
    if length(coalesce(x->>'label', '')) > 400 or length(coalesce(x->>'name', '')) > 250 or length(x::text) > 2000 then return false; end if;
  end loop;
  if (select count(distinct e->>'id') from jsonb_array_elements(p_places) e) <> jsonb_array_length(p_places) then return false; end if;
  if p_need_all then
    for s in 1..p_signers loop
      if not exists (select 1 from jsonb_array_elements(p_places) e where (e->>'signer')::int = s and e->>'kind' = 'signature') then return false; end if;
      if (select count(distinct (e->>'page')::int) from jsonb_array_elements(p_places) e where (e->>'signer')::int = s and e->>'why' = 'foot') <> n then return false; end if;
    end loop;
  end if;
  return true;
end $$;
-- a change's shape: 020's marks, and typed words { x, y, text, size } (one line, up to 300 characters)
create or replace function public.offer_change_ok(p_kind text, p_geo jsonb, p_w numeric, p_h numeric) returns boolean language plpgsql immutable set search_path = public as $$
declare t text;
begin
  if p_kind <> 'insert' then return public.offer_mark_ok(p_kind, p_geo, p_w, p_h); end if;
  if jsonb_typeof(p_geo) <> 'object' or jsonb_typeof(p_geo->'text') <> 'string' then return false; end if;
  t := p_geo->>'text';
  if length(trim(t)) < 1 or length(t) > 300 or t ~ '[\u0001-\u001F\u007F]' or t <> trim(t) then return false; end if;
  return public.offer_num_ok(p_geo->'x', 0, p_w) and public.offer_num_ok(p_geo->'y', 0, p_h) and public.offer_num_ok(p_geo->'size', 6, 14);
end $$;
-- a New Zealand phone number as its national digits (as DRAFT.nsn in src/draft-core.js)
create or replace function public.offer_nsn(v text) returns text language plpgsql immutable as $$
declare x text := regexp_replace(coalesce(v, ''), '\D', '', 'g');
begin
  if x like '0064%' then x := substr(x, 5); elsif x like '64%' and length(x) >= 10 then x := substr(x, 3); elsif x like '0%' then x := substr(x, 2); end if;
  return x;
end $$;
-- whose own phone or email (a purchaser's or a vendor's) some words hold, or null (phase 2's privacy rule, here for typed changes)
create or replace function public.offer_private_hit(p_offer uuid, p_text text) returns text language plpgsql stable security definer set search_path = public as $$
declare o public.property_offers; t text := lower(coalesce(p_text, '')); runs text[]; r record; p jsonb; v text;
begin
  select * into o from public.property_offers where id = p_offer; if o.id is null or t = '' then return null; end if;
  select coalesce(array_agg(public.offer_nsn(m[1])), '{}') into runs from regexp_matches(t, '([+(]?\d[\d\s().\-]{4,}\d)', 'g') m;
  for r in
    select 'a purchaser' who, o.details->>'email' email, o.details->>'phone' phone
    union all select 'a purchaser', q->>'email', q->>'phone' from jsonb_array_elements(coalesce(o.details->'purchasers', '[]'::jsonb)) q
    union all select 'a vendor', pp.email, pp.phone from public.property_people pp where pp.property_id = o.property_id
  loop
    v := lower(trim(coalesce(r.email, '')));
    if length(v) >= 5 and position('@' in v) > 0 and position(v in t) > 0 then return r.who; end if;
    v := public.offer_nsn(r.phone);
    if length(v) >= 7 and exists (select 1 from unnest(runs) x where length(x) >= 6 and position(v in x) > 0) then return r.who; end if;
  end loop;
  return null;
end $$;
-- 020's check that a signing is still the one to sign, with the negotiation added: its document must be open, and no agreement made
create or replace function public.offer_sign_current(g public.offer_signings) returns text language plpgsql stable set search_path = public as $$
declare d public.offer_drafts; o public.property_offers; ds text;
begin
  if g.status = 'replaced' then return 'This version has been replaced. Tim will send you the new one.'; end if;
  if g.status = 'locked' then return 'Signing is finished, and the signed copy is locked.'; end if;
  if g.status = 'cancelled' then return 'This signing was stopped before anyone signed. Tim will send it to you again.'; end if;
  select * into d from public.offer_drafts where id = g.draft_id; select * into o from public.property_offers where id = g.offer_id;
  if o.status in ('withdrawn', 'lapsed') then return 'This offer has been withdrawn or has lapsed.'; end if;
  if exists (select 1 from public.offer_agreements a where a.offer_id = g.offer_id) then return 'This agreement has been made, so nothing more is signed here.'; end if;
  if g.document_id is not null then
    select status into ds from public.offer_documents where id = g.document_id;
    if ds is distinct from 'open' then return 'This version is no longer being signed. Tim will be in touch.'; end if;
  end if;
  if d.number <> (select max(number) from public.offer_drafts where offer_id = g.offer_id) or o.details is distinct from d.details then
    return 'The offer has changed since it was sent for signing. Tim will send you the new version.'; end if;
  return null;
end $$;
-- every locked round of a document up to a round, with what the negotiation core needs to work out the working copy: the places,
-- each tap, each signer's drawn signature and initials, and each change. No email, phone, device or network of anyone.
create or replace function public.offer_doc_layers(p_document uuid, p_upto int) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('round_id', r.id, 'number', r.number, 'doc_round', r.doc_round, 'side', r.side, 'signing_id', r.signing_id, 'sha256', r.sha256, 'locked_at', r.locked_at, 'changes', r.changes,
      'places', g.places || coalesce((select jsonb_agg(e) from public.offer_sign_reviews v, jsonb_array_elements(v.places) e where v.signing_id = g.id), '[]'::jsonb),
      'taps', (select coalesce(jsonb_agg(jsonb_build_object('place_id', t.place_id, 'signer', s.position) order by t.id), '[]'::jsonb) from public.offer_sign_taps t join public.offer_signers s on s.id = t.signer_id where t.signing_id = g.id),
      'signers', (select coalesce(jsonb_agg(jsonb_build_object('position', s.position, 'name', s.name, 'sig_png', s.sig_png, 'init_png', s.init_png) order by s.position), '[]'::jsonb) from public.offer_signers s where s.signing_id = g.id and s.void_at is null),
      'marks', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'page', m.page, 'geometry', m.geometry, 'target', m.target, 'by', m.by_name, 'at', m.at) order by m.at, m.id), '[]'::jsonb) from public.offer_sign_marks m where m.signing_id = g.id)
    ) order by r.doc_round), '[]'::jsonb)
  from public.offer_rounds r join public.offer_signings g on g.id = r.signing_id where r.document_id = p_document and r.doc_round <= p_upto $$;
-- the parties as the agreement shows them, for the vendors' screen: the purchasers' names and their lawyer, never their own contact details
create or replace function public.offer_parties(p_offer uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('purchasers', (select coalesce(jsonb_agg(trim(coalesce(q->>'first', '') || ' ' || coalesce(q->>'last', ''))), '[]'::jsonb) from jsonb_array_elements(coalesce(o.details->'purchasers', '[]'::jsonb)) q),
    'entity', nullif(trim(coalesce(o.details->>'entity', '')), ''),
    'lawyer', jsonb_build_object('firm', o.details->'lawyer'->>'firm', 'person', o.details->'lawyer'->>'person', 'email', o.details->'lawyer'->>'email', 'phone', o.details->'lawyer'->>'phone'),
    'chattels', coalesce(o.details->'chattels_listed', '[]'::jsonb), 'chattels_add', coalesce(o.details->'chattels_add', '[]'::jsonb), 'chattels_exclude', coalesce(o.details->'chattels_exclude', '[]'::jsonb))
  from public.property_offers o where o.id = p_offer $$;
-- the open document's newest locked round
create or replace function public.offer_doc_last(p_document uuid) returns public.offer_rounds language sql stable set search_path = public as $$
  select * from public.offer_rounds where document_id = p_document order by doc_round desc limit 1 $$;
-- stop every signing of an offer still in progress (withdrawn, lapsed, a document closed): signers void, their links closed, recorded
create or replace function public.offer_stop_signings(p_offer uuid, p_document uuid, p_actor text, p_reason text) returns int language plpgsql security definer set search_path = public as $$
declare g public.offer_signings; n int := 0;
begin
  perform set_config('offers.fn', 'on', true);
  for g in select * from public.offer_signings where offer_id = p_offer and status in ('ready', 'signing', 'held', 'complete') and (p_document is null or document_id = p_document) order by released_at for update loop
    update public.offer_signers set void_at = now(), token_hash = null, session_hash = null, code_hash = null where signing_id = g.id and void_at is null;   -- before the status changes
    update public.offer_signings set status = 'cancelled' where id = g.id;
    insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, left(coalesce(p_actor, 'agent'), 254), 'sign_cancelled',
      jsonb_build_object('signing_id', g.id, 'round', g.round_no, 'side', g.side, 'method', g.method, 'links_sent', g.sent_at is not null, 'reason', left(p_reason, 300)));
    n := n + 1;
  end loop;
  return n;
end $$;

-- ───── the signing steps, as in 020, with the negotiation rounds ─────
-- receipts: the vendors' chattels reminder is receipted like the guides
create or replace function public.offer_sign_do_receipt(p_signer uuid, p_guide text, p_version text, p_file text, p_sha256 text, p_pages int[]) returns void language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings;
begin
  select * into s from public.offer_signers where id = p_signer for update; g := public.offer_sign_ready(s);
  if s.consent_at is null then raise exception 'Agree to sign electronically first'; end if;
  if p_guide not in ('cca', 'sale_purchase', 'chattels') or (p_guide = 'chattels' and g.side <> 'vendor') then raise exception 'Unknown guide'; end if;
  if p_guide = 'cca' and (coalesce(array_length(g.cca_pages, 1), 0) = 0 or coalesce(p_pages, '{}') <> g.cca_pages) then raise exception 'Please read the Client and Customer Acknowledgement pages first'; end if;
  if p_guide = 'sale_purchase' and (coalesce(p_file, '') !~ '^[A-Za-z0-9._-]{1,120}\.pdf$' or coalesce(p_version, '') = '' or length(p_version) > 60 or (p_sha256 is not null and p_sha256 !~ '^[0-9a-f]{64}$')) then raise exception 'Please open the guide first'; end if;
  if exists (select 1 from public.offer_sign_receipts where signer_id = s.id and guide = p_guide) then return; end if;
  insert into public.offer_sign_receipts (signing_id, signer_id, guide, version, file, sha256, pages) values (g.id, s.id, p_guide, case when p_guide = 'sale_purchase' then p_version end, case when p_guide = 'sale_purchase' then p_file end, case when p_guide = 'sale_purchase' then p_sha256 end, case when p_guide = 'cca' then g.cca_pages else '{}' end);
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, s.name, 'sign_receipt', jsonb_build_object('signing_id', g.id, 'signer', s.position, 'guide', p_guide, 'version', case when p_guide = 'sale_purchase' then p_version end));
end $$;
-- a tap: Round 1 needs both guides receipted (020); the vendors need the chattels reminder; the purchasers' later rounds need neither
create or replace function public.offer_sign_do_tap(p_signer uuid, p_place text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings; done int; need int;
begin
  select * into s from public.offer_signers where id = p_signer for update; g := public.offer_sign_ready(s);
  if s.consent_at is null then raise exception 'Agree to sign electronically first'; end if;
  if g.round_no = 1 and (not exists (select 1 from public.offer_sign_receipts where signer_id = s.id and guide = 'sale_purchase') or (coalesce(array_length(g.cca_pages, 1), 0) > 0 and not exists (select 1 from public.offer_sign_receipts where signer_id = s.id and guide = 'cca'))) then
    raise exception 'Please read and tick the guides first'; end if;
  if g.side = 'vendor' and not exists (select 1 from public.offer_sign_receipts where signer_id = s.id and guide = 'chattels') then raise exception 'Please read the reminder about chattels first'; end if;
  if s.sig_png is null or s.init_png is null then raise exception 'Draw your signature and initials first'; end if;
  if p_place is null or p_place not in (select public.offer_sign_required(g.id, s.position)) then raise exception 'That place isn''t yours to sign'; end if;
  insert into public.offer_sign_taps (signing_id, signer_id, place_id) values (g.id, s.id, p_place) on conflict (signer_id, place_id) do nothing;
  select count(*) into need from public.offer_sign_required(g.id, s.position) x;
  select count(*) into done from public.offer_sign_taps t where t.signer_id = s.id and t.place_id in (select public.offer_sign_required(g.id, s.position));
  return jsonb_build_object('done', done, 'of', need);
end $$;
-- a change on the document, by whichever side is countering (Round 2 on). The change and the initials of everyone on that side beside
-- it (one place each, made by the core on the signer's screen and checked here) are kept as they are made. Anyone on that side who
-- had finished initials it and finishes again. Typed words never hold a purchaser's or vendor's own phone or email.
create or replace function public.offer_sign_do_change(p_signer uuid, p_id uuid, p_kind text, p_page int, p_geometry jsonb, p_target uuid, p_places jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings; t public.offer_sign_marks; w numeric; h numeric; n int; x jsonb; who text; reopened int;
begin
  perform 1 from public.offer_signings where id = (select signing_id from public.offer_signers where id = p_signer) for update;   -- as finishing does: the signing, then the signer
  select * into s from public.offer_signers where id = p_signer for update; g := public.offer_sign_ready(s, true);
  if g.round_no < 2 then raise exception 'Changes are made when the offer is answered, from Round 2 on'; end if;
  if s.consent_at is null then raise exception 'Agree to sign electronically first'; end if;
  if p_id is null or exists (select 1 from public.offer_sign_marks where id = p_id) then raise exception 'Please try that again'; end if;
  if p_page is null or p_page < 1 or p_page > jsonb_array_length(g.pages) then raise exception 'That page isn''t in the document'; end if;
  w := (g.pages->(p_page - 1)->>0)::numeric; h := (g.pages->(p_page - 1)->>1)::numeric;
  if coalesce(p_kind, '') not in ('note', 'strike', 'cross', 'reinstate', 'insert') or not public.offer_change_ok(p_kind, p_geometry, w, h) then raise exception 'That change doesn''t sit on the page'; end if;
  if p_kind = 'reinstate' then
    select * into t from public.offer_sign_marks m where m.id = p_target and (m.signing_id = g.id or m.signing_id in (select r.signing_id from public.offer_rounds r where r.document_id = g.document_id));
    if t.id is null or t.kind not in ('strike', 'cross') then raise exception 'Choose a line or crossed-out box to reinstate'; end if;
    if exists (select 1 from public.offer_sign_marks where target = t.id and kind = 'reinstate') then raise exception 'That has already been reinstated'; end if;
  elsif p_target is not null then raise exception 'Only a reinstatement points at another change';
  end if;
  if p_kind = 'insert' then who := public.offer_private_hit(g.offer_id, p_geometry->>'text');
    if who is not null then raise exception 'Those words hold %''s own phone or email, so they can''t go on the agreement. Only the lawyers'' details go on it', who; end if; end if;
  -- the initials of everyone on this side, one each, beside the change
  select count(*) into n from public.offer_signers where signing_id = g.id and void_at is null;
  if not public.offer_sign_places_ok(p_places, g.pages, n, false) or jsonb_array_length(p_places) <> n then raise exception 'Everyone on your side initials each change once'; end if;
  for x in select * from jsonb_array_elements(p_places) loop
    if x->>'why' <> 'change' or x->>'kind' <> 'initial' or x->>'ref' is distinct from p_id::text or x->>'id' <> ('chg:' || p_id || ':s' || (x->>'signer')) then raise exception 'Everyone on your side initials each change once'; end if;
  end loop;
  insert into public.offer_sign_marks (id, signing_id, signer_id, by_name, kind, page, geometry, target) values (p_id, g.id, s.id, s.name, p_kind, p_page, p_geometry, case when p_kind = 'reinstate' then p_target end);
  perform set_config('offers.fn', 'on', true);
  insert into public.offer_sign_reviews (signing_id, marks, places, places_sha256, reviewed_by) values (g.id, array[p_id], p_places, public.offer_sha(p_places::text), left(s.name, 254));
  update public.offer_signers set finished_at = null, seen_sha256 = null where signing_id = g.id and finished_at is not null and void_at is null;
  get diagnostics reopened = row_count;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, s.name, 'round_change',
    jsonb_build_object('signing_id', g.id, 'round', g.round_no, 'side', g.side, 'mark_id', p_id, 'kind', p_kind, 'page', p_page, 'signer', s.position, 'target', p_target, 'text', case when p_kind = 'insert' then p_geometry->>'text' end, 'reopened', reopened));
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('id', p_id, 'reopened', reopened);
end $$;

-- ───── Tim's side ─────
-- 020's "Ready to sign" (Round 1), now also for a fresh copy: refused while a document of the offer is open or agreed, and on a draft
-- that already belongs to a document
create or replace function public.agent_signing_release(p_draft uuid, p_method text, p_pages jsonb, p_places jsonb, p_cca_pages int[]) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); d public.offer_drafts; o public.property_offers; sid uuid; ppl jsonb; n int; i int; nm text; em text; prev record; np int; c int;
begin
  if coalesce(p_method, '') not in ('in_person', 'link') then raise exception 'Choose in person or by link'; end if;
  select * into d from public.offer_drafts where id = p_draft; if d.id is null then raise exception 'No such draft'; end if;
  select * into o from public.property_offers where id = d.offer_id for update;
  if not exists (select 1 from public.offer_draft_approvals a where a.draft_id = d.id and a.sha256 = d.sha256) then raise exception 'Approve the draft first'; end if;
  if d.number <> (select max(number) from public.offer_drafts where offer_id = d.offer_id) then raise exception 'There is a newer draft of this offer. Use that one'; end if;
  if o.details is distinct from d.details then raise exception 'The offer has changed since this draft. Re-draft and approve it first'; end if;
  if o.status in ('withdrawn', 'lapsed') then raise exception 'This offer has been withdrawn or has lapsed'; end if;
  if exists (select 1 from public.offer_documents x where x.offer_id = o.id and x.status in ('open', 'agreed')) then raise exception 'This offer already has a signed Round 1. For a fresh copy, close the current document first'; end if;
  if exists (select 1 from public.offer_documents x where x.draft_id = d.id) then raise exception 'That draft belongs to a closed document. Re-draft the offer for a fresh copy'; end if;
  select id into sid from public.offer_signings where draft_id = d.id and round_no = 1 and status <> 'cancelled';
  if sid is not null then return jsonb_build_object('id', sid, 'existing', true); end if;
  ppl := coalesce(d.details->'purchasers', '[]'::jsonb); n := jsonb_array_length(ppl);
  if n < 1 or n > 12 then raise exception 'The offer needs 1 to 12 purchasers'; end if;
  if jsonb_typeof(p_pages) is distinct from 'array' or jsonb_array_length(p_pages) not between 1 and 400
     or exists (select 1 from jsonb_array_elements(p_pages) s where jsonb_typeof(s) <> 'array' or jsonb_array_length(s) <> 2 or not public.offer_num_ok(s->0, 50, 5000) or not public.offer_num_ok(s->1, 50, 5000)) then
    raise exception 'Please check the page sizes'; end if;
  np := jsonb_array_length(p_pages);
  if not public.offer_sign_places_ok(p_places, p_pages, n) then raise exception 'Please check the signing places: every purchaser needs a signature and initials at the foot of every page'; end if;
  if exists (select 1 from unnest(coalesce(p_cca_pages, '{}')) x where x < 1 or x > np) then raise exception 'Please check the acknowledgement pages'; end if;
  if p_method = 'link' then
    for i in 0..n - 1 loop
      em := lower(trim(coalesce(ppl->i->>'email', '')));
      if em = '' or not public.offer_email_ok(em) then raise exception 'Purchaser % has no email to send a link to. Add it with Correct details, or sign in person', i + 1; end if;
      if exists (select 1 from jsonb_array_elements(ppl) q where lower(trim(coalesce(q->>'email', ''))) = em having count(*) > 1) then raise exception 'Two purchasers have the same email. Each needs their own to sign by link'; end if;
    end loop;
  end if;
  perform set_config('offers.fn', 'on', true);
  insert into public.offer_signings (offer_id, property_id, draft_id, draft_sha256, method, pages, places, places_sha256, cca_pages, released_by)
  values (o.id, o.property_id, d.id, d.sha256, p_method, p_pages, p_places, public.offer_sha(p_places::text), (select coalesce(array_agg(distinct x order by x), '{}') from unnest(coalesce(p_cca_pages, '{}')) x), me) returning id into sid;
  for i in 0..n - 1 loop
    nm := trim(regexp_replace(trim(coalesce(ppl->i->>'first', '')) || ' ' || trim(coalesce(ppl->i->>'last', '')), '\s+', ' ', 'g'));
    if nm = '' then nm := 'Purchaser ' || (i + 1); end if;
    em := nullif(lower(trim(coalesce(ppl->i->>'email', ''))), '');
    insert into public.offer_signers (signing_id, position, name, email) values (sid, i + 1, left(nm, 250), em);
  end loop;
  for prev in select * from public.offer_signings where offer_id = o.id and id <> sid and status in ('ready', 'signing', 'held', 'complete') loop
    select count(*) into c from public.offer_signers where signing_id = prev.id and finished_at is not null;
    update public.offer_signers set void_at = now(), token_hash = null, session_hash = null, code_hash = null where signing_id = prev.id;   -- before the status changes
    update public.offer_signings set status = 'replaced', replaced_at = now(), replaced_by = sid where id = prev.id;
    insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, o.id, me, 'sign_replaced', jsonb_build_object('signing_id', prev.id, 'replaced_by', sid, 'finished', c));
  end loop;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, o.id, me, 'sign_released',
    jsonb_build_object('signing_id', sid, 'draft_id', d.id, 'number', d.number, 'sha256', d.sha256, 'method', p_method, 'signers', n, 'places', jsonb_array_length(p_places), 'places_sha256', public.offer_sha(p_places::text), 'cca_pages', to_jsonb(coalesce(p_cca_pages, '{}'))));
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('id', sid, 'existing', false);
end $$;
-- 020's mark on Tim's screen belongs to Round 1 only; a counteroffer uses the change tools
create or replace function public.agent_signing_mark(p_signer uuid, p_kind text, p_page int, p_geometry jsonb, p_target uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); s public.offer_signers; g public.offer_signings; t public.offer_sign_marks; mid uuid; w numeric; h numeric; why text;
begin
  s := public.offer_sign_person(p_signer);
  select * into g from public.offer_signings where id = s.signing_id for update; select * into s from public.offer_signers where id = p_signer for update;
  if g.round_no > 1 then raise exception 'In a counteroffer, use the change tools'; end if;
  if s.void_at is not null then raise exception 'This version has been replaced'; end if;
  why := public.offer_sign_current(g); if why is not null then raise exception '%', why; end if;
  if g.status not in ('signing', 'held') then raise exception 'Signing isn''t open'; end if;
  if s.consent_at is null then raise exception 'Agree to sign electronically first'; end if;
  if p_page is null or p_page < 1 or p_page > jsonb_array_length(g.pages) then raise exception 'That page isn''t in the document'; end if;
  w := (g.pages->(p_page - 1)->>0)::numeric; h := (g.pages->(p_page - 1)->>1)::numeric;
  if not public.offer_mark_ok(p_kind, p_geometry, w, h) then raise exception 'That mark doesn''t sit on the page'; end if;
  if p_kind = 'reinstate' then
    select * into t from public.offer_sign_marks where id = p_target and signing_id = g.id;
    if t.id is null or t.kind not in ('strike', 'cross') then raise exception 'Choose a line or crossed-out box to reinstate'; end if;
    if exists (select 1 from public.offer_sign_marks where target = t.id and kind = 'reinstate') then raise exception 'That has already been reinstated'; end if;
  elsif p_target is not null then raise exception 'Only a reinstatement points at another mark'; end if;
  insert into public.offer_sign_marks (signing_id, signer_id, by_name, kind, page, geometry, target) values (g.id, s.id, s.name, p_kind, p_page, p_geometry, case when p_kind = 'reinstate' then p_target end) returning id into mid;
  perform set_config('offers.fn', 'on', true);
  update public.offer_signings set status = 'held', held_at = now() where id = g.id;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, s.name, 'sign_marked', jsonb_build_object('signing_id', g.id, 'mark_id', mid, 'kind', p_kind, 'page', p_page, 'signer', s.position, 'target', p_target));
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('id', mid);
end $$;
-- "Present to the vendors" (and every trip back): Tim has looked at the newest locked round and authorises it to go to the other side,
-- in person on his device or by a personal link to each (sent with Send, as in 020). The places are made by the core on his screen:
-- a side signing for the first time initials the foot of every page and every filled box and signs; every signer initials each change
-- the other side made; everyone signs. Nothing is sent here.
create or replace function public.agent_round_present(p_offer uuid, p_method text, p_places jsonb, p_checked boolean, p_note text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); o public.property_offers; doc public.offer_documents; last public.offer_rounds; base public.offer_signings; side_ text; n int; sid uuid; ex uuid; em text; i int; x jsonb; first_ boolean; m record; ppl jsonb;
begin
  if coalesce(p_method, '') not in ('in_person', 'link') then raise exception 'Choose in person or by link'; end if;
  select * into o from public.property_offers where id = p_offer for update; if o.id is null then raise exception 'No such offer'; end if;
  if o.status in ('withdrawn', 'lapsed', 'declined') then raise exception 'This offer has been withdrawn or has lapsed'; end if;
  if exists (select 1 from public.offer_agreements a where a.offer_id = o.id) then raise exception 'The agreement has been made'; end if;
  select * into doc from public.offer_documents where offer_id = o.id and status = 'open'; if doc.id is null then raise exception 'Lock Round 1 first: the purchasers sign the offer before it goes to the vendors'; end if;
  last := public.offer_doc_last(doc.id);
  if p_checked is not true then raise exception 'Tick that you have looked at Round % first', last.doc_round; end if;
  if last.doc_round > 1 and last.changes = 0 and jsonb_array_length(last.outstanding) = 0 then raise exception 'Round % accepted everything with nothing changed. Confirm the agreement instead', last.doc_round; end if;
  side_ := case when last.side = 'purchaser' then 'vendor' else 'purchaser' end;
  select id into ex from public.offer_signings where draft_id = doc.draft_id and round_no = last.doc_round + 1 and status <> 'cancelled';
  if ex is not null then return jsonb_build_object('id', ex, 'existing', true); end if;
  select * into base from public.offer_signings where id = last.signing_id;
  -- who signs: the vendors on the property (owners, by their legal names), or the purchasers as Round 1 had them (the same draft)
  if side_ = 'vendor' then
    select coalesce(jsonb_agg(jsonb_build_object('name', trim(regexp_replace(coalesce(pp.legal_name, ''), '\s+', ' ', 'g')), 'email', nullif(lower(trim(coalesce(pp.email, ''))), ''), 'person', pp.id) order by pp.position, pp.legal_name), '[]'::jsonb)
      into ppl from public.property_people pp where pp.property_id = o.property_id and coalesce(pp.role, 'owner') = 'owner';
    if exists (select 1 from jsonb_array_elements(ppl) q where q->>'name' = '') then raise exception 'Add each vendor''s legal name on the property first'; end if;
  else
    select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'email', x.email, 'person', null) order by x.position), '[]'::jsonb) into ppl
      from public.offer_signers x where x.signing_id = (select r.signing_id from public.offer_rounds r where r.document_id = doc.id and r.doc_round = 1) and x.void_at is null;
  end if;
  n := jsonb_array_length(ppl);
  if n < 1 or n > 12 then raise exception 'There need to be 1 to 12 people to sign (now %)', n; end if;
  if p_method = 'link' then
    for x in select * from jsonb_array_elements(ppl) loop
      em := x->>'email';
      if em is null or not public.offer_email_ok(em) then raise exception '% has no email to send a link to. Add it, or sign in person', x->>'name'; end if;
    end loop;
    if (select count(distinct q->>'email') from jsonb_array_elements(ppl) q) <> n then raise exception 'Two people have the same email. Each needs their own to sign by link'; end if;
  end if;
  -- the places: every signer signs; a side's first round has the foot of every page; every signer initials each change the other side made
  first_ := not exists (select 1 from public.offer_rounds r where r.document_id = doc.id and r.side = side_);
  if not public.offer_sign_places_ok(p_places, base.pages, n, first_) then raise exception 'Please check the signing places: everyone signs%', case when first_ then ', and initials the foot of every page' else '' end; end if;
  for i in 1..n loop
    if not exists (select 1 from jsonb_array_elements(p_places) e where (e->>'signer')::int = i and e->>'kind' = 'signature') then raise exception 'Please check the signing places: everyone signs'; end if;
  end loop;
  for m in select k.id from public.offer_sign_marks k where k.signing_id = last.signing_id loop
    for i in 1..n loop
      if not exists (select 1 from jsonb_array_elements(p_places) e where e->>'id' = 'chg:' || m.id || ':s' || i and e->>'why' = 'change' and e->>'kind' = 'initial') then raise exception 'Please check the signing places: everyone initials each change made in Round %', last.doc_round; end if;
    end loop;
  end loop;
  perform set_config('offers.fn', 'on', true);
  insert into public.offer_signings (offer_id, property_id, draft_id, draft_sha256, method, pages, places, places_sha256, cca_pages, released_by, round_no, side, document_id, base_round_id)
  values (o.id, o.property_id, doc.draft_id, doc.draft_sha256, p_method, base.pages, p_places, public.offer_sha(p_places::text), '{}', me, last.doc_round + 1, side_, doc.id, last.id) returning id into sid;
  for i in 0..n - 1 loop
    insert into public.offer_signers (signing_id, position, name, email, person_id) values (sid, i + 1, left(ppl->i->>'name', 250), ppl->i->>'email', (ppl->i->>'person')::uuid);
  end loop;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, o.id, me, 'round_presented',
    jsonb_build_object('signing_id', sid, 'document', doc.number, 'round', last.doc_round + 1, 'side', side_, 'method', p_method, 'checked_round', last.doc_round, 'checked_sha256', last.sha256, 'signers', n, 'places', jsonb_array_length(p_places), 'places_sha256', public.offer_sha(p_places::text), 'note', left(nullif(trim(coalesce(p_note, '')), ''), 300)));
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('id', sid, 'existing', false, 'round', last.doc_round + 1, 'side', side_);
end $$;
-- a change on Tim's device, by the signer whose turn it is
create or replace function public.agent_round_change(p_signer uuid, p_id uuid, p_kind text, p_page int, p_geometry jsonb, p_target uuid, p_places jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
begin perform public.offer_sign_person(p_signer); return public.offer_sign_do_change(p_signer, p_id, p_kind, p_page, p_geometry, p_target, p_places); end $$;
-- the layers of the offer's open document (or a given one), for Tim's screen
create or replace function public.agent_offer_layers(p_offer uuid, p_document uuid default null) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare doc public.offer_documents;
begin
  perform public.offer_agent();
  select * into doc from public.offer_documents where offer_id = p_offer and (id = p_document or (p_document is null and status in ('open', 'agreed'))) order by number desc limit 1;
  if doc.id is null then return jsonb_build_object('document', null, 'layers', '[]'::jsonb); end if;
  return jsonb_build_object('document', to_jsonb(doc), 'layers', public.offer_doc_layers(doc.id, 100000));
end $$;
-- a fresh copy: the open document is closed and filed as negotiation history, every round kept. Anything out for signing on it stops.
-- Tim then corrects the offer to the terms as they stand, re-drafts and approves it, and Round 1 of a new document is signed (020).
create or replace function public.agent_document_close(p_offer uuid, p_reason text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); o public.property_offers; doc public.offer_documents; why text := nullif(trim(coalesce(p_reason, '')), ''); stopped int; rounds int;
begin
  select * into o from public.property_offers where id = p_offer for update; if o.id is null then raise exception 'No such offer'; end if;
  select * into doc from public.offer_documents where offer_id = o.id and status = 'open' for update; if doc.id is null then raise exception 'There is no open document to close'; end if;
  if why is null or length(why) < 3 or length(why) > 500 then raise exception 'Say why you are starting a fresh copy (3 to 500 characters)'; end if;
  stopped := public.offer_stop_signings(o.id, doc.id, me, 'The document was closed for a fresh copy');
  select count(*) into rounds from public.offer_rounds where document_id = doc.id;
  perform set_config('offers.fn', 'on', true);
  update public.offer_documents set status = 'closed', closed_at = now(), closed_by = me, close_reason = why where id = doc.id;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, o.id, me, 'document_closed', jsonb_build_object('document_id', doc.id, 'document', doc.number, 'rounds', rounds, 'stopped', stopped, 'reason', why));
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('ok', true, 'document', doc.number, 'rounds', rounds, 'stopped', stopped);
end $$;
-- 018's withdrawn or lapsed, now also stopping every signing in progress (any links sent stop working)
create or replace function public.agent_offer_status(p_offer uuid, p_status text, p_at timestamptz, p_note text default null) returns void language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); o public.property_offers; at_ timestamptz := coalesce(p_at, now()); stopped int := 0;
begin
  perform set_config('offers.fn', 'on', true);
  select * into o from public.property_offers where id = p_offer for update; if o.id is null or o.source = 'manual' then raise exception 'No such offer'; end if;
  if p_status not in ('withdrawn','lapsed','received') then raise exception 'Choose withdrawn or lapsed'; end if;
  if exists (select 1 from public.offer_agreements a where a.offer_id = o.id) then raise exception 'The agreement has been made, so it can''t be marked here. Talk to the lawyers'; end if;
  if at_ > now() + interval '5 minutes' or at_ < o.received_at - interval '1 minute' then raise exception 'The time needs to be between when the offer came in and now'; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'The note is too long'; end if;
  if p_status in ('withdrawn', 'lapsed') then stopped := public.offer_stop_signings(o.id, null, me, 'The offer was marked ' || p_status); perform set_config('offers.fn', 'on', true); end if;
  update public.property_offers set status = p_status, status_at = case when p_status = 'received' then null else at_ end, status_by = me where id = p_offer;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, p_offer, me, 'status', jsonb_build_object('from', o.status, 'to', p_status, 'at', at_, 'note', nullif(trim(coalesce(p_note, '')), ''), 'stopped', stopped));
  perform set_config('offers.fn', '', true);
end $$;
-- either side tells Tim they withdraw (the purchasers their offer, the vendors their counteroffer): recorded with the time, the offer
-- marked withdrawn, and every signing in progress stopped
create or replace function public.agent_negotiation_withdraw(p_offer uuid, p_side text, p_at timestamptz, p_note text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); o public.property_offers; at_ timestamptz := coalesce(p_at, now()); stopped int;
begin
  if coalesce(p_side, '') not in ('purchaser', 'vendor') then raise exception 'Choose who withdrew: the purchasers or the vendors'; end if;
  select * into o from public.property_offers where id = p_offer for update; if o.id is null or o.source = 'manual' then raise exception 'No such offer'; end if;
  if exists (select 1 from public.offer_agreements a where a.offer_id = o.id) then raise exception 'The agreement has been made, so it can''t be withdrawn here. Talk to the lawyers'; end if;
  if o.status in ('withdrawn', 'lapsed') then raise exception 'This offer has already been withdrawn or has lapsed'; end if;
  if at_ > now() + interval '5 minutes' or at_ < o.received_at - interval '1 minute' then raise exception 'The time needs to be between when the offer came in and now'; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'The note is too long'; end if;
  stopped := public.offer_stop_signings(o.id, null, me, case when p_side = 'vendor' then 'The vendors withdrew' else 'The purchasers withdrew' end);
  perform set_config('offers.fn', 'on', true);
  update public.property_offers set status = 'withdrawn', status_at = at_, status_by = me where id = o.id;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, o.id, me, 'withdrawn', jsonb_build_object('side', p_side, 'from', o.status, 'at', at_, 'note', nullif(trim(coalesce(p_note, '')), ''), 'stopped', stopped));
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('ok', true, 'stopped', stopped);
end $$;

-- ───── the offer-sign edge function (service role) ─────
-- 020's Send, also saying which side and round it is (for the email's wording)
create or replace function public.offer_sign_issue(p_signing uuid, p_actor text) returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.offer_signings; s public.offer_signers; tok text; out_ jsonb := '[]'::jsonb; why text; addr text;
begin
  select * into g from public.offer_signings where id = p_signing for update; if g.id is null then raise exception 'No such signing'; end if;
  if g.method <> 'link' then raise exception 'This signing is in person, on your device'; end if;
  why := public.offer_sign_current(g); if why is not null then raise exception '%', why; end if;
  if g.status not in ('ready', 'signing') then raise exception 'Signing is held or finished, so no link is sent'; end if;
  select address into addr from public.properties where id = g.property_id;
  perform set_config('offers.fn', 'on', true);
  for s in select * from public.offer_signers where signing_id = g.id and finished_at is null and void_at is null order by position loop
    tok := public.offer_token();
    update public.offer_signers set token_hash = public.offer_sha(tok), link_sent_at = now(), link_expires_at = now() + interval '14 days', session_hash = null, session_expires_at = null, code_hash = null, code_expires_at = null, code_tries = 0 where id = s.id;
    out_ := out_ || jsonb_build_array(jsonb_build_object('signer_id', s.id, 'position', s.position, 'name', s.name, 'email', s.email, 'token', tok));
  end loop;
  update public.offer_signings set status = 'signing', sent_at = coalesce(sent_at, now()) where id = g.id;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, left(coalesce(p_actor, 'agent'), 254), 'sign_links_sent', jsonb_build_object('signing_id', g.id, 'signers', jsonb_array_length(out_), 'resent', g.status = 'signing', 'round', g.round_no, 'side', g.side));
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('address', addr, 'links', out_, 'side', g.side, 'round', g.round_no);
end $$;
-- 020's opening of a link, also saying which side and round
create or replace function public.offer_sign_open(p_token text, p_net text, p_ua text) returns jsonb language plpgsql security definer set search_path = public as $$
declare n text := public.offer_net(p_net); s public.offer_signers; g public.offer_signings; why text; addr text; e text;
begin
  s := public.offer_sign_find(p_token);
  if s.id is null then
    if public.offer_hit_count('bad', n, null, interval '1 hour') < 30 then insert into public.offer_hits (kind, net) values ('bad', n); end if;
    return jsonb_build_object('ok', false);
  end if;
  select * into g from public.offer_signings where id = s.signing_id; select address into addr from public.properties where id = g.property_id;
  if s.opened_at is null and s.void_at is null and s.finished_at is null and g.status in ('ready', 'signing', 'held') then perform set_config('offers.fn', 'on', true); update public.offer_signers set opened_at = now() where id = s.id; perform set_config('offers.fn', '', true); end if;
  why := case when s.void_at is not null then 'This version has been replaced. Tim will send you the new one.' else public.offer_sign_current(g) end;
  e := coalesce(s.email, '');
  return jsonb_build_object('ok', true, 'first', split_part(s.name, ' ', 1), 'address', addr, 'finished', s.finished_at is not null, 'stopped', why, 'held', g.status = 'held', 'side', g.side, 'round', g.round_no,
    'email_hint', case when position('@' in e) > 1 then left(e, 1) || '***@' || split_part(e, '@', 2) else '' end);
end $$;
-- 020's state for a link signer, with the round: which side, the earlier rounds (for the working copy), and for the vendors the parties
-- as the agreement names them and the chattels
create or replace function public.offer_sign_state(p_token text, p_session text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings; d public.offer_drafts; addr text;
begin
  s := public.offer_sign_me(p_token, p_session);
  select * into g from public.offer_signings where id = s.signing_id; select * into d from public.offer_drafts where id = g.draft_id; select address into addr from public.properties where id = g.property_id;
  return jsonb_build_object('signer', jsonb_build_object('position', s.position, 'name', s.name, 'consent_at', s.consent_at, 'has_marks', s.sig_png is not null, 'sig_png', s.sig_png, 'init_png', s.init_png, 'finished_at', s.finished_at, 'void', s.void_at is not null,
      'receipts', (select coalesce(jsonb_agg(jsonb_build_object('guide', r.guide, 'version', r.version, 'at', r.at)), '[]'::jsonb) from public.offer_sign_receipts r where r.signer_id = s.id)),
    'signing', jsonb_build_object('status', g.status, 'stopped', case when s.void_at is not null then 'This version has been replaced. Tim will send you the new one.' else public.offer_sign_current(g) end, 'pages', g.pages, 'cca_pages', to_jsonb(g.cca_pages),
      'draft_path', case when s.consent_at is not null then d.path end, 'draft_sha256', d.sha256, 'address', addr,   -- the document only once they agree to sign electronically
      'round', g.round_no, 'side', g.side, 'signers', (select count(*) from public.offer_signers x where x.signing_id = g.id and x.void_at is null),
      'parties', case when g.side = 'vendor' then public.offer_parties(g.offer_id) end,
      'layers', case when g.round_no > 1 and s.consent_at is not null then public.offer_doc_layers(g.document_id, g.round_no - 1) else '[]'::jsonb end,
      'marks', case when g.round_no > 1 then (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'page', m.page, 'geometry', m.geometry, 'target', m.target, 'by', m.by_name, 'at', m.at) order by m.at, m.id), '[]'::jsonb) from public.offer_sign_marks m where m.signing_id = g.id) else '[]'::jsonb end,
      'places', (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(g.places) e where (e->>'signer')::int = s.position
        union all select e from public.offer_sign_reviews r, jsonb_array_elements(r.places) e where r.signing_id = g.id and (e->>'signer')::int = s.position) z),
      'side_places', case when g.round_no > 1 then (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(g.places) e union all select e from public.offer_sign_reviews r, jsonb_array_elements(r.places) e where r.signing_id = g.id) z) else '[]'::jsonb end),
    'taps', (select coalesce(jsonb_agg(t.place_id order by t.id), '[]'::jsonb) from public.offer_sign_taps t where t.signer_id = s.id));
end $$;
-- a change from a link, by the signer themselves (Round 2 on)
create or replace function public.offer_sign_change(p_token text, p_session text, p_id uuid, p_kind text, p_page int, p_geometry jsonb, p_target uuid, p_places jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; begin s := public.offer_sign_me(p_token, p_session); return public.offer_sign_do_change(s.id, p_id, p_kind, p_page, p_geometry, p_target, p_places); end $$;
-- 020's material for the locked copy, for any round: its overall number, the document and round, and the earlier rounds' layers
create or replace function public.offer_round_material(p_signing uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g public.offer_signings; d public.offer_drafts; o public.property_offers; addr text; why text; doc public.offer_documents; nxt int;
begin
  select * into g from public.offer_signings where id = p_signing; if g.id is null then raise exception 'No such signing'; end if;
  if g.status <> 'complete' then raise exception 'Not everyone has finished signing'; end if;
  why := public.offer_sign_current(g); if why is not null then raise exception '%', why; end if;
  select * into d from public.offer_drafts where id = g.draft_id; select * into o from public.property_offers where id = g.offer_id; select address into addr from public.properties where id = g.property_id;
  select * into doc from public.offer_documents where id = g.document_id;
  nxt := coalesce((select max(number) from public.offer_rounds where offer_id = g.offer_id), 0) + 1;
  return jsonb_build_object('signing_id', g.id, 'offer_id', o.id, 'property_id', g.property_id, 'address', addr, 'offer_ref', o.buyer_ref, 'method', g.method,
    'number', nxt, 'round', g.round_no, 'side', g.side, 'document', coalesce(doc.number, (select count(*) from public.offer_documents x where x.offer_id = o.id) + 1),
    'earlier', case when g.round_no > 1 then public.offer_doc_layers(g.document_id, g.round_no - 1) else '[]'::jsonb end,
    'draft', jsonb_build_object('id', d.id, 'number', d.number, 'path', d.path, 'sha256', d.sha256), 'places_sha256', g.places_sha256, 'pages', g.pages,
    'places', g.places || coalesce((select jsonb_agg(e) from public.offer_sign_reviews r, jsonb_array_elements(r.places) e where r.signing_id = g.id), '[]'::jsonb),
    'signers', (select jsonb_agg(jsonb_build_object('id', s.id, 'position', s.position, 'name', s.name, 'sig_png', s.sig_png, 'init_png', s.init_png, 'verified_at', s.verified_at, 'consent_at', s.consent_at, 'id_sighted', s.id_sighted, 'witnessed_by', s.witnessed_by,
        'finished_at', s.finished_at, 'seen_sha256', s.seen_sha256, 'ua', s.user_agent, 'net', s.net_hash,
        'receipts', (select coalesce(jsonb_agg(jsonb_build_object('guide', r.guide, 'version', r.version, 'sha256', r.sha256, 'pages', to_jsonb(r.pages), 'at', r.at) order by r.id), '[]'::jsonb) from public.offer_sign_receipts r where r.signer_id = s.id),
        'first_tap', (select min(t.at) from public.offer_sign_taps t where t.signer_id = s.id), 'last_tap', (select max(t.at) from public.offer_sign_taps t where t.signer_id = s.id),
        'places', (select count(*) from public.offer_sign_required(g.id, s.position) x)) order by s.position) from public.offer_signers s where s.signing_id = g.id and s.void_at is null),
    'taps', (select coalesce(jsonb_agg(jsonb_build_object('place_id', t.place_id, 'signer', s.position, 'at', t.at) order by t.id), '[]'::jsonb) from public.offer_sign_taps t join public.offer_signers s on s.id = t.signer_id where t.signing_id = g.id),
    'marks', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'page', m.page, 'geometry', m.geometry, 'target', m.target, 'by', m.by_name, 'at', m.at,
        'reviewed_at', (select min(r.at) from public.offer_sign_reviews r where r.signing_id = g.id and m.id = any (r.marks))) order by m.at, m.id), '[]'::jsonb) from public.offer_sign_marks m where m.signing_id = g.id),
    'replaced', (select coalesce(jsonb_agg(jsonb_build_object('number', dd.number, 'at', x.replaced_at) order by x.replaced_at), '[]'::jsonb) from public.offer_signings x join public.offer_drafts dd on dd.id = x.draft_id where x.offer_id = g.offer_id and x.status = 'replaced'),
    'made_at', now());
end $$;
-- 020's lock, for any round. Round 1 opens a new document (the first, or a fresh copy); a later round is the next in its open document,
-- answering the newest locked round. Its overall number keeps counting across documents. The core's check of what was lifted and
-- what is outstanding comes in the execution record (p_execution.check), made by the edge function from what the database holds.
create or replace function public.offer_round_lock(p_signing uuid, p_path text, p_sha256 text, p_size bigint, p_execution jsonb, p_actor text) returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.offer_signings; why text; obj jsonb; rid uuid; h text; ex public.offer_rounds; o public.property_offers; doc public.offer_documents; last public.offer_rounds; nxt int; chg int; ck jsonb := coalesce(p_execution->'check', '{}'::jsonb); dn int;
begin
  -- the offer, then its document, then the signing (the order closing a document and presenting use too)
  select * into o from public.property_offers where id = (select offer_id from public.offer_signings where id = p_signing) for update;
  select * into g from public.offer_signings where id = p_signing; if g.id is null then raise exception 'No such signing'; end if;
  if g.document_id is not null then select * into doc from public.offer_documents where id = g.document_id for update; end if;
  select * into g from public.offer_signings where id = p_signing for update;
  select * into ex from public.offer_rounds where signing_id = g.id; if ex.id is not null then return jsonb_build_object('id', ex.id, 'number', ex.number, 'round', ex.doc_round, 'sha256', ex.sha256, 'existing', true); end if;
  if g.status <> 'complete' then raise exception 'Not everyone has finished signing'; end if;
  why := public.offer_sign_current(g); if why is not null then raise exception '%', why; end if;
  if g.round_no = 1 then
    if exists (select 1 from public.offer_documents x where x.offer_id = g.offer_id and x.status in ('open', 'agreed')) then raise exception 'This offer already has a signed Round 1'; end if;
  else
    last := public.offer_doc_last(doc.id);
    if last.id is distinct from g.base_round_id or last.doc_round <> g.round_no - 1 then raise exception 'This round no longer answers the newest round, so it wasn''t locked'; end if;
  end if;
  nxt := coalesce((select max(number) from public.offer_rounds where offer_id = g.offer_id), 0) + 1;
  if coalesce(p_path, '') !~ ('^properties/' || g.property_id || '/docs/offer-round-' || g.offer_id || '-' || nxt || '-[0-9a-f]{12}\.pdf$') then raise exception 'A round is stored at its own place'; end if;
  if coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$' or p_sha256 = g.draft_sha256 or exists (select 1 from public.offer_rounds where sha256 = p_sha256) then raise exception 'The round needs its own fingerprint'; end if;
  obj := public.repo_object(p_path);
  if obj is null or (obj->>'size')::bigint is distinct from p_size or (obj->>'mime') is distinct from 'application/pdf' then raise exception 'The stored round doesn''t match'; end if;
  if not exists (select 1 from public.offer_file_hashes f where f.path = p_path and f.sha256 = p_sha256 and f.size_bytes = p_size) then raise exception 'The round''s fingerprint hasn''t been confirmed by the server'; end if;
  if jsonb_typeof(p_execution) is distinct from 'object' or length(p_execution::text) > 200000 then raise exception 'Please check the execution record'; end if;
  if g.round_no > 1 and (jsonb_typeof(ck->'lifted') is distinct from 'array' or jsonb_typeof(ck->'outstanding') is distinct from 'array') then raise exception 'Please check the execution record'; end if;
  select count(*) into chg from public.offer_sign_marks where signing_id = g.id;
  perform set_config('offers.fn', 'on', true);
  if g.round_no = 1 then
    dn := (select count(*) from public.offer_documents x where x.offer_id = g.offer_id) + 1;
    insert into public.offer_documents (offer_id, property_id, number, draft_id, draft_sha256) values (g.offer_id, g.property_id, dn, g.draft_id, g.draft_sha256) returning * into doc;
  end if;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, left(coalesce(p_actor, 'system'), 254), 'round_locked',
    jsonb_build_object('signing_id', g.id, 'number', nxt, 'document', doc.number, 'round', g.round_no, 'side', g.side, 'changes', chg, 'sha256', p_sha256, 'draft_sha256', g.draft_sha256, 'places_sha256', g.places_sha256, 'path', p_path,
      'lifted', coalesce(jsonb_array_length(ck->'lifted'), 0), 'outstanding', coalesce(jsonb_array_length(ck->'outstanding'), 0))) returning hash into h;
  insert into public.offer_rounds (offer_id, property_id, signing_id, number, draft_id, draft_sha256, places_sha256, path, sha256, size_bytes, execution, chain_last, locked_by, document_id, doc_round, side, base_round_id, changes, lifted, outstanding)
  values (g.offer_id, g.property_id, g.id, nxt, g.draft_id, g.draft_sha256, g.places_sha256, p_path, p_sha256, p_size, p_execution, h, left(coalesce(p_actor, 'system'), 254), doc.id, g.round_no, g.side, g.base_round_id, chg,
    case when g.round_no > 1 then ck->'lifted' else '[]'::jsonb end, case when g.round_no > 1 then ck->'outstanding' else '[]'::jsonb end) returning id into rid;
  update public.offer_signings set status = 'locked', locked_at = now() where id = g.id;
  if g.round_no > 1 and chg > 0 and o.status in ('received', 'countered') then update public.property_offers set status = 'countered' where id = o.id; end if;
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('id', rid, 'number', nxt, 'round', g.round_no, 'document', doc.number, 'sha256', p_sha256, 'existing', false);
end $$;
-- is the agreement formed? The newest round of the open document answers the round before it, changed nothing, and the core found
-- nothing outstanding (every change initialled by every party, every signature there); nothing else is out for signing; the date is
-- written in full with the month name, on a real day, not in the future; acceptance was communicated after the last signature.
create or replace function public.offer_agreement_check(p_offer uuid, p_accepted_at timestamptz, p_date_text text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.property_offers; doc public.offer_documents; last public.offer_rounds; t text := trim(coalesce(p_date_text, '')); m text[]; dt date; mons text[] := array['January','February','March','April','May','June','July','August','September','October','November','December']; fin timestamptz; first_ timestamptz;
begin
  select * into o from public.property_offers where id = p_offer; if o.id is null then raise exception 'No such offer'; end if;
  if exists (select 1 from public.offer_agreements a where a.offer_id = o.id) then raise exception 'The agreement has already been made'; end if;
  if o.status in ('withdrawn', 'lapsed', 'declined') then raise exception 'This offer has been withdrawn or has lapsed'; end if;
  select * into doc from public.offer_documents where offer_id = o.id and status = 'open'; if doc.id is null then raise exception 'There is no open document'; end if;
  last := public.offer_doc_last(doc.id);
  if last.doc_round < 2 then raise exception 'Both sides sign before the agreement is made'; end if;
  if last.changes > 0 then raise exception 'Round % changed the document, so the other side answers it first', last.doc_round; end if;
  if jsonb_array_length(last.outstanding) > 0 then raise exception 'Something is still outstanding on Round %', last.doc_round; end if;
  if exists (select 1 from public.offer_signings g where g.document_id = doc.id and g.round_no > last.doc_round and g.status in ('ready', 'signing', 'held', 'complete')) then raise exception 'A newer round is out for signing. Stop it first'; end if;
  m := regexp_match(t, '^([1-9]|[12][0-9]|3[01]) (January|February|March|April|May|June|July|August|September|October|November|December) (20[0-9]{2})$');
  if m is null then raise exception 'Type the date in full with the month name, for example 24 November 2026'; end if;
  begin dt := make_date(m[3]::int, array_position(mons, m[2]), m[1]::int); exception when others then raise exception 'That date isn''t a real day'; end;
  select min(locked_at) into first_ from public.offer_rounds where document_id = doc.id;
  if dt > public.offer_nz_today() or dt < (first_ at time zone 'Pacific/Auckland')::date then raise exception 'The agreement date needs to be between Round 1 and today'; end if;
  select max(finished_at) into fin from public.offer_signers where signing_id = last.signing_id;
  if p_accepted_at is null or p_accepted_at > now() + interval '5 minutes' or p_accepted_at < fin - interval '1 minute' then raise exception 'The time acceptance was communicated needs to be after the last signature and not in the future'; end if;
  return jsonb_build_object('document_id', doc.id, 'document', doc.number, 'round_id', last.id, 'round', last.doc_round, 'number', last.number, 'date', dt, 'date_text', t);
end $$;
-- what the edge function needs to make the agreed copy: every round's layers, the date place from the map, and the rounds' fingerprints
create or replace function public.offer_agreement_material(p_offer uuid, p_accepted_at timestamptz, p_date_text text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c jsonb := public.offer_agreement_check(p_offer, p_accepted_at, p_date_text); doc public.offer_documents; d public.offer_drafts; o public.property_offers; addr text; dp jsonb;
begin
  select * into doc from public.offer_documents where id = (c->>'document_id')::uuid; select * into d from public.offer_drafts where id = doc.draft_id; select * into o from public.property_offers where id = p_offer;
  select address into addr from public.properties where id = o.property_id;
  select e into dp from public.offer_blank_maps bm, jsonb_array_elements(bm.places) e where bm.id = d.map_id and (e->>'id' = 'date' or e->>'kind' = 'date') order by (e->>'id' = 'date') desc limit 1;
  return c || jsonb_build_object('offer_id', o.id, 'property_id', o.property_id, 'address', addr, 'offer_ref', o.buyer_ref, 'draft', jsonb_build_object('id', d.id, 'number', d.number, 'path', d.path, 'sha256', d.sha256),
    'pages', (select pages from public.offer_signings where id = (select signing_id from public.offer_rounds where id = (c->>'round_id')::uuid)), 'date_place', dp,
    'layers', public.offer_doc_layers(doc.id, (c->>'round')::int),
    'rounds', (select jsonb_agg(jsonb_build_object('number', r.number, 'document', x.number, 'round', r.doc_round, 'side', r.side, 'changes', r.changes, 'sha256', r.sha256, 'locked_at', r.locked_at) order by r.number) from public.offer_rounds r join public.offer_documents x on x.id = r.document_id where r.offer_id = o.id),
    'accepted_at', p_accepted_at, 'made_at', now());
end $$;
-- the agreed copy locked: checked again under the offer's lock, the file confirmed from the stored bytes. The document is agreed, the
-- offer accepted. The property's stage is moved by Tim's own screen with agent_set_stage (009); other offers are left for Tim.
create or replace function public.offer_agreement_lock(p_offer uuid, p_round uuid, p_path text, p_sha256 text, p_size bigint, p_accepted_at timestamptz, p_date_text text, p_record jsonb, p_actor text) returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.property_offers; c jsonb; obj jsonb; h text; aid uuid; ex public.offer_agreements;
begin
  select * into o from public.property_offers where id = p_offer for update; if o.id is null then raise exception 'No such offer'; end if;
  select * into ex from public.offer_agreements where offer_id = o.id; if ex.id is not null then return jsonb_build_object('id', ex.id, 'sha256', ex.sha256, 'existing', true); end if;
  perform 1 from public.offer_documents where offer_id = o.id and status = 'open' for update;
  c := public.offer_agreement_check(p_offer, p_accepted_at, p_date_text);
  if (c->>'round_id')::uuid is distinct from p_round then raise exception 'The newest round has changed. Look at it again'; end if;
  if coalesce(p_path, '') !~ ('^properties/' || o.property_id || '/docs/offer-agreement-' || o.id || '-[0-9a-f]{12}\.pdf$') then raise exception 'The agreement is stored at its own place'; end if;
  if coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$' or exists (select 1 from public.offer_rounds where sha256 = p_sha256) then raise exception 'The agreement needs its own fingerprint'; end if;
  obj := public.repo_object(p_path);
  if obj is null or (obj->>'size')::bigint is distinct from p_size or (obj->>'mime') is distinct from 'application/pdf' then raise exception 'The stored agreement doesn''t match'; end if;
  if not exists (select 1 from public.offer_file_hashes f where f.path = p_path and f.sha256 = p_sha256 and f.size_bytes = p_size) then raise exception 'The agreement''s fingerprint hasn''t been confirmed by the server'; end if;
  if jsonb_typeof(p_record) is distinct from 'object' or length(p_record::text) > 200000 then raise exception 'Please check the record'; end if;
  perform set_config('offers.fn', 'on', true);
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, o.id, left(coalesce(p_actor, 'agent'), 254), 'agreement_formed',
    jsonb_build_object('document', (c->>'document')::int, 'round', (c->>'round')::int, 'number', (c->>'number')::int, 'date', c->>'date_text', 'accepted_at', p_accepted_at, 'sha256', p_sha256, 'path', p_path)) returning hash into h;
  insert into public.offer_agreements (offer_id, property_id, document_id, round_id, path, sha256, size_bytes, agreement_date, date_text, accepted_at, record, chain_last, confirmed_by)
  values (o.id, o.property_id, (c->>'document_id')::uuid, p_round, p_path, p_sha256, p_size, (c->>'date')::date, c->>'date_text', p_accepted_at, p_record, h, left(coalesce(p_actor, 'agent'), 254)) returning id into aid;
  update public.offer_documents set status = 'agreed', agreed_at = now() where id = (c->>'document_id')::uuid;
  update public.property_offers set status = 'accepted', status_at = p_accepted_at, status_by = left(coalesce(p_actor, 'agent'), 254) where id = o.id;
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('id', aid, 'sha256', p_sha256, 'existing', false, 'property_id', o.property_id);
end $$;

-- ───── execute rights ─────
revoke execute on function public.guard_offer_document(), public.offer_change_ok(text, jsonb, numeric, numeric), public.offer_nsn(text), public.offer_private_hit(uuid, text), public.offer_doc_layers(uuid, int), public.offer_parties(uuid),
  public.offer_doc_last(uuid), public.offer_stop_signings(uuid, uuid, text, text), public.offer_sign_do_change(uuid, uuid, text, int, jsonb, uuid, jsonb), public.offer_agreement_check(uuid, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.offer_sign_change(text, text, uuid, text, int, jsonb, uuid, jsonb), public.offer_agreement_material(uuid, timestamptz, text), public.offer_agreement_lock(uuid, uuid, text, text, bigint, timestamptz, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.offer_sign_change(text, text, uuid, text, int, jsonb, uuid, jsonb), public.offer_agreement_material(uuid, timestamptz, text), public.offer_agreement_lock(uuid, uuid, text, text, bigint, timestamptz, text, jsonb, text) to service_role;
revoke execute on function public.agent_round_present(uuid, text, jsonb, boolean, text), public.agent_round_change(uuid, uuid, text, int, jsonb, uuid, jsonb), public.agent_offer_layers(uuid, uuid), public.agent_document_close(uuid, text), public.agent_negotiation_withdraw(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.agent_round_present(uuid, text, jsonb, boolean, text), public.agent_round_change(uuid, uuid, text, int, jsonb, uuid, jsonb), public.agent_offer_layers(uuid, uuid), public.agent_document_close(uuid, text), public.agent_negotiation_withdraw(uuid, text, timestamptz, text) to authenticated;

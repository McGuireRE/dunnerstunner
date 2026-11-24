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
create unique index offer_signings_draft_round_live on public.offer_signings (draft_id, round_no) where status not in ('cancelled', 'withdrawn');
-- a signing stopped because a side withdrew (or the vendors declined) has its own status, distinct from Tim cancelling it (widened)
alter table public.offer_signings drop constraint offer_signings_status_check, add constraint offer_signings_status_check check (status in ('ready', 'signing', 'held', 'complete', 'locked', 'replaced', 'cancelled', 'withdrawn'));
alter table public.offer_signers add column person_id uuid references public.property_people(id);
alter table public.offer_rounds add column document_id uuid references public.offer_documents(id), add column doc_round integer check (doc_round is null or doc_round >= 1),
  add column side text not null default 'purchaser' check (side in ('purchaser', 'vendor')), add column base_round_id uuid references public.offer_rounds(id),
  add column changes integer not null default 0 check (changes >= 0), add column lifted jsonb not null default '[]'::jsonb check (jsonb_typeof(lifted) = 'array'),
  add column outstanding jsonb not null default '[]'::jsonb check (jsonb_typeof(outstanding) = 'array');
create unique index offer_rounds_doc_round on public.offer_rounds (document_id, doc_round) where document_id is not null;
alter table public.offer_sign_marks drop constraint offer_sign_marks_kind_check, add constraint offer_sign_marks_kind_check check (kind in ('note', 'strike', 'cross', 'reinstate', 'insert'));
alter table public.offer_sign_receipts drop constraint offer_sign_receipts_guide_check, add constraint offer_sign_receipts_guide_check check (guide in ('cca', 'sale_purchase', 'chattels'));
-- offer_sign_reviews keeps two kinds of rows apart: Tim re-approving Round 1 marks (reviewed_by, as in 020) and the initials that come
-- with a change in a counteroffer (changed_by: the signer who made it; nobody reviewed it)
alter table public.offer_sign_reviews add column kind text not null default 'review' check (kind in ('review', 'change')), add column changed_by text, alter column reviewed_by drop not null;
alter table public.offer_sign_reviews add constraint offer_sign_reviews_who check ((kind = 'review' and reviewed_by is not null and changed_by is null) or (kind = 'change' and reviewed_by is null and changed_by is not null));
-- the per-network limit on changes from a link is kept with the others (widened, nothing removed)
alter table public.offer_hits drop constraint offer_hits_kind_check, add constraint offer_hits_kind_check check (kind in ('info', 'bad', 'submit', 'ai', 'sign_code', 'sign_try', 'sign_change'));
-- Tim's setting: does a side sign again every round, or only where its signature was lifted (the default)?
alter table public.offer_settings add column resign_every_round boolean not null default false;
-- Tim's setting: may the side a round goes to make changes from their own link? (off by default, Tim, 24 November 2026; he switches it on for each round)
alter table public.offer_settings add column link_changes_default boolean not null default false;   -- off: Tim switches link changes on per round (Tim, 24 November 2026)
grant select (resign_every_round, link_changes_default) on public.offer_settings to authenticated;
-- and the choice Tim made for each round he presents (null for Round 1, which has no changes)
alter table public.offer_signings add column link_changes boolean;
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
  round_sha256 text not null check (round_sha256 ~ '^[0-9a-f]{64}$'),   -- the round it was drawn from (its layers, again)
  draw_version text not null check (length(draw_version) between 3 and 40),
  terms jsonb not null check (jsonb_typeof(terms) = 'object'),           -- the agreed terms, for later phases to read from here
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

-- ───── Freeze and withdrawal (Tim, 24 November 2026): Tim alone stops an offer ─────
-- A freeze stops every round of an offer at once: nobody can sign, initial, change, submit or get a code on it, and their links say only
-- that this version is no longer being signed. Tim lifts it. A withdrawal does all that for good, recorded for the party who directed it.
-- A party may ask from their own link; the request alone stops only that person, until Tim acts. Nothing signed ever changes.
create table public.offer_holds (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.property_offers(id),
  property_id uuid not null references public.properties(id),
  kind text not null check (kind in ('freeze', 'withdraw')),
  side text check (side is null or side in ('purchaser', 'vendor')),   -- withdraw: the side that directed it
  person text check (person is null or length(person) <= 250),        -- withdraw: who directed it; freeze: who asked (or Tim)
  reason text not null check (length(reason) between 3 and 500),
  told_at timestamptz, told_how text check (told_how is null or told_how in ('in_person', 'phone', 'email', 'link_request')),
  request_id uuid,
  made_by text not null, made_at timestamptz not null default now(),
  lifted_at timestamptz, lifted_by text, lift_note text
);
create index on public.offer_holds (offer_id);
create table public.offer_requests (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.property_offers(id),
  property_id uuid not null references public.properties(id),
  signing_id uuid not null references public.offer_signings(id),
  signer_id uuid not null references public.offer_signers(id),
  side text not null check (side in ('purchaser', 'vendor')),
  kind text not null check (kind in ('freeze', 'withdraw')),
  reason_key text not null check (reason_key in ('finance_changed', 'contract_elsewhere', 'incapacitated', 'property_integrity', 'property_viability', 'other')),
  reason text not null check (length(reason) between 3 and 500),
  at timestamptz not null default now(), net_hash text,
  handled_at timestamptz, handled_by text, handled_as text check (handled_as is null or handled_as in ('freeze', 'withdraw', 'carry_on'))
);
create index on public.offer_requests (offer_id);
create or replace function public.guard_offer_hold() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'These records are never removed'; end if;
  if coalesce(current_setting('offers.fn', true), '') <> 'on' then raise exception 'Changed only through Tim''s offer screens, so there is a record'; end if;
  if tg_table_name = 'offer_holds' then
    -- only a freeze is ever lifted, once; everything else stays as made
    if old.lifted_at is not null or old.kind <> 'freeze' or (to_jsonb(new) - array['lifted_at', 'lifted_by', 'lift_note']) is distinct from (to_jsonb(old) - array['lifted_at', 'lifted_by', 'lift_note']) then raise exception 'This record is kept exactly as it was made'; end if;
  elsif tg_table_name = 'offer_requests' then
    if old.handled_at is not null or (to_jsonb(new) - array['handled_at', 'handled_by', 'handled_as']) is distinct from (to_jsonb(old) - array['handled_at', 'handled_by', 'handled_as']) then raise exception 'This record is kept exactly as it was made'; end if;
  else raise exception 'This record is kept exactly as it was made';
  end if;
  return new;
end $$;
create trigger guard_offer_holds before update or delete on public.offer_holds for each row execute function public.guard_offer_hold();
create trigger guard_offer_requests before update or delete on public.offer_requests for each row execute function public.guard_offer_hold();
create trigger offer_holds_no_truncate before truncate on public.offer_holds for each statement execute function public.guard_offer_truncate();
create trigger offer_requests_no_truncate before truncate on public.offer_requests for each statement execute function public.guard_offer_truncate();
alter table public.offer_holds enable row level security;
alter table public.offer_requests enable row level security;
create policy ohd_agent_read on public.offer_holds for select using (public.is_agent());
create policy orq_agent_read on public.offer_requests for select using (public.is_agent());
revoke all on public.offer_holds, public.offer_requests from anon;
revoke insert, update, delete, truncate, references, trigger on public.offer_holds, public.offer_requests from authenticated;
-- is the offer frozen (a freeze not lifted) or withdrawn (for good)?
create or replace function public.offer_hold_active(p_offer uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.offer_holds h where h.offer_id = p_offer and (h.kind = 'withdraw' or h.lifted_at is null)) $$;
-- what a signer's own link says when they can't go on: replaced, their own request with Tim, or the signing's reason
create or replace function public.offer_sign_stop_for(s public.offer_signers, g public.offer_signings) returns text language plpgsql stable security definer set search_path = public as $$
begin
  -- a freeze or withdrawal first: a withdrawn signer's places are voided too, and they are told only the neutral line
  if public.offer_hold_active(g.offer_id) then return 'This version is no longer being signed. Tim will be in touch.'; end if;
  if s.void_at is not null then return 'This version has been replaced. Tim will send you the new one.'; end if;
  if exists (select 1 from public.offer_requests r where r.signer_id = s.id and r.handled_at is null) then return 'Your request has gone to Tim. He will contact you straight away.'; end if;
  return public.offer_sign_current(g);
end $$;

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
      if not exists (select 1 from jsonb_array_elements(p_places) e where (e->>'signer')::int = s and e->>'kind' = 'signature' and e->>'why' = 'block') then return false; end if;   -- the signature block (a drawn box is extra)
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
-- text made plain before it is compared (as DRAFT.plainText): full-width digits and signs as ordinary ones, every kind of space as a
-- plain space, zero-width characters gone, no spaces around an @
create or replace function public.offer_plain(t text) returns text language sql immutable as $$
  select regexp_replace(regexp_replace(regexp_replace(normalize(coalesce(t, ''), NFKC), '[​-‍⁠﻿]', '', 'g'), '[\s   -     　]+', ' ', 'g'), '\s*@\s*', '@', 'g') $$;
-- whose own phone or email (a purchaser's or a vendor's) some words hold, or null (phase 2's privacy rule, here for typed changes).
-- The vendors are everyone on the property file and everyone on its agency agreements.
create or replace function public.offer_private_hit(p_offer uuid, p_text text) returns text language plpgsql stable security definer set search_path = public as $$
declare o public.property_offers; t text := lower(public.offer_plain(p_text)); runs text[]; r record; v text;
begin
  select * into o from public.property_offers where id = p_offer; if o.id is null or t = '' then return null; end if;
  select coalesce(array_agg(public.offer_nsn(m[1])), '{}') into runs from regexp_matches(t, '([+(]?\d[\d\s().\/_\-]{4,}\d)', 'g') m;
  for r in
    select 'a purchaser' who, o.details->>'email' email, o.details->>'phone' phone
    union all select 'a purchaser', q->>'email', q->>'phone' from jsonb_array_elements(coalesce(o.details->'purchasers', '[]'::jsonb)) q
    union all select 'a vendor', pp.email, pp.phone from public.property_people pp where pp.property_id = o.property_id
    union all select 'a vendor', ap.email, ap.phone from public.agreement_people ap join public.agreements a on a.id = ap.agreement_id where a.property_id = o.property_id
  loop
    v := lower(public.offer_plain(trim(coalesce(r.email, ''))));
    if length(v) >= 5 and position('@' in v) > 0 and position(v in t) > 0 then return r.who; end if;
    v := public.offer_nsn(public.offer_plain(r.phone));
    if length(v) >= 7 and exists (select 1 from unnest(runs) x where length(x) >= 6 and position(v in x) > 0) then return r.who; end if;
  end loop;
  return null;
end $$;
-- a change's rectangle on the page (as NEGO.changeRect; typed words allowed their widest, 0.62 of the size a letter)
create or replace function public.offer_change_rect(p_kind text, g jsonb) returns jsonb language plpgsql immutable as $$
declare xs numeric[]; ys numeric[];
begin
  if p_kind = 'strike' then return jsonb_build_object('x', least((g->>'x0')::numeric, (g->>'x1')::numeric), 'y', (g->>'y')::numeric - 4, 'w', abs((g->>'x1')::numeric - (g->>'x0')::numeric), 'h', 8);
  elsif p_kind = 'cross' then return jsonb_build_object('x', (g->>'x')::numeric, 'y', (g->>'y')::numeric, 'w', (g->>'w')::numeric, 'h', (g->>'h')::numeric);
  elsif p_kind = 'insert' then return jsonb_build_object('x', (g->>'x')::numeric, 'y', (g->>'y')::numeric - 2, 'w', greatest(8, length(g->>'text') * coalesce((g->>'size')::numeric, 9) * 0.62), 'h', coalesce((g->>'size')::numeric, 9) + 4);
  elsif p_kind = 'note' then
    select array_agg((pt->>0)::numeric), array_agg((pt->>1)::numeric) into xs, ys from jsonb_array_elements(g->'strokes') st, jsonb_array_elements(st) pt;
    return jsonb_build_object('x', (select min(v) from unnest(xs) v), 'y', (select min(v) from unnest(ys) v), 'w', greatest(4, (select max(v) - min(v) from unnest(xs) v)), 'h', greatest(4, (select max(v) - min(v) from unnest(ys) v)));
  end if;
  return jsonb_build_object('x', (g->>'x')::numeric - 4, 'y', (g->>'y')::numeric - 4, 'w', 50, 'h', 10);   -- a reinstatement
end $$;
-- the gap between a place and a rectangle, in points (0 when they touch)
create or replace function public.offer_gap(p jsonb, r jsonb) returns numeric language sql immutable as $$
  select sqrt(power(greatest(0, (r->>'x')::numeric - ((p->>'x')::numeric + (p->>'w')::numeric), (p->>'x')::numeric - ((r->>'x')::numeric + (r->>'w')::numeric)), 2)
            + power(greatest(0, (r->>'y')::numeric - ((p->>'y')::numeric + (p->>'h')::numeric), (p->>'y')::numeric - ((r->>'y')::numeric + (r->>'h')::numeric)), 2)) $$;
-- the date place on the map a draft was made with ({ page, x, y, w, h } as the date is written there), or null
create or replace function public.offer_date_place(p_draft uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select e from public.offer_drafts d join public.offer_blank_maps bm on bm.id = d.map_id, jsonb_array_elements(bm.places) e
  where d.id = p_draft and (e->>'id' = 'date' or e->>'kind' = 'date') and jsonb_typeof(e->'x') = 'number' and jsonb_typeof(e->'y') = 'number' order by (e->>'id' = 'date') desc limit 1 $$;
-- 020's guards on a signing and its signers, with 'withdrawn' (a side withdrew) as final as 'cancelled' is
create or replace function public.guard_offer_signing() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Signing records are never removed'; end if;
  if coalesce(current_setting('offers.fn', true), '') <> 'on' then raise exception 'Signing is changed only through the signing screens, so there is a record'; end if;
  if (to_jsonb(new) - array['status', 'sent_at', 'held_at', 'completed_at', 'locked_at', 'replaced_at', 'replaced_by']) is distinct from (to_jsonb(old) - array['status', 'sent_at', 'held_at', 'completed_at', 'locked_at', 'replaced_at', 'replaced_by']) then
    raise exception 'What was released for signing is kept as it was'; end if;
  if old.status in ('locked', 'replaced', 'cancelled', 'withdrawn') then raise exception 'This signing is finished and kept as it was'; end if;
  return new;
end $$;
create or replace function public.guard_offer_signer() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Signing records are never removed'; end if;
  if coalesce(current_setting('offers.fn', true), '') <> 'on' then raise exception 'Signing is changed only through the signing screens, so there is a record'; end if;
  if new.signing_id is distinct from old.signing_id or new.position is distinct from old.position or new.name is distinct from old.name or new.email is distinct from old.email then raise exception 'Who signs is kept as it was released'; end if;
  if old.void_at is not null then raise exception 'These signatures were replaced, and are kept as they were'; end if;
  if new.void_at is not null and new.token_hash is null and new.session_hash is null and new.code_hash is null
     and (select status from public.offer_signings where id = old.signing_id) in ('ready', 'signing', 'held', 'complete')
     and (to_jsonb(new) - array['void_at', 'token_hash', 'session_hash', 'code_hash']) is not distinct from (to_jsonb(old) - array['void_at', 'token_hash', 'session_hash', 'code_hash']) then return new; end if;
  if (select status from public.offer_signings where id = old.signing_id) in ('complete', 'locked', 'replaced', 'cancelled', 'withdrawn') then raise exception 'Signing is finished, so the signers are kept as they were'; end if;
  if old.finished_at is not null and new.finished_at is not null and (to_jsonb(new) - array['void_at', 'token_hash', 'session_hash', 'code_hash', 'session_expires_at', 'code_expires_at', 'code_tries'])
     is distinct from (to_jsonb(old) - array['void_at', 'token_hash', 'session_hash', 'code_hash', 'session_expires_at', 'code_expires_at', 'code_tries']) then raise exception 'A finished signature is kept as it was'; end if;
  if (new.sig_png is distinct from old.sig_png or new.init_png is distinct from old.init_png) and exists (select 1 from public.offer_sign_taps t where t.signer_id = old.id) then raise exception 'Your signature and initials are kept as you first used them'; end if;
  return new;
end $$;
-- 020's check that a signing is still the one to sign, with the negotiation added: its document must be open, and no agreement made
create or replace function public.offer_sign_current(g public.offer_signings) returns text language plpgsql stable set search_path = public as $$
declare d public.offer_drafts; o public.property_offers; ds text;
begin
  -- frozen or withdrawn by Tim (offer_holds): every round of the offer stops at once, for everyone, with nothing said beyond this
  if public.offer_hold_active(g.offer_id) then return 'This version is no longer being signed. Tim will be in touch.'; end if;
  if g.status = 'replaced' then return 'This version has been replaced. Tim will send you the new one.'; end if;
  if g.status = 'locked' then return 'Signing is finished, and the signed copy is locked.'; end if;
  if g.status = 'cancelled' then return 'This signing was stopped before anyone signed. Tim will send it to you again.'; end if;
  select * into d from public.offer_drafts where id = g.draft_id; select * into o from public.property_offers where id = g.offer_id;
  -- Tim mediates (24 November 2026): a party's link never says what the other side, or Tim, has decided. He tells them himself.
  if g.status = 'withdrawn' or o.status in ('withdrawn', 'lapsed', 'declined') then return 'This version is no longer being signed. Tim will be in touch.'; end if;
  if exists (select 1 from public.offer_agreements a where a.offer_id = g.offer_id) then return 'This version is no longer being signed. Tim will be in touch.'; end if;
  if g.document_id is not null then
    select status into ds from public.offer_documents where id = g.document_id;
    if ds is distinct from 'open' then return 'This version is no longer being signed. Tim will be in touch.'; end if;
  end if;
  if d.number <> (select max(number) from public.offer_drafts where offer_id = g.offer_id) or o.details is distinct from d.details then
    -- Round 1 is the purchasers' own offer; from Round 2 on, the other side's correction is Tim's to tell (he mediates)
    return case when g.round_no > 1 then 'This version is no longer being signed. Tim will be in touch.' else 'The offer has changed since it was sent for signing. Tim will send you the new version.' end; end if;
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
-- stop every signing of an offer still in progress: signers void, their links closed, recorded. 'withdrawn' when a side withdrew or
-- declined (or the offer lapsed); 'cancelled' when Tim closed the document for a fresh copy.
create or replace function public.offer_stop_signings(p_offer uuid, p_document uuid, p_actor text, p_reason text, p_status text default 'cancelled') returns int language plpgsql security definer set search_path = public as $$
declare g public.offer_signings; n int := 0;
begin
  if p_status not in ('cancelled', 'withdrawn') then raise exception 'Unknown status'; end if;
  perform set_config('offers.fn', 'on', true);
  for g in select * from public.offer_signings where offer_id = p_offer and status in ('ready', 'signing', 'held', 'complete') and (p_document is null or document_id = p_document) order by released_at for update loop
    update public.offer_signers set void_at = now(), token_hash = null, session_hash = null, code_hash = null where signing_id = g.id and void_at is null;   -- before the status changes
    update public.offer_signings set status = p_status where id = g.id;
    insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, left(coalesce(p_actor, 'agent'), 254), 'sign_' || case when p_status = 'withdrawn' then 'withdrawn' else 'cancelled' end,
      jsonb_build_object('signing_id', g.id, 'round', g.round_no, 'side', g.side, 'method', g.method, 'links_sent', g.sent_at is not null, 'reason', left(p_reason, 300)));
    n := n + 1;
  end loop;
  return n;
end $$;
-- close the offer's open document (a fresh copy, or the offer withdrawn, declined or lapsed): filed as history, every round kept
create or replace function public.offer_doc_close(p_offer uuid, p_actor text, p_reason text) returns int language plpgsql security definer set search_path = public as $$
declare doc public.offer_documents;
begin
  select * into doc from public.offer_documents where offer_id = p_offer and status = 'open' for update; if doc.id is null then return null; end if;
  perform set_config('offers.fn', 'on', true);
  update public.offer_documents set status = 'closed', closed_at = now(), closed_by = left(coalesce(p_actor, 'agent'), 254), close_reason = left(p_reason, 500) where id = doc.id;
  return doc.number;
end $$;

-- ───── the signing steps, as in 020, with the negotiation rounds ─────
-- receipts: the vendors' chattels reminder is receipted like the guides
create or replace function public.offer_sign_do_receipt(p_signer uuid, p_guide text, p_version text, p_file text, p_sha256 text, p_pages int[]) returns void language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings;
begin
  perform public.offer_lock_by_signer(p_signer);   -- lock order: the offer, then the signing, then the signer
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
  perform public.offer_lock_by_signer(p_signer);   -- lock order: the offer, then the signing, then the signer
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
declare s public.offer_signers; g public.offer_signings; t public.offer_sign_marks; w numeric; h numeric; n int; x jsonb; who text; reopened int; rc jsonb; dp jsonb; back jsonb;
begin
  perform public.offer_lock_by_signer(p_signer);   -- lock order: the offer, then the signing, then the signer
  perform 1 from public.offer_signings where id = (select signing_id from public.offer_signers where id = p_signer) for update;   -- as finishing does: the signing, then the signer
  select * into s from public.offer_signers where id = p_signer for update; g := public.offer_sign_ready(s, true);
  if g.round_no < 2 then raise exception 'Changes are made when the offer is answered, from Round 2 on'; end if;
  if s.consent_at is null then raise exception 'Agree to sign electronically first'; end if;
  if p_id is null or exists (select 1 from public.offer_sign_marks where id = p_id) then raise exception 'Please try that again'; end if;
  if (select count(*) from public.offer_sign_marks where signer_id = s.id and at > now() - interval '1 hour') >= 30 then raise exception 'You have made a lot of changes in the last hour. Please call Tim on 027 562 7207'; end if;
  if p_page is null or p_page < 1 or p_page > jsonb_array_length(g.pages) then raise exception 'That page isn''t in the document'; end if;
  w := (g.pages->(p_page - 1)->>0)::numeric; h := (g.pages->(p_page - 1)->>1)::numeric;
  if coalesce(p_kind, '') not in ('note', 'strike', 'cross', 'reinstate', 'insert') or not public.offer_change_ok(p_kind, p_geometry, w, h) then raise exception 'That change doesn''t sit on the page'; end if;
  if p_kind = 'reinstate' then
    select * into t from public.offer_sign_marks m where m.id = p_target and (m.signing_id = g.id or m.signing_id in (select r.signing_id from public.offer_rounds r where r.document_id = g.document_id));
    if t.id is null or t.kind not in ('strike', 'cross') then raise exception 'Choose a line or crossed-out box to reinstate'; end if;
    if exists (select 1 from public.offer_sign_marks where target = t.id and kind = 'reinstate') then raise exception 'That has already been reinstated'; end if;
  elsif p_target is not null then raise exception 'Only a reinstatement points at another change';
  end if;
  -- the date at the top is Tim's alone, added once the agreement is made: no change may sit on its place
  rc := public.offer_change_rect(p_kind, p_geometry); dp := public.offer_date_place(g.draft_id);
  if dp is not null and (dp->>'page')::int = p_page and public.offer_gap(jsonb_build_object('x', (dp->>'x')::numeric, 'y', (dp->>'y')::numeric - 2, 'w', coalesce((dp->>'w')::numeric, 100), 'h', coalesce((dp->>'h')::numeric, 10) + 2), rc) = 0
     and least((dp->>'x')::numeric + coalesce((dp->>'w')::numeric, 100), (rc->>'x')::numeric + (rc->>'w')::numeric) > greatest((dp->>'x')::numeric, (rc->>'x')::numeric)
     and least((dp->>'y')::numeric + coalesce((dp->>'h')::numeric, 10), (rc->>'y')::numeric + (rc->>'h')::numeric) > greatest((dp->>'y')::numeric - 2, (rc->>'y')::numeric) then
    raise exception 'That is where the date goes once the agreement is made. Make the change somewhere else'; end if;
  if p_kind = 'insert' then who := public.offer_private_hit(g.offer_id, p_geometry->>'text');
    if who is not null then raise exception 'Those words hold %''s own phone or email, so they can''t go on the agreement. Only the lawyers'' details go on it', who; end if; end if;
  -- a new further term (typed words starting "N.0 " or "N. "): N must be free in this agreement: above the newest draft's term_last
  -- and every retired number, and not taken by another counteroffer term in this document (any round, this one too). The signing
  -- row is locked above, so two additions at once can't both take N. The message names the next free number; the page retries with it.
  if p_kind = 'insert' and (p_geometry->>'text') ~ '^\s*[0-9]{1,3}(\.0|\.)\s' then
    declare tn int := substring(p_geometry->>'text' from '^\s*([0-9]{1,3})')::int; dr public.offer_drafts; used int[]; top_ int; nxt int; sty text;
    begin
      select * into dr from public.offer_drafts where id = g.draft_id;
      select coalesce(array_agg(substring(m.geometry->>'text' from '^\s*([0-9]{1,3})')::int), '{}') into used from public.offer_sign_marks m
        where m.kind = 'insert' and (m.geometry->>'text') ~ '^\s*[0-9]{1,3}(\.0|\.)\s'
          and (m.signing_id = g.id or m.signing_id in (select x3.signing_id from public.offer_rounds x3 where x3.document_id = g.document_id));
      top_ := greatest(coalesce((dr.edits->>'term_last')::int, 0), coalesce((select max(v::int) from jsonb_array_elements_text(coalesce(dr.edits->'retired_numbers', '[]'::jsonb)) v), 0), coalesce((select max(u) from unnest(used) u), 0));
      if tn <= greatest(coalesce((dr.edits->>'term_last')::int, 0), coalesce((select max(v::int) from jsonb_array_elements_text(coalesce(dr.edits->'retired_numbers', '[]'::jsonb)) v), 0)) or tn = any(used)
         or tn > top_ + 1 then
        nxt := top_ + 1;
        while exists (select 1 from jsonb_array_elements_text(coalesce(dr.edits->'retired_numbers', '[]'::jsonb)) v where v::int = nxt) loop nxt := nxt + 1; end loop;
        sty := case when (p_geometry->>'text') ~ '^\s*[0-9]{1,3}\.0\s' then '.0' else '.' end;
        raise exception 'Further term % is already taken or out of order in this agreement. The next free number is %', tn || sty, nxt || sty;
      end if;
    end;
  end if;
  -- the initials of everyone on this side, one each, beside the change
  select count(*) into n from public.offer_signers where signing_id = g.id and void_at is null;
  if not public.offer_sign_places_ok(p_places, g.pages, n, false) or jsonb_array_length(p_places) <> n then raise exception 'Everyone on your side initials each change once'; end if;
  for x in select * from jsonb_array_elements(p_places) loop
    if x->>'why' <> 'change' or x->>'kind' <> 'initial' or x->>'ref' is distinct from p_id::text or x->>'id' <> ('chg:' || p_id || ':s' || (x->>'signer')) then raise exception 'Everyone on your side initials each change once'; end if;
    if (x->>'page')::int <> p_page or public.offer_gap(x, rc) > 60 then raise exception 'Each person''s initials go beside the change, on its page'; end if;
  end loop;
  insert into public.offer_sign_marks (id, signing_id, signer_id, by_name, kind, page, geometry, target) values (p_id, g.id, s.id, s.name, p_kind, p_page, p_geometry, case when p_kind = 'reinstate' then p_target end);
  perform set_config('offers.fn', 'on', true);
  insert into public.offer_sign_reviews (signing_id, marks, places, places_sha256, kind, changed_by) values (g.id, array[p_id], p_places, public.offer_sha(p_places::text), 'change', left(s.name, 254));
  -- anyone on this side who had finished initials the change and finishes again (a draft for each, by link, that Tim sends himself)
  select coalesce(jsonb_agg(jsonb_build_object('id', x2.id, 'position', x2.position, 'name', x2.name, 'email', case when g.method = 'link' then x2.email end) order by x2.position), '[]'::jsonb) into back
    from public.offer_signers x2 where x2.signing_id = g.id and x2.finished_at is not null and x2.void_at is null and x2.id <> s.id;
  update public.offer_signers set finished_at = null, seen_sha256 = null where signing_id = g.id and finished_at is not null and void_at is null;
  get diagnostics reopened = row_count;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, s.name, 'round_change',
    jsonb_build_object('signing_id', g.id, 'round', g.round_no, 'side', g.side, 'mark_id', p_id, 'kind', p_kind, 'page', p_page, 'signer', s.position, 'target', p_target, 'text', case when p_kind = 'insert' then p_geometry->>'text' end, 'reopened', reopened));
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('id', p_id, 'reopened', reopened, 'reopened_signers', back, 'by', s.name, 'method', g.method, 'side', g.side, 'round', g.round_no, 'offer_id', g.offer_id,
    'address', (select address from public.properties where id = g.property_id));
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
  if public.offer_hold_active(o.id) then raise exception 'This offer is frozen or withdrawn, so nothing is released for signing. Unfreeze it first; a withdrawn offer is never signed again'; end if;
  if not exists (select 1 from public.offer_draft_approvals a where a.draft_id = d.id and a.sha256 = d.sha256) then raise exception 'Approve the draft first'; end if;
  if d.number <> (select max(number) from public.offer_drafts where offer_id = d.offer_id) then raise exception 'There is a newer draft of this offer. Use that one'; end if;
  if o.details is distinct from d.details then raise exception 'The offer has changed since this draft. Re-draft and approve it first'; end if;
  -- a draft made before the further terms numbering and the term boxes (24 November 2026) can't be signed: a counteroffer term on it
  -- would be numbered from 1, and the purchasers would have nowhere to initial each term
  if not (d.edits ? 'term_last') or exists (select 1 from jsonb_array_elements(d.placed) x where x->>'id' = 'further_terms' and jsonb_array_length(coalesce(x->'terms', '[]'::jsonb)) > 0
      and jsonb_array_length(case when jsonb_typeof(x->'term_boxes') = 'array' then x->'term_boxes' else '[]'::jsonb end) = 0) then
    raise exception 'This draft was made before signing was added. Make a fresh draft from the offer, then choose Ready to sign.'; end if;
  if o.status in ('withdrawn', 'lapsed', 'declined') then raise exception 'This offer has been withdrawn, declined or has lapsed'; end if;
  if exists (select 1 from public.offer_documents x where x.offer_id = o.id and x.status in ('open', 'agreed')) then raise exception 'This offer already has a signed Round 1. For a fresh copy, close the current document first'; end if;
  if exists (select 1 from public.offer_documents x where x.draft_id = d.id) then raise exception 'That draft belongs to a closed document. Re-draft the offer for a fresh copy'; end if;
  select id into sid from public.offer_signings where draft_id = d.id and round_no = 1 and status not in ('cancelled', 'withdrawn');
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
  perform public.offer_lock_by_signer(p_signer);   -- lock order: the offer, then the signing, then the signer
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
create or replace function public.agent_round_present(p_offer uuid, p_method text, p_places jsonb, p_checked boolean, p_note text default null, p_link_changes boolean default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); o public.property_offers; doc public.offer_documents; last public.offer_rounds; base public.offer_signings; side_ text; n int; sid uuid; ex uuid; em text; i int; x jsonb; first_ boolean; m record; ppl jsonb;
  prev public.offer_rounds; owners uuid[]; resign boolean := coalesce((select resign_every_round from public.offer_settings limit 1), false); mk public.offer_sign_marks;
  lc boolean := coalesce(p_link_changes, (select link_changes_default from public.offer_settings limit 1), false);
begin
  if coalesce(p_method, '') not in ('in_person', 'link') then raise exception 'Choose in person or by link'; end if;
  select * into o from public.property_offers where id = p_offer for update; if o.id is null then raise exception 'No such offer'; end if;
  if public.offer_hold_active(o.id) then raise exception 'This offer is frozen or withdrawn, so nothing is presented. Unfreeze it first; a withdrawn offer is never presented again'; end if;
  if o.status in ('withdrawn', 'lapsed', 'declined') then raise exception 'This offer has been withdrawn or has lapsed'; end if;
  if exists (select 1 from public.offer_agreements a where a.offer_id = o.id) then raise exception 'The agreement has been made'; end if;
  select * into doc from public.offer_documents where offer_id = o.id and status = 'open';
  if doc.id is null and exists (select 1 from public.offer_documents x where x.offer_id = o.id and x.status = 'closed') then raise exception 'The last document was closed (withdrawn, declined or for a fresh copy). Correct the offer, re-draft it, and have the purchasers sign a fresh copy first'; end if;
  if doc.id is null then raise exception 'Lock Round 1 first: the purchasers sign the offer before it goes to the vendors'; end if;
  last := public.offer_doc_last(doc.id);
  if p_checked is not true then raise exception 'Tick that you have looked at Round % first', last.doc_round; end if;
  if last.doc_round > 1 and last.changes = 0 and jsonb_array_length(last.outstanding) = 0 then raise exception 'Round % accepted everything with nothing changed. Confirm the agreement instead', last.doc_round; end if;
  side_ := case when last.side = 'purchaser' then 'vendor' else 'purchaser' end;
  select id into ex from public.offer_signings where draft_id = doc.draft_id and round_no = last.doc_round + 1 and status not in ('cancelled', 'withdrawn');
  if ex is not null then return jsonb_build_object('id', ex, 'existing', true); end if;
  select * into base from public.offer_signings where id = last.signing_id;
  -- who signs: a side's later round, the same people as its newest locked round (in the same order); the vendors' first round, the owners
  -- on the property (by their legal names); the purchasers, as Round 1 had them (the same draft)
  select * into prev from public.offer_rounds r where r.document_id = doc.id and r.side = side_ order by r.doc_round desc limit 1;
  if prev.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'email', coalesce(nullif(lower(trim(coalesce((select pp.email from public.property_people pp where pp.id = x.person_id), ''))), ''), x.email), 'person', x.person_id) order by x.position), '[]'::jsonb)
      into ppl from public.offer_signers x where x.signing_id = prev.signing_id and x.void_at is null;
    if side_ = 'vendor' then
      select coalesce(array_agg(pp.id order by pp.id), '{}') into owners from public.property_people pp where pp.property_id = o.property_id and coalesce(pp.role, 'owner') = 'owner';
      if owners is distinct from (select coalesce(array_agg((q->>'person')::uuid order by (q->>'person')::uuid), '{}') from jsonb_array_elements(ppl) q) then
        raise exception 'The owners on the property have changed since Round %. Start a fresh copy, so the right people sign', prev.doc_round; end if;
    end if;
  elsif side_ = 'vendor' then
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
  -- the places: a side's first round signs and has the foot of every page; later, everyone signs again only where Tim's setting says
  -- (every round) or the core found their signature lifted; every signer initials each change the other side made, beside it
  first_ := prev.id is null;
  if not public.offer_sign_places_ok(p_places, base.pages, n, first_) then raise exception 'Please check the signing places: everyone signs%', case when first_ then ', and initials the foot of every page' else '' end; end if;
  if first_ or resign then
    for i in 1..n loop
      if not exists (select 1 from jsonb_array_elements(p_places) e where (e->>'signer')::int = i and e->>'kind' = 'signature' and e->>'why' = 'block') then raise exception 'Please check the signing places: everyone signs'; end if;
    end loop;
  end if;
  for m in select k.id from public.offer_sign_marks k where k.signing_id = last.signing_id loop
    for i in 1..n loop
      if not exists (select 1 from jsonb_array_elements(p_places) e where e->>'id' = 'chg:' || m.id || ':s' || i and e->>'why' = 'change' and e->>'kind' = 'initial') then raise exception 'Please check the signing places: everyone initials each change made in Round %', last.doc_round; end if;
    end loop;
  end loop;
  -- initials for a change sit on its page, within about 60 points of it
  for x in select * from jsonb_array_elements(p_places) e where e->>'why' = 'change' loop
    select * into mk from public.offer_sign_marks k where k.id::text = x->>'ref' and k.signing_id in (select r.signing_id from public.offer_rounds r where r.document_id = doc.id);
    if mk.id is null or (x->>'page')::int <> mk.page or public.offer_gap(x, public.offer_change_rect(mk.kind, mk.geometry)) > 60 then raise exception 'Please check the signing places: initials for a change go beside it'; end if;
  end loop;
  perform set_config('offers.fn', 'on', true);
  insert into public.offer_signings (offer_id, property_id, draft_id, draft_sha256, method, pages, places, places_sha256, cca_pages, released_by, round_no, side, document_id, base_round_id, link_changes)
  values (o.id, o.property_id, doc.draft_id, doc.draft_sha256, p_method, base.pages, p_places, public.offer_sha(p_places::text), '{}', me, last.doc_round + 1, side_, doc.id, last.id, lc) returning id into sid;
  for i in 0..n - 1 loop
    insert into public.offer_signers (signing_id, position, name, email, person_id) values (sid, i + 1, left(ppl->i->>'name', 250), ppl->i->>'email', (ppl->i->>'person')::uuid);
  end loop;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, o.id, me, 'round_presented',
    jsonb_build_object('signing_id', sid, 'document', doc.number, 'round', last.doc_round + 1, 'side', side_, 'method', p_method, 'checked_round', last.doc_round, 'checked_sha256', last.sha256, 'signers', n, 'places', jsonb_array_length(p_places), 'places_sha256', public.offer_sha(p_places::text), 'note', left(nullif(trim(coalesce(p_note, '')), ''), 300), 'link_changes', lc));
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('id', sid, 'existing', false, 'round', last.doc_round + 1, 'side', side_, 'link_changes', lc);
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
  stopped := public.offer_stop_signings(o.id, doc.id, me, 'The document was closed for a fresh copy', 'cancelled');
  select count(*) into rounds from public.offer_rounds where document_id = doc.id;
  perform public.offer_doc_close(o.id, me, why);
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, o.id, me, 'document_closed', jsonb_build_object('document_id', doc.id, 'document', doc.number, 'rounds', rounds, 'stopped', stopped, 'reason', why));
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('ok', true, 'document', doc.number, 'rounds', rounds, 'stopped', stopped);
end $$;
-- 018's withdrawn or lapsed, now also stopping every signing in progress (any links sent stop working)
create or replace function public.agent_offer_status(p_offer uuid, p_status text, p_at timestamptz, p_note text default null) returns void language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); o public.property_offers; at_ timestamptz := coalesce(p_at, now()); stopped int := 0; closed int;
begin
  perform set_config('offers.fn', 'on', true);
  select * into o from public.property_offers where id = p_offer for update; if o.id is null or o.source = 'manual' then raise exception 'No such offer'; end if;
  if p_status not in ('withdrawn','lapsed','received') then raise exception 'Choose withdrawn or lapsed'; end if;
  if exists (select 1 from public.offer_agreements a where a.offer_id = o.id) then raise exception 'The agreement has been made, so it can''t be marked here. Talk to the lawyers'; end if;
  if at_ > now() + interval '5 minutes' or at_ < o.received_at - interval '1 minute' then raise exception 'The time needs to be between when the offer came in and now'; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'The note is too long'; end if;
  -- withdrawn or lapsed: every signing in progress stops and the open document is closed, so marking it current again needs a fresh copy
  if p_status in ('withdrawn', 'lapsed') then stopped := public.offer_stop_signings(o.id, null, me, 'The offer was marked ' || p_status, 'withdrawn'); closed := public.offer_doc_close(o.id, me, 'The offer was marked ' || p_status); perform set_config('offers.fn', 'on', true); end if;
  update public.property_offers set status = p_status, status_at = case when p_status = 'received' then null else at_ end, status_by = me where id = p_offer;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, p_offer, me, 'status', jsonb_build_object('from', o.status, 'to', p_status, 'at', at_, 'note', nullif(trim(coalesce(p_note, '')), ''), 'stopped', stopped, 'document_closed', closed));
  perform set_config('offers.fn', '', true);
end $$;
-- either side tells Tim they are out: the purchasers withdraw their offer ('withdrawn'), or the vendors decline it or withdraw their
-- counteroffer ('declined'). Recorded with the time and the side; every signing in progress stops (status 'withdrawn'), any links stop
-- working, and the open document is closed, so marking the offer current again needs a fresh copy.
create or replace function public.agent_negotiation_withdraw(p_offer uuid, p_side text, p_at timestamptz, p_note text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); o public.property_offers; at_ timestamptz := coalesce(p_at, now()); stopped int; closed int; st text := case when p_side = 'vendor' then 'declined' else 'withdrawn' end;
begin
  if coalesce(p_side, '') not in ('purchaser', 'vendor') then raise exception 'Choose who withdrew: the purchasers or the vendors'; end if;
  select * into o from public.property_offers where id = p_offer for update; if o.id is null or o.source = 'manual' then raise exception 'No such offer'; end if;
  if exists (select 1 from public.offer_agreements a where a.offer_id = o.id) then raise exception 'The agreement has been made, so it can''t be withdrawn here. Talk to the lawyers'; end if;
  if o.status in ('withdrawn', 'lapsed', 'declined') then raise exception 'This offer has already been withdrawn, declined or has lapsed'; end if;
  if at_ > now() + interval '5 minutes' or at_ < o.received_at - interval '1 minute' then raise exception 'The time needs to be between when the offer came in and now'; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'The note is too long'; end if;
  stopped := public.offer_stop_signings(o.id, null, me, case when p_side = 'vendor' then 'The vendors declined' else 'The purchasers withdrew' end, 'withdrawn');
  closed := public.offer_doc_close(o.id, me, case when p_side = 'vendor' then 'The vendors declined' else 'The purchasers withdrew' end);
  perform set_config('offers.fn', 'on', true);
  update public.property_offers set status = st, status_at = at_, status_by = me where id = o.id;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, o.id, me, 'withdrawn', jsonb_build_object('side', p_side, 'status', st, 'from', o.status, 'at', at_, 'note', nullif(trim(coalesce(p_note, '')), ''), 'stopped', stopped, 'document_closed', closed));
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('ok', true, 'stopped', stopped, 'status', st);
end $$;

-- ───── the offer-sign edge function (service role) ─────
-- 020's Send, also saying which side and round it is (for the email's wording)
create or replace function public.offer_sign_issue(p_signing uuid, p_actor text) returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.offer_signings; s public.offer_signers; tok text; out_ jsonb := '[]'::jsonb; why text; addr text;
begin
  perform public.offer_lock_by_signing(p_signing);   -- lock order: the offer, then the signing, then the signer
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
  why := public.offer_sign_stop_for(s, g);
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
    'signing', jsonb_build_object('status', g.status, 'stopped', public.offer_sign_stop_for(s, g), 'pages', g.pages, 'cca_pages', to_jsonb(g.cca_pages),
      'draft_path', case when s.consent_at is not null then d.path end, 'draft_sha256', d.sha256, 'address', addr,   -- the document only once they agree to sign electronically
      'round', g.round_no, 'side', g.side, 'link_changes', coalesce(g.link_changes, false),
      -- the newest draft's further terms numbering, so a new further term in a counteroffer takes the next number (never a retired one);
      -- with no further terms on the draft, the 23.0 style the drafting writes
      'terms', jsonb_build_object('last', d.edits->'term_last', 'retired', coalesce(d.edits->'retired_numbers', '[]'::jsonb),
        'style', coalesce((select e->>'number_style' from jsonb_array_elements(case when jsonb_typeof(d.placed) = 'array' then d.placed else '[]'::jsonb end) e where e->>'id' = 'further_terms' limit 1),
          case when d.edits ? 'term_last' then 'dot0' end)),
      'signers', (select count(*) from public.offer_signers x where x.signing_id = g.id and x.void_at is null),
      'parties', case when g.side = 'vendor' then public.offer_parties(g.offer_id) end,
      'layers', case when g.round_no > 1 and s.consent_at is not null then public.offer_doc_layers(g.document_id, g.round_no - 1) else '[]'::jsonb end,
      'marks', case when g.round_no > 1 then (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'page', m.page, 'geometry', m.geometry, 'target', m.target, 'by', m.by_name, 'at', m.at) order by m.at, m.id), '[]'::jsonb) from public.offer_sign_marks m where m.signing_id = g.id) else '[]'::jsonb end,
      'places', (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(g.places) e where (e->>'signer')::int = s.position
        union all select e from public.offer_sign_reviews r, jsonb_array_elements(r.places) e where r.signing_id = g.id and (e->>'signer')::int = s.position) z),
      'side_places', case when g.round_no > 1 then (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(g.places) e union all select e from public.offer_sign_reviews r, jsonb_array_elements(r.places) e where r.signing_id = g.id) z) else '[]'::jsonb end),
    'taps', (select coalesce(jsonb_agg(t.place_id order by t.id), '[]'::jsonb) from public.offer_sign_taps t where t.signer_id = s.id));
end $$;
-- 020's "Ask Tim for a change" (and, from Round 2 on, "Decline it as it stands"), also saying which side and round, for the email's wording
create or replace function public.offer_sign_ask(p_token text, p_session text, p_text text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings; t text := nullif(trim(regexp_replace(coalesce(p_text, ''), '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]', '', 'g')), ''); addr text;
begin
  s := public.offer_sign_me(p_token, p_session); select * into g from public.offer_signings where id = s.signing_id;
  if s.void_at is not null or g.status in ('locked', 'replaced') then raise exception 'This version is no longer being signed'; end if;
  -- frozen, withdrawn, or they have asked Tim to stop: no ask or decline either
  if public.offer_hold_active(g.offer_id) then raise exception 'This version is no longer being signed. Tim will be in touch.'; end if;
  if exists (select 1 from public.offer_requests r where r.signer_id = s.id and r.handled_at is null) then raise exception 'Your request has gone to Tim. He will contact you straight away.'; end if;
  if t is null or length(t) < 3 or length(t) > 1000 then raise exception 'Please say what you would like changed (up to 1,000 characters)'; end if;
  if (select count(*) from public.offer_sign_asks where signer_id = s.id and at > now() - interval '1 day') >= 10 then raise exception 'You have sent several requests today. Tim will be in touch'; end if;
  insert into public.offer_sign_asks (signing_id, signer_id, text) values (g.id, s.id, t);
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, s.name, 'sign_change_asked', jsonb_build_object('signing_id', g.id, 'signer', s.position, 'length', length(t), 'round', g.round_no, 'side', g.side));
  select address into addr from public.properties where id = g.property_id;
  return jsonb_build_object('ok', true, 'name', s.name, 'address', addr, 'offer_id', g.offer_id, 'side', g.side, 'round', g.round_no);
end $$;
-- a change from a link, by the signer themselves (Round 2 on)
-- (at most 60 changes an hour from one network, kept with the other limits; 30 an hour per signer is checked with the change)
create or replace function public.offer_sign_change(p_token text, p_session text, p_net text, p_id uuid, p_kind text, p_page int, p_geometry jsonb, p_target uuid, p_places jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; n text := public.offer_net(p_net);
begin
  s := public.offer_sign_me(p_token, p_session);
  if (select link_changes from public.offer_signings where id = s.signing_id) is not true then raise exception 'Tim hasn''t switched on changes from this link for this round. You can accept it, decline it, or use Ask Tim for a change'; end if;
  if public.offer_hit_count('sign_change', n, null, interval '1 hour') >= 60 then raise exception 'A lot of changes have been made from here in the last hour. Please call Tim on 027 562 7207'; end if;
  insert into public.offer_hits (kind, net) values ('sign_change', n);
  return public.offer_sign_do_change(s.id, p_id, p_kind, p_page, p_geometry, p_target, p_places);
end $$;
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
    'number', nxt, 'round', g.round_no, 'side', g.side, 'link_changes', g.link_changes, 'document', coalesce(doc.number, (select count(*) from public.offer_documents x where x.offer_id = o.id) + 1),
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
        'reviewed_at', (select min(r.at) from public.offer_sign_reviews r where r.signing_id = g.id and r.kind = 'review' and m.id = any (r.marks))) order by m.at, m.id), '[]'::jsonb) from public.offer_sign_marks m where m.signing_id = g.id),
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
  if public.offer_hold_active(o.id) then raise exception 'This offer is frozen or withdrawn, so no agreement is made while it is'; end if;
  select * into doc from public.offer_documents where offer_id = o.id and status = 'open'; if doc.id is null then raise exception 'There is no open document'; end if;
  last := public.offer_doc_last(doc.id);
  if last.doc_round < 2 then raise exception 'Both sides sign before the agreement is made'; end if;
  if last.changes > 0 then raise exception 'Round % changed the document, so the other side answers it first', last.doc_round; end if;
  if jsonb_array_length(last.outstanding) > 0 then raise exception 'Something is still outstanding on Round %', last.doc_round; end if;
  if exists (select 1 from public.offer_signings g where g.document_id = doc.id and g.round_no > last.doc_round and g.status in ('ready', 'signing', 'held', 'complete')) then raise exception 'A newer round is out for signing. Stop it first'; end if;
  m := regexp_match(t, '^([1-9]|[12][0-9]|3[01]) (January|February|March|April|May|June|July|August|September|October|November|December) (20[0-9]{2})$');
  if m is null then raise exception 'Type the date in full with the month name, for example 24 November 2026'; end if;
  begin dt := make_date(m[3]::int, array_position(mons, m[2]), m[1]::int); exception when others then raise exception 'That date isn''t a real day'; end;
  select max(finished_at) into fin from public.offer_signers where signing_id = last.signing_id;
  if p_accepted_at is null or p_accepted_at > now() + interval '5 minutes' or p_accepted_at < fin - interval '1 minute' then raise exception 'The time acceptance was communicated needs to be after the last signature and not in the future'; end if;
  -- the date: no earlier than the day (in New Zealand) acceptance was communicated, and not after today
  if dt > public.offer_nz_today() or dt < (p_accepted_at at time zone 'Pacific/Auckland')::date then raise exception 'The agreement date needs to be from the day acceptance was communicated to today'; end if;
  -- the date goes only in the blank's own date place: no place, no date (and no agreement until the places are put right)
  if public.offer_date_place(doc.draft_id) is null then raise exception 'The agreement blank has no date place, so the date can''t be added. Add it to the places on the blank first'; end if;
  return jsonb_build_object('document_id', doc.id, 'document', doc.number, 'round_id', last.id, 'round', last.doc_round, 'number', last.number, 'date', dt, 'date_text', t);
end $$;
-- what the edge function needs to make the agreed copy: every round's layers, the date place from the map, and the rounds' fingerprints
create or replace function public.offer_agreement_material(p_offer uuid, p_accepted_at timestamptz, p_date_text text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c jsonb := public.offer_agreement_check(p_offer, p_accepted_at, p_date_text); doc public.offer_documents; d public.offer_drafts; o public.property_offers; addr text; dp jsonb;
begin
  select * into doc from public.offer_documents where id = (c->>'document_id')::uuid; select * into d from public.offer_drafts where id = doc.draft_id; select * into o from public.property_offers where id = p_offer;
  select address into addr from public.properties where id = o.property_id;
  dp := public.offer_date_place(d.id);
  return c || jsonb_build_object('round_sha256', (select sha256 from public.offer_rounds where id = (c->>'round_id')::uuid), 'offer_id', o.id, 'property_id', o.property_id, 'address', addr, 'offer_ref', o.buyer_ref, 'draft', jsonb_build_object('id', d.id, 'number', d.number, 'path', d.path, 'sha256', d.sha256),
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
  if coalesce(p_record->>'draw_version', '') !~ '^[A-Za-z0-9._-]{3,40}$' then raise exception 'Please check the record (drawing version)'; end if;
  if (p_record->'base'->>'sha256') is distinct from (select sha256 from public.offer_rounds where id = p_round) then raise exception 'The agreed copy must be drawn from the newest round'; end if;
  perform set_config('offers.fn', 'on', true);
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, o.id, left(coalesce(p_actor, 'agent'), 254), 'agreement_formed',
    jsonb_build_object('document', (c->>'document')::int, 'round', (c->>'round')::int, 'number', (c->>'number')::int, 'date', c->>'date_text', 'accepted_at', p_accepted_at, 'sha256', p_sha256, 'path', p_path)) returning hash into h;
  insert into public.offer_agreements (offer_id, property_id, document_id, round_id, path, sha256, size_bytes, agreement_date, date_text, accepted_at, record, chain_last, confirmed_by, round_sha256, draw_version, terms)
  values (o.id, o.property_id, (c->>'document_id')::uuid, p_round, p_path, p_sha256, p_size, (c->>'date')::date, c->>'date_text', p_accepted_at, p_record, h, left(coalesce(p_actor, 'agent'), 254),
    (select sha256 from public.offer_rounds where id = p_round), p_record->>'draw_version', public.offer_agreed_terms((c->>'document_id')::uuid)) returning id into aid;
  update public.offer_documents set status = 'agreed', agreed_at = now() where id = (c->>'document_id')::uuid;
  update public.property_offers set status = 'accepted', status_at = p_accepted_at, status_by = left(coalesce(p_actor, 'agent'), 254) where id = o.id;
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('id', aid, 'sha256', p_sha256, 'existing', false, 'property_id', o.property_id);
end $$;

-- the agreed terms, kept with the agreement for later phases (dates, reminders, roadmap emails) to read from here: the offer as drafted
-- (price, settlement, conditions with their dates, the deposit as printed on the blank, KiwiSaver as the buyer gave it) and every change made,
-- in order. Where a change alters a term, the change governs: it is on the signed rounds.
create or replace function public.offer_agreed_terms(p_document uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('price', d.details->'price', 'settlement', d.details->'settlement', 'conditions', d.details->'conditions', 'kiwisaver', d.details->'kiwisaver', 'lawyer_approval', d.details->'lawyer_approval',
    'as_drafted', coalesce((select jsonb_object_agg(x->>'id', coalesce(x->'text', x->'value')) from jsonb_array_elements(d.placed) x where x->>'id' in ('price', 'deposit', 'settlement', 'purchaser') or x->>'id' ~ '^[cd]_'), '{}'::jsonb),
    'deposit_printed', (select e->>'printed' from public.offer_blank_maps bm, jsonb_array_elements(bm.places) e where bm.id = d.map_id and e->>'id' = 'deposit' limit 1),
    'further_terms', (select x->'terms' from jsonb_array_elements(d.placed) x where x->>'id' = 'further_terms' limit 1),
    'changes', coalesce((select jsonb_agg(jsonb_build_object('round', g.round_no, 'side', g.side, 'kind', m.kind, 'page', m.page, 'text', m.geometry->>'text', 'by', m.by_name, 'at', m.at) order by g.round_no, m.at, m.id)
      from public.offer_sign_marks m join public.offer_signings g on g.id = m.signing_id where g.id in (select r.signing_id from public.offer_rounds r where r.document_id = p_document)), '[]'::jsonb),
    'note', 'Where a change made in the negotiation alters a term above, the change governs. Read with the signed rounds.')
  from public.offer_documents doc join public.offer_drafts d on d.id = doc.draft_id where doc.id = p_document $$;
-- 018's correction of an offer, refused once its agreement is made (the agreed terms are kept with the agreement); otherwise as before
create or replace function public.agent_offer_correct(p_offer uuid, p_details jsonb, p_note text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); o public.property_offers; d jsonb;
begin
  perform set_config('offers.fn', 'on', true);
  select * into o from public.property_offers where id = p_offer for update; if o.id is null or o.source = 'manual' then raise exception 'No such offer'; end if;
  if exists (select 1 from public.offer_agreements a where a.offer_id = o.id) then raise exception 'The agreement has been made, so the offer can''t be corrected. The agreed terms are kept with the agreement'; end if;
  if coalesce(length(trim(p_note)), 0) < 3 or length(p_note) > 500 then raise exception 'Say what changed and how you heard (3 to 500 characters)'; end if;
  d := public.offer_clean(p_details, true) || jsonb_build_object('chattels_listed', coalesce(o.details -> 'chattels_listed', '[]'::jsonb));
  update public.property_offers set details = d, amount = (d ->> 'price')::numeric, conditions = public.offer_cond_line(d), buyer_ref = public.offer_label(d), kiwisaver = (d ->> 'kiwisaver')::boolean,
    lawyer_approval = (d ->> 'lawyer_approval')::boolean, needs_date_help = (d ->> 'date_help')::boolean, related_party = (d ->> 'related')::boolean where id = p_offer;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, p_offer, me, 'corrected', jsonb_build_object('note', trim(p_note), 'before', o.details, 'after', d));
  perform set_config('offers.fn', '', true);
  return d;
end $$;
-- Tim's setting: false (the default) a side signs again only where its signature was lifted; true, every round
create or replace function public.agent_offer_negotiation_setting(p_resign_every_round boolean) returns void language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent();
begin
  if p_resign_every_round is null then raise exception 'Choose yes or no'; end if;
  update public.offer_settings set resign_every_round = p_resign_every_round, updated_by = me, updated_at = now();
end $$;

-- Tim's setting: the default for "Let them make changes from their link" on each round he presents (off unless he switches it on)
create or replace function public.agent_offer_link_changes_default(p_on boolean) returns void language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent();
begin
  if p_on is null then raise exception 'Choose yes or no'; end if;
  update public.offer_settings set link_changes_default = p_on, updated_by = me, updated_at = now();
end $$;

-- 023's readiness check, plus: a signer who has asked Tim to freeze or withdraw does nothing more on this round until Tim acts
create or replace function public.offer_sign_ready(s public.offer_signers, p_allow_finished boolean default false) returns public.offer_signings language plpgsql stable set search_path = public as $$
declare g public.offer_signings; why text;
begin
  select * into g from public.offer_signings where id = s.signing_id;
  if public.offer_hold_active(g.offer_id) then raise exception 'This version is no longer being signed. Tim will be in touch.'; end if;   -- before the void check: a withdrawal voids places too
  if s.void_at is not null then raise exception 'This version has been replaced. Tim will send you the new one.'; end if;
  why := public.offer_sign_current(g); if why is not null then raise exception '%', why; end if;
  if exists (select 1 from public.offer_requests r where r.signer_id = s.id and r.handled_at is null) then raise exception 'Your request has gone to Tim. He will contact you straight away.'; end if;
  if g.status = 'ready' then raise exception 'Signing hasn''t started yet'; end if;
  if g.status = 'held' then raise exception 'Tim is checking a change to the document. Signing carries on once he has.'; end if;
  if g.status = 'complete' then raise exception 'Everyone has signed. The signed copy is being locked.'; end if;
  if s.finished_at is not null and not p_allow_finished then raise exception 'You have finished signing. Thank you.'; end if;
  return g;
end $$;
-- Tim: freeze now (one tap and a confirm on his page), unfreeze, withdraw now, or let a requester carry on
create or replace function public.agent_offer_freeze(p_offer uuid, p_reason text, p_asked_by text default null, p_request uuid default null) returns uuid language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); o public.property_offers; id_ uuid; rq public.offer_requests;
begin
  select * into o from public.property_offers where id = p_offer for update; if o.id is null then raise exception 'No such offer'; end if;
  if exists (select 1 from public.offer_agreements a where a.offer_id = o.id) then raise exception 'The agreement has been made. Talk to the lawyers'; end if;
  if public.offer_hold_active(o.id) then raise exception 'This offer is already frozen or withdrawn'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 or length(p_reason) > 500 then raise exception 'Say why (3 to 500 characters)'; end if;
  if p_request is not null then select * into rq from public.offer_requests where id = p_request and offer_id = o.id; if rq.id is null then raise exception 'No such request'; end if; end if;
  perform set_config('offers.fn', 'on', true);
  insert into public.offer_holds (offer_id, property_id, kind, person, reason, told_at, told_how, request_id, made_by) values (o.id, o.property_id, 'freeze', left(coalesce(nullif(trim(coalesce(p_asked_by, '')), ''), rq.side || ' request', 'Tim McGuire'), 250), trim(p_reason),
    case when rq.id is not null then rq.at end, case when rq.id is not null then 'link_request' end, rq.id, me) returning id into id_;
  update public.offer_requests set handled_at = now(), handled_by = me, handled_as = 'freeze' where offer_id = o.id and handled_at is null;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, o.id, me, 'offer_frozen', jsonb_build_object('hold_id', id_, 'reason', trim(p_reason), 'asked_by', coalesce(nullif(trim(coalesce(p_asked_by, '')), ''), case when rq.id is not null then rq.side else 'Tim' end), 'request_id', rq.id));
  perform set_config('offers.fn', '', true);
  return id_;
end $$;
create or replace function public.agent_offer_unfreeze(p_offer uuid, p_note text) returns void language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); h public.offer_holds;
begin
  perform 1 from public.property_offers where id = p_offer for update;   -- unfreezing changes the offer's state: the offer FOR UPDATE first
  if exists (select 1 from public.offer_holds where offer_id = p_offer and kind = 'withdraw') then raise exception 'This offer was withdrawn, so it stays stopped'; end if;
  select * into h from public.offer_holds where offer_id = p_offer and kind = 'freeze' and lifted_at is null for update; if h.id is null then raise exception 'This offer isn''t frozen'; end if;
  if coalesce(length(trim(p_note)), 0) < 3 or length(p_note) > 500 then raise exception 'Say why it carries on (3 to 500 characters)'; end if;
  perform set_config('offers.fn', 'on', true);
  update public.offer_holds set lifted_at = now(), lifted_by = me, lift_note = trim(p_note) where id = h.id;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (h.property_id, h.offer_id, me, 'offer_unfrozen', jsonb_build_object('hold_id', h.id, 'note', trim(p_note)));
  perform set_config('offers.fn', '', true);
end $$;
create or replace function public.agent_offer_withdraw_now(p_offer uuid, p_side text, p_person text, p_reason text, p_told_at timestamptz, p_told_how text, p_request uuid default null) returns uuid language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); o public.property_offers; id_ uuid; r jsonb;
begin
  if coalesce(p_side, '') not in ('purchaser', 'vendor') then raise exception 'Choose who directed it: the purchasers or the vendors'; end if;
  if coalesce(length(trim(p_person)), 0) < 2 or length(p_person) > 250 then raise exception 'Choose which person directed it'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 or length(p_reason) > 500 then raise exception 'Give the reason (3 to 500 characters)'; end if;
  if coalesce(p_told_how, '') not in ('in_person', 'phone', 'email', 'link_request') then raise exception 'Choose how you were told'; end if;
  if p_told_at is null then raise exception 'Say when you were told'; end if;
  select * into o from public.property_offers where id = p_offer for update; if o.id is null then raise exception 'No such offer'; end if;
  if exists (select 1 from public.offer_holds where offer_id = o.id and kind = 'withdraw') then raise exception 'This offer has already been withdrawn'; end if;
  if p_request is not null and not exists (select 1 from public.offer_requests r where r.id = p_request and r.offer_id = o.id) then raise exception 'No such request on this offer'; end if;
  -- the existing withdrawal (stops every signing as withdrawn, closes the open document, marks the offer withdrawn or declined)
  r := public.agent_negotiation_withdraw(o.id, p_side, p_told_at, left('Directed by ' || trim(p_person) || ': ' || trim(p_reason), 500));
  perform set_config('offers.fn', 'on', true);
  update public.offer_holds set lifted_at = now(), lifted_by = me, lift_note = 'Withdrawn' where offer_id = o.id and kind = 'freeze' and lifted_at is null;
  insert into public.offer_holds (offer_id, property_id, kind, side, person, reason, told_at, told_how, request_id, made_by)
    values (o.id, o.property_id, 'withdraw', p_side, trim(p_person), trim(p_reason), p_told_at, p_told_how, p_request, me) returning id into id_;
  update public.offer_requests set handled_at = now(), handled_by = me, handled_as = 'withdraw' where offer_id = o.id and handled_at is null;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, o.id, me, 'offer_withdrawn_now', jsonb_build_object('hold_id', id_, 'side', p_side, 'person', trim(p_person), 'reason', trim(p_reason), 'told_at', p_told_at, 'told_how', p_told_how, 'request_id', p_request, 'stopped', r->'stopped'));
  perform set_config('offers.fn', '', true);
  return id_;
end $$;
create or replace function public.agent_offer_request_carry_on(p_request uuid, p_note text) returns void language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); rq public.offer_requests;
begin
  perform 1 from public.property_offers where id = (select offer_id from public.offer_requests where id = p_request) for key share;   -- lock order: the offer, then the signing, then the signer
  select * into rq from public.offer_requests where id = p_request for update; if rq.id is null or rq.handled_at is not null then raise exception 'No open request'; end if;
  if coalesce(length(trim(p_note)), 0) < 3 or length(p_note) > 500 then raise exception 'Say what you agreed with them (3 to 500 characters)'; end if;
  perform set_config('offers.fn', 'on', true);
  update public.offer_requests set handled_at = now(), handled_by = me, handled_as = 'carry_on' where id = rq.id;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (rq.property_id, rq.offer_id, me, 'request_carry_on', jsonb_build_object('request_id', rq.id, 'note', trim(p_note)));
  perform set_config('offers.fn', '', true);
end $$;
-- a party asks, from their own signing link (the edge function, then an urgent email to Tim). It stops only them until Tim acts.
create or replace function public.offer_sign_request(p_token text, p_session text, p_kind text, p_reason_key text, p_reason text, p_net text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings; id_ uuid; why text; L jsonb := jsonb_build_object('finance_changed', 'Our financial situation has changed', 'contract_elsewhere', 'We have entered a contract elsewhere',
  'incapacitated', 'One of our party is incapacitated', 'property_integrity', 'We have concerns about the integrity of the property', 'property_viability', 'We have concerns about the viability of the property');
begin
  s := public.offer_sign_me(p_token, p_session);
  -- the signer's row is locked, so two requests at once can't both pass the checks below
  perform public.offer_lock_by_signer(s.id);   -- lock order: the offer, then the signing, then the signer
  select * into s from public.offer_signers where id = s.id for update;
  select * into g from public.offer_signings where id = s.signing_id;
  if s.void_at is not null or g.status not in ('ready', 'signing', 'held', 'complete') or public.offer_sign_current(g) is not null then raise exception 'This version is no longer being signed. Tim will be in touch.'; end if;
  if exists (select 1 from public.offer_requests r where r.signer_id = s.id and r.handled_at is null) then raise exception 'Your request has gone to Tim. He will contact you straight away.'; end if;
  if coalesce(p_kind, '') not in ('freeze', 'withdraw') then raise exception 'Choose stop for now, or withdraw'; end if;
  if coalesce(p_reason_key, '') not in ('finance_changed', 'contract_elsewhere', 'incapacitated', 'property_integrity', 'property_viability', 'other') then raise exception 'Choose a reason'; end if;
  why := case when p_reason_key = 'other' then nullif(trim(coalesce(p_reason, '')), '') else L->>p_reason_key end;
  if why is null or length(why) < 3 or length(why) > 500 then raise exception 'Type the reason (3 to 500 characters)'; end if;
  if (select count(*) from public.offer_requests where signer_id = s.id and at > now() - interval '1 hour') >= 5 then raise exception 'Your request has gone to Tim. He will contact you straight away.'; end if;
  perform set_config('offers.fn', 'on', true);
  insert into public.offer_requests (offer_id, property_id, signing_id, signer_id, side, kind, reason_key, reason, net_hash) values (g.offer_id, g.property_id, g.id, s.id, g.side, p_kind, p_reason_key, why, public.offer_net(p_net)) returning id into id_;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, s.name, 'party_request', jsonb_build_object('request_id', id_, 'kind', p_kind, 'side', g.side, 'signer', s.position, 'round', g.round_no, 'reason_key', p_reason_key, 'reason', why));
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('id', id_, 'name', s.name, 'side', g.side, 'round', g.round_no, 'kind', p_kind, 'reason', why, 'offer_id', g.offer_id, 'property_id', g.property_id, 'signing_id', g.id, 'address', (select address from public.properties where id = g.property_id));
end $$;
revoke execute on function public.guard_offer_hold(), public.offer_hold_active(uuid), public.offer_sign_stop_for(public.offer_signers, public.offer_signings) from public, anon, authenticated;
revoke execute on function public.offer_sign_request(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.offer_sign_request(text, text, text, text, text, text) to service_role;
revoke execute on function public.agent_offer_freeze(uuid, text, text, uuid), public.agent_offer_unfreeze(uuid, text), public.agent_offer_withdraw_now(uuid, text, text, text, timestamptz, text, uuid), public.agent_offer_request_carry_on(uuid, text) from public, anon;
grant execute on function public.agent_offer_freeze(uuid, text, text, uuid), public.agent_offer_unfreeze(uuid, text), public.agent_offer_withdraw_now(uuid, text, text, text, timestamptz, text, uuid), public.agent_offer_request_carry_on(uuid, text) to authenticated;

-- ───── Who holds the deposit (Tim, 24 November 2026): his choice for the agreed copy's emails, kept with the agreement ─────
-- Recommended: the vendors' lawyer's trust account when any KiwiSaver is part of the deposit, otherwise Public Trust O/A NZ Real Estate
-- Trust. Tim may choose otherwise (with KiwiSaver he is warned, and the warning is recorded). Each choice is a new row; the newest stands.
create table public.offer_deposit_holders (
  id bigserial primary key,
  offer_id uuid not null references public.property_offers(id),
  property_id uuid not null references public.properties(id),
  agreement_id uuid not null references public.offer_agreements(id),
  holder text not null check (holder in ('nzret', 'vendor_lawyer', 'other')),
  other_text text check ((holder = 'other') = (other_text is not null) and (other_text is null or length(other_text) between 3 and 200)),
  recommended text not null check (recommended in ('nzret', 'vendor_lawyer')),
  kiwisaver boolean not null, warned boolean not null,
  by_default boolean not null default false,   -- the recommended holder, used when the emails were built; not a choice Tim made
  chosen_by text not null, chosen_at timestamptz not null default now()
);
create index on public.offer_deposit_holders (offer_id);
create trigger guard_offer_deposit_holders before update or delete on public.offer_deposit_holders for each row execute function public.guard_offer_hold();
create trigger offer_deposit_holders_no_truncate before truncate on public.offer_deposit_holders for each statement execute function public.guard_offer_truncate();
alter table public.offer_deposit_holders enable row level security;
create policy odh_agent_read on public.offer_deposit_holders for select using (public.is_agent());
revoke all on public.offer_deposit_holders from anon;
revoke insert, update, delete, truncate, references, trigger on public.offer_deposit_holders from authenticated;
create or replace function public.agent_offer_deposit_holder(p_offer uuid, p_holder text, p_other text, p_default boolean default false) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); o public.property_offers; ag public.offer_agreements; ks boolean; rec text; id_ bigint;
begin
  select * into o from public.property_offers where id = p_offer; if o.id is null then raise exception 'No such offer'; end if;
  select * into ag from public.offer_agreements where offer_id = o.id; if ag.id is null then raise exception 'The agreement hasn''t been made yet'; end if;
  if coalesce(p_holder, '') not in ('nzret', 'vendor_lawyer', 'other') then raise exception 'Choose who holds the deposit'; end if;
  if p_holder = 'other' and coalesce(length(trim(p_other)), 0) not between 3 and 200 then raise exception 'Type who holds the deposit (3 to 200 characters)'; end if;
  ks := coalesce((ag.terms->>'kiwisaver')::boolean, false) or coalesce((o.details->>'kiwisaver')::boolean, false);   -- as the agreed terms or the offer say
  rec := case when ks then 'vendor_lawyer' else 'nzret' end;
  if coalesce(p_default, false) and (p_holder <> rec or exists (select 1 from public.offer_deposit_holders where offer_id = o.id)) then raise exception 'The recommended holder is used only when nothing has been chosen'; end if;
  perform set_config('offers.fn', 'on', true);
  insert into public.offer_deposit_holders (offer_id, property_id, agreement_id, holder, other_text, recommended, kiwisaver, warned, by_default, chosen_by)
    values (o.id, o.property_id, ag.id, p_holder, case when p_holder = 'other' then trim(p_other) end, rec, ks, ks and p_holder <> 'vendor_lawyer', coalesce(p_default, false), me) returning id into id_;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, o.id, me, 'deposit_holder_chosen', jsonb_build_object('id', id_, 'holder', p_holder, 'other', case when p_holder = 'other' then trim(p_other) end, 'recommended', rec, 'kiwisaver', ks, 'by_default', coalesce(p_default, false), 'agreement_id', ag.id));
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('id', id_, 'holder', p_holder, 'recommended', rec, 'warned', ks and p_holder <> 'vendor_lawyer', 'by_default', coalesce(p_default, false));
end $$;
revoke execute on function public.agent_offer_deposit_holder(uuid, text, text, boolean) from public, anon;
grant execute on function public.agent_offer_deposit_holder(uuid, text, text, boolean) to authenticated;

-- ───── Emails as drafts Tim reviews and sends (Tim, 24 November 2026; EMAIL-VOICE.md) ─────
-- Nothing goes to a buyer, vendor or lawyer by itself. Every email to them (a signing link, a "please initial again" notice after a
-- change, the agreed copy to each side) is a draft here first; Tim reads it, may edit it, and presses Send. The one exception is the
-- one-time signing code, which a signer asks for while signing (open point for Tim). offer_mail_log keeps exactly what was sent.
create table public.offer_mail_drafts (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.property_offers(id),
  property_id uuid not null references public.properties(id),
  signing_id uuid references public.offer_signings(id),
  signer_id uuid references public.offer_signers(id),
  agreement_id uuid references public.offer_agreements(id),
  kind text not null check (kind in ('sign_link', 'reopened', 'agreed_purchasers', 'agreed_vendors', 'withdraw_party', 'withdraw_lawyer')),
  to_addr text[] not null,
  cc_addr text[] not null default '{}',
  subject text not null check (length(subject) between 1 and 300),
  body text not null check (length(body) between 1 and 30000),
  attach jsonb,                      -- the agreed copy: { path, sha256, name }
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'void')),   -- sending: handed to the mail server, not yet confirmed
  reviewed_at timestamptz, reviewed_by text,
  created_at timestamptz not null default now(), created_by text not null,
  edited_at timestamptz, edited_by text,
  sent_at timestamptz, sent_by text,
  void_at timestamptz, void_by text, void_reason text
);
create index on public.offer_mail_drafts (offer_id, status);
create table public.offer_mail_log (
  id bigserial primary key,
  draft_id uuid not null references public.offer_mail_drafts(id),
  offer_id uuid not null references public.property_offers(id),
  property_id uuid not null references public.properties(id),
  kind text not null,
  to_addr text[] not null, cc_addr text[] not null default '{}',
  subject text not null, body text not null,      -- exactly as handed out to send (a signing link's token shown only as "[personal link]")
  attachments jsonb not null default '[]'::jsonb,  -- [{ name, sha256 }]
  sent_by text not null, sent_at timestamptz not null default now(),   -- when it was handed out to send
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'unconfirmed')),   -- pending until the send is confirmed
  ok boolean, error text, done_at timestamptz
);
-- a draft changes only through the functions below, and never once it is sent or set aside; nothing is removed
create or replace function public.guard_offer_mail() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Email records are never removed'; end if;
  if coalesce(current_setting('offers.fn', true), '') <> 'on' then raise exception 'Emails are changed only through the offer screens, so there is a record'; end if;
  -- a draft is edited only as a draft; a draft being sent moves only to sent, or back to draft when the send failed
  if old.status in ('sent', 'void') or (old.status = 'sending' and (new.status not in ('sent', 'draft') or new.subject <> old.subject or new.body <> old.body or new.to_addr <> old.to_addr or new.cc_addr <> old.cc_addr))
     or (old.status = 'draft' and new.status = 'sent') then raise exception 'This email was sent or set aside, so it is kept as it was'; end if;
  if new.id <> old.id or new.offer_id <> old.offer_id or new.kind <> old.kind or new.created_at <> old.created_at or new.signer_id is distinct from old.signer_id
     or new.agreement_id is distinct from old.agreement_id or new.attach is distinct from old.attach then raise exception 'Only the wording, recipients and status of a draft change'; end if;
  return new;
end $$;
create trigger guard_offer_mail before update or delete on public.offer_mail_drafts for each row execute function public.guard_offer_mail();
-- a log row is never removed or rewritten: only a pending row's outcome is filled in once, through offer_mail_done or agent_mail_draft_unstick
create or replace function public.guard_offer_mail_log() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'This record is kept exactly as it was made'; end if;
  if coalesce(current_setting('offers.fn', true), '') <> 'on' or old.status <> 'pending' or new.status = 'pending'
     or (to_jsonb(new) - array['status', 'ok', 'error', 'done_at']) is distinct from (to_jsonb(old) - array['status', 'ok', 'error', 'done_at']) then
    raise exception 'This record is kept exactly as it was made'; end if;
  return new;
end $$;
create trigger offer_mail_log_fixed before update or delete on public.offer_mail_log for each row execute function public.guard_offer_mail_log();
create trigger offer_mail_drafts_no_truncate before truncate on public.offer_mail_drafts for each statement execute function public.guard_offer_truncate();
create trigger offer_mail_log_no_truncate before truncate on public.offer_mail_log for each statement execute function public.guard_offer_truncate();
alter table public.offer_mail_drafts enable row level security;
alter table public.offer_mail_log enable row level security;
create policy omd_agent_read on public.offer_mail_drafts for select using (public.is_agent());
create policy oml_agent_read on public.offer_mail_log for select using (public.is_agent());
revoke all on public.offer_mail_drafts, public.offer_mail_log from anon;
revoke insert, update, delete, truncate, references, trigger on public.offer_mail_drafts, public.offer_mail_log from authenticated;
revoke all on sequence public.offer_mail_log_id_seq from anon, authenticated;

-- who a draft may go to: a signer, their own address only; the purchasers' email, the purchasers and their lawyer; the vendors' email,
-- the vendors who signed this negotiation and the vendors' lawyer (from the agreed draft, or the agency agreement in force)
create or replace function public.offer_mail_allowed(p_offer uuid, p_kind text, p_signer uuid) returns text[] language plpgsql stable security definer set search_path = public as $$
declare o public.property_offers; out_ text[] := '{}'; ag public.offer_agreements; side text;
begin
  select * into o from public.property_offers where id = p_offer; if o.id is null then return out_; end if;
  if p_kind in ('sign_link', 'reopened') then
    select coalesce(array_agg(lower(trim(s.email))), '{}') into out_ from public.offer_signers s join public.offer_signings g on g.id = s.signing_id where s.id = p_signer and g.offer_id = p_offer and coalesce(s.email, '') <> '';
  elsif p_kind = 'agreed_purchasers' then
    select coalesce(array_agg(lower(trim(e))), '{}') into out_ from (select o.details->>'email' e union all select q->>'email' from jsonb_array_elements(coalesce(o.details->'purchasers', '[]'::jsonb)) q
      union all select o.details->'lawyer'->>'email') z where coalesce(trim(e), '') <> '';
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
-- the side that directed a withdrawal Tim recorded (null if none)
create or replace function public.offer_mail_wd_side(p_offer uuid) returns text language sql stable security definer set search_path = public as $$
  select h.side from public.offer_holds h where h.offer_id = p_offer and h.kind = 'withdraw' order by h.made_at desc limit 1 $$;
-- the other side's own phone or email in a draft (EMAIL-VOICE.md: each party sees only their own details and both lawyers'):
-- p_forbid 'vendor' for anything to the purchasers, 'purchaser' for anything to the vendors. Lawyers' details are never theirs.
create or replace function public.offer_mail_side_hit(p_offer uuid, p_forbid text, p_text text) returns text language plpgsql stable security definer set search_path = public as $$
declare o public.property_offers; t text := lower(public.offer_plain(p_text)); runs text[]; r record; v text; law text;
begin
  select * into o from public.property_offers where id = p_offer; if o.id is null or t = '' then return null; end if;
  select coalesce(array_agg(public.offer_nsn(m[1])), '{}') into runs from regexp_matches(t, '([+(]?\d[\d\s().\/_\-]{4,}\d)', 'g') m;
  law := lower(coalesce(o.details->'lawyer'->>'email', ''));
  for r in
    select 'a purchaser' who, o.details->>'email' email, o.details->>'phone' phone where p_forbid = 'purchaser'
    union all select 'a purchaser', q->>'email', q->>'phone' from jsonb_array_elements(coalesce(o.details->'purchasers', '[]'::jsonb)) q where p_forbid = 'purchaser'
    union all select 'a vendor', pp.email, pp.phone from public.property_people pp where pp.property_id = o.property_id and p_forbid = 'vendor'
    union all select 'a vendor', ap.email, ap.phone from public.agreement_people ap join public.agreements a on a.id = ap.agreement_id where a.property_id = o.property_id and p_forbid = 'vendor'
    union all select 'a vendor', s.email, null from public.offer_signers s join public.offer_signings g on g.id = s.signing_id where g.offer_id = p_offer and g.side = 'vendor' and p_forbid = 'vendor'
  loop
    v := lower(public.offer_plain(trim(coalesce(r.email, ''))));
    if length(v) >= 5 and position('@' in v) > 0 and v <> law and position(v in t) > 0 then return r.who; end if;
    v := public.offer_nsn(public.offer_plain(r.phone));
    if length(v) >= 7 and exists (select 1 from unnest(runs) x where length(x) >= 6 and position(v in x) > 0) then return r.who; end if;
  end loop;
  return null;
end $$;
-- whose side a draft is for
create or replace function public.offer_mail_side(p_kind text, p_signer uuid, p_offer uuid default null) returns text language sql stable security definer set search_path = public as $$
  select case when p_kind = 'agreed_purchasers' then 'purchaser' when p_kind = 'agreed_vendors' then 'vendor'
    when p_kind = 'withdraw_party' then public.offer_mail_wd_side(p_offer)
    when p_kind = 'withdraw_lawyer' then case public.offer_mail_wd_side(p_offer) when 'vendor' then 'purchaser' when 'purchaser' then 'vendor' end
    else (select g.side from public.offer_signers s join public.offer_signings g on g.id = s.signing_id where s.id = p_signer) end $$;
-- a draft's recipients and wording, checked whenever it is made or edited
create or replace function public.offer_mail_check(p_offer uuid, p_kind text, p_signer uuid, p_to text[], p_cc text[], p_subject text, p_body text, p_sending boolean default false) returns void language plpgsql stable security definer set search_path = public as $$
declare allowed text[] := public.offer_mail_allowed(p_offer, p_kind, p_signer); x text; who text; side text := public.offer_mail_side(p_kind, p_signer, p_offer);
begin
  if coalesce(array_length(p_to, 1), 0) < 1 or coalesce(array_length(p_to, 1), 0) + coalesce(array_length(p_cc, 1), 0) > 12 then raise exception 'Choose who it goes to'; end if;
  foreach x in array p_to || coalesce(p_cc, '{}') loop
    if not (lower(trim(x)) = any(allowed)) then raise exception 'It can only go to the people on this side of the offer and their lawyer (% isn''t one)', x; end if;
  end loop;
  if p_kind in ('sign_link', 'reopened') and coalesce(array_length(p_cc, 1), 0) > 0 then raise exception 'A signing email goes to its signer alone'; end if;
  if coalesce(length(trim(p_subject)), 0) < 1 or length(p_subject) > 300 then raise exception 'The subject needs 1 to 300 characters'; end if;
  if coalesce(length(trim(p_body)), 0) < 1 or length(p_body) > 30000 then raise exception 'The email needs some words (up to 30,000 characters)'; end if;
  -- a draft may hold Tim's marked blanks; it can't be sent until he has filled or deleted them
  if p_sending and position('[Tim to' in coalesce(p_subject, '') || ' ' || coalesce(p_body, '')) > 0 then raise exception 'Fill or delete the marked blanks first.'; end if;
  if p_kind = 'sign_link' and position('[the signing link]' in p_body) = 0 then raise exception 'Keep [the signing link] in the email: the personal link goes there when it is sent'; end if;
  who := public.offer_mail_side_hit(p_offer, case when side = 'vendor' then 'purchaser' else 'vendor' end, p_subject || ' ' || p_body);
  if who is not null then raise exception 'This email holds %''s own phone or email. Each side sees only their own details and both lawyers''', who; end if;
end $$;
create or replace function public.offer_mail_insert(p_actor text, p_offer uuid, p_kind text, p_signer uuid, p_to text[], p_cc text[], p_subject text, p_body text, p_attach jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare o public.property_offers; s public.offer_signers; g public.offer_signings; ag public.offer_agreements; id_ uuid; why text;
begin
  select * into o from public.property_offers where id = p_offer for update; if o.id is null then raise exception 'No such offer'; end if;
  if p_kind in ('sign_link', 'reopened') then
    select * into s from public.offer_signers where id = p_signer; select * into g from public.offer_signings where id = s.signing_id;
    if s.id is null or g.offer_id <> o.id then raise exception 'No such signer on this offer'; end if;
    if g.method <> 'link' then raise exception 'This signer signs in person, on your device'; end if;
    if s.void_at is not null then raise exception 'This signer''s version was replaced'; end if;
    why := public.offer_sign_current(g); if why is not null then raise exception '%', why; end if;
    if p_kind = 'sign_link' and (s.finished_at is not null or g.status not in ('ready', 'signing')) then raise exception 'Signing is held or finished, so no link is sent'; end if;
  elsif p_kind in ('agreed_purchasers', 'agreed_vendors') then
    select * into ag from public.offer_agreements where offer_id = o.id; if ag.id is null then raise exception 'The agreement hasn''t been made yet'; end if;
    if p_attach is null or p_attach->>'path' is distinct from ag.path or p_attach->>'sha256' is distinct from ag.sha256 or coalesce(length(p_attach->>'name'), 0) not between 5 and 200 then raise exception 'Attach the agreed copy'; end if;
  elsif p_kind in ('withdraw_party', 'withdraw_lawyer') then
    if public.offer_mail_wd_side(o.id) is null then raise exception 'Record the withdrawal first'; end if;
    if p_signer is not null or p_attach is not null then raise exception 'A withdrawal email has no link or attachment'; end if;
  else raise exception 'Choose what kind of email it is';
  end if;
  perform public.offer_mail_check(o.id, p_kind, p_signer, p_to, coalesce(p_cc, '{}'), p_subject, p_body);
  perform set_config('offers.fn', 'on', true);
  -- one open draft at a time for a signer, or for each side's agreed copy: a newer one sets the older aside
  update public.offer_mail_drafts set status = 'void', void_at = now(), void_by = p_actor, void_reason = 'A newer draft replaced it'
    where offer_id = o.id and kind = p_kind and status = 'draft' and signer_id is not distinct from p_signer;
  insert into public.offer_mail_drafts (offer_id, property_id, signing_id, signer_id, agreement_id, kind, to_addr, cc_addr, subject, body, attach, created_by)
    values (o.id, o.property_id, g.id, p_signer, ag.id, p_kind, p_to, coalesce(p_cc, '{}'), p_subject, p_body, case when ag.id is not null then p_attach end, left(p_actor, 254)) returning id into id_;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, o.id, left(p_actor, 254), 'mail_drafted', jsonb_build_object('draft_id', id_, 'kind', p_kind, 'signing_id', g.id, 'to', coalesce(array_length(p_to, 1), 0), 'cc', coalesce(array_length(p_cc, 1), 0)));
  perform set_config('offers.fn', '', true);
  return id_;
end $$;
-- Tim makes a draft (his screen writes the wording, EMAIL-VOICE.md); the edge function makes the "please initial again" drafts
create or replace function public.agent_mail_draft_add(p_offer uuid, p_kind text, p_signer uuid, p_to text[], p_cc text[], p_subject text, p_body text, p_attach jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent();
begin return public.offer_mail_insert(me, p_offer, p_kind, p_signer, p_to, p_cc, p_subject, p_body, p_attach); end $$;
create or replace function public.offer_mail_draft_sys(p_offer uuid, p_signer uuid, p_to text[], p_subject text, p_body text) returns uuid language plpgsql security definer set search_path = public as $$
begin return public.offer_mail_insert('system', p_offer, 'reopened', p_signer, p_to, '{}', p_subject, p_body, null); end $$;
-- Tim edits a draft (its recipients, subject and words), ticks it reviewed, or sets it aside
create or replace function public.agent_mail_draft_edit(p_draft uuid, p_to text[], p_cc text[], p_subject text, p_body text) returns void language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); m public.offer_mail_drafts;
begin
  perform 1 from public.property_offers where id = (select offer_id from public.offer_mail_drafts where id = p_draft) for key share;   -- lock order: the offer, then the draft, then the signing and signer
  select * into m from public.offer_mail_drafts where id = p_draft for update; if m.id is null then raise exception 'No such email'; end if;
  if m.status <> 'draft' then raise exception 'This email was sent or set aside, so it is kept as it was'; end if;
  perform public.offer_mail_check(m.offer_id, m.kind, m.signer_id, p_to, coalesce(p_cc, '{}'), p_subject, p_body);
  perform set_config('offers.fn', 'on', true);
  update public.offer_mail_drafts set to_addr = p_to, cc_addr = coalesce(p_cc, '{}'), subject = p_subject, body = p_body, edited_at = now(), edited_by = me, reviewed_at = null, reviewed_by = null where id = m.id;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (m.property_id, m.offer_id, me, 'mail_edited', jsonb_build_object('draft_id', m.id, 'kind', m.kind));
  perform set_config('offers.fn', '', true);
end $$;
create or replace function public.agent_mail_draft_review(p_draft uuid, p_reviewed boolean) returns void language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); m public.offer_mail_drafts;
begin
  perform 1 from public.property_offers where id = (select offer_id from public.offer_mail_drafts where id = p_draft) for key share;   -- lock order: the offer, then the draft, then the signing and signer
  select * into m from public.offer_mail_drafts where id = p_draft for update; if m.id is null then raise exception 'No such email'; end if;
  if m.status <> 'draft' then raise exception 'This email was sent or set aside, so it is kept as it was'; end if;
  perform set_config('offers.fn', 'on', true);
  update public.offer_mail_drafts set reviewed_at = case when p_reviewed then now() end, reviewed_by = case when p_reviewed then me end where id = m.id;
  perform set_config('offers.fn', '', true);
end $$;
create or replace function public.agent_mail_draft_void(p_draft uuid, p_reason text) returns void language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); m public.offer_mail_drafts;
begin
  perform 1 from public.property_offers where id = (select offer_id from public.offer_mail_drafts where id = p_draft) for key share;   -- lock order: the offer, then the draft, then the signing and signer
  select * into m from public.offer_mail_drafts where id = p_draft for update; if m.id is null then raise exception 'No such email'; end if;
  if m.status <> 'draft' then raise exception 'This email was sent or set aside, so it is kept as it was'; end if;
  perform set_config('offers.fn', 'on', true);
  update public.offer_mail_drafts set status = 'void', void_at = now(), void_by = me, void_reason = left(nullif(trim(coalesce(p_reason, '')), ''), 300) where id = m.id;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (m.property_id, m.offer_id, me, 'mail_set_aside', jsonb_build_object('draft_id', m.id, 'kind', m.kind));
  perform set_config('offers.fn', '', true);
end $$;
-- the edge function, when Tim presses Send: the draft as it stands (locked), and for a signing link a fresh personal link for that
-- signer only (its token kept as a fingerprint, as offer_sign_issue does)
create or replace function public.offer_mail_take(p_draft uuid, p_actor text) returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.offer_mail_drafts; s public.offer_signers; g public.offer_signings; tok text; why text; lid bigint; logged text;
begin
  perform 1 from public.property_offers where id = (select offer_id from public.offer_mail_drafts where id = p_draft) for key share;   -- lock order: the offer, then the draft, then the signing and signer
  -- one send at a time: the draft row is locked, must still be a draft, and moves to 'sending' here, with a pending log row holding
  -- exactly what is handed out. A second Send (another tab, Send all reviewed) finds it sending and is refused.
  select * into m from public.offer_mail_drafts where id = p_draft for update; if m.id is null then raise exception 'No such email'; end if;
  if m.status = 'sending' then raise exception 'This email is already being sent, or may have gone. Check before sending again'; end if;
  if m.status <> 'draft' then raise exception 'This email was already sent or set aside'; end if;
  perform public.offer_mail_check(m.offer_id, m.kind, m.signer_id, m.to_addr, m.cc_addr, m.subject, m.body, true);
  -- frozen or withdrawn: no signing email goes (withdrawal emails do; Tim sends them)
  if m.kind in ('sign_link', 'reopened') and public.offer_hold_active(m.offer_id) then raise exception 'This offer is frozen or withdrawn, so no signing email goes'; end if;
  perform set_config('offers.fn', 'on', true);
  if m.kind = 'sign_link' then
    select * into g from public.offer_signings where id = m.signing_id for update; select * into s from public.offer_signers where id = m.signer_id for update;
    why := public.offer_sign_current(g); if why is not null then raise exception '%', why; end if;
    if s.void_at is not null or s.finished_at is not null or g.status not in ('ready', 'signing') then raise exception 'Signing is held or finished, so no link is sent'; end if;
    tok := public.offer_token();
    update public.offer_signers set token_hash = public.offer_sha(tok), link_sent_at = now(), link_expires_at = now() + interval '14 days', session_hash = null, session_expires_at = null, code_hash = null, code_expires_at = null, code_tries = 0 where id = s.id;
    update public.offer_signings set status = 'signing', sent_at = coalesce(sent_at, now()) where id = g.id;
    insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, left(coalesce(p_actor, 'agent'), 254), 'sign_links_sent', jsonb_build_object('signing_id', g.id, 'signers', 1, 'signer', s.position, 'round', g.round_no, 'side', g.side, 'draft_id', m.id));
  end if;
  logged := replace(m.body, '[the signing link]', case when tok is not null then '[personal link]' else '[the signing link]' end);
  insert into public.offer_mail_log (draft_id, offer_id, property_id, kind, to_addr, cc_addr, subject, body, attachments, sent_by)
    values (m.id, m.offer_id, m.property_id, m.kind, m.to_addr, m.cc_addr, m.subject, logged,
      case when m.attach is not null then jsonb_build_array(jsonb_build_object('name', m.attach->>'name', 'sha256', m.attach->>'sha256')) else '[]'::jsonb end, left(coalesce(p_actor, 'agent'), 254)) returning id into lid;
  update public.offer_mail_drafts set status = 'sending' where id = m.id;
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('id', m.id, 'log_id', lid, 'kind', m.kind, 'to', to_jsonb(m.to_addr), 'cc', to_jsonb(m.cc_addr), 'subject', m.subject, 'body', m.body, 'attach', m.attach, 'token', tok);
end $$;
-- after the send: the log (exactly what went), and the draft marked sent (or left as a draft if it failed)
create or replace function public.offer_mail_done(p_draft uuid, p_log bigint, p_actor text, p_ok boolean, p_error text) returns void language plpgsql security definer set search_path = public as $$
declare m public.offer_mail_drafts; l public.offer_mail_log;
begin
  perform 1 from public.property_offers where id = (select offer_id from public.offer_mail_drafts where id = p_draft) for key share;   -- lock order: the offer, then the draft, then the signing and signer
  -- the outcome of one send: sent (the draft is sent) or failed at the mail server (back to a draft; a new Send makes a new link)
  select * into m from public.offer_mail_drafts where id = p_draft for update; if m.id is null then raise exception 'No such email'; end if;
  select * into l from public.offer_mail_log where id = p_log and draft_id = m.id for update; if l.id is null or l.status <> 'pending' or m.status <> 'sending' then raise exception 'This send was already recorded'; end if;
  perform set_config('offers.fn', 'on', true);
  update public.offer_mail_log set status = case when coalesce(p_ok, false) then 'sent' else 'failed' end, ok = coalesce(p_ok, false), error = left(p_error, 500), done_at = now() where id = l.id;
  if coalesce(p_ok, false) then update public.offer_mail_drafts set status = 'sent', sent_at = l.sent_at, sent_by = l.sent_by where id = m.id;
  else update public.offer_mail_drafts set status = 'draft', reviewed_at = null, reviewed_by = null where id = m.id; end if;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (m.property_id, m.offer_id, left(coalesce(p_actor, 'agent'), 254), case when coalesce(p_ok, false) then 'mail_sent' else 'mail_failed' end,
    jsonb_build_object('draft_id', m.id, 'log_id', l.id, 'kind', m.kind, 'to', coalesce(array_length(l.to_addr, 1), 0), 'cc', coalesce(array_length(l.cc_addr, 1), 0)));
  perform set_config('offers.fn', '', true);
end $$;
-- Tim has checked that an email stuck at 'sending' (the mail server's answer was lost) did not arrive: back to a draft to send again.
-- Its pending log row is kept, marked unconfirmed.
create or replace function public.agent_mail_draft_unstick(p_draft uuid) returns void language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); m public.offer_mail_drafts;
begin
  perform 1 from public.property_offers where id = (select offer_id from public.offer_mail_drafts where id = p_draft) for key share;   -- lock order: the offer, then the draft, then the signing and signer
  select * into m from public.offer_mail_drafts where id = p_draft for update; if m.id is null then raise exception 'No such email'; end if;
  if m.status <> 'sending' then raise exception 'This email isn''t waiting on a send'; end if;
  perform set_config('offers.fn', 'on', true);
  update public.offer_mail_log set status = 'unconfirmed', error = 'Tim checked it had not arrived', done_at = now() where draft_id = m.id and status = 'pending';
  update public.offer_mail_drafts set status = 'draft', reviewed_at = null, reviewed_by = null where id = m.id;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (m.property_id, m.offer_id, me, 'mail_unconfirmed', jsonb_build_object('draft_id', m.id, 'kind', m.kind));
  perform set_config('offers.fn', '', true);
end $$;
revoke execute on function public.guard_offer_mail(), public.offer_mail_allowed(uuid, text, uuid), public.offer_mail_side_hit(uuid, text, text), public.offer_mail_side(text, uuid, uuid), public.offer_mail_wd_side(uuid), public.offer_mail_check(uuid, text, uuid, text[], text[], text, text, boolean), public.guard_offer_mail_log(),
  public.offer_mail_insert(text, uuid, text, uuid, text[], text[], text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.offer_mail_draft_sys(uuid, uuid, text[], text, text), public.offer_mail_take(uuid, text), public.offer_mail_done(uuid, bigint, text, boolean, text) from public, anon, authenticated;
grant execute on function public.offer_mail_draft_sys(uuid, uuid, text[], text, text), public.offer_mail_take(uuid, text), public.offer_mail_done(uuid, bigint, text, boolean, text) to service_role;
revoke execute on function public.agent_mail_draft_add(uuid, text, uuid, text[], text[], text, text, jsonb), public.agent_mail_draft_edit(uuid, text[], text[], text, text), public.agent_mail_draft_review(uuid, boolean), public.agent_mail_draft_void(uuid, text), public.agent_mail_draft_unstick(uuid) from public, anon;
grant execute on function public.agent_mail_draft_add(uuid, text, uuid, text[], text[], text, text, jsonb), public.agent_mail_draft_edit(uuid, text[], text[], text, text), public.agent_mail_draft_review(uuid, boolean), public.agent_mail_draft_void(uuid, text), public.agent_mail_draft_unstick(uuid) to authenticated;

-- ───── execute rights ─────
revoke execute on function public.guard_offer_document(), public.offer_change_ok(text, jsonb, numeric, numeric), public.offer_nsn(text), public.offer_private_hit(uuid, text), public.offer_doc_layers(uuid, int), public.offer_parties(uuid),
  public.offer_doc_last(uuid), public.offer_stop_signings(uuid, uuid, text, text, text), public.offer_doc_close(uuid, text, text), public.offer_sign_do_change(uuid, uuid, text, int, jsonb, uuid, jsonb), public.offer_agreement_check(uuid, timestamptz, text),
  public.offer_plain(text), public.offer_change_rect(text, jsonb), public.offer_gap(jsonb, jsonb), public.offer_date_place(uuid), public.offer_agreed_terms(uuid) from public, anon, authenticated;
revoke execute on function public.offer_sign_change(text, text, text, uuid, text, int, jsonb, uuid, jsonb), public.offer_agreement_material(uuid, timestamptz, text), public.offer_agreement_lock(uuid, uuid, text, text, bigint, timestamptz, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.offer_sign_change(text, text, text, uuid, text, int, jsonb, uuid, jsonb), public.offer_agreement_material(uuid, timestamptz, text), public.offer_agreement_lock(uuid, uuid, text, text, bigint, timestamptz, text, jsonb, text) to service_role;
revoke execute on function public.agent_round_present(uuid, text, jsonb, boolean, text, boolean), public.agent_round_change(uuid, uuid, text, int, jsonb, uuid, jsonb), public.agent_offer_layers(uuid, uuid), public.agent_document_close(uuid, text), public.agent_negotiation_withdraw(uuid, text, timestamptz, text), public.agent_offer_negotiation_setting(boolean), public.agent_offer_link_changes_default(boolean) from public, anon;
grant execute on function public.agent_round_present(uuid, text, jsonb, boolean, text, boolean), public.agent_round_change(uuid, uuid, text, int, jsonb, uuid, jsonb), public.agent_offer_layers(uuid, uuid), public.agent_document_close(uuid, text), public.agent_negotiation_withdraw(uuid, text, timestamptz, text), public.agent_offer_negotiation_setting(boolean), public.agent_offer_link_changes_default(boolean) to authenticated;

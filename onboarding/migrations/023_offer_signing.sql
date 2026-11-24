-- Offers phase 3: purchasers sign an offer Tim has approved (phase 2), in person on his device or by a personal link, and the signed
-- copy is locked as Round 1. Additive only. Builds on 018 (offer_events, property_offers, offer_settings, offer_token, offer_net,
-- offer_agent, guard_offer_truncate) and 019 (offer_drafts, offer_draft_approvals, offer_file_hashes, offer_file_confirm, repo_object).
--
-- What it adds:
--   * a hash chain on every offer event (offer_events gains chain, seq, prev_hash, body and hash, set by the database as each event is
--     written): each event carries the fingerprint of the one before it in its chain (the offer's own, or the property's for events
--     about no one offer), so a missing or altered event is found by offer_chain_check. Events written before this have no hash.
--   * offer_signings: one per approved draft released for signing ("Ready to sign"), with the method (in person or by link), the
--     signing places Tim's screen made from the draft and its map (trusted as Tim's own, like phase 2's places, but checked: every
--     purchaser initials the foot of every page and has a signature), and its status: ready (nothing sent), signing, held (a mark made
--     on Tim's screen waits for him to re-approve), complete, locked (Round 1 made) or replaced (a newer draft was released; signatures
--     given on it are kept but void).
--   * offer_signers: one per purchaser, from the draft's own offer details (never the page): their name and own email (agent only,
--     never printed), the link's token, code and session as fingerprints only, consent, their drawn signature and initials, the ID
--     type Tim sighted in person (never a number), and when they finished, with the fingerprint of what they saw.
--   * offer_sign_taps (each place each signer tapped, with server time), offer_sign_receipts (the Client and Customer
--     Acknowledgement and the REA sale and purchase guide, receipted before signing), offer_sign_marks (freehand notes, lines through
--     text, crossed-out boxes and reinstatements: an overlay only, the REINZ content is never altered), offer_sign_reviews (Tim
--     re-approving after marks, with the initials each signer then adds), offer_sign_asks ("Ask Tim for a change" from a link).
--   * offer_rounds: Round 1 as locked: the PDF's path and SHA-256 (worked out by the server from the stored file, as 019's
--     confirm_file does), the execution record, and the last fingerprint of the offer's timeline when it was locked.
-- offer_hits (018) may also hold 'sign_code' and 'sign_try' rows: the per-network limits on emailing codes and typing them (its check is
-- widened, nothing removed).
-- Signers by link never touch a table or function: the offer-sign edge function (JWT verification OFF, like offer-public) calls the
-- offer_sign_* functions below with the service role, passing the token from the link (and the session from the code check).
-- Tim works through agent_signing_*; in person, every signer's step is his device calling these. Vendors have no policy on any of
-- these tables and no function, so they see nothing. Nothing can be removed, emptied or changed outside the functions; a locked
-- round and every tap, receipt, mark, review and ask are never changed at all. Nothing here touches agreements, signatures, signed
-- records or their triggers.

-- ───── the hash chain on offer events ─────
alter table public.offer_events add column chain text, add column seq bigint, add column prev_hash text, add column body text, add column hash text;
create unique index offer_events_chain_seq on public.offer_events (chain, seq) where chain is not null;
-- the exact text fingerprinted for an event (the same function checks it later)
create or replace function public.offer_event_body(p_chain text, p_seq bigint, p_at timestamptz, p_actor text, p_kind text, p_offer uuid, p_property uuid, p_detail jsonb) returns text language sql immutable as $$
  select jsonb_build_object('chain', p_chain, 'seq', p_seq, 'at', to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'actor', p_actor, 'kind', p_kind, 'offer', p_offer, 'property', p_property, 'detail', coalesce(p_detail, '{}'::jsonb))::text $$;
create or replace function public.offer_event_chain() returns trigger language plpgsql security definer set search_path = public as $$
declare lastrow public.offer_events;
begin
  new.chain := coalesce(new.offer_id::text, 'p:' || new.property_id::text);
  perform pg_advisory_xact_lock(hashtextextended('offer_chain:' || new.chain, 0));   -- one event at a time per chain
  select * into lastrow from public.offer_events where chain = new.chain order by seq desc limit 1;
  new.seq := coalesce(lastrow.seq, 0) + 1;
  new.prev_hash := coalesce(lastrow.hash, repeat('0', 64));
  new.at := coalesce(new.at, now()); new.detail := coalesce(new.detail, '{}'::jsonb);
  new.body := public.offer_event_body(new.chain, new.seq, new.at, new.actor, new.kind, new.offer_id, new.property_id, new.detail);
  new.hash := encode(extensions.digest(new.prev_hash || E'\n' || new.body, 'sha256'), 'hex');
  return new;
end $$;
create trigger offer_event_chain before insert on public.offer_events for each row execute function public.offer_event_chain();
-- the per-network limits for the signing codes are kept with the offer form's (widened, nothing removed)
alter table public.offer_hits drop constraint offer_hits_kind_check, add constraint offer_hits_kind_check check (kind in ('info', 'bad', 'submit', 'ai', 'sign_code', 'sign_try'));

-- ───── tables ─────
create table public.offer_signings (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.property_offers(id),
  property_id uuid not null references public.properties(id),
  draft_id uuid not null references public.offer_drafts(id),   -- one live signing per draft (a cancelled one can be released again)
  draft_sha256 text not null check (draft_sha256 ~ '^[0-9a-f]{64}$'),
  method text not null check (method in ('in_person', 'link')),
  pages jsonb not null check (jsonb_typeof(pages) = 'array'),       -- [[width, height], ...] of the approved draft, in PDF points
  places jsonb not null check (jsonb_typeof(places) = 'array'),     -- [{id, signer, kind, why, ref, page, x, y, w, h, label, name?}]
  places_sha256 text not null check (places_sha256 ~ '^[0-9a-f]{64}$'),
  cca_pages integer[] not null default '{}',                        -- the Client and Customer Acknowledgement's pages in the draft
  status text not null default 'ready' check (status in ('ready', 'signing', 'held', 'complete', 'locked', 'replaced', 'cancelled')),
  released_by text not null,
  released_at timestamptz not null default now(),
  sent_at timestamptz, held_at timestamptz, completed_at timestamptz, locked_at timestamptz,
  replaced_at timestamptz, replaced_by uuid references public.offer_signings(id)
);
create index on public.offer_signings (offer_id, released_at desc);
create unique index offer_signings_draft_live on public.offer_signings (draft_id) where status <> 'cancelled';
create table public.offer_signers (
  id uuid primary key default gen_random_uuid(),
  signing_id uuid not null references public.offer_signings(id),
  position integer not null check (position between 1 and 12),
  name text not null check (length(name) between 1 and 250),
  email text,                                                       -- their own, for the link and code only; never printed
  token_hash text unique, link_sent_at timestamptz, link_expires_at timestamptz,
  code_hash text, code_expires_at timestamptz, code_tries integer not null default 0, codes_sent integer not null default 0, codes_window_at timestamptz,
  session_hash text, session_expires_at timestamptz,
  opened_at timestamptz, verified_at timestamptz, consent_at timestamptz,
  sig_png text check (sig_png is null or (length(sig_png) <= 400000 and sig_png ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$')),
  init_png text check (init_png is null or (length(init_png) <= 200000 and init_png ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$')),
  marks_at timestamptz,
  id_sighted text check (id_sighted is null or id_sighted in ('nz_driver_licence', 'passport', 'nz_firearms_licence', 'kiwi_access_card', 'other_photo_id', 'known_to_tim')),
  witnessed_by text,
  finished_at timestamptz, seen_sha256 text check (seen_sha256 is null or seen_sha256 ~ '^[0-9a-f]{64}$'),
  user_agent text, net_hash text,
  void_at timestamptz,
  unique (signing_id, position)
);
create table public.offer_sign_taps (
  id bigserial primary key,
  signing_id uuid not null references public.offer_signings(id),
  signer_id uuid not null references public.offer_signers(id),
  place_id text not null check (length(place_id) between 3 and 140),
  at timestamptz not null default now(),
  unique (signer_id, place_id)
);
create table public.offer_sign_receipts (
  id bigserial primary key,
  signing_id uuid not null references public.offer_signings(id),
  signer_id uuid not null references public.offer_signers(id),
  guide text not null check (guide in ('cca', 'sale_purchase')),
  version text check (version is null or length(version) <= 60),
  file text check (file is null or file ~ '^[A-Za-z0-9._-]{1,120}\.pdf$'),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  pages integer[] not null default '{}',
  at timestamptz not null default now(),
  unique (signer_id, guide)
);
create table public.offer_sign_marks (
  id uuid primary key default gen_random_uuid(),
  signing_id uuid not null references public.offer_signings(id),
  signer_id uuid not null references public.offer_signers(id),
  by_name text not null,
  kind text not null check (kind in ('note', 'strike', 'cross', 'reinstate')),
  page integer not null check (page >= 1),
  geometry jsonb not null check (jsonb_typeof(geometry) = 'object' and length(geometry::text) <= 60000),
  target uuid references public.offer_sign_marks(id),
  at timestamptz not null default now()
);
create table public.offer_sign_reviews (
  id bigserial primary key,
  signing_id uuid not null references public.offer_signings(id),
  marks uuid[] not null,
  places jsonb not null check (jsonb_typeof(places) = 'array'),
  places_sha256 text not null check (places_sha256 ~ '^[0-9a-f]{64}$'),
  reviewed_by text not null,
  at timestamptz not null default now()
);
create table public.offer_sign_asks (
  id bigserial primary key,
  signing_id uuid not null references public.offer_signings(id),
  signer_id uuid not null references public.offer_signers(id),
  text text not null check (length(text) between 3 and 1000),
  at timestamptz not null default now()
);
create table public.offer_rounds (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.property_offers(id),
  property_id uuid not null references public.properties(id),
  signing_id uuid not null unique references public.offer_signings(id),
  number integer not null check (number >= 1),
  draft_id uuid not null references public.offer_drafts(id),
  draft_sha256 text not null check (draft_sha256 ~ '^[0-9a-f]{64}$'),
  places_sha256 text not null check (places_sha256 ~ '^[0-9a-f]{64}$'),
  path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint not null check (size_bytes > 0),
  execution jsonb not null,
  chain_last text not null check (chain_last ~ '^[0-9a-f]{64}$'),   -- the fingerprint of the "round locked" event, the newest in the offer's chain
  locked_by text not null,
  locked_at timestamptz not null default now(),
  unique (offer_id, number)
);

-- ───── records stay as made ─────
-- taps, receipts, marks, reviews, asks and rounds: never changed or removed (guard_offer_record, 019)
create trigger offer_sign_taps_fixed before update or delete on public.offer_sign_taps for each row execute function public.guard_offer_record();
create trigger offer_sign_receipts_fixed before update or delete on public.offer_sign_receipts for each row execute function public.guard_offer_record();
create trigger offer_sign_marks_fixed before update or delete on public.offer_sign_marks for each row execute function public.guard_offer_record();
create trigger offer_sign_reviews_fixed before update or delete on public.offer_sign_reviews for each row execute function public.guard_offer_record();
create trigger offer_sign_asks_fixed before update or delete on public.offer_sign_asks for each row execute function public.guard_offer_record();
create trigger offer_rounds_fixed before update or delete on public.offer_rounds for each row execute function public.guard_offer_record();
-- a signing and its signers change only through the functions below (each sets offers.fn while it works), never their identity; a
-- locked or replaced signing never changes again; a void signer never changes; a signer's drawn marks are fixed once they tap
create or replace function public.guard_offer_signing() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Signing records are never removed'; end if;
  if coalesce(current_setting('offers.fn', true), '') <> 'on' then raise exception 'Signing is changed only through the signing screens, so there is a record'; end if;
  if (to_jsonb(new) - array['status', 'sent_at', 'held_at', 'completed_at', 'locked_at', 'replaced_at', 'replaced_by']) is distinct from (to_jsonb(old) - array['status', 'sent_at', 'held_at', 'completed_at', 'locked_at', 'replaced_at', 'replaced_by']) then
    raise exception 'What was released for signing is kept as it was'; end if;
  if old.status in ('locked', 'replaced', 'cancelled') then raise exception 'This signing is finished and kept as it was'; end if;
  return new;
end $$;
create trigger guard_offer_signing before update or delete on public.offer_signings for each row execute function public.guard_offer_signing();
create or replace function public.guard_offer_signer() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Signing records are never removed'; end if;
  if coalesce(current_setting('offers.fn', true), '') <> 'on' then raise exception 'Signing is changed only through the signing screens, so there is a record'; end if;
  if new.signing_id is distinct from old.signing_id or new.position is distinct from old.position or new.name is distinct from old.name or new.email is distinct from old.email then raise exception 'Who signs is kept as it was released'; end if;
  if old.void_at is not null then raise exception 'These signatures were replaced, and are kept as they were'; end if;
  -- a newer draft replaces the signing: its signers are marked void (and their link closed), even when everyone had signed; nothing
  -- else about them may change in the same step
  if new.void_at is not null and new.token_hash is null and new.session_hash is null and new.code_hash is null
     and (select status from public.offer_signings where id = old.signing_id) in ('ready', 'signing', 'held', 'complete')
     and (to_jsonb(new) - array['void_at', 'token_hash', 'session_hash', 'code_hash']) is not distinct from (to_jsonb(old) - array['void_at', 'token_hash', 'session_hash', 'code_hash']) then return new; end if;
  -- once everyone has signed, nothing about any signer changes
  if (select status from public.offer_signings where id = old.signing_id) in ('complete', 'locked', 'replaced', 'cancelled') then raise exception 'Signing is finished, so the signers are kept as they were'; end if;
  -- a finished signer's record stays as it was: only Tim re-approving a mark reopens it, and replacing it voids it
  if old.finished_at is not null and new.finished_at is not null and (to_jsonb(new) - array['void_at', 'token_hash', 'session_hash', 'code_hash', 'session_expires_at', 'code_expires_at', 'code_tries'])
     is distinct from (to_jsonb(old) - array['void_at', 'token_hash', 'session_hash', 'code_hash', 'session_expires_at', 'code_expires_at', 'code_tries']) then raise exception 'A finished signature is kept as it was'; end if;
  if (new.sig_png is distinct from old.sig_png or new.init_png is distinct from old.init_png) and exists (select 1 from public.offer_sign_taps t where t.signer_id = old.id) then raise exception 'Your signature and initials are kept as you first used them'; end if;
  return new;
end $$;
create trigger guard_offer_signer before update or delete on public.offer_signers for each row execute function public.guard_offer_signer();
-- and none of these tables can be emptied
create trigger offer_signings_no_truncate before truncate on public.offer_signings for each statement execute function public.guard_offer_truncate();
create trigger offer_signers_no_truncate before truncate on public.offer_signers for each statement execute function public.guard_offer_truncate();
create trigger offer_sign_taps_no_truncate before truncate on public.offer_sign_taps for each statement execute function public.guard_offer_truncate();
create trigger offer_sign_receipts_no_truncate before truncate on public.offer_sign_receipts for each statement execute function public.guard_offer_truncate();
create trigger offer_sign_marks_no_truncate before truncate on public.offer_sign_marks for each statement execute function public.guard_offer_truncate();
create trigger offer_sign_reviews_no_truncate before truncate on public.offer_sign_reviews for each statement execute function public.guard_offer_truncate();
create trigger offer_sign_asks_no_truncate before truncate on public.offer_sign_asks for each statement execute function public.guard_offer_truncate();
create trigger offer_rounds_no_truncate before truncate on public.offer_rounds for each statement execute function public.guard_offer_truncate();

-- ───── who sees what: Tim only ─────
alter table public.offer_signings enable row level security;
alter table public.offer_signers enable row level security;
alter table public.offer_sign_taps enable row level security;
alter table public.offer_sign_receipts enable row level security;
alter table public.offer_sign_marks enable row level security;
alter table public.offer_sign_reviews enable row level security;
alter table public.offer_sign_asks enable row level security;
alter table public.offer_rounds enable row level security;
create policy osg_agent_read on public.offer_signings for select using (public.is_agent());
create policy osr_agent_read on public.offer_signers for select using (public.is_agent());
create policy ost_agent_read on public.offer_sign_taps for select using (public.is_agent());
create policy osc_agent_read on public.offer_sign_receipts for select using (public.is_agent());
create policy osm_agent_read on public.offer_sign_marks for select using (public.is_agent());
create policy osv_agent_read on public.offer_sign_reviews for select using (public.is_agent());
create policy osa_agent_read on public.offer_sign_asks for select using (public.is_agent());
create policy orn_agent_read on public.offer_rounds for select using (public.is_agent());
revoke all on public.offer_signings, public.offer_signers, public.offer_sign_taps, public.offer_sign_receipts, public.offer_sign_marks, public.offer_sign_reviews, public.offer_sign_asks, public.offer_rounds from anon;
revoke insert, update, delete, truncate, references, trigger on public.offer_signings, public.offer_signers, public.offer_sign_taps, public.offer_sign_receipts, public.offer_sign_marks, public.offer_sign_reviews, public.offer_sign_asks, public.offer_rounds from authenticated;
-- the link's token, code and session fingerprints are never readable, even by Tim
revoke select on public.offer_signers from authenticated;
grant select (id, signing_id, position, name, email, link_sent_at, link_expires_at, codes_sent, opened_at, verified_at, consent_at, sig_png, init_png, marks_at, id_sighted, witnessed_by, finished_at, seen_sha256, user_agent, net_hash, void_at) on public.offer_signers to authenticated;
revoke all on sequence public.offer_sign_taps_id_seq, public.offer_sign_receipts_id_seq, public.offer_sign_reviews_id_seq, public.offer_sign_asks_id_seq from anon, authenticated;

-- ───── helpers (internal) ─────
create or replace function public.offer_sha(t text) returns text language sql immutable set search_path = public as $$ select encode(extensions.digest(coalesce(t, ''), 'sha256'), 'hex') $$;
-- the signing places from Tim's screen: each with an id, a signer, a kind, why it is there, a page of the draft and a box on it;
-- every signer has a signature and initials at the foot of every page
create or replace function public.offer_sign_places_ok(p_places jsonb, p_pages jsonb, p_signers int, p_need_all boolean default true) returns boolean language plpgsql immutable set search_path = public as $$
declare x jsonb; pg int; w numeric; h numeric; s int; n int := jsonb_array_length(p_pages);
begin
  if jsonb_typeof(p_places) <> 'array' or jsonb_array_length(p_places) > 6000 or length(p_places::text) > 3000000 then return false; end if;
  for x in select * from jsonb_array_elements(p_places) loop
    if jsonb_typeof(x) <> 'object' or coalesce(x->>'id', '') !~ '^[a-z]{3,8}:[A-Za-z0-9_.:-]{1,110}:s[0-9]{1,2}$' then return false; end if;
    if not public.offer_num_ok(x->'signer', 1, p_signers) or coalesce(x->>'kind', '') not in ('initial', 'signature', 'name') or coalesce(x->>'why', '') not in ('filled', 'foot', 'term', 'block', 'ack', 'mark') then return false; end if;
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
-- a mark's shape: points on the page, a sensible size (the same rule as SIGN.markOk)
create or replace function public.offer_mark_ok(p_kind text, p_geo jsonb, p_w numeric, p_h numeric) returns boolean language plpgsql immutable set search_path = public as $$
declare s jsonb; p jsonb;
begin
  if jsonb_typeof(p_geo) <> 'object' then return false; end if;
  if p_kind = 'note' then
    if jsonb_typeof(p_geo->'strokes') <> 'array' or jsonb_array_length(p_geo->'strokes') not between 1 and 60 then return false; end if;
    for s in select * from jsonb_array_elements(p_geo->'strokes') loop
      if jsonb_typeof(s) <> 'array' or jsonb_array_length(s) not between 2 and 400 then return false; end if;
      for p in select * from jsonb_array_elements(s) loop
        if jsonb_typeof(p) <> 'array' or not (public.offer_num_ok(p->0, 0, p_w) and public.offer_num_ok(p->1, 0, p_h)) then return false; end if;
      end loop;
    end loop;
    return true;
  elsif p_kind = 'strike' then
    return public.offer_num_ok(p_geo->'x0', 0, p_w) and public.offer_num_ok(p_geo->'x1', 0, p_w) and public.offer_num_ok(p_geo->'y', 0, p_h) and abs((p_geo->>'x1')::numeric - (p_geo->>'x0')::numeric) >= 6;
  elsif p_kind = 'cross' then
    return public.offer_num_ok(p_geo->'x', 0, p_w) and public.offer_num_ok(p_geo->'y', 0, p_h) and public.offer_num_ok(p_geo->'w', 6, p_w) and public.offer_num_ok(p_geo->'h', 6, p_h)
      and (p_geo->>'x')::numeric + (p_geo->>'w')::numeric <= p_w and (p_geo->>'y')::numeric + (p_geo->>'h')::numeric <= p_h;
  elsif p_kind = 'reinstate' then
    return public.offer_num_ok(p_geo->'x', 0, p_w) and public.offer_num_ok(p_geo->'y', 0, p_h);
  end if;
  return false;
end $$;
-- the place ids one signer must do: the released places and those added when Tim re-approved marks
create or replace function public.offer_sign_required(p_signing uuid, p_position int) returns setof text language sql stable set search_path = public as $$
  select e->>'id' from public.offer_signings g, jsonb_array_elements(g.places) e where g.id = p_signing and (e->>'signer')::int = p_position
  union
  select e->>'id' from public.offer_sign_reviews r, jsonb_array_elements(r.places) e where r.signing_id = p_signing and (e->>'signer')::int = p_position $$;
-- is this signing still the one to sign? Its draft must be the newest for the offer, and the offer unchanged since it was drafted
create or replace function public.offer_sign_current(g public.offer_signings) returns text language plpgsql stable set search_path = public as $$
declare d public.offer_drafts; o public.property_offers;
begin
  if g.status = 'replaced' then return 'This version has been replaced. Tim will send you the new one.'; end if;
  if g.status = 'locked' then return 'Signing is finished, and the signed copy is locked.'; end if;
  if g.status = 'cancelled' then return 'This signing was stopped before anyone signed. Tim will send it to you again.'; end if;
  select * into d from public.offer_drafts where id = g.draft_id; select * into o from public.property_offers where id = g.offer_id;
  if o.status in ('withdrawn', 'lapsed') then return 'This offer has been withdrawn or has lapsed.'; end if;
  if d.number <> (select max(number) from public.offer_drafts where offer_id = g.offer_id) or o.details is distinct from d.details then
    return 'The offer has changed since it was sent for signing. Tim will send you the new version.'; end if;
  return null;
end $$;
-- the signer may act now: not void, the signing current and open (not held for Tim)
create or replace function public.offer_sign_ready(s public.offer_signers, p_allow_finished boolean default false) returns public.offer_signings language plpgsql stable set search_path = public as $$
declare g public.offer_signings; why text;
begin
  select * into g from public.offer_signings where id = s.signing_id;
  if s.void_at is not null then raise exception 'This version has been replaced. Tim will send you the new one.'; end if;
  why := public.offer_sign_current(g); if why is not null then raise exception '%', why; end if;
  if g.status = 'ready' then raise exception 'Signing hasn''t started yet'; end if;
  if g.status = 'held' then raise exception 'Tim is checking a change to the document. Signing carries on once he has.'; end if;
  if g.status = 'complete' then raise exception 'Everyone has signed. The signed copy is being locked.'; end if;
  if s.finished_at is not null and not p_allow_finished then raise exception 'You have finished signing. Thank you.'; end if;
  return g;
end $$;
-- the steps every signer takes, whether in person or by link (internal: called by the agent_signing_* and offer_sign_* functions)
create or replace function public.offer_sign_do_consent(p_signer uuid, p_ua text, p_net text) returns void language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings;
begin
  select * into s from public.offer_signers where id = p_signer for update; g := public.offer_sign_ready(s);
  if s.consent_at is not null then return; end if;
  perform set_config('offers.fn', 'on', true);
  update public.offer_signers set consent_at = now(), user_agent = left(coalesce(p_ua, user_agent), 400), net_hash = coalesce(p_net, net_hash) where id = s.id;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, s.name, 'sign_consent', jsonb_build_object('signing_id', g.id, 'signer', s.position));
  perform set_config('offers.fn', '', true);
end $$;
create or replace function public.offer_sign_do_receipt(p_signer uuid, p_guide text, p_version text, p_file text, p_sha256 text, p_pages int[]) returns void language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings;
begin
  select * into s from public.offer_signers where id = p_signer for update; g := public.offer_sign_ready(s);
  if s.consent_at is null then raise exception 'Agree to sign electronically first'; end if;
  if p_guide not in ('cca', 'sale_purchase') then raise exception 'Unknown guide'; end if;
  if p_guide = 'cca' and (coalesce(array_length(g.cca_pages, 1), 0) = 0 or coalesce(p_pages, '{}') <> g.cca_pages) then raise exception 'Please read the Client and Customer Acknowledgement pages first'; end if;
  if p_guide = 'sale_purchase' and (coalesce(p_file, '') !~ '^[A-Za-z0-9._-]{1,120}\.pdf$' or coalesce(p_version, '') = '' or length(p_version) > 60 or (p_sha256 is not null and p_sha256 !~ '^[0-9a-f]{64}$')) then raise exception 'Please open the guide first'; end if;
  if exists (select 1 from public.offer_sign_receipts where signer_id = s.id and guide = p_guide) then return; end if;
  insert into public.offer_sign_receipts (signing_id, signer_id, guide, version, file, sha256, pages) values (g.id, s.id, p_guide, case when p_guide = 'cca' then null else p_version end, case when p_guide = 'cca' then null else p_file end, case when p_guide = 'cca' then null else p_sha256 end, case when p_guide = 'cca' then g.cca_pages else '{}' end);
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, s.name, 'sign_receipt', jsonb_build_object('signing_id', g.id, 'signer', s.position, 'guide', p_guide, 'version', p_version));
end $$;
create or replace function public.offer_sign_do_marks(p_signer uuid, p_sig text, p_init text) returns void language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings;
begin
  select * into s from public.offer_signers where id = p_signer for update; g := public.offer_sign_ready(s);
  if s.consent_at is null then raise exception 'Agree to sign electronically first'; end if;
  if coalesce(p_sig, '') !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' or length(p_sig) > 400000 or length(p_sig) < 200 then raise exception 'Please draw your signature'; end if;
  if coalesce(p_init, '') !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' or length(p_init) > 200000 or length(p_init) < 150 then raise exception 'Please draw your initials'; end if;
  if exists (select 1 from public.offer_sign_taps t where t.signer_id = s.id) then raise exception 'Your signature and initials are kept as you first used them'; end if;
  perform set_config('offers.fn', 'on', true);
  update public.offer_signers set sig_png = p_sig, init_png = p_init, marks_at = now() where id = s.id;
  perform set_config('offers.fn', '', true);
end $$;
create or replace function public.offer_sign_do_tap(p_signer uuid, p_place text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings; done int; need int;
begin
  select * into s from public.offer_signers where id = p_signer for update; g := public.offer_sign_ready(s);
  if s.consent_at is null then raise exception 'Agree to sign electronically first'; end if;
  if not exists (select 1 from public.offer_sign_receipts where signer_id = s.id and guide = 'sale_purchase') or (coalesce(array_length(g.cca_pages, 1), 0) > 0 and not exists (select 1 from public.offer_sign_receipts where signer_id = s.id and guide = 'cca')) then
    raise exception 'Please read and tick the guides first'; end if;
  if s.sig_png is null or s.init_png is null then raise exception 'Draw your signature and initials first'; end if;
  if p_place is null or p_place not in (select public.offer_sign_required(g.id, s.position)) then raise exception 'That place isn''t yours to sign'; end if;
  insert into public.offer_sign_taps (signing_id, signer_id, place_id) values (g.id, s.id, p_place) on conflict (signer_id, place_id) do nothing;
  select count(*) into need from public.offer_sign_required(g.id, s.position) x;
  select count(*) into done from public.offer_sign_taps t where t.signer_id = s.id and t.place_id in (select public.offer_sign_required(g.id, s.position));
  return jsonb_build_object('done', done, 'of', need);
end $$;
-- a signer finishes once every place of theirs is done. When every signer has finished (and no mark waits for Tim), the signing is
-- complete and the Round 1 PDF is made (the offer-sign edge function, then offer_round_lock).
create or replace function public.offer_sign_do_finish(p_signer uuid, p_ua text, p_net text, p_id text, p_witness text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings; missing int; seen text; taps text; left_ int;
begin
  -- one finish at a time per signing: the signing is locked first, then the signer, and both are read again under the lock
  perform 1 from public.offer_signings where id = (select signing_id from public.offer_signers where id = p_signer) for update;
  select * into s from public.offer_signers where id = p_signer for update; g := public.offer_sign_ready(s);
  if s.consent_at is null or s.sig_png is null then raise exception 'Agree, read the guides and draw your signature and initials first'; end if;
  select count(*) into missing from public.offer_sign_required(g.id, s.position) r where r not in (select place_id from public.offer_sign_taps where signer_id = s.id);
  if missing > 0 then raise exception 'There % still % to do', case when missing = 1 then 'is' else 'are' end, case when missing = 1 then '1 place' else missing || ' places' end; end if;
  select string_agg(t.place_id || '@' || to_char(t.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), E'\n' order by t.id) into taps from public.offer_sign_taps t where t.signer_id = s.id;
  -- what they saw: the approved draft, the places released, those added when Tim re-approved marks, and which signer they are
  seen := public.offer_sha(g.draft_sha256 || ':' || g.places_sha256 || ':' || coalesce((select string_agg(r.places_sha256, ',' order by r.id) from public.offer_sign_reviews r where r.signing_id = g.id), '') || ':' || s.position);
  perform set_config('offers.fn', 'on', true);
  update public.offer_signers set finished_at = now(), seen_sha256 = seen, id_sighted = coalesce(p_id, id_sighted), witnessed_by = coalesce(p_witness, witnessed_by), user_agent = left(coalesce(p_ua, user_agent), 400), net_hash = coalesce(p_net, net_hash) where id = s.id;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, s.name, 'sign_finished',
    jsonb_build_object('signing_id', g.id, 'signer', s.position, 'method', g.method, 'places', (select count(*) from public.offer_sign_required(g.id, s.position) x), 'taps_sha256', public.offer_sha(taps), 'seen_sha256', seen, 'id_sighted', coalesce(p_id, s.id_sighted)));
  select count(*) into left_ from public.offer_signers where signing_id = g.id and void_at is null and finished_at is null;
  if left_ = 0 then
    update public.offer_signings set status = 'complete', completed_at = now() where id = g.id;
    insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, 'system', 'sign_complete', jsonb_build_object('signing_id', g.id, 'signers', (select count(*) from public.offer_signers where signing_id = g.id)));
  end if;
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('ok', true, 'complete', left_ = 0, 'signing_id', g.id);
end $$;

-- ───── Tim's side ─────
-- "Ready to sign": an approved draft (the newest, the offer unchanged since) is released with its signing places. Nothing is sent.
-- Any earlier signing of the offer not yet locked is replaced: its signatures are kept but void.
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
  if exists (select 1 from public.offer_rounds where offer_id = o.id) then raise exception 'This offer already has a signed Round 1'; end if;
  select id into sid from public.offer_signings where draft_id = d.id and status <> 'cancelled';
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
-- in person: Tim starts signing on his device (nothing is sent)
create or replace function public.agent_signing_start(p_signing uuid) returns void language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); g public.offer_signings; why text;
begin
  select * into g from public.offer_signings where id = p_signing for update; if g.id is null then raise exception 'No such signing'; end if;
  if g.method <> 'in_person' then raise exception 'This signing is by link: use Send'; end if;
  why := public.offer_sign_current(g); if why is not null then raise exception '%', why; end if;
  if g.status <> 'ready' then return; end if;
  perform set_config('offers.fn', 'on', true);
  update public.offer_signings set status = 'signing', sent_at = now() where id = g.id;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, me, 'sign_started', jsonb_build_object('signing_id', g.id, 'method', 'in_person'));
  perform set_config('offers.fn', '', true);
end $$;
-- Tim changes how they sign (in person or by link): only while nobody has started signing (agreed to sign, or tapped a place). The
-- release is cancelled, recorded, and any links sent stop working; the same draft can then be released again the other way.
create or replace function public.agent_signing_cancel(p_signing uuid, p_reason text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); g public.offer_signings; who text;
begin
  select * into g from public.offer_signings where id = p_signing for update; if g.id is null then raise exception 'No such signing'; end if;
  if g.status not in ('ready', 'signing') then raise exception 'This signing can''t be changed now (%)', g.status; end if;
  select string_agg(name, ', ' order by position) into who from public.offer_signers s where s.signing_id = g.id and (s.consent_at is not null or exists (select 1 from public.offer_sign_taps t where t.signer_id = s.id));
  if who is not null then raise exception '% % started signing, so how they sign can''t be changed. To start again, correct the offer and re-draft it', who, case when position(',' in who) > 0 then 'have' else 'has' end; end if;
  perform set_config('offers.fn', 'on', true);
  update public.offer_signers set void_at = now(), token_hash = null, session_hash = null, code_hash = null where signing_id = g.id;
  update public.offer_signings set status = 'cancelled' where id = g.id;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, me, 'sign_cancelled', jsonb_build_object('signing_id', g.id, 'method', g.method, 'links_sent', g.sent_at is not null, 'reason', left(nullif(trim(coalesce(p_reason, '')), ''), 300)));
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('ok', true, 'draft_id', g.draft_id);
end $$;
-- the in-person signer on Tim's device: each signer's own steps
create or replace function public.offer_sign_person(p_signer uuid) returns public.offer_signers language plpgsql stable security definer set search_path = public as $$
declare s public.offer_signers;
begin
  perform public.offer_agent();
  select * into s from public.offer_signers where id = p_signer; if s.id is null then raise exception 'No such signer'; end if;
  if (select method from public.offer_signings where id = s.signing_id) <> 'in_person' then raise exception 'This purchaser signs by their own link'; end if;
  -- a signer whose version was replaced, or a signing Tim stopped, has no turn (the address of a turn is checked whole by agent_signing_turn_ok)
  if s.void_at is not null or (select status from public.offer_signings where id = s.signing_id) in ('cancelled', 'replaced', 'withdrawn') then raise exception 'This signing has stopped, so this turn is closed'; end if;
  return s;
end $$;
-- a turn's address (properties/<p>/offers/<o>/signing/<s>/turn/<signer>) checked whole: the signer is in that signing, the signing is
-- of that offer and that property, it is signed in person, and the signer's version stands
create or replace function public.agent_signing_turn_ok(p_property uuid, p_offer uuid, p_signing uuid, p_signer uuid) returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  perform public.offer_agent();
  return exists (select 1 from public.offer_signers s join public.offer_signings g on g.id = s.signing_id
    where s.id = p_signer and g.id = p_signing and g.offer_id = p_offer and g.property_id = p_property and g.method = 'in_person' and s.void_at is null);
end $$;
create or replace function public.agent_signing_consent(p_signer uuid, p_ua text) returns void language plpgsql security definer set search_path = public as $$
begin perform public.offer_sign_person(p_signer); perform public.offer_sign_do_consent(p_signer, p_ua, null); end $$;
create or replace function public.agent_signing_receipt(p_signer uuid, p_guide text, p_version text, p_file text, p_sha256 text, p_pages int[]) returns void language plpgsql security definer set search_path = public as $$
begin perform public.offer_sign_person(p_signer); perform public.offer_sign_do_receipt(p_signer, p_guide, p_version, p_file, p_sha256, p_pages); end $$;
create or replace function public.agent_signing_marks(p_signer uuid, p_sig text, p_init text) returns void language plpgsql security definer set search_path = public as $$
begin perform public.offer_sign_person(p_signer); perform public.offer_sign_do_marks(p_signer, p_sig, p_init); end $$;
create or replace function public.agent_signing_tap(p_signer uuid, p_place text) returns jsonb language plpgsql security definer set search_path = public as $$
begin perform public.offer_sign_person(p_signer); return public.offer_sign_do_tap(p_signer, p_place); end $$;
-- Tim records that he saw them sign and, if he chooses, that he knows them or the photo ID he sighted (its type only, never a number)
create or replace function public.agent_signing_finish(p_signer uuid, p_id_sighted text, p_ua text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent();
begin
  perform public.offer_sign_person(p_signer);
  -- identity is Tim's free choice (Tim, 24 November 2026): known to the agent, an ID check (the type seen), or neither; blank is allowed
  if nullif(p_id_sighted, '') is not null and p_id_sighted not in ('nz_driver_licence', 'passport', 'nz_firearms_licence', 'kiwi_access_card', 'other_photo_id', 'known_to_tim') then raise exception 'That ID choice isn''t one of the list'; end if;
  return public.offer_sign_do_finish(p_signer, p_ua, null, nullif(p_id_sighted, ''), coalesce((select name from public.agents where lower(email) = lower(me) limit 1), me));
end $$;
-- a mark made with a finger or stylus on Tim's screen (in person only): an overlay, never a change to the REINZ content. Any mark
-- holds signing until Tim has looked at it and re-approved.
create or replace function public.agent_signing_mark(p_signer uuid, p_kind text, p_page int, p_geometry jsonb, p_target uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); s public.offer_signers; g public.offer_signings; t public.offer_sign_marks; mid uuid; w numeric; h numeric; why text;
begin
  s := public.offer_sign_person(p_signer);
  select * into g from public.offer_signings where id = s.signing_id for update; select * into s from public.offer_signers where id = p_signer for update;
  -- several marks may be made before Tim looks at them, so a held signing still takes marks
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
-- Tim re-approves after marks: every signer then initials each mark (the places his screen made); anyone who had finished signs again
create or replace function public.agent_signing_review(p_signing uuid, p_places jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); g public.offer_signings; ms uuid[]; n int; x jsonb; why text; reopened int;
begin
  select * into g from public.offer_signings where id = p_signing for update; if g.id is null then raise exception 'No such signing'; end if;
  if g.status <> 'held' then raise exception 'Nothing is waiting for you to check'; end if;
  why := public.offer_sign_current(g); if why is not null then raise exception '%', why; end if;
  select coalesce(array_agg(m.id order by m.at), '{}') into ms from public.offer_sign_marks m where m.signing_id = g.id and not exists (select 1 from public.offer_sign_reviews r where r.signing_id = g.id and m.id = any (r.marks));
  select count(*) into n from public.offer_signers where signing_id = g.id;
  if not public.offer_sign_places_ok(p_places, g.pages, n, false) then raise exception 'Please check the places for the initials'; end if;
  -- exactly one initial place per mark per signer, and nothing else
  if jsonb_array_length(p_places) <> coalesce(array_length(ms, 1), 0) * n then raise exception 'Each purchaser initials each mark once'; end if;
  for x in select * from jsonb_array_elements(p_places) loop
    if x->>'why' <> 'mark' or x->>'kind' <> 'initial' or (x->>'ref')::uuid is distinct from (select m from unnest(ms) m where m = (x->>'ref')::uuid) or x->>'id' <> ('mark:' || (x->>'ref') || ':s' || (x->>'signer')) then raise exception 'Each purchaser initials each mark once'; end if;
  end loop;
  perform set_config('offers.fn', 'on', true);
  insert into public.offer_sign_reviews (signing_id, marks, places, places_sha256, reviewed_by) values (g.id, ms, p_places, public.offer_sha(p_places::text), me);
  update public.offer_signers set finished_at = null, seen_sha256 = null where signing_id = g.id and finished_at is not null and void_at is null;
  get diagnostics reopened = row_count;
  update public.offer_signings set status = 'signing' where id = g.id;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, me, 'sign_reviewed', jsonb_build_object('signing_id', g.id, 'marks', to_jsonb(ms), 'places', jsonb_array_length(p_places), 'places_sha256', public.offer_sha(p_places::text), 'reopened', reopened));
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('ok', true, 'marks', coalesce(array_length(ms, 1), 0), 'reopened', reopened);
end $$;
-- the offer's timeline checked: every event in its chain follows on from the one before, and says what it said when recorded
create or replace function public.offer_chain_verify(p_chain text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.offer_events; prev text := repeat('0', 64); expect bigint := 1; n int := 0; bad jsonb := '[]'::jsonb; before int;
begin
  select count(*) into before from public.offer_events where chain is null and coalesce(offer_id::text, 'p:' || property_id::text) = p_chain;
  for r in select * from public.offer_events where chain = p_chain order by seq loop
    n := n + 1;
    if r.seq <> expect then bad := bad || jsonb_build_object('seq', r.seq, 'why', 'An event is missing before this one'); end if;
    if r.prev_hash is distinct from prev then bad := bad || jsonb_build_object('seq', r.seq, 'why', 'It doesn''t follow on from the event before it'); end if;
    if r.hash is distinct from encode(extensions.digest(r.prev_hash || E'\n' || r.body, 'sha256'), 'hex') then bad := bad || jsonb_build_object('seq', r.seq, 'why', 'Its fingerprint doesn''t match what it says'); end if;
    if r.body is distinct from public.offer_event_body(r.chain, r.seq, r.at, r.actor, r.kind, r.offer_id, r.property_id, r.detail) then bad := bad || jsonb_build_object('seq', r.seq, 'why', 'It has been changed since it was recorded'); end if;
    prev := r.hash; expect := r.seq + 1;
  end loop;
  return jsonb_build_object('ok', jsonb_array_length(bad) = 0, 'events', n, 'before', before, 'last', case when n > 0 then prev end, 'problems', bad);
end $$;
create or replace function public.agent_offer_chain_check(p_offer uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin perform public.offer_agent(); return public.offer_chain_verify(p_offer::text); end $$;

-- ───── the offer-sign edge function (service role) ─────
-- Tim taps Send (the edge function has checked he is the agent): a personal link for each purchaser still to sign. The raw tokens
-- are returned once, for the emails, and only their fingerprints are kept. Sending again makes new links; the old ones stop working.
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
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, left(coalesce(p_actor, 'agent'), 254), 'sign_links_sent', jsonb_build_object('signing_id', g.id, 'signers', jsonb_array_length(out_), 'resent', g.status = 'signing'));
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('address', addr, 'links', out_);
end $$;
-- the signer a token belongs to (a live, unexpired link), or null, whatever their state (opening the link says what it is)
create or replace function public.offer_sign_find(p_token text) returns public.offer_signers language sql stable security definer set search_path = public as $$
  select s.* from public.offer_signers s where p_token ~ '^[A-Za-z0-9_-]{40,64}$' and s.token_hash = public.offer_sha(p_token) and s.link_expires_at > now() limit 1 $$;
-- the same, only while they may still act: not finished, not void, and the signing open (signing, or held for Tim)
create or replace function public.offer_sign_by_token(p_token text) returns public.offer_signers language sql stable security definer set search_path = public as $$
  select s.* from public.offer_sign_find(p_token) s join public.offer_signings g on g.id = s.signing_id where s.id is not null and s.finished_at is null and s.void_at is null and g.status in ('signing', 'held') $$;
-- and with a session from the code check
create or replace function public.offer_sign_me(p_token text, p_session text) returns public.offer_signers language plpgsql stable security definer set search_path = public as $$
declare s public.offer_signers;
begin
  s := public.offer_sign_by_token(p_token); if s.id is null then raise exception 'This link isn''t working. Ask Tim for a new one.'; end if;
  if coalesce(p_session, '') !~ '^[A-Za-z0-9_-]{40,64}$' or s.session_hash is distinct from public.offer_sha(p_session) or s.session_expires_at < now() then raise exception 'Please enter the code from your email again'; end if;
  return s;
end $$;
-- opening the link: who it is for (first name only), the address, and what comes next. Nothing about anyone else or other offers.
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
  return jsonb_build_object('ok', true, 'first', split_part(s.name, ' ', 1), 'address', addr, 'finished', s.finished_at is not null, 'stopped', why, 'held', g.status = 'held',
    'email_hint', case when position('@' in e) > 1 then left(e, 1) || '***@' || split_part(e, '@', 2) else '' end);
end $$;
-- a one-time code, for the edge function to email to the signer's own address: 6 digits, 15 minutes, at most 5 an hour
create or replace function public.offer_sign_code(p_token text, p_net text) returns jsonb language plpgsql security definer set search_path = public as $$
declare n text := public.offer_net(p_net); s public.offer_signers; b bytea; code text; addr text;
begin
  s := public.offer_sign_find(p_token);
  if s.id is null then if public.offer_hit_count('bad', n, null, interval '1 hour') < 30 then insert into public.offer_hits (kind, net) values ('bad', n); end if; return jsonb_build_object('ok', false); end if;
  if public.offer_hit_count('sign_code', n, null, interval '1 hour') >= 20 then return jsonb_build_object('ok', false, 'reason', 'busy'); end if;
  insert into public.offer_hits (kind, net) values ('sign_code', n);
  -- the row is locked, so two requests at once can't both get under the limit
  select * into s from public.offer_signers where id = s.id for update;
  if s.void_at is not null or s.finished_at is not null or s.email is null or (select status from public.offer_signings where id = s.signing_id) not in ('signing', 'held') then return jsonb_build_object('ok', false, 'reason', 'stopped'); end if;
  if s.codes_window_at is not null and s.codes_window_at > now() - interval '1 hour' and s.codes_sent >= 5 then return jsonb_build_object('ok', false, 'reason', 'busy'); end if;
  b := extensions.gen_random_bytes(4); code := lpad(((get_byte(b, 0)::bigint * 16777216 + get_byte(b, 1) * 65536 + get_byte(b, 2) * 256 + get_byte(b, 3)) % 1000000)::text, 6, '0');
  perform set_config('offers.fn', 'on', true);
  update public.offer_signers set code_hash = public.offer_sha((select net_salt from public.offer_settings) || ':' || s.id || ':' || code), code_expires_at = now() + interval '15 minutes', code_tries = 0,
    codes_sent = case when codes_window_at is null or codes_window_at <= now() - interval '1 hour' then 1 else codes_sent + 1 end,
    codes_window_at = case when codes_window_at is null or codes_window_at <= now() - interval '1 hour' then now() else codes_window_at end where id = s.id;
  perform set_config('offers.fn', '', true);
  select p.address into addr from public.offer_signings g join public.properties p on p.id = g.property_id where g.id = s.signing_id;
  return jsonb_build_object('ok', true, 'code', code, 'email', s.email, 'name', s.name, 'address', addr);
end $$;
-- the code typed back: a session for this signer (2 hours). Five wrong tries and the code stops working.
create or replace function public.offer_sign_verify(p_token text, p_code text, p_net text, p_ua text) returns jsonb language plpgsql security definer set search_path = public as $$
declare n text := public.offer_net(p_net); s public.offer_signers; g public.offer_signings; ses text;
begin
  s := public.offer_sign_find(p_token);
  if s.id is null then if public.offer_hit_count('bad', n, null, interval '1 hour') < 30 then insert into public.offer_hits (kind, net) values ('bad', n); end if; return jsonb_build_object('ok', false); end if;
  if public.offer_hit_count('sign_try', n, null, interval '1 hour') >= 30 then return jsonb_build_object('ok', false, 'reason', 'busy'); end if;
  insert into public.offer_hits (kind, net) values ('sign_try', n);
  select * into s from public.offer_signers where id = s.id for update;   -- one try at a time, so five tries really is five
  if s.void_at is not null or s.finished_at is not null or (select status from public.offer_signings where id = s.signing_id) not in ('signing', 'held') then return jsonb_build_object('ok', false, 'reason', 'stopped'); end if;
  if s.code_hash is null then return jsonb_build_object('ok', false, 'reason', 'no_code'); end if;
  if s.code_expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  perform set_config('offers.fn', 'on', true);
  if coalesce(p_code, '') !~ '^[0-9]{6}$' or s.code_hash <> public.offer_sha((select net_salt from public.offer_settings) || ':' || s.id || ':' || p_code) then
    update public.offer_signers set code_tries = code_tries + 1, code_hash = case when code_tries + 1 >= 5 then null else code_hash end where id = s.id;
    perform set_config('offers.fn', '', true);
    return jsonb_build_object('ok', false, 'reason', case when s.code_tries + 1 >= 5 then 'tries' else 'wrong' end);
  end if;
  ses := public.offer_token();
  update public.offer_signers set code_hash = null, code_expires_at = null, code_tries = 0, session_hash = public.offer_sha(ses), session_expires_at = now() + interval '2 hours',
    verified_at = now(), user_agent = left(coalesce(p_ua, user_agent), 400), net_hash = n where id = s.id;
  select * into g from public.offer_signings where id = s.signing_id;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, s.name, 'sign_code_ok', jsonb_build_object('signing_id', g.id, 'signer', s.position));
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('ok', true, 'session', ses);
end $$;
-- what a signer by link may see: their own name and places only, the pages, and the draft's path (the edge function turns it into a
-- short-lived link). Never another signer's details, the vendors' or another offer.
create or replace function public.offer_sign_state(p_token text, p_session text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings; d public.offer_drafts; addr text;
begin
  s := public.offer_sign_me(p_token, p_session);
  select * into g from public.offer_signings where id = s.signing_id; select * into d from public.offer_drafts where id = g.draft_id; select address into addr from public.properties where id = g.property_id;
  return jsonb_build_object('signer', jsonb_build_object('position', s.position, 'name', s.name, 'consent_at', s.consent_at, 'has_marks', s.sig_png is not null, 'sig_png', s.sig_png, 'init_png', s.init_png, 'finished_at', s.finished_at, 'void', s.void_at is not null,
      'receipts', (select coalesce(jsonb_agg(jsonb_build_object('guide', r.guide, 'version', r.version, 'at', r.at)), '[]'::jsonb) from public.offer_sign_receipts r where r.signer_id = s.id)),
    'signing', jsonb_build_object('status', g.status, 'stopped', case when s.void_at is not null then 'This version has been replaced. Tim will send you the new one.' else public.offer_sign_current(g) end, 'pages', g.pages, 'cca_pages', to_jsonb(g.cca_pages),
      'draft_path', case when s.consent_at is not null then d.path end, 'draft_sha256', d.sha256, 'address', addr,   -- the document only once they agree to sign electronically
      'places', (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(g.places) e where (e->>'signer')::int = s.position
        union all select e from public.offer_sign_reviews r, jsonb_array_elements(r.places) e where r.signing_id = g.id and (e->>'signer')::int = s.position) z)),
    'taps', (select coalesce(jsonb_agg(t.place_id order by t.id), '[]'::jsonb) from public.offer_sign_taps t where t.signer_id = s.id));
end $$;
create or replace function public.offer_sign_consent(p_token text, p_session text, p_net text, p_ua text) returns void language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; begin s := public.offer_sign_me(p_token, p_session); perform public.offer_sign_do_consent(s.id, p_ua, public.offer_net(p_net)); end $$;
create or replace function public.offer_sign_receipt(p_token text, p_session text, p_guide text, p_version text, p_file text, p_sha256 text, p_pages int[]) returns void language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; begin s := public.offer_sign_me(p_token, p_session); perform public.offer_sign_do_receipt(s.id, p_guide, p_version, p_file, p_sha256, p_pages); end $$;
create or replace function public.offer_sign_marks(p_token text, p_session text, p_sig text, p_init text) returns void language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; begin s := public.offer_sign_me(p_token, p_session); perform public.offer_sign_do_marks(s.id, p_sig, p_init); end $$;
create or replace function public.offer_sign_tap(p_token text, p_session text, p_place text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; begin s := public.offer_sign_me(p_token, p_session); return public.offer_sign_do_tap(s.id, p_place); end $$;
create or replace function public.offer_sign_finish(p_token text, p_session text, p_net text, p_ua text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; begin s := public.offer_sign_me(p_token, p_session); return public.offer_sign_do_finish(s.id, p_ua, public.offer_net(p_net), null, null); end $$;
-- "Ask Tim for a change": a note to Tim (the edge function emails it to him). The document itself can't be marked from a link.
create or replace function public.offer_sign_ask(p_token text, p_session text, p_text text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings; t text := nullif(trim(regexp_replace(coalesce(p_text, ''), '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]', '', 'g')), ''); addr text;
begin
  s := public.offer_sign_me(p_token, p_session); select * into g from public.offer_signings where id = s.signing_id;
  if s.void_at is not null or g.status in ('locked', 'replaced') then raise exception 'This version is no longer being signed'; end if;
  if t is null or length(t) < 3 or length(t) > 1000 then raise exception 'Please say what you would like changed (up to 1,000 characters)'; end if;
  if (select count(*) from public.offer_sign_asks where signer_id = s.id and at > now() - interval '1 day') >= 10 then raise exception 'You have sent several requests today. Tim will be in touch'; end if;
  insert into public.offer_sign_asks (signing_id, signer_id, text) values (g.id, s.id, t);
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, s.name, 'sign_change_asked', jsonb_build_object('signing_id', g.id, 'signer', s.position, 'length', length(t)));
  select address into addr from public.properties where id = g.property_id;
  return jsonb_build_object('ok', true, 'name', s.name, 'address', addr, 'offer_id', g.offer_id);
end $$;
-- everything needed to make Round 1, once every signer has finished
create or replace function public.offer_round_material(p_signing uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g public.offer_signings; d public.offer_drafts; o public.property_offers; addr text; why text;
begin
  select * into g from public.offer_signings where id = p_signing; if g.id is null then raise exception 'No such signing'; end if;
  if g.status <> 'complete' then raise exception 'Not everyone has finished signing'; end if;
  why := public.offer_sign_current(g); if why is not null then raise exception '%', why; end if;
  select * into d from public.offer_drafts where id = g.draft_id; select * into o from public.property_offers where id = g.offer_id; select address into addr from public.properties where id = g.property_id;
  return jsonb_build_object('signing_id', g.id, 'offer_id', o.id, 'property_id', g.property_id, 'address', addr, 'offer_ref', o.buyer_ref, 'method', g.method,
    'draft', jsonb_build_object('id', d.id, 'number', d.number, 'path', d.path, 'sha256', d.sha256), 'places_sha256', g.places_sha256, 'pages', g.pages,
    'places', g.places || coalesce((select jsonb_agg(e) from public.offer_sign_reviews r, jsonb_array_elements(r.places) e where r.signing_id = g.id), '[]'::jsonb),
    'signers', (select jsonb_agg(jsonb_build_object('id', s.id, 'position', s.position, 'name', s.name, 'sig_png', s.sig_png, 'init_png', s.init_png, 'verified_at', s.verified_at, 'consent_at', s.consent_at, 'id_sighted', s.id_sighted, 'witnessed_by', s.witnessed_by,
        'finished_at', s.finished_at, 'seen_sha256', s.seen_sha256, 'ua', s.user_agent, 'net', s.net_hash,
        'receipts', (select coalesce(jsonb_agg(jsonb_build_object('guide', r.guide, 'version', r.version, 'sha256', r.sha256, 'pages', to_jsonb(r.pages), 'at', r.at) order by r.id), '[]'::jsonb) from public.offer_sign_receipts r where r.signer_id = s.id),
        'first_tap', (select min(t.at) from public.offer_sign_taps t where t.signer_id = s.id), 'last_tap', (select max(t.at) from public.offer_sign_taps t where t.signer_id = s.id),
        'places', (select count(*) from public.offer_sign_required(g.id, s.position) x)) order by s.position) from public.offer_signers s where s.signing_id = g.id and s.void_at is null),
    'taps', (select coalesce(jsonb_agg(jsonb_build_object('place_id', t.place_id, 'signer', s.position, 'at', t.at) order by t.id), '[]'::jsonb) from public.offer_sign_taps t join public.offer_signers s on s.id = t.signer_id where t.signing_id = g.id),
    'marks', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'page', m.page, 'geometry', m.geometry, 'target', m.target, 'by', m.by_name, 'at', m.at,
        'reviewed_at', (select min(r.at) from public.offer_sign_reviews r where r.signing_id = g.id and m.id = any (r.marks))) order by m.at), '[]'::jsonb) from public.offer_sign_marks m where m.signing_id = g.id),
    'replaced', (select coalesce(jsonb_agg(jsonb_build_object('number', dd.number, 'at', x.replaced_at) order by x.replaced_at), '[]'::jsonb) from public.offer_signings x join public.offer_drafts dd on dd.id = x.draft_id where x.offer_id = g.offer_id and x.status = 'replaced'),
    'made_at', now());
end $$;
-- Round 1 locked: the PDF the edge function made and stored, its fingerprint worked out by the server from the stored file
-- (offer_file_confirm), the execution record, and the timeline's newest fingerprint. Never changed or removed.
create or replace function public.offer_round_lock(p_signing uuid, p_path text, p_sha256 text, p_size bigint, p_execution jsonb, p_actor text) returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.offer_signings; why text; obj jsonb; rid uuid; h text; ex public.offer_rounds;
begin
  select * into g from public.offer_signings where id = p_signing for update; if g.id is null then raise exception 'No such signing'; end if;
  select * into ex from public.offer_rounds where signing_id = g.id; if ex.id is not null then return jsonb_build_object('id', ex.id, 'number', ex.number, 'sha256', ex.sha256, 'existing', true); end if;
  if g.status <> 'complete' then raise exception 'Not everyone has finished signing'; end if;
  why := public.offer_sign_current(g); if why is not null then raise exception '%', why; end if;
  if exists (select 1 from public.offer_rounds where offer_id = g.offer_id) then raise exception 'This offer already has a signed Round 1'; end if;
  if coalesce(p_path, '') !~ ('^properties/' || g.property_id || '/docs/offer-round-' || g.offer_id || '-1-[0-9a-f]{12}\.pdf$') then raise exception 'A round is stored at its own place'; end if;
  if coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$' or p_sha256 = g.draft_sha256 then raise exception 'The round needs its own fingerprint'; end if;
  obj := public.repo_object(p_path);
  if obj is null or (obj->>'size')::bigint is distinct from p_size or (obj->>'mime') is distinct from 'application/pdf' then raise exception 'The stored round doesn''t match'; end if;
  if not exists (select 1 from public.offer_file_hashes f where f.path = p_path and f.sha256 = p_sha256 and f.size_bytes = p_size) then raise exception 'The round''s fingerprint hasn''t been confirmed by the server'; end if;
  if jsonb_typeof(p_execution) is distinct from 'object' or length(p_execution::text) > 200000 then raise exception 'Please check the execution record'; end if;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, left(coalesce(p_actor, 'system'), 254), 'round_locked',
    jsonb_build_object('signing_id', g.id, 'number', 1, 'sha256', p_sha256, 'draft_sha256', g.draft_sha256, 'places_sha256', g.places_sha256, 'path', p_path)) returning hash into h;
  insert into public.offer_rounds (offer_id, property_id, signing_id, number, draft_id, draft_sha256, places_sha256, path, sha256, size_bytes, execution, chain_last, locked_by)
  values (g.offer_id, g.property_id, g.id, 1, g.draft_id, g.draft_sha256, g.places_sha256, p_path, p_sha256, p_size, p_execution, h, left(coalesce(p_actor, 'system'), 254)) returning id into rid;
  perform set_config('offers.fn', 'on', true);
  update public.offer_signings set status = 'locked', locked_at = now() where id = g.id;
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('id', rid, 'number', 1, 'sha256', p_sha256, 'existing', false);
end $$;

-- ───── execute rights ─────
revoke execute on function public.offer_event_body(text, bigint, timestamptz, text, text, uuid, uuid, jsonb), public.offer_event_chain(), public.guard_offer_signing(), public.guard_offer_signer(), public.offer_sha(text),
  public.offer_sign_places_ok(jsonb, jsonb, int, boolean), public.offer_mark_ok(text, jsonb, numeric, numeric), public.offer_sign_required(uuid, int), public.offer_sign_current(public.offer_signings), public.offer_sign_ready(public.offer_signers, boolean),
  public.offer_sign_do_consent(uuid, text, text), public.offer_sign_do_receipt(uuid, text, text, text, text, int[]), public.offer_sign_do_marks(uuid, text, text), public.offer_sign_do_tap(uuid, text), public.offer_sign_do_finish(uuid, text, text, text, text),
  public.offer_sign_person(uuid), public.offer_chain_verify(text), public.offer_sign_find(text), public.offer_sign_by_token(text), public.offer_sign_me(text, text) from public, anon, authenticated;
revoke execute on function public.offer_sign_issue(uuid, text), public.offer_sign_open(text, text, text), public.offer_sign_code(text, text), public.offer_sign_verify(text, text, text, text), public.offer_sign_state(text, text),
  public.offer_sign_consent(text, text, text, text), public.offer_sign_receipt(text, text, text, text, text, text, int[]), public.offer_sign_marks(text, text, text, text), public.offer_sign_tap(text, text, text), public.offer_sign_finish(text, text, text, text),
  public.offer_sign_ask(text, text, text), public.offer_round_material(uuid), public.offer_round_lock(uuid, text, text, bigint, jsonb, text) from public, anon, authenticated;
grant execute on function public.offer_sign_issue(uuid, text), public.offer_sign_open(text, text, text), public.offer_sign_code(text, text), public.offer_sign_verify(text, text, text, text), public.offer_sign_state(text, text),
  public.offer_sign_consent(text, text, text, text), public.offer_sign_receipt(text, text, text, text, text, text, int[]), public.offer_sign_marks(text, text, text, text), public.offer_sign_tap(text, text, text), public.offer_sign_finish(text, text, text, text),
  public.offer_sign_ask(text, text, text), public.offer_round_material(uuid), public.offer_round_lock(uuid, text, text, bigint, jsonb, text) to service_role;
revoke execute on function public.agent_signing_turn_ok(uuid, uuid, uuid, uuid), public.agent_signing_release(uuid, text, jsonb, jsonb, int[]), public.agent_signing_start(uuid), public.agent_signing_consent(uuid, text), public.agent_signing_receipt(uuid, text, text, text, text, int[]), public.agent_signing_marks(uuid, text, text),
  public.agent_signing_tap(uuid, text), public.agent_signing_finish(uuid, text, text), public.agent_signing_mark(uuid, text, int, jsonb, uuid), public.agent_signing_review(uuid, jsonb), public.agent_signing_cancel(uuid, text), public.agent_offer_chain_check(uuid) from public, anon;
grant execute on function public.agent_signing_turn_ok(uuid, uuid, uuid, uuid), public.agent_signing_release(uuid, text, jsonb, jsonb, int[]), public.agent_signing_start(uuid), public.agent_signing_consent(uuid, text), public.agent_signing_receipt(uuid, text, text, text, text, int[]), public.agent_signing_marks(uuid, text, text),
  public.agent_signing_tap(uuid, text), public.agent_signing_finish(uuid, text, text), public.agent_signing_mark(uuid, text, int, jsonb, uuid), public.agent_signing_review(uuid, jsonb), public.agent_signing_cancel(uuid, text), public.agent_offer_chain_check(uuid) to authenticated;

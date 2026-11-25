-- Offers fixes 3 (Tim, 25 and 26 November 2026): freeze holds a confirmation, going back to the last sealed round, and undo. Additive only.
-- Builds on 023 (signings, signers, taps, marks, reviews, rounds), 024 (documents, agreements, holds, requests) and 025.
--
-- What it adds:
--   * offer_sign_undos: undone work, kept. A tap or a change (offer_sign_marks) is never changed or removed (023's triggers stay); undoing
--     one adds a row here, with who undid it, when, and how (their last step, their whole turn, or Tim starting the round again). A place
--     tapped again after an undo adds a 'redo' row: the tap stands again from that time.
--   * offer_sign_redraws: a signature and initials drawn again, kept. 023's rule that a signer's drawn marks never change once they have
--     tapped stays as it is: the first drawing stays in offer_signers. Only once every tap of theirs has been undone (their turn started
--     again) may they clear and draw again; the new drawing is a row here, and the newest row is the one used (offer_sign_ink). A row with
--     no drawing is "cleared": they draw again before they tap.
--   * offer_sign_taps_live, offer_sign_marks_live, offer_sign_reviews_live: views (security invoker, so Tim's own read rights apply) of
--     what stands: taps not undone (or tapped again), changes not undone, and the initials places that come with a change still standing.
--     Every function that reads a round's work for signing, locking, presenting or the agreement now reads these.
--   * offer_confirm_holds: "Confirm the agreement" pressed while the offer is frozen is held, not locked, sealed or dated (Tim, 25 November
--     2026): the acceptance time and the date text, checked as the agreement would be (the freeze set aside). Nothing is emailed. Once
--     unfrozen, Tim completes it (the agreement is then made exactly as before, every check run again) or discards it. Resolved once.
--   * offer_requests may hold 'revert': a party asks, from their own link, to go back to the last sealed round (offered on their link only
--     after a freeze on their round was lifted). It goes to Tim like the other requests; he releases it or lets them carry on.
-- Functions: offer_sign_do_undo (their last step, or their whole turn, optionally clearing their drawing), agent_signing_undo and
-- offer_sign_undo (in person and by link); agent_signing_revert_round (Tim starts an open round again from its start);
-- agent_offer_revert_sealed (Tim goes back to the last sealed round: the open round is stopped and what was done on it is listed on the
-- timeline as discarded; optionally unfreezing in the same step; or releasing a party's request); agent_offer_confirm_hold,
-- agent_offer_confirm_held and agent_offer_confirm_hold_discard. Sealed rounds, agreements, signatures and fingerprints are never changed.

-- ───── tables ─────
create table public.offer_sign_undos (
  id bigserial primary key,
  signing_id uuid not null references public.offer_signings(id),
  signer_id uuid not null references public.offer_signers(id),          -- whose work it was
  tap_id bigint references public.offer_sign_taps(id),
  mark_id uuid references public.offer_sign_marks(id),
  action text not null default 'undo' check (action in ('undo', 'redo')),
  scope text not null check (scope in ('last', 'turn', 'round', 'tap')),   -- 'tap': a place tapped again (a redo)
  by_name text not null check (length(by_name) between 1 and 254),        -- who undid it: the signer, or Tim for a whole round
  at timestamptz not null default now(),
  check ((tap_id is null) <> (mark_id is null)),
  check ((action = 'redo') = (scope = 'tap') and (action = 'undo' or tap_id is not null))
);
create index on public.offer_sign_undos (tap_id);
create index on public.offer_sign_undos (mark_id);
create index on public.offer_sign_undos (signing_id);
create table public.offer_sign_redraws (
  id bigserial primary key,
  signing_id uuid not null references public.offer_signings(id),
  signer_id uuid not null references public.offer_signers(id),
  sig_png text check (sig_png is null or (length(sig_png) <= 400000 and sig_png ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$')),
  init_png text check (init_png is null or (length(init_png) <= 200000 and init_png ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$')),
  check ((sig_png is null) = (init_png is null)),                         -- both drawn, or both cleared
  by_name text not null check (length(by_name) between 1 and 254),
  at timestamptz not null default now()
);
create index on public.offer_sign_redraws (signer_id, id);
create table public.offer_confirm_holds (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.property_offers(id),
  property_id uuid not null references public.properties(id),
  document_id uuid not null references public.offer_documents(id),
  round_id uuid not null references public.offer_rounds(id),             -- the newest sealed round when it was held
  hold_id uuid not null references public.offer_holds(id),               -- the freeze it was held under
  accepted_at timestamptz not null,
  date_text text not null check (length(date_text) between 10 and 20),
  agreement_date date not null,
  held_by text not null, held_at timestamptz not null default now(),
  resolved_at timestamptz, resolved_by text, resolved_as text check (resolved_as is null or resolved_as in ('completed', 'discarded', 'superseded')),
  resolve_note text check (resolve_note is null or length(resolve_note) <= 500),
  check ((resolved_at is null) = (resolved_as is null))
);
create unique index offer_confirm_holds_open on public.offer_confirm_holds (offer_id) where resolved_at is null;
-- a party may ask to go back to the last sealed round (widened, nothing removed)
alter table public.offer_requests drop constraint offer_requests_kind_check, add constraint offer_requests_kind_check check (kind in ('freeze', 'withdraw', 'revert'));
alter table public.offer_requests drop constraint offer_requests_handled_as_check, add constraint offer_requests_handled_as_check check (handled_as is null or handled_as in ('freeze', 'withdraw', 'carry_on', 'revert'));
alter table public.offer_requests drop constraint offer_requests_reason_key_check, add constraint offer_requests_reason_key_check check (reason_key in ('finance_changed', 'contract_elsewhere', 'incapacitated', 'property_integrity', 'property_viability', 'material_change', 'other'));

-- ───── records stay as made ─────
create trigger offer_sign_undos_fixed before update or delete on public.offer_sign_undos for each row execute function public.guard_offer_record();
create trigger offer_sign_redraws_fixed before update or delete on public.offer_sign_redraws for each row execute function public.guard_offer_record();
create trigger offer_sign_undos_no_truncate before truncate on public.offer_sign_undos for each statement execute function public.guard_offer_truncate();
create trigger offer_sign_redraws_no_truncate before truncate on public.offer_sign_redraws for each statement execute function public.guard_offer_truncate();
create trigger offer_confirm_holds_no_truncate before truncate on public.offer_confirm_holds for each statement execute function public.guard_offer_truncate();
-- a held confirmation is resolved once (completed, discarded or superseded) through the functions below; nothing else about it changes
create or replace function public.guard_offer_confirm_hold() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'These records are never removed'; end if;
  if coalesce(current_setting('offers.fn', true), '') <> 'on' then raise exception 'Changed only through Tim''s offer screens, so there is a record'; end if;
  if old.resolved_at is not null or new.resolved_at is null or (to_jsonb(new) - array['resolved_at', 'resolved_by', 'resolved_as', 'resolve_note']) is distinct from (to_jsonb(old) - array['resolved_at', 'resolved_by', 'resolved_as', 'resolve_note']) then
    raise exception 'This record is kept exactly as it was made'; end if;
  return new;
end $$;
create trigger guard_offer_confirm_holds before update or delete on public.offer_confirm_holds for each row execute function public.guard_offer_confirm_hold();
-- undone work and a drawing again are written only for a round still open, whoever writes them (a function, or the service role directly):
-- never for a sealed round (one with an offer_rounds row) or a stopped one, and only for that round's own signer, taps and changes.
-- Once everyone has signed (complete), only Tim's start-again rows ('round') are taken. So a sealed round reads the same for ever.
-- The rows are locked as everywhere: the offer first (FOR KEY SHARE, as every party step takes it), then the signing FOR SHARE, so a write
-- arriving while a round is being locked (offer_round_lock holds the offer FOR UPDATE, then the signing) waits for it and is then refused.
create or replace function public.guard_offer_sign_open_work() returns trigger language plpgsql security definer set search_path = public as $$
declare g public.offer_signings;
begin
  perform 1 from public.property_offers where id = (select offer_id from public.offer_signings where id = new.signing_id) for key share;
  select * into g from public.offer_signings where id = new.signing_id for share;
  if g.id is null or exists (select 1 from public.offer_rounds r where r.signing_id = g.id) or g.status not in ('ready', 'signing', 'held', 'complete') then
    raise exception 'This round is sealed or stopped, so what was done on it is kept exactly as it is'; end if;
  if not exists (select 1 from public.offer_signers s where s.id = new.signer_id and s.signing_id = g.id) then raise exception 'That signer isn''t on this round'; end if;
  if tg_table_name = 'offer_sign_undos' then
    if new.tap_id is not null and not exists (select 1 from public.offer_sign_taps t where t.id = new.tap_id and t.signing_id = g.id and t.signer_id = new.signer_id) then raise exception 'That step isn''t on this round'; end if;
    if new.mark_id is not null and not exists (select 1 from public.offer_sign_marks m where m.id = new.mark_id and m.signing_id = g.id and m.signer_id = new.signer_id) then raise exception 'That step isn''t on this round'; end if;
    if g.status = 'complete' and new.scope <> 'round' then raise exception 'Everyone has signed. Only Tim can start the round again now'; end if;
  elsif g.status = 'complete' then raise exception 'Everyone has signed. Only Tim can start the round again now';
  end if;
  return new;
end $$;
create trigger offer_sign_undos_open before insert on public.offer_sign_undos for each row execute function public.guard_offer_sign_open_work();
create trigger offer_sign_redraws_open before insert on public.offer_sign_redraws for each row execute function public.guard_offer_sign_open_work();

-- ───── what stands: the views every reader of a round's work uses ─────
-- a tap stands unless its newest undo row is an undo; tapped again, it stands from the time it was tapped again
create view public.offer_sign_taps_live with (security_invoker = true) as
  select t.id, t.signing_id, t.signer_id, t.place_id, coalesce(u.at, t.at) as at
  from public.offer_sign_taps t
  left join lateral (select x.action, x.at from public.offer_sign_undos x where x.tap_id = t.id order by x.id desc limit 1) u on true
  where u.action is null or u.action = 'redo';
create view public.offer_sign_marks_live with (security_invoker = true) as
  select m.* from public.offer_sign_marks m where not exists (select 1 from public.offer_sign_undos u where u.mark_id = m.id);
-- the initials places a change (or Tim's re-approval of Round 1 marks) brought: gone once every mark it was for has been undone
create view public.offer_sign_reviews_live with (security_invoker = true) as
  select r.* from public.offer_sign_reviews r
  where coalesce(array_length(r.marks, 1), 0) = 0 or exists (select 1 from unnest(r.marks) k where not exists (select 1 from public.offer_sign_undos u where u.mark_id = k));

-- ───── who sees what: Tim only ─────
alter table public.offer_sign_undos enable row level security;
alter table public.offer_sign_redraws enable row level security;
alter table public.offer_confirm_holds enable row level security;
create policy osu_agent_read on public.offer_sign_undos for select using (public.is_agent());
create policy osd_agent_read on public.offer_sign_redraws for select using (public.is_agent());
create policy och_agent_read on public.offer_confirm_holds for select using (public.is_agent());
revoke all on public.offer_sign_undos, public.offer_sign_redraws, public.offer_confirm_holds, public.offer_sign_taps_live, public.offer_sign_marks_live, public.offer_sign_reviews_live from anon;
revoke insert, update, delete, truncate, references, trigger on public.offer_sign_undos, public.offer_sign_redraws, public.offer_confirm_holds, public.offer_sign_taps_live, public.offer_sign_marks_live, public.offer_sign_reviews_live from authenticated;
grant select on public.offer_sign_undos, public.offer_sign_redraws, public.offer_confirm_holds, public.offer_sign_taps_live, public.offer_sign_marks_live, public.offer_sign_reviews_live to authenticated;
revoke all on sequence public.offer_sign_undos_id_seq, public.offer_sign_redraws_id_seq from anon, authenticated;

-- ───── helpers (internal) ─────
-- a signer's signature and initials as they stand: the newest drawing again, or the first drawing (null both: cleared, to draw again)
create or replace function public.offer_sign_ink(p_signer uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('sig_png', r.sig_png, 'init_png', r.init_png, 'redrawn_at', r.at) from public.offer_sign_redraws r where r.signer_id = p_signer order by r.id desc limit 1),
    (select jsonb_build_object('sig_png', s.sig_png, 'init_png', s.init_png, 'redrawn_at', null) from public.offer_signers s where s.id = p_signer)) $$;
-- 023's places one signer must do, from the places that stand (a change undone takes its initials places with it)
create or replace function public.offer_sign_required(p_signing uuid, p_position int) returns setof text language sql stable set search_path = public as $$
  select e->>'id' from public.offer_signings g, jsonb_array_elements(g.places) e where g.id = p_signing and (e->>'signer')::int = p_position
  union
  select e->>'id' from public.offer_sign_reviews_live r, jsonb_array_elements(r.places) e where r.signing_id = p_signing and (e->>'signer')::int = p_position $$;
-- the layers of a document (024), from what stands, with each signer's ink as it stands
create or replace function public.offer_doc_layers(p_document uuid, p_upto int) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('round_id', r.id, 'number', r.number, 'doc_round', r.doc_round, 'side', r.side, 'signing_id', r.signing_id, 'sha256', r.sha256, 'locked_at', r.locked_at, 'changes', r.changes,
      'places', g.places || coalesce((select jsonb_agg(e) from public.offer_sign_reviews_live v, jsonb_array_elements(v.places) e where v.signing_id = g.id), '[]'::jsonb),
      'taps', (select coalesce(jsonb_agg(jsonb_build_object('place_id', t.place_id, 'signer', s.position) order by t.id), '[]'::jsonb) from public.offer_sign_taps_live t join public.offer_signers s on s.id = t.signer_id where t.signing_id = g.id),
      'signers', (select coalesce(jsonb_agg(jsonb_build_object('position', s.position, 'name', s.name, 'sig_png', public.offer_sign_ink(s.id)->>'sig_png', 'init_png', public.offer_sign_ink(s.id)->>'init_png') order by s.position), '[]'::jsonb) from public.offer_signers s where s.signing_id = g.id and s.void_at is null),
      'marks', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'page', m.page, 'geometry', m.geometry, 'target', m.target, 'by', m.by_name, 'at', m.at) order by m.at, m.id), '[]'::jsonb) from public.offer_sign_marks_live m where m.signing_id = g.id)
    ) order by r.doc_round), '[]'::jsonb)
  from public.offer_rounds r join public.offer_signings g on g.id = r.signing_id where r.document_id = p_document and r.doc_round <= p_upto $$;
-- has a freeze on this offer been lifted since this round was released? (the only time a party is offered "go back to the last sealed
-- round"). Read from the offer's own timeline, in order: an "unfrozen" event after the round's release or presentation.
create or replace function public.offer_revert_offered(g public.offer_signings) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.offer_events u where u.offer_id = g.offer_id and u.kind = 'offer_unfrozen'
      and u.seq > (select max(e.seq) from public.offer_events e where e.offer_id = g.offer_id and e.kind in ('sign_released', 'round_presented') and e.detail->>'signing_id' = g.id::text))
     and not exists (select 1 from public.offer_holds h where h.offer_id = g.offer_id and h.kind = 'withdraw') $$;

-- ───── the signing steps (023 and 024), reading what stands ─────
-- a tap: as 024, with the ink as it stands; a place whose tap was undone is tapped again (a 'redo' row: the tap row itself never changes)
create or replace function public.offer_sign_do_tap(p_signer uuid, p_place text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings; done int; need int; t public.offer_sign_taps; ink jsonb;
begin
  -- lock order (as finishing, undoing and changes): the offer FOR KEY SHARE, then the signing FOR UPDATE, then the signer. The signing
  -- is taken here, before the signer, because a tap again writes a redo row, whose guard reads the signing.
  perform public.offer_lock_by_signer(p_signer);
  perform 1 from public.offer_signings where id = (select signing_id from public.offer_signers where id = p_signer) for update;
  select * into s from public.offer_signers where id = p_signer for update; g := public.offer_sign_ready(s);
  if s.consent_at is null then raise exception 'Agree to sign electronically first'; end if;
  if g.round_no = 1 and (not exists (select 1 from public.offer_sign_receipts where signer_id = s.id and guide = 'sale_purchase') or (coalesce(array_length(g.cca_pages, 1), 0) > 0 and not exists (select 1 from public.offer_sign_receipts where signer_id = s.id and guide = 'cca'))) then
    raise exception 'Please read and tick the guides first'; end if;
  if g.side = 'vendor' and not exists (select 1 from public.offer_sign_receipts where signer_id = s.id and guide = 'chattels') then raise exception 'Please read the reminder about chattels first'; end if;
  ink := public.offer_sign_ink(s.id);
  if ink->>'sig_png' is null or ink->>'init_png' is null then raise exception 'Draw your signature and initials first'; end if;
  if p_place is null or p_place not in (select public.offer_sign_required(g.id, s.position)) then raise exception 'That place isn''t yours to sign'; end if;
  select * into t from public.offer_sign_taps where signer_id = s.id and place_id = p_place;
  if t.id is null then insert into public.offer_sign_taps (signing_id, signer_id, place_id) values (g.id, s.id, p_place);
  elsif not exists (select 1 from public.offer_sign_taps_live l where l.id = t.id) then
    if (select count(*) from public.offer_sign_undos u where u.signer_id = s.id and u.action = 'redo' and u.at > now() - interval '1 hour') >= 30 then raise exception 'You have tapped places again a lot in the last hour. Please call Tim on 027 562 7207'; end if;
    insert into public.offer_sign_undos (signing_id, signer_id, tap_id, action, scope, by_name) values (g.id, s.id, t.id, 'redo', 'tap', left(s.name, 254));
  end if;
  select count(*) into need from public.offer_sign_required(g.id, s.position) x;
  select count(*) into done from public.offer_sign_taps_live t2 where t2.signer_id = s.id and t2.place_id in (select public.offer_sign_required(g.id, s.position));
  return jsonb_build_object('done', done, 'of', need);
end $$;
-- 023's signature and initials: drawn once; drawn again only once every tap of theirs has been undone (a row in offer_sign_redraws)
create or replace function public.offer_sign_do_marks(p_signer uuid, p_sig text, p_init text) returns void language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings;
begin
  -- lock order: the offer, then the signing (a drawing again writes a redraw row, whose guard reads it), then the signer
  perform public.offer_lock_by_signer(p_signer);
  perform 1 from public.offer_signings where id = (select signing_id from public.offer_signers where id = p_signer) for update;
  select * into s from public.offer_signers where id = p_signer for update; g := public.offer_sign_ready(s);
  if s.consent_at is null then raise exception 'Agree to sign electronically first'; end if;
  if coalesce(p_sig, '') !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' or length(p_sig) > 400000 or length(p_sig) < 200 then raise exception 'Please draw your signature'; end if;
  if coalesce(p_init, '') !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' or length(p_init) > 200000 or length(p_init) < 150 then raise exception 'Please draw your initials'; end if;
  if exists (select 1 from public.offer_sign_taps_live t where t.signer_id = s.id) then raise exception 'Your signature and initials are kept as you first used them'; end if;
  if exists (select 1 from public.offer_sign_taps t where t.signer_id = s.id) or exists (select 1 from public.offer_sign_redraws r where r.signer_id = s.id) then
    -- every tap undone: the first drawing stays as it was (023's rule), and this one is added
    insert into public.offer_sign_redraws (signing_id, signer_id, sig_png, init_png, by_name) values (g.id, s.id, p_sig, p_init, left(s.name, 254));
    insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, s.name, 'sign_redrawn', jsonb_build_object('signing_id', g.id, 'signer', s.position, 'round', g.round_no, 'side', g.side));
    return;
  end if;
  perform set_config('offers.fn', 'on', true);
  update public.offer_signers set sig_png = p_sig, init_png = p_init, marks_at = now() where id = s.id;
  perform set_config('offers.fn', '', true);
end $$;
-- 023's finish, counting the places that stand and the taps that stand
create or replace function public.offer_sign_do_finish(p_signer uuid, p_ua text, p_net text, p_id text, p_witness text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings; missing int; seen text; taps text; left_ int;
begin
  -- one finish at a time per signing (023): the offer FOR KEY SHARE, then the signing, then the signer, all read again under the lock
  perform public.offer_lock_by_signer(p_signer);
  perform 1 from public.offer_signings where id = (select signing_id from public.offer_signers where id = p_signer) for update;
  select * into s from public.offer_signers where id = p_signer for update; g := public.offer_sign_ready(s);
  if s.consent_at is null or public.offer_sign_ink(s.id)->>'sig_png' is null then raise exception 'Agree, read the guides and draw your signature and initials first'; end if;
  select count(*) into missing from public.offer_sign_required(g.id, s.position) r where r not in (select place_id from public.offer_sign_taps_live where signer_id = s.id);
  if missing > 0 then raise exception 'There % still % to do', case when missing = 1 then 'is' else 'are' end, case when missing = 1 then '1 place' else missing || ' places' end; end if;
  select string_agg(t.place_id || '@' || to_char(t.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), E'\n' order by t.id) into taps from public.offer_sign_taps_live t where t.signer_id = s.id;
  seen := public.offer_sha(g.draft_sha256 || ':' || g.places_sha256 || ':' || coalesce((select string_agg(r.places_sha256, ',' order by r.id) from public.offer_sign_reviews_live r where r.signing_id = g.id), '') || ':' || s.position);
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
-- 023's re-approval of Round 1 marks, for the marks that stand
create or replace function public.agent_signing_review(p_signing uuid, p_places jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); g public.offer_signings; ms uuid[]; n int; x jsonb; why text; reopened int;
begin
  perform public.offer_lock_by_signing(p_signing);   -- lock order: the offer, then the signing, then the signer
  select * into g from public.offer_signings where id = p_signing for update; if g.id is null then raise exception 'No such signing'; end if;
  if g.status <> 'held' then raise exception 'Nothing is waiting for you to check'; end if;
  why := public.offer_sign_current(g); if why is not null then raise exception '%', why; end if;
  select coalesce(array_agg(m.id order by m.at), '{}') into ms from public.offer_sign_marks_live m where m.signing_id = g.id and not exists (select 1 from public.offer_sign_reviews_live r where r.signing_id = g.id and m.id = any (r.marks));
  select count(*) into n from public.offer_signers where signing_id = g.id;
  if not public.offer_sign_places_ok(p_places, g.pages, n, false) then raise exception 'Please check the places for the initials'; end if;
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

-- ───── 024's functions, reading what stands (each word for word as 024 has it, apart from the views named) ─────
-- a change (024): a reinstatement points only at a change that stands; a new further term's number is free among the changes that stand
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
    select * into t from public.offer_sign_marks_live m where m.id = p_target and (m.signing_id = g.id or m.signing_id in (select r.signing_id from public.offer_rounds r where r.document_id = g.document_id));
    if t.id is null or t.kind not in ('strike', 'cross') then raise exception 'Choose a line or crossed-out box to reinstate'; end if;
    if exists (select 1 from public.offer_sign_marks_live where target = t.id and kind = 'reinstate') then raise exception 'That has already been reinstated'; end if;
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
      select coalesce(array_agg(substring(m.geometry->>'text' from '^\s*([0-9]{1,3})')::int), '{}') into used from public.offer_sign_marks_live m
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
-- 024's presentation: every change that stands on the newest sealed round is initialled
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
  for m in select k.id from public.offer_sign_marks_live k where k.signing_id = last.signing_id loop
    for i in 1..n loop
      if not exists (select 1 from jsonb_array_elements(p_places) e where e->>'id' = 'chg:' || m.id || ':s' || i and e->>'why' = 'change' and e->>'kind' = 'initial') then raise exception 'Please check the signing places: everyone initials each change made in Round %', last.doc_round; end if;
    end loop;
  end loop;
  -- initials for a change sit on its page, within about 60 points of it
  for x in select * from jsonb_array_elements(p_places) e where e->>'why' = 'change' loop
    select * into mk from public.offer_sign_marks_live k where k.id::text = x->>'ref' and k.signing_id in (select r.signing_id from public.offer_rounds r where r.document_id = doc.id);
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
-- 024's Round 1 mark on Tim's screen: a reinstatement points only at a mark that stands
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
    select * into t from public.offer_sign_marks_live where id = p_target and signing_id = g.id;
    if t.id is null or t.kind not in ('strike', 'cross') then raise exception 'Choose a line or crossed-out box to reinstate'; end if;
    if exists (select 1 from public.offer_sign_marks_live where target = t.id and kind = 'reinstate') then raise exception 'That has already been reinstated'; end if;
  elsif p_target is not null then raise exception 'Only a reinstatement points at another mark'; end if;
  insert into public.offer_sign_marks (signing_id, signer_id, by_name, kind, page, geometry, target) values (g.id, s.id, s.name, p_kind, p_page, p_geometry, case when p_kind = 'reinstate' then p_target end) returning id into mid;
  perform set_config('offers.fn', 'on', true);
  update public.offer_signings set status = 'held', held_at = now() where id = g.id;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, s.name, 'sign_marked', jsonb_build_object('signing_id', g.id, 'mark_id', mid, 'kind', p_kind, 'page', p_page, 'signer', s.position, 'target', p_target));
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('id', mid);
end $$;
-- 024's lock: the number of changes is of those that stand
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
  select count(*) into chg from public.offer_sign_marks_live where signing_id = g.id;
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
-- 024's agreed terms: the changes that stand
create or replace function public.offer_agreed_terms(p_document uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('price', d.details->'price', 'settlement', d.details->'settlement', 'conditions', d.details->'conditions', 'kiwisaver', d.details->'kiwisaver', 'lawyer_approval', d.details->'lawyer_approval',
    'as_drafted', coalesce((select jsonb_object_agg(x->>'id', coalesce(x->'text', x->'value')) from jsonb_array_elements(d.placed) x where x->>'id' in ('price', 'deposit', 'settlement', 'purchaser') or x->>'id' ~ '^[cd]_'), '{}'::jsonb),
    'deposit_printed', (select e->>'printed' from public.offer_blank_maps bm, jsonb_array_elements(bm.places) e where bm.id = d.map_id and e->>'id' = 'deposit' limit 1),
    'further_terms', (select x->'terms' from jsonb_array_elements(d.placed) x where x->>'id' = 'further_terms' limit 1),
    'changes', coalesce((select jsonb_agg(jsonb_build_object('round', g.round_no, 'side', g.side, 'kind', m.kind, 'page', m.page, 'text', m.geometry->>'text', 'by', m.by_name, 'at', m.at) order by g.round_no, m.at, m.id)
      from public.offer_sign_marks_live m join public.offer_signings g on g.id = m.signing_id where g.id in (select r.signing_id from public.offer_rounds r where r.document_id = p_document)), '[]'::jsonb),
    'note', 'Where a change made in the negotiation alters a term above, the change governs. Read with the signed rounds.')
  from public.offer_documents doc join public.offer_drafts d on d.id = doc.draft_id where doc.id = p_document $$;
-- 024's agreement check, as the core (p_ignore_freeze set only by a held confirmation, below)
create or replace function public.offer_agreement_check_core(p_offer uuid, p_accepted_at timestamptz, p_date_text text, p_ignore_freeze boolean) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.property_offers; doc public.offer_documents; last public.offer_rounds; t text := trim(coalesce(p_date_text, '')); m text[]; dt date; mons text[] := array['January','February','March','April','May','June','July','August','September','October','November','December']; fin timestamptz; first_ timestamptz;
begin
  select * into o from public.property_offers where id = p_offer; if o.id is null then raise exception 'No such offer'; end if;
  if exists (select 1 from public.offer_agreements a where a.offer_id = o.id) then raise exception 'The agreement has already been made'; end if;
  if o.status in ('withdrawn', 'lapsed', 'declined') then raise exception 'This offer has been withdrawn or has lapsed'; end if;
  -- 026: a held confirmation (Tim, 25 November 2026) is checked with the freeze set aside; a withdrawal is never set aside
  if public.offer_hold_active(o.id) and not (p_ignore_freeze is true and not exists (select 1 from public.offer_holds h where h.offer_id = o.id and h.kind = 'withdraw')) then raise exception 'This offer is frozen or withdrawn, so no agreement is made while it is'; end if;
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
-- 024's party request, with 'revert' (going back to the last sealed round) and one more reason
create or replace function public.offer_sign_request(p_token text, p_session text, p_kind text, p_reason_key text, p_reason text, p_net text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings; id_ uuid; why text; L jsonb := jsonb_build_object('finance_changed', 'Our financial situation has changed', 'contract_elsewhere', 'We have entered a contract elsewhere',
  'incapacitated', 'One of our party is incapacitated', 'property_integrity', 'We have concerns about the integrity of the property', 'property_viability', 'We have concerns about the viability of the property',
  'material_change', 'Something important changed while signing was paused');
begin
  s := public.offer_sign_me(p_token, p_session);
  -- the signer's row is locked, so two requests at once can't both pass the checks below
  perform public.offer_lock_by_signer(s.id);   -- lock order: the offer, then the signing, then the signer
  select * into s from public.offer_signers where id = s.id for update;
  select * into g from public.offer_signings where id = s.signing_id;
  if s.void_at is not null or g.status not in ('ready', 'signing', 'held', 'complete') or public.offer_sign_current(g) is not null then raise exception 'This version is no longer being signed. Tim will be in touch.'; end if;
  if exists (select 1 from public.offer_requests r where r.signer_id = s.id and r.handled_at is null) then raise exception 'Your request has gone to Tim. He will contact you straight away.'; end if;
  if coalesce(p_kind, '') not in ('freeze', 'withdraw', 'revert') then raise exception 'Choose stop for now, or withdraw'; end if;
  -- 026: going back to the last sealed round is offered only after a freeze on this round was lifted (Tim, 26 November 2026)
  if p_kind = 'revert' and not public.offer_revert_offered(g) then raise exception 'Going back is offered only after signing was paused on this round. Use Ask Tim for a change instead'; end if;
  if coalesce(p_reason_key, '') not in ('finance_changed', 'contract_elsewhere', 'incapacitated', 'property_integrity', 'property_viability', 'material_change', 'other') then raise exception 'Choose a reason'; end if;
  why := case when p_reason_key = 'other' then nullif(trim(coalesce(p_reason, '')), '') else L->>p_reason_key end;
  if why is null or length(why) < 3 or length(why) > 500 then raise exception 'Type the reason (3 to 500 characters)'; end if;
  if (select count(*) from public.offer_requests where signer_id = s.id and at > now() - interval '1 hour') >= 5 then raise exception 'Your request has gone to Tim. He will contact you straight away.'; end if;
  perform set_config('offers.fn', 'on', true);
  insert into public.offer_requests (offer_id, property_id, signing_id, signer_id, side, kind, reason_key, reason, net_hash) values (g.offer_id, g.property_id, g.id, s.id, g.side, p_kind, p_reason_key, why, public.offer_net(p_net)) returning id into id_;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, s.name, 'party_request', jsonb_build_object('request_id', id_, 'kind', p_kind, 'side', g.side, 'signer', s.position, 'round', g.round_no, 'reason_key', p_reason_key, 'reason', why));
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('id', id_, 'name', s.name, 'side', g.side, 'round', g.round_no, 'kind', p_kind, 'reason', why, 'offer_id', g.offer_id, 'property_id', g.property_id, 'signing_id', g.id, 'address', (select address from public.properties where id = g.property_id));
end $$;
-- 024's state for a link signer, from what stands: their places, their taps, the round's changes and their ink as it stands; and, new,
-- their last step (for "Undo my last step") and whether going back to the last sealed round is offered to them
create or replace function public.offer_sign_state(p_token text, p_session text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings; d public.offer_drafts; addr text; ink jsonb;
begin
  s := public.offer_sign_me(p_token, p_session);
  select * into g from public.offer_signings where id = s.signing_id; select * into d from public.offer_drafts where id = g.draft_id; select address into addr from public.properties where id = g.property_id;
  ink := public.offer_sign_ink(s.id);
  return jsonb_build_object('signer', jsonb_build_object('position', s.position, 'name', s.name, 'consent_at', s.consent_at, 'has_marks', ink->>'sig_png' is not null, 'sig_png', ink->>'sig_png', 'init_png', ink->>'init_png', 'finished_at', s.finished_at, 'void', s.void_at is not null,
      'receipts', (select coalesce(jsonb_agg(jsonb_build_object('guide', r.guide, 'version', r.version, 'at', r.at)), '[]'::jsonb) from public.offer_sign_receipts r where r.signer_id = s.id),
      'last', (select jsonb_build_object('what', x.k, 'place_id', x.place_id, 'kind', x.kind, 'page', x.page, 'at', x.at) from (
          select 'tap' k, l.place_id, null::text kind, null::int page, l.at, lpad(l.id::text, 20, '0') ref from public.offer_sign_taps_live l where l.signer_id = s.id
          union all select 'change', null, m.kind, m.page, m.at, m.id::text from public.offer_sign_marks_live m where m.signer_id = s.id) x order by x.at desc, x.ref desc limit 1),
      'ever_tapped', exists (select 1 from public.offer_sign_taps t where t.signer_id = s.id)),
    'signing', jsonb_build_object('status', g.status, 'stopped', public.offer_sign_stop_for(s, g), 'pages', g.pages, 'cca_pages', to_jsonb(g.cca_pages),
      'draft_path', case when s.consent_at is not null then d.path end, 'draft_sha256', d.sha256, 'address', addr,   -- the document only once they agree to sign electronically
      'round', g.round_no, 'side', g.side, 'link_changes', coalesce(g.link_changes, false),
      'terms', jsonb_build_object('last', d.edits->'term_last', 'retired', coalesce(d.edits->'retired_numbers', '[]'::jsonb),
        'style', coalesce((select e->>'number_style' from jsonb_array_elements(case when jsonb_typeof(d.placed) = 'array' then d.placed else '[]'::jsonb end) e where e->>'id' = 'further_terms' limit 1),
          case when d.edits ? 'term_last' then 'dot0' end)),
      'signers', (select count(*) from public.offer_signers x where x.signing_id = g.id and x.void_at is null),
      'parties', case when g.side = 'vendor' then public.offer_parties(g.offer_id) end,
      'layers', case when g.round_no > 1 and s.consent_at is not null then public.offer_doc_layers(g.document_id, g.round_no - 1) else '[]'::jsonb end,
      'marks', case when g.round_no > 1 then (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'page', m.page, 'geometry', m.geometry, 'target', m.target, 'by', m.by_name, 'at', m.at, 'mine', m.signer_id = s.id) order by m.at, m.id), '[]'::jsonb) from public.offer_sign_marks_live m where m.signing_id = g.id) else '[]'::jsonb end,
      'places', (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(g.places) e where (e->>'signer')::int = s.position
        union all select e from public.offer_sign_reviews_live r, jsonb_array_elements(r.places) e where r.signing_id = g.id and (e->>'signer')::int = s.position) z),
      'side_places', case when g.round_no > 1 then (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(g.places) e union all select e from public.offer_sign_reviews_live r, jsonb_array_elements(r.places) e where r.signing_id = g.id) z) else '[]'::jsonb end,
      -- going back to the last sealed round: offered only after a freeze on this round was lifted (Tim, 26 November 2026); 0 = nothing sealed yet
      'revert', case when public.offer_revert_offered(g) then jsonb_build_object('round', g.round_no - 1) end),
    'taps', (select coalesce(jsonb_agg(t.place_id order by t.id), '[]'::jsonb) from public.offer_sign_taps_live t where t.signer_id = s.id));
end $$;
-- 024's material for the locked copy, from what stands (the work undone is never on a sealed round), with each signer's ink as it stands
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
    'places', g.places || coalesce((select jsonb_agg(e) from public.offer_sign_reviews_live r, jsonb_array_elements(r.places) e where r.signing_id = g.id), '[]'::jsonb),
    'signers', (select jsonb_agg(jsonb_build_object('id', s.id, 'position', s.position, 'name', s.name, 'sig_png', public.offer_sign_ink(s.id)->>'sig_png', 'init_png', public.offer_sign_ink(s.id)->>'init_png', 'verified_at', s.verified_at, 'consent_at', s.consent_at, 'id_sighted', s.id_sighted, 'witnessed_by', s.witnessed_by,
        'finished_at', s.finished_at, 'seen_sha256', s.seen_sha256, 'ua', s.user_agent, 'net', s.net_hash,
        'receipts', (select coalesce(jsonb_agg(jsonb_build_object('guide', r.guide, 'version', r.version, 'sha256', r.sha256, 'pages', to_jsonb(r.pages), 'at', r.at) order by r.id), '[]'::jsonb) from public.offer_sign_receipts r where r.signer_id = s.id),
        'first_tap', (select min(t.at) from public.offer_sign_taps_live t where t.signer_id = s.id), 'last_tap', (select max(t.at) from public.offer_sign_taps_live t where t.signer_id = s.id),
        'places', (select count(*) from public.offer_sign_required(g.id, s.position) x)) order by s.position) from public.offer_signers s where s.signing_id = g.id and s.void_at is null),
    'taps', (select coalesce(jsonb_agg(jsonb_build_object('place_id', t.place_id, 'signer', s.position, 'at', t.at) order by t.id), '[]'::jsonb) from public.offer_sign_taps_live t join public.offer_signers s on s.id = t.signer_id where t.signing_id = g.id),
    'marks', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'page', m.page, 'geometry', m.geometry, 'target', m.target, 'by', m.by_name, 'at', m.at,
        'reviewed_at', (select min(r.at) from public.offer_sign_reviews_live r where r.signing_id = g.id and r.kind = 'review' and m.id = any (r.marks))) order by m.at, m.id), '[]'::jsonb) from public.offer_sign_marks_live m where m.signing_id = g.id),
    'replaced', (select coalesce(jsonb_agg(jsonb_build_object('number', dd.number, 'at', x.replaced_at) order by x.replaced_at), '[]'::jsonb) from public.offer_signings x join public.offer_drafts dd on dd.id = x.draft_id where x.offer_id = g.offer_id and x.status = 'replaced'),
    'made_at', now());
end $$;

-- ───── Undo (Tim, 26 November 2026): in every signing turn, in person and by link ─────
-- p_scope 'last': the signer's newest step that stands (a place tapped, or a change made) is undone (by time; each step is its own
-- request, so two never share a time in use; taps at the same time go by their number). 'turn': everything they did this round
-- is undone; their drawing is kept unless p_clear (then they draw again before they tap). Nothing is removed: each undone step is a row in
-- offer_sign_undos, and the timeline says what was undone, by whom and when. Nobody is emailed. A change someone else has since reinstated
-- can't be undone by its maker (the reinstatement would be left pointing at nothing); Tim can start the round again instead.
create or replace function public.offer_sign_do_undo(p_signer uuid, p_scope text, p_clear boolean, p_by text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings; why text; k text; tid bigint; mid uuid; taps_ bigint[] := '{}'; marks_ uuid[] := '{}'; places_ text[] := '{}'; kinds_ text[] := '{}';
  need int; done int; cleared boolean := false; ink jsonb; by_ text;
begin
  if coalesce(p_scope, '') not in ('last', 'turn') then raise exception 'Choose undo your last step, or start your turn again'; end if;
  if p_scope = 'last' and p_clear is true then raise exception 'Your signature and initials are cleared only when you start your turn again'; end if;
  -- lock order (as finishing and changes): the offer FOR KEY SHARE, then the signing, then the signer
  perform public.offer_lock_by_signer(p_signer);
  perform 1 from public.offer_signings where id = (select signing_id from public.offer_signers where id = p_signer) for update;
  select * into s from public.offer_signers where id = p_signer for update; if s.id is null then raise exception 'No such signer'; end if;
  select * into g from public.offer_signings where id = s.signing_id;
  by_ := left(coalesce(nullif(trim(coalesce(p_by, '')), ''), s.name), 254);
  -- as offer_sign_ready, except that a round held for Tim (a Round 1 mark waiting for him) may still have that mark undone
  if public.offer_hold_active(g.offer_id) then raise exception 'This version is no longer being signed. Tim will be in touch.'; end if;
  if s.void_at is not null then raise exception 'This version has been replaced. Tim will send you the new one.'; end if;
  why := public.offer_sign_current(g); if why is not null then raise exception '%', why; end if;
  if exists (select 1 from public.offer_requests r where r.signer_id = s.id and r.handled_at is null) then raise exception 'Your request has gone to Tim. He will contact you straight away.'; end if;
  if g.status = 'ready' then raise exception 'Signing hasn''t started yet'; end if;
  if g.status = 'complete' then raise exception 'Everyone has signed. The signed copy is being locked.'; end if;
  if g.status <> 'signing' and g.status <> 'held' then raise exception 'Signing isn''t open, so there is nothing to undo'; end if;
  if s.finished_at is not null then raise exception 'You have finished signing, so your turn is closed. Tim can start the round again if something needs changing'; end if;
  -- at most 30 undos an hour per signer (as changes are capped)
  if (select count(*) from public.offer_events e where e.offer_id = g.offer_id and e.kind = 'sign_undone' and e.detail->>'signing_id' = g.id::text and (e.detail->>'signer')::int = s.position and e.at > now() - interval '1 hour') >= 30 then
    raise exception 'You have undone a lot in the last hour. Please call Tim on 027 562 7207'; end if;
  if p_scope = 'last' then
    select x.k, x.tid, x.mid into k, tid, mid from (
      select 'tap' k, l.id tid, null::uuid mid, l.at, lpad(l.id::text, 20, '0') ref from public.offer_sign_taps_live l where l.signer_id = s.id
      union all select 'change', null, m.id, m.at, m.id::text from public.offer_sign_marks_live m where m.signer_id = s.id) x order by x.at desc, x.ref desc limit 1;
    if k is null then raise exception 'There is nothing of yours to undo on this round'; end if;
    if k = 'tap' then taps_ := array[tid]; else marks_ := array[mid]; end if;
  else
    select coalesce(array_agg(l.id order by l.id), '{}') into taps_ from public.offer_sign_taps_live l where l.signer_id = s.id;
    select coalesce(array_agg(m.id order by m.at, m.id), '{}') into marks_ from public.offer_sign_marks_live m where m.signer_id = s.id;
    ink := public.offer_sign_ink(s.id);
    if cardinality(taps_) = 0 and cardinality(marks_) = 0 and not (p_clear is true and ink->>'sig_png' is not null) then raise exception 'There is nothing of yours to undo on this round'; end if;
  end if;
  -- a change another person has reinstated since stays (undo theirs first, or Tim starts the round again)
  if exists (select 1 from public.offer_sign_marks_live r where r.kind = 'reinstate' and r.target = any (marks_) and not (r.id = any (marks_))) then
    raise exception 'Someone has reinstated that since, so it can''t be undone here. Ask Tim to start the round again'; end if;
  select coalesce(array_agg(t.place_id order by t.id), '{}') into places_ from public.offer_sign_taps t where t.id = any (taps_);
  select coalesce(array_agg(m.kind order by m.at, m.id), '{}') into kinds_ from public.offer_sign_marks m where m.id = any (marks_);
  insert into public.offer_sign_undos (signing_id, signer_id, tap_id, scope, by_name) select g.id, s.id, x, p_scope, by_ from unnest(taps_) x;
  insert into public.offer_sign_undos (signing_id, signer_id, mark_id, scope, by_name) select g.id, s.id, x, p_scope, by_ from unnest(marks_) x;
  if p_scope = 'turn' and p_clear is true and public.offer_sign_ink(s.id)->>'sig_png' is not null then
    insert into public.offer_sign_redraws (signing_id, signer_id, sig_png, init_png, by_name) values (g.id, s.id, null, null, by_); cleared := true; end if;
  -- a Round 1 round held for Tim carries on once no mark waits for him
  perform set_config('offers.fn', 'on', true);
  if g.status = 'held' and not exists (select 1 from public.offer_sign_marks_live m where m.signing_id = g.id and not exists (select 1 from public.offer_sign_reviews_live r where r.signing_id = g.id and m.id = any (r.marks))) then
    update public.offer_signings set status = 'signing' where id = g.id; end if;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, by_, 'sign_undone',
    jsonb_build_object('signing_id', g.id, 'round', g.round_no, 'side', g.side, 'signer', s.position, 'scope', p_scope, 'taps', cardinality(taps_), 'places', to_jsonb(places_), 'changes', cardinality(marks_), 'change_ids', to_jsonb(marks_), 'change_kinds', to_jsonb(kinds_), 'ink_cleared', cleared));
  if cardinality(marks_) > 0 then perform public.offer_mail_void_stale_reopened(g.id, by_); end if;
  perform set_config('offers.fn', '', true);
  select count(*) into need from public.offer_sign_required(g.id, s.position) x;
  select count(*) into done from public.offer_sign_taps_live t2 where t2.signer_id = s.id and t2.place_id in (select public.offer_sign_required(g.id, s.position));
  return jsonb_build_object('scope', p_scope, 'taps', cardinality(taps_), 'changes', cardinality(marks_), 'ink_cleared', cleared, 'done', done, 'of', need);
end $$;
-- "Please initial the change" drafts (024's reopened drafts, made when a change reopened someone who had finished) that no longer ask for
-- anything: once a change is undone, an unsent draft whose signer has no change left to initial from before it was made is set aside
-- (void, with the reason; never removed). Sent ones stay as they went. Tim sees them on the round's page.
create or replace function public.offer_mail_void_stale_reopened(p_signing uuid, p_actor text) returns int language plpgsql security definer set search_path = public as $$
declare m record; n int := 0;
begin
  perform set_config('offers.fn', 'on', true);
  for m in select d.id, d.property_id, d.offer_id, d.kind from public.offer_mail_drafts d join public.offer_signers s on s.id = d.signer_id
      where d.signing_id = p_signing and d.kind = 'reopened' and d.status = 'draft'
        and not exists (select 1 from public.offer_sign_marks_live k where k.signing_id = p_signing and k.at <= d.created_at
          and ('chg:' || k.id || ':s' || s.position) not in (select l.place_id from public.offer_sign_taps_live l where l.signer_id = s.id))
      for update of d loop
    update public.offer_mail_drafts set status = 'void', void_at = now(), void_by = left(coalesce(p_actor, 'system'), 254), void_reason = 'The change it asked them to initial was undone' where id = m.id;
    insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (m.property_id, m.offer_id, left(coalesce(p_actor, 'system'), 254), 'mail_set_aside', jsonb_build_object('draft_id', m.id, 'kind', m.kind, 'reason', 'change undone'));
    n := n + 1;
  end loop;
  return n;
end $$;
-- on Tim's device, the signer whose turn it is
create or replace function public.agent_signing_undo(p_signer uuid, p_scope text, p_clear boolean default false) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.offer_signers;
begin s := public.offer_sign_person(p_signer); return public.offer_sign_do_undo(p_signer, p_scope, p_clear, s.name); end $$;
-- by their own link (the offer-sign edge function, service role)
create or replace function public.offer_sign_undo(p_token text, p_session text, p_scope text, p_clear boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; begin s := public.offer_sign_me(p_token, p_session); return public.offer_sign_do_undo(s.id, p_scope, coalesce(p_clear, false), s.name); end $$;

-- ───── Tim starts an open round again from its start (Tim, 26 November 2026) ─────
-- Every tap and change that stands on the round is undone (each a row in offer_sign_undos, by Tim), everyone who had finished is opened
-- again, and a round held for Tim or complete goes back to signing. Drawn signatures are kept (each signer can clear their own). The
-- round stays open with the same people and the same links; nobody is emailed. A sealed round is never touched.
create or replace function public.agent_signing_revert_round(p_signing uuid, p_reason text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); g public.offer_signings; why text := nullif(trim(coalesce(p_reason, '')), ''); nt int; nm int; nf int; ids uuid[];
begin
  if why is null or length(why) < 3 or length(why) > 500 then raise exception 'Say why you are starting this round again (3 to 500 characters)'; end if;
  perform 1 from public.property_offers where id = (select offer_id from public.offer_signings where id = p_signing) for update;   -- Tim changes the round's state: the offer FOR UPDATE first
  select * into g from public.offer_signings where id = p_signing for update; if g.id is null then raise exception 'No such signing'; end if;
  if g.status not in ('ready', 'signing', 'held', 'complete') or exists (select 1 from public.offer_rounds r where r.signing_id = g.id) then raise exception 'This round is sealed or stopped, so it is kept exactly as it is'; end if;
  if exists (select 1 from public.offer_agreements a where a.offer_id = g.offer_id) then raise exception 'The agreement has been made. Talk to the lawyers'; end if;
  if exists (select 1 from public.offer_holds h where h.offer_id = g.offer_id and h.kind = 'withdraw') then raise exception 'This offer was withdrawn, so it stays stopped'; end if;
  select coalesce(array_agg(m.id), '{}') into ids from public.offer_sign_marks_live m where m.signing_id = g.id;
  insert into public.offer_sign_undos (signing_id, signer_id, tap_id, scope, by_name) select g.id, l.signer_id, l.id, 'round', left(me, 254) from public.offer_sign_taps_live l where l.signing_id = g.id;
  get diagnostics nt = row_count;
  insert into public.offer_sign_undos (signing_id, signer_id, mark_id, scope, by_name) select g.id, m.signer_id, m.id, 'round', left(me, 254) from public.offer_sign_marks m where m.id = any (ids);
  get diagnostics nm = row_count;
  perform set_config('offers.fn', 'on', true);
  if g.status in ('held', 'complete') then update public.offer_signings set status = 'signing' where id = g.id; end if;   -- before the signers (their guard reads it)
  update public.offer_signers set finished_at = null, seen_sha256 = null where signing_id = g.id and finished_at is not null and void_at is null;
  get diagnostics nf = row_count;
  if nt = 0 and nm = 0 and nf = 0 then raise exception 'Nothing has been done on this round yet, so there is nothing to start again'; end if;
  if nm > 0 then perform public.offer_mail_void_stale_reopened(g.id, me); end if;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, me, 'round_reset',
    jsonb_build_object('signing_id', g.id, 'round', g.round_no, 'side', g.side, 'reason', why, 'taps', nt, 'changes', nm, 'change_ids', to_jsonb(ids), 'reopened', nf));
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('ok', true, 'taps', nt, 'changes', nm, 'reopened', nf);
end $$;

-- ───── Going back to the last sealed round (Tim, 26 November 2026) ─────
-- Material changes may have happened while the offer was frozen. Tim (when he unfreezes, p_unfreeze; or releasing a party's request,
-- p_request, once it is unfrozen) stops every round still out for signing on the offer, as cancelled: what was done on it (the taps,
-- changes and finished signers that stood) is listed on the timeline as discarded, every row kept as it was. The last sealed round stays
-- the newest: Tim then presents it again, or starts a fresh copy, as before. Nobody is emailed.
create or replace function public.agent_offer_revert_sealed(p_offer uuid, p_note text, p_request uuid default null, p_unfreeze boolean default false) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); o public.property_offers; h public.offer_holds; rq public.offer_requests; why text := nullif(trim(coalesce(p_note, '')), ''); g public.offer_signings;
  det jsonb := '[]'::jsonb; n int; last_ int;
begin
  if why is null or length(why) < 3 or length(why) > 500 then raise exception 'Say why you are going back (3 to 500 characters)'; end if;
  select * into o from public.property_offers where id = p_offer for update; if o.id is null then raise exception 'No such offer'; end if;
  if exists (select 1 from public.offer_agreements a where a.offer_id = o.id) then raise exception 'The agreement has been made. Talk to the lawyers'; end if;
  if exists (select 1 from public.offer_holds x where x.offer_id = o.id and x.kind = 'withdraw') then raise exception 'This offer was withdrawn, so it stays stopped'; end if;
  if p_unfreeze is true then
    select * into h from public.offer_holds where offer_id = o.id and kind = 'freeze' and lifted_at is null for update; if h.id is null then raise exception 'This offer isn''t frozen'; end if;
  elsif public.offer_hold_active(o.id) then raise exception 'The offer is frozen. Unfreeze it and go back in one step';
  end if;
  if p_request is not null then
    select * into rq from public.offer_requests where id = p_request and offer_id = o.id for update;
    if rq.id is null or rq.handled_at is not null or rq.kind <> 'revert' then raise exception 'There is no open request to go back on this offer'; end if;
  end if;
  for g in select * from public.offer_signings where offer_id = o.id and status in ('ready', 'signing', 'held', 'complete') order by released_at loop
    det := det || jsonb_build_array(jsonb_build_object('signing_id', g.id, 'round', g.round_no, 'side', g.side, 'method', g.method,
      'taps', (select count(*) from public.offer_sign_taps_live l where l.signing_id = g.id),
      'changes', (select count(*) from public.offer_sign_marks_live m where m.signing_id = g.id),
      'change_ids', (select coalesce(jsonb_agg(m.id order by m.at), '[]'::jsonb) from public.offer_sign_marks_live m where m.signing_id = g.id),
      'finished', (select count(*) from public.offer_signers x where x.signing_id = g.id and x.finished_at is not null and x.void_at is null)));
  end loop;
  if jsonb_array_length(det) = 0 then raise exception 'Nothing is out for signing, so there is nothing to go back from'; end if;
  n := public.offer_stop_signings(o.id, null, me, left('Went back to the last sealed round: ' || why, 300), 'cancelled');
  select max(r.doc_round) into last_ from public.offer_rounds r join public.offer_documents dc on dc.id = r.document_id where r.offer_id = o.id and dc.status = 'open';
  perform set_config('offers.fn', 'on', true);
  if rq.id is not null then update public.offer_requests set handled_at = now(), handled_by = me, handled_as = 'revert' where id = rq.id; end if;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, o.id, me, 'round_reverted',
    jsonb_build_object('to_round', last_, 'discarded', det, 'reason', why, 'request_id', rq.id, 'unfrozen', p_unfreeze is true));
  if p_unfreeze is true then
    update public.offer_holds set lifted_at = now(), lifted_by = me, lift_note = left('Unfrozen, going back to the last sealed round: ' || why, 500) where id = h.id;
    insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (h.property_id, h.offer_id, me, 'offer_unfrozen', jsonb_build_object('hold_id', h.id, 'note', why, 'reverted', true));
  end if;
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('ok', true, 'stopped', n, 'to_round', last_, 'discarded', det);
end $$;

-- ───── Confirm while frozen: held, not locked, sealed or dated (Tim, 25 November 2026) ─────
-- 024's check, the same for every caller as before (the freeze refuses it); the held confirmation alone sets the freeze aside
create or replace function public.offer_agreement_check(p_offer uuid, p_accepted_at timestamptz, p_date_text text) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin return public.offer_agreement_check_core(p_offer, p_accepted_at, p_date_text, false); end $$;
create or replace function public.agent_offer_confirm_hold(p_offer uuid, p_accepted_at timestamptz, p_date_text text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); o public.property_offers; h public.offer_holds; c jsonb; id_ uuid;
begin
  select * into o from public.property_offers where id = p_offer for update; if o.id is null then raise exception 'No such offer'; end if;
  if exists (select 1 from public.offer_holds x where x.offer_id = o.id and x.kind = 'withdraw') then raise exception 'This offer was withdrawn, so no agreement is made'; end if;
  select * into h from public.offer_holds where offer_id = o.id and kind = 'freeze' and lifted_at is null; if h.id is null then raise exception 'The offer isn''t frozen, so confirm the agreement as usual'; end if;
  if exists (select 1 from public.offer_confirm_holds x where x.offer_id = o.id and x.resolved_at is null) then raise exception 'A confirmation is already held for this offer. Discard it first to hold a new one'; end if;
  c := public.offer_agreement_check_core(o.id, p_accepted_at, p_date_text, true);
  insert into public.offer_confirm_holds (offer_id, property_id, document_id, round_id, hold_id, accepted_at, date_text, agreement_date, held_by)
  values (o.id, o.property_id, (c->>'document_id')::uuid, (c->>'round_id')::uuid, h.id, p_accepted_at, c->>'date_text', (c->>'date')::date, me) returning id into id_;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, o.id, me, 'agreement_held',
    jsonb_build_object('held_id', id_, 'document', (c->>'document')::int, 'round', (c->>'round')::int, 'accepted_at', p_accepted_at, 'date', c->>'date_text', 'freeze_id', h.id));
  return jsonb_build_object('id', id_, 'round', (c->>'round')::int, 'accepted_at', p_accepted_at, 'date_text', c->>'date_text');
end $$;
-- completing it, once unfrozen: what was held, checked to still be for the newest sealed round. Tim's page then confirms the agreement
-- with it through the offer-sign function, where every check runs again (the date no earlier than acceptance, not after today).
create or replace function public.agent_offer_confirm_held(p_offer uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me text := public.offer_agent(); x public.offer_confirm_holds; doc public.offer_documents; last public.offer_rounds;
begin
  select * into x from public.offer_confirm_holds where offer_id = p_offer and resolved_at is null; if x.id is null then raise exception 'There is no held confirmation on this offer'; end if;
  if public.offer_hold_active(p_offer) then raise exception 'Unfreeze the offer first. The confirmation stays held until then'; end if;
  select * into doc from public.offer_documents where offer_id = p_offer and status = 'open';
  last := public.offer_doc_last(doc.id);
  if doc.id is null or last.id is distinct from x.round_id then raise exception 'The newest sealed round has changed since you held this. Discard it, then confirm again'; end if;
  return jsonb_build_object('id', x.id, 'accepted_at', x.accepted_at, 'date_text', x.date_text, 'round', last.doc_round);
end $$;
create or replace function public.agent_offer_confirm_hold_discard(p_offer uuid, p_note text default null) returns void language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); x public.offer_confirm_holds;
begin
  perform 1 from public.property_offers where id = p_offer for update;
  select * into x from public.offer_confirm_holds where offer_id = p_offer and resolved_at is null for update; if x.id is null then raise exception 'There is no held confirmation on this offer'; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'The note is too long'; end if;
  perform set_config('offers.fn', 'on', true);
  update public.offer_confirm_holds set resolved_at = now(), resolved_by = me, resolved_as = 'discarded', resolve_note = nullif(trim(coalesce(p_note, '')), '') where id = x.id;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (x.property_id, x.offer_id, me, 'agreement_hold_discarded', jsonb_build_object('held_id', x.id, 'accepted_at', x.accepted_at, 'date', x.date_text, 'note', nullif(trim(coalesce(p_note, '')), '')));
  perform set_config('offers.fn', '', true);
end $$;
-- settled by the database itself: the agreement made (completed when it is the held one, otherwise superseded), or the offer withdrawn
-- (discarded). The setting the guard reads is put back as it was.
create or replace function public.offer_confirm_hold_settle() returns trigger language plpgsql security definer set search_path = public as $$
declare prev text := coalesce(current_setting('offers.fn', true), '');
begin
  perform set_config('offers.fn', 'on', true);
  if tg_table_name = 'offer_agreements' then
    update public.offer_confirm_holds set resolved_at = now(), resolved_by = new.confirmed_by,
      resolved_as = case when round_id = new.round_id and accepted_at = new.accepted_at and date_text = new.date_text then 'completed' else 'superseded' end
      where offer_id = new.offer_id and resolved_at is null;
  elsif new.kind = 'withdraw' then
    update public.offer_confirm_holds set resolved_at = now(), resolved_by = new.made_by, resolved_as = 'discarded', resolve_note = 'The offer was withdrawn' where offer_id = new.offer_id and resolved_at is null;
  end if;
  perform set_config('offers.fn', prev, true);
  return null;
end $$;
create trigger offer_agreements_settle_holds after insert on public.offer_agreements for each row execute function public.offer_confirm_hold_settle();
create trigger offer_holds_settle_confirm after insert on public.offer_holds for each row execute function public.offer_confirm_hold_settle();

-- ───── execute rights ─────
revoke execute on function public.guard_offer_confirm_hold(), public.offer_confirm_hold_settle(), public.guard_offer_sign_open_work(), public.offer_mail_void_stale_reopened(uuid, text), public.offer_sign_ink(uuid), public.offer_revert_offered(public.offer_signings), public.offer_sign_do_undo(uuid, text, boolean, text),
  public.offer_agreement_check_core(uuid, timestamptz, text, boolean) from public, anon, authenticated;
revoke execute on function public.offer_sign_undo(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.offer_sign_undo(text, text, text, boolean) to service_role;
revoke execute on function public.agent_signing_undo(uuid, text, boolean), public.agent_signing_revert_round(uuid, text), public.agent_offer_revert_sealed(uuid, text, uuid, boolean),
  public.agent_offer_confirm_hold(uuid, timestamptz, text), public.agent_offer_confirm_held(uuid), public.agent_offer_confirm_hold_discard(uuid, text) from public, anon;
grant execute on function public.agent_signing_undo(uuid, text, boolean), public.agent_signing_revert_round(uuid, text), public.agent_offer_revert_sealed(uuid, text, uuid, boolean),
  public.agent_offer_confirm_hold(uuid, timestamptz, text), public.agent_offer_confirm_held(uuid), public.agent_offer_confirm_hold_discard(uuid, text) to authenticated;

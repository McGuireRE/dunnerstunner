-- Signing: places, chattels initials and four more marks (Tim, 26 November 2026). Additive only. Builds on 023, 024, 025 and 026.
-- 027 and 028 are kept for other work.
--
-- What it adds:
--   * Four more ways to mark the page, in every round, in person and by link: "Add text" (typed words, kind 'insert'), "Add my initials"
--     ('own_initials'), "Add my name" ('own_name') and "Add my signature" ('own_signature'). Typed words are a change: in Round 1 they
--     hold signing for Tim like every other mark, then everyone on that side initials them; from Round 2 on they are a counter change
--     (024's change, with initials beside it), and by link only when Tim allowed changes from that link. A signer's own initials, name or
--     signature use only that signer's own ink as it stands (offer_sign_ink) and their exact name: the database copies the ink in itself
--     (offer_sign_marks.ink_png), so a mark can never carry anyone else's. In Round 1 they hold signing for Tim like other marks, but the
--     other signers don't initial them; from Round 2 on they are not changes (nothing is lifted, nothing more to initial, and they don't
--     count as the round changing the document). They are always allowed by link. Every new mark sits inside the page, clear of the date
--     place and of every other signer's place (guard_offer_mark_place, before insert, whoever writes). Undo (026) works on them as on
--     every change. 30 an hour per signer, and by link 60 an hour per network, as changes are. By link in Round 1 a signer also has the
--     note, the line through text, the crossed-out box and the reinstatement, checked and held exactly as on Tim's screen.
--   * Chattels initials: whenever a side signs the whole agreement (Round 1, the vendors' first round, and every round when Tim's
--     setting resign_every_round is on), each signer has an initial place inside the chattels area of the blank's map. A signing without
--     them is refused, whoever inserts it (guard_offer_signing_chattels, before insert), with a plain message when the map has no
--     chattels area.
--   * Tim's own changes to the places before a round goes out: agent_signing_release_edited and agent_round_present_edited call 023's and
--     024's functions unchanged in what they check, then record what Tim added, moved or removed (event 'sign_places_edited'). A place
--     Tim adds or moves must also be clear of the date place.
--   * Identity (Tim, 26 November 2026): on Tim's device each signer's turn finishes only once he logs the photo ID he checked (its type,
--     never its number) and ticks that he watched them sign (offers: agent_signing_finish_checked; the agency agreement, notices,
--     variations and forms: the check in the signed snapshot, guard_signature_identity); by an emailed link, each signer has their own email.
--     Or, Tim's explicit choice after a warning, to sign in person without an identity check (recorded plainly); an empty choice is refused.
-- Replaced, word for word as 026 has them apart from what is named: agent_signing_mark (the new kinds go to offer_sign_do_mark),
-- agent_signing_review (a signer's own initials, name or signature need nobody's initials), offer_round_lock and agent_round_present (a
-- signer's own marks are not changes), offer_agreed_terms (the same), offer_doc_layers, offer_round_material and offer_sign_state (each
-- mark's ink; a link signer's Round 1 screen now sees the round's marks, as Tim's screen always has).
-- Nothing sealed changes: rounds, agreements, signatures, taps, marks and fingerprints are kept exactly as they are; every trigger stays.

-- ───── marks: the new kinds and their ink ─────
alter table public.offer_sign_marks drop constraint offer_sign_marks_kind_check, add constraint offer_sign_marks_kind_check check (kind in ('note', 'strike', 'cross', 'reinstate', 'insert', 'own_initials', 'own_name', 'own_signature'));
alter table public.offer_sign_marks add column ink_png text check (ink_png is null or (length(ink_png) <= 400000 and ink_png ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$'));
alter table public.offer_sign_marks add constraint offer_sign_marks_ink_kind check ((ink_png is not null) = (kind in ('own_initials', 'own_signature')));
-- what stands (026), now with the ink (a new column at the end; nothing else changes)
create or replace view public.offer_sign_marks_live with (security_invoker = true) as
  select m.* from public.offer_sign_marks m where not exists (select 1 from public.offer_sign_undos u where u.mark_id = m.id);

-- a signer's own initials, name or signature: not a change to the document
create or replace function public.offer_own_kind(k text) returns boolean language sql immutable as $$ select coalesce(k, '') in ('own_initials', 'own_name', 'own_signature') $$;
-- the shape of a signer's own mark: a box { x, y, w, h } on the page (and for a name its words and size)
create or replace function public.offer_own_ok(p_kind text, g jsonb, p_w numeric, p_h numeric) returns boolean language plpgsql immutable as $$
begin
  if jsonb_typeof(g) <> 'object' or not public.offer_own_kind(p_kind) then return false; end if;
  if not (public.offer_num_ok(g->'x', 0, p_w) and public.offer_num_ok(g->'y', 0, p_h) and public.offer_num_ok(g->'w', 8, 400) and public.offer_num_ok(g->'h', 4, 160)) then return false; end if;
  if (g->>'x')::numeric + (g->>'w')::numeric > p_w or (g->>'y')::numeric + (g->>'h')::numeric > p_h then return false; end if;
  if p_kind = 'own_initials' and ((g->>'w')::numeric > 200 or (g->>'h')::numeric > 100) then return false; end if;
  if p_kind = 'own_name' and (jsonb_typeof(g->'text') <> 'string' or not public.offer_num_ok(g->'size', 6, 14) or (g->>'h')::numeric > 60) then return false; end if;
  -- a name's box is wide enough for the words at the size they are drawn (and the drawing shrinks them to the box if ever they don't fit)
  if p_kind = 'own_name' and (g->>'w')::numeric < length(g->>'text') * (g->>'size')::numeric * 0.35 then return false; end if;
  if length(g::text) > 2000 then return false; end if;
  return true;
end $$;
-- the rectangle a new mark takes on the page
create or replace function public.offer_mark_rect(p_kind text, g jsonb) returns jsonb language sql immutable as $$
  select case when public.offer_own_kind(p_kind) then jsonb_build_object('x', (g->>'x')::numeric, 'y', (g->>'y')::numeric, 'w', (g->>'w')::numeric, 'h', (g->>'h')::numeric) else public.offer_change_rect(p_kind, g) end $$;
-- does a rectangle on a page sit on the blank's date place? (024's rule for a change)
create or replace function public.offer_hits_date(p_draft uuid, p_page int, rc jsonb) returns boolean language plpgsql stable security definer set search_path = public as $$
declare dp jsonb := public.offer_date_place(p_draft);
begin
  return dp is not null and (dp->>'page')::int = p_page and public.offer_gap(jsonb_build_object('x', (dp->>'x')::numeric, 'y', (dp->>'y')::numeric - 2, 'w', coalesce((dp->>'w')::numeric, 100), 'h', coalesce((dp->>'h')::numeric, 10) + 2), rc) = 0
     and least((dp->>'x')::numeric + coalesce((dp->>'w')::numeric, 100), (rc->>'x')::numeric + (rc->>'w')::numeric) > greatest((dp->>'x')::numeric, (rc->>'x')::numeric)
     and least((dp->>'y')::numeric + coalesce((dp->>'h')::numeric, 10), (rc->>'y')::numeric + (rc->>'h')::numeric) > greatest((dp->>'y')::numeric - 2, (rc->>'y')::numeric);
end $$;
-- how much two rectangles overlap, in square points
create or replace function public.offer_overlap(a jsonb, b jsonb) returns numeric language sql immutable as $$
  select greatest(0, least((a->>'x')::numeric + (a->>'w')::numeric, (b->>'x')::numeric + (b->>'w')::numeric) - greatest((a->>'x')::numeric, (b->>'x')::numeric))
       * greatest(0, least((a->>'y')::numeric + (a->>'h')::numeric, (b->>'y')::numeric + (b->>'h')::numeric) - greatest((a->>'y')::numeric, (b->>'y')::numeric)) $$;

-- every typed words and every signer's own mark, whoever writes it: inside the page, clear of the date place and of every other signer's
-- place (this round's, the initials that came with changes, and every earlier round's of the document); a signer's own initials or
-- signature carry exactly their own ink as it stands, and their name exactly their name
create or replace function public.guard_offer_mark_place() returns trigger language plpgsql security definer set search_path = public as $$
declare g public.offer_signings; s public.offer_signers; rc jsonb; w numeric; h numeric; ink jsonb;
begin
  if new.kind not in ('insert', 'own_initials', 'own_name', 'own_signature') then return new; end if;
  select * into g from public.offer_signings where id = new.signing_id; select * into s from public.offer_signers where id = new.signer_id;
  if g.id is null or s.id is null or s.signing_id <> g.id then raise exception 'That signer isn''t on this round'; end if;
  if new.page < 1 or new.page > jsonb_array_length(g.pages) then raise exception 'That page isn''t in the document'; end if;
  w := (g.pages->(new.page - 1)->>0)::numeric; h := (g.pages->(new.page - 1)->>1)::numeric;
  if public.offer_own_kind(new.kind) then
    if not public.offer_own_ok(new.kind, new.geometry, w, h) then raise exception 'That doesn''t sit on the page. Put it inside the page'; end if;
    ink := public.offer_sign_ink(s.id);
    if new.kind = 'own_initials' and new.ink_png is distinct from ink->>'init_png' then raise exception 'Only your own initials, as you drew them, can be added'; end if;
    if new.kind = 'own_signature' and new.ink_png is distinct from ink->>'sig_png' then raise exception 'Only your own signature, as you drew it, can be added'; end if;
    if new.kind = 'own_name' and new.geometry->>'text' is distinct from s.name then raise exception 'Only your own name, exactly as it is on the agreement, can be added'; end if;
  elsif not public.offer_change_ok(new.kind, new.geometry, w, h) then raise exception 'That doesn''t sit on the page';
  end if;
  rc := public.offer_mark_rect(new.kind, new.geometry);
  if public.offer_hits_date(g.draft_id, new.page, rc) then raise exception 'That is where the date goes once the agreement is made. Put it somewhere else'; end if;
  if exists (select 1 from (
      select e from jsonb_array_elements(g.places) e where (e->>'signer')::int <> s.position
      union all select e from public.offer_sign_reviews_live r, jsonb_array_elements(r.places) e where r.signing_id = g.id and (e->>'signer')::int <> s.position
      -- earlier rounds' ink: a signer's own mark never covers it (typed words, a change, may sit where it lifts the other side's ink, 024)
      union all select e from public.offer_rounds x join public.offer_signings y on y.id = x.signing_id, jsonb_array_elements(y.places) e where public.offer_own_kind(new.kind) and g.document_id is not null and x.document_id = g.document_id
      union all select e from public.offer_rounds x join public.offer_sign_reviews_live r on r.signing_id = x.signing_id, jsonb_array_elements(r.places) e where public.offer_own_kind(new.kind) and g.document_id is not null and x.document_id = g.document_id) z
    where (e->>'page')::int = new.page and public.offer_overlap(e, rc) > 0.5) then
    raise exception 'That would sit on someone else''s place to sign or initial. Put it in a clear space'; end if;
  return new;
end $$;
create trigger offer_sign_marks_place before insert on public.offer_sign_marks for each row execute function public.guard_offer_mark_place();

-- ───── chattels initials (Tim, 26 November 2026: the chattels box always has initials) ─────
-- the chattels area on the map a draft was made with, as a rectangle { page, x, y, w, h } (src/sign-core.js chattelsArea), or null
create or replace function public.offer_chattels_rect(p_draft uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('page', (e->>'page')::int, 'x', (e->>'x')::numeric, 'w', (e->>'w')::numeric, 'h', (e->>'h')::numeric,
      'y', case when e->>'kind' in ('area', 'never') then (e->>'y')::numeric + 9 - (e->>'h')::numeric else (e->>'y')::numeric end)
  from public.offer_drafts d join public.offer_blank_maps bm on bm.id = d.map_id, jsonb_array_elements(bm.places) e
  where d.id = p_draft and e->>'id' = 'chattels' and jsonb_typeof(e->'x') = 'number' and jsonb_typeof(e->'y') = 'number' and jsonb_typeof(e->'w') = 'number' and jsonb_typeof(e->'h') = 'number'
    and jsonb_typeof(e->'page') = 'number' and (e->>'w')::numeric > 0 and (e->>'h')::numeric > 0 limit 1 $$;
-- a side signing the whole agreement (Round 1, its first round, or every round with resign_every_round): every signer initials inside the
-- chattels area. The signers are those with a signature in the block (every signer has one in such a round: 023 and 024 check it).
create or replace function public.guard_offer_signing_chattels() returns trigger language plpgsql security definer set search_path = public as $$
declare cr jsonb; whole boolean; s int;
begin
  whole := new.round_no = 1 or not exists (select 1 from public.offer_rounds r where r.document_id = new.document_id and r.side = new.side)
    or coalesce((select resign_every_round from public.offer_settings limit 1), false);
  if not whole then return new; end if;
  cr := public.offer_chattels_rect(new.draft_id);
  if cr is null then raise exception 'The places on the blank have no chattels area, so nobody can initial the chattels. Add the chattels area to the places on the blank, then load it again'; end if;
  for s in select distinct (e->>'signer')::int from jsonb_array_elements(new.places) e where e->>'kind' = 'signature' and e->>'why' = 'block' loop
    if not exists (select 1 from jsonb_array_elements(new.places) e where (e->>'signer')::int = s and e->>'kind' = 'initial' and (e->>'page')::int = (cr->>'page')::int
        and (e->>'x')::numeric >= (cr->>'x')::numeric - 1 and (e->>'x')::numeric + (e->>'w')::numeric <= (cr->>'x')::numeric + (cr->>'w')::numeric + 1
        and (e->>'y')::numeric >= (cr->>'y')::numeric - 1 and (e->>'y')::numeric + (e->>'h')::numeric <= (cr->>'y')::numeric + (cr->>'h')::numeric + 1) then
      raise exception 'Please check the signing places: everyone initials the chattels, inside the chattels box (signer % has no initials there)', s; end if;
  end loop;
  return new;
end $$;
create trigger offer_signings_chattels before insert on public.offer_signings for each row execute function public.guard_offer_signing_chattels();
-- a later round's places never cover a signer's own initials, name or signature standing on the document's sealed rounds (whoever inserts it)
create or replace function public.guard_offer_signing_own_clear() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.document_id is null then return new; end if;
  if exists (select 1 from jsonb_array_elements(new.places) x, public.offer_sign_marks_live m join public.offer_rounds rr on rr.signing_id = m.signing_id
      where rr.document_id = new.document_id and public.offer_own_kind(m.kind) and m.page = (x->>'page')::int and public.offer_overlap(x, public.offer_mark_rect(m.kind, m.geometry)) > 0.5) then
    raise exception 'A signing place would cover a signer''s own initials, name or signature from an earlier round. Move it to a clear space'; end if;
  return new;
end $$;
create trigger offer_signings_own_clear before insert on public.offer_signings for each row execute function public.guard_offer_signing_own_clear();

-- ───── the four marks ─────
-- one mark of the new kinds by one signer, in person (Tim's screen, p_link false) or by their link (p_link true, with the network for the
-- hourly limit). Round 1: typed words or the signer's own initials, name or signature; it holds signing for Tim, as every Round 1 mark
-- does. From Round 2 on: only a signer's own initials, name or signature (typed words are a change: offer_sign_do_change); it doesn't
-- hold signing and asks nobody to initial it. Lock order: the offer, then the signing, then the signer.
-- By link in Round 1 the signer also has 020's marks (a note, a line through text, a crossed-out box, a reinstatement: Tim, 26 November
-- 2026), checked exactly as on Tim's screen (agent_signing_mark) and holding the round for him in the same way.
create or replace function public.offer_sign_do_mark(p_signer uuid, p_kind text, p_page int, p_geometry jsonb, p_target uuid, p_net text, p_link boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.offer_signers; g public.offer_signings; why text; w numeric; h numeric; mid uuid; ink jsonb; who text; n text; t public.offer_sign_marks; old_ boolean := coalesce(p_kind, '') in ('note', 'strike', 'cross', 'reinstate');
begin
  if coalesce(p_kind, '') not in ('insert', 'own_initials', 'own_name', 'own_signature') and not (old_ and p_link is true) then raise exception 'Choose what to add'; end if;
  if p_kind <> 'reinstate' and p_target is not null then raise exception 'Only a reinstatement points at another mark'; end if;
  perform public.offer_lock_by_signer(p_signer);
  perform 1 from public.offer_signings where id = (select signing_id from public.offer_signers where id = p_signer) for update;
  select * into s from public.offer_signers where id = p_signer for update; if s.id is null then raise exception 'No such signer'; end if;
  select * into g from public.offer_signings where id = s.signing_id;
  if g.round_no > 1 and (p_kind = 'insert' or old_) then raise exception 'In a counteroffer, that is a change: use the change tools'; end if;
  if g.round_no > 1 then g := public.offer_sign_ready(s, false);
  else
    if public.offer_hold_active(g.offer_id) then raise exception 'This version is no longer being signed. Tim will be in touch.'; end if;
    if s.void_at is not null then raise exception 'This version has been replaced. Tim will send you the new one.'; end if;
    why := public.offer_sign_current(g); if why is not null then raise exception '%', why; end if;
    if exists (select 1 from public.offer_requests r where r.signer_id = s.id and r.handled_at is null) then raise exception 'Your request has gone to Tim. He will contact you straight away.'; end if;
    if g.status not in ('signing', 'held') then raise exception 'Signing isn''t open'; end if;
    if s.finished_at is not null then raise exception 'You have finished signing. Thank you.'; end if;
  end if;
  if (g.method = 'link') <> (p_link is true) then raise exception 'Please try that again'; end if;
  if s.consent_at is null then raise exception 'Agree to sign electronically first'; end if;
  ink := public.offer_sign_ink(s.id);
  if public.offer_own_kind(p_kind) and (ink->>'sig_png' is null or ink->>'init_png' is null) then raise exception 'Draw your signature and initials first'; end if;
  if (select count(*) from public.offer_sign_marks where signer_id = s.id and at > now() - interval '1 hour') >= 30 then raise exception 'You have marked the page a lot in the last hour. Please call Tim on 027 562 7207'; end if;
  if p_link is true then n := public.offer_net(p_net);
    if public.offer_hit_count('sign_change', n, null, interval '1 hour') >= 60 then raise exception 'A lot of changes have been made from here in the last hour. Please call Tim on 027 562 7207'; end if;
    insert into public.offer_hits (kind, net) values ('sign_change', n); end if;
  if p_page is null or p_page < 1 or p_page > jsonb_array_length(g.pages) then raise exception 'That page isn''t in the document'; end if;
  w := (g.pages->(p_page - 1)->>0)::numeric; h := (g.pages->(p_page - 1)->>1)::numeric;
  if old_ then
    if not public.offer_mark_ok(p_kind, p_geometry, w, h) then raise exception 'That mark doesn''t sit on the page'; end if;
    if p_kind = 'reinstate' then
      select * into t from public.offer_sign_marks_live where id = p_target and signing_id = g.id;
      if t.id is null or t.kind not in ('strike', 'cross') then raise exception 'Choose a line or crossed-out box to reinstate'; end if;
      if exists (select 1 from public.offer_sign_marks_live where target = t.id and kind = 'reinstate') then raise exception 'That has already been reinstated'; end if;
    end if;
  elsif p_kind = 'insert' then
    if not public.offer_change_ok('insert', p_geometry, w, h) then raise exception 'That doesn''t sit on the page'; end if;
    who := public.offer_private_hit(g.offer_id, p_geometry->>'text');
    if who is not null then raise exception 'Those words hold %''s own phone or email, so they can''t go on the agreement. Only the lawyers'' details go on it', who; end if;
  elsif not public.offer_own_ok(p_kind, p_geometry, w, h) then raise exception 'That doesn''t sit on the page. Put it inside the page';
  end if;
  insert into public.offer_sign_marks (signing_id, signer_id, by_name, kind, page, geometry, target, ink_png)
  values (g.id, s.id, s.name, p_kind, p_page, p_geometry, case when p_kind = 'reinstate' then p_target end, case p_kind when 'own_initials' then ink->>'init_png' when 'own_signature' then ink->>'sig_png' end) returning id into mid;
  perform set_config('offers.fn', 'on', true);
  if g.round_no = 1 then
    update public.offer_signings set status = 'held', held_at = now() where id = g.id;
    insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, s.name, 'sign_marked', jsonb_build_object('signing_id', g.id, 'mark_id', mid, 'kind', p_kind, 'page', p_page, 'signer', s.position, 'target', p_target,
      'by_link', p_link is true, 'text', case when p_kind in ('insert', 'own_name', 'strike') then p_geometry->>'text' end));
  else
    insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, s.name, 'sign_own_mark', jsonb_build_object('signing_id', g.id, 'round', g.round_no, 'side', g.side, 'mark_id', mid, 'kind', p_kind, 'page', p_page, 'signer', s.position,
      'by_link', p_link is true, 'text', case when p_kind = 'own_name' then p_geometry->>'text' end));
  end if;
  perform set_config('offers.fn', '', true);
  return jsonb_build_object('id', mid, 'held', g.round_no = 1, 'name', s.name, 'round', g.round_no, 'side', g.side, 'kind', p_kind, 'page', p_page, 'address', (select address from public.properties where id = g.property_id));
end $$;
-- by link: the signer's own token and session (the offer-sign edge function, service role)
create or replace function public.offer_sign_mark(p_token text, p_session text, p_net text, p_kind text, p_page int, p_geometry jsonb, p_target uuid default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.offer_signers;
begin
  s := public.offer_sign_me(p_token, p_session);
  return public.offer_sign_do_mark(s.id, p_kind, p_page, p_geometry, p_target, p_net, true);
end $$;

-- ───── Tim's own changes to the places, before a round goes out ─────
-- p_edits: { added: [place id], moved: [place id], removed: [{ id, label }] }, as Tim's screen made them from the places proposed for him.
-- Each place is checked by 023's and 024's functions exactly as before (and the chattels rule above); a place Tim added or moved is also
-- kept off the date place. What he changed is recorded on the round's timeline.
create or replace function public.offer_places_edits_ok(p_places jsonb, p_edits jsonb, p_draft uuid, p_document uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e jsonb := coalesce(p_edits, '{}'::jsonb); x jsonb; id_ text; pl jsonb; r jsonb; own_n int := 0; n_ch int := 0;
begin
  if jsonb_typeof(e) <> 'object' or length(e::text) > 60000 then raise exception 'Please check the places you changed'; end if;
  if jsonb_typeof(coalesce(e->'added', '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(e->'moved', '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(e->'removed', '[]'::jsonb)) <> 'array' then raise exception 'Please check the places you changed'; end if;
  -- a signer's own initials, name or signature standing on the document's sealed rounds: no place of the new round may cover it
  if p_document is not null then
    for x in select * from jsonb_array_elements(p_places) loop
      if exists (select 1 from public.offer_sign_marks_live m join public.offer_rounds rr on rr.signing_id = m.signing_id
          where rr.document_id = p_document and public.offer_own_kind(m.kind) and m.page = (x->>'page')::int and public.offer_overlap(x, public.offer_mark_rect(m.kind, m.geometry)) > 0.5) then
        raise exception 'A signing place would cover a signer''s own initials, name or signature from an earlier round. Move it to a clear space'; end if;
    end loop;
    select count(*) into own_n from public.offer_sign_marks_live m join public.offer_rounds rr on rr.signing_id = m.signing_id where rr.document_id = p_document and public.offer_own_kind(m.kind);
  end if;
  -- each place Tim added or moved: in the list, off the date place, and off every other signer's place
  for x in select * from jsonb_array_elements(coalesce(e->'added', '[]'::jsonb) || coalesce(e->'moved', '[]'::jsonb)) loop
    id_ := x #>> '{}';
    select q into pl from jsonb_array_elements(p_places) q where q->>'id' = id_ limit 1;
    if pl is null then raise exception 'Please check the places you changed: one of them isn''t in the list'; end if;
    r := jsonb_build_object('x', (pl->>'x')::numeric, 'y', (pl->>'y')::numeric, 'w', (pl->>'w')::numeric, 'h', (pl->>'h')::numeric);
    if public.offer_hits_date(p_draft, (pl->>'page')::int, r) then raise exception 'That is where the date goes once the agreement is made. Put the place somewhere else'; end if;
    if exists (select 1 from jsonb_array_elements(p_places) q where q->>'signer' <> pl->>'signer' and (q->>'page')::int = (pl->>'page')::int and public.offer_overlap(q, r) > 0.5) then
      raise exception 'A place you added or moved sits on another signer''s place. Put it in a clear space'; end if;
    n_ch := n_ch + 1;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(e->'added', '[]'::jsonb)) loop
    if (x #>> '{}') !~ '^ack:tim[A-Za-z0-9-]{1,60}:s[0-9]{1,2}$' then raise exception 'Please check the places you added'; end if;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(e->'removed', '[]'::jsonb)) loop
    if jsonb_typeof(x) <> 'object' or length(coalesce(x->>'id', '')) not between 3 and 140 or length(coalesce(x->>'label', '')) > 400 then raise exception 'Please check the places you removed'; end if;
    if exists (select 1 from jsonb_array_elements(p_places) q where q->>'id' = x->>'id') then raise exception 'Please check the places you removed'; end if;
  end loop;
  -- what the server compared: the places sent (their fingerprint, counted by kind of place), each added or moved place found and clear,
  -- each removed place absent; and the screen's own fingerprint of what it proposed (as the screen gives it; the server can't make it)
  return jsonb_build_object('added', coalesce(e->'added', '[]'::jsonb), 'moved', coalesce(e->'moved', '[]'::jsonb), 'removed', coalesce(e->'removed', '[]'::jsonb),
    'checked', jsonb_build_object('sent_sha256', public.offer_sha(p_places::text), 'sent', jsonb_array_length(p_places),
      'sent_by_why', (select coalesce(jsonb_object_agg(w, c), '{}'::jsonb) from (select q->>'why' w, count(*) c from jsonb_array_elements(p_places) q group by 1) z),
      'added_or_moved_clear', n_ch, 'removed_absent', jsonb_array_length(coalesce(e->'removed', '[]'::jsonb)), 'own_marks_kept_clear', own_n,
      'proposed_sha256_screen', case when coalesce(e->>'proposed_sha256', '') ~ '^[0-9a-f]{64}$' then e->>'proposed_sha256' end,
      'proposed_screen', case when jsonb_typeof(e->'proposed') = 'number' then e->'proposed' end));
end $$;
create or replace function public.agent_signing_release_edited(p_draft uuid, p_method text, p_pages jsonb, p_places jsonb, p_cca_pages int[], p_edits jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); r jsonb; ed jsonb; g public.offer_signings;
begin
  ed := public.offer_places_edits_ok(p_places, p_edits, p_draft, null);
  r := public.agent_signing_release(p_draft, p_method, p_pages, p_places, p_cca_pages);
  if (r->>'existing')::boolean is true then return r; end if;
  if jsonb_array_length(ed->'added') + jsonb_array_length(ed->'moved') + jsonb_array_length(ed->'removed') > 0 then
    select * into g from public.offer_signings where id = (r->>'id')::uuid;
    perform set_config('offers.fn', 'on', true);
    insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, me, 'sign_places_edited', jsonb_build_object('signing_id', g.id, 'round', 1, 'side', 'purchaser',
      'added', jsonb_array_length(ed->'added'), 'moved', jsonb_array_length(ed->'moved'), 'removed', jsonb_array_length(ed->'removed'), 'added_ids', ed->'added', 'moved_ids', ed->'moved', 'removed_places', ed->'removed', 'places_sha256', g.places_sha256, 'checked', ed->'checked'));
    perform set_config('offers.fn', '', true);
  end if;
  return r || jsonb_build_object('edited', ed);
end $$;
create or replace function public.agent_round_present_edited(p_offer uuid, p_method text, p_places jsonb, p_checked boolean, p_note text, p_link_changes boolean, p_edits jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); r jsonb; ed jsonb; g public.offer_signings; doc public.offer_documents;
begin
  select * into doc from public.offer_documents where offer_id = p_offer and status = 'open';
  if doc.id is null then return public.agent_round_present(p_offer, p_method, p_places, p_checked, p_note, p_link_changes); end if;   -- its own message
  ed := public.offer_places_edits_ok(p_places, p_edits, doc.draft_id, doc.id);
  r := public.agent_round_present(p_offer, p_method, p_places, p_checked, p_note, p_link_changes);
  if (r->>'existing')::boolean is true then return r; end if;
  if jsonb_array_length(ed->'added') + jsonb_array_length(ed->'moved') + jsonb_array_length(ed->'removed') > 0 then
    select * into g from public.offer_signings where id = (r->>'id')::uuid;
    perform set_config('offers.fn', 'on', true);
    insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, me, 'sign_places_edited', jsonb_build_object('signing_id', g.id, 'round', g.round_no, 'side', g.side,
      'added', jsonb_array_length(ed->'added'), 'moved', jsonb_array_length(ed->'moved'), 'removed', jsonb_array_length(ed->'removed'), 'added_ids', ed->'added', 'moved_ids', ed->'moved', 'removed_places', ed->'removed', 'places_sha256', g.places_sha256, 'checked', ed->'checked'));
    perform set_config('offers.fn', '', true);
  end if;
  return r || jsonb_build_object('edited', ed);
end $$;

-- ───── 026's functions, word for word apart from what is named ─────

-- 026's layers, each mark with its ink (only a signer's own initials or signature have one, so earlier layers read exactly as before)
create or replace function public.offer_doc_layers(p_document uuid, p_upto int) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('round_id', r.id, 'number', r.number, 'doc_round', r.doc_round, 'side', r.side, 'signing_id', r.signing_id, 'sha256', r.sha256, 'locked_at', r.locked_at, 'changes', r.changes,
      'places', g.places || coalesce((select jsonb_agg(e) from public.offer_sign_reviews_live v, jsonb_array_elements(v.places) e where v.signing_id = g.id), '[]'::jsonb),
      'taps', (select coalesce(jsonb_agg(jsonb_build_object('place_id', t.place_id, 'signer', s.position) order by t.id), '[]'::jsonb) from public.offer_sign_taps_live t join public.offer_signers s on s.id = t.signer_id where t.signing_id = g.id),
      'signers', (select coalesce(jsonb_agg(jsonb_build_object('position', s.position, 'name', s.name, 'sig_png', public.offer_sign_ink(s.id)->>'sig_png', 'init_png', public.offer_sign_ink(s.id)->>'init_png') || jsonb_strip_nulls(jsonb_build_object('id_sighted', s.id_sighted, 'id_checked_at', (select max(e.at) from public.offer_events e where e.offer_id = g.offer_id and e.kind = 'sign_id_checked' and e.detail->>'signer_id' = s.id::text), 'no_id_check_at', (select max(e.at) from public.offer_events e where e.offer_id = g.offer_id and e.kind = 'sign_no_id_check' and e.detail->>'signer_id' = s.id::text))) order by s.position), '[]'::jsonb) from public.offer_signers s where s.signing_id = g.id and s.void_at is null),
      'marks', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'page', m.page, 'geometry', m.geometry, 'target', m.target, 'by', m.by_name, 'at', m.at) || case when m.ink_png is not null then jsonb_build_object('ink', m.ink_png) else '{}'::jsonb end order by m.at, m.id), '[]'::jsonb) from public.offer_sign_marks_live m where m.signing_id = g.id)
    ) order by r.doc_round), '[]'::jsonb)
  from public.offer_rounds r join public.offer_signings g on g.id = r.signing_id where r.document_id = p_document and r.doc_round <= p_upto $$;
-- 026's material for the locked copy, each mark with its ink, and each signer's ID check in person (029)
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
        'places', (select count(*) from public.offer_sign_required(g.id, s.position) x), 'id_checked_at', (select max(e.at) from public.offer_events e where e.offer_id = g.offer_id and e.kind = 'sign_id_checked' and e.detail->>'signer_id' = s.id::text), 'no_id_check_at', (select max(e.at) from public.offer_events e where e.offer_id = g.offer_id and e.kind = 'sign_no_id_check' and e.detail->>'signer_id' = s.id::text)) order by s.position) from public.offer_signers s where s.signing_id = g.id and s.void_at is null),
    'taps', (select coalesce(jsonb_agg(jsonb_build_object('place_id', t.place_id, 'signer', s.position, 'at', t.at) order by t.id), '[]'::jsonb) from public.offer_sign_taps_live t join public.offer_signers s on s.id = t.signer_id where t.signing_id = g.id),
    'marks', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'page', m.page, 'geometry', m.geometry, 'target', m.target, 'by', m.by_name, 'at', m.at,
        'reviewed_at', (select min(r.at) from public.offer_sign_reviews_live r where r.signing_id = g.id and r.kind = 'review' and m.id = any (r.marks))) || case when m.ink_png is not null then jsonb_build_object('ink', m.ink_png) else '{}'::jsonb end order by m.at, m.id), '[]'::jsonb) from public.offer_sign_marks_live m where m.signing_id = g.id),
    'replaced', (select coalesce(jsonb_agg(jsonb_build_object('number', dd.number, 'at', x.replaced_at) order by x.replaced_at), '[]'::jsonb) from public.offer_signings x join public.offer_drafts dd on dd.id = x.draft_id where x.offer_id = g.offer_id and x.status = 'replaced'),
    'made_at', now());
end $$;
-- 026's state for a link signer: the round's marks in every round now (Round 1's too, as Tim's screen shows them), each with its ink
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
      'marks', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'page', m.page, 'geometry', m.geometry, 'target', m.target, 'by', m.by_name, 'at', m.at, 'mine', m.signer_id = s.id) || case when m.ink_png is not null then jsonb_build_object('ink', m.ink_png) else '{}'::jsonb end order by m.at, m.id), '[]'::jsonb) from public.offer_sign_marks_live m where m.signing_id = g.id),
      'places', (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(g.places) e where (e->>'signer')::int = s.position
        union all select e from public.offer_sign_reviews_live r, jsonb_array_elements(r.places) e where r.signing_id = g.id and (e->>'signer')::int = s.position) z),
      'side_places', case when g.round_no > 1 then (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(g.places) e union all select e from public.offer_sign_reviews_live r, jsonb_array_elements(r.places) e where r.signing_id = g.id) z) else '[]'::jsonb end,
      -- going back to the last sealed round: offered only after a freeze on this round was lifted (Tim, 26 November 2026); 0 = nothing sealed yet
      'revert', case when public.offer_revert_offered(g) then jsonb_build_object('round', g.round_no - 1) end),
    'taps', (select coalesce(jsonb_agg(t.place_id order by t.id), '[]'::jsonb) from public.offer_sign_taps_live t where t.signer_id = s.id));
end $$;
-- 026's lock: a signer's own initials, name or signature isn't counted as a change
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
  select count(*) into chg from public.offer_sign_marks_live where signing_id = g.id and not public.offer_own_kind(kind);   -- 029: a signer's own initials, name or signature isn't a change
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
-- 026's presentation: nobody initials another signer's own initials, name or signature
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
  for m in select k.id from public.offer_sign_marks_live k where k.signing_id = last.signing_id and not public.offer_own_kind(k.kind) loop   -- 029: nobody initials another's own mark
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
-- 026's agreed terms: the changes, not a signer's own marks
create or replace function public.offer_agreed_terms(p_document uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('price', d.details->'price', 'settlement', d.details->'settlement', 'conditions', d.details->'conditions', 'kiwisaver', d.details->'kiwisaver', 'lawyer_approval', d.details->'lawyer_approval',
    'as_drafted', coalesce((select jsonb_object_agg(x->>'id', coalesce(x->'text', x->'value')) from jsonb_array_elements(d.placed) x where x->>'id' in ('price', 'deposit', 'settlement', 'purchaser') or x->>'id' ~ '^[cd]_'), '{}'::jsonb),
    'deposit_printed', (select e->>'printed' from public.offer_blank_maps bm, jsonb_array_elements(bm.places) e where bm.id = d.map_id and e->>'id' = 'deposit' limit 1),
    'further_terms', (select x->'terms' from jsonb_array_elements(d.placed) x where x->>'id' = 'further_terms' limit 1),
    'changes', coalesce((select jsonb_agg(jsonb_build_object('round', g.round_no, 'side', g.side, 'kind', m.kind, 'page', m.page, 'text', m.geometry->>'text', 'by', m.by_name, 'at', m.at) order by g.round_no, m.at, m.id)
      from public.offer_sign_marks_live m join public.offer_signings g on g.id = m.signing_id where g.id in (select r.signing_id from public.offer_rounds r where r.document_id = p_document) and not public.offer_own_kind(m.kind)), '[]'::jsonb),
    'note', 'Where a change made in the negotiation alters a term above, the change governs. Read with the signed rounds.')
  from public.offer_documents doc join public.offer_drafts d on d.id = doc.draft_id where doc.id = p_document $$;
-- 026's Round 1 mark on Tim's screen; the new kinds go to offer_sign_do_mark
create or replace function public.agent_signing_mark(p_signer uuid, p_kind text, p_page int, p_geometry jsonb, p_target uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); s public.offer_signers; g public.offer_signings; t public.offer_sign_marks; mid uuid; w numeric; h numeric; why text;
begin
  perform public.offer_lock_by_signer(p_signer);   -- lock order: the offer, then the signing, then the signer
  s := public.offer_sign_person(p_signer);
  -- 029: typed words and a signer's own initials, name or signature (any round for their own; Round 1 for typed words)
  if coalesce(p_kind, '') in ('insert', 'own_initials', 'own_name', 'own_signature') then
    if p_target is not null then raise exception 'Only a reinstatement points at another mark'; end if;
    return public.offer_sign_do_mark(p_signer, p_kind, p_page, p_geometry, null, null, false); end if;
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
-- 026's re-approval of Round 1 marks
create or replace function public.agent_signing_review(p_signing uuid, p_places jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); g public.offer_signings; ms uuid[]; need uuid[]; n int; x jsonb; why text; reopened int;
begin
  perform public.offer_lock_by_signing(p_signing);   -- lock order: the offer, then the signing, then the signer
  select * into g from public.offer_signings where id = p_signing for update; if g.id is null then raise exception 'No such signing'; end if;
  if g.status <> 'held' then raise exception 'Nothing is waiting for you to check'; end if;
  why := public.offer_sign_current(g); if why is not null then raise exception '%', why; end if;
  select coalesce(array_agg(m.id order by m.at), '{}') into ms from public.offer_sign_marks_live m where m.signing_id = g.id and not exists (select 1 from public.offer_sign_reviews_live r where r.signing_id = g.id and m.id = any (r.marks));
  -- 029: a signer's own initials, name or signature is checked by Tim like every mark, but nobody else initials it
  select coalesce(array_agg(m.id order by m.at), '{}') into need from public.offer_sign_marks_live m where m.id = any (ms) and not public.offer_own_kind(m.kind);
  select count(*) into n from public.offer_signers where signing_id = g.id;
  if not public.offer_sign_places_ok(p_places, g.pages, n, false) then raise exception 'Please check the places for the initials'; end if;
  if jsonb_array_length(p_places) <> coalesce(array_length(need, 1), 0) * n then raise exception 'Each purchaser initials each mark once'; end if;
  for x in select * from jsonb_array_elements(p_places) loop
    if x->>'why' <> 'mark' or x->>'kind' <> 'initial' or (x->>'ref')::uuid is distinct from (select m from unnest(need) m where m = (x->>'ref')::uuid) or x->>'id' <> ('mark:' || (x->>'ref') || ':s' || (x->>'signer')) then raise exception 'Each purchaser initials each mark once'; end if;
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
-- 026's drawing step: a drawing again is also refused while the signer's own initials or signature stand (029)
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
  -- 029: nor while their own initials or signature stand on the page (start the turn again first: that undoes them), so a round never
  -- shows two drawings for one person
  if exists (select 1 from public.offer_sign_marks_live m where m.signer_id = s.id and m.kind in ('own_initials', 'own_signature')) then raise exception 'Your signature and initials are kept as you first used them'; end if;
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
-- and whoever writes a drawing again (the service role included): never while that signer's own initials or signature stand
create or replace function public.guard_offer_redraw_own() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.offer_sign_marks_live m where m.signer_id = new.signer_id and m.kind in ('own_initials', 'own_signature')) then
    raise exception 'Your signature and initials are kept as you first used them'; end if;
  return new;
end $$;
create trigger offer_sign_redraws_own before insert on public.offer_sign_redraws for each row execute function public.guard_offer_redraw_own();

-- ───── identity (Tim, 26 November 2026: "Separate emails matter for signing at a distance. If on a device, I will verify that each
-- signed separately, but will only do so with their identification logged.") ─────
-- On Tim's device a signer's turn finishes only once Tim has logged the photo ID he checked for that person (its type, never its number)
-- and ticked that he checked it and watched them sign; the time is the server's. By an emailed link, each signer has their own email
-- (offers: 023 and 024 already refuse two signers with one email; the agency agreement, its variations, notices and forms: below).
-- the photo ID types Tim can log (023's list, without "known to Tim personally": an ID is now always checked in person)
create or replace function public.offer_photo_id_ok(t text) returns boolean language sql immutable as $$
  select coalesce(t, '') in ('nz_driver_licence', 'passport', 'nz_firearms_licence', 'kiwi_access_card', 'other_photo_id') $$;
-- offers in person: Tim logs the ID he checked and ticks that he checked it and watched them sign; then the turn finishes (023's finish).
-- Or, his explicit choice after a warning (Tim, 26 November 2026, 17:57): p_id_type 'no_id_warned' with p_checked true (he confirmed
-- the warning): the turn finishes, and the record says plainly that it was signed in person without an identity check. An empty or
-- missing choice is refused.
create or replace function public.agent_signing_finish_checked(p_signer uuid, p_id_type text, p_checked boolean, p_ua text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); s public.offer_signers; g public.offer_signings; r jsonb; none_ boolean := p_id_type = 'no_id_warned';
begin
  perform public.offer_lock_by_signer(p_signer);   -- lock order: the offer, then the signing, then the signer (as 023's finish)
  s := public.offer_sign_person(p_signer);
  if not none_ and not public.offer_photo_id_ok(p_id_type) then raise exception 'Choose the photo ID you checked for %', s.name; end if;
  if p_checked is not true then raise exception '%', case when none_ then 'Confirm that you are finishing for ' || s.name || ' without an ID check' else 'Tick that you checked ' || s.name || '''s ID and watched them sign' end; end if;
  select * into g from public.offer_signings where id = s.signing_id;
  r := public.offer_sign_do_finish(p_signer, p_ua, null, case when none_ then null else p_id_type end, 'Tim McGuire');
  perform set_config('offers.fn', 'on', true);
  if none_ then
    insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, me, 'sign_no_id_check',
      jsonb_build_object('signing_id', g.id, 'round', g.round_no, 'side', g.side, 'signer', s.position, 'signer_id', s.id, 'by', 'Tim McGuire', 'warned', true, 'note', 'Signed in person without an identity check'));
  else
    insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (g.property_id, g.offer_id, me, 'sign_id_checked',
      jsonb_build_object('signing_id', g.id, 'round', g.round_no, 'side', g.side, 'signer', s.position, 'signer_id', s.id, 'id_type', p_id_type, 'checked_by', 'Tim McGuire', 'watched', true));
  end if;
  perform set_config('offers.fn', '', true);
  return r;
end $$;
-- 023's in-person finish now asks for the ID check (the page uses agent_signing_finish_checked)
create or replace function public.agent_signing_finish(p_signer uuid, p_id_sighted text, p_ua text) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.offer_agent();
  raise exception 'Choose the photo ID you checked, and tick that you checked it and watched them sign';
end $$;
-- the agency agreement, its variations and notices (signed with it), and forms: one rule for every signature row, whoever writes it.
-- In person (Tim's device): the snapshot holds Tim's ID check: { type (a photo ID type), checked: true, by, at (within 15 minutes of
-- now), aml_file_id (optional: the AML file for this person, where the ID details are kept) } and nothing else, so no ID number is
-- ever stored here; or his explicit choice after a warning: { type: 'none', warned: true, by, at, note: 'Signed in person without an
-- identity check' }. An empty or missing choice is refused. By the signer's own link: no one else on the agreement has the same email.
create or replace function public.guard_signature_identity() returns trigger language plpgsql security definer set search_path = public as $$
declare idc jsonb := new.snapshot->'id_check'; em text;
begin
  if coalesce(new.signer_role, '') <> 'client' then return new; end if;
  if coalesce(new.snapshot->>'signing_method', '') ilike 'in person%' then
    if jsonb_typeof(idc) is distinct from 'object' or coalesce(idc->>'by', '') = '' or length(idc->>'by') > 120
       or not coalesce((public.offer_photo_id_ok(idc->>'type') and (idc->'checked') = 'true'::jsonb and not idc ? 'warned')
            or (idc->>'type' = 'none' and (idc->'warned') = 'true'::jsonb and idc->>'note' = 'Signed in person without an identity check' and not idc ? 'checked' and not idc ? 'aml_file_id'), false) then
      raise exception 'Choose the photo ID you checked for %, and tick that you checked it and watched them sign (or confirm finishing without an ID check)', new.signer_name; end if;
    if exists (select 1 from jsonb_object_keys(idc) k where k not in ('type', 'checked', 'by', 'at', 'aml_file_id', 'warned', 'note')) then raise exception 'Only the ID type is kept here, never its number'; end if;
    begin if abs(extract(epoch from ((idc->>'at')::timestamptz - now()))) > 900 then raise exception 'x'; end if;
    exception when others then raise exception 'Please record the ID check again, at the time you check it'; end;
    if idc ? 'aml_file_id' and not exists (select 1 from public.aml_files f where f.id::text = idc->>'aml_file_id' and f.person_id = new.person_id) then
      raise exception 'That AML file isn''t this person''s'; end if;
  else
    select lower(trim(email)) into em from public.agreement_people where id = new.person_id;
    if em is null or em = '' or exists (select 1 from public.agreement_people x where x.agreement_id = new.agreement_id and x.id <> new.person_id and lower(trim(x.email)) = em) then
      raise exception 'Each person signs from their own email. Ask Tim to give each person their own email, or sign in person with him'; end if;
  end if;
  return new;
end $$;
create trigger signatures_identity before insert on public.signatures for each row execute function public.guard_signature_identity();
create trigger variation_signatures_identity before insert on public.variation_signatures for each row execute function public.guard_signature_identity();
create trigger form_signatures_identity before insert on public.form_signatures for each row execute function public.guard_signature_identity();


-- ───── execute rights ─────
revoke execute on function public.guard_offer_mark_place(), public.guard_offer_redraw_own(), public.guard_offer_signing_own_clear(), public.guard_offer_signing_chattels(), public.offer_hits_date(uuid, int, jsonb), public.offer_chattels_rect(uuid),
  public.offer_sign_do_mark(uuid, text, int, jsonb, uuid, text, boolean), public.offer_places_edits_ok(jsonb, jsonb, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.offer_sign_mark(text, text, text, text, int, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.offer_sign_mark(text, text, text, text, int, jsonb, uuid) to service_role;
revoke execute on function public.guard_signature_identity() from public, anon, authenticated;
revoke execute on function public.agent_signing_finish_checked(uuid, text, boolean, text) from public, anon;
grant execute on function public.agent_signing_finish_checked(uuid, text, boolean, text) to authenticated;
revoke execute on function public.agent_signing_release_edited(uuid, text, jsonb, jsonb, int[], jsonb), public.agent_round_present_edited(uuid, text, jsonb, boolean, text, boolean, jsonb) from public, anon;
grant execute on function public.agent_signing_release_edited(uuid, text, jsonb, jsonb, int[], jsonb), public.agent_round_present_edited(uuid, text, jsonb, boolean, text, boolean, jsonb) to authenticated;

-- Offers phase 2: drafting each offer onto the REINZ blank Tim loads for the listing. Additive only. Builds on 016 (photos and
-- documents, property_documents, repo_kinds, storage bucket property-files) and 018 (the offer form, offer_events, offer_clauses).
--
-- What it adds:
--   * a kind of item, 'REINZ agreement blank' (agency papers, never shared, never exported). The PDF itself is filed like any other
--     item (agent_repo_add) and is never changed: no row is ever deleted (016) and nothing here can change its kind or share it.
--   * offer_blanks: one row per blank Tim loads, with the file's SHA-256, its pages and page sizes, and the edition printed on it.
--     Loading a new blank keeps the old one. Only an edition in the checked list (offer_edition_ok) can be drafted on.
--   * offer_blank_maps: the places to write on a blank (found from the printed labels, proposed by the AI, or added by Tim), as
--     versions: every save is a new row; nothing is changed. The newest approved version is the one drafts use.
--   * offer_blank_reads: what the AI proposed from the pack's text (written by the offer-draft edge function). Data only.
--   * offer_terms and offer_term_changes: Tim's clause library (his standard further terms and the rules that apply them). The REINZ
--     and TLANZ form text is never held: printed clauses are referred to by number only.
--   * offer_drafts and offer_draft_approvals: each drafted PDF (its own SHA-256, the blank's fingerprint, the map used, the offer as
--     it stood, what was placed and what still needs Tim), and Tim's approval of one, with the fingerprint he approved.
--   * offer_lawyer_lookups: the purchaser's lawyer's public contact details found by the lookup, each with its source, for Tim's tick.
-- Agent only throughout: vendors and anon have no policy and no function, so they see nothing. Records can't be changed, removed
-- or emptied. Nothing here touches agreements, signatures, signed records or their triggers.

-- ───── the kind of item ─────
insert into public.repo_kinds (kind, folder, position, shareable, exportable) values ('REINZ agreement blank', 'agency', 215, false, false);
-- a blank keeps its kind, is never shared, and no other item becomes one later
create or replace function public.guard_blank_document() returns trigger language plpgsql set search_path = public as $$
begin
  if old.kind = 'REINZ agreement blank' and (new.kind is distinct from old.kind or new.shared_at is not null) then raise exception 'An agreement blank stays an agreement blank, and is never shared'; end if;
  if new.kind = 'REINZ agreement blank' and old.kind is distinct from new.kind then raise exception 'Load an agreement blank from the property''s Offers tile'; end if;
  return new;
end $$;
create trigger guard_blank_document before update on public.property_documents for each row execute function public.guard_blank_document();

-- ───── the checked editions (the same list as EDITIONS in src/draft-core.js) ─────
create or replace function public.offer_edition_ok(p_edition text) returns boolean language sql immutable as $$
  select coalesce(p_edition, '') = any (array['Eleventh Edition 2022 (4)']) $$;

-- ───── tables ─────
create table public.offer_blanks (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  document_id uuid not null unique references public.property_documents(id),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint not null check (size_bytes > 0),
  file_name text not null check (length(file_name) between 1 and 200),
  pages integer not null check (pages between 1 and 400),
  sizes jsonb not null check (jsonb_typeof(sizes) = 'array'),   -- [[width, height], ...] in PDF points, one per page
  edition text check (edition is null or length(edition) <= 80),
  edition_checked boolean not null,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index on public.offer_blanks (property_id, created_at desc);
create table public.offer_blank_maps (
  id uuid primary key default gen_random_uuid(),
  blank_id uuid not null references public.offer_blanks(id),
  version integer not null check (version >= 1),
  places jsonb not null check (jsonb_typeof(places) = 'array'),          -- [{id, key, kind, page, x, y, w, h, label, source, ...}]
  proposals jsonb not null default '[]'::jsonb check (jsonb_typeof(proposals) = 'array'),   -- the AI's proposals and what Tim did with each
  chattels jsonb not null default '[]'::jsonb check (jsonb_typeof(chattels) = 'array'),     -- the chattels list Tim ticked
  notes jsonb not null default '[]'::jsonb check (jsonb_typeof(notes) = 'array'),           -- unusual things about the pack, as Tim kept them
  missing jsonb not null default '[]'::jsonb check (jsonb_typeof(missing) = 'array'),       -- labels not found on this blank
  approved boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (blank_id, version)
);
create table public.offer_blank_reads (
  id bigserial primary key,
  blank_id uuid not null references public.offer_blanks(id),
  pages integer[] not null,
  model text not null,
  ok boolean not null,
  result jsonb not null default '{}'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index on public.offer_blank_reads (blank_id, created_at);
-- Tim's clause library. kind 'further_term': a numbered further term (wording from here, or from offer_clauses for his four
-- condition clauses; with no wording the draft shows a highlighted placeholder and never invents any). kind 'printed': a clause
-- already printed in the blank, referred to by its number (never its text), which a rule keeps or strikes.
create table public.offer_terms (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  title text not null check (length(title) between 2 and 200),
  kind text not null check (kind in ('further_term', 'printed')),
  clause text check (clause is null or clause ~ '^[0-9]{1,2}(\.[0-9]{1,2}){0,2}$'),
  wording text check (wording is null or length(wording) <= 4000),
  wording_from text check (wording_from is null or wording_from in ('electrical', 'technical', 'sale', 'sdd', 'custom')),
  rule jsonb not null default '{}'::jsonb check (jsonb_typeof(rule) = 'object'),
  position integer not null default 100,
  active boolean not null default true,
  updated_by text,
  updated_at timestamptz not null default now()
);
create table public.offer_term_changes (
  id bigserial primary key,
  key text not null,
  before jsonb, after jsonb,
  actor text not null,
  at timestamptz not null default now()
);
insert into public.offer_terms (key, title, kind, clause, wording, wording_from, rule, position) values
  ('deposit_nzret', 'Deposit held by NZ Real Estate Trust (printed clause 21.2)', 'printed', '21.2', null, null, '{"when": {"kiwisaver": false}, "strike_when_unused": false}', 10),
  ('deposit_kiwisaver', 'Whole deposit to the vendor''s lawyer''s trust account when KiwiSaver funds it (printed clause 21.3)', 'printed', '21.3', null, null, '{"when": {"kiwisaver": true}, "strike_when_unused": false}', 11),
  ('lawyer_approval', 'Lawyer''s approval (printed clause 22.0): struck through when not chosen', 'printed', '22.0', null, null, '{"when": {"condition": "lawyer"}, "strike_when_unused": true}', 12),
  ('electrical', 'Electrical report', 'further_term', null, null, 'electrical', '{"when": {"condition": "electrical"}}', 20),
  ('technical', 'Specified technical report', 'further_term', null, null, 'technical', '{"when": {"condition": "technical"}}', 21),
  ('sale', 'Sale of another property', 'further_term', null, null, 'sale', '{"when": {"condition": "sale"}}', 22),
  ('sdd', 'Specified Due Diligence', 'further_term', null, null, 'sdd', '{"when": {"condition": "sdd"}}', 23),
  ('custom', 'The buyer''s own condition (only once you tick its wording)', 'further_term', null, null, 'custom', '{"when": {"condition": "custom"}}', 24),
  ('chattels', 'Chattels to add or leave out', 'further_term', null, null, null, '{"when": {"chattels": true}, "where": "schedule"}', 30);
create table public.offer_drafts (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.property_offers(id),
  property_id uuid not null references public.properties(id),
  number integer not null check (number >= 1),
  blank_id uuid not null references public.offer_blanks(id),
  blank_sha256 text not null check (blank_sha256 ~ '^[0-9a-f]{64}$'),
  map_id uuid not null references public.offer_blank_maps(id),
  details jsonb not null,                      -- the offer as it stood (from the server, never the page)
  edits jsonb not null default '{}'::jsonb,    -- Tim's changes on the review screen
  placed jsonb not null check (jsonb_typeof(placed) = 'array'),   -- everything put on the blank
  needs jsonb not null check (jsonb_typeof(needs) = 'array'),     -- what still needs Tim (placeholders and checks)
  path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint not null check (size_bytes > 0),
  note text check (note is null or length(note) <= 500),
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (offer_id, number)
);
create index on public.offer_drafts (offer_id, number desc);
create table public.offer_draft_approvals (
  id bigserial primary key,
  draft_id uuid not null unique references public.offer_drafts(id),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  approved_by text not null,
  approved_at timestamptz not null default now()
);
create table public.offer_lawyer_lookups (
  id bigserial primary key,
  offer_id uuid not null references public.property_offers(id),
  firm text, person text,
  model text,
  ok boolean not null,
  result jsonb not null default '{}'::jsonb,   -- {values: [{key, value, kind, source_url, source_title}], manual: [...], reason}
  created_by text not null,
  created_at timestamptz not null default now()
);
create index on public.offer_lawyer_lookups (offer_id, created_at desc);

-- ───── records stay as made ─────
create or replace function public.guard_offer_record() returns trigger language plpgsql set search_path = public as $$
begin raise exception 'This record is kept exactly as it was made'; end $$;
create trigger offer_blanks_fixed before update or delete on public.offer_blanks for each row execute function public.guard_offer_record();
create trigger offer_blank_maps_fixed before update or delete on public.offer_blank_maps for each row execute function public.guard_offer_record();
create trigger offer_blank_reads_fixed before update or delete on public.offer_blank_reads for each row execute function public.guard_offer_record();
create trigger offer_drafts_fixed before update or delete on public.offer_drafts for each row execute function public.guard_offer_record();
create trigger offer_draft_approvals_fixed before update or delete on public.offer_draft_approvals for each row execute function public.guard_offer_record();
create trigger offer_lawyer_lookups_fixed before update or delete on public.offer_lawyer_lookups for each row execute function public.guard_offer_record();
create trigger offer_term_changes_fixed before update or delete on public.offer_term_changes for each row execute function public.guard_offer_record();
-- library entries are switched off, never removed
create or replace function public.guard_offer_term() returns trigger language plpgsql set search_path = public as $$
begin raise exception 'A clause is switched off, never removed'; end $$;
create trigger offer_terms_kept before delete on public.offer_terms for each row execute function public.guard_offer_term();
create trigger offer_blanks_no_truncate before truncate on public.offer_blanks for each statement execute function public.guard_offer_truncate();
create trigger offer_blank_maps_no_truncate before truncate on public.offer_blank_maps for each statement execute function public.guard_offer_truncate();
create trigger offer_blank_reads_no_truncate before truncate on public.offer_blank_reads for each statement execute function public.guard_offer_truncate();
create trigger offer_drafts_no_truncate before truncate on public.offer_drafts for each statement execute function public.guard_offer_truncate();
create trigger offer_draft_approvals_no_truncate before truncate on public.offer_draft_approvals for each statement execute function public.guard_offer_truncate();
create trigger offer_lawyer_lookups_no_truncate before truncate on public.offer_lawyer_lookups for each statement execute function public.guard_offer_truncate();
create trigger offer_terms_no_truncate before truncate on public.offer_terms for each statement execute function public.guard_offer_truncate();
create trigger offer_term_changes_no_truncate before truncate on public.offer_term_changes for each statement execute function public.guard_offer_truncate();

-- ───── who sees what: Tim only ─────
alter table public.offer_blanks enable row level security;
alter table public.offer_blank_maps enable row level security;
alter table public.offer_blank_reads enable row level security;
alter table public.offer_terms enable row level security;
alter table public.offer_term_changes enable row level security;
alter table public.offer_drafts enable row level security;
alter table public.offer_draft_approvals enable row level security;
alter table public.offer_lawyer_lookups enable row level security;
create policy ob_agent_read on public.offer_blanks for select using (public.is_agent());
create policy obm_agent_read on public.offer_blank_maps for select using (public.is_agent());
create policy obr_agent_read on public.offer_blank_reads for select using (public.is_agent());
create policy ot_agent_read on public.offer_terms for select using (public.is_agent());
create policy otc_agent_read on public.offer_term_changes for select using (public.is_agent());
create policy od_agent_read on public.offer_drafts for select using (public.is_agent());
create policy oda_agent_read on public.offer_draft_approvals for select using (public.is_agent());
create policy oll_agent_read on public.offer_lawyer_lookups for select using (public.is_agent());
revoke all on public.offer_blanks, public.offer_blank_maps, public.offer_blank_reads, public.offer_terms, public.offer_term_changes, public.offer_drafts, public.offer_draft_approvals, public.offer_lawyer_lookups from anon;
revoke insert, update, delete, truncate, references, trigger on public.offer_blanks, public.offer_blank_maps, public.offer_blank_reads, public.offer_terms, public.offer_term_changes, public.offer_drafts, public.offer_draft_approvals, public.offer_lawyer_lookups from authenticated;
revoke all on sequence public.offer_blank_reads_id_seq, public.offer_term_changes_id_seq, public.offer_draft_approvals_id_seq, public.offer_lawyer_lookups_id_seq from anon, authenticated;

-- ───── helpers (internal) ─────
-- a list of objects from the page: an array, each item an object, at most n, the whole at most so many characters
create or replace function public.offer_json_list(p jsonb, n int, chars int, what text) returns jsonb language plpgsql immutable as $$
begin
  if p is null or jsonb_typeof(p) = 'null' then return '[]'::jsonb; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > n or length(p::text) > chars then raise exception 'Please check the %', what; end if;
  if exists (select 1 from jsonb_array_elements(p) x where jsonb_typeof(x) <> 'object') then raise exception 'Please check the %', what; end if;
  return p;
end $$;
-- a number from a place, within a range
create or replace function public.offer_num_ok(v jsonb, lo numeric, hi numeric) returns boolean language sql immutable as $$
  select jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric between lo and hi $$;
-- every place: an id, a key, a kind from the list, a page on the blank, and a box that sits on that page
create or replace function public.offer_places_ok(p_places jsonb, p_sizes jsonb) returns boolean language plpgsql immutable as $$
declare x jsonb; pg int; w numeric; h numeric;
begin
  for x in select * from jsonb_array_elements(p_places) loop
    if coalesce(x->>'id', '') !~ '^[A-Za-z0-9_.:-]{1,60}$' or coalesce(x->>'key', '') !~ '^[a-z][a-z0-9_]{0,40}$' then return false; end if;
    if coalesce(x->>'kind', '') not in ('text', 'area', 'date', 'yesno', 'strike', 'block', 'signature', 'initial', 'witness', 'name', 'ack', 'never') then return false; end if;
    if not public.offer_num_ok(x->'page', 1, jsonb_array_length(p_sizes)) then return false; end if;
    pg := (x->>'page')::int; w := (p_sizes->(pg - 1)->>0)::numeric; h := (p_sizes->(pg - 1)->>1)::numeric;
    if not (public.offer_num_ok(x->'x', -1, w + 1) and public.offer_num_ok(x->'y', -1, h + 1) and public.offer_num_ok(x->'w', 0, w + 1) and public.offer_num_ok(x->'h', 0, h + 1)) then return false; end if;
    if length(coalesce(x->>'label', '')) > 200 or length(coalesce(x->>'reason', '')) > 400 or length(x::text) > 6000 then return false; end if;
  end loop;
  return true;
end $$;

-- ───── Tim's side ─────
-- Register a blank Tim has filed with agent_repo_add (kind 'REINZ agreement blank'). The fingerprint, size and name come from the
-- filed item, never from the page; the page gives what pdf.js read from the file: the page count, page sizes and the edition.
create or replace function public.agent_blank_add(p_document uuid, p_pages int, p_sizes jsonb, p_edition text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); d public.property_documents; b public.offer_blanks; ed text := nullif(trim(coalesce(p_edition, '')), '');
begin
  select * into d from public.property_documents where id = p_document for update;
  if d.id is null then raise exception 'That file isn''t on a property file'; end if;
  if d.kind <> 'REINZ agreement blank' or d.bucket <> 'property-files' or d.mime_type <> 'application/pdf' then raise exception 'Only a PDF filed as an agreement blank can be used'; end if;
  if d.archived_at is not null then raise exception 'That file has been removed'; end if;
  select * into b from public.offer_blanks where document_id = p_document;
  if b.id is not null then return jsonb_build_object('id', b.id, 'existing', true, 'edition_checked', b.edition_checked); end if;
  if p_pages is null or p_pages < 1 or p_pages > 400 then raise exception 'Please check the page count'; end if;
  if jsonb_typeof(p_sizes) is distinct from 'array' or jsonb_array_length(p_sizes) <> p_pages
     or exists (select 1 from jsonb_array_elements(p_sizes) s where jsonb_typeof(s) <> 'array' or jsonb_array_length(s) <> 2 or not public.offer_num_ok(s->0, 50, 5000) or not public.offer_num_ok(s->1, 50, 5000)) then
    raise exception 'Please check the page sizes';
  end if;
  if ed is not null and length(ed) > 80 then ed := left(ed, 80); end if;
  insert into public.offer_blanks (property_id, document_id, sha256, size_bytes, file_name, pages, sizes, edition, edition_checked, created_by)
  values (d.property_id, d.id, d.sha256, d.size_bytes, d.name, p_pages, p_sizes, ed, public.offer_edition_ok(ed), me) returning * into b;
  insert into public.offer_events (property_id, actor, kind, detail) values (d.property_id, me, 'blank_loaded', jsonb_build_object('blank_id', b.id, 'sha256', b.sha256, 'edition', ed, 'edition_checked', b.edition_checked, 'pages', p_pages));
  return jsonb_build_object('id', b.id, 'existing', false, 'edition_checked', b.edition_checked);
end $$;

-- Save the places on a blank as a new version (nothing earlier changes). p_approve: this version is the one drafts use. Approving
-- also sets the chattels list buyers see on the offer form to the list Tim ticked (recorded, as agent_offer_chattels does).
create or replace function public.agent_blank_map_save(p_blank uuid, p_places jsonb, p_proposals jsonb, p_chattels jsonb, p_notes jsonb, p_missing jsonb, p_approve boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); b public.offer_blanks; v int; mid uuid; pl jsonb; pr jsonb; ch jsonb := '[]'::jsonb; nt jsonb; ms jsonb; x jsonb; t text;
begin
  select * into b from public.offer_blanks where id = p_blank; if b.id is null then raise exception 'No such blank'; end if;
  if not b.edition_checked then raise exception 'This edition of the agreement hasn''t been checked yet, so it can''t be mapped or drafted on'; end if;
  pl := public.offer_json_list(p_places, 400, 400000, 'places'); pr := public.offer_json_list(p_proposals, 400, 200000, 'proposals');
  nt := public.offer_json_list(p_notes, 60, 40000, 'notes');
  if not public.offer_places_ok(pl, b.sizes) then raise exception 'One of the places doesn''t sit on a page of this blank'; end if;
  if (select count(distinct e->>'id') from jsonb_array_elements(pl) e) <> jsonb_array_length(pl) then raise exception 'Two places have the same id'; end if;
  if jsonb_typeof(coalesce(p_chattels, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_chattels, '[]'::jsonb)) > 60 then raise exception 'Up to 60 chattels'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_chattels, '[]'::jsonb)) loop
    t := public.offer_txt(jsonb_build_object('x', x), 'x', 200, false, 'each chattel'); if t is not null then ch := ch || jsonb_build_array(t); end if;
  end loop;
  if jsonb_typeof(coalesce(p_missing, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_missing, '[]'::jsonb)) > 80 then raise exception 'Please check the missing labels'; end if;
  ms := coalesce(p_missing, '[]'::jsonb);
  if exists (select 1 from jsonb_array_elements(ms) m where jsonb_typeof(m) <> 'string' or length(m #>> '{}') > 60) then raise exception 'Please check the missing labels'; end if;
  perform 1 from public.offer_blanks where id = p_blank for update;   -- one save at a time per blank
  select coalesce(max(version), 0) + 1 into v from public.offer_blank_maps where blank_id = p_blank;
  insert into public.offer_blank_maps (blank_id, version, places, proposals, chattels, notes, missing, approved, created_by)
  values (p_blank, v, pl, pr, ch, nt, ms, coalesce(p_approve, false), me) returning id into mid;
  insert into public.offer_events (property_id, actor, kind, detail) values (b.property_id, me, case when p_approve then 'map_approved' else 'map_saved' end,
    jsonb_build_object('blank_id', b.id, 'sha256', b.sha256, 'map_id', mid, 'version', v, 'places', jsonb_array_length(pl),
      'ai_kept', (select count(*) from jsonb_array_elements(pr) e where e->>'decision' in ('kept', 'moved')), 'ai_deleted', (select count(*) from jsonb_array_elements(pr) e where e->>'decision' = 'deleted')));
  if p_approve and jsonb_array_length(ch) > 0 then perform public.agent_offer_chattels(b.property_id, ch); end if;
  return jsonb_build_object('id', mid, 'version', v, 'approved', coalesce(p_approve, false));
end $$;

-- An entry in the clause library (a new key adds one). Wording is Tim's own; REINZ form text never goes here.
create or replace function public.agent_offer_term(p_key text, p_title text, p_wording text, p_rule jsonb, p_position int, p_active boolean) returns void language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); o public.offer_terms; w text := nullif(trim(coalesce(p_wording, '')), ''); ti text := nullif(trim(coalesce(p_title, '')), ''); r jsonb := coalesce(p_rule, '{}'::jsonb); n public.offer_terms;
begin
  if coalesce(p_key, '') !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception 'A key is lower-case letters, digits and underscores'; end if;
  if jsonb_typeof(r) <> 'object' or length(r::text) > 2000 then raise exception 'Please check the rule'; end if;
  if r ? 'when' and jsonb_typeof(r->'when') <> 'object' then raise exception 'Please check the rule'; end if;
  if exists (select 1 from jsonb_object_keys(coalesce(r->'when', '{}'::jsonb)) k where k not in ('always', 'kiwisaver', 'condition', 'no_condition', 'lawyer_approval', 'gst_registered', 'entity', 'nominee', 'chattels', 'settlement')) then raise exception 'That rule uses something the drafting doesn''t know'; end if;
  if w is not null and length(w) > 4000 then raise exception 'That wording is too long (4,000 characters at most)'; end if;
  select * into o from public.offer_terms where key = p_key for update;
  if o.key is null then
    if ti is null or length(ti) > 200 then raise exception 'Give the clause a title'; end if;
    insert into public.offer_terms (key, title, kind, wording, rule, position, active, updated_by) values (p_key, ti, 'further_term', w, r, coalesce(p_position, 100), coalesce(p_active, true), me) returning * into n;
  else
    if o.wording_from is not null and w is not null then raise exception 'This clause''s wording is kept with your condition wording (Offers tile, Link and settings)'; end if;
    if o.kind = 'printed' and w is not null then raise exception 'A printed clause is referred to by its number; it has no wording here'; end if;
    update public.offer_terms set title = coalesce(ti, o.title), wording = case when o.kind = 'printed' or o.wording_from is not null then null else w end, rule = r,
      position = coalesce(p_position, o.position), active = coalesce(p_active, o.active), updated_by = me, updated_at = now() where key = p_key returning * into n;
  end if;
  insert into public.offer_term_changes (key, before, after, actor) values (p_key, to_jsonb(o), to_jsonb(n), me);
end $$;

-- File a drafted PDF for an offer (the browser drafts it onto the blank and uploads it first). The offer's details, the blank's
-- fingerprint and the map come from the server; the PDF's own fingerprint and size are checked against the stored file.
create or replace function public.agent_draft_add(p_offer uuid, p_map uuid, p_path text, p_sha256 text, p_size bigint, p_placed jsonb, p_needs jsonb, p_edits jsonb, p_note text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); o public.property_offers; m public.offer_blank_maps; b public.offer_blanks; n int; did uuid; obj jsonb; newest uuid;
begin
  select * into o from public.property_offers where id = p_offer for update; if o.id is null or o.source = 'manual' or o.details is null then raise exception 'No such offer'; end if;
  select * into m from public.offer_blank_maps where id = p_map; if m.id is null then raise exception 'No such map'; end if;
  if not m.approved then raise exception 'Approve the places on the blank first'; end if;
  select * into b from public.offer_blanks where id = m.blank_id;
  if b.property_id <> o.property_id then raise exception 'That blank is for another property'; end if;
  if not b.edition_checked then raise exception 'This edition of the agreement hasn''t been checked yet'; end if;
  select id into newest from public.offer_blank_maps where blank_id = b.id and approved order by version desc limit 1;
  if newest <> m.id then raise exception 'A newer version of the places on this blank has been approved. Draft again'; end if;
  if coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$' then raise exception 'The draft needs its fingerprint'; end if;
  if p_sha256 = b.sha256 then raise exception 'That is the blank itself, not a draft'; end if;
  if coalesce(p_path, '') !~ ('^properties/' || o.property_id || '/docs/offer-draft-' || o.id || '-[0-9]{1,4}-[0-9a-f]{12}\.pdf$') then raise exception 'A draft is stored at its own place'; end if;
  if p_size is null or p_size <= 0 or p_size > 26214400 then raise exception 'Files can be up to 25 MB'; end if;
  obj := public.repo_object(p_path);
  if obj is null then raise exception 'The draft hasn''t arrived yet'; end if;
  if (obj->>'size')::bigint is distinct from p_size or (obj->>'mime') is distinct from 'application/pdf' then raise exception 'The stored draft doesn''t match'; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'The note is too long'; end if;
  select coalesce(max(number), 0) + 1 into n from public.offer_drafts where offer_id = p_offer;
  insert into public.offer_drafts (offer_id, property_id, number, blank_id, blank_sha256, map_id, details, edits, placed, needs, path, sha256, size_bytes, note, created_by)
  values (p_offer, o.property_id, n, b.id, b.sha256, m.id, o.details, coalesce(nullif(p_edits, 'null'::jsonb), '{}'::jsonb), public.offer_json_list(p_placed, 600, 600000, 'places filled'), public.offer_json_list(p_needs, 200, 100000, 'items that need you'),
    p_path, p_sha256, p_size, nullif(trim(coalesce(p_note, '')), ''), me) returning id into did;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, o.id, me, 'drafted',
    jsonb_build_object('draft_id', did, 'number', n, 'sha256', p_sha256, 'blank_sha256', b.sha256, 'map_version', m.version, 'needs', jsonb_array_length(coalesce(p_needs, '[]'::jsonb)), 'note', nullif(trim(coalesce(p_note, '')), '')));
  return jsonb_build_object('id', did, 'number', n);
end $$;

-- Tim approves a draft: the newest for the offer, by the fingerprint his screen showed, with nothing left that blocks it.
create or replace function public.agent_draft_approve(p_draft uuid, p_sha256 text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); d public.offer_drafts; latest int;
begin
  select * into d from public.offer_drafts where id = p_draft; if d.id is null then raise exception 'No such draft'; end if;
  if p_sha256 is distinct from d.sha256 then raise exception 'That isn''t the draft on your screen. Open it again'; end if;
  select max(number) into latest from public.offer_drafts where offer_id = d.offer_id;
  if d.number <> latest then raise exception 'There is a newer draft of this offer. Approve that one'; end if;
  if exists (select 1 from jsonb_array_elements(d.needs) e where (e->>'blocking')::boolean is true) then raise exception 'Some places still need you. Fill them in and draft again'; end if;
  if exists (select 1 from public.offer_draft_approvals where draft_id = p_draft) then return jsonb_build_object('ok', true, 'existing', true); end if;
  insert into public.offer_draft_approvals (draft_id, sha256, approved_by) values (d.id, d.sha256, me);
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (d.property_id, d.offer_id, me, 'draft_approved', jsonb_build_object('draft_id', d.id, 'number', d.number, 'sha256', d.sha256, 'blank_sha256', d.blank_sha256));
  return jsonb_build_object('ok', true, 'existing', false);
end $$;

-- Tim ticks values the lawyer lookup found. The values come from the stored lookup (never the page) and go into the offer's
-- lawyer details, recorded with their sources like any correction. The buyer's own contact details are untouched.
create or replace function public.agent_lawyer_use(p_lookup bigint, p_keys text[]) returns jsonb language plpgsql security definer set search_path = public as $$
declare me text := public.offer_agent(); l public.offer_lawyer_lookups; o public.property_offers; law jsonb; v jsonb; used jsonb := '[]'::jsonb; d jsonb; k text;
begin
  select * into l from public.offer_lawyer_lookups where id = p_lookup; if l.id is null or not l.ok then raise exception 'No such lookup'; end if;
  if l.created_at < now() - interval '30 days' then raise exception 'That lookup is more than 30 days old. Look again first'; end if;
  select * into o from public.property_offers where id = l.offer_id for update; if o.id is null or o.details is null then raise exception 'No such offer'; end if;
  if p_keys is null or array_length(p_keys, 1) is null then raise exception 'Tick at least one'; end if;
  law := coalesce(o.details->'lawyer', '{}'::jsonb);
  foreach k in array p_keys loop
    v := null; select e into v from jsonb_array_elements(coalesce(l.result->'values', '[]'::jsonb)) e where e->>'id' = k limit 1;
    if v is null then raise exception 'That value isn''t in the lookup'; end if;
    if v->>'field' not in ('email', 'phone') then raise exception 'Only the lawyer''s email and phone are used'; end if;
    if v->>'field' = 'email' and not public.offer_email_ok(v->>'value') then raise exception 'That email doesn''t look right'; end if;
    if v->>'field' = 'phone' and not public.offer_phone_ok(v->>'value') then raise exception 'That phone number doesn''t look right'; end if;
    law := law || jsonb_build_object(v->>'field', case when v->>'field' = 'email' then lower(v->>'value') else v->>'value' end);
    used := used || jsonb_build_array(jsonb_build_object('field', v->>'field', 'value', v->>'value', 'kind', v->>'kind', 'source_url', v->>'source_url'));
  end loop;
  if l.firm is not null and coalesce(law->>'firm', '') = '' then law := law || jsonb_build_object('firm', l.firm); end if;
  if l.person is not null and coalesce(law->>'person', '') = '' then law := law || jsonb_build_object('person', l.person); end if;
  d := o.details || jsonb_build_object('lawyer', law);
  perform set_config('offers.fn', 'on', true);
  update public.property_offers set details = d where id = o.id;
  insert into public.offer_events (property_id, offer_id, actor, kind, detail) values (o.property_id, o.id, me, 'corrected', jsonb_build_object('note', 'Lawyer''s contact details from the lookup, ticked by Tim', 'before', o.details, 'after', d, 'lookup', l.id, 'used', used));
  perform set_config('offers.fn', '', true);
  return law;
end $$;

-- ───── the offer-draft edge function (service role): its records ─────
create or replace function public.offer_ai_read_save(p_blank uuid, p_pages int[], p_model text, p_ok boolean, p_result jsonb, p_actor text) returns bigint language plpgsql security definer set search_path = public as $$
declare rid bigint;
begin
  if not exists (select 1 from public.offer_blanks where id = p_blank and edition_checked) then raise exception 'No such blank'; end if;
  if length(coalesce(p_result, '{}'::jsonb)::text) > 200000 then raise exception 'Too much'; end if;
  insert into public.offer_blank_reads (blank_id, pages, model, ok, result, created_by) values (p_blank, coalesce(p_pages, '{}'), left(coalesce(p_model, ''), 60), coalesce(p_ok, false), coalesce(p_result, '{}'::jsonb), left(coalesce(p_actor, 'agent'), 254)) returning id into rid;
  return rid;
end $$;
create or replace function public.offer_lawyer_save(p_offer uuid, p_firm text, p_person text, p_model text, p_ok boolean, p_result jsonb, p_actor text) returns bigint language plpgsql security definer set search_path = public as $$
declare rid bigint;
begin
  if not exists (select 1 from public.property_offers where id = p_offer and source <> 'manual') then raise exception 'No such offer'; end if;
  if length(coalesce(p_result, '{}'::jsonb)::text) > 100000 then raise exception 'Too much'; end if;
  insert into public.offer_lawyer_lookups (offer_id, firm, person, model, ok, result, created_by) values (p_offer, left(p_firm, 200), left(p_person, 200), left(coalesce(p_model, ''), 60), coalesce(p_ok, false), coalesce(p_result, '{}'::jsonb), left(coalesce(p_actor, 'agent'), 254)) returning id into rid;
  return rid;
end $$;

-- ───── execute rights ─────
revoke execute on function public.guard_blank_document(), public.offer_edition_ok(text), public.guard_offer_record(), public.guard_offer_term(), public.offer_json_list(jsonb, int, int, text), public.offer_num_ok(jsonb, numeric, numeric),
  public.offer_places_ok(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.offer_ai_read_save(uuid, int[], text, boolean, jsonb, text), public.offer_lawyer_save(uuid, text, text, text, boolean, jsonb, text) from public, anon, authenticated;
grant execute on function public.offer_ai_read_save(uuid, int[], text, boolean, jsonb, text), public.offer_lawyer_save(uuid, text, text, text, boolean, jsonb, text) to service_role;
revoke execute on function public.agent_blank_add(uuid, int, jsonb, text), public.agent_blank_map_save(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, boolean), public.agent_offer_term(text, text, text, jsonb, int, boolean),
  public.agent_draft_add(uuid, uuid, text, text, bigint, jsonb, jsonb, jsonb, text), public.agent_draft_approve(uuid, text), public.agent_lawyer_use(bigint, text[]) from public, anon;
grant execute on function public.agent_blank_add(uuid, int, jsonb, text), public.agent_blank_map_save(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, boolean), public.agent_offer_term(text, text, text, jsonb, int, boolean),
  public.agent_draft_add(uuid, uuid, text, text, bigint, jsonb, jsonb, jsonb, text), public.agent_draft_approve(uuid, text), public.agent_lawyer_use(bigint, text[]) to authenticated;

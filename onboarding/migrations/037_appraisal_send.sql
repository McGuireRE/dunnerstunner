-- 037: sending an appraisal to the vendor (LW3 phase E, APPRAISAL-PLAN.md): a frozen copy, the vendor's private signed-in view,
-- short-lived photo links, "I'd like to proceed", the vendor's own marketing plan, and what happened, for Tim.
-- Builds on 036 (apply 032 to 036 first). Additive only: five new tables, one new nullable column on prelistings, new functions.
-- No existing column, row, policy, function, trigger or signed-record protection is changed. A sent appraisal still never changes
-- (guard_appraisal_view, 034): 'sent' is set only here, with set_config('app.appraisal_send', 'on', true), for this transaction alone.
--
--   appraisal_snapshots    the copy a vendor reads, made by agent_appraisal_send as a whitelist, never changed or removed: the ticked
--                          wording only, the shown comparables only (never Tim's private note, the source link, an AI note or a buyer
--                          check), the header, the video introduction, the mockup's photos and Tim's ticked Google reviews frozen as
--                          they were, and the exact files a vendor may open (paths). Never fee wording; never a link, phone number or
--                          email in the wording (Tim's own phone and email excepted); another agency's advertisement wording, or a
--                          review, that fails either is left out and listed for Tim (left_out). Never the Relab owners or values,
--                          buyers' locations or market_sales addresses: none of them is read here.
--   appraisal_versions     "Make an updated version": a new draft copied from the newest sent one, in the same chain. Sending it makes
--                          the next numbered copy; the plain link opens the newest copy sent to them; each older version keeps its
--                          own permanent link (?appraisal=<chain>&v=<n>), drawn with the newest version named.
--   the seal               each copy is sealed when sent: sealed_at, files (bucket, path, size and eTag from storage.objects; Storage
--                          keeps no SHA-256 of a file) and seal_sha256, the SHA-256 of appraisal_seal_text (version, sealed_at, content,
--                          files). agent_appraisal_seal_check works it out again. Valid three months from sealed_at, worked out when
--                          drawn and never stored; after that a vendor may ask for an updated appraisal (update_asked, once per person
--                          per copy).
--   appraisal_mail         the email Tim reviewed and sent with a copy (sent by the notify function; status only changes after).
--   appraisal_events       sent, opened (once per copy and person), proceeded (once per appraisal and person), plan_built (once per
--                          copy and person), each made unique by an index; notify tells Tim once each.
--   appraisal_vendor_plans a marketing plan the vendor built on the packages page, saved to their appraisal: one current plan per
--                          person per appraisal (a newer one supersedes it), at most 10 saves per person per version.
--   prelistings.appraisal_id  the appraisal a vendor's Questions before we meet came from, when they pressed "I'd like to proceed".
--
-- Who a vendor is: the signed-in email (the email code sign-in) is one Tim sent the copy to, and is still an owner or contact on the
-- property (property_people, not former) or the contact of its open Questions before we meet in this round of owners. Vendors only
-- ever go through the security definer functions here; they have no policy on any of the new tables. Anon gets nothing.

-- ═══════════════ tables ═══════════════
create table public.appraisal_versions (
  appraisal_id uuid primary key references public.appraisal_views(id) on delete cascade,
  previous_id uuid not null references public.appraisal_views(id),
  chain_id uuid not null references public.appraisal_views(id),
  made_by text not null default coalesce(auth.jwt()->>'email', ''),
  made_at timestamptz not null default now()
);
create index appraisal_versions_chain_idx on public.appraisal_versions (chain_id);

create table public.appraisal_snapshots (
  id uuid primary key default gen_random_uuid(),
  appraisal_id uuid not null unique references public.appraisal_views(id),
  chain_id uuid not null references public.appraisal_views(id),
  property_id uuid not null references public.properties(id),
  version integer not null check (version between 1 and 1000),
  content jsonb not null check (jsonb_typeof(content) = 'object' and length(content::text) <= 2000000),
  paths jsonb not null default '[]'::jsonb check (jsonb_typeof(paths) = 'array' and jsonb_array_length(paths) <= 600),
  recipients jsonb not null check (jsonb_typeof(recipients) = 'array' and jsonb_array_length(recipients) between 1 and 10),
  left_out jsonb not null default '[]'::jsonb check (jsonb_typeof(left_out) = 'array'),
  sent_by text not null,
  sent_at timestamptz not null default now(),
  -- the seal (Tim, 28 November 2026, 4:22pm: "time stamped and sealed ... frozen in time" for a Real Estate Authority audit): when it was
  -- sealed (server time), the files it lists as storage held them then (size and storage's own checksum, eTag; storage keeps no
  -- SHA-256 of a file), and the SHA-256 of the canonical seal text (appraisal_seal_text: the version, sealed_at, the content and the
  -- files, as jsonb text). Never changes, like the rest of the row.
  sealed_at timestamptz not null default now(),
  files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array'),
  seal_sha256 text not null check (seal_sha256 ~ '^[0-9a-f]{64}$'),
  unique (chain_id, version)
);
create index appraisal_snapshots_property_idx on public.appraisal_snapshots (property_id);

create table public.appraisal_mail (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null unique references public.appraisal_snapshots(id),
  to_addr text[] not null check (array_length(to_addr, 1) between 1 and 10),
  subject text not null check (length(btrim(subject)) between 1 and 300),
  body text not null check (length(body) between 1 and 20000 and position('[the appraisal link]' in body) > 0),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  sent_at timestamptz,
  error text check (length(error) <= 2000),
  made_by text not null,
  made_at timestamptz not null default now()
);

create table public.appraisal_events (
  id bigint generated always as identity primary key,
  snapshot_id uuid not null references public.appraisal_snapshots(id),
  chain_id uuid not null references public.appraisal_views(id),
  property_id uuid not null references public.properties(id),
  kind text not null check (kind in ('sent', 'opened', 'proceeded', 'plan_built', 'update_asked')),
  actor text not null check (length(actor) between 1 and 254),
  at timestamptz not null default now(),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and length(detail::text) <= 4000),
  notified_at timestamptz,
  seen_at timestamptz,
  seen_by text
);
create index appraisal_events_chain_idx on public.appraisal_events (chain_id, at);
create index appraisal_events_open_idx on public.appraisal_events (at) where seen_at is null;

create table public.appraisal_vendor_plans (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.appraisal_snapshots(id),
  chain_id uuid not null references public.appraisal_views(id),
  property_id uuid not null references public.properties(id),
  email text not null check (length(email) between 3 and 254),
  user_id uuid,
  plan jsonb not null check (jsonb_typeof(plan) = 'object' and length(plan::text) <= 20000),
  created_at timestamptz not null default now(),
  superseded_at timestamptz   -- set once, when the same person saves a newer plan: one current plan per person per appraisal
);
create index appraisal_vendor_plans_chain_idx on public.appraisal_vendor_plans (chain_id, email, created_at);
create unique index appraisal_vendor_plans_current on public.appraisal_vendor_plans (chain_id, email) where superseded_at is null;
-- what happened is recorded once per person: opening each copy, building a plan on each copy, and proceeding on the appraisal (two
-- reads at the same moment can't record it twice)
create unique index appraisal_events_opened_once on public.appraisal_events (snapshot_id, actor) where kind = 'opened';
create unique index appraisal_events_plan_once on public.appraisal_events (snapshot_id, actor) where kind = 'plan_built';
create unique index appraisal_events_proceeded_once on public.appraisal_events (chain_id, actor) where kind = 'proceeded';
create unique index appraisal_events_update_once on public.appraisal_events (snapshot_id, actor) where kind = 'update_asked';

alter table public.prelistings add column appraisal_id uuid references public.appraisal_views(id);

-- Row Level Security: Tim reads; nobody writes directly (the functions below do); vendors and anon nothing
alter table public.appraisal_versions enable row level security;
alter table public.appraisal_snapshots enable row level security;
alter table public.appraisal_mail enable row level security;
alter table public.appraisal_events enable row level security;
alter table public.appraisal_vendor_plans enable row level security;
create policy appraisal_versions_agent_read on public.appraisal_versions for select to authenticated using (public.is_agent());
create policy appraisal_snapshots_agent_read on public.appraisal_snapshots for select to authenticated using (public.is_agent());
create policy appraisal_mail_agent_read on public.appraisal_mail for select to authenticated using (public.is_agent());
create policy appraisal_events_agent_read on public.appraisal_events for select to authenticated using (public.is_agent());
create policy appraisal_vendor_plans_agent_read on public.appraisal_vendor_plans for select to authenticated using (public.is_agent());
revoke all on public.appraisal_versions, public.appraisal_snapshots, public.appraisal_mail, public.appraisal_events, public.appraisal_vendor_plans from anon;
revoke insert, update, delete, truncate, trigger, references on public.appraisal_versions, public.appraisal_snapshots, public.appraisal_mail,
  public.appraisal_events, public.appraisal_vendor_plans from authenticated;

-- ═══════════════ guards: a copy never changes; the records are kept ═══════════════
create function public.guard_appraisal_kept() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Records in % are kept', tg_table_name; end if;
  raise exception 'Records in % never change', tg_table_name;
end $$;
revoke all on function public.guard_appraisal_kept() from public, anon, authenticated;
create trigger appraisal_snapshots_kept before update or delete on public.appraisal_snapshots for each row execute function public.guard_appraisal_kept();
create trigger appraisal_versions_kept before update or delete on public.appraisal_versions for each row execute function public.guard_appraisal_kept();
-- a vendor's plan: kept; the only change is being superseded, once, by their newer plan
create function public.guard_vendor_plan() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Records in appraisal_vendor_plans are kept'; end if;
  if (to_jsonb(new) - 'superseded_at') is distinct from (to_jsonb(old) - 'superseded_at') or old.superseded_at is not null then
    raise exception 'Records in appraisal_vendor_plans never change';
  end if;
  return new;
end $$;
revoke all on function public.guard_vendor_plan() from public, anon, authenticated;
create trigger appraisal_vendor_plans_kept before update or delete on public.appraisal_vendor_plans for each row execute function public.guard_vendor_plan();
-- the email: what was sent never changes; only its sending moves on (queued or failed to sending, sending to sent or failed)
create function public.guard_appraisal_mail() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Records in appraisal_mail are kept'; end if;
  if new.snapshot_id is distinct from old.snapshot_id or new.to_addr is distinct from old.to_addr or new.subject is distinct from old.subject
     or new.body is distinct from old.body or new.made_by is distinct from old.made_by or new.made_at is distinct from old.made_at then
    raise exception 'An email that has been written for a sent appraisal never changes';
  end if;
  if new.status is distinct from old.status and not ((old.status in ('queued', 'failed') and new.status = 'sending')
     or (old.status = 'sending' and new.status in ('sent', 'failed'))) then
    raise exception 'That email can''t go from % to %', old.status, new.status;
  end if;
  return new;
end $$;
revoke all on function public.guard_appraisal_mail() from public, anon, authenticated;
create trigger appraisal_mail_guard before update or delete on public.appraisal_mail for each row execute function public.guard_appraisal_mail();
-- what happened: kept; Tim told once (notified_at) and Tim's "seen" once; nothing else changes
create function public.guard_appraisal_event() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Records in appraisal_events are kept'; end if;
  if (to_jsonb(new) - 'notified_at' - 'seen_at' - 'seen_by') is distinct from (to_jsonb(old) - 'notified_at' - 'seen_at' - 'seen_by')
     or (old.notified_at is not null and new.notified_at is distinct from old.notified_at)
     or (old.seen_at is not null and (new.seen_at is distinct from old.seen_at or new.seen_by is distinct from old.seen_by)) then
    raise exception 'Records in appraisal_events never change';
  end if;
  return new;
end $$;
revoke all on function public.guard_appraisal_event() from public, anon, authenticated;
create trigger appraisal_events_guard before update or delete on public.appraisal_events for each row execute function public.guard_appraisal_event();
-- a Questions before we meet keeps the appraisal it came from once it has one
create function public.guard_prelisting_appraisal() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.appraisal_id is not null and new.appraisal_id is distinct from old.appraisal_id then
    raise exception 'The appraisal these questions came from can''t change';
  end if;
  return new;
end $$;
revoke all on function public.guard_prelisting_appraisal() from public, anon, authenticated;
create trigger prelisting_appraisal_kept before update of appraisal_id on public.prelistings for each row execute function public.guard_prelisting_appraisal();

-- ═══════════════ helpers (not callable by users) ═══════════════
-- a link, phone number or email in wording a vendor reads (the same test as appraisal-core.js contactProblem); Tim's own phone and
-- email are his to give, so they are taken out first
create function public.appraisal_contact_problem(p text) returns boolean
language sql immutable set search_path = public as $$
  select x.t ~* '(https?://|www\.)[^[:space:]]+' or x.t ~ '\]\([^)]*\)'
      or x.t ~ '(\+[[:space:]]?64|\m0)[[:space:]().-]*[0-9]([[:space:]().-]*[0-9]){5,10}\M'
      or x.t ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]'
  from (select regexp_replace(regexp_replace(coalesce(p, ''), '(\+[[:space:]]?64[[:space:]().-]*|\m0)27[[:space:]().-]*562[[:space:]().-]*7207', ' ', 'g'),
          '(tim@mcguire\.co\.nz|hello@timmcguire\.co\.nz)', ' ', 'gi') as t) as x
$$;
revoke all on function public.appraisal_contact_problem(text) from public, anon, authenticated;

-- the first string in a value that holds a link, phone number or email, or null
create function public.appraisal_contact_find(p jsonb) returns text
language sql immutable set search_path = public as $$
  select v #>> '{}' from jsonb_path_query(coalesce(p, 'null'::jsonb), 'strict $.**') as v
   where jsonb_typeof(v) = 'string' and public.appraisal_contact_problem(v #>> '{}') limit 1
$$;
revoke all on function public.appraisal_contact_find(jsonb) from public, anon, authenticated;

-- the seal: the canonical text a copy's fingerprint is taken over (the version, sealed_at in UTC to the microsecond, the content and the
-- files, as Postgres writes jsonb: keys in a fixed order, no spaces that vary), and its SHA-256 (built in, no extension needed)
create function public.appraisal_seal_text(p_version integer, p_sealed_at timestamptz, p_content jsonb, p_files jsonb) returns text
language sql immutable set search_path = public as $$
  select jsonb_build_object('format', 'mre.appraisal-seal/1', 'version', p_version,
    'sealed_at', to_char(p_sealed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'content', p_content, 'files', p_files)::text
$$;
create function public.appraisal_seal_of(p_version integer, p_sealed_at timestamptz, p_content jsonb, p_files jsonb) returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(public.appraisal_seal_text(p_version, p_sealed_at, p_content, p_files), 'UTF8')), 'hex')
$$;
revoke all on function public.appraisal_seal_text(integer, timestamptz, jsonb, jsonb), public.appraisal_seal_of(integer, timestamptz, jsonb, jsonb) from public, anon, authenticated;

-- the chain an appraisal or a copy belongs to: the first appraisal sent (its own id when it has never been updated)
create function public.appraisal_chain_of(p_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce((select s.chain_id from public.appraisal_snapshots s where s.id = p_id),
                  (select v.chain_id from public.appraisal_versions v where v.appraisal_id = p_id), p_id)
$$;
revoke all on function public.appraisal_chain_of(uuid) from public, anon, authenticated;

-- the signed-in person may read this copy: Tim sent it to their email, and that email is still an owner or contact on the property, or
-- the contact of its open Questions before we meet in this round of owners who Tim hasn't set aside.
-- DECIDED (Tim, 28 November 2026, 3:11pm, APPRAISAL-PLAN.md open question 7: "yes, remove access"): a person Tim marks as former loses
-- access at once, even with an open Questions before we meet. Every vendor function asks only this function, so this is the one place.
create function public.appraisal_vendor_ok(p_snapshot uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and coalesce(auth.jwt()->>'email', '') <> '' and exists (
    select 1 from public.appraisal_snapshots s
     where s.id = p_snapshot
       and exists (select 1 from jsonb_array_elements(s.recipients) r where lower(r->>'email') = lower(auth.jwt()->>'email'))
       and (exists (select 1 from public.property_people pp where pp.property_id = s.property_id and pp.role in ('owner', 'contact')
                     and pp.email <> '' and lower(pp.email) = lower(auth.jwt()->>'email'))
         or (exists (select 1 from public.prelistings pl join public.properties p on p.id = pl.property_id where pl.property_id = s.property_id and pl.status <> 'closed' and pl.created_at >= coalesce(p.cycle_at, '-infinity'::timestamptz) and lower(pl.contact_email) = lower(auth.jwt()->>'email'))
             and not exists (select 1 from public.property_people f where f.property_id = s.property_id and f.role = 'former' and f.email <> '' and lower(f.email) = lower(auth.jwt()->>'email'))))
       )
$$;

-- ═══════════════ the section whitelist: each section rebuilt from the keys its type draws, and nothing else ═══════════════
create function public.ap_s(v jsonb) returns jsonb language sql immutable set search_path = public as $$ select case when jsonb_typeof(v) = 'string' then v end $$;
create function public.ap_n(v jsonb) returns jsonb language sql immutable set search_path = public as $$ select case when jsonb_typeof(v) = 'number' then v end $$;
create function public.ap_b(v jsonb) returns jsonb language sql immutable set search_path = public as $$ select case when jsonb_typeof(v) = 'boolean' then v end $$;
-- a list of lines: plain strings kept; a line as {text, ticked} kept only when ticked, as its text alone; anything else left out
create function public.ap_lines(v jsonb) returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(case when jsonb_typeof(x) = 'string' then x else x->'text' end order by i), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(v) = 'array' then v else '[]'::jsonb end) with ordinality as e(x, i)
   where jsonb_typeof(x) = 'string' or (jsonb_typeof(x) = 'object' and x->'ticked' = 'true'::jsonb and jsonb_typeof(x->'text') = 'string')
$$;
-- a list of lines the renderer has its own default for (a table's or the price table's column headings): kept only when the section
-- has a list there, so a missing one stays missing and the renderer's headings show (re-review of f73d2fb)
create function public.ap_lines_opt(v jsonb) returns jsonb language sql immutable set search_path = public as $$
  select case when jsonb_typeof(v) = 'array' then public.ap_lines(v) end
$$;
-- rows of cells (a table): each cell kept as text, numbers written out; any other cell blanked, so the columns stay in line
create function public.ap_rows(v jsonb) returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg((select coalesce(jsonb_agg(case when jsonb_typeof(c) = 'string' then c when jsonb_typeof(c) = 'number' then to_jsonb(c #>> '{}') else '""'::jsonb end order by j), '[]'::jsonb)
                               from jsonb_array_elements(r) with ordinality as f(c, j)) order by i), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(v) = 'array' then v else '[]'::jsonb end) with ordinality as e(r, i) where jsonb_typeof(r) = 'array'
$$;
-- a list of objects, each rebuilt by f (a section's own items)
create function public.appraisal_section_clean(s jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare t text; o jsonb; x jsonb;
begin
  if jsonb_typeof(s) is distinct from 'object' then return null; end if;
  t := s->>'type';
  o := case
    when t in ('heading', 'note', 'byline') then jsonb_build_object('text', public.ap_s(s->'text'))
    when t = 'para' then jsonb_build_object('text', public.ap_s(s->'text'), 'cls', public.ap_s(s->'cls'))
    when t = 'list' then jsonb_build_object('items', public.ap_lines(s->'items'), 'ordered', public.ap_b(s->'ordered'))
    when t in ('table', 'methods') then jsonb_build_object('head', public.ap_lines_opt(s->'head'), 'rows', public.ap_rows(s->'rows'))
    when t = 'ranges' then jsonb_build_object('head', public.ap_lines_opt(s->'head'))
    when t = 'method' then '{}'::jsonb
    when t = 'opinion' then jsonb_build_object('head', public.ap_lines_opt(s->'head'), 'table', public.ap_b(s->'table'))
    when t in ('wave', 'campaign') then jsonb_build_object('title', public.ap_s(s->'title'), 'subtitle', public.ap_s(s->'subtitle'), 'marker', public.ap_n(s->'marker'),
        'markerLabel', public.ap_s(s->'markerLabel'), 'trickle', public.ap_s(s->'trickle'), 'tail', public.ap_s(s->'tail'), 'caption', public.ap_s(s->'caption'),
        'bars', (select coalesce(jsonb_agg(jsonb_build_object('label', public.ap_s(b->'label'), 'pct', public.ap_n(b->'pct')) order by i), '[]'::jsonb)
                   from jsonb_array_elements(case when jsonb_typeof(s->'bars') = 'array' then s->'bars' else '[]'::jsonb end) with ordinality as e(b, i) where jsonb_typeof(b) = 'object'))
    when t = 'methodcards' then jsonb_build_object('rec', public.ap_s(s->'rec'),
        'items', (select coalesce(jsonb_agg(jsonb_build_object('key', public.ap_s(m->'key'), 'name', public.ap_s(m->'name'), 'how', public.ap_s(m->'how'), 'suits', public.ap_s(m->'suits'), 'know', public.ap_s(m->'know')) order by i), '[]'::jsonb)
                   from jsonb_array_elements(case when jsonb_typeof(s->'items') = 'array' then s->'items' else '[]'::jsonb end) with ordinality as e(m, i) where jsonb_typeof(m) = 'object'))
    when t = 'plans' then jsonb_build_object('included', public.ap_s(s->'included'),
        'items', (select coalesce(jsonb_agg(jsonb_build_object('key', public.ap_s(p->'key'), 'name', public.ap_s(p->'name'), 'price', public.ap_n(p->'price'), 'tagline', public.ap_s(p->'tagline'),
                    'items', public.ap_lines(p->'items'), 'rec', public.ap_b(p->'rec')) order by i), '[]'::jsonb)
                   from jsonb_array_elements(case when jsonb_typeof(s->'items') = 'array' then s->'items' else '[]'::jsonb end) with ordinality as e(p, i) where jsonb_typeof(p) = 'object'))
    when t = 'panel' then jsonb_build_object('title', public.ap_s(s->'title'), 'items', public.ap_lines(s->'items'))
    when t = 'header' then jsonb_build_object('stage', public.ap_n(s->'stage'), 'src', public.ap_s(s->'src'), 'asset', public.ap_s(s->'asset'),
        'url', case when s->>'url' ~ '^https://[^[:space:]"''<>]+$' then s->'url' end, 'kind', public.ap_s(s->'kind'), 'credit', public.ap_s(s->'credit'),
        'focus', case when jsonb_typeof(s->'focus') = 'object' then jsonb_build_object('x', public.ap_n(s->'focus'->'x'), 'y', public.ap_n(s->'focus'->'y')) end,
        'zoom', public.ap_n(s->'zoom'), 'bright', public.ap_n(s->'bright'), 'speed', public.ap_n(s->'speed'))
    when t = 'intro' then jsonb_build_object('stage', public.ap_n(s->'stage'), 'asset', public.ap_s(s->'asset'))
    when t = 'heard' then jsonb_build_object('stage', public.ap_n(s->'stage'), 'items', public.ap_lines(s->'items'))
    when t = 'home' then jsonb_build_object('stage', public.ap_n(s->'stage'), 'label', public.ap_s(s->'label'), 'photos', public.ap_lines(s->'photos'),
        'details', (select coalesce(jsonb_agg(jsonb_build_array(d->0, d->1) order by i), '[]'::jsonb)
                      from jsonb_array_elements(case when jsonb_typeof(s->'details') = 'array' then s->'details' else '[]'::jsonb end) with ordinality as e(d, i)
                     where jsonb_typeof(d) = 'array' and jsonb_typeof(d->0) = 'string' and jsonb_typeof(d->1) = 'string'),
        'ad', case when jsonb_typeof(s->'ad') = 'object' and coalesce(s->'ad'->'ticked', 'true'::jsonb) = 'true'::jsonb
                   then jsonb_build_object('title', public.ap_s(s->'ad'->'title'), 'paras', public.ap_lines(s->'ad'->'paras')) end)
    when t = 'buyers' then jsonb_build_object('stage', public.ap_n(s->'stage'), 'text', public.ap_s(s->'text'), 'tags', public.ap_lines(s->'tags'))
    when t = 'reviews' then jsonb_build_object('stage', public.ap_n(s->'stage'), 'max', public.ap_n(s->'max'))
    else null end;
  if o is null then return null; end if;
  return jsonb_strip_nulls(jsonb_build_object('type', t) || o);
end $$;
revoke all on function public.ap_s(jsonb), public.ap_n(jsonb), public.ap_b(jsonb), public.ap_lines(jsonb), public.ap_lines_opt(jsonb), public.ap_rows(jsonb), public.appraisal_section_clean(jsonb) from public, anon, authenticated;
revoke all on function public.appraisal_vendor_ok(uuid) from public, anon, authenticated;

-- the newest copy in a chain the signed-in person may read (null when none)
create function public.appraisal_vendor_newest(p_chain uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select s.id from public.appraisal_snapshots s where s.chain_id = p_chain and public.appraisal_vendor_ok(s.id) order by s.version desc limit 1
$$;
revoke all on function public.appraisal_vendor_newest(uuid) from public, anon, authenticated;

-- the frozen copy, built only from what a vendor may see. Returns {content, paths, left_out}. Raises, naming what to fix, when Tim's own
-- wording a vendor would read holds fee wording, "as is", a link, a phone number or an email.
create function public.appraisal_snapshot_build(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.appraisal_views; secs jsonb; flds jsonb; comps jsonb := '[]'::jsonb; photos jsonb := '{}'::jsonb; months jsonb := '[]'::jsonb;
  assets jsonb := '{}'::jsonb; home jsonb := '{}'::jsonb; reviews jsonb := '[]'::jsonb; paths jsonb := '[]'::jsonb; left_out jsonb := '[]'::jsonb;
  c record; m record; a record; d record; rv record; x text; prob text; ad text; cmp text; nmax int; ids uuid[]; marea text;
begin
  select * into r from public.appraisal_views where id = p_id;
  if not found then raise exception 'Appraisal not found'; end if;
  -- the sections: each rebuilt from the keys its type draws (appraisal_section_clean); unknown types and keys never reach a vendor
  select coalesce(jsonb_agg(public.appraisal_section_clean(s) order by i) filter (where public.appraisal_section_clean(s) is not null), '[]'::jsonb) into secs
    from jsonb_array_elements(r.sections) with ordinality as e(s, i);
  -- the figures: each range, the bedrooms wording and the method, nothing else
  flds := jsonb_strip_nulls(jsonb_build_object(
    'ranges', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('key', public.ap_s(q->'key'), 'option', public.ap_s(q->'option'), 'involves', public.ap_s(q->'involves'), 'low', public.ap_n(q->'low'), 'high', public.ap_n(q->'high'))) order by i), '[]'::jsonb)
                 from jsonb_array_elements(case when jsonb_typeof(r.fields->'ranges') = 'array' then r.fields->'ranges' else '[]'::jsonb end) with ordinality as e(q, i) where jsonb_typeof(q) = 'object'),
    'bedrooms', public.ap_s(r.fields->'bedrooms'),
    'method', case when jsonb_typeof(r.fields->'method') = 'object' then jsonb_strip_nulls(jsonb_build_object('name', public.ap_s(r.fields->'method'->'name'), 'key', public.ap_s(r.fields->'method'->'key'), 'text', public.ap_s(r.fields->'method'->'text'))) end));
  prob := public.appraisal_wording_problem(jsonb_build_array(secs, flds, r.title, r.prepared_for, r.address));
  if prob <> '' then raise exception '%', prob; end if;
  -- no link, phone number or email in the wording (the library header's own link is the photo itself, and the file and photo ids are
  -- references, not wording: an id such as "...-0123-4567-..." would read as a phone number)
  x := public.appraisal_contact_find(jsonb_build_array((select coalesce(jsonb_agg(s - 'url' - 'asset' - 'photos'), '[]'::jsonb) from jsonb_array_elements(secs) s), flds - 'ranges',
    (select coalesce(jsonb_agg(q - 'key' - 'low' - 'high'), '[]'::jsonb) from jsonb_array_elements(coalesce(flds->'ranges', '[]'::jsonb)) q), r.title, r.prepared_for));
  if x is not null then
    raise exception 'This wording holds a link, a phone number or an email, which don''t belong on an appraisal: "%". Change it on the set-up or sections screen, then send.', left(x, 80);
  end if;

  -- the shown comparables, the vendor's fields only (never Tim's private note, the source, its link or reference)
  for c in select * from public.appraisal_comps where appraisal_id = r.id and shown order by position, created_at, id loop
    prob := public.appraisal_wording_problem(jsonb_build_array(c.address, c.suburb, c.method, c.agency));
    if prob <> '' then raise exception 'The comparable at %: %', c.address, prob; end if;
    x := public.appraisal_contact_find(jsonb_build_array(c.address, c.suburb, c.method, c.agency));
    if x is not null then raise exception 'The comparable at % holds a link, a phone number or an email: "%". Change it on the Comparables screen, then send.', c.address, left(x, 80); end if;
    -- how it compares: Tim's ticked wording only, and it must pass both checks
    cmp := null;
    if c.compare_ticked and btrim(c.compare_text) <> '' then
      prob := public.appraisal_wording_problem(to_jsonb(c.compare_text));
      if prob <> '' then raise exception 'How % compares: %', c.address, prob; end if;
      if public.appraisal_contact_problem(c.compare_text) then
        raise exception 'How % compares holds a link, a phone number or an email. Change it on the Comparables screen, then send.', c.address;
      end if;
      cmp := c.compare_text;
    end if;
    -- another agency's advertisement is a quote: shown only when it passes both checks, otherwise left out and listed for Tim
    ad := null;
    if btrim(c.ad_text) <> '' then
      if public.appraisal_wording_problem(to_jsonb(c.ad_text)) <> '' then
        left_out := left_out || jsonb_build_object('what', 'advertisement', 'comp', c.address, 'why', public.appraisal_wording_problem(to_jsonb(c.ad_text)));
      elsif public.appraisal_contact_problem(c.ad_text) then
        left_out := left_out || jsonb_build_object('what', 'advertisement', 'comp', c.address, 'why', 'It holds a link, a phone number or an email.');
      else ad := c.ad_text; end if;
    end if;
    comps := comps || jsonb_strip_nulls(jsonb_build_object('id', c.id, 'position', c.position, 'status', c.status, 'address', c.address,
      'suburb', nullif(c.suburb, ''), 'price', c.price, 'sold_on', c.sold_on, 'listed_on', c.listed_on, 'method', nullif(c.method, ''), 'days_to_sell', c.days_to_sell,
      'bedrooms', c.bedrooms, 'bathrooms', c.bathrooms, 'floor_m2', c.floor_m2, 'land_m2', c.land_m2, 'cv', c.cv, 'agency', nullif(c.agency, ''),
      'sold_by_tim', c.sold_by_tim, 'ad_text', ad, 'compare_text', cmp, 'compare_ticked', cmp is not null, 'ring', c.ring, 'distance_m', c.distance_m, 'shown', true));
    -- its photos, the print photo first
    for m in select * from public.appraisal_media where appraisal_id = r.id and comp_id = c.id order by cover desc, position, created_at, id loop
      photos := jsonb_set(photos, array[c.id::text], coalesce(photos->(c.id::text), '[]'::jsonb) || jsonb_build_object('path', m.path, 'cover', m.cover));
      paths := paths || jsonb_build_object('bucket', 'appraisal-media', 'path', m.path);
    end loop;
  end loop;

  -- the market report, when Tim switched it on: only the area the report draws and only the months it draws (market-core.js pickArea
  -- and lastYear: Tim's area, else Dunedin, else Dunedin City, else the area with the most months; its latest twelve calendar months).
  -- Public monthly figures only, never market_sales.
  if coalesce(r.setup->>'market', '') = 'true' then
    select q.area into marea from (select mm.area, count(*) n from public.market_months mm group by mm.area) q
     order by (lower(btrim(q.area)) = lower(btrim(coalesce(r.setup->>'marketArea', ''))) and btrim(coalesce(r.setup->>'marketArea', '')) <> '') desc,
              (lower(btrim(q.area)) = 'dunedin') desc, (lower(btrim(q.area)) = 'dunedin city') desc, q.n desc, q.area collate "C" asc limit 1;
    if marea is not null then
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('area', mm.area, 'month', mm.month, 'median', mm.median, 'lower_quartile', mm.lower_quartile,
          'upper_quartile', mm.upper_quartile, 'sales', mm.sales, 'days_to_sell', mm.days_to_sell, 'bands', mm.bands, 'source', mm.source, 'gathered_at', mm.gathered_at)) order by mm.month), '[]'::jsonb)
        into months from public.market_months mm
       where mm.area = marea and mm.month >= ((select max(x.month) from public.market_months x where x.area = marea) - interval '11 months')::date;
    end if;
  end if;

  -- the header and the video introduction: the files the sections name, frozen by path
  select coalesce(array_agg((s->>'asset')::uuid), '{}') into ids from jsonb_array_elements(secs) s
   where ((s->>'type' = 'header' and s->>'src' = 'asset') or s->>'type' = 'intro') and (s->>'asset') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  for a in select * from public.appraisal_assets where appraisal_id = r.id and id = any(ids) loop
    assets := assets || jsonb_build_object(a.id::text, jsonb_strip_nulls(jsonb_build_object('bucket', a.bucket, 'path', a.path, 'still_path', a.still_path, 'mime', a.mime_type, 'kind', a.kind, 'role', a.role)));
    paths := paths || jsonb_build_object('bucket', a.bucket, 'path', a.path);
    if a.still_path is not null then paths := paths || jsonb_build_object('bucket', 'appraisal-media', 'path', a.still_path); end if;
  end loop;

  -- the mockup's photos: photos on this property's file, not removed, as chosen in the sections
  select coalesce(array_agg((p #>> '{}')::uuid), '{}') into ids from (select jsonb_array_elements(case when jsonb_typeof(s->'photos') = 'array' then s->'photos' else '[]'::jsonb end) p
      from jsonb_array_elements(secs) s where s->>'type' = 'home') q
   where jsonb_typeof(p) = 'string' and (p #>> '{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  for d in select * from public.property_documents where property_id = r.property_id and id = any(ids) and kind = 'Photo' and archived_at is null
             and bucket = 'property-files' and coalesce(mime_type, '') like 'image/%' loop
    home := home || jsonb_build_object(d.id::text, jsonb_strip_nulls(jsonb_build_object('path', d.path, 'room', nullif(d.room, ''))));
    paths := paths || jsonb_build_object('bucket', 'property-files', 'path', d.path);
  end loop;

  -- Tim's ticked Google reviews, newest first, as they are now: a review that fails either check is left out and listed
  if exists (select 1 from jsonb_array_elements(secs) s where s->>'type' = 'reviews') then
    select greatest(1, least(12, coalesce((select (s->>'max')::int from jsonb_array_elements(secs) s where s->>'type' = 'reviews' and (s->>'max') ~ '^[0-9]{1,2}$' limit 1), 6))) into nmax;
    for rv in select * from public.tim_reviews where ticked and removed_at is null and rating between 1 and 5 order by reviewed_on desc, id loop
      exit when jsonb_array_length(reviews) >= nmax;
      if public.appraisal_wording_problem(jsonb_build_array(rv.body, rv.reviewer)) <> '' or public.appraisal_contact_problem(rv.body) then
        left_out := left_out || jsonb_build_object('what', 'review', 'reviewer', rv.reviewer, 'why', 'It mentions a fee or "as is", or holds a link, a phone number or an email.');
        continue;
      end if;
      reviews := reviews || jsonb_strip_nulls(jsonb_build_object('id', rv.id, 'reviewer', rv.reviewer, 'rating', rv.rating, 'reviewed_on', rv.reviewed_on, 'body', nullif(rv.body, ''),
        'url', case when rv.url ~ '^https://[^[:space:]"''<>]+$' then rv.url end, 'ticked', true));
    end loop;
  end if;

  return jsonb_build_object('content', jsonb_build_object('v', 1, 'title', r.title, 'address', r.address, 'prepared_for', r.prepared_for, 'prepared_on', r.prepared_on,
      'kind', r.kind, 'sections', secs, 'fields', flds,
      'setup', jsonb_build_object('v', 1, 'market', coalesce(r.setup->>'market', '') = 'true', 'marketArea', coalesce(r.setup->>'marketArea', '')),
      'comps', comps, 'photos', photos, 'months', months, 'assets', assets, 'homePhotos', home, 'reviews', reviews),
    'paths', paths, 'left_out', left_out);
end $$;
revoke all on function public.appraisal_snapshot_build(uuid) from public, anon, authenticated;

-- ═══════════════ Tim's functions ═══════════════
-- send: Tim chooses who it goes to and has read the email; the copy is made, the appraisal marked sent (this transaction alone), the
-- email queued for the notify function to send. Returns {snapshot_id, chain_id, version, mail_id, recipients, left_out}.
create function public.agent_appraisal_send(p_id uuid, p_recipients text[], p_subject text, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.appraisal_views; built jsonb; chain uuid; ver int; sid uuid; mid uuid; em text; nm text; rec jsonb := '[]'::jsonb; ems text[] := '{}'; prob text;
  sealed timestamptz; files jsonb;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  select * into r from public.appraisal_views where id = p_id for update;
  if not found then raise exception 'Appraisal not found'; end if;
  if r.status = 'sent' then raise exception 'This appraisal has already been sent. To change it, make an updated version'; end if;
  if not (r.setup ? 'v') then raise exception 'Only an appraisal written from its set-up page can be sent'; end if;
  if r.property_id is null then raise exception 'This appraisal isn''t on a property file, so there is no one to send it to'; end if;
  if (case when jsonb_typeof(r.fields->'ranges') = 'array' then jsonb_array_length(r.fields->'ranges') else 0 end) = 0 then raise exception 'Add your price range on the set-up page first'; end if;
  if coalesce(array_length(p_recipients, 1), 0) = 0 then raise exception 'Choose who it goes to'; end if;
  if array_length(p_recipients, 1) > 10 then raise exception 'At most 10 people at once'; end if;
  foreach em in array p_recipients loop
    em := lower(btrim(coalesce(em, '')));
    if em = '' or em = any(ems) then continue; end if;
    select nullif(btrim(coalesce(nullif(pp.pref_name, ''), pp.legal_name)), '') into nm from public.property_people pp
     where pp.property_id = r.property_id and pp.role in ('owner', 'contact') and pp.email <> '' and lower(pp.email) = em order by pp.position limit 1;
    if not found then
      select nullif(btrim(pl.contact_name), '') into nm from public.prelistings pl join public.properties p on p.id = pl.property_id
       where pl.property_id = r.property_id and pl.status <> 'closed' and pl.created_at >= coalesce(p.cycle_at, '-infinity'::timestamptz)
         and lower(pl.contact_email) = em order by pl.created_at desc limit 1;
      if not found then raise exception '% isn''t an owner or contact on this property. Add them to the property file first', em; end if;
    end if;
    ems := ems || em; rec := rec || jsonb_strip_nulls(jsonb_build_object('email', em, 'name', nm));
  end loop;
  if jsonb_array_length(rec) = 0 then raise exception 'Choose who it goes to'; end if;
  if length(btrim(coalesce(p_subject, ''))) = 0 then raise exception 'Add a subject'; end if;
  if position('[the appraisal link]' in coalesce(p_body, '')) = 0 then raise exception 'Keep [the appraisal link] in the email: it becomes their link when it goes'; end if;
  prob := public.appraisal_wording_problem(jsonb_build_array(p_subject, p_body));
  if prob <> '' then raise exception 'The email: %', prob; end if;
  if p_body ~ '\[Tim to [^]]*\]' then raise exception 'Fill or delete the marked blanks in the email first'; end if;

  built := public.appraisal_snapshot_build(r.id);
  -- the copy's wording is limited to 2 MB (photos and videos are files, not counted): said plainly, not as the table's check
  if length((built->'content')::text) > 2000000 then
    raise exception 'This appraisal is too long to send (its wording is over 2 MB). Shorten or remove some sections, then send again';
  end if;
  chain := public.appraisal_chain_of(r.id);
  select coalesce(max(version), 0) + 1 into ver from public.appraisal_snapshots where chain_id = chain;
  -- sealed now: each listed file as storage holds it (size and storage's checksum), and the fingerprint over the whole
  sealed := now();
  select coalesce(jsonb_agg(jsonb_build_object('bucket', p->>'bucket', 'path', p->>'path', 'size', o.metadata->'size', 'etag', o.metadata->'eTag') order by i), '[]'::jsonb) into files
    from jsonb_array_elements(built->'paths') with ordinality as e(p, i)
    left join storage.objects o on o.bucket_id = p->>'bucket' and o.name = p->>'path';
  insert into public.appraisal_snapshots (appraisal_id, chain_id, property_id, version, content, paths, recipients, left_out, sent_by, sealed_at, files, seal_sha256)
    values (r.id, chain, r.property_id, ver, built->'content', built->'paths', rec, built->'left_out', coalesce(auth.jwt()->>'email', 'agent'),
      sealed, files, public.appraisal_seal_of(ver, sealed, built->'content', files))
    returning id into sid;
  insert into public.appraisal_mail (snapshot_id, to_addr, subject, body, made_by)
    values (sid, ems, btrim(p_subject), p_body, coalesce(auth.jwt()->>'email', 'agent')) returning id into mid;
  insert into public.appraisal_events (snapshot_id, chain_id, property_id, kind, actor, detail, notified_at, seen_at, seen_by)
    values (sid, chain, r.property_id, 'sent', coalesce(auth.jwt()->>'email', 'agent'), jsonb_build_object('version', ver, 'to', jsonb_array_length(rec)), now(), now(), coalesce(auth.jwt()->>'email', 'agent'));
  -- 'sent' only here, and only for this statement: the setting is put back before anything else in the transaction runs
  perform set_config('app.appraisal_send', 'on', true);
  update public.appraisal_views set status = 'sent' where id = r.id;
  perform set_config('app.appraisal_send', '', true);
  return jsonb_build_object('snapshot_id', sid, 'chain_id', chain, 'version', ver, 'mail_id', mid, 'recipients', rec, 'left_out', built->'left_out',
    'sealed_at', sealed, 'seal_sha256', (select seal_sha256 from public.appraisal_snapshots where id = sid));
end $$;
revoke all on function public.agent_appraisal_send(uuid, text[], text, text) from public, anon;
grant execute on function public.agent_appraisal_send(uuid, text[], text, text) to authenticated;

-- "Make an updated version": a new draft from the newest sent copy in its chain, with its comparables copied. The portal copies the
-- photos and the header and video files into the new appraisal's own folders (the files of a sent appraisal never move or change).
-- An unsent update already under way is carried on rather than made twice. Returns {appraisal_id, existing, comps, media, assets}.
create function public.agent_appraisal_new_version(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.appraisal_views; chain uuid; newest uuid; nid uuid; ex uuid; c record; cid uuid; cmap jsonb := '[]'::jsonb; media jsonb; assets jsonb;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  select * into r from public.appraisal_views where id = p_id;
  if not found then raise exception 'Appraisal not found'; end if;
  if r.status <> 'sent' then raise exception 'Only a sent appraisal is updated this way. This one can still be changed as it is'; end if;
  chain := public.appraisal_chain_of(r.id);
  perform 1 from public.appraisal_views where id = chain for update;   -- one update at a time per chain
  select appraisal_id into newest from public.appraisal_snapshots where chain_id = chain order by version desc limit 1;
  if newest is distinct from r.id then raise exception 'There is a newer version of this appraisal. Update that one'; end if;
  select v.appraisal_id into ex from public.appraisal_versions v join public.appraisal_views a on a.id = v.appraisal_id
   where v.chain_id = chain and a.status <> 'sent' order by v.made_at desc limit 1;
  if ex is not null then return jsonb_build_object('appraisal_id', ex, 'existing', true, 'comps', '[]'::jsonb, 'media', '[]'::jsonb, 'assets', '[]'::jsonb); end if;
  -- the draft never names the sent version's header or video files: they come back as its own once copied (setup.copyPending lists
  -- what is still to copy, so the portal can finish later, and warns before sending while anything is left)
  insert into public.appraisal_views (property_id, title, address, prepared_for, status, sections, fields, setup, kind, private_notes)
    values (r.property_id, r.title, r.address, r.prepared_for, 'draft',
      (select coalesce(jsonb_agg(s order by i), '[]'::jsonb) from jsonb_array_elements(r.sections) with ordinality as e(s, i)
        where not (s->>'type' = 'intro' or (s->>'type' = 'header' and s->>'src' = 'asset'))),
      r.fields,
      (case when jsonb_typeof(r.setup->'headerOpt') = 'object' then jsonb_set(r.setup, '{headerOpt}', (r.setup->'headerOpt') - 'asset') else r.setup end) - 'intro' - 'copyPending'
        || jsonb_build_object('copyPending', jsonb_build_object(
             'media', '[]'::jsonb,
             'assets', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'role', a.role) order by a.created_at), '[]'::jsonb)
                          from public.appraisal_assets a where a.appraisal_id = r.id
                           and ((a.role = 'header' and r.setup->'headerOpt'->>'asset' = a.id::text) or (a.role = 'intro' and r.setup->'intro'->>'asset' = a.id::text))),
             'intro', r.setup->'intro')),
      r.kind, r.private_notes) returning id into nid;
  insert into public.appraisal_versions (appraisal_id, previous_id, chain_id) values (nid, r.id, chain);
  for c in select * from public.appraisal_comps where appraisal_id = r.id order by position, created_at, id loop
    insert into public.appraisal_comps (appraisal_id, position, shown, status, address, suburb, price, sold_on, listed_on, method, days_to_sell, bedrooms, bathrooms,
        floor_m2, land_m2, cv, agency, sold_by_tim, ad_text, compare_text, compare_ticked, private_note, ring, distance_m, source, source_ref, source_url, gathered_at, photo_hints)
      values (nid, c.position, c.shown, c.status, c.address, c.suburb, c.price, c.sold_on, c.listed_on, c.method, c.days_to_sell, c.bedrooms, c.bathrooms,
        c.floor_m2, c.land_m2, c.cv, c.agency, c.sold_by_tim, c.ad_text, c.compare_text, c.compare_ticked, c.private_note, c.ring, c.distance_m, c.source, c.source_ref, c.source_url, c.gathered_at, c.photo_hints)
      returning id into cid;
    cmap := cmap || jsonb_build_object('from', c.id, 'to', cid);
  end loop;
  -- the photos still to copy, each with the comparable it now belongs to on the draft
  select coalesce(jsonb_agg(jsonb_build_object('from', m.path, 'comp', (select x->>'to' from jsonb_array_elements(cmap) x where x->>'from' = m.comp_id::text)) order by m.position, m.created_at), '[]'::jsonb)
    into media from public.appraisal_media m where m.appraisal_id = r.id and m.comp_id is not null;
  update public.appraisal_views set setup = jsonb_set(setup, '{copyPending,media}', media) where id = nid;
  select setup->'copyPending'->'assets' into assets from public.appraisal_views where id = nid;
  return jsonb_build_object('appraisal_id', nid, 'existing', false, 'comps', cmap, 'media', media, 'assets', assets);
end $$;
revoke all on function public.agent_appraisal_new_version(uuid) from public, anon;
grant execute on function public.agent_appraisal_new_version(uuid) to authenticated;

-- Tim has seen what happened (the Needs you list)
create function public.agent_appraisal_events_seen(p_ids bigint[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  update public.appraisal_events set seen_at = now(), seen_by = coalesce(auth.jwt()->>'email', 'agent') where id = any(coalesce(p_ids, '{}')) and seen_at is null;
  get diagnostics n = row_count; return n;
end $$;
revoke all on function public.agent_appraisal_events_seen(bigint[]) from public, anon;
grant execute on function public.agent_appraisal_events_seen(bigint[]) to authenticated;

-- an email the notify function took but couldn't confirm: once Tim has checked it didn't arrive, it can be sent again
create function public.agent_appraisal_mail_unstick(p_mail uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  update public.appraisal_mail set status = 'failed', error = 'Checked by Tim: it did not arrive' where id = p_mail and status = 'sending';
  if not found then raise exception 'That email isn''t waiting on a check'; end if;
end $$;
revoke all on function public.agent_appraisal_mail_unstick(uuid) from public, anon;
grant execute on function public.agent_appraisal_mail_unstick(uuid) to authenticated;

-- ═══════════════ the vendor's functions ═══════════════
-- the appraisals sent to the signed-in person: the newest copy of each chain they may read
create function public.vendor_appraisals_mine() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('chain_id', s.chain_id, 'snapshot_id', s.id, 'address', s.content->>'address', 'version', s.version, 'sent_at', s.sent_at) order by s.sent_at desc), '[]'::jsonb)
    from public.appraisal_snapshots s
   where public.appraisal_vendor_ok(s.id)
     and s.version = (select max(x.version) from public.appraisal_snapshots x where x.chain_id = s.chain_id and public.appraisal_vendor_ok(x.id))
$$;
revoke all on function public.vendor_appraisals_mine() from public, anon;
grant execute on function public.vendor_appraisals_mine() to authenticated;

-- the vendor's view. Each sent version has its own permanent link (Tim, 28 November 2026, 4:22pm: "the link can be permanent so that I
-- can cite it on the agency agreement"): p_id a copy's id opens that copy; p_id an appraisal's id with p_version opens that version;
-- p_id an appraisal's id alone opens the newest copy sent to them. Always only a copy the signed-in person may read; 'Not found' for no
-- such copy and for one that isn't theirs alike. The first time each person opens a copy is recorded for Tim. Returns {snapshot_id,
-- chain_id, version, sent_at, sealed_at, seal_sha256, expires_at, content, plan, prelisting_id, event_id, asked (they asked for an update
-- of this copy), newest {snapshot_id, version, sent_at} (the newest copy they may read)}.
create function public.vendor_appraisal_read(p_id uuid, p_version integer default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare chain uuid; sid uuid; nid uuid; s public.appraisal_snapshots; n public.appraisal_snapshots; em text := lower(coalesce(auth.jwt()->>'email', '')); ev bigint; plan jsonb; pl uuid;
begin
  if auth.uid() is null or em = '' then raise exception 'Not found'; end if;
  chain := public.appraisal_chain_of(p_id);
  if exists (select 1 from public.appraisal_snapshots where id = p_id) then sid := p_id;
  elsif p_version is not null then select id into sid from public.appraisal_snapshots where chain_id = chain and version = p_version;
  else sid := public.appraisal_vendor_newest(chain); end if;
  if sid is null or not public.appraisal_vendor_ok(sid) then raise exception 'Not found'; end if;
  select * into s from public.appraisal_snapshots where id = sid;
  nid := public.appraisal_vendor_newest(s.chain_id);
  select * into n from public.appraisal_snapshots where id = nid;
  -- once per person per copy, even when two reads arrive together (appraisal_events_opened_once)
  insert into public.appraisal_events (snapshot_id, chain_id, property_id, kind, actor, detail) values (s.id, s.chain_id, s.property_id, 'opened', em, jsonb_build_object('version', s.version))
    on conflict (snapshot_id, actor) where kind = 'opened' do nothing returning id into ev;
  select p.plan into plan from public.appraisal_vendor_plans p where p.chain_id = s.chain_id and p.email = em and p.superseded_at is null;
  select pl2.id into pl from public.prelistings pl2 join public.properties p on p.id = pl2.property_id
   where pl2.property_id = s.property_id and pl2.status <> 'closed' and pl2.created_at >= coalesce(p.cycle_at, '-infinity'::timestamptz)
     and lower(pl2.contact_email) = em and pl2.appraisal_id is not null and public.appraisal_chain_of(pl2.appraisal_id) = s.chain_id order by pl2.created_at desc limit 1;
  return jsonb_build_object('snapshot_id', s.id, 'chain_id', s.chain_id, 'version', s.version, 'sent_at', s.sent_at, 'sealed_at', s.sealed_at, 'seal_sha256', s.seal_sha256,
    'expires_at', s.sealed_at + interval '3 months', 'content', s.content, 'plan', plan, 'prelisting_id', pl, 'event_id', ev,
    'asked', exists (select 1 from public.appraisal_events e where e.snapshot_id = s.id and e.kind = 'update_asked' and e.actor = em),
    'newest', jsonb_build_object('snapshot_id', n.id, 'version', n.version, 'sent_at', n.sent_at));
end $$;
revoke all on function public.vendor_appraisal_read(uuid, integer) from public, anon;
grant execute on function public.vendor_appraisal_read(uuid, integer) to authenticated;

-- may the signed-in person have a short-lived link to this file? Only a file listed in a copy they may read (each version's permanent
-- link shows its own photos), asked by the repo-link function with the person's own token
create function public.appraisal_vendor_can_read(p_snapshot uuid, p_bucket text, p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_bucket, '') in ('appraisal-media', 'appraisal-video', 'property-files') and coalesce(p_path, '') <> '' and position('..' in p_path) = 0
     and exists (select 1 from public.appraisal_snapshots s where s.id = p_snapshot and public.appraisal_vendor_ok(s.id)
                  and s.paths @> jsonb_build_array(jsonb_build_object('bucket', p_bucket, 'path', p_path)))
$$;
revoke all on function public.appraisal_vendor_can_read(uuid, text, text) from public, anon;
grant execute on function public.appraisal_vendor_can_read(uuid, text, text) to authenticated;

-- "Ask for an updated appraisal": only once a copy is more than three months old (Tim: "the appraisal validity should expire after three
-- months as the market can move"); recorded once per person per version (appraisal_events_update_once), and Tim told once. Returns
-- {event_id (null when already asked), asked}.
create function public.vendor_appraisal_ask_update(p_snapshot uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.appraisal_snapshots; em text := lower(coalesce(auth.jwt()->>'email', '')); ev bigint;
begin
  if auth.uid() is null or em = '' or not public.appraisal_vendor_ok(p_snapshot) then raise exception 'Not found'; end if;
  select * into s from public.appraisal_snapshots where id = p_snapshot;
  if now() < s.sealed_at + interval '3 months' then raise exception 'This appraisal is still current'; end if;
  insert into public.appraisal_events (snapshot_id, chain_id, property_id, kind, actor, detail) values (s.id, s.chain_id, s.property_id, 'update_asked', em, jsonb_build_object('version', s.version))
    on conflict (snapshot_id, actor) where kind = 'update_asked' do nothing returning id into ev;
  return jsonb_build_object('event_id', ev, 'asked', true);
end $$;
revoke all on function public.vendor_appraisal_ask_update(uuid) from public, anon;
grant execute on function public.vendor_appraisal_ask_update(uuid) to authenticated;

-- "Check the seal" (Tim only): the fingerprint worked out again from the stored copy, against the one stored when it was sealed
create function public.agent_appraisal_seal_check(p_snapshot uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.appraisal_snapshots; now_sha text;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  select * into s from public.appraisal_snapshots where id = p_snapshot;
  if not found then raise exception 'Not found'; end if;
  now_sha := public.appraisal_seal_of(s.version, s.sealed_at, s.content, s.files);
  return jsonb_build_object('ok', now_sha = s.seal_sha256, 'stored', s.seal_sha256, 'computed', now_sha, 'version', s.version, 'sealed_at', s.sealed_at,
    'files', s.files, 'seal_text', public.appraisal_seal_text(s.version, s.sealed_at, s.content, s.files));
end $$;
revoke all on function public.agent_appraisal_seal_check(uuid) from public, anon;
grant execute on function public.agent_appraisal_seal_check(uuid) to authenticated;

-- "I'd like to proceed": the person's own Questions before we meet on this property, linked to this appraisal; made if there isn't one.
-- Returns {prelisting_id, event_id}.
create function public.vendor_appraisal_proceed(p_snapshot uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.appraisal_snapshots; em text := lower(coalesce(auth.jwt()->>'email', '')); pl public.prelistings; nm text; ev bigint; rng jsonb;
  plan_name text; addr text;
begin
  if auth.uid() is null or em = '' then raise exception 'Not found'; end if;
  select * into s from public.appraisal_snapshots where id = p_snapshot;
  if not found or s.id is distinct from public.appraisal_vendor_newest(s.chain_id) then raise exception 'Not found'; end if;
  select pl2.* into pl from public.prelistings pl2 join public.properties p on p.id = pl2.property_id
   where pl2.property_id = s.property_id and pl2.status <> 'closed' and pl2.created_at >= coalesce(p.cycle_at, '-infinity'::timestamptz)
     and lower(pl2.contact_email) = em order by pl2.created_at desc limit 1;
  if pl.id is null then
    select nullif(btrim(pp.legal_name), '') into nm from public.property_people pp where pp.property_id = s.property_id and pp.role in ('owner', 'contact') and lower(pp.email) = em order by pp.position limit 1;
    rng := (select q from jsonb_array_elements(coalesce(s.content->'fields'->'ranges', '[]'::jsonb)) q limit 1);
    select x->>'name' into plan_name from jsonb_array_elements(coalesce(s.content->'sections', '[]'::jsonb)) sec, jsonb_array_elements(coalesce(sec->'items', '[]'::jsonb)) x
     where sec->>'type' = 'plans' and (x->>'rec')::boolean is true limit 1;
    select address into addr from public.properties where id = s.property_id;
    insert into public.prelistings (address, contact_name, contact_email, property_id, appraisal_id, status, proceeded_at, appraisal)
      values (coalesce(nullif(addr, ''), s.content->>'address', ''), nm, em, s.property_id, s.appraisal_id, 'appraisal', now(),
        jsonb_strip_nulls(jsonb_build_object('price', case when rng is not null and jsonb_typeof(rng->'low') = 'number' and jsonb_typeof(rng->'high') = 'number'
            then '$' || to_char((rng->>'low')::numeric, 'FM999,999,999') || ' to $' || to_char((rng->>'high')::numeric, 'FM999,999,999') end,
          'method', s.content->'fields'->'method'->>'name', 'marketing', plan_name, 'from_appraisal', s.chain_id)))
      returning * into pl;
  elsif pl.appraisal_id is null then
    update public.prelistings set appraisal_id = s.appraisal_id where id = pl.id;
  end if;
  insert into public.appraisal_events (snapshot_id, chain_id, property_id, kind, actor, detail) values (s.id, s.chain_id, s.property_id, 'proceeded', em, jsonb_build_object('prelisting_id', pl.id))
    on conflict (chain_id, actor) where kind = 'proceeded' do nothing returning id into ev;
  return jsonb_build_object('prelisting_id', pl.id, 'event_id', ev);
end $$;
revoke all on function public.vendor_appraisal_proceed(uuid) from public, anon;
grant execute on function public.vendor_appraisal_proceed(uuid) to authenticated;

-- a marketing plan the vendor built ("Build your own" on the packages page), saved to their appraisal. The plan is the builder's
-- choice of catalogue items: {sel: {item: quantity}, band, total, on_request}. Returns {plan_id, event_id}.
create function public.vendor_appraisal_plan_save(p_snapshot uuid, p_plan jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.appraisal_snapshots; em text := lower(coalesce(auth.jwt()->>'email', '')); k text; v jsonb; pid uuid; ev bigint; clean jsonb := '{}'::jsonb; n int := 0;
begin
  if auth.uid() is null or em = '' then raise exception 'Not found'; end if;
  select * into s from public.appraisal_snapshots where id = p_snapshot;
  if not found or s.id is distinct from public.appraisal_vendor_newest(s.chain_id) then raise exception 'Not found'; end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' or jsonb_typeof(p_plan->'sel') is distinct from 'object' then raise exception 'That plan couldn''t be read. Build it again'; end if;
  for k, v in select * from jsonb_each(p_plan->'sel') loop
    n := n + 1;
    if n > 80 or k !~ '^[a-z0-9_]{1,40}$' or jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <> round((v #>> '{}')::numeric) or (v #>> '{}')::numeric not between 1 and 99 then
      raise exception 'That plan couldn''t be read. Build it again';
    end if;
    clean := clean || jsonb_build_object(k, (v #>> '{}')::int);
  end loop;
  if n = 0 then raise exception 'Choose at least one item for your plan'; end if;
  if jsonb_typeof(p_plan->'total') is distinct from 'number' or (p_plan->>'total')::numeric not between 0 and 1000000 then raise exception 'That plan couldn''t be read. Build it again'; end if;
  -- one current plan per person per appraisal, the earlier ones kept as superseded; at most 10 saves per person per version
  perform pg_advisory_xact_lock(hashtext('appraisal plan ' || s.chain_id::text || ' ' || em));
  if (select count(*) from public.appraisal_vendor_plans where snapshot_id = s.id and email = em) >= 10 then
    raise exception 'Your plan has been saved 10 times, which is as many as can be kept. Call or text Tim on 027 562 7207 to change it';
  end if;
  update public.appraisal_vendor_plans set superseded_at = now() where chain_id = s.chain_id and email = em and superseded_at is null;
  insert into public.appraisal_vendor_plans (snapshot_id, chain_id, property_id, email, user_id, plan)
    values (s.id, s.chain_id, s.property_id, em, auth.uid(), jsonb_strip_nulls(jsonb_build_object('sel', clean,
      'band', case when coalesce(p_plan->>'band', '') ~ '^[a-z0-9_]{1,40}$' then p_plan->>'band' end, 'total', round((p_plan->>'total')::numeric, 2),
      'on_request', case when jsonb_typeof(p_plan->'on_request') = 'number' and (p_plan->>'on_request')::numeric between 0 and 80 then (p_plan->>'on_request')::int end)))
    returning id into pid;
  -- Tim is told once per person per copy; later saves show on his Needs you item and the appraisal page (they read the current plan)
  insert into public.appraisal_events (snapshot_id, chain_id, property_id, kind, actor, detail) values (s.id, s.chain_id, s.property_id, 'plan_built', em, jsonb_build_object('plan_id', pid, 'total', round((p_plan->>'total')::numeric, 2)))
    on conflict (snapshot_id, actor) where kind = 'plan_built' do nothing returning id into ev;
  return jsonb_build_object('plan_id', pid, 'event_id', ev);
end $$;
revoke all on function public.vendor_appraisal_plan_save(uuid, jsonb) from public, anon;
grant execute on function public.vendor_appraisal_plan_save(uuid, jsonb) to authenticated;

-- the notify function asks, with the caller's own token, whether this event is theirs to report (a vendor's own event, not yet told)
create function public.appraisal_event_mine(p_event bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.appraisal_events e where e.id = p_event and e.kind <> 'sent' and e.notified_at is null
    and e.actor = lower(coalesce(auth.jwt()->>'email', '')))
$$;
revoke all on function public.appraisal_event_mine(bigint) from public, anon;
grant execute on function public.appraisal_event_mine(bigint) to authenticated;

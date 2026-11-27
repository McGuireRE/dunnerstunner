-- 036: their home as a mockup listing, What I heard from you, the ideal buyers, the header, a video introduction and Google
-- reviews (LW3 phase B, APPRAISAL-PLAN.md). Builds on 035 (live). Additive only: one new private storage bucket and new storage
-- policies, three new tables with their guards, new functions. No existing column, row, policy, function, trigger or signed-record
-- protection is changed or weakened. The sections a vendor reads stay in appraisal_views.sections, written by the portal from
-- appraisal_views.setup, so every row already there (phase A, C and C2, and the one loaded by hand) is untouched.
--
--   appraisal-video    a new private bucket for Tim's own header video and his video introduction (MP4, WebM or MOV, up to
--                      50 MB, matching the project's global upload limit). The header video is a short slow loop: a 4 to 12 second
--                      clip Tim picks, re-encoded small in his browser (Tim, 28 November 2026, 9:22am), so only that clip is stored.
--                      appraisal-media stays photos only, at 15 MB; a header photo and every video's still frame go there, under
--                      appraisals/<appraisal>/header/ or /intro/.
--   appraisal_assets   one header photo, header video or video introduction on one appraisal: where it is kept, its type and size
--                      (read from storage, never from the page), and a video's still frame (for paper and for reduced motion).
--                      Never changed once filed: Tim adds a new one and removes the old. Nothing changes once the appraisal is sent.
--   appraisal_drafts   what the AI drafted (the advertisement, What I heard from you, the ideal buyers), with the keys (never the
--                      values) of what it was given. Written only by the doc-prefill function (service role, appraisal_draft_save),
--                      which refuses a draft made from the client heart. Tim edits and ticks each line; only ticked lines reach the
--                      sections a vendor reads.
--   tim_reviews        Tim's Google reviews from his "Tim McGuire" Business profile (never the "McGuire" one), from the monthly pack
--                      mre.reviews/1 (APPRAISAL-PLAN.md). Reviewer first name or initial only. New and changed reviews arrive
--                      unticked; only ticked ones show on an appraisal. A review gone from Google is kept, unticked, marked removed.
--
-- Row Level Security on every new table: Tim only (is_agent()). appraisal_drafts and tim_reviews are written only through the functions
-- here. Vendors and anon get nothing (the vendor's own view comes in phase E). Every function sets its search_path; the agent ones
-- check is_agent() and are granted to signed-in users only; the service-role one is revoked from public, anon and authenticated.

-- ═══════════════ the video bucket and the header and introduction folders ═══════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('appraisal-video', 'appraisal-video', false, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do nothing;
create policy appraisal_video_agent_read on storage.objects for select to authenticated using (bucket_id = 'appraisal-video' and public.is_agent());
create policy appraisal_video_agent_add on storage.objects for insert to authenticated with check (bucket_id = 'appraisal-video' and public.is_agent()
  and (storage.foldername(name))[1] = 'appraisals' and (storage.foldername(name))[3] = any (array['header', 'intro'])
  and exists (select 1 from public.appraisal_views v where v.id::text = (storage.foldername(name))[2] and v.status <> 'sent'));
create policy appraisal_video_agent_remove on storage.objects for delete to authenticated using (bucket_id = 'appraisal-video' and public.is_agent()
  and not exists (select 1 from public.appraisal_views v where v.id::text = (storage.foldername(objects.name))[2] and v.status = 'sent'));
-- a header photo and the still frames, beside the comparables' photos (the 034 policy for comps/ is unchanged). Both add policies need
-- the folder to name an appraisal that exists and isn't sent.
create policy appraisal_media_agent_add_header on storage.objects for insert to authenticated with check (bucket_id = 'appraisal-media' and public.is_agent()
  and (storage.foldername(name))[1] = 'appraisals' and (storage.foldername(name))[3] = any (array['header', 'intro'])
  and exists (select 1 from public.appraisal_views v where v.id::text = (storage.foldername(name))[2] and v.status <> 'sent'));

-- ═══════════════ the header and the video introduction ═══════════════
create table public.appraisal_assets (
  id uuid primary key default gen_random_uuid(),
  appraisal_id uuid not null references public.appraisal_views(id) on delete cascade,
  role text not null check (role in ('header', 'intro')),
  kind text not null check (kind in ('image', 'video')),
  bucket text not null check (bucket in ('appraisal-media', 'appraisal-video')),
  path text not null unique check (length(path) <= 500),
  still_path text unique check (length(still_path) <= 500),
  file_name text not null default '' check (length(file_name) <= 200),
  mime_type text,
  size_bytes bigint,
  still_mime text,
  width integer check (width > 0),
  height integer check (height > 0),
  duration_s numeric(8,1) check (duration_s >= 0 and duration_s < 86400),
  created_by text not null default coalesce(auth.jwt()->>'email', ''),
  created_at timestamptz not null default now(),
  check (role <> 'intro' or kind = 'video')
);
create index appraisal_assets_appraisal_idx on public.appraisal_assets (appraisal_id, role);
alter table public.appraisal_assets enable row level security;
create policy appraisal_assets_agent_read on public.appraisal_assets for select to authenticated using (public.is_agent());
create policy appraisal_assets_agent_add on public.appraisal_assets for insert to authenticated with check (public.is_agent());
create policy appraisal_assets_agent_remove on public.appraisal_assets for delete to authenticated using (public.is_agent());
revoke all on public.appraisal_assets from anon;
revoke update, truncate, trigger, references on public.appraisal_assets from authenticated;

-- a file sits in its own appraisal's folder for its role, is in storage already in the right bucket (its type and size are read from
-- storage), is a photo (JPEG, PNG, WebP) or a video (MP4, WebM, MOV, up to 50 MB); a video's still frame is a photo in the same
-- folder. Once filed it never changes; nothing is added or removed once the appraisal is sent.
create function public.guard_appraisal_asset() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') and exists (select 1 from public.appraisal_views v where v.id = old.appraisal_id and v.status = 'sent') then
    raise exception 'This appraisal has been sent, and a sent copy never changes';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' then raise exception 'A header or video, once filed, never changes. Add a new one instead'; end if;
  if exists (select 1 from public.appraisal_views v where v.id = new.appraisal_id and v.status = 'sent') then
    raise exception 'This appraisal has been sent, and a sent copy never changes';
  end if;
  if new.path not like 'appraisals/' || new.appraisal_id::text || '/' || new.role || '/%' or new.path like '%..%'
     or (new.still_path is not null and (new.still_path not like 'appraisals/' || new.appraisal_id::text || '/' || new.role || '/%' or new.still_path like '%..%')) then
    raise exception 'A file must sit in its own appraisal''s folder';
  end if;
  if (new.kind = 'image') is distinct from (new.bucket = 'appraisal-media') then raise exception 'A photo goes in appraisal-media and a video in appraisal-video'; end if;
  select o.metadata into m from storage.objects o where o.bucket_id = new.bucket and o.name = new.path limit 1;
  if not found then raise exception 'The file isn''t in storage yet. Try again'; end if;
  new.mime_type := m->>'mimetype';
  new.size_bytes := nullif(m->>'size', '')::bigint;
  if new.kind = 'image' and (new.mime_type is null or new.mime_type not in ('image/jpeg', 'image/png', 'image/webp')) then raise exception 'Photos must be JPEG, PNG or WebP'; end if;
  if new.kind = 'video' and (new.mime_type is null or new.mime_type not in ('video/mp4', 'video/webm', 'video/quicktime')) then raise exception 'Videos must be MP4, WebM or MOV'; end if;
  if new.kind = 'video' and coalesce(new.size_bytes, 0) > 52428800 then raise exception 'Videos over 50 MB are refused'; end if;
  new.still_mime := null;
  if new.still_path is not null then
    if new.kind <> 'video' then raise exception 'Only a video has a still frame'; end if;
    select o.metadata into m from storage.objects o where o.bucket_id = 'appraisal-media' and o.name = new.still_path limit 1;
    if not found then raise exception 'The still frame isn''t in storage yet. Try again'; end if;
    new.still_mime := m->>'mimetype';
    if new.still_mime is null or new.still_mime not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'A still frame must be JPEG, PNG or WebP'; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_appraisal_asset() from public, anon, authenticated;
create trigger appraisal_assets_guard before insert or update or delete on public.appraisal_assets for each row execute function public.guard_appraisal_asset();

-- ═══════════════ what the AI drafted ═══════════════
create table public.appraisal_drafts (
  id uuid primary key default gen_random_uuid(),
  appraisal_id uuid not null references public.appraisal_views(id) on delete cascade,
  part text not null check (part in ('ad', 'heard', 'buyers')),
  result jsonb not null check (jsonb_typeof(result) = 'object' and length(result::text) <= 50000),
  inputs jsonb not null default '{}'::jsonb check (jsonb_typeof(inputs) = 'object' and length(inputs::text) <= 20000),
  model text not null check (length(model) between 1 and 100),
  made_by text not null check (length(made_by) between 1 and 254),
  made_at timestamptz not null default now()
);
create index appraisal_drafts_appraisal_idx on public.appraisal_drafts (appraisal_id, part, made_at);
alter table public.appraisal_drafts enable row level security;
create policy appraisal_drafts_agent_read on public.appraisal_drafts for select to authenticated using (public.is_agent());
revoke all on public.appraisal_drafts from anon;
revoke insert, update, delete, truncate, trigger, references on public.appraisal_drafts from authenticated;
-- a draft never changes and is kept with its appraisal; none is added to a sent appraisal
create function public.guard_appraisal_draft() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then raise exception 'A draft is kept as it was made'; end if;
  if tg_op = 'DELETE' then
    if exists (select 1 from public.appraisal_views v where v.id = old.appraisal_id) then raise exception 'A draft is kept as it was made'; end if;
    return old;
  end if;
  if exists (select 1 from public.appraisal_views v where v.id = new.appraisal_id and v.status = 'sent') then
    raise exception 'This appraisal has been sent, and a sent copy never changes';
  end if;
  return new;
end $$;
revoke all on function public.guard_appraisal_draft() from public, anon, authenticated;
create trigger appraisal_drafts_guard before insert or update or delete on public.appraisal_drafts for each row execute function public.guard_appraisal_draft();

-- the draft, saved by doc-prefill (service role) with who asked for it. The appraisal is written from its set-up and not sent; inputs
-- lists the question keys and fact keys sent (never their values), and the client heart is never among them.
create function public.appraisal_draft_save(p_appraisal uuid, p_part text, p_result jsonb, p_inputs jsonb, p_model text, p_actor text) returns uuid
language plpgsql security definer set search_path = public as $$
declare a public.appraisal_views; rid uuid; inp jsonb := coalesce(p_inputs, '{}'::jsonb);
begin
  select * into a from public.appraisal_views where id = p_appraisal;
  if not found then raise exception 'Appraisal not found'; end if;
  if a.status = 'sent' then raise exception 'This appraisal has been sent, and a sent copy never changes'; end if;
  if not (coalesce(a.setup, '{}'::jsonb) ? 'v') then raise exception 'This appraisal was loaded by hand, so it has no sections to draft'; end if;
  if p_part is null or p_part not in ('ad', 'heard', 'buyers') then raise exception 'Not a part that is drafted'; end if;
  if p_result is null or jsonb_typeof(p_result) <> 'object' then raise exception 'Not a draft'; end if;
  if jsonb_typeof(inp) <> 'object' or (inp ? 'questions' and jsonb_typeof(inp->'questions') <> 'array') or (inp ? 'facts' and jsonb_typeof(inp->'facts') <> 'array') then
    raise exception 'Not a list of what was sent';
  end if;
  if coalesce(inp->'questions', '[]'::jsonb) ? 'client_heart' then raise exception 'The client heart is never sent to the AI'; end if;
  insert into public.appraisal_drafts (appraisal_id, part, result, inputs, model, made_by)
    values (p_appraisal, p_part, p_result, inp, left(coalesce(p_model, ''), 100), left(coalesce(nullif(trim(p_actor), ''), 'agent'), 254))
    returning id into rid;
  return rid;
end $$;
revoke all on function public.appraisal_draft_save(uuid, text, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.appraisal_draft_save(uuid, text, jsonb, jsonb, text, text) to service_role;

-- ═══════════════ Tim's Google reviews ═══════════════
create table public.tim_reviews (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'google' check (source in ('google')),
  profile text not null check (profile = 'Tim McGuire'),
  ref text not null check (length(ref) between 1 and 400),
  reviewer text not null check (reviewer ~ '^[[:alpha:]][[:alpha:]''-]{0,29}\.?( [[:alpha:]]\.?)?$'),
  rating smallint not null check (rating between 1 and 5),
  reviewed_on date not null,
  body text not null default '' check (length(body) <= 4000),
  url text check (url ~ '^https://[^[:space:]]+$' and length(url) <= 1000),
  ticked boolean not null default false,
  ticked_at timestamptz,
  ticked_by text,
  removed_at timestamptz,
  gathered_at timestamptz not null,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, ref)
);
alter table public.tim_reviews enable row level security;
create policy tim_reviews_agent_read on public.tim_reviews for select to authenticated using (public.is_agent());
revoke all on public.tim_reviews from anon;
revoke insert, update, delete, truncate, trigger, references on public.tim_reviews from authenticated;

-- the monthly pack (mre.reviews/1): each review matched by its ref, else its link, else the reviewer and the date. A new review arrives
-- unticked; a review whose words, stars or date changed is updated and unticked, so Tim checks it again; one the same is left alone.
-- With "complete": true, any review not in the pack has gone from Google: it is kept, unticked and marked removed. A review the pack
-- gets wrong is skipped with the reason; the rest import. Text is data: stored as given (control characters out), drawn escaped.
create function public.agent_reviews_import(p_pack jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rv jsonb; i int := 0; d_at timestamptz; added int := 0; updated int := 0; same int := 0; removed int := 0; skipped jsonb := '[]'::jsonb;
  v_ref text; v_name text; v_rating numeric; v_date date; v_body text; v_url text; ex public.tim_reviews; seen text[] := '{}'; prof text;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if p_pack is null or jsonb_typeof(p_pack) <> 'object' or p_pack->>'format' is distinct from 'mre.reviews/1' then
    raise exception 'That isn''t a reviews pack (format mre.reviews/1)';
  end if;
  prof := public.appraisal_pack_text(p_pack->'profile', 100);
  if prof is distinct from 'Tim McGuire' then raise exception 'Only reviews from the "Tim McGuire" Google profile are imported, never the "McGuire" one'; end if;
  if coalesce(lower(public.appraisal_pack_text(p_pack->'source', 20)), 'google') <> 'google' then raise exception 'Only Google reviews are imported'; end if;
  if length(p_pack::text) > 2000000 then raise exception 'That pack is too big to import at once'; end if;
  if jsonb_typeof(p_pack->'reviews') is distinct from 'array' then raise exception 'The pack has no list of reviews'; end if;
  if jsonb_array_length(p_pack->'reviews') > 500 then raise exception 'At most 500 reviews in one pack'; end if;
  d_at := coalesce(public.appraisal_pack_ts(p_pack->'gathered_at'), now());
  for rv in select value from jsonb_array_elements(p_pack->'reviews') loop
    i := i + 1;
    begin
      if jsonb_typeof(rv) <> 'object' then raise exception 'not a review'; end if;
      v_name := regexp_replace(coalesce(public.appraisal_pack_text(rv->'reviewer', 60), ''), '\s+', ' ', 'g');
      if v_name = '' then raise exception 'no reviewer'; end if;
      if v_name !~ '^[[:alpha:]][[:alpha:]''-]{0,29}\.?( [[:alpha:]]\.?)?$' then raise exception 'the reviewer must be a first name or an initial only'; end if;
      v_rating := public.appraisal_pack_num(rv->'rating', 1, 5, 'rating');
      if v_rating is null or v_rating <> round(v_rating) then raise exception 'rating must be a whole number of stars, 1 to 5'; end if;
      v_date := public.appraisal_pack_date(rv->'date', 'date');
      if v_date is null then raise exception 'no date'; end if;
      if v_date > (now() at time zone 'Pacific/Auckland')::date + 1 then raise exception 'the date is in the future'; end if;
      v_body := coalesce(public.appraisal_pack_text(rv->'text', 4000), '');
      v_url := public.appraisal_pack_url(rv->'link');
      if rv ? 'link' and public.appraisal_pack_text(rv->'link', 2000) is not null and v_url is null then raise exception 'the link must start with https://'; end if;
      v_ref := coalesce(public.appraisal_pack_text(rv->'ref', 400), v_url, lower(v_name) || '|' || v_date::text);
      if v_ref = any (seen) then raise exception 'the same review is in the pack twice'; end if;
      seen := seen || v_ref;
      select * into ex from public.tim_reviews where source = 'google' and ref = v_ref;
      if not found and v_url is not null then select * into ex from public.tim_reviews where source = 'google' and url = v_url order by imported_at limit 1; end if;
      if ex.id is not null then
        seen := seen || ex.ref;
        if ex.body is distinct from v_body or ex.rating is distinct from v_rating::smallint or ex.reviewed_on is distinct from v_date or ex.removed_at is not null then
          update public.tim_reviews set body = v_body, rating = v_rating::smallint, reviewed_on = v_date, reviewer = v_name, url = coalesce(v_url, url), removed_at = null,
            ticked = false, ticked_at = null, ticked_by = null, gathered_at = coalesce(public.appraisal_pack_ts(rv->'gathered_at'), d_at), updated_at = now() where id = ex.id;
          updated := updated + 1;
        else
          update public.tim_reviews set gathered_at = coalesce(public.appraisal_pack_ts(rv->'gathered_at'), d_at), url = coalesce(v_url, url) where id = ex.id;
          same := same + 1;
        end if;
      else
        insert into public.tim_reviews (source, profile, ref, reviewer, rating, reviewed_on, body, url, gathered_at)
          values ('google', 'Tim McGuire', v_ref, v_name, v_rating::smallint, v_date, v_body, v_url, coalesce(public.appraisal_pack_ts(rv->'gathered_at'), d_at));
        added := added + 1;
      end if;
      ex := null;
    exception when others then
      skipped := skipped || jsonb_build_object('n', i, 'why', sqlerrm);
    end;
  end loop;
  if lower(coalesce(p_pack->>'complete', '')) = 'true' and jsonb_array_length(skipped) = 0 then
    update public.tim_reviews set removed_at = now(), ticked = false, ticked_at = null, ticked_by = null, updated_at = now()
      where source = 'google' and removed_at is null and not (ref = any (seen));
    get diagnostics removed = row_count;
  end if;
  return jsonb_build_object('added', added, 'updated', updated, 'unchanged', same, 'removed', removed, 'skipped', skipped);
end $$;
revoke all on function public.agent_reviews_import(jsonb) from public, anon;
grant execute on function public.agent_reviews_import(jsonb) to authenticated;

-- Tim ticks (or unticks) a review to show on his appraisals. A review gone from Google, or one whose words a vendor may not read
-- ("as is", fee or commission), can't be ticked.
create function public.agent_review_tick(p_id uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.tim_reviews; prob text;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  select * into r from public.tim_reviews where id = p_id for update;
  if not found then raise exception 'Review not found'; end if;
  if coalesce(p_on, false) then
    if r.removed_at is not null then raise exception 'This review is no longer on your Google profile, so it can''t be shown'; end if;
    prob := public.appraisal_wording_problem(to_jsonb(r.body));
    if prob <> '' then raise exception 'This review mentions a fee or ''as is'', so it can''t be shown on an appraisal'; end if;
  end if;
  update public.tim_reviews set ticked = coalesce(p_on, false), ticked_at = case when coalesce(p_on, false) then now() end,
    ticked_by = case when coalesce(p_on, false) then coalesce(auth.jwt()->>'email', 'agent') end, updated_at = now()
    where id = p_id returning * into r;
  return jsonb_build_object('id', r.id, 'ticked', r.ticked);
end $$;
revoke all on function public.agent_review_tick(uuid, boolean) from public, anon;
grant execute on function public.agent_review_tick(uuid, boolean) to authenticated;

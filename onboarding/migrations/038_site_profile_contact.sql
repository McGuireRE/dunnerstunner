-- 038: the appraisal's additions (Tim, 28 November 2026). Additive only; nothing existing is dropped or loosened.
--   1. Drafting how each comparable compares with the vendor's home: appraisal_drafts takes the part 'compare' (Sonnet, through
--      doc-prefill's appraisal_draft mode, saved by appraisal_draft_save as the other parts are).
--   2. site_profile: one row, Tim's About and contact for every page (his picture, name and licence line, phone, email, the two
--      About tabs, and the ways to reach him, each on or off and in his order). Tim edits it through agent_site_profile_save; anyone,
--      signed in or not, reads only what is public through site_profile_public().
--   3. The site-public storage bucket: public read (the profile picture and the About images only), agent-only writes, photos only.
--   4. contact_messages: "Send a message" from the About overlay. A signed-in person sends through contact_send (bounded lengths,
--      five a day each); Tim reads them on Needs you and marks them done; notify emails Tim once per message (contact_mark_emailed,
--      service role only). Never to anyone but Tim. People who aren't signed in see Call, Text and Email, not the form.
-- 037 belongs to the send branch (lw3e-appraisal-send); this migration touches none of its objects.

-- ═══════════════ 1. the comparison drafts ═══════════════
alter table public.appraisal_drafts drop constraint if exists appraisal_drafts_part_check;
alter table public.appraisal_drafts add constraint appraisal_drafts_part_check check (part in ('ad', 'heard', 'buyers', 'compare'));
create or replace function public.appraisal_draft_save(p_appraisal uuid, p_part text, p_result jsonb, p_inputs jsonb, p_model text, p_actor text) returns uuid
language plpgsql security definer set search_path = public as $$
declare a public.appraisal_views; rid uuid; inp jsonb := coalesce(p_inputs, '{}'::jsonb);
begin
  select * into a from public.appraisal_views where id = p_appraisal;
  if not found then raise exception 'Appraisal not found'; end if;
  if a.status = 'sent' then raise exception 'This appraisal has been sent, and a sent copy never changes'; end if;
  if not (coalesce(a.setup, '{}'::jsonb) ? 'v') then raise exception 'This appraisal was loaded by hand, so it has no sections to draft'; end if;
  if p_part is null or p_part not in ('ad', 'heard', 'buyers', 'compare') then raise exception 'Not a part that is drafted'; end if;
  if p_result is null or jsonb_typeof(p_result) <> 'object' then raise exception 'Not a draft'; end if;
  if jsonb_typeof(inp) <> 'object' or (inp ? 'questions' and jsonb_typeof(inp->'questions') <> 'array') or (inp ? 'facts' and jsonb_typeof(inp->'facts') <> 'array') then
    raise exception 'Not a list of what was sent';
  end if;
  if coalesce(inp->'questions', '[]'::jsonb) ? 'client_heart' then raise exception 'The client heart is never sent to the AI'; end if;
  -- a comparison names the comparable it is about, and that comparable is on this appraisal
  if p_part = 'compare' and not exists (select 1 from public.appraisal_comps c where c.appraisal_id = p_appraisal and c.id::text = coalesce(inp->>'comp', '')) then
    raise exception 'That comparable is not on this appraisal';
  end if;
  insert into public.appraisal_drafts (appraisal_id, part, result, inputs, model, made_by)
    values (p_appraisal, p_part, p_result, inp, left(coalesce(p_model, ''), 100), left(coalesce(nullif(trim(p_actor), ''), 'agent'), 254))
    returning id into rid;
  return rid;
end $$;
revoke all on function public.appraisal_draft_save(uuid, text, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.appraisal_draft_save(uuid, text, jsonb, jsonb, text, text) to service_role;

-- ═══════════════ 2. Tim's About and contact, one row for every page ═══════════════
create table public.site_profile (
  id boolean primary key default true check (id),
  name text not null default '' check (length(name) <= 80),
  licence text not null default '' check (length(licence) <= 160),
  phone text not null default '' check (length(phone) <= 30),
  email text not null default '' check (length(email) <= 254),
  photo_path text check (photo_path is null or (photo_path ~ '^profile/[A-Za-z0-9._-]{1,80}$')),
  about jsonb not null default '{}'::jsonb check (jsonb_typeof(about) = 'object' and length(about::text) <= 20000),
  channels jsonb not null default '[]'::jsonb check (jsonb_typeof(channels) = 'array' and jsonb_array_length(channels) <= 12),
  updated_by text,
  updated_at timestamptz not null default now()
);
-- seeded with the phone and email the vendor pages already use; the About tabs and the picture start empty (Tim writes his own)
insert into public.site_profile (id, name, phone, email, channels) values (true, 'Tim McGuire', '027 562 7207', 'tim@mcguire.co.nz',
  '[{"key":"call","on":true},{"key":"text","on":true},{"key":"email","on":true},{"key":"form","on":true},{"key":"whatsapp","on":false,"value":""},{"key":"messenger","on":false,"value":""},{"key":"discord","on":false,"value":""},{"key":"telegram","on":false,"value":""},{"key":"signal","on":false,"value":""}]'::jsonb)
on conflict (id) do nothing;
alter table public.site_profile enable row level security;
create policy site_profile_agent_read on public.site_profile for select to authenticated using (public.is_agent());
revoke all on public.site_profile from anon;
revoke insert, update, delete, truncate, trigger, references on public.site_profile from authenticated;

-- a channel's value, checked the way its service writes links (the page builds the link itself; nothing pasted is used as a link)
create function public.site_channel_value_ok(p_key text, p_value text) returns boolean language sql immutable set search_path = public as $$
  select case p_key
    when 'whatsapp' then p_value ~ '^\+?[0-9 ]{8,20}$'
    when 'signal' then p_value ~ '^\+?[0-9 ]{8,20}$'
    when 'messenger' then p_value ~ '^[A-Za-z0-9.]{3,50}$'
    when 'telegram' then p_value ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$'
    when 'discord' then p_value ~ '^[A-Za-z0-9-]{2,32}$'
    else coalesce(p_value, '') = '' end
$$;
revoke all on function public.site_channel_value_ok(text, text) from public, anon, authenticated;

create function public.agent_site_profile_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ch jsonb; seen text[] := '{}'; k text; v text; pic text := nullif(p->>'photo_path', ''); tab text; out_about jsonb := '{}'::jsonb; t jsonb;
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Nothing to save'; end if;
  if coalesce(p->>'email', '') <> '' and (p->>'email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That email address does not look right'; end if;
  if coalesce(p->>'phone', '') <> '' and (p->>'phone') !~ '^\+?[0-9 ()-]{6,30}$' then raise exception 'That phone number does not look right'; end if;
  if jsonb_typeof(coalesce(p->'channels', '[]'::jsonb)) <> 'array' then raise exception 'Not a list of ways to reach you'; end if;
  for ch in select value from jsonb_array_elements(coalesce(p->'channels', '[]'::jsonb)) loop
    k := ch->>'key'; v := btrim(coalesce(ch->>'value', ''));
    if k is null or k not in ('call', 'text', 'email', 'form', 'whatsapp', 'messenger', 'discord', 'telegram', 'signal') then raise exception 'Not a way to reach you: %', coalesce(k, ''); end if;
    if k = any (seen) then raise exception 'Each way to reach you once'; end if;
    seen := seen || k;
    if k in ('whatsapp', 'messenger', 'discord', 'telegram', 'signal') and v <> '' and not public.site_channel_value_ok(k, v) then raise exception 'That % detail does not look right', k; end if;
  end loop;
  foreach tab in array array['tim', 'agency'] loop
    t := coalesce(p->'about'->tab, '{}'::jsonb);
    if jsonb_typeof(t) <> 'object' then raise exception 'Not an About section'; end if;
    if coalesce(t->>'image_path', '') <> '' and (t->>'image_path') !~ '^about/[A-Za-z0-9._-]{1,80}$' then raise exception 'That About image is not in its folder'; end if;
    out_about := out_about || jsonb_build_object(tab, jsonb_build_object('heading', left(btrim(coalesce(t->>'heading', '')), 120), 'body', left(btrim(coalesce(t->>'body', '')), 6000), 'image_path', nullif(t->>'image_path', '')));
  end loop;
  update public.site_profile set name = left(btrim(coalesce(p->>'name', '')), 80), licence = left(btrim(coalesce(p->>'licence', '')), 160), phone = left(btrim(coalesce(p->>'phone', '')), 30),
    email = left(btrim(coalesce(p->>'email', '')), 254), photo_path = pic, about = out_about,
    channels = (select coalesce(jsonb_agg(jsonb_build_object('key', e->>'key', 'on', coalesce((e->>'on')::boolean, false), 'value', btrim(coalesce(e->>'value', ''))) order by o), '[]'::jsonb)
                from jsonb_array_elements(coalesce(p->'channels', '[]'::jsonb)) with ordinality as x(e, o)),
    updated_by = coalesce(auth.jwt()->>'email', 'agent'), updated_at = now()
  where id;
  return (select to_jsonb(s) - 'updated_by' from public.site_profile s where id);
end $$;
revoke all on function public.agent_site_profile_save(jsonb) from public, anon;
grant execute on function public.agent_site_profile_save(jsonb) to authenticated;

-- what every page may show: only what is public, and only ways to reach him that are on and complete
create function public.site_profile_public() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', s.name, 'licence', s.licence, 'phone', s.phone, 'email', s.email, 'photo_path', s.photo_path, 'about', s.about,
    'channels', coalesce((select jsonb_agg(jsonb_build_object('key', e->>'key', 'value', coalesce(e->>'value', '')) order by o) from jsonb_array_elements(s.channels) with ordinality as x(e, o)
      where coalesce((e->>'on')::boolean, false)
        and case e->>'key' when 'call' then s.phone <> '' when 'text' then s.phone <> '' when 'email' then s.email <> '' when 'form' then true
          else coalesce(e->>'value', '') <> '' and public.site_channel_value_ok(e->>'key', e->>'value') end), '[]'::jsonb))
  from public.site_profile s where s.id
$$;
revoke all on function public.site_profile_public() from public;
grant execute on function public.site_profile_public() to anon, authenticated;

-- ═══════════════ 3. the public images: the profile picture and the About images, nothing else ═══════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-public', 'site-public', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy site_public_agent_add on storage.objects for insert to authenticated with check (bucket_id = 'site-public' and public.is_agent()
  and (storage.foldername(name))[1] = any (array['profile', 'about']));
create policy site_public_agent_update on storage.objects for update to authenticated using (bucket_id = 'site-public' and public.is_agent())
  with check (bucket_id = 'site-public' and public.is_agent() and (storage.foldername(name))[1] = any (array['profile', 'about']));
create policy site_public_agent_remove on storage.objects for delete to authenticated using (bucket_id = 'site-public' and public.is_agent());

-- ═══════════════ 4. "Send a message" ═══════════════
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  from_email text not null check (length(from_email) between 3 and 254),
  name text not null check (length(btrim(name)) between 1 and 80),
  phone text not null default '' check (length(phone) <= 30),
  preferred text not null default 'email' check (preferred in ('call', 'text', 'email')),
  message text not null check (length(btrim(message)) between 1 and 1000),
  appraisal_id uuid references public.appraisal_views(id) on delete set null,
  page text not null default '' check (length(page) <= 200),
  sent_at timestamptz not null default now(),
  emailed_at timestamptz,
  done_at timestamptz,
  done_by text
);
create index contact_messages_from_idx on public.contact_messages (lower(from_email), sent_at);
alter table public.contact_messages enable row level security;
create policy contact_messages_agent_read on public.contact_messages for select to authenticated using (public.is_agent());
revoke all on public.contact_messages from anon;
revoke insert, update, delete, truncate, trigger, references on public.contact_messages from authenticated;

-- a signed-in person sends a message to Tim: their own email (from their sign-in), bounded lengths, five a day each
create function public.contact_send(p_name text, p_phone text, p_message text, p_preferred text, p_appraisal uuid, p_page text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me text := lower(coalesce(auth.jwt()->>'email', '')); rid uuid;
begin
  if me = '' then raise exception 'Sign in to send a message'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 80 then raise exception 'Add your name (up to 80 letters)'; end if;
  if length(btrim(coalesce(p_message, ''))) not between 1 and 1000 then raise exception 'Write your message (up to 1,000 letters)'; end if;
  if coalesce(p_phone, '') <> '' and p_phone !~ '^\+?[0-9 ()-]{6,30}$' then raise exception 'That phone number does not look right'; end if;
  if coalesce(p_preferred, 'email') not in ('call', 'text', 'email') then raise exception 'Choose how Tim should reply'; end if;
  if (select count(*) from public.contact_messages m where lower(m.from_email) = me and m.sent_at > now() - interval '24 hours') >= 5 then
    raise exception 'You have sent five messages today. Please call or text Tim instead';
  end if;
  insert into public.contact_messages (from_email, name, phone, preferred, message, appraisal_id, page)
    values (me, btrim(p_name), btrim(coalesce(p_phone, '')), coalesce(p_preferred, 'email'), btrim(p_message),
      case when p_appraisal is not null and exists (select 1 from public.appraisal_views v where v.id = p_appraisal) then p_appraisal end, left(coalesce(p_page, ''), 200))
    returning id into rid;
  return rid;
end $$;
revoke all on function public.contact_send(text, text, text, text, uuid, text) from public, anon;
grant execute on function public.contact_send(text, text, text, text, uuid, text) to authenticated;

-- Tim marks a message done (it leaves Needs you)
create function public.agent_contact_done(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_agent() then raise exception 'Agent only'; end if;
  update public.contact_messages set done_at = now(), done_by = coalesce(auth.jwt()->>'email', 'agent') where id = p_id and done_at is null;
end $$;
revoke all on function public.agent_contact_done(uuid) from public, anon;
grant execute on function public.agent_contact_done(uuid) to authenticated;

-- notify (service role) takes the message to email Tim, once: the first call gets the row, any later call gets nothing
create function public.contact_mark_emailed(p_id uuid, p_from text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.contact_messages;
begin
  update public.contact_messages set emailed_at = now() where id = p_id and emailed_at is null and lower(from_email) = lower(coalesce(p_from, '')) returning * into r;
  if not found then return null; end if;
  return to_jsonb(r);
end $$;
revoke all on function public.contact_mark_emailed(uuid, text) from public, anon, authenticated;
grant execute on function public.contact_mark_emailed(uuid, text) to service_role;

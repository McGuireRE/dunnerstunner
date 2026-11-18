-- 017 Wellbeing: Tim's personal wellbeing tracker at packages.dunnerstunner.co.nz/wellbeing. Applied 19 November 2026.
-- Additive only: one new table. Nothing existing is changed.
-- Each row is one saved item (the settings, or one day's entries), owned by the signed-in agent.
-- Only that agent can read or write their own rows; vendors and the public can't reach the table.

create table public.wellbeing_docs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path text not null check (path ~ '^(config/main|days/[0-9]{4}-[0-9]{2}-[0-9]{2})$'),
  body jsonb not null check (jsonb_typeof(body) = 'object' and pg_column_size(body) < 65536),
  updated_at timestamptz not null default now(),
  primary key (user_id, path)
);

create or replace function public.wellbeing_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger wellbeing_touch before insert or update on public.wellbeing_docs
  for each row execute function public.wellbeing_touch();

alter table public.wellbeing_docs enable row level security;
revoke all on public.wellbeing_docs from public, anon;
grant select, insert, update, delete on public.wellbeing_docs to authenticated;
create policy wb_own on public.wellbeing_docs for all to authenticated
  using (user_id = auth.uid() and public.is_agent())
  with check (user_id = auth.uid() and public.is_agent());

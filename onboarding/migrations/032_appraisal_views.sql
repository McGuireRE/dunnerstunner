-- 032: appraisal views. One presentable appraisal per row, for Tim to show on screen (portal only, Tim only).
-- The seed of the full Appraisal page: a generic record, not tied to any one property. Additive only: one new table, its policies
-- and one trigger on it. No existing table, function, trigger or signed-record protection is changed.
--
--   sections  jsonb array: the report's wording, in order. Each item has a type the portal knows how to draw:
--             heading, para, list, table, note, ranges, method, wave, methods. Text may hold **bold**, [words](https://link) and
--             tokens the portal fills from fields: {{range:<key>}}, {{bedrooms}}, {{method}}.
--   fields    jsonb object: the parts Tim edits after his walk-through:
--             ranges   [{ key, option, involves, low, high }]  (whole dollars)
--             bedrooms text, as it should read
--             method   { name, text }  (the recommended sale method and the sentence that recommends it)
--   property_id is optional: an appraisal can come before the property file exists.
--
-- Row Level Security: Tim (is_agent()) reads, adds and changes rows. Nobody deletes a row from the app. Nothing for vendors or anon.

create table public.appraisal_views (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete set null,
  title text not null default '',
  address text not null default '',
  prepared_for text not null default '',
  prepared_on date,
  status text not null default 'draft' check (status in ('draft', 'presented', 'archived')),
  sections jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  fields jsonb not null default '{}'::jsonb check (jsonb_typeof(fields) = 'object'),
  created_by text not null default coalesce(auth.jwt()->>'email', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index appraisal_views_property_idx on public.appraisal_views (property_id);

alter table public.appraisal_views enable row level security;
create policy appraisal_views_agent_select on public.appraisal_views for select to authenticated using (public.is_agent());
create policy appraisal_views_agent_insert on public.appraisal_views for insert to authenticated with check (public.is_agent());
create policy appraisal_views_agent_update on public.appraisal_views for update to authenticated using (public.is_agent()) with check (public.is_agent());

revoke all on public.appraisal_views from anon;
revoke delete, truncate, trigger, references on public.appraisal_views from authenticated;

create trigger appraisal_views_touch before update on public.appraisal_views for each row execute function public.touch_updated();

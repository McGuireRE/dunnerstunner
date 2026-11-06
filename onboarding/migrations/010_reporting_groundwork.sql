-- Phase 5: groundwork for the vendor reporting portal. Data structures only: no vendor screen reads these, and Tim's
-- entry forms come later. Three new tables (campaign statistics, buyer feedback, offers), each with row level security
-- that lets only the agent read, add and correct rows. There is no policy for vendors, so they see nothing, and none
-- for deleting, so a row can be corrected but not removed. Nothing existing is changed.
-- Still to do before Tim's entry screens are built: a history of corrections (who changed what, and when), so a corrected
-- figure or comment keeps what it said before. It is not built here.
-- A row's agreement, when it names one, has to be an agreement of the same property (checked below).

create table public.campaign_stats (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  agreement_id uuid references public.agreements(id),
  period_start date not null,
  period_end date not null,
  channel text not null default 'all',                    -- for example all, trade me, website, open home
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object'),   -- for example {"views": 420, "enquiries": 6}
  notes text,
  entered_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (property_id, period_start, period_end, channel)
);
create table public.buyer_feedback (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  agreement_id uuid references public.agreements(id),
  received_at timestamptz not null default now(),
  source text not null default 'other' check (source in ('open_home','private_viewing','enquiry','other')),
  buyer_ref text,                                          -- a label such as initials, not contact details
  feedback text not null,
  sentiment text check (sentiment in ('positive','mixed','negative')),
  entered_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.property_offers (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  agreement_id uuid references public.agreements(id),
  received_at timestamptz not null default now(),
  buyer_ref text,
  amount numeric(14,2) check (amount >= 0),
  conditions text,
  expires_at timestamptz,
  status text not null default 'received' check (status in ('received','countered','accepted','declined','withdrawn','lapsed')),
  notes text,
  entered_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.campaign_stats (property_id);
create index on public.buyer_feedback (property_id, received_at desc);
create index on public.property_offers (property_id, received_at desc);

alter table public.campaign_stats enable row level security;
alter table public.buyer_feedback enable row level security;
alter table public.property_offers enable row level security;
create policy cs_agent_read on public.campaign_stats for select using (public.is_agent());
create policy cs_agent_add on public.campaign_stats for insert with check (public.is_agent());
create policy cs_agent_fix on public.campaign_stats for update using (public.is_agent()) with check (public.is_agent());
create policy bf_agent_read on public.buyer_feedback for select using (public.is_agent());
create policy bf_agent_add on public.buyer_feedback for insert with check (public.is_agent());
create policy bf_agent_fix on public.buyer_feedback for update using (public.is_agent()) with check (public.is_agent());
create policy po_agent_read on public.property_offers for select using (public.is_agent());
create policy po_agent_add on public.property_offers for insert with check (public.is_agent());
create policy po_agent_fix on public.property_offers for update using (public.is_agent()) with check (public.is_agent());

create trigger touch_campaign_stats before update on public.campaign_stats for each row execute function public.touch_updated();
create trigger touch_buyer_feedback before update on public.buyer_feedback for each row execute function public.touch_updated();
create trigger touch_property_offers before update on public.property_offers for each row execute function public.touch_updated();

revoke all on public.campaign_stats, public.buyer_feedback, public.property_offers from anon;
revoke delete, truncate on public.campaign_stats, public.buyer_feedback, public.property_offers from authenticated;

-- an agreement named on a row must belong to the row's property
create or replace function public.check_report_agreement() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.agreement_id is not null and not exists (select 1 from public.agreements a where a.id = new.agreement_id and a.property_id = new.property_id) then
    raise exception 'That agreement belongs to a different property';
  end if;
  return new;
end $$;
revoke execute on function public.check_report_agreement() from public, anon, authenticated;
create trigger campaign_stats_agreement before insert or update on public.campaign_stats for each row execute function public.check_report_agreement();
create trigger buyer_feedback_agreement before insert or update on public.buyer_feedback for each row execute function public.check_report_agreement();
create trigger property_offers_agreement before insert or update on public.property_offers for each row execute function public.check_report_agreement();

-- Phase 15: optional history store for approved price feeds in the existing
-- Supabase catalog. Review the target DB and source retention rights before
-- applying; this file is not run automatically.
-- A SALE is a confirmed completed transaction, not a listing or a buyback.
create table if not exists public.price_observations (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  source text not null,
  source_observation_id text,
  price numeric(14, 2) not null check (price > 0),
  observed_at timestamptz not null,
  currency text not null default 'JPY' check (currency = 'JPY'),
  price_type text not null check (price_type in ('LISTING', 'SALE', 'BUYBACK')),
  collected_at timestamptz not null default now()
);
create unique index if not exists price_observations_source_event_idx
  on public.price_observations (source, source_observation_id)
  where source_observation_id is not null;
create index if not exists price_observations_card_type_time_idx
  on public.price_observations (card_id, price_type, observed_at desc);
alter table public.price_observations enable row level security;
-- No public read/write policies: access is restricted to a trusted server role.
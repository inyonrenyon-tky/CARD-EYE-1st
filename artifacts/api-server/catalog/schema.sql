-- CARD EYE's catalog lives in the existing Supabase project, not Replit's database.
-- Apply only with catalog:migrate after reviewing the target connection.
create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'card_eye_catalog_migrations')
    and exists (select 1 from information_schema.tables
                where table_schema = 'public'
                  and table_name in ('card_sets', 'cards', 'card_images', 'card_external_ids', 'scan_analyses', 'catalog_sync_runs')) then
    raise exception 'Existing catalog-named tables found: inspect the Supabase schema before applying this migration';
  end if;
end $$;

create table if not exists public.card_eye_catalog_migrations (
  version integer primary key,
  applied_at timestamptz not null default now()
);
create table if not exists public.card_sets (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text not null,
  code text not null,
  name text not null,
  series text,
  language text not null default 'ja',
  release_date date,
  last_fetched_at timestamptz not null default now(),
  unique (source, source_id, language),
  unique (code, language)
);
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.card_sets(id),
  name text not null,
  collector_number text not null,
  collector_number_normalized text not null,
  rarity_code text,
  language text not null default 'ja',
  variant_code text not null default 'standard',
  variant_attributes jsonb not null default '{}'::jsonb,
  catalog_status text not null default 'active',
  last_fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (set_id, collector_number_normalized, language, variant_code)
);
create index if not exists cards_name_number_idx on public.cards (collector_number_normalized, language);
create table if not exists public.card_external_ids (
  provider text not null,
  external_id text not null,
  card_id uuid not null references public.cards(id),
  last_fetched_at timestamptz not null default now(),
  primary key (provider, external_id)
);
create index if not exists card_external_ids_card_idx on public.card_external_ids (card_id);
create table if not exists public.card_images (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id),
  source text not null,
  image_url text not null,
  rights_information text,
  license_status text not null default 'requires_review',
  usable_in_card_eye boolean not null default false,
  unique (card_id, source, image_url)
);
create table if not exists public.catalog_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  fetched_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  error_summary text
);
create table if not exists public.scan_analyses (
  id uuid primary key default gen_random_uuid(),
  matched_card_id uuid references public.cards(id),
  match_status text not null,
  match_method text,
  candidate_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Only public catalog metadata is readable. No public write policy exists.
alter table public.card_sets enable row level security;
alter table public.card_eye_catalog_migrations enable row level security;
alter table public.cards enable row level security;
alter table public.card_external_ids enable row level security;
alter table public.card_images enable row level security;
alter table public.catalog_sync_runs enable row level security;
alter table public.scan_analyses enable row level security;
revoke all on public.card_eye_catalog_migrations, public.card_sets, public.cards, public.card_external_ids,
  public.card_images, public.catalog_sync_runs, public.scan_analyses from anon, authenticated;
grant select on public.card_sets, public.cards to anon, authenticated;
drop policy if exists card_eye_public_sets_read on public.card_sets;
create policy card_eye_public_sets_read on public.card_sets for select to anon, authenticated using (true);
drop policy if exists card_eye_public_cards_read on public.cards;
create policy card_eye_public_cards_read on public.cards for select to anon, authenticated using (true);
insert into public.card_eye_catalog_migrations(version) values (1) on conflict do nothing;
-- ─── Price Cache Table ──────────────────────────────────────────────────────
-- Stores the latest fetched price for each stock/fund symbol.
-- Populated by the GitHub Actions batch job (every 6 hours).
-- The browser reads from this table — it never calls external APIs directly.

create table if not exists price_cache (
  symbol      text        primary key,
  type        text        not null,         -- 'thai_stock' | 'us_stock' | 'fund' | 'fx'
  price       numeric     not null,
  currency    text        not null default 'THB',
  price_date  date,                         -- the trading date the price is for
  source      text        not null default 'yahoo', -- 'yahoo' | 'finnomena'
  updated_at  timestamptz not null default now()
);

-- Indexes
create index if not exists price_cache_updated_at_idx on price_cache (updated_at);
create index if not exists price_cache_type_idx       on price_cache (type);

-- RLS: everyone can read, only service role can write
-- (the GitHub Actions script uses SUPABASE_SERVICE_KEY which bypasses RLS)
alter table price_cache enable row level security;

create policy "public read"
  on price_cache for select
  using (true);

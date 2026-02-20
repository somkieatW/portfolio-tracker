# 💼 Portfolio Tracker

A personal wealth management dashboard built with React + Vite + Supabase.

**Live:** https://somkieatw.github.io/portfolio-tracker/

## Features
- Track investments & speculative assets separately
- Add / edit / delete any asset with full configurability
- Live P&L calculation per asset
- Speculation cap enforcement (configurable %)
- 12-month DCA projection with area chart
- **Multi-device sync via Supabase** — open on phone and laptop, data stays in sync
- Auto-save with visual save indicator

## Tech Stack
- **Frontend:** React 18 + Vite 5
- **Charts:** Recharts
- **Database:** Supabase (Postgres)
- **Hosting:** GitHub Pages
- **CI/CD:** GitHub Actions

## Local Development

```bash
# Clone
git clone https://github.com/somkieatW/portfolio-tracker.git
cd portfolio-tracker

# Install
npm install

# Set environment variables
cp .env.example .env
# Fill in your Supabase URL and anon key in .env

# Run
npm run dev
```

## Supabase Setup

Run this SQL in your Supabase SQL editor:

```sql
create table portfolio (
  id         uuid default gen_random_uuid() primary key,
  user_id    text unique not null,
  assets     jsonb not null default '[]',
  settings   jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- Enable Row Level Security
alter table portfolio enable row level security;

-- Allow all operations with anon key (single-user app)
create policy "Allow all for anon" on portfolio
  for all using (true) with check (true);
```

## GitHub Secrets Required

In your repo → Settings → Secrets → Actions, add:

| Secret | Value |
|--------|-------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key |

## Deploy

Push to `main` — GitHub Actions builds and deploys automatically.

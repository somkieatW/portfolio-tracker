# 💼 Portfolio Tracker

A personal wealth management dashboard built with React + Vite + Supabase.

**Live:** https://somkieatw.github.io/portfolio-tracker/

## Features
- Track investments & speculative assets separately
- Add / edit / delete any asset with full configurability
- Live P&L calculation per asset
- Speculation cap enforcement (configurable %)
- **Multi-device sync via Supabase** — open on phone and laptop, data stays in sync
- Auto-save with visual save indicator

## Tech Stack
- **Frontend:** React 18 + Vite 5
- **Charts:** Recharts
- **Database:** Supabase (Postgres)
- **Hosting:** GitHub Pages
- **CI/CD:** GitHub Actions

## Price sync (`tracked_symbols`)

The GitHub Actions price job reads a small `tracked_symbols` registry instead of scanning full `portfolio.assets` JSON on every run. Symbols are registered when you save a portfolio or click **Refresh prices**.

**One-time setup** (after pulling this change):

1. Run [`supabase/migrations/06_tracked_symbols.sql`](supabase/migrations/06_tracked_symbols.sql) in the Supabase SQL Editor.
2. Backfill from existing portfolios: `npm run sync:symbols`

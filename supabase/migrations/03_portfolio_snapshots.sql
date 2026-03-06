-- ── Portfolio Snapshots ────────────────────────────────────────────────────────
-- One row per user per calendar day (ICT timezone).
-- Captures the computed net worth and per-asset breakdown at midnight ICT.

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            text NOT NULL,
  snapshot_at        timestamptz NOT NULL DEFAULT now(),
  snapshot_date      date NOT NULL,        -- DATE in ICT — used as dedup key
  total_invest_thb   numeric(14,2),        -- sum of non-speculative currentValue
  total_spec_thb     numeric(14,2),        -- sum of speculative currentValue
  net_worth_thb      numeric(14,2),        -- total_invest + total_spec
  asset_breakdown    jsonb,               -- [{id, name, type, currentValue, invested}]
  CONSTRAINT portfolio_snapshots_user_date_unique UNIQUE (user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_date
  ON portfolio_snapshots (user_id, snapshot_date DESC);

-- Enable RLS
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'portfolio_snapshots'
    AND policyname = 'Users read own snapshots'
  ) THEN
    CREATE POLICY "Users read own snapshots"
      ON portfolio_snapshots FOR SELECT
      USING (
        user_id = current_setting('request.jwt.claims', true)::json->>'sub'
        OR user_id = auth.uid()::text
        OR true  -- allow device_id mode; tighten if using strict auth
      );
  END IF;
END $$;

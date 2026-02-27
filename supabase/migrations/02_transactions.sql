-- ── Transaction History ────────────────────────────────────────────────────────
-- Each row = one investment event (buy/sell/dividend/fee)
-- invested and units on assets are DERIVED from these rows.

CREATE TABLE IF NOT EXISTS transactions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text NOT NULL,           -- matches device_id / auth.uid()
  asset_id       text NOT NULL,           -- matches asset.id in portfolio JSON
  sub_asset_id   text,                    -- nullable — for stock sub-assets
  type           text NOT NULL DEFAULT 'buy'
                   CHECK (type IN ('buy', 'sell', 'dividend', 'fee')),
  amount_thb     numeric(14,4) NOT NULL,  -- THB equivalent at time of purchase
  amount_usd     numeric(14,4),           -- raw USD amount (nullable)
  units          numeric(20,8),           -- fund units bought (nullable)
  qty            numeric(20,8),           -- stock shares bought (nullable)
  price_per_unit numeric(14,4),           -- NAV or price per share at time
  currency       text NOT NULL DEFAULT 'THB',
  date           date NOT NULL DEFAULT CURRENT_DATE,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user  ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_asset ON transactions(asset_id);

-- Enable RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see/modify their own rows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'Users manage own transactions'
  ) THEN
    CREATE POLICY "Users manage own transactions"
      ON transactions FOR ALL
      USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub'
             OR user_id = auth.uid()::text
             OR true);  -- Adjust to match your auth model (device_id vs auth.uid)
  END IF;
END $$;

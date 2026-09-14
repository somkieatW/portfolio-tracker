-- ─── Tracked Symbols ──────────────────────────────────────────────────────────
-- Registry of tickers to price. Maintained on portfolio save; read by the
-- GitHub Actions price-cache job (avoids scanning portfolio.assets JSON).

CREATE TABLE IF NOT EXISTS tracked_symbols (
  symbol     text PRIMARY KEY,
  type       text NOT NULL,   -- 'fx' | 'thai_stock' | 'us_stock' | 'fund' | 'commodity' | 'other'
  source     text NOT NULL,   -- 'yahoo' | 'finnomena'
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tracked_symbols_source_idx ON tracked_symbols (source);

ALTER TABLE tracked_symbols ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read"
  ON tracked_symbols FOR SELECT
  USING (true);

CREATE POLICY "authenticated upsert"
  ON tracked_symbols FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated update"
  ON tracked_symbols FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

INSERT INTO tracked_symbols (symbol, type, source)
VALUES ('USDTHB=X', 'fx', 'yahoo')
ON CONFLICT (symbol) DO NOTHING;

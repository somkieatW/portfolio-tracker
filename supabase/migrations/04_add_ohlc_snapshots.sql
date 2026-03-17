-- Add OHLC columns to portfolio_snapshots
ALTER TABLE portfolio_snapshots
ADD COLUMN IF NOT EXISTS o_invest_thb numeric(14,2),
ADD COLUMN IF NOT EXISTS h_invest_thb numeric(14,2),
ADD COLUMN IF NOT EXISTS l_invest_thb numeric(14,2);

-- Migrate existing data: set O,H,L to current total_invest_thb
UPDATE portfolio_snapshots
SET 
  o_invest_thb = total_invest_thb,
  h_invest_thb = total_invest_thb,
  l_invest_thb = total_invest_thb
WHERE o_invest_thb IS NULL;

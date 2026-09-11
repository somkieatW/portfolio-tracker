-- Add 'interest' transaction type for savings/bond income (coupons, accrued interest).

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('buy', 'sell', 'dividend', 'fee', 'interest'));

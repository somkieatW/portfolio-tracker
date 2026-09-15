import { INCOME_TX_TYPES } from "./assetCalculations.js";

const LEDGER_TYPES = new Set(["buy", "sell", ...INCOME_TX_TYPES]);

function sortEvents(transactions) {
  return (transactions || [])
    .filter(t => LEDGER_TYPES.has(t.type))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.created_at).localeCompare(String(b.created_at)));
}

function applyEvent(state, t) {
  if (t.type === "buy") {
    state.principal += Number(t.amount_thb || 0);
  } else if (INCOME_TX_TYPES.has(t.type)) {
    state.incomeBalance += Math.abs(Number(t.amount_thb || 0));
  } else if (t.type === "sell") {
    const withdraw = Math.abs(Number(t.amount_thb || 0));
    const fromIncome = Math.min(withdraw, state.incomeBalance);
    state.incomeBalance -= fromIncome;
    state.principal -= (withdraw - fromIncome);
  }
  state.principal = +state.principal.toFixed(2);
  state.incomeBalance = +state.incomeBalance.toFixed(2);
}

function toSnapshot(state) {
  const principal = state.principal;
  const netIncome = state.incomeBalance;
  const value = +(principal + netIncome).toFixed(2);
  return { principal, netIncome, value, marketGain: netIncome };
}

/**
 * Manual cash/bond state after processing all transactions.
 * Sells consume income first, then principal.
 */
export function manualIncomeState(transactions, asOfDate = null) {
  const state = { principal: 0, incomeBalance: 0 };
  for (const t of sortEvents(transactions)) {
    if (asOfDate && t.date > asOfDate) break;
    applyEvent(state, t);
  }
  return toSnapshot(state);
}

/** Per-date ledger snapshots for performance charts. */
export function buildManualIncomeTimeline(transactions) {
  const byDate = new Map();
  const state = { principal: 0, incomeBalance: 0 };

  for (const t of sortEvents(transactions)) {
    applyEvent(state, t);
    byDate.set(t.date, toSnapshot(state));
  }
  return byDate;
}

export function manualIncomeUpTo(byDate, dateStr) {
  let last = null;
  for (const d of [...byDate.keys()].sort()) {
    if (d <= dateStr) last = byDate.get(d);
  }
  return last;
}

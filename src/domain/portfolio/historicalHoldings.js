import { calcDerivedTotals } from "./assetCalculations.js";
import { STOCK_GROUP_TYPES } from "./constants.js";

/** Holdings derived from buy/sell transactions on or before `asOfDate` (YYYY-MM-DD). */
export function calcDerivedTotalsAsOf(txs, isUSD, asOfDate) {
  const filtered = (txs || []).filter(t => t.date <= asOfDate);
  return calcDerivedTotals(filtered, isUSD);
}

const hasNonZero = (txs, field) => txs.some(t => Number(t[field]) !== 0 && Number.isFinite(Number(t[field])));

/**
 * For a portfolio asset, return qty/units held on `asOfDate`.
 * Uses transaction history when present; otherwise falls back to stored qty/units.
 * `unitsTracked` / `qtyTracked` are true when the transactions record that field,
 * so a derived value of 0 means "nothing held" rather than "not recorded".
 */
export function holdingsAsOf(asset, transactions, asOfDate) {
  const assetTxs = (transactions || []).filter(
    t => t.asset_id === asset.id && !t.sub_asset_id && (t.type === "buy" || t.type === "sell"),
  );
  if (assetTxs.length > 0) {
    const { totalUnits, totalQty } = calcDerivedTotalsAsOf(assetTxs, asset.currency === "USD", asOfDate);
    return {
      units: totalUnits,
      qty: totalQty,
      fromTransactions: true,
      unitsTracked: hasNonZero(assetTxs, "units"),
      qtyTracked: hasNonZero(assetTxs, "qty"),
    };
  }
  return {
    units: Number(asset.units) || 0,
    qty: Number(asset.qty) || 0,
    fromTransactions: false,
    unitsTracked: false,
    qtyTracked: false,
  };
}

export function subHoldingsAsOf(parentId, sub, transactions, asOfDate) {
  const subTxs = (transactions || []).filter(
    t => t.asset_id === parentId && t.sub_asset_id === sub.id && (t.type === "buy" || t.type === "sell"),
  );
  if (subTxs.length > 0) {
    const { totalQty } = calcDerivedTotalsAsOf(subTxs, sub.currency === "USD", asOfDate);
    return { qty: totalQty, fromTransactions: true, qtyTracked: hasNonZero(subTxs, "qty") };
  }
  return { qty: Number(sub.qty) || 0, fromTransactions: false, qtyTracked: false };
}

export { STOCK_GROUP_TYPES };

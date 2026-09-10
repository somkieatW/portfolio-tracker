import { calcDerivedTotals } from "./assetCalculations.js";
import { STOCK_GROUP_TYPES } from "./constants.js";

/** Holdings derived from buy/sell transactions on or before `asOfDate` (YYYY-MM-DD). */
export function calcDerivedTotalsAsOf(txs, isUSD, asOfDate) {
  const filtered = (txs || []).filter(t => t.date <= asOfDate);
  return calcDerivedTotals(filtered, isUSD);
}

/**
 * For a portfolio asset, return qty/units held on `asOfDate`.
 * Uses transaction history when present; otherwise falls back to stored qty/units.
 */
export function holdingsAsOf(asset, transactions, asOfDate) {
  const assetTxs = (transactions || []).filter(
    t => t.asset_id === asset.id && !t.sub_asset_id && (t.type === "buy" || t.type === "sell"),
  );
  if (assetTxs.length > 0) {
    const { totalUnits, totalQty } = calcDerivedTotalsAsOf(assetTxs, asset.currency === "USD", asOfDate);
    return { units: totalUnits, qty: totalQty };
  }
  return { units: Number(asset.units) || 0, qty: Number(asset.qty) || 0 };
}

export function subHoldingsAsOf(parentId, sub, transactions, asOfDate) {
  const subTxs = (transactions || []).filter(
    t => t.asset_id === parentId && t.sub_asset_id === sub.id && (t.type === "buy" || t.type === "sell"),
  );
  if (subTxs.length > 0) {
    const { totalQty } = calcDerivedTotalsAsOf(subTxs, sub.currency === "USD", asOfDate);
    return { qty: totalQty };
  }
  return { qty: Number(sub.qty) || 0 };
}

export { STOCK_GROUP_TYPES };

import { normalizeYahooSymbol } from "../../src/domain/pricing/yahooSymbol.js";
import {
  holdingsAsOf,
  subHoldingsAsOf,
  STOCK_GROUP_TYPES,
} from "../../src/domain/portfolio/historicalHoldings.js";
import { closeOnOrBefore } from "./yahooHistorical.js";

function dailyOhlc(prevClose, currentVal) {
  const o = prevClose != null ? prevClose : currentVal;
  const h = Math.max(o, currentVal);
  const l = Math.min(o, currentVal);
  return { o: +o.toFixed(2), h: +h.toFixed(2), l: +l.toFixed(2) };
}

function assetValueOnDate(asset, transactions, priceMaps, usdThbByDate, dateStr, manualFallback) {
  const usdThb = closeOnOrBefore(usdThbByDate, dateStr) ?? 35;

  if (STOCK_GROUP_TYPES.has(asset.type) && Array.isArray(asset.subAssets)) {
    let total = 0;
    for (const sub of asset.subAssets) {
      total += subValueOnDate(asset.id, sub, transactions, priceMaps, usdThb, dateStr, manualFallback);
    }
    return total;
  }

  if (asset.finnomenaCode?.trim()) {
    const code = asset.finnomenaCode.trim();
    const { units } = holdingsAsOf(asset, transactions, dateStr);
    const navMap = priceMaps.get(code);
    const nav = navMap ? closeOnOrBefore(navMap, dateStr) : null;
    if (nav && units > 0) return units * nav;
  }

  if (asset.yahooSymbol?.trim()) {
    const sym = normalizeYahooSymbol(asset.yahooSymbol);
    const { qty } = holdingsAsOf(asset, transactions, dateStr);
    const pxMap = priceMaps.get(sym);
    const px = pxMap ? closeOnOrBefore(pxMap, dateStr) : null;
    if (px && qty > 0) {
      const isUSD = asset.currency === "USD";
      return isUSD ? qty * px * usdThb : qty * px;
    }
  }

  const fb = manualFallback?.get(asset.id)?.get(dateStr);
  if (fb != null) return fb;
  return Number(asset.currentValue) || 0;
}

function subValueOnDate(parentId, sub, transactions, priceMaps, usdThb, dateStr, manualFallback) {
  const sym = normalizeYahooSymbol(sub.yahooSymbol);
  const { qty } = subHoldingsAsOf(parentId, sub, transactions, dateStr);
  const pxMap = sym ? priceMaps.get(sym) : null;
  const px = pxMap ? closeOnOrBefore(pxMap, dateStr) : null;
  if (px && qty > 0) {
    const isUSD = sub.currency === "USD";
    return isUSD ? qty * px * usdThb : qty * px;
  }
  const fb = manualFallback?.get(sub.id)?.get(dateStr);
  if (fb != null) return fb;
  return Number(sub.currentValue) || 0;
}

/**
 * Build interpolated manual-asset values between known snapshot breakdowns.
 * manualFallback: Map<assetId, Map<date, value>>
 */
export function buildManualFallback(existingSnapshots) {
  const known = new Map();
  for (const snap of existingSnapshots) {
    for (const entry of snap.asset_breakdown || []) {
      if (!known.has(entry.id)) known.set(entry.id, []);
      known.get(entry.id).push({
        date: snap.snapshot_date,
        value: Number(entry.currentValue) || 0,
      });
    }
  }

  const result = new Map();
  for (const [id, points] of known) {
    points.sort((a, b) => a.date.localeCompare(b.date));
    result.set(id, new Map());
  }
  return { known, result };
}

export function interpolateManualValue(knownPoints, dateStr) {
  if (!knownPoints?.length) return null;
  const exact = knownPoints.find(p => p.date === dateStr);
  if (exact) return exact.value;

  let before = null;
  let after = null;
  for (const p of knownPoints) {
    if (p.date < dateStr) before = p;
    if (p.date > dateStr && !after) after = p;
  }
  if (before && after) {
    const t0 = new Date(before.date).getTime();
    const t1 = new Date(after.date).getTime();
    const t = new Date(dateStr).getTime();
    const ratio = (t - t0) / (t1 - t0);
    return before.value + (after.value - before.value) * ratio;
  }
  if (before) return before.value;
  if (after) return after.value;
  return null;
}

export function buildSnapshotForDate({
  userId,
  assets,
  transactions,
  dateStr,
  priceMaps,
  usdThbByDate,
  manualKnown,
  prevPortfolioClose,
  prevBreakdown = [],
}) {
  const manualFallback = new Map();
  for (const [id, points] of manualKnown) {
    const val = interpolateManualValue(points, dateStr);
    if (val != null) {
      manualFallback.set(id, new Map([[dateStr, val]]));
    }
  }

  let totalInvest = 0;
  let totalSpec = 0;
  const breakdown = [];
  const usdThb = closeOnOrBefore(usdThbByDate, dateStr) ?? 35;

  for (const asset of assets) {
    const currentValue = assetValueOnDate(asset, transactions, priceMaps, usdThbByDate, dateStr, manualFallback);
    const invested = Number(asset.invested) || 0;
    const prevEntry = prevBreakdown.find(e => e.id === asset.id);
    const prevClose = prevEntry != null ? Number(prevEntry.currentValue) : null;
    const { o, h, l } = dailyOhlc(prevClose ?? prevPortfolioClose, currentValue);

    breakdown.push({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      currentValue: +currentValue.toFixed(2),
      invested: +invested.toFixed(2),
      o, h, l,
    });

    if (STOCK_GROUP_TYPES.has(asset.type) && Array.isArray(asset.subAssets)) {
      for (const sub of asset.subAssets) {
        const subVal = subValueOnDate(asset.id, sub, transactions, priceMaps, usdThb, dateStr, manualFallback);
        const subInvested = Number(sub.invested) || 0;
        const prevSub = prevBreakdown.find(e => e.id === sub.id);
        const prevSubClose = prevSub != null ? Number(prevSub.currentValue) : null;
        const subOhlc = dailyOhlc(prevSubClose, subVal);
        breakdown.push({
          id: sub.id,
          parentId: asset.id,
          name: sub.name,
          type: asset.type,
          currentValue: +subVal.toFixed(2),
          invested: +subInvested.toFixed(2),
          ...subOhlc,
        });
      }
    }

    if (asset.isSpeculative) totalSpec += currentValue;
    else totalInvest += currentValue;
  }

  const currentVal = +totalInvest.toFixed(2);
  const portfolioOhlc = dailyOhlc(prevPortfolioClose, currentVal);

  return {
    user_id: userId,
    snapshot_at: new Date(`${dateStr}T17:00:00.000Z`).toISOString(),
    snapshot_date: dateStr,
    total_invest_thb: currentVal,
    total_spec_thb: +totalSpec.toFixed(2),
    net_worth_thb: +(currentVal + totalSpec).toFixed(2),
    asset_breakdown: breakdown,
    o_invest_thb: portfolioOhlc.o,
    h_invest_thb: portfolioOhlc.h,
    l_invest_thb: portfolioOhlc.l,
  };
}

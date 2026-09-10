import { normalizeYahooSymbol } from "../pricing/yahooSymbol.js";
import { STOCK_GROUP_TYPES } from "./constants.js";

export function calcPL(a) {
  if (a.isSpeculative || a.invested === 0) return { pl: a.currentValue - a.invested, plPct: 0 };
  const pl = a.currentValue - a.invested;
  const plPct = (pl / a.invested) * 100;
  return { pl, plPct };
}

// For stock groups, compute invested/currentValue from sub-assets
export function groupTotals(asset) {
  const subs = asset.subAssets || [];
  return {
    invested: subs.reduce((s, x) => s + (x.invested || 0), 0),
    currentValue: subs.reduce((s, x) => s + (x.currentValue || 0), 0),
  };
}

// Returns a flat view of assets with group totals computed (for charts/sums)
export function normalizeAssets(assets) {
  return assets.map(a => {
    if (!STOCK_GROUP_TYPES.has(a.type)) return a;
    const { invested, currentValue } = groupTotals(a);
    return { ...a, invested, currentValue };
  });
}

// Computes derived totals proportionally reducing invested capital based on units sold
export function calcDerivedTotals(txs, isUSD) {
  const sorted = [...txs].sort((a, b) => {
    // 1. Primary order by explicitly configured Date
    const dateDiff = new Date(a.date) - new Date(b.date);
    if (dateDiff !== 0) return dateDiff;

    // 2. If on the same Date, [System Backfill] MUST be processed before anything else 
    const aIsBackfill = a.notes?.includes('[System Backfill]');
    const bIsBackfill = b.notes?.includes('[System Backfill]');
    if (aIsBackfill && !bIsBackfill) return -1;
    if (!aIsBackfill && bIsBackfill) return 1;

    // 3. If on the same date, Buys generally process before Sells 
    // to prevent math crashing into 0 baseline counts during sequential loops
    if (a.type === 'buy' && b.type === 'sell') return -1;
    if (a.type === 'sell' && b.type === 'buy') return 1;

    // 4. Fallback to native Creation timestamp
    return new Date(a.created_at) - new Date(b.created_at);
  });

  let invThb = 0;
  let invUsd = isUSD ? 0 : null;
  let totalUnits = 0;
  let totalQty = 0;

  for (const t of sorted) {
    if (t.type === 'buy') {
      invThb += Number(t.amount_thb || 0);
      if (isUSD) invUsd += Number(t.amount_usd || 0);
      totalUnits += Number(t.units || 0);
      totalQty += Number(t.qty || 0);
    } else if (t.type === 'sell') {
      const sellUnits = Math.abs(Number(t.units || 0));
      const sellQty = Math.abs(Number(t.qty || 0));

      if (totalUnits > 0 && sellUnits > 0) {
        const ratio = sellUnits / totalUnits;
        invThb -= invThb * ratio;
        totalUnits -= sellUnits;
      } else if (totalQty > 0 && sellQty > 0) {
        // Average cost for stocks/gold
        const ratio = sellQty / totalQty;
        invThb -= invThb * ratio;
        if (isUSD) invUsd -= invUsd * ratio;
        totalQty -= sellQty;
      } else {
        // Pure cash withdrawal
        invThb -= Math.abs(Number(t.amount_thb || 0));
        if (isUSD) invUsd -= Math.abs(Number(t.amount_usd || 0));
      }
    }
  }
  return { invThb, invUsd, totalUnits, totalQty };
}


// Helper to clean up asset data objects
export function sanitizeAsset(a, rate) {
  const isUSD = a.currency === "USD";
  const isStockGroup = STOCK_GROUP_TYPES.has(a.type);
  const isFund = !!a.finnomenaCode?.trim() || a.units > 0;
  const isStock = !!a.yahooSymbol?.trim() || a.qty > 0;

  const clean = { ...a };

  if (clean.yahooSymbol?.trim()) {
    clean.yahooSymbol = normalizeYahooSymbol(clean.yahooSymbol);
  }

  // 1. Force numeric values
  if (clean.invested !== undefined) clean.invested = Number(Number(clean.invested).toFixed(2));
  if (clean.currentValue !== undefined) clean.currentValue = Number(Number(clean.currentValue).toFixed(2));

  if (isUSD) {
    if (clean.investedUSD !== undefined) clean.investedUSD = Number(Number(clean.investedUSD).toFixed(2));
    if (clean.currentValueUSD !== undefined) {
      clean.currentValueUSD = Number(Number(clean.currentValueUSD).toFixed(2));
    } else if (clean.currentValue) {
      clean.currentValueUSD = Number((clean.currentValue / rate).toFixed(2));
    }
  } else {
    // 2. Remove USD fields for THB assets
    delete clean.investedUSD;
    delete clean.currentValueUSD;
  }

  // 3. Remove irrelevant unit/qty fields
  if (isFund) {
    if (clean.units !== undefined) clean.units = Number(Number(clean.units).toFixed(8));
    delete clean.qty;
  } else if (isStock || isStockGroup) {
    if (clean.qty !== undefined) clean.qty = Number(Number(clean.qty).toFixed(8));
    delete clean.units;
  } else {
    delete clean.units;
    delete clean.qty;
  }

  // 4. Recurse for sub-stocks
  if (clean.subAssets?.length > 0) {
    clean.subAssets = clean.subAssets.map(sub => sanitizeAsset(sub, rate));
  }

  return clean;
}

import { supabase, getPriceCache } from "../../infrastructure/persistence/supabase.js";
import { fetchStockPrice, fetchUSDTHBRate } from "../../infrastructure/external/yahooFinanceService.js";
import { fetchCurrentNAV } from "../../infrastructure/external/finnomenaService.js";
import { normalizeYahooSymbol, getCacheEntry } from "../../domain/pricing/yahooSymbol.js";

const UPSERT_TIMEOUT_MS = 10_000;

/** Apply price_cache rows to assets (mirrors App load logic). */
export function applyPriceCacheToAssets(assets, cache) {
  return assets.map(a => {
    if (a.finnomenaCode?.trim() && cache.has(a.finnomenaCode.trim())) {
      const row = cache.get(a.finnomenaCode.trim());
      const newVal = a.units > 0 ? +(a.units * row.price).toFixed(2) : a.currentValue;
      return { ...a, currentValue: newVal, navUpdatedAt: row.updated_at };
    }

    const yahooRow = a.yahooSymbol?.trim() ? getCacheEntry(cache, a.yahooSymbol) : null;
    if (yahooRow) {
      const usdRow = getCacheEntry(cache, "USDTHB=X");
      const px = yahooRow.currency === "USD" && usdRow ? yahooRow.price * usdRow.price : yahooRow.price;
      const newVal = a.qty > 0 ? +(a.qty * px).toFixed(2) : a.currentValue;
      return { ...a, currentValue: newVal, priceUpdatedAt: yahooRow.updated_at };
    }

    if ((a.subAssets || []).length > 0) {
      return {
        ...a,
        subAssets: a.subAssets.map(sub => {
          const row = sub.yahooSymbol?.trim() ? getCacheEntry(cache, sub.yahooSymbol) : null;
          if (!row) return sub;
          const usdRow = getCacheEntry(cache, "USDTHB=X");
          const px = row.currency === "USD" && usdRow ? row.price * usdRow.price : row.price;
          const newVal = sub.qty > 0 ? +(sub.qty * px).toFixed(2) : sub.currentValue;
          return { ...sub, currentValue: newVal, priceDate: row.price_date, priceUpdatedAt: row.updated_at };
        }),
      };
    }
    return a;
  });
}

function collectSymbols(assets) {
  const symbols = new Set(["USDTHB=X"]);
  for (const a of assets) {
    if (a.finnomenaCode?.trim()) symbols.add(a.finnomenaCode.trim());
    if (a.yahooSymbol?.trim()) symbols.add(normalizeYahooSymbol(a.yahooSymbol));
    for (const sub of a.subAssets || []) {
      if (sub.yahooSymbol?.trim()) symbols.add(normalizeYahooSymbol(sub.yahooSymbol));
    }
  }
  return symbols;
}

async function upsertPrice(row) {
  if (!supabase) return;
  const write = supabase.from("price_cache").upsert(row, { onConflict: "symbol" });
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Supabase upsert timed out")), UPSERT_TIMEOUT_MS);
  });
  const { error } = await Promise.race([write, timeout]);
  if (error) throw new Error(error.message);
}

/**
 * Fetch live prices client-side and write to price_cache.
 * Fetches run in parallel so one slow symbol cannot block the rest.
 */
export async function refreshPortfolioPrices(assets) {
  const errors = [];
  let updated = 0;
  if (!supabase) return { cache: new Map(), errors: ["Supabase not configured"], updated: 0 };

  const now = new Date().toISOString();
  let fx = null;
  const jobs = [];

  jobs.push(async () => {
    try {
      fx = await fetchUSDTHBRate();
      await upsertPrice({
        symbol: "USDTHB=X", type: "fx", price: fx, currency: "THB",
        price_date: now.slice(0, 10), source: "yahoo", updated_at: now,
      });
      updated++;
    } catch (e) {
      errors.push(`USDTHB=X: ${e.message}`);
    }
  });

  for (const asset of assets) {
    if (asset.finnomenaCode?.trim() && asset.units > 0) {
      const code = asset.finnomenaCode.trim();
      jobs.push(async () => {
        try {
          const navData = await fetchCurrentNAV(code);
          if (navData?.nav) {
            await upsertPrice({
              symbol: code, type: "fund", price: navData.nav, currency: "THB",
              price_date: navData.date, source: "finnomena", updated_at: now,
            });
            updated++;
          }
        } catch (e) {
          errors.push(`${code}: ${e.message}`);
        }
      });
    }

    if (asset.yahooSymbol?.trim() && asset.qty > 0) {
      const sym = normalizeYahooSymbol(asset.yahooSymbol);
      jobs.push(async () => {
        try {
          const priceData = await fetchStockPrice(sym);
          if (priceData) {
            const isUsd = asset.currency === "USD";
            await upsertPrice({
              symbol: sym,
              type: isUsd ? "us_stock" : (asset.type === "gold" ? "commodity" : "other"),
              price: priceData.price,
              currency: isUsd ? "USD" : (priceData.currency || "THB"),
              price_date: priceData.date,
              source: "yahoo",
              updated_at: now,
            });
            updated++;
          }
        } catch (e) {
          errors.push(`${sym}: ${e.message}`);
        }
      });
    }

    for (const sub of asset.subAssets || []) {
      if (!sub.yahooSymbol?.trim() || !(sub.qty > 0)) continue;
      const sym = normalizeYahooSymbol(sub.yahooSymbol);
      jobs.push(async () => {
        try {
          const priceData = await fetchStockPrice(sym);
          if (priceData) {
            const isUsd = sub.currency === "USD";
            await upsertPrice({
              symbol: sym,
              type: isUsd ? "us_stock" : "thai_stock",
              price: priceData.price,
              currency: isUsd ? "USD" : (priceData.currency || "THB"),
              price_date: priceData.date,
              source: "yahoo",
              updated_at: now,
            });
            updated++;
          }
        } catch (e) {
          errors.push(`${sym}: ${e.message}`);
        }
      });
    }
  }

  await Promise.allSettled(jobs.map(fn => fn()));

  const cache = await getPriceCache([...collectSymbols(assets)]);
  return { cache, errors, updated, fx };
}

export function summarizeCacheInfo(cache) {
  let oldest = null;
  const staleSymbols = [];
  const STALE_H = 18;
  const ageMs = (iso) => Date.now() - new Date(iso).getTime();

  for (const [sym, row] of cache) {
    if (!oldest || new Date(row.updated_at) < new Date(oldest)) oldest = row.updated_at;
    if (ageMs(row.updated_at) > STALE_H * 3600 * 1000) staleSymbols.push(sym);
  }
  return { updatedAt: oldest, staleSymbols };
}

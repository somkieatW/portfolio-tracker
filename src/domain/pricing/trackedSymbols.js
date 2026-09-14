import { normalizeYahooSymbol } from "./yahooSymbol.js";

const FX_ROW = { symbol: "USDTHB=X", type: "fx", source: "yahoo" };

/**
 * Collect deduped symbol rows for tracked_symbols / price-cache discovery.
 * @returns {{ symbol: string, type: string, source: 'yahoo' | 'finnomena' }[]}
 */
export function collectTrackedSymbols(assets) {
  const bySymbol = new Map();

  const add = (symbol, type, source) => {
    if (!symbol?.trim()) return;
    bySymbol.set(symbol, { symbol, type, source });
  };

  for (const asset of assets || []) {
    if (asset.finnomenaCode?.trim()) {
      add(asset.finnomenaCode.trim(), "fund", "finnomena");
    }

    if (asset.yahooSymbol?.trim()) {
      const sym = normalizeYahooSymbol(asset.yahooSymbol);
      const type = asset.currency === "USD"
        ? "us_stock"
        : (asset.type === "gold" ? "commodity" : "other");
      add(sym, type, "yahoo");
    }

    for (const sub of asset.subAssets || []) {
      if (!sub.yahooSymbol?.trim()) continue;
      const sym = normalizeYahooSymbol(sub.yahooSymbol);
      const type = sub.currency === "USD" ? "us_stock" : "thai_stock";
      add(sym, type, "yahoo");
    }
  }

  bySymbol.set(FX_ROW.symbol, FX_ROW);
  return [...bySymbol.values()];
}

/** Symbol strings only (for price_cache batch fetch). */
export function collectSymbolKeys(assets) {
  return collectTrackedSymbols(assets).map(r => r.symbol);
}

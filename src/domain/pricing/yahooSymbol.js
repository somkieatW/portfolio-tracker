/**
 * Normalize a Yahoo Finance ticker for API calls and price_cache lookups.
 * Fixes legacy double-encoding (e.g. "GC%3DF" → "GC=F").
 */
export function normalizeYahooSymbol(symbol) {
  if (!symbol || typeof symbol !== "string") return "";
  const trimmed = symbol.trim();
  if (!trimmed) return "";
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

/** Read from a Map keyed by cache symbol, using normalized + raw fallback. */
export function getCacheEntry(cache, symbol) {
  if (!cache || !symbol) return null;
  const norm = normalizeYahooSymbol(symbol);
  if (!norm) return null;
  if (cache instanceof Map) {
    if (cache.has(norm)) return cache.get(norm);
    const raw = symbol.trim();
    if (raw !== norm && cache.has(raw)) return cache.get(raw);
    return null;
  }
  return cache[norm] ?? cache[symbol.trim()] ?? null;
}

import { normalizeYahooSymbol } from "../../src/domain/pricing/yahooSymbol.js";

const YAHOO_BASE = "https://query1.finance.yahoo.com";

/**
 * Fetch daily close prices for a symbol between two calendar dates (inclusive).
 * Returns Map<YYYY-MM-DD, close>.
 */
export async function fetchDailyCloses(symbol, fromDate, toDate) {
  const sym = normalizeYahooSymbol(symbol);
  if (!sym) return new Map();

  const period1 = Math.floor(new Date(`${fromDate}T00:00:00Z`).getTime() / 1000);
  const period2 = Math.floor(new Date(`${toDate}T23:59:59Z`).getTime() / 1000) + 86400;
  const path = `/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&period1=${period1}&period2=${period2}`;
  const url = `${YAHOO_BASE}${path}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Yahoo ${sym} → HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return new Map();

  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const map = new Map();

  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close == null) continue;
    const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
    map.set(date, close);
  }
  return map;
}

/** Last known close on or before dateStr. */
export function closeOnOrBefore(priceMap, dateStr) {
  if (priceMap.has(dateStr)) return priceMap.get(dateStr);
  let best = null;
  let bestDate = "";
  for (const [d, price] of priceMap) {
    if (d <= dateStr && d > bestDate) {
      bestDate = d;
      best = price;
    }
  }
  return best;
}

const FINNOMENA_BASE = "https://www.finnomena.com/fn3/api/fund/v2/public";

/**
 * Fetch daily NAV closes for a mutual fund between two calendar dates (inclusive).
 * Uses Finnomena's TradingView-compatible history endpoint.
 * Returns Map<YYYY-MM-DD, nav>.
 */
export async function fetchFundNavSeries(fundCode, fromDate, toDate) {
  const symbol = fundCode.trim();
  if (!symbol) return new Map();

  const from = Math.floor(new Date(`${fromDate}T00:00:00Z`).getTime() / 1000);
  const to = Math.floor(new Date(`${toDate}T23:59:59Z`).getTime() / 1000);
  const params = new URLSearchParams({
    symbol,
    resolution: "D",
    from: String(from),
    to: String(to),
  });

  const res = await fetch(`${FINNOMENA_BASE}/tv/history?${params}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PortfolioBot/1.0)" },
  });
  if (!res.ok) throw new Error(`Finnomena ${symbol} → HTTP ${res.status}`);

  const json = await res.json();
  if (json.s !== "ok" || !Array.isArray(json.t) || !Array.isArray(json.c)) {
    throw new Error(`Finnomena ${symbol} → no NAV series in response`);
  }

  const map = new Map();
  for (let i = 0; i < json.t.length; i++) {
    const nav = json.c[i];
    if (nav == null) continue;
    const date = new Date(json.t[i] * 1000).toISOString().slice(0, 10);
    map.set(date, nav);
  }
  return map;
}

// ─── Yahoo Finance Stock Price Service ────────────────────────────────────────
// Fetches real-time stock prices via Yahoo Finance's public JSON API.
//
// Symbol formats:
//   Thai SET stocks : PTT.BK, SAT.BK, SCB.BK
//   US stocks       : LRCX, CEG, MSFT, LLY
//   USD/THB rate    : USDTHB=X
//
// CORS handling:
//   Dev  → Vite proxy  /yahoo-api/... → https://query1.finance.yahoo.com/...
//   Prod → allorigins.win public CORS proxy

const IS_DEV = import.meta.env.DEV;
const YAHOO_BASE = "https://query1.finance.yahoo.com";

// Fetch through the appropriate CORS layer
async function yahooFetch(path) {
    if (IS_DEV) {
        const res = await fetch(`/yahoo-api${path}`);
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
        return res.json();
    } else {
        const target = encodeURIComponent(`${YAHOO_BASE}${path}`);
        const res = await fetch(`https://api.allorigins.win/get?url=${target}`);
        if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
        const wrapper = await res.json();
        return JSON.parse(wrapper.contents);
    }
}

/**
 * Fetch the latest price for a single Yahoo Finance symbol.
 * @returns {{ price, currency, symbol, date } | null}
 */
export async function fetchStockPrice(symbol) {
    const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d&includePrePost=false`;
    const json = await yahooFetch(path);
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    return {
        price: meta.regularMarketPrice,
        currency: meta.currency || "THB",
        symbol: meta.symbol,
        date: meta.regularMarketTime
            ? new Date(meta.regularMarketTime * 1000).toISOString().substring(0, 10)
            : new Date().toISOString().substring(0, 10),
    };
}

// Cached USD/THB rate (valid for current session)
let _usdThbRate = null;
let _usdThbFetched = 0;

/**
 * Fetch USD→THB exchange rate from Yahoo Finance (cached per session, refreshes after 1h).
 */
export async function fetchUSDTHBRate() {
    const oneHour = 60 * 60 * 1000;
    if (_usdThbRate && Date.now() - _usdThbFetched < oneHour) return _usdThbRate;
    const data = await fetchStockPrice("USDTHB=X");
    if (data?.price) {
        _usdThbRate = data.price;
        _usdThbFetched = Date.now();
    }
    return _usdThbRate ?? 33; // fallback if API fails
}

/**
 * Fetch current prices for all sub-assets that have a yahooSymbol and qty set.
 * Automatically fetches the USD/THB rate for USD-denominated assets.
 *
 * @param {Array} subAssets  - list of sub-asset objects
 * @returns {Map<id, { newValue, price, currency, date }>}
 */
export async function fetchSubAssetPrices(subAssets) {
    const targets = (subAssets || []).filter(s => s.yahooSymbol?.trim() && s.qty > 0);
    if (targets.length === 0) return new Map();

    const needsUSD = targets.some(s => s.currency === "USD");
    const usdThbRate = needsUSD ? await fetchUSDTHBRate() : null;

    const results = new Map();
    await Promise.allSettled(
        targets.map(async (sub) => {
            try {
                const data = await fetchStockPrice(sub.yahooSymbol.trim());
                if (!data) return;
                const isUSD = data.currency === "USD" || sub.currency === "USD";
                const rate = isUSD ? (usdThbRate ?? 33) : 1;
                const newValue = +(sub.qty * data.price * rate).toFixed(2);
                results.set(sub.id, { newValue, price: data.price, currency: data.currency, date: data.date, rate });
            } catch (err) {
                console.warn(`[Yahoo] Failed for ${sub.yahooSymbol}:`, err);
            }
        })
    );
    return results;
}

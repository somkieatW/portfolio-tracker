#!/usr/bin/env node
/**
 * update-price-cache.js
 *
 * GitHub Actions batch job — runs every 6 hours.
 * 1. Reads all user portfolios from Supabase to discover all symbols.
 * 2. Fetches live prices from Yahoo Finance and Finnomena (server-side, no CORS).
 * 3. Upserts results into the `price_cache` table.
 *
 * Required env vars:
 *   SUPABASE_URL          — project URL
 *   SUPABASE_SERVICE_KEY  — service role key (bypasses RLS)
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const YAHOO_BASE = 'https://query1.finance.yahoo.com';
const FINNOMENA_BASE = 'https://www.finnomena.com';
const STALE_HOURS = 6;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
}

// ─── Supabase REST helpers ────────────────────────────────────────────────────
const sbHeaders = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
};

async function sbGet(path) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers: sbHeaders });
    if (!res.ok) throw new Error(`Supabase GET ${path} → ${res.status}: ${await res.text()}`);
    return res.json();
}

async function sbUpsert(table, rows) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`Supabase upsert ${table} → ${res.status}: ${await res.text()}`);
}

// ─── Discover symbols from all portfolios ────────────────────────────────────
async function discoverSymbols() {
    const rows = await sbGet('/portfolio?select=assets');
    const yahooSymbols = new Map(); // symbol → type  ('thai_stock' | 'us_stock')
    const fundsSet = new Set(); // finnomenaCode values
    const fxNeeded = false;     // we always fetch USDTHB=X

    for (const row of rows) {
        const assets = Array.isArray(row.assets) ? row.assets : [];
        for (const asset of assets) {
            // Finnomena fund code on a regular asset
            if (asset.finnomenaCode?.trim()) {
                fundsSet.add(asset.finnomenaCode.trim());
            }
            // Sub-assets inside stock groups
            for (const sub of asset.subAssets || []) {
                if (sub.yahooSymbol?.trim()) {
                    const type = sub.currency === 'USD' ? 'us_stock' : 'thai_stock';
                    yahooSymbols.set(sub.yahooSymbol.trim(), type);
                }
            }
        }
    }

    return { yahooSymbols, fundsSet };
}

// ─── Yahoo Finance fetch ──────────────────────────────────────────────────────
async function fetchYahooPrice(symbol) {
    const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d&includePrePost=false`;
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortfolioBot/1.0)' },
    });
    if (!res.ok) throw new Error(`Yahoo ${symbol} → HTTP ${res.status}`);
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) throw new Error(`Yahoo ${symbol} → no price in response`);
    return {
        price: meta.regularMarketPrice,
        currency: meta.currency || 'USD',
        priceDate: meta.regularMarketTime
            ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10),
    };
}

// ─── Finnomena Fund NAV fetch ─────────────────────────────────────────────────
let finnomenaFundMap = null;

async function getFinnomenaFundMap() {
    if (finnomenaFundMap) return finnomenaFundMap;
    const res = await fetch(`${FINNOMENA_BASE}/fn3/api/fund/public/list`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortfolioBot/1.0)' },
    });
    if (!res.ok) throw new Error(`Finnomena fund list → HTTP ${res.status}`);
    const list = await res.json();
    finnomenaFundMap = new Map();
    for (const fund of list) {
        if (!fund.short_code || !fund.id) continue;
        finnomenaFundMap.set(fund.short_code.toUpperCase().trim(), fund.id);
    }
    return finnomenaFundMap;
}

async function fetchFinnomenaNAV(fundCode) {
    const map = await getFinnomenaFundMap();
    const fundId = map.get(fundCode.toUpperCase().trim());
    if (!fundId) throw new Error(`Finnomena: no fund ID for ${fundCode}`);

    const res = await fetch(`${FINNOMENA_BASE}/fn3/api/fund/v2/public/funds/${fundId}/latest`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortfolioBot/1.0)' },
    });
    if (!res.ok) throw new Error(`Finnomena NAV ${fundCode} → HTTP ${res.status}`);
    const json = await res.json();
    if (!json?.data?.value) throw new Error(`Finnomena ${fundCode} → no value in response`);

    return {
        price: parseFloat(json.data.value),
        currency: 'THB',
        priceDate: json.data.date ? json.data.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    };
}

// ─── USD/THB exchange rate ────────────────────────────────────────────────────
async function fetchUSDTHBRate() {
    const { price, priceDate } = await fetchYahooPrice('USDTHB=X');
    return { price, priceDate };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log(`[${new Date().toISOString()}] Starting price cache update…`);

    const { yahooSymbols, fundsSet } = await discoverSymbols();
    console.log(`Found ${yahooSymbols.size} stock symbols, ${fundsSet.size} fund codes`);

    const rows = [];
    const errors = [];

    // Always fetch USD/THB rate
    try {
        const { price, priceDate } = await fetchUSDTHBRate();
        rows.push({ symbol: 'USDTHB=X', type: 'fx', price, currency: 'THB', price_date: priceDate, source: 'yahoo', updated_at: new Date().toISOString() });
        console.log(`  USDTHB=X → ${price}`);
    } catch (e) {
        errors.push(`USDTHB=X: ${e.message}`);
    }

    // Yahoo stocks (with a small delay between calls to be polite)
    for (const [symbol, type] of yahooSymbols) {
        try {
            const { price, currency, priceDate } = await fetchYahooPrice(symbol);
            // For USD stocks, also store the THB-converted price via rate if available
            const usdThbRow = rows.find(r => r.symbol === 'USDTHB=X');
            const thbPrice = currency === 'USD' && usdThbRow ? +(price * usdThbRow.price).toFixed(4) : price;
            rows.push({
                symbol, type,
                price: thbPrice,
                currency: 'THB',
                price_date: priceDate,
                source: 'yahoo',
                updated_at: new Date().toISOString(),
            });
            console.log(`  ${symbol} (${type}) → ${thbPrice} THB`);
        } catch (e) {
            errors.push(`${symbol}: ${e.message}`);
        }
        await sleep(300); // 300ms between Yahoo calls
    }

    // Finnomena funds
    for (const code of fundsSet) {
        try {
            const { price, priceDate } = await fetchFinnomenaNAV(code);
            rows.push({
                symbol: code,
                type: 'fund',
                price,
                currency: 'THB',
                price_date: priceDate,
                source: 'finnomena',
                updated_at: new Date().toISOString(),
            });
            console.log(`  ${code} (fund) → ${price} THB`);
        } catch (e) {
            errors.push(`${code}: ${e.message}`);
        }
        await sleep(300);
    }

    // Upsert to Supabase
    if (rows.length > 0) {
        await sbUpsert('price_cache', rows);
        console.log(`\n✓ Upserted ${rows.length} price rows to price_cache`);
    }

    if (errors.length > 0) {
        console.warn(`\n⚠ ${errors.length} errors:`);
        errors.forEach(e => console.warn('  -', e));
    }

    console.log(`[${new Date().toISOString()}] Done.`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

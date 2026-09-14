#!/usr/bin/env node
/**
 * update-price-cache.js
 *
 * GitHub Actions batch job — runs every 6 hours.
 * 1. Reads symbol registry from tracked_symbols (no portfolio JSON scan).
 * 2. Fetches live prices from Yahoo Finance and Finnomena (server-side, no CORS).
 * 3. Upserts results into the `price_cache` table.
 *
 * Required env vars:
 *   SUPABASE_URL          — project URL
 *   SUPABASE_SERVICE_KEY  — service role key (bypasses RLS)
 */

import { requireSupabaseEnv, sbGet, sbUpsert } from './lib/supabaseAdmin.js';

const YAHOO_BASE = 'https://query1.finance.yahoo.com';
const FINNOMENA_BASE = 'https://www.finnomena.com';

requireSupabaseEnv();

// ─── Load symbols from tracked_symbols registry ──────────────────────────────
async function loadTrackedSymbols() {
    const rows = await sbGet('/tracked_symbols?select=symbol,type,source');
    const yahooSymbols = new Map();
    const fundsSet = new Set();

    for (const row of rows) {
        if (row.source === 'finnomena') {
            fundsSet.add(row.symbol);
        } else if (row.source === 'yahoo' && row.symbol !== 'USDTHB=X') {
            yahooSymbols.set(row.symbol, row.type);
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

    const { yahooSymbols, fundsSet } = await loadTrackedSymbols();
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
            rows.push({
                symbol, type,
                price: price,
                currency: currency,
                price_date: priceDate,
                source: 'yahoo',
                updated_at: new Date().toISOString(),
            });
            console.log(`  ${symbol} (${type}) → ${price} ${currency}`);
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

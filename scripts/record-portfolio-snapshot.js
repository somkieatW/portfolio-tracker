#!/usr/bin/env node
/**
 * record-portfolio-snapshot.js
 *
 * GitHub Actions batch job — runs at midnight ICT daily (after update-price-cache.js).
 * 1. Reads all user portfolios + fresh price_cache from Supabase.
 * 2. Recomputes currentValue for each asset using cached prices.
 * 3. Upserts one row per user into `portfolio_snapshots` (one per calendar day).
 *
 * Required env vars:
 *   SUPABASE_URL          — project URL
 *   SUPABASE_SERVICE_KEY  — service role key (bypasses RLS)
 */

import { normalizeYahooSymbol } from '../src/domain/pricing/yahooSymbol.js';
import { isManualIncomeAsset } from '../src/domain/portfolio/assetCalculations.js';
import { holdingsAsOf, subHoldingsAsOf } from '../src/domain/portfolio/historicalHoldings.js';
import { manualIncomeState } from '../src/domain/portfolio/manualIncomeLedger.js';
import { requireSupabaseEnv, fetchAllPaginated, sbGet, sbUpsert } from './lib/supabaseAdmin.js';

requireSupabaseEnv();

// ─── Stock group types (mirror frontend) ─────────────────────────────────────
const STOCK_GROUP_TYPES = new Set(['us_stocks', 'thai_stocks']);

// ─── Compute current value for a single asset using cached prices ─────────────
function computeAssetValue(asset, priceCache, transactions, asOfDate) {
    const usdThb = priceCache.get('USDTHB=X') ?? 35;

    // Stock group — compute from sub-assets using live cached prices
    if (STOCK_GROUP_TYPES.has(asset.type) && Array.isArray(asset.subAssets)) {
        let total = 0;
        for (const sub of asset.subAssets) {
            total += computeSubAssetValue(asset.id, sub, priceCache, usdThb, transactions, asOfDate);
        }
        return total;
    }

    // Fund with finnomenaCode — apply cached NAV × transaction-derived units
    if (asset.finnomenaCode?.trim()) {
        const code = asset.finnomenaCode.trim();
        const nav = priceCache.get(code);
        const { units } = holdingsAsOf(asset, transactions, asOfDate);
        if (nav && units > 0) return units * nav;
    }

    // Top-level Yahoo symbol (equity, gold, standalone stocks) — mirror frontend
    if (asset.yahooSymbol?.trim()) {
        const sym = normalizeYahooSymbol(asset.yahooSymbol);
        const price = sym ? priceCache.get(sym) : null;
        const { qty } = holdingsAsOf(asset, transactions, asOfDate);
        if (price && qty > 0) {
            const isUSD = asset.currency === 'USD';
            return isUSD ? qty * price * usdThb : qty * price;
        }
    }

    // Cash/bond — derive value from transactions (sells consume income first)
    if (isManualIncomeAsset(asset)) {
        const assetTxs = (transactions || []).filter(t => t.asset_id === asset.id && !t.sub_asset_id);
        return manualIncomeState(assetTxs, asOfDate).value;
    }

    // Other manual assets — use stored currentValue
    return Number(asset.currentValue) || 0;
}

function computeSubAssetValue(parentId, sub, priceCache, usdThb, transactions, asOfDate) {
    const sym = normalizeYahooSymbol(sub.yahooSymbol);
    const price = sym ? priceCache.get(sym) : null;
    const { qty } = subHoldingsAsOf(parentId, sub, transactions, asOfDate);
    if (price && qty > 0) {
        const isUSD = sub.currency === 'USD';
        return isUSD ? qty * price * usdThb : qty * price;
    }
    return Number(sub.currentValue) || 0;
}

/** Daily OHLC — open chains from previous close on first sync of the day. */
function dailyOhlc(existing, currentVal, prevClose) {
    let o, h, l;
    if (existing) {
        const storedO = Number(existing.o ?? existing.o_invest_thb);
        o = Number.isFinite(storedO) ? storedO : (prevClose != null ? prevClose : currentVal);
        h = Math.max(Number(existing.h ?? existing.h_invest_thb) || currentVal, currentVal);
        l = Math.min(Number(existing.l ?? existing.l_invest_thb) || currentVal, currentVal);
    } else {
        o = prevClose != null ? prevClose : currentVal;
        h = Math.max(o, currentVal);
        l = Math.min(o, currentVal);
    }
    h = Math.max(h, o, currentVal);
    l = Math.min(l, o, currentVal);
    return { o: +o.toFixed(2), h: +h.toFixed(2), l: +l.toFixed(2) };
}

function assetOhlc(existingEntry, currentVal, prevClose) {
    if (existingEntry) {
        return dailyOhlc(
            { o: existingEntry.o, h: existingEntry.h, l: existingEntry.l },
            currentVal,
            prevClose,
        );
    }
    return dailyOhlc(null, currentVal, prevClose);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    const now = new Date();
    // snapshot_date is the calendar date in ICT (UTC+7)
    const ictDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const snapshotDate = ictDate.toISOString().slice(0, 10);

    console.log(`[${now.toISOString()}] Recording portfolio snapshot for ${snapshotDate}…`);

    // 1. Load all portfolios and transactions (for holdings-as-of date)
    const portfolios = await fetchAllPaginated('/portfolio?select=user_id,assets', { pageSize: 10 });
    const allTx = await fetchAllPaginated('/transactions?select=*', { pageSize: 500 });
    const txByUser = new Map();
    for (const tx of allTx) {
        if (!txByUser.has(tx.user_id)) txByUser.set(tx.user_id, []);
        txByUser.get(tx.user_id).push(tx);
    }
    console.log(`Found ${portfolios.length} portfolio(s)`);

    // 2. Collect all symbols we'll need prices for
    const allSymbols = new Set(['USDTHB=X']);
    for (const row of portfolios) {
        const assets = Array.isArray(row.assets) ? row.assets : [];
        for (const asset of assets) {
            if (asset.finnomenaCode?.trim()) allSymbols.add(asset.finnomenaCode.trim());
            if (asset.yahooSymbol?.trim()) allSymbols.add(normalizeYahooSymbol(asset.yahooSymbol));
            for (const sub of asset.subAssets || []) {
                if (sub.yahooSymbol?.trim()) allSymbols.add(normalizeYahooSymbol(sub.yahooSymbol));
            }
        }
    }

    // 3. Load price_cache for all needed symbols.
    // We fetch ALL rows and filter in JS to avoid URL encoding issues with
    // symbols containing special chars like '&' (SCBS&P500A) or '()' (K-US500X-A(A)).
    const allCacheRows = await sbGet('/price_cache?select=symbol,price');
    const priceCache = new Map(
        allCacheRows
            .filter(r => allSymbols.has(r.symbol))
            .map(r => [r.symbol, r.price])
    );
    console.log(`Loaded ${priceCache.size} prices from cache (${allCacheRows.length} total rows fetched)`);

    // 4. Load today's snapshots (for intraday OHLC) and most recent prior snapshot per user
    const existingDaySnapshots = await sbGet(`/portfolio_snapshots?snapshot_date=eq.${snapshotDate}`);
    const existingSnapMap = new Map(existingDaySnapshots.map(s => [s.user_id, s]));
    console.log(`Loaded ${existingDaySnapshots.length} existing snapshot(s) for today to handle OHLC updates.`);

    const priorSnapshots = await sbGet(
        `/portfolio_snapshots?snapshot_date=lt.${snapshotDate}&select=user_id,snapshot_date,total_invest_thb,asset_breakdown&order=snapshot_date.desc`,
    );
    const prevSnapMap = new Map();
    for (const s of priorSnapshots) {
        if (!prevSnapMap.has(s.user_id)) prevSnapMap.set(s.user_id, s);
    }
    console.log(`Loaded prior snapshot for ${prevSnapMap.size} user(s) (for chained daily open).`);

    // 5. Compute snapshots per user
    const snapshotRows = [];
    for (const row of portfolios) {
        const assets = Array.isArray(row.assets) ? row.assets : [];
        if (assets.length === 0) continue;

        let totalInvest = 0;
        let totalSpec = 0;
        const breakdown = [];

        const existing = existingSnapMap.get(row.user_id);
        const prevSnap = prevSnapMap.get(row.user_id);
        const prevBreakdown = prevSnap?.asset_breakdown || [];
        const existingBreakdown = existing?.asset_breakdown || [];
        const usdThb = priceCache.get('USDTHB=X') ?? 35;
        const transactions = txByUser.get(row.user_id) || [];

        for (const asset of assets) {
            const currentValue = computeAssetValue(asset, priceCache, transactions, snapshotDate);
            const assetTxs = transactions.filter(t => t.asset_id === asset.id && !t.sub_asset_id);
            const invested = isManualIncomeAsset(asset)
                ? manualIncomeState(assetTxs, snapshotDate).principal
                : (Number(asset.invested) || 0);
            const existingEntry = existingBreakdown.find(e => e.id === asset.id);
            const prevEntry = prevBreakdown.find(e => e.id === asset.id);
            const prevAssetClose = prevEntry != null ? Number(prevEntry.currentValue) : null;
            const { o, h, l } = assetOhlc(existingEntry, currentValue, prevAssetClose);

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
                    const subVal = computeSubAssetValue(asset.id, sub, priceCache, usdThb, transactions, snapshotDate);
                    const subInvested = Number(sub.invested) || 0;
                    const existingSub = existingBreakdown.find(e => e.id === sub.id);
                    const prevSub = prevBreakdown.find(e => e.id === sub.id);
                    const prevSubClose = prevSub != null ? Number(prevSub.currentValue) : null;
                    const subOhlc = assetOhlc(existingSub, subVal, prevSubClose);
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

            if (asset.isSpeculative) {
                totalSpec += currentValue;
            } else {
                totalInvest += currentValue;
            }
        }

        const currentVal = +totalInvest.toFixed(2);
        const prevPortfolioClose = prevSnap != null ? Number(prevSnap.total_invest_thb) : null;
        const { o, h, l } = dailyOhlc(existing, currentVal, prevPortfolioClose);

        snapshotRows.push({
            user_id: row.user_id,
            snapshot_at: now.toISOString(),
            snapshot_date: snapshotDate,
            total_invest_thb: currentVal,
            total_spec_thb: +totalSpec.toFixed(2),
            net_worth_thb: +(currentVal + totalSpec).toFixed(2),
            asset_breakdown: breakdown,
            o_invest_thb: o,
            h_invest_thb: h,
            l_invest_thb: l,
        });

        console.log(`  User ${row.user_id.slice(0, 8)}… → ฿${currentVal} (O:฿${o} H:฿${h} L:฿${l})`);
    }

    // 6. Upsert — conflict target is (user_id, snapshot_date) to allow re-runs
    if (snapshotRows.length > 0) {
        await sbUpsert('portfolio_snapshots', snapshotRows, 'user_id,snapshot_date');
        console.log(`\n✓ Upserted ${snapshotRows.length} snapshot(s) for ${snapshotDate}`);
    } else {
        console.log('No portfolios to snapshot.');
    }

    console.log(`[${new Date().toISOString()}] Done.`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

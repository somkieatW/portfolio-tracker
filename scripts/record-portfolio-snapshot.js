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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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

async function sbUpsert(table, rows, onConflict = null) {
    const qs = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${qs}`, {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`Supabase upsert ${table} → ${res.status}: ${await res.text()}`);
}

// ─── Stock group types (mirror frontend) ─────────────────────────────────────
const STOCK_GROUP_TYPES = new Set(['us_stocks', 'thai_stocks']);

// ─── Compute current value for a single asset using cached prices ─────────────
function computeAssetValue(asset, priceCache) {
    const usdThb = priceCache.get('USDTHB=X') ?? 35;

    // Stock group — compute from sub-assets using live cached prices
    if (STOCK_GROUP_TYPES.has(asset.type) && Array.isArray(asset.subAssets)) {
        let total = 0;
        for (const sub of asset.subAssets) {
            const sym = sub.yahooSymbol?.trim();
            const price = sym ? priceCache.get(sym) : null;
            const qty = Number(sub.qty) || 0;
            if (price && qty > 0) {
                const isUSD = sub.currency === 'USD';
                total += isUSD ? qty * price * usdThb : qty * price;
            } else {
                // Fallback: use stored currentValue for this sub-asset
                total += Number(sub.currentValue) || 0;
            }
        }
        return total;
    }

    // Fund with finnomenaCode — apply cached NAV × units
    if (asset.finnomenaCode?.trim()) {
        const code = asset.finnomenaCode.trim();
        const nav = priceCache.get(code);
        const units = Number(asset.units) || 0;
        if (nav && units > 0) return units * nav;
    }

    // For all other assets (manual, forex, bonds, etc.), use the stored
    // currentValue exactly — this matches what the frontend displays.
    return Number(asset.currentValue) || 0;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    const now = new Date();
    // snapshot_date is the calendar date in ICT (UTC+7)
    const ictDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const snapshotDate = ictDate.toISOString().slice(0, 10);

    console.log(`[${now.toISOString()}] Recording portfolio snapshot for ${snapshotDate}…`);

    // 1. Load all portfolios
    const portfolios = await sbGet('/portfolio?select=user_id,assets');
    console.log(`Found ${portfolios.length} portfolio(s)`);

    // 2. Collect all symbols we'll need prices for
    const allSymbols = new Set(['USDTHB=X']);
    for (const row of portfolios) {
        const assets = Array.isArray(row.assets) ? row.assets : [];
        for (const asset of assets) {
            if (asset.finnomenaCode?.trim()) allSymbols.add(asset.finnomenaCode.trim());
            for (const sub of asset.subAssets || []) {
                if (sub.yahooSymbol?.trim()) allSymbols.add(sub.yahooSymbol.trim());
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

    // 4. Load existing snapshots for today (ICT) to handle OHLC updates
    const existingDaySnapshots = await sbGet(`/portfolio_snapshots?snapshot_date=eq.${snapshotDate}`);
    const existingSnapMap = new Map(existingDaySnapshots.map(s => [s.user_id, s]));
    console.log(`Loaded ${existingDaySnapshots.length} existing snapshot(s) for today to handle OHLC updates.`);

    // 5. Compute snapshots per user
    const snapshotRows = [];
    for (const row of portfolios) {
        const assets = Array.isArray(row.assets) ? row.assets : [];
        if (assets.length === 0) continue;

        let totalInvest = 0;
        let totalSpec = 0;
        const breakdown = [];

        for (const asset of assets) {
            const currentValue = computeAssetValue(asset, priceCache);
            const invested = Number(asset.invested) || 0;
            const entry = {
                id: asset.id,
                name: asset.name,
                type: asset.type,
                currentValue: +currentValue.toFixed(2),
                invested: +invested.toFixed(2),
            };
            breakdown.push(entry);

            if (asset.isSpeculative) {
                totalSpec += currentValue;
            } else {
                totalInvest += currentValue;
            }
        }

        const currentVal = +totalInvest.toFixed(2);
        const existing = existingSnapMap.get(row.user_id);

        let o = currentVal, h = currentVal, l = currentVal;
        if (existing) {
            // Keep original Open, update High/Low
            o = Number(existing.o_invest_thb) || currentVal;
            h = Math.max(Number(existing.h_invest_thb) || currentVal, currentVal);
            l = Math.min(Number(existing.l_invest_thb) || currentVal, currentVal);
        }

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

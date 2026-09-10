// ─── Finnomena Unofficial API Service ─────────────────────────────────────────
// Wraps public endpoints from finnomena.com (no login required).
// Based on: https://github.com/pochl/finnomena-api-unofficial
//
// Endpoints used:
//   GET https://www.finnomena.com/fn3/api/fund/public/list
//   GET https://www.finnomena.com/fn3/api/fund/v2/public/funds/{id}/latest
//
// In development: Vite proxies /finnomena-api → https://www.finnomena.com (vite.config.js)
// In production:  Uses allorigins.win as a CORS proxy

import { fetchWithTimeout } from "./fetchWithTimeout.js";
import { fetchViaCorsProxies } from "./corsProxies.js";

const IS_DEV = import.meta.env.DEV;
const FUND_MAP_KEY = "finnomena_fund_map_v1";
const FUND_MAP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function finnoFetch(path) {
    if (IS_DEV) {
        const res = await fetchWithTimeout(`/finnomena-api${path}`);
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
        return res.json();
    } else {
        const target = `https://www.finnomena.com${path}`;
        const res = await fetchViaCorsProxies(target);
        return res.json();
    }
}

let fundMapCache = null;

function loadFundMapFromSession() {
    try {
        const raw = sessionStorage.getItem(FUND_MAP_KEY);
        if (!raw) return null;
        const { ts, entries } = JSON.parse(raw);
        if (Date.now() - ts > FUND_MAP_TTL_MS) return null;
        return new Map(entries);
    } catch {
        return null;
    }
}

function saveFundMapToSession(map) {
    try {
        sessionStorage.setItem(FUND_MAP_KEY, JSON.stringify({
            ts: Date.now(),
            entries: [...map.entries()],
        }));
    } catch {
        // sessionStorage full or unavailable
    }
}

/**
 * Fetches the full Finnomena fund list and builds a lookup map.
 * The map keys are normalized fund codes (uppercase, no spaces).
 * Returns: Map of normalizedCode → fundId (morningstar id)
 */
async function getFundMap() {
    if (fundMapCache) return fundMapCache;

    const cached = loadFundMapFromSession();
    if (cached?.size) {
        fundMapCache = cached;
        return fundMapCache;
    }

    const list = await finnoFetch(`/fn3/api/fund/public/list`);

    fundMapCache = new Map();
    for (const fund of list) {
        if (!fund.short_code || !fund.id) continue;
        // Normalize: uppercase and strip trailing class suffixes like "(A)" or "-A"
        // Store both the raw short_code and a stripped version for fuzzy matching
        const raw = fund.short_code.toUpperCase().trim();
        fundMapCache.set(raw, fund.id);

        // Also index without trailing parenthetical e.g. "K-US500X-A(A)" → "K-US500X-A"
        const stripped = raw.replace(/\([^)]*\)$/, "").trim();
        if (stripped !== raw && !fundMapCache.has(stripped)) {
            fundMapCache.set(stripped, fund.id);
        }
    }

    saveFundMapToSession(fundMapCache);
    return fundMapCache;
}

/**
 * Resolves a user-supplied fund code to a Finnomena fund ID.
 * Tries exact match first, then partial/prefix match.
 * Returns: fundId string, or null if not found.
 */
async function resolveFundId(fundCode) {
    const map = await getFundMap();
    const query = fundCode.toUpperCase().trim();

    // 1. Exact match
    if (map.has(query)) return map.get(query);

    // 2. Prefix match (e.g. user typed "K-US500X-A", map has "K-US500X-A(A)")
    for (const [key, id] of map.entries()) {
        if (key.startsWith(query) || query.startsWith(key)) return id;
    }

    return null;
}

/**
 * Fetches the latest NAV for a single fund code.
 * @param {string} fundCode - e.g. "K-US500X-A"
 * @returns {{ nav: number, date: string, dChange: number, fundId: string } | null}
 */
export async function fetchCurrentNAV(fundCode) {
    const fundId = await resolveFundId(fundCode);
    if (!fundId) return null;

    const json = await finnoFetch(`/fn3/api/fund/v2/public/funds/${fundId}/latest`);

    if (!json.status || !json.data) return null;
    const { value, date, d_change } = json.data;
    return {
        nav: parseFloat(value),
        date: date ? date.substring(0, 10) : null, // "YYYY-MM-DD"
        dChange: parseFloat(d_change),
        fundId,
    };
}

/**
 * Fetches NAVs for all assets that have a finnomenaCode set.
 * @param {Array} assets - the portfolio assets array
 * @returns {Map<string, { nav, date, dChange, fundId }>} - keyed by asset.id
 */
export async function fetchAllFundNAVs(assets) {
    const targets = assets.filter((a) => a.finnomenaCode?.trim());
    const results = new Map();

    await Promise.allSettled(
        targets.map(async (asset) => {
            try {
                const navData = await fetchCurrentNAV(asset.finnomenaCode.trim());
                if (navData) results.set(asset.id, navData);
            } catch (err) {
                console.warn(`[Finnomena] Failed to fetch NAV for asset "${asset.name}" (${asset.finnomenaCode}):`, err);
            }
        })
    );

    return results;
}

/**
 * Clears the in-memory fund list cache (useful for refreshing stale data).
 */
export function clearFundCache() {
    fundMapCache = null;
}

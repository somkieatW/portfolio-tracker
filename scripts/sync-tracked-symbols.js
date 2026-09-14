#!/usr/bin/env node
/**
 * sync-tracked-symbols.js
 *
 * One-time / manual backfill: scan all portfolios and upsert tracked_symbols.
 * Run after applying migration 06_tracked_symbols.sql.
 *
 *   node scripts/sync-tracked-symbols.js
 */

import { collectTrackedSymbols } from "../src/domain/pricing/trackedSymbols.js";
import { requireSupabaseEnv, fetchAllPaginated, sbUpsert } from "./lib/supabaseAdmin.js";

requireSupabaseEnv();

async function main() {
  console.log(`[${new Date().toISOString()}] Syncing tracked_symbols from portfolios…`);

  const portfolios = await fetchAllPaginated("/portfolio?select=assets", { pageSize: 10 });
  const bySymbol = new Map();

  for (const row of portfolios) {
    const assets = Array.isArray(row.assets) ? row.assets : [];
    for (const entry of collectTrackedSymbols(assets)) {
      bySymbol.set(entry.symbol, entry);
    }
  }

  const rows = [...bySymbol.values()].map(r => ({
    ...r,
    updated_at: new Date().toISOString(),
  }));

  if (rows.length === 0) {
    console.log("No symbols found in portfolios.");
    return;
  }

  await sbUpsert("tracked_symbols", rows);
  console.log(`✓ Upserted ${rows.length} symbol(s) to tracked_symbols`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});

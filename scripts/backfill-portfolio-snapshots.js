#!/usr/bin/env node
/**
 * backfill-portfolio-snapshots.js
 *
 * Fills missing portfolio_snapshots between two dates using:
 *   - Transaction history for qty/units held on each day
 *   - Yahoo Finance historical closes for stocks, gold, FX
 *   - Linear interpolation for manual assets between known snapshots
 *
 * Usage:
 *   node scripts/backfill-portfolio-snapshots.js
 *   node scripts/backfill-portfolio-snapshots.js --from=2026-07-01 --to=2026-09-09
 *   node scripts/backfill-portfolio-snapshots.js --dry-run
 *   node scripts/backfill-portfolio-snapshots.js --force   # overwrite existing dates in range
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import dotenv from "dotenv";
import { normalizeYahooSymbol } from "../src/domain/pricing/yahooSymbol.js";
import { requireSupabaseEnv, sbGet, sbUpsert } from "./lib/supabaseAdmin.js";

dotenv.config();
import { fetchDailyCloses } from "./lib/yahooHistorical.js";
import { fetchFundNavSeries } from "./lib/finnomenaHistorical.js";
import { buildManualFallback, buildSnapshotForDate } from "./lib/snapshotCompute.js";

requireSupabaseEnv();

function ictYesterday() {
  const ict = new Date(Date.now() + 7 * 60 * 60 * 1000);
  ict.setUTCDate(ict.getUTCDate() - 1);
  return ict.toISOString().slice(0, 10);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    from: "2026-07-01",
    to: ictYesterday(),
    dryRun: false,
    force: false,
    userId: null,
  };
  for (const arg of args) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--force") opts.force = true;
    else if (arg.startsWith("--from=")) opts.from = arg.slice(7);
    else if (arg.startsWith("--to=")) opts.to = arg.slice(5);
    else if (arg.startsWith("--user=")) opts.userId = arg.slice(7);
  }
  return opts;
}

function dateRange(from, to) {
  const dates = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

function collectSymbols(assets) {
  const yahoo = new Set(["USDTHB=X"]);
  const funds = new Set();
  for (const a of assets) {
    if (a.finnomenaCode?.trim()) funds.add(a.finnomenaCode.trim());
    if (a.yahooSymbol?.trim()) yahoo.add(normalizeYahooSymbol(a.yahooSymbol));
    for (const sub of a.subAssets || []) {
      if (sub.yahooSymbol?.trim()) yahoo.add(normalizeYahooSymbol(sub.yahooSymbol));
    }
  }
  return { yahoo, funds };
}

async function loadHistoricalPrices(yahooSymbols, fundCodes, from, to) {
  const priceMaps = new Map();
  for (const sym of yahooSymbols) {
    try {
      console.log(`  Fetching ${sym}…`);
      const map = await fetchDailyCloses(sym, from, to);
      priceMaps.set(sym, map);
      console.log(`    → ${map.size} daily closes`);
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.warn(`    ⚠ ${sym}: ${e.message}`);
    }
  }
  for (const code of fundCodes) {
    try {
      console.log(`  Fetching NAV ${code}…`);
      const map = await fetchFundNavSeries(code, from, to);
      priceMaps.set(code, map);
      console.log(`    → ${map.size} daily NAVs`);
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.warn(`    ⚠ ${code}: ${e.message}`);
    }
  }
  return priceMaps;
}

async function main() {
  const opts = parseArgs();
  console.log(`Backfill snapshots ${opts.from} → ${opts.to}${opts.dryRun ? " (dry run)" : ""}${opts.force ? " (force overwrite)" : ""}`);

  const portfolios = await sbGet("/portfolio?select=user_id,assets");
  const allTx = await sbGet("/transactions?select=*&order=date.asc");
  const txByUser = new Map();
  for (const tx of allTx) {
    if (!txByUser.has(tx.user_id)) txByUser.set(tx.user_id, []);
    txByUser.get(tx.user_id).push(tx);
  }

  const targets = opts.userId
    ? portfolios.filter(p => p.user_id === opts.userId)
    : portfolios;

  const allDates = dateRange(opts.from, opts.to);
  const rowsToUpsert = [];

  for (const row of targets) {
    const assets = Array.isArray(row.assets) ? row.assets : [];
    if (assets.length === 0) continue;

    const userId = row.user_id;
    const transactions = txByUser.get(userId) || [];

    const existing = await sbGet(
      `/portfolio_snapshots?user_id=eq.${userId}&snapshot_date=gte.${opts.from}&snapshot_date=lte.${opts.to}&select=snapshot_date,total_invest_thb,asset_breakdown&order=snapshot_date.asc`,
    );
    const existingDates = new Set(existing.map(s => s.snapshot_date));
    const missingDates = opts.force
      ? allDates
      : allDates.filter(d => !existingDates.has(d));

    if (missingDates.length === 0) {
      console.log(`User ${userId.slice(0, 8)}… — no gaps in range`);
      continue;
    }

    console.log(`User ${userId.slice(0, 8)}… — ${missingDates.length} day(s) to ${opts.force ? "rebuild" : "fill"}`);

    const allSnaps = await sbGet(
      `/portfolio_snapshots?user_id=eq.${userId}&select=snapshot_date,total_invest_thb,asset_breakdown&order=snapshot_date.asc`,
    );
    const { known: manualKnown } = buildManualFallback(allSnaps);

    const { yahoo, funds } = collectSymbols(assets);
    const priceMaps = await loadHistoricalPrices(yahoo, funds, opts.from, opts.to);
    const usdThbByDate = priceMaps.get("USDTHB=X") ?? new Map();

    const snapByDate = new Map(allSnaps.map(s => [s.snapshot_date, s]));
    for (const s of existing) snapByDate.set(s.snapshot_date, s);

    let prevSnap = null;
    for (const s of allSnaps) {
      if (s.snapshot_date < opts.from) prevSnap = s;
    }

    for (const dateStr of missingDates) {
      while (prevSnap && prevSnap.snapshot_date >= dateStr) {
        prevSnap = null;
      }
      const prior = [...snapByDate.entries()]
        .filter(([d]) => d < dateStr)
        .sort((a, b) => b[0].localeCompare(a[0]))[0]?.[1] ?? prevSnap;

      const prevClose = prior ? Number(prior.total_invest_thb) : null;
      const prevBreakdown = prior?.asset_breakdown || [];

      const snapshot = buildSnapshotForDate({
        userId,
        assets,
        transactions,
        dateStr,
        priceMaps,
        usdThbByDate,
        manualKnown,
        prevPortfolioClose: prevClose,
        prevBreakdown,
      });

      snapByDate.set(dateStr, snapshot);
      rowsToUpsert.push(snapshot);
      console.log(`  ${dateStr} → ฿${snapshot.total_invest_thb}`);
    }
  }

  if (rowsToUpsert.length === 0) {
    console.log("\nNothing to backfill.");
    return;
  }

  console.log(`\n${opts.dryRun ? "Would upsert" : "Upserting"} ${rowsToUpsert.length} snapshot(s)…`);
  if (!opts.dryRun) {
    const BATCH = 25;
    for (let i = 0; i < rowsToUpsert.length; i += BATCH) {
      const chunk = rowsToUpsert.slice(i, i + BATCH);
      const dates = `${chunk[0].snapshot_date}…${chunk[chunk.length - 1].snapshot_date}`;
      console.log(`  Upserting batch ${Math.floor(i / BATCH) + 1} (${chunk.length} rows, ${dates})…`);
      await sbUpsert("portfolio_snapshots", chunk, "user_id,snapshot_date");
    }
    console.log(`✓ Done. Upserted ${rowsToUpsert.length} snapshot(s).`);
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});

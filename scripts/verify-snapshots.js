#!/usr/bin/env node
/**
 * Audit portfolio_snapshots — date coverage per user, gap detection.
 * Reads credentials from .env (supabase_url, service_role) or SUPABASE_* env vars.
 */

import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  dotenv.config({ path: resolve(process.cwd(), ".env") });
  dotenv.config({ path: resolve(__dirname, "..", ".env") });
  const url = process.env.SUPABASE_URL || process.env.supabase_url || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.service_role;
  if (!url || !key) {
    console.error("Missing supabase_url / service_role in .env (or SUPABASE_URL / SUPABASE_SERVICE_KEY)");
    process.exit(1);
  }
  return { url, key };
}

async function sbGet(url, key, path) {
  const res = await fetch(`${url}/rest/v1${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
  return res.json();
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

function ictYesterday() {
  const ict = new Date(Date.now() + 7 * 60 * 60 * 1000);
  ict.setUTCDate(ict.getUTCDate() - 1);
  return ict.toISOString().slice(0, 10);
}

async function main() {
  const { url, key } = loadEnv();
  const from = process.argv.find(a => a.startsWith("--from="))?.slice(7) || "2026-07-01";
  const to = process.argv.find(a => a.startsWith("--to="))?.slice(5) || ictYesterday();

  const portfolios = await sbGet(url, key, "/portfolio?select=user_id");
  const snaps = await sbGet(
    url,
    key,
    "/portfolio_snapshots?select=user_id,snapshot_date,total_invest_thb&order=snapshot_date.asc",
  );

  console.log(`\n=== portfolio_snapshots audit (${from} → ${to}) ===\n`);
  console.log(`Portfolio users: ${portfolios.length}`);
  console.log(`Total snapshot rows (all time): ${snaps.length}\n`);

  const expected = dateRange(from, to);
  const byUser = new Map();
  for (const s of snaps) {
    if (!byUser.has(s.user_id)) byUser.set(s.user_id, []);
    byUser.get(s.user_id).push(s);
  }

  for (const { user_id } of portfolios) {
    const rows = byUser.get(user_id) || [];
    const inRange = rows.filter(r => r.snapshot_date >= from && r.snapshot_date <= to);
    const dates = new Set(inRange.map(r => r.snapshot_date));
    const missing = expected.filter(d => !dates.has(d));

    console.log(`User: ${user_id}`);
    console.log(`  All-time snapshots: ${rows.length}`);
    if (rows.length) {
      console.log(`  Date range: ${rows[0].snapshot_date} → ${rows[rows.length - 1].snapshot_date}`);
    }
    console.log(`  In backfill window: ${inRange.length} / ${expected.length} days`);
    if (missing.length === 0) {
      console.log(`  ✓ No gaps in window`);
    } else {
      console.log(`  ✗ Missing ${missing.length} day(s):`);
      const show = missing.length <= 15 ? missing : [...missing.slice(0, 8), "...", ...missing.slice(-4)];
      console.log(`    ${show.join(", ")}`);
    }
    if (inRange.length > 0) {
      const sample = inRange.slice(0, 3).map(r => `${r.snapshot_date}=฿${r.total_invest_thb}`);
      console.log(`  Sample: ${sample.join(", ")}`);
    }
    console.log();
  }

  const orphanUsers = [...byUser.keys()].filter(uid => !portfolios.some(p => p.user_id === uid));
  if (orphanUsers.length) {
    console.log(`Snapshot rows for users with no portfolio row: ${orphanUsers.length}`);
    for (const uid of orphanUsers) console.log(`  ${uid} (${byUser.get(uid).length} rows)`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

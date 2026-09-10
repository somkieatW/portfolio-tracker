#!/usr/bin/env node
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", ".env") });

const url = process.env.SUPABASE_URL || process.env.supabase_url;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.service_role;

async function sbGet(path) {
  const res = await fetch(`${url}/rest/v1${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const MAIN = process.argv[2] || "e52f6232-6ade-4cac-9219-ba7b08891de6";

async function main() {
  const portfolios = await sbGet("/portfolio?select=user_id,assets,updated_at");
  for (const p of portfolios) {
    const n = Array.isArray(p.assets) ? p.assets.length : 0;
    console.log(`${p.user_id.slice(0, 8)}… assets=${n} updated=${p.updated_at?.slice(0, 10)}`);
  }

  console.log(`\n--- Snapshots Jul–Sep for ${MAIN.slice(0, 8)}… ---`);
  const snaps = await sbGet(
    `/portfolio_snapshots?user_id=eq.${MAIN}&snapshot_date=gte.2026-07-01&snapshot_date=lte.2026-09-09&select=snapshot_date,total_invest_thb&order=snapshot_date.asc`,
  );
  console.log(`Count: ${snaps.length}`);
  for (const s of snaps) {
    console.log(`  ${s.snapshot_date}  ฿${s.total_invest_thb}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

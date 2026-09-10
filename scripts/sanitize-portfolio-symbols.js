#!/usr/bin/env node
/**
 * sanitize-portfolio-symbols.js
 *
 * One-time fix: normalize legacy Yahoo symbols (e.g. GC%3DF → GC=F) in all portfolios.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import dotenv from "dotenv";
import { normalizeYahooSymbol } from "../src/domain/pricing/yahooSymbol.js";
import { requireSupabaseEnv, sbGet, sbPatch } from "./lib/supabaseAdmin.js";

dotenv.config();
requireSupabaseEnv();

function sanitizeAssets(assets) {
  let changed = false;
  const next = (assets || []).map(a => {
    const copy = { ...a };
    if (copy.yahooSymbol?.trim()) {
      const norm = normalizeYahooSymbol(copy.yahooSymbol);
      if (norm !== copy.yahooSymbol) {
        copy.yahooSymbol = norm;
        changed = true;
      }
    }
    if (copy.subAssets?.length) {
      copy.subAssets = copy.subAssets.map(sub => {
        const s = { ...sub };
        if (s.yahooSymbol?.trim()) {
          const norm = normalizeYahooSymbol(s.yahooSymbol);
          if (norm !== s.yahooSymbol) {
            s.yahooSymbol = norm;
            changed = true;
          }
        }
        return s;
      });
    }
    return copy;
  });
  return { assets: next, changed };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const rows = await sbGet("/portfolio?select=user_id,assets");
  let fixed = 0;

  for (const row of rows) {
    const { assets, changed } = sanitizeAssets(row.assets);
    if (!changed) continue;
    fixed++;
    console.log(`User ${row.user_id.slice(0, 8)}… — symbols normalized`);
    if (!dryRun) {
      await sbPatch("portfolio", `user_id=eq.${row.user_id}`, {
        assets,
        updated_at: new Date().toISOString(),
      });
    }
  }

  console.log(dryRun ? `Would fix ${fixed} portfolio(s)` : `Fixed ${fixed} portfolio(s)`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});

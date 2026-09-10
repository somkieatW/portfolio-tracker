import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", "..", ".env") });

function envUrl() {
  return process.env.SUPABASE_URL || process.env.supabase_url || process.env.VITE_SUPABASE_URL;
}

function envKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.service_role;
}

export function requireSupabaseEnv() {
  if (!envUrl() || !envKey()) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY (or supabase_url / service_role in .env)");
    process.exit(1);
  }
}

const sbHeaders = () => ({
  apikey: envKey(),
  Authorization: `Bearer ${envKey()}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
});

export async function sbGet(path) {
  const res = await fetch(`${envUrl()}/rest/v1${path}`, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Supabase GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function sbUpsert(table, rows, onConflict = null) {
  const qs = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
  const res = await fetch(`${envUrl()}/rest/v1/${table}${qs}`, {
    method: "POST",
    headers: { ...sbHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase upsert ${table} → ${res.status}: ${await res.text()}`);
}

export async function sbPatch(table, filter, body) {
  const res = await fetch(`${envUrl()}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: { ...sbHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${table} → ${res.status}: ${await res.text()}`);
}

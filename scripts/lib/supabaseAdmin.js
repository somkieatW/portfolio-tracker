import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", "..", ".env") });

function envUrl() {
  return process.env.SUPABASE_URL || process.env.supabase_url || process.env.VITE_SUPABASE_URL;
}

function envKey() {
  return process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.service_role;
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

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function sbFetch(path, { method = "GET", body, headers = {}, retries = 4, baseDelayMs = 2000, timeoutMs = 90_000 } = {}) {
  const url = `${envUrl()}/rest/v1${path}`;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: { ...sbHeaders(), ...headers },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return res;

      const text = await res.text();
      const err = new Error(`Supabase ${method} ${path} → ${res.status}: ${text}`);
      if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
        const wait = baseDelayMs * Math.pow(2, attempt);
        console.warn(`[supabase] ${res.status} on ${path}, retry ${attempt + 1}/${retries} in ${wait}ms`);
        await sleep(wait);
        continue;
      }
      throw err;
    } catch (e) {
      lastError = e;
      const retryable = e.name === "TimeoutError" || e.name === "AbortError" || e.cause?.code === "ECONNRESET";
      if (retryable && attempt < retries) {
        const wait = baseDelayMs * Math.pow(2, attempt);
        console.warn(`[supabase] ${e.message} on ${path}, retry ${attempt + 1}/${retries} in ${wait}ms`);
        await sleep(wait);
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

export async function sbGet(path, options) {
  const res = await sbFetch(path, options);
  return res.json();
}

/** Page through PostgREST results to avoid large single-response timeouts. */
export async function fetchAllPaginated(path, { pageSize = 25 } = {}) {
  const all = [];
  let offset = 0;

  while (true) {
    const sep = path.includes("?") ? "&" : "?";
    const pagePath = `${path}${sep}limit=${pageSize}&offset=${offset}`;
    const batch = await sbGet(pagePath);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

export async function sbUpsert(table, rows, onConflict = null) {
  const qs = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
  await sbFetch(`/${table}${qs}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
}

export async function sbPatch(table, filter, body) {
  const res = await fetch(`${envUrl()}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: { ...sbHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${table} → ${res.status}: ${await res.text()}`);
}

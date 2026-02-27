import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Only create Supabase client if URL and Key are provided
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Simple device fingerprint — no login required
// Uses localStorage to persist a unique user ID per device
export function getDeviceId() {
  let id = localStorage.getItem('portfolio_device_id')
  if (!id) {
    id = 'user_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36)
    localStorage.setItem('portfolio_device_id', id)
  }
  return id
}

// Load portfolio data for this user
export async function loadPortfolio(userId) {
  // Fall back to localStorage if Supabase is not configured
  if (!supabase) {
    const localData = localStorage.getItem(`portfolio_data_${userId}`);
    return localData ? JSON.parse(localData) : null;
  }

  const { data, error } = await supabase
    .from('portfolio')
    .select('assets, settings')
    .eq('user_id', userId)
    .single()

  if (error || !data) return null
  return data
}

// Save (upsert) portfolio data for this user
export async function savePortfolio(userId, assets, settings) {
  // Always save locally as a backup / offline mode
  localStorage.setItem(`portfolio_data_${userId}`, JSON.stringify({ assets, settings }));

  if (!supabase) return true;

  const { error } = await supabase
    .from('portfolio')
    .upsert({
      user_id: userId,
      assets: assets,
      settings: settings,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) console.error('Supabase save error:', error)
  return !error
}

// ─── Price Cache Helpers ──────────────────────────────────────────────────────

/**
 * Batch-fetch cached prices for a list of symbols.
 * Returns a Map<symbol, { price, currency, price_date, source, updated_at }>
 */
export async function getPriceCache(symbols) {
  const result = new Map();
  if (!supabase || !symbols?.length) return result;

  const { data, error } = await supabase
    .from('price_cache')
    .select('symbol, price, currency, price_date, source, updated_at')
    .in('symbol', symbols);

  if (error) {
    console.warn('[Cache] getPriceCache error:', error.message);
    return result;
  }
  for (const row of data || []) result.set(row.symbol, row);
  return result;
}

/**
 * Returns true if the cached entry is older than thresholdHours.
 */
export function isCacheStale(updatedAt, thresholdHours = 18) {
  if (!updatedAt) return true;
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  return ageMs > thresholdHours * 60 * 60 * 1000;
}

// ─── Transaction Helpers ──────────────────────────────────────────────────────

/**
 * Load all transactions for a user, newest first.
 * Optionally filter to a single assetId.
 */
export async function getTransactions(userId, assetId = null) {
  if (!supabase || !userId) return [];
  let q = supabase.from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (assetId) q = q.eq('asset_id', assetId);
  const { data, error } = await q;
  if (error) { console.warn('[Transactions] load error:', error.message); return []; }
  return data || [];
}

/**
 * Insert a single transaction row.
 * @param {object} tx - transaction object matching the table schema
 */
export async function addTransaction(tx) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('transactions').insert(tx).select().single();
  if (error) { console.error('[Transactions] insert error:', error.message); return null; }
  return data;
}

/**
 * Delete a transaction by id.
 */
export async function deleteTransaction(id) {
  if (!supabase) return false;
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) { console.warn('[Transactions] delete error:', error.message); return false; }
  return true;
}


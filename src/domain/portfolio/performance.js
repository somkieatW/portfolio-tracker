/**
 * Portfolio performance helpers — separates market gains from cash flows.
 */

import { buildManualIncomeTimeline, manualIncomeUpTo } from "./manualIncomeLedger.js";

export function formatPriceAge(iso, staleHours = 18) {
  if (!iso) return { label: "Never synced", stale: true };
  const ageMs = Date.now() - new Date(iso).getTime();
  const hours = ageMs / (3600 * 1000);
  const stale = hours > staleHours;
  if (hours < 1) return { label: `${Math.max(1, Math.round(ageMs / 60000))}m ago`, stale: false };
  if (hours < 48) return { label: `${Math.round(hours)}h ago`, stale };
  return { label: `${Math.round(hours / 24)}d ago`, stale: true };
}

function sumBreakdownInvested(breakdown) {
  if (!breakdown?.length) return 0;
  return breakdown.reduce((s, e) => s + (Number(e.invested) || 0), 0);
}

/** Net contributions (buys − sells) for core assets, keyed by transaction date. */
export function buildContributionTimeline(transactions, coreAssetIds) {
  const coreIds = new Set(coreAssetIds);
  const byDate = new Map();

  const events = transactions
    .filter(t => coreIds.has(t.asset_id) && (t.type === "buy" || t.type === "sell"))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.created_at).localeCompare(String(b.created_at)));

  let running = 0;
  for (const t of events) {
    if (t.type === "buy") running += Number(t.amount_thb || 0);
    else running -= Math.abs(Number(t.amount_thb || 0));
    byDate.set(t.date, +running.toFixed(2));
  }
  return byDate;
}

export function contributedUpTo(byDate, dateStr) {
  let last = 0;
  for (const d of [...byDate.keys()].sort()) {
    if (d <= dateStr) last = byDate.get(d);
  }
  return last;
}

/** Net contributions (buys − sells) for a single asset, keyed by transaction date. */
export function buildAssetContributionTimeline(transactions) {
  const byDate = new Map();

  const events = (transactions || [])
    .filter(t => t.type === "buy" || t.type === "sell")
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.created_at).localeCompare(String(b.created_at)));

  let running = 0;
  for (const t of events) {
    if (t.type === "buy") running += Number(t.amount_thb || 0);
    else running -= Math.abs(Number(t.amount_thb || 0));
    byDate.set(t.date, +running.toFixed(2));
  }
  return byDate;
}

/**
 * Per-asset value vs cumulative contributions.
 * `assetRows` from buildAssetSnapshotRows (snapshot_date, total_invest_thb, invested).
 */
export function buildAssetPerformanceSeries(assetRows, transactions, liveClose, { isManualIncome = false } = {}) {
  if (!assetRows?.length) return [];

  if (isManualIncome) {
    const ledger = buildManualIncomeTimeline(transactions);
    const firstTxDate = ledger.size > 0 ? [...ledger.keys()].sort()[0] : null;

    const series = assetRows.map(row => {
      const snapshotValue = Number(row.total_invest_thb) || 0;
      const snapshotInvested = Number(row.invested) || 0;

      if (!firstTxDate || row.snapshot_date < firstTxDate) {
        return {
          date: row.snapshot_date,
          value: snapshotValue,
          contributed: snapshotInvested,
          marketGain: +(snapshotValue - snapshotInvested).toFixed(2),
        };
      }

      const state = manualIncomeUpTo(ledger, row.snapshot_date);
      const contributed = state?.principal ?? snapshotInvested;
      const value = state?.value ?? snapshotValue;
      const marketGain = state?.marketGain ?? +(value - contributed).toFixed(2);
      return { date: row.snapshot_date, value, contributed, marketGain };
    });

    if (liveClose != null && series.length > 0) {
      const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const last = series[series.length - 1];
      const endState = manualIncomeUpTo(ledger, today) ?? manualIncomeUpTo(ledger, last.date);
      if (last.date === today) {
        last.value = liveClose;
        last.contributed = endState?.principal ?? last.contributed;
        last.marketGain = +(liveClose - last.contributed).toFixed(2);
      }
    }

    return series;
  }

  const byDate = buildAssetContributionTimeline(transactions);
  const hasTx = byDate.size > 0;

  const series = assetRows.map(row => {
    const value = Number(row.total_invest_thb) || 0;
    const contributed = hasTx
      ? contributedUpTo(byDate, row.snapshot_date)
      : (Number(row.invested) || 0);
    return {
      date: row.snapshot_date,
      value,
      contributed,
      marketGain: +(value - contributed).toFixed(2),
    };
  });

  if (liveClose != null && series.length > 0) {
    const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const last = series[series.length - 1];
    if (last.date === today) {
      last.value = liveClose;
      last.marketGain = +(liveClose - last.contributed).toFixed(2);
    }
  }

  return series;
}

/**
 * Value vs cumulative contributions — shows market gain separate from deposits.
 */
export function buildPerformanceSeries(snapshots, transactions, coreAssetIds, liveClose) {
  if (!snapshots?.length) return [];
  const byDate = buildContributionTimeline(transactions, coreAssetIds);
  const hasTx = byDate.size > 0;

  const series = snapshots.map(s => {
    const value = Number(s.total_invest_thb) || 0;
    const contributed = hasTx
      ? contributedUpTo(byDate, s.snapshot_date)
      : sumBreakdownInvested(s.asset_breakdown);
    return {
      date: s.snapshot_date,
      value,
      contributed,
      marketGain: +(value - contributed).toFixed(2),
    };
  });

  if (liveClose != null && series.length > 0) {
    const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const last = series[series.length - 1];
    if (last.date === today) {
      last.value = liveClose;
      last.marketGain = +(liveClose - last.contributed).toFixed(2);
    }
  }

  return series;
}

export function performanceSummary(series) {
  if (!series.length) return null;
  const first = series[0];
  const last = series[series.length - 1];
  const contribChange = last.contributed - first.contributed;
  const valueChange = last.value - first.value;
  const marketGain = last.marketGain;
  const marketReturnPct = first.contributed > 0
    ? ((marketGain / first.contributed) * 100).toFixed(2)
    : "0.00";
  return { contribChange, valueChange, marketGain, marketReturnPct, contributed: last.contributed };
}

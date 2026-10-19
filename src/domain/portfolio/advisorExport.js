/** Build a JSON-serializable bundle for financial advisors (no auth identifiers). */

function stripUserId(row) {
  if (!row || typeof row !== "object") return row;
  const { user_id, ...rest } = row;
  return rest;
}

function sortTransactions(transactions) {
  return [...(transactions || [])].sort(
    (a, b) => a.date.localeCompare(b.date) || String(a.created_at).localeCompare(String(b.created_at)),
  );
}

export function buildAdvisorExport({
  settings,
  summary,
  assets,
  transactions,
  snapshots,
  exportedAt,
}) {
  return {
    exportVersion: 1,
    exportedAt: exportedAt ?? new Date().toISOString(),
    app: "Wealth Tracker Pro",
    settings: settings ?? {},
    summary: summary ?? {},
    assets: assets ?? [],
    transactions: sortTransactions(transactions).map(stripUserId),
    snapshotHistory: (snapshots ?? []).map(stripUserId),
  };
}

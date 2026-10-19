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

export function downloadAdvisorJson(payload) {
  const text = JSON.stringify(payload, null, 2);
  const date = (payload.exportedAt || new Date().toISOString()).slice(0, 10);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `portfolio-export-${date}.json`;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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

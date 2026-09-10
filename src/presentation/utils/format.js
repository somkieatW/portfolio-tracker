// ─── HELPERS ──────────────────────────────────────────────────────────────────
export const uid = () => Math.random().toString(36).slice(2, 9);
export const fmt = (n, d = 2) => Number(n).toLocaleString("en", { minimumFractionDigits: d, maximumFractionDigits: d });

// Format a cache timestamp as "YYYY-MM-DD HH:mm"
export const fmtTs = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

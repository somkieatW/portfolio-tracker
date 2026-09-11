/** Collect min/max across numeric keys in chart rows (skips null/NaN). */
export function extentFromRows(rows, keys) {
  let min = Infinity;
  let max = -Infinity;

  for (const row of rows || []) {
    for (const key of keys) {
      const v = Number(row[key]);
      if (!Number.isFinite(v)) continue;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 0 };
  }
  return { min, max };
}

/** Tight Y domain with padding; expands flat series so movement is visible. */
export function paddedYDomain(min, max, { padRatio = 0.06, minPadRatio = 0.02, minPadAbs = 50 } = {}) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];

  if (min === max) {
    const pad = Math.max(minPadAbs, Math.abs(min) * minPadRatio);
    return [min - pad, max + pad];
  }

  const range = max - min;
  const pad = Math.max(range * padRatio, minPadAbs);
  return [min - pad, max + pad];
}

/** Signed domain for P&L — includes zero when range crosses it. */
export function paddedSignedYDomain(min, max, options) {
  const [lo, hi] = paddedYDomain(min, max, options);
  if (min < 0 && max > 0) {
    return [Math.min(lo, 0), Math.max(hi, 0)];
  }
  return [lo, hi];
}

/** Adaptive Y-axis money label — avoids duplicate ฿0k/฿1k for sub-10k values. */
export function formatAxisMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "฿—";
  const abs = Math.abs(n);

  if (abs >= 1_000_000) {
    return `฿${(n / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 10_000) {
    return `฿${(n / 1_000).toFixed(0)}k`;
  }
  if (abs >= 1_000) {
    return `฿${(n / 1_000).toFixed(1)}k`;
  }
  return `฿${Math.round(n).toLocaleString("en")}`;
}

/** Signed variant for Daily P&L axis. */
export function formatAxisSignedMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "฿0";
  const sign = n > 0 ? "+" : "-";
  const abs = Math.abs(n);

  if (abs >= 1_000_000) {
    return `${sign}฿${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 10_000) {
    return `${sign}฿${(abs / 1_000).toFixed(0)}k`;
  }
  if (abs >= 1_000) {
    return `${sign}฿${(abs / 1_000).toFixed(1)}k`;
  }
  return `${sign}฿${Math.round(abs).toLocaleString("en")}`;
}

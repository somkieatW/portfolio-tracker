/** Last available close on or before `dateStr` (YYYY-MM-DD). */
export function closeOnOrBefore(closesByDate, dateStr) {
  if (!closesByDate?.size) return null;
  if (closesByDate.has(dateStr)) return closesByDate.get(dateStr);
  let best = null;
  let bestDate = "";
  for (const [d, price] of closesByDate) {
    if (d <= dateStr && d > bestDate) {
      bestDate = d;
      best = price;
    }
  }
  return best;
}

/**
 * Normalize an index (e.g. SET) to align with portfolio value on the first snapshot day.
 * Returns [{ date, benchmark }] parallel to snapshots.
 */
export function buildBenchmarkSeries(snapshots, indexClosesByDate) {
  if (!snapshots?.length || !indexClosesByDate?.size) return [];
  const first = snapshots[0];
  const baseClose = closeOnOrBefore(indexClosesByDate, first.snapshot_date);
  const baseValue = Number(first.total_invest_thb) || 0;
  if (!baseClose || baseValue <= 0) return [];

  return snapshots.map(s => {
    const close = closeOnOrBefore(indexClosesByDate, s.snapshot_date);
    const benchmark = close ? +(baseValue * (close / baseClose)).toFixed(2) : null;
    return { date: s.snapshot_date, benchmark };
  });
}

/** Merge benchmark values into a performance series by date. */
export function mergeBenchmarkIntoSeries(perfSeries, benchmarkSeries) {
  const byDate = new Map(benchmarkSeries.map(b => [b.date, b.benchmark]));
  return perfSeries.map(row => ({
    ...row,
    benchmark: byDate.get(row.date) ?? null,
  }));
}

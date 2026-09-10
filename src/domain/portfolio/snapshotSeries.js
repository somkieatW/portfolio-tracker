export const SNAPSHOT_RANGES = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "1Y", days: 365 },
  { label: "All", days: 0 },
];

export function buildAssetSnapshotRows(snapshots, targetId) {
  return (snapshots || [])
    .map(snap => {
      const entry = (snap.asset_breakdown || []).find(a => a.id === targetId);
      if (!entry || (entry.currentValue <= 0 && entry.invested <= 0)) return null;
      return {
        snapshot_date: snap.snapshot_date,
        total_invest_thb: entry.currentValue,
        o_invest_thb: entry.o ?? entry.currentValue,
        h_invest_thb: entry.h ?? entry.currentValue,
        l_invest_thb: entry.l ?? entry.currentValue,
      };
    })
    .filter(Boolean);
}

export function ictTodayStr() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Chain each day's open to the previous day's close for continuous candles. */
export function chainDailyOpens(pnlData) {
  for (let i = 1; i < pnlData.length; i++) {
    const prevClose = pnlData[i - 1].close;
    const d = pnlData[i];
    d.open = prevClose;
    d.high = Math.max(d.high, prevClose, d.close);
    d.low = Math.min(d.low, prevClose, d.close);
  }
  return pnlData;
}

export function buildPnlData(snapshots, liveClose) {
  if (!snapshots?.length) return [];
  const pnlData = snapshots.map((s, i) => {
    const o = s.o_invest_thb ?? s.total_invest_thb;
    const h = s.h_invest_thb ?? s.total_invest_thb;
    const l = s.l_invest_thb ?? s.total_invest_thb;
    const c = s.total_invest_thb;
    return {
      date: s.snapshot_date,
      open: o,
      high: h,
      low: l,
      close: c,
      value: c,
      pnl: i === 0 ? 0 : +(c - snapshots[i - 1].total_invest_thb).toFixed(2),
    };
  });

  chainDailyOpens(pnlData);

  if (liveClose != null && pnlData.length > 0) {
    const lastIdx = pnlData.length - 1;
    const todayStr = ictTodayStr();
    if (pnlData[lastIdx].date === todayStr) {
      const d = pnlData[lastIdx];
      if (lastIdx > 0) d.open = pnlData[lastIdx - 1].close;
      d.close = liveClose;
      d.high = Math.max(d.high, d.open, liveClose);
      d.low = Math.min(d.low, d.open, liveClose);
      d.value = liveClose;
      d.pnl = lastIdx > 0
        ? +(liveClose - pnlData[lastIdx - 1].close).toFixed(2)
        : 0;
    }
  }

  return pnlData;
}

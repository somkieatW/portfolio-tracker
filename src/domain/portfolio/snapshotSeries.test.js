import { describe, it, expect } from "vitest";
import {
  buildPnlData,
  chainDailyOpens,
  buildAssetSnapshotRows,
} from "./snapshotSeries.js";

describe("chainDailyOpens", () => {
  it("chains each open to the previous close and adjusts high/low", () => {
    const data = [
      { open: 100, high: 110, low: 95, close: 105 },
      { open: 200, high: 210, low: 190, close: 205 },
    ];
    chainDailyOpens(data);
    expect(data[1].open).toBe(105);
    expect(data[1].high).toBe(210);
    expect(data[1].low).toBe(105);
  });
});

describe("buildPnlData", () => {
  const snapshots = [
    { snapshot_date: "2026-01-01", total_invest_thb: 10000, o_invest_thb: 9800, h_invest_thb: 10100, l_invest_thb: 9700 },
    { snapshot_date: "2026-01-02", total_invest_thb: 10500, o_invest_thb: 10400, h_invest_thb: 10600, l_invest_thb: 10300 },
  ];

  it("builds OHLC candles with daily P&L", () => {
    const pnl = buildPnlData(snapshots);
    expect(pnl).toHaveLength(2);
    expect(pnl[0].pnl).toBe(0);
    expect(pnl[1].pnl).toBe(500);
    expect(pnl[1].open).toBe(10000);
  });

  it("updates the last candle when liveClose is provided for today", () => {
    const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const withToday = [
      ...snapshots.slice(0, 1),
      { snapshot_date: today, total_invest_thb: 10500, o_invest_thb: 10400, h_invest_thb: 10600, l_invest_thb: 10300 },
    ];
    const pnl = buildPnlData(withToday, 11000);
    expect(pnl[pnl.length - 1].close).toBe(11000);
    expect(pnl[pnl.length - 1].pnl).toBe(1000);
  });
});

describe("buildAssetSnapshotRows", () => {
  it("extracts per-asset OHLC rows from portfolio snapshots", () => {
    const snapshots = [
      {
        snapshot_date: "2026-01-01",
        asset_breakdown: [
          { id: "a1", invested: 1000, currentValue: 1100, o: 1000, h: 1150, l: 990 },
        ],
      },
      {
        snapshot_date: "2026-01-02",
        asset_breakdown: [
          { id: "a1", invested: 1000, currentValue: 1200, o: 1100, h: 1250, l: 1080 },
        ],
      },
    ];

    const rows = buildAssetSnapshotRows(snapshots, "a1");
    expect(rows).toHaveLength(2);
    expect(rows[0].total_invest_thb).toBe(1100);
    expect(rows[1].o_invest_thb).toBe(1100);
  });

  it("skips assets with zero value and investment", () => {
    const snapshots = [{
      snapshot_date: "2026-01-01",
      asset_breakdown: [{ id: "a1", invested: 0, currentValue: 0 }],
    }];
    expect(buildAssetSnapshotRows(snapshots, "a1")).toHaveLength(0);
  });
});

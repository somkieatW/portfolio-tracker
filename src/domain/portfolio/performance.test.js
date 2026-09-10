import { describe, it, expect } from "vitest";
import {
  buildContributionTimeline,
  buildAssetContributionTimeline,
  contributedUpTo,
  buildPerformanceSeries,
  buildAssetPerformanceSeries,
  performanceSummary,
  formatPriceAge,
} from "./performance.js";

describe("buildContributionTimeline", () => {
  const txs = [
    { asset_id: "core", type: "buy", date: "2026-01-01", amount_thb: 10000, created_at: "2026-01-01" },
    { asset_id: "core", type: "buy", date: "2026-01-15", amount_thb: 5000, created_at: "2026-01-15" },
    { asset_id: "core", type: "sell", date: "2026-02-01", amount_thb: 2000, created_at: "2026-02-01" },
    { asset_id: "spec", type: "buy", date: "2026-01-01", amount_thb: 9999, created_at: "2026-01-01" },
  ];

  it("tracks net contributions for core assets only", () => {
    const timeline = buildContributionTimeline(txs, ["core"]);
    expect(timeline.get("2026-01-01")).toBe(10000);
    expect(timeline.get("2026-01-15")).toBe(15000);
    expect(timeline.get("2026-02-01")).toBe(13000);
  });
});

describe("contributedUpTo", () => {
  it("returns the latest contribution total on or before a date", () => {
    const timeline = new Map([
      ["2026-01-01", 10000],
      ["2026-01-15", 15000],
    ]);
    expect(contributedUpTo(timeline, "2026-01-10")).toBe(10000);
    expect(contributedUpTo(timeline, "2026-01-20")).toBe(15000);
  });
});

describe("buildPerformanceSeries", () => {
  const snapshots = [
    {
      snapshot_date: "2026-01-01",
      total_invest_thb: 10000,
      asset_breakdown: [{ invested: 10000 }],
    },
    {
      snapshot_date: "2026-01-15",
      total_invest_thb: 16000,
      asset_breakdown: [{ invested: 15000 }],
    },
  ];

  const txs = [
    { asset_id: "a1", type: "buy", date: "2026-01-01", amount_thb: 10000, created_at: "2026-01-01" },
    { asset_id: "a1", type: "buy", date: "2026-01-15", amount_thb: 5000, created_at: "2026-01-15" },
  ];

  it("separates market gain from contributions", () => {
    const series = buildPerformanceSeries(snapshots, txs, ["a1"]);
    expect(series[0].contributed).toBe(10000);
    expect(series[0].marketGain).toBe(0);
    expect(series[1].contributed).toBe(15000);
    expect(series[1].marketGain).toBe(1000);
  });
});

describe("buildAssetContributionTimeline", () => {
  it("tracks net contributions for a single asset", () => {
    const txs = [
      { type: "buy", date: "2026-01-01", amount_thb: 6260, created_at: "2026-01-01" },
      { type: "sell", date: "2026-03-08", amount_thb: 2642, created_at: "2026-03-08" },
    ];
    const timeline = buildAssetContributionTimeline(txs);
    expect(timeline.get("2026-01-01")).toBe(6260);
    expect(timeline.get("2026-03-08")).toBe(3618);
  });
});

describe("buildAssetPerformanceSeries", () => {
  it("keeps market gain stable after a partial sell (K-SET50 pattern)", () => {
    const rows = [
      { snapshot_date: "2026-03-01", total_invest_thb: 6260, invested: 6260 },
      { snapshot_date: "2026-03-09", total_invest_thb: 3618, invested: 6260 },
      { snapshot_date: "2026-09-09", total_invest_thb: 3618, invested: 6260 },
    ];
    const txs = [
      { type: "buy", date: "2023-12-01", amount_thb: 6260, created_at: "2023-12-01" },
      { type: "sell", date: "2026-03-08", amount_thb: 2642, created_at: "2026-03-08" },
    ];
    const series = buildAssetPerformanceSeries(rows, txs);
    expect(series[0].contributed).toBe(6260);
    expect(series[1].contributed).toBe(3618);
    expect(series[1].marketGain).toBe(0);
    expect(series[2].marketGain).toBe(0);
  });

  it("steps contributed up on a second buy (K-US500X-A pattern)", () => {
    const rows = [
      { snapshot_date: "2026-02-20", total_invest_thb: 2367, invested: 2367 },
      { snapshot_date: "2026-03-12", total_invest_thb: 5120, invested: 6016 },
      { snapshot_date: "2026-09-09", total_invest_thb: 6790, invested: 6016 },
    ];
    const txs = [
      { type: "buy", date: "2026-02-20", amount_thb: 2367, created_at: "2026-02-20" },
      { type: "buy", date: "2026-03-12", amount_thb: 3650, created_at: "2026-03-12" },
    ];
    const series = buildAssetPerformanceSeries(rows, txs);
    expect(series[0].contributed).toBe(2367);
    expect(series[1].contributed).toBe(6017);
    expect(series[2].marketGain).toBe(773);
  });

  it("falls back to snapshot invested when no transactions", () => {
    const rows = [
      { snapshot_date: "2026-01-01", total_invest_thb: 5000, invested: 4500 },
    ];
    const series = buildAssetPerformanceSeries(rows, []);
    expect(series[0].contributed).toBe(4500);
    expect(series[0].marketGain).toBe(500);
  });
});

describe("performanceSummary", () => {
  it("summarizes value and market return over the series", () => {
    const series = [
      { value: 10000, contributed: 10000, marketGain: 0 },
      { value: 12000, contributed: 10000, marketGain: 2000 },
    ];
    const summary = performanceSummary(series);
    expect(summary.valueChange).toBe(2000);
    expect(summary.marketGain).toBe(2000);
    expect(summary.marketReturnPct).toBe("20.00");
    expect(summary.contributed).toBe(10000);
  });
});

describe("formatPriceAge", () => {
  it("marks missing timestamps as stale", () => {
    expect(formatPriceAge(null).label).toBe("Never synced");
    expect(formatPriceAge(null).stale).toBe(true);
  });

  it("labels recent prices in minutes", () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { label, stale } = formatPriceAge(recent);
    expect(label).toMatch(/m ago/);
    expect(stale).toBe(false);
  });
});

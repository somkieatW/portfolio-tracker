import { describe, it, expect } from "vitest";
import {
  buildContributionTimeline,
  buildPortfolioContributionTimeline,
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

  const coreAssets = [{ id: "a1", type: "equity" }];

  it("separates market gain from contributions", () => {
    const series = buildPerformanceSeries(snapshots, txs, coreAssets);
    expect(series[0].contributed).toBe(10000);
    expect(series[0].marketGain).toBe(0);
    expect(series[1].contributed).toBe(15000);
    expect(series[1].marketGain).toBe(1000);
  });

  it("portfolio: no false market gain after cash interest withdrawal", () => {
    const mixedSnapshots = [
      { snapshot_date: "2026-01-01", total_invest_thb: 60000, asset_breakdown: [] },
      { snapshot_date: "2026-07-01", total_invest_thb: 60149, asset_breakdown: [] },
      { snapshot_date: "2026-09-11", total_invest_thb: 60000, asset_breakdown: [] },
    ];
    const mixedTxs = [
      { asset_id: "fund1", type: "buy", date: "2026-01-01", amount_thb: 50000, created_at: "2026-01-01" },
      { asset_id: "cash1", type: "buy", date: "2026-01-01", amount_thb: 10000, created_at: "2026-01-01" },
      { asset_id: "cash1", type: "interest", date: "2026-06-30", amount_thb: 149, created_at: "2026-06-30" },
      { asset_id: "cash1", type: "sell", date: "2026-09-11", amount_thb: 149, created_at: "2026-09-11" },
    ];
    const assets = [
      { id: "fund1", type: "equity", finnomenaCode: "K-SET50" },
      { id: "cash1", type: "cash" },
    ];
    const series = buildPerformanceSeries(mixedSnapshots, mixedTxs, assets);
    expect(series[1].contributed).toBe(60000);
    expect(series[1].marketGain).toBe(149);
    expect(series[2].contributed).toBe(60000);
    expect(series[2].marketGain).toBe(0);
  });
});

describe("buildPortfolioContributionTimeline", () => {
  it("sums per-asset contributed with income-first sells on cash", () => {
    const txs = [
      { asset_id: "fund1", type: "buy", date: "2026-01-01", amount_thb: 50000, created_at: "2026-01-01" },
      { asset_id: "cash1", type: "buy", date: "2026-01-01", amount_thb: 10000, created_at: "2026-01-01" },
      { asset_id: "cash1", type: "interest", date: "2026-06-30", amount_thb: 149, created_at: "2026-06-30" },
      { asset_id: "cash1", type: "sell", date: "2026-09-11", amount_thb: 149, created_at: "2026-09-11" },
    ];
    const assets = [{ id: "fund1", type: "equity" }, { id: "cash1", type: "cash" }];
    const timeline = buildPortfolioContributionTimeline(txs, assets);
    expect(timeline.get("2026-01-01")).toBe(60000);
    expect(timeline.get("2026-09-11")).toBe(60000);
  });

  it("nets a transfer out of a deleted bond into cash to zero", () => {
    const txs = [
      { asset_id: "bond-deleted", type: "buy", date: "2022-09-21", amount_thb: 20000, created_at: "2022-09-21" },
      { asset_id: "bond-deleted", type: "interest", date: "2026-09-11", amount_thb: 356.02, created_at: "2026-09-11" },
      { asset_id: "bond-deleted", type: "sell", date: "2026-09-15", amount_thb: -356.02, created_at: "2026-09-15" },
      { asset_id: "bond-deleted", type: "buy", date: "2026-09-28", amount_thb: 183.88, created_at: "2026-09-28" },
      { asset_id: "bond-deleted", type: "sell", date: "2026-10-14", amount_thb: -20183, created_at: "2026-10-14T01" },
      { asset_id: "dime", type: "buy", date: "2026-09-11", amount_thb: 10000, created_at: "2026-09-11" },
      { asset_id: "dime", type: "buy", date: "2026-10-14", amount_thb: 20183, created_at: "2026-10-14T02" },
    ];
    const assets = [{ id: "dime", type: "cash" }];
    const timeline = buildPortfolioContributionTimeline(txs, assets);
    expect(timeline.get("2026-09-28")).toBe(30183.88);
    expect(timeline.get("2026-10-14")).toBe(30183.88);
  });

  it("keeps a fully sold closed fund's cash flows so a switch nets to zero", () => {
    const txs = [
      { asset_id: "old", type: "buy", date: "2024-03-08", amount_thb: 3000, units: 114.479, created_at: "2024-03-08" },
      { asset_id: "old", type: "sell", date: "2026-10-19", amount_thb: -4433.06, units: -114.479, created_at: "2026-10-19T01" },
      { asset_id: "new", type: "buy", date: "2026-10-19", amount_thb: 4433.06, units: 300, created_at: "2026-10-19T02" },
    ];
    const assets = [
      { id: "old", type: "equity", currentValue: 0, units: 0 },
      { id: "new", type: "equity" },
    ];
    const timeline = buildPortfolioContributionTimeline(txs, assets);
    expect(timeline.get("2024-03-08")).toBe(3000);
    expect(timeline.get("2026-10-19")).toBe(3000);
  });

  it("uses stock sub-asset transactions and skips a duplicate parent-level backfill", () => {
    const txs = [
      { asset_id: "thai", sub_asset_id: null, type: "buy", date: "2023-08-05", amount_thb: 576.99, created_at: "2023-08-05" },
      { asset_id: "thai", sub_asset_id: "ptt", type: "buy", date: "2023-08-25", amount_thb: 286.48, created_at: "2023-08-25" },
      { asset_id: "thai", sub_asset_id: "scb", type: "buy", date: "2023-08-25", amount_thb: 290.51, created_at: "2023-08-25" },
      { asset_id: "us", sub_asset_id: "msft", type: "buy", date: "2026-02-23", amount_thb: 620.2, created_at: "2026-02-23" },
    ];
    const assets = [
      { id: "thai", type: "thai_stocks", subAssets: [] },
      { id: "us", type: "us_stocks", subAssets: [] },
    ];
    const timeline = buildPortfolioContributionTimeline(txs, assets);
    expect(contributedUpTo(timeline, "2023-08-10")).toBe(0);
    expect(timeline.get("2023-08-25")).toBe(576.99);
    expect(timeline.get("2026-02-23")).toBe(1197.19);
  });

  it("excludes speculative assets", () => {
    const txs = [
      { asset_id: "core", type: "buy", date: "2026-01-01", amount_thb: 1000, created_at: "2026-01-01" },
      { asset_id: "spec", type: "buy", date: "2026-01-01", amount_thb: 9999, created_at: "2026-01-01" },
      { asset_id: "spec", type: "dividend", date: "2026-01-02", amount_thb: 500, created_at: "2026-01-02" },
    ];
    const assets = [
      { id: "core", type: "equity" },
      { id: "spec", type: "forex", isSpeculative: true },
    ];
    const timeline = buildPortfolioContributionTimeline(txs, assets);
    expect(timeline.get("2026-01-01")).toBe(1000);
    expect(timeline.has("2026-01-02")).toBe(false);
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

  it("manual income: no false market gain after interest withdrawal", () => {
    const rows = [
      { snapshot_date: "2026-01-01", total_invest_thb: 10000, invested: 10000 },
      { snapshot_date: "2026-07-01", total_invest_thb: 10149, invested: 10000 },
      { snapshot_date: "2026-09-11", total_invest_thb: 10000, invested: 10000 },
    ];
    const txs = [
      { type: "buy", date: "2026-01-01", amount_thb: 10000, created_at: "2026-01-01" },
      { type: "interest", date: "2026-06-30", amount_thb: 149, created_at: "2026-06-30" },
      { type: "sell", date: "2026-09-11", amount_thb: 149, created_at: "2026-09-11" },
    ];
    const series = buildAssetPerformanceSeries(rows, txs, 10000, { isManualIncome: true });
    expect(series[1].contributed).toBe(10000);
    expect(series[1].marketGain).toBe(149);
    expect(series[2].contributed).toBe(10000);
    expect(series[2].marketGain).toBe(0);
    expect(series[2].value).toBe(10000);
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

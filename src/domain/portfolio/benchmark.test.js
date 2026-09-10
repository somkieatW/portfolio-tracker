import { describe, it, expect } from "vitest";
import { closeOnOrBefore, buildBenchmarkSeries, mergeBenchmarkIntoSeries } from "./benchmark.js";

describe("benchmark", () => {
  const closes = new Map([
    ["2026-01-01", 1000],
    ["2026-01-15", 1100],
    ["2026-02-01", 1050],
  ]);

  it("closeOnOrBefore finds last available close", () => {
    expect(closeOnOrBefore(closes, "2026-01-10")).toBe(1000);
    expect(closeOnOrBefore(closes, "2026-01-15")).toBe(1100);
  });

  it("buildBenchmarkSeries normalizes index to portfolio start value", () => {
    const snapshots = [
      { snapshot_date: "2026-01-01", total_invest_thb: 50000 },
      { snapshot_date: "2026-01-15", total_invest_thb: 52000 },
    ];
    const bench = buildBenchmarkSeries(snapshots, closes);
    expect(bench[0].benchmark).toBe(50000);
    expect(bench[1].benchmark).toBe(55000);
  });

  it("mergeBenchmarkIntoSeries adds benchmark column", () => {
    const perf = [{ date: "2026-01-01", value: 100 }, { date: "2026-01-15", value: 120 }];
    const bench = [{ date: "2026-01-01", benchmark: 100 }, { date: "2026-01-15", benchmark: 110 }];
    const merged = mergeBenchmarkIntoSeries(perf, bench);
    expect(merged[1].benchmark).toBe(110);
  });
});

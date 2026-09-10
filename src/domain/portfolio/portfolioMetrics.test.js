import { describe, it, expect } from "vitest";
import { computePortfolioMetrics } from "./portfolioMetrics.js";

describe("computePortfolioMetrics", () => {
  const investments = [
    { type: "equity", invested: 10000, currentValue: 12000 },
    { type: "gold", invested: 5000, currentValue: 5500 },
  ];
  const speculative = [
    { currentValue: 1000 },
  ];
  const settings = { dca: 1000, specCap: 10 };

  it("computes totals, P&L, and speculation cap", () => {
    const m = computePortfolioMetrics(investments, speculative, settings, 17500);
    expect(m.totalInvested).toBe(15000);
    expect(m.totalPL).toBe(2500);
    expect(m.totalPLpct).toBeCloseTo(16.67, 1);
    expect(m.specPct).toBeCloseTo(5.71, 1);
    expect(m.specCap).toBe(1750);
    expect(m.specOver).toBe(-750);
  });

  it("builds pie chart data grouped by category", () => {
    const m = computePortfolioMetrics(investments, speculative, settings, 17500);
    expect(m.pieData).toHaveLength(2);
    expect(m.pieData[0].name).toBe("Equity / Stock Fund");
    expect(Number(m.pieData[0].pct)).toBeCloseTo(68.57, 1);
  });

  it("builds a 13-month projection starting from total invest", () => {
    const m = computePortfolioMetrics(investments, speculative, settings, 17500);
    expect(m.projection).toHaveLength(13);
    expect(m.projection[0]).toEqual({ month: "Now", value: 17500 });
    expect(m.projection[1].value).toBeGreaterThan(17500);
  });
});

import { describe, it, expect } from "vitest";
import {
  calcPL,
  calcDerivedTotals,
  normalizeAssets,
  groupTotals,
  sanitizeAsset,
} from "./assetCalculations.js";

describe("calcPL", () => {
  it("computes profit/loss percentage for normal assets", () => {
    const { pl, plPct } = calcPL({ invested: 1000, currentValue: 1200, isSpeculative: false });
    expect(pl).toBe(200);
    expect(plPct).toBe(20);
  });

  it("returns zero pct for speculative or zero-invested assets", () => {
    expect(calcPL({ invested: 0, currentValue: 500, isSpeculative: false }).plPct).toBe(0);
    expect(calcPL({ invested: 1000, currentValue: 900, isSpeculative: true }).plPct).toBe(0);
  });
});

describe("calcDerivedTotals", () => {
  it("tracks buys and proportionally reduces invested on sells", () => {
    const txs = [
      { type: "buy", date: "2026-01-01", amount_thb: 10000, qty: 10, created_at: "2026-01-01" },
      { type: "sell", date: "2026-02-01", amount_thb: 3000, qty: 3, created_at: "2026-02-01" },
    ];
    const { invThb, totalQty } = calcDerivedTotals(txs, false);
    expect(totalQty).toBe(7);
    expect(invThb).toBeCloseTo(7000, 2);
  });

  it("processes backfill before other same-day transactions", () => {
    const txs = [
      { type: "buy", date: "2026-01-01", amount_thb: 5000, units: 50, notes: "[System Backfill]", created_at: "2026-01-01T00:00:00Z" },
      { type: "sell", date: "2026-01-01", amount_thb: 1000, units: 10, created_at: "2026-01-01T12:00:00Z" },
    ];
    const { invThb, totalUnits } = calcDerivedTotals(txs, false);
    expect(totalUnits).toBe(40);
    expect(invThb).toBeCloseTo(4000, 2);
  });
});

describe("groupTotals / normalizeAssets", () => {
  it("sums sub-asset values for stock groups", () => {
    const group = {
      type: "us_stocks",
      subAssets: [
        { invested: 1000, currentValue: 1100 },
        { invested: 2000, currentValue: 2200 },
      ],
    };
    expect(groupTotals(group)).toEqual({ invested: 3000, currentValue: 3300 });
    const [normalized] = normalizeAssets([group]);
    expect(normalized.invested).toBe(3000);
    expect(normalized.currentValue).toBe(3300);
  });
});

describe("sanitizeAsset", () => {
  it("normalizes Yahoo symbols and strips USD fields for THB assets", () => {
    const clean = sanitizeAsset({
      currency: "THB",
      yahooSymbol: "GC%3DF",
      invested: 1000.005,
      currentValue: 1200.006,
      investedUSD: 30,
      qty: 1.123456789,
    }, 35);

    expect(clean.yahooSymbol).toBe("GC=F");
    // 1000.005 is stored as 1000.00499… in IEEE-754, so toFixed(2) → "1000.00"
    expect(clean.invested).toBe(1000);
    expect(clean.currentValue).toBe(1200.01);
    expect(clean.investedUSD).toBeUndefined();
    expect(clean.qty).toBe(1.12345679);
  });

  it("keeps USD fields and derives currentValueUSD for USD assets", () => {
    const clean = sanitizeAsset({
      currency: "USD",
      yahooSymbol: "AAPL",
      invested: 1000,
      currentValue: 35000,
      qty: 10,
    }, 35);

    expect(clean.investedUSD).toBeUndefined();
    expect(clean.currentValueUSD).toBeCloseTo(1000, 0);
  });
});

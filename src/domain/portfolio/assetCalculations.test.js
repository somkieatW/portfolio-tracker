import { describe, it, expect } from "vitest";
import {
  calcPL,
  calcDerivedTotals,
  normalizeAssets,
  groupTotals,
  sanitizeAsset,
  isManualIncomeAsset,
  isFundAsset,
  isStockAsset,
  sumIncomeTransactions,
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

describe("isManualIncomeAsset", () => {
  it("identifies cash and bond assets without price feeds", () => {
    expect(isManualIncomeAsset({ type: "cash" })).toBe(true);
    expect(isManualIncomeAsset({ type: "bond" })).toBe(true);
    expect(isManualIncomeAsset({ type: "cash", yahooSymbol: "PTT.BK" })).toBe(false);
    expect(isManualIncomeAsset({ type: "equity", finnomenaCode: "K-SET50" })).toBe(false);
  });
});

describe("isFundAsset / isStockAsset", () => {
  it("detects funds by finnomenaCode or units held", () => {
    expect(isFundAsset({ finnomenaCode: "K-SET50" })).toBe(true);
    expect(isFundAsset({ units: 100 })).toBe(true);
    expect(isFundAsset({ type: "cash" })).toBe(false);
    expect(isFundAsset({ type: "bond" })).toBe(false);
  });

  it("detects stocks by yahooSymbol or qty held", () => {
    expect(isStockAsset({ yahooSymbol: "PTT.BK" })).toBe(true);
    expect(isStockAsset({ qty: 50 })).toBe(true);
    expect(isStockAsset({ type: "us_stocks" })).toBe(true);
  });

  it("prefers fund over stock when both units and finnomenaCode apply", () => {
    expect(isFundAsset({ finnomenaCode: "K-SET50", units: 100 })).toBe(true);
    expect(isStockAsset({ finnomenaCode: "K-SET50", units: 100 })).toBe(false);
  });

  it("does not classify manual cash/bond as fund or stock", () => {
    expect(isFundAsset({ type: "cash", currentValue: 10000 })).toBe(false);
    expect(isStockAsset({ type: "bond", currentValue: 20000 })).toBe(false);
  });
});

describe("sumIncomeTransactions", () => {
  it("sums interest and dividend amounts for an asset", () => {
    const txs = [
      { asset_id: "a1", type: "interest", amount_thb: 100 },
      { asset_id: "a1", type: "dividend", amount_thb: 50 },
      { asset_id: "a2", type: "interest", amount_thb: 999 },
    ];
    expect(sumIncomeTransactions(txs, "a1")).toBe(150);
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

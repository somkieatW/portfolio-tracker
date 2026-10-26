import { describe, it, expect } from "vitest";
import { holdingsAsOf, subHoldingsAsOf } from "./historicalHoldings.js";

describe("holdingsAsOf", () => {
  const fund = { id: "f1", units: 100, currentValue: 4000 };
  const txs = [
    { asset_id: "f1", type: "buy", date: "2026-01-01", amount_thb: 3000, units: 100, created_at: "2026-01-01" },
    { asset_id: "f1", type: "sell", date: "2026-10-19", amount_thb: -4400, units: -100, created_at: "2026-10-19" },
  ];

  it("marks units as tracked when transactions carry units", () => {
    const before = holdingsAsOf(fund, txs, "2026-06-01");
    expect(before).toMatchObject({ units: 100, fromTransactions: true, unitsTracked: true, qtyTracked: false });

    const after = holdingsAsOf(fund, txs, "2026-10-20");
    expect(after.units).toBeCloseTo(0);
    expect(after.unitsTracked).toBe(true);
  });

  it("falls back to stored units without transactions", () => {
    expect(holdingsAsOf(fund, [], "2026-10-20")).toMatchObject({
      units: 100,
      fromTransactions: false,
      unitsTracked: false,
    });
  });

  it("does not mark units as tracked when transactions omit them", () => {
    const cashTxs = [{ asset_id: "f1", type: "buy", date: "2026-01-01", amount_thb: 3000, units: null, qty: null }];
    const result = holdingsAsOf(fund, cashTxs, "2026-10-20");
    expect(result.fromTransactions).toBe(true);
    expect(result.unitsTracked).toBe(false);
    expect(result.qtyTracked).toBe(false);
  });
});

describe("subHoldingsAsOf", () => {
  it("tracks sub-asset qty from transactions", () => {
    const sub = { id: "s1", qty: 5 };
    const txs = [
      { asset_id: "g1", sub_asset_id: "s1", type: "buy", date: "2026-01-01", amount_thb: 500, qty: 5 },
      { asset_id: "g1", sub_asset_id: "s1", type: "sell", date: "2026-02-01", amount_thb: -600, qty: -5 },
    ];
    expect(subHoldingsAsOf("g1", sub, txs, "2026-02-02")).toMatchObject({ qty: 0, qtyTracked: true });
  });
});

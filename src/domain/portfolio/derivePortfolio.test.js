import { describe, it, expect } from "vitest";
import { derivePortfolioAssets } from "./derivePortfolio.js";

describe("derivePortfolioAssets", () => {
  it("derives invested and qty from buy/sell transactions", () => {
    const assets = [{
      id: "stock1",
      currency: "THB",
      yahooSymbol: "PTT.BK",
      qty: 100,
      currentValue: 40000,
      invested: 99999,
    }];

    const txs = [
      { asset_id: "stock1", type: "buy", date: "2026-01-01", amount_thb: 30000, qty: 100, created_at: "2026-01-01" },
      { asset_id: "stock1", type: "sell", date: "2026-02-01", amount_thb: 8000, qty: 20, created_at: "2026-02-01" },
    ];

    const [derived] = derivePortfolioAssets(assets, txs, 35);
    expect(derived.invested).toBeCloseTo(24000, 0);
    expect(derived.qty).toBe(80);
    expect(derived.currentValue).toBeCloseTo(32000, 0);
    expect(derived.yahooSymbol).toBe("PTT.BK");
  });

  it("derives sub-asset totals inside stock groups", () => {
    const assets = [{
      id: "group1",
      type: "us_stocks",
      currency: "USD",
      subAssets: [{
        id: "sub1",
        currency: "USD",
        yahooSymbol: "AAPL",
        qty: 10,
        currentValue: 2000,
        invested: 9999,
      }],
    }];

    const txs = [
      { asset_id: "group1", sub_asset_id: "sub1", type: "buy", date: "2026-01-01", amount_thb: 35000, amount_usd: 1000, qty: 10, created_at: "2026-01-01" },
    ];

    const [derived] = derivePortfolioAssets(assets, txs, 35);
    expect(derived.subAssets[0].invested).toBe(35000);
    expect(derived.subAssets[0].investedUSD).toBe(1000);
    expect(derived.subAssets[0].qty).toBe(10);
  });

  it("adds interest and dividend income to manual bond/cash value without changing cost basis", () => {
    const assets = [
      { id: "bond1", type: "bond", name: "Sansiri Bond", currentValue: 20000, invested: 20000 },
      { id: "cash1", type: "cash", name: "Dime Saving", currentValue: 10000, invested: 10000 },
    ];
    const txs = [
      { asset_id: "bond1", type: "buy", date: "2022-09-21", amount_thb: 20000, created_at: "2022-09-21" },
      { asset_id: "bond1", type: "dividend", date: "2026-09-11", amount_thb: 356.02, created_at: "2026-09-11" },
      { asset_id: "cash1", type: "buy", date: "2026-09-11", amount_thb: 10000, created_at: "2026-09-11" },
      { asset_id: "cash1", type: "interest", date: "2026-06-30", amount_thb: 149.2, created_at: "2026-06-30" },
    ];

    const derived = derivePortfolioAssets(assets, txs, 35);
    const bond = derived.find(a => a.id === "bond1");
    const cash = derived.find(a => a.id === "cash1");

    expect(bond.invested).toBe(20000);
    expect(bond.currentValue).toBeCloseTo(20356.02, 2);
    expect(cash.invested).toBe(10000);
    expect(cash.currentValue).toBeCloseTo(10149.2, 2);
  });

  it("does not apply dividend income to priced fund assets", () => {
    const assets = [{
      id: "fund1",
      type: "equity",
      finnomenaCode: "K-SET50",
      units: 100,
      currentValue: 5000,
      invested: 4500,
    }];
    const txs = [
      { asset_id: "fund1", type: "buy", date: "2026-01-01", amount_thb: 4500, units: 100, created_at: "2026-01-01" },
      { asset_id: "fund1", type: "dividend", date: "2026-06-01", amount_thb: 200, created_at: "2026-06-01" },
    ];

    const [derived] = derivePortfolioAssets(assets, txs, 35);
    expect(derived.invested).toBe(4500);
    expect(derived.currentValue).toBe(5000);
  });
});

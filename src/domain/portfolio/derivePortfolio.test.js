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
});

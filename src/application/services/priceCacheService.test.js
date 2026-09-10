import { describe, it, expect } from "vitest";
import { applyPriceCacheToAssets, summarizeCacheInfo } from "./priceCacheService.js";

describe("applyPriceCacheToAssets", () => {
  const cache = new Map([
    ["FUND01", { price: 12.5, updated_at: "2026-01-01T00:00:00Z" }],
    ["AAPL", { price: 200, currency: "USD", updated_at: "2026-01-02T00:00:00Z" }],
    ["USDTHB=X", { price: 35, updated_at: "2026-01-02T00:00:00Z" }],
    ["PTT.BK", { price: 40, currency: "THB", updated_at: "2026-01-03T00:00:00Z" }],
  ]);

  it("updates fund NAV from cache", () => {
    const [updated] = applyPriceCacheToAssets([
      { finnomenaCode: "FUND01", units: 100, currentValue: 0 },
    ], cache);
    expect(updated.currentValue).toBe(1250);
    expect(updated.navUpdatedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("converts USD stock prices using USDTHB rate", () => {
    const [updated] = applyPriceCacheToAssets([
      { yahooSymbol: "AAPL", currency: "USD", qty: 2, currentValue: 0 },
    ], cache);
    expect(updated.currentValue).toBe(14000);
    expect(updated.priceUpdatedAt).toBe("2026-01-02T00:00:00Z");
  });

  it("updates sub-assets inside stock groups", () => {
    const [updated] = applyPriceCacheToAssets([
      {
        type: "thai_stocks",
        subAssets: [{ yahooSymbol: "PTT.BK", qty: 100, currentValue: 0 }],
      },
    ], cache);
    expect(updated.subAssets[0].currentValue).toBe(4000);
  });

  it("normalizes legacy encoded Yahoo symbols", () => {
    const encodedCache = new Map([
      ["GC=F", { price: 100, currency: "USD", updated_at: "2026-01-01T00:00:00Z" }],
      ["USDTHB=X", { price: 35, updated_at: "2026-01-01T00:00:00Z" }],
    ]);
    const [updated] = applyPriceCacheToAssets([
      { yahooSymbol: "GC%3DF", currency: "USD", qty: 1, currentValue: 0 },
    ], encodedCache);
    expect(updated.currentValue).toBe(3500);
  });
});

describe("summarizeCacheInfo", () => {
  it("reports oldest timestamp and stale symbols", () => {
    const old = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const fresh = new Date().toISOString();
    const cache = new Map([
      ["AAPL", { updated_at: old }],
      ["PTT.BK", { updated_at: fresh }],
    ]);
    const info = summarizeCacheInfo(cache);
    expect(info.updatedAt).toBe(old);
    expect(info.staleSymbols).toContain("AAPL");
    expect(info.staleSymbols).not.toContain("PTT.BK");
  });
});

import { describe, it, expect } from "vitest";
import { collectTrackedSymbols, collectSymbolKeys } from "./trackedSymbols.js";

describe("collectTrackedSymbols", () => {
  it("includes fund, US stock, and Thai sub-asset rows", () => {
    const rows = collectTrackedSymbols([
      { finnomenaCode: "K-SET50" },
      { yahooSymbol: "LLY", currency: "USD" },
      { type: "thai_stocks", subAssets: [{ yahooSymbol: "PTT.BK", currency: "THB" }] },
    ]);

    const bySym = new Map(rows.map(r => [r.symbol, r]));
    expect(bySym.get("K-SET50")).toEqual({ symbol: "K-SET50", type: "fund", source: "finnomena" });
    expect(bySym.get("LLY")).toEqual({ symbol: "LLY", type: "us_stock", source: "yahoo" });
    expect(bySym.get("PTT.BK")).toEqual({ symbol: "PTT.BK", type: "thai_stock", source: "yahoo" });
    expect(bySym.get("USDTHB=X")).toEqual({ symbol: "USDTHB=X", type: "fx", source: "yahoo" });
  });

  it("dedupes the same symbol across assets", () => {
    const rows = collectTrackedSymbols([
      { yahooSymbol: "NVDA", currency: "USD" },
      { yahooSymbol: "NVDA", currency: "USD" },
    ]);
    expect(rows.filter(r => r.symbol === "NVDA")).toHaveLength(1);
  });

  it("classifies gold as commodity", () => {
    const rows = collectTrackedSymbols([{ yahooSymbol: "GC=F", type: "gold", currency: "THB" }]);
    expect(rows.find(r => r.symbol === "GC=F")).toMatchObject({ type: "commodity", source: "yahoo" });
  });
});

describe("collectSymbolKeys", () => {
  it("returns symbol strings including FX", () => {
    const keys = collectSymbolKeys([{ yahooSymbol: "MSFT", currency: "USD" }]);
    expect(keys).toContain("MSFT");
    expect(keys).toContain("USDTHB=X");
  });
});

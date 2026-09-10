import { describe, it, expect } from "vitest";
import { normalizeYahooSymbol, getCacheEntry } from "./yahooSymbol.js";

describe("normalizeYahooSymbol", () => {
  it("decodes legacy double-encoded tickers", () => {
    expect(normalizeYahooSymbol("GC%3DF")).toBe("GC=F");
  });

  it("trims whitespace and leaves valid symbols unchanged", () => {
    expect(normalizeYahooSymbol("  AAPL  ")).toBe("AAPL");
    expect(normalizeYahooSymbol("PTT.BK")).toBe("PTT.BK");
  });

  it("returns empty string for falsy input", () => {
    expect(normalizeYahooSymbol("")).toBe("");
    expect(normalizeYahooSymbol(null)).toBe("");
    expect(normalizeYahooSymbol(undefined)).toBe("");
  });
});

describe("getCacheEntry", () => {
  const cache = new Map([
    ["GC=F", { price: 2650, updated_at: "2026-01-01T00:00:00Z" }],
    ["GC%3DF", { price: 999, updated_at: "2025-01-01T00:00:00Z" }],
  ]);

  it("looks up by normalized symbol", () => {
    const row = getCacheEntry(cache, "GC%3DF");
    expect(row.price).toBe(2650);
  });

  it("falls back to raw symbol when normalized key is missing", () => {
    const rawOnly = new Map([["GC%3DF", { price: 999 }]]);
    expect(getCacheEntry(rawOnly, "GC%3DF").price).toBe(999);
  });

  it("returns null when symbol is missing", () => {
    expect(getCacheEntry(cache, "UNKNOWN")).toBeNull();
    expect(getCacheEntry(null, "AAPL")).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { partitionAssets } from "./selectors.js";

describe("partitionAssets", () => {
  const assets = [
    { id: "a1", currentValue: 1000, invested: 800, isSpeculative: false, units: 0, qty: 0 },
    { id: "a2", currentValue: 500, invested: 400, isSpeculative: true, units: 0, qty: 0 },
    { id: "a3", currentValue: 0, invested: 0, isSpeculative: false, units: 0, qty: 0 },
  ];

  const txs = [
    { asset_id: "a3", type: "buy", date: "2026-01-01" },
  ];

  it("splits active, closed, core, and speculative assets", () => {
    const result = partitionAssets(assets, txs);
    expect(result.activeAssets.map(a => a.id)).toEqual(["a1", "a2"]);
    expect(result.closedAssets.map(a => a.id)).toEqual(["a3"]);
    expect(result.investments.map(a => a.id)).toEqual(["a1"]);
    expect(result.speculative.map(a => a.id)).toEqual(["a2"]);
    expect(result.totalInvest).toBe(1000);
    expect(result.coreAssetIds).toEqual(["a1"]);
  });
});

import { describe, it, expect } from "vitest";
import { buildSnapshotForDate } from "./snapshotCompute.js";

const assets = [
  { id: "sold", name: "Sold Fund", type: "equity", finnomenaCode: "SOLD", units: 100, currentValue: 4460 },
  { id: "held", name: "Held Fund", type: "equity", finnomenaCode: "HELD", units: 50, currentValue: 600 },
];

const transactions = [
  { asset_id: "sold", type: "buy", date: "2024-03-08", amount_thb: 3000, units: 100, created_at: "2024-03-08" },
  { asset_id: "sold", type: "sell", date: "2026-10-19", amount_thb: -4433, units: -100.27, created_at: "2026-10-19" },
  { asset_id: "held", type: "buy", date: "2026-10-19", amount_thb: 500, units: 50, created_at: "2026-10-19" },
];

const priceMaps = new Map([
  ["SOLD", new Map([["2026-10-18", 44], ["2026-10-20", 45]])],
  ["HELD", new Map([["2026-10-18", 10], ["2026-10-20", 12]])],
]);

function snapshot(dateStr, manualKnown = new Map()) {
  return buildSnapshotForDate({
    userId: "u1",
    assets,
    transactions,
    dateStr,
    priceMaps,
    usdThbByDate: new Map(),
    manualKnown,
  });
}

describe("buildSnapshotForDate", () => {
  it("values a fully sold fund at 0 instead of its stale stored value", () => {
    const snap = snapshot("2026-10-20");
    const sold = snap.asset_breakdown.find(e => e.id === "sold");
    expect(sold.currentValue).toBe(0);
    expect(snap.total_invest_thb).toBe(600);
  });

  it("ignores interpolated fallbacks once the fund is sold out", () => {
    const manualKnown = new Map([["sold", [{ date: "2026-10-26", value: 4460 }]]]);
    const sold = snapshot("2026-10-20", manualKnown).asset_breakdown.find(e => e.id === "sold");
    expect(sold.currentValue).toBe(0);
  });

  it("values a fund at 0 before its first buy", () => {
    const held = snapshot("2026-10-18").asset_breakdown.find(e => e.id === "held");
    expect(held.currentValue).toBe(0);
  });

  it("still prices a fund while units are held", () => {
    const sold = snapshot("2026-10-18").asset_breakdown.find(e => e.id === "sold");
    expect(sold.currentValue).toBe(4400);
  });
});

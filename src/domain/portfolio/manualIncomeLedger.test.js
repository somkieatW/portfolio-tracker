import { describe, it, expect } from "vitest";
import {
  manualIncomeState,
  buildManualIncomeTimeline,
  manualIncomeUpTo,
} from "./manualIncomeLedger.js";

describe("manualIncomeState", () => {
  it("Dime pattern: buy + interest + full interest withdrawal", () => {
    const txs = [
      { type: "buy", date: "2026-01-01", amount_thb: 10000, created_at: "2026-01-01" },
      { type: "interest", date: "2026-06-30", amount_thb: 149.2, created_at: "2026-06-30" },
      { type: "sell", date: "2026-09-11", amount_thb: 149.2, created_at: "2026-09-11" },
    ];
    const state = manualIncomeState(txs);
    expect(state.principal).toBe(10000);
    expect(state.netIncome).toBe(0);
    expect(state.value).toBe(10000);
    expect(state.marketGain).toBe(0);
  });

  it("Sansiri pattern: buy + dividend + full dividend withdrawal", () => {
    const txs = [
      { type: "buy", date: "2022-09-21", amount_thb: 20000, created_at: "2022-09-21" },
      { type: "dividend", date: "2026-09-11", amount_thb: 356.02, created_at: "2026-09-11" },
      { type: "sell", date: "2026-09-11", amount_thb: 356.02, created_at: "2026-09-11" },
    ];
    const state = manualIncomeState(txs);
    expect(state.principal).toBe(20000);
    expect(state.netIncome).toBe(0);
    expect(state.value).toBe(20000);
    expect(state.marketGain).toBe(0);
  });

  it("partial principal withdrawal reduces contributed", () => {
    const txs = [
      { type: "buy", date: "2026-01-01", amount_thb: 10000, created_at: "2026-01-01" },
      { type: "interest", date: "2026-06-01", amount_thb: 200, created_at: "2026-06-01" },
      { type: "sell", date: "2026-07-01", amount_thb: 5200, created_at: "2026-07-01" },
    ];
    const state = manualIncomeState(txs);
    expect(state.principal).toBe(5000);
    expect(state.netIncome).toBe(0);
    expect(state.value).toBe(5000);
  });

  it("respects asOfDate cutoff", () => {
    const txs = [
      { type: "buy", date: "2026-01-01", amount_thb: 10000, created_at: "2026-01-01" },
      { type: "interest", date: "2026-06-30", amount_thb: 149, created_at: "2026-06-30" },
      { type: "sell", date: "2026-09-11", amount_thb: 149, created_at: "2026-09-11" },
    ];
    const beforeWithdraw = manualIncomeState(txs, "2026-07-01");
    expect(beforeWithdraw.principal).toBe(10000);
    expect(beforeWithdraw.netIncome).toBe(149);
    expect(beforeWithdraw.value).toBe(10149);
  });
});

describe("buildManualIncomeTimeline", () => {
  it("records state after each event", () => {
    const txs = [
      { type: "buy", date: "2026-01-01", amount_thb: 10000, created_at: "2026-01-01" },
      { type: "interest", date: "2026-06-30", amount_thb: 149, created_at: "2026-06-30" },
      { type: "sell", date: "2026-09-11", amount_thb: 149, created_at: "2026-09-11" },
    ];
    const timeline = buildManualIncomeTimeline(txs);
    expect(timeline.get("2026-01-01").principal).toBe(10000);
    expect(timeline.get("2026-06-30").netIncome).toBe(149);
    expect(timeline.get("2026-09-11").marketGain).toBe(0);
  });
});

describe("manualIncomeUpTo", () => {
  it("returns latest state on or before date", () => {
    const timeline = new Map([
      ["2026-01-01", { principal: 10000, netIncome: 0, value: 10000, marketGain: 0 }],
      ["2026-06-30", { principal: 10000, netIncome: 149, value: 10149, marketGain: 149 }],
    ]);
    expect(manualIncomeUpTo(timeline, "2026-03-01").netIncome).toBe(0);
    expect(manualIncomeUpTo(timeline, "2026-07-01").netIncome).toBe(149);
  });
});

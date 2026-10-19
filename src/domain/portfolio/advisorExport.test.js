import { describe, it, expect } from "vitest";
import { buildAdvisorExport } from "./advisorExport.js";

describe("buildAdvisorExport", () => {
  it("strips user_id and sorts transactions by date", () => {
    const payload = buildAdvisorExport({
      settings: { specCap: 10 },
      summary: { totalInvest: 1000 },
      assets: [{ id: "a1", name: "Fund" }],
      transactions: [
        { user_id: "secret", asset_id: "a1", type: "sell", date: "2026-02-01", created_at: "2026-02-01" },
        { user_id: "secret", asset_id: "a1", type: "buy", date: "2026-01-01", created_at: "2026-01-01" },
      ],
      snapshots: [{ user_id: "secret", snapshot_date: "2026-01-01", total_invest_thb: 1000 }],
      exportedAt: "2026-03-01T00:00:00.000Z",
    });

    expect(payload.exportVersion).toBe(1);
    expect(payload.transactions[0].type).toBe("buy");
    expect(payload.transactions[0].user_id).toBeUndefined();
    expect(payload.snapshotHistory[0].user_id).toBeUndefined();
    expect(payload.summary.totalInvest).toBe(1000);
  });
});

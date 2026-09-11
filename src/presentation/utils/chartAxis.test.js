import { describe, it, expect } from "vitest";
import {
  extentFromRows,
  paddedYDomain,
  paddedSignedYDomain,
  formatAxisMoney,
  formatAxisSignedMoney,
} from "./chartAxis.js";

describe("extentFromRows", () => {
  it("collects min/max across keys", () => {
    const rows = [
      { value: 640, contributed: 619 },
      { value: 702, contributed: 619, benchmark: 650 },
    ];
    expect(extentFromRows(rows, ["value", "contributed", "benchmark"])).toEqual({
      min: 619,
      max: 702,
    });
  });

  it("returns zero extent for empty data", () => {
    expect(extentFromRows([], ["value"])).toEqual({ min: 0, max: 0 });
  });
});

describe("paddedYDomain", () => {
  it("adds padding around a range", () => {
    const [lo, hi] = paddedYDomain(52_000, 65_000);
    expect(lo).toBeLessThan(52_000);
    expect(hi).toBeGreaterThan(65_000);
    expect(hi - lo).toBeLessThan(20_000);
  });

  it("expands flat series so movement is visible", () => {
    const [lo, hi] = paddedYDomain(700, 700);
    expect(hi - lo).toBeGreaterThan(0);
    expect(lo).toBeLessThan(700);
    expect(hi).toBeGreaterThan(700);
  });
});

describe("paddedSignedYDomain", () => {
  it("includes zero when range crosses zero", () => {
    const [lo, hi] = paddedSignedYDomain(-500, 800);
    expect(lo).toBeLessThanOrEqual(0);
    expect(hi).toBeGreaterThanOrEqual(0);
  });
});

describe("formatAxisMoney", () => {
  it("uses full baht for sub-10k values", () => {
    expect(formatAxisMoney(640)).toBe("฿640");
    expect(formatAxisMoney(702)).toBe("฿702");
    expect(formatAxisMoney(640)).not.toBe(formatAxisMoney(702));
  });

  it("uses k suffix for large portfolio values", () => {
    expect(formatAxisMoney(52_000)).toBe("฿52k");
    expect(formatAxisMoney(65_000)).toBe("฿65k");
  });

  it("uses one decimal k for mid-range thousands", () => {
    expect(formatAxisMoney(1_250)).toBe("฿1.3k");
  });
});

describe("formatAxisSignedMoney", () => {
  it("formats signed P&L values", () => {
    expect(formatAxisSignedMoney(0)).toBe("฿0");
    expect(formatAxisSignedMoney(350)).toBe("+฿350");
    expect(formatAxisSignedMoney(-120)).toBe("-฿120");
  });
});

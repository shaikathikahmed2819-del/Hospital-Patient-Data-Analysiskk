import { describe, it, expect } from "vitest";
import { suppress, stats, generateData, analyze } from "./hospital-data";

describe("hospital analytics", () => {
  it("suppresses counts below 5", () => {
    expect(suppress(3)).toBe("<5");
    expect(suppress(5)).toBe("5");
    expect(suppress(0)).toBe("0");
  });
  it("computes summary statistics", () => {
    const s = stats([1, 2, 3, 4]);
    expect(s.mean).toBe(2.5);
    expect(s.median).toBe(2.5);
  });
  it("department totals add up to all visits", () => {
    const a = analyze(generateData(), null);
    expect(a.departments.reduce((x, d) => x + d.visits, 0)).toBe(a.total);
  });
});

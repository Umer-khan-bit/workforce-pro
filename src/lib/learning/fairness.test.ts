import { describe, expect, it } from "vitest";
import { groupStats, isMonth, monthOf, monthRange, previousMonth } from "./fairness";

const obs = (group: string, n: number, quartile: number, percentile: number) => Array.from({ length: n }, () => ({ group, quartile, percentile }));

describe("fairness report maths", () => {
  it("hides groups that are too small, with no numbers at all", () => {
    const stats = groupStats([...obs("Female", 40, 1, 80), ...obs("Other", 4, 1, 90)], 30, 0.8);
    const other = stats.find((s) => s.label === "Other")!;
    expect(other).toMatchObject({ suppressed: true, meanPercentile: null, q1Share: null, topHalfShare: null, impactRatio: null, flagged: false });
    expect(stats.find((s) => s.label === "Female")!.suppressed).toBe(false);
  });

  it("flags a group whose top-half share is under four fifths of the best group's", () => {
    const stats = groupStats([...obs("Male", 30, 1, 80), ...obs("Male", 10, 4, 10), ...obs("Female", 20, 1, 80), ...obs("Female", 20, 4, 10)], 30, 0.8);
    const male = stats.find((s) => s.label === "Male")!;
    const female = stats.find((s) => s.label === "Female")!;
    expect(male.topHalfShare).toBe(75);
    expect(male.impactRatio).toBe(1);
    expect(female.topHalfShare).toBe(50);
    expect(female.impactRatio).toBe(0.67);
    expect(female.flagged).toBe(true);
    expect(male.flagged).toBe(false);
  });

  it("does not flag groups that are close", () => {
    const stats = groupStats([...obs("A", 30, 1, 70), ...obs("A", 10, 3, 40), ...obs("B", 28, 2, 60), ...obs("B", 12, 4, 20)], 30, 0.8);
    expect(stats.every((s) => !s.flagged)).toBe(true);
  });

  it("uses the flag limit it is given, not a fixed 0.8", () => {
    const data = [...obs("Male", 30, 1, 80), ...obs("Male", 10, 4, 10), ...obs("Female", 20, 1, 80), ...obs("Female", 20, 4, 10)];
    const flaggedAt = (limit: number) => groupStats(data, 30, limit).filter((s) => s.flagged).map((s) => s.label);
    expect(flaggedAt(0.8)).toEqual(["Female"]); // ratio 0.67
    expect(flaggedAt(0.6)).toEqual([]);
    expect(flaggedAt(0.7)).toEqual(["Female"]); // 0.67 is still below 0.7
  });

  it("handles months", () => {
    expect(previousMonth(new Date("2026-01-15T00:00:00Z"))).toBe("2025-12");
    expect(monthOf(new Date("2026-10-01T00:00:00Z"))).toBe("2026-10");
    expect(monthRange("2026-12")).toEqual({ from: new Date("2026-12-01T00:00:00Z"), to: new Date("2027-01-01T00:00:00Z") });
    expect(isMonth("2026-09")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("../etc")).toBe(false);
  });
});

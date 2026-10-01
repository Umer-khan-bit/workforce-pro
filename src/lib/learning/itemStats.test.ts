import { describe, expect, it } from "vitest";
import { correctRate, difGap, discrimination, fitItem, flagReasons, worstDif, type GroupPoint, type Point } from "./itemStats";

// A small seeded generator so the tests are repeatable.
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}
const logistic = (a: number, b: number, t: number) => 1 / (1 + Math.exp(-a * (t - b)));
function simulate(n: number, a: number, b: number, seed = 1): Point[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => {
    const theta = (r() + r() + r() + r() - 2) * 1.7;
    return { theta, correct: r() < logistic(a, b, theta) };
  });
}

const rules = { minResponsesForRecalibration: 200, tooEasyCorrectRate: 0.95, tooHardCorrectRate: 0.1, minDiscrimination: 0.3, maxDifGap: 0.15 };

describe("fitItem", () => {
  it("recovers a harder item from answers, starting from the default medium values", () => {
    const fit = fitItem(simulate(2000, 1.2, 1, 7), { a: 1, b: 0 });
    expect(fit.b).toBeGreaterThan(0.6);
    expect(fit.b).toBeLessThan(1.4);
    expect(fit.a).toBeGreaterThan(0.7);
  });

  it("moves an easy item downwards", () => {
    expect(fitItem(simulate(2000, 1, -1.5, 3), { a: 1, b: 0 }).b).toBeLessThan(-0.9);
  });

  it("keeps the numbers inside safe limits even for odd data", () => {
    const allRight = fitItem(Array.from({ length: 300 }, (_, i) => ({ theta: i / 100 - 1.5, correct: true })), { a: 1, b: 0 });
    expect(allRight.b).toBeGreaterThanOrEqual(-4);
    expect(allRight.a).toBeLessThanOrEqual(3);
    expect(Number.isFinite(allRight.a) && Number.isFinite(allRight.b)).toBe(true);
  });
});

describe("share correct and discrimination", () => {
  it("counts the share correct, and null when there are no answers", () => {
    expect(correctRate([])).toBeNull();
    expect(correctRate([{ theta: 0, correct: true }, { theta: 0, correct: false }])).toBe(0.5);
  });

  it("is high when strong candidates answer right and near zero when answers are random", () => {
    expect(discrimination(simulate(1500, 1.8, 0, 5))!).toBeGreaterThan(0.4);
    const r = rng(11);
    const noise = Array.from({ length: 1500 }, () => ({ theta: (r() - 0.5) * 4, correct: r() < 0.5 }));
    expect(Math.abs(discrimination(noise)!)).toBeLessThan(0.1);
  });
});

describe("differential item functioning", () => {
  const make = (n: number, penalty: number, seed: number): GroupPoint[] => {
    const r = rng(seed);
    return Array.from({ length: n }, (_, i) => {
      const group = i % 2 === 0 ? "FEMALE" : "MALE";
      const theta = (r() + r() + r() - 1.5) * 1.5;
      return { theta, group, correct: r() < logistic(1, 0, theta) - (group === "FEMALE" ? penalty : 0) };
    });
  };

  it("finds nothing when equally able groups do equally well", () => {
    const gap = worstDif(make(2000, 0, 21), 30);
    expect(Math.abs(gap!.gap)).toBeLessThan(0.08);
  });

  it("finds a group that does worse than equally able others, with a negative gap", () => {
    const gap = difGap(make(2000, 0.25, 22), "FEMALE", 30)!;
    expect(gap.gap).toBeLessThan(-0.15);
  });

  it("ignores groups that are too small to compare", () => {
    expect(difGap(make(40, 0.3, 23), "FEMALE", 30)).toBeNull();
    expect(worstDif([{ theta: 0, correct: true, group: null }], 1)).toBeNull();
  });

  it("does not count a higher overall score as bias when the groups differ in ability", () => {
    const r = rng(31);
    const pts: GroupPoint[] = Array.from({ length: 3000 }, (_, i) => {
      const group = i % 2 === 0 ? "A" : "B";
      const theta = (r() + r() + r() - 1.5) * 1.5 + (group === "A" ? 0.8 : 0);
      return { theta, group, correct: r() < logistic(1, 0, theta) };
    });
    expect(Math.abs(difGap(pts, "A", 30)!.gap)).toBeLessThan(0.08);
  });
});

describe("flagReasons", () => {
  const ok = { responseCount: 400, correctRate: 0.6, discrimination: 0.5, difByGender: 0.02, difByRegion: null, difByLanguage: null };

  it("flags nothing for a healthy question, and nothing before enough answers", () => {
    expect(flagReasons(ok, rules)).toEqual([]);
    expect(flagReasons({ ...ok, responseCount: 50, correctRate: 0.99 }, rules)).toEqual([]);
  });

  it("flags too easy, too hard, low discrimination and bias, each with a plain reason", () => {
    expect(flagReasons({ ...ok, correctRate: 0.98 }, rules).map((r) => r.code)).toEqual(["TOO_EASY"]);
    expect(flagReasons({ ...ok, correctRate: 0.04 }, rules).map((r) => r.code)).toEqual(["TOO_HARD"]);
    expect(flagReasons({ ...ok, discrimination: 0.1 }, rules).map((r) => r.code)).toEqual(["LOW_DISCRIMINATION"]);
    const bias = flagReasons({ ...ok, difByGender: -0.2, difByRegion: 0.3 }, rules);
    expect(bias.map((r) => r.code)).toEqual(["DIF_GENDER", "DIF_REGION"]);
    expect(bias[0].text).toContain("Possible bias");
  });

  it("uses the limits it is given (they are settings)", () => {
    expect(flagReasons({ ...ok, correctRate: 0.9 }, { ...rules, tooEasyCorrectRate: 0.85 }).map((r) => r.code)).toEqual(["TOO_EASY"]);
  });
});

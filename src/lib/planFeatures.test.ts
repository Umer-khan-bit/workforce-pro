import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FEATURE_KEYS, canAddMore, featureLimit, hasFeature, parsePlanFeatures } from "./planFeatures";
import { FEATURE_SEEDS, PLAN_SEEDS } from "./seedData";

describe("hasFeature", () => {
  const features = { allCandidates: true, q1Exclusive: false, aiSearch: "yes" };

  it("is true only for an explicit true", () => {
    expect(hasFeature(features, FEATURE_KEYS.ALL_CANDIDATES)).toBe(true);
    expect(hasFeature(features, FEATURE_KEYS.Q1_EXCLUSIVE)).toBe(false);
    expect(hasFeature(features, FEATURE_KEYS.AI_SEARCH)).toBe(false);
    expect(hasFeature(features, FEATURE_KEYS.ATS_API_ACCESS)).toBe(false);
  });

  it("treats a missing plan or junk as no features", () => {
    for (const bad of [null, undefined, "x", 5, []]) {
      expect(hasFeature(bad, FEATURE_KEYS.ALL_CANDIDATES)).toBe(false);
    }
  });
});

describe("limits", () => {
  it("returns the number, null for unlimited, and 0 when undefined", () => {
    expect(featureLimit({ maxShortlists: 25 }, FEATURE_KEYS.MAX_SHORTLISTS)).toBe(25);
    expect(featureLimit({ maxShortlists: null }, FEATURE_KEYS.MAX_SHORTLISTS)).toBeNull();
    expect(featureLimit({}, FEATURE_KEYS.MAX_SHORTLISTS)).toBe(0);
    expect(featureLimit(null, FEATURE_KEYS.MAX_SHORTLISTS)).toBe(0);
    expect(featureLimit({ maxShortlists: -3 }, FEATURE_KEYS.MAX_SHORTLISTS)).toBe(0);
  });

  it("canAddMore allows up to the limit, always allows unlimited, never allows a missing limit", () => {
    const k = FEATURE_KEYS.MAX_JOB_OPENINGS;
    expect(canAddMore({ maxJobOpenings: 5 }, k, 4)).toBe(true);
    expect(canAddMore({ maxJobOpenings: 5 }, k, 5)).toBe(false);
    expect(canAddMore({ maxJobOpenings: null }, k, 10_000)).toBe(true);
    expect(canAddMore({}, k, 0)).toBe(false);
  });
});

describe("parsePlanFeatures", () => {
  const defs = [
    { key: "allCandidates", kind: "BOOLEAN" as const },
    { key: "maxShortlists", kind: "LIMIT" as const },
  ];

  it("accepts booleans and limits (number or null)", () => {
    expect(parsePlanFeatures(defs, { allCandidates: true, maxShortlists: null })).toEqual({
      ok: true,
      features: { allCandidates: true, maxShortlists: null },
    });
    expect(parsePlanFeatures(defs, { allCandidates: false, maxShortlists: "30" })).toMatchObject({
      ok: true,
      features: { maxShortlists: 30 },
    });
  });

  it("rejects missing, unknown and wrong-typed features", () => {
    expect(parsePlanFeatures(defs, { allCandidates: true }).ok).toBe(false);
    expect(parsePlanFeatures(defs, { allCandidates: true, maxShortlists: 1, extra: true }).ok).toBe(false);
    expect(parsePlanFeatures(defs, { allCandidates: "yes", maxShortlists: 1 }).ok).toBe(false);
    expect(parsePlanFeatures(defs, { allCandidates: true, maxShortlists: -1 }).ok).toBe(false);
  });
});

describe("starting plans", () => {
  it("define exactly the seeded features, and every feature key is known to the code", () => {
    const keys = FEATURE_SEEDS.map((f) => f.key).sort();
    expect(keys).toEqual(Object.values(FEATURE_KEYS).sort());
    for (const plan of PLAN_SEEDS) expect(Object.keys(plan.features).sort()).toEqual(keys);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

describe("no plan-name checks", () => {
  it("no source file branches on a plan's name or code", () => {
    const offenders = sourceFiles(path.resolve(__dirname, ".."))
      .filter((f) => /\bplan\w*\.(name|code)\s*[!=]==?/.test(readFileSync(f, "utf-8")) || /['"`](BASIC|ADVANCED|basic|advanced)['"`]\s*[!=]==/.test(readFileSync(f, "utf-8")))
      .map((f) => path.relative(process.cwd(), f));
    expect(offenders).toEqual([]);
  });
});

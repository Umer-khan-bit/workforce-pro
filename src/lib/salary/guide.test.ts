import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TestType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SETTINGS } from "@/lib/settings/definitions";
import { createKit, type Kit } from "@/lib/testEngine/testkit";
import { bandForYears, computeGuide, loadSalaryGuide, quartilePoints } from "./guide";

const settings = DEFAULT_SETTINGS.salaryGuide; // influence 60, width 50, Q1..Q4 = 100/66/33/0, rounding 1000
const market = { min: 60_000, avg: 80_000, max: 120_000 };

describe("computeGuide (pure arithmetic)", () => {
  it("uses the points for each quartile from the settings", () => {
    expect([1, 2, 3, 4].map((q) => quartilePoints(q, settings))).toEqual([100, 66, 33, 0]);
  });

  it("puts a candidate with no ranked results at the market average", () => {
    const g = computeGuide(market, [], settings);
    expect(g.points).toBeNull();
    expect(g.position).toBe(0.5);
    expect(g.suggestedMid).toBe(80_000);
  });

  it("places stronger results higher in the market range, and weaker results lower", () => {
    const top = computeGuide(market, [1, 1, 1, 1], settings);
    const mid = computeGuide(market, [2, 2, 2, 2], settings);
    const low = computeGuide(market, [4, 4, 4, 4], settings);
    expect(top.suggestedMid).toBeGreaterThan(mid.suggestedMid);
    expect(mid.suggestedMid).toBeGreaterThan(low.suggestedMid);
    expect(top.suggestedMax).toBeLessThanOrEqual(market.max);
    expect(low.suggestedMin).toBeGreaterThanOrEqual(market.min);
  });

  it("averages the points across tests", () => {
    const g = computeGuide(market, [1, 4], settings); // (100 + 0) / 2
    expect(g.points).toBe(50);
    expect(g.position).toBeCloseTo(0.5, 5);
  });

  it("ignores results entirely when the influence is 0, and follows them fully at 100", () => {
    const none = computeGuide(market, [1, 1], { ...settings, scoreInfluencePercent: 0 });
    expect(none.suggestedMid).toBe(80_000);
    const full = computeGuide(market, [1, 1], { ...settings, scoreInfluencePercent: 100, rangeWidthPercent: 10 });
    expect(full.position).toBe(1);
    expect(full.suggestedMax).toBe(120_000);
    const bottom = computeGuide(market, [4, 4], { ...settings, scoreInfluencePercent: 100, rangeWidthPercent: 10 });
    expect(bottom.position).toBe(0);
    expect(bottom.suggestedMin).toBe(60_000);
  });

  it("keeps the whole window inside the market range and as wide as the settings say", () => {
    const g = computeGuide(market, [1, 1, 1, 1], { ...settings, scoreInfluencePercent: 100 });
    // Width 50% of 60,000 = 30,000, slid down from the top edge instead of being squeezed.
    expect(g.suggestedMax).toBe(120_000);
    expect(g.suggestedMax - g.suggestedMin).toBe(30_000);
  });

  it("rounds to the step in the settings, and never returns a range that is back to front", () => {
    const g = computeGuide({ min: 50_123, avg: 61_777, max: 70_901 }, [2], { ...settings, roundTo: 500 });
    expect(g.suggestedMin % 500).toBe(0);
    expect(g.suggestedMax % 500).toBe(0);
    expect(g.suggestedMax).toBeGreaterThanOrEqual(g.suggestedMin);
    expect(g.suggestedMid).toBeGreaterThanOrEqual(g.suggestedMin);
    expect(g.suggestedMid).toBeLessThanOrEqual(g.suggestedMax);
  });
});

describe("bandForYears", () => {
  const bands = [
    { id: "a", minYears: 0, maxYears: 1 },
    { id: "b", minYears: 2, maxYears: 4 },
    { id: "c", minYears: 10, maxYears: null },
  ];
  it("finds the band, including the open-ended top band", () => {
    expect(bandForYears(bands, 0)?.id).toBe("a");
    expect(bandForYears(bands, 3)?.id).toBe("b");
    expect(bandForYears(bands, 25)?.id).toBe("c");
  });
  it("returns nothing for years that fall in a gap", () => {
    expect(bandForYears(bands, 6)).toBeUndefined();
  });
});

const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

describe.skipIf(!dbUp)("loadSalaryGuide (real database)", () => {
  let kit: Kit;
  let bandId: string;
  const YEARS = 120; // a band no real data uses, so these tests never see real benchmarks
  const CITY = "Guideville";

  beforeAll(async () => {
    kit = await createKit(prisma, "sal");
    const band = await prisma.experienceBand.create({ data: { label: `Test band ${kit.run}`, minYears: YEARS, maxYears: null, sortOrder: 999 } });
    bandId = band.id;
    await prisma.salaryBenchmark.create({ data: { jobRoleId: kit.role.id, city: CITY, experienceBandId: bandId, minSalary: 60_000, avgSalary: 80_000, maxSalary: 120_000 } });
    await prisma.salaryBenchmark.create({ data: { jobRoleId: kit.role.id, city: "Otherton", experienceBandId: bandId, minSalary: 40_000, avgSalary: 60_000, maxSalary: 80_000 } });
  }, 60_000);

  afterAll(async () => {
    await prisma.salaryBenchmark.deleteMany({ where: { experienceBandId: bandId } });
    await prisma.experienceBand.delete({ where: { id: bandId } });
    await kit.cleanup();
  }, 60_000);

  async function candidate(name: string, over: { city?: string | null; years?: number | null; roleId?: string | null; minimumSalary?: number | null } = {}) {
    const c = await kit.addCandidate(name);
    await prisma.candidateProfile.update({
      where: { id: c.profileId },
      data: {
        city: over.city === undefined ? CITY : over.city,
        experienceYears: over.years === undefined ? YEARS : over.years,
        jobRoleId: over.roleId === undefined ? kit.role.id : over.roleId,
        minimumSalary: over.minimumSalary === undefined ? 70_000 : over.minimumSalary,
      },
    });
    return c;
  }
  const quartileScore = async (profileId: string, testType: TestType, quartile: number) => {
    const session = await prisma.testSession.create({ data: { candidateProfileId: profileId, testType, status: "COMPLETED", completedAt: new Date() } });
    await prisma.score.create({ data: { candidateProfileId: profileId, sessionId: session.id, testType, rawScore: 50, quartile, percentile: 100 - quartile * 25 + 12, rankValue: 0 } });
  };

  it("asks for the missing profile details", async () => {
    const c = await candidate("incomplete", { city: null, years: null });
    expect(await loadSalaryGuide(prisma, c.profileId)).toEqual({ status: "INCOMPLETE_PROFILE", missing: ["city", "years of experience"] });
  });

  it("uses the benchmark for the candidate's role, city and experience band", async () => {
    const c = await candidate("exact");
    const g = await loadSalaryGuide(prisma, c.profileId);
    expect(g.status).toBe("OK");
    if (g.status !== "OK") return;
    expect(g.market).toEqual({ min: 60_000, avg: 80_000, max: 120_000 });
    expect(g.allCitiesFallback).toBe(false);
    expect(g.bandLabel).toBe(`Test band ${kit.run}`);
    expect(g.usedTests).toEqual([]);
    expect(g.numbers.suggestedMid).toBe(80_000); // no results yet: the market average
  });

  it("matches the city without caring about capital letters", async () => {
    const c = await candidate("case", { city: CITY.toUpperCase() });
    const g = await loadSalaryGuide(prisma, c.profileId);
    expect(g.status === "OK" && g.allCitiesFallback).toBe(false);
  });

  it("averages all cities when the candidate's city has no figure, and says so", async () => {
    const c = await candidate("nocity", { city: "Nowhere" });
    const g = await loadSalaryGuide(prisma, c.profileId);
    expect(g.status).toBe("OK");
    if (g.status !== "OK") return;
    expect(g.allCitiesFallback).toBe(true);
    expect(g.market).toEqual({ min: 50_000, avg: 70_000, max: 100_000 });
  });

  it("reports no data for a role with no benchmarks", async () => {
    const c = await candidate("norole", { roleId: kit.otherRole.id });
    expect((await loadSalaryGuide(prisma, c.profileId)).status).toBe("NO_DATA");
  });

  it("moves the suggestion with the candidate's quartiles, using only the counted tests", async () => {
    const strong = await candidate("strong");
    const weak = await candidate("weak");
    for (const t of settings.countedTests) {
      await quartileScore(strong.profileId, t, 1);
      await quartileScore(weak.profileId, t, 4);
    }
    const [s, w] = await Promise.all([loadSalaryGuide(prisma, strong.profileId), loadSalaryGuide(prisma, weak.profileId)]);
    if (s.status !== "OK" || w.status !== "OK") throw new Error("expected guides");
    expect(s.numbers.suggestedMid).toBeGreaterThan(w.numbers.suggestedMid);
    expect(s.usedTests).toHaveLength(settings.countedTests.length);
  });

  it("compares the candidate's own minimum with the suggested range", async () => {
    const low = await candidate("minlow", { minimumSalary: 10_000 });
    const mid = await candidate("minmid", { minimumSalary: 80_000 });
    const high = await candidate("minhigh", { minimumSalary: 500_000 });
    const none = await candidate("minnone", { minimumSalary: null });
    const vs = async (id: string) => {
      const g = await loadSalaryGuide(prisma, id);
      return g.status === "OK" ? g.minimumVsRange : "n/a";
    };
    expect(await vs(low.profileId)).toBe("BELOW");
    expect(await vs(mid.profileId)).toBe("WITHIN");
    expect(await vs(high.profileId)).toBe("ABOVE");
    expect(await vs(none.profileId)).toBeNull();
  });
});

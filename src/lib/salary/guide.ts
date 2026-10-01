import type { PrismaClient, TestType } from "@prisma/client";
import { readSetting } from "@/lib/settings/store";
import type { SettingValue } from "@/lib/settings/definitions";
import { currentQuartiles } from "@/lib/results/topPerformer";

type GuideSettings = SettingValue<"salaryGuide">;

export type Market = { min: number; avg: number; max: number };

export type GuideNumbers = {
  /** Average points (0-100) from the candidate's quartiles, or null when they have no ranked result yet. */
  points: number | null;
  /** Where the candidate sits in the market range: 0 = bottom, 0.5 = average, 1 = top. */
  position: number;
  suggestedMin: number;
  suggestedMid: number;
  suggestedMax: number;
};

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** Points for one quartile from the settings (Q1 is the best). */
export function quartilePoints(quartile: number, s: GuideSettings): number {
  return [s.pointsQ1, s.pointsQ2, s.pointsQ3, s.pointsQ4][Math.min(4, Math.max(1, quartile)) - 1];
}

/**
 * The salary guide, as plain arithmetic on numbers from the database:
 *  1. points = average of the points for the candidate's quartile in each counted test;
 *  2. position = a blend of "average" (0.5) and the points, by "how much results move the range";
 *  3. the middle of the suggestion is on the market line min - average - max at that position;
 *  4. the suggested range is as wide as the settings say, kept inside the market range.
 */
export function computeGuide(market: Market, quartiles: number[], s: GuideSettings): GuideNumbers {
  const points = quartiles.length ? quartiles.reduce((sum, q) => sum + quartilePoints(q, s), 0) / quartiles.length : null;
  const w = s.scoreInfluencePercent / 100;
  const position = points === null ? 0.5 : (1 - w) * 0.5 + w * (points / 100);

  const mid = position <= 0.5 ? market.min + (market.avg - market.min) * (position / 0.5) : market.avg + (market.max - market.avg) * ((position - 0.5) / 0.5);
  const width = (market.max - market.min) * (s.rangeWidthPercent / 100);
  let low = mid - width / 2;
  let high = mid + width / 2;
  // Keep the whole window inside the market range, sliding it rather than squeezing it.
  if (low < market.min) {
    high = Math.min(market.max, high + (market.min - low));
    low = market.min;
  }
  if (high > market.max) {
    low = Math.max(market.min, low - (high - market.max));
    high = market.max;
  }

  const step = s.roundTo;
  const suggestedMin = roundTo(low, step);
  const suggestedMax = Math.max(suggestedMin, roundTo(high, step));
  return { points, position, suggestedMin, suggestedMid: Math.min(suggestedMax, Math.max(suggestedMin, roundTo(mid, step))), suggestedMax };
}

export type SalaryGuide =
  | { status: "INCOMPLETE_PROFILE"; missing: string[] }
  | { status: "NO_DATA"; roleName: string; city: string; bandLabel: string }
  | {
      status: "OK";
      roleName: string;
      city: string;
      bandLabel: string;
      /** True when there was no figure for this city, so the average of all cities is used. */
      allCitiesFallback: boolean;
      market: Market;
      numbers: GuideNumbers;
      /** The tests whose quartile was used, with the quartile. */
      usedTests: { testType: TestType; quartile: number }[];
      minimumSalary: number | null;
      /** How the candidate's own minimum compares with the suggested range. */
      minimumVsRange: "BELOW" | "WITHIN" | "ABOVE" | null;
      disclaimer: string;
    };

type Db = Pick<PrismaClient, "candidateProfile" | "experienceBand" | "salaryBenchmark" | "score" | "siteSetting">;

/** Finds the experience band for a number of years (bands come from the database). */
export function bandForYears<B extends { minYears: number; maxYears: number | null }>(bands: B[], years: number): B | undefined {
  return [...bands].sort((a, b) => b.minYears - a.minYears).find((b) => years >= b.minYears && (b.maxYears === null || years <= b.maxYears));
}

export async function loadSalaryGuide(db: Db, candidateProfileId: string): Promise<SalaryGuide> {
  const profile = await db.candidateProfile.findUnique({
    where: { id: candidateProfileId },
    select: { jobRoleId: true, jobRole: { select: { name: true } }, city: true, experienceYears: true, minimumSalary: true },
  });
  const missing: string[] = [];
  if (!profile?.jobRoleId) missing.push("job role");
  if (!profile?.city) missing.push("city");
  if (profile?.experienceYears === null || profile?.experienceYears === undefined) missing.push("years of experience");
  if (!profile || missing.length > 0) return { status: "INCOMPLETE_PROFILE", missing };

  const [bands, settings] = await Promise.all([db.experienceBand.findMany(), readSetting(db, "salaryGuide")]);
  const band = bandForYears(bands, profile.experienceYears!);
  const roleName = profile.jobRole!.name;
  const city = profile.city!;
  if (!band) return { status: "NO_DATA", roleName, city, bandLabel: `${profile.experienceYears} years` };

  const exact = await db.salaryBenchmark.findFirst({
    where: { jobRoleId: profile.jobRoleId!, experienceBandId: band.id, city: { equals: city, mode: "insensitive" } },
  });
  let market: Market | null = exact ? { min: exact.minSalary, avg: exact.avgSalary, max: exact.maxSalary } : null;
  let allCitiesFallback = false;
  if (!market) {
    const all = await db.salaryBenchmark.findMany({ where: { jobRoleId: profile.jobRoleId!, experienceBandId: band.id } });
    if (all.length > 0) {
      const mean = (pick: (b: (typeof all)[number]) => number) => Math.round(all.reduce((sum, b) => sum + pick(b), 0) / all.length);
      market = { min: mean((b) => b.minSalary), avg: mean((b) => b.avgSalary), max: mean((b) => b.maxSalary) };
      allCitiesFallback = true;
    }
  }
  if (!market) return { status: "NO_DATA", roleName, city, bandLabel: band.label };

  const quartiles = await currentQuartiles(db, candidateProfileId);
  const usedTests = settings.countedTests.flatMap((testType) => {
    const quartile = quartiles[testType];
    return typeof quartile === "number" ? [{ testType, quartile }] : [];
  });
  const numbers = computeGuide(market, usedTests.map((t) => t.quartile), settings);

  const min = profile.minimumSalary;
  const minimumVsRange = min === null ? null : min < numbers.suggestedMin ? "BELOW" : min > numbers.suggestedMax ? "ABOVE" : "WITHIN";
  return { status: "OK", roleName, city, bandLabel: band.label, allCitiesFallback, market, numbers, usedTests, minimumSalary: min, minimumVsRange, disclaimer: settings.disclaimer };
}

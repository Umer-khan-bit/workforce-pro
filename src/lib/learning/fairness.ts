import type { Prisma, PrismaClient, TestType } from "@prisma/client";
import { notifyUser } from "@/lib/notifications";
import { readSetting } from "@/lib/settings/store";
import { TEST_TITLES } from "@/lib/testEngine/labels";

type Db = PrismaClient;

export const FAIRNESS_TESTS: TestType[] = ["IQ", "EQ", "LANGUAGE", "SKILL"];

export type GroupStats = { label: string; n: number; suppressed: boolean; meanPercentile: number | null; q1Share: number | null; topHalfShare: number | null; impactRatio: number | null; flagged: boolean };
export type DimensionReport = { dimension: "gender" | "region" | "language"; title: string; groups: GroupStats[] };
export type TestReport = { test: TestType; title: string; total: number; dimensions: DimensionReport[] };
export type FairnessData = {
  month: string;
  generatedAt: string;
  minGroup: number;
  /** The impact ratio below which a group was flagged in this report (Settings > Advanced > Self-learning when it was made). */
  impactThreshold: number;
  /** Number of results (not people) in the report. */
  candidates: number;
  tests: TestReport[];
  items: { flaggedTotal: number; flaggedForBias: { id: string; text: string; testType: string; reason: string }[] };
  notes: string[];
};

export const monthOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
export function previousMonth(now: Date): string {
  return monthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
}
export function monthRange(month: string): { from: Date; to: Date } {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
}
export const isMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

type Obs = { group: string; percentile: number; quartile: number };
const round = (n: number, p = 1) => Math.round(n * 10 ** p) / 10 ** p;

/**
 * Group-by-group results for one test and one grouping (gender, region or language). A group with fewer than
 * `minGroup` people is reported only as "too few to report", with no numbers, so small groups cannot be identified.
 * Impact ratio = the group's share reaching the top half (Q1 or Q2) divided by the best group's share; a group is
 * flagged when that ratio is below `impactThreshold` (a Setting; 0.8 is the four-fifths rule).
 */
export function groupStats(observations: Obs[], minGroup: number, impactThreshold: number): GroupStats[] {
  const labels = [...new Set(observations.map((o) => o.group))].sort();
  const stats = labels.map((label) => {
    const rows = observations.filter((o) => o.group === label);
    if (rows.length < minGroup) return { label, n: rows.length, suppressed: true, meanPercentile: null, q1Share: null, topHalfShare: null, impactRatio: null, flagged: false } satisfies GroupStats;
    return {
      label,
      n: rows.length,
      suppressed: false,
      meanPercentile: round(rows.reduce((s, r) => s + r.percentile, 0) / rows.length),
      q1Share: round((rows.filter((r) => r.quartile === 1).length / rows.length) * 100),
      topHalfShare: round((rows.filter((r) => r.quartile <= 2).length / rows.length) * 100),
      impactRatio: null,
      flagged: false,
    } satisfies GroupStats;
  });
  const best = Math.max(0, ...stats.filter((s) => !s.suppressed).map((s) => s.topHalfShare ?? 0));
  return stats.map((s) => {
    if (s.suppressed || best === 0) return s;
    const ratio = round((s.topHalfShare ?? 0) / best, 2);
    return { ...s, impactRatio: ratio, flagged: ratio < impactThreshold };
  });
}

const GENDER_LABEL: Record<string, string> = { FEMALE: "Female", MALE: "Male", OTHER: "Other" };

/** Builds the fairness report for one month from the results stored that month (deleted accounts are left out). */
export async function buildFairnessReport(db: Db, month: string, now = new Date()): Promise<FairnessData> {
  const [rules, regions, languages] = await Promise.all([readSetting(db, "selfLearning"), db.region.findMany({ select: { id: true, name: true } }), db.language.findMany({ select: { id: true, name: true } })]);
  const { from, to } = monthRange(month);
  const regionName = new Map(regions.map((r) => [r.id, r.name]));
  const languageName = new Map(languages.map((l) => [l.id, l.name]));

  const scores = await db.score.findMany({
    where: { testType: { in: FAIRNESS_TESTS }, provisional: false, quartile: { not: null }, percentile: { not: null }, computedAt: { gte: from, lt: to }, candidateProfile: { anonymisedAt: null } },
    select: { testType: true, quartile: true, percentile: true, candidateProfile: { select: { gender: true, regionId: true } }, session: { select: { languageId: true } } },
  });

  const tests: TestReport[] = FAIRNESS_TESTS.map((test) => {
    const rows = scores.filter((s) => s.testType === test);
    const obs = (pick: (s: (typeof rows)[number]) => string | null): Obs[] =>
      rows.flatMap((s) => {
        const group = pick(s);
        return group ? [{ group, percentile: s.percentile as number, quartile: s.quartile as number }] : [];
      });
    return {
      test,
      title: TEST_TITLES[test],
      total: rows.length,
      dimensions: [
        { dimension: "gender", title: "Gender", groups: groupStats(obs((s) => (s.candidateProfile.gender ? GENDER_LABEL[s.candidateProfile.gender] : null)), rules.minGroupResponses, rules.fairnessImpactThreshold) },
        { dimension: "region", title: "Region", groups: groupStats(obs((s) => (s.candidateProfile.regionId ? (regionName.get(s.candidateProfile.regionId) ?? null) : null)), rules.minGroupResponses, rules.fairnessImpactThreshold) },
        { dimension: "language", title: "Test language", groups: groupStats(obs((s) => (s.session.languageId ? (languageName.get(s.session.languageId) ?? null) : null)), rules.minGroupResponses, rules.fairnessImpactThreshold) },
      ],
    };
  });

  const [flaggedTotal, biased] = await Promise.all([
    db.itemStatistic.count({ where: { flagged: true } }),
    db.itemStatistic.findMany({ where: { flagged: true, flagReason: { contains: "Possible bias" } }, take: 25, orderBy: { updatedAt: "desc" }, include: { question: { select: { id: true, content: true, testType: true } } } }),
  ]);
  return {
    month,
    generatedAt: now.toISOString(),
    minGroup: rules.minGroupResponses,
    impactThreshold: rules.fairnessImpactThreshold,
    candidates: scores.length,
    tests,
    items: { flaggedTotal, flaggedForBias: biased.map((b) => ({ id: b.question.id, text: b.question.content.slice(0, 140), testType: b.question.testType, reason: b.flagReason ?? "" })) },
    notes: [
      `Groups with fewer than ${rules.minGroupResponses} results are not shown, so small groups cannot be identified.`,
      `Impact ratio is the share of a group reaching the top half (Q1 or Q2) divided by the share of the best group. Below ${rules.fairnessImpactThreshold} is flagged (the limit is in Settings > Advanced > Self-learning; 0.8 is the common four-fifths rule).`,
      "Gender is optional on the candidate profile, so it only covers candidates who chose to give it. Deleted accounts are not included.",
    ],
  };
}

/** Makes (or remakes) the report for a month, stores it, and tells the platform admins the first time. */
export async function generateFairnessReport(db: Db, args: { month: string; actorId?: string | null; now?: Date; notifyAdmins?: boolean }) {
  const existing = await db.fairnessReport.findUnique({ where: { month: args.month } });
  const data = await buildFairnessReport(db, args.month, args.now);
  const report = await db.fairnessReport.upsert({
    where: { month: args.month },
    create: { month: args.month, generatedBy: args.actorId ?? null, data: data as unknown as Prisma.InputJsonValue },
    update: { generatedAt: args.now ?? new Date(), generatedBy: args.actorId ?? null, data: data as unknown as Prisma.InputJsonValue },
  });
  if (!existing && args.notifyAdmins !== false) {
    const admins = await db.user.findMany({ where: { role: "PLATFORM_ADMIN", isActive: true }, select: { id: true } });
    for (const a of admins) await notifyUser(db, { userId: a.id, templateKey: "FAIRNESS_REPORT_READY_IN_APP", type: "GENERAL", values: { month: args.month }, link: `/admin/fairness?month=${args.month}` });
  }
  return report;
}

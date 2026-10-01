import type { CefrLevel, PrismaClient, TestType } from "@prisma/client";
import { TEST_ORDER } from "@/lib/testEngine/context";

type Db = Pick<PrismaClient, "score">;

export type LatestResult = {
  scoreId: string;
  sessionId: string;
  testType: TestType;
  computedAt: Date;
  rawScore: number;
  percentile: number | null;
  quartile: number | null;
  cefrLevel: CefrLevel | null;
  provisional: boolean;
  cohort: { scope: "ROLE" | "ALL"; size: number } | null;
  traits: { trait: string; score: number }[] | null;
  details: Record<string, unknown>;
};

/** The candidate's most recent result for each test, in the usual test order. */
export async function latestResults(db: Db, candidateProfileId: string): Promise<LatestResult[]> {
  const rows = await db.score.findMany({
    where: { candidateProfileId },
    orderBy: { computedAt: "desc" },
    distinct: ["testType"],
  });
  return rows
    .map((s): LatestResult => {
      const details = (s.details && typeof s.details === "object" && !Array.isArray(s.details) ? s.details : {}) as Record<string, unknown>;
      return {
        scoreId: s.id,
        sessionId: s.sessionId,
        testType: s.testType,
        computedAt: s.computedAt,
        rawScore: s.rawScore,
        percentile: s.percentile,
        quartile: s.quartile,
        cefrLevel: s.cefrLevel,
        provisional: s.provisional,
        cohort: s.cohortScope && s.cohortSize ? { scope: s.cohortScope as "ROLE" | "ALL", size: s.cohortSize } : null,
        traits: Array.isArray(details.traits) ? (details.traits as { trait: string; score: number }[]) : null,
        details,
      };
    })
    .sort((a, b) => TEST_ORDER.indexOf(a.testType) - TEST_ORDER.indexOf(b.testType));
}

/** "Top 25%" style wording for a percentile (percentile 80 = better than 80% = top 20%). */
export function topShare(percentile: number): number {
  return Math.max(1, Math.min(100, Math.round(100 - percentile)));
}

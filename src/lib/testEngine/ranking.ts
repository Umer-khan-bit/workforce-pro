import type { TestType } from "@prisma/client";
import { readSetting } from "@/lib/settings/store";
import type { Db } from "./context";
import { chooseCohort, percentileRank, quartileFor } from "./scoring";

export type Ranking = { percentile: number; quartile: 1 | 2 | 3 | 4; scope: "ROLE" | "ALL"; size: number };

/**
 * Ranks a candidate's value against other candidates' latest finished results for the same test:
 * the same job role if it has at least the "minimum candidates" from Settings, otherwise everyone.
 * Anonymised candidates and results still waiting for their writing grade are left out.
 * The candidate's own earlier attempts are replaced by the new value.
 */
export async function rankAgainstCohort(
  db: Db,
  args: { testType: TestType; candidateProfileId: string; jobRoleId: string | null; value: number }
): Promise<Ranking> {
  const [quartiles, scores] = await Promise.all([
    readSetting(db, "quartiles"),
    db.score.findMany({
      where: {
        testType: args.testType,
        rankValue: { not: null },
        provisional: false,
        candidateProfileId: { not: args.candidateProfileId },
        candidateProfile: { anonymisedAt: null },
      },
      orderBy: { computedAt: "desc" },
      distinct: ["candidateProfileId"],
      select: { rankValue: true, candidateProfile: { select: { jobRoleId: true } } },
    }),
  ]);

  const others = scores.map((s) => ({ value: s.rankValue as number, role: s.candidateProfile.jobRoleId }));
  const allValues = [...others.map((o) => o.value), args.value];
  const roleValues = args.jobRoleId ? [...others.filter((o) => o.role === args.jobRoleId).map((o) => o.value), args.value] : [args.value];

  const cohort = chooseCohort(roleValues, allValues, quartiles.minCohortSize);
  const percentile = percentileRank(args.value, cohort.values);
  return { percentile, quartile: quartileFor(percentile, quartiles), scope: cohort.scope, size: cohort.values.length };
}

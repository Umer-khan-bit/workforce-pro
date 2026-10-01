import type { Prisma, PrismaClient } from "@prisma/client";
import { RANKED_TESTS } from "@/lib/recruiter/search";
import { TEST_TITLES } from "@/lib/testEngine/labels";
import { candidatesByCity, candidatesByRole, quartileDistribution, type Slice } from "./candidates";

type Db = Pick<PrismaClient, "candidateProfile" | "score" | "jobRole" | "payment" | "company" | "subscription" | "user" | "jobOpening" | "shortlist">;

export type PoolReport = { city: Slice[]; role: Slice[]; quartiles: { test: string; slices: Slice[] }[] };

/** Candidates by city and role, and the quartile spread of each ranked test, for any group of candidates (a "where" on candidate profiles). */
export async function poolReport(db: Db, where: Prisma.CandidateProfileWhereInput): Promise<PoolReport> {
  const [city, role, quartiles] = await Promise.all([
    candidatesByCity(db, where),
    candidatesByRole(db, where),
    Promise.all(RANKED_TESTS.map(async (t) => ({ test: TEST_TITLES[t], slices: await quartileDistribution(db, t, where) }))),
  ]);
  return { city, role, quartiles };
}

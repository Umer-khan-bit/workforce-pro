import type { Prisma, PrismaClient, TestType } from "@prisma/client";

export type Slice = { label: string; value: number };

type Db = Pick<PrismaClient, "candidateProfile" | "score" | "jobRole" | "payment" | "company" | "subscription" | "user" | "jobOpening" | "shortlist">;

/** Candidates the platform counts: real accounts only (deleted accounts are anonymised and left out). */
export const REAL_CANDIDATES: Prisma.CandidateProfileWhereInput = { anonymisedAt: null };

/** Largest groups first; everything beyond the top `top` is added up as "Other". */
export function topWithOther(slices: Slice[], top: number): Slice[] {
  const sorted = [...slices].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  if (sorted.length <= top) return sorted;
  const rest = sorted.slice(top).reduce((sum, s) => sum + s.value, 0);
  return [...sorted.slice(0, top), { label: "Other", value: rest }];
}

export async function candidatesByCity(db: Db, where: Prisma.CandidateProfileWhereInput, top = 8): Promise<Slice[]> {
  const groups = await db.candidateProfile.groupBy({ by: ["city"], where, _count: { _all: true } });
  return topWithOther(groups.map((g) => ({ label: g.city ?? "Not given", value: g._count._all })), top);
}

export async function candidatesByRole(db: Db, where: Prisma.CandidateProfileWhereInput): Promise<Slice[]> {
  const [groups, roles] = await Promise.all([db.candidateProfile.groupBy({ by: ["jobRoleId"], where, _count: { _all: true } }), db.jobRole.findMany({ select: { id: true, name: true } })]);
  const names = new Map(roles.map((r) => [r.id, r.name]));
  return groups.map((g) => ({ label: g.jobRoleId ? (names.get(g.jobRoleId) ?? "Unknown") : "Not given", value: g._count._all })).sort((a, b) => b.value - a.value);
}

/** How many candidates are in each quartile for one test, using each candidate's latest finished result. */
export async function quartileDistribution(db: Db, testType: TestType, where: Prisma.CandidateProfileWhereInput = REAL_CANDIDATES): Promise<Slice[]> {
  const scores = await db.score.findMany({
    where: { testType, provisional: false, voidedAt: null, quartile: { not: null }, candidateProfile: where },
    orderBy: { computedAt: "desc" },
    distinct: ["candidateProfileId"],
    select: { quartile: true },
  });
  return [1, 2, 3, 4].map((q) => ({ label: `Q${q}`, value: scores.filter((s) => s.quartile === q).length }));
}

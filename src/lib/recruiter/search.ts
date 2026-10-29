import type { CefrLevel, Prisma, PrismaClient, TestType } from "@prisma/client";
import { candidateIntegrity, type CandidateIntegrity } from "@/lib/integrity/summary";
import { meetsTopPerformerRule, type TopPerformerRule } from "@/lib/results/topPerformer";
import { RECRUITER_CANDIDATE_SELECT, recruiterVisibleWhere } from "./candidateAccess";
import { RANKED_TESTS, SORTS, type RankedTest, type SearchFilters, type SearchSort } from "./searchTypes";

export { RANKED_TESTS, SORTS };
export type { RankedTest, SearchSort, SearchFilters };

export type ResultRow = { testType: TestType; quartile: number | null; percentile: number | null; cefrLevel: CefrLevel | null };

export type CandidateRow = {
  id: string;
  name: string | null;
  city: string | null;
  jobRole: string | null;
  experienceYears: number | null;
  quartiles: Partial<Record<TestType, number | null>>;
  percentiles: Partial<Record<TestType, number | null>>;
  cefrLevel: CefrLevel | null;
  /** Mean percentile over the tests the top-performer rule counts, 0 to 100; null when none of them are taken. */
  overall: number | null;
  topPerformer: boolean;
  /** Window exits (counts only), filled in by the search; see `candidateIntegrity`. */
  integrity?: CandidateIntegrity;
};

type ProfileLite = { id: string; city: string | null; experienceYears: number | null; jobRole: { name: string } | null; user: { name: string | null } };

/** Builds the rows from profiles and their latest ranked results. Pure, so it is easy to test. */
export function buildRows(profiles: ProfileLite[], results: Map<string, ResultRow[]>, rule: TopPerformerRule): CandidateRow[] {
  return profiles.map((p) => {
    const rs = results.get(p.id) ?? [];
    const quartiles: CandidateRow["quartiles"] = {};
    const percentiles: CandidateRow["percentiles"] = {};
    let cefr: CefrLevel | null = null;
    for (const r of rs) {
      quartiles[r.testType] = r.quartile;
      percentiles[r.testType] = r.percentile;
      if (r.testType === "LANGUAGE") cefr = r.cefrLevel;
    }
    const counted = rule.countedTests.map((t) => percentiles[t]).filter((v): v is number => typeof v === "number");
    return {
      id: p.id,
      name: p.user.name,
      city: p.city,
      jobRole: p.jobRole?.name ?? null,
      experienceYears: p.experienceYears,
      quartiles,
      percentiles,
      cefrLevel: cefr,
      overall: counted.length ? Math.round((counted.reduce((a, b) => a + b, 0) / counted.length) * 10) / 10 : null,
      topPerformer: meetsTopPerformerRule(quartiles, rule),
    };
  });
}

/** Keeps the rows that pass the test-result filters (quartile per test). */
export function filterRows(rows: CandidateRow[], filters: SearchFilters): CandidateRow[] {
  return rows.filter((r) => {
    for (const test of RANKED_TESTS) {
      const max = filters.quartiles?.[test];
      if (max === undefined) continue;
      const q = r.quartiles[test];
      if (typeof q !== "number" || q > max) return false;
    }
    if (filters.noIntegrityConcerns && r.integrity?.level === "concern") return false;
    return !filters.topPerformersOnly || r.topPerformer;
  });
}

const SORT_TEST: Record<Exclude<SearchSort, "overall" | "experience">, TestType> = { iq: "IQ", eq: "EQ", language: "LANGUAGE", skill: "SKILL" };

/** Best first; candidates without the value come last; ties keep a stable order. */
export function sortRows(rows: CandidateRow[], sort: SearchSort): CandidateRow[] {
  const value = (r: CandidateRow): number | null => {
    if (sort === "overall") return r.overall;
    if (sort === "experience") return r.experienceYears;
    return r.percentiles[SORT_TEST[sort]] ?? null;
  };
  return [...rows].sort((a, b) => {
    const [x, y] = [value(a), value(b)];
    if (x === null && y === null) return a.id.localeCompare(b.id);
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x || a.id.localeCompare(b.id);
  });
}

export type SearchArgs = {
  /** What the recruiter can pay: the minimum-salary rule is applied against this. */
  offerMax: number;
  filters: SearchFilters;
  sort: SearchSort;
  page: number;
  pageSize: number;
  poolLimit: number;
  rule: TopPerformerRule;
  /** From the plan: may this recruiter see Top Performers? */
  canSeeTopPerformers: boolean;
};

export type SearchResult = {
  rows: CandidateRow[];
  total: number;
  page: number;
  pages: number;
  /** Top Performers that match the filters but are held back by the plan (a count only). */
  hiddenTopPerformers: number;
  /** True when more candidates matched the profile filters than the search pool allows. */
  poolTruncated: boolean;
};

type Db = Pick<PrismaClient, "candidateProfile" | "score" | "auditLog" | "siteSetting" | "integrityReview">;

/** The profile-level part of a search, always starting from the minimum-salary rule. */
export function profileWhere(offerMax: number, filters: SearchFilters): Prisma.CandidateProfileWhereInput {
  const and: Prisma.CandidateProfileWhereInput[] = [recruiterVisibleWhere(offerMax)];
  if (filters.jobRoleId) and.push({ jobRoleId: filters.jobRoleId });
  if (filters.city) and.push({ city: { equals: filters.city, mode: "insensitive" } });
  if (filters.minExperience !== undefined) and.push({ experienceYears: { gte: filters.minExperience } });
  if (filters.maxExperience !== undefined) and.push({ experienceYears: { lte: filters.maxExperience } });
  return { AND: and };
}

/** The latest finished ranked result per test for each of the given candidates. */
export async function loadLatestResults(db: Pick<PrismaClient, "score">, profileIds: string[]): Promise<Map<string, ResultRow[]>> {
  const out = new Map<string, ResultRow[]>();
  if (profileIds.length === 0) return out;
  const scores = await db.score.findMany({
    where: { candidateProfileId: { in: profileIds }, provisional: false, voidedAt: null, quartile: { not: null } },
    orderBy: { computedAt: "desc" },
    distinct: ["candidateProfileId", "testType"],
    select: { candidateProfileId: true, testType: true, quartile: true, percentile: true, cefrLevel: true },
  });
  for (const s of scores) {
    const list = out.get(s.candidateProfileId) ?? [];
    list.push({ testType: s.testType, quartile: s.quartile, percentile: s.percentile, cefrLevel: s.cefrLevel });
    out.set(s.candidateProfileId, list);
  }
  return out;
}

/**
 * Recruiter candidate search. Every query starts from `recruiterVisibleWhere(offerMax)` (the minimum-salary
 * rule), then adds the profile filters; test-result filters, plan limits on Top Performers, sorting and
 * paging follow. Recruiters get a limited view of each candidate (no minimum salary, phone or email).
 */
export async function searchCandidates(db: Db, args: SearchArgs): Promise<SearchResult> {
  const where = profileWhere(args.offerMax, args.filters);
  const profiles = await db.candidateProfile.findMany({
    where,
    select: RECRUITER_CANDIDATE_SELECT,
    orderBy: { id: "asc" },
    take: args.poolLimit + 1,
  });
  const poolTruncated = profiles.length > args.poolLimit;
  const pool = poolTruncated ? profiles.slice(0, args.poolLimit) : profiles;

  const results = await loadLatestResults(db, pool.map((p) => p.id));
  const integrity = await candidateIntegrity(db, pool.map((p) => p.id));
  const rows = buildRows(pool, results, args.rule).map((r) => ({ ...r, integrity: integrity.get(r.id) ?? { exits: 0, level: "none" as const, perTest: [] } }));
  const matching = filterRows(rows, args.filters);

  // The plan decides whether Top Performers can be seen at all.
  const hiddenTopPerformers = args.canSeeTopPerformers ? 0 : matching.filter((r) => r.topPerformer).length;
  const visible = args.canSeeTopPerformers ? matching : matching.filter((r) => !r.topPerformer);

  const sorted = sortRows(visible, args.sort);
  const pages = Math.max(1, Math.ceil(sorted.length / args.pageSize));
  const page = Math.min(Math.max(1, args.page), pages);
  return { rows: sorted.slice((page - 1) * args.pageSize, page * args.pageSize), total: sorted.length, page, pages, hiddenTopPerformers, poolTruncated };
}

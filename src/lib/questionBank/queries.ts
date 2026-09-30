import type { Prisma, PrismaClient } from "@prisma/client";
import {
  PAGE_SIZE,
  TEST_TYPES,
  type ListFilters,
  type TestTypeValue,
} from "./schema";

export function buildQuestionWhere(f: ListFilters): Prisma.QuestionWhereInput {
  const where: Prisma.QuestionWhereInput = {};
  if (f.q) {
    where.OR = [
      { content: { contains: f.q, mode: "insensitive" } },
      { topic: { contains: f.q, mode: "insensitive" } },
    ];
  }
  if (f.testType) where.testType = f.testType;
  if (f.jobRoleId) where.jobRoleId = f.jobRoleId;
  if (f.languageId) where.languageId = f.languageId;
  if (f.difficulty) where.difficulty = f.difficulty;
  if (f.status === "FLAGGED") {
    // "Flagged" is not a status: the self-learning job sets a marker on the item statistics.
    where.itemStatistic = { is: { flagged: true } };
  } else if (f.status) {
    where.status = f.status;
  }
  return where;
}

export async function listQuestions(prisma: PrismaClient, filters: ListFilters) {
  const where = buildQuestionWhere(filters);
  const [total, rows] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        testType: true,
        type: true,
        content: true,
        topic: true,
        difficulty: true,
        status: true,
        reverseKeyed: true,
        jobRole: { select: { name: true } },
        language: { select: { name: true } },
        itemStatistic: { select: { flagged: true } },
      },
    }),
  ]);
  return { total, rows };
}

export type Coverage = {
  byStatus: Array<{
    testType: TestTypeValue;
    approved: number;
    pending: number;
    retired: number;
    flagged: number;
    total: number;
  }>;
  languages: Array<{ id: string | null; name: string }>;
  /** Approved counts: testType -> languageId ("none" when unset) -> count */
  approvedByLanguage: Record<string, Record<string, number>>;
  roles: Array<{ id: string; name: string; approved: number }>;
};

export const NO_LANGUAGE = "none";

export async function getCoverage(prisma: PrismaClient): Promise<Coverage> {
  const [statusGroups, languageGroups, roleGroups, languages, jobRoles, flaggedRows] =
    await Promise.all([
      prisma.question.groupBy({ by: ["testType", "status"], _count: { _all: true } }),
      prisma.question.groupBy({
        by: ["testType", "languageId"],
        where: { status: "APPROVED" },
        _count: { _all: true },
      }),
      prisma.question.groupBy({
        by: ["jobRoleId"],
        where: { status: "APPROVED", testType: "SKILL" },
        _count: { _all: true },
      }),
      prisma.language.findMany({ orderBy: { name: "asc" } }),
      prisma.jobRole.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      prisma.question.findMany({
        where: { itemStatistic: { is: { flagged: true } } },
        select: { testType: true },
      }),
    ]);

  const flaggedByTest = new Map<string, number>();
  for (const r of flaggedRows) flaggedByTest.set(r.testType, (flaggedByTest.get(r.testType) ?? 0) + 1);

  const byStatus = TEST_TYPES.map((testType) => {
    const count = (status: string) =>
      statusGroups.find((g) => g.testType === testType && g.status === status)?._count._all ?? 0;
    const total = statusGroups
      .filter((g) => g.testType === testType)
      .reduce((sum, g) => sum + g._count._all, 0);
    return {
      testType,
      approved: count("APPROVED"),
      pending: count("PENDING_APPROVAL"),
      retired: count("RETIRED"),
      flagged: flaggedByTest.get(testType) ?? 0,
      total,
    };
  });

  const approvedByLanguage: Coverage["approvedByLanguage"] = {};
  for (const t of TEST_TYPES) approvedByLanguage[t] = {};
  for (const g of languageGroups) {
    approvedByLanguage[g.testType][g.languageId ?? NO_LANGUAGE] = g._count._all;
  }

  const roles = jobRoles.map((r) => ({
    id: r.id,
    name: r.name,
    approved: roleGroups.find((g) => g.jobRoleId === r.id)?._count._all ?? 0,
  }));

  return {
    byStatus,
    languages: languages.map((l) => ({ id: l.id, name: l.name })),
    approvedByLanguage,
    roles,
  };
}

export type CoverageLevel = "gap" | "low" | "ok";

export function coverageLevel(approved: number, target: number): CoverageLevel {
  if (approved <= 0) return "gap";
  return approved < target ? "low" : "ok";
}

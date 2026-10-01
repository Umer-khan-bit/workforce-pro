import type { Prisma, PrismaClient, TestType } from "@prisma/client";

export type Db = PrismaClient | Prisma.TransactionClient;

export const TEST_ORDER: TestType[] = ["PERSONALITY", "IQ", "EQ", "LANGUAGE", "SKILL"];

/** Adaptive (CAT) tests. Personality and EQ are fixed-length. Language adds a writing task after its CAT. */
export const ADAPTIVE_TESTS: TestType[] = ["IQ", "LANGUAGE", "SKILL"];
export const isAdaptive = (t: TestType) => ADAPTIVE_TESTS.includes(t);

export type Candidate = {
  userId: string;
  profileId: string;
  regionId: string | null;
  jobRoleId: string | null;
  verified: boolean;
};

/** The signed-in candidate's profile, or null if they are not a usable candidate (missing or anonymised). */
export async function loadCandidate(db: Db, userId: string): Promise<Candidate | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      isActive: true,
      emailVerified: true,
      candidateProfile: { select: { id: true, regionId: true, jobRoleId: true, anonymisedAt: true } },
    },
  });
  const p = user?.candidateProfile;
  if (!user?.isActive || user.role !== "CANDIDATE" || !p || p.anonymisedAt) return null;
  return { userId, profileId: p.id, regionId: p.regionId, jobRoleId: p.jobRoleId, verified: Boolean(user.emailVerified) };
}

export type TestLanguage = { id: string; name: string; isRtl: boolean };

/**
 * The language a candidate's tests are in: the primary language mapped to their region
 * (Settings > Roles, regions & languages), or the default language if the region has none.
 */
export async function resolveLanguage(db: Db, regionId: string | null): Promise<TestLanguage | null> {
  if (regionId) {
    const mapped = await db.regionLanguage.findFirst({
      where: { regionId, isPrimary: true, language: { isActive: true } },
      include: { language: true },
    });
    if (mapped) return { id: mapped.language.id, name: mapped.language.name, isRtl: mapped.language.isRtl };
  }
  const fallback = await db.language.findFirst({ where: { isDefault: true, isActive: true } });
  return fallback ? { id: fallback.id, name: fallback.name, isRtl: fallback.isRtl } : null;
}

/** Question types each test is built from. */
export const POOL_TYPES: Record<TestType, Array<"LIKERT" | "MCQ" | "SITUATIONAL_JUDGEMENT">> = {
  PERSONALITY: ["LIKERT"],
  EQ: ["LIKERT", "SITUATIONAL_JUDGEMENT"],
  IQ: ["MCQ"],
  LANGUAGE: ["MCQ"],
  SKILL: ["MCQ"],
};

function poolWhere(testType: TestType, languageId: string, jobRoleId: string | null, pretest: boolean): Prisma.QuestionWhereInput {
  return {
    testType,
    status: "APPROVED",
    isPretest: pretest,
    languageId,
    type: { in: POOL_TYPES[testType] },
    // Job-skill questions come from the candidate's selected role only.
    ...(testType === "SKILL" ? { jobRoleId } : {}),
  };
}

export type PoolItem = { id: string; a: number; b: number; topic: string | null };

/** Approved questions a test can serve. `pretest` picks the unscored calibration items instead. */
export async function loadPool(db: Db, testType: TestType, languageId: string, jobRoleId: string | null, pretest = false): Promise<PoolItem[]> {
  if (testType === "SKILL" && !jobRoleId) return [];
  const rows = await db.question.findMany({
    where: poolWhere(testType, languageId, jobRoleId, pretest),
    select: { id: true, aParam: true, bParam: true, topic: true },
    orderBy: { id: "asc" },
  });
  return rows.map((r) => ({ id: r.id, a: r.aParam, b: r.bParam, topic: r.topic }));
}

export async function loadWritingPrompts(db: Db, languageId: string): Promise<string[]> {
  const rows = await db.question.findMany({
    where: { testType: "LANGUAGE", type: "WRITING", status: "APPROVED", languageId },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return rows.map((r) => r.id);
}

export type Unavailable = { reason: string };

/**
 * Whether there are enough approved questions for this candidate to take the test. The test needs at
 * least its minimum number of items (and, for Language, a writing prompt).
 */
export async function checkPool(
  db: Db,
  testType: TestType,
  language: TestLanguage | null,
  jobRoleId: string | null,
  minItems: number
): Promise<Unavailable | null> {
  if (!language) return { reason: "No test language is set up for your region yet." };
  if (testType === "SKILL" && !jobRoleId) return { reason: "Choose your job role on your profile first." };
  const pool = await loadPool(db, testType, language.id, jobRoleId);
  if (pool.length < minItems) {
    return { reason: `Not available yet: there are not enough ${language.name} questions${testType === "SKILL" ? " for your job role" : ""}.` };
  }
  if (testType === "LANGUAGE" && (await loadWritingPrompts(db, language.id)).length === 0) {
    return { reason: `Not available yet: there is no ${language.name} writing task.` };
  }
  return null;
}

/** Serialises changes to one session (two tabs, double clicks) with a transaction-scoped database lock. */
export async function lockKey(tx: Prisma.TransactionClient, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

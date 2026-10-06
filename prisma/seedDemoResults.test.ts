import { afterEach, describe, expect, it, vi } from "vitest";
import { PrismaClient, type TestType } from "@prisma/client";
import { quartileFor } from "../src/lib/testEngine/scoring";
import { readSetting } from "../src/lib/settings/store";
import { meetsTopPerformerRule } from "../src/lib/results/topPerformer";
import { seedDemoResults } from "./seedDemoResults";
import { COURSES, seedDemoCourses } from "./seedDemoCourses";

describe("demo seeding guards", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("refuses to create demo results or courses unless DEMO_MODE is 'true'", async () => {
    const untouchable = new Proxy({}, { get: () => { throw new Error("database was touched"); } }) as unknown as PrismaClient;
    for (const value of ["false", "", "TRUE"]) {
      vi.stubEnv("DEMO_MODE", value);
      await expect(seedDemoResults(untouchable)).rejects.toThrow(/DEMO_MODE/);
      await expect(seedDemoCourses(untouchable)).rejects.toThrow(/DEMO_MODE/);
    }
  });
});

// The checks below read the demo data that `npm run prisma:seed` created. They are skipped on a database
// without it (for example a fresh one), and they only read: nothing here changes the database.
const prisma = new PrismaClient();
const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const seededCount = dbUp ? await prisma.testSession.count({ where: { resumeState: { path: ["seeded"], equals: true } } }) : 0;
const RANKED: TestType[] = ["IQ", "EQ", "LANGUAGE", "SKILL"];

describe.skipIf(!dbUp || seededCount === 0)("the demo results in the database", () => {
  const demoCandidates = () =>
    prisma.user.findMany({
      where: { role: "CANDIDATE", email: { endsWith: "@demo.test" }, candidateProfile: { is: { testSessions: { some: { resumeState: { path: ["seeded"], equals: true } } } } } },
      select: { email: true, candidateProfile: { select: { id: true, jobRoleId: true, scores: { select: { testType: true, quartile: true, percentile: true, cefrLevel: true, provisional: true, cohortSize: true, details: true, sessionId: true } } } } },
      orderBy: { email: "asc" },
    });

  it("gives every demo candidate Personality, IQ and EQ results", async () => {
    const users = await demoCandidates();
    expect(users.length).toBeGreaterThanOrEqual(60);
    for (const u of users) {
      const types = new Set(u.candidateProfile!.scores.map((s) => s.testType));
      for (const t of ["PERSONALITY", "IQ", "EQ"] as TestType[]) expect(types.has(t), `${u.email} ${t}`).toBe(true);
    }
  });

  it("spreads the ranked results across all four quartiles", async () => {
    const users = await demoCandidates();
    for (const test of RANKED) {
      const counts = [1, 2, 3, 4].map((q) => users.filter((u) => u.candidateProfile!.scores.some((s) => s.testType === test && s.quartile === q)).length);
      for (const [i, n] of counts.entries()) expect(n, `${test} Q${i + 1}`).toBeGreaterThanOrEqual(5);
    }
  });

  it("ranks consistently with the quartile settings, and labels the group each rank is based on", async () => {
    const quartiles = await readSetting(prisma, "quartiles");
    const users = await demoCandidates();
    for (const u of users) {
      for (const s of u.candidateProfile!.scores) {
        if (s.testType === "PERSONALITY") {
          expect([s.quartile, s.percentile]).toEqual([null, null]); // no ranking for Personality
          continue;
        }
        if (!s.percentile || s.provisional) continue;
        expect(s.quartile, `${u.email} ${s.testType}`).toBe(quartileFor(s.percentile, quartiles));
        expect(s.cohortSize).toBeGreaterThan(0);
      }
    }
  });

  it("gives Language results a CEFR level with a graded writing sample", async () => {
    const lang = await prisma.score.findMany({ where: { testType: "LANGUAGE", details: { path: ["seeded"], equals: true } }, include: { session: { include: { writingAssessment: true } } } });
    expect(lang.length).toBeGreaterThan(30);
    for (const s of lang) {
      expect(s.cefrLevel).not.toBeNull();
      expect(s.session.writingAssessment?.gradedAt).not.toBeNull();
      expect(s.session.writingAssessment?.cefrLevel).toBe(s.cefrLevel);
    }
  });

  it("keeps the demo login free to take Language and Job skill live, and makes no answer rows", async () => {
    // (Only the seeded results are checked: she may have taken the other tests live since.)
    const ayesha = await prisma.user.findUniqueOrThrow({ where: { email: "candidate@demo.test" }, select: { candidateProfile: { select: { id: true, scores: { where: { details: { path: ["seeded"], equals: true } }, select: { testType: true } } } } } });
    expect(ayesha.candidateProfile!.scores.map((s) => s.testType).sort()).toEqual(["EQ", "IQ", "PERSONALITY"]);
    const seededSessions = await prisma.testSession.findMany({ where: { resumeState: { path: ["seeded"], equals: true } }, select: { id: true } });
    expect(await prisma.response.count({ where: { sessionId: { in: seededSessions.map((s) => s.id) } } })).toBe(0);
  });

  it("awards the Top Performer badge to exactly the candidates who meet the rule in Settings", async () => {
    const rule = await readSetting(prisma, "topPerformer");
    const users = await demoCandidates();
    const holders = new Set((await prisma.badge.findMany({ where: { type: "TOP_PERFORMER_ALL_TESTS" }, select: { candidateProfileId: true } })).map((b) => b.candidateProfileId));
    let meeting = 0;
    for (const u of users) {
      const scores = u.candidateProfile!.scores;
      if (scores.some((s) => (s.details as { seeded?: boolean } | null)?.seeded !== true)) continue; // took a test live since the seed
      const q = Object.fromEntries(scores.map((s) => [s.testType, s.quartile])) as Partial<Record<TestType, number | null>>;
      const meets = meetsTopPerformerRule(q, rule);
      if (meets) meeting++;
      expect(holders.has(u.candidateProfile!.id), u.email).toBe(meets);
    }
    expect(meeting).toBeGreaterThanOrEqual(3);
  });

  it("the starter catalogue has free and paid courses for every test and role", async () => {
    // Only the starter courses: other test files create and remove courses in the same database while this one runs.
    const courses = await prisma.course.findMany({ where: { title: { in: COURSES.map((c) => c.title) } }, include: { _count: { select: { lessons: true } } } });
    expect(courses.length).toBeGreaterThanOrEqual(10);
    expect(courses.some((c) => c.isFree)).toBe(true);
    expect(courses.some((c) => !c.isFree && c.price > 0)).toBe(true);
    for (const c of courses) expect(c._count.lessons).toBeGreaterThanOrEqual(1);
    for (const t of ["IQ", "EQ", "LANGUAGE", "SKILL"] as TestType[]) expect(courses.some((c) => c.testType === t), t).toBe(true);
  });
});

import type { PrismaClient, TestType } from "@prisma/client";
import { hashPassword } from "@/lib/password";
import { IPIP_50_ITEMS } from "@/lib/questionBank/ipipItems";

/**
 * Test helper (not used by the app): builds an isolated world in the database, with its own language,
 * region, job role and questions, so tests of the engine never touch or depend on the real question
 * bank. Everything it creates is removed by `cleanup()`. Used by the unit and end-to-end tests.
 */
export type Kit = Awaited<ReturnType<typeof createKit>>;

type McqSpec = { b?: number; a?: number; topic?: string | null; pretest?: boolean };

export async function createKit(prisma: PrismaClient, tag = "kit") {
  const run = `${tag}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const language = await prisma.language.create({ data: { name: `Test language ${run}`, code: run.slice(0, 40), isActive: true } });
  const region = await prisma.region.create({ data: { name: `Test region ${run}` } });
  await prisma.regionLanguage.create({ data: { regionId: region.id, languageId: language.id, isPrimary: true } });
  const role = await prisma.jobRole.create({ data: { name: `Test role ${run}` } });
  const otherRole = await prisma.jobRole.create({ data: { name: `Other role ${run}` } });

  const questionIds: string[] = [];
  const userIds: string[] = [];

  const options = [
    { key: "A", text: "Option A" },
    { key: "B", text: "Option B" },
    { key: "C", text: "Option C" },
    { key: "D", text: "Option D" },
  ];

  async function addMcq(testType: "IQ" | "SKILL" | "LANGUAGE", specs: McqSpec[], roleId: string | null = testType === "SKILL" ? role.id : null) {
    const ids: string[] = [];
    for (const [i, s] of specs.entries()) {
      const q = await prisma.question.create({
        data: {
          testType,
          type: "MCQ",
          content: `${run} ${testType} question ${i + 1}`,
          options,
          correctAnswer: "B",
          topic: s.topic === undefined ? `topic-${i % 4}` : s.topic,
          aParam: s.a ?? 1,
          bParam: s.b ?? 0,
          status: "APPROVED",
          isPretest: s.pretest ?? false,
          languageId: language.id,
          jobRoleId: roleId,
        },
      });
      ids.push(q.id);
    }
    questionIds.push(...ids);
    return ids;
  }

  /** `count` operational questions spread from easy to hard, plus `pretest` unscored ones. */
  async function addCatBank(testType: "IQ" | "SKILL" | "LANGUAGE", count = 40, pretest = 4) {
    const specs: McqSpec[] = Array.from({ length: count }, (_, i) => ({ b: -2 + (4 * i) / (count - 1), a: 1 + (i % 3) * 0.3 }));
    const ids = await addMcq(testType, specs);
    const pre = await addMcq(testType, Array.from({ length: pretest }, (_, i) => ({ b: i - 1, pretest: true })));
    return { ids, pretestIds: pre };
  }

  async function addWritingPrompts(n = 2) {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const q = await prisma.question.create({
        data: { testType: "LANGUAGE", type: "WRITING", content: `${run} Describe a problem you solved at work (${i + 1}).`, aParam: 1, bParam: 0, status: "APPROVED", languageId: language.id },
      });
      ids.push(q.id);
    }
    questionIds.push(...ids);
    return ids;
  }

  /** The 50 IPIP items in the test language, with the same traits and reverse-keying. */
  async function addPersonalityBank() {
    const ids: string[] = [];
    for (const item of IPIP_50_ITEMS) {
      const q = await prisma.question.create({
        data: { testType: "PERSONALITY", type: "LIKERT", content: `${run} ${item.content}`, topic: item.trait, reverseKeyed: item.reverse, aParam: 1, bParam: 0, status: "APPROVED", languageId: language.id },
      });
      ids.push(q.id);
    }
    questionIds.push(...ids);
    return ids;
  }

  /** `count` EQ items: a mix of Likert statements and situational-judgement items over a few dimensions. */
  async function addEqBank(count = 30) {
    const dims = ["Self-awareness", "Self-regulation", "Empathy", "Social skills"];
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const sj = i % 5 < 2;
      const q = await prisma.question.create({
        data: {
          testType: "EQ",
          type: sj ? "SITUATIONAL_JUDGEMENT" : "LIKERT",
          content: `${run} EQ item ${i + 1}`,
          options: sj ? options : undefined,
          correctAnswer: sj ? "B" : null,
          topic: dims[i % dims.length],
          reverseKeyed: !sj && i % 4 === 1,
          aParam: 1,
          bParam: 0,
          status: "APPROVED",
          languageId: language.id,
        },
      });
      ids.push(q.id);
    }
    questionIds.push(...ids);
    return ids;
  }

  async function addCandidate(name: string, opts: { verified?: boolean; roleId?: string } = {}) {
    const user = await prisma.user.create({
      data: {
        email: `${name}-${run}@example.test`,
        name: `Pat ${run} ${name}`,
        password: await hashPassword("kit-password-1"),
        role: "CANDIDATE",
        emailVerified: opts.verified === false ? null : new Date(),
        candidateProfile: { create: { phone: "0300", city: "Lahore", regionId: region.id, jobRoleId: opts.roleId ?? role.id, experienceYears: 3, minimumSalary: 50000, consentGiven: true, consentAt: new Date() } },
      },
      include: { candidateProfile: true },
    });
    userIds.push(user.id);
    return { userId: user.id, profileId: user.candidateProfile!.id, email: user.email };
  }

  /** A finished result for cohort tests, without running a whole test. */
  async function addScore(profileId: string, testType: TestType, value: number, opts: { provisional?: boolean } = {}) {
    const session = await prisma.testSession.create({
      data: { candidateProfileId: profileId, testType, status: "COMPLETED", languageId: language.id, completedAt: new Date() },
    });
    await prisma.score.create({
      data: { candidateProfileId: profileId, sessionId: session.id, testType, rawScore: value, theta: value, rankValue: value, provisional: opts.provisional ?? false },
    });
  }

  async function cleanup() {
    const profiles = await prisma.candidateProfile.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    const profileIds = profiles.map((p) => p.id);
    const sessions = await prisma.testSession.findMany({ where: { candidateProfileId: { in: profileIds } }, select: { id: true } });
    const sessionIds = sessions.map((s) => s.id);
    // Things the app creates after a result (feedback, badges, notifications, course progress).
    await prisma.aIFeedback.deleteMany({ where: { candidateProfileId: { in: profileIds } } });
    await prisma.badge.deleteMany({ where: { candidateProfileId: { in: profileIds } } });
    await prisma.courseRecommendation.deleteMany({ where: { candidateProfileId: { in: profileIds } } });
    await prisma.lessonProgress.deleteMany({ where: { enrollment: { candidateProfileId: { in: profileIds } } } });
    await prisma.payment.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { enrollment: { candidateProfileId: { in: profileIds } } }] } });
    await prisma.enrollment.deleteMany({ where: { candidateProfileId: { in: profileIds } } });
    await prisma.contactRequest.deleteMany({ where: { candidateProfileId: { in: profileIds } } });
    const listed = await prisma.shortlist.findMany({ where: { candidateProfileId: { in: profileIds } }, select: { id: true } });
    await prisma.shortlistStatusHistory.deleteMany({ where: { shortlistId: { in: listed.map((x) => x.id) } } });
    await prisma.shortlist.deleteMany({ where: { id: { in: listed.map((x) => x.id) } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.writingAssessment.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.response.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.score.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.testSession.deleteMany({ where: { id: { in: sessionIds } } });
    // Also remove questions that tests created through the app (for example new versions of a question).
    const extra = await prisma.question.findMany({ where: { languageId: language.id }, select: { id: true } });
    const allQuestionIds = [...new Set([...questionIds, ...extra.map((q) => q.id)])];
    await prisma.itemStatistic.deleteMany({ where: { questionId: { in: allQuestionIds } } });
    await prisma.question.deleteMany({ where: { id: { in: allQuestionIds } } });
    await prisma.aiRun.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.authToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.rateLimitHit.deleteMany({ where: { key: { in: userIds.map((u) => `tests:${u}`) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.regionLanguage.deleteMany({ where: { regionId: region.id } });
    await prisma.region.delete({ where: { id: region.id } });
    await prisma.language.delete({ where: { id: language.id } });
    await prisma.jobRole.deleteMany({ where: { id: { in: [role.id, otherRole.id] } } });
  }

  return { run, language, region, role, otherRole, addMcq, addCatBank, addWritingPrompts, addPersonalityBank, addEqBank, addCandidate, addScore, cleanup };
}

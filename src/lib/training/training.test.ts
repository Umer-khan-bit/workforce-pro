import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TestType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ClaudeClient } from "@/lib/ai/claude";
import { createKit, type Kit } from "@/lib/testEngine/testkit";
import { startOrResume } from "@/lib/testEngine/session";
import { getPaymentProvider, PaymentsUnavailableError, SimulatedPaymentProvider, type PaymentProvider } from "@/lib/payments/provider";
import { enrolInFreeCourse, progressPercent, purchaseCourse, setLessonDone, TrainingError } from "./enrol";
import { eligibleCourses, findWeakAreas, rankCoursesByRules, recommendationsAreStale, refreshRecommendations, validateRecommendations, type CourseOption } from "./recommend";
import { trainingUnlocksRetake } from "./retake";
import type { LatestResult } from "@/lib/results/latest";

describe("progressPercent", () => {
  it("is the share of lessons finished, never above 100, and 0 for an empty course", () => {
    expect(progressPercent(0, 4)).toBe(0);
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(2, 3)).toBe(67);
    expect(progressPercent(4, 4)).toBe(100);
    expect(progressPercent(5, 4)).toBe(100);
    expect(progressPercent(0, 0)).toBe(0);
  });
});

describe("the payment provider", () => {
  it("uses the simulated gateway only in demo mode", () => {
    expect(getPaymentProvider({ DEMO_MODE: "true" })).toBeInstanceOf(SimulatedPaymentProvider);
    expect(() => getPaymentProvider({ DEMO_MODE: "false" })).toThrow(PaymentsUnavailableError);
    expect(() => getPaymentProvider({})).toThrow(PaymentsUnavailableError);
  });
  it("succeeds or fails as chosen, with a stable reference and no real charge", async () => {
    const p = new SimulatedPaymentProvider();
    const ok = await p.charge({ amount: 100, currency: "PKR", reference: "pay_abcdef12345678" });
    expect(ok).toMatchObject({ status: "SUCCESS", providerReference: "SIM-12345678" });
    const fail = await p.charge({ amount: 100, currency: "PKR", reference: "pay_abcdef12345678", simulate: "failure" });
    expect(fail.status).toBe("FAILED");
    expect(fail.failureReason).toMatch(/declined/);
  });
});

const result = (testType: TestType, quartile: number | null, over: Partial<LatestResult> = {}): LatestResult => ({
  scoreId: testType, sessionId: testType, testType, computedAt: new Date(), rawScore: 50, percentile: quartile === null ? null : 100 - quartile * 25 + 10, quartile, cefrLevel: null, provisional: false, cohort: null, traits: null, details: {}, ...over,
});
const course = (id: string, testType: TestType | null, over: Partial<CourseOption> = {}): CourseOption => ({ id, title: id, description: null, testType, isFree: true, price: 0, ...over });

describe("weak areas and rule-based recommendations", () => {
  it("finds results at or below the quartile in Settings, worst first, and never Personality", () => {
    const weak = findWeakAreas([result("IQ", 3), result("EQ", 4), result("LANGUAGE", 1), result("SKILL", 2), result("PERSONALITY", null)], 3);
    expect(weak.map((w) => [w.testType, w.quartile])).toEqual([["EQ", 4], ["IQ", 3]]);
    expect(findWeakAreas([result("IQ", 3)], 4)).toEqual([]);
    expect(findWeakAreas([result("IQ", 4, { provisional: true })], 3)).toEqual([]);
  });

  it("recommends courses for the worst area first, free before paid, and only for weak areas", () => {
    const weak = findWeakAreas([result("IQ", 3), result("EQ", 4)], 3);
    const recs = rankCoursesByRules([course("iq-paid", "IQ", { isFree: false, price: 500 }), course("iq-free", "IQ"), course("eq-paid", "EQ", { isFree: false, price: 900 }), course("lang", "LANGUAGE"), course("general", null)], weak, 10);
    expect(recs.map((r) => r.courseId)).toEqual(["eq-paid", "iq-free", "iq-paid"]);
    expect(recs[0].reason).toMatch(/EQ result \(Q4\)/);
    expect(rankCoursesByRules([course("a", "IQ"), course("b", "IQ")], weak, 1)).toHaveLength(1);
  });

  it("never trusts ids Claude was not given, and drops repeats", () => {
    const out = validateRecommendations([{ courseId: "x", reason: "bad" }, { courseId: "a", reason: "ok" }, { courseId: "a", reason: "again" }, { courseId: "b", reason: "ok" }, { courseId: "c", reason: "too many" }], new Set(["a", "b", "c"]), 2);
    expect(out).toEqual([{ courseId: "a", reason: "ok" }, { courseId: "b", reason: "ok" }]);
  });
});

describe("retaking after training", () => {
  it("is switched off by the setting", async () => {
    const off = { enrollment: { count: async () => 1 }, siteSetting: { findUnique: async () => ({ value: { skipWaitAfterCourse: "no" } }) } };
    expect(await trainingUnlocksRetake(off as never, "p", "IQ", new Date())).toBe(false);
  });
});

const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

function claudeReply(json: unknown) {
  const create = vi.fn().mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(json) }], usage: { input_tokens: 300, output_tokens: 90 } });
  return { client: { messages: { create } } as unknown as ClaudeClient, create };
}

describe.skipIf(!dbUp)("courses, payments, progress and recommendations (real database)", () => {
  let kit: Kit;
  const courseIds: string[] = [];

  beforeAll(async () => {
    kit = await createKit(prisma, "trn");
    await kit.addCatBank("IQ", 40, 0);
  }, 60_000);

  afterAll(async () => {
    await prisma.lessonProgress.deleteMany({ where: { lesson: { courseId: { in: courseIds } } } });
    await prisma.payment.deleteMany({ where: { courseId: { in: courseIds } } });
    await prisma.enrollment.deleteMany({ where: { courseId: { in: courseIds } } });
    await prisma.courseRecommendation.deleteMany({ where: { courseId: { in: courseIds } } });
    await prisma.courseLesson.deleteMany({ where: { courseId: { in: courseIds } } });
    await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
    await kit.cleanup();
  }, 60_000);

  async function makeCourse(title: string, over: { price?: number; testType?: TestType | null; roleId?: string | null; lessons?: number; isActive?: boolean } = {}) {
    const c = await prisma.course.create({
      data: {
        title: `${title} ${kit.run}`,
        isFree: !over.price,
        price: over.price ?? 0,
        testType: over.testType === undefined ? null : over.testType,
        jobRoleId: over.roleId === undefined ? null : over.roleId,
        isActive: over.isActive ?? true,
        lessons: { create: Array.from({ length: over.lessons ?? 3 }, (_, i) => ({ title: `Lesson ${i + 1}`, content: "Text", order: i + 1 })) },
      },
      include: { lessons: { orderBy: { order: "asc" } } },
    });
    courseIds.push(c.id);
    return c;
  }
  const notes = (userId: string) => prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const enrollmentOf = (profileId: string, courseId: string) => prisma.enrollment.findUnique({ where: { candidateProfileId_courseId: { candidateProfileId: profileId, courseId } } });

  describe("joining a free course", () => {
    it("creates the enrolment, an audit entry and an in-app notification", async () => {
      const c = await kit.addCandidate("free");
      const course = await makeCourse("Free course");
      const e = await enrolInFreeCourse(prisma, c.userId, course.id);
      expect(e).toMatchObject({ status: "NOT_STARTED", progressPercent: 0 });
      expect((await notes(c.userId))[0]).toMatchObject({ type: "TRAINING_UPDATE", link: `/candidate/training/${course.id}` });
      expect((await notes(c.userId))[0].title).toContain("You joined");
      expect(await prisma.auditLog.count({ where: { actorId: c.userId, action: "COURSE_ENROLLED" } })).toBe(1);
    });

    it("cannot be done twice, or for a paid course, an inactive course or another role's course", async () => {
      const c = await kit.addCandidate("limits");
      const free = await makeCourse("Twice");
      await enrolInFreeCourse(prisma, c.userId, free.id);
      await expect(enrolInFreeCourse(prisma, c.userId, free.id)).rejects.toMatchObject({ status: 409, code: "ALREADY_ENROLLED" });
      const paid = await makeCourse("Paid", { price: 500 });
      await expect(enrolInFreeCourse(prisma, c.userId, paid.id)).rejects.toMatchObject({ status: 402, code: "PAYMENT_REQUIRED" });
      const inactive = await makeCourse("Inactive", { isActive: false });
      await expect(enrolInFreeCourse(prisma, c.userId, inactive.id)).rejects.toMatchObject({ status: 404 });
      const otherRole = await makeCourse("Other role", { roleId: kit.otherRole.id });
      await expect(enrolInFreeCourse(prisma, c.userId, otherRole.id)).rejects.toMatchObject({ status: 404 });
      const mine = await makeCourse("My role", { roleId: kit.role.id });
      await expect(enrolInFreeCourse(prisma, c.userId, mine.id)).resolves.toBeTruthy();
    });

    it("is for candidates only", async () => {
      const admin = await prisma.user.findFirstOrThrow({ where: { role: "PLATFORM_ADMIN" } });
      const course = await makeCourse("Roles");
      await expect(enrolInFreeCourse(prisma, admin.id, course.id)).rejects.toBeInstanceOf(TrainingError);
    });
  });

  describe("buying a paid course", () => {
    it("a successful payment enrols the candidate and links the payment", async () => {
      const c = await kit.addCandidate("buy");
      const course = await makeCourse("Paid ok", { price: 2500 });
      const r = await purchaseCourse(prisma, c.userId, course.id, { provider: new SimulatedPaymentProvider() });
      expect(r.status).toBe("SUCCESS");
      if (r.status !== "SUCCESS") return;
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: r.paymentId } });
      expect(payment).toMatchObject({ purpose: "COURSE", status: "SUCCESS", amount: 2500, courseId: course.id, userId: c.userId, enrollmentId: r.enrollmentId, provider: "simulated" });
      expect(payment.providerReference).toMatch(/^SIM-/);
      expect(payment.currency).toMatch(/^[A-Z]{3}$/);
      expect(await enrollmentOf(c.profileId, course.id)).not.toBeNull();
      expect((await notes(c.userId)).some((n) => n.title.includes("You joined"))).toBe(true);
      expect(await prisma.auditLog.count({ where: { actorId: c.userId, action: "COURSE_PURCHASED" } })).toBe(1);
    });

    it("a failed payment is recorded, enrols nobody and can be retried", async () => {
      const c = await kit.addCandidate("buyfail");
      const course = await makeCourse("Paid fail", { price: 1800 });
      const provider = new SimulatedPaymentProvider();
      const failed = await purchaseCourse(prisma, c.userId, course.id, { provider, simulate: "failure" });
      expect(failed.status).toBe("FAILED");
      expect(await enrollmentOf(c.profileId, course.id)).toBeNull();
      const payment = await prisma.payment.findFirstOrThrow({ where: { userId: c.userId, courseId: course.id } });
      expect(payment).toMatchObject({ status: "FAILED", enrollmentId: null });
      expect(await notes(c.userId)).toHaveLength(0);

      const retry = await purchaseCourse(prisma, c.userId, course.id, { provider });
      expect(retry.status).toBe("SUCCESS");
      expect(await prisma.payment.count({ where: { userId: c.userId, courseId: course.id } })).toBe(2);
    });

    it("refuses a free course, a course already joined, and runs no charge when payments are unavailable", async () => {
      const c = await kit.addCandidate("buyedge");
      const free = await makeCourse("Free here");
      await expect(purchaseCourse(prisma, c.userId, free.id, { provider: new SimulatedPaymentProvider() })).rejects.toMatchObject({ code: "COURSE_IS_FREE" });
      const paid = await makeCourse("Paid edge", { price: 900 });
      const charge = vi.fn();
      const provider: PaymentProvider = { name: "test", charge };
      charge.mockResolvedValue({ status: "SUCCESS", providerReference: "T-1" });
      await purchaseCourse(prisma, c.userId, paid.id, { provider });
      await expect(purchaseCourse(prisma, c.userId, paid.id, { provider })).rejects.toMatchObject({ code: "ALREADY_ENROLLED" });
      expect(charge).toHaveBeenCalledTimes(1); // the second attempt never reached the gateway

      const other = await kit.addCandidate("buyoffline");
      const prev = process.env.DEMO_MODE;
      process.env.DEMO_MODE = "false";
      try {
        await expect(purchaseCourse(prisma, other.userId, paid.id)).rejects.toMatchObject({ status: 503, code: "PAYMENTS_UNAVAILABLE" });
      } finally {
        process.env.DEMO_MODE = prev;
      }
      expect(await prisma.payment.count({ where: { userId: other.userId } })).toBe(0);
    });
  });

  describe("lesson progress", () => {
    it("tracks progress, completes the course on the last lesson and notifies the candidate", async () => {
      const c = await kit.addCandidate("progress");
      const course = await makeCourse("Progress", { lessons: 3 });
      await enrolInFreeCourse(prisma, c.userId, course.id);
      const [l1, l2, l3] = course.lessons;

      expect(await setLessonDone(prisma, c.userId, l1.id, true)).toEqual({ progressPercent: 33, status: "IN_PROGRESS" });
      expect(await setLessonDone(prisma, c.userId, l2.id, true)).toEqual({ progressPercent: 67, status: "IN_PROGRESS" });
      expect(await setLessonDone(prisma, c.userId, l2.id, false)).toEqual({ progressPercent: 33, status: "IN_PROGRESS" });
      await setLessonDone(prisma, c.userId, l2.id, true);
      expect(await setLessonDone(prisma, c.userId, l3.id, true)).toEqual({ progressPercent: 100, status: "COMPLETED" });
      expect((await enrollmentOf(c.profileId, course.id))?.completedAt).not.toBeNull();
      expect((await notes(c.userId)).filter((n) => n.title.includes("You completed"))).toHaveLength(1);

      // Ticking the same lesson again must not announce completion twice.
      await setLessonDone(prisma, c.userId, l3.id, true);
      expect((await notes(c.userId)).filter((n) => n.title.includes("You completed"))).toHaveLength(1);
      // Un-ticking reopens the course.
      expect(await setLessonDone(prisma, c.userId, l3.id, false)).toEqual({ progressPercent: 67, status: "IN_PROGRESS" });
      expect((await enrollmentOf(c.profileId, course.id))?.completedAt).toBeNull();
    });

    it("only works inside the candidate's own enrolment", async () => {
      const a = await kit.addCandidate("progA");
      const b = await kit.addCandidate("progB");
      const course = await makeCourse("Private progress", { lessons: 1 });
      await enrolInFreeCourse(prisma, a.userId, course.id);
      await expect(setLessonDone(prisma, b.userId, course.lessons[0].id, true)).rejects.toMatchObject({ status: 403, code: "NOT_ENROLLED" });
      await expect(setLessonDone(prisma, a.userId, "no-such-lesson", true)).rejects.toMatchObject({ status: 404 });
      expect((await enrollmentOf(a.profileId, course.id))?.progressPercent).toBe(0);
    });
  });

  describe("retaking a test after training", () => {
    async function finishedIq(profileId: string, completedAt: Date) {
      const s = await prisma.testSession.create({ data: { candidateProfileId: profileId, testType: "IQ", status: "COMPLETED", languageId: kit.language.id, completedAt, startedAt: completedAt } });
      await prisma.score.create({ data: { candidateProfileId: profileId, sessionId: s.id, testType: "IQ", rawScore: 40, theta: -0.4, rankValue: -0.4, quartile: 4, percentile: 20, computedAt: completedAt } });
    }

    it("waits normally, but a course finished after the attempt lets the candidate retake at once", async () => {
      const c = await kit.addCandidate("retake");
      await finishedIq(c.profileId, new Date());
      await expect(startOrResume({ prisma }, c.userId, "IQ")).rejects.toMatchObject({ code: "RETAKE_LATER" });

      const course = await makeCourse("IQ course", { testType: "IQ", lessons: 1 });
      await enrolInFreeCourse(prisma, c.userId, course.id);
      await new Promise((r) => setTimeout(r, 15));
      await setLessonDone(prisma, c.userId, course.lessons[0].id, true);
      expect((await startOrResume({ prisma }, c.userId, "IQ")).resumed).toBe(false);
    });

    it("does not unlock a retake for a course finished before the attempt, or for another test", async () => {
      const c = await kit.addCandidate("noretake");
      const iqCourse = await makeCourse("Old IQ course", { testType: "IQ", lessons: 1 });
      await prisma.enrollment.create({ data: { candidateProfileId: c.profileId, courseId: iqCourse.id, status: "COMPLETED", progressPercent: 100, completedAt: new Date(Date.now() - 86_400_000) } });
      await finishedIq(c.profileId, new Date());
      await expect(startOrResume({ prisma }, c.userId, "IQ")).rejects.toMatchObject({ code: "RETAKE_LATER" });

      const eqCourse = await makeCourse("EQ course", { testType: "EQ", lessons: 1 });
      await enrolInFreeCourse(prisma, c.userId, eqCourse.id);
      await setLessonDone(prisma, c.userId, eqCourse.lessons[0].id, true);
      await expect(startOrResume({ prisma }, c.userId, "IQ")).rejects.toMatchObject({ code: "RETAKE_LATER" });
    });
  });

  describe("recommendations", () => {
    async function weakCandidate(name: string, quartile = 4) {
      const c = await kit.addCandidate(name);
      const s = await prisma.testSession.create({ data: { candidateProfileId: c.profileId, testType: "IQ", status: "COMPLETED", completedAt: new Date(), languageId: kit.language.id } });
      await prisma.score.create({ data: { candidateProfileId: c.profileId, sessionId: s.id, testType: "IQ", rawScore: 30, quartile, percentile: 12, rankValue: -1 } });
      return c;
    }

    it("asks Claude to choose and explain, keeps only courses it was offered, and notifies once", async () => {
      const c = await weakCandidate("recai");
      const a = await makeCourse("AAA Numbers", { testType: "IQ" });
      const b = await makeCourse("AAB Logic", { testType: "IQ", price: 900 });
      const { client, create } = claudeReply({ recommendations: [{ courseId: b.id, reason: "Builds the exact reasoning you missed." }, { courseId: "made-up-id", reason: "Not offered." }, { courseId: a.id, reason: "A gentle start." }] });

      const r = await refreshRecommendations({ prisma, client }, c.userId);
      expect(r.source).toBe("AI");
      expect(r.recommendations.map((x) => x.courseId).slice(0, 2)).toEqual([b.id, a.id]);
      expect(r.recommendations.some((x) => x.courseId === "made-up-id")).toBe(false);
      const sent = JSON.stringify(create.mock.calls[0][0]);
      expect(sent).toContain("quartile Q4"); // the weak area
      expect(sent).not.toContain(c.email);
      expect(await prisma.courseRecommendation.count({ where: { candidateProfileId: c.profileId, source: "AI" } })).toBe(r.recommendations.length);
      expect((await prisma.aiRun.findFirstOrThrow({ where: { actorId: c.userId, kind: "RECOMMEND" } })).status).toBe("COMPLETED");
      const recNotes = (await notes(c.userId)).filter((n) => n.type === "TRAINING_RECOMMENDATION");
      expect(recNotes.length).toBe(r.recommendations.length);

      // Refreshing with the same advice does not notify again.
      await refreshRecommendations({ prisma, client }, c.userId);
      expect((await notes(c.userId)).filter((n) => n.type === "TRAINING_RECOMMENDATION")).toHaveLength(recNotes.length);
    });

    it("falls back to the simple rules when Claude is not available", async () => {
      const c = await weakCandidate("recrules");
      const a = await makeCourse("AAA Fallback", { testType: "IQ" });
      const create = vi.fn().mockRejectedValue(new Error("network down"));
      const r = await refreshRecommendations({ prisma, client: { messages: { create } } as unknown as ClaudeClient }, c.userId);
      expect(r.source).toBe("RULES");
      expect(r.recommendations.map((x) => x.courseId)).toContain(a.id);
      expect(r.recommendations.find((x) => x.courseId === a.id)?.reason).toMatch(/IQ result \(Q4\)/);
      expect((await prisma.aiRun.findFirstOrThrow({ where: { actorId: c.userId, kind: "RECOMMEND" } })).status).toBe("FAILED");
    });

    it("recommends nothing when there is no weak area", async () => {
      const c = await weakCandidate("recstrong", 1);
      await makeCourse("AAA Not needed", { testType: "IQ" });
      const { client, create } = claudeReply({ recommendations: [] });
      const r = await refreshRecommendations({ prisma, client }, c.userId);
      expect(r).toEqual({ source: "NONE", recommendations: [] });
      expect(create).not.toHaveBeenCalled();
    });

    it("offers courses for the candidate's role or general ones, never ones already joined or inactive", async () => {
      const c = await weakCandidate("eligible");
      const general = await makeCourse("General", { testType: "IQ" });
      const mine = await makeCourse("Mine", { testType: "IQ", roleId: kit.role.id });
      const other = await makeCourse("Other role", { testType: "IQ", roleId: kit.otherRole.id });
      const off = await makeCourse("Off", { testType: "IQ", isActive: false });
      const joined = await makeCourse("Joined", { testType: "IQ" });
      await enrolInFreeCourse(prisma, c.userId, joined.id);
      const ids = (await eligibleCourses(prisma, c.profileId, kit.role.id, ["IQ"])).map((x) => x.id);
      expect(ids).toEqual(expect.arrayContaining([general.id, mine.id]));
      for (const excluded of [other.id, off.id, joined.id]) expect(ids).not.toContain(excluded);
    });

    it("knows when the saved recommendations are out of date", async () => {
      const c = await weakCandidate("stale");
      await makeCourse("AAA Stale", { testType: "IQ" });
      expect(await recommendationsAreStale(prisma, c.profileId)).toBe(true); // courses exist, nothing saved yet
      await refreshRecommendations({ prisma, client: { messages: { create: vi.fn().mockRejectedValue(new Error("x")) } } as unknown as ClaudeClient }, c.userId);
      expect(await recommendationsAreStale(prisma, c.profileId)).toBe(false);
      // A newer weak result, with a course that helps with it, makes the saved list out of date again.
      await makeCourse("AAA Stale EQ", { testType: "EQ" });
      await new Promise((r) => setTimeout(r, 15));
      const s = await prisma.testSession.create({ data: { candidateProfileId: c.profileId, testType: "EQ", status: "COMPLETED", completedAt: new Date() } });
      await prisma.score.create({ data: { candidateProfileId: c.profileId, sessionId: s.id, testType: "EQ", rawScore: 20, quartile: 4, percentile: 5, rankValue: 20 } });
      expect(await recommendationsAreStale(prisma, c.profileId)).toBe(true);
    });
  });
});

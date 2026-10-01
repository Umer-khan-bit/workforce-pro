import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TestType } from "@prisma/client";

const session = vi.hoisted(() => ({ user: null as null | { id: string; role: string; companyId?: string | null } }));
vi.mock("@/auth", () => ({ auth: async () => (session.user ? { user: session.user } : null) }));

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { readSetting } from "@/lib/settings/store";
import { createKit, type Kit } from "@/lib/testEngine/testkit";
import { getSessionView, startOrResume, submitAnswer, type SessionView } from "@/lib/testEngine/session";
import { POST as feedbackRoute } from "@/app/api/results/[scoreId]/feedback/route";
import { GET as reportRoute } from "@/app/api/results/report/route";
import { POST as notificationRead } from "@/app/api/notifications/[id]/read/route";
import { POST as notificationReadAll } from "@/app/api/notifications/read-all/route";
import { POST as enrolRoute } from "@/app/api/training/courses/[id]/enrol/route";
import { POST as checkoutRoute } from "@/app/api/training/courses/[id]/checkout/route";
import { POST as progressRoute } from "@/app/api/training/lessons/[id]/progress/route";
import { POST as refreshRoute } from "@/app/api/training/recommendations/refresh/route";

const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const post = (body?: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const scoreCtx = (scoreId: string) => ({ params: Promise.resolve({ scoreId }) });

describe.skipIf(!dbUp)("results, training and notification routes (real database)", () => {
  let kit: Kit;
  const courseIds: string[] = [];

  beforeAll(async () => {
    kit = await createKit(prisma, "rt");
    await kit.addCatBank("IQ", 40, 0);
  }, 60_000);

  afterAll(async () => {
    await prisma.lessonProgress.deleteMany({ where: { lesson: { courseId: { in: courseIds } } } });
    await prisma.payment.deleteMany({ where: { courseId: { in: courseIds } } });
    await prisma.enrollment.deleteMany({ where: { courseId: { in: courseIds } } });
    await prisma.courseLesson.deleteMany({ where: { courseId: { in: courseIds } } });
    await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
    await prisma.rateLimitHit.deleteMany({ where: { OR: [{ key: { startsWith: "results:" } }, { key: { startsWith: "feedback:" } }, { key: { startsWith: "report:" } }, { key: { startsWith: "training:" } }, { key: { startsWith: "checkout:" } }, { key: { startsWith: "recommend:" } }].map((o) => o) } });
    await kit.cleanup();
  }, 60_000);

  const asCandidate = (c: { userId: string }) => {
    session.user = { id: c.userId, role: "CANDIDATE" };
  };
  async function scoreFor(profileId: string, testType: TestType, quartile: number | null = 2) {
    const s = await prisma.testSession.create({ data: { candidateProfileId: profileId, testType, status: "COMPLETED", completedAt: new Date(), languageId: kit.language.id } });
    return prisma.score.create({ data: { candidateProfileId: profileId, sessionId: s.id, testType, rawScore: 60, quartile, percentile: 60, rankValue: 0.3, details: testType === "PERSONALITY" ? { traits: [{ trait: "Extraversion", score: 3.6 }] } : {} } });
  }
  async function course(over: { price?: number; lessons?: number } = {}) {
    const c = await prisma.course.create({
      data: { title: `Route course ${kit.run}`, isFree: !over.price, price: over.price ?? 0, lessons: { create: Array.from({ length: over.lessons ?? 2 }, (_, i) => ({ title: `Lesson ${i + 1}`, order: i + 1 })) } },
      include: { lessons: { orderBy: { order: "asc" } } },
    });
    courseIds.push(c.id);
    return c;
  }

  describe("the feedback route", () => {
    it("returns the saved feedback for the candidate's own result without calling AI", async () => {
      const c = await kit.addCandidate("fbroute");
      const score = await scoreFor(c.profileId, "IQ");
      await prisma.aIFeedback.create({ data: { candidateProfileId: c.profileId, testType: "IQ", scoreId: score.id, feedbackText: "Already written.", improvementTips: ["One tip."] } });
      asCandidate(c);
      const res = await feedbackRoute(post(), scoreCtx(score.id));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ feedback: { text: "Already written.", tips: ["One tip."], cached: true } });
    });

    it("is for the owner only: other candidates, recruiters and signed-out callers are turned away", async () => {
      const owner = await kit.addCandidate("fbowner");
      const other = await kit.addCandidate("fbother");
      const score = await scoreFor(owner.profileId, "EQ");
      asCandidate(other);
      expect((await feedbackRoute(post(), scoreCtx(score.id))).status).toBe(404);
      session.user = { id: other.userId, role: "RECRUITER" };
      expect((await feedbackRoute(post(), scoreCtx(score.id))).status).toBe(403);
      session.user = null;
      expect((await feedbackRoute(post(), scoreCtx(score.id))).status).toBe(403);
    });

    it("tells a candidate that feedback is unavailable, without exposing setup details, when AI is not set up", async () => {
      const c = await kit.addCandidate("fbnokey");
      const score = await scoreFor(c.profileId, "IQ");
      asCandidate(c);
      const prev = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = "";
      try {
        const res = await feedbackRoute(post(), scoreCtx(score.id));
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.code).toBe("UNAVAILABLE");
        expect(JSON.stringify(body)).not.toMatch(/\.env|ANTHROPIC|key/i);
      } finally {
        process.env.ANTHROPIC_API_KEY = prev;
      }
    });
  });

  describe("the PDF report route", () => {
    it("sends the candidate's own report as a download", async () => {
      const c = await kit.addCandidate("pdf");
      const iq = await scoreFor(c.profileId, "IQ", 1);
      const pers = await scoreFor(c.profileId, "PERSONALITY", null);
      for (const [s, t] of [[iq, "IQ"], [pers, "PERSONALITY"]] as const) {
        await prisma.aIFeedback.create({ data: { candidateProfileId: c.profileId, testType: t, scoreId: s.id, feedbackText: "Saved feedback.", improvementTips: ["A tip."] } });
      }
      asCandidate(c);
      const res = await reportRoute();
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(res.headers.get("content-disposition")).toContain("attachment");
      expect(res.headers.get("cache-control")).toBe("no-store");
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(await prisma.auditLog.count({ where: { actorId: c.userId, action: "RESULTS_REPORT_DOWNLOADED" } })).toBe(1);
    });

    it("is for candidates only", async () => {
      session.user = { id: "x", role: "RECRUITER" };
      expect((await reportRoute()).status).toBe(403);
      session.user = null;
      expect((await reportRoute()).status).toBe(403);
    });
  });

  describe("notification routes", () => {
    it("marks one or all of the user's own notifications as read, and nobody else's", async () => {
      const a = await kit.addCandidate("noteA");
      const b = await kit.addCandidate("noteB");
      const mk = (userId: string) => prisma.notification.create({ data: { userId, type: "GENERAL", channel: "IN_APP", title: "Hi", message: "There", sentAt: new Date() } });
      const [a1, a2] = [await mk(a.userId), await mk(a.userId)];
      const b1 = await mk(b.userId);

      session.user = { id: a.userId, role: "CANDIDATE" };
      expect((await notificationRead(post(), ctx(b1.id))).status).toBe(404);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: b1.id } })).readAt).toBeNull();
      expect((await notificationRead(post(), ctx(a1.id))).status).toBe(200);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: a1.id } })).readAt).not.toBeNull();
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: a2.id } })).readAt).toBeNull();

      const all = await notificationReadAll();
      expect(await all.json()).toMatchObject({ ok: true, updated: 1 });
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: b1.id } })).readAt).toBeNull();

      session.user = null;
      expect((await notificationRead(post(), ctx(a1.id))).status).toBe(401);
      expect((await notificationReadAll()).status).toBe(401);
    });
  });

  describe("training routes", () => {
    it("joins a free course, shows progress through the lesson route, and refuses a paid one without payment", async () => {
      const c = await kit.addCandidate("tr");
      const free = await course();
      const paid = await course({ price: 1200 });
      asCandidate(c);

      expect((await enrolRoute(post(), ctx(paid.id))).status).toBe(402);
      const joined = await enrolRoute(post(), ctx(free.id));
      expect(joined.status).toBe(201);
      expect((await enrolRoute(post(), ctx(free.id))).status).toBe(409);

      const first = await progressRoute(post({ done: true }), ctx(free.lessons[0].id));
      expect(await first.json()).toEqual({ progressPercent: 50, status: "IN_PROGRESS" });
      expect((await progressRoute(post({ done: "yes" }), ctx(free.lessons[1].id))).status).toBe(400);
      const last = await progressRoute(post({ done: true }), ctx(free.lessons[1].id));
      expect(await last.json()).toEqual({ progressPercent: 100, status: "COMPLETED" });
    });

    it("checkout: a failed payment answers 402 and enrols nobody; a successful one enrols", async () => {
      const c = await kit.addCandidate("pay");
      const paid = await course({ price: 3000 });
      asCandidate(c);
      const failed = await checkoutRoute(post({ simulate: "failure" }), ctx(paid.id));
      expect(failed.status).toBe(402);
      expect((await failed.json()).code).toBe("PAYMENT_FAILED");
      expect(await prisma.enrollment.count({ where: { candidateProfileId: c.profileId, courseId: paid.id } })).toBe(0);

      const ok = await checkoutRoute(post({ simulate: "success" }), ctx(paid.id));
      expect(ok.status).toBe(201);
      expect(await prisma.enrollment.count({ where: { candidateProfileId: c.profileId, courseId: paid.id } })).toBe(1);
      expect((await checkoutRoute(post({}), ctx(paid.id))).status).toBe(409); // already joined
    });

    it("checkout needs a confirmed email", async () => {
      const c = await kit.addCandidate("payunv");
      await prisma.user.update({ where: { id: c.userId }, data: { emailVerified: null } });
      const paid = await course({ price: 500 });
      asCandidate(c);
      const res = await checkoutRoute(post({}), ctx(paid.id));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("EMAIL_NOT_VERIFIED");
    });

    it("these routes are for candidates only", async () => {
      const free = await course();
      session.user = { id: "r", role: "RECRUITER" };
      for (const res of [await enrolRoute(post(), ctx(free.id)), await checkoutRoute(post({}), ctx(free.id)), await progressRoute(post({ done: true }), ctx(free.lessons[0].id)), await refreshRoute()]) {
        expect(res.status).toBe(403);
      }
      session.user = null;
      expect((await enrolRoute(post(), ctx(free.id))).status).toBe(403);
    });

    it("the recommendations route answers for a candidate with no results", async () => {
      const c = await kit.addCandidate("recroute");
      asCandidate(c);
      const res = await refreshRoute();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ source: "NONE", count: 0 });
    });
  });

  describe("finishing a real test awards the Top Performer badge", () => {
    it("after the last counted test is scored, the badge, notification and email follow", async () => {
      const rule = await readSetting(prisma, "topPerformer");
      if (!rule.countedTests.includes("IQ")) return; // the rule in Settings no longer counts IQ; nothing to prove here

      const c = await kit.addCandidate("hook");
      // Every other counted test is already finished in the required quartile; IQ is taken for real.
      for (const t of rule.countedTests.filter((x) => x !== "IQ")) await scoreFor(c.profileId, t, rule.requiredQuartile);
      expect(await prisma.badge.count({ where: { candidateProfileId: c.profileId } })).toBe(0);

      const deps = { prisma };
      const { sessionId } = await startOrResume(deps, c.userId, "IQ");
      let view: SessionView = await getSessionView(deps, c.userId, sessionId);
      for (let guard = 0; guard < 60 && view.status === "IN_PROGRESS" && view.question; guard++) {
        view = await submitAnswer(deps, c.userId, sessionId, { questionId: view.question.id, answer: { key: "B" } }); // every answer correct
      }
      expect(view.status).toBe("COMPLETED");

      const score = await prisma.score.findUniqueOrThrow({ where: { sessionId } });
      expect(score.quartile).toBeLessThanOrEqual(rule.requiredQuartile); // a perfect score ranks at the top
      expect(await prisma.badge.count({ where: { candidateProfileId: c.profileId, type: "TOP_PERFORMER_ALL_TESTS" } })).toBe(1);
      const notes = await prisma.notification.findMany({ where: { userId: c.userId, type: "TOP_PERFORMER" } });
      expect(notes.map((n) => n.channel).sort()).toEqual(["EMAIL", "IN_APP"]);
    }, 60_000);

    it("a result that does not complete the set awards nothing", async () => {
      const rule = await readSetting(prisma, "topPerformer");
      if (!rule.countedTests.includes("IQ") || rule.countedTests.length < 2) return;
      const c = await kit.addCandidate("nohook"); // no other counted test taken
      const deps = { prisma };
      const { sessionId } = await startOrResume(deps, c.userId, "IQ");
      let view: SessionView = await getSessionView(deps, c.userId, sessionId);
      for (let guard = 0; guard < 60 && view.status === "IN_PROGRESS" && view.question; guard++) {
        view = await submitAnswer(deps, c.userId, sessionId, { questionId: view.question.id, answer: { key: "B" } });
      }
      expect(view.status).toBe("COMPLETED");
      expect(await prisma.badge.count({ where: { candidateProfileId: c.profileId } })).toBe(0);
    }, 60_000);
  });

  it("(sanity) a recruiter session cannot reach candidate data through these routes", async () => {
    const owner = await kit.addCandidate("sanity");
    const score = await scoreFor(owner.profileId, "IQ");
    const recruiter = await prisma.user.create({ data: { email: `rec-${kit.run}@example.test`, name: "Rec", password: await hashPassword("x-pass-12345"), role: "RECRUITER", emailVerified: new Date() } });
    try {
      session.user = { id: recruiter.id, role: "RECRUITER" };
      expect((await feedbackRoute(post(), scoreCtx(score.id))).status).toBe(403);
      expect((await reportRoute()).status).toBe(403);
    } finally {
      await prisma.user.delete({ where: { id: recruiter.id } });
    }
  });
});

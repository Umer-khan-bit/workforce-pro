import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | { id: string; role: string } }));
vi.mock("@/auth", () => ({ auth: async () => (session.user ? { user: session.user } : null) }));

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { createKit, type Kit } from "@/lib/testEngine/testkit";
import { loadPool } from "@/lib/testEngine/context";
import { PATCH as editQuestion } from "@/app/api/admin/questions/[id]/route";
import { POST as newVersion } from "@/app/api/admin/questions/[id]/new-version/route";

// Whole flow against the real database, in an isolated world (own language, region and questions).
const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

const options = ["A", "B", "C", "D"].map((key) => ({ key, text: `Option ${key}` }));
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (body: unknown) => new Request("http://localhost/api", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe.skipIf(!dbUp)("question versioning (real database)", () => {
  let kit: Kit;
  let adminId: string;
  let n = 0;

  beforeAll(async () => {
    kit = await createKit(prisma, "ver");
    const admin = await prisma.user.create({
      data: { email: `admin-${kit.run}@example.test`, name: "Admin", password: await hashPassword("x-admin-pass-1"), role: "PLATFORM_ADMIN", emailVerified: new Date() },
    });
    adminId = admin.id;
  }, 60_000);

  afterAll(async () => {
    await kit.cleanup();
    await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
    await prisma.user.delete({ where: { id: adminId } });
  }, 60_000);

  /** A question, optionally answered once by a candidate. */
  async function makeQuestion(opts: { answered?: boolean; status?: "APPROVED" | "RETIRED" } = {}) {
    n++;
    const q = await prisma.question.create({
      data: {
        testType: "IQ",
        type: "MCQ",
        content: `${kit.run} version test question ${n}`,
        options,
        correctAnswer: "B",
        topic: "arithmetic",
        difficulty: "MEDIUM",
        aParam: 1,
        bParam: 0,
        status: opts.status ?? "APPROVED",
        languageId: kit.language.id,
      },
    });
    if (opts.answered) {
      const c = await kit.addCandidate(`answerer${n}`);
      const s = await prisma.testSession.create({ data: { candidateProfileId: c.profileId, testType: "IQ", status: "IN_PROGRESS", languageId: kit.language.id } });
      await prisma.response.create({ data: { sessionId: s.id, questionId: q.id, answerGiven: { key: "B" }, isCorrect: true } });
    }
    return q;
  }

  /** The values a form would send for an existing question, with changes on top. */
  const formOf = (q: { content: string }, over: Record<string, unknown> = {}) => ({
    testType: "IQ",
    type: "MCQ",
    content: q.content,
    options,
    correctAnswer: "B",
    topic: "arithmetic",
    explanation: "",
    difficulty: "MEDIUM",
    languageId: kit.language.id,
    ...over,
  });

  const asAdmin = () => {
    session.user = { id: adminId, role: "PLATFORM_ADMIN" };
  };

  describe("editing a question that candidates have answered", () => {
    it.each([
      ["question text", { content: "A completely different question?" }, "question text"],
      ["answer options", { options: options.map((o) => (o.key === "C" ? { ...o, text: "Changed" } : o)) }, "answer options"],
      ["correct answer", { correctAnswer: "C" }, "correct answer"],
      ["difficulty", { difficulty: "HARD" }, "difficulty"],
      ["topic", { topic: "geometry" }, "topic"],
    ])("refuses a change to the %s and leaves the question untouched", async (_label, change, field) => {
      asAdmin();
      const q = await makeQuestion({ answered: true });
      const res = await editQuestion(request(formOf(q, change)), ctx(q.id));
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body).toMatchObject({ code: "QUESTION_IN_USE", answered: 1 });
      expect(body.fields).toContain(field);
      expect(body.error).toMatch(/retire it and add a new version/i);

      const after = await prisma.question.findUniqueOrThrow({ where: { id: q.id } });
      expect(after).toMatchObject({ content: q.content, correctAnswer: "B", topic: "arithmetic", difficulty: "MEDIUM" });
      expect(after.options).toEqual(options);
    });

    it("still allows the explanation to be edited, and records it", async () => {
      asAdmin();
      const q = await makeQuestion({ answered: true });
      const res = await editQuestion(request(formOf(q, { explanation: "Because one plus one is two." })), ctx(q.id));
      expect(res.status).toBe(200);
      expect((await prisma.question.findUniqueOrThrow({ where: { id: q.id } })).explanation).toBe("Because one plus one is two.");
      const log = await prisma.auditLog.findFirstOrThrow({ where: { actorId: adminId, targetId: q.id, action: "QUESTION_UPDATED" } });
      expect(log.metadata).toMatchObject({ explanationOnly: true, answered: 1 });
    });

    it("does not treat the order of the options as an edit", async () => {
      asAdmin();
      const q = await makeQuestion({ answered: true });
      const res = await editQuestion(request(formOf(q, { options: [...options].reverse(), explanation: "Same options, listed differently." })), ctx(q.id));
      expect(res.status).toBe(200);
    });

    it("keeps its calibrated difficulty numbers when only the explanation is saved", async () => {
      asAdmin();
      const q = await makeQuestion({ answered: true });
      await prisma.question.update({ where: { id: q.id }, data: { aParam: 1.7, bParam: 0.83 } });
      await editQuestion(request(formOf(q, { explanation: "Note." })), ctx(q.id));
      expect(await prisma.question.findUniqueOrThrow({ where: { id: q.id } })).toMatchObject({ aParam: 1.7, bParam: 0.83 });
    });
  });

  describe("editing a question nobody has answered", () => {
    it("works as before", async () => {
      asAdmin();
      const q = await makeQuestion();
      const res = await editQuestion(request(formOf(q, { content: "Reworded before anyone answered it?", correctAnswer: "D", difficulty: "HARD" })), ctx(q.id));
      expect(res.status).toBe(200);
      expect(await prisma.question.findUniqueOrThrow({ where: { id: q.id } })).toMatchObject({ content: "Reworded before anyone answered it?", correctAnswer: "D", difficulty: "HARD" });
    });
  });

  describe("the database safety trigger (protects against scripts and future code)", () => {
    it("refuses to change what an answered question says or measures", async () => {
      const q = await makeQuestion({ answered: true });
      const attempts: Array<Record<string, unknown>> = [
        { content: "sneaky edit" },
        { correctAnswer: "A" },
        { options: [{ key: "A", text: "x" }] },
        { type: "LIKERT" },
        { reverseKeyed: true },
        { topic: "other" },
        { languageId: null },
      ];
      for (const data of attempts) {
        await expect(prisma.question.update({ where: { id: q.id }, data: data as never }), JSON.stringify(data)).rejects.toThrow(/retire it and add a new version/i);
      }
      expect(await prisma.question.findUniqueOrThrow({ where: { id: q.id } })).toMatchObject({ content: q.content, correctAnswer: "B", topic: "arithmetic" });
    });

    it("still allows what must keep working: explanation, status, calibration, pretest flag, review notes", async () => {
      const q = await makeQuestion({ answered: true });
      await prisma.question.update({ where: { id: q.id }, data: { explanation: "Updated" } });
      await prisma.question.update({ where: { id: q.id }, data: { aParam: 1.2, bParam: -0.4, difficulty: "EASY", isPretest: true } });
      await prisma.question.update({ where: { id: q.id }, data: { reviewNotes: "Looks fine", reviewVerdict: "OK" } });
      await prisma.question.update({ where: { id: q.id }, data: { status: "RETIRED" } });
      // Writing the same value again is not a change.
      await prisma.question.update({ where: { id: q.id }, data: { content: q.content, correctAnswer: "B" } });
      expect(await prisma.question.findUniqueOrThrow({ where: { id: q.id } })).toMatchObject({ status: "RETIRED", aParam: 1.2, bParam: -0.4, isPretest: true });
    });

    it("does not get in the way of questions that have no responses", async () => {
      const q = await makeQuestion();
      await prisma.question.update({ where: { id: q.id }, data: { content: "free to change", correctAnswer: "D" } });
      expect((await prisma.question.findUniqueOrThrow({ where: { id: q.id } })).content).toBe("free to change");
    });
  });

  describe("adding a new version", () => {
    it("creates a linked, approved question and retires the old one, leaving the old answers where they are", async () => {
      asAdmin();
      const old = await makeQuestion({ answered: true });
      const answersBefore = await prisma.response.count({ where: { questionId: old.id } });

      const res = await newVersion(request(formOf(old, { content: "What is 1 + 1, written out in words?", explanation: "Version two." })), ctx(old.id));
      expect(res.status).toBe(201);
      const { question } = await res.json();

      const created = await prisma.question.findUniqueOrThrow({ where: { id: question.id } });
      expect(created).toMatchObject({
        status: "APPROVED",
        previousVersionId: old.id,
        approvedById: adminId,
        createdById: adminId,
        isPretest: false,
        source: "MANUAL",
        content: "What is 1 + 1, written out in words?",
        explanation: "Version two.",
      });
      expect(created.approvedAt).not.toBeNull();
      expect(created.aParam).toBe(1); // default difficulty values from Settings, not the old question's calibration

      expect((await prisma.question.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("RETIRED");
      expect(await prisma.response.count({ where: { questionId: old.id } })).toBe(answersBefore);
      expect(await prisma.response.count({ where: { questionId: created.id } })).toBe(0);

      const withLinks = await prisma.question.findUniqueOrThrow({ where: { id: old.id }, include: { nextVersions: true } });
      expect(withLinks.nextVersions.map((v) => v.id)).toEqual([created.id]);

      const actions = (await prisma.auditLog.findMany({ where: { actorId: adminId, OR: [{ targetId: created.id }, { targetId: old.id }] } })).map((l) => `${l.action}:${l.targetId === old.id ? "old" : "new"}`);
      expect(actions).toEqual(expect.arrayContaining(["QUESTION_VERSIONED:new", "QUESTION_RETIRED:old"]));
    });

    it("can start the new version as an unscored pretest item", async () => {
      asAdmin();
      const old = await makeQuestion({ answered: true });
      const res = await newVersion(request({ ...formOf(old, { correctAnswer: "C" }), startAsPretest: true }), ctx(old.id));
      const { question } = await res.json();
      expect((await prisma.question.findUniqueOrThrow({ where: { id: question.id } })).isPretest).toBe(true);

      // The engine serves it as a pretest item and keeps it out of the scored pool; the old version is gone from both.
      const pool = await loadPool(prisma, "IQ", kit.language.id, null);
      const pretestPool = await loadPool(prisma, "IQ", kit.language.id, null, true);
      expect(pool.map((p) => p.id)).not.toContain(question.id);
      expect(pretestPool.map((p) => p.id)).toContain(question.id);
      expect([...pool, ...pretestPool].map((p) => p.id)).not.toContain(old.id);
    });

    it("otherwise the new version is a normal scored question in the pool", async () => {
      asAdmin();
      const old = await makeQuestion({ answered: true });
      const { question } = await (await newVersion(request(formOf(old, { content: "A scored replacement question?" })), ctx(old.id))).json();
      const pool = await loadPool(prisma, "IQ", kit.language.id, null);
      expect(pool.map((p) => p.id)).toContain(question.id);
      expect(pool.map((p) => p.id)).not.toContain(old.id);
    });

    it("refuses a 'new version' that changes nothing", async () => {
      asAdmin();
      const old = await makeQuestion({ answered: true });
      const res = await newVersion(request(formOf(old, { explanation: "only the explanation" })), ctx(old.id));
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("NO_CHANGE");
      expect(await prisma.question.count({ where: { previousVersionId: old.id } })).toBe(0);
      expect((await prisma.question.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("APPROVED");
    });

    it("works for a question that nobody has answered yet, and for one that is already retired", async () => {
      asAdmin();
      const fresh = await makeQuestion();
      expect((await newVersion(request(formOf(fresh, { content: "Improved before it went live?" })), ctx(fresh.id))).status).toBe(201);

      const retired = await makeQuestion({ answered: true, status: "RETIRED" });
      const res = await newVersion(request(formOf(retired, { content: "Replacement for a retired question?" })), ctx(retired.id));
      expect(res.status).toBe(201);
      expect(await prisma.auditLog.count({ where: { actorId: adminId, targetId: retired.id, action: "QUESTION_RETIRED" } })).toBe(0); // it was retired already
    });

    it("can be repeated: version 3 points to version 2, which points to version 1", async () => {
      asAdmin();
      const v1 = await makeQuestion({ answered: true });
      const v2 = (await (await newVersion(request(formOf(v1, { content: "Second wording?" })), ctx(v1.id))).json()).question;
      const v3 = (await (await newVersion(request(formOf({ content: "Second wording?" }, { content: "Third wording?" })), ctx(v2.id))).json()).question;
      expect((await prisma.question.findUniqueOrThrow({ where: { id: v3.id } })).previousVersionId).toBe(v2.id);
      expect((await prisma.question.findUniqueOrThrow({ where: { id: v2.id } })).previousVersionId).toBe(v1.id);
      expect((await prisma.question.findUniqueOrThrow({ where: { id: v2.id } })).status).toBe("RETIRED");
    });

    it("validates the new wording like any question, and rejects unknown questions and non-admins", async () => {
      asAdmin();
      const old = await makeQuestion({ answered: true });
      expect((await newVersion(request(formOf(old, { content: "x", options: [] })), ctx(old.id))).status).toBe(400);
      expect((await newVersion(request(formOf(old, { content: "Valid new text here?" })), ctx("no-such-question"))).status).toBe(404);
      expect(await prisma.question.count({ where: { previousVersionId: old.id } })).toBe(0);

      session.user = { id: adminId, role: "RECRUITER" };
      expect((await newVersion(request(formOf(old, { content: "Valid new text here?" })), ctx(old.id))).status).toBe(403);
      session.user = null;
      expect((await newVersion(request(formOf(old, { content: "Valid new text here?" })), ctx(old.id))).status).toBe(403);
      expect((await editQuestion(request(formOf(old)), ctx(old.id))).status).toBe(403);
    });

    it("a test already under way can finish an old version that was retired mid-test", async () => {
      asAdmin();
      const old = await makeQuestion({ answered: true });
      await newVersion(request(formOf(old, { content: "Newer wording for later candidates?" })), ctx(old.id));
      // The old question is retired, yet its past answers and statistics remain readable and intact.
      const responses = await prisma.response.findMany({ where: { questionId: old.id } });
      expect(responses).toHaveLength(1);
      expect(responses[0].isCorrect).toBe(true);
    });
  });
});

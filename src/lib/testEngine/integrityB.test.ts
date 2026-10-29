import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as null | { id: string; role: string } }));
vi.mock("@/auth", () => ({ auth: async () => (auth.user ? { user: auth.user } : null) }));

import { prisma } from "@/lib/prisma";
import { readSetting } from "@/lib/settings/store";
import type { SettingValue } from "@/lib/settings/definitions";
import { createKit, type Kit } from "./testkit";
import { getSessionView, startOrResume, submitAnswer, type SessionView } from "./session";
import { limitTooLong, questionSecondsFor, timingHint } from "./questionLimit";
import { PUT as saveSettings } from "@/app/api/admin/settings/[key]/route";
import { PATCH as saveTestConfig } from "@/app/api/admin/test-config/[testType]/route";

const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

const json = (body: unknown, method = "PUT") => new Request("http://localhost/api", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("per-question time limit wording and checks (pure)", () => {
  it("shows the overall time, question count and an average per question", () => {
    expect(timingHint("IQ", { timeLimitMinutes: 15, maxItems: 20, pretestItemCount: 0, isAdaptive: true })).toBe("IQ: 15 min overall, up to 20 questions, about 45 s per question");
    expect(timingHint("IQ", { timeLimitMinutes: 15, maxItems: 20, pretestItemCount: 2, isAdaptive: true })).toBe("IQ: 15 min overall, up to 22 questions, about 40 s per question");
    expect(timingHint("PERSONALITY", { timeLimitMinutes: 15, maxItems: 50, pretestItemCount: 2, isAdaptive: false })).toBe("Personality: 15 min overall, up to 50 questions, about 18 s per question");
  });
  it("refuses a per-question limit longer than the whole test, and accepts 0 (off)", () => {
    expect(limitTooLong("IQ", 901, 15)).toMatch(/longer than the whole test/);
    expect(limitTooLong("IQ", 900, 15)).toBeNull();
    expect(limitTooLong("IQ", 0, 15)).toBeNull();
  });
});

describe.skipIf(!dbUp)("per-question limit and option shuffle (real database)", () => {
  let kit: Kit;
  let iq: Awaited<ReturnType<Kit["addCatBank"]>>;
  let adminId: string;
  let original: SettingValue<"testing">;

  beforeAll(async () => {
    kit = await createKit(prisma, "intb");
    iq = await kit.addCatBank("IQ", 40, 4);
    await kit.addPersonalityBank();
    await kit.addEqBank(30);
    adminId = (await prisma.user.create({ data: { email: `intb-admin-${kit.run}@example.test`, name: "Integrity B admin", password: "x", role: "PLATFORM_ADMIN" } })).id;
    original = await readSetting(prisma, "testing");
  }, 60_000);
  afterAll(async () => {
    await setTesting(original);
    await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
    await kit.cleanup();
    await prisma.user.delete({ where: { id: adminId } });
  }, 60_000);

  const setTesting = async (value: object) => {
    await prisma.siteSetting.upsert({ where: { key: "testing" }, create: { key: "testing", value }, update: { value } });
  };
  const withTesting = async (patch: Partial<SettingValue<"testing">>, fn: () => Promise<void>) => {
    await setTesting({ ...original, ...patch });
    try {
      await fn();
    } finally {
      await setTesting(original);
    }
  };
  const sessionState = async (id: string) => (await prisma.testSession.findUniqueOrThrow({ where: { id } })).resumeState as { current: { questionId: string; dueAt?: string; optionOrder?: string[] } | null; seed: number };
  const hash = (t: string) => [...t].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7);
  const realKey = (q: NonNullable<SessionView["question"]>) => ["A", "B", "C", "D"][Math.abs(hash(q.id)) % 4];

  it("the same chosen answers give the same score with and without shuffle, and the shown order is stored on the answer", async () => {
    const a = await kit.addCandidate("shuffled");
    const b = await kit.addCandidate("natural");
    await withTesting({ integrityShuffleOptions: "yes" }, async () => {
      const sa = (await startOrResume({ prisma }, a.userId, "EQ")).sessionId;
      await setTesting({ ...original, integrityShuffleOptions: "no" });
      const sb = (await startOrResume({ prisma }, b.userId, "EQ")).sessionId;

      // Give B exactly the same form as A (same questions in the same order), but without a shuffled option order.
      const stateA = await sessionState(sa);
      const { optionOrder: _unused, ...plain } = stateA.current!;
      void _unused;
      const sessionA = await prisma.testSession.findUniqueOrThrow({ where: { id: sa } });
      await prisma.testSession.update({ where: { id: (sb) }, data: { resumeState: { ...(sessionA.resumeState as object), current: plain } } });

      const play = async (userId: string, sessionId: string, shuffleOn: boolean) => {
        await setTesting({ ...original, integrityShuffleOptions: shuffleOn ? "yes" : "no" });
        let anyShuffled = false;
        let view = await getSessionView({ prisma }, userId, sessionId);
        for (let guard = 0; guard < 80 && view.status === "IN_PROGRESS" && view.question; guard++) {
          const q = view.question;
          if (q.type === "LIKERT") view = await submitAnswer({ prisma }, userId, sessionId, { questionId: q.id, answer: { value: 1 + (Math.abs(hash(q.id)) % 5) } });
          else {
            if (q.options.map((o) => o.key).join("") !== "ABCD") anyShuffled = true;
            view = await submitAnswer({ prisma }, userId, sessionId, { questionId: q.id, answer: { key: realKey(q) } });
          }
        }
        return anyShuffled;
      };
      const shuffledA = await play(a.userId, sa, true);
      const shuffledB = await play(b.userId, sb, false);
      expect(shuffledA).toBe(true);
      expect(shuffledB).toBe(false);

      const scoreA = await prisma.score.findUniqueOrThrow({ where: { sessionId: sa } });
      const scoreB = await prisma.score.findUniqueOrThrow({ where: { sessionId: sb } });
      expect(scoreA.rawScore).toBe(scoreB.rawScore);
      expect(scoreA.details).toEqual(scoreB.details);
      const rows = async (id: string) => (await prisma.response.findMany({ where: { sessionId: id }, orderBy: { answeredAt: "asc" } })).map((r) => ({ q: r.questionId, correct: r.isCorrect, scored: r.isScored, key: (r.answerGiven as { key?: string }).key }));
      expect(await rows(sa)).toEqual(await rows(sb));

      // The order that was shown is stored with each multiple-choice answer (and only there).
      const answersA = await prisma.response.findMany({ where: { sessionId: sa, question: { type: "SITUATIONAL_JUDGEMENT" } } });
      expect(answersA.length).toBeGreaterThan(0);
      for (const r of answersA) expect([...(r.answerGiven as { shownOrder: string[] }).shownOrder].sort()).toEqual(["A", "B", "C", "D"]);
      const likertA = await prisma.response.findMany({ where: { sessionId: sa, question: { type: "LIKERT" } } });
      for (const r of likertA) expect(r.answerGiven).not.toHaveProperty("shownOrder");
      const answersB = await prisma.response.findMany({ where: { sessionId: sb } });
      for (const r of answersB) expect(r.answerGiven).not.toHaveProperty("shownOrder");
    });
  });

  it("a question that runs out of time is unanswered: it counts as wrong, stays out of the statistics, and the next question is served", async () => {
    const c = await kit.addCandidate("slowpoke");
    await withTesting({ questionSecondsIq: 300 }, async () => {
      let clock = new Date();
      const t0 = clock.getTime();
      const deps = { prisma, now: () => clock };
      const { sessionId } = await startOrResume(deps, c.userId, "IQ");

      const first = await getSessionView(deps, c.userId, sessionId);
      const q0 = first.question!.id;
      expect(Date.parse(first.questionDueAt!) - t0).toBe(300_000);
      const statBefore = (await prisma.itemStatistic.findUnique({ where: { questionId: q0 } }))?.responseCount ?? 0;

      // Not yet: still the same question.
      clock = new Date(t0 + 299_000);
      expect((await getSessionView(deps, c.userId, sessionId)).question!.id).toBe(q0);
      expect(await prisma.response.count({ where: { sessionId } })).toBe(0);

      // Time is up: recorded as unanswered, next question served with a fresh deadline.
      clock = new Date(t0 + 301_000);
      const second = await getSessionView(deps, c.userId, sessionId);
      expect(second.question!.id).not.toBe(q0);
      expect(Date.parse(second.questionDueAt!) - (t0 + 301_000)).toBe(300_000);
      const row = await prisma.response.findFirstOrThrow({ where: { sessionId, questionId: q0 } });
      expect(row.answerGiven).toMatchObject({ unanswered: true });
      expect(row.isCorrect).toBe(false);
      expect(row.isScored).toBe(!iq.pretestIds.includes(q0));
      expect((await prisma.itemStatistic.findUnique({ where: { questionId: q0 } }))?.responseCount ?? 0).toBe(statBefore);

      // An answer that arrives after the time (and the short grace) is ignored: the question counts as unanswered.
      clock = new Date(t0 + 301_000 + 300_000 + 4_000);
      const q1 = second.question!.id;
      const third = await submitAnswer(deps, c.userId, sessionId, { questionId: q1, answer: { key: "B" } });
      expect(third.question!.id).not.toBe(q1);
      expect((await prisma.response.findFirstOrThrow({ where: { sessionId, questionId: q1 } })).answerGiven).toMatchObject({ unanswered: true });
      expect((await prisma.response.findFirstOrThrow({ where: { sessionId, questionId: q1 } })).answerGiven).not.toHaveProperty("key");

      // An answer inside the grace period still counts.
      const due2 = Date.parse(third.questionDueAt!);
      clock = new Date(due2 + 2_000);
      const q2 = third.question!.id;
      await submitAnswer(deps, c.userId, sessionId, { questionId: q2, answer: { key: "B" } });
      expect((await prisma.response.findFirstOrThrow({ where: { sessionId, questionId: q2 } })).answerGiven).toMatchObject({ key: "B" });
    });
  });

  it("closing the browser and coming back keeps the per-question deadline, never later than the whole test", async () => {
    const c = await kit.addCandidate("resumer");
    await withTesting({ questionSecondsIq: 120 }, async () => {
      let clock = new Date();
      const t0 = clock.getTime();
      const deps = { prisma, now: () => clock };
      const { sessionId } = await startOrResume(deps, c.userId, "IQ");
      const before = await sessionState(sessionId);
      const due = before.current!.dueAt!;
      expect(Date.parse(due) - t0).toBe(120_000);

      // "Close the browser", come back 60 s later: same question, same deadline, nothing recorded.
      clock = new Date(t0 + 60_000);
      const resumed = await startOrResume(deps, c.userId, "IQ");
      expect(resumed).toEqual({ sessionId, resumed: true });
      const view = await getSessionView(deps, c.userId, sessionId);
      expect(view.question!.id).toBe(before.current!.questionId);
      expect(view.questionDueAt).toBe(due);
      expect((await sessionState(sessionId)).current!.dueAt).toBe(due);
      expect(await prisma.response.count({ where: { sessionId } })).toBe(0);

      // Coming back after the deadline: the question is unanswered and the next one is served.
      clock = new Date(t0 + 130_000);
      const late = await getSessionView(deps, c.userId, sessionId);
      expect(late.question!.id).not.toBe(before.current!.questionId);
      expect(await prisma.response.count({ where: { sessionId } })).toBe(1);
    });
  });

  it("a per-question limit never runs past the end of the whole test", async () => {
    const c = await kit.addCandidate("capped");
    const config = await prisma.testConfig.findUniqueOrThrow({ where: { testType: "IQ" } });
    await withTesting({ questionSecondsIq: config.timeLimitMinutes * 60 }, async () => {
      const { sessionId } = await startOrResume({ prisma }, c.userId, "IQ");
      const endsAt = new Date(Date.now() + 30_000);
      await prisma.testSession.update({ where: { id: sessionId }, data: { expiresAt: endsAt } });
      const first = (await getSessionView({ prisma }, c.userId, sessionId)).question!;
      const next = await submitAnswer({ prisma }, c.userId, sessionId, { questionId: first.id, answer: { key: "B" } });
      // The limit is as long as the whole test, but the test ends in 30 s, so the question's deadline is the test's end.
      expect(Date.parse(next.questionDueAt!)).toBe(endsAt.getTime());
    });
  });

  it("a rating (Likert) question that runs out of time is not scored and the test still finishes", async () => {
    const c = await kit.addCandidate("ratingskip");
    await withTesting({ questionSecondsPersonality: 300 }, async () => {
      let clock = new Date();
      const t0 = clock.getTime();
      const deps = { prisma, now: () => clock };
      const { sessionId } = await startOrResume(deps, c.userId, "PERSONALITY");
      const first = (await getSessionView(deps, c.userId, sessionId)).question!;
      clock = new Date(t0 + 301_000);
      let view = await getSessionView(deps, c.userId, sessionId);
      const row = await prisma.response.findFirstOrThrow({ where: { sessionId, questionId: first.id } });
      expect(row).toMatchObject({ isScored: false, isCorrect: null });
      expect(row.answerGiven).toMatchObject({ unanswered: true });

      for (let guard = 0; guard < 80 && view.status === "IN_PROGRESS" && view.question; guard++) {
        view = await submitAnswer(deps, c.userId, sessionId, { questionId: view.question.id, answer: { value: 4 } });
      }
      expect(view.status).toBe("COMPLETED");
      const score = await prisma.score.findUniqueOrThrow({ where: { sessionId } });
      expect((score.details as { answered: number }).answered).toBeLessThan(50);
    });
  });

  it("every limit starts off, and the settings screen refuses a limit longer than the whole test", async () => {
    for (const t of ["PERSONALITY", "IQ", "EQ", "LANGUAGE", "SKILL"] as const) expect(questionSecondsFor(original, t)).toBeGreaterThanOrEqual(0);
    // The shipped starting values are all off (the live database may have been changed by an admin, so read the definitions).
    const { DEFAULT_SETTINGS } = await import("@/lib/settings/definitions");
    for (const t of ["PERSONALITY", "IQ", "EQ", "LANGUAGE", "SKILL"] as const) expect(questionSecondsFor(DEFAULT_SETTINGS.testing, t)).toBe(0);
    expect(DEFAULT_SETTINGS.testing.integrityShuffleOptions).toBe("yes");

    const config = await prisma.testConfig.findUniqueOrThrow({ where: { testType: "IQ" } });
    auth.user = { id: adminId, role: "PLATFORM_ADMIN" };
    const tooLong = await saveSettings(json({ ...original, questionSecondsIq: config.timeLimitMinutes * 60 + 1 }), { params: Promise.resolve({ key: "testing" }) });
    expect(tooLong.status).toBe(400);
    expect(JSON.stringify(await tooLong.json())).toMatch(/longer than the whole test/);
    expect((await readSetting(prisma, "testing")).questionSecondsIq).toBe(original.questionSecondsIq);

    const fine = await saveSettings(json({ ...original, questionSecondsIq: 0 }), { params: Promise.resolve({ key: "testing" }) });
    expect(fine.status).toBe(200);

    // The other way round: the whole test may not be made shorter than the time for one question.
    await withTesting({ questionSecondsIq: 120 }, async () => {
      const { id: _id, updatedAt: _u, testType: _t, ...fields } = config;
      void _id; void _u; void _t;
      const tooShort = await saveTestConfig(json({ ...fields, timeLimitMinutes: 1 }, "PATCH"), { params: Promise.resolve({ testType: "IQ" }) });
      expect(tooShort.status).toBe(400);
      expect((await prisma.testConfig.findUniqueOrThrow({ where: { testType: "IQ" } })).timeLimitMinutes).toBe(config.timeLimitMinutes);
    });
    auth.user = null;
  });
});

describe.skipIf(!dbUp)("questions whose options refer to each other are never shuffled (real database)", () => {
  let kit: Kit;
  let original: SettingValue<"testing">;

  beforeAll(async () => {
    kit = await createKit(prisma, "intnoshuf");
    const bank = await kit.addCatBank("IQ", 40, 0);
    // Every question in this world has "All of the above" as its last option; the second half also has "Both A and B".
    for (const [i, id] of bank.ids.entries()) {
      const options = [
        { key: "A", text: "Paris" },
        { key: "B", text: "London" },
        { key: "C", text: i % 2 ? "Both A and B" : "Berlin" },
        { key: "D", text: "All of the above" },
      ];
      await prisma.question.update({ where: { id }, data: { options } });
    }
    original = await readSetting(prisma, "testing");
    await prisma.siteSetting.upsert({ where: { key: "testing" }, create: { key: "testing", value: { ...original, integrityShuffleOptions: "yes" } }, update: { value: { ...original, integrityShuffleOptions: "yes" } } });
  }, 60_000);
  afterAll(async () => {
    await prisma.siteSetting.update({ where: { key: "testing" }, data: { value: original } });
    await kit.cleanup();
  }, 60_000);

  it("keeps the original order for every candidate and every question, and stores no shuffled order", async () => {
    for (let n = 0; n < 8; n++) {
      const c = await kit.addCandidate(`keep${n}`);
      const { sessionId } = await startOrResume({ prisma }, c.userId, "IQ");
      let view = await getSessionView({ prisma }, c.userId, sessionId);
      for (let step = 0; step < 4 && view.status === "IN_PROGRESS" && view.question; step++) {
        expect(view.question.options.map((o) => o.key).join("")).toBe("ABCD");
        view = await submitAnswer({ prisma }, c.userId, sessionId, { questionId: view.question.id, answer: { key: "B" } });
      }
      const answers = await prisma.response.findMany({ where: { sessionId } });
      expect(answers.length).toBeGreaterThan(0);
      for (const r of answers) expect(r.answerGiven).not.toHaveProperty("shownOrder");
    }
  });
});

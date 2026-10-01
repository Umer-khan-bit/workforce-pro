import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import type { ClaudeClient } from "@/lib/ai/claude";
import { createKit, type Kit } from "./testkit";
import { getOverview, getResult, getSessionView, regradePending, startOrResume, submitAnswer, submitWriting, TestError, type SessionView } from "./session";
import { quartileFor } from "./scoring";
import { IPIP_50_ITEMS } from "@/lib/questionBank/ipipItems";

// These tests run whole sessions against the real database, inside an isolated world (own language, region,
// job role and questions), and use a fake Claude for the writing task. Nothing real is touched or spent.
const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

const ESSAY = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");

function claudeReply(json: unknown) {
  return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(json) }], usage: { input_tokens: 500, output_tokens: 120 } };
}
function fakeClaude(level: string | Error) {
  const create = vi.fn();
  if (level instanceof Error) create.mockRejectedValue(level);
  else create.mockResolvedValue(claudeReply({ cefrLevel: level, criteria: { task: 4, coherence: 3, vocabulary: 3, grammar: 4 }, feedback: "Clear answer with a few small errors." }));
  return { client: { messages: { create } } as unknown as ClaudeClient, create };
}

describe.skipIf(!dbUp)("test sessions (real database)", () => {
  let kit: Kit;
  let iq: Awaited<ReturnType<Kit["addCatBank"]>>;
  const deps = { prisma };

  beforeAll(async () => {
    kit = await createKit(prisma, "eng");
    iq = await kit.addCatBank("IQ", 40, 4);
    await kit.addCatBank("LANGUAGE", 40, 2);
    await kit.addWritingPrompts(2);
    await kit.addCatBank("SKILL", 40, 2);
    await kit.addPersonalityBank();
    await kit.addEqBank(30);
  }, 60_000);

  afterAll(async () => {
    await kit.cleanup();
  }, 60_000);

  /** Plays a session to the end. `pick` chooses each answer; returns every question shown, in order. */
  async function play(
    userId: string,
    sessionId: string,
    opts: { pick?: (q: NonNullable<SessionView["question"]>) => { key?: string; value?: number }; client?: ClaudeClient; essay?: string; d?: Parameters<typeof getSessionView>[0] } = {}
  ) {
    const d = opts.d ?? { prisma, client: opts.client };
    const served: string[] = [];
    let view = await getSessionView(d, userId, sessionId);
    for (let guard = 0; guard < 120 && view.status === "IN_PROGRESS"; guard++) {
      if (view.question) {
        served.push(view.question.id);
        const answer = opts.pick ? opts.pick(view.question) : view.question.type === "LIKERT" ? { value: 4 } : { key: "B" };
        view = await submitAnswer(d, userId, sessionId, { questionId: view.question.id, answer });
      } else if (view.writing) {
        view = await submitWriting(d, userId, sessionId, opts.essay ?? ESSAY);
      } else break;
    }
    return { view, served };
  }

  const correct = () => ({ key: "B" });
  const wrong = () => ({ key: "A" });

  describe("availability", () => {
    it("shows 'not available yet' until there are enough approved questions, and needs a writing task for Language", async () => {
      const empty = await createKit(prisma, "empty");
      try {
        const c = await empty.addCandidate("avail");
        const before = await getOverview(deps, c.userId);
        for (const card of before!.cards) {
          expect(card.status).toBe("UNAVAILABLE");
          if (card.status === "UNAVAILABLE") expect(card.reason).toMatch(/Not available yet/);
        }
        await empty.addCatBank("LANGUAGE", 15, 0);
        const langNoWriting = (await getOverview(deps, c.userId))!.cards.find((x) => x.testType === "LANGUAGE")!;
        expect(langNoWriting.status === "UNAVAILABLE" && langNoWriting.reason).toMatch(/writing task/);

        await empty.addWritingPrompts(1);
        await empty.addCatBank("IQ", 9, 0); // one short of the minimum of 10
        const afterSome = (await getOverview(deps, c.userId))!.cards;
        expect(afterSome.find((x) => x.testType === "LANGUAGE")!.status).toBe("NOT_STARTED");
        expect(afterSome.find((x) => x.testType === "IQ")!.status).toBe("UNAVAILABLE");
      } finally {
        await empty.cleanup();
      }
    });

    it("Skill uses only the candidate's own job role", async () => {
      const other = await kit.addCandidate("otherrole", { roleId: kit.otherRole.id });
      const card = (await getOverview(deps, other.userId))!.cards.find((x) => x.testType === "SKILL")!;
      expect(card.status).toBe("UNAVAILABLE"); // the bank is for the other role
      const mine = await kit.addCandidate("myrole");
      expect((await getOverview(deps, mine.userId))!.cards.find((x) => x.testType === "SKILL")!.status).toBe("NOT_STARTED");
    });

    it("reports the test settings (time and question counts) from the test configuration", async () => {
      const c = await kit.addCandidate("cfg");
      const cards = (await getOverview(deps, c.userId))!.cards;
      const config = await prisma.testConfig.findMany();
      for (const card of cards) {
        if (card.status === "NOT_STARTED") expect(card.minutes).toBe(config.find((x) => x.testType === card.testType)!.timeLimitMinutes);
      }
    });
  });

  describe("starting", () => {
    it("refuses an unconfirmed email, and strangers who are not candidates", async () => {
      const unverified = await kit.addCandidate("unverified", { verified: false });
      await expect(startOrResume(deps, unverified.userId, "IQ")).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED", status: 403 });
      await expect(startOrResume(deps, "no-such-user", "IQ")).rejects.toMatchObject({ status: 403 });
    });

    it("resumes the session in progress instead of starting a second one", async () => {
      const c = await kit.addCandidate("resume");
      const first = await startOrResume(deps, c.userId, "IQ");
      expect(first.resumed).toBe(false);
      const viewBefore = await getSessionView(deps, c.userId, first.sessionId);

      // "Close the browser" and come back: same session, same question, same clock.
      const again = await startOrResume(deps, c.userId, "IQ");
      expect(again).toEqual({ sessionId: first.sessionId, resumed: true });
      const viewAfter = await getSessionView(deps, c.userId, first.sessionId);
      expect(viewAfter.question!.id).toBe(viewBefore.question!.id);
      expect(viewAfter.expiresAt).toBe(viewBefore.expiresAt);
      expect(await prisma.testSession.count({ where: { candidateProfileId: c.profileId, testType: "IQ" } })).toBe(1);
    });

    it("keeps the same order after answering some questions and coming back", async () => {
      const c = await kit.addCandidate("resume2");
      const s = await startOrResume(deps, c.userId, "PERSONALITY");
      let view = await getSessionView(deps, c.userId, s.sessionId);
      const seen: string[] = [];
      for (let i = 0; i < 5; i++) {
        seen.push(view.question!.id);
        view = await submitAnswer(deps, c.userId, s.sessionId, { questionId: view.question!.id, answer: { value: 3 } });
      }
      const back = await getSessionView(deps, c.userId, s.sessionId);
      expect(back.answered).toBe(5);
      expect(back.question!.id).toBe(view.question!.id);
      expect(seen).not.toContain(back.question!.id);
    });

    it("sets the deadline from the test's time limit", async () => {
      const c = await kit.addCandidate("deadline");
      const start = new Date("2026-10-01T09:00:00Z");
      const s = await startOrResume({ prisma, now: () => start }, c.userId, "IQ");
      const config = await prisma.testConfig.findUniqueOrThrow({ where: { testType: "IQ" } });
      const session = await prisma.testSession.findUniqueOrThrow({ where: { id: s.sessionId } });
      expect(session.expiresAt!.getTime() - start.getTime()).toBe(config.timeLimitMinutes * 60_000);
    });
  });

  describe("adaptive test (IQ)", () => {
    it("adapts to a strong candidate, stops within the limits, never repeats, and scores", async () => {
      const c = await kit.addCandidate("iqstrong");
      const s = await startOrResume(deps, c.userId, "IQ");
      const { view, served } = await play(c.userId, s.sessionId, { pick: correct });
      expect(view.status).toBe("COMPLETED");

      const config = await prisma.testConfig.findUniqueOrThrow({ where: { testType: "IQ" } });
      const responses = await prisma.response.findMany({ where: { sessionId: s.sessionId }, include: { question: true } });
      const scored = responses.filter((r) => r.isScored);
      const pretest = responses.filter((r) => !r.isScored);
      expect(scored.length).toBeGreaterThanOrEqual(config.minItems);
      expect(scored.length).toBeLessThanOrEqual(config.maxItems);
      expect(new Set(served).size).toBe(served.length); // no repeated question
      expect(pretest.length).toBeLessThanOrEqual(config.pretestItemCount);
      expect(pretest.length).toBe(2);
      expect(pretest.every((r) => r.question.isPretest)).toBe(true);
      expect(scored.every((r) => !r.question.isPretest)).toBe(true);

      // A candidate who keeps answering correctly is served harder questions as the test goes on
      // (until the hardest questions in a small bank have all been used).
      const order = served.map((id) => responses.find((r) => r.questionId === id)!).filter((r) => r.isScored);
      const mean = (xs: typeof order) => xs.reduce((sum, r) => sum + r.question.bParam, 0) / xs.length;
      expect(mean(order.slice(5, 10))).toBeGreaterThan(mean(order.slice(0, 3)));

      const score = await prisma.score.findUniqueOrThrow({ where: { sessionId: s.sessionId } });
      expect(score.theta).toBeGreaterThan(0.5);
      expect(score.standardError).toBeGreaterThan(0);
      expect(score.rawScore).toBe(100);
      expect(score.rankValue).toBe(score.theta);
      expect(score.percentile).not.toBeNull();
      expect(score.quartile).not.toBeNull();
      expect(score.provisional).toBe(false);
      const session = await prisma.testSession.findUniqueOrThrow({ where: { id: s.sessionId } });
      expect(session).toMatchObject({ status: "COMPLETED", itemsAdministered: scored.length });
      expect(session.completedAt).not.toBeNull();
    }, 60_000);

    it("a weak candidate scores lower than a strong one, and gets easier questions", async () => {
      const weak = await kit.addCandidate("iqweak");
      const s = await startOrResume(deps, weak.userId, "IQ");
      const { view, served } = await play(weak.userId, s.sessionId, { pick: wrong });
      expect(view.status).toBe("COMPLETED");
      const score = await prisma.score.findUniqueOrThrow({ where: { sessionId: s.sessionId } });
      expect(score.theta).toBeLessThan(-0.5);
      expect(score.rawScore).toBe(0);
      const responses = await prisma.response.findMany({ where: { sessionId: s.sessionId }, include: { question: true } });
      const scoredServed = served.map((id) => responses.find((r) => r.questionId === id)!).filter((r) => r.isScored);
      const meanB = (xs: typeof scoredServed) => xs.reduce((sum, r) => sum + r.question.bParam, 0) / xs.length;
      expect(meanB(scoredServed.slice(5, 10))).toBeLessThan(meanB(scoredServed.slice(0, 3)));
      const strong = await prisma.score.findFirstOrThrow({ where: { testType: "IQ", candidateProfile: { user: { email: { contains: `iqstrong-${kit.run}` } } } } });
      expect(strong.theta!).toBeGreaterThan(score.theta!);
    }, 60_000);

    it("puts the pretest items inside the first questions, never first, and records them without scoring", async () => {
      const c = await kit.addCandidate("pretest");
      const s = await startOrResume(deps, c.userId, "IQ");
      const { served } = await play(c.userId, s.sessionId, { pick: correct });
      const pretestIds = new Set(iq.pretestIds);
      const positions = served.map((id, i) => (pretestIds.has(id) ? i : -1)).filter((i) => i >= 0);
      expect(positions).toHaveLength(2);
      expect(positions.every((p) => p >= 1 && p <= 11)).toBe(true);
      for (const id of iq.pretestIds.filter((x) => served.includes(x))) {
        const stat = await prisma.itemStatistic.findUnique({ where: { questionId: id } });
        expect(stat!.responseCount).toBeGreaterThanOrEqual(1);
      }
      const responses = await prisma.response.findMany({ where: { sessionId: s.sessionId, isScored: false } });
      expect(responses).toHaveLength(2);
    }, 60_000);

    it("keeps running statistics for every answered question", async () => {
      const c = await kit.addCandidate("stats");
      const before = await prisma.itemStatistic.aggregate({ where: { questionId: { in: iq.ids } }, _sum: { responseCount: true, correctCount: true } });
      const s = await startOrResume(deps, c.userId, "IQ");
      await play(c.userId, s.sessionId, { pick: correct });
      const after = await prisma.itemStatistic.aggregate({ where: { questionId: { in: iq.ids } }, _sum: { responseCount: true, correctCount: true } });
      const answered = await prisma.response.count({ where: { sessionId: s.sessionId, isScored: true } });
      expect((after._sum.responseCount ?? 0) - (before._sum.responseCount ?? 0)).toBe(answered);
      expect((after._sum.correctCount ?? 0) - (before._sum.correctCount ?? 0)).toBe(answered);
    }, 60_000);
  });

  describe("security of a session", () => {
    it("never sends the correct answer, the item parameters or the pretest flag to the browser", async () => {
      const c = await kit.addCandidate("leak");
      const s = await startOrResume(deps, c.userId, "IQ");
      const json = JSON.stringify(await getSessionView(deps, c.userId, s.sessionId));
      for (const secret of ["correctAnswer", "aParam", "bParam", "isPretest", "explanation", "reviewNotes"]) expect(json).not.toContain(secret);
    });

    it("only the owner can see or answer a session", async () => {
      const a = await kit.addCandidate("owner");
      const b = await kit.addCandidate("intruder");
      const s = await startOrResume(deps, a.userId, "IQ");
      const view = await getSessionView(deps, a.userId, s.sessionId);
      await expect(getSessionView(deps, b.userId, s.sessionId)).rejects.toMatchObject({ status: 404 });
      await expect(submitAnswer(deps, b.userId, s.sessionId, { questionId: view.question!.id, answer: { key: "B" } })).rejects.toMatchObject({ status: 404 });
      await expect(getResult(deps, b.userId, s.sessionId)).rejects.toBeInstanceOf(TestError);
    });

    it("rejects an answer to the wrong question, a second answer to the same question, and invalid answers", async () => {
      const c = await kit.addCandidate("badanswers");
      const s = await startOrResume(deps, c.userId, "IQ");
      const view = await getSessionView(deps, c.userId, s.sessionId);
      const other = iq.ids.find((id) => id !== view.question!.id)!;

      await expect(submitAnswer(deps, c.userId, s.sessionId, { questionId: other, answer: { key: "B" } })).rejects.toMatchObject({ code: "WRONG_QUESTION" });
      await expect(submitAnswer(deps, c.userId, s.sessionId, { questionId: view.question!.id, answer: { key: "Z" } })).rejects.toMatchObject({ code: "BAD_ANSWER" });
      await expect(submitAnswer(deps, c.userId, s.sessionId, { questionId: view.question!.id, answer: {} })).rejects.toMatchObject({ code: "BAD_ANSWER" });

      const first = view.question!.id;
      await submitAnswer(deps, c.userId, s.sessionId, { questionId: first, answer: { key: "B" } });
      await expect(submitAnswer(deps, c.userId, s.sessionId, { questionId: first, answer: { key: "A" } })).rejects.toMatchObject({ code: "WRONG_QUESTION" });
      expect(await prisma.response.count({ where: { sessionId: s.sessionId, questionId: first } })).toBe(1);
    });

    it("two tabs answering at the same moment record only one answer", async () => {
      const c = await kit.addCandidate("twotabs");
      const s = await startOrResume(deps, c.userId, "IQ");
      const view = await getSessionView(deps, c.userId, s.sessionId);
      const tries = await Promise.allSettled(Array.from({ length: 5 }, () => submitAnswer(deps, c.userId, s.sessionId, { questionId: view.question!.id, answer: { key: "B" } })));
      expect(tries.filter((t) => t.status === "fulfilled")).toHaveLength(1);
      expect(await prisma.response.count({ where: { sessionId: s.sessionId } })).toBe(1);
    });

    it("the audit log records start and completion but never the answers", async () => {
      const c = await kit.addCandidate("audit");
      const s = await startOrResume(deps, c.userId, "PERSONALITY");
      await play(c.userId, s.sessionId, { pick: () => ({ value: 5 }) });
      const logs = await prisma.auditLog.findMany({ where: { actorId: c.userId, targetId: s.sessionId } });
      expect(logs.map((l) => l.action).sort()).toEqual(["TEST_COMPLETED", "TEST_STARTED"]);
      const text = JSON.stringify(logs);
      expect(text).not.toMatch(/"value"|answerGiven|"key"/);
      expect(logs.find((l) => l.action === "TEST_COMPLETED")!.metadata).toMatchObject({ testType: "PERSONALITY", answered: 50 });
    }, 60_000);
  });

  describe("timer and auto-submit", () => {
    it("scores the test when time runs out after the minimum number of answers", async () => {
      const c = await kit.addCandidate("timeout-ok");
      let t = new Date("2026-10-01T09:00:00Z");
      const d = { prisma, now: () => t };
      const s = await startOrResume(d, c.userId, "IQ");
      let view = await getSessionView(d, c.userId, s.sessionId);
      const config = await prisma.testConfig.findUniqueOrThrow({ where: { testType: "IQ" } });
      // Alternate right and wrong answers so the estimate stays uncertain and the test keeps going; pretest
      // items do not count towards the minimum, so keep answering until enough scored answers are in.
      for (let i = 0; i < 30 && view.status === "IN_PROGRESS"; i++) {
        if ((await prisma.response.count({ where: { sessionId: s.sessionId, isScored: true } })) >= config.minItems) break;
        view = await submitAnswer(d, c.userId, s.sessionId, { questionId: view.question!.id, answer: { key: i % 2 === 0 ? "B" : "A" } });
      }
      expect(view.status).toBe("IN_PROGRESS");
      expect(await prisma.response.count({ where: { sessionId: s.sessionId, isScored: true } })).toBeGreaterThanOrEqual(config.minItems);

      t = new Date(t.getTime() + 16 * 60_000); // past the 15 minute limit
      const after = await getSessionView(d, c.userId, s.sessionId);
      expect(after.status).toBe("COMPLETED");
      expect(await prisma.score.count({ where: { sessionId: s.sessionId } })).toBe(1);
      const session = await prisma.testSession.findUniqueOrThrow({ where: { id: s.sessionId } });
      expect(session.status).toBe("COMPLETED");
    }, 60_000);

    it("gives no score, and allows a retake at once, when time runs out before the minimum", async () => {
      const c = await kit.addCandidate("timeout-short");
      let t = new Date("2026-10-01T09:00:00Z");
      const d = { prisma, now: () => t };
      const s = await startOrResume(d, c.userId, "IQ");
      const view = await getSessionView(d, c.userId, s.sessionId);
      await submitAnswer(d, c.userId, s.sessionId, { questionId: view.question!.id, answer: { key: "B" } });

      t = new Date(t.getTime() + 16 * 60_000);
      expect((await getSessionView(d, c.userId, s.sessionId)).status).toBe("EXPIRED");
      expect(await prisma.score.count({ where: { sessionId: s.sessionId } })).toBe(0);
      expect(await prisma.auditLog.count({ where: { actorId: c.userId, action: "TEST_EXPIRED" } })).toBe(1);

      const result = await getResult(d, c.userId, s.sessionId);
      expect(result).toMatchObject({ status: "EXPIRED", scored: false });
      const card = (await getOverview(d, c.userId))!.cards.find((x) => x.testType === "IQ")!;
      expect(card.status).toBe("NOT_STARTED");
      const again = await startOrResume(d, c.userId, "IQ");
      expect(again.resumed).toBe(false);
      expect(again.sessionId).not.toBe(s.sessionId);
    }, 60_000);

    it("an answer that arrives long after the deadline ends the test instead of being counted", async () => {
      const c = await kit.addCandidate("late");
      let t = new Date("2026-10-01T09:00:00Z");
      const d = { prisma, now: () => t };
      const s = await startOrResume(d, c.userId, "IQ");
      const view = await getSessionView(d, c.userId, s.sessionId);
      t = new Date(t.getTime() + 20 * 60_000);
      const after = await submitAnswer(d, c.userId, s.sessionId, { questionId: view.question!.id, answer: { key: "B" } });
      expect(after.status).toBe("EXPIRED");
      expect(await prisma.response.count({ where: { sessionId: s.sessionId } })).toBe(0);
    }, 60_000);

    it("starting again after the time ran out while away closes the old test first", async () => {
      const c = await kit.addCandidate("away");
      let t = new Date("2026-10-01T09:00:00Z");
      const d = { prisma, now: () => t };
      const first = await startOrResume(d, c.userId, "IQ");
      t = new Date(t.getTime() + 60 * 60_000);
      const second = await startOrResume(d, c.userId, "IQ");
      expect(second.resumed).toBe(false);
      expect((await prisma.testSession.findUniqueOrThrow({ where: { id: first.sessionId } })).status).toBe("EXPIRED");
    }, 60_000);
  });

  describe("retake rule", () => {
    it("blocks a retake until the waiting time from the test settings has passed", async () => {
      const c = await kit.addCandidate("retake");
      const t0 = new Date("2026-10-01T09:00:00Z");
      let t = t0;
      const d = { prisma, now: () => t };
      const s = await startOrResume(d, c.userId, "PERSONALITY");
      await play(c.userId, s.sessionId, { d, pick: () => ({ value: 3 }) });
      const config = await prisma.testConfig.findUniqueOrThrow({ where: { testType: "PERSONALITY" } });
      const completed = (await prisma.testSession.findUniqueOrThrow({ where: { id: s.sessionId } })).completedAt!;
      const retakeAt = new Date(completed.getTime() + config.retakeWaitingDays * 86_400_000);

      t = new Date(completed.getTime() + 86_400_000);
      await expect(startOrResume(d, c.userId, "PERSONALITY")).rejects.toMatchObject({ code: "RETAKE_LATER", extra: { retakeAt: retakeAt.toISOString() } });
      const card = (await getOverview(d, c.userId))!.cards.find((x) => x.testType === "PERSONALITY")!;
      expect(card).toMatchObject({ status: "COMPLETED", canRetake: false, retakeAt: retakeAt.toISOString() });

      t = new Date(retakeAt.getTime() + 1000);
      expect((await startOrResume(d, c.userId, "PERSONALITY")).resumed).toBe(false);
    }, 90_000);
  });

  describe("Personality (fixed length, reverse-keyed, no ranking)", () => {
    it("serves all 50 items once each and scores the five traits toward stability, with no quartile", async () => {
      const c = await kit.addCandidate("pers");
      const s = await startOrResume(deps, c.userId, "PERSONALITY");
      const { view, served } = await play(c.userId, s.sessionId, { pick: () => ({ value: 5 }) });
      expect(view.status).toBe("COMPLETED");
      expect(served).toHaveLength(50);
      expect(new Set(served).size).toBe(50);

      const score = await prisma.score.findUniqueOrThrow({ where: { sessionId: s.sessionId } });
      expect(score).toMatchObject({ percentile: null, quartile: null, rankValue: null, theta: null, provisional: false });
      const traits = (score.details as { traits: { trait: string; score: number }[] }).traits;
      expect(Object.fromEntries(traits.map((t) => [t.trait, t.score]))).toEqual({
        Extraversion: 3,
        Agreeableness: 3.4,
        Conscientiousness: 3.4,
        "Emotional Stability": 1.8, // agreeing with 8 worry/mood statements is low stability
        Openness: 3.8,
      });
    }, 90_000);

    it("a calm, steady respondent scores 5 on every trait", async () => {
      const c = await kit.addCandidate("persideal");
      const s = await startOrResume(deps, c.userId, "PERSONALITY");
      const reverseByText = new Map(IPIP_50_ITEMS.map((i) => [`${kit.run} ${i.content}`, i.reverse]));
      const { view } = await play(c.userId, s.sessionId, { pick: (q) => ({ value: reverseByText.get(q.content) ? 1 : 5 }) });
      expect(view.status).toBe("COMPLETED");
      const score = await prisma.score.findUniqueOrThrow({ where: { sessionId: s.sessionId } });
      for (const t of (score.details as { traits: { score: number }[] }).traits) expect(t.score).toBe(5);
    }, 90_000);
  });

  describe("EQ (fixed length, Likert and situational judgement)", () => {
    it("serves the configured number of items and scores 0 to 100 with a ranking", async () => {
      const c = await kit.addCandidate("eq");
      const s = await startOrResume(deps, c.userId, "EQ");
      const { view, served } = await play(c.userId, s.sessionId, { pick: (q) => (q.type === "LIKERT" ? { value: 5 } : { key: "B" }) });
      expect(view.status).toBe("COMPLETED");
      const config = await prisma.testConfig.findUniqueOrThrow({ where: { testType: "EQ" } });
      expect(served).toHaveLength(config.maxItems);
      const score = await prisma.score.findUniqueOrThrow({ where: { sessionId: s.sessionId } });
      expect(score.rawScore).toBeGreaterThan(0);
      expect(score.rawScore).toBeLessThanOrEqual(100);
      expect(score.rankValue).toBe(score.rawScore);
      expect(score.quartile).not.toBeNull();
      const responses = await prisma.response.findMany({ where: { sessionId: s.sessionId }, include: { question: true } });
      expect(responses.some((r) => r.question.type === "LIKERT")).toBe(true);
      expect(responses.some((r) => r.question.type === "SITUATIONAL_JUDGEMENT")).toBe(true);
    }, 90_000);
  });

  describe("Language (CAT plus a graded writing task)", () => {
    it("runs the multiple-choice part, then the writing task, graded against the CEFR rubric", async () => {
      const c = await kit.addCandidate("lang");
      const { client, create } = fakeClaude("B2");
      const s = await startOrResume({ prisma, client }, c.userId, "LANGUAGE");
      const { view, served } = await play(c.userId, s.sessionId, { pick: correct, client });
      expect(view.status).toBe("COMPLETED");
      expect(create).toHaveBeenCalledTimes(1);

      const score = await prisma.score.findUniqueOrThrow({ where: { sessionId: s.sessionId } });
      const details = score.details as { mcqTheta: number; writing: { cefr: string } };
      expect(score.cefrLevel).toBe("B2");
      expect(details.writing.cefr).toBe("B2");
      expect(score.provisional).toBe(false);
      // Composite = 70% multiple-choice ability + 30% writing (B2 = 0.4 on the Settings scale).
      expect(score.theta).toBeCloseTo(0.7 * details.mcqTheta + 0.3 * 0.4, 6);
      expect(score.quartile).not.toBeNull();
      expect(served.every((id) => id)).toBe(true);

      // Only the prompt and the answer text go to Claude, never the candidate's name or email.
      const sent = JSON.stringify(create.mock.calls[0][0]);
      expect(sent).not.toContain(c.email);
      expect(sent).not.toContain(`Pat ${kit.run} lang`); // the candidate's name
      expect(sent).toContain("word1");
      const writing = await prisma.writingAssessment.findUniqueOrThrow({ where: { sessionId: s.sessionId } });
      expect(writing).toMatchObject({ cefrLevel: "B2" });
      expect(writing.gradedAt).not.toBeNull();
      expect(await prisma.aiRun.count({ where: { actorId: c.userId, kind: "GRADE", status: "COMPLETED" } })).toBe(1);
    }, 90_000);

    it("uses the writing weight and CEFR scores from Settings", async () => {
      const c = await kit.addCandidate("langweight");
      await prisma.siteSetting.upsert({ where: { key: "testing" }, create: { key: "testing", value: { writingWeightPercent: 100, cefrScoreC1: 1.5 } }, update: { value: { writingWeightPercent: 100, cefrScoreC1: 1.5 } } });
      try {
        const { client } = fakeClaude("C1");
        const s = await startOrResume({ prisma, client }, c.userId, "LANGUAGE");
        await play(c.userId, s.sessionId, { pick: correct, client });
        const score = await prisma.score.findUniqueOrThrow({ where: { sessionId: s.sessionId } });
        expect(score.theta).toBeCloseTo(1.5, 6); // all writing, at the configured C1 score
      } finally {
        await prisma.siteSetting.delete({ where: { key: "testing" } }).catch(() => undefined);
      }
    }, 90_000);

    it("rejects a written answer that is too short, and cuts one that is too long", async () => {
      const c = await kit.addCandidate("langlen");
      const { client } = fakeClaude("B1");
      const s = await startOrResume({ prisma, client }, c.userId, "LANGUAGE");
      let view = await getSessionView({ prisma, client }, c.userId, s.sessionId);
      while (view.question) view = await submitAnswer({ prisma, client }, c.userId, s.sessionId, { questionId: view.question.id, answer: { key: "B" } });
      expect(view.writing).not.toBeNull();
      await expect(submitWriting({ prisma, client }, c.userId, s.sessionId, "far too short", false)).rejects.toMatchObject({ code: "TOO_SHORT" });

      const tooLong = Array.from({ length: 500 }, (_, i) => `w${i}`).join(" ");
      await submitWriting({ prisma, client }, c.userId, s.sessionId, tooLong, false);
      const saved = await prisma.writingAssessment.findUniqueOrThrow({ where: { sessionId: s.sessionId } });
      expect(saved.essayText.split(/\s+/)).toHaveLength(200);
    }, 90_000);

    it("keeps the score provisional when grading is unavailable, then finishes it later", async () => {
      const c = await kit.addCandidate("langfail");
      const broken = fakeClaude(new Error("network down"));
      const s = await startOrResume({ prisma, client: broken.client }, c.userId, "LANGUAGE");
      const { view } = await play(c.userId, s.sessionId, { pick: correct, client: broken.client });
      expect(view.status).toBe("COMPLETED");

      let score = await prisma.score.findUniqueOrThrow({ where: { sessionId: s.sessionId } });
      expect(score).toMatchObject({ provisional: true, percentile: null, quartile: null, cefrLevel: null });
      const pending = await getResult({ prisma, client: broken.client }, c.userId, s.sessionId);
      expect(pending).toMatchObject({ provisional: true, quartile: null });

      const working = fakeClaude("C1");
      expect(await regradePending({ prisma, client: working.client }, c.userId, s.sessionId)).toBe(true);
      score = await prisma.score.findUniqueOrThrow({ where: { sessionId: s.sessionId } });
      expect(score).toMatchObject({ provisional: false, cefrLevel: "C1" });
      expect(score.quartile).not.toBeNull();
      const done = await getResult({ prisma, client: working.client }, c.userId, s.sessionId);
      expect(done).toMatchObject({ provisional: false, cefrLevel: "C1" });
      expect(done.feedback).toMatch(/Clear answer/);
    }, 90_000);

    it("a writing task that runs out of time is submitted as it stands", async () => {
      const c = await kit.addCandidate("langtime");
      const { client } = fakeClaude("A2");
      let t = new Date("2026-10-01T09:00:00Z");
      const d = { prisma, client, now: () => t };
      const s = await startOrResume(d, c.userId, "LANGUAGE");
      let view = await getSessionView(d, c.userId, s.sessionId);
      while (view.question) view = await submitAnswer(d, c.userId, s.sessionId, { questionId: view.question.id, answer: { key: "B" } });
      t = new Date(t.getTime() + 20 * 60_000 + 5_000); // 5 seconds after the 20 minute limit, within the network grace
      const after = await submitWriting(d, c.userId, s.sessionId, "a short unfinished answer", true);
      expect(after.status).toBe("COMPLETED");
      expect(await prisma.writingAssessment.count({ where: { sessionId: s.sessionId } })).toBe(1);
    }, 90_000);

    it("with no writing at all, the score uses the multiple-choice ability alone", async () => {
      const c = await kit.addCandidate("langnowrite");
      let t = new Date("2026-10-01T09:00:00Z");
      const d = { prisma, now: () => t };
      const s = await startOrResume(d, c.userId, "LANGUAGE");
      let view = await getSessionView(d, c.userId, s.sessionId);
      while (view.question) view = await submitAnswer(d, c.userId, s.sessionId, { questionId: view.question.id, answer: { key: "B" } });
      t = new Date(t.getTime() + 25 * 60_000);
      expect((await getSessionView(d, c.userId, s.sessionId)).status).toBe("COMPLETED");
      const score = await prisma.score.findUniqueOrThrow({ where: { sessionId: s.sessionId } });
      expect(score.cefrLevel).toBeNull();
      expect(score.theta).toBeCloseTo((score.details as { mcqTheta: number }).mcqTheta, 6);
    }, 90_000);
  });

  describe("ranking against other candidates", () => {
    it("ranks within the job role once it has enough candidates, using the minimum from Settings", async () => {
      const cohortKit = await createKit(prisma, "cohort");
      try {
        await cohortKit.addCatBank("IQ", 40, 0);
        const minCohort = 30;
        // 30 other candidates in the role, spread from -1.5 to +1.5
        for (let i = 0; i < minCohort; i++) {
          const other = await cohortKit.addCandidate(`peer${i}`);
          await cohortKit.addScore(other.profileId, "IQ", -1.5 + (3 * i) / (minCohort - 1));
        }
        const me = await cohortKit.addCandidate("me");
        const s = await startOrResume(deps, me.userId, "IQ");
        await play(me.userId, s.sessionId, { pick: correct });
        const score = await prisma.score.findUniqueOrThrow({ where: { sessionId: s.sessionId } });
        expect(score.cohortScope).toBe("ROLE");
        expect(score.cohortSize).toBe(minCohort + 1);
        // A strong result sits at the top of a cohort spread from -1.5 to 1.5.
        expect(score.percentile).toBeGreaterThan(90);
        expect(score.quartile).toBe(1);
      } finally {
        await cohortKit.cleanup();
      }
    }, 120_000);

    it("falls back to all candidates when the role is too small, and says how many it used", async () => {
      const cohortKit = await createKit(prisma, "fallback");
      try {
        await cohortKit.addCatBank("IQ", 40, 0);
        // Only 3 peers in this role (fewer than 30) ...
        for (let i = 0; i < 3; i++) await cohortKit.addScore((await cohortKit.addCandidate(`peer${i}`)).profileId, "IQ", 5 + i);
        const me = await cohortKit.addCandidate("me");
        const s = await startOrResume(deps, me.userId, "IQ");
        await play(me.userId, s.sessionId, { pick: wrong });
        const score = await prisma.score.findUniqueOrThrow({ where: { sessionId: s.sessionId } });
        expect(score.cohortScope).toBe("ALL");
        expect(score.cohortSize).toBeGreaterThanOrEqual(4);
        const result = await getResult(deps, me.userId, s.sessionId);
        expect(result.cohort).toMatchObject({ scope: "ALL", small: expect.any(Boolean) });
        expect(result.cohort!.size).toBe(score.cohortSize);
        // ... all of whom scored higher than this weak candidate: bottom of the group.
        expect(score.quartile).toBe(4);
      } finally {
        await cohortKit.cleanup();
      }
    }, 120_000);

    it("ignores anonymised candidates and results still waiting for a writing grade", async () => {
      const cohortKit = await createKit(prisma, "ignore");
      try {
        const ghost = await cohortKit.addCandidate("ghost");
        await cohortKit.addScore(ghost.profileId, "EQ", 99);
        await prisma.candidateProfile.update({ where: { id: ghost.profileId }, data: { anonymisedAt: new Date() } });
        const pending = await cohortKit.addCandidate("pending");
        await cohortKit.addScore(pending.profileId, "EQ", 98, { provisional: true });
        await cohortKit.addEqBank(25);
        const me = await cohortKit.addCandidate("me");
        const s = await startOrResume(deps, me.userId, "EQ");
        await play(me.userId, s.sessionId, { pick: (q) => (q.type === "LIKERT" ? { value: 5 } : { key: "B" }) });
        const score = await prisma.score.findUniqueOrThrow({ where: { sessionId: s.sessionId } });
        // Only the candidate themself is left to compare with.
        expect(score.cohortSize).toBe(1 + (await prisma.score.count({ where: { testType: "EQ", provisional: false, rankValue: { not: null }, candidateProfile: { anonymisedAt: null, NOT: { id: (await prisma.candidateProfile.findFirstOrThrow({ where: { userId: me.userId } })).id } } } })));
        expect(score.cohortSize).toBeGreaterThanOrEqual(1);
      } finally {
        await cohortKit.cleanup();
      }
    }, 120_000);

    it("uses only the candidate's latest attempt when they retake", async () => {
      const cohortKit = await createKit(prisma, "latest");
      try {
        const peer = await cohortKit.addCandidate("peer");
        await cohortKit.addScore(peer.profileId, "EQ", 10);
        await new Promise((r) => setTimeout(r, 20));
        await cohortKit.addScore(peer.profileId, "EQ", 90); // latest
        await cohortKit.addEqBank(25);
        const me = await cohortKit.addCandidate("me");
        const s = await startOrResume(deps, me.userId, "EQ");
        await play(me.userId, s.sessionId, { pick: (q) => (q.type === "LIKERT" ? { value: 1 } : { key: "A" }) });
        const score = await prisma.score.findUniqueOrThrow({ where: { sessionId: s.sessionId } });
        // The peer counts once, with 90: a very low EQ score ranks below them.
        expect(score.percentile).toBeLessThanOrEqual(50);
        expect(quartileFor(score.percentile!, { q1TopPercent: 25, q2TopPercent: 50, q3TopPercent: 75 })).toBeGreaterThanOrEqual(3);
      } finally {
        await cohortKit.cleanup();
      }
    }, 120_000);
  });
});

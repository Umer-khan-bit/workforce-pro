import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import type { ClaudeClient } from "@/lib/ai/claude";
import { createKit, type Kit } from "./testkit";
import { getSessionView, startOrResume, submitAnswer, submitWriting, type SessionView } from "./session";

// What happens when an admin retires a question while a candidate is in the middle of a test: the candidate may finish the question
// on screen, but it is not scored (and does not feed the statistics); a replacement is found so the test keeps its length.
const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const ESSAY = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
const retire = (...ids: string[]) => prisma.question.updateMany({ where: { id: { in: ids } }, data: { status: "RETIRED" } });

describe.skipIf(!dbUp)("a question retired during a running test (real database)", () => {
  let kit: Kit;
  const deps = { prisma };

  beforeAll(async () => {
    kit = await createKit(prisma, "ret");
    await kit.addCatBank("IQ", 40, 0);
    await kit.addCatBank("LANGUAGE", 40, 0);
    await kit.addWritingPrompts(2);
    await kit.addPersonalityBank();
  }, 60_000);

  afterAll(async () => {
    await kit.cleanup();
  }, 60_000);

  const answerCurrent = async (d: Parameters<typeof getSessionView>[0], userId: string, sessionId: string, view: SessionView) =>
    submitAnswer(d, userId, sessionId, { questionId: view.question!.id, answer: view.question!.type === "LIKERT" ? { value: 4 } : { key: "B" } });

  async function finish(d: Parameters<typeof getSessionView>[0], userId: string, sessionId: string, first: SessionView) {
    const served: string[] = [];
    let view = first;
    for (let guard = 0; guard < 120 && view.status === "IN_PROGRESS"; guard++) {
      if (view.question) {
        served.push(view.question.id);
        view = await answerCurrent(d, userId, sessionId, view);
      } else break;
    }
    return { view, served };
  }

  it("adaptive test: the candidate finishes the retired question, it is not scored, and another question takes its place", async () => {
    const c = await kit.addCandidate("adapt");
    const s = await startOrResume(deps, c.userId, "IQ");
    const first = await getSessionView(deps, c.userId, s.sessionId);
    const withdrawnId = first.question!.id;
    await retire(withdrawnId);

    const second = await answerCurrent(deps, c.userId, s.sessionId, first);
    const response = await prisma.response.findUniqueOrThrow({ where: { sessionId_questionId: { sessionId: s.sessionId, questionId: withdrawnId } } });
    expect(response.isScored).toBe(false);
    expect(await prisma.itemStatistic.count({ where: { questionId: withdrawnId } })).toBe(0); // it does not feed the statistics
    const mid = await prisma.testSession.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(mid.itemsAdministered).toBe(0);
    expect(second.status).toBe("IN_PROGRESS");
    expect(second.question!.id).not.toBe(withdrawnId);

    const { view } = await finish(deps, c.userId, s.sessionId, second);
    expect(view.status).toBe("COMPLETED");
    const config = await prisma.testConfig.findUniqueOrThrow({ where: { testType: "IQ" } });
    const scored = await prisma.response.count({ where: { sessionId: s.sessionId, isScored: true } });
    expect(scored).toBeGreaterThanOrEqual(config.minItems); // the test still collected enough scored answers
    expect((await prisma.score.findUniqueOrThrow({ where: { sessionId: s.sessionId } })).provisional).toBe(false);
  }, 90_000);

  it("adaptive test: a question retired before it is shown is never shown", async () => {
    const c = await kit.addCandidate("adapt2");
    const s = await startOrResume(deps, c.userId, "IQ");
    const first = await getSessionView(deps, c.userId, s.sessionId);
    const everyone = await prisma.question.findMany({ where: { languageId: kit.language.id, testType: "IQ", status: "APPROVED" }, select: { id: true } });
    const gone = everyone.map((q) => q.id).filter((id) => id !== first.question!.id).slice(0, 25);
    await retire(...gone);
    const { served, view } = await finish(deps, c.userId, s.sessionId, first);
    expect(view.status).toBe("COMPLETED");
    expect(served.filter((id) => gone.includes(id))).toEqual([]);
  }, 90_000);

  it("Personality: a retired item is finished unscored and replaced by another item of the same trait, so the test keeps its length", async () => {
    const c = await kit.addCandidate("pers");
    const s = await startOrResume(deps, c.userId, "PERSONALITY");
    const first = await getSessionView(deps, c.userId, s.sessionId);
    const withdrawn = await prisma.question.findUniqueOrThrow({ where: { id: first.question!.id } });
    const spare = await prisma.question.create({
      data: { testType: "PERSONALITY", type: "LIKERT", content: `${kit.run} spare ${withdrawn.topic}`, topic: withdrawn.topic, reverseKeyed: withdrawn.reverseKeyed, aParam: 1, bParam: 0, status: "APPROVED", languageId: kit.language.id },
    });
    await retire(withdrawn.id);

    const second = await answerCurrent(deps, c.userId, s.sessionId, first);
    const rest = await finish(deps, c.userId, s.sessionId, second);
    const served = [withdrawn.id, ...rest.served];
    expect(rest.view.status).toBe("COMPLETED");
    expect(served).toContain(spare.id);
    expect(served).toHaveLength(51);
    const responses = await prisma.response.findMany({ where: { sessionId: s.sessionId } });
    expect(responses.filter((r) => r.isScored)).toHaveLength(50);
    expect(responses.find((r) => r.questionId === withdrawn.id)?.isScored).toBe(false);
    const score = await prisma.score.findUniqueOrThrow({ where: { sessionId: s.sessionId } });
    expect((score.details as { traits: unknown[] }).traits).toHaveLength(5);
  }, 120_000);

  it("Personality: an item retired before it is shown is dropped, and the test finishes with the items that are left", async () => {
    const c = await kit.addCandidate("pers2");
    const s = await startOrResume(deps, c.userId, "PERSONALITY");
    const first = await getSessionView(deps, c.userId, s.sessionId);
    const state = (await prisma.testSession.findUniqueOrThrow({ where: { id: s.sessionId } })).resumeState as { fixedOrder: string[] };
    const later = state.fixedOrder.slice(10, 12);
    await retire(...later);
    const { served, view } = await finish(deps, c.userId, s.sessionId, first);
    expect(view.status).toBe("COMPLETED");
    expect(served.filter((id) => later.includes(id))).toEqual([]);
    expect(await prisma.response.count({ where: { sessionId: s.sessionId, isScored: true } })).toBe(served.length);
  }, 120_000);

  it("Language: a writing task retired while the candidate writes is finished but neither stored nor graded", async () => {
    const c = await kit.addCandidate("write");
    const create = vi.fn();
    const d = { prisma, client: { messages: { create } } as unknown as ClaudeClient };
    const s = await startOrResume(d, c.userId, "LANGUAGE");
    let view = await getSessionView(d, c.userId, s.sessionId);
    while (view.question) view = await answerCurrent(d, c.userId, s.sessionId, view);
    expect(view.writing).not.toBeNull();
    const state = (await prisma.testSession.findUniqueOrThrow({ where: { id: s.sessionId } })).resumeState as { writingQuestionId: string };
    await retire(state.writingQuestionId);

    const done = await submitWriting(d, c.userId, s.sessionId, ESSAY);
    expect(done.status).toBe("COMPLETED");
    expect(create).not.toHaveBeenCalled(); // nothing was sent to Claude
    expect(await prisma.writingAssessment.count({ where: { sessionId: s.sessionId } })).toBe(0);
    const score = await prisma.score.findUniqueOrThrow({ where: { sessionId: s.sessionId } });
    expect(score).toMatchObject({ provisional: false, cefrLevel: null });
  }, 120_000);
});

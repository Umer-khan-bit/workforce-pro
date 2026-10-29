import type { Prisma, PrismaClient, TestType } from "@prisma/client";
import { readSetting } from "@/lib/settings/store";
import { AiError, toAiError } from "@/lib/ai/errors";
import type { ClaudeClient } from "@/lib/ai/claude";
import { exposureRate, pretestPositions, selectNextItem, shouldStop, type CatItem } from "./cat";
import {
  ADAPTIVE_TESTS,
  checkPool,
  isAdaptive,
  loadCandidate,
  loadPool,
  loadWritingPrompts,
  lockKey,
  resolveLanguage,
  TEST_ORDER,
  type Candidate,
  type Db,
} from "./context";
import { buildFixedForm } from "./fixedForm";
import { estimateAbility, type ScoredAnswer } from "./irt";
import { rankAgainstCohort } from "./ranking";
import { evaluateTopPerformer } from "@/lib/results/topPerformer";
import { trainingUnlocksRetake } from "@/lib/training/retake";
import { newSeed, seededRandom, shuffle } from "./rng";
import {
  CEFR_LEVELS,
  languageComposite,
  percentCorrect,
  scoreEq,
  scorePersonality,
  type CefrLevel,
  type EqAnswer,
  type LikertAnswer,
} from "./scoring";
import { countWords, gradeWriting, limitWords } from "./writing";

/** An error with a message that is safe to show the candidate, and the HTTP status to send. */
export class TestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "TestError";
  }
}

// Network tolerance (technical, not a business rule): an answer or the auto-submitted essay may arrive
// just after the clock reaches zero.
const ANSWER_GRACE_MS = 3_000;
const WRITING_GRACE_MS = 20_000;
const DAY_MS = 86_400_000;

type Phase = "QUESTIONS" | "WRITING" | "DONE";
type ResumeState = {
  seed: number;
  /** Fixed-length tests: the questions in the order they will be shown. */
  fixedOrder?: string[];
  /** Adaptive tests: positions (0-based) that hold unscored pretest items. */
  pretestSlots?: number[];
  current: { questionId: string; pretest: boolean; servedAt: string } | null;
  phase: Phase;
  writingQuestionId?: string;
};

const asState = (v: unknown) => v as ResumeState;
const toJson = (s: ResumeState) => s as unknown as Prisma.InputJsonValue;

type Deps = { prisma: PrismaClient; client?: ClaudeClient; now?: () => Date };
const clock = (d: Deps) => (d.now ?? (() => new Date()))();

async function loadConfig(db: Db, testType: TestType) {
  const config = await db.testConfig.findUnique({ where: { testType } });
  if (!config) throw new TestError(503, "NOT_CONFIGURED", "This test has not been set up yet.");
  return config;
}

// ---------------------------------------------------------------- overview (My tests)

export type TestCard =
  | { testType: TestType; status: "UNAVAILABLE"; reason: string }
  | { testType: TestType; status: "NOT_STARTED"; minutes: number; questions: string }
  | { testType: TestType; status: "IN_PROGRESS"; sessionId: string; expiresAt: string; minutes: number }
  | {
      testType: TestType;
      status: "COMPLETED";
      sessionId: string;
      completedAt: string;
      retakeAt: string | null;
      canRetake: boolean;
      minutes: number;
      provisional: boolean;
    };

/** One card per test for the My tests page: availability for this candidate and the state of their attempts. */
export async function getOverview(deps: Deps, userId: string): Promise<{ verified: boolean; language: string | null; cards: TestCard[] } | null> {
  const { prisma } = deps;
  const candidate = await loadCandidate(prisma, userId);
  if (!candidate) return null;
  const now = clock(deps);
  const language = await resolveLanguage(prisma, candidate.regionId);
  const configs = await prisma.testConfig.findMany();

  const cards: TestCard[] = [];
  for (const testType of TEST_ORDER) {
    const config = configs.find((c) => c.testType === testType);
    if (!config) {
      cards.push({ testType, status: "UNAVAILABLE", reason: "This test has not been set up yet." });
      continue;
    }
    // Expire a session whose time ran out, so the card reflects reality.
    const running = await prisma.testSession.findFirst({ where: { candidateProfileId: candidate.profileId, testType, status: "IN_PROGRESS" } });
    if (running && running.expiresAt && running.expiresAt.getTime() <= now.getTime()) {
      await finalizeSession(deps, running.id, "TIMEOUT");
    } else if (running) {
      cards.push({ testType, status: "IN_PROGRESS", sessionId: running.id, expiresAt: running.expiresAt!.toISOString(), minutes: config.timeLimitMinutes });
      continue;
    }

    const last = await prisma.testSession.findFirst({
      where: { candidateProfileId: candidate.profileId, testType, status: "COMPLETED", score: { isNot: null } },
      orderBy: { completedAt: "desc" },
      include: { score: true },
    });
    if (last?.completedAt && !last.score?.voidedAt) {
      const retakeAt = new Date(last.completedAt.getTime() + config.retakeWaitingDays * DAY_MS);
      const canRetake = retakeAt.getTime() <= now.getTime() || (await trainingUnlocksRetake(prisma, candidate.profileId, testType, last.completedAt));
      const unavailable = canRetake ? await checkPool(prisma, testType, language, candidate.jobRoleId, config.minItems) : null;
      cards.push({
        testType,
        status: "COMPLETED",
        sessionId: last.id,
        completedAt: last.completedAt.toISOString(),
        retakeAt: canRetake ? null : retakeAt.toISOString(),
        canRetake: canRetake && !unavailable,
        minutes: config.timeLimitMinutes,
        provisional: last.score?.provisional ?? false,
      });
      continue;
    }

    const unavailable = await checkPool(prisma, testType, language, candidate.jobRoleId, config.minItems);
    if (unavailable) cards.push({ testType, status: "UNAVAILABLE", reason: unavailable.reason });
    else
      cards.push({
        testType,
        status: "NOT_STARTED",
        minutes: config.timeLimitMinutes,
        questions: isAdaptive(testType) ? `${config.minItems} to ${config.maxItems}` : String(config.maxItems),
      });
  }
  return { verified: candidate.verified, language: language?.name ?? null, cards };
}

// ---------------------------------------------------------------- start / resume

/** Starts a test, or returns the one already in progress (resume). */
export async function startOrResume(deps: Deps, userId: string, testType: TestType): Promise<{ sessionId: string; resumed: boolean }> {
  const { prisma } = deps;
  const candidate = await loadCandidate(prisma, userId);
  if (!candidate) throw new TestError(403, "FORBIDDEN", "Only candidates can take tests.");
  if (!candidate.verified) throw new TestError(403, "EMAIL_NOT_VERIFIED", "Please confirm your email address first.");
  const now = clock(deps);
  const config = await loadConfig(prisma, testType);

  const running = await prisma.testSession.findFirst({ where: { candidateProfileId: candidate.profileId, testType, status: "IN_PROGRESS" } });
  if (running) {
    if (running.expiresAt && running.expiresAt.getTime() > now.getTime()) return { sessionId: running.id, resumed: true };
    await finalizeSession(deps, running.id, "TIMEOUT"); // time ran out while they were away
  }

  const last = await prisma.testSession.findFirst({
    where: { candidateProfileId: candidate.profileId, testType, status: "COMPLETED", score: { isNot: null } },
    orderBy: { completedAt: "desc" },
  });
  // A result an admin cancelled after an integrity review does not make the candidate wait.
  if (last?.completedAt && !(await prisma.score.findFirst({ where: { sessionId: last.id, voidedAt: { not: null } }, select: { id: true } }))) {
    const retakeAt = new Date(last.completedAt.getTime() + config.retakeWaitingDays * DAY_MS);
    if (retakeAt.getTime() > now.getTime() && !(await trainingUnlocksRetake(prisma, candidate.profileId, testType, last.completedAt))) {
      throw new TestError(409, "RETAKE_LATER", `You can take this test again on ${retakeAt.toISOString().slice(0, 10)}.`, { retakeAt: retakeAt.toISOString() });
    }
  }

  const language = await resolveLanguage(prisma, candidate.regionId);
  const unavailable = await checkPool(prisma, testType, language, candidate.jobRoleId, config.minItems);
  if (unavailable || !language) throw new TestError(409, "UNAVAILABLE", unavailable?.reason ?? "This test is not available yet.");

  const sessionId = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `start:${candidate.profileId}:${testType}`);
    const again = await tx.testSession.findFirst({ where: { candidateProfileId: candidate.profileId, testType, status: "IN_PROGRESS" } });
    if (again) return again.id;

    const seed = newSeed();
    const random = seededRandom(seed);
    const state: ResumeState = { seed, current: null, phase: "QUESTIONS" };

    if (isAdaptive(testType)) {
      const pretestPool = await loadPool(tx, testType, language.id, candidate.jobRoleId, true);
      const count = Math.min(config.pretestItemCount, pretestPool.length);
      state.pretestSlots = count > 0 ? pretestPositions(count, config.minItems, random) : [];
    } else {
      const pool = await loadPool(tx, testType, language.id, candidate.jobRoleId);
      state.fixedOrder = buildFixedForm(pool, Math.min(config.maxItems, pool.length), random);
    }

    const session = await tx.testSession.create({
      data: {
        candidateProfileId: candidate.profileId,
        testType,
        languageId: language.id,
        status: "IN_PROGRESS",
        theta: 0,
        expiresAt: new Date(now.getTime() + config.timeLimitMinutes * 60_000),
        startedAt: now,
        resumeState: toJson(state),
      },
    });
    await advance(tx, session.id, testType, candidate, language.id, config, state);
    await tx.testSession.update({ where: { id: session.id }, data: { resumeState: toJson(state) } });
    await tx.auditLog.create({
      data: { actorId: userId, action: "TEST_STARTED", targetType: "TestSession", targetId: session.id, metadata: { testType } },
    });
    return session.id;
  });
  return { sessionId, resumed: false };
}

// ---------------------------------------------------------------- choosing the next question

type TestConfigRow = Awaited<ReturnType<typeof loadConfig>>;

async function loadAnswered(db: Db, sessionId: string) {
  return db.response.findMany({
    where: { sessionId },
    orderBy: { answeredAt: "asc" },
    include: { question: { select: { aParam: true, bParam: true, topic: true, type: true, reverseKeyed: true } } },
  });
}

/**
 * A question that is no longer approved (an admin retired it, or it went back for review) while a candidate is in the middle
 * of a test. The candidate may still finish the question on screen, but it is not scored. Fixed tests then add one more
 * approved question on the same topic (for Personality, the same trait) so the test keeps its length; adaptive tests simply
 * pick another item, because they run until enough scored answers are in.
 */
async function addReplacement(tx: Db, testType: TestType, languageId: string, jobRoleId: string | null, topic: string | null, order: string[], random: () => number) {
  const pool = (await loadPool(tx, testType, languageId, jobRoleId)).filter((p) => !order.includes(p.id) && (topic === null || p.topic === topic));
  if (pool.length > 0) order.push(pool[Math.floor(random() * pool.length)].id);
}

/**
 * Works out what comes next and stores it in `state` (current question, or the writing phase, or done).
 * Fixed tests follow their stored order; adaptive tests apply the stopping rule, then place a pretest
 * item if this position holds one, otherwise pick the most informative unseen item.
 */
async function advance(
  tx: Db,
  sessionId: string,
  testType: TestType,
  candidate: Pick<Candidate, "jobRoleId">,
  languageId: string,
  config: TestConfigRow,
  state: ResumeState
): Promise<void> {
  const answered = await loadAnswered(tx, sessionId);
  const position = answered.length;
  state.current = null;

  if (!isAdaptive(testType)) {
    const order = state.fixedOrder ?? [];
    // Questions that were retired after the form was built are never shown: they are dropped and replaced.
    while (order[position]) {
      const upcoming = await tx.question.findUnique({ where: { id: order[position] }, select: { status: true, topic: true } });
      if (upcoming?.status === "APPROVED") break;
      order.splice(position, 1);
      await addReplacement(tx, testType, languageId, candidate.jobRoleId, upcoming?.topic ?? null, order, seededRandom(state.seed + order.length * 104729));
    }
    state.fixedOrder = order;
    const next = order[position];
    if (next) state.current = { questionId: next, pretest: false, servedAt: new Date().toISOString() };
    else state.phase = "DONE";
    return;
  }

  const scored: ScoredAnswer[] = answered
    .filter((r) => r.isScored && r.isCorrect !== null)
    .map((r) => ({ a: r.question.aParam, b: r.question.bParam, correct: Boolean(r.isCorrect) }));
  const estimate = estimateAbility(scored);
  const seen = new Set(answered.map((r) => r.questionId));

  const finished = shouldStop({
    scoredCount: scored.length,
    standardError: estimate.se,
    minItems: config.minItems,
    maxItems: config.maxItems,
    seThreshold: config.seThreshold,
  });

  if (!finished) {
    const random = seededRandom(state.seed + (position + 1) * 7919);

    if (state.pretestSlots?.includes(position)) {
      const pretestPool = (await loadPool(tx, testType, languageId, candidate.jobRoleId, true)).filter((p) => !seen.has(p.id));
      if (pretestPool.length > 0) {
        const pick = pretestPool[Math.floor(random() * pretestPool.length)];
        state.current = { questionId: pick.id, pretest: true, servedAt: new Date().toISOString() };
        return;
      }
    }

    const [engine, pool] = await Promise.all([readSetting(tx, "testEngine"), loadPool(tx, testType, languageId, candidate.jobRoleId)]);
    const [stats, testsTaken] = await Promise.all([
      tx.itemStatistic.findMany({ where: { questionId: { in: pool.map((p) => p.id) } }, select: { questionId: true, responseCount: true } }),
      tx.testSession.count({ where: { testType } }),
    ]);
    const used = new Map(stats.map((s) => [s.questionId, s.responseCount]));
    const items: CatItem[] = pool.map((p) => ({ ...p, exposure: exposureRate(used.get(p.id) ?? 0, testsTaken, engine.exposureWarmupSessions) }));

    const servedTopics = new Map<string, number>();
    for (const r of answered) if (r.question.topic) servedTopics.set(r.question.topic, (servedTopics.get(r.question.topic) ?? 0) + 1);

    const next = selectNextItem({ theta: estimate.theta, pool: items, seenIds: seen, servedTopics, settings: engine, random });
    if (next) {
      state.current = { questionId: next.id, pretest: false, servedAt: new Date().toISOString() };
      return;
    }
  }

  // No more multiple-choice questions. Language continues with the writing task.
  if (testType === "LANGUAGE") {
    const prompts = await loadWritingPrompts(tx, languageId);
    if (prompts.length > 0) {
      state.phase = "WRITING";
      state.writingQuestionId = shuffle(prompts, seededRandom(state.seed))[0];
      return;
    }
  }
  state.phase = "DONE";
}

// ---------------------------------------------------------------- what the page shows

export type SessionView = {
  id: string;
  testType: TestType;
  status: "IN_PROGRESS" | "COMPLETED" | "EXPIRED" | "ABANDONED";
  phase: Phase;
  expiresAt: string;
  serverNow: string;
  answered: number;
  /** Most questions the test can show (an upper limit for adaptive tests). */
  total: number;
  languageName: string | null;
  rtl: boolean;
  question: null | {
    id: string;
    type: "MCQ" | "LIKERT" | "SITUATIONAL_JUDGEMENT";
    content: string;
    options: { key: string; text: string }[];
  };
  writing: null | { prompt: string; minWords: number; maxWords: number; notice: string };
};

async function ownedSession(db: Db, userId: string, sessionId: string) {
  const session = await db.testSession.findUnique({ where: { id: sessionId }, include: { candidateProfile: { select: { userId: true, jobRoleId: true } } } });
  if (!session || session.candidateProfile.userId !== userId) throw new TestError(404, "NOT_FOUND", "Test not found.");
  return session;
}

async function buildView(db: Db, session: Awaited<ReturnType<typeof ownedSession>>, now: Date): Promise<SessionView> {
  const state = asState(session.resumeState);
  const [config, answered, language, testing] = await Promise.all([
    loadConfig(db, session.testType),
    db.response.count({ where: { sessionId: session.id } }),
    session.languageId ? db.language.findUnique({ where: { id: session.languageId } }) : null,
    readSetting(db, "testing"),
  ]);

  const view: SessionView = {
    id: session.id,
    testType: session.testType,
    status: session.status,
    phase: state.phase,
    expiresAt: (session.expiresAt ?? now).toISOString(),
    serverNow: now.toISOString(),
    answered,
    total: isAdaptive(session.testType) ? config.maxItems + config.pretestItemCount : (state.fixedOrder?.length ?? config.maxItems),
    languageName: language?.name ?? null,
    rtl: language?.isRtl ?? false,
    question: null,
    writing: null,
  };
  if (session.status !== "IN_PROGRESS") return view;

  if (state.phase === "QUESTIONS" && state.current) {
    const q = await db.question.findUnique({ where: { id: state.current.questionId }, select: { id: true, type: true, content: true, options: true } });
    if (q && (q.type === "MCQ" || q.type === "LIKERT" || q.type === "SITUATIONAL_JUDGEMENT")) {
      // The correct answer and the item's statistics are never sent to the browser.
      view.question = { id: q.id, type: q.type, content: q.content, options: Array.isArray(q.options) ? (q.options as { key: string; text: string }[]) : [] };
    }
  }
  if (state.phase === "WRITING" && state.writingQuestionId) {
    const q = await db.question.findUnique({ where: { id: state.writingQuestionId }, select: { content: true } });
    view.writing = { prompt: q?.content ?? "", minWords: testing.writingMinWords, maxWords: testing.writingMaxWords, notice: testing.writingNotice };
  }
  return view;
}

/** The current state of a session for the test screen. Ends the test if its time has run out. */
export async function getSessionView(deps: Deps, userId: string, sessionId: string): Promise<SessionView> {
  const { prisma } = deps;
  let session = await ownedSession(prisma, userId, sessionId);
  const now = clock(deps);
  if (session.status === "IN_PROGRESS" && session.expiresAt && session.expiresAt.getTime() <= now.getTime()) {
    // Language: an essay that is being written when time ends is submitted by the page (see submitWriting).
    const state = asState(session.resumeState);
    const writingGrace = state.phase === "WRITING" && session.expiresAt.getTime() + WRITING_GRACE_MS > now.getTime();
    if (!writingGrace) {
      await finalizeSession(deps, session.id, "TIMEOUT");
      session = await ownedSession(prisma, userId, sessionId);
    }
  }
  return buildView(prisma, session, now);
}

// ---------------------------------------------------------------- answering

export type AnswerInput = { questionId: string; answer: { key?: string; value?: number } };

function readAnswer(type: "MCQ" | "LIKERT" | "SITUATIONAL_JUDGEMENT" | "WRITING", options: unknown, answer: AnswerInput["answer"]) {
  if (type === "LIKERT") {
    const v = answer.value;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) throw new TestError(400, "BAD_ANSWER", "Choose a number from 1 to 5.");
    return { given: { value: v } as Prisma.InputJsonValue, correct: null as boolean | null, key: null as string | null, value: v };
  }
  const keys = Array.isArray(options) ? (options as { key: string }[]).map((o) => o.key) : [];
  if (typeof answer.key !== "string" || !keys.includes(answer.key)) throw new TestError(400, "BAD_ANSWER", "Choose one of the answers.");
  return { given: { key: answer.key } as Prisma.InputJsonValue, correct: null as boolean | null, key: answer.key, value: null as number | null };
}

/** Records an answer and moves on to the next question (or to writing, or to the end). */
export async function submitAnswer(deps: Deps, userId: string, sessionId: string, input: AnswerInput): Promise<SessionView> {
  const { prisma } = deps;
  const now = clock(deps);
  const outcome = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `session:${sessionId}`);
    const session = await ownedSession(tx, userId, sessionId);
    if (session.status !== "IN_PROGRESS") return { timedOut: false, finished: true as const };

    if (session.expiresAt && now.getTime() > session.expiresAt.getTime() + ANSWER_GRACE_MS) return { timedOut: true, finished: false as const };

    const state = asState(session.resumeState);
    if (state.phase !== "QUESTIONS" || !state.current || state.current.questionId !== input.questionId) {
      throw new TestError(409, "WRONG_QUESTION", "That question is no longer current. Reload the page.");
    }
    const question = await tx.question.findUnique({ where: { id: input.questionId } });
    if (!question || question.type === "WRITING") throw new TestError(404, "NOT_FOUND", "Question not found.");

    const read = readAnswer(question.type, question.options, input.answer);
    const isCorrect = question.type === "LIKERT" ? null : read.key === question.correctAnswer;
    const pretest = state.current.pretest;
    // Retired (or sent back for review) while the candidate was answering it: they may finish it, but it does not count.
    const withdrawn = question.status !== "APPROVED";
    const counts = !pretest && !withdrawn;

    const before = await loadAnswered(tx, sessionId);
    const scoredBefore: ScoredAnswer[] = before.filter((r) => r.isScored && r.isCorrect !== null).map((r) => ({ a: r.question.aParam, b: r.question.bParam, correct: Boolean(r.isCorrect) }));
    const thetaBefore = estimateAbility(scoredBefore);
    const thetaAfter = counts && isCorrect !== null ? estimateAbility([...scoredBefore, { a: question.aParam, b: question.bParam, correct: isCorrect }]) : thetaBefore;

    await tx.response.create({
      data: {
        sessionId,
        questionId: question.id,
        answerGiven: withdrawn ? ({ ...(read.given as object), withdrawn: true } as Prisma.InputJsonValue) : read.given,
        isCorrect,
        isScored: counts,
        responseTimeMs: Math.max(0, now.getTime() - new Date(state.current.servedAt).getTime()),
        thetaBefore: thetaBefore.theta,
        thetaAfter: thetaAfter.theta,
        answeredAt: now,
      },
    });

    const config = await loadConfig(tx, session.testType);
    const candidate = { jobRoleId: session.candidateProfile.jobRoleId };
    if (withdrawn && !isAdaptive(session.testType) && state.fixedOrder) {
      await addReplacement(tx, session.testType, session.languageId ?? "", candidate.jobRoleId, question.topic, state.fixedOrder, seededRandom(state.seed + state.fixedOrder.length * 104729));
    }
    await advance(tx, sessionId, session.testType, candidate, session.languageId ?? "", config, state);
    await tx.testSession.update({
      where: { id: sessionId },
      data: {
        theta: thetaAfter.theta,
        standardError: thetaAfter.se,
        itemsAdministered: scoredBefore.length + (counts && isCorrect !== null ? 1 : 0),
        resumeState: toJson(state),
      },
    });
    // Running statistics for calibration (pretest answers count too, answers to a withdrawn question do not). This is the LAST
    // statement of the transaction on purpose: many candidates are served the same popular questions at the same time, and this row
    // is locked until the transaction ends, so anything done after it would make every other candidate wait.
    if (!withdrawn) {
      await tx.itemStatistic.upsert({
        where: { questionId: question.id },
        create: { questionId: question.id, responseCount: 1, correctCount: isCorrect ? 1 : 0 },
        update: { responseCount: { increment: 1 }, correctCount: { increment: isCorrect ? 1 : 0 } },
      });
    }
    return { timedOut: false, finished: (state.phase as Phase) === "DONE" };
  });

  if (outcome.timedOut || outcome.finished) await finalizeSession(deps, sessionId, outcome.timedOut ? "TIMEOUT" : "COMPLETE");
  return getSessionView(deps, userId, sessionId);
}

// ---------------------------------------------------------------- the Language writing task

/**
 * Saves the written answer, then grades it with Claude and finishes the test. If grading is not
 * possible right now the score is marked provisional and finished later (see regradePending).
 * `timedOut` is set when the page submits automatically as the clock reaches zero.
 */
export async function submitWriting(deps: Deps, userId: string, sessionId: string, text: string, timedOut = false): Promise<SessionView> {
  const { prisma } = deps;
  const now = clock(deps);
  const testing = await readSetting(prisma, "testing");

  const saved = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `session:${sessionId}`);
    const session = await ownedSession(tx, userId, sessionId);
    const state = asState(session.resumeState);
    if (session.status !== "IN_PROGRESS" || state.phase !== "WRITING" || !state.writingQuestionId) return null;

    if (session.expiresAt && now.getTime() > session.expiresAt.getTime() + WRITING_GRACE_MS) return { late: true as const };
    const essay = limitWords(text, testing.writingMaxWords);
    const words = countWords(essay);
    if (!timedOut && words < testing.writingMinWords) {
      throw new TestError(400, "TOO_SHORT", `Please write at least ${testing.writingMinWords} words (you have ${words}).`);
    }
    // A writing task that was retired while the candidate wrote: they finish it, but it is neither stored nor graded.
    const prompt = await tx.question.findUnique({ where: { id: state.writingQuestionId }, select: { status: true } });
    const withdrawn = prompt?.status !== "APPROVED";
    if (words > 0 && !withdrawn) {
      await tx.writingAssessment.upsert({
        where: { sessionId },
        create: { sessionId, essayText: essay },
        update: { essayText: essay },
      });
    }
    state.phase = "DONE";
    state.current = null;
    await tx.testSession.update({ where: { id: sessionId }, data: { resumeState: toJson(state) } });
    return { late: false as const, hasEssay: words > 0 && !withdrawn, questionId: state.writingQuestionId, languageId: session.languageId, jobRoleId: session.candidateProfile.jobRoleId };
  });

  if (saved && !saved.late && saved.hasEssay) {
    await tryGrade(deps, userId, sessionId, saved.questionId, saved.languageId);
  }
  if (saved) await finalizeSession(deps, sessionId, saved.late ? "TIMEOUT" : "COMPLETE");
  return getSessionView(deps, userId, sessionId);
}

/** Grades the stored essay. Failures are swallowed on purpose: the score just stays provisional. */
async function tryGrade(deps: Deps, userId: string, sessionId: string, promptQuestionId: string, languageId: string | null) {
  const { prisma } = deps;
  const [essay, prompt, language] = await Promise.all([
    prisma.writingAssessment.findUnique({ where: { sessionId } }),
    prisma.question.findUnique({ where: { id: promptQuestionId }, select: { content: true } }),
    languageId ? prisma.language.findUnique({ where: { id: languageId } }) : null,
  ]);
  if (!essay || essay.gradedAt || !prompt || !language) return;
  try {
    const grade = await gradeWriting(
      { prisma, client: deps.client },
      { actorId: userId, languageId: language.id, languageName: language.name, prompt: prompt.content, essay: essay.essayText }
    );
    await prisma.writingAssessment.update({
      where: { sessionId },
      data: { cefrLevel: grade.cefrLevel, rubricScore: grade.criteria, feedback: grade.feedback, gradedAt: new Date() },
    });
  } catch (err) {
    if (!(err instanceof AiError)) toAiError(err);
  }
}

// ---------------------------------------------------------------- finishing and scoring

/**
 * Ends the test and stores the score. `TIMEOUT` with fewer than the minimum number of answers gives no
 * score (the test is marked expired and can be taken again at once). Safe to call twice.
 */
export async function finalizeSession(deps: Deps, sessionId: string, reason: "COMPLETE" | "TIMEOUT"): Promise<void> {
  const { prisma } = deps;
  const now = clock(deps);
  let rankedProfileId: string | null = null;

  await prisma.$transaction(
    async (tx) => {
      await lockKey(tx, `session:${sessionId}`);
      const session = await tx.testSession.findUnique({
        where: { id: sessionId },
        include: { candidateProfile: { select: { id: true, userId: true, jobRoleId: true } }, writingAssessment: true },
      });
      if (!session || session.status !== "IN_PROGRESS") return;

      const config = await loadConfig(tx, session.testType);
      const answered = await loadAnswered(tx, sessionId);
      const scoredResponses = answered.filter((r) => r.isScored);
      const state = asState(session.resumeState);
      state.phase = "DONE";
      state.current = null;
      const closed = { resumeState: toJson(state), completedAt: now };

      if (reason === "TIMEOUT" && scoredResponses.length < config.minItems) {
        await tx.testSession.update({ where: { id: sessionId }, data: { ...closed, status: "EXPIRED" } });
        await tx.auditLog.create({
          data: { actorId: session.candidateProfile.userId, action: "TEST_EXPIRED", targetType: "TestSession", targetId: sessionId, metadata: { testType: session.testType, answered: scoredResponses.length } },
        });
        return;
      }

      const responses = await tx.response.findMany({
        where: { sessionId, isScored: true },
        include: { question: { select: { aParam: true, bParam: true, topic: true, type: true, reverseKeyed: true } } },
      });
      const likert = (r: (typeof responses)[number]) => ({ reverseKeyed: r.question.reverseKeyed, value: (r.answerGiven as { value: number }).value });

      let rawScore = 0;
      let theta: number | null = null;
      let standardError: number | null = null;
      let rankValue: number | null = null;
      let cefr: CefrLevel | null = null;
      let provisional = false;
      let details: Record<string, unknown> = {};

      if (session.testType === "PERSONALITY") {
        const traits = scorePersonality(responses.map((r): LikertAnswer => ({ topic: r.question.topic, ...likert(r) })));
        rawScore = traits.length ? Math.round((traits.reduce((s, t) => s + t.score, 0) / traits.length) * 100) / 100 : 0;
        details = { traits, answered: responses.length };
      } else if (session.testType === "EQ") {
        const eq: EqAnswer[] = responses.map((r) =>
          r.question.type === "LIKERT" ? { kind: "LIKERT", ...likert(r) } : { kind: "SJ", correct: Boolean(r.isCorrect) }
        );
        rawScore = scoreEq(eq);
        rankValue = rawScore;
        details = { answered: eq.length, likertItems: eq.filter((e) => e.kind === "LIKERT").length, sjItems: eq.filter((e) => e.kind === "SJ").length, sjCorrect: eq.filter((e) => e.kind === "SJ" && e.correct).length };
      } else {
        const scored: ScoredAnswer[] = responses.filter((r) => r.isCorrect !== null).map((r) => ({ a: r.question.aParam, b: r.question.bParam, correct: Boolean(r.isCorrect) }));
        const est = estimateAbility(scored);
        const correct = scored.filter((s) => s.correct).length;
        rawScore = percentCorrect(correct, scored.length);
        theta = est.theta;
        standardError = est.se;
        details = { answered: scored.length, correct, pretestShown: answered.length - scored.length };

        if (session.testType === "LANGUAGE") {
          const testing = await readSetting(tx, "testing");
          const essay = session.writingAssessment;
          cefr = (essay?.cefrLevel as CefrLevel | null) ?? null;
          provisional = Boolean(essay && !essay.gradedAt);
          const cefrScores = Object.fromEntries(CEFR_LEVELS.map((l) => [l, testing[`cefrScore${l}` as keyof typeof testing] as number])) as Record<CefrLevel, number>;
          theta = languageComposite({ theta: est.theta, cefr, cefrScores, writingWeightPercent: testing.writingWeightPercent });
          details = { ...details, mcqTheta: est.theta, writing: { submitted: Boolean(essay), graded: Boolean(essay?.gradedAt), cefr, criteria: essay?.rubricScore ?? null } };
        }
        rankValue = theta;
      }

      const ranking =
        rankValue !== null && !provisional
          ? await rankAgainstCohort(tx, { testType: session.testType, candidateProfileId: session.candidateProfile.id, jobRoleId: session.candidateProfile.jobRoleId, value: rankValue })
          : null;

      await tx.score.upsert({
        where: { sessionId },
        create: {
          candidateProfileId: session.candidateProfile.id,
          sessionId,
          testType: session.testType,
          rawScore,
          theta,
          standardError,
          rankValue,
          percentile: ranking?.percentile ?? null,
          quartile: ranking?.quartile ?? null,
          cohortScope: ranking?.scope ?? null,
          cohortSize: ranking?.size ?? null,
          cefrLevel: cefr,
          provisional,
          details: details as Prisma.InputJsonValue,
          computedAt: now,
        },
        update: {},
      });
      await tx.testSession.update({
        where: { id: sessionId },
        data: { ...closed, status: "COMPLETED", theta: theta ?? session.theta, standardError, itemsAdministered: scoredResponses.length },
      });
      if (!provisional) rankedProfileId = session.candidateProfile.id;
      await tx.auditLog.create({
        data: {
          actorId: session.candidateProfile.userId,
          action: "TEST_COMPLETED",
          targetType: "TestSession",
          targetId: sessionId,
          // Never the answers: only what kind of test and how many questions.
          metadata: { testType: session.testType, answered: scoredResponses.length, reason, provisional },
        },
      });
    },
    { timeout: 20_000 }
  );

  // After the result is saved (never inside the transaction, because it may send email): the top-performer badge.
  if (rankedProfileId) await evaluateTopPerformer(prisma, rankedProfileId);
}

/**
 * Finishes a Language score that was waiting for its writing grade: grades the essay now and, if that
 * works, recomputes the composite score and ranking. Returns true if the score is now final.
 */
export async function regradePending(deps: Deps, userId: string, sessionId: string): Promise<boolean> {
  const { prisma } = deps;
  const session = await ownedSession(prisma, userId, sessionId);
  const score = await prisma.score.findUnique({ where: { sessionId } });
  if (!score?.provisional) return true;

  const state = asState(session.resumeState);
  const promptQuestionId = state.writingQuestionId;
  if (!promptQuestionId) return false;
  await tryGrade(deps, userId, sessionId, promptQuestionId, session.languageId);

  const essay = await prisma.writingAssessment.findUnique({ where: { sessionId } });
  if (!essay?.gradedAt || !essay.cefrLevel) return false;

  const testing = await readSetting(prisma, "testing");
  const cefrScores = Object.fromEntries(CEFR_LEVELS.map((l) => [l, testing[`cefrScore${l}` as keyof typeof testing] as number])) as Record<CefrLevel, number>;
  const details = (score.details ?? {}) as { mcqTheta?: number; [k: string]: unknown };
  const composite = languageComposite({ theta: details.mcqTheta ?? score.theta ?? 0, cefr: essay.cefrLevel as CefrLevel, cefrScores, writingWeightPercent: testing.writingWeightPercent });
  const ranking = await rankAgainstCohort(prisma, { testType: "LANGUAGE", candidateProfileId: score.candidateProfileId, jobRoleId: session.candidateProfile.jobRoleId, value: composite });

  await prisma.score.update({
    where: { sessionId },
    data: {
      theta: composite,
      rankValue: composite,
      percentile: ranking.percentile,
      quartile: ranking.quartile,
      cohortScope: ranking.scope,
      cohortSize: ranking.size,
      cefrLevel: essay.cefrLevel,
      provisional: false,
      details: { ...details, writing: { submitted: true, graded: true, cefr: essay.cefrLevel, criteria: essay.rubricScore } } as Prisma.InputJsonValue,
    },
  });
  await evaluateTopPerformer(prisma, score.candidateProfileId);
  return true;
}

// ---------------------------------------------------------------- result summary

export type ResultView = {
  sessionId: string;
  testType: TestType;
  status: "COMPLETED" | "EXPIRED";
  completedAt: string | null;
  scored: boolean;
  provisional: boolean;
  rawScore: number | null;
  percentile: number | null;
  quartile: number | null;
  cohort: { scope: "ROLE" | "ALL"; size: number; small: boolean } | null;
  cefrLevel: string | null;
  traits: { trait: string; score: number }[] | null;
  answered: number | null;
  retakeAt: string | null;
  feedback: string | null;
  minCohortSize: number;
};

/** The simple result summary shown after a test (the full results page comes later). */
export async function getResult(deps: Deps, userId: string, sessionId: string): Promise<ResultView> {
  const { prisma } = deps;
  let session = await ownedSession(prisma, userId, sessionId);
  if (session.status === "IN_PROGRESS") throw new TestError(409, "NOT_FINISHED", "This test is not finished yet.");

  let score = await prisma.score.findUnique({ where: { sessionId } });
  if (score?.provisional) {
    await regradePending(deps, userId, sessionId);
    score = await prisma.score.findUnique({ where: { sessionId } });
  }
  session = await ownedSession(prisma, userId, sessionId);
  const [config, quartiles, essay] = await Promise.all([loadConfig(prisma, session.testType), readSetting(prisma, "quartiles"), prisma.writingAssessment.findUnique({ where: { sessionId } })]);

  const details = (score?.details ?? {}) as { traits?: { trait: string; score: number }[]; answered?: number };
  const retakeAt = session.completedAt && session.status === "COMPLETED" && score ? new Date(session.completedAt.getTime() + config.retakeWaitingDays * DAY_MS) : null;
  return {
    sessionId,
    testType: session.testType,
    status: session.status === "COMPLETED" ? "COMPLETED" : "EXPIRED",
    completedAt: session.completedAt?.toISOString() ?? null,
    scored: Boolean(score),
    provisional: score?.provisional ?? false,
    rawScore: score?.rawScore ?? null,
    percentile: score?.percentile ?? null,
    quartile: score?.quartile ?? null,
    cohort: score?.cohortScope && score.cohortSize ? { scope: score.cohortScope as "ROLE" | "ALL", size: score.cohortSize, small: score.cohortSize < quartiles.minCohortSize } : null,
    cefrLevel: score?.cefrLevel ?? null,
    traits: details.traits ?? null,
    answered: details.answered ?? null,
    retakeAt: retakeAt && retakeAt.getTime() > Date.now() ? retakeAt.toISOString() : null,
    feedback: essay?.gradedAt ? (essay.feedback ?? null) : null,
    minCohortSize: quartiles.minCohortSize,
  };
}

export { ADAPTIVE_TESTS, TEST_ORDER };

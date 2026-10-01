import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { readSetting } from "@/lib/settings/store";
import { renderTemplate } from "@/lib/messageTemplates";
import { askClaudeJson, getClaudeClient, type ClaudeClient } from "@/lib/ai/claude";
import { estimateCost } from "@/lib/ai/cost";
import { AiError, toAiError } from "@/lib/ai/errors";
import { TEST_TITLES } from "@/lib/testEngine/labels";
import { topShare } from "./latest";

export const FEEDBACK_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["feedback", "tips"],
  properties: {
    feedback: { type: "string" },
    tips: { type: "array", items: { type: "string" } },
  },
} as const;

export const feedbackReplySchema = z.object({
  feedback: z.string().trim().min(10).max(3000),
  tips: z.array(z.string().trim().min(3).max(500)).min(1).max(12),
});

export type Feedback = { scoreId: string; text: string; tips: string[]; generatedAt: Date; cached: boolean };

type Db = Pick<PrismaClient, "score" | "aIFeedback" | "aiRun" | "auditLog" | "siteSetting" | "response" | "candidateProfile">;

/**
 * The facts Claude is given about a result. Deliberately no name, email, phone, city or salary:
 * only the test, the result, and the job role and experience (which shape useful advice).
 */
export function buildFacts(args: {
  testType: string;
  quartile: number | null;
  percentile: number | null;
  rawScore: number;
  cefrLevel: string | null;
  cohort: { scope: "ROLE" | "ALL"; size: number } | null;
  traits: { trait: string; score: number }[] | null;
  topicAccuracy: { topic: string; correct: number; total: number }[];
  jobRole: string | null;
  experienceYears: number | null;
}): string {
  const lines: string[] = [`Test: ${TEST_TITLES[args.testType as keyof typeof TEST_TITLES] ?? args.testType}`];
  if (args.jobRole) lines.push(`Job role: ${args.jobRole}`);
  if (args.experienceYears !== null) lines.push(`Experience: ${args.experienceYears} years`);
  if (args.traits) {
    lines.push("Personality trait scores (1 to 5; not ranked, no better or worse):");
    for (const t of args.traits) lines.push(`- ${t.trait}: ${t.score.toFixed(1)}${t.trait === "Emotional Stability" ? " (higher means calmer)" : ""}`);
  } else {
    if (args.quartile !== null && args.percentile !== null) {
      const basis = args.cohort ? ` compared with ${args.cohort.size} candidates${args.cohort.scope === "ROLE" ? " in the same job role" : " overall"}` : "";
      lines.push(`Result: Quartile Q${args.quartile} (Q1 is the best quarter), better than ${Math.round(args.percentile)}% of candidates, in the top ${topShare(args.percentile)}%${basis}`);
    }
    lines.push(`Share of questions answered correctly or score: ${args.rawScore}`);
    if (args.cefrLevel) lines.push(`Written language level (CEFR): ${args.cefrLevel}`);
    if (args.topicAccuracy.length > 0) {
      lines.push("Accuracy by topic:");
      for (const t of args.topicAccuracy) lines.push(`- ${t.topic}: ${t.correct} of ${t.total} correct`);
    }
  }
  return lines.join("\n");
}

/** Per-topic accuracy from the scored answers of one session (topics with at least two answers). */
export async function topicAccuracy(db: Pick<PrismaClient, "response">, sessionId: string) {
  const responses = await db.response.findMany({
    where: { sessionId, isScored: true, isCorrect: { not: null }, question: { topic: { not: null } } },
    select: { isCorrect: true, question: { select: { topic: true } } },
  });
  const byTopic = new Map<string, { correct: number; total: number }>();
  for (const r of responses) {
    const topic = r.question.topic!;
    const entry = byTopic.get(topic) ?? { correct: 0, total: 0 };
    entry.total++;
    if (r.isCorrect) entry.correct++;
    byTopic.set(topic, entry);
  }
  return [...byTopic.entries()].filter(([, v]) => v.total >= 2).map(([topic, v]) => ({ topic, ...v }));
}

/** The saved feedback for a result, if it has been written. */
export async function findFeedback(db: Pick<PrismaClient, "aIFeedback">, scoreId: string): Promise<Feedback | null> {
  const row = await db.aIFeedback.findUnique({ where: { scoreId } });
  if (!row) return null;
  const tips = Array.isArray(row.improvementTips) ? (row.improvementTips as unknown[]).filter((t): t is string => typeof t === "string") : [];
  return { scoreId, text: row.feedbackText, tips, generatedAt: row.generatedAt, cached: true };
}

/**
 * Returns the AI feedback for one of the candidate's own results, writing it with Claude the first time
 * (it is saved, so a result is only ever sent once). The prompt and model come from Settings; the run is
 * recorded in AiRun and the audit log. Throws an AiError when Claude is not available.
 */
export async function ensureFeedback(deps: { prisma: Db; client?: ClaudeClient }, userId: string, scoreId: string): Promise<Feedback> {
  const { prisma } = deps;
  const score = await prisma.score.findFirst({
    where: { id: scoreId, candidateProfile: { userId, anonymisedAt: null } },
    include: { candidateProfile: { select: { id: true, experienceYears: true, jobRole: { select: { name: true } } } } },
  });
  if (!score) throw new AiError("INVALID_INPUT", "Result not found.");
  if (score.provisional) throw new AiError("INVALID_INPUT", "This result is still being finished. Try again in a few minutes.");

  const existing = await findFeedback(prisma, scoreId);
  if (existing) return existing;

  const [ai, prompts, aiGeneration] = await Promise.all([readSetting(prisma, "aiResults"), readSetting(prisma, "aiPrompts"), readSetting(prisma, "aiGeneration")]);
  const details = (score.details && typeof score.details === "object" && !Array.isArray(score.details) ? score.details : {}) as { traits?: { trait: string; score: number }[] };
  const facts = buildFacts({
    testType: score.testType,
    quartile: score.quartile,
    percentile: score.percentile,
    rawScore: score.rawScore,
    cefrLevel: score.cefrLevel,
    cohort: score.cohortScope && score.cohortSize ? { scope: score.cohortScope as "ROLE" | "ALL", size: score.cohortSize } : null,
    traits: Array.isArray(details.traits) ? details.traits : null,
    topicAccuracy: await topicAccuracy(prisma, score.sessionId),
    jobRole: score.candidateProfile.jobRole?.name ?? null,
    experienceYears: score.candidateProfile.experienceYears,
  });

  const run = await prisma.aiRun.create({
    data: { kind: "FEEDBACK", actorId: userId, model: ai.model, reviewModel: ai.model, testType: score.testType, requested: 1 },
  });
  try {
    const client = deps.client ?? getClaudeClient();
    const system = prompts.systemPrompt;
    const user = renderTemplate(prompts.feedbackPrompt, {
      testName: TEST_TITLES[score.testType],
      facts,
      tipCount: String(ai.tipCount),
      maxWords: String(ai.maxWords),
    });
    const reply = await askClaudeJson(client, { model: ai.model, system, user, schema: FEEDBACK_JSON_SCHEMA, maxTokens: ai.maxOutputTokens, effort: ai.effort });
    const parsed = feedbackReplySchema.safeParse(reply.data);
    if (!parsed.success) throw new AiError("BAD_RESPONSE", "The feedback reply did not have the expected shape. Try again.");
    const tips = parsed.data.tips.slice(0, ai.tipCount);

    const cost = estimateCost(reply.usage, aiGeneration.inputPricePerMTok, aiGeneration.outputPricePerMTok);
    let saved;
    try {
      saved = await prisma.aIFeedback.create({
        data: { candidateProfileId: score.candidateProfile.id, testType: score.testType, scoreId, feedbackText: parsed.data.feedback, improvementTips: tips, model: ai.model },
      });
    } catch (err) {
      // Two requests raced: keep the first one.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const winner = await findFeedback(prisma, scoreId);
        if (winner) return winner;
      }
      throw err;
    }
    await prisma.aiRun.update({
      where: { id: run.id },
      data: { created: 1, inputTokens: reply.usage.inputTokens, outputTokens: reply.usage.outputTokens, costEstimate: cost, status: "COMPLETED" },
    });
    await prisma.auditLog.create({
      data: { actorId: userId, action: "AI_FEEDBACK_GENERATED", targetType: "AiRun", targetId: run.id, metadata: { model: ai.model, testType: score.testType, inputTokens: reply.usage.inputTokens, outputTokens: reply.usage.outputTokens, estimatedCostUsd: cost } },
    });
    return { scoreId, text: saved.feedbackText, tips, generatedAt: saved.generatedAt, cached: false };
  } catch (err) {
    const aiError = toAiError(err);
    await prisma.aiRun.update({ where: { id: run.id }, data: { status: "FAILED", error: `${aiError.code}: ${aiError.message}` } });
    throw aiError;
  }
}

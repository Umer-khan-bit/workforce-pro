import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { renderTemplate } from "@/lib/messageTemplates";
import { readSetting } from "@/lib/settings/store";
import { askClaudeJson, getClaudeClient, type ClaudeClient } from "@/lib/ai/claude";
import { estimateCost } from "@/lib/ai/cost";
import { AiError, toAiError } from "@/lib/ai/errors";
import { CEFR_LEVELS, type CefrLevel } from "./scoring";

const CRITERIA = ["task", "coherence", "vocabulary", "grammar"] as const;

export const WRITING_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cefrLevel", "criteria", "feedback"],
  properties: {
    cefrLevel: { type: "string", enum: CEFR_LEVELS },
    criteria: {
      type: "object",
      additionalProperties: false,
      required: [...CRITERIA],
      properties: Object.fromEntries(CRITERIA.map((c) => [c, { type: "integer" }])),
    },
    feedback: { type: "string" },
  },
} as const;

const criterionScore = z.number().int().min(0).max(5);
export const writingResultSchema = z.object({
  cefrLevel: z.enum(CEFR_LEVELS as [CefrLevel, ...CefrLevel[]]),
  criteria: z.object({ task: criterionScore, coherence: criterionScore, vocabulary: criterionScore, grammar: criterionScore }),
  feedback: z.string().max(2000),
});
export type WritingGrade = z.infer<typeof writingResultSchema>;

/** Cuts text to at most `maxWords` words. */
export function limitWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? text.trim() : words.slice(0, maxWords).join(" ");
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

type Deps = { prisma: PrismaClient; client?: ClaudeClient };

/**
 * Grades a written answer against the CEFR rubric in Settings. Only the prompt and the answer text
 * are sent to Claude, never the candidate's name or any other detail. The run is recorded (AiRun and
 * audit log) like every other AI call. Throws an AiError if grading is not possible.
 */
export async function gradeWriting(
  deps: Deps,
  args: { actorId: string; languageId: string; languageName: string; prompt: string; essay: string }
): Promise<WritingGrade> {
  const { prisma } = deps;
  const [ai, prompts] = await Promise.all([readSetting(prisma, "aiGeneration"), readSetting(prisma, "aiPrompts")]);

  const run = await prisma.aiRun.create({
    data: {
      kind: "GRADE",
      actorId: args.actorId,
      model: ai.model,
      reviewModel: ai.model,
      testType: "LANGUAGE",
      languageId: args.languageId,
      requested: 1,
    },
  });

  try {
    const client = deps.client ?? getClaudeClient();
    const system = renderTemplate(prompts.writingScoringPrompt, { language: args.languageName, rubric: prompts.writingRubric });
    const user = `Writing prompt given to the candidate:\n${args.prompt}\n\nCandidate's written answer (between the markers):\n<<<\n${args.essay}\n>>>`;
    const reply = await askClaudeJson(client, {
      model: ai.model,
      system,
      user,
      schema: WRITING_JSON_SCHEMA,
      maxTokens: Math.min(ai.maxOutputTokens, 4000),
      effort: ai.effort,
    });
    const parsed = writingResultSchema.safeParse(reply.data);
    if (!parsed.success) throw new AiError("BAD_RESPONSE", "The grading reply did not have the expected shape.");

    const cost = estimateCost(reply.usage, ai.inputPricePerMTok, ai.outputPricePerMTok);
    await prisma.aiRun.update({
      where: { id: run.id },
      data: { created: 1, inputTokens: reply.usage.inputTokens, outputTokens: reply.usage.outputTokens, costEstimate: cost, status: "COMPLETED" },
    });
    await prisma.auditLog.create({
      data: {
        actorId: args.actorId,
        action: "AI_WRITING_GRADED",
        targetType: "AiRun",
        targetId: run.id,
        metadata: { model: ai.model, inputTokens: reply.usage.inputTokens, outputTokens: reply.usage.outputTokens, estimatedCostUsd: cost },
      },
    });
    return parsed.data;
  } catch (err) {
    const aiError = toAiError(err);
    await prisma.aiRun.update({ where: { id: run.id }, data: { status: "FAILED", error: `${aiError.code}: ${aiError.message}` } });
    throw aiError;
  }
}

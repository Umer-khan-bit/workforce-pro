import type { Prisma, PrismaClient } from "@prisma/client";
import { readSetting } from "@/lib/settings/store";
import { questionInputSchema, toQuestionData, type DifficultyValue, type QuestionInput } from "@/lib/questionBank/schema";
import { askClaudeJson, getClaudeClient, type ClaudeClient } from "./claude";
import { ZERO_USAGE, addUsage, estimateCost, type Usage } from "./cost";
import { AiError, toAiError } from "./errors";
import {
  GENERATABLE_TESTS,
  TEST_NAMES,
  buildGenerationPrompt,
  buildReviewPrompt,
  normalizeForDuplicate,
  type GeneratableTest,
  type ReviewItem,
} from "./prompts";
import {
  GENERATION_JSON_SCHEMA,
  REVIEW_JSON_SCHEMA,
  generationResultSchema,
  reviewResultSchema,
} from "./schemas";

export type GenerateParams = {
  testType: GeneratableTest;
  jobRoleId?: string;
  languageId: string;
  difficulty: DifficultyValue;
  count: number;
  focus?: string;
};

export type Verdict = "OK" | "NEEDS_FIX" | "REJECT";

export type BatchResult = {
  runId: string;
  requested: number;
  created: number;
  dropped: number;
  droppedReasons: string[];
  reviewed: boolean;
  reviewWarning: string | null;
  verdicts: Record<Verdict, number>;
  inputTokens: number;
  outputTokens: number;
  costEstimate: number;
  /** How many items Claude sent back in total, across all attempts (before any were dropped). */
  received: number;
  /** How many times Claude was asked (1 = no retry needed). */
  attempts: number;
  /** How many fewer questions were saved than were asked for (0 = the full number). */
  shortfall: number;
  /** A plain-English line to show when `shortfall` is above 0. */
  shortfallNote: string | null;
};

type Deps = { prisma: PrismaClient; client?: ClaudeClient };

// Which item formats each test may receive from the model.
const ALLOWED_KINDS: Record<GeneratableTest, string[]> = {
  IQ: ["MCQ"],
  SKILL: ["MCQ"],
  EQ: ["SJ", "LIKERT"],
  LANGUAGE: ["MCQ", "WRITING"],
};
const KIND_TO_TYPE = { MCQ: "MCQ", SJ: "SITUATIONAL_JUDGEMENT", LIKERT: "LIKERT", WRITING: "WRITING" } as const;
const EXISTING_IN_PROMPT = 40;

export async function generateBatch(deps: Deps, actorId: string, params: GenerateParams): Promise<BatchResult> {
  const { prisma } = deps;
  const [ai, prompts, itemDefaults] = await Promise.all([
    readSetting(prisma, "aiGeneration"),
    readSetting(prisma, "aiPrompts"),
    readSetting(prisma, "itemDefaults"),
  ]);

  if (!GENERATABLE_TESTS.includes(params.testType)) {
    throw new AiError("INVALID_INPUT", "Questions for this test cannot be generated with AI.");
  }
  if (!Number.isInteger(params.count) || params.count < 1 || params.count > ai.batchSize) {
    throw new AiError("INVALID_INPUT", `A batch holds 1 to ${ai.batchSize} questions.`);
  }
  const language = await prisma.language.findUnique({ where: { id: params.languageId } });
  if (!language?.isActive) throw new AiError("INVALID_INPUT", "Choose an active language.");
  let jobRole: { id: string; name: string; isActive: boolean } | null = null;
  if (params.testType === "SKILL") {
    jobRole = params.jobRoleId ? await prisma.jobRole.findUnique({ where: { id: params.jobRoleId } }) : null;
    if (!jobRole?.isActive) throw new AiError("INVALID_INPUT", "Job-skill questions need an active job role.");
  }

  const run = await prisma.aiRun.create({
    data: {
      kind: "GENERATE",
      actorId,
      model: ai.model,
      reviewModel: ai.reviewModel,
      testType: params.testType,
      languageId: language.id,
      jobRoleId: jobRole?.id ?? null,
      difficulty: params.difficulty,
      requested: params.count,
    },
  });

  let genUsage: Usage = ZERO_USAGE;
  let reviewUsage: Usage = ZERO_USAGE;
  const cost = () =>
    estimateCost(genUsage, ai.inputPricePerMTok, ai.outputPricePerMTok) +
    estimateCost(reviewUsage, ai.reviewInputPricePerMTok, ai.reviewOutputPricePerMTok);

  try {
    const client = deps.client ?? getClaudeClient();

    // Existing questions in the same pool: shown to Claude to avoid repeats, and used to drop exact repeats.
    const scope: Prisma.QuestionWhereInput = {
      testType: params.testType,
      languageId: language.id,
      status: { in: ["PENDING_APPROVAL", "APPROVED"] },
      ...(jobRole ? { jobRoleId: jobRole.id } : {}),
    };
    const existingRows = await prisma.question.findMany({
      where: scope,
      select: { content: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    });
    const seen = new Set(existingRows.map((q) => normalizeForDuplicate(q.content)));
    const existingForPrompt = existingRows.slice(0, EXISTING_IN_PROMPT).map((q) => q.content.slice(0, 140));

    // Ask for the questions, then check how many came back. If there are fewer than asked for (Claude
    // returned too few, or some failed the checks or repeated an existing question) ask again for the
    // missing ones, up to the number of retries in Settings, and report whatever is still short.
    type Kept = { input: QuestionInput; explanation: string; modelDifficulty: DifficultyValue };
    const kept: Kept[] = [];
    const droppedReasons: string[] = [];
    let received = 0;
    let attempts = 0;
    let shortfallNote: string | null = null;

    for (let attempt = 0; attempt <= ai.shortfallRetries && kept.length < params.count; attempt++) {
      const missing = params.count - kept.length;
      attempts++;
      try {
        // Questions already accepted in this batch are listed too, so a retry does not repeat them.
        const alreadyHave = [...kept.map((k) => k.input.content.slice(0, 140)), ...existingForPrompt].slice(0, EXISTING_IN_PROMPT);
        const gen = buildGenerationPrompt(prompts, ai, {
          test: params.testType,
          count: missing,
          languageName: language.name,
          jobRoleName: jobRole?.name ?? null,
          difficulty: params.difficulty,
          focus: params.focus?.trim() ?? "",
          existing: alreadyHave,
        });
        const genReply = await askClaudeJson(client, {
          model: ai.model,
          system: gen.system,
          user: gen.user,
          schema: GENERATION_JSON_SCHEMA,
          maxTokens: ai.maxOutputTokens,
          effort: ai.effort,
        });
        genUsage = addUsage(genUsage, genReply.usage);

        const parsedReply = generationResultSchema.safeParse(genReply.data);
        if (!parsedReply.success) throw new AiError("BAD_RESPONSE", "Claude's reply did not have the expected shape. Try again.");
        received += parsedReply.data.questions.length;

        // Check every item with the same rules as a manually added question; drop the ones that fail.
        for (const item of parsedReply.data.questions.slice(0, missing)) {
          if (!ALLOWED_KINDS[params.testType].includes(item.kind)) {
            droppedReasons.push(`Unexpected format ${item.kind}`);
            continue;
          }
          const type = KIND_TO_TYPE[item.kind];
          const hasOptions = type === "MCQ" || type === "SITUATIONAL_JUDGEMENT";
          const checked = questionInputSchema.safeParse({
            testType: params.testType,
            type,
            content: item.content,
            options: hasOptions ? item.options : undefined,
            correctAnswer: hasOptions ? (item.correctAnswer ?? undefined) : undefined,
            reverseKeyed: type === "LIKERT" ? item.reverseKeyed : false,
            topic: item.topic,
            explanation: item.explanation,
            difficulty: params.difficulty,
            jobRoleId: jobRole?.id,
            languageId: language.id,
          });
          if (!checked.success) {
            droppedReasons.push(checked.error.issues[0]?.message ?? "Invalid question");
            continue;
          }
          const key = normalizeForDuplicate(checked.data.content);
          if (seen.has(key)) {
            droppedReasons.push("Repeats an existing question");
            continue;
          }
          seen.add(key);
          kept.push({ input: checked.data, explanation: item.explanation, modelDifficulty: item.difficulty });
        }
      } catch (err) {
        // If the very first request fails nothing came back, which is an error. A failed retry is not:
        // keep what we already have and report the shortfall.
        if (attempt === 0) throw err;
        shortfallNote = `Asking again for the missing questions failed: ${toAiError(err).message}`;
        break;
      }
    }

    const shortfall = Math.max(0, params.count - kept.length);
    if (shortfall > 0) {
      shortfallNote =
        `Only ${kept.length} of the ${params.count} questions asked for could be saved` +
        (attempts > 1 ? ` after ${attempts} attempts` : "") +
        `. ${shortfallNote ?? "Run the generator again to get the rest."}`.replace(/\.$/, ".");
    }

    // Second pass: a separate call reviews what was kept.
    let verdictByIndex = new Map<number, { verdict: Verdict; notes: string }>();
    let reviewed = false;
    let reviewWarning: string | null = null;
    if (kept.length > 0) {
      try {
        const reviewItems: ReviewItem[] = kept.map((k, i) => ({
          index: i,
          content: k.input.content,
          options: k.input.options,
          correctAnswer: k.input.correctAnswer ?? null,
          explanation: k.explanation,
          difficulty: k.input.difficulty,
          reverseKeyed: k.input.reverseKeyed,
        }));
        const review = buildReviewPrompt(
          prompts,
          { testName: TEST_NAMES[params.testType], languageName: language.name, jobRoleName: jobRole?.name ?? null },
          reviewItems
        );
        const reviewReply = await askClaudeJson(client, {
          model: ai.reviewModel,
          system: review.system,
          user: review.user,
          schema: REVIEW_JSON_SCHEMA,
          maxTokens: ai.maxOutputTokens,
          effort: ai.effort,
        });
        reviewUsage = reviewReply.usage;
        const parsedReview = reviewResultSchema.safeParse(reviewReply.data);
        if (!parsedReview.success) throw new AiError("BAD_RESPONSE", "The review reply did not have the expected shape.");
        verdictByIndex = new Map(parsedReview.data.results.map((r) => [r.index, { verdict: r.verdict, notes: r.notes }]));
        reviewed = true;
      } catch (err) {
        // The questions are still saved (as Pending); the admin just sees that the AI review did not run.
        reviewWarning = `The AI review did not run: ${toAiError(err).message}`;
      }
    }

    const verdicts: Record<Verdict, number> = { OK: 0, NEEDS_FIX: 0, REJECT: 0 };
    const rows = kept.map((k, i) => {
      const data = toQuestionData(k.input, itemDefaults);
      const v = verdictByIndex.get(i);
      if (v) verdicts[v.verdict]++;
      const notes = [
        v?.notes ? v.notes : reviewWarning,
        k.modelDifficulty !== params.difficulty ? `Claude rated this ${k.modelDifficulty.toLowerCase()}, not ${params.difficulty.toLowerCase()}.` : null,
      ]
        .filter(Boolean)
        .join(" ");
      return {
        ...data,
        options: data.options ?? undefined,
        status: "PENDING_APPROVAL" as const,
        source: "AI_GENERATED" as const,
        reviewVerdict: v?.verdict ?? null,
        reviewNotes: notes || null,
        aiRunId: run.id,
        createdById: actorId,
      };
    });
    if (rows.length > 0) await prisma.question.createMany({ data: rows });

    return await finishRun(prisma, run.id, actorId, {
      kind: "GENERATE",
      ai,
      testType: params.testType,
      difficulty: params.difficulty,
      requested: params.count,
      created: rows.length,
      dropped: droppedReasons.length,
      droppedReasons,
      reviewed,
      reviewWarning,
      verdicts,
      usage: addUsage(genUsage, reviewUsage),
      cost: cost(),
      received,
      attempts,
      shortfall,
      shortfallNote,
    });
  } catch (err) {
    const aiError = toAiError(err);
    await failRun(prisma, run.id, actorId, "GENERATE", ai, aiError, addUsage(genUsage, reviewUsage), cost());
    throw aiError;
  }
}

type Finish = {
  kind: "GENERATE" | "TRANSLATE";
  ai: { model: string; reviewModel: string };
  testType: string;
  difficulty?: string;
  requested: number;
  created: number;
  dropped: number;
  droppedReasons: string[];
  reviewed: boolean;
  reviewWarning: string | null;
  verdicts: Record<Verdict, number>;
  usage: Usage;
  cost: number;
  received?: number;
  attempts?: number;
  shortfall?: number;
  shortfallNote?: string | null;
};

/** Stores the run's totals and writes the audit-log entry. Shared by generation and translation. */
export async function finishRun(prisma: PrismaClient, runId: string, actorId: string, f: Finish): Promise<BatchResult> {
  await prisma.aiRun.update({
    where: { id: runId },
    data: {
      created: f.created,
      dropped: f.dropped,
      inputTokens: f.usage.inputTokens,
      outputTokens: f.usage.outputTokens,
      costEstimate: f.cost,
      status: "COMPLETED",
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId,
      action: f.kind === "GENERATE" ? "AI_GENERATION_RUN" : "AI_TRANSLATION_RUN",
      targetType: "AiRun",
      targetId: runId,
      metadata: {
        model: f.ai.model,
        reviewModel: f.ai.reviewModel,
        testType: f.testType,
        difficulty: f.difficulty ?? null,
        requested: f.requested,
        created: f.created,
        dropped: f.dropped,
        reviewed: f.reviewed,
        received: f.received ?? f.created + f.dropped,
        attempts: f.attempts ?? 1,
        shortfall: f.shortfall ?? 0,
        inputTokens: f.usage.inputTokens,
        outputTokens: f.usage.outputTokens,
        estimatedCostUsd: f.cost,
      },
    },
  });
  return {
    runId,
    requested: f.requested,
    created: f.created,
    dropped: f.dropped,
    droppedReasons: f.droppedReasons,
    reviewed: f.reviewed,
    reviewWarning: f.reviewWarning,
    verdicts: f.verdicts,
    inputTokens: f.usage.inputTokens,
    outputTokens: f.usage.outputTokens,
    costEstimate: f.cost,
    received: f.received ?? f.created + f.dropped,
    attempts: f.attempts ?? 1,
    shortfall: f.shortfall ?? 0,
    shortfallNote: f.shortfallNote ?? null,
  };
}

export async function failRun(
  prisma: PrismaClient,
  runId: string,
  actorId: string,
  kind: "GENERATE" | "TRANSLATE",
  ai: { model: string; reviewModel: string },
  error: AiError,
  usage: Usage,
  cost: number
) {
  await prisma.aiRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      error: `${error.code}: ${error.message}`,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costEstimate: cost,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId,
      action: kind === "GENERATE" ? "AI_GENERATION_FAILED" : "AI_TRANSLATION_FAILED",
      targetType: "AiRun",
      targetId: runId,
      metadata: { model: ai.model, errorCode: error.code, estimatedCostUsd: cost },
    },
  });
}

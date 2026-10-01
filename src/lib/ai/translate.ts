import type { PrismaClient } from "@prisma/client";
import { readSetting } from "@/lib/settings/store";
import { askClaudeJson, getClaudeClient, type ClaudeClient } from "./claude";
import { ZERO_USAGE, addUsage, estimateCost, type Usage } from "./cost";
import { AiError, toAiError } from "./errors";
import { failRun, finishRun, type BatchResult, type Verdict } from "./generate";
import { buildTranslationPrompt, buildTranslationReviewPrompt } from "./prompts";
import {
  REVIEW_JSON_SCHEMA,
  TRANSLATION_JSON_SCHEMA,
  reviewResultSchema,
  translationResultSchema,
} from "./schemas";

type Deps = { prisma: PrismaClient; client?: ClaudeClient };

export type TranslateResult = BatchResult & { remaining: number };

/**
 * The live English personality items (imported ones, and new versions that replaced them) that still have
 * no translation in the target language. Retired originals are skipped, so a question that got a new
 * version is translated again from its new wording.
 */
export function untranslatedWhere(defaultLanguageId: string, targetLanguageId: string) {
  return {
    source: { in: ["IMPORTED", "MANUAL"] as Array<"IMPORTED" | "MANUAL"> },
    testType: "PERSONALITY" as const,
    languageId: defaultLanguageId,
    status: { notIn: ["RETIRED", "REJECTED"] as Array<"RETIRED" | "REJECTED"> },
    translationOfId: null,
    translations: { none: { languageId: targetLanguageId } },
  };
}

/** How many imported items still need a translation into this language. */
export async function countUntranslated(prisma: PrismaClient, targetLanguageId: string): Promise<number> {
  const source = await prisma.language.findFirst({ where: { isDefault: true } });
  if (!source) return 0;
  return prisma.question.count({ where: untranslatedWhere(source.id, targetLanguageId) });
}

/**
 * Translates one batch of the imported IPIP items. The admin page calls this repeatedly until
 * `remaining` is 0. Translations are saved as PENDING, linked to the English original, with the
 * AI's back-translation and review in the notes.
 */
export async function translateIpipBatch(
  deps: Deps,
  actorId: string,
  params: { languageId: string }
): Promise<TranslateResult> {
  const { prisma } = deps;
  const [ai, prompts] = await Promise.all([readSetting(prisma, "aiGeneration"), readSetting(prisma, "aiPrompts")]);

  const [target, source] = await Promise.all([
    prisma.language.findUnique({ where: { id: params.languageId } }),
    prisma.language.findFirst({ where: { isDefault: true } }),
  ]);
  if (!target?.isActive) throw new AiError("INVALID_INPUT", "Choose an active language.");
  if (!source) throw new AiError("INVALID_INPUT", "No default language is set, so there is nothing to translate from.");
  if (target.id === source.id) throw new AiError("INVALID_INPUT", "Choose a language other than the default one.");

  const where = untranslatedWhere(source.id, target.id);
  const originals = await prisma.question.findMany({ where, orderBy: { id: "asc" }, take: ai.batchSize });
  if (originals.length === 0) {
    return {
      runId: "",
      requested: 0,
      created: 0,
      dropped: 0,
      droppedReasons: [],
      reviewed: false,
      reviewWarning: null,
      verdicts: { OK: 0, NEEDS_FIX: 0, REJECT: 0 },
      inputTokens: 0,
      outputTokens: 0,
      costEstimate: 0,
      received: 0,
      attempts: 0,
      shortfall: 0,
      shortfallNote: null,
      remaining: 0,
    };
  }

  const run = await prisma.aiRun.create({
    data: {
      kind: "TRANSLATE",
      actorId,
      model: ai.model,
      reviewModel: ai.reviewModel,
      testType: "PERSONALITY",
      languageId: target.id,
      requested: originals.length,
    },
  });

  let transUsage: Usage = ZERO_USAGE;
  let reviewUsage: Usage = ZERO_USAGE;
  const cost = () =>
    estimateCost(transUsage, ai.inputPricePerMTok, ai.outputPricePerMTok) +
    estimateCost(reviewUsage, ai.reviewInputPricePerMTok, ai.reviewOutputPricePerMTok);

  try {
    const client = deps.client ?? getClaudeClient();

    // Translate, then check that every item came back. Items without a translation are asked for again,
    // up to the number of retries in Settings; whatever is still missing is reported (and stays
    // untranslated, so the next batch picks it up again).
    type Original = (typeof originals)[number];
    const translated = new Map<string, { translation: string; backTranslation: string }>();
    let received = 0;
    let attempts = 0;
    let shortfallNote: string | null = null;

    for (let attempt = 0; attempt <= ai.shortfallRetries; attempt++) {
      const pending = originals.filter((o) => !translated.has(o.id));
      if (pending.length === 0) break;
      attempts++;
      try {
        const trans = buildTranslationPrompt(
          prompts,
          target.name,
          pending.map((o, i) => ({ index: i, text: o.content }))
        );
        const transReply = await askClaudeJson(client, {
          model: ai.model,
          system: trans.system,
          user: trans.user,
          schema: TRANSLATION_JSON_SCHEMA,
          maxTokens: ai.maxOutputTokens,
          effort: ai.effort,
        });
        transUsage = addUsage(transUsage, transReply.usage);
        const parsed = translationResultSchema.safeParse(transReply.data);
        if (!parsed.success) throw new AiError("BAD_RESPONSE", "Claude's reply did not have the expected shape. Try again.");
        received += parsed.data.items.length;
        for (const t of parsed.data.items) {
          const original = pending[t.index];
          const text = t.translation.trim();
          if (original && text && !translated.has(original.id)) {
            translated.set(original.id, { translation: text, backTranslation: t.backTranslation.trim() });
          }
        }
      } catch (err) {
        // Nothing back at all on the first request is an error; a failed retry just ends the retrying.
        if (attempt === 0) throw err;
        shortfallNote = `Asking again for the missing translations failed: ${toAiError(err).message}`;
        break;
      }
    }

    const droppedReasons: string[] = [];
    const kept: { original: Original; translation: string; backTranslation: string }[] = [];
    for (const original of originals) {
      const t = translated.get(original.id);
      if (!t) {
        droppedReasons.push("No translation returned for one item");
        continue;
      }
      kept.push({ original, translation: t.translation, backTranslation: t.backTranslation });
    }
    const shortfall = originals.length - kept.length;
    if (shortfall > 0) {
      shortfallNote =
        `Only ${kept.length} of the ${originals.length} items could be translated` +
        (attempts > 1 ? ` after ${attempts} attempts` : "") +
        `. ${shortfallNote ?? "The rest are picked up again next time."}`;
    }

    // Second pass: check meaning, negation and tone against the back-translation.
    let verdictByIndex = new Map<number, { verdict: Verdict; notes: string }>();
    let reviewed = false;
    let reviewWarning: string | null = null;
    if (kept.length > 0) {
      try {
        const review = buildTranslationReviewPrompt(
          prompts,
          target.name,
          kept.map((k, i) => ({ index: i, original: k.original.content, translation: k.translation, backTranslation: k.backTranslation }))
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
        reviewWarning = `The AI review did not run: ${toAiError(err).message}`;
      }
    }

    const verdicts: Record<Verdict, number> = { OK: 0, NEEDS_FIX: 0, REJECT: 0 };
    const rows = kept.map((k, i) => {
      const v = verdictByIndex.get(i);
      if (v) verdicts[v.verdict]++;
      const notes = [`Back-translation: "${k.backTranslation}"`, v?.notes ?? reviewWarning].filter(Boolean).join("\n");
      return {
        testType: "PERSONALITY" as const,
        type: "LIKERT" as const,
        content: k.translation,
        reverseKeyed: k.original.reverseKeyed,
        topic: k.original.topic,
        difficulty: k.original.difficulty,
        aParam: k.original.aParam,
        bParam: k.original.bParam,
        languageId: target.id,
        status: "PENDING_APPROVAL" as const,
        source: "AI_TRANSLATED" as const,
        translationOfId: k.original.id,
        reviewVerdict: v?.verdict ?? null,
        reviewNotes: notes,
        aiRunId: run.id,
        createdById: actorId,
      };
    });
    if (rows.length > 0) await prisma.question.createMany({ data: rows });

    const result = await finishRun(prisma, run.id, actorId, {
      kind: "TRANSLATE",
      ai,
      testType: "PERSONALITY",
      requested: originals.length,
      created: rows.length,
      dropped: droppedReasons.length,
      droppedReasons,
      reviewed,
      reviewWarning,
      verdicts,
      usage: addUsage(transUsage, reviewUsage),
      cost: cost(),
      received,
      attempts,
      shortfall,
      shortfallNote,
    });
    return { ...result, remaining: await prisma.question.count({ where }) };
  } catch (err) {
    const aiError = toAiError(err);
    await failRun(prisma, run.id, actorId, "TRANSLATE", ai, aiError, addUsage(transUsage, reviewUsage), cost());
    throw aiError;
  }
}

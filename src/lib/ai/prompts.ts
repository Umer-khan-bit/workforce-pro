import { renderTemplate } from "@/lib/messageTemplates";
import type { SettingValue } from "@/lib/settings/definitions";
import type { DifficultyValue } from "@/lib/questionBank/schema";

export type AiSettings = SettingValue<"aiGeneration">;
export type AiPrompts = SettingValue<"aiPrompts">;

export const GENERATABLE_TESTS = ["IQ", "EQ", "LANGUAGE", "SKILL"] as const;
export type GeneratableTest = (typeof GENERATABLE_TESTS)[number];

export const TEST_NAMES: Record<GeneratableTest | "PERSONALITY", string> = {
  PERSONALITY: "Personality",
  IQ: "IQ",
  EQ: "EQ (emotional intelligence)",
  LANGUAGE: "Language",
  SKILL: "Job skill",
};

export type Mix = { mcq: number; sj: number; likert: number; writing: number };

/** How many items of each format a batch holds. EQ and Language splits come from Settings. */
export function planMix(test: GeneratableTest, count: number, ai: Pick<AiSettings, "eqSituationalPercent" | "languageWritingPercent">): Mix {
  if (test === "EQ") {
    const sj = Math.round((count * ai.eqSituationalPercent) / 100);
    return { mcq: 0, sj, likert: count - sj, writing: 0 };
  }
  if (test === "LANGUAGE") {
    const writing = Math.round((count * ai.languageWritingPercent) / 100);
    return { mcq: count - writing, sj: 0, likert: 0, writing };
  }
  return { mcq: count, sj: 0, likert: 0, writing: 0 };
}

const INSTRUCTION_KEY = {
  IQ: "instructionIq",
  EQ: "instructionEq",
  LANGUAGE: "instructionLanguage",
  SKILL: "instructionSkill",
} as const;

export type GenerationContext = {
  test: GeneratableTest;
  count: number;
  languageName: string;
  jobRoleName: string | null;
  difficulty: DifficultyValue;
  focus: string;
  existing: string[];
};

const FORMAT_NOTE =
  "Return JSON with a `questions` array holding exactly the requested number of items. Use kind MCQ (multiple choice), SJ (situational judgement), LIKERT or WRITING. " +
  "MCQ and SJ items have exactly four options keyed A, B, C, D and a correctAnswer letter. LIKERT and WRITING items have an empty options array and a null correctAnswer. " +
  "Always fill explanation (why the answer is right; for LIKERT and WRITING, what it measures), difficulty, topic (a short label) and reverseKeyed (false unless a Likert statement is reverse-keyed).";

export function buildGenerationPrompt(prompts: AiPrompts, ai: AiSettings, ctx: GenerationContext) {
  const level = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" }[ctx.difficulty];
  const guide = { EASY: prompts.difficultyGuideEasy, MEDIUM: prompts.difficultyGuideMedium, HARD: prompts.difficultyGuideHard }[ctx.difficulty];
  const cefr = { EASY: prompts.cefrEasy, MEDIUM: prompts.cefrMedium, HARD: prompts.cefrHard }[ctx.difficulty];
  const mix = planMix(ctx.test, ctx.count, ai);

  const existing = ctx.existing.length ? ctx.existing.map((e) => `- ${e}`).join("\n") : "(none yet)";
  const user = renderTemplate(prompts[INSTRUCTION_KEY[ctx.test]], {
    count: String(ctx.count),
    language: ctx.languageName,
    jobRole: ctx.jobRoleName ?? "",
    difficulty: level,
    difficultyGuide: guide,
    cefr,
    focus: ctx.focus ? `Focus: ${ctx.focus}.` : "",
    existing,
    mcqCount: String(mix.mcq),
    sjCount: String(mix.sj),
    likertCount: String(mix.likert),
    writingCount: String(mix.writing),
  });

  return { system: prompts.systemPrompt, user: `${user}\n\n${FORMAT_NOTE}`, mix };
}

export type ReviewItem = {
  index: number;
  content: string;
  options?: { key: string; text: string }[];
  correctAnswer?: string | null;
  explanation?: string | null;
  difficulty?: string;
  reverseKeyed?: boolean;
};

export function buildReviewPrompt(
  prompts: AiPrompts,
  ctx: { testName: string; languageName: string; jobRoleName: string | null },
  items: ReviewItem[]
) {
  const system = renderTemplate(prompts.reviewPrompt, {
    testName: ctx.testName,
    language: ctx.languageName,
    jobRole: ctx.jobRoleName ?? "not applicable",
  });
  return { system, user: `Questions to review (JSON):\n${JSON.stringify(items, null, 2)}` };
}

export function buildTranslationPrompt(prompts: AiPrompts, languageName: string, items: { index: number; text: string }[]) {
  return {
    system: prompts.systemPrompt,
    user: `${renderTemplate(prompts.translationPrompt, { language: languageName })}\n\nItems (JSON):\n${JSON.stringify(items, null, 2)}`,
  };
}

export function buildTranslationReviewPrompt(
  prompts: AiPrompts,
  languageName: string,
  items: { index: number; original: string; translation: string; backTranslation: string }[]
) {
  return {
    system: renderTemplate(prompts.translationReviewPrompt, { language: languageName }),
    user: `Items to check (JSON):\n${JSON.stringify(items, null, 2)}`,
  };
}

/** Lower-cases and strips punctuation and spacing so near-identical repeats are caught. */
export function normalizeForDuplicate(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

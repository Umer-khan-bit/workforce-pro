import { z } from "zod";
import { TEST_TYPES, TEST_TYPE_LABELS } from "@/lib/questionBank/schema";
import { unknownPlaceholders } from "@/lib/messageTemplates";

/**
 * Every admin-editable business setting. The database (SiteSetting) holds the live values;
 * DEFAULT_SETTINGS are only the starting values written by the seed. This file is safe to
 * import from client components (no database code).
 */

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #1c6560");

/** PNG, JPEG, WebP or SVG as a data URL, small enough to live in the settings row. */
export const LOGO_MAX_CHARS = 200_000;
export const logoDataUrl = z
  .string()
  .max(LOGO_MAX_CHARS, "Logo is too large (about 150 KB maximum)")
  .regex(/^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/, "Logo must be a PNG, JPEG, WebP or SVG image")
  .nullable();

const percent = z.coerce.number().int().min(1).max(99);

export const brandingSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  tagline: z.string().trim().max(200),
  primaryColor: hexColor,
  logoDataUrl,
});

export const homepageSchema = z.object({
  headline: z.string().trim().min(1).max(120),
  subheadline: z.string().trim().max(300),
  loginLabel: z.string().trim().min(1).max(40),
  candidateSignupLabel: z.string().trim().min(1).max(40),
  companySignupLabel: z.string().trim().min(1).max(40),
});

export const currencySchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter code such as PKR"),
  locale: z.string().trim().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, "Use a locale such as en-PK"),
});

export const quartilesSchema = z
  .object({
    q1TopPercent: percent,
    q2TopPercent: percent,
    q3TopPercent: percent,
    minCohortSize: z.coerce.number().int().min(1).max(100000),
  })
  .refine((q) => q.q1TopPercent < q.q2TopPercent && q.q2TopPercent < q.q3TopPercent, {
    message: "Each quartile cut-off must be larger than the one before (Q1 < Q2 < Q3)",
    path: ["q2TopPercent"],
  });

export const topPerformerSchema = z.object({
  requiredQuartile: z.coerce.number().int().min(1).max(4),
  countedTests: z.array(z.enum(TEST_TYPES)).min(1, "Choose at least one test"),
});

export const itemDefaultsSchema = z
  .object({
    discrimination: z.coerce.number().gt(0).max(4),
    difficultyEasy: z.coerce.number().min(-4).max(4),
    difficultyMedium: z.coerce.number().min(-4).max(4),
    difficultyHard: z.coerce.number().min(-4).max(4),
  })
  .refine((d) => d.difficultyEasy < d.difficultyMedium && d.difficultyMedium < d.difficultyHard, {
    message: "Easy must be lower than Medium, and Medium lower than Hard",
    path: ["difficultyMedium"],
  });

export const selfLearningSchema = z
  .object({
    minResponsesForRecalibration: z.coerce.number().int().min(1).max(1000000),
    tooEasyCorrectRate: z.coerce.number().min(0).max(1),
    tooHardCorrectRate: z.coerce.number().min(0).max(1),
    minDiscrimination: z.coerce.number().min(0).max(4),
    maxDifGap: z.coerce.number().min(0).max(1),
  })
  .refine((s) => s.tooHardCorrectRate < s.tooEasyCorrectRate, {
    message: "The 'too hard' rate must be lower than the 'too easy' rate",
    path: ["tooHardCorrectRate"],
  });

export const poolTargetsSchema = z.object({
  PERSONALITY: z.coerce.number().int().min(0).max(100000),
  EQ: z.coerce.number().int().min(0).max(100000),
  IQ: z.coerce.number().int().min(0).max(100000),
  LANGUAGE: z.coerce.number().int().min(0).max(100000),
  SKILL: z.coerce.number().int().min(0).max(100000),
});

export const AI_EFFORTS = ["low", "medium", "high"] as const;

export const aiGenerationSchema = z
  .object({
    model: z.string().trim().min(1, "Model is required").max(100),
    reviewModel: z.string().trim().min(1, "Review model is required").max(100),
    effort: z.enum(AI_EFFORTS),
    maxOutputTokens: z.coerce.number().int().min(1000).max(64000),
    batchSize: z.coerce.number().int().min(1).max(25),
    maxQuestionsPerRun: z.coerce.number().int().min(1).max(500),
    eqSituationalPercent: z.coerce.number().int().min(0).max(100),
    languageWritingPercent: z.coerce.number().int().min(0).max(100),
    inputPricePerMTok: z.coerce.number().min(0).max(1000),
    outputPricePerMTok: z.coerce.number().min(0).max(1000),
    reviewInputPricePerMTok: z.coerce.number().min(0).max(1000),
    reviewOutputPricePerMTok: z.coerce.number().min(0).max(1000),
  })
  .refine((a) => a.batchSize <= a.maxQuestionsPerRun, {
    message: "Batch size cannot be larger than the maximum questions per run",
    path: ["batchSize"],
  });

/** Placeholders each prompt may use. The code fills them in; an unknown one is rejected on save. */
export const GENERATION_PROMPT_VARIABLES = [
  "count",
  "language",
  "jobRole",
  "difficulty",
  "difficultyGuide",
  "cefr",
  "focus",
  "existing",
  "mcqCount",
  "sjCount",
  "likertCount",
  "writingCount",
];
export const AI_PROMPT_VARIABLES = {
  systemPrompt: [] as string[],
  instructionIq: GENERATION_PROMPT_VARIABLES,
  instructionEq: GENERATION_PROMPT_VARIABLES,
  instructionLanguage: GENERATION_PROMPT_VARIABLES,
  instructionSkill: GENERATION_PROMPT_VARIABLES,
  reviewPrompt: ["testName", "language", "jobRole"],
  translationPrompt: ["language"],
  translationReviewPrompt: ["language"],
  difficultyGuideEasy: [] as string[],
  difficultyGuideMedium: [] as string[],
  difficultyGuideHard: [] as string[],
  cefrEasy: [] as string[],
  cefrMedium: [] as string[],
  cefrHard: [] as string[],
} satisfies Record<string, string[]>;

const prompt = z.string().trim().min(2, "Required").max(8000);

export const aiPromptsSchema = z
  .object({
    systemPrompt: prompt,
    instructionIq: prompt,
    instructionEq: prompt,
    instructionLanguage: prompt,
    instructionSkill: prompt,
    reviewPrompt: prompt,
    translationPrompt: prompt,
    translationReviewPrompt: prompt,
    difficultyGuideEasy: prompt,
    difficultyGuideMedium: prompt,
    difficultyGuideHard: prompt,
    cefrEasy: z.string().trim().min(1).max(20),
    cefrMedium: z.string().trim().min(1).max(20),
    cefrHard: z.string().trim().min(1).max(20),
  })
  .superRefine((v, ctx) => {
    for (const [name, allowed] of Object.entries(AI_PROMPT_VARIABLES)) {
      const bad = unknownPlaceholders(String(v[name as keyof typeof v]), allowed);
      if (bad.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: `Unknown placeholder ${bad.map((b) => `{{${b}}}`).join(", ")}. Allowed: ${
            allowed.length ? allowed.map((a) => `{{${a}}}`).join(", ") : "none"
          }`,
        });
      }
    }
  });

export const SETTING_SCHEMAS = {
  branding: brandingSchema,
  homepage: homepageSchema,
  currency: currencySchema,
  quartiles: quartilesSchema,
  topPerformer: topPerformerSchema,
  itemDefaults: itemDefaultsSchema,
  selfLearning: selfLearningSchema,
  poolTargets: poolTargetsSchema,
  aiGeneration: aiGenerationSchema,
  aiPrompts: aiPromptsSchema,
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;
export const SETTING_KEYS = Object.keys(SETTING_SCHEMAS) as SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return key in SETTING_SCHEMAS;
}

/** Starting values only. The seed writes these once; after that the database is the truth. */
export const DEFAULT_SETTINGS: { [K in SettingKey]: SettingValue<K> } = {
  branding: {
    name: "Workforce Pro",
    tagline: "Smart Workforce recruitment platform",
    primaryColor: "#1c6560",
    logoDataUrl: null,
  },
  homepage: {
    headline: "Workforce Pro",
    subheadline: "Take assessments, get ranked, get hired. Or find the right candidates faster.",
    loginLabel: "Log in",
    candidateSignupLabel: "Candidate sign up",
    companySignupLabel: "Company sign up",
  },
  currency: { code: "PKR", locale: "en-PK" },
  quartiles: { q1TopPercent: 25, q2TopPercent: 50, q3TopPercent: 75, minCohortSize: 30 },
  topPerformer: { requiredQuartile: 1, countedTests: ["IQ", "EQ", "LANGUAGE", "SKILL"] },
  itemDefaults: { discrimination: 1, difficultyEasy: -1, difficultyMedium: 0, difficultyHard: 1 },
  selfLearning: {
    minResponsesForRecalibration: 200,
    tooEasyCorrectRate: 0.9,
    tooHardCorrectRate: 0.1,
    minDiscrimination: 0.3,
    maxDifGap: 0.2,
  },
  poolTargets: { PERSONALITY: 50, EQ: 30, IQ: 40, LANGUAGE: 30, SKILL: 40 },
  aiGeneration: {
    model: "claude-sonnet-5-5",
    reviewModel: "claude-sonnet-5-5",
    effort: "medium",
    maxOutputTokens: 16000,
    batchSize: 10,
    maxQuestionsPerRun: 50,
    eqSituationalPercent: 60,
    languageWritingPercent: 20,
    inputPricePerMTok: 2,
    outputPricePerMTok: 10,
    reviewInputPricePerMTok: 2,
    reviewOutputPricePerMTok: 10,
  },
  aiPrompts: {
    systemPrompt:
      "You are an expert psychometrician and assessment item writer for a recruitment platform. You write clear, fair, culturally neutral test questions, each with exactly one defensible answer. Questions must be self-contained and must never contain personal data about real people. Return only the requested JSON.",
    instructionIq:
      "Write {{count}} multiple-choice IQ questions in {{language}}. Mix numerical, verbal, logical and abstract-pattern reasoning. Difficulty: {{difficulty}} - {{difficultyGuide}}. Each question has exactly 4 options (A to D), exactly one correct answer, and a short explanation of why it is correct. Questions must need no outside knowledge and no images, and must not favour any gender, region or culture. {{focus}}\nDo not repeat or closely paraphrase these existing questions:\n{{existing}}",
    instructionEq:
      "Write {{count}} emotional-intelligence items in {{language}} for workplace candidates: {{sjCount}} situational-judgement items (a short workplace scenario, 4 possible responses A to D, the single best response, and an explanation) and {{likertCount}} Likert statements rated from 1 (strongly disagree) to 5 (strongly agree) that measure self-awareness, self-regulation, empathy or social skills. For Likert items give the dimension as the topic, leave options empty, and set reverseKeyed to true when agreeing means LOWER emotional intelligence. {{focus}}\nDo not repeat or closely paraphrase these existing items:\n{{existing}}",
    instructionLanguage:
      "Write {{count}} items that test the {{language}} language for job candidates at CEFR level {{cefr}} ({{difficulty}}): {{mcqCount}} multiple-choice items (grammar, vocabulary or reading comprehension; 4 options A to D, one correct answer, and an explanation) and {{writingCount}} short writing prompts (a workplace-relevant task answerable in 3 to 6 sentences; no options). Write all question text, options and prompts in {{language}}. {{focus}}\nDo not repeat or closely paraphrase these existing items:\n{{existing}}",
    instructionSkill:
      "Write {{count}} multiple-choice job-skill questions in {{language}} for the role {{jobRole}}. Test practical knowledge that a competent {{jobRole}} is expected to have. Difficulty: {{difficulty}} - {{difficultyGuide}}. Each question has exactly 4 options (A to D), exactly one correct answer, and a short explanation. Avoid trick questions, company-specific or region-specific facts, and facts that change quickly. {{focus}}\nDo not repeat or closely paraphrase these existing questions:\n{{existing}}",
    reviewPrompt:
      "You are a strict test-item reviewer. Review each question below (test: {{testName}}, language: {{language}}, role: {{jobRole}}). Check: (1) factual or logical errors, including whether the marked answer is truly correct and the only correct one; (2) ambiguity or more than one defensible answer; (3) bias or offensive wording (gender, region, religion, culture, class); (4) quality of the wording in the target language; (5) for Likert statements, that the statement is clear and measures one thing. Give each question a verdict: OK, NEEDS_FIX (fixable - say exactly how) or REJECT (not salvageable). Keep notes to 1 to 3 sentences. Return one result per question, using the same index.",
    translationPrompt:
      "Translate each English personality statement into natural, modern {{language}} as used in workplace and psychology questionnaires. Keep the first person, the exact meaning and the tone, including negations (never turn a negative statement into a positive one), and keep it short. For each item also give a literal back-translation into English so a reviewer can check the meaning. Return one result per item, using the same index.",
    translationReviewPrompt:
      "You are checking {{language}} translations of English personality statements. For each item you get the English original, the {{language}} translation and a literal back-translation. Check that the meaning, polarity (negation) and tone are preserved, that the wording is natural and unambiguous, and that nothing was added or lost. Give each item a verdict: OK, NEEDS_FIX or REJECT, with 1 to 2 sentences of notes. Return one result per item, using the same index.",
    difficultyGuideEasy: "straightforward, answerable by most candidates in under 30 seconds",
    difficultyGuideMedium: "moderate, needing a couple of reasoning steps",
    difficultyGuideHard: "demanding, needing several steps or deeper expertise; only the strongest candidates get it right",
    cefrEasy: "A2-B1",
    cefrMedium: "B1-B2",
    cefrHard: "C1",
  },
};

// ---------- Admin form layout (drives the generic Settings editor) ----------

export type FieldSpec = {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "color" | "image" | "tests" | "select";
  help?: string;
  step?: number;
  rows?: number;
  options?: { value: string; label: string }[];
};

export type SettingGroup = {
  key: SettingKey;
  title: string;
  description: string;
  fields: FieldSpec[];
};

function placeholderHelp(allowed: string[]): string {
  return allowed.length
    ? `Placeholders: ${allowed.map((a) => `{{${a}}}`).join(" ")}`
    : "No placeholders.";
}

export const SETTING_GROUPS: SettingGroup[] = [
  {
    key: "branding",
    title: "Branding",
    description: "Name, logo and colour shown across the whole platform.",
    fields: [
      { name: "name", label: "Platform name", type: "text" },
      { name: "tagline", label: "Tagline (browser tab description)", type: "text" },
      {
        name: "primaryColor",
        label: "Brand colour",
        type: "color",
        help: "All shades of the brand colour are generated from this one.",
      },
      { name: "logoDataUrl", label: "Logo", type: "image", help: "PNG, JPEG, WebP or SVG, up to about 150 KB." },
    ],
  },
  {
    key: "homepage",
    title: "Homepage",
    description: "Text on the public landing page.",
    fields: [
      { name: "headline", label: "Headline", type: "text" },
      { name: "subheadline", label: "Sub-heading", type: "textarea" },
      { name: "loginLabel", label: "Log in button", type: "text" },
      { name: "candidateSignupLabel", label: "Candidate sign-up button", type: "text" },
      { name: "companySignupLabel", label: "Company sign-up button", type: "text" },
    ],
  },
  {
    key: "currency",
    title: "Currency",
    description: "How prices and salaries are shown.",
    fields: [
      { name: "code", label: "Currency code", type: "text", help: "For example PKR or USD." },
      { name: "locale", label: "Number format locale", type: "text", help: "For example en-PK or en-US." },
    ],
  },
  {
    key: "quartiles",
    title: "Quartiles",
    description: "How percentile ranks become Q1-Q4, and when the fallback cohort is used.",
    fields: [
      { name: "q1TopPercent", label: "Q1 = top ... %", type: "number" },
      { name: "q2TopPercent", label: "Q2 = top ... %", type: "number" },
      { name: "q3TopPercent", label: "Q3 = top ... %", type: "number" },
      {
        name: "minCohortSize",
        label: "Minimum candidates in a job role",
        type: "number",
        help: "Below this, quartiles are calculated against all candidates instead.",
      },
    ],
  },
  {
    key: "topPerformer",
    title: "Top performer",
    description: "Who earns the Top Performer badge and recognition email.",
    fields: [
      { name: "requiredQuartile", label: "Quartile needed in each test (1 = top)", type: "number" },
      { name: "countedTests", label: "Tests that must all reach it", type: "tests" },
    ],
  },
  {
    key: "itemDefaults",
    title: "Question defaults",
    description: "Starting difficulty values for questions that have not been calibrated yet.",
    fields: [
      { name: "discrimination", label: "Discrimination (a)", type: "number", step: 0.1 },
      { name: "difficultyEasy", label: "Easy difficulty (b)", type: "number", step: 0.1 },
      { name: "difficultyMedium", label: "Medium difficulty (b)", type: "number", step: 0.1 },
      { name: "difficultyHard", label: "Hard difficulty (b)", type: "number", step: 0.1 },
    ],
  },
  {
    key: "selfLearning",
    title: "Self-learning",
    description: "When the system recalibrates questions and flags them for your review.",
    fields: [
      { name: "minResponsesForRecalibration", label: "Responses needed before recalibrating", type: "number" },
      { name: "tooEasyCorrectRate", label: "Flag as too easy above this correct rate", type: "number", step: 0.01 },
      { name: "tooHardCorrectRate", label: "Flag as too hard below this correct rate", type: "number", step: 0.01 },
      { name: "minDiscrimination", label: "Flag low discrimination below", type: "number", step: 0.05 },
      { name: "maxDifGap", label: "Flag possible bias when groups differ by more than", type: "number", step: 0.01 },
    ],
  },
  {
    key: "poolTargets",
    title: "Question pool targets",
    description: "Approved questions wanted per test. Drives the red and amber gaps in the question bank.",
    fields: TEST_TYPES.map((t) => ({ name: t, label: TEST_TYPE_LABELS[t], type: "number" as const })),
  },
  {
    key: "aiGeneration",
    title: "AI generation",
    description:
      "Which Claude models write and review questions, how many per batch, and the prices used for the cost estimate (update the prices when you change the model). The API key itself is kept in the .env file, never here.",
    fields: [
      { name: "model", label: "Model that writes questions", type: "text" },
      { name: "reviewModel", label: "Model that reviews them", type: "text" },
      {
        name: "effort",
        label: "Thinking effort",
        type: "select",
        options: AI_EFFORTS.map((e) => ({ value: e, label: e })),
        help: "Higher is more careful but slower and dearer.",
      },
      { name: "maxOutputTokens", label: "Maximum reply length (tokens)", type: "number" },
      { name: "batchSize", label: "Questions per batch", type: "number" },
      { name: "maxQuestionsPerRun", label: "Most questions in one run", type: "number" },
      { name: "eqSituationalPercent", label: "EQ: % situational-judgement items (the rest are Likert)", type: "number" },
      { name: "languageWritingPercent", label: "Language: % writing prompts (the rest are multiple choice)", type: "number" },
      { name: "inputPricePerMTok", label: "Writer price: input, per million tokens (USD)", type: "number", step: 0.01 },
      { name: "outputPricePerMTok", label: "Writer price: output, per million tokens (USD)", type: "number", step: 0.01 },
      { name: "reviewInputPricePerMTok", label: "Reviewer price: input, per million tokens (USD)", type: "number", step: 0.01 },
      { name: "reviewOutputPricePerMTok", label: "Reviewer price: output, per million tokens (USD)", type: "number", step: 0.01 },
    ],
  },
  {
    key: "aiPrompts",
    title: "AI prompts",
    description:
      "The instructions sent to Claude. Placeholders in double curly braces are filled in by the system; only the ones listed under each box are allowed.",
    fields: [
      { name: "systemPrompt", label: "Shared system prompt", type: "textarea", rows: 7, help: placeholderHelp(AI_PROMPT_VARIABLES.systemPrompt) },
      { name: "instructionIq", label: "Generate IQ questions", type: "textarea", rows: 7, help: placeholderHelp(AI_PROMPT_VARIABLES.instructionIq) },
      { name: "instructionEq", label: "Generate EQ items", type: "textarea", rows: 7, help: placeholderHelp(AI_PROMPT_VARIABLES.instructionEq) },
      { name: "instructionLanguage", label: "Generate Language items", type: "textarea", rows: 7, help: placeholderHelp(AI_PROMPT_VARIABLES.instructionLanguage) },
      { name: "instructionSkill", label: "Generate Job-skill questions", type: "textarea", rows: 7, help: placeholderHelp(AI_PROMPT_VARIABLES.instructionSkill) },
      { name: "reviewPrompt", label: "Review generated questions", type: "textarea", rows: 7, help: placeholderHelp(AI_PROMPT_VARIABLES.reviewPrompt) },
      { name: "translationPrompt", label: "Translate personality items", type: "textarea", rows: 7, help: placeholderHelp(AI_PROMPT_VARIABLES.translationPrompt) },
      { name: "translationReviewPrompt", label: "Review translations", type: "textarea", rows: 7, help: placeholderHelp(AI_PROMPT_VARIABLES.translationReviewPrompt) },
      { name: "difficultyGuideEasy", label: "What \"easy\" means", type: "text" },
      { name: "difficultyGuideMedium", label: "What \"medium\" means", type: "text" },
      { name: "difficultyGuideHard", label: "What \"hard\" means", type: "text" },
      { name: "cefrEasy", label: "Language test: CEFR level for easy", type: "text" },
      { name: "cefrMedium", label: "Language test: CEFR level for medium", type: "text" },
      { name: "cefrHard", label: "Language test: CEFR level for hard", type: "text" },
    ],
  },
];


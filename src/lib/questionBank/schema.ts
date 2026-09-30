import { z } from "zod";

export const TEST_TYPES = ["PERSONALITY", "EQ", "IQ", "LANGUAGE", "SKILL"] as const;
export const QUESTION_TYPES = ["LIKERT", "MCQ", "SITUATIONAL_JUDGEMENT", "WRITING"] as const;
export const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export const QUESTION_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "RETIRED",
] as const;
/** Status filter values. FLAGGED is not a stored status; it comes from the item statistics. */
export const STATUS_FILTERS = ["PENDING_APPROVAL", "APPROVED", "RETIRED", "FLAGGED"] as const;

export type TestTypeValue = (typeof TEST_TYPES)[number];
export type QuestionTypeValue = (typeof QUESTION_TYPES)[number];
export type DifficultyValue = (typeof DIFFICULTIES)[number];
export type StatusFilterValue = (typeof STATUS_FILTERS)[number];

export const TEST_TYPE_LABELS: Record<TestTypeValue, string> = {
  PERSONALITY: "Personality",
  EQ: "EQ",
  IQ: "IQ",
  LANGUAGE: "Language",
  SKILL: "Job skill",
};

export const QUESTION_TYPE_LABELS: Record<QuestionTypeValue, string> = {
  LIKERT: "Likert (1-5)",
  MCQ: "Multiple choice",
  SITUATIONAL_JUDGEMENT: "Situational judgement",
  WRITING: "Writing task",
};

export const DIFFICULTY_LABELS: Record<DifficultyValue, string> = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
};

export const STATUS_LABELS: Record<(typeof QUESTION_STATUSES)[number], string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  RETIRED: "Retired",
};

/** Which question formats each test accepts. */
export const ALLOWED_QUESTION_TYPES: Record<TestTypeValue, QuestionTypeValue[]> = {
  PERSONALITY: ["LIKERT"],
  EQ: ["LIKERT", "SITUATIONAL_JUDGEMENT"],
  IQ: ["MCQ"],
  LANGUAGE: ["MCQ", "WRITING"],
  SKILL: ["MCQ"],
};

/** Default 2PL difficulty (b) for an uncalibrated item. Matches the test-engine rules. */
export const DIFFICULTY_TO_B: Record<DifficultyValue, number> = {
  EASY: -1,
  MEDIUM: 0,
  HARD: 1,
};

export const OPTION_KEYS = ["A", "B", "C", "D"] as const;

const optionSchema = z.object({
  key: z.enum(OPTION_KEYS),
  text: z.string().trim().min(1, "Option text is required").max(500),
});

const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

export const questionInputSchema = z
  .object({
    testType: z.enum(TEST_TYPES),
    type: z.enum(QUESTION_TYPES),
    content: z.string().trim().min(5, "Question text is too short").max(2000),
    options: z.array(optionSchema).optional(),
    correctAnswer: z.preprocess(emptyToUndefined, z.enum(OPTION_KEYS).optional()),
    reverseKeyed: z.boolean().default(false),
    topic: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
    difficulty: z.enum(DIFFICULTIES).default("MEDIUM"),
    jobRoleId: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    languageId: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  })
  .superRefine((q, ctx) => {
    const fail = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });

    if (!ALLOWED_QUESTION_TYPES[q.testType].includes(q.type)) {
      fail("type", `${TEST_TYPE_LABELS[q.testType]} tests cannot use this question format`);
    }

    const hasOptions = q.type === "MCQ" || q.type === "SITUATIONAL_JUDGEMENT";
    if (hasOptions) {
      const keys = q.options?.map((o) => o.key) ?? [];
      const exactlyAtoD = keys.length === 4 && OPTION_KEYS.every((k) => keys.includes(k));
      if (!exactlyAtoD) fail("options", "Provide exactly 4 options (A, B, C and D)");
      if (!q.correctAnswer) fail("correctAnswer", "Choose the correct (or best) answer");
    } else if (q.options?.length || q.correctAnswer) {
      fail("options", "This question format has no answer options");
    }

    if (q.reverseKeyed && q.type !== "LIKERT") {
      fail("reverseKeyed", "Only Likert items can be reverse-keyed");
    }
    if (q.testType === "SKILL" && !q.jobRoleId) {
      fail("jobRoleId", "Job-skill questions need a job role");
    }
    if (q.testType === "LANGUAGE" && !q.languageId) {
      fail("languageId", "Language questions need a language");
    }
  });

export type QuestionInput = z.infer<typeof questionInputSchema>;

/**
 * Turns validated input into database columns. Options, answer and difficulty only apply to
 * the formats that use them; the rest are cleared so stale values can't survive an edit.
 * `options: null` means "store SQL NULL" (the route maps it to Prisma.DbNull).
 */
export function toQuestionData(q: QuestionInput) {
  const hasOptions = q.type === "MCQ" || q.type === "SITUATIONAL_JUDGEMENT";
  const difficulty: DifficultyValue = q.type === "MCQ" ? q.difficulty : "MEDIUM";
  return {
    testType: q.testType,
    type: q.type,
    content: q.content,
    options: hasOptions ? (q.options ?? []).slice().sort((a, b) => a.key.localeCompare(b.key)) : null,
    correctAnswer: hasOptions ? (q.correctAnswer ?? null) : null,
    reverseKeyed: q.type === "LIKERT" ? q.reverseKeyed : false,
    topic: q.topic ?? null,
    difficulty,
    bParam: DIFFICULTY_TO_B[difficulty],
    jobRoleId: q.jobRoleId ?? null,
    languageId: q.languageId ?? null,
  };
}

export const listFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  testType: z.enum(TEST_TYPES).optional(),
  jobRoleId: z.string().max(100).optional(),
  languageId: z.string().max(100).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  status: z.enum(STATUS_FILTERS).optional(),
  page: z.coerce.number().int().min(1).max(10000).catch(1).default(1),
});

export type ListFilters = z.infer<typeof listFiltersSchema>;

/**
 * Reads the filter form's query string. Empty or unrecognised values are ignored instead of
 * failing, so a stale bookmark never shows an error page.
 */
export function parseListFilters(raw: Record<string, string | string[] | undefined>): ListFilters {
  const pick = (key: string) => {
    const v = raw[key];
    const s = Array.isArray(v) ? v[0] : v;
    return s === "" ? undefined : s;
  };
  const candidate = {
    q: pick("q"),
    testType: pick("testType"),
    jobRoleId: pick("jobRoleId"),
    languageId: pick("languageId"),
    difficulty: pick("difficulty"),
    status: pick("status"),
    page: pick("page"),
  };
  const parsed = listFiltersSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  // Drop whichever fields were invalid and keep the rest.
  const bad = new Set(parsed.error.issues.map((i) => String(i.path[0])));
  const cleaned = Object.fromEntries(Object.entries(candidate).filter(([k]) => !bad.has(k)));
  return listFiltersSchema.parse(cleaned);
}

export const PAGE_SIZE = 25;

import { z } from "zod";
import { TEST_TYPES, TEST_TYPE_LABELS } from "@/lib/questionBank/schema";

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

export const SETTING_SCHEMAS = {
  branding: brandingSchema,
  homepage: homepageSchema,
  currency: currencySchema,
  quartiles: quartilesSchema,
  topPerformer: topPerformerSchema,
  itemDefaults: itemDefaultsSchema,
  selfLearning: selfLearningSchema,
  poolTargets: poolTargetsSchema,
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
};

// ---------- Admin form layout (drives the generic Settings editor) ----------

export type FieldSpec = {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "color" | "image" | "tests";
  help?: string;
  step?: number;
};

export type SettingGroup = {
  key: SettingKey;
  title: string;
  description: string;
  fields: FieldSpec[];
};

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
];

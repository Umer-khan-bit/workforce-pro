import { z } from "zod";

/** What the model is asked to return (JSON Schema for the API) and how we check what comes back (zod). */
const OPTION_KEYS = ["A", "B", "C", "D"];

export const GENERATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "content", "options", "correctAnswer", "explanation", "difficulty", "topic", "reverseKeyed"],
        properties: {
          kind: { type: "string", enum: ["MCQ", "SJ", "LIKERT", "WRITING"] },
          content: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["key", "text"],
              properties: { key: { type: "string", enum: OPTION_KEYS }, text: { type: "string" } },
            },
          },
          correctAnswer: { anyOf: [{ type: "string", enum: OPTION_KEYS }, { type: "null" }] },
          explanation: { type: "string" },
          difficulty: { type: "string", enum: ["EASY", "MEDIUM", "HARD"] },
          topic: { type: "string" },
          reverseKeyed: { type: "boolean" },
        },
      },
    },
  },
} as const;

export const generatedItemSchema = z.object({
  kind: z.enum(["MCQ", "SJ", "LIKERT", "WRITING"]),
  content: z.string(),
  options: z.array(z.object({ key: z.string(), text: z.string() })).default([]),
  correctAnswer: z.string().nullable().default(null),
  explanation: z.string().default(""),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
  topic: z.string().default(""),
  reverseKeyed: z.boolean().default(false),
});
export type GeneratedItem = z.infer<typeof generatedItemSchema>;
export const generationResultSchema = z.object({ questions: z.array(generatedItemSchema) });

const VERDICTS = ["OK", "NEEDS_FIX", "REJECT"];

export const REVIEW_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "verdict", "notes"],
        properties: {
          index: { type: "integer" },
          verdict: { type: "string", enum: VERDICTS },
          notes: { type: "string" },
        },
      },
    },
  },
} as const;

export const reviewResultSchema = z.object({
  results: z.array(
    z.object({ index: z.number().int(), verdict: z.enum(["OK", "NEEDS_FIX", "REJECT"]), notes: z.string().default("") })
  ),
});

export const TRANSLATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "translation", "backTranslation"],
        properties: {
          index: { type: "integer" },
          translation: { type: "string" },
          backTranslation: { type: "string" },
        },
      },
    },
  },
} as const;

export const translationResultSchema = z.object({
  items: z.array(z.object({ index: z.number().int(), translation: z.string(), backTranslation: z.string().default("") })),
});

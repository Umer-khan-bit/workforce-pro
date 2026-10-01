import type { TestType } from "@prisma/client";

/** URL names for each test (/candidate/tests/iq) and the short description candidates see. */
export const TEST_SLUGS: Record<TestType, string> = {
  PERSONALITY: "personality",
  IQ: "iq",
  EQ: "eq",
  LANGUAGE: "language",
  SKILL: "skill",
};

export function testFromSlug(slug: string): TestType | null {
  return (Object.entries(TEST_SLUGS).find(([, s]) => s === slug)?.[0] as TestType | undefined) ?? null;
}

export const TEST_TITLES: Record<TestType, string> = {
  PERSONALITY: "Personality",
  IQ: "IQ",
  EQ: "EQ",
  LANGUAGE: "Language",
  SKILL: "Job skill",
};

export const TEST_BLURBS: Record<TestType, string> = {
  PERSONALITY: "How you usually think, feel and behave, across five traits. There are no right or wrong answers.",
  IQ: "Reasoning with numbers, words and patterns. The questions adapt to your level.",
  EQ: "How well you read and handle people and situations at work.",
  LANGUAGE: "Your command of the language: multiple-choice questions plus one short written answer.",
  SKILL: "Practical knowledge for your job role. The questions adapt to your level.",
};

export const LIKERT_LABELS = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];

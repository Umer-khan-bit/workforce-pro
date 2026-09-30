import { describe, expect, it } from "vitest";
import { parseListFilters, questionInputSchema, toQuestionData, type ItemDefaults } from "./schema";

// Starting values; the real ones come from Settings > Question defaults.
const defaults: ItemDefaults = { discrimination: 1, difficultyEasy: -1, difficultyMedium: 0, difficultyHard: 1 };

const options = [
  { key: "A", text: "One" },
  { key: "B", text: "Two" },
  { key: "C", text: "Three" },
  { key: "D", text: "Four" },
];

const validIq = {
  testType: "IQ",
  type: "MCQ",
  content: "Which number comes next: 2, 4, 8, ?",
  options,
  correctAnswer: "C",
  difficulty: "HARD",
};

const errorPaths = (input: unknown) => {
  const r = questionInputSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.path[0]);
};

describe("questionInputSchema", () => {
  it("accepts a valid IQ multiple-choice question", () => {
    expect(questionInputSchema.safeParse(validIq).success).toBe(true);
  });

  it("requires exactly 4 options A-D and a correct answer for MCQ", () => {
    expect(errorPaths({ ...validIq, options: options.slice(0, 3) })).toContain("options");
    expect(errorPaths({ ...validIq, options: [...options.slice(0, 3), { key: "C", text: "dup" }] })).toContain("options");
    expect(errorPaths({ ...validIq, correctAnswer: "" })).toContain("correctAnswer");
  });

  it("rejects a format that the test does not allow", () => {
    expect(errorPaths({ ...validIq, testType: "PERSONALITY" })).toContain("type");
    expect(errorPaths({ ...validIq, type: "WRITING", options: undefined, correctAnswer: undefined })).toContain("type");
  });

  it("requires a job role for Skill questions and a language for Language questions", () => {
    expect(errorPaths({ ...validIq, testType: "SKILL" })).toContain("jobRoleId");
    expect(errorPaths({ ...validIq, testType: "SKILL", jobRoleId: "role1" })).toEqual([]);
    expect(errorPaths({ ...validIq, testType: "LANGUAGE" })).toContain("languageId");
    expect(errorPaths({ ...validIq, testType: "LANGUAGE", languageId: "lang1" })).toEqual([]);
  });

  it("accepts a Likert item and allows reverse-keying only on Likert", () => {
    const likert = { testType: "PERSONALITY", type: "LIKERT", content: "I am the life of the party." };
    expect(questionInputSchema.safeParse({ ...likert, reverseKeyed: true }).success).toBe(true);
    expect(errorPaths({ ...likert, options }) ).toContain("options");
    expect(errorPaths({ ...validIq, reverseKeyed: true })).toContain("reverseKeyed");
  });

  it("accepts a writing task with no options", () => {
    const writing = { testType: "LANGUAGE", type: "WRITING", content: "Describe your last job.", languageId: "l1" };
    expect(questionInputSchema.safeParse(writing).success).toBe(true);
  });

  it("rejects too-short text", () => {
    expect(errorPaths({ ...validIq, content: "Hi" })).toContain("content");
  });
});

describe("toQuestionData", () => {
  it("sets the starting difficulty parameter from easy/medium/hard", () => {
    const b = (difficulty: string) =>
      toQuestionData(questionInputSchema.parse({ ...validIq, difficulty }), defaults).bParam;
    expect([b("EASY"), b("MEDIUM"), b("HARD")]).toEqual([-1, 0, 1]);
  });

  it("uses the admin-configured defaults, not fixed numbers", () => {
    const custom: ItemDefaults = { discrimination: 1.4, difficultyEasy: -2, difficultyMedium: 0.5, difficultyHard: 2.5 };
    const data = toQuestionData(questionInputSchema.parse({ ...validIq, difficulty: "MEDIUM" }), custom);
    expect(data).toMatchObject({ aParam: 1.4, bParam: 0.5 });
  });

  it("clears options, answer and difficulty when the format does not use them", () => {
    const data = toQuestionData(
      questionInputSchema.parse({
        testType: "PERSONALITY",
        type: "LIKERT",
        content: "I am the life of the party.",
        difficulty: "HARD",
        reverseKeyed: true,
      }),
      defaults
    );
    expect(data).toMatchObject({ options: null, correctAnswer: null, difficulty: "MEDIUM", bParam: 0, reverseKeyed: true });
  });
});

describe("parseListFilters", () => {
  it("ignores empty and unknown values instead of failing", () => {
    const f = parseListFilters({ q: "", testType: "NOPE", status: "FLAGGED", page: "abc", difficulty: ["EASY"] });
    expect(f).toMatchObject({ status: "FLAGGED", difficulty: "EASY", page: 1 });
    expect(f.testType).toBeUndefined();
    expect(f.q).toBeUndefined();
  });
});

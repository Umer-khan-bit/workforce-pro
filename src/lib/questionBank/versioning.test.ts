import { describe, expect, it } from "vitest";
import { LOCKED_MESSAGE, isFrozenQuestionError, protectedChanges, type QuestionFields } from "./versioning";

const options = [
  { key: "A", text: "One" },
  { key: "B", text: "Two" },
  { key: "C", text: "Three" },
  { key: "D", text: "Four" },
];

const base: QuestionFields = {
  content: "What is 1 + 1?",
  options,
  correctAnswer: "B",
  type: "MCQ",
  testType: "IQ",
  reverseKeyed: false,
  topic: "arithmetic",
  languageId: "lang-1",
  jobRoleId: null,
  difficulty: "MEDIUM",
};

describe("protectedChanges (what is frozen once a question has been answered)", () => {
  it("reports nothing when nothing changes", () => {
    expect(protectedChanges(base, { ...base })).toEqual([]);
  });

  it.each([
    ["question text", { content: "What is 2 + 2?" }],
    ["correct answer", { correctAnswer: "C" }],
    ["question format", { type: "SITUATIONAL_JUDGEMENT" }],
    ["test", { testType: "SKILL" }],
    ["reverse-keying", { reverseKeyed: true }],
    ["topic", { topic: "geometry" }],
    ["language", { languageId: "lang-2" }],
    ["job role", { jobRoleId: "role-1" }],
    ["difficulty", { difficulty: "HARD" }],
  ] as const)("reports a change to the %s", (label, change) => {
    expect(protectedChanges(base, { ...base, ...change })).toEqual([label]);
  });

  it("reports a change to the answer options, in text or in which option is where", () => {
    const edited = options.map((o) => (o.key === "C" ? { ...o, text: "Three!" } : o));
    expect(protectedChanges(base, { ...base, options: edited })).toEqual(["answer options"]);
    expect(protectedChanges(base, { ...base, options: options.slice(0, 3) })).toEqual(["answer options"]);
  });

  it("does not count the order options are listed in, or extra properties, as a change", () => {
    expect(protectedChanges(base, { ...base, options: [...options].reverse() })).toEqual([]);
    expect(protectedChanges(base, { ...base, options: options.map((o) => ({ ...o, extra: 1 })) })).toEqual([]);
  });

  it("treats empty and missing values alike (null versus undefined)", () => {
    const noTopic = { ...base, topic: null };
    expect(protectedChanges(noTopic, { ...noTopic, topic: null })).toEqual([]);
    expect(protectedChanges({ ...base, options: null, correctAnswer: null }, { ...base, options: [], correctAnswer: null })).toEqual([]);
  });

  it("reports every changed field at once", () => {
    const changes = protectedChanges(base, { ...base, content: "New text", correctAnswer: "A", difficulty: "EASY" });
    expect(changes.sort()).toEqual(["correct answer", "difficulty", "question text"]);
  });
});

describe("messages", () => {
  it("tells the admin to retire the question and add a new version", () => {
    expect(LOCKED_MESSAGE).toMatch(/retire it and add a new version/i);
  });

  it("recognises the database's refusal, and nothing else", () => {
    expect(isFrozenQuestionError(new Error("Question abc has candidate responses and cannot be changed; retire it and add a new version"))).toBe(true);
    expect(isFrozenQuestionError(new Error("connection refused"))).toBe(false);
    expect(isFrozenQuestionError("retire it and add a new version")).toBe(false);
  });
});

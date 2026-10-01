import { afterEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import type { PrismaClient } from "@prisma/client";
import { askClaudeJson, getClaudeClient, type ClaudeClient } from "./claude";
import { estimateCost, formatCost } from "./cost";
import { AiError, toAiError } from "./errors";
import { generateBatch } from "./generate";
import { buildGenerationPrompt, normalizeForDuplicate, planMix } from "./prompts";
import { translateIpipBatch } from "./translate";
import { DEFAULT_SETTINGS } from "@/lib/settings/definitions";
import { bulkApprove } from "@/lib/questionBank/bulkApprove";

const ai = DEFAULT_SETTINGS.aiGeneration;
const prompts = DEFAULT_SETTINGS.aiPrompts;

function reply(json: unknown, over: Record<string, unknown> = {}) {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text: typeof json === "string" ? json : JSON.stringify(json) }],
    usage: { input_tokens: 1000, output_tokens: 500 },
    ...over,
  };
}

/** A client whose answers are queued in order. */
function fakeClient(...answers: unknown[]) {
  const create = vi.fn();
  for (const a of answers) {
    if (a instanceof Error) create.mockRejectedValueOnce(a);
    else create.mockResolvedValueOnce(a);
  }
  return { client: { messages: { create } } as unknown as ClaudeClient, create };
}

const apiError = (status: number, message: string, type = "invalid_request_error") =>
  Anthropic.APIError.generate(status, { type: "error", error: { type, message } }, message, new Headers());

describe("error messages", () => {
  it("explains a missing key", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    try {
      getClaudeClient();
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AiError);
      expect((e as AiError).code).toBe("NO_API_KEY");
      expect((e as AiError).message).toMatch(/ANTHROPIC_API_KEY/);
    }
    vi.unstubAllEnvs();
  });

  it.each([
    [401, "invalid x-api-key", "BAD_API_KEY"],
    [403, "forbidden", "BAD_API_KEY"],
    [429, "slow down", "RATE_LIMITED"],
    [404, "model not found", "BAD_MODEL"],
    [529, "overloaded", "OVERLOADED"],
    [500, "oops", "OVERLOADED"],
    [402, "billing", "NO_CREDIT"],
    [400, "Your credit balance is too low to access the Anthropic API.", "NO_CREDIT"],
    [400, "messages: invalid", "BAD_REQUEST"],
  ])("maps HTTP %i (%s) to %s", (status, message, code) => {
    expect(toAiError(apiError(status, message)).code).toBe(code);
  });

  it("never leaks the raw provider message or any key", () => {
    const e = toAiError(apiError(401, "invalid x-api-key sk-ant-SECRET"));
    expect(e.message).not.toMatch(/sk-ant/);
  });

  it("maps unknown failures to a generic message", () => {
    expect(toAiError(new Error("boom")).code).toBe("UNKNOWN");
  });
});

describe("cost", () => {
  it("prices tokens per million", () => {
    expect(estimateCost({ inputTokens: 1_000_000, outputTokens: 500_000 }, 2, 10)).toBe(7);
    expect(estimateCost({ inputTokens: 1000, outputTokens: 500 }, 2, 10)).toBeCloseTo(0.007, 6);
    expect(formatCost(0.007)).toBe("$0.0070");
    expect(formatCost(1.234)).toBe("$1.23");
  });
});

describe("askClaudeJson", () => {
  const req = { model: "m", system: "s", user: "u", schema: {}, maxTokens: 100, effort: "medium" as const };

  it("returns parsed JSON and token usage", async () => {
    const { client } = fakeClient(reply({ a: 1 }));
    const r = await askClaudeJson(client, req);
    expect(r.data).toEqual({ a: 1 });
    expect(r.usage).toEqual({ inputTokens: 1000, outputTokens: 500 });
  });

  it("turns a refusal, a cut-off and junk into clear errors", async () => {
    await expect(askClaudeJson(fakeClient(reply({}, { stop_reason: "refusal" })).client, req)).rejects.toMatchObject({ code: "REFUSED" });
    await expect(askClaudeJson(fakeClient(reply({}, { stop_reason: "max_tokens" })).client, req)).rejects.toMatchObject({ code: "TRUNCATED" });
    await expect(askClaudeJson(fakeClient(reply("not json")).client, req)).rejects.toMatchObject({ code: "BAD_RESPONSE" });
    await expect(askClaudeJson(fakeClient({ stop_reason: "end_turn", content: [], usage: { input_tokens: 1, output_tokens: 1 } }).client, req)).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });

  it("converts SDK errors (for example out of credit) into AiErrors", async () => {
    const { client } = fakeClient(apiError(400, "Your credit balance is too low"));
    await expect(askClaudeJson(client, req)).rejects.toMatchObject({ code: "NO_CREDIT" });
  });
});

describe("prompts", () => {
  it("splits EQ and Language batches using the Settings percentages", () => {
    expect(planMix("EQ", 10, { eqSituationalPercent: 60, languageWritingPercent: 20 })).toEqual({ mcq: 0, sj: 6, likert: 4, writing: 0 });
    expect(planMix("LANGUAGE", 10, { eqSituationalPercent: 60, languageWritingPercent: 20 })).toEqual({ mcq: 8, sj: 0, likert: 0, writing: 2 });
    expect(planMix("IQ", 7, ai)).toEqual({ mcq: 7, sj: 0, likert: 0, writing: 0 });
  });

  it("fills every placeholder from the settings and leaves none behind", () => {
    const base = { count: 5, languageName: "Urdu", jobRoleName: "Accountant", difficulty: "HARD" as const, focus: "month-end closing", existing: ["An old question"] };
    for (const test of ["IQ", "EQ", "LANGUAGE", "SKILL"] as const) {
      const { user, system } = buildGenerationPrompt(prompts, ai, { ...base, test });
      expect(user, test).not.toMatch(/\{\{/);
      expect(user).toContain("Urdu");
      expect(user).toContain("- An old question");
      expect(user).toContain("Focus: month-end closing.");
      expect(system).toBe(prompts.systemPrompt);
    }
    const lang = buildGenerationPrompt(prompts, ai, { ...base, test: "LANGUAGE" }).user;
    expect(lang).toContain(prompts.cefrHard);
    expect(buildGenerationPrompt(prompts, ai, { ...base, test: "SKILL" }).user).toContain("Accountant");
  });

  it("uses edited prompt text, not built-in text", () => {
    const custom = { ...prompts, instructionIq: "CUSTOM {{count}} in {{language}}" };
    const { user } = buildGenerationPrompt(custom, ai, { test: "IQ", count: 3, languageName: "English", jobRoleName: null, difficulty: "EASY", focus: "", existing: [] });
    expect(user.startsWith("CUSTOM 3 in English")).toBe(true);
  });

  it("recognises near-identical text as a repeat", () => {
    expect(normalizeForDuplicate("What is 2 + 2?")).toBe(normalizeForDuplicate("what is 2+2"));
  });
});

// ---------- fake database for the generate / translate flows ----------

function fakeDb(opts: { existing?: string[]; originals?: Array<Record<string, unknown>>; remaining?: number } = {}) {
  const created: Array<Record<string, unknown>> = [];
  const runs: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const db = {
    siteSetting: { findUnique: vi.fn().mockResolvedValue(null) },
    language: {
      findUnique: vi.fn().mockResolvedValue({ id: "lang-ur", name: "Urdu", code: "ur", isActive: true }),
      findFirst: vi.fn().mockResolvedValue({ id: "lang-en", name: "English", isDefault: true }),
    },
    jobRole: { findUnique: vi.fn().mockResolvedValue({ id: "role-1", name: "Accountant", isActive: true }) },
    aiRun: {
      create: vi.fn().mockImplementation(async ({ data }) => { runs.push({ ...data }); return { id: "run-1", ...data }; }),
      update: vi.fn().mockImplementation(async ({ data }) => { Object.assign(runs[0], data); return {}; }),
    },
    auditLog: { create: vi.fn().mockImplementation(async ({ data }) => { audits.push(data); return {}; }) },
    question: {
      findMany: vi.fn().mockImplementation(async (args: { where?: { source?: unknown } }) =>
        (args?.where?.source as { in?: string[] } | undefined)?.in?.includes("IMPORTED") ? (opts.originals ?? []) : (opts.existing ?? []).map((content) => ({ content }))
      ),
      createMany: vi.fn().mockImplementation(async ({ data }) => { created.push(...data); return { count: data.length }; }),
      count: vi.fn().mockResolvedValue(opts.remaining ?? 0),
    },
  };
  return { db: db as unknown as PrismaClient, created, runs, audits, raw: db };
}

const mcq = (content: string, over: Record<string, unknown> = {}) => ({
  kind: "MCQ",
  content,
  options: [
    { key: "A", text: "One" },
    { key: "B", text: "Two" },
    { key: "C", text: "Three" },
    { key: "D", text: "Four" },
  ],
  correctAnswer: "B",
  explanation: "Because two.",
  difficulty: "MEDIUM",
  topic: "numbers",
  reverseKeyed: false,
  ...over,
});

const review = (...verdicts: Array<[string, string]>) => ({
  results: verdicts.map(([verdict, notes], index) => ({ index, verdict, notes })),
});

describe("generateBatch", () => {
  const params = { testType: "IQ" as const, languageId: "lang-ur", difficulty: "MEDIUM" as const, count: 3 };

  it("saves everything as pending AI-generated with the review verdicts, and logs the run", async () => {
    const { db, created, audits, runs } = fakeDb();
    const { client, create } = fakeClient(
      reply({ questions: [mcq("First question about numbers?"), mcq("Second question about shapes?"), mcq("Third question about words?")] }),
      reply(review(["OK", "Fine."], ["NEEDS_FIX", "Option B is also defensible."], ["REJECT", "Wrong answer."]))
    );
    const result = await generateBatch({ prisma: db, client }, "admin-1", params);

    expect(create).toHaveBeenCalledTimes(2); // write + review
    expect(result).toMatchObject({ created: 3, dropped: 0, reviewed: true, verdicts: { OK: 1, NEEDS_FIX: 1, REJECT: 1 } });
    expect(created).toHaveLength(3);
    for (const q of created) {
      expect(q).toMatchObject({ status: "PENDING_APPROVAL", source: "AI_GENERATED", aiRunId: "run-1", createdById: "admin-1", testType: "IQ", languageId: "lang-ur" });
      expect(q.approvedById).toBeUndefined();
      expect(q.explanation).toBe("Because two.");
    }
    expect(created.map((q) => q.reviewVerdict)).toEqual(["OK", "NEEDS_FIX", "REJECT"]);
    expect(created[1].reviewNotes).toContain("defensible");

    // 2 x (1000 in, 500 out) at the starting prices = $0.014
    expect(result.costEstimate).toBeCloseTo(0.014, 6);
    expect(runs[0]).toMatchObject({ status: "COMPLETED", created: 3, inputTokens: 2000, outputTokens: 1000 });
    const log = audits.find((a) => a.action === "AI_GENERATION_RUN")!;
    expect(log).toMatchObject({ actorId: "admin-1", targetType: "AiRun" });
    expect(log.metadata).toMatchObject({ model: ai.model, requested: 3, created: 3, estimatedCostUsd: expect.any(Number) });
  });

  it("uses the model, effort and prompts from Settings", async () => {
    const { db } = fakeDb();
    (db as unknown as { siteSetting: { findUnique: ReturnType<typeof vi.fn> } }).siteSetting.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) =>
      where.key === "aiGeneration" ? { value: { model: "model-x", reviewModel: "model-y", effort: "low" } } : null
    );
    const { client, create } = fakeClient(reply({ questions: [mcq("Only question here?")] }), reply(review(["OK", ""])));
    await generateBatch({ prisma: db, client }, "admin-1", { ...params, count: 1 });
    expect(create.mock.calls[0][0]).toMatchObject({ model: "model-x", output_config: { effort: "low" }, system: prompts.systemPrompt });
    expect(create.mock.calls[1][0].model).toBe("model-y");
  });

  it("drops invalid, wrong-format and repeated questions but keeps the good ones", async () => {
    const { db, created } = fakeDb({ existing: ["An existing question about numbers?"] });
    const { client } = fakeClient(
      reply({
        questions: [
          mcq("A good new question?"),
          mcq("Only three options?", { options: [{ key: "A", text: "x" }, { key: "B", text: "y" }, { key: "C", text: "z" }] }),
          mcq("A likert statement by mistake", { kind: "LIKERT", options: [], correctAnswer: null }),
          mcq("an existing question about numbers"),
        ],
      }),
      reply(review(["OK", "Good."]))
    );
    const result = await generateBatch({ prisma: db, client }, "admin-1", { ...params, count: 4 });
    expect(result.created).toBe(1);
    expect(result.dropped).toBe(3);
    expect(result.droppedReasons.join(" ")).toMatch(/Repeats an existing question/);
    expect(created[0].content).toBe("A good new question?");
  });

  it("still saves the questions, as pending, when the review step fails", async () => {
    const { db, created } = fakeDb();
    const { client } = fakeClient(reply({ questions: [mcq("Question that needs a review?")] }), apiError(429, "slow down", "rate_limit_error"));
    const result = await generateBatch({ prisma: db, client }, "admin-1", { ...params, count: 1 });
    expect(result).toMatchObject({ created: 1, reviewed: false });
    expect(result.reviewWarning).toMatch(/AI review did not run/);
    expect(created[0]).toMatchObject({ status: "PENDING_APPROVAL", reviewVerdict: null });
    expect(String(created[0].reviewNotes)).toMatch(/did not run/);
  });

  it("notes when Claude rates the difficulty differently from the request", async () => {
    const { db, created } = fakeDb();
    const { client } = fakeClient(reply({ questions: [mcq("A harder one than asked?", { difficulty: "HARD" })] }), reply(review(["OK", "Fine."])));
    await generateBatch({ prisma: db, client }, "admin-1", { ...params, count: 1 });
    expect(created[0].difficulty).toBe("MEDIUM");
    expect(String(created[0].reviewNotes)).toMatch(/rated this hard, not medium/);
  });

  it("generates EQ situational and Likert items and Language writing prompts", async () => {
    const eq = fakeDb();
    const likert = { kind: "LIKERT", content: "I notice my mood changing quickly.", options: [], correctAnswer: null, explanation: "Self-awareness", difficulty: "MEDIUM", topic: "Self-awareness", reverseKeyed: false };
    const sj = mcq("A colleague snaps at you in a meeting. What do you do?", { kind: "SJ" });
    await generateBatch({ prisma: eq.db, client: fakeClient(reply({ questions: [sj, likert] }), reply(review(["OK", ""], ["OK", ""]))).client }, "a", { testType: "EQ", languageId: "lang-ur", difficulty: "MEDIUM", count: 2 });
    expect(eq.created.map((q) => q.type)).toEqual(["SITUATIONAL_JUDGEMENT", "LIKERT"]);

    const lang = fakeDb();
    const writing = { kind: "WRITING", content: "Describe a time you solved a problem at work.", options: [], correctAnswer: null, explanation: "Tests written fluency", difficulty: "MEDIUM", topic: "work", reverseKeyed: false };
    await generateBatch({ prisma: lang.db, client: fakeClient(reply({ questions: [mcq("Choose the correct word.", {}), writing] }), reply(review(["OK", ""], ["OK", ""]))).client }, "a", { testType: "LANGUAGE", languageId: "lang-ur", difficulty: "MEDIUM", count: 2 });
    expect(lang.created.map((q) => q.type)).toEqual(["MCQ", "WRITING"]);
  });

  it("requires a job role for Skill and respects the batch size", async () => {
    const { db } = fakeDb();
    const { client } = fakeClient();
    await expect(generateBatch({ prisma: db, client }, "a", { ...params, testType: "SKILL" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(generateBatch({ prisma: db, client }, "a", { ...params, count: ai.batchSize + 1 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(generateBatch({ prisma: db, client }, "a", { ...params, count: 0 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("records a failed run and rethrows a clear message when there is no credit", async () => {
    const { db, created, runs, audits } = fakeDb();
    const { client } = fakeClient(apiError(400, "Your credit balance is too low to access the Anthropic API."));
    await expect(generateBatch({ prisma: db, client }, "admin-1", params)).rejects.toMatchObject({ code: "NO_CREDIT" });
    expect(created).toHaveLength(0);
    expect(runs[0]).toMatchObject({ status: "FAILED" });
    expect(String(runs[0].error)).toMatch(/NO_CREDIT/);
    expect(audits.some((a) => a.action === "AI_GENERATION_FAILED")).toBe(true);
  });

  it("records a failed run when the API key is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { db, runs } = fakeDb();
    await expect(generateBatch({ prisma: db }, "admin-1", params)).rejects.toMatchObject({ code: "NO_API_KEY" });
    expect(runs[0]).toMatchObject({ status: "FAILED" });
    vi.unstubAllEnvs();
  });
});

describe("translateIpipBatch", () => {
  const originals = [
    { id: "q1", content: "I am the life of the party.", reverseKeyed: false, topic: "Extraversion", difficulty: "MEDIUM", aParam: 1, bParam: 0 },
    { id: "q2", content: "I don't talk a lot.", reverseKeyed: true, topic: "Extraversion", difficulty: "MEDIUM", aParam: 1, bParam: 0 },
  ];

  it("saves pending translations linked to the originals, keeping trait and reverse-keying", async () => {
    const { db, created, audits } = fakeDb({ originals, remaining: 0 });
    const { client } = fakeClient(
      reply({ items: [{ index: 0, translation: "میں محفل کی جان ہوں۔", backTranslation: "I am the soul of the gathering." }, { index: 1, translation: "میں زیادہ بات نہیں کرتا۔", backTranslation: "I do not talk much." }] }),
      reply(review(["OK", "Meaning kept."], ["NEEDS_FIX", "Softer than the original."]))
    );
    const result = await translateIpipBatch({ prisma: db, client }, "admin-1", { languageId: "lang-ur" });

    expect(result).toMatchObject({ created: 2, remaining: 0, reviewed: true });
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({
      status: "PENDING_APPROVAL",
      source: "AI_TRANSLATED",
      translationOfId: "q1",
      languageId: "lang-ur",
      type: "LIKERT",
      testType: "PERSONALITY",
      topic: "Extraversion",
      reverseKeyed: false,
    });
    expect(created[1]).toMatchObject({ translationOfId: "q2", reverseKeyed: true, reviewVerdict: "NEEDS_FIX" });
    expect(String(created[0].reviewNotes)).toContain("Back-translation:");
    expect(audits.some((a) => a.action === "AI_TRANSLATION_RUN")).toBe(true);
  });

  it("does nothing, and costs nothing, when everything is already translated", async () => {
    const { db } = fakeDb({ originals: [] });
    const { client, create } = fakeClient();
    const result = await translateIpipBatch({ prisma: db, client }, "admin-1", { languageId: "lang-ur" });
    expect(result).toMatchObject({ created: 0, remaining: 0, costEstimate: 0 });
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses to translate into the default language", async () => {
    const { db, raw } = fakeDb({ originals });
    raw.language.findUnique.mockResolvedValue({ id: "lang-en", name: "English", isActive: true });
    const { client } = fakeClient();
    await expect(translateIpipBatch({ prisma: db, client }, "a", { languageId: "lang-en" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("bulkApprove", () => {
  function approveDb(rows: Array<{ id: string; reviewVerdict: string | null }>) {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const findMany = vi.fn().mockResolvedValue(rows);
    return { db: { question: { findMany, updateMany } } as unknown as PrismaClient, updateMany, findMany };
  }
  const rows = [
    { id: "a", reviewVerdict: "OK" },
    { id: "b", reviewVerdict: null },
    { id: "c", reviewVerdict: "NEEDS_FIX" },
    { id: "d", reviewVerdict: "REJECT" },
  ];

  it("only looks at pending questions and skips flagged ones by default", async () => {
    const { db, updateMany, findMany } = approveDb(rows);
    const r = await bulkApprove(db, ["a", "b", "c", "d", "gone"], "admin-1", false);
    expect(findMany.mock.calls[0][0].where).toMatchObject({ status: "PENDING_APPROVAL" });
    expect(r).toMatchObject({ approved: 2, skippedFlagged: 2, skippedNotPending: 1, approvedIds: ["a", "b"] });
    const call = updateMany.mock.calls[0][0];
    expect(call.where.id.in).toEqual(["a", "b"]);
    expect(call.data).toMatchObject({ status: "APPROVED", approvedById: "admin-1" });
    expect(call.data.approvedAt).toBeInstanceOf(Date);
  });

  it("marks the questions as pretest (unscored) when asked, and as operational otherwise", async () => {
    const pre = approveDb(rows);
    await bulkApprove(pre.db, ["a", "b"], "admin-1", false, true);
    expect(pre.updateMany.mock.calls[0][0].data).toMatchObject({ status: "APPROVED", isPretest: true });
    const normal = approveDb(rows);
    await bulkApprove(normal.db, ["a", "b"], "admin-1", false);
    expect(normal.updateMany.mock.calls[0][0].data).toMatchObject({ isPretest: false });
  });

  it("approves flagged ones too when asked", async () => {
    const { db } = approveDb(rows);
    const r = await bulkApprove(db, ["a", "b", "c", "d"], "admin-1", true);
    expect(r).toMatchObject({ approved: 4, skippedFlagged: 0 });
  });

  it("does not write when nothing qualifies", async () => {
    const { db, updateMany } = approveDb([{ id: "c", reviewVerdict: "REJECT" }]);
    const r = await bulkApprove(db, ["c"], "admin-1", false);
    expect(r.approved).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

afterEach(() => vi.unstubAllEnvs());

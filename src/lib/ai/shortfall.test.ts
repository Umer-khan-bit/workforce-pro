import { describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import type { PrismaClient } from "@prisma/client";
import type { ClaudeClient } from "./claude";
import { generateBatch } from "./generate";
import { translateIpipBatch } from "./translate";
import { DEFAULT_SETTINGS, aiGenerationSchema } from "@/lib/settings/definitions";

// Claude is faked. These tests cover what happens when a batch comes back with fewer questions than asked for.

function reply(json: unknown, usage = { input_tokens: 1000, output_tokens: 500 }) {
  return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(json) }], usage };
}

function fakeClient(...answers: unknown[]) {
  const create = vi.fn();
  for (const a of answers) {
    if (a instanceof Error) create.mockRejectedValueOnce(a);
    else create.mockResolvedValueOnce(a);
  }
  return { client: { messages: { create } } as unknown as ClaudeClient, create };
}

const options = ["A", "B", "C", "D"].map((key) => ({ key, text: `Option ${key}` }));
const mcq = (content: string, over: Record<string, unknown> = {}) => ({
  kind: "MCQ", content, options, correctAnswer: "B", explanation: "Because.", difficulty: "MEDIUM", topic: "t", reverseKeyed: false, ...over,
});
const questions = (from: number, n: number) => Array.from({ length: n }, (_, i) => mcq(`Distinct question number ${from + i} about reasoning?`));
const okReview = (n: number) => ({ results: Array.from({ length: n }, (_, index) => ({ index, verdict: "OK", notes: "Fine." })) });

function fakeDb(opts: { retries?: number; originals?: Array<Record<string, unknown>>; remaining?: number } = {}) {
  const created: Array<Record<string, unknown>> = [];
  const runs: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const settings = opts.retries === undefined ? null : { value: { shortfallRetries: opts.retries } };
  const db = {
    siteSetting: { findUnique: vi.fn().mockImplementation(async ({ where }: { where: { key: string } }) => (where.key === "aiGeneration" ? settings : null)) },
    language: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) =>
        where.id === "lang-ur" ? { id: "lang-ur", name: "Urdu", isActive: true } : { id: "lang-en", name: "English", isActive: true }
      ),
      findFirst: vi.fn().mockResolvedValue({ id: "lang-en", name: "English", isDefault: true }),
    },
    jobRole: { findUnique: vi.fn().mockResolvedValue({ id: "role-1", name: "Accountant", isActive: true }) },
    aiRun: {
      create: vi.fn().mockImplementation(async ({ data }) => { runs.push({ ...data }); return { id: "run-1", ...data }; }),
      update: vi.fn().mockImplementation(async ({ data }) => { Object.assign(runs[0], data); return {}; }),
    },
    auditLog: { create: vi.fn().mockImplementation(async ({ data }) => { audits.push(data); return {}; }) },
    question: {
      findMany: vi.fn().mockImplementation(async (args: { where?: { source?: string } }) => (args?.where?.source === "IMPORTED" ? (opts.originals ?? []) : [])),
      createMany: vi.fn().mockImplementation(async ({ data }) => { created.push(...data); return { count: data.length }; }),
      count: vi.fn().mockResolvedValue(opts.remaining ?? 0),
    },
  };
  return { db: db as unknown as PrismaClient, created, runs, audits };
}

const params = { testType: "IQ" as const, languageId: "lang-en", difficulty: "MEDIUM" as const, count: 10 };
const rateLimit = () => Anthropic.APIError.generate(429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } }, "slow down", new Headers());
const userMessage = (create: ReturnType<typeof vi.fn>, call: number) => create.mock.calls[call][0].messages[0].content as string;

describe("generateBatch: checking the number of questions returned", () => {
  it("asks again for the missing ones when Claude returns too few, and saves the full number", async () => {
    const { db, created, runs, audits } = fakeDb();
    // The real-life case: 1 question came back out of 10.
    const { client, create } = fakeClient(reply({ questions: questions(1, 1) }), reply({ questions: questions(2, 9) }), reply(okReview(10)));
    const result = await generateBatch({ prisma: db, client }, "admin-1", params);

    expect(result).toMatchObject({ requested: 10, created: 10, shortfall: 0, shortfallNote: null, attempts: 2, received: 10 });
    expect(created).toHaveLength(10);
    expect(create).toHaveBeenCalledTimes(3); // write, write again for the missing 9, one review of all 10

    // The retry asks for exactly the missing number, and lists what was already accepted so it is not repeated.
    expect(userMessage(create, 0)).toContain("Write 10 multiple-choice IQ questions");
    expect(userMessage(create, 1)).toContain("Write 9 multiple-choice IQ questions");
    expect(userMessage(create, 1)).toContain("Distinct question number 1 about reasoning?");

    // All three calls are paid for in the totals.
    expect(result.inputTokens).toBe(3000);
    expect(result.outputTokens).toBe(1500);
    expect(result.costEstimate).toBeCloseTo((3000 * 2 + 1500 * 10) / 1_000_000, 8);
    expect(runs[0]).toMatchObject({ status: "COMPLETED", requested: 10, created: 10 });
    expect(audits.find((a) => a.action === "AI_GENERATION_RUN")!.metadata).toMatchObject({ requested: 10, created: 10, attempts: 2, shortfall: 0, received: 10 });
  });

  it("reports the shortfall when the retries do not fill the batch", async () => {
    const { db, created, runs, audits } = fakeDb();
    // 1 per attempt, and the default allows 2 retries: 3 questions in total.
    const { client, create } = fakeClient(reply({ questions: questions(1, 1) }), reply({ questions: questions(2, 1) }), reply({ questions: questions(3, 1) }), reply(okReview(3)));
    const result = await generateBatch({ prisma: db, client }, "admin-1", params);

    expect(created).toHaveLength(3);
    expect(result).toMatchObject({ created: 3, shortfall: 7, attempts: 3, received: 3 });
    expect(result.shortfallNote).toMatch(/Only 3 of the 10 questions asked for could be saved after 3 attempts/);
    expect(create).toHaveBeenCalledTimes(4); // 3 writes + 1 review (the review still runs on what was saved)
    expect(runs[0]).toMatchObject({ status: "COMPLETED", requested: 10, created: 3 });
    expect(audits.find((a) => a.action === "AI_GENERATION_RUN")!.metadata).toMatchObject({ requested: 10, created: 3, attempts: 3, shortfall: 7 });
  });

  it("does not retry when the retries setting is 0, but still reports the shortfall", async () => {
    const { db } = fakeDb({ retries: 0 });
    const { client, create } = fakeClient(reply({ questions: questions(1, 4) }), reply(okReview(4)));
    const result = await generateBatch({ prisma: db, client }, "admin-1", params);
    expect(create).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ created: 4, shortfall: 6, attempts: 1 });
    expect(result.shortfallNote).toMatch(/Only 4 of the 10/);
  });

  it("uses the number of retries from Settings", async () => {
    const { db } = fakeDb({ retries: 4 });
    const { client, create } = fakeClient(...Array.from({ length: 5 }, (_, i) => reply({ questions: questions(i * 10 + 1, 1) })), reply(okReview(5)));
    const result = await generateBatch({ prisma: db, client }, "admin-1", params);
    expect(result).toMatchObject({ created: 5, attempts: 5, shortfall: 5 });
    expect(create).toHaveBeenCalledTimes(6);
  });

  it("replaces questions that failed the checks or repeated an existing one", async () => {
    const { db, created } = fakeDb();
    const bad = (n: number) => mcq(`Broken question number ${n}?`, { options: options.slice(0, 3) }); // only 3 options
    const first = [...questions(1, 7), bad(1), bad(2), bad(3)];
    const { client, create } = fakeClient(reply({ questions: first }), reply({ questions: questions(8, 3) }), reply(okReview(10)));
    const result = await generateBatch({ prisma: db, client }, "admin-1", params);

    expect(created).toHaveLength(10);
    expect(result).toMatchObject({ created: 10, dropped: 3, shortfall: 0, attempts: 2, received: 13 });
    expect(userMessage(create, 1)).toContain("Write 3 multiple-choice IQ questions");
  });

  it("does not count a repeat of a question accepted earlier in the same batch", async () => {
    const { db } = fakeDb({ retries: 1 });
    const { client } = fakeClient(reply({ questions: questions(1, 8) }), reply({ questions: questions(1, 2) }), reply(okReview(8)));
    const result = await generateBatch({ prisma: db, client }, "admin-1", params);
    expect(result).toMatchObject({ created: 8, shortfall: 2, attempts: 2, dropped: 2 });
    expect(result.droppedReasons).toEqual(["Repeats an existing question", "Repeats an existing question"]);
  });

  it("ignores extra questions beyond the number asked for, with no retry", async () => {
    const { db, created } = fakeDb();
    const { client, create } = fakeClient(reply({ questions: questions(1, 12) }), reply(okReview(10)));
    const result = await generateBatch({ prisma: db, client }, "admin-1", params);
    expect(created).toHaveLength(10);
    expect(result).toMatchObject({ created: 10, shortfall: 0, attempts: 1, received: 12 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("keeps what it has, and says so, if asking again fails", async () => {
    const { db, created, runs } = fakeDb();
    const { client } = fakeClient(reply({ questions: questions(1, 6) }), rateLimit(), reply(okReview(6)));
    const result = await generateBatch({ prisma: db, client }, "admin-1", params);
    expect(created).toHaveLength(6);
    expect(result).toMatchObject({ created: 6, shortfall: 4, attempts: 2, reviewed: true });
    expect(result.shortfallNote).toMatch(/Asking again for the missing questions failed: Anthropic is rate-limiting/);
    expect(runs[0].status).toBe("COMPLETED");
  });

  it("still treats a failure of the very first request as an error", async () => {
    const { db, created, runs } = fakeDb();
    const { client } = fakeClient(rateLimit());
    await expect(generateBatch({ prisma: db, client }, "admin-1", params)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(created).toHaveLength(0);
    expect(runs[0].status).toBe("FAILED");
  });

  it("saves nothing and reports a full shortfall when no usable question ever comes back", async () => {
    const { db, created, runs } = fakeDb();
    const { client, create } = fakeClient(reply({ questions: [] }), reply({ questions: [] }), reply({ questions: [] }));
    const result = await generateBatch({ prisma: db, client }, "admin-1", params);
    expect(created).toHaveLength(0);
    expect(result).toMatchObject({ created: 0, shortfall: 10, attempts: 3, reviewed: false });
    expect(create).toHaveBeenCalledTimes(3); // no review call, there is nothing to review
    expect(runs[0]).toMatchObject({ status: "COMPLETED", created: 0 });
  });

  it("a full batch needs only one request and reports no shortfall", async () => {
    const { db } = fakeDb();
    const { client, create } = fakeClient(reply({ questions: questions(1, 10) }), reply(okReview(10)));
    const result = await generateBatch({ prisma: db, client }, "admin-1", params);
    expect(result).toMatchObject({ created: 10, shortfall: 0, attempts: 1, shortfallNote: null });
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("translateIpipBatch: checking every item was translated", () => {
  const originals = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`, content: `English statement ${i}`, reverseKeyed: false, topic: "Extraversion", difficulty: "MEDIUM", aParam: 1, bParam: 0,
  }));
  const items = (indexes: number[]) => ({ items: indexes.map((index) => ({ index, translation: `ترجمہ ${index}`, backTranslation: `back ${index}` })) });

  it("asks again for the items that came back without a translation", async () => {
    const { db, created, audits } = fakeDb({ originals });
    const { client, create } = fakeClient(reply(items([0, 1, 2, 3, 4, 5, 6])), reply(items([0, 1, 2])), reply(okReview(10)));
    const result = await translateIpipBatch({ prisma: db, client }, "admin-1", { languageId: "lang-ur" });

    expect(result).toMatchObject({ created: 10, shortfall: 0, attempts: 2 });
    expect(created.map((c) => c.translationOfId).sort()).toEqual(originals.map((o) => o.id).sort());
    // The second request only contains the three that were missing (originals 7, 8, 9).
    const second = userMessage(create, 1);
    expect(second).toContain("English statement 7");
    expect(second).toContain("English statement 9");
    expect(second).not.toContain("English statement 0");
    expect(audits.find((a) => a.action === "AI_TRANSLATION_RUN")!.metadata).toMatchObject({ attempts: 2, shortfall: 0 });
  });

  it("reports the items that are still missing after the retries", async () => {
    const { db, created } = fakeDb({ originals });
    const { client } = fakeClient(reply(items([0, 1, 2, 3, 4, 5])), reply({ items: [] }), reply({ items: [] }), reply(okReview(6)));
    const result = await translateIpipBatch({ prisma: db, client }, "admin-1", { languageId: "lang-ur" });
    expect(created).toHaveLength(6);
    expect(result).toMatchObject({ created: 6, shortfall: 4, attempts: 3 });
    expect(result.shortfallNote).toMatch(/Only 6 of the 10 items could be translated after 3 attempts/);
  });

  it("keeps the translations it has when a retry fails", async () => {
    const { db, created } = fakeDb({ originals });
    const { client } = fakeClient(reply(items([0, 1, 2, 3, 4])), rateLimit(), reply(okReview(5)));
    const result = await translateIpipBatch({ prisma: db, client }, "admin-1", { languageId: "lang-ur" });
    expect(created).toHaveLength(5);
    expect(result.shortfallNote).toMatch(/failed/);
  });
});

describe("shortfall retries setting", () => {
  it("starts at 2 and accepts 0 to 5", () => {
    expect(DEFAULT_SETTINGS.aiGeneration.shortfallRetries).toBe(2);
    for (const n of [0, 1, 5]) expect(aiGenerationSchema.safeParse({ ...DEFAULT_SETTINGS.aiGeneration, shortfallRetries: n }).success).toBe(true);
    for (const n of [-1, 6, 1.5]) expect(aiGenerationSchema.safeParse({ ...DEFAULT_SETTINGS.aiGeneration, shortfallRetries: n }).success).toBe(false);
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TestType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ClaudeClient } from "@/lib/ai/claude";
import { readSetting } from "@/lib/settings/store";
import { createKit, type Kit } from "@/lib/testEngine/testkit";
import { evaluateTopPerformer, meetsTopPerformerRule, topPerformerProgress } from "./topPerformer";
import { resultLines } from "./describe";
import type { LatestResult } from "./latest";
import { latestResults } from "./latest";
import { buildFacts, ensureFeedback, findFeedback } from "./feedback";
import { buildReportPdf, toPdfText, type ReportData } from "./pdf";
import { loadReportData } from "./report";

const rule = { requiredQuartile: 1, countedTests: ["IQ", "EQ", "LANGUAGE", "SKILL"] as TestType[] };

describe("the top-performer rule", () => {
  it("needs every counted test, each in the required quartile or better", () => {
    expect(meetsTopPerformerRule({ IQ: 1, EQ: 1, LANGUAGE: 1, SKILL: 1 }, rule)).toBe(true);
    expect(meetsTopPerformerRule({ IQ: 1, EQ: 1, LANGUAGE: 1, SKILL: 2 }, rule)).toBe(false);
    expect(meetsTopPerformerRule({ IQ: 1, EQ: 1, LANGUAGE: 1 }, rule)).toBe(false); // a test not taken yet
    expect(meetsTopPerformerRule({ IQ: 1, EQ: 1, LANGUAGE: 1, SKILL: null }, rule)).toBe(false);
  });

  it("ignores Personality unless the rule counts it (it has no quartile)", () => {
    expect(meetsTopPerformerRule({ IQ: 1, EQ: 1, LANGUAGE: 1, SKILL: 1, PERSONALITY: null }, rule)).toBe(true);
  });

  it("follows the rule from Settings: a looser quartile or fewer tests", () => {
    expect(meetsTopPerformerRule({ IQ: 2, SKILL: 2 }, { requiredQuartile: 2, countedTests: ["IQ", "SKILL"] })).toBe(true);
    expect(meetsTopPerformerRule({ IQ: 1 }, { requiredQuartile: 1, countedTests: ["IQ"] })).toBe(true);
  });

  it("reports what is still missing", () => {
    const p = topPerformerProgress({ IQ: 1, EQ: 3 }, rule);
    expect(p.map((x) => [x.testType, x.quartile, x.met])).toEqual([["IQ", 1, true], ["EQ", 3, false], ["LANGUAGE", null, false], ["SKILL", null, false]]);
  });
});

const base: LatestResult = { scoreId: "s", sessionId: "x", testType: "IQ", computedAt: new Date(), rawScore: 72, percentile: 80, quartile: 1, cefrLevel: null, provisional: false, cohort: { scope: "ROLE", size: 64 }, traits: null, details: {} };

describe("result wording", () => {
  it("always says how many candidates a ranking is based on", () => {
    const lines = resultLines(base, 30).join(" ");
    expect(lines).toContain("Quartile Q1");
    expect(lines).toContain("Better than 80% of 64 candidates in your job role (top 20%)");
  });
  it("warns when the group is small", () => {
    expect(resultLines({ ...base, cohort: { scope: "ALL", size: 12 } }, 30).join(" ")).toMatch(/small group/);
  });
  it("shows the CEFR level for Language and no ranking for Personality", () => {
    expect(resultLines({ ...base, testType: "LANGUAGE", cefrLevel: "B2" }, 30).join(" ")).toContain("(CEFR): B2");
    expect(resultLines({ ...base, testType: "PERSONALITY", quartile: null, percentile: null, cohort: null }, 30).join(" ")).toMatch(/not ranked/);
  });
  it("says a provisional Language result is not final", () => {
    expect(resultLines({ ...base, testType: "LANGUAGE", provisional: true }, 30).join(" ")).toMatch(/still being graded/);
  });
});

describe("what Claude is told about a result", () => {
  const facts = buildFacts({ testType: "IQ", quartile: 3, percentile: 31, rawScore: 55, cefrLevel: null, cohort: { scope: "ALL", size: 40 }, traits: null, topicAccuracy: [{ topic: "numerical", correct: 1, total: 4 }], jobRole: "Accountant", experienceYears: 4 });
  it("includes the result, the role and the weak topic", () => {
    expect(facts).toContain("Quartile Q3");
    expect(facts).toContain("compared with 40 candidates overall");
    expect(facts).toContain("Job role: Accountant");
    expect(facts).toContain("numerical: 1 of 4 correct");
  });
  it("never includes personal details (there is nowhere to pass them)", () => {
    expect(facts).not.toMatch(/@|name|phone|salary|city/i);
  });
  it("describes personality traits as unranked", () => {
    const p = buildFacts({ testType: "PERSONALITY", quartile: null, percentile: null, rawScore: 3.4, cefrLevel: null, cohort: null, traits: [{ trait: "Emotional Stability", score: 4.1 }], topicAccuracy: [], jobRole: null, experienceYears: null });
    expect(p).toContain("not ranked");
    expect(p).toContain("higher means calmer");
  });
});

describe("the PDF report", () => {
  const data: ReportData = {
    brandName: "Workforce Pro",
    candidateName: "Ayesha Khan",
    jobRole: "Accountant",
    city: "Lahore",
    experienceYears: 4,
    generatedOn: "1 October 2026",
    topPerformer: true,
    results: [
      { title: "IQ test", lines: ["Quartile Q1 (Q1 is the top quarter)."], traits: null, feedback: "You reason well with numbers.", tips: ["Practise estimating.", "Time yourself."] },
      { title: "Personality test", lines: ["Five traits."], traits: [{ trait: "Extraversion", score: 3.8 }, { trait: "Emotional Stability", score: 4.2 }], feedback: null, tips: [] },
    ],
    salary: { currency: "PKR", suggestedLine: "Suggested monthly range: PKR 70,000 to PKR 90,000", marketLine: "Market range ...", basis: "Based on your results." },
    disclaimer: "This is a guide, not an offer.",
  };

  it("makes a real PDF", async () => {
    const bytes = await buildReportPdf(data);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1500);
  });

  it("does not break on text the PDF fonts cannot draw (Urdu, emoji, curly quotes)", async () => {
    const bytes = await buildReportPdf({ ...data, candidateName: "عائشہ خان 😀", results: [{ ...data.results[0], feedback: "“Quoted” text – with a dash … and عربی" }] });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(toPdfText("“a” – b … عربی")).toBe('"a" - b ... ????');
  });

  it("runs onto more pages when there is a lot to say", async () => {
    const long = Array.from({ length: 12 }, (_, i) => ({ title: `Test ${i}`, lines: ["line"], traits: null, feedback: "word ".repeat(300), tips: ["tip one", "tip two", "tip three"] }));
    const small = await buildReportPdf(data);
    const big = await buildReportPdf({ ...data, results: long });
    expect(big.length).toBeGreaterThan(small.length);
  });
});

const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

function claudeFeedback(json: unknown) {
  const create = vi.fn().mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(json) }], usage: { input_tokens: 400, output_tokens: 150 } });
  return { client: { messages: { create } } as unknown as ClaudeClient, create };
}

describe.skipIf(!dbUp)("results, feedback and the badge (real database)", () => {
  let kit: Kit;

  beforeAll(async () => {
    kit = await createKit(prisma, "res");
  }, 60_000);
  afterAll(async () => {
    await kit.cleanup();
  }, 60_000);

  async function scored(profileId: string, testType: TestType, over: { quartile?: number | null; provisional?: boolean; rawScore?: number } = {}) {
    const session = await prisma.testSession.create({ data: { candidateProfileId: profileId, testType, status: "COMPLETED", completedAt: new Date(), languageId: kit.language.id } });
    return prisma.score.create({
      data: {
        candidateProfileId: profileId, sessionId: session.id, testType, rawScore: over.rawScore ?? 61,
        quartile: over.quartile === undefined ? 2 : over.quartile, percentile: over.quartile === null ? null : 62, rankValue: 0.4, cohortScope: "ALL", cohortSize: 64,
        provisional: over.provisional ?? false,
        details: testType === "PERSONALITY" ? { traits: [{ trait: "Extraversion", score: 3.5 }] } : { answered: 14, correct: 9 },
      },
    });
  }

  describe("evaluateTopPerformer", () => {
    it("awards the badge once, with an in-app notification, when the rule is met", async () => {
      const live = await readSetting(prisma, "topPerformer");
      const c = await kit.addCandidate("star");
      for (const t of live.countedTests) await scored(c.profileId, t, { quartile: live.requiredQuartile });

      expect((await evaluateTopPerformer(prisma, c.profileId)).awarded).toBe(true);
      expect(await prisma.badge.count({ where: { candidateProfileId: c.profileId } })).toBe(1);
      const badge = await prisma.badge.findFirstOrThrow({ where: { candidateProfileId: c.profileId } });
      expect(badge.notifiedAt).not.toBeNull();
      const notes = await prisma.notification.findMany({ where: { userId: c.userId } });
      const inApp = notes.find((n) => n.channel === "IN_APP");
      expect(inApp?.title).toMatch(/Top Performer/);
      expect(inApp?.link).toBe("/candidate/badges");
      expect(notes.some((n) => n.channel === "EMAIL")).toBe(true); // the recognition email (logged, as SMTP is not set up in tests)
      expect(await prisma.auditLog.count({ where: { actorId: c.userId, action: "BADGE_AWARDED" } })).toBe(1);

      // A second check does not award again or send again.
      expect((await evaluateTopPerformer(prisma, c.profileId)).awarded).toBe(false);
      expect(await prisma.badge.count({ where: { candidateProfileId: c.profileId } })).toBe(1);
      expect(await prisma.notification.count({ where: { userId: c.userId } })).toBe(notes.length);
    });

    it("does not award it while one counted test is missing or not good enough", async () => {
      const live = await readSetting(prisma, "topPerformer");
      const c = await kit.addCandidate("almost");
      const [last, ...rest] = live.countedTests;
      for (const t of rest) await scored(c.profileId, t, { quartile: live.requiredQuartile });
      expect((await evaluateTopPerformer(prisma, c.profileId)).awarded).toBe(false); // last test not taken
      await scored(c.profileId, last, { quartile: live.requiredQuartile + 1 });
      expect((await evaluateTopPerformer(prisma, c.profileId)).awarded).toBe(false); // taken, but a worse quartile (or none at the loosest)
      expect(await prisma.badge.count({ where: { candidateProfileId: c.profileId } })).toBe(0);
    });

    it("ignores results still waiting for their writing grade", async () => {
      const live = await readSetting(prisma, "topPerformer");
      const c = await kit.addCandidate("provisional");
      for (const t of live.countedTests) await scored(c.profileId, t, { quartile: live.requiredQuartile, provisional: t === "LANGUAGE" });
      if (live.countedTests.includes("LANGUAGE")) expect((await evaluateTopPerformer(prisma, c.profileId)).awarded).toBe(false);
    });

    it("uses the candidate's latest result for a test, so a worse retake can matter", async () => {
      const live = await readSetting(prisma, "topPerformer");
      const c = await kit.addCandidate("retaker");
      for (const t of live.countedTests) await scored(c.profileId, t, { quartile: live.requiredQuartile });
      await new Promise((r) => setTimeout(r, 15));
      await scored(c.profileId, live.countedTests[0], { quartile: 4 }); // newest result is poor
      expect((await evaluateTopPerformer(prisma, c.profileId)).awarded).toBe(false);
    });

    it("never gives the badge to an anonymised candidate", async () => {
      const live = await readSetting(prisma, "topPerformer");
      const c = await kit.addCandidate("gone");
      for (const t of live.countedTests) await scored(c.profileId, t, { quartile: live.requiredQuartile });
      await prisma.candidateProfile.update({ where: { id: c.profileId }, data: { anonymisedAt: new Date() } });
      expect((await evaluateTopPerformer(prisma, c.profileId)).awarded).toBe(false);
    });
  });

  describe("latest results", () => {
    it("returns the newest result for each test, in test order", async () => {
      const c = await kit.addCandidate("latest");
      await scored(c.profileId, "SKILL", { quartile: 4 });
      await scored(c.profileId, "IQ", { quartile: 4, rawScore: 40 });
      await new Promise((r) => setTimeout(r, 15));
      await scored(c.profileId, "IQ", { quartile: 1, rawScore: 90 });
      const results = await latestResults(prisma, c.profileId);
      expect(results.map((r) => r.testType)).toEqual(["IQ", "SKILL"]);
      expect(results[0]).toMatchObject({ quartile: 1, rawScore: 90 });
    });
  });

  describe("AI feedback", () => {
    const reply = { feedback: "You reason well with numbers and can build on it.", tips: ["Practise estimating.", "Time yourself.", "Review mistakes.", "A fourth tip."] };

    it("writes feedback once, saves it, and returns the saved copy afterwards", async () => {
      const c = await kit.addCandidate("fb");
      const score = await scored(c.profileId, "IQ", { quartile: 3 });
      const { client, create } = claudeFeedback(reply);

      const first = await ensureFeedback({ prisma, client }, c.userId, score.id);
      expect(first.cached).toBe(false);
      expect(first.text).toContain("reason well");
      expect(first.tips).toHaveLength(3); // limited to the "tips per test" setting
      const again = await ensureFeedback({ prisma, client }, c.userId, score.id);
      expect(again.cached).toBe(true);
      expect(create).toHaveBeenCalledTimes(1);

      // The prompt holds the result but nothing identifying.
      const sent = JSON.stringify(create.mock.calls[0][0]);
      expect(sent).toContain("Quartile Q3");
      expect(sent).not.toContain(c.email);
      expect(sent).not.toContain(`Pat ${kit.run}`);

      const run = await prisma.aiRun.findFirstOrThrow({ where: { actorId: c.userId, kind: "FEEDBACK" } });
      expect(run).toMatchObject({ status: "COMPLETED", created: 1 });
      expect(await prisma.auditLog.count({ where: { actorId: c.userId, action: "AI_FEEDBACK_GENERATED" } })).toBe(1);
      expect((await findFeedback(prisma, score.id))?.text).toContain("reason well");
    });

    it("refuses someone else's result, and results that are not final", async () => {
      const a = await kit.addCandidate("owner");
      const b = await kit.addCandidate("intruder");
      const score = await scored(a.profileId, "EQ", { quartile: 2 });
      const { client, create } = claudeFeedback(reply);
      await expect(ensureFeedback({ prisma, client }, b.userId, score.id)).rejects.toMatchObject({ code: "INVALID_INPUT" });
      const provisional = await scored(a.profileId, "LANGUAGE", { quartile: 2, provisional: true });
      await expect(ensureFeedback({ prisma, client }, a.userId, provisional.id)).rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect(create).not.toHaveBeenCalled();
    });

    it("records a failed run when Claude is not available, and saves nothing", async () => {
      const c = await kit.addCandidate("fail");
      const score = await scored(c.profileId, "IQ", { quartile: 2 });
      const create = vi.fn().mockRejectedValue(new Error("network down"));
      await expect(ensureFeedback({ prisma, client: { messages: { create } } as unknown as ClaudeClient }, c.userId, score.id)).rejects.toBeTruthy();
      expect(await findFeedback(prisma, score.id)).toBeNull();
      expect((await prisma.aiRun.findFirstOrThrow({ where: { actorId: c.userId, kind: "FEEDBACK" } })).status).toBe("FAILED");
    });

    it("rejects a reply of the wrong shape", async () => {
      const c = await kit.addCandidate("shape");
      const score = await scored(c.profileId, "IQ", { quartile: 2 });
      const { client } = claudeFeedback({ feedback: "", tips: [] });
      await expect(ensureFeedback({ prisma, client }, c.userId, score.id)).rejects.toMatchObject({ code: "BAD_RESPONSE" });
    });
  });

  describe("report data", () => {
    it("collects the candidate's own results, saved feedback and badge, and nothing else", async () => {
      const c = await kit.addCandidate("report");
      const other = await kit.addCandidate("otherreport");
      const iq = await scored(c.profileId, "IQ", { quartile: 1 });
      await scored(c.profileId, "PERSONALITY", { quartile: null });
      await scored(other.profileId, "EQ", { quartile: 4 });
      await prisma.aIFeedback.create({ data: { candidateProfileId: c.profileId, testType: "IQ", scoreId: iq.id, feedbackText: "Saved feedback text.", improvementTips: ["Tip one."] } });

      const data = await loadReportData(prisma, c.userId);
      expect(data?.candidateName).toContain(kit.run);
      expect(data?.results.map((r) => r.title)).toEqual(["Personality test", "IQ test"]); // the usual test order
      expect(data?.results[1]).toMatchObject({ feedback: "Saved feedback text.", tips: ["Tip one."] });
      expect(data?.results[0].traits).toHaveLength(1);
      expect(data?.topPerformer).toBe(false);
    });

    it("has nothing for an anonymised or unknown candidate", async () => {
      expect(await loadReportData(prisma, "no-such-user")).toBeNull();
    });
  });
});

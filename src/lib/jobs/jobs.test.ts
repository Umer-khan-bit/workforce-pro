import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createKit, type Kit } from "@/lib/testEngine/testkit";
import { createCompany, type World } from "@/lib/recruiter/testWorld";
import { warnExpiringPlans } from "@/lib/subscriptions";
import { recalibrate } from "@/lib/learning/recalibrate";
import { buildFairnessReport, generateFairnessReport } from "@/lib/learning/fairness";
import { isDue, JOB_NAMES, runJob } from "./runner";
import { sendTestReminders } from "./reminders";

const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const DAY = 86_400_000;
const now = new Date("2026-10-20T10:00:00Z");
const settings = { recalibrationEveryDays: 7, fairnessReportDay: 3 };

describe("when a job is due (pure)", () => {
  it("recalibration waits its number of days", () => {
    expect(isDue("recalibration", null, now, settings, false)).toBe(true);
    expect(isDue("recalibration", new Date(now.getTime() - 3 * DAY), now, settings, false)).toBe(false);
    expect(isDue("recalibration", new Date(now.getTime() - 8 * DAY), now, settings, false)).toBe(true);
  });

  it("reminders and plan warnings run about once a day", () => {
    for (const job of ["test-reminders", "plan-expiry"] as const) {
      expect(isDue(job, new Date(now.getTime() - 2 * 3_600_000), now, settings, false)).toBe(false);
      expect(isDue(job, new Date(now.getTime() - 25 * 3_600_000), now, settings, false)).toBe(true);
    }
  });

  it("webhook retries run on every look, but not twice in the same minute", () => {
    expect(isDue("webhook-retries", new Date(now.getTime() - 5_000), now, settings, false)).toBe(false);
    expect(isDue("webhook-retries", new Date(now.getTime() - 90_000), now, settings, false)).toBe(true);
  });

  it("the fairness report is due from its day of the month until last month's report exists", () => {
    expect(isDue("fairness-report", null, new Date("2026-10-02T10:00:00Z"), settings, false)).toBe(false);
    expect(isDue("fairness-report", null, new Date("2026-10-03T10:00:00Z"), settings, false)).toBe(true);
    expect(isDue("fairness-report", null, new Date("2026-10-25T10:00:00Z"), settings, true)).toBe(false);
  });

  it("knows all five jobs", () => {
    expect([...JOB_NAMES].sort()).toEqual(["fairness-report", "plan-expiry", "recalibration", "test-reminders", "webhook-retries"]);
  });
});

describe.skipIf(!dbUp)("scheduled jobs, reminders, expiry warnings and self-learning (real database)", () => {
  let kit: Kit;
  const worlds: World[] = [];
  const runIds: string[] = [];
  const reportMonths: string[] = [];
  const recalRunIds: string[] = [];

  beforeAll(async () => {
    kit = await createKit(prisma, "jobs");
  }, 60_000);

  afterAll(async () => {
    for (const w of worlds) await w.cleanup();
    await kit.cleanup();
    await prisma.jobRun.deleteMany({ where: { id: { in: runIds } } });
    await prisma.fairnessReport.deleteMany({ where: { month: { in: reportMonths } } });
    await prisma.recalibrationRun.deleteMany({ where: { id: { in: recalRunIds } } });
  }, 60_000);

  describe("job runner", () => {
    it("records a run, and does not start a job that is already running", async () => {
      const run = await runJob(prisma, "webhook-retries", "manual");
      runIds.push(run.id);
      expect(run).toMatchObject({ job: "webhook-retries", status: "COMPLETED", trigger: "manual" });
      expect(run.completedAt).not.toBeNull();

      const running = await prisma.jobRun.create({ data: { job: "webhook-retries", trigger: "schedule", status: "RUNNING" } });
      runIds.push(running.id);
      const second = await runJob(prisma, "webhook-retries", "manual");
      runIds.push(second.id);
      expect(second.status).toBe("SKIPPED");
      await prisma.jobRun.delete({ where: { id: running.id } });
    });

    it("a run that has been 'running' for hours (the server stopped) does not block a new one", async () => {
      const stale = await prisma.jobRun.create({ data: { job: "webhook-retries", trigger: "schedule", status: "RUNNING", startedAt: new Date(Date.now() - 3 * 3_600_000) } });
      runIds.push(stale.id);
      const run = await runJob(prisma, "webhook-retries", "manual");
      runIds.push(run.id);
      expect(run.status).toBe("COMPLETED");
    });
  });

  describe("test reminders", () => {
    it("reminds a verified candidate with untaken tests in the app and by email, once, and skips the others", async () => {
      await kit.addCatBank("IQ", 40, 0); // so the IQ test is available to take
      const old = await kit.addCandidate("old");
      const fresh = await kit.addCandidate("fresh");
      const unverified = await kit.addCandidate("unverified", { verified: false });
      const forgotten = await kit.addCandidate("forgotten");
      const longAgo = new Date(Date.now() - 30 * DAY);
      await prisma.candidateProfile.updateMany({ where: { id: { in: [old.profileId, unverified.profileId, forgotten.profileId] } }, data: { createdAt: longAgo } });
      await prisma.candidateProfile.update({ where: { id: forgotten.profileId }, data: { anonymisedAt: new Date() } });
      const ids = [old.userId, fresh.userId, unverified.userId, forgotten.userId];

      const first = await sendTestReminders(prisma, { onlyUserIds: ids });
      expect(first.reminded).toBe(1);
      const inApp = await prisma.notification.findMany({ where: { userId: old.userId, type: "TEST_REMINDER" } });
      expect(inApp.map((n) => n.channel).sort()).toEqual(["EMAIL", "IN_APP"]);
      for (const other of [fresh, unverified, forgotten]) expect(await prisma.notification.count({ where: { userId: other.userId, type: "TEST_REMINDER" } })).toBe(0);

      const again = await sendTestReminders(prisma, { onlyUserIds: ids });
      expect(again.reminded).toBe(0); // already reminded: not again until the repeat period
      expect(await prisma.notification.count({ where: { userId: old.userId, type: "TEST_REMINDER", channel: "IN_APP" } })).toBe(1);
    });
  });

  describe("plan expiry warnings", () => {
    it("warns each company whose plan is about to end, in the app and by email, and only once", async () => {
      const soon = await createCompany(prisma, `${kit.run}s`, { endsInDays: 3 });
      const far = await createCompany(prisma, `${kit.run}f`, { endsInDays: 60 });
      worlds.push(soon, far);
      const only = [soon.company.id, far.company.id];
      const first = await warnExpiringPlans(prisma, new Date(), only);
      expect(first).toEqual({ checked: 1, warned: 1 });
      const channels = (await prisma.notification.findMany({ where: { userId: soon.admin.id, type: "SUBSCRIPTION_EXPIRING" } })).map((n) => n.channel).sort();
      expect(channels).toEqual(["EMAIL", "IN_APP"]);
      expect(await prisma.notification.count({ where: { userId: far.admin.id, type: "SUBSCRIPTION_EXPIRING" } })).toBe(0);
      expect((await warnExpiringPlans(prisma, new Date(), only)).warned).toBe(0);
    });
  });

  describe("recalibration", () => {
    it("re-estimates difficulty, flags a too-easy item and a biased item, leaves a healthy one alone, and never deletes", async () => {
      const [healthy, easy, biased] = await kit.addMcq("IQ", [{ b: 0 }, { b: 0 }, { b: 0 }]);
      const people = [
        ...(await Promise.all(["m1", "m2", "m3", "m4"].map((n) => kit.addCandidate(n)))).map((c) => ({ ...c, gender: "MALE" as const })),
        ...(await Promise.all(["f1", "f2", "f3", "f4"].map((n) => kit.addCandidate(n)))).map((c) => ({ ...c, gender: "FEMALE" as const })),
      ];
      for (const p of people) await prisma.candidateProfile.update({ where: { id: p.profileId }, data: { gender: p.gender } });

      let seed = 5;
      const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
      const N = 320;
      const sessions = Array.from({ length: N }, (_, i) => ({ person: people[i % people.length], theta: (rand() + rand() + rand() - 1.5) * 1.6 }));
      const created = await Promise.all(sessions.map((s) => prisma.testSession.create({ data: { candidateProfileId: s.person.profileId, testType: "IQ", status: "COMPLETED", languageId: kit.language.id, theta: s.theta, completedAt: new Date() }, select: { id: true } })));
      const logistic = (t: number) => 1 / (1 + Math.exp(-1.2 * t));
      const answers = (q: string, correct: (s: (typeof sessions)[number]) => boolean) => created.map((c, i) => ({ sessionId: c.id, questionId: q, answerGiven: "B", isCorrect: correct(sessions[i]), isScored: true }));
      await prisma.response.createMany({
        data: [
          ...answers(healthy, (s) => rand() < logistic(s.theta)),
          ...answers(easy, () => rand() < 0.99),
          ...answers(biased, (s) => rand() < Math.max(0, logistic(s.theta) - (s.person.gender === "FEMALE" ? 0.3 : 0))),
        ],
      });
      for (const q of [healthy, easy, biased]) await prisma.itemStatistic.create({ data: { questionId: q, responseCount: N, correctCount: 0 } });

      const result = await recalibrate(prisma, { triggeredBy: "test" });
      recalRunIds.push(result.runId);
      expect(result.checked).toBeGreaterThanOrEqual(3);

      const stat = (q: string) => prisma.itemStatistic.findUniqueOrThrow({ where: { questionId: q } });
      expect((await stat(healthy)).flagged).toBe(false);
      const easyStat = await stat(easy);
      expect(easyStat.flagged).toBe(true);
      expect(easyStat.flagReason).toContain("Too easy");
      const biasedStat = await stat(biased);
      expect(biasedStat.flagged).toBe(true);
      expect(biasedStat.flagReason).toContain("Possible bias by gender");
      expect(Math.abs(biasedStat.difByGender!)).toBeGreaterThan(0.15);
      expect((await stat(healthy)).lastCalibratedAt).not.toBeNull();

      // difficulty and discrimination were re-estimated and saved on the questions
      const q = await prisma.question.findUniqueOrThrow({ where: { id: easy } });
      expect(q.bParam).toBeLessThan(-1);
      expect(q.status).toBe("APPROVED"); // flagged, never retired or deleted automatically
      expect(await prisma.question.count({ where: { id: { in: [healthy, easy, biased] } } })).toBe(3);

      // a question an admin kept is left alone until it has a full set of new answers
      await prisma.itemStatistic.update({ where: { questionId: easy }, data: { flagged: false, reviewedAt: new Date(), reviewedAtCount: N } });
      const second = await recalibrate(prisma, { triggeredBy: "test" });
      recalRunIds.push(second.runId);
      expect((await stat(easy)).flagged).toBe(false);
      const run = await prisma.recalibrationRun.findUniqueOrThrow({ where: { id: second.runId } });
      expect(run.status).toBe("COMPLETED");
    }, 120_000);

    it("ignores items with too few answers", async () => {
      const [few] = await kit.addMcq("IQ", [{ b: 0 }]);
      await prisma.itemStatistic.create({ data: { questionId: few, responseCount: 10, correctCount: 10 } });
      const r = await recalibrate(prisma, { triggeredBy: "test" });
      recalRunIds.push(r.runId);
      expect((await prisma.itemStatistic.findUniqueOrThrow({ where: { questionId: few } })).lastCalibratedAt).toBeNull();
    });
  });

  describe("fairness report", () => {
    it("builds a report for a month with no results without failing, and stores it once per month", async () => {
      reportMonths.push("2019-03");
      const data = await buildFairnessReport(prisma, "2019-03");
      expect(data.tests.map((t) => t.test)).toEqual(["IQ", "EQ", "LANGUAGE", "SKILL"]);
      expect(data.tests.every((t) => t.total === 0)).toBe(true);
      const a = await generateFairnessReport(prisma, { month: "2019-03", notifyAdmins: false });
      const b = await generateFairnessReport(prisma, { month: "2019-03", notifyAdmins: false });
      expect(b.id).toBe(a.id);
      expect(await prisma.fairnessReport.count({ where: { month: "2019-03" } })).toBe(1);
    });
  });
});

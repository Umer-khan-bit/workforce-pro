import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ShortlistStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createKit, type Kit } from "@/lib/testEngine/testkit";
import { createCompany, type World } from "@/lib/recruiter/testWorld";
import { bucketCounts, funnelFromHistory, hiringReport, timeToHireFromHistory, type HistoryEntry } from "./hiring";
import { topWithOther, candidatesByCity, candidatesByRole, quartileDistribution } from "./candidates";
import { revenueByMonth } from "./platform";
import { poolReport } from "./pool";

const DAY = 86_400_000;
const now = new Date("2026-10-15T12:00:00Z");
const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY);
const h = (shortlistId: string, status: ShortlistStatus, daysAgo: number): HistoryEntry => ({ shortlistId, status, changedAt: at(daysAgo) });

describe("the hiring funnel", () => {
  const history = [
    h("a", "SHORTLISTED", 30), h("a", "CONTACTED", 25), h("a", "INTERVIEWING", 20), h("a", "OFFERED", 15), h("a", "HIRED", 10),
    h("b", "SHORTLISTED", 30), h("b", "CONTACTED", 22), h("b", "REJECTED", 18),
    h("c", "SHORTLISTED", 5),
    h("d", "SHORTLISTED", 40), h("d", "CONTACTED", 35), h("d", "INTERVIEWING", 30),
  ];
  const { steps, rejected } = funnelFromHistory(["a", "b", "c", "d"], history);

  it("counts how many candidates ever reached each stage", () => {
    expect(steps.map((s) => [s.status, s.count])).toEqual([["SHORTLISTED", 4], ["CONTACTED", 3], ["INTERVIEWING", 2], ["OFFERED", 1], ["HIRED", 1]]);
    expect(rejected).toBe(1);
  });

  it("never grows from one stage to the next", () => {
    for (let i = 1; i < steps.length; i++) expect(steps[i].count).toBeLessThanOrEqual(steps[i - 1].count);
  });

  it("counts every shortlisted candidate in the first stage even if the history is missing", () => {
    expect(funnelFromHistory(["x", "y"], []).steps[0].count).toBe(2);
    expect(funnelFromHistory([], []).steps.every((s) => s.count === 0)).toBe(true);
  });

  it("ignores history for candidates that are not in the list", () => {
    expect(funnelFromHistory(["a"], [h("zzz", "HIRED", 1)]).steps[4].count).toBe(0);
  });
});

describe("time to hire", () => {
  const started = new Map([["a", at(30)], ["b", at(20)], ["c", at(10)]]);
  it("is the days from shortlisting to hiring, averaged and as a median", () => {
    const r = timeToHireFromHistory(started, [h("a", "HIRED", 10), h("b", "HIRED", 0), h("c", "CONTACTED", 5)]);
    expect(r).toEqual({ hires: 2, averageDays: 20, medianDays: 20 });
    const odd = timeToHireFromHistory(started, [h("a", "HIRED", 28), h("b", "HIRED", 8), h("c", "HIRED", 9)]);
    expect(odd).toEqual({ hires: 3, averageDays: 5, medianDays: 2 }); // 2, 12, 1 days
  });
  it("has no numbers when nobody was hired", () => {
    expect(timeToHireFromHistory(started, [h("a", "CONTACTED", 5)])).toEqual({ hires: 0, averageDays: null, medianDays: null });
  });
  it("uses the first time someone was marked hired", () => {
    expect(timeToHireFromHistory(new Map([["a", at(30)]]), [h("a", "HIRED", 5), h("a", "HIRED", 20)]).averageDays).toBe(10);
  });
});

describe("counting over time", () => {
  it("makes weekly buckets for short periods, ending with the current week", () => {
    const b = bucketCounts([at(0), at(1), at(8), at(100)], 28, now);
    expect(b).toHaveLength(4);
    expect(b.map((x) => x.count)).toEqual([0, 0, 1, 2]); // 100 days ago falls before the first bucket and is not counted
    expect(b.reduce((a, x) => a + x.count, 0)).toBe(3);
  });
  it("makes monthly buckets for long periods", () => {
    const b = bucketCounts([new Date("2026-10-02T00:00:00Z"), new Date("2026-08-20T00:00:00Z"), new Date("2026-08-01T00:00:00Z")], 180, now);
    expect(b).toHaveLength(6);
    expect(b.at(-1)!.count).toBe(1);
    expect(b.find((x) => x.label.startsWith("Aug"))!.count).toBe(2);
  });
});

describe("grouping and money", () => {
  it("keeps the biggest groups and adds the rest up as Other", () => {
    const out = topWithOther([{ label: "a", value: 1 }, { label: "b", value: 5 }, { label: "c", value: 3 }, { label: "d", value: 2 }], 2);
    expect(out).toEqual([{ label: "b", value: 5 }, { label: "c", value: 3 }, { label: "Other", value: 3 }]);
    expect(topWithOther([{ label: "a", value: 1 }], 3)).toEqual([{ label: "a", value: 1 }]);
  });

  it("adds up successful payments per month, split into subscriptions and courses", () => {
    const rows = revenueByMonth(
      [
        { amount: 100, createdAt: new Date("2026-10-03T00:00:00Z"), purpose: "SUBSCRIPTION" },
        { amount: 50, createdAt: new Date("2026-10-09T00:00:00Z"), purpose: "COURSE" },
        { amount: 70, createdAt: new Date("2026-09-20T00:00:00Z"), purpose: "SUBSCRIPTION" },
        { amount: 999, createdAt: new Date("2026-05-01T00:00:00Z"), purpose: "SUBSCRIPTION" },
      ],
      3,
      now
    );
    expect(rows.map((r) => [r.subscriptions, r.courses])).toEqual([[0, 0], [70, 0], [100, 50]]);
  });
});

const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

describe.skipIf(!dbUp)("reports from the database", () => {
  let kit: Kit;
  let a: World;
  let b: World;
  const created: { shortlistIds: string[] } = { shortlistIds: [] };

  beforeAll(async () => {
    kit = await createKit(prisma, "rep");
    a = await createCompany(prisma, `${kit.run}a`);
    b = await createCompany(prisma, `${kit.run}b`);
  }, 60_000);
  afterAll(async () => {
    await a.cleanup();
    await b.cleanup();
    await kit.cleanup();
  }, 60_000);

  async function pipeline(world: World, steps: Array<[ShortlistStatus, number]>, opening: string) {
    const c = await kit.addCandidate(`c${created.shortlistIds.length}`);
    const first = steps[0][1];
    const entry = await prisma.shortlist.create({ data: { recruiterId: world.recruiter.id, candidateProfileId: c.profileId, jobOpeningId: opening, status: steps.at(-1)![0], createdAt: new Date(Date.now() - first * DAY) } });
    await prisma.shortlistStatusHistory.createMany({ data: steps.map(([status, daysAgo]) => ({ shortlistId: entry.id, status, changedAt: new Date(Date.now() - daysAgo * DAY) })) });
    created.shortlistIds.push(entry.id);
    return entry;
  }

  it("reports a recruiter, a company and the whole platform separately", async () => {
    const openA = await prisma.jobOpening.create({ data: { companyId: a.company.id, createdById: a.recruiter.id, jobRoleId: kit.role.id, salaryRangeMin: 1, salaryRangeMax: 99_999 } });
    const openB = await prisma.jobOpening.create({ data: { companyId: b.company.id, createdById: b.recruiter.id, jobRoleId: kit.role.id, salaryRangeMin: 1, salaryRangeMax: 99_999 } });
    const second = await a.addUser("second", "RECRUITER");
    await pipeline(a, [["SHORTLISTED", 20], ["CONTACTED", 15], ["INTERVIEWING", 10], ["OFFERED", 6], ["HIRED", 2]], openA.id);
    await pipeline(a, [["SHORTLISTED", 12], ["CONTACTED", 8], ["REJECTED", 4]], openA.id);
    // A third entry by another recruiter of the same company.
    const c3 = await kit.addCandidate("third");
    const e3 = await prisma.shortlist.create({ data: { recruiterId: second.id, candidateProfileId: c3.profileId, jobOpeningId: openA.id } });
    await prisma.shortlistStatusHistory.create({ data: { shortlistId: e3.id, status: "SHORTLISTED" } });
    await pipeline(b, [["SHORTLISTED", 9]], openB.id);

    const mine = await hiringReport(prisma, { recruiterId: a.recruiter.id }, 90);
    expect(mine.total).toBe(2);
    expect(mine.funnel.steps.map((s) => s.count)).toEqual([2, 2, 1, 1, 1]);
    expect(mine.funnel.rejected).toBe(1);
    expect(mine.timeToHire).toMatchObject({ hires: 1, averageDays: 18, medianDays: 18 });
    expect(mine.shortlisted.reduce((x, y) => x + y.count, 0)).toBe(2);
    expect(mine.hired.reduce((x, y) => x + y.count, 0)).toBe(1);

    const company = await hiringReport(prisma, { companyId: a.company.id }, 90);
    expect(company.total).toBe(3);
    expect(company.funnel.steps[0].count).toBe(3);

    const other = await hiringReport(prisma, { companyId: b.company.id }, 90);
    expect(other.total).toBe(1);
    expect(other.timeToHire.hires).toBe(0);

    const everyone = await hiringReport(prisma, {}, 90);
    expect(everyone.total).toBeGreaterThanOrEqual(4);
  });

  it("only looks at shortlists from the chosen period", async () => {
    const old = await prisma.jobOpening.create({ data: { companyId: b.company.id, createdById: b.recruiter.id, jobRoleId: kit.role.id, salaryRangeMin: 1, salaryRangeMax: 99_999 } });
    await pipeline(b, [["SHORTLISTED", 200], ["HIRED", 190]], old.id);
    expect((await hiringReport(prisma, { companyId: b.company.id }, 90)).timeToHire.hires).toBe(0);
    expect((await hiringReport(prisma, { companyId: b.company.id }, 365)).timeToHire.hires).toBe(1);
  });

  it("groups candidates by city and role, and by quartile from their latest result", async () => {
    const where = { jobRoleId: kit.role.id, anonymisedAt: null };
    const x = await kit.addCandidate("pool1");
    const y = await kit.addCandidate("pool2");
    const z = await kit.addCandidate("pool3");
    await prisma.candidateProfile.update({ where: { id: x.profileId }, data: { city: "Lahore" } });
    await prisma.candidateProfile.update({ where: { id: y.profileId }, data: { city: "Lahore" } });
    await prisma.candidateProfile.update({ where: { id: z.profileId }, data: { city: "Karachi" } });
    const score = async (profileId: string, quartile: number, ageMs: number) => {
      const s = await prisma.testSession.create({ data: { candidateProfileId: profileId, testType: "IQ", status: "COMPLETED", completedAt: new Date() } });
      await prisma.score.create({ data: { candidateProfileId: profileId, sessionId: s.id, testType: "IQ", rawScore: 1, quartile, percentile: 50, rankValue: 0, computedAt: new Date(Date.now() - ageMs) } });
    };
    await score(x.profileId, 4, 10_000); // an old result ...
    await score(x.profileId, 1, 0); // ... replaced by a newer one
    await score(y.profileId, 2, 0);

    const city = await candidatesByCity(prisma, where);
    expect(city.find((c) => c.label === "Lahore")?.value).toBeGreaterThanOrEqual(2);
    expect(Object.fromEntries(city.map((c) => [c.label, c.value]))).toMatchObject({ Lahore: expect.any(Number), Karachi: expect.any(Number) });
    const role = await candidatesByRole(prisma, where);
    expect(role[0].label).toBe(`Test role ${kit.run}`);
    expect(role[0].value).toBeGreaterThanOrEqual(3);

    const q = await quartileDistribution(prisma, "IQ", where);
    expect(q.map((s) => s.label)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
    expect(q.map((s) => s.value)).toEqual([1, 1, 0, 0]); // x counts once, in Q1
    const pool = await poolReport(prisma, where);
    expect(pool.quartiles.map((p) => p.test)).toEqual(["IQ", "EQ", "Language", "Job skill"]);
  });

  it("does not count deleted accounts", async () => {
    const gone = await kit.addCandidate("gone");
    await prisma.candidateProfile.update({ where: { id: gone.profileId }, data: { anonymisedAt: new Date(), city: "Nowhereville" } });
    const city = await candidatesByCity(prisma, { anonymisedAt: null, jobRoleId: kit.role.id });
    expect(city.some((c) => c.label === "Nowhereville")).toBe(false);
  });
});

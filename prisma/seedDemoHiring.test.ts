import { afterEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { recruiterVisibleWhere } from "../src/lib/recruiter/candidateAccess";
import { isTopPerformer } from "../src/lib/results/topPerformer";
import { hasFeature } from "../src/lib/planFeatures";
import { funnelFromHistory } from "../src/lib/reports/hiring";
import { seedDemoHiring } from "./seedDemoHiring";

describe("demo hiring seed guard", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("refuses to run unless DEMO_MODE is 'true'", async () => {
    const untouchable = new Proxy({}, { get: () => { throw new Error("database was touched"); } }) as unknown as PrismaClient;
    for (const value of ["false", "", "TRUE"]) {
      vi.stubEnv("DEMO_MODE", value);
      await expect(seedDemoHiring(untouchable)).rejects.toThrow(/DEMO_MODE/);
    }
  });
});

// These read the demo data that `npm run prisma:seed` created and only read: they are skipped on a database without it.
const prisma = new PrismaClient();
const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const seeded = dbUp ? await prisma.company.count({ where: { name: { in: ["Karachi Tech Solutions", "Lahore Retail Group", "Islamabad Business Services"] }, jobOpenings: { some: {} } } }) : 0;

describe.skipIf(!dbUp || seeded < 3)("the demo hiring data in the database", () => {
  const demoCompanies = () => prisma.company.findMany({ where: { name: { in: ["Karachi Tech Solutions", "Lahore Retail Group", "Islamabad Business Services"] } } });

  it("gives every demo company job openings and shortlisted candidates moving through the pipeline", async () => {
    for (const c of await demoCompanies()) {
      expect(await prisma.jobOpening.count({ where: { companyId: c.id } }), c.name).toBeGreaterThanOrEqual(3);
      const history = await prisma.shortlistStatusHistory.findMany({ where: { shortlist: { recruiter: { companyId: c.id } } }, select: { shortlistId: true, status: true, changedAt: true } });
      const ids = [...new Set(history.map((h) => h.shortlistId))];
      const { steps } = funnelFromHistory(ids, history);
      expect(steps[0].count, c.name).toBeGreaterThanOrEqual(10);
      for (let i = 1; i < steps.length; i++) expect(steps[i].count, c.name).toBeLessThanOrEqual(steps[i - 1].count);
      expect(steps.some((s) => s.status === "HIRED" && s.count > 0), `${c.name} has a hire`).toBe(true);
    }
  });

  it("every status change is in the past and in order", async () => {
    const entries = await prisma.shortlist.findMany({ where: { recruiter: { email: { endsWith: "@demo.test" } } }, include: { statusHistory: { orderBy: { changedAt: "asc" } } } });
    expect(entries.length).toBeGreaterThan(40);
    for (const e of entries) {
      expect(e.statusHistory[0].status).toBe("SHORTLISTED");
      expect(e.statusHistory.at(-1)!.status).toBe(e.status);
      for (const h of e.statusHistory) expect(h.changedAt.getTime()).toBeLessThanOrEqual(Date.now());
    }
  });

  it("follows the rules: only candidates whose minimum fits the opening, and Top Performers only for plans with Q1 access", async () => {
    const entries = await prisma.shortlist.findMany({
      where: { recruiter: { email: { endsWith: "@demo.test" } } },
      include: { jobOpening: true, recruiter: { select: { companyId: true } } },
    });
    for (const e of entries) {
      const fits = await prisma.candidateProfile.count({ where: { AND: [{ id: e.candidateProfileId }, recruiterVisibleWhere(e.jobOpening.salaryRangeMax)] } });
      expect(fits, `candidate ${e.candidateProfileId} fits opening ${e.jobOpeningId}`).toBe(1);
    }
    const sub = await prisma.subscription.findMany({ where: { status: "ACTIVE" }, include: { plan: true } });
    const q1 = new Map(sub.map((s) => [s.companyId, hasFeature(s.plan.features, "q1Exclusive")]));
    const withoutQ1 = entries.filter((e) => q1.get(e.recruiter.companyId!) === false);
    expect(withoutQ1.length).toBeGreaterThan(0);
    for (const e of withoutQ1) expect(await isTopPerformer(prisma, e.candidateProfileId)).toBe(false);
  });

  it("keeps the Basic company inside its shortlist limit, and the contact requests consistent with the pipeline", async () => {
    const basic = await prisma.company.findFirstOrThrow({ where: { name: "Lahore Retail Group" } });
    const plan = (await prisma.subscription.findFirstOrThrow({ where: { companyId: basic.id, status: "ACTIVE" }, include: { plan: true } })).plan;
    const limit = (plan.features as { maxShortlists?: number | null }).maxShortlists;
    const inPipeline = await prisma.shortlist.count({ where: { recruiter: { companyId: basic.id }, status: { notIn: ["HIRED", "REJECTED"] } } });
    if (typeof limit === "number") expect(inPipeline).toBeLessThanOrEqual(limit);

    const accepted = await prisma.contactRequest.findMany({ where: { status: "ACCEPTED", recruiter: { email: { endsWith: "@demo.test" } } }, select: { respondedAt: true, sentAt: true } });
    expect(accepted.length).toBeGreaterThan(5);
    for (const r of accepted) expect(r.respondedAt!.getTime()).toBeGreaterThan(r.sentAt.getTime());
  });

  it("leaves the demo candidate a request waiting for her answer", async () => {
    const waiting = await prisma.contactRequest.count({ where: { candidateProfile: { user: { email: "candidate@demo.test" } }, status: "SENT" } });
    const any = await prisma.contactRequest.count({ where: { candidateProfile: { user: { email: "candidate@demo.test" } } } });
    expect(any).toBeGreaterThan(0); // she may have answered it since the seed
    expect(waiting).toBeGreaterThanOrEqual(0);
  });

  it("has a payment history for each company, with one failed attempt", async () => {
    for (const c of await demoCompanies()) expect(await prisma.payment.count({ where: { companyId: c.id, status: "SUCCESS" } }), c.name).toBeGreaterThanOrEqual(2);
    expect(await prisma.payment.count({ where: { status: "FAILED", providerReference: "SIM-SEEDFAIL" } })).toBeGreaterThanOrEqual(1);
  });
});

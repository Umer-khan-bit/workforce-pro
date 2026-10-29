import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TestType } from "@prisma/client";

const auth = vi.hoisted(() => ({ user: null as null | { id: string; role: string; companyId?: string | null } }));
vi.mock("@/auth", () => ({ auth: async () => (auth.user ? { user: auth.user } : null) }));

import { prisma } from "@/lib/prisma";
import { readSetting } from "@/lib/settings/store";
import { createKit, type Kit } from "@/lib/testEngine/testkit";
import { createCompany, type World } from "@/lib/recruiter/testWorld";
import { getEntitlements } from "@/lib/recruiter/entitlements";
import { getCandidateDetail } from "@/lib/recruiter/candidateDetail";
import { searchCandidates, filterRows, type CandidateRow } from "@/lib/recruiter/search";
import { buildSearchQuery, parseSearchQuery } from "@/lib/recruiter/searchParams";
import { clearFlag, voidResult } from "./review";
import { integrityLevel } from "./summary";
import { ConcernError, listConcerns, markConcernReviewed, ownReports, reportConcern } from "./concerns";
import { POST as reportRoute } from "@/app/api/recruiter/candidates/[id]/concern/route";
import { POST as reviewRoute } from "@/app/api/admin/integrity/concerns/[id]/route";

const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

const json = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("integrity levels and the search address (pure)", () => {
  it("has three states around the threshold", () => {
    expect([0, 1, 2, 3, 9].map((n) => integrityLevel(n, 3))).toEqual(["none", "info", "info", "concern", "concern"]);
    expect(integrityLevel(1, 1)).toBe("concern");
  });
  it("keeps the integrity filter in the address like the other filters", () => {
    const q = { filters: { jobRoleId: "r1", noIntegrityConcerns: true }, sort: "overall" as const, page: 2, offer: 90000, opening: null };
    expect(buildSearchQuery(q)).toContain("clean=1");
    expect(parseSearchQuery(Object.fromEntries(new URLSearchParams(buildSearchQuery(q))))).toEqual(q);
    expect(parseSearchQuery({}).filters.noIntegrityConcerns).toBeUndefined();
    expect(parseSearchQuery({ clean: "0" }).filters.noIntegrityConcerns).toBeUndefined();
  });
  it("the filter removes only candidates at the concern level", () => {
    const row = (id: string, level: "none" | "info" | "concern"): CandidateRow => ({ id, name: id, city: null, jobRole: null, experienceYears: null, quartiles: {}, percentiles: {}, cefrLevel: null, overall: null, topPerformer: false, integrity: { exits: level === "none" ? 0 : 2, level, perTest: [] } });
    const rows = [row("a", "none"), row("b", "info"), row("c", "concern")];
    expect(filterRows(rows, { noIntegrityConcerns: true }).map((r) => r.id)).toEqual(["a", "b"]);
    expect(filterRows(rows, {}).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe.skipIf(!dbUp)("integrity for companies (real database)", () => {
  let kit: Kit;
  let a: World;
  let b: World;
  let adminId: string;
  let threshold: number;
  const startedAt = new Date();

  beforeAll(async () => {
    kit = await createKit(prisma, "intd");
    a = await createCompany(prisma, `intda${kit.run}`);
    b = await createCompany(prisma, `intdb${kit.run}`);
    adminId = (await prisma.user.create({ data: { email: `intd-admin-${kit.run}@example.test`, name: "Integrity D admin", password: "x", role: "PLATFORM_ADMIN" } })).id;
    threshold = (await readSetting(prisma, "testing")).integrityFlagThreshold;
  }, 60_000);
  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { title: "A company reported an integrity concern", createdAt: { gte: startedAt } } });
    await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
    await prisma.concernReport.deleteMany({ where: { reviewedById: adminId } });
    await prisma.integrityReview.deleteMany({ where: { reviewedById: adminId } });
    await a.cleanup();
    await b.cleanup();
    await kit.cleanup();
    await prisma.notification.deleteMany({ where: { userId: adminId } });
    await prisma.user.delete({ where: { id: adminId } });
  }, 60_000);

  async function finished(profileId: string, testType: TestType, exits = 0) {
    const s = await prisma.testSession.create({ data: { candidateProfileId: profileId, testType, status: "COMPLETED", completedAt: new Date(), languageId: kit.language.id } });
    await prisma.score.create({ data: { candidateProfileId: profileId, sessionId: s.id, testType, rawScore: 50, quartile: 2, percentile: 60, rankValue: 1, cohortScope: "ALL", cohortSize: 40 } });
    for (let i = 1; i <= exits; i++) await prisma.auditLog.create({ data: { actorId: adminId, action: "TEST_FOCUS_LOST", targetType: "TestSession", targetId: s.id, metadata: { testType, count: i } } });
    return s.id;
  }
  const searchArgs = (over: object = {}) => ({ offerMax: 100_000, filters: { jobRoleId: kit.role.id }, sort: "overall" as const, page: 1, pageSize: 100, poolLimit: 1000, rule: { requiredQuartile: 1, countedTests: ["IQ", "EQ"] as TestType[] }, canSeeTopPerformers: true, ...over });
  const rowFor = async (profileId: string, filters: object = {}) => (await searchCandidates(prisma, searchArgs({ filters: { jobRoleId: kit.role.id, ...filters } }))).rows.find((r) => r.id === profileId);

  it("search shows three integrity states, counts only; cleared flags and voided results read as no concerns", async () => {
    expect(threshold).toBe(3);
    const none = await kit.addCandidate("none");
    const few = await kit.addCandidate("few");
    const many = await kit.addCandidate("many");
    const cleared = await kit.addCandidate("cleared");
    const voided = await kit.addCandidate("voided");
    await finished(none.profileId, "IQ", 0);
    await finished(few.profileId, "IQ", threshold - 1);
    await finished(many.profileId, "IQ", threshold + 1);
    await finished(many.profileId, "EQ", 1);
    const clearedSession = await finished(cleared.profileId, "IQ", threshold);
    const voidedSession = await finished(voided.profileId, "IQ", threshold + 2);
    await clearFlag(prisma, adminId, clearedSession);
    await voidResult(prisma, adminId, voidedSession);

    expect((await rowFor(none.profileId))?.integrity).toMatchObject({ exits: 0, level: "none" });
    expect((await rowFor(few.profileId))?.integrity).toMatchObject({ exits: threshold - 1, level: "info" });
    expect((await rowFor(many.profileId))?.integrity).toMatchObject({ exits: threshold + 1, level: "concern" });
    expect((await rowFor(many.profileId))?.integrity?.perTest).toEqual(expect.arrayContaining([{ testType: "IQ", exits: threshold + 1 }, { testType: "EQ", exits: 1 }]));
    expect((await rowFor(cleared.profileId))?.integrity).toMatchObject({ exits: 0, level: "none" });
    expect((await rowFor(voided.profileId))?.integrity).toMatchObject({ exits: 0, level: "none" });

    // The filter drops only the candidate at or above the threshold; everyone else stays.
    const withFilter = (await searchCandidates(prisma, searchArgs({ filters: { jobRoleId: kit.role.id, noIntegrityConcerns: true } }))).rows.map((r) => r.id);
    expect(withFilter).toEqual(expect.arrayContaining([none.profileId, few.profileId, cleared.profileId, voided.profileId]));
    expect(withFilter).not.toContain(many.profileId);
    const without = (await searchCandidates(prisma, searchArgs())).rows.map((r) => r.id);
    expect(without).toContain(many.profileId);
    // Nothing private comes with it.
    expect(JSON.stringify((await searchCandidates(prisma, searchArgs())).rows)).not.toMatch(/minimumSalary|phone|TEST_FOCUS_LOST/);
  });

  it("the candidate report uses the same three states", async () => {
    const c = await kit.addCandidate("report");
    await finished(c.profileId, "IQ", threshold - 1);
    await finished(c.profileId, "EQ", threshold);
    await finished(c.profileId, "LANGUAGE", 0);
    const ent = await getEntitlements(a.company.id);
    const d = await getCandidateDetail(prisma, { recruiterUserId: a.recruiter.id, companyId: a.company.id, candidateProfileId: c.profileId, offerMax: 100_000, entitlements: ent });
    expect(d?.integrity.IQ).toEqual({ line: `Integrity: ${threshold - 1} window exits`, level: "info", exits: threshold - 1 });
    expect(d?.integrity.EQ).toEqual({ line: `Integrity: concern, ${threshold} window exits`, level: "concern", exits: threshold });
    expect(d?.integrity.LANGUAGE).toEqual({ line: "Integrity: no concerns", level: "none", exits: 0 });
  });

  it("a recruiter reports a concern: saved once per company and test, audit-logged, admins notified, and other companies never see it", async () => {
    const c = await kit.addCandidate("doubtful");
    const sid = await finished(c.profileId, "IQ", 4);
    const entA = await getEntitlements(a.company.id);
    const entB = await getEntitlements(b.company.id);
    const base = { candidateProfileId: c.profileId, testType: "IQ" as const, offerMax: 100_000 };

    const first = await reportConcern(prisma, { ...base, recruiterUserId: a.recruiter.id, companyId: a.company.id, reason: "  Answers were far too fast.  ", entitlements: entA });
    const row = await prisma.concernReport.findUniqueOrThrow({ where: { id: first.id } });
    expect(row).toMatchObject({ companyId: a.company.id, recruiterId: a.recruiter.id, sessionId: sid, testType: "IQ", reason: "Answers were far too fast.", reviewedAt: null });
    expect(await prisma.auditLog.count({ where: { action: "CONCERN_REPORTED", actorId: a.recruiter.id, targetId: sid } })).toBe(1);
    const admins = await prisma.user.findMany({ where: { role: "PLATFORM_ADMIN", isActive: true }, select: { id: true } });
    expect(admins.map((x) => x.id)).toContain(adminId);
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: adminId, title: "A company reported an integrity concern" } });
    expect(note).toMatchObject({ channel: "IN_APP", link: "/admin/integrity-review" });
    expect(note.message).toContain(a.company.name);
    expect(note.message).not.toContain("too fast"); // the reason stays in the report, not in the alert

    // The same company cannot report the same test result again, even from another recruiter.
    const second = await a.addUser("second", "RECRUITER");
    await expect(reportConcern(prisma, { ...base, recruiterUserId: second.id, companyId: a.company.id, reason: "Again", entitlements: entA })).rejects.toMatchObject({ code: "ALREADY_REPORTED", status: 409 });
    expect(await prisma.concernReport.count({ where: { sessionId: sid, companyId: a.company.id } })).toBe(1);

    // Another company can report the same result; neither sees the other's report.
    await reportConcern(prisma, { ...base, recruiterUserId: b.recruiter.id, companyId: b.company.id, reason: "Looks copied", entitlements: entB });
    expect([...(await ownReports(prisma, a.company.id, c.profileId)).keys()]).toEqual([sid]);
    expect([...(await ownReports(prisma, b.company.id, c.profileId)).keys()]).toEqual([sid]);
    const { open } = await listConcerns(prisma);
    const mine = open.filter((r) => r.candidate.includes(`doubtful`));
    expect(mine.map((r) => r.company).sort()).toEqual([a.company.name, b.company.name].sort());
    expect(mine.find((r) => r.company === a.company.name)).toMatchObject({ recruiter: a.recruiter.name, testType: "IQ", reason: "Answers were far too fast." });
  });

  it("follows the report's access rules and checks the reason", async () => {
    const entA = await getEntitlements(a.company.id);
    const noPlan = await createCompany(prisma, `intdn${kit.run}`, { features: null });
    try {
      const c = await kit.addCandidate("guarded");
      await finished(c.profileId, "IQ", 5);
      const args = { recruiterUserId: a.recruiter.id, companyId: a.company.id, candidateProfileId: c.profileId, testType: "IQ" as const, offerMax: 100_000, reason: "Doubt", entitlements: entA };

      // The candidate's minimum salary is above the offer: "not available", the same as for a missing candidate.
      await prisma.candidateProfile.update({ where: { id: c.profileId }, data: { minimumSalary: 200_000 } });
      await expect(reportConcern(prisma, args)).rejects.toMatchObject({ code: "NOT_AVAILABLE", status: 404 });
      await expect(reportConcern(prisma, { ...args, candidateProfileId: "missing" })).rejects.toMatchObject({ code: "NOT_AVAILABLE", status: 404 });
      await prisma.candidateProfile.update({ where: { id: c.profileId }, data: { minimumSalary: 50_000 } });

      // A company without the search feature, a test the candidate has not taken, and a voided result.
      await expect(reportConcern(prisma, { ...args, recruiterUserId: noPlan.recruiter.id, companyId: noPlan.company.id, entitlements: await getEntitlements(noPlan.company.id) })).rejects.toMatchObject({ code: "NOT_AVAILABLE" });
      await expect(reportConcern(prisma, { ...args, testType: "SKILL" })).rejects.toMatchObject({ code: "NOT_AVAILABLE" });

      // The reason is required and at most 500 characters.
      await expect(reportConcern(prisma, { ...args, reason: "   " })).rejects.toMatchObject({ code: "BAD_REASON", status: 400 });
      await expect(reportConcern(prisma, { ...args, reason: "x".repeat(501) })).rejects.toMatchObject({ code: "BAD_REASON" });
      expect(await prisma.concernReport.count({ where: { candidateProfileId: c.profileId } })).toBe(0);
      await expect(reportConcern(prisma, { ...args, reason: "x".repeat(500) })).resolves.toBeTruthy();

      const v = await kit.addCandidate("voidedreport");
      const vs = await finished(v.profileId, "IQ", 4);
      await voidResult(prisma, adminId, vs);
      await expect(reportConcern(prisma, { ...args, candidateProfileId: v.profileId })).rejects.toBeInstanceOf(ConcernError);
    } finally {
      await noPlan.cleanup();
    }
  });

  it("the admin marks a report reviewed once, and it is audit-logged", async () => {
    const c = await kit.addCandidate("tobereviewed");
    const sid = await finished(c.profileId, "IQ", 3);
    const { id } = await reportConcern(prisma, { recruiterUserId: a.recruiter.id, companyId: a.company.id, candidateProfileId: c.profileId, testType: "IQ", offerMax: 100_000, reason: "Please check", entitlements: await getEntitlements(a.company.id) });
    await markConcernReviewed(prisma, adminId, id);
    expect(await prisma.concernReport.findUniqueOrThrow({ where: { id } })).toMatchObject({ reviewedById: adminId });
    expect(await prisma.auditLog.count({ where: { action: "CONCERN_REVIEWED", actorId: adminId, targetId: sid } })).toBe(1);
    await expect(markConcernReviewed(prisma, adminId, id)).rejects.toMatchObject({ code: "ALREADY_REVIEWED", status: 409 });
    await expect(markConcernReviewed(prisma, adminId, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const lists = await listConcerns(prisma);
    expect(lists.open.some((r) => r.id === id)).toBe(false);
    expect(lists.reviewed.find((r) => r.id === id)).toMatchObject({ company: a.company.name });
    // Reporting and reviewing never change the result itself.
    expect((await prisma.score.findUniqueOrThrow({ where: { sessionId: sid } })).voidedAt).toBeNull();
    expect(await prisma.integrityReview.count({ where: { sessionId: sid } })).toBe(0);
  });

  it("the routes: recruiters report, only the platform admin reviews, input is validated", async () => {
    const c = await kit.addCandidate("routes");
    await finished(c.profileId, "IQ", 3);
    const asRecruiter = { id: b.recruiter.id, role: "RECRUITER", companyId: b.company.id };
    const body = { testType: "IQ", reason: "Seems wrong", offer: 100000 };

    auth.user = null;
    expect((await reportRoute(json(body), idCtx(c.profileId))).status).toBe(403);
    auth.user = { id: c.userId, role: "CANDIDATE" };
    expect((await reportRoute(json(body), idCtx(c.profileId))).status).toBe(403);
    auth.user = { id: adminId, role: "PLATFORM_ADMIN" };
    expect((await reportRoute(json(body), idCtx(c.profileId))).status).toBe(403);

    auth.user = asRecruiter;
    expect((await reportRoute(json({ ...body, reason: "" }), idCtx(c.profileId))).status).toBe(400);
    expect((await reportRoute(json({ ...body, reason: "x".repeat(501) }), idCtx(c.profileId))).status).toBe(400);
    expect((await reportRoute(json({ ...body, testType: "NOPE" }), idCtx(c.profileId))).status).toBe(400);
    expect((await reportRoute(json({ testType: "IQ", reason: "No offer given" }), idCtx(c.profileId))).status).toBe(400);
    expect((await reportRoute(json(body), idCtx("missing"))).status).toBe(404);
    const ok = await reportRoute(json(body), idCtx(c.profileId));
    expect(ok.status).toBe(201);
    const { id } = await ok.json();
    expect((await reportRoute(json(body), idCtx(c.profileId))).status).toBe(409);

    // An unconfirmed email address cannot report.
    const unverified = await b.addUser("unverified", "RECRUITER", false);
    auth.user = { id: unverified.id, role: "RECRUITER", companyId: b.company.id };
    expect((await reportRoute(json(body), idCtx(c.profileId))).status).toBe(403);

    // Only the platform admin reviews.
    auth.user = asRecruiter;
    expect((await reviewRoute(json({ action: "review" }), idCtx(id))).status).toBe(403);
    auth.user = { id: adminId, role: "PLATFORM_ADMIN" };
    expect((await reviewRoute(json({ action: "nonsense" }), idCtx(id))).status).toBe(400);
    expect((await reviewRoute(json({ action: "review" }), idCtx("missing"))).status).toBe(404);
    expect((await reviewRoute(json({ action: "review" }), idCtx(id))).status).toBe(200);
    expect((await reviewRoute(json({ action: "review" }), idCtx(id))).status).toBe(409);
    auth.user = null;
  });
});

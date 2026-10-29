import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TestType } from "@prisma/client";

const session = vi.hoisted(() => ({ user: null as null | { id: string; role: string } }));
vi.mock("@/auth", () => ({ auth: async () => (session.user ? { user: session.user } : null) }));

import { prisma } from "@/lib/prisma";
import { readSetting } from "@/lib/settings/store";
import { createKit, type Kit } from "@/lib/testEngine/testkit";
import { getOverview } from "@/lib/testEngine/session";
import { rankAgainstCohort } from "@/lib/testEngine/ranking";
import { searchCandidates } from "@/lib/recruiter/search";
import { currentQuartiles, evaluateTopPerformer } from "@/lib/results/topPerformer";
import { latestResults } from "@/lib/results/latest";
import { quartileDistribution } from "@/lib/reports/candidates";
import { getCandidateDetail } from "@/lib/recruiter/candidateDetail";
import { clearFlag, reviewQueue, undoVoid, voidResult } from "./review";
import { integrityLine, integritySummaries, isFlagged, windowExits } from "./summary";
import { POST as decide } from "@/app/api/admin/integrity/[sessionId]/route";

const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

const json = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = (sessionId: string) => ({ params: Promise.resolve({ sessionId }) });

describe("integrity wording and threshold (pure)", () => {
  it("flags at the threshold and not below it", () => {
    expect(isFlagged(2, 3)).toBe(false);
    expect(isFlagged(3, 3)).toBe(true);
  });
  it("shows counts only", () => {
    expect(integrityLine(0, 3)).toBe("Integrity: no concerns");
    expect(integrityLine(1, 3)).toBe("Integrity: 1 window exit");
    expect(integrityLine(2, 3)).toBe("Integrity: 2 window exits");
    expect(integrityLine(3, 3)).toBe("Integrity: concern, 3 window exits");
    expect(integrityLine(4, 3)).toBe("Integrity: concern, 4 window exits");
  });
});

describe.skipIf(!dbUp)("integrity review (real database)", () => {
  let kit: Kit;
  let adminId: string;
  let rule: { requiredQuartile: number; countedTests: TestType[] };

  beforeAll(async () => {
    kit = await createKit(prisma, "integ");
    rule = await readSetting(prisma, "topPerformer");
    await kit.addCatBank("IQ", 30, 2);
    adminId = (await prisma.user.create({ data: { email: `integ-admin-${kit.run}@example.test`, name: "Integrity admin", password: "x", role: "PLATFORM_ADMIN" } })).id;
  }, 60_000);
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
    await prisma.integrityReview.deleteMany({ where: { reviewedById: adminId } });
    await kit.cleanup();
    await prisma.notification.deleteMany({ where: { userId: adminId } }); // other tests may have notified every admin
    await prisma.user.delete({ where: { id: adminId } });
  }, 60_000);

  async function finished(profileId: string, testType: TestType, quartile: number, percentile = 90, rankValue = 1) {
    const s = await prisma.testSession.create({ data: { candidateProfileId: profileId, testType, status: "COMPLETED", completedAt: new Date(), languageId: kit.language.id } });
    await prisma.score.create({ data: { candidateProfileId: profileId, sessionId: s.id, testType, rawScore: 50, quartile, percentile, rankValue, cohortScope: "ALL", cohortSize: 40 } });
    return s.id;
  }
  const exits = async (userId: string, sessionId: string, n: number) => {
    for (let i = 1; i <= n; i++) await prisma.auditLog.create({ data: { actorId: userId, action: "TEST_FOCUS_LOST", targetType: "TestSession", targetId: sessionId, metadata: { testType: "IQ", count: i } } });
  };
  const searchArgs = (over: object = {}) => ({ offerMax: 100_000, filters: { jobRoleId: kit.role.id }, sort: "overall" as const, page: 1, pageSize: 50, poolLimit: 1000, rule, canSeeTopPerformers: true, ...over });
  const found = async (profileId: string, filters: object = {}) => (await searchCandidates(prisma, searchArgs({ filters: { jobRoleId: kit.role.id, ...filters } }))).rows.some((r) => r.id === profileId);

  it("counts window exits per session and flags at the threshold in Settings; a cleared session is not flagged", async () => {
    const threshold = (await readSetting(prisma, "testing")).integrityFlagThreshold;
    const c = await kit.addCandidate("exits");
    const calm = await finished(c.profileId, "IQ", 2);
    const busy = await finished(c.profileId, "EQ", 2);
    await exits(c.userId, calm, threshold - 1);
    await exits(c.userId, busy, threshold);
    expect([...(await windowExits(prisma, [calm, busy, "nothing"])).entries()]).toEqual([[calm, threshold - 1], [busy, threshold], ["nothing", 0]]);
    let s = await integritySummaries(prisma, [calm, busy]);
    expect([s.get(calm)?.flagged, s.get(busy)?.flagged]).toEqual([false, true]);

    const queue = await reviewQueue(prisma);
    expect(queue.waiting.map((r) => r.sessionId)).toContain(busy);
    expect(queue.waiting.map((r) => r.sessionId)).not.toContain(calm);

    await clearFlag(prisma, adminId, busy);
    s = await integritySummaries(prisma, [busy]);
    expect(s.get(busy)).toMatchObject({ exits: threshold, flagged: false, cleared: true });
    expect((await reviewQueue(prisma)).waiting.map((r) => r.sessionId)).not.toContain(busy);
    expect(await prisma.auditLog.count({ where: { actorId: adminId, action: "INTEGRITY_FLAG_CLEARED", targetId: busy } })).toBe(1);
    await expect(clearFlag(prisma, adminId, busy)).rejects.toThrow(/already been reviewed/);
  });

  it("a voided result disappears from search, filters, the badge, rankings, reports and retake rules, and comes back after Undo", async () => {
    expect(rule.countedTests).toContain("IQ");
    const star = await kit.addCandidate("star");
    // The IQ result has the lowest possible rank value, so a ranking of a fixed value shows at once whether it still counts.
    const iq = await finished(star.profileId, "IQ", rule.requiredQuartile, 95, -1_000_000);
    for (const t of rule.countedTests.filter((x) => x !== "IQ")) await finished(star.profileId, t, rule.requiredQuartile, 91);
    await exits(star.userId, iq, 4);
    await prisma.candidateProfile.update({ where: { id: star.profileId }, data: { minimumSalary: 40_000 } });
    const q = rule.requiredQuartile;

    {
      // Before: found by quartile filter and as a Top Performer, holds the badge, counts in reports.
      expect((await evaluateTopPerformer(prisma, star.profileId)).awarded).toBe(true);
      expect(await found(star.profileId, { quartiles: { IQ: q as 1 } })).toBe(true);
      expect(await found(star.profileId, { topPerformersOnly: true })).toBe(true);
      expect((await currentQuartiles(prisma, star.profileId)).IQ).toBe(q);
      expect((await latestResults(prisma, star.profileId)).map((r) => r.testType)).toContain("IQ");
      expect((await quartileDistribution(prisma, "IQ", { id: star.profileId })).find((x) => x.label === "Q1")?.value).toBe(1);

      const rank = () => rankAgainstCohort(prisma, { testType: "IQ", candidateProfileId: "someone-else", jobRoleId: kit.role.id, value: -500_000 }).then((r) => r.percentile);
      const rankBefore = await rank();

      // Void.
      const out = await voidResult(prisma, adminId, iq);
      expect(out.badgeRemoved).toBe(true);
      expect(await found(star.profileId, { quartiles: { IQ: q as 1 } })).toBe(false);
      expect(await found(star.profileId, { topPerformersOnly: true })).toBe(false);
      expect((await currentQuartiles(prisma, star.profileId)).IQ).toBeUndefined();
      expect((await latestResults(prisma, star.profileId)).map((r) => r.testType)).not.toContain("IQ");
      expect((await quartileDistribution(prisma, "IQ", { id: star.profileId })).find((x) => x.label === "Q1")?.value).toBe(0);
      expect(await prisma.badge.count({ where: { candidateProfileId: star.profileId } })).toBe(0);
      expect(await prisma.auditLog.count({ where: { action: "BADGE_REMOVED", targetId: star.profileId } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: "INTEGRITY_RESULT_VOIDED", targetId: iq } })).toBe(1);
      const rankVoided = await rank();
      expect(rankVoided).toBeLessThan(rankBefore); // the voided result is no longer in anyone's cohort (it was the only one below this value)
      const queue = await reviewQueue(prisma);
      expect(queue.waiting.map((r) => r.sessionId)).not.toContain(iq);
      expect(queue.voided.map((r) => r.sessionId)).toContain(iq);

      // The candidate may retake at once.
      const overview = await getOverview({ prisma }, star.userId);
      expect(overview?.cards.find((c) => c.testType === "IQ")).toMatchObject({ status: "NOT_STARTED" });

      // Undo.
      await undoVoid(prisma, adminId, iq);
      expect(await found(star.profileId, { quartiles: { IQ: q as 1 } })).toBe(true);
      expect(await found(star.profileId, { topPerformersOnly: true })).toBe(true);
      expect((await currentQuartiles(prisma, star.profileId)).IQ).toBe(q);
      expect(await rank()).toBeGreaterThan(rankVoided);
      expect(await prisma.badge.count({ where: { candidateProfileId: star.profileId } })).toBe(1);
      expect((await reviewQueue(prisma)).waiting.map((r) => r.sessionId)).toContain(iq);
      expect(await prisma.auditLog.count({ where: { action: "INTEGRITY_VOID_UNDONE", targetId: iq } })).toBe(1);
      await expect(undoVoid(prisma, adminId, iq)).rejects.toThrow(/not voided/);
    }
  });

  it("after a void the candidate's earlier honest result counts again", async () => {
    const c = await kit.addCandidate("retaker");
    await finished(c.profileId, "IQ", 2, 60);
    await new Promise((r) => setTimeout(r, 15));
    const second = await finished(c.profileId, "IQ", 1, 95);
    expect((await currentQuartiles(prisma, c.profileId)).IQ).toBe(1);
    await voidResult(prisma, adminId, second);
    expect((await currentQuartiles(prisma, c.profileId)).IQ).toBe(2);
  });

  it("the recruiter report shows counts only, and a cleared flag reads as no concerns", async () => {
    const c = await kit.addCandidate("report");
    const a = await finished(c.profileId, "IQ", 2);
    await finished(c.profileId, "EQ", 2);
    await exits(c.userId, a, 4);
    await prisma.candidateProfile.update({ where: { id: c.profileId }, data: { minimumSalary: 40_000 } });
    const company = await prisma.company.create({ data: { name: `Integ Co ${kit.run}` } });
    const rec = await prisma.user.create({ data: { email: `integ-rec-${kit.run}@example.test`, name: "Rec", password: "x", role: "RECRUITER", companyId: company.id } });
    try {
      const args = { recruiterUserId: rec.id, companyId: company.id, candidateProfileId: c.profileId, offerMax: 100_000, entitlements: { canSearch: true, canSeeTopPerformers: true } as never };
      let d = await getCandidateDetail(prisma, args);
      expect(d?.integrity).toEqual({ IQ: { line: "Integrity: concern, 4 window exits", level: "concern", exits: 4 }, EQ: { line: "Integrity: no concerns", level: "none", exits: 0 } });
      expect(JSON.stringify(d?.integrity)).not.toContain(a);
      await clearFlag(prisma, adminId, a);
      d = await getCandidateDetail(prisma, args);
      expect(d?.integrity.IQ).toMatchObject({ line: "Integrity: no concerns", level: "none" });
    } finally {
      await prisma.auditLog.deleteMany({ where: { actorId: rec.id } });
      await prisma.user.delete({ where: { id: rec.id } });
      await prisma.company.delete({ where: { id: company.id } });
    }
  });

  it("the admin route: platform admin only, validated, and every decision is audited", async () => {
    const c = await kit.addCandidate("route");
    const sid = await finished(c.profileId, "IQ", 3);
    await exits(c.userId, sid, 3);

    session.user = null;
    expect((await decide(json({ action: "void" }), ctx(sid))).status).toBe(403);
    session.user = { id: c.userId, role: "CANDIDATE" };
    expect((await decide(json({ action: "void" }), ctx(sid))).status).toBe(403);
    session.user = { id: adminId, role: "PLATFORM_ADMIN" };
    expect((await decide(json({ action: "explode" }), ctx(sid))).status).toBe(400);
    expect((await decide(json({ action: "void" }), ctx("missing"))).status).toBe(404);

    expect((await decide(json({ action: "void" }), ctx(sid))).status).toBe(200);
    expect((await decide(json({ action: "void" }), ctx(sid))).status).toBe(409);
    expect((await prisma.score.findUniqueOrThrow({ where: { sessionId: sid } })).voidedAt).not.toBeNull();
    expect((await decide(json({ action: "undo" }), ctx(sid))).status).toBe(200);
    expect((await prisma.score.findUniqueOrThrow({ where: { sessionId: sid } })).voidedAt).toBeNull();
    expect((await decide(json({ action: "clear" }), ctx(sid))).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { actorId: adminId, targetId: sid, action: { in: ["INTEGRITY_RESULT_VOIDED", "INTEGRITY_VOID_UNDONE", "INTEGRITY_FLAG_CLEARED"] } } })).toBe(3);
  });
});

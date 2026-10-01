import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TestType } from "@prisma/client";

const session = vi.hoisted(() => ({ user: null as null | { id: string; role: string; companyId?: string | null } }));
vi.mock("@/auth", () => ({ auth: async () => (session.user ? { user: session.user } : null) }));

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { readSetting } from "@/lib/settings/store";
import { createKit, type Kit } from "@/lib/testEngine/testkit";
import { createCompany, type World } from "./testWorld";
import { POST as aiSearch } from "@/app/api/recruiter/ai-search/route";
import { POST as shortlistAdd } from "@/app/api/recruiter/shortlists/route";
import { PATCH as shortlistPatch, DELETE as shortlistDelete } from "@/app/api/recruiter/shortlists/[id]/route";
import { POST as openingCreate } from "@/app/api/job-openings/route";
import { PATCH as openingPatch, DELETE as openingDelete } from "@/app/api/job-openings/[id]/route";
import { POST as checkout } from "@/app/api/subscription/checkout/route";
import { PATCH as userPatch } from "@/app/api/admin/users/[id]/route";
import { POST as assign } from "@/app/api/admin/companies/[id]/subscription/route";
import { GET as candidateReport } from "@/app/api/recruiter/candidates/[id]/report/route";

const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const call = (method: string, body?: unknown, url = "http://localhost/api") => new Request(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const as = (user: { id: string; role: string; companyId?: string | null } | null) => {
  session.user = user;
};

describe.skipIf(!dbUp)("recruiter, billing and admin routes (real database)", () => {
  let kit: Kit;
  let full: World;
  let small: World;
  let none: World;
  let capped: World; // allows one open job opening, and nothing else has opened one yet
  let empty: World; // every feature, but no job openings (so no default offer)
  let admin: { id: string };
  const worlds: World[] = [];
  const extraUsers: string[] = [];

  beforeAll(async () => {
    kit = await createKit(prisma, "rt5");
    full = await createCompany(prisma, `${kit.run}a`);
    small = await createCompany(prisma, `${kit.run}b`, { features: { allCandidates: true, q1Exclusive: false, aiSearch: false, atsApiAccess: false, maxShortlists: 1, maxJobOpenings: 1 } });
    none = await createCompany(prisma, `${kit.run}c`, { features: null });
    capped = await createCompany(prisma, `${kit.run}d`, { features: { allCandidates: true, maxJobOpenings: 1 } });
    empty = await createCompany(prisma, `${kit.run}e`);
    worlds.push(full, small, none, capped, empty);
    admin = await prisma.user.create({ data: { email: `padmin-${kit.run}@example.test`, name: "Platform", password: await hashPassword("x-pass-12345"), role: "PLATFORM_ADMIN", emailVerified: new Date() } });
    extraUsers.push(admin.id);
  }, 60_000);

  afterAll(async () => {
    for (const w of worlds) await w.cleanup();
    await prisma.auditLog.deleteMany({ where: { actorId: { in: extraUsers } } });
    await prisma.user.deleteMany({ where: { id: { in: extraUsers } } });
    await kit.cleanup();
  }, 60_000);

  const rec = (w: World) => ({ id: w.recruiter.id, role: "RECRUITER", companyId: w.company.id });
  const adm = (w: World) => ({ id: w.admin.id, role: "COMPANY_ADMIN", companyId: w.company.id });
  const opening = (w: World, max = 80_000, status: "OPEN" | "CLOSED" = "OPEN") => prisma.jobOpening.create({ data: { companyId: w.company.id, createdById: w.recruiter.id, jobRoleId: kit.role.id, salaryRangeMin: 1, salaryRangeMax: max, status } });
  async function candidate(name: string, over: { minimum?: number | null; top?: boolean } = {}) {
    const c = await kit.addCandidate(name);
    await prisma.candidateProfile.update({ where: { id: c.profileId }, data: { minimumSalary: over.minimum === undefined ? 50_000 : over.minimum } });
    if (over.top) {
      const rule = await readSetting(prisma, "topPerformer");
      for (const t of rule.countedTests as TestType[]) {
        const s = await prisma.testSession.create({ data: { candidateProfileId: c.profileId, testType: t, status: "COMPLETED", completedAt: new Date() } });
        await prisma.score.create({ data: { candidateProfileId: c.profileId, sessionId: s.id, testType: t, rawScore: 90, quartile: rule.requiredQuartile, percentile: 99, rankValue: 1 } });
      }
    }
    return c;
  }

  describe("AI search", () => {
    it("is for recruiters on a plan with AI search, and rejects empty requests", async () => {
      as(null);
      expect((await aiSearch(call("POST", { query: "accountants" }))).status).toBe(403);
      as(adm(full));
      expect((await aiSearch(call("POST", { query: "accountants" }))).status).toBe(403);
      as(rec(small));
      const blocked = await aiSearch(call("POST", { query: "accountants in Lahore" }));
      expect(blocked.status).toBe(403);
      expect((await blocked.json()).code).toBe("PLAN_FEATURE_REQUIRED");
      as(rec(none));
      expect((await aiSearch(call("POST", { query: "accountants" }))).status).toBe(403);
      as(rec(full));
      expect((await aiSearch(call("POST", { query: "x" }))).status).toBe(400);
    });

    it("tells a recruiter that AI search is unavailable, without setup details, when the AI is not set up", async () => {
      as(rec(full));
      const prev = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = "";
      try {
        const res = await aiSearch(call("POST", { query: "accountants in Lahore" }));
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.code).toBe("UNAVAILABLE");
        expect(JSON.stringify(body)).not.toMatch(/ANTHROPIC|\.env|key/i);
      } finally {
        process.env.ANTHROPIC_API_KEY = prev;
        await prisma.aiRun.deleteMany({ where: { actorId: full.recruiter.id } });
        await prisma.rateLimitHit.deleteMany({ where: { key: `ai-search:${full.recruiter.id}` } });
      }
    });
  });

  describe("shortlist routes", () => {
    it("add, move, note and remove, for the recruiter who owns the entry", async () => {
      const o = await opening(full);
      const c = await candidate("rt-sl");
      as(rec(full));
      expect((await shortlistAdd(call("POST", { candidateProfileId: "" }))).status).toBe(400);
      const added = await shortlistAdd(call("POST", { candidateProfileId: c.profileId, jobOpeningId: o.id }));
      expect(added.status).toBe(201);
      const { id } = await added.json();
      expect((await shortlistAdd(call("POST", { candidateProfileId: c.profileId, jobOpeningId: o.id }))).status).toBe(409);

      expect((await shortlistPatch(call("PATCH", { status: "INTERVIEWING" }), ctx(id))).status).toBe(200);
      expect((await shortlistPatch(call("PATCH", { status: "NOPE" }), ctx(id))).status).toBe(400);
      expect((await shortlistPatch(call("PATCH", {}), ctx(id))).status).toBe(400);
      expect((await shortlistPatch(call("PATCH", { note: "Good fit" }), ctx(id))).status).toBe(200);
      expect(await prisma.shortlist.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "INTERVIEWING", note: "Good fit" });

      as(rec(small)); // someone else's entry
      expect((await shortlistPatch(call("PATCH", { status: "HIRED" }), ctx(id))).status).toBe(404);
      expect((await shortlistDelete(call("DELETE"), ctx(id))).status).toBe(404);
      as(adm(full)); // the company admin can manage any entry in the company
      expect((await shortlistDelete(call("DELETE"), ctx(id))).status).toBe(200);
      expect(await prisma.shortlist.count({ where: { id } })).toBe(0);
    });

    it("refuses signed-out callers, company admins (they do not shortlist) and plan limits", async () => {
      const o = await opening(small);
      const [a, b] = [await candidate("rt-lim1"), await candidate("rt-lim2")];
      as(null);
      expect((await shortlistAdd(call("POST", { candidateProfileId: a.profileId, jobOpeningId: o.id }))).status).toBe(403);
      as(adm(small));
      expect((await shortlistAdd(call("POST", { candidateProfileId: a.profileId, jobOpeningId: o.id }))).status).toBe(403);
      as(rec(small));
      expect((await shortlistAdd(call("POST", { candidateProfileId: a.profileId, jobOpeningId: o.id }))).status).toBe(201);
      const over = await shortlistAdd(call("POST", { candidateProfileId: b.profileId, jobOpeningId: o.id }));
      expect(over.status).toBe(403);
      expect((await over.json()).code).toBe("LIMIT_REACHED");
    });
  });

  describe("job opening routes", () => {
    const body = (over: Record<string, unknown> = {}) => ({ jobRoleId: kit.role.id, salaryRangeMin: 40_000, salaryRangeMax: 90_000, ...over });

    it("create, edit and delete; the plan limit applies; others are turned away", async () => {
      as(null);
      expect((await openingCreate(call("POST", body()))).status).toBe(403);
      as({ id: kit.run, role: "CANDIDATE" });
      expect((await openingCreate(call("POST", body()))).status).toBe(403);

      as(rec(capped)); // plan allows 1 open opening
      expect((await openingCreate(call("POST", { jobRoleId: "" }))).status).toBe(400);
      expect((await openingCreate(call("POST", body({ salaryRangeMax: 1 })))).status).toBe(400);
      const ok = await openingCreate(call("POST", body({ title: "Route test" })));
      expect(ok.status).toBe(201);
      const { id } = await ok.json();
      const limit = await openingCreate(call("POST", body()));
      expect(limit.status).toBe(403);
      expect((await limit.json()).code).toBe("LIMIT_REACHED");

      expect((await openingPatch(call("PATCH", body({ title: "Renamed", status: "PAUSED" })), ctx(id))).status).toBe(200);
      expect(await prisma.jobOpening.findUniqueOrThrow({ where: { id } })).toMatchObject({ title: "Renamed", status: "PAUSED" });
      expect((await openingCreate(call("POST", body()))).status).toBe(201); // the paused one freed the place

      as(rec(full));
      expect((await openingPatch(call("PATCH", body()), ctx(id))).status).toBe(404); // another company
      expect((await openingDelete(call("DELETE"), ctx(id))).status).toBe(404);
      as(rec(capped));
      expect((await openingDelete(call("DELETE"), ctx(id))).status).toBe(200);
    });
  });

  describe("plan checkout", () => {
    let target: string;
    beforeAll(async () => {
      target = (await full.addPlan("target", { allCandidates: true }, 5_000)).code;
    });

    it("is for company admins with a confirmed email, and answers clearly", async () => {
      as(rec(full));
      expect((await checkout(call("POST", { planCode: target }))).status).toBe(403);
      as(null);
      expect((await checkout(call("POST", { planCode: target }))).status).toBe(403);

      const unverified = await full.addUser("unverified", "COMPANY_ADMIN", false);
      as({ id: unverified.id, role: "COMPANY_ADMIN", companyId: full.company.id });
      const blocked = await checkout(call("POST", { planCode: target }));
      expect(blocked.status).toBe(403);
      expect((await blocked.json()).code).toBe("EMAIL_NOT_VERIFIED");

      as(adm(full));
      expect((await checkout(call("POST", {}))).status).toBe(400);
      expect((await checkout(call("POST", { planCode: "no-such-plan" }))).status).toBe(404);
    });

    it("a failed payment answers 402 and keeps the plan; a successful one changes it", async () => {
      as(adm(full));
      const before = (await prisma.subscription.findFirstOrThrow({ where: { companyId: full.company.id, status: "ACTIVE" } })).planId;
      const failed = await checkout(call("POST", { planCode: target, simulate: "failure" }));
      expect(failed.status).toBe(402);
      expect((await failed.json()).code).toBe("PAYMENT_FAILED");
      expect((await prisma.subscription.findFirstOrThrow({ where: { companyId: full.company.id, status: "ACTIVE" } })).planId).toBe(before);

      const ok = await checkout(call("POST", { planCode: target, simulate: "success" }));
      expect(ok.status).toBe(201);
      const { kind } = await ok.json();
      expect(["upgrade", "downgrade"]).toContain(kind);
      const active = await prisma.subscription.findFirstOrThrow({ where: { companyId: full.company.id, status: "ACTIVE" }, include: { plan: true } });
      expect(active.plan.code).toBe(target);
    });
  });

  describe("admin: users and company plans", () => {
    it("only a platform admin can use them", async () => {
      for (const u of [null, rec(full), adm(full), { id: "c", role: "CANDIDATE" }]) {
        as(u);
        expect((await userPatch(call("PATCH", { isActive: false }), ctx(full.recruiter.id))).status).toBe(403);
        expect((await assign(call("POST", { planCode: "x", days: 5 }), ctx(full.company.id))).status).toBe(403);
      }
    });

    it("switches a user off and on, asks for a new password, and protects the admin themselves", async () => {
      as({ id: admin.id, role: "PLATFORM_ADMIN" });
      const target = full.recruiter.id;
      expect((await userPatch(call("PATCH", {}), ctx(target))).status).toBe(400);
      expect((await userPatch(call("PATCH", { isActive: false }), ctx("missing"))).status).toBe(404);
      expect((await userPatch(call("PATCH", { isActive: false }), ctx(target))).status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: target } })).isActive).toBe(false);
      expect((await userPatch(call("PATCH", { isActive: true }), ctx(target))).status).toBe(200);
      expect((await userPatch(call("PATCH", { mustChangePassword: true }), ctx(target))).status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: target } })).mustChangePassword).toBe(true);
      expect(await prisma.auditLog.count({ where: { actorId: admin.id, targetId: target } })).toBe(3);

      const self = await userPatch(call("PATCH", { isActive: false }), ctx(admin.id));
      expect(self.status).toBe(409);
      expect((await self.json()).code).toBe("SELF");
      expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).isActive).toBe(true);
    });

    it("will not touch a deleted candidate account", async () => {
      const c = await kit.addCandidate("gone");
      await prisma.candidateProfile.update({ where: { id: c.profileId }, data: { anonymisedAt: new Date() } });
      as({ id: admin.id, role: "PLATFORM_ADMIN" });
      const res = await userPatch(call("PATCH", { isActive: true }), ctx(c.userId));
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe("ANONYMISED");
    });

    it("gives a company a plan for a number of days, with validation", async () => {
      as({ id: admin.id, role: "PLATFORM_ADMIN" });
      const plan = await full.addPlan("gift", { allCandidates: true }, 100);
      expect((await assign(call("POST", { planCode: plan.code, days: 0 }), ctx(none.company.id))).status).toBe(400);
      expect((await assign(call("POST", { planCode: "nope", days: 5 }), ctx(none.company.id))).status).toBe(404);
      expect((await assign(call("POST", { planCode: plan.code, days: 10 }), ctx("missing"))).status).toBe(404);
      expect((await assign(call("POST", { planCode: plan.code, days: 10 }), ctx(none.company.id))).status).toBe(201);
      const sub = await prisma.subscription.findFirstOrThrow({ where: { companyId: none.company.id, status: "ACTIVE" } });
      expect(sub.planId).toBe(plan.id);
      await prisma.subscription.deleteMany({ where: { companyId: none.company.id } });
    });
  });

  describe("the candidate PDF report", () => {
    const url = (id: string, query = "") => ({ request: call("GET", undefined, `http://localhost/api/recruiter/candidates/${id}/report${query}`), id });

    it("is a real PDF for a candidate whose minimum fits the offer, and the view is audited", async () => {
      const c = await candidate("rt-pdf");
      await prisma.testSession.create({ data: { candidateProfileId: c.profileId, testType: "IQ", status: "COMPLETED", completedAt: new Date() } }).then((s) => prisma.score.create({ data: { candidateProfileId: c.profileId, sessionId: s.id, testType: "IQ", rawScore: 70, quartile: 2, percentile: 66, rankValue: 0.4, cohortScope: "ALL", cohortSize: 50 } }));
      as(rec(full));
      const { request, id } = url(c.profileId, "?offer=90000");
      const res = await candidateReport(request, ctx(id));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
      expect(await prisma.auditLog.count({ where: { actorId: full.recruiter.id, action: "CANDIDATE_PROFILE_VIEWED", targetId: c.profileId } })).toBe(1);
    });

    it("refuses a candidate whose minimum is above the offer, a missing offer, and Top Performers on a plan without Q1 access, leaving no audit entry", async () => {
      const high = await candidate("rt-pdf-high", { minimum: 150_000 });
      as(rec(full));
      let r = url(high.profileId, "?offer=90000");
      expect((await candidateReport(r.request, ctx(r.id))).status).toBe(404);
      as(rec(empty));
      r = url(high.profileId);
      const noOffer = await candidateReport(r.request, ctx(r.id)); // no open opening, no offer
      expect((await noOffer.json()).code).toBe("NO_OFFER");

      const star = await candidate("rt-pdf-star", { top: true });
      as(rec(small));
      r = url(star.profileId, "?offer=90000");
      expect((await candidateReport(r.request, ctx(r.id))).status).toBe(404);
      expect(await prisma.auditLog.count({ where: { action: "CANDIDATE_PROFILE_VIEWED", targetId: { in: [high.profileId, star.profileId] } } })).toBe(0);
      as(rec(empty)); // a plan with exclusive Q1 access (the "full" company switched plan in the checkout tests above)
      expect((await candidateReport(r.request, ctx(r.id))).status).toBe(200);
    });

    it("is for recruiters on a plan with candidate access only", async () => {
      const c = await candidate("rt-pdf-roles");
      const r = url(c.profileId, "?offer=90000");
      for (const u of [null, adm(full), { id: "x", role: "CANDIDATE" }]) {
        as(u);
        expect((await candidateReport(r.request, ctx(r.id))).status).toBe(403);
      }
      as(rec(none));
      expect((await candidateReport(r.request, ctx(r.id))).status).toBe(404);
    });
  });
});

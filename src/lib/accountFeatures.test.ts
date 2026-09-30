import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { Plan, PrismaClient } from "@prisma/client";

const session = vi.hoisted(() => ({ user: null as null | { id: string; role: string } }));
vi.mock("@/auth", () => ({ auth: async () => (session.user ? { user: session.user } : null) }));

const sendMail = vi.hoisted(() => vi.fn());
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }));

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { sendEmail } from "@/lib/mail";
import { describeAccess } from "@/lib/companyPlan";
import { newCompanySubscription } from "@/lib/trial";
import { anonymiseCandidate } from "@/lib/accountDeletion";
import { changedProfileFields, profileUpdateSchema } from "@/lib/profile";
import { DEFAULT_SETTINGS } from "@/lib/settings/definitions";
import { PATCH as patchProfile } from "@/app/api/account/profile/route";
import { DELETE as deleteAccount } from "@/app/api/account/route";

afterEach(() => vi.unstubAllEnvs());

describe("sendEmail", () => {
  it("writes the whole message, link included, to the console when SMTP is not set", async () => {
    vi.stubEnv("SMTP_HOST", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const result = await sendEmail({ to: "a@example.test", subject: "Hello", text: "Open https://example.test/reset?token=abc" });
    expect(result).toEqual({ delivered: false });
    expect(log.mock.calls[0][0]).toContain("https://example.test/reset?token=abc");
    expect(sendMail).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("sends through SMTP when it is configured", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    vi.stubEnv("SMTP_FROM", "Workforce Pro <no-reply@example.test>");
    sendMail.mockResolvedValueOnce({});
    const result = await sendEmail({ to: "a@example.test", subject: "Hello", text: "Body" });
    expect(result).toEqual({ delivered: true });
    expect(sendMail).toHaveBeenCalledWith({ from: "Workforce Pro <no-reply@example.test>", to: "a@example.test", subject: "Hello", text: "Body" });
  });

  it("never throws, and never logs the message body or password, when sending fails", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    vi.stubEnv("SMTP_PASSWORD", "super-secret-smtp-password");
    sendMail.mockRejectedValueOnce(new Error("connection refused"));
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await sendEmail({ to: "a@example.test", subject: "Reset", text: "Secret link https://example.test/?token=zzz" });
    expect(result).toEqual({ delivered: false });
    const logged = err.mock.calls.map((c) => String(c[0])).join(" ");
    expect(logged).toContain("connection refused");
    expect(logged).not.toContain("token=zzz");
    expect(logged).not.toContain("super-secret-smtp-password");
    err.mockRestore();
  });
});

describe("company plan and free trial", () => {
  const plan = { id: "p1", name: "Basic", code: "basic" } as Plan;
  const now = new Date("2026-10-01T12:00:00Z");
  const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

  it("describes a trial, a paid plan, an ended plan and no plan", () => {
    expect(describeAccess({ status: "TRIALING", endDate: days(5), plan }, now)).toMatchObject({ state: "trial", daysLeft: 5, plan });
    expect(describeAccess({ status: "ACTIVE", endDate: days(20), plan }, now)).toMatchObject({ state: "active", daysLeft: 20 });
    expect(describeAccess({ status: "ACTIVE", endDate: null, plan }, now)).toMatchObject({ state: "active", daysLeft: null });
    expect(describeAccess(null, now)).toMatchObject({ state: "none", plan: null });
  });

  it("gives no access once the end date has passed", () => {
    const ended = describeAccess({ status: "TRIALING", endDate: days(-1), plan }, now);
    expect(ended).toMatchObject({ state: "ended", plan: null, daysLeft: 0 });
    expect(describeAccess({ status: "ACTIVE", endDate: now, plan }, now).plan).toBeNull();
  });

  it("rounds a part day up, so the last day still shows 1", () => {
    const partial = new Date(now.getTime() + 3 * 3_600_000);
    expect(describeAccess({ status: "TRIALING", endDate: partial, plan }, now).daysLeft).toBe(1);
  });

  const fakeDb = (accounts: Record<string, unknown> | null, found: Partial<Plan> | null) =>
    ({
      siteSetting: { findUnique: vi.fn().mockResolvedValue(accounts ? { value: accounts } : null) },
      plan: { findUnique: vi.fn().mockResolvedValue(found) },
    }) as unknown as Pick<PrismaClient, "siteSetting" | "plan">;

  it("starts a new company on the plan and trial length from Settings", async () => {
    const db = fakeDb({ defaultPlanCode: "advanced", trialDays: 30 }, { id: "adv", code: "advanced", isActive: true });
    const sub = await newCompanySubscription(db, now);
    expect(sub).toMatchObject({ planId: "adv", status: "TRIALING", startDate: now, autoRenew: false });
    expect(sub!.endDate).toEqual(days(30));
    expect((db.plan.findUnique as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({ where: { code: "advanced" } });
  });

  it("uses the starting values when nothing is saved (14-day trial of the default plan)", async () => {
    const sub = await newCompanySubscription(fakeDb(null, { id: "b", code: "basic", isActive: true }), now);
    expect(sub!.endDate).toEqual(days(DEFAULT_SETTINGS.accounts.trialDays));
  });

  it("gives no subscription when trial days is 0, no plan is chosen, or the plan is off or missing", async () => {
    expect(await newCompanySubscription(fakeDb({ trialDays: 0 }, { id: "b", isActive: true }), now)).toBeNull();
    expect(await newCompanySubscription(fakeDb({ defaultPlanCode: "" }, { id: "b", isActive: true }), now)).toBeNull();
    expect(await newCompanySubscription(fakeDb({ defaultPlanCode: "basic" }, { id: "b", isActive: false }), now)).toBeNull();
    expect(await newCompanySubscription(fakeDb({ defaultPlanCode: "gone" }, null), now)).toBeNull();
  });
});

describe("candidate profile", () => {
  it("lists only the names of changed fields", () => {
    const before = { name: "A", phone: "0300", city: "Lahore", regionId: "r1", experienceYears: 2, jobRoleId: "j1", minimumSalary: 50000 };
    expect(changedProfileFields(before, before)).toEqual([]);
    expect(changedProfileFields(before, { ...before, phone: "0311", minimumSalary: 70000 })).toEqual(["phone", "minimum salary"]);
  });

  it("uses the same rules as signup", () => {
    const ok = { name: "Ayesha Khan", phone: "03001234567", cityId: "c", regionId: "r", experienceYears: 3, jobRoleId: "j", minimumSalary: 60000 };
    expect(profileUpdateSchema.safeParse(ok).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ ...ok, name: "A" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ ...ok, experienceYears: -1 }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ ...ok, minimumSalary: -5 }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ ...ok, cityId: "" }).success).toBe(false);
  });
});

// ---------- real database ----------
const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const run = `t${Date.now()}${Math.floor(Math.random() * 1e6)}`;

// An anonymised account no longer has the test email, so remember every id we create for cleanup.
const madeUserIds: string[] = [];

async function makeCandidate(tag: string, extra: { verified?: boolean } = {}) {
  const [region, city, role] = await Promise.all([
    prisma.region.findFirstOrThrow({ where: { name: "Punjab" } }),
    prisma.city.findFirstOrThrow({ where: { name: "Lahore" } }),
    prisma.jobRole.findFirstOrThrow({ where: { name: "Sales" } }),
  ]);
  const user = await prisma.user.create({
    data: {
      email: `${tag}-${run}@example.test`,
      name: "Test Candidate",
      password: await hashPassword("my-password-1"),
      role: "CANDIDATE",
      emailVerified: extra.verified === false ? null : new Date(),
      candidateProfile: {
        create: {
          phone: "03001234567",
          city: city.name,
          regionId: region.id,
          jobRoleId: role.id,
          experienceYears: 4,
          minimumSalary: 65000,
          consentGiven: true,
          consentAt: new Date(),
          privacyPolicyVersion: "1.0",
        },
      },
    },
    include: { candidateProfile: true },
  });
  madeUserIds.push(user.id);
  return { user, profile: user.candidateProfile!, region, city, role };
}

describe.skipIf(!dbUp)("account routes and deletion (real database)", () => {
  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { OR: [{ email: { contains: run } }, { id: { in: madeUserIds } }] }, include: { candidateProfile: true } });
    const profileIds = users.flatMap((u) => (u.candidateProfile ? [u.candidateProfile.id] : []));
    const sessions = await prisma.testSession.findMany({ where: { candidateProfileId: { in: profileIds } }, select: { id: true } });
    const sessionIds = sessions.map((s) => s.id);
    await prisma.writingAssessment.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.response.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.score.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.testSession.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.aIFeedback.deleteMany({ where: { candidateProfileId: { in: profileIds } } });
    await prisma.badge.deleteMany({ where: { candidateProfileId: { in: profileIds } } });
    await prisma.atsExport.deleteMany({ where: { candidateProfileId: { in: profileIds } } });
    const ids = users.map((u) => u.id);
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.rateLimitHit.deleteMany({ where: { OR: [{ key: { contains: run } }, { key: { in: ids.map((i) => `delete-account:${i}`) } }] } });
  });

  const call = (handler: (r: Request) => Promise<Response>, method: string, body: unknown) =>
    handler(new Request("http://localhost/api/account", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

  describe("PATCH /api/account/profile", () => {
    it("updates the profile and audit-logs only the names of the changed fields", async () => {
      const { user, profile, region, city, role } = await makeCandidate("prof1");
      session.user = { id: user.id, role: "CANDIDATE" };
      const res = await call(patchProfile, "PATCH", {
        name: "New Name",
        phone: "03119998888",
        cityId: city.id,
        regionId: region.id,
        experienceYears: 6,
        jobRoleId: role.id,
        minimumSalary: 90000,
      });
      expect(res.status).toBe(200);
      expect((await res.json()).changed).toEqual(["name", "phone", "experience", "minimum salary"]);

      const after = await prisma.candidateProfile.findUniqueOrThrow({ where: { id: profile.id }, include: { user: true } });
      expect(after).toMatchObject({ phone: "03119998888", experienceYears: 6, minimumSalary: 90000, city: "Lahore" });
      expect(after.user.name).toBe("New Name");

      const log = await prisma.auditLog.findFirstOrThrow({ where: { actorId: user.id, action: "CANDIDATE_PROFILE_UPDATED" } });
      expect(log.targetId).toBe(profile.id);
      expect(log.metadata).toEqual({ fields: ["name", "phone", "experience", "minimum salary"] });
      const logged = JSON.stringify(log);
      expect(logged).not.toContain("03119998888");
      expect(logged).not.toContain("90000");
    });

    it("writes no audit row when nothing changed", async () => {
      const { user, region, city, role } = await makeCandidate("prof2");
      session.user = { id: user.id, role: "CANDIDATE" };
      const res = await call(patchProfile, "PATCH", { name: "Test Candidate", phone: "03001234567", cityId: city.id, regionId: region.id, experienceYears: 4, jobRoleId: role.id, minimumSalary: 65000 });
      expect((await res.json()).changed).toEqual([]);
      expect(await prisma.auditLog.count({ where: { actorId: user.id, action: "CANDIDATE_PROFILE_UPDATED" } })).toBe(0);
    });

    it("rejects a city from another region, unknown ids, bad numbers, and non-candidates", async () => {
      const { user, region, city, role } = await makeCandidate("prof3");
      const sindh = await prisma.region.findFirstOrThrow({ where: { name: "Sindh" } });
      session.user = { id: user.id, role: "CANDIDATE" };
      const base = { name: "Test Candidate", phone: "03001234567", cityId: city.id, regionId: region.id, experienceYears: 4, jobRoleId: role.id, minimumSalary: 65000 };

      expect((await call(patchProfile, "PATCH", { ...base, regionId: sindh.id })).status).toBe(400); // Lahore is not in Sindh
      expect((await call(patchProfile, "PATCH", { ...base, jobRoleId: "nope" })).status).toBe(400);
      expect((await call(patchProfile, "PATCH", { ...base, cityId: "nope" })).status).toBe(400);
      expect((await call(patchProfile, "PATCH", { ...base, minimumSalary: -1 })).status).toBe(400);

      session.user = { id: user.id, role: "RECRUITER" };
      expect((await call(patchProfile, "PATCH", base)).status).toBe(403);
      session.user = null;
      expect((await call(patchProfile, "PATCH", base)).status).toBe(403);
    });
  });

  describe("anonymiseCandidate and DELETE /api/account", () => {
    it("erases personal data but keeps test statistics, region, role and the audit event", async () => {
      const { user, profile } = await makeCandidate("del1");
      const question = await prisma.question.findFirstOrThrow();
      const testSession = await prisma.testSession.create({
        data: { candidateProfileId: profile.id, testType: "IQ", status: "COMPLETED", theta: 0.4, standardError: 0.3, itemsAdministered: 12, completedAt: new Date() },
      });
      await prisma.response.create({ data: { sessionId: testSession.id, questionId: question.id, answerGiven: { key: "B" }, isCorrect: true } });
      await prisma.score.create({ data: { candidateProfileId: profile.id, sessionId: testSession.id, testType: "IQ", rawScore: 0.4, percentile: 71, quartile: 2 } });
      await prisma.writingAssessment.create({ data: { sessionId: testSession.id, essayText: "My private essay about myself.", cefrLevel: "B2", feedback: "Good use of tenses." } });
      await prisma.aIFeedback.create({ data: { candidateProfileId: profile.id, testType: "IQ", feedbackText: "You are strong at numbers." } });
      await prisma.badge.create({ data: { candidateProfileId: profile.id, type: "TOP_PERFORMER_ALL_TESTS" } });
      await prisma.atsExport.create({ data: { candidateProfileId: profile.id, companyId: "c", payload: { name: "Test Candidate" } } });
      await prisma.notification.create({ data: { userId: user.id, type: "GENERAL", title: "t", message: "m" } });

      expect(await anonymiseCandidate(prisma, user.id)).toBe(true);

      const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(u).toMatchObject({ name: null, isActive: false, emailVerified: null });
      expect(u.email).toBe(`deleted-${user.id}@deleted.invalid`);
      expect(u.email).not.toContain(run);
      expect(await verifyAgainst("my-password-1", u.password)).toBe(false);

      const p = await prisma.candidateProfile.findUniqueOrThrow({ where: { id: profile.id } });
      expect(p).toMatchObject({ phone: null, city: null, minimumSalary: null, experienceYears: 4 });
      expect(p.anonymisedAt).not.toBeNull();
      expect(p.regionId).toBe(profile.regionId);
      expect(p.jobRoleId).toBe(profile.jobRoleId);

      // Test statistics stay.
      expect(await prisma.testSession.count({ where: { id: testSession.id } })).toBe(1);
      expect(await prisma.response.count({ where: { sessionId: testSession.id } })).toBe(1);
      expect(await prisma.score.findUniqueOrThrow({ where: { sessionId: testSession.id } })).toMatchObject({ rawScore: 0.4, quartile: 2 });
      const essay = await prisma.writingAssessment.findUniqueOrThrow({ where: { sessionId: testSession.id } });
      expect(essay).toMatchObject({ essayText: "[removed]", feedback: null, cefrLevel: "B2" });

      // Personal extras are gone.
      expect(await prisma.aIFeedback.count({ where: { candidateProfileId: profile.id } })).toBe(0);
      expect(await prisma.badge.count({ where: { candidateProfileId: profile.id } })).toBe(0);
      expect(await prisma.atsExport.count({ where: { candidateProfileId: profile.id } })).toBe(0);
      expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(0);

      const event = await prisma.auditLog.findFirstOrThrow({ where: { actorId: user.id, action: "CANDIDATE_ACCOUNT_DELETED" } });
      expect(event.targetId).toBe(user.id);

      // Doing it twice is a no-op.
      expect(await anonymiseCandidate(prisma, user.id)).toBe(false);
    });

    it("frees the original email address for a new signup", async () => {
      const { user } = await makeCandidate("del2");
      const original = user.email;
      await anonymiseCandidate(prisma, user.id);
      expect(await prisma.user.count({ where: { email: original } })).toBe(0);
    });

    it("does not anonymise anyone who is not a candidate", async () => {
      const recruiter = await prisma.user.create({ data: { email: `rec-${run}@example.test`, password: "x", role: "RECRUITER" } });
      expect(await anonymiseCandidate(prisma, recruiter.id)).toBe(false);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: recruiter.id } })).isActive).toBe(true);
    });

    it("the route needs the password and the word DELETE, and only candidates can use it", async () => {
      const { user } = await makeCandidate("del3");
      session.user = { id: user.id, role: "CANDIDATE" };

      expect((await call(deleteAccount, "DELETE", { password: "my-password-1", confirm: "delete" })).status).toBe(400);
      expect((await call(deleteAccount, "DELETE", { password: "my-password-1" })).status).toBe(400);
      const wrong = await call(deleteAccount, "DELETE", { password: "not-my-password", confirm: "DELETE" });
      expect(wrong.status).toBe(400);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isActive).toBe(true);

      session.user = { id: user.id, role: "RECRUITER" };
      expect((await call(deleteAccount, "DELETE", { password: "my-password-1", confirm: "DELETE" })).status).toBe(403);
      session.user = null;
      expect((await call(deleteAccount, "DELETE", { password: "my-password-1", confirm: "DELETE" })).status).toBe(403);

      session.user = { id: user.id, role: "CANDIDATE" };
      const ok = await call(deleteAccount, "DELETE", { password: "my-password-1", confirm: "DELETE" });
      expect(ok.status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isActive).toBe(false);
    });

    it("limits password guesses on the delete route", async () => {
      const { user } = await makeCandidate("del4");
      session.user = { id: user.id, role: "CANDIDATE" };
      const codes: number[] = [];
      for (let i = 0; i < 6; i++) codes.push((await call(deleteAccount, "DELETE", { password: "wrong", confirm: "DELETE" })).status);
      expect(codes.slice(0, 5).every((c) => c === 400)).toBe(true);
      expect(codes[5]).toBe(429);
    });
  });
});

async function verifyAgainst(password: string, hash: string) {
  const { verifyPassword } = await import("@/lib/password");
  return verifyPassword(password, hash);
}

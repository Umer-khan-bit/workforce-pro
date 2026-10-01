import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | { id: string; role: string; companyId?: string | null } }));
vi.mock("@/auth", () => ({ auth: async () => (session.user ? { user: session.user } : null) }));

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { createKit, type Kit } from "@/lib/testEngine/testkit";
import { meetsOffer, recruiterVisibleWhere, RECRUITER_CANDIDATE_SELECT, viewCandidateAsRecruiter } from "./candidateAccess";
import { ContactError, createContactRequest, respondToContactRequest } from "./contactRequests";
import { POST as contactRoute } from "@/app/api/recruiter/contact-requests/route";
import { POST as respondRoute } from "@/app/api/candidate/contact-requests/[id]/route";

describe("meetsOffer (the minimum-salary rule)", () => {
  it("fits when the minimum is at or below the offer", () => {
    expect(meetsOffer(50_000, 80_000)).toBe(true);
    expect(meetsOffer(80_000, 80_000)).toBe(true);
    expect(meetsOffer(80_001, 80_000)).toBe(false);
  });
  it("treats no stated minimum as fitting any offer", () => {
    expect(meetsOffer(null, 1)).toBe(true);
    expect(meetsOffer(undefined, 1)).toBe(true);
  });
  it("keeps minimum salary and contact details out of what a recruiter can read", () => {
    const keys = Object.keys(RECRUITER_CANDIDATE_SELECT);
    expect(keys).not.toContain("minimumSalary");
    expect(keys).not.toContain("phone");
    expect(JSON.stringify(RECRUITER_CANDIDATE_SELECT)).not.toMatch(/email|minimumSalary|phone/);
  });
});

const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
const post = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe.skipIf(!dbUp)("who a recruiter can see and contact (real database)", () => {
  let kit: Kit;
  let companyId: string;
  let otherCompanyId: string;
  let recruiterId: string;
  let outsiderId: string;
  let openingId: string; // offer: up to 80,000
  let closedOpeningId: string;
  let foreignOpeningId: string;
  const emails: string[] = [];

  beforeAll(async () => {
    kit = await createKit(prisma, "acc");
    const company = await prisma.company.create({ data: { name: `Access Co ${kit.run}` } });
    const other = await prisma.company.create({ data: { name: `Other Co ${kit.run}` } });
    companyId = company.id;
    otherCompanyId = other.id;
    const mk = async (name: string, role: "RECRUITER" | "COMPANY_ADMIN", cid: string, verified = true) => {
      const email = `${name}-${kit.run}@example.test`;
      emails.push(email);
      return prisma.user.create({ data: { email, name: `${name} ${kit.run}`, password: await hashPassword("x-pass-12345"), role, companyId: cid, emailVerified: verified ? new Date() : null } });
    };
    recruiterId = (await mk("recruiter", "RECRUITER", companyId)).id;
    outsiderId = (await mk("outsider", "RECRUITER", otherCompanyId)).id;
    const opening = (status: "OPEN" | "CLOSED", cid: string, createdById: string) =>
      prisma.jobOpening.create({ data: { companyId: cid, jobRoleId: kit.role.id, city: "Lahore", salaryRangeMin: 50_000, salaryRangeMax: 80_000, status, createdById } });
    openingId = (await opening("OPEN", companyId, recruiterId)).id;
    closedOpeningId = (await opening("CLOSED", companyId, recruiterId)).id;
    foreignOpeningId = (await opening("OPEN", otherCompanyId, outsiderId)).id;
  }, 60_000);

  afterAll(async () => {
    await prisma.contactRequest.deleteMany({ where: { jobOpening: { companyId: { in: [companyId, otherCompanyId] } } } });
    await prisma.jobOpening.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } }); // before the kit: openings point at its job role
    await kit.cleanup();
    const users = await prisma.user.findMany({ where: { companyId: { in: [companyId, otherCompanyId] } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.rateLimitHit.deleteMany({ where: { key: { in: ids.map((i) => `contact:${i}`) } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  }, 60_000);

  async function candidate(name: string, minimumSalary: number | null, over: { consent?: boolean; anonymised?: boolean; active?: boolean } = {}) {
    const c = await kit.addCandidate(name);
    await prisma.candidateProfile.update({
      where: { id: c.profileId },
      data: { minimumSalary, consentGiven: over.consent ?? true, anonymisedAt: over.anonymised ? new Date() : null },
    });
    if (over.active === false) await prisma.user.update({ where: { id: c.userId }, data: { isActive: false } });
    return c;
  }
  const visibleIds = async (offer: number, ids: string[]) =>
    (await prisma.candidateProfile.findMany({ where: { AND: [{ id: { in: ids } }, recruiterVisibleWhere(offer)] }, select: { id: true } })).map((p) => p.id);

  describe("the shared visibility filter", () => {
    it("shows only candidates whose minimum fits the offer, plus those with no minimum", async () => {
      const low = await candidate("vlow", 40_000);
      const exact = await candidate("vexact", 80_000);
      const high = await candidate("vhigh", 120_000);
      const none = await candidate("vnone", null);
      const ids = [low, exact, high, none].map((c) => c.profileId);
      const visible = await visibleIds(80_000, ids);
      expect(visible.sort()).toEqual([low.profileId, exact.profileId, none.profileId].sort());
      expect(await visibleIds(30_000, ids)).toEqual([none.profileId]); // a smaller offer
      expect((await visibleIds(500_000, ids)).sort()).toEqual(ids.sort()); // a bigger offer
    });

    it("never shows deleted accounts, people who have not consented, or inactive users", async () => {
      const gone = await candidate("vgone", null, { anonymised: true });
      const noConsent = await candidate("vnoconsent", null, { consent: false });
      const inactive = await candidate("vinactive", null, { active: false });
      const fine = await candidate("vfine", null);
      expect(await visibleIds(1_000_000, [gone, noConsent, inactive, fine].map((c) => c.profileId))).toEqual([fine.profileId]);
    });
  });

  describe("viewing one candidate", () => {
    it("returns the limited recruiter view and writes the view to the audit log", async () => {
      const c = await candidate("view", 60_000);
      const seen = await viewCandidateAsRecruiter(prisma, { recruiterUserId: recruiterId, companyId, candidateProfileId: c.profileId, offerMax: 80_000 });
      expect(seen?.id).toBe(c.profileId);
      expect(seen).not.toHaveProperty("minimumSalary");
      expect(seen).not.toHaveProperty("phone");
      expect(JSON.stringify(seen)).not.toContain(c.email);
      const log = await prisma.auditLog.findFirst({ where: { actorId: recruiterId, action: "CANDIDATE_PROFILE_VIEWED", targetId: c.profileId } });
      expect(log?.metadata).toMatchObject({ companyId });
    });

    it("returns nothing, and logs nothing, when the offer is below the candidate's minimum", async () => {
      const c = await candidate("viewhigh", 150_000);
      expect(await viewCandidateAsRecruiter(prisma, { recruiterUserId: recruiterId, companyId, candidateProfileId: c.profileId, offerMax: 80_000 })).toBeNull();
      expect(await prisma.auditLog.count({ where: { actorId: recruiterId, action: "CANDIDATE_PROFILE_VIEWED", targetId: c.profileId } })).toBe(0);
    });
  });

  describe("contacting a candidate", () => {
    it("is refused when the job opening's offer is below the candidate's minimum", async () => {
      const c = await candidate("toohigh", 90_000); // offer is up to 80,000
      await expect(createContactRequest(prisma, { recruiterUserId: recruiterId, candidateProfileId: c.profileId, jobOpeningId: openingId })).rejects.toMatchObject({ status: 404, code: "CANDIDATE_NOT_AVAILABLE" });
      expect(await prisma.contactRequest.count({ where: { candidateProfileId: c.profileId } })).toBe(0);
      expect(await prisma.notification.count({ where: { userId: c.userId } })).toBe(0);
    });

    it("gives the same answer for a candidate who does not exist, so a minimum cannot be probed", async () => {
      const high = await candidate("probehigh", 90_000);
      const a = await createContactRequest(prisma, { recruiterUserId: recruiterId, candidateProfileId: high.profileId, jobOpeningId: openingId }).catch((e) => e);
      const b = await createContactRequest(prisma, { recruiterUserId: recruiterId, candidateProfileId: "does-not-exist", jobOpeningId: openingId }).catch((e) => e);
      expect(a).toBeInstanceOf(ContactError);
      expect([a.status, a.code, a.message]).toEqual([b.status, b.code, b.message]);
    });

    it("works when the offer meets the minimum: saves the request and tells the candidate (in the app and by email)", async () => {
      const c = await candidate("fits", 80_000);
      const req = await createContactRequest(prisma, { recruiterUserId: recruiterId, candidateProfileId: c.profileId, jobOpeningId: openingId, message: "  We would love to talk.  " });
      expect(req).toMatchObject({ status: "SENT", message: "We would love to talk." });
      const notes = await prisma.notification.findMany({ where: { userId: c.userId } });
      expect(notes.find((n) => n.channel === "IN_APP")).toMatchObject({ type: "CONTACT_REQUEST", link: "/candidate/contact-requests" });
      expect(notes.find((n) => n.channel === "IN_APP")?.message).toContain(`recruiter ${kit.run}`);
      expect(notes.some((n) => n.channel === "EMAIL")).toBe(true);
      expect(await prisma.auditLog.count({ where: { actorId: recruiterId, action: "CONTACT_REQUEST_SENT", targetId: c.profileId } })).toBe(1);
    });

    it("does not send a second request for the same opening", async () => {
      const c = await candidate("twice", null);
      await createContactRequest(prisma, { recruiterUserId: recruiterId, candidateProfileId: c.profileId, jobOpeningId: openingId });
      await expect(createContactRequest(prisma, { recruiterUserId: recruiterId, candidateProfileId: c.profileId, jobOpeningId: openingId })).rejects.toMatchObject({ status: 409, code: "ALREADY_REQUESTED" });
    });

    it("refuses another company's opening, a closed opening, and anonymised candidates", async () => {
      const c = await candidate("scope", null);
      await expect(createContactRequest(prisma, { recruiterUserId: recruiterId, candidateProfileId: c.profileId, jobOpeningId: foreignOpeningId })).rejects.toMatchObject({ code: "OPENING_NOT_FOUND" });
      await expect(createContactRequest(prisma, { recruiterUserId: recruiterId, candidateProfileId: c.profileId, jobOpeningId: closedOpeningId })).rejects.toMatchObject({ code: "OPENING_CLOSED" });
      const gone = await candidate("scopegone", null, { anonymised: true });
      await expect(createContactRequest(prisma, { recruiterUserId: recruiterId, candidateProfileId: gone.profileId, jobOpeningId: openingId })).rejects.toMatchObject({ code: "CANDIDATE_NOT_AVAILABLE" });
    });

    it("is for recruiters and company admins only", async () => {
      const c = await candidate("roles", null);
      await expect(createContactRequest(prisma, { recruiterUserId: c.userId, candidateProfileId: c.profileId, jobOpeningId: openingId })).rejects.toMatchObject({ status: 403 });
    });
  });

  describe("the API route", () => {
    it("checks the role, the confirmed email and the input, then enforces the rule", async () => {
      const c = await candidate("route", 70_000);
      const body = { candidateProfileId: c.profileId, jobOpeningId: openingId };

      session.user = null;
      expect((await contactRoute(post(body))).status).toBe(403);
      session.user = { id: c.userId, role: "CANDIDATE" };
      expect((await contactRoute(post(body))).status).toBe(403);

      const unverified = await prisma.user.create({ data: { email: `unv-${kit.run}@example.test`, name: "Unverified", password: await hashPassword("x-pass-12345"), role: "RECRUITER", companyId, emailVerified: null } });
      session.user = { id: unverified.id, role: "RECRUITER", companyId };
      const blocked = await contactRoute(post(body));
      expect(blocked.status).toBe(403);
      expect((await blocked.json()).code).toBe("EMAIL_NOT_VERIFIED");

      session.user = { id: recruiterId, role: "RECRUITER", companyId };
      expect((await contactRoute(post({ candidateProfileId: "" }))).status).toBe(400);
      const ok = await contactRoute(post(body));
      expect(ok.status).toBe(201);

      const high = await candidate("routehigh", 99_000);
      const refused = await contactRoute(post({ candidateProfileId: high.profileId, jobOpeningId: openingId }));
      expect(refused.status).toBe(404);
      expect((await refused.json()).code).toBe("CANDIDATE_NOT_AVAILABLE");
    });
  });

  describe("the candidate's answer", () => {
    it("accept and decline update the request and notify the recruiter; only the candidate's own request", async () => {
      const a = await candidate("answerA", null);
      const b = await candidate("answerB", null);
      const reqA = await createContactRequest(prisma, { recruiterUserId: recruiterId, candidateProfileId: a.profileId, jobOpeningId: openingId });
      const otherOpening = await prisma.jobOpening.create({ data: { companyId, jobRoleId: kit.role.id, salaryRangeMin: 1, salaryRangeMax: 80_000, createdById: recruiterId } });
      const reqB = await createContactRequest(prisma, { recruiterUserId: recruiterId, candidateProfileId: b.profileId, jobOpeningId: otherOpening.id });

      // Someone else cannot answer it.
      session.user = { id: b.userId, role: "CANDIDATE" };
      const wrong = await respondRoute(post({ action: "accept" }), { params: Promise.resolve({ id: reqA.id }) });
      expect(wrong.status).toBe(404);
      expect((await prisma.contactRequest.findUniqueOrThrow({ where: { id: reqA.id } })).status).toBe("SENT");

      session.user = { id: a.userId, role: "CANDIDATE" };
      expect((await respondRoute(post({ action: "maybe" }), { params: Promise.resolve({ id: reqA.id }) })).status).toBe(400);
      expect((await respondRoute(post({ action: "accept" }), { params: Promise.resolve({ id: reqA.id }) })).status).toBe(200);
      expect((await respondRoute(post({ action: "decline" }), { params: Promise.resolve({ id: reqA.id }) })).status).toBe(409); // already answered
      expect(await prisma.contactRequest.findUniqueOrThrow({ where: { id: reqA.id } })).toMatchObject({ status: "ACCEPTED" });

      await respondToContactRequest(prisma, { candidateUserId: b.userId, requestId: reqB.id, accept: false });
      expect((await prisma.contactRequest.findUniqueOrThrow({ where: { id: reqB.id } })).status).toBe("DECLINED");
      const notes = await prisma.notification.findMany({ where: { userId: recruiterId } });
      expect(notes.map((n) => n.title)).toEqual(expect.arrayContaining(["Contact request accepted", "Contact request declined"]));
      await prisma.contactRequest.deleteMany({ where: { jobOpeningId: otherOpening.id } });
      await prisma.jobOpening.delete({ where: { id: otherOpening.id } });
    });
  });
});

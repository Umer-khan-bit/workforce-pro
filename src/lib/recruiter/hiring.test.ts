import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TestType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readSetting } from "@/lib/settings/store";
import { createKit, type Kit } from "@/lib/testEngine/testkit";
import { createCompany, ALL_ON, type World } from "./testWorld";
import { addToShortlist, pipelineCount, removeFromShortlist, setShortlistNote, setShortlistStatus } from "./shortlist";
import { createOpening, deleteOpening, openingInputSchema, updateOpening } from "./openings";
import { createContactRequest } from "./contactRequests";
import { getEntitlements } from "./entitlements";

const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

describe("opening input", () => {
  const ok = { jobRoleId: "r", salaryRangeMin: 50_000, salaryRangeMax: 80_000 };
  it("needs a role and a top salary at least as high as the lowest", () => {
    expect(openingInputSchema.safeParse(ok).success).toBe(true);
    expect(openingInputSchema.safeParse({ ...ok, salaryRangeMax: 40_000 }).success).toBe(false);
    expect(openingInputSchema.safeParse({ ...ok, jobRoleId: "" }).success).toBe(false);
    expect(openingInputSchema.parse({ ...ok, title: "", city: "" })).toMatchObject({ title: undefined, city: undefined, status: "OPEN" });
  });
});

describe.skipIf(!dbUp)("shortlists, job openings and plan limits (real database)", () => {
  let kit: Kit;
  let world: World; // every feature on
  let limited: World; // maxShortlists 2, maxJobOpenings 2, no Top Performers, no AI
  let nothing: World; // no plan at all
  let other: World; // a second company
  let openingId: string;
  let limitedOpeningId: string;
  const worlds: World[] = [];

  beforeAll(async () => {
    kit = await createKit(prisma, "hire");
    world = await createCompany(prisma, `${kit.run}a`);
    limited = await createCompany(prisma, `${kit.run}b`, { features: { allCandidates: true, q1Exclusive: false, aiSearch: false, atsApiAccess: false, maxShortlists: 2, maxJobOpenings: 2 } });
    nothing = await createCompany(prisma, `${kit.run}c`, { features: null });
    other = await createCompany(prisma, `${kit.run}d`);
    worlds.push(world, limited, nothing, other);
    const mk = (companyId: string, byId: string, max = 80_000) => prisma.jobOpening.create({ data: { companyId, createdById: byId, jobRoleId: kit.role.id, salaryRangeMin: 40_000, salaryRangeMax: max, status: "OPEN" } });
    openingId = (await mk(world.company.id, world.recruiter.id)).id;
    limitedOpeningId = (await mk(limited.company.id, limited.recruiter.id)).id;
  }, 60_000);

  afterAll(async () => {
    for (const w of worlds) await w.cleanup();
    await kit.cleanup();
  }, 60_000);

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
  const shortlist = (w: World, profileId: string, opening = openingId) => addToShortlist(prisma, { recruiterId: w.recruiter.id, candidateProfileId: profileId, jobOpeningId: opening });

  describe("shortlisting", () => {
    it("adds a candidate with a dated history and an audit entry", async () => {
      const c = await candidate("sl1");
      const entry = await shortlist(world, c.profileId);
      expect(entry.status).toBe("SHORTLISTED");
      const history = await prisma.shortlistStatusHistory.findMany({ where: { shortlistId: entry.id } });
      expect(history.map((h) => h.status)).toEqual(["SHORTLISTED"]);
      expect(history[0].changedById).toBe(world.recruiter.id);
      expect(await prisma.auditLog.count({ where: { actorId: world.recruiter.id, action: "CANDIDATE_SHORTLISTED", targetId: c.profileId } })).toBe(1);
    });

    it("refuses duplicates, closed openings, other companies' openings and company admins", async () => {
      const c = await candidate("sl2");
      await shortlist(world, c.profileId);
      await expect(shortlist(world, c.profileId)).rejects.toMatchObject({ status: 409, code: "ALREADY_SHORTLISTED" });
      const closed = await prisma.jobOpening.create({ data: { companyId: world.company.id, createdById: world.recruiter.id, jobRoleId: kit.role.id, salaryRangeMin: 1, salaryRangeMax: 80_000, status: "CLOSED" } });
      await expect(shortlist(world, c.profileId, closed.id)).rejects.toMatchObject({ code: "OPENING_CLOSED" });
      await expect(shortlist(other, c.profileId, openingId)).rejects.toMatchObject({ code: "OPENING_NOT_FOUND" });
      await expect(addToShortlist(prisma, { recruiterId: world.admin.id, candidateProfileId: c.profileId, jobOpeningId: openingId })).rejects.toMatchObject({ status: 403 });
    });

    it("enforces the minimum-salary rule against the opening's offer, with the same answer as for a missing candidate", async () => {
      const high = await candidate("sl3", { minimum: 120_000 }); // the opening offers up to 80,000
      const a = await shortlist(world, high.profileId).catch((e) => e);
      const b = await shortlist(world, "no-such-candidate").catch((e) => e);
      expect([a.status, a.code, a.message]).toEqual([b.status, b.code, b.message]);
      expect(await prisma.shortlist.count({ where: { candidateProfileId: high.profileId } })).toBe(0);
    });

    it("needs a plan with access to all candidates", async () => {
      const c = await candidate("sl4");
      const noPlanOpening = await prisma.jobOpening.create({ data: { companyId: nothing.company.id, createdById: nothing.recruiter.id, jobRoleId: kit.role.id, salaryRangeMin: 1, salaryRangeMax: 80_000 } });
      await expect(shortlist(nothing, c.profileId, noPlanOpening.id)).rejects.toMatchObject({ status: 403, code: "PLAN_FEATURE_REQUIRED" });
      const off = await createCompany(prisma, `${kit.run}e`, { features: { allCandidates: false } });
      worlds.push(off);
      const op = await prisma.jobOpening.create({ data: { companyId: off.company.id, createdById: off.recruiter.id, jobRoleId: kit.role.id, salaryRangeMin: 1, salaryRangeMax: 80_000 } });
      await expect(shortlist(off, c.profileId, op.id)).rejects.toMatchObject({ code: "PLAN_FEATURE_REQUIRED" });
    });

    it("an ended plan blocks everything, and says why", async () => {
      const ended = await createCompany(prisma, `${kit.run}f`, { endsInDays: -1 });
      worlds.push(ended);
      const op = await prisma.jobOpening.create({ data: { companyId: ended.company.id, createdById: ended.recruiter.id, jobRoleId: kit.role.id, salaryRangeMin: 1, salaryRangeMax: 80_000 } });
      const c = await candidate("sl5");
      await expect(shortlist(ended, c.profileId, op.id)).rejects.toMatchObject({ code: "PLAN_FEATURE_REQUIRED", message: expect.stringMatching(/plan has ended/) });
    });

    it("keeps Top Performers for plans with exclusive Q1 access", async () => {
      const star = await candidate("star", { top: true });
      await expect(shortlist(limited, star.profileId, limitedOpeningId)).rejects.toMatchObject({ status: 404, code: "CANDIDATE_NOT_AVAILABLE" });
      await expect(shortlist(world, star.profileId)).resolves.toBeTruthy();
    });

    it("enforces the plan's shortlist limit, and hired or rejected candidates free their place", async () => {
      const [x, y, z] = [await candidate("lim1"), await candidate("lim2"), await candidate("lim3")];
      const e1 = await shortlist(limited, x.profileId, limitedOpeningId);
      await shortlist(limited, y.profileId, limitedOpeningId);
      expect(await pipelineCount(prisma, limited.company.id)).toBe(2);
      await expect(shortlist(limited, z.profileId, limitedOpeningId)).rejects.toMatchObject({ status: 403, code: "LIMIT_REACHED" });

      await setShortlistStatus(prisma, { actorId: limited.recruiter.id, shortlistId: e1.id, status: "REJECTED" });
      expect(await pipelineCount(prisma, limited.company.id)).toBe(1);
      await expect(shortlist(limited, z.profileId, limitedOpeningId)).resolves.toBeTruthy();
      // Moving the rejected candidate back would exceed the limit again.
      await expect(setShortlistStatus(prisma, { actorId: limited.recruiter.id, shortlistId: e1.id, status: "SHORTLISTED" })).rejects.toMatchObject({ code: "LIMIT_REACHED" });
    });
  });

  describe("the pipeline", () => {
    it("records every move with its date, and a hire is reported to the other company admins", async () => {
      const c = await candidate("pipe1");
      const entry = await shortlist(world, c.profileId);
      for (const status of ["CONTACTED", "INTERVIEWING", "OFFERED", "HIRED"] as const) {
        await new Promise((r) => setTimeout(r, 8));
        await setShortlistStatus(prisma, { actorId: world.recruiter.id, shortlistId: entry.id, status });
      }
      const history = await prisma.shortlistStatusHistory.findMany({ where: { shortlistId: entry.id }, orderBy: { changedAt: "asc" } });
      expect(history.map((h) => h.status)).toEqual(["SHORTLISTED", "CONTACTED", "INTERVIEWING", "OFFERED", "HIRED"]);
      expect((await prisma.shortlist.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("HIRED");
      const note = await prisma.notification.findFirstOrThrow({ where: { userId: world.admin.id, title: { startsWith: "A hire for" } } });
      expect(note.message).toContain(`recruiter ${world.tag}`);
      expect(await prisma.notification.count({ where: { userId: world.recruiter.id, title: { startsWith: "A hire for" } } })).toBe(0);
      // Setting the same status again changes nothing.
      await setShortlistStatus(prisma, { actorId: world.recruiter.id, shortlistId: entry.id, status: "HIRED" });
      expect(await prisma.shortlistStatusHistory.count({ where: { shortlistId: entry.id } })).toBe(5);
    });

    it("recruiters change only their own entries; a company admin can change any in the company; other companies cannot", async () => {
      const second = await world.addUser("second", "RECRUITER");
      const c = await candidate("pipe2");
      const entry = await shortlist(world, c.profileId);
      await expect(setShortlistStatus(prisma, { actorId: second.id, shortlistId: entry.id, status: "CONTACTED" })).rejects.toMatchObject({ status: 404 });
      await expect(setShortlistStatus(prisma, { actorId: other.recruiter.id, shortlistId: entry.id, status: "CONTACTED" })).rejects.toMatchObject({ status: 404 });
      await expect(setShortlistStatus(prisma, { actorId: other.admin.id, shortlistId: entry.id, status: "CONTACTED" })).rejects.toMatchObject({ status: 404 });
      await setShortlistStatus(prisma, { actorId: world.admin.id, shortlistId: entry.id, status: "INTERVIEWING" });
      expect((await prisma.shortlist.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("INTERVIEWING");
      await expect(removeFromShortlist(prisma, { actorId: second.id, shortlistId: entry.id })).rejects.toMatchObject({ status: 404 });
    });

    it("keeps a note, and removing an entry removes its history too", async () => {
      const c = await candidate("pipe3");
      const entry = await shortlist(world, c.profileId);
      await setShortlistNote(prisma, { actorId: world.recruiter.id, shortlistId: entry.id, note: "  Call after 5pm  " });
      expect((await prisma.shortlist.findUniqueOrThrow({ where: { id: entry.id } })).note).toBe("Call after 5pm");
      await removeFromShortlist(prisma, { actorId: world.recruiter.id, shortlistId: entry.id });
      expect(await prisma.shortlist.count({ where: { id: entry.id } })).toBe(0);
      expect(await prisma.shortlistStatusHistory.count({ where: { shortlistId: entry.id } })).toBe(0);
    });

    it("sending a contact request moves a shortlisted candidate to Contacted", async () => {
      const c = await candidate("pipe4");
      const entry = await shortlist(world, c.profileId);
      await createContactRequest(prisma, { recruiterUserId: world.recruiter.id, candidateProfileId: c.profileId, jobOpeningId: openingId });
      expect((await prisma.shortlist.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("CONTACTED");
      expect((await prisma.shortlistStatusHistory.findMany({ where: { shortlistId: entry.id }, orderBy: { changedAt: "asc" } })).map((h) => h.status)).toEqual(["SHORTLISTED", "CONTACTED"]);
    });
  });

  describe("contact requests and the plan", () => {
    it("need a plan with access to candidates, and keep Top Performers for exclusive plans", async () => {
      const c = await candidate("cr1");
      const op = await prisma.jobOpening.create({ data: { companyId: nothing.company.id, createdById: nothing.recruiter.id, jobRoleId: kit.role.id, salaryRangeMin: 1, salaryRangeMax: 80_000 } });
      await expect(createContactRequest(prisma, { recruiterUserId: nothing.recruiter.id, candidateProfileId: c.profileId, jobOpeningId: op.id })).rejects.toMatchObject({ status: 403, code: "PLAN_FEATURE_REQUIRED" });

      const star = await candidate("cr2", { top: true });
      await expect(createContactRequest(prisma, { recruiterUserId: limited.recruiter.id, candidateProfileId: star.profileId, jobOpeningId: limitedOpeningId })).rejects.toMatchObject({ status: 404, code: "CANDIDATE_NOT_AVAILABLE" });
      await expect(createContactRequest(prisma, { recruiterUserId: world.recruiter.id, candidateProfileId: star.profileId, jobOpeningId: openingId })).resolves.toBeTruthy();
    });
  });

  describe("job openings", () => {
    const input = (over: Record<string, unknown> = {}) => openingInputSchema.parse({ jobRoleId: kit.role.id, salaryRangeMin: 40_000, salaryRangeMax: 90_000, ...over });

    it("creates an opening for the user's company and tells the company admins when a recruiter does it", async () => {
      const o = await createOpening(prisma, { userId: world.recruiter.id, input: input({ title: "Senior accountant", city: "Lahore" }) });
      expect(o).toMatchObject({ companyId: world.company.id, createdById: world.recruiter.id, title: "Senior accountant", status: "OPEN" });
      const note = await prisma.notification.findFirstOrThrow({ where: { userId: world.admin.id, title: { startsWith: "New job opening" } } });
      expect(note.message).toContain(`recruiter ${world.tag}`);
      // An admin creating one does not notify themselves.
      const before = await prisma.notification.count({ where: { userId: world.admin.id } });
      await createOpening(prisma, { userId: world.admin.id, input: input() });
      expect(await prisma.notification.count({ where: { userId: world.admin.id } })).toBe(before);
    });

    it("checks the job role and the city exist", async () => {
      await expect(createOpening(prisma, { userId: world.recruiter.id, input: input({ jobRoleId: "nope" }) })).rejects.toMatchObject({ code: "INVALID_ROLE" });
      await expect(createOpening(prisma, { userId: world.recruiter.id, input: input({ city: "Atlantis" }) })).rejects.toMatchObject({ code: "INVALID_CITY" });
    });

    it("enforces the plan's limit on OPEN openings only (paused and closed ones are free)", async () => {
      const second = await createCompany(prisma, `${kit.run}g`, { features: { allCandidates: true, maxJobOpenings: 2 } });
      worlds.push(second);
      const a = await createOpening(prisma, { userId: second.recruiter.id, input: input() });
      await createOpening(prisma, { userId: second.recruiter.id, input: input() });
      await expect(createOpening(prisma, { userId: second.recruiter.id, input: input() })).rejects.toMatchObject({ status: 403, code: "LIMIT_REACHED" });
      await expect(createOpening(prisma, { userId: second.admin.id, input: input() })).rejects.toMatchObject({ code: "LIMIT_REACHED" }); // company-wide, not per person
      await createOpening(prisma, { userId: second.recruiter.id, input: input({ status: "PAUSED" }) }); // allowed
      await updateOpening(prisma, { userId: second.recruiter.id, id: a.id, input: input({ status: "FILLED" }) });
      await expect(createOpening(prisma, { userId: second.recruiter.id, input: input() })).resolves.toBeTruthy(); // the place was freed
      // Re-opening the filled one would exceed the limit again.
      await expect(updateOpening(prisma, { userId: second.recruiter.id, id: a.id, input: input({ status: "OPEN" }) })).rejects.toMatchObject({ code: "LIMIT_REACHED" });
    });

    it("no plan means no job openings", async () => {
      const e = await getEntitlements(nothing.company.id);
      expect(e.openingLimit).toBe(0);
      await expect(createOpening(prisma, { userId: nothing.recruiter.id, input: input() })).rejects.toMatchObject({ status: 403, code: "LIMIT_REACHED", message: expect.stringMatching(/no plan/) });
    });

    it("recruiters edit their own openings; company admins edit any; others cannot", async () => {
      const mine = await createOpening(prisma, { userId: world.recruiter.id, input: input() });
      const second = await world.addUser("editor", "RECRUITER");
      await expect(updateOpening(prisma, { userId: second.id, id: mine.id, input: input({ title: "Hijacked" }) })).rejects.toMatchObject({ status: 404 });
      await updateOpening(prisma, { userId: world.admin.id, id: mine.id, input: input({ title: "By the admin" }) });
      expect((await prisma.jobOpening.findUniqueOrThrow({ where: { id: mine.id } })).title).toBe("By the admin");
      await expect(updateOpening(prisma, { userId: other.admin.id, id: mine.id, input: input() })).rejects.toMatchObject({ status: 404 });
    });

    it("deletes an unused opening, but closes (not deletes) one with shortlists or requests", async () => {
      const unused = await createOpening(prisma, { userId: world.recruiter.id, input: input() });
      await deleteOpening(prisma, { userId: world.recruiter.id, id: unused.id });
      expect(await prisma.jobOpening.count({ where: { id: unused.id } })).toBe(0);

      const used = await createOpening(prisma, { userId: world.recruiter.id, input: input() });
      const c = await candidate("del1");
      await shortlist(world, c.profileId, used.id);
      await expect(deleteOpening(prisma, { userId: world.recruiter.id, id: used.id })).rejects.toMatchObject({ status: 409, code: "IN_USE" });
    });
  });

  it("entitlements read the plan's features (never its name)", async () => {
    const [full, small, none] = await Promise.all([getEntitlements(world.company.id), getEntitlements(limited.company.id), getEntitlements(nothing.company.id)]);
    expect(full).toMatchObject({ canSearch: true, canSeeTopPerformers: true, canUseAiSearch: true, canUseAts: true, shortlistLimit: null, openingLimit: null });
    expect(small).toMatchObject({ canSearch: true, canSeeTopPerformers: false, canUseAiSearch: false, canUseAts: false, shortlistLimit: 2, openingLimit: 2 });
    expect(none).toMatchObject({ canSearch: false, canSeeTopPerformers: false, canUseAiSearch: false, shortlistLimit: 0, openingLimit: 0 });
    expect(ALL_ON.maxShortlists).toBeNull();
  });
});

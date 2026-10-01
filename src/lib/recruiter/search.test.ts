import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TestType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readSetting } from "@/lib/settings/store";
import { createKit, type Kit } from "@/lib/testEngine/testkit";
import { buildRows, filterRows, profileWhere, searchCandidates, sortRows, type CandidateRow, type ResultRow } from "./search";
import { buildSearchQuery, parseSearchQuery } from "./searchParams";

const rule = { requiredQuartile: 1, countedTests: ["IQ", "EQ", "LANGUAGE", "SKILL"] as TestType[] };
const profile = (id: string, over: Partial<{ city: string; experienceYears: number; role: string; name: string }> = {}) => ({ id, city: over.city ?? "Lahore", experienceYears: over.experienceYears ?? 3, jobRole: { name: over.role ?? "Accountant" }, user: { name: over.name ?? `Name ${id}` } });
const res = (testType: TestType, quartile: number, percentile: number): ResultRow => ({ testType, quartile, percentile, cefrLevel: null });

describe("building, filtering and sorting rows (pure)", () => {
  const results = new Map<string, ResultRow[]>([
    ["a", [res("IQ", 1, 95), res("EQ", 1, 90), res("LANGUAGE", 1, 92), res("SKILL", 1, 98)]],
    ["b", [res("IQ", 2, 60), res("EQ", 3, 40)]],
    ["c", [res("IQ", 4, 5), res("SKILL", 1, 99)]],
    ["d", []],
  ]);
  const rows = buildRows([profile("a", { experienceYears: 1 }), profile("b", { experienceYears: 8 }), profile("c", { experienceYears: 5 }), profile("d", { experienceYears: 12 })], results, rule);
  const ids = (r: CandidateRow[]) => r.map((x) => x.id);

  it("works out each candidate's quartiles, overall percentile and Top Performer status", () => {
    expect(rows[0]).toMatchObject({ id: "a", topPerformer: true, overall: 93.8 });
    expect(rows[1]).toMatchObject({ id: "b", topPerformer: false, overall: 50 });
    expect(rows[2]).toMatchObject({ id: "c", topPerformer: false, overall: 52 });
    expect(rows[3]).toMatchObject({ id: "d", overall: null, topPerformer: false });
  });

  it("filters by the weakest quartile accepted in each test", () => {
    expect(ids(filterRows(rows, { quartiles: { IQ: 2 } }))).toEqual(["a", "b"]);
    expect(ids(filterRows(rows, { quartiles: { IQ: 1 } }))).toEqual(["a"]);
    expect(ids(filterRows(rows, { quartiles: { SKILL: 1, IQ: 4 } }))).toEqual(["a", "c"]);
    expect(ids(filterRows(rows, { quartiles: { LANGUAGE: 3 } }))).toEqual(["a"]); // no result at all does not pass a quartile filter
  });

  it("Q1 in all tests keeps only Top Performers", () => {
    expect(ids(filterRows(rows, { topPerformersOnly: true }))).toEqual(["a"]);
  });

  it("sorts best first, with candidates who lack the value last, and ties in a stable order", () => {
    expect(ids(sortRows(rows, "overall"))).toEqual(["a", "c", "b", "d"]);
    expect(ids(sortRows(rows, "experience"))).toEqual(["d", "b", "c", "a"]);
    expect(ids(sortRows(rows, "skill"))).toEqual(["c", "a", "b", "d"]);
    expect(ids(sortRows(rows, "iq"))).toEqual(["a", "b", "c", "d"]);
    expect(ids(sortRows([...rows].reverse(), "overall"))).toEqual(ids(sortRows(rows, "overall")));
  });
});

describe("the address of a search", () => {
  it("round-trips filters, sort, offer and page", () => {
    const q = { filters: { jobRoleId: "r1", city: "Lahore", minExperience: 2, maxExperience: 9, quartiles: { IQ: 1, SKILL: 2 }, topPerformersOnly: true }, sort: "skill" as const, page: 3, offer: 85000, opening: "o1" };
    const back = parseSearchQuery(Object.fromEntries(new URLSearchParams(buildSearchQuery(q))));
    expect(back).toEqual(q);
  });
  it("ignores nonsense and keeps numbers in range", () => {
    const q = parseSearchQuery({ minExp: "abc", maxExp: "999", q_iq: "9", sort: "hack", page: "-4", offer: "0", top: "yes" });
    expect(q).toEqual({ filters: { maxExperience: 60, quartiles: { IQ: 4 } }, sort: "overall", page: 1, offer: 1, opening: null });
  });
  it("leaves empty values out", () => {
    expect(buildSearchQuery({ filters: {}, sort: "overall", page: 1, offer: null, opening: null })).toBe("");
  });
});

describe("the profile part of a search always includes the salary rule", () => {
  it("starts from the visibility filter whatever else is chosen", () => {
    const where = profileWhere(80_000, { city: "Lahore", jobRoleId: "r" });
    expect(JSON.stringify(where)).toContain('"minimumSalary":{"lte":80000}');
    expect(JSON.stringify(where)).toContain('"anonymisedAt":null');
  });
});

const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

describe.skipIf(!dbUp)("searching candidates (real database)", () => {
  let kit: Kit;
  const people: Record<string, { profileId: string; userId: string }> = {};

  beforeAll(async () => {
    kit = await createKit(prisma, "srch");
  }, 60_000);
  afterAll(async () => {
    await kit.cleanup();
  }, 60_000);

  async function person(key: string, over: { minimum?: number | null; city?: string; years?: number; results?: Array<[TestType, number, number]>; anonymised?: boolean; consent?: boolean }) {
    const c = await kit.addCandidate(key);
    await prisma.candidateProfile.update({
      where: { id: c.profileId },
      data: { minimumSalary: over.minimum === undefined ? 50_000 : over.minimum, city: over.city ?? "Lahore", experienceYears: over.years ?? 3, anonymisedAt: over.anonymised ? new Date() : null, consentGiven: over.consent ?? true },
    });
    for (const [testType, quartile, percentile] of over.results ?? []) {
      const s = await prisma.testSession.create({ data: { candidateProfileId: c.profileId, testType, status: "COMPLETED", completedAt: new Date() } });
      await prisma.score.create({ data: { candidateProfileId: c.profileId, sessionId: s.id, testType, rawScore: 50, quartile, percentile, rankValue: 0 } });
    }
    people[key] = c;
    return c;
  }
  const args = (over: Partial<Parameters<typeof searchCandidates>[1]> = {}) => ({
    offerMax: 100_000,
    filters: { jobRoleId: kit.role.id },
    sort: "overall" as const,
    page: 1,
    pageSize: 20,
    poolLimit: 1000,
    rule,
    canSeeTopPerformers: true,
    ...over,
  });
  const names = (r: { rows: CandidateRow[] }) => r.rows.map((x) => x.id);

  it("applies the minimum-salary rule against the offer", async () => {
    const low = await person("fitslow", { minimum: 40_000 });
    const edge = await person("fitsedge", { minimum: 70_000 });
    const high = await person("toohigh", { minimum: 120_000 });
    const none = await person("nominimum", { minimum: null });
    const at70 = await searchCandidates(prisma, args({ offerMax: 70_000, filters: { jobRoleId: kit.role.id, maxExperience: 3 } }));
    expect(names(at70).sort()).toEqual([low.profileId, edge.profileId, none.profileId].sort());
    expect(names(at70)).not.toContain(high.profileId);
    expect(names(await searchCandidates(prisma, args({ offerMax: 30_000 }))).filter((id) => [low, edge, high, none].some((p) => p.profileId === id))).toEqual([none.profileId]);
  });

  it("never returns deleted accounts or people who have not consented, and never exposes the minimum", async () => {
    const gone = await person("deleted", { anonymised: true });
    const noConsent = await person("noconsent", { consent: false });
    const r = await searchCandidates(prisma, args());
    expect(names(r)).not.toContain(gone.profileId);
    expect(names(r)).not.toContain(noConsent.profileId);
    expect(JSON.stringify(r.rows)).not.toMatch(/minimumSalary|phone|@example\.test/);
  });

  it("filters by city and experience", async () => {
    const khi = await person("karachi", { city: "Karachi", years: 9 });
    const r = await searchCandidates(prisma, args({ filters: { jobRoleId: kit.role.id, city: "karachi", minExperience: 8 } }));
    expect(names(r)).toEqual([khi.profileId]);
    expect(names(await searchCandidates(prisma, args({ filters: { jobRoleId: kit.role.id, city: "Karachi", maxExperience: 5 } })))).toEqual([]);
  });

  it("filters by quartile per test, sorts and pages", async () => {
    const a = await person("qa", { years: 20, results: [["IQ", 1, 97], ["SKILL", 3, 40]] });
    const b = await person("qb", { years: 21, results: [["IQ", 2, 70], ["SKILL", 1, 99]] });
    const c = await person("qc", { years: 22, results: [["IQ", 4, 10]] });
    const scope = { jobRoleId: kit.role.id, minExperience: 20 };
    expect(names(await searchCandidates(prisma, args({ filters: { ...scope, quartiles: { IQ: 2 } } }))).sort()).toEqual([a.profileId, b.profileId].sort());
    expect(names(await searchCandidates(prisma, args({ filters: { ...scope, quartiles: { IQ: 2, SKILL: 1 } } })))).toEqual([b.profileId]);
    expect(names(await searchCandidates(prisma, args({ filters: scope, sort: "skill" })))).toEqual([b.profileId, a.profileId, c.profileId]);
    expect(names(await searchCandidates(prisma, args({ filters: scope, sort: "experience" })))).toEqual([c.profileId, b.profileId, a.profileId]);

    const page1 = await searchCandidates(prisma, args({ filters: scope, sort: "experience", pageSize: 2 }));
    const page2 = await searchCandidates(prisma, args({ filters: scope, sort: "experience", pageSize: 2, page: 2 }));
    expect([page1.total, page1.pages, names(page1).length, names(page2)]).toEqual([3, 2, 2, [a.profileId]]);
    expect((await searchCandidates(prisma, args({ filters: scope, pageSize: 2, page: 99 }))).page).toBe(2); // past the end: last page
  });

  it("hides Top Performers from plans without exclusive Q1 access, and counts them", async () => {
    const live = await readSetting(prisma, "topPerformer");
    const star = await person("star", { years: 30, results: live.countedTests.map((t) => [t, live.requiredQuartile, 99] as [TestType, number, number]) });
    const ordinary = await person("ordinary", { years: 30, results: [["IQ", 2, 60]] });
    const scope = { jobRoleId: kit.role.id, minExperience: 30 };

    const full = await searchCandidates(prisma, args({ filters: scope, canSeeTopPerformers: true }));
    expect(names(full).sort()).toEqual([star.profileId, ordinary.profileId].sort());
    expect(full.rows.find((r) => r.id === star.profileId)?.topPerformer).toBe(true);

    const basic = await searchCandidates(prisma, args({ filters: scope, canSeeTopPerformers: false }));
    expect(names(basic)).toEqual([ordinary.profileId]);
    expect(basic.hiddenTopPerformers).toBe(1);

    // The "Q1 in all tests" filter finds Top Performers only on a plan that includes them; otherwise nothing, and the count shows why.
    expect(names(await searchCandidates(prisma, args({ filters: { ...scope, topPerformersOnly: true }, canSeeTopPerformers: true })))).toEqual([star.profileId]);
    const blocked = await searchCandidates(prisma, args({ filters: { ...scope, topPerformersOnly: true }, canSeeTopPerformers: false }));
    expect([blocked.total, blocked.hiddenTopPerformers]).toEqual([0, 1]);
  });

  it("only looks at the pool size from Settings and says when it was cut", async () => {
    await person("pool1", { years: 40 });
    await person("pool2", { years: 40 });
    await person("pool3", { years: 40 });
    const r = await searchCandidates(prisma, args({ filters: { jobRoleId: kit.role.id, minExperience: 40 }, poolLimit: 2 }));
    expect(r.poolTruncated).toBe(true);
    expect(r.total).toBe(2);
  });
});

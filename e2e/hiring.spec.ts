import { test, expect, type Page } from "@playwright/test";
import type { TestType } from "@prisma/client";
import { createKit, type Kit } from "../src/lib/testEngine/testkit";
import { createCompany, type World } from "../src/lib/recruiter/testWorld";
import { logInAs, prisma } from "./helpers";

// Recruiter search, shortlists, job openings and contact requests, with plan features. Each test group builds its
// own company (with its own plan) and candidates in an isolated job role, so the demo data is never touched and
// nothing here depends on it. No test calls the real Claude API.
test.describe.configure({ mode: "serial" });

const WORLD_PASSWORD = "x-pass-12345";
const KIT_PASSWORD = "kit-password-1";
let kit: Kit;
const worlds: World[] = [];

test.beforeAll(async () => {
  kit = await createKit(prisma, "e2eh");
});
test.afterAll(async () => {
  for (const w of worlds) await w.cleanup();
  await kit.cleanup();
});

async function company(suffix: string, opts: Parameters<typeof createCompany>[2] = {}) {
  const w = await createCompany(prisma, `${kit.run}${suffix}`, opts);
  worlds.push(w);
  return w;
}
async function openingFor(w: World, over: { max?: number; title?: string } = {}) {
  return prisma.jobOpening.create({ data: { companyId: w.company.id, createdById: w.recruiter.id, jobRoleId: kit.role.id, title: over.title ?? "Test opening", city: "Lahore", salaryRangeMin: 40_000, salaryRangeMax: over.max ?? 90_000 } });
}
async function candidate(name: string, over: { minimum?: number | null; city?: string; years?: number; results?: Array<[TestType, number, number]>; display?: string } = {}) {
  const c = await kit.addCandidate(name);
  await prisma.user.update({ where: { id: c.userId }, data: { name: over.display ?? `Cand ${name} ${kit.run}` } });
  await prisma.candidateProfile.update({ where: { id: c.profileId }, data: { minimumSalary: over.minimum === undefined ? 50_000 : over.minimum, city: over.city ?? "Lahore", experienceYears: over.years ?? 3, phone: "03001112223" } });
  for (const [testType, quartile, percentile] of over.results ?? []) {
    const s = await prisma.testSession.create({ data: { candidateProfileId: c.profileId, testType, status: "COMPLETED", completedAt: new Date() } });
    await prisma.score.create({ data: { candidateProfileId: c.profileId, sessionId: s.id, testType, rawScore: 70, quartile, percentile, rankValue: 0, cohortScope: "ALL", cohortSize: 60 } });
  }
  return { ...c, display: over.display ?? `Cand ${name} ${kit.run}` };
}
async function signIn(page: Page, email: string, home: string, password = WORLD_PASSWORD) {
  await logInAs(page, email, password);
  await expect(page).toHaveURL(new RegExp(`${home}$`));
}
async function topResults(): Promise<Array<[TestType, number, number]>> {
  const rule = await prisma.siteSetting.findUnique({ where: { key: "topPerformer" } });
  const tests = ((rule?.value as { countedTests?: TestType[] } | undefined)?.countedTests ?? ["IQ", "EQ", "LANGUAGE", "SKILL"]) as TestType[];
  return tests.map((t) => [t, 1, 99]);
}

test("search: the offer decides who is shown; filters, sort and the detail report work; the minimum salary never appears", async ({ page }) => {
  const w = await company("s1");
  await openingFor(w, { max: 90_000 });
  const ann = await candidate("ann", { city: "Lahore", years: 2, results: [["IQ", 1, 96], ["SKILL", 2, 70]], display: `Ann Fits ${kit.run}` });
  const bob = await candidate("bob", { city: "Karachi", years: 9, results: [["IQ", 3, 35], ["SKILL", 1, 99]], display: `Bob Karachi ${kit.run}` });
  await candidate("cat", { minimum: 150_000, display: `Cat Costly ${kit.run}` }); // minimum above the offer
  await candidate("dan", { minimum: null, city: "Lahore", years: 12, display: `Dan NoMinimum ${kit.run}` });

  await signIn(page, w.recruiter.email, "/recruiter");
  await page.getByRole("navigation", { name: "Recruiter navigation" }).getByRole("link", { name: "Candidate search" }).click();
  await expect(page).toHaveURL(/\/recruiter\/candidates$/);
  // Narrow to this test's job role through the address (the role list holds every role).
  const base = `/recruiter/candidates?role=${kit.role.id}`;
  await page.goto(base);

  const rows = page.getByTestId("candidate-row");
  await expect(page.getByTestId("result-count")).toContainText("3 candidates fit an offer of PKR 90,000");
  await expect(rows).toHaveCount(3);
  await expect(page.getByText("Cat Costly")).toHaveCount(0); // minimum is above the offer
  await expect(page.getByText(/150,000|50,000|03001112223/)).toHaveCount(0); // no minimum salary, no phone

  // Filters
  await page.goto(`${base}&city=Karachi`);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Bob Karachi");
  await page.goto(`${base}&q_iq=1`);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Ann Fits");
  await page.goto(`${base}&minExp=5`);
  await expect(rows).toHaveCount(2);

  // Sort
  await page.goto(`${base}&sort=skill`);
  await expect(rows.first()).toContainText("Bob Karachi");
  await page.goto(`${base}&sort=experience`);
  await expect(rows.first()).toContainText("Dan NoMinimum");

  // Using the form
  await page.goto(base);
  await page.getByLabel("City").selectOption("Lahore");
  await page.getByLabel("IQ quartile").selectOption("1");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/city=Lahore/);
  await expect(rows).toHaveCount(1);

  // A higher offer reveals the candidate whose minimum is above 90,000; a lower one hides more people.
  await page.goto(`${base}&offer=160000`);
  await expect(page.getByText("Cat Costly")).toBeVisible();
  await page.goto(`${base}&opening=&offer=45000`);
  await expect(rows).toHaveCount(1); // only the candidate with no stated minimum fits 45,000 (the others ask 50,000)

  // Detail report
  await page.goto(`${base}&sort=experience`);
  await page.getByRole("link", { name: ann.display }).click();
  await expect(page.getByTestId("candidate-name")).toHaveText(ann.display);
  await expect(page.getByTestId("fits-offer")).toContainText("fit your offer of PKR 90,000");
  await expect(page.getByTestId("detail-IQ")).toContainText("Q1");
  await expect(page.getByTestId("detail-IQ")).toContainText("Better than 96% of 60 candidates overall");
  await expect(page.getByText(/50,000|03001112223/)).toHaveCount(0);
  const pdf = await page.request.get(await page.getByTestId("download-candidate-report").getAttribute("href") as string);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect(await prisma.auditLog.count({ where: { actorId: w.recruiter.id, action: "CANDIDATE_PROFILE_VIEWED", targetId: ann.profileId } })).toBeGreaterThanOrEqual(2); // the page and the PDF

  // A candidate who is too expensive is simply not there.
  const costly = await prisma.candidateProfile.findFirstOrThrow({ where: { user: { email: `cat-${kit.run}@example.test` } } });
  expect((await page.goto(`/recruiter/candidates/${costly.id}?opening=&offer=90000`))?.status()).toBe(404);
  void bob;
});

test("search: pages of results", async ({ page }) => {
  const w = await company("s2");
  await openingFor(w);
  const size = (await prisma.siteSetting.findUnique({ where: { key: "recruiterTools" } }))?.value as { pageSize?: number } | undefined;
  const pageSize = size?.pageSize ?? 20;
  for (let i = 0; i < pageSize + 1; i++) await prisma.candidateProfile.create({ data: { user: { create: { email: `bulk${i}-${kit.run}@example.test`, name: `Bulk ${String(i).padStart(2, "0")}`, password: "x", role: "CANDIDATE" as const, emailVerified: new Date() } }, jobRole: { connect: { id: kit.role.id } }, city: "Multan", experienceYears: i, minimumSalary: 30_000, consentGiven: true } });
  try {
    await signIn(page, w.recruiter.email, "/recruiter");
    await page.goto(`/recruiter/candidates?role=${kit.role.id}&city=Multan&sort=experience`);
    await expect(page.getByTestId("candidate-row")).toHaveCount(pageSize);
    await expect(page.getByText(`Page 1 of 2`)).toBeVisible();
    await page.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId("candidate-row")).toHaveCount(1);
    await expect(page.getByTestId("candidate-row")).toContainText("Bulk 00"); // least experienced is last
    await page.getByRole("link", { name: "Previous" }).click();
    await expect(page.getByText("Page 1 of 2")).toBeVisible();
  } finally {
    const ids = (await prisma.user.findMany({ where: { email: { startsWith: "bulk", endsWith: `-${kit.run}@example.test` } }, select: { id: true } })).map((u) => u.id);
    await prisma.candidateProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
});

test("plan features: a plan without Q1 access hides Top Performers and AI search, and a plan with them shows both", async ({ browser }) => {
  const basic = await company("p1", { features: { allCandidates: true, q1Exclusive: false, aiSearch: false, atsApiAccess: false, maxShortlists: 25, maxJobOpenings: 5 } });
  const advanced = await company("p2");
  await openingFor(basic);
  await openingFor(advanced);
  const star = await candidate("star", { city: "Quetta", results: await topResults(), display: `Star Performer ${kit.run}` });
  await candidate("plain", { city: "Quetta", results: [["IQ", 2, 60]], display: `Plain Person ${kit.run}` });
  const url = `/recruiter/candidates?role=${kit.role.id}&city=Quetta`;

  const basicPage = await (await browser.newContext()).newPage();
  await signIn(basicPage, basic.recruiter.email, "/recruiter");
  await basicPage.goto(url);
  await expect(basicPage.getByTestId("candidate-row")).toHaveCount(1);
  await expect(basicPage.getByText("Star Performer")).toHaveCount(0);
  await expect(basicPage.getByTestId("hidden-top")).toContainText("1 Top Performer matches this search");
  await expect(basicPage.getByTestId("ai-search-locked")).toContainText("does not include AI search");
  await basicPage.goto(`${url}&top=1`);
  await expect(basicPage.getByTestId("candidate-row")).toHaveCount(0);
  expect((await basicPage.goto(`/recruiter/candidates/${star.profileId}?offer=90000`))?.status()).toBe(404);
  // The API says the same thing.
  const ai = await basicPage.request.post("/api/recruiter/ai-search", { data: { query: "the best accountants" } });
  expect(ai.status()).toBe(403);
  expect((await ai.json()).code).toBe("PLAN_FEATURE_REQUIRED");
  const contact = await basicPage.request.post("/api/recruiter/contact-requests", { data: { candidateProfileId: star.profileId, jobOpeningId: (await prisma.jobOpening.findFirstOrThrow({ where: { companyId: basic.company.id } })).id } });
  expect(contact.status()).toBe(404);

  const advancedPage = await (await browser.newContext()).newPage();
  await signIn(advancedPage, advanced.recruiter.email, "/recruiter");
  await advancedPage.goto(url);
  await expect(advancedPage.getByTestId("candidate-row")).toHaveCount(2);
  await expect(advancedPage.getByText("Star Performer")).toBeVisible();
  await expect(advancedPage.getByTestId("candidate-row").filter({ hasText: "Star Performer" })).toContainText("Top Performer");
  await expect(advancedPage.getByTestId("hidden-top")).toHaveCount(0);
  await expect(advancedPage.getByTestId("ai-search")).toBeVisible();
  await expect(advancedPage.getByTestId("ai-search-locked")).toHaveCount(0);
  await advancedPage.goto(`${url}&top=1`);
  await expect(advancedPage.getByTestId("candidate-row")).toHaveCount(1);
  await expect(advancedPage.getByTestId("candidate-name").or(advancedPage.getByText("Star Performer")).first()).toBeVisible();
});

test("a company with no plan, or an ended one, cannot search or open candidates", async ({ browser }) => {
  const none = await company("n1", { features: null });
  const ended = await company("n2", { endsInDays: -1 });
  const c = await candidate("ghost");
  for (const [w, text] of [[none, /no plan yet/], [ended, /plan has ended/]] as const) {
    const page = await (await browser.newContext()).newPage();
    await signIn(page, w.recruiter.email, "/recruiter");
    await page.goto("/recruiter/candidates");
    await expect(page.getByTestId("plan-blocked")).toContainText(text);
    await page.goto(`/recruiter/candidates/${c.profileId}?offer=90000`);
    await expect(page.getByRole("alert").filter({ hasText: text })).toBeVisible();
  }
});

test("without an offer nobody is shown; typing an offer reveals the candidates that fit it", async ({ page }) => {
  const w = await company("o1");
  await candidate("fit", { minimum: 40_000, city: "Sialkot", display: `Fits Forty ${kit.run}` });
  await signIn(page, w.recruiter.email, "/recruiter");
  await page.goto(`/recruiter/candidates?role=${kit.role.id}&city=Sialkot`);
  await expect(page.getByTestId("no-offer")).toContainText("enter the highest salary you can offer");
  await expect(page.getByTestId("candidate-row")).toHaveCount(0);
  await page.getByLabel("Highest salary you can offer").fill("45000");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByTestId("candidate-row")).toHaveCount(1);
  await expect(page.getByTestId("candidate-row")).toContainText("Fits Forty");
});

test("job openings: a recruiter creates, edits and deletes; the plan limit stops a second one; the company admin sees them all", async ({ browser }) => {
  const w = await company("j1", { features: { allCandidates: true, maxJobOpenings: 1, maxShortlists: null } });
  const rp = await (await browser.newContext()).newPage();
  await signIn(rp, w.recruiter.email, "/recruiter");
  await rp.getByRole("navigation", { name: "Recruiter navigation" }).getByRole("link", { name: "Job openings" }).click();
  await expect(rp.getByTestId("opening-limit")).toContainText("0 of 1 open job openings used");

  const fill = async (title: string, status?: string) => {
    await rp.getByLabel("Job role").selectOption({ label: `Test role ${kit.run}` });
    await rp.getByLabel("Title (optional)").fill(title);
    await rp.getByLabel("City").selectOption("Lahore");
    await rp.getByLabel(/^Lowest monthly salary/).fill("40000");
    await rp.getByLabel(/^Highest monthly salary/).fill("95000");
    if (status) await rp.getByLabel("Status").selectOption(status);
  };
  await rp.getByTestId("new-opening").click();
  await fill("First opening");
  await rp.getByRole("button", { name: "Save job opening" }).click();
  await expect(rp.getByTestId("opening-row")).toHaveCount(1);
  await expect(rp.getByTestId("opening-row")).toContainText("First opening");
  await expect(rp.getByTestId("opening-limit")).toContainText("1 of 1 open job openings used");

  await rp.getByTestId("new-opening").click();
  await fill("Second opening");
  await rp.getByRole("button", { name: "Save job opening" }).click();
  await expect(rp.getByTestId("opening-error")).toContainText("allows 1 open job openings");
  await expect(rp.getByTestId("opening-row")).toHaveCount(1);
  await fill("Second opening", "PAUSED"); // a paused opening does not count against the limit
  await rp.getByRole("button", { name: "Save job opening" }).click();
  await expect(rp.getByTestId("opening-row")).toHaveCount(2);

  await rp.getByTestId("opening-row").filter({ hasText: "Second opening" }).getByRole("button", { name: "Edit" }).click();
  await rp.getByLabel("Title (optional)").fill("Second opening (renamed)");
  await rp.getByRole("button", { name: "Save job opening" }).click();
  await expect(rp.getByTestId("opening-row").filter({ hasText: "renamed" })).toBeVisible();

  // The company admin sees both, with who created them, and was told about each.
  const ap = await (await browser.newContext()).newPage();
  await signIn(ap, w.admin.email, "/company-admin");
  await ap.getByRole("navigation", { name: "Company admin navigation" }).getByRole("link", { name: "Job openings" }).click();
  await expect(ap.getByTestId("opening-row")).toHaveCount(2);
  await expect(ap.getByTestId("opening-row").first()).toContainText(`recruiter ${w.tag}`);
  await ap.getByRole("navigation", { name: "Company admin navigation" }).getByRole("link", { name: /^Notifications/ }).click();
  await expect(ap.getByTestId("notification").filter({ hasText: "New job opening" })).toHaveCount(2);

  await rp.getByTestId("opening-row").filter({ hasText: "renamed" }).getByRole("button", { name: "Delete" }).click();
  await expect(rp.getByTestId("opening-row")).toHaveCount(1);
});

test("shortlist: add from the search, move through the pipeline with dates, add a note and remove", async ({ page }) => {
  const w = await company("sl");
  const opening = await openingFor(w, { title: "Pipeline role" });
  const eve = await candidate("eve", { city: "Sukkur", display: `Eve Pipeline ${kit.run}` });
  await signIn(page, w.recruiter.email, "/recruiter");
  await page.goto(`/recruiter/candidates?role=${kit.role.id}&city=Sukkur`);
  const row = page.getByTestId("candidate-row").filter({ hasText: "Eve Pipeline" });
  await row.getByRole("button", { name: "Shortlist" }).click();
  await expect(row.getByTestId("already-shortlisted")).toBeVisible();

  await page.getByRole("navigation", { name: "Recruiter navigation" }).getByRole("link", { name: "Shortlists" }).click();
  await expect(page.getByTestId("pipeline-summary")).toContainText("Shortlisted 1");
  await expect(page.getByTestId("shortlist-limit")).toContainText("no limit");
  const entry = page.getByTestId("shortlist-entry");
  await expect(entry).toContainText("Eve Pipeline");
  await entry.getByTestId("stage-select").selectOption("CONTACTED");
  await expect(page.getByTestId("pipeline-summary")).toContainText("Contacted 1");
  await entry.getByTestId("stage-select").selectOption("INTERVIEWING");
  await expect(page.getByTestId("pipeline-summary")).toContainText("Interviewing 1");
  await entry.getByLabel(/Note for/).fill("Interview on Monday");
  await entry.getByRole("button", { name: "Save note" }).click();
  await entry.getByRole("button", { name: "Dates" }).click();
  await expect(entry.getByTestId("history").getByRole("listitem")).toHaveCount(3);
  await expect(entry.getByTestId("history")).toContainText("Shortlisted on");
  await expect(entry.getByTestId("history")).toContainText("Interviewing on");

  const saved = await prisma.shortlist.findFirstOrThrow({ where: { candidateProfileId: eve.profileId, jobOpeningId: opening.id } });
  expect(saved).toMatchObject({ status: "INTERVIEWING", note: "Interview on Monday" });
  await entry.getByTestId("stage-select").selectOption("HIRED");
  await expect(page.getByTestId("pipeline-summary")).toContainText("Hired 1");
  // The company admin is told about the hire.
  expect(await prisma.notification.count({ where: { userId: w.admin.id, title: { startsWith: "A hire for" } } })).toBe(1);

  await entry.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("shortlist-entry")).toHaveCount(0);
});

test("the shortlist limit of a plan stops a recruiter and explains how to make room", async ({ page }) => {
  const w = await company("sl2", { features: { allCandidates: true, maxShortlists: 1, maxJobOpenings: null } });
  await openingFor(w);
  await candidate("lim1", { city: "Hyderabad", years: 5, display: `Limit One ${kit.run}` });
  await candidate("lim2", { city: "Hyderabad", years: 4, display: `Limit Two ${kit.run}` });
  await signIn(page, w.recruiter.email, "/recruiter");
  await page.goto(`/recruiter/candidates?role=${kit.role.id}&city=Hyderabad&sort=experience`);
  const rows = page.getByTestId("candidate-row");
  await rows.first().getByRole("button", { name: "Shortlist" }).click();
  await expect(rows.first().getByTestId("already-shortlisted")).toBeVisible();
  await rows.nth(1).getByRole("button", { name: "Shortlist" }).click();
  await expect(rows.nth(1).getByRole("alert")).toContainText("allows 1 shortlisted candidates");
});

test("contact request: a recruiter asks, the candidate accepts under Recruiter requests, and only then are contact details shown", async ({ browser }) => {
  const w = await company("cr");
  const opening = await openingFor(w, { title: "Contact role", max: 90_000 });
  const fay = await candidate("fay", { display: `Fay Contact ${kit.run}` });
  const gus = await candidate("gus", { minimum: 150_000, display: `Gus Expensive ${kit.run}` });

  const rp = await (await browser.newContext()).newPage();
  await signIn(rp, w.recruiter.email, "/recruiter");
  await rp.goto(`/recruiter/candidates/${fay.profileId}?opening=${opening.id}`);
  await expect(rp.getByTestId("contact-details")).toHaveCount(0);
  await rp.getByLabel("Message (optional)").fill("We would like to talk about this role.");
  await rp.getByRole("button", { name: "Send contact request" }).click();
  await expect(rp.getByTestId("request-sent")).toBeVisible();

  // The salary rule is enforced by the server, whatever the page offers.
  const refused = await rp.request.post("/api/recruiter/contact-requests", { data: { candidateProfileId: gus.profileId, jobOpeningId: opening.id } });
  expect(refused.status()).toBe(404);
  expect((await refused.json()).code).toBe("CANDIDATE_NOT_AVAILABLE");

  await rp.goto("/recruiter/contact-requests");
  await expect(rp.getByTestId("request-summary")).toContainText("Waiting 1");
  await expect(rp.getByTestId("request-row")).toContainText("Fay Contact");
  await expect(rp.getByTestId("request-row")).toContainText("After they accept");

  // The candidate answers.
  const cp = await (await browser.newContext()).newPage();
  await logInAs(cp, fay.email, KIT_PASSWORD);
  await expect(cp).toHaveURL(/\/candidate$/);
  await cp.getByRole("navigation", { name: "Candidate navigation" }).getByRole("link", { name: "Recruiter requests" }).click();
  const request = cp.getByTestId("request");
  await expect(request).toContainText("Waiting for you");
  await expect(request).toContainText("We would like to talk about this role.");
  await request.getByRole("button", { name: "Accept" }).click();
  await expect(request).toContainText("Accepted");

  // Back with the recruiter: accepted, with contact details, and a notification.
  await rp.reload();
  await expect(rp.getByTestId("request-summary")).toContainText("Accepted 1");
  await expect(rp.getByTestId("request-row")).toContainText(fay.email);
  await expect(rp.getByTestId("request-row")).toContainText("03001112223");
  await rp.goto(`/recruiter/candidates/${fay.profileId}?opening=${opening.id}`);
  await expect(rp.getByTestId("contact-details")).toContainText(fay.email);
  await rp.getByRole("navigation", { name: "Recruiter navigation" }).getByRole("link", { name: /^Notifications/ }).click();
  await expect(rp.getByTestId("notification").filter({ hasText: "Contact request accepted" })).toBeVisible();
});

test("recruiter dashboard and reports show the funnel, time to hire and charts", async ({ page }) => {
  const w = await company("rp");
  const opening = await openingFor(w);
  const DAY = 86_400_000;
  const ids: string[] = [];
  for (const [name, steps] of [["r1", [["SHORTLISTED", 20], ["CONTACTED", 15], ["INTERVIEWING", 10], ["OFFERED", 6], ["HIRED", 2]]], ["r2", [["SHORTLISTED", 9], ["CONTACTED", 5]]], ["r3", [["SHORTLISTED", 4]]]] as const) {
    const c = await candidate(name, { city: name === "r3" ? "Karachi" : "Lahore" });
    const e = await prisma.shortlist.create({ data: { recruiterId: w.recruiter.id, candidateProfileId: c.profileId, jobOpeningId: opening.id, status: steps.at(-1)![0], createdAt: new Date(Date.now() - steps[0][1] * DAY) } });
    await prisma.shortlistStatusHistory.createMany({ data: steps.map(([status, d]) => ({ shortlistId: e.id, status, changedAt: new Date(Date.now() - d * DAY) })) });
    ids.push(e.id);
  }
  await signIn(page, w.recruiter.email, "/recruiter");
  await expect(page.getByTestId("funnel")).toContainText("Shortlisted");
  await expect(page.getByTestId("funnel")).toContainText("3");
  await expect(page.getByTestId("dashboard-cities")).toContainText("Lahore");

  await page.getByRole("navigation", { name: "Recruiter navigation" }).getByRole("link", { name: "Reports" }).click();
  await expect(page.getByTestId("avg-days")).toContainText("18 days");
  await expect(page.getByTestId("activity")).toBeVisible();
  await expect(page.getByTestId("by-city")).toContainText("Lahore");
  await expect(page.getByTestId("by-role")).toContainText(`Test role ${kit.run}`);
  for (const t of ["IQ", "EQ", "Language", "Job skill"]) await expect(page.getByTestId(`quartiles-${t}`)).toBeVisible();
  await page.getByRole("link", { name: "Last 365 days" }).click();
  await expect(page).toHaveURL(/days=365/);
  await expect(page.getByTestId("funnel")).toBeVisible();
  void ids;
});

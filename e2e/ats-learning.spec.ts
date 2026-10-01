import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { createKit, type Kit } from "../src/lib/testEngine/testkit";
import { createCompany, type World } from "../src/lib/recruiter/testWorld";
import { addToShortlist } from "../src/lib/recruiter/shortlist";
import { deleteTestData, logInAs, prisma, uniqueEmail } from "./helpers";

// Day 6: the default offer, API keys, webhooks with a delivery log, the mock ATS, push and export, and the platform
// admin's self-learning, scheduled-job, fairness and audit-log screens. Own companies, candidates and admin throughout.
test.describe.configure({ mode: "serial" });

const PASSWORD = "x-pass-12345";
let kit: Kit;
let world: World;
const adminEmails: string[] = [];

test.beforeAll(async () => {
  kit = await createKit(prisma, "e2ed6");
  world = await createCompany(prisma, `${kit.run}x`);
});
test.afterAll(async () => {
  await prisma.webhookDelivery.deleteMany({ where: { endpoint: { companyId: world.company.id } } });
  await prisma.webhookEndpoint.deleteMany({ where: { companyId: world.company.id } });
  await prisma.apiKey.deleteMany({ where: { companyId: world.company.id } });
  await prisma.mockAtsCandidate.deleteMany({ where: { companyId: world.company.id } });
  await world.cleanup();
  await kit.cleanup();
  if (adminEmails.length) await deleteTestData(adminEmails);
});

async function signIn(page: Page, email: string, home: string, password = PASSWORD) {
  await logInAs(page, email, password);
  await expect(page).toHaveURL(new RegExp(`${home}$`));
}

test("search defaults to the most recent open job opening and says which one", async ({ page }) => {
  const fits = await kit.addCandidate("fit");
  await prisma.user.update({ where: { id: fits.userId }, data: { name: `Default Fit ${kit.run}` } });
  await prisma.candidateProfile.update({ where: { id: fits.profileId }, data: { minimumSalary: 60_000, city: "Multan" } });
  await prisma.jobOpening.create({ data: { companyId: world.company.id, createdById: world.recruiter.id, jobRoleId: kit.role.id, title: `Older ${kit.run}`, salaryRangeMin: 1, salaryRangeMax: 30_000, createdAt: new Date(Date.now() - 5 * 86_400_000) } });
  await prisma.jobOpening.create({ data: { companyId: world.company.id, createdById: world.recruiter.id, jobRoleId: kit.role.id, title: `Newest ${kit.run}`, salaryRangeMin: 1, salaryRangeMax: 80_000 } });

  await signIn(page, world.recruiter.email, "/recruiter");
  await page.goto(`/recruiter/candidates?role=${kit.role.id}&city=Multan`);
  await expect(page.getByTestId("default-offer")).toContainText(`Newest ${kit.run}`);
  await expect(page.getByTestId("default-offer")).toContainText("80,000");
  await expect(page.getByTestId("no-offer")).toHaveCount(0);
  await expect(page.getByTestId("candidate-row")).toHaveCount(1);
  await expect(page.getByTestId("candidate-row")).toContainText("Default Fit");

  // Typing an amount replaces the default, and a lower amount hides the candidate.
  await page.getByLabel("Highest salary you can offer").fill("50000");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByTestId("default-offer")).toHaveCount(0);
  await expect(page.getByTestId("candidate-row")).toHaveCount(0);
});

test("a company admin creates an API key (shown once), uses it on the REST API, then revokes it", async ({ page }) => {
  await signIn(page, world.admin.email, "/company-admin");
  await page.goto("/company-admin/api-keys");
  await page.getByLabel("Name for the new key").fill("E2E key");
  await page.getByRole("button", { name: "Create API key" }).click();
  const key = (await page.getByTestId("new-key-value").innerText()).trim();
  expect(key).toMatch(/^wfp_/);
  await expect(page.getByTestId("key-row")).toContainText("E2E key");
  await expect(page.getByTestId("keys-table")).not.toContainText(key); // only the start of the key is listed

  const asKey = (k: string) => ({ headers: { Authorization: `Bearer ${k}` } });
  const ok = await page.request.get("/api/v1/job-openings", asKey(key));
  expect(ok.status()).toBe(200);
  expect((await page.request.get("/api/v1/job-openings", asKey("wfp_notarealkey"))).status()).toBe(401);
  expect((await page.request.get("/api/v1/job-openings")).status()).toBe(401);

  await page.getByRole("button", { name: "Revoke" }).first().click();
  await expect(page.getByTestId("key-row")).toContainText("Revoked");
  expect((await page.request.get("/api/v1/job-openings", asKey(key))).status()).toBe(401);
});

test("webhooks: add one, send a test, see it in the delivery log; bad addresses are refused", async ({ page }) => {
  await signIn(page, world.admin.email, "/company-admin");
  await page.goto("/company-admin/integrations");

  await page.getByLabel("Address that should receive events").fill("http://10.0.0.5/hook");
  await page.getByLabel("A candidate was shortlisted").check();
  await page.getByRole("button", { name: "Add webhook" }).click();
  await expect(page.getByTestId("webhook-error")).toBeVisible();

  await page.getByLabel("Address that should receive events").fill("http://localhost:7330/api/mock-ats/receive");
  await page.getByRole("button", { name: "Add webhook" }).click();
  await expect(page.getByTestId("new-secret-value")).toContainText("whsec_");
  await expect(page.getByTestId("webhook-row")).toHaveCount(1);

  await page.getByRole("button", { name: "Send test" }).click();
  await expect(page.getByTestId("webhook-message")).toContainText("delivered");
  await expect(page.getByTestId("delivery-row").first()).toContainText("webhook.test");
  await expect(page.getByTestId("delivery-row").first()).toContainText("Delivered");
});

test("a recruiter pushes a shortlisted candidate to the mock ATS, downloads the CSV, and the company admin sees it arrive", async ({ page, browser }) => {
  const c = await kit.addCandidate("push");
  const name = `Push Me ${kit.run}`;
  await prisma.user.update({ where: { id: c.userId }, data: { name } });
  await prisma.candidateProfile.update({ where: { id: c.profileId }, data: { minimumSalary: 40_000 } });
  const opening = await prisma.jobOpening.create({ data: { companyId: world.company.id, createdById: world.recruiter.id, jobRoleId: kit.role.id, title: `Push opening ${kit.run}`, salaryRangeMin: 1, salaryRangeMax: 90_000 } });
  await addToShortlist(prisma, { recruiterId: world.recruiter.id, candidateProfileId: c.profileId, jobOpeningId: opening.id });

  await signIn(page, world.recruiter.email, "/recruiter");
  await page.goto("/recruiter/ats-export");
  const row = page.getByTestId("push-row").filter({ hasText: name });
  await expect(row).toContainText("Not pushed");
  await row.getByRole("checkbox").check();
  await page.getByTestId("push-button").click();
  await expect(page.getByTestId("push-message")).toContainText("Pushed 1 candidate");
  await expect(page.getByTestId("push-row").filter({ hasText: name })).not.toContainText("Not pushed");

  const csv = await page.request.get("/api/recruiter/ats/export?format=csv");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const text = await csv.text();
  expect(text).toContain(name);
  expect(text).not.toMatch(/50000|50,000/); // the minimum salary is never exported
  const xlsx = await page.request.get("/api/recruiter/ats/export?format=xlsx");
  expect(xlsx.status()).toBe(200);
  expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK"); // a zip file

  const adminPage = await (await browser.newContext()).newPage();
  await signIn(adminPage, world.admin.email, "/company-admin");
  await adminPage.goto("/company-admin/integrations");
  await expect(adminPage.getByTestId("mock-ats-row").filter({ hasText: name })).toBeVisible();
  await adminPage.close();
});

test("the platform admin runs recalibration and the jobs by hand, makes a fairness report, and reads the audit log", async ({ page }) => {
  const email = uniqueEmail("d6-admin");
  adminEmails.push(email);
  await prisma.user.create({ data: { email, name: "E2E learning admin", password: await bcrypt.hash(PASSWORD, 10), role: "PLATFORM_ADMIN", emailVerified: new Date() } });
  await signIn(page, email, "/admin");

  await page.goto("/admin/recalibration");
  const before = await page.getByTestId("recal-row").count();
  await page.getByTestId("run-recalibration").click();
  await expect(page.getByText("Done.")).toBeVisible();
  await expect(page.getByTestId("recal-row")).toHaveCount(Math.min(before + 1, 20));
  await expect(page.getByTestId("recal-row").first()).toContainText("Completed");

  await page.goto("/admin/jobs");
  await expect(page.getByTestId("job-row")).toHaveCount(5);
  await page.getByTestId("job-row").filter({ hasText: "Webhook retries" }).getByTestId("run-webhook-retries").click();
  await expect(page.getByText("Done.")).toBeVisible();
  await expect(page.getByTestId("job-row").filter({ hasText: "Webhook retries" })).toContainText("completed");

  await page.goto("/admin/fairness");
  await page.getByTestId("generate-fairness").click();
  await expect(page.getByTestId("fairness-report")).toBeVisible();
  for (const t of ["IQ", "EQ", "LANGUAGE", "SKILL"]) await expect(page.getByTestId(`fairness-${t}`)).toBeVisible();

  await page.goto("/admin/item-analysis");
  await expect(page.getByRole("heading", { level: 1, name: "Item analysis" })).toBeVisible();

  await page.goto("/admin/audit-log?action=JOB_RUN_MANUALLY");
  await expect(page.getByTestId("audit-row").first()).toContainText("job run manually");
  await expect(page.getByTestId("audit-row").first()).toContainText("E2E learning admin");
});

test("other roles cannot reach the learning, jobs, fairness and audit screens or their APIs", async ({ page }) => {
  await signIn(page, world.recruiter.email, "/recruiter");
  for (const path of ["/admin/jobs", "/admin/fairness", "/admin/audit-log", "/admin/recalibration", "/admin/item-analysis"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/unauthorized/);
  }
  expect((await page.request.post("/api/admin/jobs/recalibration/run")).status()).toBe(403);
  expect((await page.request.post("/api/admin/fairness/generate", { data: { month: "2026-09" } })).status()).toBe(403);
  expect((await page.request.post("/api/jobs/run")).status()).toBeGreaterThanOrEqual(401); // 404 when no secret is set, else 401
});

test("a request from another website cannot change data", async ({ page }) => {
  await signIn(page, world.admin.email, "/company-admin");
  const res = await page.request.post("/api/company/api-keys", { data: { label: "evil" }, headers: { Origin: "https://evil.example" } });
  expect(res.status()).toBe(403);
  expect((await res.json()).code).toBe("CROSS_SITE_BLOCKED");
  expect(await prisma.apiKey.count({ where: { companyId: world.company.id, label: "evil" } })).toBe(0);
});

import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { createKit, type Kit } from "../src/lib/testEngine/testkit";
import { createCompany, type World } from "../src/lib/recruiter/testWorld";
import { logInAs, prisma } from "./helpers";

// Integrity part D: companies see integrity in search (three states, a filter that stays in the address) and on the report,
// and can report a concern, which the platform admin sees in Integrity review.
test.describe.configure({ mode: "serial" });

const ADMIN_PASSWORD = "kit-password-1";
const RECRUITER_PASSWORD = "x-pass-12345"; // the password createCompany gives its users
let kit: Kit;
let world: World;
let adminId: string;
let adminEmail: string;
const startedAt = new Date();
const names = { none: "", info: "", concern: "" };

test.beforeAll(async () => {
  kit = await createKit(prisma, "e2e-intd");
  world = await createCompany(prisma, `e2eintd${kit.run}`);
  adminEmail = `intd-admin-${kit.run}@example.test`;
  adminId = (await prisma.user.create({ data: { email: adminEmail, name: "Integrity D Admin", password: await bcrypt.hash(ADMIN_PASSWORD, 10), role: "PLATFORM_ADMIN" } })).id;

  const threshold = ((await prisma.siteSetting.findUnique({ where: { key: "testing" } }))?.value as { integrityFlagThreshold?: number } | undefined)?.integrityFlagThreshold ?? 3;
  for (const [key, exits] of [["none", 0], ["info", threshold - 1], ["concern", threshold]] as const) {
    const c = await kit.addCandidate(key);
    names[key] = `Pat ${kit.run} ${key}`;
    const s = await prisma.testSession.create({ data: { candidateProfileId: c.profileId, testType: "IQ", status: "COMPLETED", completedAt: new Date(), languageId: kit.language.id } });
    await prisma.score.create({ data: { candidateProfileId: c.profileId, sessionId: s.id, testType: "IQ", rawScore: 50, quartile: 2, percentile: 60, rankValue: 0.3, cohortScope: "ALL", cohortSize: 40 } });
    for (let i = 1; i <= exits; i++) await prisma.auditLog.create({ data: { actorId: adminId, action: "TEST_FOCUS_LOST", targetType: "TestSession", targetId: s.id, metadata: { testType: "IQ", count: i } } });
  }
});

test.afterAll(async () => {
  await prisma.notification.deleteMany({ where: { title: "A company reported an integrity concern", createdAt: { gte: startedAt } } });
  await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
  await prisma.concernReport.deleteMany({ where: { reviewedById: adminId } });
  await world.cleanup();
  await kit.cleanup();
  await prisma.notification.deleteMany({ where: { userId: adminId } }); // other tests may have notified every admin
  await prisma.user.delete({ where: { id: adminId } });
});

async function signIn(page: Page, email: string, password: string, url: RegExp) {
  await page.context().clearCookies();
  await logInAs(page, email, password);
  await expect(page).toHaveURL(url);
}

const searchUrl = (extra = "") => `/recruiter/candidates?role=${kit.role.id}&offer=100000${extra}`;

test("search: an Integrity column with three states, and a filter that stays in the address", async ({ page }) => {
  await signIn(page, world.recruiter.email, RECRUITER_PASSWORD, /\/recruiter$/);
  await page.goto(searchUrl());
  await expect(page.getByRole("columnheader", { name: "Integrity" })).toBeVisible();
  const row = (key: keyof typeof names) => page.getByTestId("candidate-row").filter({ hasText: names[key] });

  await expect(row("none").getByTestId("integrity")).toHaveText("✓ No concerns");
  await expect(row("none").getByTestId("integrity")).toHaveAttribute("data-level", "none");
  await expect(row("info").getByTestId("integrity")).toHaveText(/^\d+ exits?$/);
  await expect(row("info").getByTestId("integrity")).toHaveAttribute("data-level", "info");
  await expect(row("concern").getByTestId("integrity")).toHaveText(/^⚠ \d+ exits?$/);
  await expect(row("concern").getByTestId("integrity")).toHaveAttribute("data-level", "concern");
  await expect(row("concern").getByTestId("integrity")).toHaveClass(/text-red-700/); // red for a concern
  await expect(row("info").getByTestId("integrity")).toHaveClass(/text-zinc-600/); // neutral grey for information only
  await expect(row("info").getByTestId("integrity")).not.toHaveClass(/text-red/);

  // The filter removes only the candidate at or above the threshold, and is part of the address.
  await page.getByTestId("filter-clean").check();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/clean=1/);
  await expect(row("none")).toHaveCount(1);
  await expect(row("info")).toHaveCount(1);
  await expect(row("concern")).toHaveCount(0);

  await page.goto(searchUrl("&clean=1")); // bookmarked address
  await expect(page.getByTestId("filter-clean")).toBeChecked();
  await expect(row("concern")).toHaveCount(0);
  await expect(row("none")).toHaveCount(1);
});

test("report: the same states, then a concern is reported once and the platform admin sees it", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, world.recruiter.email, RECRUITER_PASSWORD, /\/recruiter$/);
  await page.goto(searchUrl());
  await page.getByTestId("candidate-row").filter({ hasText: names.concern }).getByRole("link", { name: names.concern }).click();
  await expect(page.getByTestId("candidate-name")).toContainText(names.concern);
  await expect(page.getByTestId("integrity-IQ")).toHaveAttribute("data-level", "concern");
  await expect(page.getByTestId("integrity-IQ")).toContainText("Integrity: concern");

  // The reason is required.
  await page.getByTestId("report-concern-IQ").click();
  await expect(page.getByTestId("concern-send-IQ")).toBeDisabled();
  await page.getByTestId("concern-reason-IQ").fill("Answers came in much too fast for the questions.");
  await page.getByTestId("concern-send-IQ").click();
  await expect(page.getByTestId("reported-IQ")).toContainText("Your company reported a concern");
  await expect(page.getByTestId("report-concern-IQ")).toHaveCount(0);

  // Reloading keeps it: a company reports a result once.
  await page.reload();
  await expect(page.getByTestId("reported-IQ")).toBeVisible();
  expect(await prisma.concernReport.count({ where: { companyId: world.company.id } })).toBe(1);

  // The candidate with fewer exits has no report and can still be reported; nothing changed for the result itself.
  const score = await prisma.score.findFirstOrThrow({ where: { candidateProfile: { user: { name: names.concern } }, testType: "IQ" } });
  expect(score.voidedAt).toBeNull();

  // Platform admin: the report is in Integrity review, "Reported by companies".
  await signIn(page, adminEmail, ADMIN_PASSWORD, /\/admin$/);
  await page.goto("/admin/integrity-review");
  await expect(page.getByRole("heading", { name: "Reported by companies" })).toBeVisible();
  const open = page.getByTestId("concerns-open").getByTestId("concern-row").filter({ hasText: names.concern });
  await expect(open).toHaveCount(1);
  await expect(open).toContainText(world.company.name);
  await expect(open).toContainText(world.recruiter.name ?? "");
  await expect(open).toContainText("IQ");
  await expect(open).toContainText("Answers came in much too fast");

  await open.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.getByTestId("concerns-open").getByTestId("concern-row").filter({ hasText: names.concern })).toHaveCount(0);
  await expect(page.getByTestId("concerns-reviewed").getByTestId("concern-row").filter({ hasText: names.concern })).toHaveCount(1);
  expect(await prisma.auditLog.count({ where: { action: "CONCERN_REVIEWED", actorId: adminId } })).toBe(1);
});

test("a candidate cannot reach the concern routes", async ({ page }) => {
  const c = await kit.addCandidate("nosyd");
  await signIn(page, c.email, "kit-password-1", /\/candidate$/);
  const res = await page.request.post(`/api/recruiter/candidates/${c.profileId}/concern`, { data: { testType: "IQ", reason: "x", offer: 100000 } });
  expect(res.status()).toBe(403);
  const res2 = await page.request.post("/api/admin/integrity/concerns/whatever", { data: { action: "review" } });
  expect(res2.status()).toBe(403);
});

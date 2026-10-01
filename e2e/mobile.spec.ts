import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { allNavItems, navHref } from "../src/lib/navigation";
import { createKit, type Kit } from "../src/lib/testEngine/testkit";
import { createCompany, type World } from "../src/lib/recruiter/testWorld";
import { deleteTestData, logInAs, prisma, uniqueEmail } from "./helpers";

// The phone check: every screen of every role, and the public pages, at 390 px wide. Each page must show its heading
// and must never scroll sideways. Own accounts throughout (the demo logins are limited to a few tries).
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
test.describe.configure({ mode: "serial" });

const PASSWORD = "x-pass-12345";
const KIT_PASSWORD = "kit-password-1";
let kit: Kit;
let world: World;
let candidateEmail: string;
let candidateProfileId: string;
const adminEmails: string[] = [];

test.beforeAll(async () => {
  kit = await createKit(prisma, "e2em");
  world = await createCompany(prisma, `${kit.run}m`);
  const c = await kit.addCandidate("phone");
  candidateEmail = c.email;
  candidateProfileId = c.profileId;
  await prisma.candidateProfile.update({ where: { id: c.profileId }, data: { gender: "FEMALE" } });
  for (const t of ["IQ", "EQ"] as const) {
    const s = await prisma.testSession.create({ data: { candidateProfileId: c.profileId, testType: t, status: "COMPLETED", completedAt: new Date() } });
    await prisma.score.create({ data: { candidateProfileId: c.profileId, sessionId: s.id, testType: t, rawScore: 70, quartile: 1, percentile: 90, rankValue: 0, cohortScope: "ALL", cohortSize: 60 } });
  }
  const opening = await prisma.jobOpening.create({ data: { companyId: world.company.id, createdById: world.recruiter.id, jobRoleId: kit.role.id, title: "Phone opening", city: "Lahore", salaryRangeMin: 40_000, salaryRangeMax: 90_000 } });
  await prisma.shortlist.create({ data: { recruiterId: world.recruiter.id, candidateProfileId: c.profileId, jobOpeningId: opening.id } });
});

test.afterAll(async () => {
  await prisma.mockAtsCandidate.deleteMany({ where: { companyId: world.company.id } });
  await world.cleanup();
  await kit.cleanup();
  if (adminEmails.length) await deleteTestData(adminEmails);
});

async function expectFits(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), `${path} should load`).toBeLessThan(400);
  await expect.soft(page.getByRole("heading", { level: 1 }).first(), `${path} heading`).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect.soft(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0); // soft: one run lists every screen that needs fixing
}

async function tour(page: Page, role: Role, extras: string[]) {
  const paths = [...new Set([...allNavItems(role).map((i) => navHref(role, i)), ...extras])];
  for (const path of paths) await expectFits(page, path);
}

test("public pages fit a phone", async ({ page }) => {
  for (const path of ["/", "/login", "/signup", "/signup/company", "/forgot-password", "/privacy"]) await expectFits(page, path);
});

test("candidate screens fit a phone", async ({ page }) => {
  await logInAs(page, candidateEmail, KIT_PASSWORD);
  await expect(page).toHaveURL(/\/candidate$/);
  await tour(page, "CANDIDATE", ["/candidate/tests", "/candidate/results", "/candidate/profile", "/candidate/badges", "/candidate/training", "/candidate/contact-requests"]);
});

test("recruiter screens fit a phone", async ({ page }) => {
  await logInAs(page, world.recruiter.email, PASSWORD);
  await expect(page).toHaveURL(/\/recruiter$/);
  await tour(page, "RECRUITER", [`/recruiter/candidates?role=${kit.role.id}`, `/recruiter/candidates/${candidateProfileId}`, "/recruiter/ats-export", "/recruiter/shortlists", "/recruiter/reports"]);
});

test("company admin screens fit a phone", async ({ page }) => {
  await logInAs(page, world.admin.email, PASSWORD);
  await expect(page).toHaveURL(/\/company-admin$/);
  await tour(page, "COMPANY_ADMIN", ["/company-admin/api-keys", "/company-admin/integrations", "/company-admin/subscription", "/company-admin/reports", "/company-admin/job-openings"]);
});

test("platform admin screens fit a phone", async ({ page }) => {
  const email = uniqueEmail("m-admin");
  adminEmails.push(email);
  await prisma.user.create({ data: { email, name: "E2E phone admin", password: await bcrypt.hash(PASSWORD, 10), role: "PLATFORM_ADMIN", emailVerified: new Date() } });
  await logInAs(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/admin$/);
  await tour(page, "PLATFORM_ADMIN", ["/admin/question-bank/new", "/admin/question-bank/generate", "/admin/item-analysis?view=all", "/admin/fairness", "/admin/audit-log", "/admin/jobs", "/admin/recalibration", `/admin/companies/${world.company.id}`]);
});

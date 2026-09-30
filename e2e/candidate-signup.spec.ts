import { test, expect } from "@playwright/test";
import { prisma, randomIp, uniqueEmail } from "./helpers";

test.use({ extraHTTPHeaders: { "x-forwarded-for": randomIp() } });

test("candidate can sign up, reaches their dashboard, and is denied other roles' areas", async ({
  page,
}) => {
  const email = uniqueEmail("candidate");

  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Test Candidate");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("supersecret1");
  await page.getByLabel("Phone").fill("03001234567");
  await page.getByLabel("City").fill("Lahore");
  await page.getByLabel("Region").selectOption({ label: "Punjab" });
  await page.getByLabel("Years of experience").fill("2");
  await page.getByLabel("Job role").selectOption({ label: "IT Support" });
  await page.getByLabel("Minimum expected salary").fill("60000");
  await page.getByLabel(/I agree to the/).check();

  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/candidate$/);
  await expect(page.getByRole("heading", { name: "Welcome, Test Candidate" })).toBeVisible();

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/unauthorized/);

  await page.goto("/company-admin");
  await expect(page).toHaveURL(/\/unauthorized/);

  await page.goto("/recruiter");
  await expect(page).toHaveURL(/\/unauthorized/);

  await prisma.user.delete({ where: { email } }).catch(() => {});
});

test("candidate signup rejects a duplicate email", async ({ page }) => {
  const email = uniqueEmail("dupe");

  await prisma.user.create({
    data: { email, password: "irrelevant", role: "CANDIDATE", name: "Existing" },
  });

  const region = await prisma.region.findFirstOrThrow();
  const jobRole = await prisma.jobRole.findFirstOrThrow();

  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Another Candidate");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("supersecret1");
  await page.getByLabel("Phone").fill("03001234567");
  await page.getByLabel("City").fill("Karachi");
  await page.getByLabel("Region").selectOption({ label: region.name });
  await page.getByLabel("Years of experience").fill("1");
  await page.getByLabel("Job role").selectOption({ label: jobRole.name });
  await page.getByLabel("Minimum expected salary").fill("40000");
  await page.getByLabel(/I agree to the/).check();

  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText(/already exists/i)).toBeVisible();
  await expect(page).toHaveURL(/\/signup$/);

  await prisma.user.delete({ where: { email } }).catch(() => {});
});

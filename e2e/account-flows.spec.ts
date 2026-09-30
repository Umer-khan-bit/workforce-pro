import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { createAuthToken } from "../src/lib/authTokens";
import { deleteTestData, logInAs, prisma, randomIp, uniqueEmail } from "./helpers";

// Signups are rate limited per IP, so this file uses its own address.
test.use({ extraHTTPHeaders: { "x-forwarded-for": randomIp() } });

const PASSWORD = "supersecret1";

// Accounts made by tests that create users directly; removed even if the test fails half-way.
const cleanup: string[] = [];
test.afterAll(async () => {
  if (cleanup.length) await deleteTestData(cleanup);
});

async function signUpCandidate(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Flow Candidate");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Phone").fill("03001234567");
  await page.getByLabel("Region").selectOption({ label: "Punjab" });
  await page.getByLabel("City").selectOption({ label: "Lahore" });
  await page.getByLabel("Years of experience").fill("2");
  await page.getByLabel("Job role").selectOption({ label: "IT Support" });
  await page.getByLabel("Minimum expected salary").fill("60000");
  await page.getByLabel(/I agree to the/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/candidate$/);
}

test("forgot password: request a link, reset once, old password and old sessions stop working", async ({ page, browser }) => {
  const email = uniqueEmail("forgot");
  cleanup.push(email);
  const user = await prisma.user.create({
    data: { email, password: await bcrypt.hash("old-password-1", 10), role: "CANDIDATE", name: "Forgetful", emailVerified: new Date() },
  });

  // A session opened before the reset.
  const oldSession = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": randomIp() } })).newPage();
  await logInAs(oldSession, email, "old-password-1");
  await expect(oldSession).toHaveURL(/\/candidate$/);

  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);

  // The answer is identical for an address that has no account.
  await page.getByLabel("Email").fill(uniqueEmail("ghost"));
  await page.getByRole("button", { name: "Send reset link" }).click();
  const unknownAnswer = await page.getByRole("status").innerText();
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  expect(await page.getByRole("status").innerText()).toBe(unknownAnswer);
  await expect(page.getByRole("status")).toContainText("If an account exists");

  // The link itself only goes by email (here: the server console), so make a token the same way the app does.
  const token = await createAuthToken(prisma, user.id, "PASSWORD_RESET", 60_000);
  await page.goto(`/reset-password?token=${token}`);
  await page.getByLabel("New password", { exact: true }).fill("new-password-22");
  await page.getByLabel("Repeat the new password").fill("different-22");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "do not match" })).toBeVisible();

  await page.getByLabel("Repeat the new password").fill("new-password-22");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(/\/login\?notice=reset/);
  await expect(page.getByRole("status")).toContainText("Your password has been changed");

  // New password works, old one does not.
  await logInAs(page, email, "old-password-1");
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  await logInAs(page, email, "new-password-22");
  await expect(page).toHaveURL(/\/candidate$/);

  // The link cannot be used again.
  await page.goto(`/reset-password?token=${token}`);
  await page.getByLabel("New password", { exact: true }).fill("third-password-3");
  await page.getByLabel("Repeat the new password").fill("third-password-3");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "invalid or has expired" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ask for a new link" })).toBeVisible();

  // The session that was open before the reset has ended.
  await oldSession.goto("/candidate");
  await expect(oldSession).toHaveURL(/\/login/);

  await deleteTestData([email]);
});

test("email confirmation: banner for unverified users, resend, confirm once, banner gone", async ({ page }) => {
  const email = uniqueEmail("verify");
  try {
    await signUpCandidate(page, email);
    const banner = page.getByRole("status").filter({ hasText: "Please confirm your email address" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("cannot take assessments or contact candidates");

    await banner.getByRole("button", { name: "Send the link again" }).click();
    await expect(banner).toContainText(/link was written to the server log|on its way/);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerified).toBeNull();
    expect(await prisma.authToken.count({ where: { userId: user.id, kind: "EMAIL_VERIFICATION", usedAt: null } })).toBe(1);

    const token = await createAuthToken(prisma, user.id, "EMAIL_VERIFICATION", 60_000);
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByText("Your email address is confirmed.")).toBeVisible();
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerified).not.toBeNull();

    await page.getByRole("link", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/candidate$/);
    await expect(page.getByText("Please confirm your email address")).toHaveCount(0);

    // A second use of the same link fails.
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole("alert").filter({ hasText: "invalid or has expired" })).toBeVisible();
  } finally {
    await deleteTestData([email]);
  }
});

test("a new company starts on the default plan's free trial and sees the upgrade page", async ({ page }) => {
  const email = uniqueEmail("trial");
  const companyName = `Trial Co ${Date.now()}`;
  try {
    await page.goto("/signup/company");
    await page.getByLabel("Company name").fill(companyName);
    await page.getByLabel("Your name").fill("Trial Admin");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create company account" }).click();
    await expect(page).toHaveURL(/\/company-admin$/);

    const callout = page.getByRole("status").filter({ hasText: "Free trial" });
    await expect(callout).toContainText(/\d+ days? left/);
    await expect(page.getByText("Please confirm your email address")).toBeVisible();

    const company = await prisma.company.findFirstOrThrow({ where: { name: companyName }, include: { subscriptions: { include: { plan: true } } } });
    const accounts = await prisma.siteSetting.findUnique({ where: { key: "accounts" } });
    const settings = accounts?.value as { defaultPlanCode: string; trialDays: number };
    expect(company.subscriptions).toHaveLength(1);
    expect(company.subscriptions[0]).toMatchObject({ status: "TRIALING", autoRenew: false });
    expect(company.subscriptions[0].plan.code).toBe(settings.defaultPlanCode);
    const days = (company.subscriptions[0].endDate!.getTime() - company.subscriptions[0].startDate.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(settings.trialDays);

    await callout.getByRole("link", { name: "Upgrade plan" }).click();
    await expect(page).toHaveURL(/\/company-admin\/subscription$/);
    await expect(page.getByRole("heading", { name: "Subscription & billing" })).toBeVisible();
    await expect(page.getByRole("region", { name: company.subscriptions[0].plan.name })).toContainText("Your trial");
    await expect(page.getByRole("heading", { name: "Upgrade plan" })).toBeVisible();
    await expect(page.getByText("Access to all candidates").first()).toBeVisible();
  } finally {
    await deleteTestData([email], companyName);
  }
});

test("a candidate edits their profile and the change is audit-logged without the values", async ({ page }) => {
  const email = uniqueEmail("profile");
  try {
    await signUpCandidate(page, email);
    await page.getByRole("link", { name: "Profile & privacy" }).first().click();
    await expect(page).toHaveURL(/\/candidate\/profile$/);
    await expect(page.getByLabel("City")).toHaveValue(/.+/); // pre-selected from the stored city

    await page.getByLabel("Phone").fill("03215550123");
    await page.getByLabel("Years of experience").fill("7");
    await page.getByLabel(/Minimum expected salary/).fill("81234");
    await page.getByLabel("Region").selectOption({ label: "Sindh" });
    await page.getByLabel("City").selectOption({ label: "Karachi" });
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toContainText("phone");

    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { candidateProfile: { include: { region: true } } } });
    expect(user.candidateProfile).toMatchObject({ phone: "03215550123", experienceYears: 7, minimumSalary: 81234, city: "Karachi" });
    expect(user.candidateProfile!.region!.name).toBe("Sindh");

    const log = await prisma.auditLog.findFirstOrThrow({ where: { actorId: user.id, action: "CANDIDATE_PROFILE_UPDATED" } });
    expect(JSON.stringify(log.metadata)).not.toMatch(/03215550123|81234/);
    expect((log.metadata as { fields: string[] }).fields).toEqual(expect.arrayContaining(["phone", "city", "region", "experience", "minimum salary"]));

    // Changing the region clears the city until a new one is chosen.
    await page.reload();
    await page.getByLabel("Region").selectOption({ label: "Punjab" });
    await expect(page.getByLabel("City")).toHaveValue("");
  } finally {
    await deleteTestData([email]);
  }
});

test("a candidate can delete their account after confirming; personal data is anonymised", async ({ page }) => {
  const email = uniqueEmail("delete");
  try {
    await signUpCandidate(page, email);
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { candidateProfile: true } });

    await page.goto("/candidate/profile");
    await page.getByRole("button", { name: "Delete my account..." }).click();
    await expect(page.getByText("Are you sure? This cannot be undone.")).toBeVisible();

    const confirmButton = page.getByRole("button", { name: "Permanently delete my account" });
    await expect(confirmButton).toBeDisabled();
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await page.getByLabel("Your password").fill("wrong-password-9");
    await confirmButton.click();
    await expect(page.getByRole("alert").filter({ hasText: "password is not correct" })).toBeVisible();
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).isActive).toBe(true);

    await page.getByLabel("Your password").fill(PASSWORD);
    await confirmButton.click();
    await expect(page).toHaveURL(/\/login\?notice=deleted/);
    await expect(page.getByRole("status")).toContainText("Your account has been deleted");

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { candidateProfile: true } });
    expect(after).toMatchObject({ name: null, isActive: false });
    expect(after.email).toBe(`deleted-${user.id}@deleted.invalid`);
    expect(after.candidateProfile).toMatchObject({ phone: null, city: null, minimumSalary: null });
    expect(after.candidateProfile!.anonymisedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { actorId: user.id, action: "CANDIDATE_ACCOUNT_DELETED" } })).toBe(1);

    // The old credentials no longer work, and the address can be used again.
    await logInAs(page, email, PASSWORD);
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  } finally {
    // After deletion the row no longer carries the test email, so remove it by id.
    const row = await prisma.user.findFirst({ where: { OR: [{ email }, { email: { endsWith: "@deleted.invalid" }, auditLogs: { some: { action: "CANDIDATE_ACCOUNT_DELETED", createdAt: { gt: new Date(Date.now() - 10 * 60_000) } } } }] } });
    if (row) {
      await prisma.auditLog.deleteMany({ where: { actorId: row.id } });
      await prisma.user.delete({ where: { id: row.id } });
    }
  }
});

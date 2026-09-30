import { test, expect } from "@playwright/test";
import { deleteTestData, randomIp, uniqueEmail } from "./helpers";

test.use({ extraHTTPHeaders: { "x-forwarded-for": randomIp() } });

// Cleanup runs after every test, pass or fail, so nothing leaks into the dev database.
let created: { emails: string[]; companyName: string } | null = null;
test.afterEach(async () => {
  if (created) await deleteTestData(created.emails, created.companyName);
  created = null;
});

test("company signup, recruiter creation, and forced password change on first login", async ({
  page,
}) => {
  const adminEmail = uniqueEmail("admin");
  const recruiterEmail = uniqueEmail("recruiter");
  const companyName = `Test Co ${Date.now()}`;
  created = { emails: [adminEmail, recruiterEmail], companyName };

  await page.goto("/signup/company");
  await page.getByLabel("Company name").fill(companyName);
  await page.getByLabel("Your name").fill("Admin Person");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill("supersecret1");
  await page.getByRole("button", { name: "Create company account" }).click();

  await expect(page).toHaveURL(/\/company-admin$/);

  await page.goto("/candidate");
  await expect(page).toHaveURL(/\/unauthorized/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/unauthorized/);

  await page.goto("/company-admin/recruiters");
  await page.getByLabel("Name").fill("Test Recruiter");
  await page.getByLabel("Email").fill(recruiterEmail);
  await page.getByRole("button", { name: "Add recruiter" }).click();

  const tempPasswordLocator = page.getByTestId("temp-password");
  await expect(tempPasswordLocator).toBeVisible();
  const tempPassword = (await tempPasswordLocator.textContent())!.trim();
  expect(tempPassword.length).toBeGreaterThan(5);
  await expect(page.getByRole("cell", { name: recruiterEmail })).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/login");
  await page.getByLabel("Email").fill(recruiterEmail);
  await page.getByLabel("Password").fill(tempPassword);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/change-password/);

  await page.getByLabel("Current (temporary) password").fill(tempPassword);
  await page.getByLabel("New password", { exact: true }).fill("brandnewpassword1");
  await page.getByLabel("Confirm new password").fill("brandnewpassword1");
  await page.getByRole("button", { name: "Save new password" }).click();

  await expect(page).toHaveURL(/\/recruiter$/);

  await page.goto("/company-admin");
  await expect(page).toHaveURL(/\/unauthorized/);
});

test("deactivated recruiter can no longer log in", async ({ page, request }) => {
  const adminEmail = uniqueEmail("admin2");
  const recruiterEmail = uniqueEmail("recruiter2");
  const companyName = `Test Co 2 ${Date.now()}`;
  created = { emails: [adminEmail, recruiterEmail], companyName };

  await page.goto("/signup/company");
  await page.getByLabel("Company name").fill(companyName);
  await page.getByLabel("Your name").fill("Admin Person");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill("supersecret1");
  await page.getByRole("button", { name: "Create company account" }).click();
  await expect(page).toHaveURL(/\/company-admin$/);

  await page.goto("/company-admin/recruiters");
  await page.getByLabel("Name").fill("Soon Deactivated");
  await page.getByLabel("Email").fill(recruiterEmail);
  await page.getByRole("button", { name: "Add recruiter" }).click();
  const tempPassword = (await page.getByTestId("temp-password").textContent())!.trim();

  await page.getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByText("Deactivated")).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await page.goto("/login");
  await page.getByLabel("Email").fill(recruiterEmail);
  await page.getByLabel("Password").fill(tempPassword);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByText(/Incorrect email or password/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("deactivating a recruiter ends their session that is already open", async ({
  page,
  browser,
}) => {
  const adminEmail = uniqueEmail("admin3");
  const recruiterEmail = uniqueEmail("recruiter3");
  const companyName = `Test Co 3 ${Date.now()}`;
  created = { emails: [adminEmail, recruiterEmail], companyName };

  await page.goto("/signup/company");
  await page.getByLabel("Company name").fill(companyName);
  await page.getByLabel("Your name").fill("Admin Person");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill("supersecret1");
  await page.getByRole("button", { name: "Create company account" }).click();
  await expect(page).toHaveURL(/\/company-admin$/);

  await page.goto("/company-admin/recruiters");
  await page.getByLabel("Name").fill("Already Logged In");
  await page.getByLabel("Email").fill(recruiterEmail);
  await page.getByRole("button", { name: "Add recruiter" }).click();
  const tempPassword = (await page.getByTestId("temp-password").textContent())!.trim();

  // The recruiter logs in on a separate browser and finishes the forced password change.
  const recruiterContext = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": randomIp() },
  });
  const recruiterPage = await recruiterContext.newPage();
  try {
    await recruiterPage.goto("/login");
    await recruiterPage.getByLabel("Email").fill(recruiterEmail);
    await recruiterPage.getByLabel("Password").fill(tempPassword);
    await recruiterPage.getByRole("button", { name: "Log in" }).click();
    await expect(recruiterPage).toHaveURL(/\/change-password/);
    await recruiterPage.getByLabel("Current (temporary) password").fill(tempPassword);
    await recruiterPage.getByLabel("New password", { exact: true }).fill("brandnewpassword1");
    await recruiterPage.getByLabel("Confirm new password").fill("brandnewpassword1");
    await recruiterPage.getByRole("button", { name: "Save new password" }).click();
    await expect(recruiterPage).toHaveURL(/\/recruiter$/);

    // The admin deactivates them while that session is still open.
    await page.getByRole("button", { name: "Deactivate" }).click();
    await expect(page.getByText("Deactivated")).toBeVisible();

    // No new login: the recruiter's very next request must be refused.
    await recruiterPage.goto("/recruiter/shortlists");
    await expect(recruiterPage).toHaveURL(/\/login/);
    await recruiterPage.goto("/recruiter");
    await expect(recruiterPage).toHaveURL(/\/login/);
  } finally {
    await recruiterContext.close();
  }
});

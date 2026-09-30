import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { deleteTestData, prisma, uniqueEmail } from "./helpers";

// These tests edit live settings, so they run one after another and always put things back.
test.describe.configure({ mode: "serial" });

const PASSWORD = "adminpassword1";
let email: string;

test.beforeAll(async () => {
  email = uniqueEmail("settings-admin");
  await prisma.user.create({
    data: { email, password: await bcrypt.hash(PASSWORD, 10), role: "PLATFORM_ADMIN", name: "Settings Admin" },
  });
});

test.afterAll(async () => {
  await deleteTestData([email]);
});

async function logIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("changing the platform name and brand colour in Settings shows up across the site", async ({ page }) => {
  const before = await prisma.siteSetting.findUnique({ where: { key: "branding" } });
  try {
    await logIn(page);
    await page.goto("/admin/settings?group=branding");
    await page.getByLabel("Platform name").fill("Acme Talent E2E");
    await page.getByLabel("Colour code").fill("#2255aa");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");

    await page.goto("/privacy");
    await expect(page.getByRole("banner").getByText("Acme Talent E2E")).toBeVisible();
    await expect(page).toHaveTitle("Acme Talent E2E");
    const brand700 = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-brand-700").trim());
    expect(brand700).toBe("#2255aa");
  } finally {
    if (before) await prisma.siteSetting.update({ where: { key: "branding" }, data: { value: before.value as object } });
  }
});

test("an admin can add a plan with features, see it, and delete it", async ({ page }) => {
  await logIn(page);
  await page.goto("/admin/plans");

  const card = page.getByRole("region", { name: "Add a new plan" });
  await card.getByLabel("Code").fill("e2e-plan");
  await card.getByLabel("Name").fill("E2E Plan");
  await card.getByLabel("Price per month (PKR)").fill("12345");
  await card.getByLabel("AI plain-language search").check();
  await card.getByRole("button", { name: "Create plan" }).click();

  const created = page.getByRole("region", { name: "E2E Plan" });
  await expect(created).toBeVisible();
  await expect(created.getByLabel("AI plain-language search")).toBeChecked();

  const row = await prisma.plan.findUniqueOrThrow({ where: { code: "e2e-plan" } });
  expect(row.features).toMatchObject({ aiSearch: true, q1Exclusive: false, maxShortlists: 0 });

  await created.getByRole("button", { name: "Delete plan" }).click();
  await created.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByRole("region", { name: "E2E Plan" })).toHaveCount(0);
  expect(await prisma.plan.count({ where: { code: "e2e-plan" } })).toBe(0);
});

test("cities on the signup form come from the admin-managed list", async ({ page }) => {
  const region = await prisma.region.findFirstOrThrow({ where: { name: "Punjab" } });
  const city = await prisma.city.create({ data: { name: "E2E Testville", regionId: region.id } });
  try {
    await page.goto("/signup");
    await page.getByLabel("Region").selectOption({ label: "Punjab" });
    await expect(page.getByLabel("City").locator("option", { hasText: "E2E Testville" })).toHaveCount(1);
    await page.getByLabel("Region").selectOption({ label: "Sindh" });
    await expect(page.getByLabel("City").locator("option", { hasText: "E2E Testville" })).toHaveCount(0);
  } finally {
    await prisma.city.delete({ where: { id: city.id } });
  }
});

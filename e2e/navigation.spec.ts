import { test, expect } from "@playwright/test";
import type { Role } from "@prisma/client";
import { ROLE_NAV, allNavItems, navHref } from "../src/lib/navigation";
import { DEMO_PASSWORD, logInAs } from "./helpers";

// Needs the demo data from `npm run prisma:seed` (DEMO_MODE=true).
const DEMO_LOGINS: Record<Role, string> = {
  CANDIDATE: "candidate@demo.test",
  RECRUITER: "recruiter@demo.test",
  COMPANY_ADMIN: "companyadmin@demo.test",
  PLATFORM_ADMIN: "demo.admin@demo.test",
};

for (const role of Object.keys(DEMO_LOGINS) as Role[]) {
  test(`${role}: every navigation item can be clicked through`, async ({ page }) => {
    const nav = ROLE_NAV[role];
    await logInAs(page, DEMO_LOGINS[role], DEMO_PASSWORD);
    await expect(page).toHaveURL(new RegExp(`${nav.base}$`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome");

    const sidebar = page.getByRole("navigation", { name: `${nav.roleLabel} navigation` });

    for (const item of allNavItems(role)) {
      await sidebar.getByRole("link", { name: item.label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${navHref(role, item)}$`));
      await expect(sidebar.getByRole("link", { name: item.label, exact: true })).toHaveAttribute(
        "aria-current",
        "page"
      );

      if (item.slug === "") {
        await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome");
      } else if (item.live) {
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      } else {
        await expect(page.getByRole("heading", { level: 1, name: item.label })).toBeVisible();
        await expect(page.getByText("Placeholder", { exact: true })).toBeVisible();
      }
    }
  });
}

test("dashboard cards link to the same modules as the sidebar", async ({ page }) => {
  await logInAs(page, DEMO_LOGINS.RECRUITER, DEMO_PASSWORD);
  await page.getByRole("main").getByRole("link", { name: /Candidate search/ }).click();
  await expect(page).toHaveURL(/\/recruiter\/candidates$/);
});

test("demo company admin sees their plan and recruiters", async ({ page }) => {
  await logInAs(page, DEMO_LOGINS.COMPANY_ADMIN, DEMO_PASSWORD);
  await expect(page.getByText("Karachi Tech Solutions")).toBeVisible();
  await expect(page.getByText("Advanced", { exact: true })).toBeVisible();

  await page.getByRole("navigation").getByRole("link", { name: "Recruiters" }).click();
  await expect(page.getByRole("cell", { name: "recruiter@demo.test" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "recruiter.hamza@demo.test" })).toBeVisible();
});

test("unknown module paths 404 and other roles' modules stay protected", async ({ page }) => {
  await logInAs(page, DEMO_LOGINS.CANDIDATE, DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/candidate$/);

  const missing = await page.goto("/candidate/not-a-module");
  expect(missing?.status()).toBe(404);

  await page.goto("/admin/question-bank");
  await expect(page).toHaveURL(/\/unauthorized/);
  await page.goto("/recruiter/shortlists");
  await expect(page).toHaveURL(/\/unauthorized/);
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("navigation opens as a drawer, closes after a tap, and the page never scrolls sideways", async ({
    page,
  }) => {
    // A different account from the desktop tour so each login stays under the rate limit.
    await logInAs(page, "admin.lahore@demo.test", DEMO_PASSWORD);
    await expect(page).toHaveURL(/\/company-admin$/);

    const link = page.getByRole("link", { name: "Subscription & billing", exact: true });
    await expect(link).toBeHidden();

    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(link).toBeVisible();
    await link.click();

    await expect(page).toHaveURL(/\/company-admin\/subscription$/);
    await expect(link).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: "Subscription & billing" })).toBeVisible();

    for (const path of ["/company-admin", "/company-admin/recruiters", "/company-admin/subscription"]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
    }
  });
});

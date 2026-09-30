import { test, expect } from "@playwright/test";

test.describe("unauthenticated users are redirected to /login", () => {
  for (const path of ["/candidate", "/recruiter", "/company-admin", "/admin", "/change-password"]) {
    test(`GET ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});

test("public pages are reachable without logging in", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();

  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Candidate sign up" })).toBeVisible();

  await page.goto("/signup/company");
  await expect(page.getByRole("heading", { name: "Company sign up" })).toBeVisible();
});

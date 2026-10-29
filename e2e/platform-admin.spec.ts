import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, uniqueEmail } from "./helpers";

// PLATFORM_ADMIN accounts are only ever created by the seed script (no public
// signup form) - this test creates one directly via Prisma to exercise login
// and route protection for that role, the same way the seed script would.
test("platform admin can log in and only access /admin", async ({ page }) => {
  const email = uniqueEmail("platform-admin");
  const password = "adminpassword1";

  await prisma.user.create({
    data: {
      email,
      password: await bcrypt.hash(password, 10),
      role: "PLATFORM_ADMIN",
      name: "Test Platform Admin",
    },
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Welcome, Test Platform Admin" })).toBeVisible();

  await page.goto("/candidate");
  await expect(page).toHaveURL(/\/unauthorized/);

  await page.goto("/company-admin");
  await expect(page).toHaveURL(/\/unauthorized/);

  await page.goto("/recruiter");
  await expect(page).toHaveURL(/\/unauthorized/);

  await prisma.notification.deleteMany({ where: { user: { email } } });
  await prisma.user.delete({ where: { email } }).catch(() => {});
});

import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { deleteTestData, logInAs, prisma, uniqueEmail } from "./helpers";

// A user with a temporary password must change it. This test performs the exact trick that used to work:
// telling the server, from the browser, that no change is needed.
test("a browser cannot skip the forced password change with session.update()", async ({ page }) => {
  const email = uniqueEmail("forced");
  const temp = "temporary-pass-1";
  const user = await prisma.user.create({
    data: { email, name: "Forced Change", password: await bcrypt.hash(temp, 10), role: "CANDIDATE", mustChangePassword: true, emailVerified: new Date(), candidateProfile: { create: { consentGiven: true } } },
  });
  try {
    await logInAs(page, email, temp);
    await expect(page).toHaveURL(/\/change-password$/);

    // The same request the client's update() makes: POST /api/auth/session with the csrf token and a payload.
    const result = await page.evaluate(async () => {
      const csrf = (await (await fetch("/api/auth/csrf")).json()).csrfToken;
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrfToken: csrf, data: { mustChangePassword: false } }),
      });
      const session = await (await fetch("/api/auth/session")).json();
      return { status: res.status, mustChangePassword: session?.user?.mustChangePassword };
    });
    expect(result.mustChangePassword).toBe(true); // the server did not accept the browser's claim

    // Every protected page still sends the user back to the change-password screen.
    await page.goto("/candidate");
    await expect(page).toHaveURL(/\/change-password$/);
    await page.goto("/candidate/tests");
    await expect(page).toHaveURL(/\/change-password$/);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).mustChangePassword).toBe(true);

    // Changing the password for real is what releases it.
    await page.goto("/change-password");
    await page.getByLabel("Current (temporary) password").fill(temp);
    await page.getByLabel("New password", { exact: true }).fill("a-brand-new-pass-2");
    await page.getByLabel("Confirm new password").fill("a-brand-new-pass-2");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page).toHaveURL(/\/candidate$/);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).mustChangePassword).toBe(false);

    await page.goto("/candidate/tests");
    await expect(page).toHaveURL(/\/candidate\/tests$/);
    const session = await page.evaluate(async () => (await (await fetch("/api/auth/session")).json())?.user?.mustChangePassword);
    expect(session).toBe(false);
  } finally {
    await deleteTestData([email]);
  }
});

test("a forced change is also enforced when the database flag is set while the user is signed in", async ({ page }) => {
  const email = uniqueEmail("forced2");
  const password = "regular-pass-123";
  const user = await prisma.user.create({
    data: { email, name: "Later Forced", password: await bcrypt.hash(password, 10), role: "CANDIDATE", mustChangePassword: false, emailVerified: new Date(), candidateProfile: { create: { consentGiven: true } } },
  });
  try {
    await logInAs(page, email, password);
    await expect(page).toHaveURL(/\/candidate$/);

    // An admin forces a change while the session is open: the very next request must honour it.
    await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
    await page.goto("/candidate/tests");
    await expect(page).toHaveURL(/\/change-password$/);
  } finally {
    await deleteTestData([email]);
  }
});

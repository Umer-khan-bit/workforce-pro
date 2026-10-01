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

// The same rule for API routes: one shared guard in the proxy, so a temporary-password user cannot use the
// APIs directly (for example to start a test) while skipping the change-password screen.
test("API routes refuse a user who must change their password, except change-password and sign-out", async ({ page }) => {
  const email = uniqueEmail("forced3");
  const temp = "temporary-pass-3";
  await prisma.user.create({
    data: { email, name: "Forced Api", password: await bcrypt.hash(temp, 10), role: "CANDIDATE", mustChangePassword: true, emailVerified: new Date(), candidateProfile: { create: { consentGiven: true } } },
  });
  try {
    await logInAs(page, email, temp);
    await expect(page).toHaveURL(/\/change-password$/);

    const call = (method: string, url: string, body?: unknown) =>
      page.evaluate(
        async ([m, u, b]) => {
          const res = await fetch(u as string, { method: m as string, headers: { "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
          const json = await res.json().catch(() => null);
          return { status: res.status, code: json?.code ?? null };
        },
        [method, url, body] as const
      );

    for (const [method, url] of [
      ["POST", "/api/tests/IQ/start"],
      ["GET", "/api/tests/sessions/none"],
      ["PATCH", "/api/account/profile"],
      ["DELETE", "/api/account"],
      ["POST", "/api/account/resend-verification"],
      ["GET", "/api/admin/questions"],
    ] as const) {
      const r = await call(method, url, method === "GET" ? undefined : {});
      expect(r, `${method} ${url}`).toEqual({ status: 403, code: "PASSWORD_CHANGE_REQUIRED" });
    }

    // The exempt routes still answer: change-password (a wrong current password is a normal 4xx, not the gate) and the session route.
    const wrong = await call("POST", "/api/account/change-password", { currentPassword: "nope", newPassword: "another-pass-123", confirmPassword: "another-pass-123" });
    expect(wrong.code).not.toBe("PASSWORD_CHANGE_REQUIRED");
    expect(wrong.status).not.toBe(403);
    expect((await call("GET", "/api/auth/session")).status).toBe(200);
  } finally {
    await deleteTestData([email]);
  }
});

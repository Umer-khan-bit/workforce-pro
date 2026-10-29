import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { createKit, type Kit } from "../src/lib/testEngine/testkit";
import { logInAs, prisma } from "./helpers";

// Integrity review: a test with several window exits is flagged, the platform admin voids the result, the candidate
// sees why and may retake, and Undo void puts everything back.
test.describe.configure({ mode: "serial" });

const PASSWORD = "kit-password-1";
let kit: Kit;
let adminId: string;
let adminEmail: string;

test.beforeAll(async () => {
  kit = await createKit(prisma, "e2e-integ");
  adminEmail = `integ-admin-${kit.run}@example.test`;
  adminId = (await prisma.user.create({ data: { email: adminEmail, name: "Integrity Admin", password: await bcrypt.hash(PASSWORD, 10), role: "PLATFORM_ADMIN" } })).id;
});

test.afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
  await prisma.integrityReview.deleteMany({ where: { reviewedById: adminId } });
  await kit.cleanup();
  await prisma.user.delete({ where: { id: adminId } });
});

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await logInAs(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/(admin|candidate)$/);
}

test("a flagged test is voided by the admin, the candidate is told, and Undo void restores it", async ({ page }) => {
  test.setTimeout(120_000);
  const c = await kit.addCandidate("flagged");
  const session = await prisma.testSession.create({ data: { candidateProfileId: c.profileId, testType: "IQ", status: "COMPLETED", completedAt: new Date(), languageId: kit.language.id } });
  await prisma.score.create({ data: { candidateProfileId: c.profileId, sessionId: session.id, testType: "IQ", rawScore: 50, quartile: 2, percentile: 60, rankValue: 0.3, cohortScope: "ALL", cohortSize: 40 } });
  for (let i = 1; i <= 3; i++) await prisma.auditLog.create({ data: { actorId: c.userId, action: "TEST_FOCUS_LOST", targetType: "TestSession", targetId: session.id, metadata: { testType: "IQ", count: i } } });

  // Admin: the flagged test is listed with its number of exits.
  await signIn(page, adminEmail);
  await page.goto("/admin/integrity-review");
  await expect(page.getByRole("heading", { name: "Integrity review" })).toBeVisible();
  const waitingRow = page.getByTestId("integrity-waiting").getByTestId("integrity-row").filter({ hasText: `Pat ${kit.run} flagged` });
  await expect(waitingRow).toHaveCount(1);
  await expect(waitingRow).toContainText("IQ");
  await expect(waitingRow).toContainText("3");

  // Void it: it moves to the voided list and the result stops counting.
  await waitingRow.getByRole("button", { name: "Void result" }).click();
  const voidedRow = page.getByTestId("integrity-voided").getByTestId("integrity-row").filter({ hasText: `Pat ${kit.run} flagged` });
  await expect(voidedRow).toHaveCount(1);
  await expect(waitingRow).toHaveCount(0);
  expect((await prisma.score.findUniqueOrThrow({ where: { sessionId: session.id } })).voidedAt).not.toBeNull();

  // The audit log has it.
  await page.goto("/admin/audit-log?action=INTEGRITY_RESULT_VOIDED");
  await expect(page.getByTestId("audit-row").first()).toContainText("Result voided after integrity review");

  // Candidate: told the result was cancelled, and the test can be started again at once.
  await signIn(page, c.email);
  await page.goto("/candidate/results");
  await expect(page.getByTestId("cancelled-IQ")).toContainText("This result was cancelled after a review. You can take the test again.");
  await page.goto(`/candidate/tests/result/${session.id}`);
  await expect(page.getByTestId("result-cancelled")).toBeVisible();

  // Admin: Undo void.
  await signIn(page, adminEmail);
  await page.goto("/admin/integrity-review");
  await page.getByTestId("integrity-voided").getByTestId("integrity-row").filter({ hasText: `Pat ${kit.run} flagged` }).getByRole("button", { name: "Undo void" }).click();
  await expect(page.getByTestId("integrity-waiting").getByTestId("integrity-row").filter({ hasText: `Pat ${kit.run} flagged` })).toHaveCount(1);
  expect((await prisma.score.findUniqueOrThrow({ where: { sessionId: session.id } })).voidedAt).toBeNull();

  // Candidate: the notice is gone.
  await signIn(page, c.email);
  await page.goto("/candidate/results");
  await expect(page.getByTestId("cancelled-IQ")).toHaveCount(0);
});

test("only the platform admin can open Integrity review", async ({ page }) => {
  const c = await kit.addCandidate("nosy");
  await signIn(page, c.email);
  await page.goto("/admin/integrity-review");
  await expect(page).toHaveURL(/\/unauthorized/);
  const res = await page.request.post("/api/admin/integrity/whatever", { data: { action: "void" } });
  expect(res.status()).toBe(403);
});

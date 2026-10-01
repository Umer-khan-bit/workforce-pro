import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { deleteTestData, logInAs, prisma, uniqueEmail } from "./helpers";

// When an English question gets a new version, its translations are listed in Approvals as needing an update.
test("Approvals lists translations of a question that got a new version, and lets the admin retire one", async ({ page }) => {
  const run = `tu${Date.now().toString(36)}`;
  const [english, urdu] = await Promise.all([prisma.language.findFirstOrThrow({ where: { isDefault: true } }), prisma.language.findFirstOrThrow({ where: { code: "ur" } })]);
  const oldEnglish = await prisma.question.create({ data: { testType: "PERSONALITY", type: "LIKERT", content: `${run} I enjoy meeting new people`, topic: "Extraversion", aParam: 1, bParam: 0, status: "RETIRED", source: "MANUAL", languageId: english.id } });
  const newEnglish = await prisma.question.create({ data: { testType: "PERSONALITY", type: "LIKERT", content: `${run} I enjoy meeting people I do not know yet`, topic: "Extraversion", aParam: 1, bParam: 0, status: "APPROVED", source: "MANUAL", languageId: english.id, previousVersionId: oldEnglish.id } });
  const translation = await prisma.question.create({
    data: { testType: "PERSONALITY", type: "LIKERT", content: `${run} مجھے نئے لوگوں سے ملنا اچھا لگتا ہے`, topic: "Extraversion", aParam: 1, bParam: 0, status: "APPROVED", source: "AI_TRANSLATED", languageId: urdu.id, translationOfId: oldEnglish.id, needsRetranslation: true },
  });
  // An admin of its own, so this test does not use up the demo admin's login attempts (5 per 15 minutes).
  const adminEmail = uniqueEmail("tuadmin");
  await prisma.user.create({ data: { email: adminEmail, name: "E2E admin", password: await bcrypt.hash("e2e-pass-12345", 10), role: "PLATFORM_ADMIN", emailVerified: new Date() } });
  try {
    await logInAs(page, adminEmail, "e2e-pass-12345");
    await expect(page).toHaveURL(/\/admin$/); // signed in before moving on
    await page.goto("/admin/approvals");
    const panel = page.getByTestId("outdated-translations");
    await expect(panel).toContainText("Translations that need updating");
    const item = panel.getByRole("listitem").filter({ hasText: run });
    await expect(item).toContainText("English was: " + `${run} I enjoy meeting new people`);
    await expect(item).toContainText("English now: " + `${run} I enjoy meeting people I do not know yet`);
    await expect(item).toContainText("No new translation yet.");
    expect(newEnglish.id).toBeTruthy();

    await item.getByRole("button", { name: "Retire this translation" }).click();
    await expect(panel.getByRole("listitem").filter({ hasText: run })).toHaveCount(0);
    expect((await prisma.question.findUniqueOrThrow({ where: { id: translation.id } })).status).toBe("RETIRED");
  } finally {
    await prisma.question.deleteMany({ where: { id: { in: [translation.id, newEnglish.id, oldEnglish.id] } } });
    await prisma.auditLog.deleteMany({ where: { targetId: translation.id } });
    await deleteTestData([adminEmail]);
  }
});

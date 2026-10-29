import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { createKit, type Kit } from "../src/lib/testEngine/testkit";
import { logInAs, prisma } from "./helpers";

// Integrity part B: the per-question time limit (settings screen and test screen) and shuffled option letters.
test.describe.configure({ mode: "serial" });

const PASSWORD = "kit-password-1";
let kit: Kit;
let adminId: string;
let adminEmail: string;
let original: unknown;

test.beforeAll(async () => {
  kit = await createKit(prisma, "e2e-intb");
  await kit.addCatBank("IQ", 40, 0);
  adminEmail = `intb-admin-${kit.run}@example.test`;
  adminId = (await prisma.user.create({ data: { email: adminEmail, name: "Integrity B Admin", password: await bcrypt.hash(PASSWORD, 10), role: "PLATFORM_ADMIN" } })).id;
  original = (await prisma.siteSetting.findUnique({ where: { key: "testing" } }))?.value ?? null;
});

test.afterAll(async () => {
  // Put the settings back exactly as they were (a row that did not exist is removed again).
  if (original === null) await prisma.siteSetting.deleteMany({ where: { key: "testing" } });
  else await prisma.siteSetting.update({ where: { key: "testing" }, data: { value: original as object } });
  await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
  await kit.cleanup();
  await prisma.user.delete({ where: { id: adminId } });
});

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await logInAs(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/(admin|candidate)$/);
}

test("settings: each per-question limit shows the test's overall time and refuses a limit longer than the test", async ({ page }) => {
  await signIn(page, adminEmail);
  await page.goto("/admin/settings?group=testing");
  const hint = page.getByTestId("hint-questionSecondsIq");
  await expect(hint).toContainText(/^IQ: \d+ min overall, up to \d+ questions, about \d+ s per question$/);
  await expect(page.getByTestId("hint-questionSecondsPersonality")).toContainText("Personality:");
  await expect(page.getByLabel("Integrity: seconds per question, IQ")).toHaveValue("0"); // off by default

  await page.getByLabel("Integrity: seconds per question, IQ").fill("99999");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  const saved = await prisma.siteSetting.findUnique({ where: { key: "testing" } });
  expect((saved?.value as { questionSecondsIq?: number } | undefined)?.questionSecondsIq ?? 0).toBe(0);
});

test("test screen: a per-question countdown appears, and when it ends the question counts as unanswered and the next one is shown", async ({ page }) => {
  test.setTimeout(120_000);
  // A long limit, so other tests running at the same time are not affected; the deadline is brought forward below.
  const current = (await prisma.siteSetting.findUnique({ where: { key: "testing" } }))?.value as object | undefined;
  await prisma.siteSetting.upsert({ where: { key: "testing" }, create: { key: "testing", value: { questionSecondsIq: 600 } }, update: { value: { ...(current ?? {}), questionSecondsIq: 600 } } });

  const c = await kit.addCandidate("timed");
  await signIn(page, c.email);
  await page.goto("/candidate/tests/iq");
  await page.getByTestId("pledge").check();
  await page.getByRole("button", { name: "Start the test" }).click();
  await expect(page).toHaveURL(/\/session\//);
  const sessionId = page.url().split("/").pop()!;

  await expect(page.getByTestId("question")).toBeVisible();
  await expect(page.getByTestId("question-timer")).toContainText(/Time for this question: (9|10):\d\d/);
  // Letters follow the position on screen; the answer is still sent by its real key.
  const letters = await page.locator('[data-testid^="option-"]').evaluateAll((els) => els.map((e) => e.querySelector("span")?.textContent));
  expect(letters).toEqual(["A", "B", "C", "D"]);

  const firstQuestion = await page.getByTestId("question").innerText();
  // Bring the deadline forward: the countdown reaches zero, the page asks the server, and the server moves on.
  const row = await prisma.testSession.findUniqueOrThrow({ where: { id: sessionId } });
  const state = row.resumeState as { current: Record<string, unknown> };
  await prisma.testSession.update({ where: { id: sessionId }, data: { resumeState: { ...state, current: { ...state.current, dueAt: new Date(Date.now() + 2500).toISOString() } } } });
  await page.reload();
  await expect.poll(async () => page.getByTestId("question").innerText(), { timeout: 20_000 }).not.toBe(firstQuestion);
  const unanswered = await prisma.response.findMany({ where: { sessionId } });
  expect(unanswered).toHaveLength(1);
  expect(unanswered[0].answerGiven).toMatchObject({ unanswered: true });
  expect(unanswered[0].isCorrect).toBe(false);

  // The test carries on normally.
  await page.getByTestId("option-B").click();
  await page.getByTestId("next").click();
  await expect(page.getByTestId("position")).toContainText("Question 3");
});

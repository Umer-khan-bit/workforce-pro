import { test, expect, type Page } from "@playwright/test";
import { createKit, type Kit } from "../src/lib/testEngine/testkit";
import { logInAs, prisma } from "./helpers";

// A candidate takes whole tests on a phone-sized screen. The questions come from an isolated test world
// (its own language, region and job role), so the real question bank is never touched. The Language test
// is only taken as far as the writing screen: submitting it would be graded by the real Claude API.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
test.describe.configure({ mode: "serial" });

const PASSWORD = "kit-password-1";
let kit: Kit;

test.beforeAll(async () => {
  kit = await createKit(prisma, "e2e");
  await kit.addCatBank("IQ", 40, 2);
  await kit.addCatBank("LANGUAGE", 40, 0);
  await kit.addWritingPrompts(2);
  await kit.addPersonalityBank();
});

test.afterAll(async () => {
  await kit.cleanup();
});

/** Logs in through the form and waits until the candidate dashboard is showing. */
async function signIn(page: Page, email: string) {
  await logInAs(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/candidate$/);
}

async function noSideways(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Answers questions until the page moves on to the result (or a different screen). */
async function answerAll(page: Page, option: (page: Page) => string, maxQuestions = 60) {
  for (let i = 0; i < maxQuestions; i++) {
    if (!page.url().includes("/session/")) return;
    const question = page.getByTestId("question");
    if (!(await question.isVisible().catch(() => false))) {
      await page.waitForTimeout(150);
      continue;
    }
    const before = await question.innerText();
    await page.getByTestId(option(page)).click();
    await page.getByTestId("next").click();
    await page.waitForFunction(
      (prev) => document.querySelector("[data-testid=question]")?.textContent !== prev || !location.pathname.includes("/session/") || !!document.querySelector("[data-testid=writing-prompt]"),
      before
    );
  }
}

test("a candidate takes a full IQ test on a phone: instructions, timer, progress, resume, result and retake date", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const c = await kit.addCandidate("iqtaker");
  await signIn(page, c.email);
  await expect(page).toHaveURL(/\/candidate$/);

  // My tests: only the tests that have questions for this candidate can be started.
  await page.goto("/candidate/tests");
  await expect(page.getByRole("heading", { name: "My tests" })).toBeVisible();
  const iqCard = page.getByRole("region", { name: "IQ" });
  await expect(iqCard).toContainText("Not started");
  await expect(iqCard).toContainText("15 minutes");
  await expect(page.getByRole("region", { name: "EQ" })).toContainText("Not available yet");
  await expect(page.getByRole("region", { name: "Job skill" })).toContainText("Not available yet");
  await noSideways(page);

  // Instructions, then start.
  await iqCard.getByRole("link", { name: "Start" }).click();
  await expect(page.getByRole("heading", { name: "IQ test" })).toBeVisible();
  await expect(page.getByText("You will see one question at a time")).toBeVisible();
  await expect(page.getByText("15 minutes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start the test" }).click();
  await expect(page).toHaveURL(/\/candidate\/tests\/session\//);

  // One question at a time, with a running timer and progress.
  await expect(page.getByTestId("question")).toBeVisible();
  await expect(page.getByTestId("position")).toContainText("Question 1 of up to");
  const clock = await page.getByTestId("timer").innerText();
  expect(clock).toMatch(/^1[45]:\d\d$|^14:\d\d$/);
  await expect(page.getByTestId("next")).toBeDisabled(); // nothing chosen yet
  await noSideways(page);

  // The Next button is large enough to tap and stays on screen.
  const next = page.getByTestId("next");
  const box = (await next.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  const optionBox = (await page.getByTestId("option-A").boundingBox())!;
  expect(optionBox.height).toBeGreaterThanOrEqual(44);

  // Answer three questions, then close the browser and come back: same place, same clock.
  for (let i = 0; i < 3; i++) {
    const text = await page.getByTestId("question").innerText();
    await page.getByTestId("option-B").click();
    await next.click();
    await page.waitForFunction((prev) => document.querySelector("[data-testid=question]")?.textContent !== prev, text);
  }
  await expect(page.getByTestId("position")).toContainText("Question 4");
  const questionBefore = await page.getByTestId("question").innerText();
  const sessionUrl = page.url();
  await page.close();

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const back = await context.newPage();
  await signIn(back, c.email);
  await back.goto("/candidate/tests");
  const resumeCard = back.getByRole("region", { name: "IQ" });
  await expect(resumeCard).toContainText("In progress");
  await resumeCard.getByRole("link", { name: "Resume" }).click();
  await expect(back).toHaveURL(sessionUrl);
  await expect(back.getByTestId("question")).toHaveText(questionBefore);
  await expect(back.getByTestId("position")).toContainText("Question 4");

  // Finish the test.
  await answerAll(back, () => "option-B");
  await expect(back).toHaveURL(/\/candidate\/tests\/result\//, { timeout: 30_000 });

  // The summary: quartile, who it is based on, the retake date.
  await expect(back.getByTestId("summary")).toBeVisible();
  await expect(back.getByTestId("quartile")).toHaveText(/^Q[1-4]$/);
  await expect(back.getByTestId("cohort")).toContainText(/Based on \d+ candidates?/);
  await expect(back.getByText(/You can take this test again on/)).toBeVisible();
  await noSideways(back);

  // Back on My tests it is Completed, with the retake date, and no "Take again" button yet.
  await back.goto("/candidate/tests");
  const done = back.getByRole("region", { name: "IQ" });
  await expect(done).toContainText("Completed");
  await expect(done).toContainText("You can take it again on");
  await expect(done.getByRole("link", { name: "Take again" })).toHaveCount(0);
  await expect(done.getByRole("link", { name: "View summary" })).toBeVisible();

  // And the database agrees.
  const profile = await prisma.candidateProfile.findFirstOrThrow({ where: { userId: c.userId } });
  const score = await prisma.score.findFirstOrThrow({ where: { candidateProfileId: profile.id, testType: "IQ" } });
  expect(score.provisional).toBe(false);
  expect(score.quartile).not.toBeNull();
  expect(score.theta).toBeGreaterThan(0);
  const scored = await prisma.response.count({ where: { session: { candidateProfileId: profile.id }, isScored: true } });
  expect(scored).toBeGreaterThanOrEqual(10);
  expect(scored).toBeLessThanOrEqual(20);
  await context.close();
});

test("a candidate takes the Personality test and sees trait scores, with no ranking", async ({ page }) => {
  test.setTimeout(240_000);
  const c = await kit.addCandidate("persontaker");
  await signIn(page, c.email);
  await page.goto("/candidate/tests/personality");
  await expect(page.getByText("50", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Start the test" }).click();
  await expect(page).toHaveURL(/\/session\//);
  await expect(page.getByTestId("position")).toContainText("Question 1 of 50");

  // Five large rating buttons on a phone, easy to tap.
  const likert = (await page.getByTestId("likert-3").boundingBox())!;
  expect(likert.height).toBeGreaterThanOrEqual(44);
  await noSideways(page);

  await answerAll(page, () => "likert-4", 60);
  await expect(page).toHaveURL(/\/candidate\/tests\/result\//, { timeout: 30_000 });
  await expect(page.getByTestId("summary")).toContainText("five personality traits");
  for (const trait of ["Extraversion", "Agreeableness", "Conscientiousness", "Emotional Stability", "Openness"]) {
    await expect(page.getByTestId(`trait-${trait}`)).toBeVisible();
  }
  await expect(page.getByText("higher means calmer")).toBeVisible();
  await expect(page.getByTestId("quartile")).toHaveCount(0); // personality has no better or worse direction
  const score = await prisma.score.findFirstOrThrow({ where: { candidateProfile: { userId: c.userId }, testType: "PERSONALITY" } });
  expect(score).toMatchObject({ quartile: null, percentile: null });
});

test("when time runs out the page submits automatically and the test is scored", async ({ page }) => {
  test.setTimeout(180_000);
  const c = await kit.addCandidate("timeouttaker");
  await signIn(page, c.email);
  await page.goto("/candidate/tests/iq");
  await page.getByRole("button", { name: "Start the test" }).click();
  await expect(page).toHaveURL(/\/session\//);
  const sessionId = page.url().split("/").pop()!;

  // Answer until the minimum number of scored answers is in (alternating, so the test keeps going).
  for (let i = 0; i < 30; i++) {
    const scored = await prisma.response.count({ where: { sessionId, isScored: true } });
    if (scored >= 10) break;
    const text = await page.getByTestId("question").innerText();
    await page.getByTestId(i % 2 === 0 ? "option-B" : "option-A").click();
    await page.getByTestId("next").click();
    await page.waitForFunction((prev) => document.querySelector("[data-testid=question]")?.textContent !== prev, text);
  }
  await expect(page).toHaveURL(/\/session\//);

  // Bring the deadline forward to 3 seconds from now, as if the 15 minutes were nearly up.
  await prisma.testSession.update({ where: { id: sessionId }, data: { expiresAt: new Date(Date.now() + 3000) } });
  await page.reload();
  await expect(page.getByTestId("timer")).toHaveText(/^0:0[0-3]$/);
  await expect(page).toHaveURL(/\/candidate\/tests\/result\//, { timeout: 20_000 });
  await expect(page.getByTestId("summary")).toBeVisible();
  expect((await prisma.testSession.findUniqueOrThrow({ where: { id: sessionId } })).status).toBe("COMPLETED");
  expect(await prisma.score.count({ where: { sessionId } })).toBe(1);
});

test("running out of time too early gives no score and allows a retake straight away", async ({ page }) => {
  test.setTimeout(120_000);
  const c = await kit.addCandidate("tooslow");
  await signIn(page, c.email);
  await page.goto("/candidate/tests/iq");
  await page.getByRole("button", { name: "Start the test" }).click();
  await expect(page).toHaveURL(/\/session\//);
  const sessionId = page.url().split("/").pop()!;

  await page.getByTestId("option-B").click();
  await page.getByTestId("next").click();
  await expect(page.getByTestId("position")).toContainText("Question 2");

  await prisma.testSession.update({ where: { id: sessionId }, data: { expiresAt: new Date(Date.now() + 2000) } });
  await page.reload();
  await expect(page).toHaveURL(/\/candidate\/tests\/result\//, { timeout: 20_000 });
  await expect(page.getByText("This test was not scored.")).toBeVisible();
  expect(await prisma.score.count({ where: { sessionId } })).toBe(0);

  await page.goto("/candidate/tests");
  await expect(page.getByRole("region", { name: "IQ" })).toContainText("Not started");
});

test("the Language test continues to a writing task with a word counter, and warns that AI grades it", async ({ page }) => {
  test.setTimeout(180_000);
  const c = await kit.addCandidate("langtaker");
  await signIn(page, c.email);
  await page.goto("/candidate/tests/language");
  await expect(page.getByText("graded by AI")).toBeVisible();
  await page.getByRole("button", { name: "Start the test" }).click();
  await expect(page).toHaveURL(/\/session\//);

  await answerAll(page, () => "option-B");
  await expect(page.getByTestId("writing-prompt")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("graded by AI")).toBeVisible();
  const submit = page.getByTestId("submit-writing");
  await expect(submit).toBeDisabled();
  await page.getByTestId("essay").fill("Too short.");
  await expect(page.getByTestId("word-count")).toContainText("2 words");
  await expect(submit).toBeDisabled();
  await page.getByTestId("essay").fill(Array.from({ length: 30 }, (_, i) => `word${i}`).join(" "));
  await expect(page.getByTestId("word-count")).toContainText("30 words");
  await expect(submit).toBeEnabled();
  await noSideways(page);
  // Not submitted: the real grader would spend real money. The grading itself is covered by the unit tests.
});

test("an unconfirmed email cannot start a test, on the page or through the API", async ({ page }) => {
  const c = await kit.addCandidate("unconfirmed", { verified: false });
  await signIn(page, c.email);
  await page.goto("/candidate/tests");
  await expect(page.getByRole("alert").filter({ hasText: "Confirm your email address to start tests" })).toBeVisible();
  await expect(page.getByRole("region", { name: "IQ" }).getByRole("link", { name: "Start" })).toHaveCount(0);
  const res = await page.request.post("/api/tests/IQ/start");
  expect(res.status()).toBe(403);
  expect((await res.json()).code).toBe("EMAIL_NOT_VERIFIED");
});

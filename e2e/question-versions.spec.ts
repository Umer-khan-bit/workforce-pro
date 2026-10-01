import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { createKit, type Kit } from "../src/lib/testEngine/testkit";
import { logInAs, prisma, uniqueEmail } from "./helpers";

// An admin meets a question that candidates have answered, and has to retire it and add a new version.
let kit: Kit;
let adminId: string;
const adminEmail = uniqueEmail("versions-admin");
const PASSWORD = "adminpassword1";
const options = ["A", "B", "C", "D"].map((key) => ({ key, text: `Option ${key}` }));

test.beforeAll(async () => {
  kit = await createKit(prisma, "evr");
  const admin = await prisma.user.create({
    data: { email: adminEmail, name: "Versions Admin", password: await bcrypt.hash(PASSWORD, 10), role: "PLATFORM_ADMIN", emailVerified: new Date() },
  });
  adminId = admin.id;
});

test.afterAll(async () => {
  await kit.cleanup();
  await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
  await prisma.user.delete({ where: { id: adminId } });
});

test("an answered question is frozen: retire it and add a new version, linked to the old one", async ({ page }) => {
  // A question that one candidate has already answered.
  const question = await prisma.question.create({
    data: {
      testType: "IQ",
      type: "MCQ",
      content: `${kit.run} Which number is the smallest prime number?`,
      options,
      correctAnswer: "B",
      topic: "number theory",
      aParam: 1,
      bParam: 0,
      status: "APPROVED",
      languageId: kit.language.id,
    },
  });
  const candidate = await kit.addCandidate("answerer");
  const session = await prisma.testSession.create({ data: { candidateProfileId: candidate.profileId, testType: "IQ", status: "COMPLETED", languageId: kit.language.id } });
  await prisma.response.create({ data: { sessionId: session.id, questionId: question.id, answerGiven: { key: "B" }, isCorrect: true } });

  await logInAs(page, adminEmail, PASSWORD);
  await expect(page).toHaveURL(/\/admin$/);

  // The edit page explains the situation and freezes everything except the explanation.
  await page.goto(`/admin/question-bank/${question.id}/edit`);
  const note = page.getByTestId("locked-note");
  await expect(note).toBeVisible();
  await expect(note).toContainText("Candidates have answered this question (1 answer)");
  await expect(note).toContainText("Retire it and add a new version");
  await expect(page.getByLabel("Question text")).toBeDisabled();
  await expect(page.locator("#testType")).toBeDisabled();
  await expect(page.getByLabel("Option B is correct")).toBeDisabled();
  await expect(page.getByLabel("Option C text")).toBeDisabled();
  await expect(page.locator("#difficulty")).toBeDisabled();
  await expect(page.getByLabel("Explanation (optional)")).toBeEnabled();

  // The explanation can still be edited.
  await page.getByLabel("Explanation (optional)").fill("Two is the only even prime.");
  await page.getByRole("button", { name: "Save explanation" }).click();
  await expect(page).toHaveURL(/\/admin\/question-bank$/);
  expect((await prisma.question.findUniqueOrThrow({ where: { id: question.id } })).explanation).toBe("Two is the only even prime.");

  // Going around the screen does not work either: the server says no.
  const attack = await page.request.patch(`/api/admin/questions/${question.id}`, {
    data: { testType: "IQ", type: "MCQ", content: "A sneaky replacement?", options, correctAnswer: "C", difficulty: "MEDIUM", languageId: kit.language.id },
  });
  expect(attack.status()).toBe(409);
  expect((await attack.json()).code).toBe("QUESTION_IN_USE");
  expect((await prisma.question.findUniqueOrThrow({ where: { id: question.id } })).content).toContain("smallest prime");

  // Retire it and add a new version.
  await page.goto(`/admin/question-bank/${question.id}/edit`);
  await page.getByRole("link", { name: "Retire it and add a new version" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/question-bank/new\\?from=${question.id}`));
  await expect(page.getByRole("heading", { name: "Add a new version" })).toBeVisible();
  await expect(page.getByTestId("version-note")).toContainText("smallest prime number");
  await expect(page.getByLabel("Question text")).toBeEnabled();
  await expect(page.getByLabel("Question text")).toHaveValue(question.content); // pre-filled from the old question
  const pretest = page.getByLabel("Start as pretest (unscored)");
  await expect(pretest).not.toBeChecked();

  await page.getByLabel("Question text").fill(`${kit.run} Which is the smallest prime number: 0, 1, 2 or 3?`);
  await pretest.check();
  await page.getByRole("button", { name: "Save new version and retire the old one" }).click();
  await expect(page).toHaveURL(/\/admin\/question-bank$/);

  // The database: linked, approved, pretest; the old one retired with its answer still on it.
  const created = await prisma.question.findFirstOrThrow({ where: { previousVersionId: question.id } });
  expect(created).toMatchObject({ status: "APPROVED", isPretest: true, approvedById: adminId, correctAnswer: "B" });
  expect(created.content).toContain("0, 1, 2 or 3");
  expect((await prisma.question.findUniqueOrThrow({ where: { id: question.id } })).status).toBe("RETIRED");
  expect(await prisma.response.count({ where: { questionId: question.id } })).toBe(1);

  // The list says which is which, and the edit pages link both ways.
  await page.goto(`/admin/question-bank?q=${kit.run}`);
  await expect(page.getByText("replaced by a newer version")).toBeVisible();
  await expect(page.getByText("new version of an earlier question")).toBeVisible();

  await page.goto(`/admin/question-bank/${question.id}/edit`);
  await expect(page.getByTestId("version-links")).toContainText("Replaced by a newer version");
  await page.goto(`/admin/question-bank/${created.id}/edit`);
  await expect(page.getByTestId("version-links")).toContainText("This is a newer version of");
  await expect(page.getByTestId("locked-note")).toHaveCount(0); // nobody has answered the new version yet
  await expect(page.getByLabel("Question text")).toBeEnabled();
});

test("a question nobody has answered can still be edited freely", async ({ page }) => {
  const question = await prisma.question.create({
    data: { testType: "IQ", type: "MCQ", content: `${kit.run} Unanswered question?`, options, correctAnswer: "B", aParam: 1, bParam: 0, status: "APPROVED", languageId: kit.language.id },
  });
  await logInAs(page, adminEmail, PASSWORD);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto(`/admin/question-bank/${question.id}/edit`);
  await expect(page.getByTestId("locked-note")).toHaveCount(0);
  await page.getByLabel("Question text").fill(`${kit.run} Unanswered question, reworded?`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/admin\/question-bank$/);
  expect((await prisma.question.findUniqueOrThrow({ where: { id: question.id } })).content).toContain("reworded");
});

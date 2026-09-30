import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { deleteTestData, prisma, uniqueEmail } from "./helpers";

// Uses its own temporary pending questions (and never "select all"), so real pending questions are untouched.
test.describe.configure({ mode: "serial" });

const PASSWORD = "adminpassword1";
let email: string;
let adminId: string;
const ids: string[] = [];

const options = ["A", "B", "C", "D"].map((key) => ({ key, text: `Option ${key}` }));

async function makePending(content: string, reviewVerdict: "OK" | "NEEDS_FIX" | null) {
  const q = await prisma.question.create({
    data: {
      testType: "IQ",
      type: "MCQ",
      content,
      options,
      correctAnswer: "B",
      explanation: "Because B.",
      topic: "e2e",
      aParam: 1,
      bParam: 0,
      status: "PENDING_APPROVAL",
      source: "AI_GENERATED",
      reviewVerdict,
      reviewNotes: reviewVerdict === "NEEDS_FIX" ? "Wording is ambiguous." : "Looks fine.",
    },
  });
  ids.push(q.id);
  return q.id;
}

test.beforeAll(async () => {
  email = uniqueEmail("approvals-admin");
  const u = await prisma.user.create({
    data: { email, password: await bcrypt.hash(PASSWORD, 10), role: "PLATFORM_ADMIN", name: "Approvals Admin" },
  });
  adminId = u.id;
});

test.afterAll(async () => {
  await prisma.question.deleteMany({ where: { id: { in: ids } } });
  await deleteTestData([email]);
});

async function logIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

const card = (page: Page, text: string) => page.getByRole("listitem").filter({ hasText: text });

test("bulk approve skips questions the AI review flagged, unless asked", async ({ page }) => {
  const ok = await makePending("E2E alpha: a fine question?", "OK");
  const flagged = await makePending("E2E beta: a flagged question?", "NEEDS_FIX");
  await logIn(page);
  await page.goto("/admin/approvals");

  await expect(card(page, "E2E beta").getByText("AI review: needs fixing")).toBeVisible();
  await expect(card(page, "E2E beta").getByText("Wording is ambiguous.")).toBeVisible();

  await card(page, "E2E alpha").getByLabel("Select this question").check();
  await card(page, "E2E beta").getByLabel("Select this question").check();
  await page.getByRole("button", { name: /Approve selected \(2\)/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Approved 1." })).toContainText("1 flagged by the AI review were left pending");

  const a = await prisma.question.findUniqueOrThrow({ where: { id: ok } });
  expect(a.status).toBe("APPROVED");
  expect(a.approvedById).toBe(adminId);
  expect(a.approvedAt).not.toBeNull();
  expect((await prisma.question.findUniqueOrThrow({ where: { id: flagged } })).status).toBe("PENDING_APPROVAL");

  // Now include the flagged one on purpose.
  await card(page, "E2E beta").getByLabel("Select this question").check();
  await page.getByLabel("Include questions flagged by the AI review").check();
  await page.getByRole("button", { name: /Approve selected \(1\)/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Approved 1." })).toBeVisible();
  await expect.poll(async () => (await prisma.question.findUniqueOrThrow({ where: { id: flagged } })).status).toBe("APPROVED");
});

test("reject keeps the question, marks it rejected and stores the reason; approve and edit work per question", async ({ page }) => {
  const rejectId = await makePending("E2E gamma: to be rejected?", null);
  const approveId = await makePending("E2E delta: to be approved singly?", "OK");
  const editId = await makePending("E2E epsilon: to be edited?", "OK");
  await logIn(page);
  await page.goto("/admin/approvals");

  await card(page, "E2E gamma").getByRole("button", { name: "Reject" }).click();
  await card(page, "E2E gamma").getByPlaceholder("Reason (optional)").fill("Too easy");
  await card(page, "E2E gamma").getByRole("button", { name: "Confirm reject" }).click();
  await expect.poll(async () => (await prisma.question.findUniqueOrThrow({ where: { id: rejectId } })).status).toBe("REJECTED");
  expect((await prisma.question.findUniqueOrThrow({ where: { id: rejectId } })).rejectionReason).toBe("Too easy");
  await expect(card(page, "E2E gamma")).toHaveCount(0);

  await card(page, "E2E delta").getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(async () => (await prisma.question.findUniqueOrThrow({ where: { id: approveId } })).status).toBe("APPROVED");

  // Edit keeps it pending and returns to the queue.
  await card(page, "E2E epsilon").getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/question-bank/${editId}/edit\\?from=approvals`));
  await expect(page.getByText("AI review notes:")).toBeVisible();
  await page.getByLabel("Question text").fill("E2E epsilon: edited wording?");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/admin\/approvals$/);
  const edited = await prisma.question.findUniqueOrThrow({ where: { id: editId } });
  expect(edited.content).toBe("E2E epsilon: edited wording?");
  expect(edited.status).toBe("PENDING_APPROVAL");
});

test("the generate page explains a missing key instead of failing", async ({ page }) => {
  await logIn(page);
  await page.goto("/admin/question-bank/generate");
  await expect(page.getByRole("heading", { name: "Generate questions with AI" })).toBeVisible();
  // The test server has the key set, so the form is usable; the banner only shows when it is missing.
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  if (!hasKey) await expect(page.getByRole("alert")).toContainText("ANTHROPIC_API_KEY");
  await expect(page.getByRole("button", { name: "Generate and review" })).toBeVisible();
});

import { test, expect } from "@playwright/test";
import { DEMO_PASSWORD, logInAs, prisma } from "./helpers";
import { resetDemoStory } from "../prisma/resetDemoStory";

// The live part of DEMO_SCRIPT.md, step by step with the demo accounts: Sana finds Faisal, sends a request, Faisal accepts,
// Sana then sees his contact details, and the reset puts everything back. Runs against the demo data.
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => { await resetDemoStory(prisma); });
test.afterAll(async () => { await resetDemoStory(prisma); });

test("recruiter finds a Top Performer, the candidate accepts, then the recruiter sees the contact details", async ({ browser }) => {
  const sana = await (await browser.newContext()).newPage();
  await logInAs(sana, "recruiter@demo.test", DEMO_PASSWORD);
  await expect(sana).toHaveURL(/\/recruiter$/);
  await sana.goto("/recruiter/candidates");
  await sana.getByRole("link", { name: /Faisal Chaudhry/ }).first().click();
  await expect(sana.getByRole("heading", { level: 1 })).toContainText("Faisal Chaudhry");
  await expect(sana.getByText(/Minimum salary/i)).toHaveCount(0);
  await sana.getByLabel("Job opening", { exact: true }).selectOption({ label: "Senior accountant, Karachi" });
  await sana.getByRole("button", { name: "Send contact request" }).click();
  await expect(sana.getByText("Request sent. The candidate will see it under Recruiter requests.")).toBeVisible();

  const faisal = await (await browser.newContext()).newPage();
  await logInAs(faisal, "faisal.chaudhry@demo.test", DEMO_PASSWORD);
  await expect(faisal).toHaveURL(/\/candidate$/);
  await faisal.goto("/candidate/contact-requests");
  await expect(faisal.getByText("Karachi Tech Solutions")).toBeVisible();
  await faisal.getByRole("button", { name: "Accept" }).first().click();
  await expect(faisal.getByText("Accepted").first()).toBeVisible();

  await sana.goto("/recruiter/contact-requests");
  await expect(sana.getByText("Faisal Chaudhry").first()).toBeVisible();
  await expect(sana.getByText("Accepted").first()).toBeVisible();
});

test("the demo logins of every role reach their dashboard", async ({ page }) => {
  await logInAs(page, "candidate@demo.test", DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/candidate$/);
  await page.goto("/candidate/contact-requests");
  await expect(page.getByText("Waiting for you")).toBeVisible();
});

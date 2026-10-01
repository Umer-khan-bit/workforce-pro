import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { createCompany, type World } from "../src/lib/recruiter/testWorld";
import { deleteTestData, logInAs, prisma, uniqueEmail } from "./helpers";

// Subscription checkout (upgrade, downgrade, failure), company admin dashboards and reports, and the platform
// admin's Companies, Users, Payments and Reports screens. Own companies and own admin users throughout.
test.describe.configure({ mode: "serial" });

const PASSWORD = "x-pass-12345";
const tag = `e2eb${Date.now().toString(36)}`;
const worlds: World[] = [];
const adminEmails: string[] = [];

test.afterAll(async () => {
  for (const w of worlds) await w.cleanup();
  if (adminEmails.length) await deleteTestData(adminEmails);
});

async function signIn(page: Page, email: string, home: string) {
  await logInAs(page, email, PASSWORD);
  await expect(page).toHaveURL(new RegExp(`${home}$`));
}
async function platformAdmin(prefix: string) {
  const email = uniqueEmail(prefix);
  adminEmails.push(email);
  await prisma.user.create({ data: { email, name: "E2E platform admin", password: await bcrypt.hash(PASSWORD, 10), role: "PLATFORM_ADMIN", emailVerified: new Date() } });
  return email;
}

test("checkout: a failed payment keeps the plan, a successful upgrade charges the difference, a downgrade can be free, and the history lists it all", async ({ page }) => {
  const w = await createCompany(prisma, `${tag}a`, { features: { allCandidates: true, maxShortlists: 5, maxJobOpenings: 1 }, price: 10_000 });
  worlds.push(w);
  const premium = await w.addPlan("premium", { allCandidates: true, q1Exclusive: true, aiSearch: true, maxShortlists: null, maxJobOpenings: null }, 30_000);
  await signIn(page, w.admin.email, "/company-admin");

  await page.getByRole("navigation", { name: "Company admin navigation" }).getByRole("link", { name: "Subscription & billing" }).click();
  await expect(page.getByTestId("current-plan")).toContainText("Plan main");
  await expect(page.getByTestId(`choose-${premium.code}`)).toContainText("Upgrade to");
  await page.getByTestId(`choose-${premium.code}`).click();

  await expect(page.getByTestId("checkout-title")).toContainText("Upgrade your plan");
  await expect(page.getByTestId("order-price")).toHaveText("PKR 30,000");
  await expect(page.getByTestId("order-credit")).toContainText("PKR 10,000");
  await expect(page.getByTestId("order-total")).toHaveText("PKR 20,000");
  await expect(page.getByTestId("demo-notice")).toContainText("No real money moves");

  await page.getByTestId("pay-fail").click();
  await expect(page.getByTestId("pay-error")).toContainText("declined");
  expect((await prisma.subscription.findFirstOrThrow({ where: { companyId: w.company.id, status: "ACTIVE" } })).planId).toBe(w.plan!.id);

  await page.getByTestId("pay").click();
  await expect(page).toHaveURL(/\/company-admin\/subscription\?changed=1$/);
  await expect(page.getByTestId("plan-changed")).toBeVisible();
  await expect(page.getByTestId("current-plan")).toContainText("Plan premium");
  const payments = page.getByTestId("company-payments").getByRole("row");
  await expect(payments).toHaveCount(3); // header + failed + paid
  await expect(page.getByTestId("company-payments")).toContainText("Failed");
  await expect(page.getByTestId("company-payments")).toContainText("Paid");

  // Back down to the cheaper plan: the credit covers it, so it is free.
  await page.getByTestId(`choose-${w.plan!.code}`).click();
  await expect(page.getByTestId("checkout-title")).toContainText("Switch to a lower plan");
  await expect(page.getByTestId("order-total")).toHaveText("PKR 0");
  await expect(page.getByTestId("demo-notice")).toHaveCount(0);
  await page.getByTestId("pay").click();
  await expect(page.getByTestId("current-plan")).toContainText("Plan main");
  expect(await prisma.payment.count({ where: { companyId: w.company.id } })).toBe(2); // the free change made no payment

  await page.goto("/company-admin/notifications");
  await expect(page.getByTestId("notification").filter({ hasText: "is now on" })).toHaveCount(2);
  await expect(page.getByTestId("notification").filter({ hasText: "failed" })).toHaveCount(1);
});

test("a company with no plan starts one at checkout and can then search; the recruiter was blocked before", async ({ browser }) => {
  const w = await createCompany(prisma, `${tag}b`, { features: null });
  worlds.push(w);
  const plan = await w.addPlan("start", { allCandidates: true, maxShortlists: 5, maxJobOpenings: 3 }, 5_000);

  const rec = await (await browser.newContext()).newPage();
  await signIn(rec, w.recruiter.email, "/recruiter");
  await rec.goto("/recruiter/candidates");
  await expect(rec.getByTestId("plan-blocked")).toContainText("no plan yet");

  const adm = await (await browser.newContext()).newPage();
  await signIn(adm, w.admin.email, "/company-admin");
  await expect(adm.getByRole("status")).toContainText("no plan yet");
  await adm.goto(`/company-admin/subscription/checkout?plan=${plan.code}`);
  await expect(adm.getByTestId("checkout-title")).toContainText("Start this plan");
  await adm.getByTestId("pay").click();
  await expect(adm.getByTestId("current-plan")).toContainText("Plan start");

  await rec.goto("/recruiter/candidates");
  await expect(rec.getByTestId("plan-blocked")).toHaveCount(0);
  expect((await adm.goto("/company-admin/subscription/checkout?plan=no-such-plan"))?.status()).toBe(404);
});

test("only a company admin can reach checkout and the billing API", async ({ browser }) => {
  const w = await createCompany(prisma, `${tag}c`);
  worlds.push(w);
  const rec = await (await browser.newContext()).newPage();
  await signIn(rec, w.recruiter.email, "/recruiter");
  await rec.goto("/company-admin/subscription");
  await expect(rec).toHaveURL(/\/unauthorized$/);
  const res = await rec.request.post("/api/subscription/checkout", { data: { planCode: w.plan!.code } });
  expect(res.status()).toBe(403);
});

test("company admin: the dashboard and reports show the funnel, recruiter activity, openings and the plan's usage", async ({ page }) => {
  const w = await createCompany(prisma, `${tag}d`, { features: { allCandidates: true, maxShortlists: 10, maxJobOpenings: 4 } });
  worlds.push(w);
  const role = await prisma.jobRole.findFirstOrThrow({ where: { name: "Accountant" } });
  const opening = await prisma.jobOpening.create({ data: { companyId: w.company.id, createdById: w.recruiter.id, jobRoleId: role.id, title: "Reported role", salaryRangeMin: 1, salaryRangeMax: 99_999 } });
  const DAY = 86_400_000;
  const candidates = await prisma.candidateProfile.findMany({ where: { anonymisedAt: null, jobRoleId: role.id }, take: 2, orderBy: { id: "asc" } });
  const steps = [[["SHORTLISTED", 12], ["CONTACTED", 9], ["HIRED", 4]], [["SHORTLISTED", 6]]] as const;
  for (const [i, c] of candidates.entries()) {
    const e = await prisma.shortlist.create({ data: { recruiterId: w.recruiter.id, candidateProfileId: c.id, jobOpeningId: opening.id, status: steps[i].at(-1)![0], createdAt: new Date(Date.now() - steps[i][0][1] * DAY) } });
    await prisma.shortlistStatusHistory.createMany({ data: steps[i].map(([status, d]) => ({ shortlistId: e.id, status, changedAt: new Date(Date.now() - d * DAY) })) });
  }

  await signIn(page, w.admin.email, "/company-admin");
  await expect(page.getByTestId("funnel")).toBeVisible();
  await expect(page.getByTestId("time-to-hire")).toContainText("8 days");
  await page.getByRole("navigation", { name: "Company admin navigation" }).getByRole("link", { name: "Reports" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  await expect(page.getByTestId("avg-days")).toContainText("8 days");
  await expect(page.getByTestId("openings-by-status")).toContainText("Open");
  const activity = page.getByTestId("recruiter-activity");
  await expect(activity).toContainText(`recruiter ${w.tag}`);
  await expect(activity.getByRole("row").nth(1)).toContainText("2"); // shortlisted by this recruiter
  await expect(page.getByTestId("by-city")).toBeVisible();
  await page.getByRole("link", { name: "Last 30 days" }).click();
  await expect(page).toHaveURL(/days=30/);
});

test.describe("platform admin screens", () => {
  test("Companies: the list, a company's team and history, and giving a plan", async ({ page }) => {
    const w = await createCompany(prisma, `${tag}e`, { features: null });
    worlds.push(w);
    const gift = await w.addPlan("gift", { allCandidates: true }, 999);
    await signIn(page, await platformAdmin("adm-co"), "/admin");
    await page.getByRole("navigation", { name: "Platform admin navigation" }).getByRole("link", { name: "Companies" }).click();
    await expect(page.getByTestId("companies-table")).toBeVisible();
    const row = page.getByTestId("company-row").filter({ hasText: `World ${w.tag}` });
    await expect(row).toContainText("No plan");
    await row.getByRole("link", { name: `World ${w.tag}` }).click();
    await expect(page.getByTestId("company-name")).toHaveText(`World ${w.tag}`);
    await expect(page.getByTestId("company-users")).toContainText(w.admin.email);
    await expect(page.getByTestId("company-users")).toContainText("Recruiter");

    await page.getByLabel("Plan", { exact: true }).selectOption({ label: gift.name });
    await page.getByLabel("For (days)").fill("45");
    await page.getByRole("button", { name: "Give plan" }).click();
    await expect(page.getByText("Plan assigned.")).toBeVisible();
    await expect(page.getByTestId("company-subscriptions")).toContainText(gift.name);
    expect((await prisma.subscription.findFirstOrThrow({ where: { companyId: w.company.id, status: "ACTIVE" } })).planId).toBe(gift.id);
    expect(await prisma.notification.count({ where: { userId: w.admin.id, title: { contains: "is now on" } } })).toBe(1);
  });

  test("Users: filter and search, switch someone off (their session ends), and switch them on again", async ({ browser, page }) => {
    const w = await createCompany(prisma, `${tag}f`);
    worlds.push(w);
    await signIn(page, await platformAdmin("adm-us"), "/admin");
    await page.getByRole("navigation", { name: "Platform admin navigation" }).getByRole("link", { name: "Users" }).click();
    await page.getByLabel("Search").fill(w.recruiter.email);
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page.getByTestId("user-count")).toHaveText("1 user");
    const row = page.getByTestId("user-row");
    await expect(row).toContainText("Recruiter");
    await expect(row).toContainText("Active");

    // The recruiter is signed in somewhere else.
    const rec = await (await browser.newContext()).newPage();
    await signIn(rec, w.recruiter.email, "/recruiter");

    await row.getByRole("button", { name: "Deactivate" }).click();
    await expect(row).toContainText("Deactivated");
    await rec.goto("/recruiter/shortlists");
    await expect(rec).toHaveURL(/\/login/); // their next click ends the session
    await row.getByRole("button", { name: "Require new password" }).click();
    await expect(row).toContainText("New password required");
    await row.getByRole("button", { name: "Activate" }).click();
    await expect(row).toContainText("Active");

    await page.goto(`/admin/users?role=COMPANY_ADMIN&status=active&q=${w.admin.email}`);
    await expect(page.getByTestId("user-count")).toHaveText("1 user");
    await page.goto(`/admin/users?role=CANDIDATE&q=${w.admin.email}`);
    await expect(page.getByTestId("user-count")).toHaveText("0 users");
  });

  test("Users: an admin cannot switch off their own account", async ({ page }) => {
    const email = await platformAdmin("adm-self");
    await signIn(page, email, "/admin");
    await page.goto(`/admin/users?q=${email}`);
    await expect(page.getByTestId("user-row").getByRole("button", { name: "Deactivate" })).toBeDisabled();
  });

  test("Payments: the ledger, its totals and its filters", async ({ page }) => {
    const w = await createCompany(prisma, `${tag}g`);
    worlds.push(w);
    await prisma.payment.createMany({
      data: [
        { purpose: "SUBSCRIPTION", companyId: w.company.id, planId: w.plan!.id, amount: 12_345, currency: "PKR", status: "SUCCESS", provider: "simulated", providerReference: `SIM-${tag}-OK` },
        { purpose: "SUBSCRIPTION", companyId: w.company.id, planId: w.plan!.id, amount: 6_789, currency: "PKR", status: "FAILED", provider: "simulated", providerReference: `SIM-${tag}-NO` },
      ],
    });
    await signIn(page, await platformAdmin("adm-pay"), "/admin");
    await page.getByRole("navigation", { name: "Platform admin navigation" }).getByRole("link", { name: "Payments" }).click();
    await expect(page.getByTestId("payment-stats")).toContainText("Subscriptions collected");
    const table = page.getByTestId("payments-table");
    await expect(table).toContainText(`SIM-${tag}-OK`);
    await expect(table.getByTestId("payment-row").filter({ hasText: `SIM-${tag}-OK` })).toContainText("PKR 12,345");
    await expect(table.getByTestId("payment-row").filter({ hasText: `SIM-${tag}-OK` })).toContainText(`World ${w.tag}`);

    await page.getByLabel("Status").selectOption("FAILED");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page.getByTestId("payments-table")).toContainText(`SIM-${tag}-NO`);
    await expect(page.getByTestId("payments-table")).not.toContainText(`SIM-${tag}-OK`);
    await page.getByRole("link", { name: "Clear" }).click();
    await page.getByLabel("For", { exact: true }).selectOption("COURSE");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page.getByTestId("payments-table")).not.toContainText(`SIM-${tag}-OK`);
  });

  test("Reports and the dashboard: candidates by city and role, quartiles, funnel, time to hire, revenue", async ({ page }) => {
    await signIn(page, await platformAdmin("adm-rep"), "/admin");
    await expect(page.getByTestId("dashboard-cities")).toBeVisible();
    await expect(page.getByTestId("dashboard-iq")).toBeVisible();
    await page.getByRole("navigation", { name: "Platform admin navigation" }).getByRole("link", { name: "Reports" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
    for (const id of ["funnel", "time-to-hire", "activity", "revenue", "by-plan", "candidate-signups", "company-signups", "openings", "by-city", "by-role", "quartiles-IQ", "quartiles-EQ", "quartiles-Language", "quartiles-Job skill"]) {
      await expect(page.getByTestId(id), id).toBeVisible();
    }
    await expect(page.getByTestId("by-city")).toContainText("Karachi"); // from the demo candidates
    await page.getByRole("link", { name: "Last 180 days" }).click();
    await expect(page).toHaveURL(/days=180/);
  });
});

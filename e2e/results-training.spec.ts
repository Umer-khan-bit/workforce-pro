import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { deleteTestData, logInAs, prisma, uniqueEmail } from "./helpers";

// Candidate results, salary guide, badges, training, notifications and recruiter requests, plus the
// admin course screens. Each test makes its own candidate (and course), so nothing depends on, or changes,
// the demo candidates. AI feedback is saved in advance, so no test calls the real Claude API.

const PASSWORD = "e2e-pass-12345";
const created: { emails: string[]; courseIds: string[]; companyIds: string[]; openingIds: string[] } = { emails: [], courseIds: [], companyIds: [], openingIds: [] };

async function makeCandidate(prefix: string, over: { minimumSalary?: number | null; verified?: boolean } = {}) {
  const email = uniqueEmail(prefix);
  created.emails.push(email);
  const accountant = await prisma.jobRole.findFirstOrThrow({ where: { name: "Accountant" } });
  const user = await prisma.user.create({
    data: {
      email,
      name: `E2E ${prefix}`,
      password: await bcrypt.hash(PASSWORD, 10),
      role: "CANDIDATE",
      emailVerified: over.verified === false ? null : new Date(),
      candidateProfile: { create: { city: "Lahore", experienceYears: 4, jobRoleId: accountant.id, minimumSalary: over.minimumSalary === undefined ? 70_000 : over.minimumSalary, consentGiven: true, consentAt: new Date() } },
    },
    include: { candidateProfile: true },
  });
  return { email, userId: user.id, profileId: user.candidateProfile!.id };
}

/** A platform admin of its own, so these tests never use up the demo admin's login attempts (the limit is 5 per 15 minutes). */
async function makeAdmin(prefix: string) {
  const email = uniqueEmail(prefix);
  created.emails.push(email);
  await prisma.user.create({ data: { email, name: `E2E admin ${prefix}`, password: await bcrypt.hash(PASSWORD, 10), role: "PLATFORM_ADMIN", emailVerified: new Date() } });
  return email;
}

async function addResult(profileId: string, testType: "PERSONALITY" | "IQ" | "EQ" | "LANGUAGE" | "SKILL", over: { quartile?: number | null; feedback?: boolean; cefr?: "B2" } = {}) {
  const quartile = over.quartile === undefined ? 2 : over.quartile;
  const session = await prisma.testSession.create({ data: { candidateProfileId: profileId, testType, status: "COMPLETED", completedAt: new Date() } });
  const score = await prisma.score.create({
    data: {
      candidateProfileId: profileId, sessionId: session.id, testType, rawScore: 66, quartile, percentile: quartile === null ? null : 80 - quartile * 10, rankValue: 0.4,
      cohortScope: quartile === null ? null : "ALL", cohortSize: quartile === null ? null : 64, cefrLevel: over.cefr ?? null,
      details: testType === "PERSONALITY" ? { traits: [{ trait: "Extraversion", score: 3.7 }, { trait: "Emotional Stability", score: 4.1 }] } : {},
    },
  });
  if (over.feedback !== false) {
    await prisma.aIFeedback.create({ data: { candidateProfileId: profileId, testType, scoreId: score.id, feedbackText: `Saved feedback for ${testType}.`, improvementTips: [`First tip for ${testType}.`, "Second tip."] } });
  }
  return score;
}

async function makeCourse(title: string, over: { price?: number; lessons?: number; testType?: "IQ" | null } = {}) {
  const course = await prisma.course.create({
    data: {
      title,
      description: `About ${title}.`,
      isFree: !over.price,
      price: over.price ?? 0,
      testType: over.testType ?? null,
      lessons: { create: Array.from({ length: over.lessons ?? 2 }, (_, i) => ({ title: `${title} lesson ${i + 1}`, content: `Text of lesson ${i + 1}.`, order: i + 1, durationMinutes: 5 })) },
    },
  });
  created.courseIds.push(course.id);
  return course;
}

test.afterAll(async () => {
  await prisma.lessonProgress.deleteMany({ where: { lesson: { courseId: { in: created.courseIds } } } });
  await prisma.payment.deleteMany({ where: { courseId: { in: created.courseIds } } });
  await prisma.enrollment.deleteMany({ where: { courseId: { in: created.courseIds } } });
  await prisma.courseRecommendation.deleteMany({ where: { courseId: { in: created.courseIds } } });
  await prisma.courseLesson.deleteMany({ where: { courseId: { in: created.courseIds } } });
  await prisma.course.deleteMany({ where: { id: { in: created.courseIds } } });
  await prisma.contactRequest.deleteMany({ where: { jobOpeningId: { in: created.openingIds } } });
  await prisma.jobOpening.deleteMany({ where: { id: { in: created.openingIds } } });
  await deleteTestData(created.emails);
  for (const id of created.companyIds) await prisma.company.deleteMany({ where: { id } });
});

async function signIn(page: Page, email: string) {
  await logInAs(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/candidate$/);
}

test("My results shows every score with its quartile, traits, saved feedback and tips", async ({ page }) => {
  const c = await makeCandidate("results");
  await addResult(c.profileId, "PERSONALITY", { quartile: null });
  await addResult(c.profileId, "IQ", { quartile: 1 });
  await addResult(c.profileId, "LANGUAGE", { quartile: 3, cefr: "B2" });
  await signIn(page, c.email);

  await page.getByRole("navigation", { name: "Candidate navigation" }).getByRole("link", { name: "My results" }).click();
  await expect(page).toHaveURL(/\/candidate\/results$/);
  await expect(page.getByRole("heading", { level: 1, name: "My results" })).toBeVisible();

  const iq = page.getByTestId("result-IQ");
  await expect(iq.getByTestId("quartile-IQ")).toHaveText("Q1");
  await expect(iq).toContainText("Better than 70% of 64 all candidates");
  await expect(iq.getByTestId("feedback")).toContainText("Saved feedback for IQ.");
  await expect(iq.getByTestId("feedback")).toContainText("First tip for IQ.");

  const language = page.getByTestId("result-LANGUAGE");
  await expect(language.getByTestId("quartile-LANGUAGE")).toHaveText("Q3");
  await expect(language.getByTestId("cefr")).toHaveText("B2");

  const personality = page.getByTestId("result-PERSONALITY");
  await expect(personality.getByTestId("traits")).toContainText("Extraversion");
  await expect(personality.getByTestId("traits")).toContainText("higher means calmer");
  await expect(personality.getByTestId("quartile-PERSONALITY")).toHaveCount(0); // not ranked
  await expect(page.getByTestId("result-EQ")).toHaveCount(0); // not taken
});

test("the report downloads as a PDF containing the candidate's results", async ({ page }) => {
  const c = await makeCandidate("pdf");
  await addResult(c.profileId, "IQ", { quartile: 2 });
  await signIn(page, c.email);
  await page.goto("/candidate/results");
  await expect(page.getByTestId("download-report")).toHaveAttribute("href", "/api/results/report");

  const res = await page.request.get("/api/results/report");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const body = await res.body();
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  expect(body.length).toBeGreaterThan(1500);
});

test("a candidate with no results sees how to get started, with no download button", async ({ page }) => {
  const c = await makeCandidate("noresults");
  await signIn(page, c.email);
  await page.goto("/candidate/results");
  await expect(page.getByText("You have no results yet.")).toBeVisible();
  await expect(page.getByTestId("download-report")).toHaveCount(0);
  await page.getByRole("link", { name: "Go to My tests" }).click();
  await expect(page).toHaveURL(/\/candidate\/tests$/);
});

test("the salary guide gives a range from the benchmarks and the results, and compares the candidate's minimum", async ({ page }) => {
  const c = await makeCandidate("salary", { minimumSalary: 60_000 });
  for (const t of ["IQ", "EQ"] as const) await addResult(c.profileId, t, { quartile: 1 });
  await signIn(page, c.email);
  await page.getByRole("navigation", { name: "Candidate navigation" }).getByRole("link", { name: "Salary guide" }).click();
  await expect(page).toHaveURL(/\/candidate\/salary-guide$/);

  await expect(page.getByTestId("suggested-range")).toContainText("PKR");
  await expect(page.getByTestId("salary-guide")).toContainText("Accountant in Lahore");
  await expect(page.getByTestId("salary-guide")).toContainText("2-4 years");
  await expect(page.getByText(/IQ Q1, EQ Q1/)).toBeVisible();
  await expect(page.getByTestId("minimum-comparison")).toContainText("PKR 60,000");
  await expect(page.getByText(/not an offer or a promise/)).toBeVisible();
});

test("the salary guide asks for a complete profile first", async ({ page }) => {
  const c = await makeCandidate("salaryincomplete");
  await prisma.candidateProfile.update({ where: { id: c.profileId }, data: { city: null } });
  await signIn(page, c.email);
  await page.goto("/candidate/salary-guide");
  await expect(page.getByText("Complete your profile to see your salary guide.")).toBeVisible();
  await expect(page.getByText(/still need your city/)).toBeVisible();
});

test("the badges page shows progress towards Top Performer and the earned badge", async ({ page }) => {
  const c = await makeCandidate("badge");
  await addResult(c.profileId, "IQ", { quartile: 1 });
  await addResult(c.profileId, "EQ", { quartile: 3 });
  await signIn(page, c.email);
  await page.goto("/candidate/badges");
  const card = page.getByTestId("top-performer-badge");
  await expect(card).toContainText("Not earned yet");
  await expect(card).toContainText("Q1 - reached");
  await expect(card).toContainText("Q3 - not there yet");
  await expect(card).toContainText("Not taken yet");

  await prisma.badge.create({ data: { candidateProfileId: c.profileId, type: "TOP_PERFORMER_ALL_TESTS" } });
  await page.reload();
  await expect(page.getByTestId("badge-earned")).toBeVisible();
});

test("a candidate joins a free course, works through the lessons and completes it", async ({ page }) => {
  const c = await makeCandidate("free");
  const course = await makeCourse(`E2E free course ${Date.now()}`, { lessons: 2, testType: "IQ" });
  await signIn(page, c.email);

  await page.goto("/candidate/training");
  await page.getByTestId("catalog-course").filter({ hasText: course.title }).getByRole("link", { name: course.title }).click();
  await expect(page.getByRole("heading", { level: 1, name: course.title })).toBeVisible();
  await expect(page.getByText("What you will learn")).toBeVisible();
  await expect(page.getByText("Text of lesson 1.")).toHaveCount(0); // lesson text is for people who have joined

  await page.getByRole("button", { name: "Join this course" }).click();
  await expect(page.getByTestId("lessons")).toBeVisible();
  await expect(page.getByTestId("progress-text")).toHaveText("0% done");

  const lessons = page.getByTestId("lesson");
  await lessons.nth(0).locator("summary").click();
  await expect(lessons.nth(0)).toContainText("Text of lesson 1.");
  await lessons.nth(0).getByRole("button", { name: "Mark as done" }).click();
  await expect(page.getByTestId("progress-text")).toHaveText("50% done");

  await lessons.nth(1).locator("summary").click();
  await lessons.nth(1).getByRole("button", { name: "Mark as done" }).click();
  await expect(page.getByTestId("completed-note")).toContainText("You completed this course");
  await expect(page.getByTestId("completed-note").getByRole("link", { name: /Retake your IQ test/ })).toBeVisible();

  // It now shows under My courses with full progress, and the candidate was notified.
  await page.goto("/candidate/training");
  await expect(page.getByTestId("my-course").filter({ hasText: course.title })).toContainText("Completed");
  await page.goto("/candidate/notifications");
  await expect(page.getByTestId("notification").filter({ hasText: `You completed ${course.title}` })).toBeVisible();
  await expect(page.getByTestId("notification").filter({ hasText: `You joined ${course.title}` })).toBeVisible();
});

test("a paid course: a failed payment enrols nobody, then a successful one opens the lessons", async ({ page }) => {
  const c = await makeCandidate("paid");
  const course = await makeCourse(`E2E paid course ${Date.now()}`, { price: 2500 });
  await signIn(page, c.email);

  await page.goto(`/candidate/training/${course.id}`);
  await expect(page.getByTestId("buy")).toContainText("PKR 2,500");
  await page.getByTestId("buy").click();
  await expect(page).toHaveURL(new RegExp(`/candidate/training/${course.id}/checkout$`));
  await expect(page.getByTestId("order-total")).toHaveText("PKR 2,500");
  await expect(page.getByTestId("demo-notice")).toContainText("No real money moves");

  await page.getByTestId("pay-fail").click();
  await expect(page.getByTestId("pay-error")).toContainText("declined");
  expect(await prisma.enrollment.count({ where: { candidateProfileId: c.profileId, courseId: course.id } })).toBe(0);
  expect((await prisma.payment.findFirstOrThrow({ where: { userId: c.userId, courseId: course.id } })).status).toBe("FAILED");

  await page.getByTestId("pay").click();
  await expect(page).toHaveURL(new RegExp(`/candidate/training/${course.id}$`));
  await expect(page.getByTestId("lessons")).toBeVisible();
  const payments = await prisma.payment.findMany({ where: { userId: c.userId, courseId: course.id }, orderBy: { createdAt: "asc" } });
  expect(payments.map((p) => p.status)).toEqual(["FAILED", "SUCCESS"]);
  expect(payments[1]).toMatchObject({ amount: 2500, provider: "simulated", purpose: "COURSE" });

  // Visiting checkout again, once joined, goes back to the course.
  await page.goto(`/candidate/training/${course.id}/checkout`);
  await expect(page).toHaveURL(new RegExp(`/candidate/training/${course.id}$`));
});

test("a course for another job role is not visible", async ({ page }) => {
  const c = await makeCandidate("otherrole");
  const sales = await prisma.jobRole.findFirstOrThrow({ where: { name: "Sales" } });
  const course = await makeCourse(`E2E sales only ${Date.now()}`);
  await prisma.course.update({ where: { id: course.id }, data: { jobRoleId: sales.id } });
  await signIn(page, c.email); // an accountant
  await page.goto("/candidate/training");
  await expect(page.getByText(course.title)).toHaveCount(0);
  expect((await page.goto(`/candidate/training/${course.id}`))?.status()).toBe(404);
});

test("recommendations for a weak result appear on the Training page (simple rules while AI is offline)", async ({ page }) => {
  const c = await makeCandidate("recs");
  await addResult(c.profileId, "IQ", { quartile: 4 });
  const course = await makeCourse(`AAA E2E IQ booster ${Date.now()}`, { testType: "IQ" });
  // Saved in advance, as the page would after its first visit, so the test does not call the AI service.
  await prisma.courseRecommendation.create({ data: { candidateProfileId: c.profileId, courseId: course.id, reason: "It targets your IQ result (Q4), one of your weaker areas.", source: "RULES" } });
  await signIn(page, c.email);
  await page.goto("/candidate/training");
  const rec = page.getByTestId("recommended-course").filter({ hasText: course.title });
  await expect(rec).toContainText("targets your IQ result (Q4)");
  await expect(rec).toContainText("Free");
  await expect(rec.getByRole("link", { name: course.title })).toHaveAttribute("href", `/candidate/training/${course.id}`);
});

test("notifications: unread count in the sidebar, mark one as read, mark all as read", async ({ page }) => {
  const c = await makeCandidate("notes");
  for (const title of ["First alert", "Second alert", "Third alert"]) {
    await prisma.notification.create({ data: { userId: c.userId, type: "GENERAL", channel: "IN_APP", title, message: `${title} body`, sentAt: new Date(), link: "/candidate/tests" } });
  }
  // Email records are kept too, but they are not part of the in-app list or the count.
  await prisma.notification.create({ data: { userId: c.userId, type: "GENERAL", channel: "EMAIL", title: "An email record", message: "x" } });
  await signIn(page, c.email);

  const sidebar = page.getByRole("navigation", { name: "Candidate navigation" });
  await expect(sidebar.getByRole("link", { name: /^Notifications/ })).toContainText("3");
  await sidebar.getByRole("link", { name: /^Notifications/ }).click();
  await expect(page.getByTestId("notification")).toHaveCount(3);
  await expect(page.getByText("An email record")).toHaveCount(0);
  await expect(page.getByText("3 unread")).toBeVisible();

  await page.getByTestId("notification").filter({ hasText: "First alert" }).getByRole("button", { name: "Mark as read" }).click();
  await expect(page.getByText("2 unread")).toBeVisible();
  await expect(sidebar.getByRole("link", { name: /^Notifications/ })).toContainText("2");

  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByText("You are all caught up.")).toBeVisible();
  await expect(sidebar.getByRole("link", { name: /^Notifications/ })).not.toContainText(/\d/);
  expect(await prisma.notification.count({ where: { userId: c.userId, channel: "IN_APP", readAt: null } })).toBe(0);
});

test("recruiter requests: a candidate sees the request and accepts it; the recruiter is told", async ({ page }) => {
  const c = await makeCandidate("request", { minimumSalary: 50_000 });
  const company = await prisma.company.create({ data: { name: `E2E Requests Co ${Date.now()}` } });
  created.companyIds.push(company.id);
  const recruiterEmail = uniqueEmail("recruiter");
  created.emails.push(recruiterEmail);
  const recruiter = await prisma.user.create({ data: { email: recruiterEmail, name: "Rita Recruiter", password: await bcrypt.hash(PASSWORD, 10), role: "RECRUITER", companyId: company.id, emailVerified: new Date() } });
  const accountant = await prisma.jobRole.findFirstOrThrow({ where: { name: "Accountant" } });
  const opening = await prisma.jobOpening.create({ data: { companyId: company.id, jobRoleId: accountant.id, city: "Lahore", salaryRangeMin: 60_000, salaryRangeMax: 90_000, createdById: recruiter.id } });
  created.openingIds.push(opening.id);
  await prisma.contactRequest.create({ data: { recruiterId: recruiter.id, candidateProfileId: c.profileId, jobOpeningId: opening.id, message: "We have a role you may like." } });

  await signIn(page, c.email);
  await page.getByRole("navigation", { name: "Candidate navigation" }).getByRole("link", { name: "Recruiter requests" }).click();
  const request = page.getByTestId("request");
  await expect(request).toContainText(company.name);
  await expect(request).toContainText("Accountant, Lahore");
  await expect(request).toContainText("We have a role you may like.");
  await expect(request).toContainText("Waiting for you");
  // The candidate's minimum salary is not shown here, and the recruiter's own details stay limited.
  await expect(page.getByText("50,000")).toHaveCount(0);

  await request.getByRole("button", { name: "Accept" }).click();
  await expect(request).toContainText("Accepted");
  await expect(request.getByRole("button", { name: "Accept" })).toHaveCount(0);
  const note = await prisma.notification.findFirstOrThrow({ where: { userId: recruiter.id } });
  expect(note.title).toBe("Contact request accepted");
});

test("the recruiter dashboard counts only candidates whose minimum fits the company's offers", async ({ page }) => {
  const company = await prisma.company.create({ data: { name: `E2E Offers Co ${Date.now()}` } });
  created.companyIds.push(company.id);
  const email = uniqueEmail("offers");
  created.emails.push(email);
  const recruiter = await prisma.user.create({ data: { email, name: "Offer Recruiter", password: await bcrypt.hash(PASSWORD, 10), role: "RECRUITER", companyId: company.id, emailVerified: new Date() } });
  const accountant = await prisma.jobRole.findFirstOrThrow({ where: { name: "Accountant" } });

  await logInAs(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/recruiter$/);
  // No open job opening, so there is no offer to match candidates against.
  await expect(page.getByText("Create a job opening to see candidates")).toBeVisible();

  const offer = 30_000; // below nearly every demo candidate's minimum
  const opening = await prisma.jobOpening.create({ data: { companyId: company.id, jobRoleId: accountant.id, salaryRangeMin: 20_000, salaryRangeMax: offer, createdById: recruiter.id } });
  created.openingIds.push(opening.id);
  const expected = await prisma.candidateProfile.count({ where: { anonymisedAt: null, consentGiven: true, user: { isActive: true }, OR: [{ minimumSalary: null }, { minimumSalary: { lte: offer } }] } });
  const everyone = await prisma.candidateProfile.count();
  expect(expected).toBeLessThan(everyone);
  await page.reload();
  const stat = page.getByText("Candidates matching your offers").locator("..");
  await expect(stat).toContainText(String(expected));
  await expect(stat).toContainText("fit your open job openings");
});

test("the dashboard summarises the latest results and unread notifications", async ({ page }) => {
  const c = await makeCandidate("dash");
  await addResult(c.profileId, "IQ", { quartile: 2 });
  await prisma.notification.create({ data: { userId: c.userId, type: "GENERAL", channel: "IN_APP", title: "Hello", message: "World", sentAt: new Date() } });
  await signIn(page, c.email);
  const card = page.getByTestId("dashboard-results");
  await expect(card).toContainText("Q2");
  await expect(card).toContainText("1 unread notification");
});

// ---------------------------------------------------------------------------------------------- admin

test.describe("platform admin: courses", () => {
  test("creates a paid course, adds, reorders and edits lessons, then switches it off and deletes another", async ({ page }) => {
    const title = `E2E admin course ${Date.now()}`;
    await logInAs(page, await makeAdmin("courses"), PASSWORD);
    await expect(page).toHaveURL(/\/admin$/);
    await page.getByRole("navigation", { name: "Platform admin navigation" }).getByRole("link", { name: "Courses" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();
    await expect(page.getByTestId("courses-table")).toBeVisible();

    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Description").fill("Made by the end-to-end test.");
    await page.getByLabel("Pricing").selectOption("paid");
    await page.getByLabel(/^Price/).fill("1500");
    await page.getByLabel("Helps with test").selectOption("IQ");
    await page.getByRole("button", { name: "Create course" }).click();
    await expect(page).toHaveURL(/\/admin\/courses\/[a-z0-9]+$/);
    const courseId = page.url().split("/").pop()!;
    created.courseIds.push(courseId);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

    for (const lesson of ["Alpha lesson", "Beta lesson"]) {
      await page.getByRole("button", { name: "Add lesson" }).click();
      await page.getByLabel("Lesson title").fill(lesson);
      await page.getByLabel("Lesson text").fill(`${lesson} text`);
      await page.getByLabel("Minutes").fill("7");
      await page.getByRole("button", { name: "Save lesson" }).click();
      await expect(page.getByTestId("lesson-row").filter({ hasText: lesson })).toBeVisible();
    }
    const rows = page.getByTestId("lesson-row");
    await expect(rows.nth(0)).toContainText("1. Alpha lesson");
    await rows.nth(1).getByRole("button", { name: "Move Beta lesson up" }).click();
    await expect(rows.nth(0)).toContainText("1. Beta lesson");

    await rows.nth(0).getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Lesson title").fill("Beta lesson (renamed)");
    await page.getByRole("button", { name: "Save lesson" }).click();
    await expect(rows.nth(0)).toContainText("1. Beta lesson (renamed)");

    await rows.nth(1).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByTestId("lesson-row")).toHaveCount(1);

    // Switch it off: it disappears from the candidate catalogue.
    await page.getByLabel(/Active \(candidates can see/).uncheck();
    await page.getByRole("button", { name: "Save course" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    expect((await prisma.course.findUniqueOrThrow({ where: { id: courseId } })).isActive).toBe(false);

    // Deleting asks twice, in the page.
    await page.getByRole("button", { name: "Delete course" }).click();
    await expect(page.getByText("Delete this course and its lessons for good?")).toBeVisible();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await expect(page).toHaveURL(/\/admin\/courses$/);
    expect(await prisma.course.count({ where: { id: courseId } })).toBe(0);
  });

  test("other roles cannot open the course screens", async ({ page }) => {
    const c = await makeCandidate("notadmin");
    await signIn(page, c.email);
    await page.goto("/admin/courses");
    await expect(page).toHaveURL(/\/unauthorized$/);
  });
});

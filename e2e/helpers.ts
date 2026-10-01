import type { Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

export const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || "Demo@12345";

/**
 * A fresh client IP per spec file. Signups are rate limited per IP, so specs that
 * create accounts send their own x-forwarded-for instead of sharing "unknown".
 */
export function randomIp(): string {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  return `10.${octet()}.${octet()}.${octet()}`;
}

export async function logInAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

/**
 * Removes accounts (and optionally a company) created by a spec. Audit-log rows
 * reference their actor, so they have to go first or the user delete fails and the
 * test data leaks into the dev database.
 */
export async function deleteTestData(emails: string[], companyName?: string) {
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  // Notifications, badges and course records hold references to the user or profile.
  const profiles = await prisma.candidateProfile.findMany({ where: { userId: { in: ids } }, select: { id: true } });
  const profileIds = profiles.map((p) => p.id);
  const sessions = await prisma.testSession.findMany({ where: { candidateProfileId: { in: profileIds } }, select: { id: true } });
  const sessionIds = sessions.map((x) => x.id);
  await prisma.aIFeedback.deleteMany({ where: { candidateProfileId: { in: profileIds } } });
  await prisma.writingAssessment.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await prisma.response.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await prisma.score.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await prisma.testSession.deleteMany({ where: { id: { in: sessionIds } } });
  await prisma.badge.deleteMany({ where: { candidateProfileId: { in: profileIds } } });
  await prisma.courseRecommendation.deleteMany({ where: { candidateProfileId: { in: profileIds } } });
  await prisma.lessonProgress.deleteMany({ where: { enrollment: { candidateProfileId: { in: profileIds } } } });
  await prisma.payment.deleteMany({ where: { OR: [{ userId: { in: ids } }, { enrollment: { candidateProfileId: { in: profileIds } } }] } });
  await prisma.enrollment.deleteMany({ where: { candidateProfileId: { in: profileIds } } });
  await prisma.atsExport.deleteMany({ where: { candidateProfileId: { in: profileIds } } });
  await prisma.contactRequest.deleteMany({ where: { OR: [{ candidateProfileId: { in: profileIds } }, { recruiterId: { in: ids } }] } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, { targetType: "User", targetId: { in: ids } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  if (companyName) {
    // New companies start a free trial, so their subscription has to go before the company.
    await prisma.subscription.deleteMany({ where: { company: { name: companyName } } });
    await prisma.company.deleteMany({ where: { name: companyName } });
  }
}

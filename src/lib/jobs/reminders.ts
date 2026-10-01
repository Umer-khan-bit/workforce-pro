import type { PrismaClient } from "@prisma/client";
import { notifyUser } from "@/lib/notifications";
import { readSetting } from "@/lib/settings/store";
import { getOverview } from "@/lib/testEngine/session";
import { TEST_TITLES } from "@/lib/testEngine/labels";

type Db = PrismaClient;
const DAY = 86_400_000;

/**
 * The reminder job: candidates who have signed up, confirmed their email and still have tests they can take but
 * have not started are reminded, in the app and by email, after the number of days in Settings > Scheduled jobs and
 * again after the repeat period. Each candidate gets one message naming the next test. Candidates who deleted their
 * account, never confirmed their email, or were already reminded recently are skipped. Returns how many were reminded.
 */
export async function sendTestReminders(db: Db, args: { now?: Date; limit?: number; onlyUserIds?: string[] } = {}): Promise<{ checked: number; reminded: number }> {
  const now = args.now ?? new Date();
  const jobs = await readSetting(db, "scheduledJobs");
  const signedUpBefore = new Date(now.getTime() - jobs.reminderAfterDays * DAY);
  const remindedSince = new Date(now.getTime() - jobs.reminderRepeatDays * DAY);

  const candidates = await db.candidateProfile.findMany({
    where: {
      anonymisedAt: null,
      consentGiven: true,
      ...(args.onlyUserIds ? { userId: { in: args.onlyUserIds } } : {}),
      createdAt: { lte: signedUpBefore },
      user: { isActive: true, emailVerified: { not: null }, notifications: { none: { type: "TEST_REMINDER", channel: "IN_APP", createdAt: { gt: remindedSince } } } },
    },
    select: { userId: true, user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
    take: args.limit ?? 200,
  });

  let reminded = 0;
  for (const c of candidates) {
    try {
      const overview = await getOverview({ prisma: db }, c.userId);
      const next = overview?.cards.find((card) => card.status === "NOT_STARTED");
      if (!next) continue;
      const values = { candidateName: c.user.name ?? "there", testName: `${TEST_TITLES[next.testType]} test` };
      const inApp = await notifyUser(db, { userId: c.userId, templateKey: "TEST_REMINDER_IN_APP", type: "TEST_REMINDER", values, link: "/candidate/tests" });
      await notifyUser(db, { userId: c.userId, templateKey: "TEST_REMINDER_EMAIL", type: "TEST_REMINDER", values, link: "/candidate/tests" });
      if (inApp) reminded++;
    } catch (err) {
      console.error(`[reminders] skipped one candidate: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }
  return { checked: candidates.length, reminded };
}

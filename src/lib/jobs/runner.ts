import type { JobRun, Prisma, PrismaClient } from "@prisma/client";
import { readSetting } from "@/lib/settings/store";
import { retryDueDeliveries } from "@/lib/ats/webhooks";
import { generateFairnessReport, previousMonth } from "@/lib/learning/fairness";
import { recalibrate } from "@/lib/learning/recalibrate";
import { warnExpiringPlans } from "@/lib/subscriptions";
import { sendTestReminders } from "./reminders";

type Db = PrismaClient;

export const JOB_NAMES = ["recalibration", "fairness-report", "test-reminders", "plan-expiry", "webhook-retries"] as const;
export type JobName = (typeof JOB_NAMES)[number];

export const JOB_INFO: Record<JobName, { label: string; description: string }> = {
  recalibration: { label: "Recalibration", description: "Re-estimates question difficulty from candidates' answers and flags questions that are too easy, too hard, do not discriminate, or may be biased." },
  "fairness-report": { label: "Fairness report", description: "Makes the monthly report on how candidates of each group do on the tests." },
  "test-reminders": { label: "Test reminders", description: "Reminds candidates, in the app and by email, about tests they have not taken." },
  "plan-expiry": { label: "Plan expiry warnings", description: "Warns company admins, in the app and by email, before their plan ends." },
  "webhook-retries": { label: "Webhook retries", description: "Tries failed webhook deliveries again." },
};

export const isJobName = (s: string): s is JobName => (JOB_NAMES as readonly string[]).includes(s);

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
/** A run that has been "running" longer than this is assumed dead (the server stopped) and no longer blocks a new one. */
const STALE_AFTER = 30 * MINUTE;

export type Settings = { recalibrationEveryDays: number; fairnessReportDay: number };

/**
 * Whether a job is due. Recalibration waits its number of days; the reminder and plan jobs run once a day; webhook
 * retries run every time the scheduler ticks (they only act on deliveries whose retry time has come); the fairness
 * report is due from its day of the month until the previous month's report exists.
 */
export function isDue(job: JobName, lastCompletedAt: Date | null, now: Date, settings: Settings, fairnessReportExists: boolean): boolean {
  const since = lastCompletedAt ? now.getTime() - lastCompletedAt.getTime() : Infinity;
  switch (job) {
    case "recalibration":
      return since >= settings.recalibrationEveryDays * DAY;
    case "test-reminders":
    case "plan-expiry":
      return since >= 23 * HOUR;
    case "webhook-retries":
      return since >= MINUTE;
    case "fairness-report":
      return now.getUTCDate() >= settings.fairnessReportDay && !fairnessReportExists;
  }
}

/** Does the work of one job. Returns what to show in the log. */
async function execute(db: Db, job: JobName, trigger: string, now: Date, actorId: string | null): Promise<Prisma.InputJsonValue> {
  switch (job) {
    case "recalibration": {
      const r = await recalibrate(db, { triggeredBy: actorId ? `admin:${actorId}` : trigger, now });
      return { checked: r.checked, updated: r.updated, newlyFlagged: r.newlyFlagged, flaggedTotal: r.flaggedTotal, pretestReady: r.pretestReady };
    }
    case "fairness-report": {
      const month = previousMonth(now);
      const report = await generateFairnessReport(db, { month, actorId, now });
      return { month, reportId: report.id };
    }
    case "test-reminders":
      return { ...(await sendTestReminders(db, { now })) };
    case "plan-expiry":
      return { ...(await warnExpiringPlans(db, now)) };
    case "webhook-retries":
      return { ...(await retryDueDeliveries(db, now)) };
  }
}

/**
 * Runs one job now and records it (JobRun). Used by the scheduler ("schedule"), the admin's Run now button
 * ("manual") and the secured cron endpoint ("cron"). If the same job is already running, nothing starts.
 */
export async function runJob(db: Db, job: JobName, trigger: "schedule" | "manual" | "cron", options: { now?: Date; actorId?: string | null } = {}): Promise<JobRun> {
  const now = options.now ?? new Date();
  const running = await db.jobRun.findFirst({ where: { job, status: "RUNNING", startedAt: { gt: new Date(now.getTime() - STALE_AFTER) } } });
  if (running) return db.jobRun.create({ data: { job, trigger, status: "SKIPPED", startedAt: now, completedAt: now, summary: { reason: "Already running" } } });

  const run = await db.jobRun.create({ data: { job, trigger, startedAt: now } });
  try {
    const summary = await execute(db, job, trigger, now, options.actorId ?? null);
    return await db.jobRun.update({ where: { id: run.id }, data: { status: "COMPLETED", completedAt: new Date(), summary } });
  } catch (err) {
    console.error(`[job ${job}] failed: ${err instanceof Error ? err.message : "unknown error"}`);
    return db.jobRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), error: err instanceof Error ? err.message.slice(0, 500) : "unknown error" } });
  }
}

/** One scheduler tick: runs every job that is due. Does nothing when Settings > Scheduled jobs > Run jobs automatically is No. */
export async function runDueJobs(db: Db, now = new Date()): Promise<JobRun[]> {
  const settings = await readSetting(db, "scheduledJobs");
  if (settings.enabled !== "yes") return [];
  const out: JobRun[] = [];
  const reportExists = (await db.fairnessReport.count({ where: { month: previousMonth(now) } })) > 0;
  for (const job of JOB_NAMES) {
    const last = await db.jobRun.findFirst({ where: { job, status: "COMPLETED" }, orderBy: { completedAt: "desc" }, select: { completedAt: true } });
    if (isDue(job, last?.completedAt ?? null, now, settings, reportExists)) out.push(await runJob(db, job, "schedule", { now }));
  }
  return out;
}

import { prisma } from "@/lib/prisma";
import { runDueJobs } from "./runner";

const GLOBAL_KEY = "__workforceJobTicker";

/**
 * Starts the in-process scheduler: every few minutes it runs whichever scheduled jobs are due. It starts once per
 * server (guarded against hot reloads) and only when JOBS_AUTORUN is "true" in the environment, so tests and other
 * tools that start the app do not trigger reminders or recalibration by accident. Jobs can also be run by hand, or by
 * an outside scheduler through the secured /api/jobs/run endpoint.
 */
export function startJobTicker(env: Record<string, string | undefined> = process.env): boolean {
  const g = globalThis as unknown as Record<string, unknown>;
  if (env.JOBS_AUTORUN !== "true" || g[GLOBAL_KEY]) return false;
  const seconds = Math.max(30, Number(env.JOBS_TICK_SECONDS) || 300);
  const tick = async () => {
    try {
      const ran = await runDueJobs(prisma);
      if (ran.length) console.log(`[jobs] ran: ${ran.map((r) => `${r.job} (${r.status.toLowerCase()})`).join(", ")}`);
    } catch (err) {
      console.error(`[jobs] tick failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  };
  const timer = setInterval(tick, seconds * 1000);
  timer.unref?.();
  setTimeout(tick, 20_000).unref?.(); // a first look shortly after start-up, so a restart catches up on what is due
  g[GLOBAL_KEY] = timer;
  return true;
}

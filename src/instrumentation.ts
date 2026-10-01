/**
 * Runs once when the server starts. It starts the scheduled-jobs ticker (recalibration, reminders, plan warnings,
 * webhook retries, fairness report) on the Node.js server, when JOBS_AUTORUN is "true" in the environment.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startJobTicker } = await import("@/lib/jobs/ticker");
  if (startJobTicker()) console.log("[jobs] scheduler started");
}

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import RunJobButton from "@/components/admin/RunJobButton";
import { JOB_INFO, JOB_NAMES } from "@/lib/jobs/runner";

const when = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function describeSummary(summary: unknown): string {
  if (!summary || typeof summary !== "object") return "";
  return Object.entries(summary as Record<string, unknown>).filter(([, v]) => typeof v === "number" || typeof v === "string").map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").toLowerCase()}: ${v}`).join(", ");
}

/** The jobs that run by themselves, when they last ran, and a button to run each one now. */
export default async function JobsPage() {
  const [settings, runs] = await Promise.all([getSetting("scheduledJobs"), prisma.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 40 })]);
  const autorun = process.env.JOBS_AUTORUN === "true";
  const last = (job: string) => runs.find((r) => r.job === job);

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold text-zinc-900">Scheduled jobs</h1>
      <p className="mt-1 text-zinc-600">Work the platform does by itself: recalibration, reminders, plan warnings, webhook retries and the monthly fairness report. You can run any of them by hand.</p>
      <p className="mt-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700" data-testid="scheduler-state">
        {settings.enabled !== "yes"
          ? <>Automatic running is <strong>switched off</strong> in <Link href="/admin/settings?group=scheduledJobs" className="text-brand-700 underline">Settings</Link>. Jobs only run when you press Run now.</>
          : autorun
            ? <>The scheduler is <strong>on</strong>: due jobs run on their own every few minutes. Change the timings in <Link href="/admin/settings?group=scheduledJobs" className="text-brand-700 underline">Settings</Link>.</>
            : <>The scheduler is <strong>not running on this server</strong> (JOBS_AUTORUN is not set to true in the .env file). Set it and restart the app, or call the secured <code>/api/jobs/run</code> address from an outside scheduler. Jobs still run when you press Run now.</>}
      </p>

      <div className="mt-5 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[44rem] text-left text-sm" data-testid="jobs-table">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500"><tr><th className="px-3 py-3">Job</th><th className="px-3 py-3">Last run</th><th className="px-3 py-3">Result</th><th className="px-3 py-3">Run</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {JOB_NAMES.map((job) => {
              const r = last(job);
              return (
                <tr key={job} data-testid="job-row" data-job={job}>
                  <td className="px-3 py-3"><p className="font-medium text-zinc-900">{JOB_INFO[job].label}</p><p className="max-w-md text-xs text-zinc-500">{JOB_INFO[job].description}</p></td>
                  <td className="px-3 py-3 whitespace-nowrap">{r ? <>{when(r.startedAt)}<p className="text-xs text-zinc-500">{r.trigger}</p></> : <span className="text-zinc-400">Never</span>}</td>
                  <td className="px-3 py-3">{r ? <><span className={`badge ${r.status === "COMPLETED" ? "bg-green-50 text-green-800" : r.status === "FAILED" ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-700"}`}>{r.status.toLowerCase()}</span><p className="mt-1 max-w-xs text-xs text-zinc-600">{r.error ?? describeSummary(r.summary)}</p></> : "-"}</td>
                  <td className="px-3 py-3"><RunJobButton job={job} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-zinc-900">Recent runs</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[34rem] text-left text-sm" data-testid="runs-table">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500"><tr><th className="px-3 py-3">Started</th><th className="px-3 py-3">Job</th><th className="px-3 py-3">By</th><th className="px-3 py-3">Status</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {runs.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-zinc-600">No runs yet.</td></tr>}
            {runs.map((r) => <tr key={r.id}><td className="px-3 py-3 whitespace-nowrap">{when(r.startedAt)}</td><td className="px-3 py-3">{JOB_INFO[r.job as keyof typeof JOB_INFO]?.label ?? r.job}</td><td className="px-3 py-3">{r.trigger}</td><td className="px-3 py-3">{r.status.toLowerCase()}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import RunJobButton from "@/components/admin/RunJobButton";

const when = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Recalibration: how the question statistics are refreshed, a manual button, and the history of runs. */
export default async function RecalibrationPage() {
  const [rules, runs, eligible, pretestReady, flagged] = await Promise.all([
    getSetting("selfLearning"),
    prisma.recalibrationRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
    prisma.itemStatistic.count({ where: { responseCount: { gte: (await getSetting("selfLearning")).minResponsesForRecalibration } } }),
    prisma.question.count({ where: { isPretest: true, status: "APPROVED", itemStatistic: { is: { lastCalibratedAt: { not: null } } } } }),
    prisma.itemStatistic.count({ where: { flagged: true } }),
  ]);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-zinc-900">Recalibration</h1>
      <p className="mt-1 text-zinc-600">The tests learn from candidates&apos; answers. Once a question has at least {rules.minResponsesForRecalibration} answers its difficulty is re-estimated, and it is checked for being too easy, too hard, not separating strong from weak candidates, or showing possible bias. Nothing is deleted or retired automatically: questions that need a look wait for you in Item analysis.</p>

      <div className="card mt-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-zinc-900">Recalibrate now</p>
          <p className="text-sm text-zinc-600" data-testid="recal-counts">{eligible} question{eligible === 1 ? " has" : "s have"} enough answers · {flagged} flagged for review · {pretestReady} pretest question{pretestReady === 1 ? "" : "s"} ready to go live</p>
        </div>
        <RunJobButton job="recalibration" label="Recalibrate now" />
      </div>
      <p className="mt-3 text-sm text-zinc-600">It also runs by itself on the schedule in <Link href="/admin/settings?group=scheduledJobs" className="text-brand-700 underline">Settings</Link> (see <Link href="/admin/jobs" className="text-brand-700 underline">Scheduled jobs</Link>). The limits that decide a flag are under <Link href="/admin/settings?group=selfLearning" className="text-brand-700 underline">Settings &gt; Self-learning</Link>. Review flagged questions in <Link href="/admin/item-analysis" className="text-brand-700 underline">Item analysis</Link>.</p>

      <h2 className="mt-8 text-lg font-semibold text-zinc-900">History</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[36rem] text-left text-sm" data-testid="recal-runs">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500"><tr><th className="px-3 py-3">Started</th><th className="px-3 py-3">By</th><th className="px-3 py-3">Checked</th><th className="px-3 py-3">Updated</th><th className="px-3 py-3">Newly flagged</th><th className="px-3 py-3">Status</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {runs.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-zinc-600">It has not run yet.</td></tr>}
            {runs.map((r) => (
              <tr key={r.id} data-testid="recal-row">
                <td className="px-3 py-3 whitespace-nowrap">{when(r.startedAt)}</td>
                <td className="px-3 py-3">{r.triggeredBy.startsWith("admin:") ? "Admin" : r.triggeredBy}</td>
                <td className="px-3 py-3">{r.itemsChecked}</td><td className="px-3 py-3">{r.itemsUpdated}</td><td className="px-3 py-3">{r.itemsFlagged}</td>
                <td className="px-3 py-3">{r.status === "COMPLETED" ? <span className="badge bg-green-50 text-green-800">Completed</span> : r.status === "FAILED" ? <span className="badge bg-red-50 text-red-700" title={r.error ?? ""}>Failed</span> : <span className="badge bg-zinc-100 text-zinc-700">{r.status.toLowerCase()}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

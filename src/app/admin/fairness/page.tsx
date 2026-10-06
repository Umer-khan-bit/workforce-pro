import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { isMonth, monthOf, previousMonth, type FairnessData } from "@/lib/learning/fairness";
import GenerateReport from "./GenerateReport";

const when = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The monthly fairness report: how candidates of each group do on the tests, and which questions may be biased. */
export default async function FairnessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).month;
  const asked = Array.isArray(raw) ? raw[0] : raw;
  const now = new Date();
  const reports = await prisma.fairnessReport.findMany({ orderBy: { month: "desc" }, take: 24, select: { month: true, generatedAt: true } });
  const options = [...new Set([previousMonth(now), monthOf(now), ...reports.map((r) => r.month)])].sort().reverse();
  const month = asked && isMonth(asked) ? asked : (reports[0]?.month ?? previousMonth(now));
  const row = await prisma.fairnessReport.findUnique({ where: { month } });
  const data = row?.data as unknown as FairnessData | undefined;

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold text-zinc-900">Fairness report</h1>
      <p className="mt-1 text-zinc-600">Every month: how candidates of each gender, region and test language do on the IQ, EQ, Language and Job skill tests, and which questions may favour one group. It helps you spot unfair tests early. It is never used to judge individual candidates.</p>

      <div className="card mt-5"><GenerateReport months={options} selected={month} /></div>
      {reports.length > 0 && (
        <nav aria-label="Reports made" className="mt-4 flex flex-wrap gap-2 text-sm">
          {reports.map((r) => <Link key={r.month} href={`/admin/fairness?month=${r.month}`} aria-current={r.month === month ? "page" : undefined} className={`rounded-full border px-3 py-1 ${r.month === month ? "border-brand-700 bg-brand-700 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`}>{r.month}</Link>)}
        </nav>
      )}

      {!row || !data ? (
        <p className="card mt-6 text-sm text-zinc-700" data-testid="no-report">There is no report for {month} yet. Press the button above to make it. Reports are also made by themselves on the day set under Settings &gt; Scheduled jobs.</p>
      ) : (
        <div className="mt-6" data-testid="fairness-report">
          <p className="text-sm text-zinc-600">Report for <strong>{data.month}</strong>, made {when(row.generatedAt)}. {data.candidates} test result{data.candidates === 1 ? "" : "s"} in the month.</p>
          <p className="mt-1 text-sm text-zinc-600" data-testid="impact-threshold">{typeof data.impactThreshold === "number" ? <>Groups were flagged below an impact ratio of <strong>{data.impactThreshold}</strong>. </> : <>The flag limit used was not recorded for this older report. </>}You can change the limit in <Link href="/admin/settings?group=selfLearning" className="text-brand-700 underline">Settings &gt; Self-learning</Link>.</p>

          {data.tests.map((t) => (
            <section key={t.test} className="mt-6" aria-labelledby={`t-${t.test}`} data-testid={`fairness-${t.test}`}>
              <h2 id={`t-${t.test}`} className="text-lg font-semibold text-zinc-900">{t.title} <span className="text-sm font-normal text-zinc-500">({t.total} result{t.total === 1 ? "" : "s"})</span></h2>
              {t.total === 0 ? <p className="mt-2 text-sm text-zinc-600">No results this month.</p> : (
                <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {t.dimensions.map((d) => (
                    <div key={d.dimension} className="card min-w-0">
                      <h3 className="font-semibold text-zinc-900">{d.title}</h3>
                      {d.groups.length === 0 ? <p className="mt-2 text-sm text-zinc-500">No data.</p> : (
                        <div className="mt-2 overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="text-zinc-500"><tr><th className="py-1 pr-2">Group</th><th className="py-1 pr-2">People</th><th className="py-1 pr-2">Mean percentile</th><th className="py-1 pr-2">Top half</th><th className="py-1">Impact</th></tr></thead>
                            <tbody className="divide-y divide-zinc-100">
                              {d.groups.map((g) => (
                                <tr key={g.label} className={g.flagged ? "bg-amber-50" : ""} data-flagged={g.flagged}>
                                  <td className="py-1 pr-2 font-medium text-zinc-900">{g.label}</td>
                                  {g.suppressed ? <td colSpan={4} className="py-1 text-zinc-500">Too few to report</td> : <><td className="py-1 pr-2 tabular-nums">{g.n}</td><td className="py-1 pr-2 tabular-nums">{g.meanPercentile}</td><td className="py-1 pr-2 tabular-nums">{g.topHalfShare}%</td><td className={`py-1 tabular-nums ${g.flagged ? "font-semibold text-amber-800" : ""}`}>{g.impactRatio ?? "-"}{g.flagged ? " (below 0.8)" : ""}</td></>}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}

          <section className="card mt-6" aria-labelledby="items-h">
            <h2 id="items-h" className="font-semibold text-zinc-900">Questions that may be biased</h2>
            <p className="mt-1 text-sm text-zinc-600">{data.items.flaggedTotal} question{data.items.flaggedTotal === 1 ? " is" : "s are"} flagged for review in total. <Link href="/admin/item-analysis" className="text-brand-700 underline">Open Item analysis</Link>.</p>
            {data.items.flaggedForBias.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {data.items.flaggedForBias.map((i) => <li key={i.id} className="rounded-lg bg-zinc-50 p-2"><span className="text-zinc-900">{i.text}</span><p className="text-xs text-zinc-600">{i.reason}</p></li>)}
              </ul>
            )}
          </section>

          <ul className="mt-6 list-disc space-y-1 pl-5 text-xs text-zinc-600">{data.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

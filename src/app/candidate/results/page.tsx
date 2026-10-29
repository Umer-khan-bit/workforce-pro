import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { latestResults } from "@/lib/results/latest";
import { resultLines } from "@/lib/results/describe";
import { findFeedback } from "@/lib/results/feedback";
import { TEST_SLUGS, TEST_TITLES } from "@/lib/testEngine/labels";
import FeedbackPanel from "./FeedbackPanel";

const QUARTILE_STYLE: Record<number, string> = {
  1: "bg-green-100 text-green-900",
  2: "bg-teal-50 text-teal-900",
  3: "bg-amber-50 text-amber-900",
  4: "bg-red-50 text-red-800",
};

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function MyResultsPage() {
  const session = await auth();
  const profile = await prisma.candidateProfile.findFirst({ where: { userId: session!.user.id, anonymisedAt: null }, select: { id: true } });
  if (!profile) redirect("/login");

  const [results, quartiles, badge, newest, testing] = await Promise.all([
    latestResults(prisma, profile.id),
    getSetting("quartiles"),
    prisma.badge.findFirst({ where: { candidateProfileId: profile.id, type: "TOP_PERFORMER_ALL_TESTS" } }),
    prisma.score.findMany({ where: { candidateProfileId: profile.id }, orderBy: { computedAt: "desc" }, distinct: ["testType"], select: { testType: true, voidedAt: true } }),
    getSetting("testing"),
  ]);
  // A test whose newest result an admin cancelled after an integrity review.
  const cancelled = newest.filter((s) => s.voidedAt);
  const feedback = await Promise.all(results.map((r) => (r.provisional ? null : findFeedback(prisma, r.scoreId))));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">My results</h1>
          <p className="mt-1 text-zinc-600">Your latest result for each test, what it means, and how to improve it.</p>
        </div>
        {results.length > 0 && (
          <a href="/api/results/report" className="btn-primary" data-testid="download-report">Download PDF report</a>
        )}
      </div>

      {cancelled.map((c) => (
        <p key={c.testType} role="status" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid={`cancelled-${c.testType}`}>
          <strong>{TEST_TITLES[c.testType]}.</strong> {testing.integrityVoidedNotice} <Link href={`/candidate/tests/${TEST_SLUGS[c.testType]}`} className="underline">Go to the test</Link>
        </p>
      ))}

      {badge && (
        <p className="mt-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900" data-testid="top-performer-note">
          <strong>Top Performer.</strong> You are in the top quartile in every required test. <Link href="/candidate/badges" className="underline">See your badge</Link>
        </p>
      )}

      {results.length === 0 ? (
        <section className="card mt-6">
          <p className="font-medium text-zinc-900">You have no results yet.</p>
          <p className="mt-1 text-sm text-zinc-700">Take your first test and your result, feedback and tips will appear here.</p>
          <p className="mt-4"><Link href="/candidate/tests" className="btn-primary">Go to My tests</Link></p>
        </section>
      ) : (
        <ul className="mt-6 flex flex-col gap-5">
          {results.map((r, i) => (
            <li key={r.scoreId}>
              <section className="card" aria-labelledby={`r-${r.testType}`} data-testid={`result-${r.testType}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 id={`r-${r.testType}`} className="text-lg font-semibold text-zinc-900">{TEST_TITLES[r.testType]}</h2>
                    <p className="text-xs text-zinc-500">Completed {fmt(r.computedAt)}</p>
                  </div>
                  {r.quartile !== null && !r.provisional && (
                    <span className={`rounded-lg px-4 py-2 text-2xl font-semibold ${QUARTILE_STYLE[r.quartile]}`} data-testid={`quartile-${r.testType}`}>Q{r.quartile}</span>
                  )}
                  {r.cefrLevel && r.testType === "LANGUAGE" && !r.provisional && (
                    <span className="rounded-lg bg-zinc-100 px-4 py-2 text-lg font-semibold text-zinc-800" data-testid="cefr">{r.cefrLevel}</span>
                  )}
                </div>

                <div className="mt-2 space-y-1 text-sm text-zinc-700">
                  {resultLines(r, quartiles.minCohortSize).map((line, j) => <p key={j}>{line}</p>)}
                </div>

                {r.traits && (
                  <ul className="mt-4 flex flex-col gap-3" data-testid="traits">
                    {r.traits.map((t) => (
                      <li key={t.trait}>
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="font-medium text-zinc-900">
                            {t.trait}
                            {t.trait === "Emotional Stability" && <span className="font-normal text-zinc-500"> (higher means calmer)</span>}
                          </span>
                          <span className="tabular-nums text-zinc-700">{t.score.toFixed(1)} / 5</span>
                        </div>
                        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-zinc-100" role="img" aria-label={`${t.trait}: ${t.score.toFixed(1)} out of 5`}>
                          <div className="h-full rounded-full bg-brand-600" style={{ width: `${((t.score - 1) / 4) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {!r.provisional && (
                  <FeedbackPanel
                    scoreId={r.scoreId}
                    initial={feedback[i] ? { text: feedback[i]!.text, tips: feedback[i]!.tips } : null}
                  />
                )}

                <p className="mt-4 flex flex-wrap gap-3 text-sm">
                  <Link href={`/candidate/tests/result/${r.sessionId}`} className="text-brand-700 underline">Test summary</Link>
                  <Link href={`/candidate/tests/${TEST_SLUGS[r.testType]}`} className="text-brand-700 underline">Test details and retake</Link>
                </p>
              </section>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

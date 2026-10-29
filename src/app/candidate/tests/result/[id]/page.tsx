import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { getResult, TestError } from "@/lib/testEngine/session";
import { TEST_SLUGS, TEST_TITLES } from "@/lib/testEngine/labels";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const ordinal = (n: number) => {
  const r = Math.round(n);
  const s = ["th", "st", "nd", "rd"];
  const v = r % 100;
  return `${r}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  let result;
  try {
    result = await getResult({ prisma }, session!.user.id, id);
  } catch (err) {
    if (err instanceof TestError) {
      if (err.code === "NOT_FINISHED") redirect(`/candidate/tests/session/${id}`);
      if (err.status === 404) notFound();
    }
    throw err;
  }

  const voided = await prisma.score.findFirst({ where: { sessionId: id, voidedAt: { not: null } }, select: { id: true } });
  const testing = voided ? await getSetting("testing") : null;
  const title = TEST_TITLES[result.testType];
  const isPersonality = result.testType === "PERSONALITY";

  return (
    <div className="max-w-2xl">
      <Link href="/candidate/tests" className="text-sm text-brand-700 underline">&larr; My tests</Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900">{title} test: your summary</h1>

      {voided && testing && (
        <section className="card mt-6" role="status" data-testid="result-cancelled">
          <p className="font-medium text-zinc-900">{testing.integrityVoidedNotice}</p>
          <p className="mt-4"><Link href={`/candidate/tests/${TEST_SLUGS[result.testType]}`} className="btn-primary">Take the test again</Link></p>
        </section>
      )}

      {!voided && !result.scored && (
        <section className="card mt-6" role="status">
          <p className="font-medium text-zinc-900">This test was not scored.</p>
          <p className="mt-1 text-sm text-zinc-700">
            The time ran out before you had answered enough questions to give a reliable result. You can take it again now.
          </p>
          <p className="mt-4"><Link href={`/candidate/tests/${TEST_SLUGS[result.testType]}`} className="btn-primary">Take the test again</Link></p>
        </section>
      )}

      {!voided && result.scored && (
        <>
          <section className="card mt-6" aria-labelledby="summary-h" data-testid="summary">
            <h2 id="summary-h" className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Result</h2>

            {isPersonality && result.traits && (
              <>
                <p className="mt-2 text-sm text-zinc-700">
                  Your scores on five personality traits, from 1 to 5. These describe your style; they are not a pass or a fail and they are not ranked.
                </p>
                <ul className="mt-4 flex flex-col gap-4">
                  {result.traits.map((t) => (
                    <li key={t.trait} data-testid={`trait-${t.trait}`}>
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
              </>
            )}

            {!isPersonality && result.quartile !== null && result.percentile !== null && (
              <div className="mt-3">
                <p className="text-4xl font-semibold text-zinc-900" data-testid="quartile">Q{result.quartile}</p>
                <p className="mt-1 text-zinc-700">
                  {ordinal(result.percentile)} percentile{result.quartile === 1 ? " · top group" : ""}
                </p>
                {result.cohort && (
                  <p className="mt-2 text-sm text-zinc-600" data-testid="cohort">
                    Based on {result.cohort.size} candidate{result.cohort.size === 1 ? "" : "s"}{" "}
                    {result.cohort.scope === "ROLE" ? "in your job role" : "across all job roles"}.
                    {result.cohort.small && ` This is a small group (under ${result.minCohortSize}), so your ranking may change as more candidates take the test.`}
                  </p>
                )}
              </div>
            )}

            {result.provisional && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
                Your written answer has not been graded yet, so your ranking is not ready. Open this page again in a few minutes.
              </p>
            )}

            {result.testType === "LANGUAGE" && result.cefrLevel && (
              <p className="mt-4 text-sm text-zinc-700">
                Level shown by your writing: <span className="text-lg font-semibold text-zinc-900" data-testid="cefr">{result.cefrLevel}</span>
              </p>
            )}
            {result.feedback && <p className="mt-3 text-sm text-zinc-700"><span className="font-medium">Feedback on your writing:</span> {result.feedback}</p>}

            {result.answered !== null && <p className="mt-4 text-xs text-zinc-500">{result.answered} questions counted.</p>}
          </section>

          <p className="mt-4 text-sm text-zinc-600">
            {result.retakeAt ? `You can take this test again on ${fmt(result.retakeAt)}.` : "You can take this test again now."}{" "}
            A full results page with tips will be added later.
          </p>
        </>
      )}
    </div>
  );
}

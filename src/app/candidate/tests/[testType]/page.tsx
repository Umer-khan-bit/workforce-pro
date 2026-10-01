import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { getOverview } from "@/lib/testEngine/session";
import { isAdaptive } from "@/lib/testEngine/context";
import { TEST_BLURBS, TEST_TITLES, testFromSlug } from "@/lib/testEngine/labels";
import StartButton from "./StartButton";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function TestIntroPage({ params }: { params: Promise<{ testType: string }> }) {
  const testType = testFromSlug((await params).testType);
  if (!testType) notFound();

  const session = await auth();
  const [overview, config, testing] = await Promise.all([
    getOverview({ prisma }, session!.user.id),
    prisma.testConfig.findUnique({ where: { testType } }),
    getSetting("testing"),
  ]);
  if (!overview || !config) redirect("/candidate/tests");
  const card = overview.cards.find((c) => c.testType === testType)!;
  if (card.status === "IN_PROGRESS") redirect(`/candidate/tests/session/${card.sessionId}`);

  const startable = card.status === "NOT_STARTED" || (card.status === "COMPLETED" && card.canRetake);

  return (
    <div className="max-w-2xl">
      <Link href="/candidate/tests" className="text-sm text-brand-700 underline">&larr; My tests</Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900">{TEST_TITLES[testType]} test</h1>
      <p className="mt-1 text-zinc-600">{TEST_BLURBS[testType]}</p>

      <section className="card mt-6" aria-labelledby="before-h">
        <h2 id="before-h" className="font-semibold text-zinc-900">Before you start</h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-zinc-500">Questions</dt>
            <dd className="text-lg font-semibold">{isAdaptive(testType) ? `${config.minItems} to ${config.maxItems}` : config.maxItems}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Time</dt>
            <dd className="text-lg font-semibold">{config.timeLimitMinutes} minutes</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-zinc-700">{testing.instructionsGeneral}</p>
        {isAdaptive(testType) && <p className="mt-2 text-sm text-zinc-700">The questions adapt to your answers, so the number you see can differ from other candidates.</p>}
        {testType === "LANGUAGE" && <p className="mt-2 text-sm text-zinc-700">{testing.writingNotice}</p>}
        {testType === "PERSONALITY" && <p className="mt-2 text-sm text-zinc-700">Answer quickly and honestly: rate how well each statement describes you.</p>}
        <p className="mt-2 text-sm text-zinc-700">
          If you take this test again, you must wait {config.retakeWaitingDays} days after finishing it.
        </p>
      </section>

      <div className="mt-6">
        {startable && overview.verified && <StartButton testType={testType} label={card.status === "COMPLETED" ? "Start the test again" : "Start the test"} />}
        {!overview.verified && <p className="text-sm text-amber-800">Confirm your email address to start tests.</p>}
        {card.status === "UNAVAILABLE" && <p role="status" className="text-sm text-zinc-700">{card.reason}</p>}
        {card.status === "COMPLETED" && !card.canRetake && (
          <p className="text-sm text-zinc-700">
            {card.retakeAt ? `You can take this test again on ${fmt(card.retakeAt)}.` : "This test is not available to retake right now."}{" "}
            <Link href={`/candidate/tests/result/${card.sessionId}`} className="text-brand-700 underline">View your summary</Link>
          </p>
        )}
      </div>
    </div>
  );
}

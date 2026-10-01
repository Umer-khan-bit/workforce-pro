import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOverview, type TestCard } from "@/lib/testEngine/session";
import { TEST_BLURBS, TEST_SLUGS, TEST_TITLES } from "@/lib/testEngine/labels";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function Card({ card, verified }: { card: TestCard; verified: boolean }) {
  const href = `/candidate/tests/${TEST_SLUGS[card.testType]}`;
  const button = "btn-primary";
  const disabled = "btn cursor-not-allowed bg-zinc-200 text-zinc-500";

  return (
    <li>
      <section className="card flex h-full flex-col" aria-labelledby={`t-${card.testType}`}>
        <div className="flex items-start justify-between gap-3">
          <h2 id={`t-${card.testType}`} className="text-lg font-semibold text-zinc-900">{TEST_TITLES[card.testType]}</h2>
          {card.status === "NOT_STARTED" && <span className="badge bg-zinc-100 text-zinc-700">Not started</span>}
          {card.status === "IN_PROGRESS" && <span className="badge bg-amber-50 text-amber-800">In progress</span>}
          {card.status === "COMPLETED" && <span className="badge bg-green-50 text-green-800">Completed</span>}
          {card.status === "UNAVAILABLE" && <span className="badge bg-zinc-100 text-zinc-500">Not available yet</span>}
        </div>
        <p className="mt-1 text-sm text-zinc-600">{TEST_BLURBS[card.testType]}</p>

        <div className="mt-3 text-sm text-zinc-700">
          {card.status === "NOT_STARTED" && <p>{card.questions} questions · {card.minutes} minutes</p>}
          {card.status === "IN_PROGRESS" && <p>{card.minutes} minutes in total. The clock is running; continue before it ends.</p>}
          {card.status === "COMPLETED" && (
            <>
              <p>Completed on {fmt(card.completedAt)}.</p>
              {card.provisional && <p className="mt-1 text-amber-800">Your writing is still being graded.</p>}
              <p className="mt-1">{card.retakeAt ? `You can take it again on ${fmt(card.retakeAt)}.` : card.canRetake ? "You can take it again now." : "Retaking is not available right now."}</p>
            </>
          )}
          {card.status === "UNAVAILABLE" && <p>{card.reason}</p>}
        </div>

        <div className="mt-auto flex flex-wrap gap-3 pt-4">
          {card.status === "NOT_STARTED" &&
            (verified ? <Link href={href} className={button}>Start</Link> : <span className={disabled} aria-disabled="true">Confirm your email to start</span>)}
          {card.status === "IN_PROGRESS" &&
            (verified ? <Link href={`/candidate/tests/session/${card.sessionId}`} className={button}>Resume</Link> : <span className={disabled} aria-disabled="true">Confirm your email to continue</span>)}
          {card.status === "COMPLETED" && (
            <>
              <Link href={`/candidate/tests/result/${card.sessionId}`} className="btn-secondary">View summary</Link>
              {card.canRetake && verified && <Link href={href} className={button}>Take again</Link>}
            </>
          )}
        </div>
      </section>
    </li>
  );
}

export default async function MyTestsPage() {
  const session = await auth();
  const overview = await getOverview({ prisma }, session!.user.id);
  if (!overview) redirect("/login");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">My tests</h1>
      <p className="mt-1 text-zinc-600">
        Each test takes 10 to 15 minutes or so. Recruiters rank candidates by these results, so take them when you can give them your full attention.
        {overview.language && <> Your tests are in {overview.language}.</>}
      </p>
      {!overview.verified && (
        <p role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Confirm your email address to start tests. Use the link we emailed you, or ask for a new one from the banner above.
        </p>
      )}
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {overview.cards.map((card) => (
          <Card key={card.testType} card={card} verified={overview.verified} />
        ))}
      </ul>
    </div>
  );
}

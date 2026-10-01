import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { currentQuartiles, topPerformerProgress } from "@/lib/results/topPerformer";
import { TEST_SLUGS } from "@/lib/testEngine/labels";

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default async function BadgesPage() {
  const session = await auth();
  const profile = await prisma.candidateProfile.findFirst({ where: { userId: session!.user.id, anonymisedAt: null }, select: { id: true } });
  if (!profile) redirect("/login");

  const [rule, quartiles, badge] = await Promise.all([
    getSetting("topPerformer"),
    currentQuartiles(prisma, profile.id),
    prisma.badge.findFirst({ where: { candidateProfileId: profile.id, type: "TOP_PERFORMER_ALL_TESTS" } }),
  ]);
  const progress = topPerformerProgress(quartiles, rule);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900">Badges</h1>
      <p className="mt-1 text-zinc-600">Recognition for strong results. Recruiters can see the badges you have earned.</p>

      <section className="card mt-6" aria-labelledby="tp-h" data-testid="top-performer-badge">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="tp-h" className="text-lg font-semibold text-zinc-900">Top Performer</h2>
            <p className="mt-1 text-sm text-zinc-700">
              Earned by reaching quartile Q{rule.requiredQuartile} or better in every one of these tests: {progress.map((p) => p.title).join(", ")}.
            </p>
          </div>
          {badge ? <span className="badge bg-green-100 text-green-900" data-testid="badge-earned">Earned {fmt(badge.awardedAt)}</span> : <span className="badge bg-zinc-100 text-zinc-700">Not earned yet</span>}
        </div>

        <ul className="mt-4 divide-y divide-zinc-100">
          {progress.map((p) => (
            <li key={p.testType} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-zinc-900">{p.title}</span>
              <span className="flex items-center gap-3">
                {p.quartile === null ? <span className="text-zinc-500">Not taken yet</span> : <span className={p.met ? "font-medium text-green-800" : "text-amber-800"}>Q{p.quartile}{p.met ? " - reached" : " - not there yet"}</span>}
                {!p.met && <Link href={`/candidate/tests/${TEST_SLUGS[p.testType]}`} className="text-brand-700 underline">{p.quartile === null ? "Take it" : "Details"}</Link>}
              </span>
            </li>
          ))}
        </ul>
        {badge && <p className="mt-4 text-sm text-zinc-700">Once earned, the badge stays on your profile.</p>}
      </section>
    </div>
  );
}

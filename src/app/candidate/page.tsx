import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import ModuleGrid from "@/components/ModuleGrid";
import Stat from "@/components/Stat";
import { formatMoney } from "@/lib/money";
import { getCurrency } from "@/lib/settings";
import Link from "next/link";
import { latestResults } from "@/lib/results/latest";
import { unreadCount } from "@/lib/notifications";
import { TEST_TITLES } from "@/lib/testEngine/labels";

export default async function CandidateDashboard() {
  const session = await auth();
  const [profile, currency, unread] = await Promise.all([
    prisma.candidateProfile.findUnique({
      where: { userId: session!.user.id },
      include: { jobRole: true, region: true, badges: { select: { type: true } } },
    }),
    getCurrency(),
    unreadCount(prisma, session!.user.id),
  ]);
  const results = profile ? await latestResults(prisma, profile.id) : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Welcome, {session?.user.name}</h1>
      <p className="mt-1 text-zinc-600">Your profile, progress and next steps.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Job role" value={profile?.jobRole?.name ?? "-"} />
        <Stat
          label="Location"
          value={profile?.city ?? "-"}
          hint={profile?.region?.name}
        />
        <Stat
          label="Experience"
          value={profile?.experienceYears != null ? `${profile.experienceYears} yrs` : "-"}
        />
        <Stat
          label="Minimum salary"
          value={profile?.minimumSalary != null ? formatMoney(profile.minimumSalary, currency) : "-"}
          hint="per month"
        />
      </div>

      <section className="card mt-6" aria-labelledby="dash-results-h" data-testid="dashboard-results">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="dash-results-h" className="text-lg font-semibold text-zinc-900">Your results</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {profile?.badges.length ? <span className="badge bg-green-100 text-green-900">Top Performer</span> : null}
            {unread > 0 && <Link href="/candidate/notifications" className="text-brand-700 underline">{unread} unread notification{unread === 1 ? "" : "s"}</Link>}
            <Link href="/candidate/results" className="text-brand-700 underline">All results and feedback</Link>
          </div>
        </div>
        {results.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-700">No results yet. <Link href="/candidate/tests" className="text-brand-700 underline">Take your first test</Link>.</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {results.map((r) => (
              <li key={r.scoreId} className="rounded-lg bg-zinc-50 px-3 py-2 text-sm">
                <p className="text-zinc-500">{TEST_TITLES[r.testType]}</p>
                <p className="font-semibold text-zinc-900">{r.provisional ? "Being graded" : r.quartile !== null ? `Q${r.quartile}` : "Done"}{r.cefrLevel && !r.provisional ? ` · ${r.cefrLevel}` : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ModuleGrid role="CANDIDATE" />
    </div>
  );
}

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { daysAgo } from "@/lib/dates";
import Stat from "@/components/Stat";
import { CandidateSection, HiringSection, PeriodPicker, readDays } from "@/components/reports/Panels";
import { recruiterVisibleWhere } from "@/lib/recruiter/candidateAccess";
import { resolveOffer } from "@/lib/recruiter/guards";
import { hiringReport } from "@/lib/reports/hiring";
import { poolReport } from "@/lib/reports/pool";

/** The recruiter's own hiring report: funnel, time to hire, activity, and the candidates that fit their offers. */
export default async function RecruiterReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const companyId = session!.user.companyId!;
  const tools = await getSetting("recruiterTools");
  const days = readDays((await searchParams).days, tools.reportDefaultDays);

  const [hiring, { offerMax }, openOpenings, contactCounts] = await Promise.all([
    hiringReport(prisma, { recruiterId: session!.user.id }, days),
    resolveOffer(prisma, companyId, {}),
    prisma.jobOpening.count({ where: { companyId, createdById: session!.user.id, status: "OPEN" } }),
    prisma.contactRequest.groupBy({ by: ["status"], where: { recruiterId: session!.user.id, sentAt: { gte: daysAgo(days) } }, _count: { _all: true } }),
  ]);
  const pool = offerMax === null ? null : await poolReport(prisma, recruiterVisibleWhere(offerMax));
  const sent = contactCounts.reduce((a, c) => a + c._count._all, 0);
  const accepted = contactCounts.find((c) => c.status === "ACCEPTED")?._count._all ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Reports</h1>
      <p className="mt-1 text-zinc-600">Your hiring activity and the candidates that fit your offers.</p>
      <PeriodPicker base="/recruiter/reports" days={days} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Shortlisted" value={hiring.total} hint={`Last ${days} days`} />
        <Stat label="Hired" value={hiring.timeToHire.hires} hint="In this period" />
        <Stat label="Requests sent" value={sent} hint={sent ? `${accepted} accepted` : undefined} />
        <Stat label="Open job openings" value={openOpenings} />
      </div>

      <div className="mt-5"><HiringSection data={hiring} days={days} who="You" /></div>

      {pool ? (
        <CandidateSection title="Candidates that fit your offers" city={pool.city} role={pool.role} quartiles={pool.quartiles} />
      ) : (
        <p className="card mt-8 text-sm text-zinc-700">Create a job opening to see the candidates that fit your offer.</p>
      )}
    </div>
  );
}

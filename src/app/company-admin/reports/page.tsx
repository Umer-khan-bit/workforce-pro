import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { daysAgo } from "@/lib/dates";
import Stat from "@/components/Stat";
import { BarList } from "@/components/charts/charts";
import { CandidateSection, HiringSection, PeriodPicker, readDays } from "@/components/reports/Panels";
import { recruiterVisibleWhere } from "@/lib/recruiter/candidateAccess";
import { getEntitlements } from "@/lib/recruiter/entitlements";
import { resolveOffer } from "@/lib/recruiter/guards";
import { pipelineCount } from "@/lib/recruiter/shortlist";
import { hiringReport } from "@/lib/reports/hiring";
import { poolReport } from "@/lib/reports/pool";
import { OPENING_STATUS_LABELS } from "@/lib/recruiter/openings";

/** Company hiring report: the funnel and time to hire across all recruiters, who did what, openings, plan usage, and the candidates that fit the company's offers. */
export default async function CompanyReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const companyId = session!.user.companyId!;
  const tools = await getSetting("recruiterTools");
  const days = readDays((await searchParams).days, tools.reportDefaultDays);
  const since = daysAgo(days);

  const [hiring, ent, used, { offerMax }, openingsByStatus, recruiters] = await Promise.all([
    hiringReport(prisma, { companyId }, days),
    getEntitlements(companyId),
    pipelineCount(prisma, companyId),
    resolveOffer(prisma, companyId, {}),
    prisma.jobOpening.groupBy({ by: ["status"], where: { companyId }, _count: { _all: true } }),
    prisma.user.findMany({ where: { companyId, role: "RECRUITER" }, select: { id: true, name: true, email: true, isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const pool = offerMax === null ? null : await poolReport(prisma, recruiterVisibleWhere(offerMax));

  // Who did what in the period.
  const rows = await Promise.all(
    recruiters.map(async (r) => {
      const [shortlisted, requests, hired, openings] = await Promise.all([
        prisma.shortlist.count({ where: { recruiterId: r.id, createdAt: { gte: since } } }),
        prisma.contactRequest.count({ where: { recruiterId: r.id, sentAt: { gte: since } } }),
        prisma.shortlistStatusHistory.count({ where: { status: "HIRED", changedAt: { gte: since }, shortlist: { recruiterId: r.id } } }),
        prisma.jobOpening.count({ where: { companyId, createdById: r.id, status: "OPEN" } }),
      ]);
      return { ...r, shortlisted, requests, hired, openings };
    })
  );
  const openOpenings = openingsByStatus.find((o) => o.status === "OPEN")?._count._all ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Reports</h1>
      <p className="mt-1 text-zinc-600">How your company is hiring: every recruiter, every job opening.</p>
      <PeriodPicker base="/company-admin/reports" days={days} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Shortlisted" value={hiring.total} hint={`Last ${days} days`} />
        <Stat label="Hires" value={hiring.timeToHire.hires} hint={hiring.timeToHire.averageDays !== null ? `${hiring.timeToHire.averageDays} days on average` : "None yet in this period"} />
        <Stat label="Open job openings" value={openOpenings} hint={ent.openingLimit === null ? "No plan limit" : `Plan allows ${ent.openingLimit}`} />
        <Stat label="Shortlist places used" value={used} hint={ent.shortlistLimit === null ? "No plan limit" : `Plan allows ${ent.shortlistLimit}`} />
      </div>

      <div className="mt-5"><HiringSection data={hiring} days={days} who="Your company" /></div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarList title="Job openings by status" data={openingsByStatus.map((o) => ({ label: OPENING_STATUS_LABELS[o.status], value: o._count._all }))} empty="No job openings yet." testId="openings-by-status" />
      </div>

      <section className="mt-8" aria-labelledby="activity-h">
        <h2 id="activity-h" className="text-lg font-semibold text-zinc-900">Recruiter activity</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[36rem] text-left text-sm" data-testid="recruiter-activity">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr><th className="px-3 py-3">Recruiter</th><th className="px-3 py-3">Shortlisted</th><th className="px-3 py-3">Requests sent</th><th className="px-3 py-3">Hires</th><th className="px-3 py-3">Open job openings</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-zinc-600">No recruiters yet.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-3"><p className="font-medium text-zinc-900">{r.name ?? r.email}</p>{!r.isActive && <p className="text-xs text-zinc-500">Deactivated</p>}</td>
                  <td className="px-3 py-3">{r.shortlisted}</td><td className="px-3 py-3">{r.requests}</td><td className="px-3 py-3">{r.hired}</td><td className="px-3 py-3">{r.openings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {pool ? <CandidateSection title="Candidates that fit your company's offers" city={pool.city} role={pool.role} quartiles={pool.quartiles} /> : <p className="card mt-8 text-sm text-zinc-700">Create a job opening to see the candidates that fit your offers.</p>}
    </div>
  );
}

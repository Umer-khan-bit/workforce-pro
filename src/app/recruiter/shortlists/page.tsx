import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recruiterVisibleWhere } from "@/lib/recruiter/candidateAccess";
import { getEntitlements } from "@/lib/recruiter/entitlements";
import { pipelineCount, PIPELINE, STATUS_LABELS } from "@/lib/recruiter/shortlist";
import ShortlistRow from "./ShortlistRow";

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The recruiter's shortlist pipeline, grouped by job opening. Candidates whose minimum no longer fits the opening's offer drop out of view. */
export default async function ShortlistsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const opening = typeof raw.opening === "string" ? raw.opening : undefined;
  const session = await auth();
  const companyId = session!.user.companyId!;

  const [ent, openings, used] = await Promise.all([
    getEntitlements(companyId),
    prisma.jobOpening.findMany({ where: { companyId, shortlists: { some: { recruiterId: session!.user.id } } }, include: { jobRole: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    pipelineCount(prisma, companyId),
  ]);
  const visibleFor = openings.map((o) => ({ jobOpeningId: o.id, candidateProfile: recruiterVisibleWhere(o.salaryRangeMax) }));
  const entries = visibleFor.length
    ? await prisma.shortlist.findMany({
        where: { recruiterId: session!.user.id, OR: visibleFor, ...(opening ? { jobOpeningId: opening } : {}) },
        include: {
          candidateProfile: { select: { id: true, city: true, jobRole: { select: { name: true } }, user: { select: { name: true } } } },
          statusHistory: { orderBy: { changedAt: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const counts = Object.fromEntries([...PIPELINE, "REJECTED" as const].map((s) => [s, entries.filter((e) => e.status === s).length]));
  const limitText = ent.shortlistLimit === null ? "Your plan has no limit on shortlisted candidates." : `${used} of ${ent.shortlistLimit} shortlist places used across your company (hired and rejected candidates do not count).`;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Shortlists</h1>
      <p className="mt-1 text-zinc-600">Move shortlisted candidates along the hiring pipeline. Every change is dated.</p>
      <p className="mt-2 text-sm text-zinc-600" data-testid="shortlist-limit">{limitText}</p>

      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Pipeline summary" data-testid="pipeline-summary">
        {[...PIPELINE, "REJECTED" as const].map((s) => (
          <li key={s} className="rounded-lg bg-white px-3 py-2 text-sm shadow-xs ring-1 ring-zinc-200">
            <span className="text-zinc-500">{STATUS_LABELS[s]}</span> <strong className="ml-1 text-zinc-900">{counts[s]}</strong>
          </li>
        ))}
      </ul>

      {openings.length > 1 && (
        <nav aria-label="Job openings" className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link href="/recruiter/shortlists" className={`rounded-full border px-3 py-1 ${!opening ? "border-brand-700 bg-brand-700 text-white" : "border-zinc-300 bg-white"}`}>All</Link>
          {openings.map((o) => (
            <Link key={o.id} href={`/recruiter/shortlists?opening=${o.id}`} className={`rounded-full border px-3 py-1 ${opening === o.id ? "border-brand-700 bg-brand-700 text-white" : "border-zinc-300 bg-white"}`}>{o.title ?? o.jobRole.name}</Link>
          ))}
        </nav>
      )}

      {entries.length === 0 ? (
        <p className="card mt-6 text-sm text-zinc-700">Nobody is shortlisted yet. <Link href="/recruiter/candidates" className="text-brand-700 underline">Search candidates</Link> and press Shortlist.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {openings.filter((o) => entries.some((e) => e.jobOpeningId === o.id)).map((o) => (
            <section key={o.id} aria-labelledby={`o-${o.id}`}>
              <h2 id={`o-${o.id}`} className="font-semibold text-zinc-900">{o.title ?? o.jobRole.name}{o.city ? `, ${o.city}` : ""} <span className="text-sm font-normal text-zinc-500">({o.status.toLowerCase()})</span></h2>
              <ul className="mt-2 flex flex-col gap-3">
                {entries.filter((e) => e.jobOpeningId === o.id).map((e) => (
                  <ShortlistRow
                    key={e.id}
                    item={{
                      id: e.id,
                      name: e.candidateProfile.user.name ?? "Candidate",
                      detailHref: `/recruiter/candidates/${e.candidateProfile.id}?opening=${o.id}`,
                      roleCity: [e.candidateProfile.jobRole?.name, e.candidateProfile.city].filter(Boolean).join(" · "),
                      status: e.status,
                      note: e.note ?? "",
                      addedOn: fmt(e.createdAt),
                      changedOn: fmt(e.statusHistory.at(-1)?.changedAt ?? e.updatedAt),
                      history: e.statusHistory.map((h) => ({ status: STATUS_LABELS[h.status], on: fmt(h.changedAt) })),
                    }}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

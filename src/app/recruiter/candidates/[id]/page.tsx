import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrency, getSetting } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { getEntitlements, planBlockMessage } from "@/lib/recruiter/entitlements";
import { getCandidateDetail } from "@/lib/recruiter/candidateDetail";
import { resolveOffer } from "@/lib/recruiter/guards";
import { STATUS_LABELS } from "@/lib/recruiter/shortlist";
import { buildSearchQuery, parseSearchQuery } from "@/lib/recruiter/searchParams";
import { resultLines } from "@/lib/results/describe";
import { TEST_TITLES } from "@/lib/testEngine/labels";
import ShortlistControl from "../ShortlistControl";
import ContactControl from "../ContactControl";

const QUARTILE_STYLE: Record<number, string> = { 1: "bg-green-100 text-green-900", 2: "bg-teal-50 text-teal-900", 3: "bg-amber-50 text-amber-900", 4: "bg-red-50 text-red-800" };
const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The candidate detail report. It follows the same rules as search: plan, Top Performer access and the minimum-salary rule against the offer. */
export default async function CandidateDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const query = parseSearchQuery(await searchParams);
  const session = await auth();
  const companyId = session!.user.companyId!;

  const ent = await getEntitlements(companyId);
  if (!ent.canSearch) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Candidate</h1>
        <p role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{planBlockMessage(ent, "candidate reports")}</p>
      </div>
    );
  }
  const { offerMax, openingId } = await resolveOffer(prisma, companyId, { recruiterId: session!.user.id, openingId: query.opening, offer: query.offer });
  const detail = offerMax === null ? null : await getCandidateDetail(prisma, { recruiterUserId: session!.user.id, companyId, candidateProfileId: id, offerMax, entitlements: ent });
  if (offerMax === null || !detail) notFound();

  const [currency, quartiles, openings] = await Promise.all([
    getCurrency(),
    getSetting("quartiles"),
    prisma.jobOpening.findMany({ where: { companyId, status: "OPEN" }, include: { jobRole: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const openingOptions = openings.map((o) => ({ id: o.id, label: `${o.title ?? o.jobRole.name}${o.city ? `, ${o.city}` : ""}` }));
  const nameOf = new Map(openingOptions.map((o) => [o.id, o.label]));
  const carry = buildSearchQuery({ offer: query.offer ?? offerMax, opening: openingId });
  const reportHref = `/api/recruiter/candidates/${detail.id}/report?${carry}`;

  return (
    <div className="max-w-3xl">
      <Link href={`/recruiter/candidates?${carry}`} className="text-sm text-brand-700 underline">&larr; Candidate search</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900" data-testid="candidate-name">{detail.name ?? "Candidate"}</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {[detail.jobRole, detail.city, detail.region, detail.experienceYears !== null ? `${detail.experienceYears} years of experience` : null].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            {detail.topPerformer && <span className="badge bg-green-100 text-green-900" data-testid="top-performer">Top Performer</span>}
            <span className="text-zinc-700" data-testid="fits-offer">Their salary expectations fit your offer of {formatMoney(offerMax, currency)}.</span>
          </p>
        </div>
        <a href={reportHref} className="btn-secondary" data-testid="download-candidate-report">Download PDF report</a>
      </div>

      <section className="mt-6 flex flex-col gap-4" aria-label="Results">
        {detail.results.length === 0 && <p className="card text-sm text-zinc-700">This candidate has no finished results yet.</p>}
        {detail.results.map((r) => (
          <article key={r.scoreId} className="card" data-testid={`detail-${r.testType}`}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-zinc-900">{TEST_TITLES[r.testType]}</h2>
              <div className="flex items-center gap-2">
                {r.testType === "LANGUAGE" && r.cefrLevel && !r.provisional && <span className="badge bg-zinc-100 text-zinc-800">{r.cefrLevel}</span>}
                {r.quartile !== null && !r.provisional && <span className={`rounded-lg px-3 py-1 text-xl font-semibold ${QUARTILE_STYLE[r.quartile]}`}>Q{r.quartile}</span>}
              </div>
            </div>
            <div className="mt-1 space-y-1 text-sm text-zinc-700">{resultLines(r, quartiles.minCohortSize).map((line, i) => <p key={i}>{line}</p>)}<p data-testid={`integrity-${r.testType}`}>{detail.integrity[r.testType]}</p></div>
            {r.traits && (
              <ul className="mt-3 flex flex-col gap-2">
                {r.traits.map((t) => (
                  <li key={t.trait}>
                    <div className="flex justify-between text-sm"><span>{t.trait}</span><span className="tabular-nums">{t.score.toFixed(1)} / 5</span></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${((t.score - 1) / 4) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </section>

      <section className="card mt-6" aria-labelledby="sl-h">
        <h2 id="sl-h" className="font-semibold text-zinc-900">Shortlist</h2>
        {detail.shortlists.length > 0 && (
          <ul className="mt-2 text-sm text-zinc-700">
            {detail.shortlists.map((s) => <li key={s.id}>{nameOf.get(s.jobOpeningId) ?? "A job opening"}: {STATUS_LABELS[s.status as keyof typeof STATUS_LABELS]}</li>)}
          </ul>
        )}
        <div className="mt-3"><ShortlistControl candidateId={detail.id} openings={openingOptions} shortlistedIn={detail.shortlists.map((s) => s.jobOpeningId)} /></div>
        <p className="mt-2 text-xs text-zinc-500">See and move shortlisted candidates in <Link href="/recruiter/shortlists" className="underline">Shortlists</Link>.</p>
      </section>

      <section className="card mt-4" aria-labelledby="cr-h">
        <h2 id="cr-h" className="font-semibold text-zinc-900">Contact</h2>
        {detail.requests.length > 0 && (
          <ul className="mt-2 flex flex-col gap-2 text-sm" data-testid="requests">
            {detail.requests.map((r) => (
              <li key={r.id} className="rounded-lg bg-zinc-50 p-3">
                <p className="text-zinc-800">{nameOf.get(r.jobOpeningId) ?? "A job opening"}: <strong>{r.status === "SENT" ? "Waiting for the candidate" : r.status === "ACCEPTED" ? "Accepted" : "Declined"}</strong> · sent {fmt(r.sentAt)}{r.respondedAt ? ` · answered ${fmt(r.respondedAt)}` : ""}</p>
                {r.status === "ACCEPTED" && (r.email || r.phone) && <p className="mt-1 text-zinc-700" data-testid="contact-details">Contact: {[r.email, r.phone].filter(Boolean).join(" · ")}</p>}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3"><ContactControl candidateId={detail.id} openings={openingOptions} contactedOpenings={detail.requests.map((r) => r.jobOpeningId)} /></div>
        <p className="mt-2 text-xs text-zinc-500">Candidates are asked first. Their phone and email are shown here only after they accept.</p>
      </section>
    </div>
  );
}

import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recruiterVisibleWhere } from "@/lib/recruiter/candidateAccess";

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The recruiter's contact requests with their status and dates. Contact details appear only after the candidate accepts. */
export default async function RecruiterContactRequestsPage() {
  const session = await auth();
  const companyId = session!.user.companyId!;
  const openings = await prisma.jobOpening.findMany({ where: { companyId }, select: { id: true, salaryRangeMax: true } });
  const requests = await prisma.contactRequest.findMany({
    where: {
      recruiterId: session!.user.id,
      // A request is only listed while the candidate still fits the offer, unless they already accepted.
      OR: [{ status: "ACCEPTED" }, ...openings.map((o) => ({ jobOpeningId: o.id, candidateProfile: recruiterVisibleWhere(o.salaryRangeMax) }))],
    },
    orderBy: { sentAt: "desc" },
    include: {
      candidateProfile: { select: { id: true, phone: true, user: { select: { name: true, email: true } } } },
      jobOpening: { select: { title: true, city: true, jobRole: { select: { name: true } } } },
    },
    take: 200,
  });
  const counts = { SENT: 0, ACCEPTED: 0, DECLINED: 0 };
  for (const r of requests) counts[r.status]++;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Contact requests</h1>
      <p className="mt-1 text-zinc-600">Candidates are asked first. A request can only be sent when your offer meets the candidate&apos;s minimum salary.</p>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Summary" data-testid="request-summary">
        <li className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-zinc-200">Waiting <strong className="ml-1">{counts.SENT}</strong></li>
        <li className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-zinc-200">Accepted <strong className="ml-1">{counts.ACCEPTED}</strong></li>
        <li className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-zinc-200">Declined <strong className="ml-1">{counts.DECLINED}</strong></li>
      </ul>

      {requests.length === 0 ? (
        <p className="card mt-6 text-sm text-zinc-700">No requests yet. Open a candidate from <Link href="/recruiter/candidates" className="text-brand-700 underline">Candidate search</Link> and send a request.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[44rem] text-left text-sm" data-testid="requests-table">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-3">Candidate</th>
                <th className="px-3 py-3">Job opening</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Sent</th>
                <th className="px-3 py-3">Answered</th>
                <th className="px-3 py-3">Contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {requests.map((r) => (
                <tr key={r.id} data-testid="request-row">
                  <td className="px-3 py-3"><Link href={`/recruiter/candidates/${r.candidateProfile.id}?opening=${r.jobOpeningId}`} className="font-medium text-brand-700 underline">{r.candidateProfile.user.name ?? "Candidate"}</Link></td>
                  <td className="px-3 py-3">{r.jobOpening.title ?? r.jobOpening.jobRole.name}{r.jobOpening.city ? `, ${r.jobOpening.city}` : ""}</td>
                  <td className="px-3 py-3">
                    {r.status === "SENT" && <span className="badge bg-amber-50 text-amber-800">Waiting</span>}
                    {r.status === "ACCEPTED" && <span className="badge bg-green-50 text-green-800">Accepted</span>}
                    {r.status === "DECLINED" && <span className="badge bg-zinc-100 text-zinc-700">Declined</span>}
                  </td>
                  <td className="px-3 py-3">{fmt(r.sentAt)}</td>
                  <td className="px-3 py-3">{r.respondedAt ? fmt(r.respondedAt) : "-"}</td>
                  <td className="px-3 py-3">{r.status === "ACCEPTED" ? [r.candidateProfile.user.email, r.candidateProfile.phone].filter(Boolean).join(" · ") : <span className="text-zinc-400">After they accept</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import RespondButtons from "./RespondButtons";

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Recruiter requests: only offers that meet the candidate's minimum salary can ever reach this list. */
export default async function RecruiterRequestsPage() {
  const session = await auth();
  const requests = await prisma.contactRequest.findMany({
    where: { candidateProfile: { userId: session!.user.id } },
    orderBy: { sentAt: "desc" },
    include: { recruiter: { select: { name: true, company: { select: { name: true } } } }, jobOpening: { select: { jobRole: { select: { name: true } }, city: true } } },
    take: 100,
  });

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900">Recruiter requests</h1>
      <p className="mt-1 text-zinc-600">Recruiters ask permission before contacting you. Only offers that meet your minimum salary reach you. Your phone and email stay private until you accept.</p>

      {requests.length === 0 ? (
        <p className="card mt-6 text-sm text-zinc-700">No requests yet.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4" data-testid="requests">
          {requests.map((r) => (
            <li key={r.id} className="card" data-testid="request">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-zinc-900">{r.recruiter.company?.name ?? "A company"}</p>
                  <p className="text-sm text-zinc-600">{r.recruiter.name ?? "A recruiter"} · {r.jobOpening.jobRole.name}{r.jobOpening.city ? `, ${r.jobOpening.city}` : ""} · {fmt(r.sentAt)}</p>
                </div>
                {r.status === "SENT" && <span className="badge bg-amber-50 text-amber-800">Waiting for you</span>}
                {r.status === "ACCEPTED" && <span className="badge bg-green-50 text-green-800">Accepted</span>}
                {r.status === "DECLINED" && <span className="badge bg-zinc-100 text-zinc-700">Declined</span>}
              </div>
              {r.message && <p className="mt-3 whitespace-pre-line rounded-lg bg-zinc-50 p-3 text-sm text-zinc-800">{r.message}</p>}
              {r.status === "SENT" && <RespondButtons id={r.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { loadAtsCandidates } from "@/lib/ats/payload";
import { getEntitlements, planBlockMessage } from "@/lib/recruiter/entitlements";
import { STATUS_LABELS } from "@/lib/recruiter/shortlist";
import PushPanel, { type PushRow } from "./PushPanel";

/** Push shortlisted candidates to the ATS, or download them as CSV or Excel. */
export default async function AtsExportPage() {
  const session = await auth();
  const companyId = session!.user.companyId!;
  const ent = await getEntitlements(companyId);
  const demo = process.env.DEMO_MODE === "true";

  const candidates = ent.canUseAts ? await loadAtsCandidates(prisma, { companyId, recruiterId: session!.user.id, limit: 500 }) : [];
  const pushed = candidates.length ? await prisma.mockAtsCandidate.findMany({ where: { companyId, externalRef: { in: candidates.map((c) => c.reference) } }, select: { externalRef: true, externalId: true } }) : [];
  const inAts = new Map(pushed.map((p) => [p.externalRef, p.externalId]));
  const rows: PushRow[] = candidates.map((c) => ({ reference: c.reference, name: c.candidate.name ?? "Candidate", opening: c.jobOpening.title ?? c.jobOpening.jobRole, stage: STATUS_LABELS[c.status], inAts: inAts.get(c.reference) ?? null }));

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-zinc-900">ATS export</h1>
      <p className="mt-1 text-zinc-600">Send your shortlisted candidates to your applicant tracking system, or download them as a spreadsheet. Names and results are included; a candidate&apos;s email and phone are included only once they accepted your request, and salary expectations never are.</p>

      {!ent.canUseAts ? (
        <p role="alert" className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="plan-blocked">{planBlockMessage(ent, "ATS and API access")}</p>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap gap-3" aria-label="Downloads">
            <a href="/api/recruiter/ats/export?format=csv" className="btn-secondary" data-testid="export-csv">Download CSV</a>
            <a href="/api/recruiter/ats/export?format=xlsx" className="btn-secondary" data-testid="export-xlsx">Download Excel</a>
          </div>
          <p className="mt-3 text-sm text-zinc-600" data-testid="connector-note">{demo ? <>In demo mode candidates go to the built-in mock ATS. Your company admin can see what arrived under <strong>ATS &amp; webhooks</strong>.</> : "Candidates go to the ATS your company has connected."}</p>
          <div className="mt-4"><PushPanel rows={rows} canPush /></div>
          <p className="mt-4 text-sm text-zinc-600">Manage who is on your shortlist in <Link href="/recruiter/shortlists" className="text-brand-700 underline">Shortlists</Link>.</p>
        </>
      )}
    </div>
  );
}

import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import ModuleGrid from "@/components/ModuleGrid";
import Stat from "@/components/Stat";
import PlanCallout from "@/components/PlanStatus";
import { BarList } from "@/components/charts/charts";
import { HiringSection } from "@/components/reports/Panels";
import { getSetting } from "@/lib/settings";
import { getCompanyAccess } from "@/lib/companyPlan";
import { recruiterVisibleWhere } from "@/lib/recruiter/candidateAccess";
import { resolveOffer } from "@/lib/recruiter/guards";
import { candidatesByCity } from "@/lib/reports/candidates";
import { hiringReport } from "@/lib/reports/hiring";

export default async function RecruiterDashboard() {
  const session = await auth();
  const companyId = session!.user.companyId;
  const tools = await getSetting("recruiterTools");

  // Candidates are only counted when their minimum salary fits what the company is offering (the highest top
  // salary among its open job openings), like everywhere else a recruiter sees candidates.
  const { offerMax } = companyId ? await resolveOffer(prisma, companyId, { recruiterId: session!.user.id }) : { offerMax: null };

  const [company, access, fitting, openings, inPipeline, waiting, hiring, cities] = await Promise.all([
    companyId ? prisma.company.findUnique({ where: { id: companyId } }) : null,
    companyId ? getCompanyAccess(companyId) : null,
    offerMax === null ? Promise.resolve(null) : prisma.candidateProfile.count({ where: recruiterVisibleWhere(offerMax) }),
    prisma.jobOpening.count({ where: { companyId: companyId ?? "none", createdById: session!.user.id, status: "OPEN" } }),
    prisma.shortlist.count({ where: { recruiterId: session!.user.id, status: { notIn: ["HIRED", "REJECTED"] } } }),
    prisma.contactRequest.count({ where: { recruiterId: session!.user.id, status: "SENT" } }),
    hiringReport(prisma, { recruiterId: session!.user.id }, tools.reportDefaultDays),
    offerMax === null ? Promise.resolve([]) : candidatesByCity(prisma, recruiterVisibleWhere(offerMax), 6),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Welcome, {session?.user.name}</h1>
      <p className="mt-1 text-zinc-600">Your hiring activity at a glance.</p>

      {access && <PlanCallout access={access} href="/company-admin/subscription" />}

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Company" value={company?.name ?? "-"} hint={access?.plan ? `${access.plan.name} plan` : "No plan"} />
        <Stat
          label="Candidates matching your offers"
          value={fitting ?? "-"}
          hint={fitting === null ? "Create a job opening to see candidates" : "Their salary expectations fit your open job openings"}
        />
        <Stat label="In your pipeline" value={inPipeline} hint={`${openings} open job opening${openings === 1 ? "" : "s"}`} />
        <Stat label="Requests waiting" value={waiting} hint="Candidates yet to answer" />
      </div>

      <div className="mt-6"><HiringSection data={hiring} days={tools.reportDefaultDays} who="You" /></div>
      <div className="mt-4"><BarList title="Matching candidates by city" data={cities} empty="Create a job opening to see candidates by city." testId="dashboard-cities" /></div>
      <p className="mt-2 text-sm"><Link href="/recruiter/reports" className="text-brand-700 underline">More in Reports</Link></p>

      <ModuleGrid role="RECRUITER" />
    </div>
  );
}

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import ModuleGrid from "@/components/ModuleGrid";
import Stat from "@/components/Stat";
import { getCompanyPlan } from "@/lib/companyPlan";
import { recruiterVisibleWhere } from "@/lib/recruiter/candidateAccess";

export default async function RecruiterDashboard() {
  const session = await auth();
  const companyId = session!.user.companyId;

  // Candidates are only counted when their minimum salary fits what the company is offering (the highest
  // top salary among its open job openings), like everywhere else a recruiter sees candidates.
  const offer = companyId
    ? await prisma.jobOpening.aggregate({ where: { companyId, status: "OPEN" }, _max: { salaryRangeMax: true } })
    : null;
  const offerMax = offer?._max.salaryRangeMax ?? null;

  const [company, plan, candidateCount] = await Promise.all([
    companyId ? prisma.company.findUnique({ where: { id: companyId } }) : null,
    companyId ? getCompanyPlan(companyId) : null,
    offerMax === null ? Promise.resolve(null) : prisma.candidateProfile.count({ where: recruiterVisibleWhere(offerMax) }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Welcome, {session?.user.name}</h1>
      <p className="mt-1 text-zinc-600">Your hiring activity at a glance.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Company" value={company?.name ?? "-"} hint={company?.city ?? undefined} />
        <Stat label="Company plan" value={plan ? plan.name : "None"} />
        <Stat
          label="Candidates matching your offers"
          value={candidateCount ?? "-"}
          hint={candidateCount === null ? "Create a job opening to see candidates" : "Their salary expectations fit your open job openings"}
        />
      </div>

      <ModuleGrid role="RECRUITER" />
    </div>
  );
}

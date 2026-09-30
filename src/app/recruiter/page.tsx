import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import ModuleGrid from "@/components/ModuleGrid";
import Stat from "@/components/Stat";
import { getCompanyPlan } from "@/lib/companyPlan";

export default async function RecruiterDashboard() {
  const session = await auth();
  const companyId = session!.user.companyId;

  const [company, plan, candidateCount] = await Promise.all([
    companyId ? prisma.company.findUnique({ where: { id: companyId } }) : null,
    companyId ? getCompanyPlan(companyId) : null,
    prisma.candidateProfile.count(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Welcome, {session?.user.name}</h1>
      <p className="mt-1 text-zinc-600">Your hiring activity at a glance.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Company" value={company?.name ?? "-"} hint={company?.city ?? undefined} />
        <Stat label="Company plan" value={plan ? plan.name : "None"} />
        <Stat label="Candidates on the platform" value={candidateCount} />
      </div>

      <ModuleGrid role="RECRUITER" />
    </div>
  );
}

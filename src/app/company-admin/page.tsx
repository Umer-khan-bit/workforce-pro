import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import ModuleGrid from "@/components/ModuleGrid";
import Stat from "@/components/Stat";
import { formatPkr, formatPlanName, getCompanyPlan } from "@/lib/companyPlan";

export default async function CompanyAdminDashboard() {
  const session = await auth();
  const companyId = session!.user.companyId!;

  const [company, plan, recruiterCount] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    getCompanyPlan(companyId),
    prisma.user.count({ where: { companyId, role: "RECRUITER", isActive: true } }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Welcome, {session?.user.name}</h1>
      <p className="mt-1 text-zinc-600">Your company, plan and team.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Company" value={company?.name ?? "-"} hint={company?.city ?? undefined} />
        <Stat
          label="Plan"
          value={plan ? formatPlanName(plan.name) : "None"}
          hint={plan ? `${formatPkr(plan.priceMonthly)} / month (placeholder price)` : undefined}
        />
        <Stat label="Active recruiters" value={recruiterCount} />
      </div>

      <ModuleGrid role="COMPANY_ADMIN" />
    </div>
  );
}

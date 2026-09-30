import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import ModuleGrid from "@/components/ModuleGrid";
import PlanCallout from "@/components/PlanStatus";
import Stat from "@/components/Stat";
import { getCompanyAccess } from "@/lib/companyPlan";
import { formatMoney } from "@/lib/money";
import { getCurrency } from "@/lib/settings";

export default async function CompanyAdminDashboard() {
  const session = await auth();
  const companyId = session!.user.companyId!;

  const [company, access, recruiterCount, currency] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    getCompanyAccess(companyId),
    prisma.user.count({ where: { companyId, role: "RECRUITER", isActive: true } }),
    getCurrency(),
  ]);

  const planName = access.plan?.name ?? (access.state === "ended" ? "Ended" : "None");
  const hint = access.plan
    ? access.state === "trial"
      ? `Free trial, ${access.daysLeft} day${access.daysLeft === 1 ? "" : "s"} left`
      : `${formatMoney(access.plan.priceMonthly, currency)} / month`
    : undefined;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Welcome, {session?.user.name}</h1>
      <p className="mt-1 text-zinc-600">Your company, plan and team.</p>

      <PlanCallout access={access} href="/company-admin/subscription" />

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Company" value={company?.name ?? "-"} hint={company?.city ?? undefined} />
        <Stat label="Plan" value={planName} hint={hint} />
        <Stat label="Active recruiters" value={recruiterCount} />
      </div>

      <ModuleGrid role="COMPANY_ADMIN" />
    </div>
  );
}

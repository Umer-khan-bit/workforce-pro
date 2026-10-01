import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import ModuleGrid from "@/components/ModuleGrid";
import PlanCallout from "@/components/PlanStatus";
import Stat from "@/components/Stat";
import { HiringSection } from "@/components/reports/Panels";
import { getCompanyAccess } from "@/lib/companyPlan";
import { formatMoney } from "@/lib/money";
import { getCurrency, getSetting } from "@/lib/settings";
import { pipelineCount } from "@/lib/recruiter/shortlist";
import { hiringReport } from "@/lib/reports/hiring";
import { warnIfExpiring } from "@/lib/subscriptions";

export default async function CompanyAdminDashboard() {
  const session = await auth();
  const companyId = session!.user.companyId!;

  // Warn the admins (once per subscription) when the plan is about to end.
  await warnIfExpiring(prisma, companyId);

  const tools = await getSetting("recruiterTools");
  const [company, access, recruiterCount, currency, openOpenings, pipeline, hiring] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    getCompanyAccess(companyId),
    prisma.user.count({ where: { companyId, role: "RECRUITER", isActive: true } }),
    getCurrency(),
    prisma.jobOpening.count({ where: { companyId, status: "OPEN" } }),
    pipelineCount(prisma, companyId),
    hiringReport(prisma, { companyId }, tools.reportDefaultDays),
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

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Company" value={company?.name ?? "-"} hint={company?.city ?? undefined} />
        <Stat label="Plan" value={planName} hint={hint} />
        <Stat label="Active recruiters" value={recruiterCount} />
        <Stat label="Open job openings" value={openOpenings} />
        <Stat label="Candidates in the pipeline" value={pipeline} hint="Shortlisted to offered" />
        <Stat label="Hires" value={hiring.timeToHire.hires} hint={`Last ${tools.reportDefaultDays} days`} />
      </div>

      <div className="mt-6"><HiringSection data={hiring} days={tools.reportDefaultDays} who="Your company" /></div>
      <p className="mt-2 text-sm"><Link href="/company-admin/reports" className="text-brand-700 underline">More in Reports</Link></p>

      <ModuleGrid role="COMPANY_ADMIN" />
    </div>
  );
}

import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import ModuleGrid from "@/components/ModuleGrid";
import Stat from "@/components/Stat";
import { BarList, ColumnChart } from "@/components/charts/charts";
import { getSetting } from "@/lib/settings";
import { daysAgo } from "@/lib/dates";
import { candidatesByCity, quartileDistribution, REAL_CANDIDATES } from "@/lib/reports/candidates";

export default async function PlatformAdminDashboard() {
  const session = await auth();
  const tools = await getSetting("recruiterTools");
  const since = daysAgo(tools.reportDefaultDays);

  const [candidates, companies, recruiters, activeSubscriptions, hires, cities, iq] = await Promise.all([
    prisma.candidateProfile.count({ where: REAL_CANDIDATES }),
    prisma.company.count(),
    prisma.user.count({ where: { role: "RECRUITER" } }),
    prisma.subscription.count({ where: { status: { in: ["ACTIVE", "TRIALING"] }, OR: [{ endDate: null }, { endDate: { gt: daysAgo(0) } }] } }),
    prisma.shortlistStatusHistory.count({ where: { status: "HIRED", changedAt: { gte: since } } }),
    candidatesByCity(prisma, REAL_CANDIDATES, 6),
    quartileDistribution(prisma, "IQ"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Welcome, {session?.user.name}</h1>
      <p className="mt-1 text-zinc-600">Platform health and activity.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Candidates" value={candidates} />
        <Stat label="Companies" value={companies} />
        <Stat label="Recruiters" value={recruiters} />
        <Stat label="Active subscriptions" value={activeSubscriptions} />
        <Stat label="Hires" value={hires} hint={`Last ${tools.reportDefaultDays} days`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarList title="Candidates by city" data={cities} testId="dashboard-cities" />
        <ColumnChart title="IQ: quartile distribution" hint="Latest result of each candidate" labels={iq.map((s) => s.label)} series={[{ name: "IQ", color: "var(--color-brand-600)", values: iq.map((s) => s.value) }]} testId="dashboard-iq" />
      </div>
      <p className="mt-2 text-sm"><Link href="/admin/reports" className="text-brand-700 underline">More in Reports</Link></p>

      <ModuleGrid role="PLATFORM_ADMIN" />
    </div>
  );
}

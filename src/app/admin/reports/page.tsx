import { prisma } from "@/lib/prisma";
import { getCurrency, getSetting } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import Stat from "@/components/Stat";
import { BarList, ColumnChart } from "@/components/charts/charts";
import { CandidateSection, HiringSection, PeriodPicker, readDays } from "@/components/reports/Panels";
import { REAL_CANDIDATES } from "@/lib/reports/candidates";
import { hiringReport } from "@/lib/reports/hiring";
import { platformReport } from "@/lib/reports/platform";
import { poolReport } from "@/lib/reports/pool";
import { OPENING_STATUS_LABELS } from "@/lib/recruiter/openings";

/** Platform-wide report: who the candidates are, how hiring is going on the platform, and the money. */
export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tools = await getSetting("recruiterTools");
  const days = readDays((await searchParams).days, tools.reportDefaultDays);
  const currency = await getCurrency();
  const money = (n: number) => formatMoney(n, currency);

  const [pool, hiring, platform, candidates, companies] = await Promise.all([
    poolReport(prisma, REAL_CANDIDATES),
    hiringReport(prisma, {}, days),
    platformReport(prisma, days),
    prisma.candidateProfile.count({ where: REAL_CANDIDATES }),
    prisma.company.count(),
  ]);
  const revenueTotal = platform.revenue.reduce((a, r) => a + r.subscriptions + r.courses, 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Reports</h1>
      <p className="mt-1 text-zinc-600">The whole platform: candidates, hiring and revenue.</p>
      <PeriodPicker base="/admin/reports" days={days} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Candidates" value={candidates} hint="Deleted accounts are not counted" />
        <Stat label="Companies" value={companies} />
        <Stat label="Hires" value={hiring.timeToHire.hires} hint={hiring.timeToHire.averageDays !== null ? `${hiring.timeToHire.averageDays} days to hire on average` : `Last ${days} days`} />
        <Stat label="Revenue" value={money(revenueTotal)} hint="Successful payments in this period (simulated in demo mode)" />
      </div>

      <h2 className="mt-8 text-lg font-semibold text-zinc-900">Hiring on the platform</h2>
      <div className="mt-3"><HiringSection data={hiring} days={days} who="All companies" /></div>

      <h2 className="mt-8 text-lg font-semibold text-zinc-900">Money and growth</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ColumnChart
          title="Revenue by month"
          hint={`Successful payments, ${currency.code}`}
          labels={platform.revenue.map((r) => r.label)}
          series={[
            { name: "Subscriptions", color: "var(--color-brand-600)", values: platform.revenue.map((r) => r.subscriptions) },
            { name: "Courses", color: "var(--color-brand-900)", values: platform.revenue.map((r) => r.courses) },
          ]}
          empty="No payments in this period."
          testId="revenue"
          format={(n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))}
        />
        <BarList title="Companies by plan" data={platform.plans} empty="No active subscriptions." testId="by-plan" />
        <ColumnChart title="New candidates" hint={`Per ${days > 120 ? "month" : "week"}`} labels={platform.candidateSignups.map((b) => b.label)} series={[{ name: "Candidates", color: "var(--color-brand-600)", values: platform.candidateSignups.map((b) => b.count) }]} empty="No sign-ups in this period." testId="candidate-signups" />
        <ColumnChart title="New companies" hint={`Per ${days > 120 ? "month" : "week"}`} labels={platform.companySignups.map((b) => b.label)} series={[{ name: "Companies", color: "var(--color-brand-900)", values: platform.companySignups.map((b) => b.count) }]} empty="No new companies in this period." testId="company-signups" />
        <BarList title="Job openings by status" data={platform.openings.map((o) => ({ label: OPENING_STATUS_LABELS[o.label as keyof typeof OPENING_STATUS_LABELS] ?? o.label, value: o.value }))} empty="No job openings yet." testId="openings" />
      </div>

      <CandidateSection title="Candidates" city={pool.city} role={pool.role} quartiles={pool.quartiles} />
    </div>
  );
}

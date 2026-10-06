import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrency, getSetting } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { getCompanyAccess } from "@/lib/companyPlan";
import Stat from "@/components/Stat";
import AssignPlanForm from "./AssignPlanForm";

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      users: { orderBy: [{ role: "asc" }, { name: "asc" }], select: { id: true, name: true, email: true, role: true, isActive: true } },
      subscriptions: { orderBy: { startDate: "desc" }, include: { plan: { select: { name: true } } }, take: 20 },
      payments: { orderBy: { createdAt: "desc" }, take: 20, include: { plan: { select: { name: true } } } },
    },
  });
  if (!company) notFound();
  const [plans, currency, billing, openings, pipeline, hires] = await Promise.all([
    prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    getCurrency(),
    getSetting("billing"),
    prisma.jobOpening.count({ where: { companyId: id, status: "OPEN" } }),
    prisma.shortlist.count({ where: { recruiter: { companyId: id }, status: { notIn: ["HIRED", "REJECTED"] } } }),
    prisma.shortlistStatusHistory.count({ where: { status: "HIRED", shortlist: { recruiter: { companyId: id } } } }),
  ]);
  const access = await getCompanyAccess(id);

  return (
    <div className="max-w-4xl">
      <Link href="/admin/companies" className="text-sm text-brand-700 underline">&larr; Companies</Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900" data-testid="company-name">{company.name}</h1>
      <p className="mt-1 text-zinc-600">{[company.industry, company.city].filter(Boolean).join(" · ") || "No industry or city given"} · joined {fmt(company.createdAt)}</p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Stat label="Plan" value={access.plan?.name ?? (access.state === "ended" ? "Ended" : "None")} hint={access.endsAt ? `until ${fmt(access.endsAt)}` : undefined} />
        <Stat label="Open job openings" value={openings} />
        <Stat label="In the pipeline" value={pipeline} />
        <Stat label="Hires" value={hires} />
      </div>

      <h2 className="mt-8 text-lg font-semibold text-zinc-900">Give a plan</h2>
      <p className="mt-1 text-sm text-zinc-600">Replaces the current plan straight away, with no payment. Use it for pilots and goodwill extensions; it is recorded in the audit log.</p>
      <div className="mt-3"><AssignPlanForm companyId={company.id} plans={plans.map((p) => ({ code: p.code, name: p.name }))} defaultDays={billing.periodDays} /></div>

      <h2 className="mt-8 text-lg font-semibold text-zinc-900">Team</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[30rem] text-left text-sm" data-testid="company-users">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500"><tr><th className="px-3 py-3">Name</th><th className="px-3 py-3">Email</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Status</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {company.users.map((u) => (
              <tr key={u.id}><td className="px-3 py-3">{u.name ?? "-"}</td><td className="px-3 py-3">{u.email}</td><td className="px-3 py-3">{u.role === "COMPANY_ADMIN" ? "Company admin" : "Recruiter"}</td><td className="px-3 py-3">{u.isActive ? "Active" : "Deactivated"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-zinc-900">Plan history</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[30rem] text-left text-sm" data-testid="company-subscriptions">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500"><tr><th className="px-3 py-3">Plan</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">From</th><th className="px-3 py-3">To</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {company.subscriptions.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-zinc-600">No plans yet.</td></tr>}
            {company.subscriptions.map((s) => <tr key={s.id}><td className="px-3 py-3">{s.plan.name}</td><td className="px-3 py-3">{s.status.toLowerCase()}</td><td className="px-3 py-3">{fmt(s.startDate)}</td><td className="px-3 py-3">{s.endDate ? fmt(s.endDate) : "-"}</td></tr>)}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-zinc-900">Payments</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500"><tr><th className="px-3 py-3">Date</th><th className="px-3 py-3">Plan</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Status</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {company.payments.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-zinc-600">No payments yet.</td></tr>}
            {company.payments.map((p) => <tr key={p.id}><td className="px-3 py-3">{fmt(p.createdAt)}</td><td className="px-3 py-3">{p.plan?.name ?? "-"}</td><td className="px-3 py-3 tabular-nums">{formatMoney(p.amount, { code: p.currency, locale: currency.locale })}</td><td className="px-3 py-3">{p.status.toLowerCase()}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

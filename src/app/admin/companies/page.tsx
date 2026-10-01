import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { describeAccess } from "@/lib/companyPlan";

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Every company on the platform with its plan, team and activity. */
export default async function CompaniesPage() {
  const companies = await prisma.company.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      subscriptions: { where: { status: { in: ["ACTIVE", "TRIALING"] } }, orderBy: { startDate: "desc" }, take: 1, include: { plan: true } },
      _count: { select: { users: true, jobOpenings: true } },
    },
  });
  const [recruiters, hires] = await Promise.all([
    prisma.user.groupBy({ by: ["companyId"], where: { role: "RECRUITER", isActive: true, companyId: { not: null } }, _count: { _all: true } }),
    prisma.shortlistStatusHistory.findMany({ where: { status: "HIRED" }, select: { shortlist: { select: { recruiter: { select: { companyId: true } } } } } }),
  ]);
  const recruitersBy = new Map(recruiters.map((r) => [r.companyId, r._count._all]));
  const hiresBy = new Map<string | null, number>();
  for (const h of hires) hiresBy.set(h.shortlist.recruiter.companyId, (hiresBy.get(h.shortlist.recruiter.companyId) ?? 0) + 1);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Companies</h1>
      <p className="mt-1 text-zinc-600">Every company on the platform. Open one to see its team, plan history and payments, or to give it a plan.</p>
      <div className="mt-5 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[48rem] text-left text-sm" data-testid="companies-table">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr><th className="px-3 py-3">Company</th><th className="px-3 py-3">Plan</th><th className="px-3 py-3">Recruiters</th><th className="px-3 py-3">Job openings</th><th className="px-3 py-3">Hires</th><th className="px-3 py-3">Joined</th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {companies.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-zinc-600">No companies yet.</td></tr>}
            {companies.map((c) => {
              const access = describeAccess(c.subscriptions[0] ?? null);
              return (
                <tr key={c.id} data-testid="company-row">
                  <td className="px-3 py-3"><Link href={`/admin/companies/${c.id}`} className="font-medium text-brand-700 underline">{c.name}</Link><p className="text-xs text-zinc-500">{[c.industry, c.city].filter(Boolean).join(" · ")}</p></td>
                  <td className="px-3 py-3">
                    {access.plan ? <><span className="font-medium">{access.plan.name}</span> <span className="badge ml-1 bg-zinc-100 text-zinc-700">{access.state === "trial" ? "Trial" : "Active"}</span><p className="text-xs text-zinc-500">{access.endsAt ? `until ${fmt(access.endsAt)}` : "no end date"}</p></> : <span className="text-zinc-500">{access.state === "ended" ? "Ended" : "No plan"}</span>}
                  </td>
                  <td className="px-3 py-3">{recruitersBy.get(c.id) ?? 0}</td>
                  <td className="px-3 py-3">{c._count.jobOpenings}</td>
                  <td className="px-3 py-3">{hiresBy.get(c.id) ?? 0}</td>
                  <td className="px-3 py-3">{fmt(c.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

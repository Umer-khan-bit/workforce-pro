import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { accessSummary } from "@/components/PlanStatus";
import { getCompanyAccess } from "@/lib/companyPlan";
import { formatMoney } from "@/lib/money";
import { getCurrency, getSetting } from "@/lib/settings";
import { quoteChange, type ChangeKind } from "@/lib/subscriptions";

type FeatureValue = boolean | number | null;

const KIND_LABEL: Record<ChangeKind, string> = { new: "Choose", upgrade: "Upgrade to", downgrade: "Switch to", renew: "Renew" };
const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const changed = raw.changed === "1";
  const session = await auth();
  const companyId = session!.user.companyId!;

  const [access, plans, features, currency, billing, payments] = await Promise.all([
    getCompanyAccess(companyId),
    prisma.plan.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.planFeature.findMany({ orderBy: { sortOrder: "asc" } }),
    getCurrency(),
    getSetting("billing"),
    prisma.payment.findMany({ where: { companyId }, include: { plan: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Subscription &amp; billing</h1>
      <p className="mt-1 text-zinc-600">Your current plan, and the plans you can switch to.</p>

      {changed && <p role="status" className="mt-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900" data-testid="plan-changed">Your plan has been updated.</p>}

      <section className="card mt-6" aria-labelledby="current-plan-h">
        <h2 id="current-plan-h" className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Current plan</h2>
        <p className="mt-2 text-xl font-semibold text-zinc-900" data-testid="current-plan">{access.plan?.name ?? (access.state === "ended" ? "Plan ended" : "No plan")}</p>
        <p className="mt-1 text-sm text-zinc-700">{accessSummary(access)}</p>
      </section>

      <h2 className="mt-8 text-lg font-semibold text-zinc-900">Plans</h2>
      <div className="mt-3 grid gap-5 lg:grid-cols-2">
        {plans.map((p) => {
          const values = p.features as Record<string, FeatureValue>;
          const quote = quoteChange({ access, plan: p, periodDays: billing.periodDays, prorate: billing.prorate === "yes" });
          return (
            <section key={p.id} className="card flex flex-col" aria-labelledby={`plan-${p.id}`} data-testid={`plan-${p.code}`}>
              <div className="flex items-start justify-between gap-3">
                <h3 id={`plan-${p.id}`} className="text-lg font-semibold text-zinc-900">{p.name}</h3>
                {access.plan?.id === p.id && <span className="badge bg-brand-50 text-brand-800">{access.state === "trial" ? "Your trial" : "Current"}</span>}
              </div>
              <p className="mt-1 text-2xl font-semibold text-zinc-900">
                {formatMoney(p.priceMonthly, currency)} <span className="text-sm font-normal text-zinc-500">per {billing.periodDays} days</span>
              </p>
              {p.description && <p className="mt-1 text-sm text-zinc-600">{p.description}</p>}
              <ul className="mt-4 flex flex-col gap-2 text-sm">
                {features.map((f) => {
                  const v = values[f.key];
                  const on = f.kind === "BOOLEAN" ? v === true : true;
                  const detail = f.kind === "LIMIT" ? (v === null ? "Unlimited" : `Up to ${v ?? 0}`) : null;
                  return (
                    <li key={f.key} className={on ? "text-zinc-900" : "text-zinc-400 line-through"}>
                      <span aria-hidden="true" className="mr-2">{on ? "✓" : "✕"}</span>
                      {f.kind === "LIMIT" ? `${f.label}: ` : ""}
                      {f.kind === "LIMIT" ? detail : f.label}
                      <span className="sr-only">{on ? " (included)" : " (not included)"}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-5">
                <Link href={`/company-admin/subscription/checkout?plan=${encodeURIComponent(p.code)}`} className="btn-primary" data-testid={`choose-${p.code}`}>
                  {quote.kind === "renew" ? "Renew" : `${KIND_LABEL[quote.kind]} ${p.name}`}
                  {quote.amountDue > 0 ? ` - ${formatMoney(quote.amountDue, currency)}` : " - free"}
                </Link>
              </div>
            </section>
          );
        })}
        {plans.length === 0 && <p className="card text-sm text-zinc-600">No plans are available right now.</p>}
      </div>

      <h2 className="mt-8 text-lg font-semibold text-zinc-900">Payments</h2>
      {payments.length === 0 ? (
        <p className="card mt-3 text-sm text-zinc-700">No payments yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[34rem] text-left text-sm" data-testid="company-payments">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500"><tr><th className="px-3 py-3">Date</th><th className="px-3 py-3">Plan</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Reference</th></tr></thead>
            <tbody className="divide-y divide-zinc-100">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-3">{fmt(p.createdAt)}</td>
                  <td className="px-3 py-3">{p.plan?.name ?? "-"}</td>
                  <td className="px-3 py-3 tabular-nums">{formatMoney(p.amount, { code: p.currency, locale: currency.locale })}</td>
                  <td className="px-3 py-3">{p.status === "SUCCESS" ? <span className="badge bg-green-50 text-green-800">Paid</span> : p.status === "FAILED" ? <span className="badge bg-red-50 text-red-700">Failed</span> : <span className="badge bg-zinc-100 text-zinc-700">{p.status.toLowerCase()}</span>}</td>
                  <td className="px-3 py-3 text-zinc-600">{p.providerReference ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

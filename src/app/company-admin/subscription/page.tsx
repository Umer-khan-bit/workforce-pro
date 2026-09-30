import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { accessSummary } from "@/components/PlanStatus";
import { getCompanyAccess } from "@/lib/companyPlan";
import { formatMoney } from "@/lib/money";
import { getCurrency } from "@/lib/settings";

type FeatureValue = boolean | number | null;

export default async function SubscriptionPage() {
  const session = await auth();
  const companyId = session!.user.companyId!;

  const [access, plans, features, currency] = await Promise.all([
    getCompanyAccess(companyId),
    prisma.plan.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.planFeature.findMany({ orderBy: { sortOrder: "asc" } }),
    getCurrency(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Subscription &amp; billing</h1>
      <p className="mt-1 text-zinc-600">Your current plan, and the plans you can upgrade to.</p>

      <section className="card mt-6" aria-labelledby="current-plan-h">
        <h2 id="current-plan-h" className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Current plan</h2>
        <p className="mt-2 text-xl font-semibold text-zinc-900">{access.plan?.name ?? (access.state === "ended" ? "Plan ended" : "No plan")}</p>
        <p className="mt-1 text-sm text-zinc-700">{accessSummary(access)}</p>
      </section>

      <h2 className="mt-8 text-lg font-semibold text-zinc-900">Upgrade plan</h2>
      <div className="mt-3 grid gap-5 lg:grid-cols-2">
        {plans.map((p) => {
          const values = p.features as Record<string, FeatureValue>;
          const isCurrent = access.plan?.id === p.id && access.state === "active";
          return (
            <section key={p.id} className="card flex flex-col" aria-labelledby={`plan-${p.id}`}>
              <div className="flex items-start justify-between gap-3">
                <h3 id={`plan-${p.id}`} className="text-lg font-semibold text-zinc-900">{p.name}</h3>
                {access.plan?.id === p.id && <span className="badge bg-brand-50 text-brand-800">{access.state === "trial" ? "Your trial" : "Current"}</span>}
              </div>
              <p className="mt-1 text-2xl font-semibold text-zinc-900">
                {formatMoney(p.priceMonthly, currency)} <span className="text-sm font-normal text-zinc-500">per month</span>
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
                <button type="button" disabled className="btn-primary" aria-describedby="checkout-note">
                  {isCurrent ? "Your current plan" : `Choose ${p.name}`}
                </button>
              </div>
            </section>
          );
        })}
        {plans.length === 0 && <p className="card text-sm text-zinc-600">No plans are available right now.</p>}
      </div>
      <p id="checkout-note" className="mt-4 text-sm text-zinc-600">
        Online checkout (with a simulated payment in demo mode) is coming in a later build. Until then, contact the platform team to change plans.
      </p>
    </div>
  );
}

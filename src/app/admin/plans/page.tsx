import { prisma } from "@/lib/prisma";
import { getCurrency } from "@/lib/settings";
import PlansManager, { type FeatureDef, type PlanRow } from "./PlansManager";

export default async function PlansPage() {
  const [plans, features, counts, currency] = await Promise.all([
    prisma.plan.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.planFeature.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.subscription.groupBy({ by: ["planId"], _count: { _all: true } }),
    getCurrency(),
  ]);

  const rows: PlanRow[] = plans.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    priceMonthly: p.priceMonthly,
    isActive: p.isActive,
    sortOrder: p.sortOrder,
    features: p.features as PlanRow["features"],
    subscriptions: counts.find((c) => c.planId === p.id)?._count._all ?? 0,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Plans &amp; subscriptions</h1>
      <p className="mt-1 text-zinc-600">
        Create plans, set prices and choose what each plan includes. What a company can do is decided
        by these features, not by the plan&apos;s name.
      </p>
      <PlansManager
        plans={rows}
        features={features.map<FeatureDef>((f) => ({ key: f.key, label: f.label, description: f.description, kind: f.kind }))}
        currencyCode={currency.code}
      />
    </div>
  );
}

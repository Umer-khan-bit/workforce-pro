import type { Plan, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

export type CompanyAccess = {
  /** The plan the company can use right now, or null (none yet, or it has run out). */
  plan: Plan | null;
  status: SubscriptionStatus | null;
  endsAt: Date | null;
  /** active = paid plan, trial = free trial, ended = a plan that has run out, none = never had one. */
  state: "active" | "trial" | "ended" | "none";
  /** Whole days left on a plan that ends (rounded up); null when it has no end date. */
  daysLeft: number | null;
};

export function describeAccess(
  subscription: { status: SubscriptionStatus; endDate: Date | null; plan: Plan } | null,
  now = new Date()
): CompanyAccess {
  if (!subscription) return { plan: null, status: null, endsAt: null, state: "none", daysLeft: null };
  const ended = subscription.endDate !== null && subscription.endDate <= now;
  const daysLeft = subscription.endDate ? Math.max(0, Math.ceil((subscription.endDate.getTime() - now.getTime()) / DAY_MS)) : null;
  if (ended) return { plan: null, status: subscription.status, endsAt: subscription.endDate, state: "ended", daysLeft: 0 };
  return {
    plan: subscription.plan,
    status: subscription.status,
    endsAt: subscription.endDate,
    state: subscription.status === "TRIALING" ? "trial" : "active",
    daysLeft,
  };
}

/** What the company currently has: plan, free-trial state and days left. An ended plan gives no access. */
export async function getCompanyAccess(companyId: string): Promise<CompanyAccess> {
  const subscription = await prisma.subscription.findFirst({
    where: { companyId, status: { in: ["ACTIVE", "TRIALING"] } },
    orderBy: { startDate: "desc" },
    include: { plan: true },
  });
  return describeAccess(subscription);
}

/** The company's current plan (active or trialing, and not past its end date), or null. */
export async function getCompanyPlan(companyId: string) {
  const access = await getCompanyAccess(companyId);
  return access.plan ? { ...access.plan, endDate: access.endsAt, status: access.status } : null;
}

/** The feature values a company is entitled to. No plan, or an ended one, means no features. */
export async function getCompanyFeatures(companyId: string): Promise<unknown> {
  return (await getCompanyPlan(companyId))?.features ?? {};
}

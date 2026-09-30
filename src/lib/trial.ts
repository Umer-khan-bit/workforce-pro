import type { PrismaClient } from "@prisma/client";
import { readSetting } from "@/lib/settings/store";

/**
 * The subscription a brand-new company starts with, from Settings > Accounts & trials: the chosen
 * plan for the chosen number of free days. Returns null (no subscription) when trial days is 0, no
 * plan is chosen, or the chosen plan no longer exists or is switched off.
 */
export async function newCompanySubscription(
  db: Pick<PrismaClient, "siteSetting" | "plan">,
  now = new Date()
) {
  const accounts = await readSetting(db, "accounts");
  if (!accounts.defaultPlanCode || accounts.trialDays <= 0) return null;
  const plan = await db.plan.findUnique({ where: { code: accounts.defaultPlanCode } });
  if (!plan?.isActive) return null;
  return {
    planId: plan.id,
    status: "TRIALING" as const,
    startDate: now,
    endDate: new Date(now.getTime() + accounts.trialDays * 24 * 60 * 60 * 1000),
    autoRenew: false,
  };
}

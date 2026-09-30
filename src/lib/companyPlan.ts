import { prisma } from "@/lib/prisma";

/** The company's current (active or trialing) plan, or null if it has none. */
export async function getCompanyPlan(companyId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { companyId, status: { in: ["ACTIVE", "TRIALING"] } },
    orderBy: { startDate: "desc" },
    include: { plan: true },
  });
  return subscription ? { ...subscription.plan, endDate: subscription.endDate } : null;
}

/** The feature values a company is entitled to. No plan means no features. */
export async function getCompanyFeatures(companyId: string): Promise<unknown> {
  return (await getCompanyPlan(companyId))?.features ?? {};
}

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

export function formatPlanName(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase();
}

export function formatPkr(amount: number): string {
  return `PKR ${amount.toLocaleString("en-PK")}`;
}

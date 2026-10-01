import type { PrismaClient } from "@prisma/client";
import { bucketCounts } from "./hiring";
import type { Slice } from "./candidates";

type Db = Pick<PrismaClient, "payment" | "candidateProfile" | "company" | "subscription" | "jobOpening" | "user">;

/** Money taken per month from successful payments, split into subscriptions and courses; oldest month first. */
export function revenueByMonth(payments: { amount: number; createdAt: Date; purpose: "SUBSCRIPTION" | "COURSE" }[], months: number, now = new Date()) {
  const rows = Array.from({ length: months }, (_, i) => {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1));
    return { label: start.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }), start, subscriptions: 0, courses: 0 };
  });
  for (const p of payments) {
    for (let i = rows.length - 1; i >= 0; i--) {
      if (p.createdAt >= rows[i].start) {
        if (p.purpose === "SUBSCRIPTION") rows[i].subscriptions += p.amount;
        else rows[i].courses += p.amount;
        break;
      }
    }
  }
  return rows;
}

export async function platformReport(db: Db, days: number, now = new Date()) {
  const since = new Date(now.getTime() - days * 86_400_000);
  const months = Math.max(1, Math.ceil(days / 30));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const [payments, candidates, companies, subscriptions, openings] = await Promise.all([
    db.payment.findMany({ where: { status: "SUCCESS", createdAt: { gte: monthStart } }, select: { amount: true, createdAt: true, purpose: true } }),
    db.candidateProfile.findMany({ where: { anonymisedAt: null, createdAt: { gte: since } }, select: { createdAt: true } }),
    db.company.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    db.subscription.findMany({ where: { status: { in: ["ACTIVE", "TRIALING"] } }, include: { plan: { select: { name: true } } } }),
    db.jobOpening.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const byPlan = new Map<string, number>();
  for (const s of subscriptions.filter((x) => !x.endDate || x.endDate > now)) byPlan.set(s.plan.name, (byPlan.get(s.plan.name) ?? 0) + 1);
  const plans: Slice[] = [...byPlan.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  return {
    revenue: revenueByMonth(payments, months, now),
    candidateSignups: bucketCounts(candidates.map((c) => c.createdAt), days, now),
    companySignups: bucketCounts(companies.map((c) => c.createdAt), days, now),
    plans,
    openings: openings.map((o) => ({ label: o.status, value: o._count._all })),
  };
}

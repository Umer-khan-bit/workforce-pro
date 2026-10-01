import type { Plan, PrismaClient } from "@prisma/client";
import { getCompanyAccess, type CompanyAccess } from "@/lib/companyPlan";
import { notifyUser } from "@/lib/notifications";
import { getPaymentProvider, PaymentsUnavailableError, type PaymentProvider } from "@/lib/payments/provider";
import { readSetting } from "@/lib/settings/store";

export class BillingError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "BillingError";
  }
}

const DAY_MS = 86_400_000;
type Db = PrismaClient;

export type ChangeKind = "new" | "upgrade" | "downgrade" | "renew";

export type Quote = {
  kind: ChangeKind;
  plan: Plan;
  /** The plan's price for one period. */
  price: number;
  /** Value of the unused part of the current paid plan, taken off the price (0 when there is none). */
  credit: number;
  /** What the company pays now; 0 means the change is free (for example a downgrade covered by credit). */
  amountDue: number;
  periodDays: number;
  /** When the new plan will run until. */
  endsAt: Date;
};

/**
 * What changing to `plan` would cost, from the company's current access, the plan prices and the billing
 * settings. A trial gives no credit. Pure so it can be tested without a database.
 */
export function quoteChange(args: { access: CompanyAccess; plan: Plan; periodDays: number; prorate: boolean; now?: Date }): Quote {
  const { access, plan, periodDays, prorate } = args;
  const now = args.now ?? new Date();
  const current = access.plan;
  const paid = access.state === "active" && current !== null;

  let kind: ChangeKind = "new";
  if (current && current.id === plan.id) kind = paid ? "renew" : "new"; // converting a trial of this plan into a paid one
  else if (current) kind = plan.priceMonthly >= current.priceMonthly ? "upgrade" : "downgrade";

  let credit = 0;
  if (paid && kind !== "renew" && prorate && access.endsAt) {
    const left = Math.max(0, access.endsAt.getTime() - now.getTime());
    credit = Math.round(current!.priceMonthly * Math.min(1, left / (periodDays * DAY_MS)));
  }
  const amountDue = Math.max(0, plan.priceMonthly - credit);
  // Renewing a period that is not over yet adds a whole new period on top of what is left.
  const base = kind === "renew" && access.endsAt && access.endsAt > now ? access.endsAt : now;
  return { kind, plan, price: plan.priceMonthly, credit, amountDue, periodDays, endsAt: new Date(base.getTime() + periodDays * DAY_MS) };
}

export async function quoteForCompany(db: Db, companyId: string, planCode: string, now = new Date()): Promise<Quote> {
  const [plan, access, billing] = await Promise.all([db.plan.findUnique({ where: { code: planCode } }), getCompanyAccess(companyId), readSetting(db, "billing")]);
  if (!plan?.isActive) throw new BillingError(404, "PLAN_NOT_FOUND", "That plan is not available.");
  return quoteChange({ access, plan, periodDays: billing.periodDays, prorate: billing.prorate === "yes", now });
}

async function adminOf(db: Db, userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, isActive: true, companyId: true, company: { select: { name: true } } } });
  if (!u?.isActive || u.role !== "COMPANY_ADMIN" || !u.companyId) throw new BillingError(403, "FORBIDDEN", "Only a company admin can change the plan.");
  return { id: u.id, companyId: u.companyId, companyName: u.company?.name ?? "Your company" };
}

const dateText = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

async function tellCompanyAdmins(db: Db, companyId: string, templateKey: string, values: Record<string, string>, link: string) {
  const admins = await db.user.findMany({ where: { companyId, role: "COMPANY_ADMIN", isActive: true }, select: { id: true } });
  for (const a of admins) await notifyUser(db, { userId: a.id, templateKey, type: "GENERAL", values, link });
}

export type ChangeResult =
  | { status: "SUCCESS"; subscriptionId: string; paymentId: string | null; quote: Quote }
  | { status: "FAILED"; paymentId: string; reason: string; quote: Quote };

/**
 * Moves the company to a plan, taking payment through the provider (the simulated gateway in demo mode).
 * The new plan starts straight away for one billing period and replaces the old one. The Payment row is
 * written first and marked FAILED if the gateway declines, in which case the plan is left alone.
 */
export async function changePlan(db: Db, args: { userId: string; planCode: string; simulate?: "success" | "failure"; provider?: PaymentProvider; now?: Date }): Promise<ChangeResult> {
  const who = await adminOf(db, args.userId);
  const now = args.now ?? new Date();
  const quote = await quoteForCompany(db, who.companyId, args.planCode, now);

  let paymentId: string | null = null;
  if (quote.amountDue > 0) {
    let provider: PaymentProvider;
    try {
      provider = args.provider ?? getPaymentProvider();
    } catch (err) {
      if (err instanceof PaymentsUnavailableError) throw new BillingError(503, "PAYMENTS_UNAVAILABLE", err.message);
      throw err;
    }
    const currency = (await readSetting(db, "currency")).code;
    const payment = await db.payment.create({
      data: { purpose: "SUBSCRIPTION", companyId: who.companyId, planId: quote.plan.id, userId: who.id, amount: quote.amountDue, currency, status: "PENDING", provider: provider.name },
    });
    paymentId = payment.id;
    const charge = await provider.charge({ amount: quote.amountDue, currency, reference: payment.id, simulate: args.simulate });
    if (charge.status === "FAILED") {
      await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED", providerReference: charge.providerReference } });
      await db.auditLog.create({ data: { actorId: who.id, action: "SUBSCRIPTION_PAYMENT_FAILED", targetType: "Payment", targetId: payment.id, metadata: { planId: quote.plan.id } } });
      await tellCompanyAdmins(db, who.companyId, "PAYMENT_FAILED_IN_APP", { companyName: who.companyName, planName: quote.plan.name }, "/company-admin/subscription");
      return { status: "FAILED", paymentId: payment.id, reason: charge.failureReason ?? "The payment did not go through.", quote };
    }
    await db.payment.update({ where: { id: payment.id }, data: { providerReference: charge.providerReference } });
  }

  const subscription = await db.$transaction(async (tx) => {
    await tx.subscription.updateMany({ where: { companyId: who.companyId, status: { in: ["ACTIVE", "TRIALING"] } }, data: { status: "CANCELLED", endDate: now } });
    const created = await tx.subscription.create({ data: { companyId: who.companyId, planId: quote.plan.id, status: "ACTIVE", startDate: now, endDate: quote.endsAt, autoRenew: false } });
    if (paymentId) await tx.payment.update({ where: { id: paymentId }, data: { status: "SUCCESS", subscriptionId: created.id } });
    return created;
  });
  await db.auditLog.create({ data: { actorId: who.id, action: "SUBSCRIPTION_CHANGED", targetType: "Company", targetId: who.companyId, metadata: { kind: quote.kind, planId: quote.plan.id, amountDue: quote.amountDue, credit: quote.credit } } });
  await tellCompanyAdmins(db, who.companyId, "SUBSCRIPTION_CHANGED_IN_APP", { companyName: who.companyName, planName: quote.plan.name, endDate: dateText(quote.endsAt) }, "/company-admin/subscription");
  return { status: "SUCCESS", subscriptionId: subscription.id, paymentId, quote };
}

/** Platform admin: gives a company a plan for a number of days without a payment (for example a pilot or a goodwill extension). */
export async function assignPlan(db: Db, args: { actorId: string; companyId: string; planCode: string; days: number; now?: Date }) {
  const now = args.now ?? new Date();
  const [plan, company] = await Promise.all([db.plan.findUnique({ where: { code: args.planCode } }), db.company.findUnique({ where: { id: args.companyId }, select: { id: true, name: true } })]);
  if (!plan) throw new BillingError(404, "PLAN_NOT_FOUND", "Plan not found.");
  if (!company) throw new BillingError(404, "COMPANY_NOT_FOUND", "Company not found.");
  const endsAt = new Date(now.getTime() + args.days * DAY_MS);
  const subscription = await db.$transaction(async (tx) => {
    await tx.subscription.updateMany({ where: { companyId: company.id, status: { in: ["ACTIVE", "TRIALING"] } }, data: { status: "CANCELLED", endDate: now } });
    return tx.subscription.create({ data: { companyId: company.id, planId: plan.id, status: "ACTIVE", startDate: now, endDate: endsAt, autoRenew: false } });
  });
  await db.auditLog.create({ data: { actorId: args.actorId, action: "SUBSCRIPTION_ASSIGNED", targetType: "Company", targetId: company.id, metadata: { planId: plan.id, days: args.days } } });
  await tellCompanyAdmins(db, company.id, "SUBSCRIPTION_CHANGED_IN_APP", { companyName: company.name, planName: plan.name, endDate: dateText(endsAt) }, "/company-admin/subscription");
  return subscription;
}

/**
 * Warns the company admins when the plan is about to end (Settings > Billing: how many days before). It is
 * called when a company admin opens their dashboard, and warns once per subscription, not on every visit.
 */
export async function warnIfExpiring(db: Db, companyId: string): Promise<boolean> {
  const [billing, access] = await Promise.all([readSetting(db, "billing"), getCompanyAccess(companyId)]);
  if (billing.expiryWarningDays <= 0 || !access.plan || access.daysLeft === null || access.endsAt === null || access.daysLeft > billing.expiryWarningDays) return false;
  const subscription = await db.subscription.findFirst({ where: { companyId, status: { in: ["ACTIVE", "TRIALING"] } }, orderBy: { startDate: "desc" }, select: { startDate: true } });
  const company = await db.company.findUnique({ where: { id: companyId }, select: { name: true } });
  const admins = await db.user.findMany({ where: { companyId, role: "COMPANY_ADMIN", isActive: true }, select: { id: true } });
  let sent = false;
  for (const a of admins) {
    const already = await db.notification.count({ where: { userId: a.id, type: "SUBSCRIPTION_EXPIRING", createdAt: { gt: subscription?.startDate ?? new Date(0) } } });
    if (already > 0) continue;
    const ok = await notifyUser(db, {
      userId: a.id,
      templateKey: "SUBSCRIPTION_EXPIRING_IN_APP",
      type: "SUBSCRIPTION_EXPIRING",
      values: { companyName: company?.name ?? "Your company", planName: access.plan.name, endDate: dateText(access.endsAt) },
      link: "/company-admin/subscription",
    });
    sent = ok || sent;
  }
  return sent;
}

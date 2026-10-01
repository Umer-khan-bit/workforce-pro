import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Plan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCompanyAccess, type CompanyAccess } from "@/lib/companyPlan";
import { SimulatedPaymentProvider, type PaymentProvider } from "@/lib/payments/provider";
import { createCompany, type World } from "@/lib/recruiter/testWorld";
import { assignPlan, changePlan, quoteChange, warnIfExpiring } from "./subscriptions";

const DAY = 86_400_000;
const now = new Date("2026-10-10T10:00:00Z");
const plan = (id: string, priceMonthly: number): Plan => ({ id, code: id, name: id, description: null, features: {}, priceMonthly, isActive: true, sortOrder: 1, createdAt: now });
const basic = plan("basic", 15_000);
const advanced = plan("advanced", 40_000);
const access = (state: CompanyAccess["state"], p: Plan | null, endsInDays: number | null): CompanyAccess => ({ plan: p, status: state === "trial" ? "TRIALING" : state === "active" ? "ACTIVE" : null, endsAt: endsInDays === null ? null : new Date(now.getTime() + endsInDays * DAY), state, daysLeft: endsInDays });
const q = (a: CompanyAccess, p: Plan, over: { prorate?: boolean } = {}) => quoteChange({ access: a, plan: p, periodDays: 30, prorate: over.prorate ?? true, now });

describe("quoteChange (pure)", () => {
  it("a company with no plan pays the full price, from now", () => {
    const r = q(access("none", null, null), basic);
    expect(r).toMatchObject({ kind: "new", price: 15_000, credit: 0, amountDue: 15_000 });
    expect(r.endsAt.getTime()).toBe(now.getTime() + 30 * DAY);
  });

  it("a trial gives no credit, and starting the paid plan costs the full price", () => {
    expect(q(access("trial", basic, 5), advanced)).toMatchObject({ kind: "upgrade", credit: 0, amountDue: 40_000 });
    expect(q(access("trial", basic, 5), basic)).toMatchObject({ kind: "new", credit: 0, amountDue: 15_000 });
  });

  it("an upgrade credits the unused part of the current paid plan", () => {
    const r = q(access("active", basic, 15), advanced); // half of the period left
    expect(r).toMatchObject({ kind: "upgrade", credit: 7_500, amountDue: 32_500 });
  });

  it("a downgrade is covered by credit when little has been used", () => {
    const r = q(access("active", advanced, 30), basic);
    expect(r).toMatchObject({ kind: "downgrade", credit: 40_000, amountDue: 0 });
    expect(q(access("active", advanced, 6), basic)).toMatchObject({ kind: "downgrade", credit: 8_000, amountDue: 7_000 });
  });

  it("renewing the same plan costs the full price and adds a whole period after what is left", () => {
    const r = q(access("active", basic, 10), basic);
    expect(r).toMatchObject({ kind: "renew", credit: 0, amountDue: 15_000 });
    expect(r.endsAt.getTime()).toBe(now.getTime() + 40 * DAY);
  });

  it("no credit when proration is switched off, and a plan that ended is treated as new", () => {
    expect(q(access("active", basic, 15), advanced, { prorate: false })).toMatchObject({ credit: 0, amountDue: 40_000 });
    expect(q(access("ended", null, 0), advanced)).toMatchObject({ kind: "new", amountDue: 40_000 });
  });

  it("credit never goes above one period, and the amount due never goes below zero", () => {
    expect(q(access("active", advanced, 400), basic)).toMatchObject({ credit: 40_000, amountDue: 0 });
  });
});

const dbUp = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);

describe.skipIf(!dbUp)("changing plan (real database)", () => {
  let cheap: Plan;
  let dear: Plan;
  const worlds: World[] = [];
  const tag = `sub${Date.now().toString(36)}`;
  const provider = new SimulatedPaymentProvider();

  beforeAll(async () => {
    const seed = await createCompany(prisma, `${tag}p`, { features: null }); // only to make two plans
    worlds.push(seed);
    cheap = await seed.addPlan("cheap", { allCandidates: true, maxShortlists: 5, maxJobOpenings: 1 }, 10_000);
    dear = await seed.addPlan("dear", { allCandidates: true, q1Exclusive: true, aiSearch: true, maxShortlists: null, maxJobOpenings: null }, 30_000);
  }, 30_000);
  afterAll(async () => {
    for (const w of worlds.reverse()) await w.cleanup();
  }, 30_000);

  async function company(suffix: string, start?: { plan: Plan; days: number; status?: "ACTIVE" | "TRIALING" }) {
    const w = await createCompany(prisma, `${tag}${suffix}`, { features: null });
    worlds.push(w);
    if (start) await w.subscribe(start.plan.id, start.days, start.status ?? "ACTIVE");
    return w;
  }
  const subs = (companyId: string) => prisma.subscription.findMany({ where: { companyId }, orderBy: { startDate: "asc" } });

  it("a new company pays, gets the plan for a period, and the payment is linked to the subscription", async () => {
    const w = await company("a");
    const r = await changePlan(prisma, { userId: w.admin.id, planCode: cheap.code, provider });
    expect(r.status).toBe("SUCCESS");
    if (r.status !== "SUCCESS") return;
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: r.subscriptionId } });
    expect(sub).toMatchObject({ status: "ACTIVE", planId: cheap.id });
    expect(sub.endDate!.getTime() - sub.startDate.getTime()).toBe(30 * DAY);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: r.paymentId! } });
    expect(payment).toMatchObject({ purpose: "SUBSCRIPTION", status: "SUCCESS", amount: 10_000, companyId: w.company.id, planId: cheap.id, userId: w.admin.id, subscriptionId: sub.id, provider: "simulated" });
    expect(payment.providerReference).toMatch(/^SIM-/);
    expect((await getCompanyAccess(w.company.id)).plan?.id).toBe(cheap.id);
    expect(await prisma.auditLog.count({ where: { actorId: w.admin.id, action: "SUBSCRIPTION_CHANGED" } })).toBe(1);
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: w.admin.id, title: { contains: "is now on" } } });
    expect(note.link).toBe("/company-admin/subscription");
  });

  it("an upgrade charges the difference after credit, and replaces the old plan at once", async () => {
    const w = await company("b", { plan: cheap, days: 15 });
    const r = await changePlan(prisma, { userId: w.admin.id, planCode: dear.code, provider });
    expect(r.status).toBe("SUCCESS");
    if (r.status !== "SUCCESS") return;
    expect(r.quote.kind).toBe("upgrade");
    expect(r.quote.credit).toBeGreaterThan(4_900);
    expect(r.quote.amountDue).toBe(30_000 - r.quote.credit);
    const all = await subs(w.company.id);
    expect(all.map((s) => [s.planId, s.status])).toEqual([[cheap.id, "CANCELLED"], [dear.id, "ACTIVE"]]);
    expect((await getCompanyAccess(w.company.id)).plan?.id).toBe(dear.id);
  });

  it("a downgrade covered by credit is free: no payment row, but the plan changes", async () => {
    const w = await company("c", { plan: dear, days: 30 });
    const r = await changePlan(prisma, { userId: w.admin.id, planCode: cheap.code, provider });
    expect(r).toMatchObject({ status: "SUCCESS", paymentId: null });
    expect(await prisma.payment.count({ where: { companyId: w.company.id } })).toBe(0);
    expect((await getCompanyAccess(w.company.id)).plan?.id).toBe(cheap.id);
  });

  it("a failed payment is recorded, tells the admin, and leaves the plan alone", async () => {
    const w = await company("d", { plan: cheap, days: 20 });
    const r = await changePlan(prisma, { userId: w.admin.id, planCode: dear.code, provider, simulate: "failure" });
    expect(r.status).toBe("FAILED");
    expect((await getCompanyAccess(w.company.id)).plan?.id).toBe(cheap.id);
    expect((await subs(w.company.id)).map((s) => s.status)).toEqual(["ACTIVE"]);
    const payment = await prisma.payment.findFirstOrThrow({ where: { companyId: w.company.id } });
    expect(payment).toMatchObject({ status: "FAILED", subscriptionId: null, planId: dear.id });
    expect(await prisma.notification.count({ where: { userId: w.admin.id, title: { contains: "failed" } } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { actorId: w.admin.id, action: "SUBSCRIPTION_PAYMENT_FAILED" } })).toBe(1);

    // Trying again works and there is still only one active plan.
    expect((await changePlan(prisma, { userId: w.admin.id, planCode: dear.code, provider })).status).toBe("SUCCESS");
    expect((await prisma.subscription.count({ where: { companyId: w.company.id, status: "ACTIVE" } }))).toBe(1);
  });

  it("converts a trial into a paid plan, and renews a paid plan by adding a period", async () => {
    const w = await company("e", { plan: cheap, days: 5, status: "TRIALING" });
    const first = await changePlan(prisma, { userId: w.admin.id, planCode: cheap.code, provider });
    expect(first).toMatchObject({ status: "SUCCESS" });
    if (first.status !== "SUCCESS") return;
    expect(first.quote).toMatchObject({ kind: "new", amountDue: 10_000 });
    const second = await changePlan(prisma, { userId: w.admin.id, planCode: cheap.code, provider });
    if (second.status !== "SUCCESS") throw new Error("renew failed");
    expect(second.quote.kind).toBe("renew");
    const active = await prisma.subscription.findFirstOrThrow({ where: { companyId: w.company.id, status: "ACTIVE" } });
    expect(Math.round((active.endDate!.getTime() - Date.now()) / DAY)).toBe(60);
  });

  it("is for the company admin only, needs a real plan, and does not charge when payments are unavailable", async () => {
    const w = await company("f");
    await expect(changePlan(prisma, { userId: w.recruiter.id, planCode: cheap.code, provider })).rejects.toMatchObject({ status: 403 });
    await expect(changePlan(prisma, { userId: w.admin.id, planCode: "no-such-plan", provider })).rejects.toMatchObject({ status: 404 });
    const prev = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "false";
    try {
      await expect(changePlan(prisma, { userId: w.admin.id, planCode: cheap.code })).rejects.toMatchObject({ status: 503, code: "PAYMENTS_UNAVAILABLE" });
    } finally {
      process.env.DEMO_MODE = prev;
    }
    expect(await prisma.payment.count({ where: { companyId: w.company.id } })).toBe(0);
    expect(await subs(w.company.id)).toHaveLength(0);
  });

  it("never reaches the gateway for a free change", async () => {
    const w = await company("g", { plan: dear, days: 30 });
    const charge = vi.fn();
    const spy: PaymentProvider = { name: "spy", charge };
    await changePlan(prisma, { userId: w.admin.id, planCode: cheap.code, provider: spy });
    expect(charge).not.toHaveBeenCalled();
  });

  it("the platform admin can give a plan without a payment, and the admins are told", async () => {
    const w = await company("h");
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "PLATFORM_ADMIN" } });
    const sub = await assignPlan(prisma, { actorId: admin.id, companyId: w.company.id, planCode: dear.code, days: 45 });
    expect(Math.round((sub.endDate!.getTime() - sub.startDate.getTime()) / DAY)).toBe(45);
    expect(await prisma.payment.count({ where: { companyId: w.company.id } })).toBe(0);
    expect((await getCompanyAccess(w.company.id)).plan?.id).toBe(dear.id);
    expect(await prisma.notification.count({ where: { userId: w.admin.id, title: { contains: "is now on" } } })).toBe(1);
    await prisma.auditLog.deleteMany({ where: { actorId: admin.id, action: "SUBSCRIPTION_ASSIGNED", targetId: w.company.id } });
    await expect(assignPlan(prisma, { actorId: admin.id, companyId: "missing", planCode: dear.code, days: 5 })).rejects.toMatchObject({ code: "COMPANY_NOT_FOUND" });
  });

  describe("expiry warning", () => {
    it("warns the admins once when the plan is about to end, and not before", async () => {
      const far = await company("i", { plan: cheap, days: 30 });
      expect(await warnIfExpiring(prisma, far.company.id)).toBe(false);

      const soon = await company("j", { plan: cheap, days: 3 });
      expect(await warnIfExpiring(prisma, soon.company.id)).toBe(true);
      const note = await prisma.notification.findFirstOrThrow({ where: { userId: soon.admin.id, type: "SUBSCRIPTION_EXPIRING" } });
      expect(note.title).toBe("Your plan is expiring");
      expect(await warnIfExpiring(prisma, soon.company.id)).toBe(false); // once per subscription
      expect(await prisma.notification.count({ where: { userId: soon.admin.id, type: "SUBSCRIPTION_EXPIRING" } })).toBe(1);
      expect(await prisma.notification.count({ where: { userId: soon.recruiter.id, type: "SUBSCRIPTION_EXPIRING" } })).toBe(0); // admins only
    });

    it("warns again for a new subscription, and never for a company with no plan", async () => {
      const w = await company("k", { plan: cheap, days: 2 });
      await warnIfExpiring(prisma, w.company.id);
      await new Promise((r) => setTimeout(r, 15));
      await w.subscribe(cheap.id, 2); // a fresh period that is also about to end
      expect(await warnIfExpiring(prisma, w.company.id)).toBe(true);
      const none = await company("l");
      expect(await warnIfExpiring(prisma, none.company.id)).toBe(false);
    });
  });
});

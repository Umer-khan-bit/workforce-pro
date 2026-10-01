import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/password";

/**
 * Test helper (not used by the app): a company with a plan, a company admin and a recruiter, so tests of the
 * hiring features can run against the real database without touching real data. `cleanup()` removes
 * everything it made; call it BEFORE the test kit's cleanup (job openings point at the kit's job role).
 */
export type PlanFeatureValues = { allCandidates?: boolean; q1Exclusive?: boolean; aiSearch?: boolean; atsApiAccess?: boolean; maxShortlists?: number | null; maxJobOpenings?: number | null };

export const ALL_ON: PlanFeatureValues = { allCandidates: true, q1Exclusive: true, aiSearch: true, atsApiAccess: true, maxShortlists: null, maxJobOpenings: null };

export type World = Awaited<ReturnType<typeof createCompany>>;

export async function createCompany(
  prisma: PrismaClient,
  tag: string,
  opts: { features?: PlanFeatureValues | null; price?: number; endsInDays?: number; status?: "ACTIVE" | "TRIALING" } = {}
) {
  const features = opts.features === undefined ? ALL_ON : opts.features;
  const company = await prisma.company.create({ data: { name: `World ${tag}`, city: "Lahore" } });
  const userIds: string[] = [];
  const planIds: string[] = [];

  const addUser = async (name: string, role: "RECRUITER" | "COMPANY_ADMIN", verified = true) => {
    const user = await prisma.user.create({
      data: { email: `${name}-${tag}@example.test`, name: `${name} ${tag}`, password: await hashPassword("x-pass-12345"), role, companyId: company.id, emailVerified: verified ? new Date() : null },
    });
    userIds.push(user.id);
    return user;
  };

  async function addPlan(suffix: string, planFeatures: PlanFeatureValues, price: number) {
    const plan = await prisma.plan.create({ data: { code: `plan-${tag}-${suffix}`, name: `Plan ${suffix} ${tag}`, priceMonthly: price, features: planFeatures, sortOrder: 900 } });
    planIds.push(plan.id);
    return plan;
  }

  async function subscribe(planId: string, endsInDays = 30, status: "ACTIVE" | "TRIALING" = "ACTIVE", startedDaysAgo = 0) {
    const start = new Date(Date.now() - startedDaysAgo * 86_400_000);
    return prisma.subscription.create({ data: { companyId: company.id, planId, status, startDate: start, endDate: new Date(Date.now() + endsInDays * 86_400_000), autoRenew: false } });
  }

  let plan = null as Awaited<ReturnType<typeof addPlan>> | null;
  if (features) {
    plan = await addPlan("main", features, opts.price ?? 1000);
    await subscribe(plan.id, opts.endsInDays ?? 30, opts.status ?? "ACTIVE");
  }

  const admin = await addUser("admin", "COMPANY_ADMIN");
  const recruiter = await addUser("recruiter", "RECRUITER");

  async function cleanup() {
    const shortlists = await prisma.shortlist.findMany({ where: { recruiter: { companyId: company.id } }, select: { id: true } });
    await prisma.shortlistStatusHistory.deleteMany({ where: { shortlistId: { in: shortlists.map((s) => s.id) } } });
    await prisma.shortlist.deleteMany({ where: { id: { in: shortlists.map((s) => s.id) } } });
    await prisma.atsExport.deleteMany({ where: { companyId: company.id } });
    await prisma.contactRequest.deleteMany({ where: { jobOpening: { companyId: company.id } } });
    await prisma.jobOpening.deleteMany({ where: { companyId: company.id } });
    await prisma.payment.deleteMany({ where: { companyId: company.id } });
    await prisma.subscription.deleteMany({ where: { companyId: company.id } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.rateLimitHit.deleteMany({ where: { OR: userIds.flatMap((id) => ["contact", "shortlist", "checkout", "ai-search", "candidate-report"].map((p) => ({ key: `${p}:${id}` }))) } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.delete({ where: { id: company.id } });
    await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
  }

  return { company, plan, admin, recruiter, addUser, addPlan, subscribe, cleanup, tag };
}

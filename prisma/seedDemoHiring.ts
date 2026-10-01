import type { PrismaClient, ShortlistStatus } from "@prisma/client";
import { seededRandom } from "../src/lib/testEngine/rng";
import { recruiterVisibleWhere } from "../src/lib/recruiter/candidateAccess";
import { isTopPerformer } from "../src/lib/results/topPerformer";
import { hasFeature, FEATURE_KEYS } from "../src/lib/planFeatures";
import { notifyUser } from "../src/lib/notifications";

/**
 * Demo hiring activity so recruiter, company and platform dashboards have something to show: job openings,
 * shortlists moving through the pipeline with dates over the last few months, contact requests (with the
 * candidate's answer), payment history for each company's plan, and a few notifications. Demo mode only,
 * and it does nothing if any job opening already exists.
 *
 * It follows the same rules as the app: candidates are only shortlisted or contacted when their minimum
 * salary fits the opening's offer, Top Performers only go to companies whose plan has exclusive Q1 access,
 * and a plan's shortlist limit is respected.
 */

const DAY = 86_400_000;
const DEMO_LOGIN = "candidate@demo.test";

type OpeningSeed = { role: string; status: "OPEN" | "PAUSED" | "FILLED"; title: string };

const PLAN: Record<string, OpeningSeed[]> = {
  "Karachi Tech Solutions": [
    { role: "IT Support", status: "OPEN", title: "IT support engineer" },
    { role: "Accountant", status: "OPEN", title: "Senior accountant" },
    { role: "Sales", status: "FILLED", title: "Sales executive" },
  ],
  "Lahore Retail Group": [
    { role: "Sales", status: "OPEN", title: "Store sales associate" },
    { role: "Customer Service", status: "OPEN", title: "Customer care agent" },
    { role: "Accountant", status: "PAUSED", title: "Accounts assistant" },
  ],
  "Islamabad Business Services": [
    { role: "Customer Service", status: "OPEN", title: "Call centre agent" },
    { role: "IT Support", status: "OPEN", title: "Helpdesk analyst" },
    { role: "Sales", status: "FILLED", title: "Business development executive" },
  ],
};

/** How far along the pipeline each shortlisted candidate got, in a repeating pattern (a realistic funnel). */
const OUTCOMES: Array<ShortlistStatus> = ["SHORTLISTED", "CONTACTED", "INTERVIEWING", "SHORTLISTED", "OFFERED", "HIRED", "CONTACTED", "REJECTED", "INTERVIEWING", "SHORTLISTED"];
const CHAIN: ShortlistStatus[] = ["SHORTLISTED", "CONTACTED", "INTERVIEWING", "OFFERED", "HIRED"];

export type DemoHiringSummary = { openings: number; shortlists: number; requests: number; payments: number };

export async function seedDemoHiring(prisma: PrismaClient): Promise<DemoHiringSummary> {
  if (process.env.DEMO_MODE !== "true") throw new Error("Refusing to create demo hiring data: DEMO_MODE is not 'true'.");
  if ((await prisma.jobOpening.count()) > 0) return { openings: 0, shortlists: 0, requests: 0, payments: 0 };

  const random = seededRandom(20261003);
  const now = Date.now();
  const roles = new Map((await prisma.jobRole.findMany()).map((r) => [r.name, r.id]));
  const bands = await prisma.experienceBand.findMany({ orderBy: { sortOrder: "asc" } });
  const midBand = bands[2] ?? bands[bands.length - 1];
  const currency = (await prisma.siteSetting.findUnique({ where: { key: "currency" } }))?.value as { code?: string } | undefined;
  const summary: DemoHiringSummary = { openings: 0, shortlists: 0, requests: 0, payments: 0 };

  for (const [companyName, plan] of Object.entries(PLAN)) {
    const company = await prisma.company.findFirst({ where: { name: companyName } });
    if (!company) continue;
    const staff = await prisma.user.findMany({ where: { companyId: company.id, isActive: true }, orderBy: { email: "asc" } });
    const recruiters = staff.filter((u) => u.role === "RECRUITER");
    const admin = staff.find((u) => u.role === "COMPANY_ADMIN");
    if (recruiters.length === 0) continue;
    const subscription = await prisma.subscription.findFirst({ where: { companyId: company.id, status: { in: ["ACTIVE", "TRIALING"] } }, orderBy: { startDate: "desc" }, include: { plan: true } });
    const q1Access = hasFeature(subscription?.plan.features, FEATURE_KEYS.Q1_EXCLUSIVE);
    const perOpening = q1Access ? 9 : 6; // keeps a Basic company inside its shortlist limit

    for (const [i, spec] of plan.entries()) {
      const jobRoleId = roles.get(spec.role);
      if (!jobRoleId) continue;
      const creator = recruiters[i % recruiters.length];
      const benchmark = await prisma.salaryBenchmark.findFirst({ where: { jobRoleId, city: company.city ?? "", experienceBandId: midBand.id } });
      const avg = benchmark?.avgSalary ?? 90_000;
      const maxOffer = Math.max(90_000, Math.round((avg * 1.15) / 5000) * 5000);
      const createdAt = new Date(now - (110 - i * 25 - Math.floor(random() * 10)) * DAY);
      const opening = await prisma.jobOpening.create({
        data: { companyId: company.id, createdById: creator.id, jobRoleId, title: spec.title, city: company.city, salaryRangeMin: Math.round((avg * 0.8) / 5000) * 5000, salaryRangeMax: maxOffer, status: spec.status, createdAt },
      });
      summary.openings++;
      if (admin) await notifyUser(prisma, { userId: admin.id, templateKey: "JOB_OPENING_CREATED_IN_APP", type: "GENERAL", values: { recruiterName: creator.name ?? "A recruiter", roleName: spec.role }, link: "/company-admin/job-openings" });

      // Candidates for this opening: right role, offer meets their minimum, and (without Q1 access) not Top Performers.
      const pool = await prisma.candidateProfile.findMany({
        where: { AND: [{ jobRoleId }, recruiterVisibleWhere(maxOffer)] },
        select: { id: true, userId: true, user: { select: { email: true, name: true } } },
        orderBy: { id: "asc" },
      });
      const eligible: typeof pool = [];
      for (const c of pool) {
        if (!q1Access && (await isTopPerformer(prisma, c.id))) continue;
        eligible.push(c);
      }
      const picked = eligible.sort(() => random() - 0.5).slice(0, perOpeningCount(perOpening, spec.status));

      for (const [k, cand] of picked.entries()) {
        const outcome = spec.status === "FILLED" && k === 0 ? "HIRED" : OUTCOMES[(k + i) % OUTCOMES.length];
        const recruiter = recruiters[(k + i) % recruiters.length];
        const start = new Date(createdAt.getTime() + (1 + Math.floor(random() * 12)) * DAY);
        if (start.getTime() > now - DAY) continue;

        // Walk the pipeline up to the outcome, a few days between each step, never into the future.
        const steps: { status: ShortlistStatus; at: Date }[] = [{ status: "SHORTLISTED", at: start }];
        let at = start.getTime();
        const target = outcome === "REJECTED" ? "INTERVIEWING" : outcome;
        for (const stage of CHAIN.slice(1, CHAIN.indexOf(target) + 1)) {
          at += (2 + Math.floor(random() * 9)) * DAY;
          if (at > now - 3_600_000) break;
          steps.push({ status: stage, at: new Date(at) });
        }
        if (outcome === "REJECTED") steps.push({ status: "REJECTED", at: new Date(Math.min(now - 3_600_000, at + 3 * DAY)) });
        const final = steps[steps.length - 1];

        const entry = await prisma.shortlist.create({
          data: { recruiterId: recruiter.id, candidateProfileId: cand.id, jobOpeningId: opening.id, status: final.status, createdAt: start, updatedAt: final.at, note: k % 4 === 0 ? "Strong results; follow up this week." : null },
        });
        await prisma.shortlistStatusHistory.createMany({ data: steps.map((s) => ({ shortlistId: entry.id, status: s.status, changedAt: s.at, changedById: recruiter.id })) });
        summary.shortlists++;

        // Anyone who got as far as "Contacted" has a contact request, and most have answered it.
        const contacted = steps.find((s) => s.status === "CONTACTED");
        if (contacted) {
          const reached = steps.some((s) => s.status === "INTERVIEWING");
          const status = reached ? "ACCEPTED" : final.status === "REJECTED" ? "DECLINED" : "SENT";
          await prisma.contactRequest.create({
            data: { recruiterId: recruiter.id, candidateProfileId: cand.id, jobOpeningId: opening.id, status, message: "We reviewed your assessment results and would like to talk about this role.", sentAt: contacted.at, respondedAt: status === "SENT" ? null : new Date(contacted.at.getTime() + DAY) },
          });
          summary.requests++;
          if (status === "ACCEPTED") await notifyUser(prisma, { userId: recruiter.id, templateKey: "CONTACT_REQUEST_ACCEPTED_IN_APP", type: "CONTACT_REQUEST", values: { candidateName: cand.user.name ?? "A candidate" }, link: "/recruiter/contact-requests" });
        }
        if (final.status === "HIRED" && admin) await notifyUser(prisma, { userId: admin.id, templateKey: "CANDIDATE_HIRED_IN_APP", type: "GENERAL", values: { recruiterName: recruiter.name ?? "A recruiter", roleName: spec.role }, link: "/company-admin/reports" });
      }

      // The demo candidate gets one request waiting for her answer (when the offer fits her minimum).
      if (spec.role === "Accountant" && spec.status === "OPEN") {
        const ayesha = await prisma.candidateProfile.findFirst({ where: { AND: [{ user: { email: DEMO_LOGIN } }, recruiterVisibleWhere(maxOffer)] }, select: { id: true } });
        if (ayesha && !(await prisma.contactRequest.findFirst({ where: { candidateProfileId: ayesha.id, jobOpeningId: opening.id } }))) {
          await prisma.contactRequest.create({ data: { recruiterId: creator.id, candidateProfileId: ayesha.id, jobOpeningId: opening.id, status: "SENT", message: "Your Accountant results stood out. Could we talk about this role?", sentAt: new Date(now - 2 * DAY) } });
          summary.requests++;
        }
      }
    }

    // Payment history for the company's plan: a successful payment each month, and one failed attempt for one company.
    if (subscription) {
      const months = companyName.startsWith("Islamabad") ? 2 : 3;
      for (let m = months; m >= 1; m--) {
        const at = new Date(now - m * 30 * DAY);
        await prisma.payment.create({
          data: { purpose: "SUBSCRIPTION", companyId: company.id, planId: subscription.planId, userId: admin?.id ?? null, subscriptionId: m === 1 ? subscription.id : null, amount: subscription.plan.priceMonthly, currency: currency?.code ?? "PKR", status: "SUCCESS", provider: "simulated", providerReference: `SIM-SEED${company.id.slice(-3).toUpperCase()}${m}`, createdAt: at },
        });
        summary.payments++;
      }
      if (companyName.startsWith("Islamabad")) {
        await prisma.payment.create({
          data: { purpose: "SUBSCRIPTION", companyId: company.id, planId: subscription.planId, userId: admin?.id ?? null, amount: subscription.plan.priceMonthly, currency: currency?.code ?? "PKR", status: "FAILED", provider: "simulated", providerReference: "SIM-SEEDFAIL", createdAt: new Date(now - 62 * DAY) },
        });
        summary.payments++;
      }
    }
  }
  return summary;
}

/** Filled openings had more candidates (one was hired); paused ones fewer. */
function perOpeningCount(base: number, status: "OPEN" | "PAUSED" | "FILLED"): number {
  return status === "FILLED" ? base + 1 : status === "PAUSED" ? Math.max(3, base - 3) : base;
}

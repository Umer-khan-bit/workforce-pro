import { Prisma, type PrismaClient, type TestType } from "@prisma/client";
import { recruiterVisibleWhere } from "@/lib/recruiter/candidateAccess";
import type { Entitlements } from "@/lib/recruiter/entitlements";
import { notifyUser } from "@/lib/notifications";
import { TEMPLATE_SEEDS } from "@/lib/messageTemplates";
import { isTopPerformer } from "@/lib/results/topPerformer";
import { TEST_TITLES } from "@/lib/testEngine/labels";

type Db = PrismaClient;

export const CONCERN_TEMPLATE = "INTEGRITY_CONCERN_REPORTED_IN_APP";
export const REASON_MAX = 500;

export class ConcernError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** The message template exists in every database, including ones that were set up before it was added (adding it is harmless if it is there). */
async function ensureTemplate(db: Db, key: string) {
  const seed = TEMPLATE_SEEDS.find((t) => t.key === key);
  if (seed) await db.messageTemplate.upsert({ where: { key }, update: {}, create: { ...seed } });
}

/**
 * A recruiter tells the platform admins that a candidate's test result looks doubtful. The same rules as the candidate report apply
 * (plan, Top Performer access, minimum salary against the offer), and anything that fails them answers "not available" like the report.
 * One result is shared by all companies, so this only puts it in front of the admins: they alone clear or void. A company can report the
 * same test result only once.
 */
export async function reportConcern(
  db: Db,
  args: { recruiterUserId: string; companyId: string; candidateProfileId: string; testType: TestType; reason: string; offerMax: number; entitlements: Pick<Entitlements, "canSearch" | "canSeeTopPerformers"> }
) {
  const notAvailable = new ConcernError(404, "NOT_AVAILABLE", "This candidate is not available.");
  const reason = args.reason.trim();
  if (reason.length === 0 || reason.length > REASON_MAX) throw new ConcernError(400, "BAD_REASON", `Write a short reason (up to ${REASON_MAX} characters).`);
  if (!args.entitlements.canSearch) throw notAvailable;

  const visible = await db.candidateProfile.findFirst({ where: { AND: [{ id: args.candidateProfileId }, recruiterVisibleWhere(args.offerMax)] }, select: { id: true } });
  if (!visible) throw notAvailable;
  if (!args.entitlements.canSeeTopPerformers && (await isTopPerformer(db, args.candidateProfileId))) throw notAvailable;

  // The result a recruiter sees is the candidate's latest one in that test (a voided result is not shown to anyone).
  const score = await db.score.findFirst({
    where: { candidateProfileId: args.candidateProfileId, testType: args.testType, voidedAt: null },
    orderBy: { computedAt: "desc" },
    select: { sessionId: true },
  });
  if (!score) throw notAvailable;

  let id: string;
  try {
    const created = await db.concernReport.create({
      data: { companyId: args.companyId, recruiterId: args.recruiterUserId, candidateProfileId: args.candidateProfileId, sessionId: score.sessionId, testType: args.testType, reason },
      select: { id: true },
    });
    id = created.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ConcernError(409, "ALREADY_REPORTED", "Your company has already reported this test result.");
    throw err;
  }
  await db.auditLog.create({
    data: { actorId: args.recruiterUserId, action: "CONCERN_REPORTED", targetType: "TestSession", targetId: score.sessionId, metadata: { companyId: args.companyId, testType: args.testType, reportId: id } },
  });

  // Tell every platform admin (never throws: the report is already saved).
  const [company, admins] = await Promise.all([
    db.company.findUnique({ where: { id: args.companyId }, select: { name: true } }),
    db.user.findMany({ where: { role: "PLATFORM_ADMIN", isActive: true }, select: { id: true } }),
  ]);
  await ensureTemplate(db, CONCERN_TEMPLATE);
  for (const admin of admins) {
    await notifyUser(db, { userId: admin.id, templateKey: CONCERN_TEMPLATE, type: "GENERAL", values: { companyName: company?.name ?? "A company", testName: TEST_TITLES[args.testType] }, link: "/admin/integrity-review" });
  }
  return { id };
}

export type ConcernRow = {
  id: string;
  company: string;
  recruiter: string;
  candidate: string;
  testType: TestType;
  reason: string;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
};

const SELECT = {
  id: true,
  testType: true,
  reason: true,
  createdAt: true,
  reviewedAt: true,
  company: { select: { name: true } },
  recruiter: { select: { name: true, email: true } },
  candidateProfile: { select: { user: { select: { name: true, email: true } } } },
  reviewedBy: { select: { name: true, email: true } },
} satisfies Prisma.ConcernReportSelect;

/** For the platform admin: the reports waiting to be looked at, and the latest reviewed ones. */
export async function listConcerns(db: Db): Promise<{ open: ConcernRow[]; reviewed: ConcernRow[] }> {
  const toRow = (r: Prisma.ConcernReportGetPayload<{ select: typeof SELECT }>): ConcernRow => ({
    id: r.id,
    company: r.company.name,
    recruiter: r.recruiter.name ?? r.recruiter.email,
    candidate: r.candidateProfile.user.name ?? r.candidateProfile.user.email,
    testType: r.testType,
    reason: r.reason,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
    reviewedBy: r.reviewedBy ? (r.reviewedBy.name ?? r.reviewedBy.email) : null,
  });
  const [open, reviewed] = await Promise.all([
    db.concernReport.findMany({ where: { reviewedAt: null }, orderBy: { createdAt: "desc" }, select: SELECT }),
    db.concernReport.findMany({ where: { reviewedAt: { not: null } }, orderBy: { reviewedAt: "desc" }, take: 20, select: SELECT }),
  ]);
  return { open: open.map(toRow), reviewed: reviewed.map(toRow) };
}

/** The platform admin marks a report as looked at. */
export async function markConcernReviewed(db: Db, adminId: string, id: string) {
  const report = await db.concernReport.findUnique({ where: { id }, select: { id: true, reviewedAt: true, sessionId: true, testType: true, companyId: true } });
  if (!report) throw new ConcernError(404, "NOT_FOUND", "Report not found.");
  if (report.reviewedAt) throw new ConcernError(409, "ALREADY_REVIEWED", "This report is already marked as reviewed.");
  await db.$transaction([
    db.concernReport.update({ where: { id }, data: { reviewedAt: new Date(), reviewedById: adminId } }),
    db.auditLog.create({ data: { actorId: adminId, action: "CONCERN_REVIEWED", targetType: "TestSession", targetId: report.sessionId, metadata: { reportId: id, companyId: report.companyId, testType: report.testType } } }),
  ]);
}

/** What one company has already reported about a candidate, by test result (session): only that company's own reports, never another company's. */
export async function ownReports(db: Pick<PrismaClient, "concernReport">, companyId: string, candidateProfileId: string): Promise<Map<string, Date>> {
  const rows = await db.concernReport.findMany({ where: { companyId, candidateProfileId }, select: { sessionId: true, createdAt: true } });
  return new Map(rows.map((r) => [r.sessionId, r.createdAt]));
}

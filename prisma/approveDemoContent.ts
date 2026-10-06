import { PrismaClient } from "@prisma/client";
import { bulkApprove } from "../src/lib/questionBank/bulkApprove";

/**
 * Demo mode: publishes the AI-written questions that the AI reviewer marked OK, so the demo candidate can take every test live.
 * Questions marked "Needs fixing" or "Reject" stay in Platform admin > Approvals for the demo. Only runs when a test has too few
 * approved questions, so it never approves anything twice, and is recorded in the audit log like a bulk approval by the admin.
 *
 *   npm run content:approve
 */
const MIN_APPROVED = 20;

export async function approveDemoContent(prisma: PrismaClient): Promise<number> {
  if (process.env.DEMO_MODE !== "true") throw new Error("Refusing to approve demo questions: DEMO_MODE is not 'true'.");
  const admin = await prisma.user.findFirst({ where: { role: "PLATFORM_ADMIN", email: process.env.SEED_ADMIN_EMAIL ?? undefined } }).then((u) => u ?? prisma.user.findFirst({ where: { role: "PLATFORM_ADMIN" } }));
  if (!admin) return 0;
  const pools = await prisma.question.groupBy({ by: ["testType", "jobRoleId"], where: { source: "AI_GENERATED", testType: { in: ["IQ", "EQ", "LANGUAGE", "SKILL"] } } });
  let total = 0;
  for (const pool of pools) {
    const approved = await prisma.question.count({ where: { testType: pool.testType, jobRoleId: pool.jobRoleId, status: "APPROVED" } });
    if (approved >= MIN_APPROVED) continue;
    const pending = await prisma.question.findMany({ where: { testType: pool.testType, jobRoleId: pool.jobRoleId, status: "PENDING_APPROVAL", source: "AI_GENERATED", reviewVerdict: "OK" }, select: { id: true } });
    if (pending.length === 0) continue;
    const { approvedIds, ...summary } = await bulkApprove(prisma, pending.map((q) => q.id), admin.id, false, false);
    await prisma.auditLog.create({ data: { actorId: admin.id, action: "QUESTIONS_BULK_APPROVED", targetType: "Question", metadata: { ...summary, includeFlagged: false, asPretest: false, ids: approvedIds, demoSeed: true } } });
    total += approvedIds.length;
  }
  return total;
}

if (process.argv[1]?.includes("approveDemoContent")) {
  const prisma = new PrismaClient();
  approveDemoContent(prisma)
    .then((n) => console.log(`Demo questions approved: ${n}`))
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

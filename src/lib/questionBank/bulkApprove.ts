import type { PrismaClient } from "@prisma/client";

export type BulkApproveResult = {
  approved: number;
  /** Pending questions the AI reviewer flagged (Needs fixing / Reject), left alone. */
  skippedFlagged: number;
  /** Ids that were not pending any more (already approved, rejected or retired). */
  skippedNotPending: number;
};

/**
 * Approves the chosen pending questions in one step. Questions the AI review marked NEEDS_FIX or
 * REJECT are skipped unless `includeFlagged` is set, so a bulk click cannot publish a problem
 * question by accident.
 */
export async function bulkApprove(
  prisma: PrismaClient,
  ids: string[],
  actorId: string,
  includeFlagged: boolean
): Promise<BulkApproveResult & { approvedIds: string[] }> {
  const unique = [...new Set(ids)];
  const rows = await prisma.question.findMany({
    where: { id: { in: unique }, status: "PENDING_APPROVAL" },
    select: { id: true, reviewVerdict: true },
  });
  const flagged = (v: string | null) => v === "NEEDS_FIX" || v === "REJECT";
  const toApprove = rows.filter((r) => includeFlagged || !flagged(r.reviewVerdict));
  const approvedIds = toApprove.map((r) => r.id);

  if (approvedIds.length > 0) {
    await prisma.question.updateMany({
      where: { id: { in: approvedIds }, status: "PENDING_APPROVAL" },
      data: { status: "APPROVED", approvedById: actorId, approvedAt: new Date(), rejectionReason: null },
    });
  }
  return {
    approved: approvedIds.length,
    skippedFlagged: rows.length - toApprove.length,
    skippedNotPending: unique.length - rows.length,
    approvedIds,
  };
}

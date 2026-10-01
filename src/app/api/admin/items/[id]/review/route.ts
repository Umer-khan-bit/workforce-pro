import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, invalidInput } from "@/lib/adminApi";

const bodySchema = z.object({ action: z.enum(["keep", "retire", "promote"]) });

/**
 * The admin's decision on a question that needs review. Nothing happens to a question without this:
 *  - keep: the flag is cleared and it is not flagged again until it has collected a full set of new answers;
 *  - retire: it is retired (never deleted; past answers keep pointing at it);
 *  - promote: a calibrated pretest question becomes an ordinary, scored question.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);

  const question = await prisma.question.findUnique({ where: { id }, include: { itemStatistic: true } });
  if (!question) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const stat = question.itemStatistic;

  if (parsed.data.action === "promote") {
    if (!question.isPretest || question.status !== "APPROVED") return NextResponse.json({ error: "Only an approved pretest question can be made operational.", code: "NOT_PRETEST" }, { status: 409 });
    if (!stat?.lastCalibratedAt) return NextResponse.json({ error: "It has not been calibrated yet: it needs enough answers and a recalibration run first.", code: "NOT_CALIBRATED" }, { status: 409 });
    await prisma.question.update({ where: { id }, data: { isPretest: false } });
    await audit(guard.userId, "QUESTION_PROMOTED_FROM_PRETEST", "Question", id);
    return NextResponse.json({ ok: true });
  }

  if (!stat?.flagged) return NextResponse.json({ error: "This question is not flagged.", code: "NOT_FLAGGED" }, { status: 409 });
  if (parsed.data.action === "keep") {
    await prisma.itemStatistic.update({ where: { id: stat.id }, data: { flagged: false, reviewedById: guard.userId, reviewedAt: new Date(), reviewedAtCount: stat.responseCount } });
    await audit(guard.userId, "ITEM_FLAG_DISMISSED", "Question", id, { reason: stat.flagReason ?? null });
  } else {
    await prisma.$transaction([
      prisma.question.update({ where: { id }, data: { status: "RETIRED" } }),
      prisma.itemStatistic.update({ where: { id: stat.id }, data: { flagged: false, reviewedById: guard.userId, reviewedAt: new Date(), reviewedAtCount: stat.responseCount } }),
    ]);
    await audit(guard.userId, "QUESTION_RETIRED", "Question", id, { previousStatus: question.status, afterReview: true });
  }
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";

// A restored question goes live again, so the admin restoring it is recorded as its approver.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const question = await prisma.question.findUnique({ where: { id } });
  if (!question) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (question.status !== "RETIRED") {
    return NextResponse.json({ error: "Only retired questions can be restored" }, { status: 409 });
  }

  await prisma.question.update({
    where: { id },
    data: { status: "APPROVED", approvedById: guard.userId, approvedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      actorId: guard.userId,
      action: "QUESTION_RESTORED",
      targetType: "Question",
      targetId: id,
    },
  });

  return NextResponse.json({ ok: true });
}

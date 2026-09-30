import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";

// Retiring never deletes: past responses still point at the question.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const question = await prisma.question.findUnique({ where: { id } });
  if (!question) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (question.status === "RETIRED") {
    return NextResponse.json({ error: "Question is already retired" }, { status: 409 });
  }

  await prisma.question.update({ where: { id }, data: { status: "RETIRED" } });
  await prisma.auditLog.create({
    data: {
      actorId: guard.userId,
      action: "QUESTION_RETIRED",
      targetType: "Question",
      targetId: id,
      metadata: { previousStatus: question.status },
    },
  });

  return NextResponse.json({ ok: true });
}

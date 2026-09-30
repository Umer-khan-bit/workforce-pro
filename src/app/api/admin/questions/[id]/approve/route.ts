import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit } from "@/lib/adminApi";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const question = await prisma.question.findUnique({ where: { id } });
  if (!question) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (question.status !== "PENDING_APPROVAL") {
    return NextResponse.json({ error: "Only pending questions can be approved" }, { status: 409 });
  }

  await prisma.question.update({
    where: { id },
    data: { status: "APPROVED", approvedById: guard.userId, approvedAt: new Date(), rejectionReason: null },
  });
  await audit(guard.userId, "QUESTION_APPROVED", "Question", id, { source: question.source });
  return NextResponse.json({ ok: true });
}

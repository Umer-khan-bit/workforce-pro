import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, invalidInput } from "@/lib/adminApi";

const bodySchema = z.object({ reason: z.string().trim().max(500).optional() });

// Rejecting keeps the question in the database (marked REJECTED); nothing is deleted.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return invalidInput(parsed.error);

  const question = await prisma.question.findUnique({ where: { id } });
  if (!question) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (question.status !== "PENDING_APPROVAL") {
    return NextResponse.json({ error: "Only pending questions can be rejected" }, { status: 409 });
  }

  await prisma.question.update({
    where: { id },
    data: { status: "REJECTED", rejectionReason: parsed.data.reason || null },
  });
  await audit(guard.userId, "QUESTION_REJECTED", "Question", id, { source: question.source });
  return NextResponse.json({ ok: true });
}

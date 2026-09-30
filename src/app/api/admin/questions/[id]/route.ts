import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { questionInputSchema, toQuestionData } from "@/lib/questionBank/schema";
import { findMissingReference } from "@/lib/questionBank/references";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const existing = await prisma.question.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = questionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = toQuestionData(parsed.data);
  const missing = await findMissingReference(prisma, data);
  if (missing) return NextResponse.json({ error: missing }, { status: 400 });

  await prisma.question.update({
    where: { id },
    data: {
      ...data,
      options: data.options ?? Prisma.DbNull,
      // Saving an approved question is the admin re-approving its current wording.
      ...(existing.status === "APPROVED"
        ? { approvedById: guard.userId, approvedAt: new Date() }
        : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: guard.userId,
      action: "QUESTION_UPDATED",
      targetType: "Question",
      targetId: id,
      metadata: { testType: data.testType, type: data.type },
    },
  });

  return NextResponse.json({ ok: true });
}

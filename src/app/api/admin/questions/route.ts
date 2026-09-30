import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { questionInputSchema, toQuestionData } from "@/lib/questionBank/schema";
import { findMissingReference } from "@/lib/questionBank/references";

export async function POST(request: Request) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

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

  // Manual questions are approved on creation; the admin who adds one is its approver.
  const question = await prisma.question.create({
    data: {
      ...data,
      options: data.options ?? Prisma.DbNull,
      status: "APPROVED",
      createdById: guard.userId,
      approvedById: guard.userId,
      approvedAt: new Date(),
    },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      actorId: guard.userId,
      action: "QUESTION_CREATED",
      targetType: "Question",
      targetId: question.id,
      metadata: { testType: data.testType, type: data.type },
    },
  });

  return NextResponse.json({ question }, { status: 201 });
}

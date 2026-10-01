import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { questionInputSchema, toQuestionData } from "@/lib/questionBank/schema";
import { getSetting } from "@/lib/settings";
import { findMissingReference } from "@/lib/questionBank/references";
import { LOCKED_MESSAGE, isFrozenQuestionError, protectedChanges } from "@/lib/questionBank/versioning";

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

  const data = toQuestionData(parsed.data, await getSetting("itemDefaults"));
  const missing = await findMissingReference(prisma, data);
  if (missing) return NextResponse.json({ error: missing }, { status: 400 });

  // A question that candidates have answered is frozen: only its explanation may change.
  const answered = await prisma.response.count({ where: { questionId: id } });
  if (answered > 0) {
    const changes = protectedChanges(existing, data);
    if (changes.length > 0) {
      return NextResponse.json({ error: LOCKED_MESSAGE, code: "QUESTION_IN_USE", fields: changes, answered }, { status: 409 });
    }
    await prisma.question.update({ where: { id }, data: { explanation: data.explanation } });
    await prisma.auditLog.create({
      data: { actorId: guard.userId, action: "QUESTION_UPDATED", targetType: "Question", targetId: id, metadata: { explanationOnly: true, answered } },
    });
    return NextResponse.json({ ok: true });
  }

  // Keep calibrated parameters: the starting values only apply when the difficulty label changes.
  const { aParam: _keepA, bParam, ...rest } = data;
  void _keepA;

  try {
    await prisma.question.update({
      where: { id },
      data: {
        ...rest,
        ...(data.difficulty !== existing.difficulty ? { bParam } : {}),
        options: data.options ?? Prisma.DbNull,
        // Saving an approved question is the admin re-approving its current wording.
        ...(existing.status === "APPROVED"
          ? { approvedById: guard.userId, approvedAt: new Date() }
          : {}),
      },
    });
  } catch (err) {
    // The database refuses the edit if a candidate answered the question after the check above.
    if (isFrozenQuestionError(err)) {
      return NextResponse.json({ error: LOCKED_MESSAGE, code: "QUESTION_IN_USE" }, { status: 409 });
    }
    throw err;
  }

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

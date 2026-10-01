import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { questionInputSchema, toQuestionData } from "@/lib/questionBank/schema";
import { getSetting } from "@/lib/settings";
import { findMissingReference } from "@/lib/questionBank/references";
import { protectedChanges } from "@/lib/questionBank/versioning";
import { flagOutdatedTranslations } from "@/lib/questionBank/translations";

const extrasSchema = z.object({ startAsPretest: z.boolean().default(false) });

/**
 * Adds a new version of a question and retires the old one, in one step. The new question points back
 * to the old one (`previousVersionId`); answers already given stay with the old version. Like any
 * manually added question the new version is approved straight away, with the admin as its approver,
 * unless "start as pretest" is chosen (then it is shown to candidates but not scored until calibrated).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const old = await prisma.question.findUnique({ where: { id } });
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = questionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  const startAsPretest = extrasSchema.safeParse(body).data?.startAsPretest ?? false;

  const data = toQuestionData(parsed.data, await getSetting("itemDefaults"));
  const missing = await findMissingReference(prisma, data);
  if (missing) return NextResponse.json({ error: missing }, { status: 400 });

  // A new version has to differ from the old one in something that matters; otherwise just edit the explanation.
  if (protectedChanges(old, data).length === 0) {
    return NextResponse.json(
      { error: "Nothing about the question has changed. Change its wording, answers or settings first.", code: "NO_CHANGE" },
      { status: 400 }
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const question = await tx.question.create({
      data: {
        ...data,
        options: data.options ?? Prisma.DbNull,
        status: "APPROVED",
        source: "MANUAL",
        isPretest: startAsPretest,
        previousVersionId: old.id,
        createdById: guard.userId,
        approvedById: guard.userId,
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    if (old.status !== "RETIRED") await tx.question.update({ where: { id: old.id }, data: { status: "RETIRED" } });
    // Translations of the old wording now need a fresh translation of the new version (listed in Approvals).
    const outdatedTranslations = await flagOutdatedTranslations(tx, old.id);
    await tx.auditLog.create({
      data: {
        actorId: guard.userId,
        action: "QUESTION_VERSIONED",
        targetType: "Question",
        targetId: question.id,
        metadata: { previousVersionId: old.id, startAsPretest, translationsMarkedOutdated: outdatedTranslations },
      },
    });
    if (old.status !== "RETIRED") {
      await tx.auditLog.create({
        data: { actorId: guard.userId, action: "QUESTION_RETIRED", targetType: "Question", targetId: old.id, metadata: { previousStatus: old.status, replacedBy: question.id } },
      });
    }
    return question;
  });

  return NextResponse.json({ question: created }, { status: 201 });
}

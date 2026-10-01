import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit } from "@/lib/adminApi";

const bodySchema = z.object({ asPretest: z.boolean().default(false) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const asPretest = bodySchema.safeParse(await request.json().catch(() => ({}))).data?.asPretest ?? false;
  const question = await prisma.question.findUnique({ where: { id } });
  if (!question) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (question.status !== "PENDING_APPROVAL") {
    return NextResponse.json({ error: "Only pending questions can be approved" }, { status: 409 });
  }

  await prisma.question.update({
    where: { id },
    data: { status: "APPROVED", approvedById: guard.userId, approvedAt: new Date(), rejectionReason: null, isPretest: asPretest },
  });
  await audit(guard.userId, "QUESTION_APPROVED", "Question", id, { source: question.source, asPretest });
  return NextResponse.json({ ok: true });
}

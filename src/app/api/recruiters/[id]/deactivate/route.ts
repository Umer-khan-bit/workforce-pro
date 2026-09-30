import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "COMPANY_ADMIN" || !session.user.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const recruiter = await prisma.user.findUnique({ where: { id } });
  if (!recruiter || recruiter.companyId !== session.user.companyId || recruiter.role !== "RECRUITER") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.user.update({ where: { id }, data: { isActive: false } });

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      action: "RECRUITER_DEACTIVATED",
      targetType: "User",
      targetId: id,
      metadata: { email: recruiter.email },
    },
  });

  return NextResponse.json({ ok: true });
}

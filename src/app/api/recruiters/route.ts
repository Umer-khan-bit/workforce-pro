import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, generateTempPassword } from "@/lib/password";
import { recruiterCreateSchema } from "@/lib/validation";
import { inBackground, sendVerificationEmail } from "@/lib/accountEmails";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "COMPANY_ADMIN" || !session.user.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const recruiters = await prisma.user.findMany({
    where: { companyId: session.user.companyId, role: "RECRUITER" },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ recruiters });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "COMPANY_ADMIN" || !session.user.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = recruiterCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, email } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const tempPassword = generateTempPassword();
  const hashedPassword = await hashPassword(tempPassword);

  const recruiter = await prisma.user.create({
    data: {
      email,
      name,
      password: hashedPassword,
      role: "RECRUITER",
      companyId: session.user.companyId,
      mustChangePassword: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      action: "RECRUITER_CREATED",
      targetType: "User",
      targetId: recruiter.id,
      metadata: { email: recruiter.email },
    },
  });

  // The new recruiter confirms their email address from the banner or the emailed link.
  inBackground(sendVerificationEmail(prisma, recruiter));

  return NextResponse.json(
    { recruiter: { id: recruiter.id, name: recruiter.name, email: recruiter.email }, tempPassword },
    { status: 201 }
  );
}

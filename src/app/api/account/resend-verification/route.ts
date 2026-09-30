import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/accountEmails";
import { RESEND_PER_USER, overLimit, tooManyRequests } from "@/lib/authLimits";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await overLimit(`resend-verification:${session.user.id}`, RESEND_PER_USER)) return tooManyRequests();

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });

  const delivered = await sendVerificationEmail(prisma, user);
  return NextResponse.json({ ok: true, delivered });
}

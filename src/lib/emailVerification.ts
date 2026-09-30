import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function isEmailVerified(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true } });
  return Boolean(user?.emailVerified);
}

/**
 * Guard for actions an unverified user may not take: starting a test and contacting a candidate.
 * Call it near the top of those routes: `const blocked = await requireVerifiedEmail(session.user.id)`.
 * Returns a 403 response to send back, or null when the email is confirmed.
 */
export async function requireVerifiedEmail(userId: string): Promise<NextResponse | null> {
  if (await isEmailVerified(userId)) return null;
  return NextResponse.json(
    { error: "Please confirm your email address first. Use the link we emailed you, or ask for a new one.", code: "EMAIL_NOT_VERIFIED" },
    { status: 403 }
  );
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { consumeAuthToken } from "@/lib/authTokens";
import { getClientIp } from "@/lib/rateLimit";
import { TOKEN_ATTEMPTS_PER_IP, overLimit, tooManyRequests } from "@/lib/authLimits";

const bodySchema = z.object({
  token: z.string().min(10).max(200),
  newPassword: z.string().min(8, "Use at least 8 characters").max(200),
});

const INVALID_LINK = "This link is invalid or has expired. Ask for a new one.";

export async function POST(request: Request) {
  if (await overLimit(`reset-ip:${getClientIp(request)}`, TOKEN_ATTEMPTS_PER_IP)) return tooManyRequests();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }

  const used = await consumeAuthToken(prisma, parsed.data.token, "PASSWORD_RESET");
  if (!used) return NextResponse.json({ error: INVALID_LINK }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: used.userId } });
  if (!user?.isActive) return NextResponse.json({ error: INVALID_LINK }, { status: 400 });

  const password = await hashPassword(parsed.data.newPassword);
  await prisma.$transaction([
    // passwordChangedAt ends every session that was open before the reset (see auth.ts).
    prisma.user.update({ where: { id: user.id }, data: { password, mustChangePassword: false, passwordChangedAt: new Date() } }),
    prisma.authToken.deleteMany({ where: { userId: user.id, kind: "PASSWORD_RESET", usedAt: null } }),
    prisma.auditLog.create({ data: { actorId: user.id, action: "PASSWORD_RESET_COMPLETED", targetType: "User", targetId: user.id } }),
  ]);

  return NextResponse.json({ ok: true });
}

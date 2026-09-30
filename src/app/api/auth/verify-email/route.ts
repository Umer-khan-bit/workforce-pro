import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeAuthToken } from "@/lib/authTokens";
import { getClientIp } from "@/lib/rateLimit";
import { TOKEN_ATTEMPTS_PER_IP, overLimit, tooManyRequests } from "@/lib/authLimits";

const bodySchema = z.object({ token: z.string().min(10).max(200) });

export async function POST(request: Request) {
  if (await overLimit(`verify-ip:${getClientIp(request)}`, TOKEN_ATTEMPTS_PER_IP)) return tooManyRequests();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "This link is invalid." }, { status: 400 });

  const used = await consumeAuthToken(prisma, parsed.data.token, "EMAIL_VERIFICATION");
  if (!used) {
    return NextResponse.json({ error: "This link is invalid or has expired. Sign in and ask for a new one." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.user.updateMany({ where: { id: used.userId, emailVerified: null }, data: { emailVerified: new Date() } }),
    prisma.auditLog.create({ data: { actorId: used.userId, action: "EMAIL_VERIFIED", targetType: "User", targetId: used.userId } }),
  ]);
  return NextResponse.json({ ok: true });
}

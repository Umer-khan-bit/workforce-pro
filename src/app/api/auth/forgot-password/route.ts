import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/rateLimit";
import { FORGOT_PER_EMAIL, FORGOT_PER_IP, overLimit, tooManyRequests } from "@/lib/authLimits";
import { inBackground, requestPasswordReset } from "@/lib/accountEmails";

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

/** The answer is the same whether or not the address has an account, so this cannot be used to look people up. */
export async function POST(request: Request) {
  if (await overLimit(`forgot-ip:${getClientIp(request)}`, FORGOT_PER_IP)) return tooManyRequests();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const { email } = parsed.data;

  // Counted per address whether or not it exists, so the limit itself reveals nothing.
  if (await overLimit(`forgot-email:${email}`, FORGOT_PER_EMAIL)) return tooManyRequests();

  inBackground(requestPasswordReset(prisma, email));
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { anonymiseCandidate } from "@/lib/accountDeletion";
import { AUTH_ATTEMPT_LIMIT, AUTH_WINDOW_MS, isRateLimited } from "@/lib/rateLimit";
import { tooManyRequests } from "@/lib/authLimits";

const bodySchema = z.object({
  password: z.string().min(1, "Enter your password"),
  confirm: z.literal("DELETE", { error: "Type DELETE to confirm" }),
});

/** A candidate deletes their own account. Needs their password and the word DELETE. */
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "CANDIDATE") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Checks a password, so it is limited like login.
  if (await isRateLimited(`delete-account:${session.user.id}`, AUTH_ATTEMPT_LIMIT, AUTH_WINDOW_MS)) return tooManyRequests();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !(await verifyPassword(parsed.data.password, user.password))) {
    return NextResponse.json({ error: "That password is not correct." }, { status: 400 });
  }

  const deleted = await anonymiseCandidate(prisma, user.id);
  if (!deleted) return NextResponse.json({ error: "This account cannot be deleted." }, { status: 409 });
  return NextResponse.json({ ok: true });
}

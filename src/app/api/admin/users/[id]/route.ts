import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { audit, invalidInput } from "@/lib/adminApi";

const bodySchema = z
  .object({ isActive: z.boolean().optional(), mustChangePassword: z.boolean().optional() })
  .refine((v) => v.isActive !== undefined || v.mustChangePassword !== undefined, { message: "Nothing to change" });

/**
 * Platform admin switches a user on or off, or makes them change their password at the next sign-in. A
 * deactivated user is signed out at their next click (the session checks the database). Admins cannot
 * switch off themselves, and the last active platform admin cannot be switched off.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, isActive: true, candidateProfile: { select: { anonymisedAt: true } } } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.candidateProfile?.anonymisedAt) return NextResponse.json({ error: "This account was deleted by its owner.", code: "ANONYMISED" }, { status: 409 });

  if (parsed.data.isActive === false) {
    if (user.id === guard.userId) return NextResponse.json({ error: "You cannot switch off your own account.", code: "SELF" }, { status: 409 });
    if (user.role === "PLATFORM_ADMIN" && (await prisma.user.count({ where: { role: "PLATFORM_ADMIN", isActive: true, id: { not: user.id } } })) === 0) {
      return NextResponse.json({ error: "This is the last active platform admin.", code: "LAST_ADMIN" }, { status: 409 });
    }
  }

  await prisma.user.update({
    where: { id },
    data: { ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}), ...(parsed.data.mustChangePassword !== undefined ? { mustChangePassword: parsed.data.mustChangePassword } : {}) },
  });
  await audit(guard.userId, parsed.data.isActive !== undefined ? (parsed.data.isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED") : "USER_PASSWORD_CHANGE_REQUIRED", "User", id, { ...parsed.data });
  return NextResponse.json({ ok: true });
}

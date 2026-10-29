import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { clearFlag, IntegrityError, undoVoid, voidResult } from "@/lib/integrity/review";

const bodySchema = z.object({ action: z.enum(["clear", "void", "undo"]) });

/** Integrity review decisions. The library functions write the audit entries (INTEGRITY_FLAG_CLEARED, INTEGRITY_RESULT_VOIDED, INTEGRITY_VOID_UNDONE). */
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  const sessionId = z.string().min(1).max(100).safeParse((await params).sessionId);
  if (!parsed.success || !sessionId.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const { action } = parsed.data;
    if (action === "clear") await clearFlag(prisma, guard.userId, sessionId.data);
    else if (action === "void") await voidResult(prisma, guard.userId, sessionId.data);
    else await undoVoid(prisma, guard.userId, sessionId.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof IntegrityError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

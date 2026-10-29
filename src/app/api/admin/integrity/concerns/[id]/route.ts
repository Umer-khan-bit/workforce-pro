import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/adminGuard";
import { ConcernError, markConcernReviewed } from "@/lib/integrity/concerns";

const bodySchema = z.object({ action: z.literal("review") });

/** The platform admin marks a company's concern report as reviewed. markConcernReviewed writes the audit entry (CONCERN_REVIEWED). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin();
  if (guard instanceof NextResponse) return guard;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  const id = z.string().min(1).max(100).safeParse((await params).id);
  if (!parsed.success || !id.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    await markConcernReviewed(prisma, guard.userId, id.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ConcernError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
}

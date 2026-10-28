import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/adminApi";
import { overLimit, tooManyRequests } from "@/lib/authLimits";
import { candidateGuard } from "@/lib/testEngine/http";

// Security rule (stays in code): a candidate cannot fill the audit log by looping this call.
const FOCUS_EVENTS_PER_WINDOW = 30;

const bodySchema = z.object({ source: z.enum(["hidden", "blur"]).optional() });
const idSchema = z.string().min(1).max(100);

/**
 * Records that the candidate left the test window. It changes nothing about the test: no pause, no score.
 * Only the candidate's own running session counts; anything else answers "not found". The audit entry holds
 * the session id, the test type and a running count, never answers or personal data.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await candidateGuard();
  if (guard instanceof NextResponse) return guard;

  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  const id = idSchema.safeParse((await params).id);
  if (!body.success || !id.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  if (await overLimit(`focus:${guard.userId}`, FOCUS_EVENTS_PER_WINDOW)) return tooManyRequests();

  const session = await prisma.testSession.findFirst({
    where: { id: id.data, status: "IN_PROGRESS", expiresAt: { gt: new Date() }, candidateProfile: { userId: guard.userId } },
    select: { id: true, testType: true },
  });
  if (!session) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const before = await prisma.auditLog.count({ where: { action: "TEST_FOCUS_LOST", targetType: "TestSession", targetId: session.id } });
  const count = before + 1;
  await audit(guard.userId, "TEST_FOCUS_LOST", "TestSession", session.id, { testType: session.testType, count });
  return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
}

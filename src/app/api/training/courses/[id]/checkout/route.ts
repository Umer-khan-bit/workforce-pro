import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCandidate, trainingErrorResponse } from "@/lib/candidateApi";
import { requireVerifiedEmail } from "@/lib/emailVerification";
import { purchaseCourse } from "@/lib/training/enrol";

const bodySchema = z.object({ simulate: z.enum(["success", "failure"]).default("success") });

/**
 * Pays for a paid course through the payment provider (the simulated gateway in demo mode, where the
 * checkout page offers "pay" and "simulate a failed payment"). A failed payment answers 402 and enrols nobody.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCandidate("checkout", 30);
  if (guard instanceof NextResponse) return guard;
  const blocked = await requireVerifiedEmail(guard.userId);
  if (blocked) return blocked;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const result = await purchaseCourse(prisma, guard.userId, id, { simulate: parsed.data.simulate });
    if (result.status === "FAILED") return NextResponse.json({ error: result.reason, code: "PAYMENT_FAILED", paymentId: result.paymentId }, { status: 402 });
    return NextResponse.json({ enrollmentId: result.enrollmentId, paymentId: result.paymentId }, { status: 201 });
  } catch (err) {
    return trainingErrorResponse(err);
  }
}

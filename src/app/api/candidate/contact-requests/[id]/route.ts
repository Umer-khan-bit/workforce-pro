import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCandidate } from "@/lib/candidateApi";
import { ContactError, respondToContactRequest } from "@/lib/recruiter/contactRequests";

const bodySchema = z.object({ action: z.enum(["accept", "decline"]) });

/** The candidate accepts or declines a recruiter's request (only their own requests). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCandidate("contact-requests");
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    await respondToContactRequest(prisma, { candidateUserId: guard.userId, requestId: id, accept: parsed.data.action === "accept" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ContactError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
}

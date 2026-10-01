import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { candidateGuard, testErrorResponse } from "@/lib/testEngine/http";
import { submitAnswer } from "@/lib/testEngine/session";

const bodySchema = z.object({
  questionId: z.string().min(1).max(100),
  answer: z.object({ key: z.string().max(5).optional(), value: z.number().optional() }),
});

/** Records the answer to the current question and returns the next one. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await candidateGuard();
  if (guard instanceof NextResponse) return guard;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose an answer." }, { status: 400 });

  const { id } = await params;
  try {
    return NextResponse.json(await submitAnswer({ prisma }, guard.userId, id, parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return testErrorResponse(err);
  }
}

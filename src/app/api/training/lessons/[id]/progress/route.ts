import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCandidate, trainingErrorResponse } from "@/lib/candidateApi";
import { setLessonDone } from "@/lib/training/enrol";

const bodySchema = z.object({ done: z.boolean() });

/** Marks a lesson done or not done in the candidate's own enrolment. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCandidate("training");
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    return NextResponse.json(await setLessonDone(prisma, guard.userId, id, parsed.data.done));
  } catch (err) {
    return trainingErrorResponse(err);
  }
}

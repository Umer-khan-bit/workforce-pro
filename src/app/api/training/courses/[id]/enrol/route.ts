import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCandidate, trainingErrorResponse } from "@/lib/candidateApi";
import { enrolInFreeCourse } from "@/lib/training/enrol";

/** Joins a free course. Paid courses go through checkout instead. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCandidate("training");
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  try {
    const enrollment = await enrolInFreeCourse(prisma, guard.userId, id);
    return NextResponse.json({ enrollmentId: enrollment.id }, { status: 201 });
  } catch (err) {
    return trainingErrorResponse(err);
  }
}

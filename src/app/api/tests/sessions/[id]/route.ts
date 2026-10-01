import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { candidateGuard, testErrorResponse } from "@/lib/testEngine/http";
import { getSessionView } from "@/lib/testEngine/session";

/** The current question (or writing task), progress and time left. Ends the test if time has run out. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await candidateGuard();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  try {
    return NextResponse.json(await getSessionView({ prisma }, guard.userId, id), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return testErrorResponse(err);
  }
}

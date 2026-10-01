import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TEST_TYPES, type TestTypeValue } from "@/lib/questionBank/schema";
import { candidateGuard, testErrorResponse } from "@/lib/testEngine/http";
import { startOrResume } from "@/lib/testEngine/session";

/** Starts a test, or resumes the one in progress. */
export async function POST(_request: Request, { params }: { params: Promise<{ testType: string }> }) {
  const guard = await candidateGuard();
  if (guard instanceof NextResponse) return guard;

  const { testType } = await params;
  if (!(TEST_TYPES as readonly string[]).includes(testType)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const result = await startOrResume({ prisma }, guard.userId, testType as TestTypeValue);
    return NextResponse.json(result);
  } catch (err) {
    return testErrorResponse(err);
  }
}

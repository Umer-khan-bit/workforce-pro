import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { overLimit, tooManyRequests } from "@/lib/authLimits";
import { TrainingError } from "@/lib/training/enrol";

/**
 * Role check for candidate API routes (results, training, notifications): signed in as a candidate and not
 * hammering the API. Returns the user id, or a ready-made response. Email confirmation is checked
 * separately by the routes that need it (starting tests, contacting people).
 */
export async function requireCandidate(limitKey: string, limit = 120): Promise<{ userId: string } | NextResponse> {
  const session = await auth();
  if (!session?.user || session.user.role !== "CANDIDATE") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await overLimit(`${limitKey}:${session.user.id}`, limit)) return tooManyRequests();
  return { userId: session.user.id };
}

/** A TrainingError becomes its JSON response; anything else is a real bug and is rethrown. */
export function trainingErrorResponse(err: unknown): NextResponse {
  if (err instanceof TrainingError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  throw err;
}

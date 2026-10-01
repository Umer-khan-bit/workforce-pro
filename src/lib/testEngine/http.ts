import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireVerifiedEmail } from "@/lib/emailVerification";
import { overLimit, tooManyRequests } from "@/lib/authLimits";
import { TestError } from "./session";

// Security rule (stays in code): a whole test is about 25 requests, so this is generous but stops scripted abuse.
const TEST_REQUESTS_PER_WINDOW = 300;

/**
 * Shared checks for the candidate test endpoints: signed in as a candidate, email confirmed, and not
 * hammering the API. Returns the user id, or a response to send straight back.
 */
export async function candidateGuard(): Promise<{ userId: string } | NextResponse> {
  const session = await auth();
  if (!session?.user || session.user.role !== "CANDIDATE") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await requireVerifiedEmail(session.user.id);
  if (blocked) return blocked;
  if (await overLimit(`tests:${session.user.id}`, TEST_REQUESTS_PER_WINDOW)) return tooManyRequests();
  return { userId: session.user.id };
}

/** Turns a TestError into a JSON response; anything else is rethrown (a real bug should surface). */
export function testErrorResponse(err: unknown): NextResponse {
  if (err instanceof TestError) {
    return NextResponse.json({ error: err.message, code: err.code, ...err.extra }, { status: err.status });
  }
  throw err;
}

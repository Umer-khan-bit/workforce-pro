import { NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rateLimit";
import { AiError } from "./errors";

// Security rule (stays in code): AI calls cost money, so each admin is capped.
export const AI_CALL_LIMIT = 30;
export const AI_WINDOW_MS = 15 * 60 * 1000;

/** Returns a 429 response if this admin has made too many AI calls recently, otherwise null. */
export async function aiRateLimitResponse(userId: string): Promise<NextResponse | null> {
  if (!(await isRateLimited(`ai:${userId}`, AI_CALL_LIMIT, AI_WINDOW_MS))) return null;
  return NextResponse.json(
    { error: "Too many AI requests in a short time. Wait a few minutes and try again.", code: "RATE_LIMITED" },
    { status: 429, headers: { "Retry-After": String(Math.ceil(AI_WINDOW_MS / 1000)) } }
  );
}

/** JSON error response for an AiError, with the stable `code` the page can react to. */
export function aiErrorResponse(err: AiError): NextResponse {
  return NextResponse.json({ error: err.message, code: err.code }, { status: err.httpStatus });
}

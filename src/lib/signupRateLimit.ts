import { NextResponse } from "next/server";
import { AUTH_ATTEMPT_LIMIT, AUTH_WINDOW_MS, getClientIp, isRateLimited } from "@/lib/rateLimit";

/**
 * Returns a 429 response if this client has made too many signup attempts for
 * the given scope, otherwise null. Every attempt counts, successful or not.
 */
export function signupRateLimitResponse(
  request: Request,
  scope: "candidate" | "company"
): NextResponse | null {
  const key = `signup:${scope}:${getClientIp(request)}`;
  if (!isRateLimited(key, AUTH_ATTEMPT_LIMIT, AUTH_WINDOW_MS)) return null;

  return NextResponse.json(
    { error: "Too many signup attempts. Please try again in a few minutes." },
    { status: 429, headers: { "Retry-After": String(Math.ceil(AUTH_WINDOW_MS / 1000)) } }
  );
}

import { NextResponse } from "next/server";
import { AUTH_WINDOW_MS, isRateLimited } from "@/lib/rateLimit";

// Security rules (stay in code): how often the account-email endpoints may be used.
export const FORGOT_PER_IP = 5;
export const FORGOT_PER_EMAIL = 3;
export const TOKEN_ATTEMPTS_PER_IP = 10;
export const RESEND_PER_USER = 3;

export const tooManyRequests = () =>
  NextResponse.json(
    { error: "Too many attempts. Please try again in a few minutes." },
    { status: 429, headers: { "Retry-After": String(Math.ceil(AUTH_WINDOW_MS / 1000)) } }
  );

/** True when `key` has used up its allowance in the current window. Every call counts as an attempt. */
export const overLimit = (key: string, limit: number) => isRateLimited(key, limit, AUTH_WINDOW_MS);

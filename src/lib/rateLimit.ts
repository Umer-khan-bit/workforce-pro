/**
 * In-memory rate limiter. Fine for a single-process local/demo deployment;
 * would need a shared store (e.g. Redis) behind a load balancer.
 */
const attempts = new Map<string, number[]>();

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= limit) {
    attempts.set(key, timestamps);
    return true;
  }

  timestamps.push(now);
  attempts.set(key, timestamps);
  return false;
}

/** Shared by login and both signup endpoints so they stay in step. */
export const AUTH_ATTEMPT_LIMIT = 5;
export const AUTH_WINDOW_MS = 15 * 60 * 1000;

/**
 * Best-effort client IP. Behind a proxy this trusts the first x-forwarded-for
 * hop, so the proxy must overwrite that header rather than append to it.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

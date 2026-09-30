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

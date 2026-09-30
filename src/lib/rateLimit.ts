import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** What the limiter needs from the database client (so tests can pass a fake). */
export type RateLimitDb = Pick<PrismaClient, "$transaction">;

// Attempts older than this are useless (no window in the code is anywhere near a day) and get swept.
const RETENTION_MS = 24 * 60 * 60 * 1000;
const SWEEP_CHANCE = 0.02;

/**
 * Database-backed rate limiter: one row per attempt, so limits survive restarts and are shared by
 * every server that uses the same database. Returns true when `key` already has `limit` attempts
 * inside `windowMs` (and does not record another), otherwise records this attempt and returns false.
 *
 * A per-key advisory lock makes the count-then-insert step atomic, so two servers (or two requests)
 * cannot both slip under the limit. Attempt times come from the app server's clock, so servers
 * should keep their clocks in sync (normal NTP is plenty for windows measured in minutes).
 * If the database is unreachable this throws, so callers fail closed rather than skipping the limit.
 */
export async function isRateLimited(
  key: string,
  limit: number,
  windowMs: number,
  db: RateLimitDb = prisma
): Promise<boolean> {
  const limited = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      const now = Date.now();
      const recent = await tx.rateLimitHit.count({
        where: { key, createdAt: { gt: new Date(now - windowMs) } },
      });
      if (recent >= limit) return true;
      await tx.rateLimitHit.create({ data: { key, createdAt: new Date(now) } });
      return false;
    },
    { timeout: 5000 }
  );

  if (Math.random() < SWEEP_CHANCE) {
    // Housekeeping only: never let a failed sweep affect the request.
    void db
      .$transaction((tx) =>
        tx.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } } })
      )
      .catch(() => undefined);
  }
  return limited;
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

import { createHash, randomBytes } from "node:crypto";
import type { AuthTokenKind, PrismaClient } from "@prisma/client";

type Db = Pick<PrismaClient, "authToken">;

/** Only this hash is stored, so a database leak does not give anyone working links. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Creates a single-use link token for the user and returns the raw value to put in the email.
 * Any earlier unused token of the same kind for that user stops working.
 */
export async function createAuthToken(db: Db, userId: string, kind: AuthTokenKind, ttlMs: number): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await db.authToken.deleteMany({ where: { userId, kind, usedAt: null } });
  await db.authToken.create({
    data: { userId, kind, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return raw;
}

/**
 * Uses up a token. Returns the user id, or null if the token is unknown, the wrong kind, expired or
 * already used. The update is conditional, so two requests with the same token cannot both succeed.
 */
export async function consumeAuthToken(db: Db, raw: string, kind: AuthTokenKind): Promise<{ userId: string } | null> {
  if (!raw || raw.length > 200) return null;
  const now = new Date();
  const row = await db.authToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!row || row.kind !== kind || row.usedAt || row.expiresAt <= now) return null;
  const used = await db.authToken.updateMany({
    where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  return used.count === 1 ? { userId: row.userId } : null;
}

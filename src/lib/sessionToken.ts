import type { PrismaClient } from "@prisma/client";
import { getPilot, pilotBlocksUser } from "@/lib/pilot";

type TokenLike = { sub?: string; iat?: number; mustChangePassword?: boolean };

/**
 * Brings a session token in line with the database. Runs on every request (from the jwt callback in
 * auth.ts), and is the ONLY place the session learns whether a password change is still required:
 * nothing the browser sends (including `session.update(...)`) is ever trusted for that.
 *
 *  - Returns null, which ends the session, if the user is gone or deactivated.
 *  - Returns null if the password was reset after this session was opened.
 *  - Otherwise sets `mustChangePassword` from the database.
 */
export async function syncTokenWithDatabase<T extends TokenLike>(
  token: T,
  db: Pick<PrismaClient, "user"> & Partial<Pick<PrismaClient, "pilotConfig">>
): Promise<T | null> {
  if (!token.sub) return token;
  const user = await db.user.findUnique({
    where: { id: token.sub },
    select: { isActive: true, passwordChangedAt: true, mustChangePassword: true, role: true, companyId: true },
  });
  if (!user?.isActive) return null;
  // Pilot mode: a company that is not part of the pilot is signed out at its next click.
  if (db.pilotConfig && user.role && pilotBlocksUser(await getPilot({ pilotConfig: db.pilotConfig }), { role: user.role, companyId: user.companyId ?? null })) return null;
  // Compared in whole seconds (the token's issue time has no milliseconds), so signing in right
  // after a reset still works.
  if (
    user.passwordChangedAt &&
    typeof token.iat === "number" &&
    token.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)
  ) {
    return null;
  }
  return { ...token, mustChangePassword: user.mustChangePassword };
}

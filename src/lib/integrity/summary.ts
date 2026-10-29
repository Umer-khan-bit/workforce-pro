import type { PrismaClient } from "@prisma/client";
import { readSetting } from "@/lib/settings/store";

type Db = Pick<PrismaClient, "auditLog" | "siteSetting" | "integrityReview">;

/** The audit action written each time a candidate leaves the test window (see the focus route). */
export const FOCUS_LOST_ACTION = "TEST_FOCUS_LOST";

/** How many times the candidate left the window in each of the given test sessions (sessions with none are 0). */
export async function windowExits(db: Pick<PrismaClient, "auditLog">, sessionIds: string[]): Promise<Map<string, number>> {
  const out = new Map(sessionIds.map((id) => [id, 0]));
  if (sessionIds.length === 0) return out;
  const rows = await db.auditLog.groupBy({
    by: ["targetId"],
    where: { action: FOCUS_LOST_ACTION, targetType: "TestSession", targetId: { in: sessionIds } },
    _count: { _all: true },
  });
  for (const r of rows) if (r.targetId) out.set(r.targetId, r._count._all);
  return out;
}

/** A test is flagged when the exits reach the threshold in Settings > Tests. */
export const isFlagged = (exits: number, threshold: number) => exits >= threshold;

/** The wording a recruiter sees: counts only. */
export const integrityLine = (exits: number) =>
  exits === 0 ? "Integrity: no concerns" : `Integrity: ${exits} window exit${exits === 1 ? "" : "s"}`;

export type IntegritySummary = { sessionId: string; exits: number; flagged: boolean; cleared: boolean };

/** Exits and flag for each session. A session an admin cleared is never flagged. */
export async function integritySummaries(db: Db, sessionIds: string[]): Promise<Map<string, IntegritySummary>> {
  const [exits, testing, cleared] = await Promise.all([
    windowExits(db, sessionIds),
    readSetting(db, "testing"),
    sessionIds.length
      ? db.integrityReview.findMany({ where: { sessionId: { in: sessionIds }, decision: "CLEARED" }, select: { sessionId: true } })
      : Promise.resolve([]),
  ]);
  const clearedIds = new Set(cleared.map((c) => c.sessionId));
  return new Map(
    sessionIds.map((id) => {
      const n = exits.get(id) ?? 0;
      return [id, { sessionId: id, exits: n, flagged: !clearedIds.has(id) && isFlagged(n, testing.integrityFlagThreshold), cleared: clearedIds.has(id) }];
    })
  );
}

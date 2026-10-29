import type { PrismaClient, TestType } from "@prisma/client";
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

/**
 * What a company sees for a number of window exits (counts only):
 *  none    - no exits
 *  info    - some exits, below the threshold: information only
 *  concern - at or above the threshold in Settings > Tests
 */
export type IntegrityLevel = "none" | "info" | "concern";
export const integrityLevel = (exits: number, threshold: number): IntegrityLevel => (exits <= 0 ? "none" : isFlagged(exits, threshold) ? "concern" : "info");

/** The wording of the report and the PDF. */
export function integrityLine(exits: number, threshold: number): string {
  const n = `${exits} window exit${exits === 1 ? "" : "s"}`;
  const level = integrityLevel(exits, threshold);
  return level === "none" ? "Integrity: no concerns" : level === "concern" ? `Integrity: concern, ${n}` : `Integrity: ${n}`;
}

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

/** What a company sees: a cleared flag reads as no exits at all. */
export const shownExits = (s: IntegritySummary | undefined) => (s && !s.cleared ? s.exits : 0);

export type CandidateIntegrity = {
  /** The most exits in any one test (cleared flags and voided results count as none). */
  exits: number;
  level: IntegrityLevel;
  perTest: { testType: TestType; exits: number }[];
};

/**
 * Integrity for each candidate, from their latest result in every test (voided results are skipped, a cleared flag reads as no exits).
 * The level uses the threshold in Settings > Tests, per test: a candidate is at "concern" when any one test reaches it.
 */
export async function candidateIntegrity(db: Db & Pick<PrismaClient, "score">, profileIds: string[]): Promise<Map<string, CandidateIntegrity>> {
  const out = new Map<string, CandidateIntegrity>();
  if (profileIds.length === 0) return out;
  const [latest, testing] = await Promise.all([
    db.score.findMany({
      where: { candidateProfileId: { in: profileIds }, voidedAt: null },
      orderBy: { computedAt: "desc" },
      distinct: ["candidateProfileId", "testType"],
      select: { candidateProfileId: true, testType: true, sessionId: true },
    }),
    readSetting(db, "testing"),
  ]);
  const summaries = await integritySummaries(db, latest.map((s) => s.sessionId));
  for (const s of latest) {
    const entry = out.get(s.candidateProfileId) ?? { exits: 0, level: "none" as IntegrityLevel, perTest: [] };
    const n = shownExits(summaries.get(s.sessionId));
    entry.perTest.push({ testType: s.testType, exits: n });
    entry.exits = Math.max(entry.exits, n);
    entry.level = integrityLevel(entry.exits, testing.integrityFlagThreshold);
    out.set(s.candidateProfileId, entry);
  }
  return out;
}

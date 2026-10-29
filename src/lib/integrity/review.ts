import type { PrismaClient, TestType } from "@prisma/client";
import { evaluateTopPerformer, isTopPerformer, removeBadgeIfNoLongerEarned } from "@/lib/results/topPerformer";
import { readSetting } from "@/lib/settings/store";
import { FOCUS_LOST_ACTION, windowExits } from "./summary";

type Db = PrismaClient;

export class IntegrityError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type ReviewRow = {
  sessionId: string;
  scoreId: string;
  candidate: string;
  testType: TestType;
  date: Date;
  exits: number;
};

/**
 * Flagged sessions for the Integrity review screen: finished tests with a result whose window exits reach the
 * threshold. `waiting` have no decision yet; `voided` can be undone. Cleared sessions are not listed.
 */
export async function reviewQueue(db: Db): Promise<{ waiting: ReviewRow[]; voided: ReviewRow[]; threshold: number }> {
  const { integrityFlagThreshold: threshold } = await readSetting(db, "testing");
  const grouped = await db.auditLog.groupBy({
    by: ["targetId"],
    where: { action: FOCUS_LOST_ACTION, targetType: "TestSession", targetId: { not: null } },
    _count: { _all: true },
    having: { targetId: { _count: { gte: threshold } } },
  });
  const ids = grouped.flatMap((g) => (g.targetId ? [g.targetId] : []));
  const sessions = await db.testSession.findMany({
    where: { id: { in: ids }, score: { isNot: null }, integrityReview: { is: null } },
    select: { id: true, testType: true, completedAt: true, score: { select: { id: true, computedAt: true, voidedAt: true } }, candidateProfile: { select: { user: { select: { name: true, email: true } } } } },
  });
  const voidedSessions = await db.testSession.findMany({
    where: { integrityReview: { is: { decision: "VOIDED" } } },
    select: { id: true, testType: true, completedAt: true, score: { select: { id: true, computedAt: true } }, candidateProfile: { select: { user: { select: { name: true, email: true } } } } },
  });
  const counts = await windowExits(db, [...sessions, ...voidedSessions].map((s) => s.id));
  const toRow = (s: (typeof sessions)[number] | (typeof voidedSessions)[number]): ReviewRow => ({
    sessionId: s.id,
    scoreId: s.score!.id,
    candidate: s.candidateProfile.user.name ?? s.candidateProfile.user.email,
    testType: s.testType,
    date: s.completedAt ?? s.score!.computedAt,
    exits: counts.get(s.id) ?? 0,
  });
  const byDate = (a: ReviewRow, b: ReviewRow) => b.date.getTime() - a.date.getTime();
  return { waiting: sessions.map(toRow).sort(byDate), voided: voidedSessions.filter((s) => s.score).map(toRow).sort(byDate), threshold };
}

async function loadSession(db: Db, sessionId: string) {
  const session = await db.testSession.findUnique({
    where: { id: sessionId },
    select: { id: true, testType: true, candidateProfileId: true, score: { select: { id: true, voidedAt: true } }, integrityReview: { select: { decision: true } } },
  });
  if (!session || !session.score) throw new IntegrityError(404, "Test result not found.");
  return { ...session, score: session.score };
}

/** "Clear flag": the admin looked and found no problem. The flag stops showing. */
export async function clearFlag(db: Db, actorId: string, sessionId: string) {
  const s = await loadSession(db, sessionId);
  if (s.integrityReview) throw new IntegrityError(409, "This test has already been reviewed.");
  const exits = (await windowExits(db, [s.id])).get(s.id) ?? 0;
  await db.$transaction([
    db.integrityReview.create({ data: { sessionId: s.id, decision: "CLEARED", reviewedById: actorId } }),
    db.auditLog.create({ data: { actorId, action: "INTEGRITY_FLAG_CLEARED", targetType: "TestSession", targetId: s.id, metadata: { testType: s.testType, exits } } }),
  ]);
}

/** "Void result": the result is no longer used anywhere, the candidate may retake at once, and a badge that depended on it is withdrawn. */
export async function voidResult(db: Db, actorId: string, sessionId: string) {
  const s = await loadSession(db, sessionId);
  if (s.integrityReview) throw new IntegrityError(409, "This test has already been reviewed.");
  const metBefore = await isTopPerformer(db, s.candidateProfileId);
  const exits = (await windowExits(db, [s.id])).get(s.id) ?? 0;
  await db.$transaction([
    db.score.update({ where: { id: s.score.id }, data: { voidedAt: new Date() } }),
    db.integrityReview.create({ data: { sessionId: s.id, decision: "VOIDED", reviewedById: actorId } }),
    db.auditLog.create({ data: { actorId, action: "INTEGRITY_RESULT_VOIDED", targetType: "TestSession", targetId: s.id, metadata: { testType: s.testType, exits } } }),
  ]);
  const badgeRemoved = await removeBadgeIfNoLongerEarned(db, s.candidateProfileId, actorId, metBefore);
  return { badgeRemoved };
}

/** "Undo void": the result counts again and the test goes back to waiting for review. The badge is re-checked. */
export async function undoVoid(db: Db, actorId: string, sessionId: string) {
  const s = await loadSession(db, sessionId);
  if (s.integrityReview?.decision !== "VOIDED") throw new IntegrityError(409, "This result is not voided.");
  await db.$transaction([
    db.score.update({ where: { id: s.score.id }, data: { voidedAt: null } }),
    db.integrityReview.delete({ where: { sessionId: s.id } }),
    db.auditLog.create({ data: { actorId, action: "INTEGRITY_VOID_UNDONE", targetType: "TestSession", targetId: s.id, metadata: { testType: s.testType } } }),
  ]);
  await evaluateTopPerformer(db, s.candidateProfileId);
}

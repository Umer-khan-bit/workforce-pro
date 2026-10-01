import type { PrismaClient, ShortlistStatus } from "@prisma/client";

/** Pure report maths for the hiring pipeline, kept apart from the database so it is easy to test. */

export type HistoryEntry = { shortlistId: string; status: ShortlistStatus; changedAt: Date };

export const FUNNEL_STAGES: ShortlistStatus[] = ["SHORTLISTED", "CONTACTED", "INTERVIEWING", "OFFERED", "HIRED"];
const DAY_MS = 86_400_000;

export type FunnelStep = { status: ShortlistStatus; count: number };

/**
 * The hiring funnel: for each stage, how many shortlisted candidates ever reached it. A candidate who was
 * shortlisted, contacted and then rejected counts in "Shortlisted" and "Contacted" but not beyond. Rejections
 * are reported separately.
 */
export function funnelFromHistory(shortlistIds: string[], history: HistoryEntry[]): { steps: FunnelStep[]; rejected: number } {
  const reached = new Map<string, Set<ShortlistStatus>>(shortlistIds.map((id) => [id, new Set<ShortlistStatus>(["SHORTLISTED"])]));
  for (const h of history) reached.get(h.shortlistId)?.add(h.status);
  const steps = FUNNEL_STAGES.map((status) => ({ status, count: [...reached.values()].filter((set) => set.has(status)).length }));
  return { steps, rejected: [...reached.values()].filter((set) => set.has("REJECTED")).length };
}

export type TimeToHire = { hires: number; averageDays: number | null; medianDays: number | null };

/** Days from being shortlisted to being hired, over every hire (the first time each reached those stages). */
export function timeToHireFromHistory(startedAt: Map<string, Date>, history: HistoryEntry[]): TimeToHire {
  const hiredAt = new Map<string, Date>();
  for (const h of history) {
    if (h.status !== "HIRED") continue;
    const prev = hiredAt.get(h.shortlistId);
    if (!prev || h.changedAt < prev) hiredAt.set(h.shortlistId, h.changedAt);
  }
  const days: number[] = [];
  for (const [id, hired] of hiredAt) {
    const start = startedAt.get(id);
    if (start) days.push(Math.max(0, (hired.getTime() - start.getTime()) / DAY_MS));
  }
  if (days.length === 0) return { hires: 0, averageDays: null, medianDays: null };
  days.sort((a, b) => a - b);
  const mid = Math.floor(days.length / 2);
  const median = days.length % 2 ? days[mid] : (days[mid - 1] + days[mid]) / 2;
  const round = (n: number) => Math.round(n * 10) / 10;
  return { hires: days.length, averageDays: round(days.reduce((a, b) => a + b, 0) / days.length), medianDays: round(median) };
}

export type Bucket = { label: string; start: Date; count: number };

/** Counts dates into weekly (for periods up to 120 days) or monthly buckets over the last `days` days, oldest first. */
export function bucketCounts(dates: Date[], days: number, now: Date = new Date()): Bucket[] {
  const monthly = days > 120;
  const buckets: Bucket[] = [];
  if (monthly) {
    const months = Math.max(1, Math.ceil(days / 30));
    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      buckets.push({ label: start.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }), start, count: 0 });
    }
  } else {
    const weeks = Math.max(1, Math.ceil(days / 7));
    const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY_MS; // tomorrow 00:00 UTC
    for (let i = weeks - 1; i >= 0; i--) {
      const start = new Date(end - (i + 1) * 7 * DAY_MS);
      buckets.push({ label: start.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }), start, count: 0 });
    }
  }
  for (const d of dates) {
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (d >= buckets[i].start) {
        buckets[i].count++;
        break;
      }
    }
  }
  return buckets;
}

export type Scope = { companyId?: string; recruiterId?: string };

type Db = Pick<PrismaClient, "shortlist" | "shortlistStatusHistory">;

const scopeWhere = (scope: Scope) => ({
  ...(scope.recruiterId ? { recruiterId: scope.recruiterId } : {}),
  ...(scope.companyId ? { recruiter: { companyId: scope.companyId } } : {}),
});

/** Funnel and time-to-hire for the shortlists created in the last `days` days within a scope (a recruiter, a company, or everyone). */
export async function hiringReport(db: Db, scope: Scope, days: number, now = new Date()) {
  const since = new Date(now.getTime() - days * DAY_MS);
  const shortlists = await db.shortlist.findMany({ where: { ...scopeWhere(scope), createdAt: { gte: since } }, select: { id: true, createdAt: true } });
  const ids = shortlists.map((s) => s.id);
  const history = ids.length ? await db.shortlistStatusHistory.findMany({ where: { shortlistId: { in: ids } }, select: { shortlistId: true, status: true, changedAt: true } }) : [];
  const funnel = funnelFromHistory(ids, history);
  const startedAt = new Map(shortlists.map((s) => [s.id, history.find((h) => h.shortlistId === s.id && h.status === "SHORTLISTED")?.changedAt ?? s.createdAt]));
  const timeToHire = timeToHireFromHistory(startedAt, history);
  const shortlistedDates = shortlists.map((s) => startedAt.get(s.id)!);
  const hiredDates = history.filter((h) => h.status === "HIRED").map((h) => h.changedAt);
  return {
    funnel,
    timeToHire,
    shortlisted: bucketCounts(shortlistedDates, days, now),
    hired: bucketCounts(hiredDates, days, now),
    total: ids.length,
  };
}

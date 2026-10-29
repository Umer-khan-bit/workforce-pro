import type { PrismaClient } from "@prisma/client";
import { latestResults, type LatestResult } from "@/lib/results/latest";
import { integrityLine, integritySummaries } from "@/lib/integrity/summary";
import { isTopPerformer } from "@/lib/results/topPerformer";
import { viewCandidateAsRecruiter } from "./candidateAccess";
import type { Entitlements } from "./entitlements";

export type CandidateDetail = {
  id: string;
  name: string | null;
  city: string | null;
  region: string | null;
  jobRole: string | null;
  experienceYears: number | null;
  topPerformer: boolean;
  hasBadge: boolean;
  results: LatestResult[];
  /** Per test: "Integrity: no concerns" or "Integrity: N window exits". Counts only; a cleared flag reads as no concerns. */
  integrity: Record<string, string>;
  /** The recruiter's own shortlist entries and contact requests for this candidate. */
  shortlists: { id: string; status: string; jobOpeningId: string }[];
  requests: { id: string; status: string; jobOpeningId: string; sentAt: Date; respondedAt: Date | null; email: string | null; phone: string | null }[];
};

type Db = PrismaClient;

/**
 * The candidate detail report for a recruiter, or null when they may not see this candidate (unknown, deleted,
 * the offer is below their minimum salary, the plan does not include search, or the candidate is a Top
 * Performer and the plan lacks exclusive Q1 access). A successful view is written to the audit log. The
 * candidate's minimum salary is never included; phone and email are included only after the candidate has
 * accepted that recruiter's request.
 */
export async function getCandidateDetail(
  db: Db,
  args: { recruiterUserId: string; companyId: string; candidateProfileId: string; offerMax: number; entitlements: Entitlements }
): Promise<CandidateDetail | null> {
  if (!args.entitlements.canSearch) return null;
  // The Top Performer rule is checked before the view is logged, so a refused view leaves no trace.
  const topPerformer = await isTopPerformer(db, args.candidateProfileId);
  if (topPerformer && !args.entitlements.canSeeTopPerformers) return null;

  const base = await viewCandidateAsRecruiter(db, { recruiterUserId: args.recruiterUserId, companyId: args.companyId, candidateProfileId: args.candidateProfileId, offerMax: args.offerMax });
  if (!base) return null;

  const [results, shortlists, requests] = await Promise.all([
    latestResults(db, base.id),
    db.shortlist.findMany({ where: { candidateProfileId: base.id, recruiterId: args.recruiterUserId }, select: { id: true, status: true, jobOpeningId: true } }),
    db.contactRequest.findMany({
      where: { candidateProfileId: base.id, recruiter: { companyId: args.companyId } },
      orderBy: { sentAt: "desc" },
      select: { id: true, status: true, jobOpeningId: true, sentAt: true, respondedAt: true, candidateProfile: { select: { phone: true, user: { select: { email: true } } } } },
    }),
  ]);

  const summaries = await integritySummaries(db, results.map((r) => r.sessionId));
  const integrity = Object.fromEntries(results.map((r) => {
    const s = summaries.get(r.sessionId);
    return [r.testType, integrityLine(s && !s.cleared ? s.exits : 0)];
  }));

  return {
    id: base.id,
    name: base.user.name,
    city: base.city,
    region: base.region?.name ?? null,
    jobRole: base.jobRole?.name ?? null,
    experienceYears: base.experienceYears,
    topPerformer,
    hasBadge: base.badges.length > 0,
    results,
    integrity,
    shortlists,
    requests: requests.map((r) => ({
      id: r.id,
      status: r.status,
      jobOpeningId: r.jobOpeningId,
      sentAt: r.sentAt,
      respondedAt: r.respondedAt,
      email: r.status === "ACCEPTED" ? r.candidateProfile.user.email : null,
      phone: r.status === "ACCEPTED" ? r.candidateProfile.phone : null,
    })),
  };
}

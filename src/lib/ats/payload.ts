import type { PrismaClient, ShortlistStatus } from "@prisma/client";
import { recruiterVisibleWhere } from "@/lib/recruiter/candidateAccess";
import { buildRows, loadLatestResults } from "@/lib/recruiter/search";
import { getEntitlements } from "@/lib/recruiter/entitlements";
import { readSetting } from "@/lib/settings/store";

/** What a company's ATS (or the CSV export) receives about one shortlisted candidate. Never the minimum salary. */
export type AtsCandidate = {
  /** Our reference for the shortlist entry: the same value on every later webhook and API call. */
  reference: string;
  status: ShortlistStatus;
  shortlistedAt: string;
  statusChangedAt: string;
  jobOpening: { id: string; title: string | null; jobRole: string; city: string | null };
  candidate: {
    id: string;
    name: string | null;
    jobRole: string | null;
    city: string | null;
    experienceYears: number | null;
    topPerformer: boolean;
    results: { test: string; quartile: number | null; percentile: number | null; cefrLevel: string | null }[];
    /** Present only after the candidate accepted this company's contact request. */
    contact: { email: string; phone: string | null } | null;
  };
};

type Db = PrismaClient;

export type ShortlistQuery = {
  companyId: string;
  /** Limit to one recruiter's own entries (company admins see the whole company). */
  recruiterId?: string;
  status?: ShortlistStatus;
  openingId?: string;
  ids?: string[];
  limit?: number;
};

/**
 * The company's shortlisted candidates in the shape the ATS gets. The same rules as everywhere else apply: only
 * candidates whose minimum still fits the opening's offer, not deleted, and Top Performers only when the plan has
 * exclusive Q1 access. Contact details only for accepted requests.
 */
export async function loadAtsCandidates(db: Db, q: ShortlistQuery): Promise<AtsCandidate[]> {
  const openings = await db.jobOpening.findMany({ where: { companyId: q.companyId, ...(q.openingId ? { id: q.openingId } : {}) }, select: { id: true, salaryRangeMax: true } });
  if (openings.length === 0) return [];
  const [ent, rule] = await Promise.all([getEntitlements(q.companyId), readSetting(db, "topPerformer")]);

  const entries = await db.shortlist.findMany({
    where: {
      recruiter: { companyId: q.companyId },
      ...(q.recruiterId ? { recruiterId: q.recruiterId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.ids ? { id: { in: q.ids } } : {}),
      OR: openings.map((o) => ({ jobOpeningId: o.id, candidateProfile: recruiterVisibleWhere(o.salaryRangeMax) })),
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: Math.min(q.limit ?? 500, 1000),
    include: {
      jobOpening: { select: { id: true, title: true, city: true, jobRole: { select: { name: true } } } },
      statusHistory: { orderBy: { changedAt: "desc" }, take: 1, select: { changedAt: true } },
      candidateProfile: { select: { id: true, city: true, experienceYears: true, phone: true, jobRole: { select: { name: true } }, user: { select: { name: true, email: true } } } },
    },
  });
  const profileIds = [...new Set(entries.map((e) => e.candidateProfileId))];
  const results = await loadLatestResults(db, profileIds);
  const rows = new Map(buildRows(entries.map((e) => ({ id: e.candidateProfileId, city: e.candidateProfile.city, experienceYears: e.candidateProfile.experienceYears, jobRole: e.candidateProfile.jobRole, user: { name: e.candidateProfile.user.name } })), results, rule).map((r) => [r.id, r]));
  const accepted = await db.contactRequest.findMany({ where: { status: "ACCEPTED", candidateProfileId: { in: profileIds }, jobOpening: { companyId: q.companyId } }, select: { candidateProfileId: true } });
  const acceptedSet = new Set(accepted.map((a) => a.candidateProfileId));

  return entries.flatMap((e): AtsCandidate[] => {
    const row = rows.get(e.candidateProfileId)!;
    if (row.topPerformer && !ent.canSeeTopPerformers) return [];
    const rs = results.get(e.candidateProfileId) ?? [];
    return [
      {
        reference: e.id,
        status: e.status,
        shortlistedAt: e.createdAt.toISOString(),
        statusChangedAt: (e.statusHistory[0]?.changedAt ?? e.updatedAt).toISOString(),
        jobOpening: { id: e.jobOpening.id, title: e.jobOpening.title, jobRole: e.jobOpening.jobRole.name, city: e.jobOpening.city },
        candidate: {
          id: e.candidateProfileId,
          name: e.candidateProfile.user.name,
          jobRole: e.candidateProfile.jobRole?.name ?? null,
          city: e.candidateProfile.city,
          experienceYears: e.candidateProfile.experienceYears,
          topPerformer: row.topPerformer,
          results: rs.map((r) => ({ test: r.testType, quartile: r.quartile, percentile: r.percentile, cefrLevel: r.cefrLevel })),
          contact: acceptedSet.has(e.candidateProfileId) ? { email: e.candidateProfile.user.email, phone: e.candidateProfile.phone } : null,
        },
      },
    ];
  });
}

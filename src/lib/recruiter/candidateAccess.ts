import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * The minimum-salary rule, in one place. A recruiter can only see or contact a candidate whose minimum
 * salary fits the offer (the job opening's top salary, or the offer entered in a search). A candidate who
 * has not stated a minimum fits any offer. Every query that shows candidates to a recruiter or company
 * admin must start from `recruiterVisibleWhere`, and every contact must pass `meetsOffer`.
 */

/** True when the candidate's minimum is at or below the offer. No stated minimum means no restriction. */
export function meetsOffer(minimumSalary: number | null | undefined, offerMax: number): boolean {
  return minimumSalary === null || minimumSalary === undefined || minimumSalary <= offerMax;
}

/**
 * Prisma filter for the candidates a recruiter may see for this offer: real accounts only (not anonymised,
 * consent given, user active) whose minimum fits the offer. Combine it with search filters using AND.
 */
export function recruiterVisibleWhere(offerMax: number): Prisma.CandidateProfileWhereInput {
  return {
    anonymisedAt: null,
    consentGiven: true,
    user: { isActive: true },
    OR: [{ minimumSalary: null }, { minimumSalary: { lte: offerMax } }],
  };
}

/**
 * What a recruiter may read about a candidate. The candidate's minimum salary and contact details are
 * never included: a recruiter only learns that the offer fits. Phone and email stay private until the
 * candidate accepts a contact request.
 */
export const RECRUITER_CANDIDATE_SELECT = {
  id: true,
  city: true,
  experienceYears: true,
  jobRole: { select: { id: true, name: true } },
  region: { select: { id: true, name: true } },
  badges: { select: { type: true } },
  user: { select: { name: true } },
} satisfies Prisma.CandidateProfileSelect;

type Db = Pick<PrismaClient, "candidateProfile" | "auditLog">;

/**
 * One candidate as a recruiter sees them, or null if they may not (unknown, anonymised, or the offer is
 * below their minimum - indistinguishable on purpose). Every successful view is written to the audit log.
 */
export async function viewCandidateAsRecruiter(
  db: Db,
  args: { recruiterUserId: string; companyId: string; candidateProfileId: string; offerMax: number }
) {
  const candidate = await db.candidateProfile.findFirst({
    where: { AND: [{ id: args.candidateProfileId }, recruiterVisibleWhere(args.offerMax)] },
    select: RECRUITER_CANDIDATE_SELECT,
  });
  if (!candidate) return null;
  await db.auditLog.create({
    data: {
      actorId: args.recruiterUserId,
      action: "CANDIDATE_PROFILE_VIEWED",
      targetType: "CandidateProfile",
      targetId: args.candidateProfileId,
      metadata: { companyId: args.companyId },
    },
  });
  return candidate;
}

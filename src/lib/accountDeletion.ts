import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/password";

/**
 * Deletes a candidate's account the privacy-safe way: personal data is erased, but the account row
 * stays (anonymised) so test statistics and the audit trail remain intact.
 *
 * Erased: name, email (replaced by an unusable address), password, phone, city, minimum salary,
 * notifications, AI feedback, badges, written essay text, shortlist entries, contact requests and
 * ATS exports about the candidate, sign-in links and sessions.
 * Kept for calibration: test sessions, answers and scores, plus region, job role and years of
 * experience (needed to check questions for bias). The audit log keeps the event.
 */
export async function anonymiseCandidate(prisma: PrismaClient, userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { candidateProfile: true } });
  if (!user || user.role !== "CANDIDATE" || !user.candidateProfile || user.candidateProfile.anonymisedAt) return false;

  const profileId = user.candidateProfile.id;
  const unusablePassword = await hashPassword(randomBytes(32).toString("base64url"));
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@deleted.invalid`,
        name: null,
        password: unusablePassword,
        isActive: false,
        emailVerified: null,
        mustChangePassword: false,
        passwordChangedAt: now,
      },
    });
    await tx.candidateProfile.update({
      where: { id: profileId },
      data: { phone: null, city: null, minimumSalary: null, anonymisedAt: now },
    });

    await tx.authToken.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });

    await tx.aIFeedback.deleteMany({ where: { candidateProfileId: profileId } });
    await tx.badge.deleteMany({ where: { candidateProfileId: profileId } });
    await tx.shortlistStatusHistory.deleteMany({ where: { shortlist: { candidateProfileId: profileId } } });
    await tx.shortlist.deleteMany({ where: { candidateProfileId: profileId } });
    await tx.contactRequest.deleteMany({ where: { candidateProfileId: profileId } });
    await tx.atsExport.deleteMany({ where: { candidateProfileId: profileId } });
    // The essay is the candidate's own writing; its CEFR grade and the session statistics stay.
    await tx.writingAssessment.updateMany({
      where: { session: { candidateProfileId: profileId } },
      data: { essayText: "[removed]", feedback: null },
    });

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "CANDIDATE_ACCOUNT_DELETED",
        targetType: "User",
        targetId: userId,
        metadata: { candidateProfileId: profileId },
      },
    });
  });
  return true;
}

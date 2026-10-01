import type { PrismaClient, TestType } from "@prisma/client";
import { readSetting } from "@/lib/settings/store";

/**
 * True when finishing a course for this test lets the candidate retake it before the usual waiting period
 * ends (Settings > Training > "Retake straight after a course"). Only a course completed AFTER the last
 * attempt counts, so one course cannot unlock several retakes.
 */
export async function trainingUnlocksRetake(
  db: Pick<PrismaClient, "enrollment" | "siteSetting">,
  candidateProfileId: string,
  testType: TestType,
  lastAttemptAt: Date
): Promise<boolean> {
  const training = await readSetting(db, "training");
  if (training.skipWaitAfterCourse !== "yes") return false;
  const finished = await db.enrollment.count({
    where: { candidateProfileId, status: "COMPLETED", completedAt: { gt: lastAttemptAt }, course: { testType } },
  });
  return finished > 0;
}

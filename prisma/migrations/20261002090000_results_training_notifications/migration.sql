-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AiRunKind" ADD VALUE 'FEEDBACK';
ALTER TYPE "AiRunKind" ADD VALUE 'RECOMMEND';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TRAINING_UPDATE';
ALTER TYPE "NotificationType" ADD VALUE 'CONTACT_REQUEST';

-- DropIndex
DROP INDEX "Notification_userId_idx";

-- AlterTable
ALTER TABLE "AIFeedback" ADD COLUMN     "model" TEXT,
ADD COLUMN     "scoreId" TEXT;

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "testType" "TestType";

-- AlterTable
ALTER TABLE "CourseLesson" ADD COLUMN     "durationMinutes" INTEGER;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "link" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "courseId" TEXT,
ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "CourseRecommendation" (
    "id" TEXT NOT NULL,
    "candidateProfileId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseRecommendation_candidateProfileId_idx" ON "CourseRecommendation"("candidateProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseRecommendation_candidateProfileId_courseId_key" ON "CourseRecommendation"("candidateProfileId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "AIFeedback_scoreId_key" ON "AIFeedback"("scoreId");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_candidateProfileId_type_key" ON "Badge"("candidateProfileId", "type");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Payment_courseId_idx" ON "Payment"("courseId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIFeedback" ADD CONSTRAINT "AIFeedback_scoreId_fkey" FOREIGN KEY ("scoreId") REFERENCES "Score"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseRecommendation" ADD CONSTRAINT "CourseRecommendation_candidateProfileId_fkey" FOREIGN KEY ("candidateProfileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseRecommendation" ADD CONSTRAINT "CourseRecommendation_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;


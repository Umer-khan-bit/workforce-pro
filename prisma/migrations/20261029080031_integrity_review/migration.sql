-- CreateEnum
CREATE TYPE "IntegrityDecision" AS ENUM ('CLEARED', 'VOIDED');

-- AlterTable
ALTER TABLE "Score" ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "IntegrityReview" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "decision" "IntegrityDecision" NOT NULL,
    "reviewedById" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrityReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrityReview_sessionId_key" ON "IntegrityReview"("sessionId");

-- CreateIndex
CREATE INDEX "IntegrityReview_decision_idx" ON "IntegrityReview"("decision");

-- AddForeignKey
ALTER TABLE "IntegrityReview" ADD CONSTRAINT "IntegrityReview_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrityReview" ADD CONSTRAINT "IntegrityReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'OTHER');

-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "prefix" TEXT;

-- AlterTable
ALTER TABLE "CandidateProfile" ADD COLUMN     "gender" "Gender";

-- AlterTable
ALTER TABLE "ItemStatistic" ADD COLUMN     "reviewedAtCount" INTEGER;

-- AlterTable
ALTER TABLE "RecalibrationRun" ADD COLUMN     "error" TEXT,
ADD COLUMN     "itemsChecked" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "itemsFlagged" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WebhookDelivery" ADD COLUMN     "error" TEXT,
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN     "responseStatus" INTEGER;

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "summary" JSONB,
    "error" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FairnessReport" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "FairnessReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockAtsCandidate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MockAtsCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobRun_job_startedAt_idx" ON "JobRun"("job", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FairnessReport_month_key" ON "FairnessReport"("month");

-- CreateIndex
CREATE UNIQUE INDEX "MockAtsCandidate_externalId_key" ON "MockAtsCandidate"("externalId");

-- CreateIndex
CREATE INDEX "MockAtsCandidate_companyId_idx" ON "MockAtsCandidate"("companyId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "MockAtsCandidate" ADD CONSTRAINT "MockAtsCandidate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "QuestionSource" AS ENUM ('MANUAL', 'IMPORTED', 'AI_GENERATED', 'AI_TRANSLATED');

-- CreateEnum
CREATE TYPE "ReviewVerdict" AS ENUM ('OK', 'NEEDS_FIX', 'REJECT');

-- CreateEnum
CREATE TYPE "AiRunKind" AS ENUM ('GENERATE', 'TRANSLATE');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Language" ADD COLUMN     "isRtl" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "aiRunId" TEXT,
ADD COLUMN     "explanation" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewNotes" TEXT,
ADD COLUMN     "reviewVerdict" "ReviewVerdict",
ADD COLUMN     "source" "QuestionSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "translationOfId" TEXT;

-- CreateTable
CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "kind" "AiRunKind" NOT NULL,
    "actorId" TEXT,
    "model" TEXT NOT NULL,
    "reviewModel" TEXT NOT NULL,
    "testType" "TestType",
    "languageId" TEXT,
    "jobRoleId" TEXT,
    "difficulty" "Difficulty",
    "requested" INTEGER NOT NULL,
    "created" INTEGER NOT NULL DEFAULT 0,
    "dropped" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costEstimate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "AiRunStatus" NOT NULL DEFAULT 'COMPLETED',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRun_createdAt_idx" ON "AiRun"("createdAt");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_translationOfId_fkey" FOREIGN KEY ("translationOfId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Starting values for existing rows: the IPIP items were imported, and Urdu is right-to-left.
UPDATE "Question" SET "source" = 'IMPORTED' WHERE "testType" = 'PERSONALITY';
UPDATE "Language" SET "isRtl" = true WHERE "code" = 'ur';

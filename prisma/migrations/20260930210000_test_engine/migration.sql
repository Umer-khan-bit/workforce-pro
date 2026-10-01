-- AlterEnum
ALTER TYPE "AiRunKind" ADD VALUE 'GRADE';

-- AlterTable
ALTER TABLE "Response" ADD COLUMN     "isScored" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Score" ADD COLUMN     "cohortScope" TEXT,
ADD COLUMN     "cohortSize" INTEGER,
ADD COLUMN     "details" JSONB,
ADD COLUMN     "provisional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rankValue" DOUBLE PRECISION,
ADD COLUMN     "standardError" DOUBLE PRECISION,
ADD COLUMN     "theta" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "TestSession" ADD COLUMN     "languageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Response_sessionId_questionId_key" ON "Response"("sessionId", "questionId");


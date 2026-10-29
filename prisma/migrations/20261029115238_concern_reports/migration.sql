-- CreateTable
CREATE TABLE "ConcernReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "recruiterId" TEXT NOT NULL,
    "candidateProfileId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "testType" "TestType" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "ConcernReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConcernReport_reviewedAt_idx" ON "ConcernReport"("reviewedAt");

-- CreateIndex
CREATE INDEX "ConcernReport_candidateProfileId_idx" ON "ConcernReport"("candidateProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "ConcernReport_companyId_sessionId_key" ON "ConcernReport"("companyId", "sessionId");

-- AddForeignKey
ALTER TABLE "ConcernReport" ADD CONSTRAINT "ConcernReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConcernReport" ADD CONSTRAINT "ConcernReport_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConcernReport" ADD CONSTRAINT "ConcernReport_candidateProfileId_fkey" FOREIGN KEY ("candidateProfileId") REFERENCES "CandidateProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConcernReport" ADD CONSTRAINT "ConcernReport_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConcernReport" ADD CONSTRAINT "ConcernReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

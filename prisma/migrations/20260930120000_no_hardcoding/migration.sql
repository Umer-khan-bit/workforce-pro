-- CreateEnum
CREATE TYPE "PlanFeatureKind" AS ENUM ('BOOLEAN', 'LIMIT');

-- DropIndex
DROP INDEX "Plan_name_key";

-- DropIndex
DROP INDEX "SalaryBenchmark_jobRoleId_city_experienceBand_key";

-- AlterTable
ALTER TABLE "Language" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "currency" DROP DEFAULT;

-- AlterTable: Plan keeps its rows. The fixed BASIC/ADVANCED enum becomes editable text.
ALTER TABLE "Plan" ADD COLUMN     "code" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Plan" ALTER COLUMN "name" TYPE TEXT USING "name"::text;
UPDATE "Plan" SET "code" = lower("name"),
  "sortOrder" = CASE "name" WHEN 'BASIC' THEN 1 WHEN 'ADVANCED' THEN 2 ELSE 0 END;
UPDATE "Plan" SET "name" = initcap(lower("name"));
-- Starting values for the new plan features on the two existing plans (editable in the admin panel).
UPDATE "Plan" SET "features" = "features"::jsonb || '{"aiSearch": false, "atsApiAccess": false, "maxShortlists": 25, "maxJobOpenings": 5}'::jsonb WHERE "code" = 'basic';
UPDATE "Plan" SET "features" = "features"::jsonb || '{"aiSearch": true, "atsApiAccess": true, "maxShortlists": null, "maxJobOpenings": null}'::jsonb WHERE "code" = 'advanced';
ALTER TABLE "Plan" ALTER COLUMN "code" SET NOT NULL;

-- AlterTable
ALTER TABLE "Question" ALTER COLUMN "aParam" DROP DEFAULT,
ALTER COLUMN "bParam" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Region" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "SalaryBenchmark" DROP COLUMN "experienceBand",
ADD COLUMN     "experienceBandId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "TestConfig" ALTER COLUMN "minItems" DROP DEFAULT,
ALTER COLUMN "maxItems" DROP DEFAULT,
ALTER COLUMN "seThreshold" DROP DEFAULT,
ALTER COLUMN "timeLimitMinutes" DROP DEFAULT,
ALTER COLUMN "retakeWaitingDays" DROP DEFAULT,
ALTER COLUMN "pretestItemCount" DROP DEFAULT;

-- DropEnum
DROP TYPE "PlanName";

-- CreateTable
CREATE TABLE "PlanFeature" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "kind" "PlanFeatureKind" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlanFeature_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceBand" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "minYears" INTEGER NOT NULL,
    "maxYears" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExperienceBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PolicyDocument" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "PolicyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "City_regionId_name_key" ON "City"("regionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ExperienceBand_label_key" ON "ExperienceBand"("label");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyDocument_kind_version_key" ON "PolicyDocument"("kind", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryBenchmark_jobRoleId_city_experienceBandId_key" ON "SalaryBenchmark"("jobRoleId", "city", "experienceBandId");

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryBenchmark" ADD CONSTRAINT "SalaryBenchmark_experienceBandId_fkey" FOREIGN KEY ("experienceBandId") REFERENCES "ExperienceBand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


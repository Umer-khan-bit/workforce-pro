-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "previousVersionId" TEXT;

-- CreateIndex
CREATE INDEX "Question_previousVersionId_idx" ON "Question"("previousVersionId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Safety net for question versioning: once candidates have answered a question, its wording, answers
-- and what it measures can no longer be changed (the app refuses too; this protects against scripts
-- and future code). Calibration (difficulty values), status, explanation and review notes may still change.
CREATE OR REPLACE FUNCTION prevent_edit_of_answered_question() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Response" WHERE "questionId" = OLD."id") THEN
    IF NEW."content" IS DISTINCT FROM OLD."content"
       OR NEW."options" IS DISTINCT FROM OLD."options"
       OR NEW."correctAnswer" IS DISTINCT FROM OLD."correctAnswer"
       OR NEW."type" IS DISTINCT FROM OLD."type"
       OR NEW."testType" IS DISTINCT FROM OLD."testType"
       OR NEW."reverseKeyed" IS DISTINCT FROM OLD."reverseKeyed"
       OR NEW."topic" IS DISTINCT FROM OLD."topic"
       OR NEW."languageId" IS DISTINCT FROM OLD."languageId"
       OR NEW."jobRoleId" IS DISTINCT FROM OLD."jobRoleId" THEN
      RAISE EXCEPTION 'Question % has candidate responses and cannot be changed; retire it and add a new version', OLD."id"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Question_answered_is_frozen"
  BEFORE UPDATE OF "content", "options", "correctAnswer", "type", "testType", "reverseKeyed", "topic", "languageId", "jobRoleId"
  ON "Question"
  FOR EACH ROW EXECUTE FUNCTION prevent_edit_of_answered_question();

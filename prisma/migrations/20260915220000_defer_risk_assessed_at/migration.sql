ALTER TABLE "risk_assessments"
  ALTER COLUMN "assessed_at" DROP NOT NULL,
  ALTER COLUMN "assessed_at" DROP DEFAULT;

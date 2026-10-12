ALTER TABLE "risk_assessments"
ADD COLUMN "methodology_version" VARCHAR(100) NOT NULL DEFAULT 'SECURAAI-RISK-MATRIX-v1';

COMMENT ON COLUMN "risk_assessments"."methodology_version" IS
'Version of the scoring methodology used to produce the assessment.';

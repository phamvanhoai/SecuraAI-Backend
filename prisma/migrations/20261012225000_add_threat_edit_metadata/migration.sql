ALTER TABLE "risk_threats"
ADD COLUMN "updated_at" TIMESTAMPTZ(6),
ADD COLUMN "updated_by" UUID;

UPDATE "risk_threats" AS threat
SET
  "updated_at" = threat."created_at",
  "updated_by" = risk."created_by"
FROM "risks" AS risk
WHERE risk."id" = threat."risk_id";

ALTER TABLE "risk_threats"
ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "updated_at" SET NOT NULL,
ALTER COLUMN "updated_by" SET NOT NULL;

ALTER TABLE "risk_threats"
ADD CONSTRAINT "fk_risk_threat_updated_by"
FOREIGN KEY ("updated_by") REFERENCES "users"("id")
ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX "idx_risk_threats_updated_by"
ON "risk_threats"("updated_by");

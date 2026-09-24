ALTER TABLE "risk_treatment_plans"
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(6),
  ADD COLUMN "cancelled_by_user_id" UUID,
  ADD COLUMN "cancellation_reason" TEXT;

UPDATE "risk_treatment_plans"
SET
  "cancelled_at" = COALESCE("updated_at", NOW()),
  "cancelled_by_user_id" = COALESCE("created_by_user_id", "owner_user_id"),
  "cancellation_reason" = 'Cancelled before cancellation details were recorded.'
WHERE "status" = 'cancelled';

ALTER TABLE "risk_treatment_plans"
  ADD CONSTRAINT "risk_treatment_plans_cancelled_by_user_id_fkey"
  FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users" ("user_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION
  DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX "risk_treatment_plans_cancelled_by_user_id_idx"
  ON "risk_treatment_plans" ("cancelled_by_user_id");

CREATE TABLE "risk_treatment_plan_controls" (
  "treatment_plan_id" UUID NOT NULL,
  "control_id" UUID NOT NULL,
  "linked_by" UUID NOT NULL,
  "linked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "risk_treatment_plan_controls_pkey" PRIMARY KEY ("treatment_plan_id", "control_id"),
  CONSTRAINT "fk_treatment_plan_control_plan" FOREIGN KEY ("treatment_plan_id") REFERENCES "risk_treatment_plans"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_treatment_plan_control_control" FOREIGN KEY ("control_id") REFERENCES "security_controls"("id"),
  CONSTRAINT "fk_treatment_plan_control_linked_by" FOREIGN KEY ("linked_by") REFERENCES "users"("id")
);

CREATE INDEX "idx_treatment_plan_controls_control" ON "risk_treatment_plan_controls"("control_id");
CREATE INDEX "idx_treatment_plan_controls_linked_by" ON "risk_treatment_plan_controls"("linked_by");

-- Preserve the meaning of legacy plans: before this table existed, controls selected
-- during plan creation were stored only as Risk-Control links.
INSERT INTO "risk_treatment_plan_controls" ("treatment_plan_id", "control_id", "linked_by", "linked_at")
SELECT p."id", l."control_id", p."created_by", p."created_at"
FROM "risk_treatment_plans" p
JOIN "control_risk_links" l ON l."risk_id" = p."risk_id"
ON CONFLICT DO NOTHING;

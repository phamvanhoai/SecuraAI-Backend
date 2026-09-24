ALTER TABLE "approval_requests"
  ADD COLUMN "submission_note" TEXT,
  ADD COLUMN "entity_snapshot" JSONB;

ALTER TABLE "risk_treatment_plans"
  DROP CONSTRAINT "ck_risk_treatment_plans_02";

ALTER TABLE "risk_treatment_plans"
  ADD CONSTRAINT "ck_risk_treatment_plans_02" CHECK (
    status IN (
      'draft',
      'pending_approval',
      'approved',
      'in_progress',
      'completed',
      'rejected',
      'cancelled'
    )
    AND (
      status NOT IN ('pending_approval', 'approved', 'in_progress', 'completed')
      OR submitted_at IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION "touch_risk_treatment_plan_on_action_change"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "risk_treatment_plans"
  SET "updated_at" = clock_timestamp()
  WHERE "risk_treatment_plan_id" = COALESCE(NEW."risk_treatment_plan_id", OLD."risk_treatment_plan_id");
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "trg_touch_risk_treatment_plan_on_action_change"
AFTER INSERT OR UPDATE OR DELETE ON "risk_treatment_actions"
FOR EACH ROW
EXECUTE FUNCTION "touch_risk_treatment_plan_on_action_change"();

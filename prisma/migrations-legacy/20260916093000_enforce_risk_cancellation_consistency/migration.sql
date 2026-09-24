ALTER TABLE "risk_assessments"
  DROP CONSTRAINT "ck_risk_assessments_08";

ALTER TABLE "risk_assessments"
  ADD CONSTRAINT "ck_risk_assessments_08" CHECK (
    status IN (
      'draft',
      'pending_approval',
      'approved',
      'in_treatment',
      'closed',
      'rejected',
      'cancelled'
    )
    AND (
      (
        status = 'cancelled'
        AND cancelled_at IS NOT NULL
        AND cancelled_by_user_id IS NOT NULL
        AND cancelled_by_full_name IS NOT NULL
        AND cancellation_reason IS NOT NULL
        AND char_length(btrim(cancellation_reason)) >= 10
      )
      OR (
        status <> 'cancelled'
        AND cancelled_at IS NULL
        AND cancelled_by_user_id IS NULL
        AND cancelled_by_full_name IS NULL
        AND cancellation_reason IS NULL
      )
    )
  );

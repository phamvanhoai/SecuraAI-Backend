-- Repair records created before treatment-plan activation synchronized the parent Risk.
UPDATE risks AS risk
SET
  status = 'UNDER_TREATMENT',
  updated_at = CURRENT_TIMESTAMP
WHERE risk.status = 'OPEN'
  AND EXISTS (
    SELECT 1
    FROM risk_treatment_plans AS plan
    WHERE plan.risk_id = risk.id
      AND plan.status = 'ACTIVE'
  );

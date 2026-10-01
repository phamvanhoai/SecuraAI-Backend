WITH ranked_open_plans AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY risk_id
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS open_plan_rank
  FROM risk_treatment_plans
  WHERE status IN ('DRAFT', 'ACTIVE')
)
UPDATE risk_treatment_plans AS plan
SET status = 'CANCELLED', updated_at = now()
FROM ranked_open_plans AS ranked
WHERE plan.id = ranked.id
  AND ranked.open_plan_rank > 1;

CREATE UNIQUE INDEX uq_risk_treatment_plans_one_open_per_risk
ON risk_treatment_plans (risk_id)
WHERE status IN ('DRAFT', 'ACTIVE');

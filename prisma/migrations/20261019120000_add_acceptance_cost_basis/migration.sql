BEGIN;
ALTER TABLE public.risk_treatment_plans ADD COLUMN acceptance_cost_basis jsonb;

-- NULL preserves legacy plans; application validation requires a complete
-- justification for new/updated Accept plans and new acceptance submissions.
ALTER TABLE public.risk_treatment_plans ADD CONSTRAINT chk_treatment_acceptance_cost_basis CHECK (
  acceptance_cost_basis IS NULL OR COALESCE((
    strategy = 'ACCEPT'
    AND jsonb_typeof(acceptance_cost_basis) = 'object'
    AND jsonb_typeof(acceptance_cost_basis->'costToFix') = 'string'
    AND jsonb_typeof(acceptance_cost_basis->'expectedLoss') = 'string'
    AND (acceptance_cost_basis->>'costToFix') ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$'
    AND (acceptance_cost_basis->>'expectedLoss') ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$'
    AND (acceptance_cost_basis->>'currency') IN ('VND', 'USD')
    AND ((acceptance_cost_basis->>'currency') <> 'VND' OR (
      (acceptance_cost_basis->>'costToFix') ~ '^(0|[1-9][0-9]{0,11})(\.0{1,2})?$'
      AND (acceptance_cost_basis->>'expectedLoss') ~ '^(0|[1-9][0-9]{0,11})(\.0{1,2})?$'
    ))
    AND CASE WHEN jsonb_typeof(acceptance_cost_basis->'periodMonths') = 'number'
      THEN (acceptance_cost_basis->>'periodMonths')::numeric BETWEEN 1 AND 120
        AND trunc((acceptance_cost_basis->>'periodMonths')::numeric) = (acceptance_cost_basis->>'periodMonths')::numeric
      ELSE false END
    AND jsonb_typeof(acceptance_cost_basis->'basis') = 'string'
    AND length(btrim(acceptance_cost_basis->>'basis')) BETWEEN 10 AND 2000
  ), false)
);
COMMIT;

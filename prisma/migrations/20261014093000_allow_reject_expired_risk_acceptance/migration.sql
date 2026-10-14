BEGIN;
ALTER TABLE public.risk_acceptances
  DROP CONSTRAINT chk_risk_acceptance_valid_until,
  ADD CONSTRAINT chk_risk_acceptance_valid_until CHECK (
    decision <> 'APPROVED' OR valid_until IS NULL OR decided_at IS NULL
    OR valid_until >= (decided_at AT TIME ZONE 'UTC')::date
  );
COMMIT;

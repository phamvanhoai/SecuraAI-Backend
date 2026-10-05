-- Unknown historical scopes remain NULL: do not infer a service from asset membership.
ALTER TABLE public.risks
  ADD COLUMN scope_type varchar(30),
  ADD COLUMN business_service_id uuid,
  ADD CONSTRAINT fk_risk_business_service FOREIGN KEY (business_service_id)
    REFERENCES public.business_services(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT chk_risk_scope CHECK (
    (scope_type IS NULL AND business_service_id IS NULL)
    OR (scope_type IS NOT NULL AND (
      (scope_type = 'ASSET' AND business_service_id IS NULL)
      OR (scope_type = 'BUSINESS_SERVICE' AND business_service_id IS NOT NULL)
    ))
  );
CREATE INDEX idx_risks_business_service ON public.risks(business_service_id);
COMMENT ON COLUMN public.risks.scope_type IS 'Original risk scope; NULL means historical scope not recorded.';
COMMENT ON COLUMN public.risks.business_service_id IS 'Explicit service scope. risk_assets retains the assessment asset membership; never synchronized automatically.';

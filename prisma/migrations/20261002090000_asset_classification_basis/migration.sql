-- Latest classification only: preserve legacy rows and do not recompute existing assets.
ALTER TABLE public.assets
  ADD COLUMN classification_confidentiality_impact integer,
  ADD COLUMN classification_integrity_impact integer,
  ADD COLUMN classification_availability_impact integer,
  ADD COLUMN classification_business_impact integer,
  ADD COLUMN classification_rationale text,
  ADD COLUMN classification_method_version varchar(100),
  ADD COLUMN classified_at timestamptz,
  ADD COLUMN classified_by uuid;
ALTER TABLE public.assets ADD CONSTRAINT fk_asset_classification_assessor FOREIGN KEY (classified_by) REFERENCES public.users(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE INDEX idx_assets_classified_by ON public.assets(classified_by);
ALTER TABLE public.assets ADD CONSTRAINT ck_asset_classification_complete CHECK (
  (classification_confidentiality_impact IS NULL AND classification_integrity_impact IS NULL AND classification_availability_impact IS NULL AND classification_business_impact IS NULL AND classification_rationale IS NULL AND classification_method_version IS NULL AND classified_at IS NULL AND classified_by IS NULL)
  OR (classification_confidentiality_impact IS NOT NULL AND classification_integrity_impact IS NOT NULL AND classification_availability_impact IS NOT NULL AND classification_business_impact IS NOT NULL AND classification_rationale IS NOT NULL AND classification_method_version IS NOT NULL AND classified_at IS NOT NULL AND classified_by IS NOT NULL
    AND classification_confidentiality_impact BETWEEN 1 AND 5 AND classification_integrity_impact BETWEEN 1 AND 5 AND classification_availability_impact BETWEEN 1 AND 5 AND classification_business_impact BETWEEN 1 AND 5
    AND length(trim(classification_rationale)) BETWEEN 20 AND 2000
    AND classification_method_version = 'SECURAAI-ASSET-IMPACT-v1'
    AND lower(criticality) = CASE greatest(classification_confidentiality_impact, classification_integrity_impact, classification_availability_impact, classification_business_impact) WHEN 5 THEN 'critical' WHEN 4 THEN 'high' WHEN 1 THEN 'low' ELSE 'medium' END
    AND lower(data_classification) IN ('public', 'internal', 'confidential', 'restricted'))
);

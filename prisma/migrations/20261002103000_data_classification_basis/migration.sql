-- Preserve older assessments: require a basis only for assessments saved with the new method.
ALTER TABLE public.assets ADD COLUMN data_classification_basis text;
ALTER TABLE public.assets ADD COLUMN data_classification_method_version varchar(100);
ALTER TABLE public.assets ADD CONSTRAINT ck_asset_data_classification_basis CHECK (
  (data_classification_basis IS NULL AND data_classification_method_version IS NULL)
  OR (data_classification_basis IS NOT NULL AND data_classification_method_version IS NOT NULL
    AND classified_at IS NOT NULL
    AND length(trim(data_classification_basis)) BETWEEN 20 AND 2000
    AND data_classification_method_version = 'SECURAAI-DATA-CLASSIFICATION-v1')
);

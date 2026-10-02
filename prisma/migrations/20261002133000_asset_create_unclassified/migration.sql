-- Preserve existing classifications. Only new assets start without classification.
ALTER TABLE public.assets
  ALTER COLUMN criticality DROP NOT NULL,
  ALTER COLUMN criticality DROP DEFAULT,
  ALTER COLUMN data_classification DROP NOT NULL,
  ALTER COLUMN data_classification DROP DEFAULT;
-- CHECK expressions evaluate UNKNOWN for nulls: explicitly protect saved assessments.
ALTER TABLE public.assets ADD CONSTRAINT ck_asset_saved_classification_values CHECK (
  classified_at IS NULL OR (criticality IS NOT NULL AND data_classification IS NOT NULL)
);

ALTER TABLE public.assets
  ADD COLUMN archive_reason text,
  ADD COLUMN archived_by uuid;
ALTER TABLE public.assets ADD CONSTRAINT fk_asset_archived_by
  FOREIGN KEY (archived_by) REFERENCES public.users(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE INDEX idx_assets_archived_by ON public.assets(archived_by);
CREATE INDEX idx_asset_dependency_parent ON public.asset_dependencies(depends_on_asset_id);
-- Legacy archives remain null; never invent actors or reasons.
ALTER TABLE public.assets ADD CONSTRAINT ck_asset_archive_metadata CHECK (
  (archive_reason IS NULL AND archived_by IS NULL)
  OR (status = 'ARCHIVED' AND archived_at IS NOT NULL AND archived_by IS NOT NULL
      AND archive_reason IS NOT NULL AND char_length(btrim(archive_reason)) BETWEEN 1 AND 1000)
);

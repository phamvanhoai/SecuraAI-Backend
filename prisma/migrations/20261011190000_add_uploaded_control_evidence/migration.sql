ALTER TABLE evidence_items
  ADD COLUMN evidence_type varchar(32) NOT NULL DEFAULT 'EXTERNAL_URL',
  ADD COLUMN original_file_name varchar(255);

ALTER TABLE evidence_items
  ADD CONSTRAINT chk_evidence_type
    CHECK (evidence_type IN ('EXTERNAL_URL', 'UPLOADED_FILE')),
  ADD CONSTRAINT chk_evidence_source_metadata
    CHECK (
      (evidence_type = 'EXTERNAL_URL'
        AND original_file_name IS NULL)
      OR
      (evidence_type = 'UPLOADED_FILE'
        AND storage_uri IS NOT NULL
        AND original_file_name IS NOT NULL
        AND mime_type IS NOT NULL
        AND file_size IS NOT NULL
        AND integrity_hash IS NOT NULL)
    );

COMMENT ON COLUMN evidence_items.evidence_type IS
  'EXTERNAL_URL for a reference (legacy metadata may not have a URI) or UPLOADED_FILE for a private backend-managed file.';
COMMENT ON COLUMN evidence_items.original_file_name IS
  'Untrusted display name supplied by the uploader; never used as a filesystem path.';

BEGIN;

-- Preserve the existing column and all asset relationships. Only explicit,
-- unambiguous legacy aliases are normalized; unknown values require review.
LOCK TABLE public.assets IN SHARE ROW EXCLUSIVE MODE;

UPDATE public.assets
SET asset_type = CASE upper(btrim(asset_type))
  WHEN 'DATABASE SERVER' THEN 'DATABASE'
  WHEN 'NETWORK DEVICE' THEN 'NETWORK_DEVICE'
  ELSE upper(btrim(asset_type))
END
WHERE upper(btrim(asset_type)) IN (
  'APPLICATION', 'SERVER', 'DATABASE', 'ENDPOINT', 'NETWORK_DEVICE', 'OTHER',
  'DATABASE SERVER', 'NETWORK DEVICE'
)
AND asset_type IS DISTINCT FROM CASE upper(btrim(asset_type))
  WHEN 'DATABASE SERVER' THEN 'DATABASE'
  WHEN 'NETWORK DEVICE' THEN 'NETWORK_DEVICE'
  ELSE upper(btrim(asset_type))
END;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.assets
    WHERE asset_type NOT IN ('APPLICATION', 'SERVER', 'DATABASE', 'ENDPOINT', 'NETWORK_DEVICE', 'OTHER')
  ) THEN
    RAISE EXCEPTION 'Unsupported legacy asset types remain. Review and map them explicitly before retrying this migration.';
  END IF;
END;
$$;

ALTER TABLE public.assets ADD CONSTRAINT chk_assets_asset_type
  CHECK (asset_type IN ('APPLICATION', 'SERVER', 'DATABASE', 'ENDPOINT', 'NETWORK_DEVICE', 'OTHER'));

COMMIT;

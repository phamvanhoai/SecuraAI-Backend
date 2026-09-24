UPDATE "system_settings"
SET
  "setting_value" = jsonb_set(
    "setting_value",
    '{address}',
    to_jsonb('600 Nguyen Van Cu Extension Street, An Binh Ward, Ninh Kieu District, Can Tho City, ZIP Code: 900000'::text),
    true
  ),
  "updated_at" = NOW()
WHERE "setting_key" = 'organization.profile';

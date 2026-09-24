INSERT INTO "system_settings" ("setting_key", "setting_value")
VALUES (
  'organization.profile',
  jsonb_build_object(
    'name', 'SecuraAI',
    'address', 'Số 600 đường Nguyễn Văn Cừ nối dài, An Bình, Ninh Kiều, thành phố Cần Thơ, Mã ZIP: 900000',
    'phone', '0292 730 3636'
  )
)
ON CONFLICT ("setting_key") DO NOTHING;

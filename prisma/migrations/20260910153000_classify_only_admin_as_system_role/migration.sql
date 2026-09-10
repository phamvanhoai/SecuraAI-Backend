-- ADMIN is the only immutable platform role. All other roles remain editable
-- business roles, including the default roles created by the seed process.
UPDATE "roles"
SET
  "is_system" = CASE WHEN "code" = 'ADMIN' THEN true ELSE false END,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "is_system" IS DISTINCT FROM ("code" = 'ADMIN');

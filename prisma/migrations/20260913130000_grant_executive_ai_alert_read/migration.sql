-- Executives may read AI alerts to inspect the stored decision explanation.
-- The permission and role are created by the existing seed; this is safe when
-- either has not been seeded yet, and the seed grants the permission later.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."role_id", permission."permission_id"
FROM "roles" AS role
CROSS JOIN "permissions" AS permission
WHERE role."code" = 'EXECUTIVE'
  AND permission."code" = 'ai-alerts.read'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

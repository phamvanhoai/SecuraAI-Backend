-- UC7: grant account lock/unlock permissions to the administrator role.
INSERT INTO "permissions" ("code", "module", "action", "description")
VALUES
  ('users.lock', 'users', 'lock', 'Lock active user accounts'),
  ('users.unlock', 'users', 'unlock', 'Unlock locked user accounts')
ON CONFLICT ("code") DO UPDATE SET
  "module" = EXCLUDED."module", "action" = EXCLUDED."action", "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."role_id", permission."permission_id"
FROM "roles" AS role CROSS JOIN "permissions" AS permission
WHERE role."code" = 'ADMIN' AND permission."code" IN ('users.lock', 'users.unlock')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

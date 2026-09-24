INSERT INTO "permissions" ("code", "module", "action", "description")
VALUES
  ('users.deactivate', 'users', 'deactivate', 'Deactivate user accounts'),
  ('users.remove', 'users', 'remove', 'Soft-delete user accounts')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."role_id", permission."permission_id"
FROM "roles" AS role CROSS JOIN "permissions" AS permission
WHERE role."code" = 'ADMIN'
  AND permission."code" IN ('users.deactivate', 'users.remove')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

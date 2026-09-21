INSERT INTO "permissions" ("code", "module", "action", "description")
VALUES ('users.update', 'users', 'update', 'Update user profile and role assignments')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."role_id", permission."permission_id"
FROM "roles" AS role
CROSS JOIN "permissions" AS permission
WHERE role."code" = 'ADMIN' AND permission."code" = 'users.update'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

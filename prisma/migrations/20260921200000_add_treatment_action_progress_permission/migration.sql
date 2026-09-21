INSERT INTO "permissions" ("code", "module", "action", "description")
VALUES ('risk-treatment-actions.update-progress', 'risk-management', 'update-progress', 'Update progress of assigned or owned approved treatment actions')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."role_id", permission."permission_id"
FROM "roles" AS role
CROSS JOIN "permissions" AS permission
WHERE role."code" IN ('ADMIN', 'SECURITY_OFFICER')
  AND permission."code" = 'risk-treatment-actions.update-progress'
ON CONFLICT DO NOTHING;

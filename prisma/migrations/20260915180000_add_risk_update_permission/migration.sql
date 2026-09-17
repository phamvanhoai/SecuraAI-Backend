INSERT INTO "permissions" ("code", "module", "action", "description")
VALUES ('risks.update', 'risk-management', 'update', 'Update draft or rejected risk assessments')
ON CONFLICT ("code") DO UPDATE SET "module" = EXCLUDED."module", "action" = EXCLUDED."action", "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."role_id", permission."permission_id" FROM "roles" AS role CROSS JOIN "permissions" AS permission
WHERE role."code" IN ('ADMIN', 'SECURITY_OFFICER') AND permission."code" = 'risks.update'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

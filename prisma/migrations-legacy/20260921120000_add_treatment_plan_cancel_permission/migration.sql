INSERT INTO "permissions" ("code", "module", "action", "description")
VALUES ('risk-treatment-plans.cancel', 'risk-management', 'cancel', 'Cancel draft or rejected risk treatment plans')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."role_id", permission."permission_id"
FROM "roles" AS role
CROSS JOIN "permissions" AS permission
WHERE role."code" IN ('ADMIN', 'SECURITY_OFFICER')
  AND permission."code" = 'risk-treatment-plans.cancel'
ON CONFLICT DO NOTHING;

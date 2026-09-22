INSERT INTO "permissions" ("code", "module", "action", "description")
VALUES (
  'risk-assessments.assess-residual',
  'risk-management',
  'assess-residual',
  'Perform residual risk assessments after treatment'
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."role_id", permission."permission_id"
FROM "roles" AS role
CROSS JOIN "permissions" AS permission
WHERE role."code" IN ('ADMIN', 'SECURITY_OFFICER')
  AND permission."code" = 'risk-assessments.assess-residual'
ON CONFLICT DO NOTHING;

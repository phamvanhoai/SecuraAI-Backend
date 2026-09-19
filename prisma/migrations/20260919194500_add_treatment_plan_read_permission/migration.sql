INSERT INTO "permissions" ("code", "module", "action", "description")
VALUES (
  'risk-treatment-plans.read',
  'risk-management',
  'read',
  'View risk treatment plans'
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."role_id", permission."permission_id"
FROM "roles" AS role
CROSS JOIN "permissions" AS permission
WHERE role."code" IN ('ADMIN', 'SECURITY_OFFICER', 'EXECUTIVE')
  AND permission."code" = 'risk-treatment-plans.read'
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS "idx_risk_treatment_plans_status_updated"
ON "risk_treatment_plans" ("status", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_risk_treatment_plans_owner_target"
ON "risk_treatment_plans" ("owner_user_id", "target_date");

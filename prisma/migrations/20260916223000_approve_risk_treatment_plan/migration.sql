INSERT INTO "permissions" ("code", "module", "action", "description")
VALUES (
  'risk-treatment-plans.approve',
  'risk-management',
  'approve',
  'Approve submitted risk treatment plans'
)
ON CONFLICT ("code") DO UPDATE SET
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."role_id", permission."permission_id"
FROM "roles" AS role
CROSS JOIN "permissions" AS permission
WHERE role."code" IN ('ADMIN', 'EXECUTIVE')
  AND permission."code" = 'risk-treatment-plans.approve'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

CREATE UNIQUE INDEX "approval_actions_one_actor_decision_per_step_idx"
  ON "approval_actions" (
    "approval_request_id",
    "workflow_step_id",
    "acted_by_user_id"
  )
  WHERE "acted_by_user_id" IS NOT NULL;

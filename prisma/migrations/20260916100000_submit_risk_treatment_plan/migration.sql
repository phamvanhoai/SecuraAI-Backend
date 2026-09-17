INSERT INTO "permissions" ("code", "module", "action", "description")
VALUES (
  'risk-treatment-plans.submit',
  'risk-management',
  'submit',
  'Submit risk treatment plans for approval'
)
ON CONFLICT ("code") DO UPDATE SET
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."role_id", permission."permission_id"
FROM "roles" AS role
CROSS JOIN "permissions" AS permission
WHERE role."code" IN ('ADMIN', 'SECURITY_OFFICER')
  AND permission."code" = 'risk-treatment-plans.submit'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

CREATE UNIQUE INDEX "approval_requests_one_pending_entity_idx"
  ON "approval_requests" ("entity_type", "entity_id")
  WHERE "status" = 'pending';

WITH approver_role AS (
  SELECT "role_id"
  FROM "roles"
  WHERE "code" IN ('EXECUTIVE', 'ADMIN')
  ORDER BY CASE "code" WHEN 'EXECUTIVE' THEN 1 ELSE 2 END
  LIMIT 1
), new_workflow AS (
  INSERT INTO "workflow_definitions" (
    "name",
    "entity_type",
    "description",
    "is_active"
  )
  SELECT
    'Risk Treatment Plan Approval',
    'risk_treatment_plan',
    'Approval workflow for submitted risk treatment plans',
    TRUE
  WHERE NOT EXISTS (
    SELECT 1
    FROM "workflow_definitions"
    WHERE "entity_type" = 'risk_treatment_plan'
      AND "is_active" = TRUE
  )
    AND EXISTS (SELECT 1 FROM approver_role)
  RETURNING "workflow_definition_id"
)
INSERT INTO "workflow_steps" (
  "workflow_definition_id",
  "step_order",
  "name",
  "approver_role_id",
  "required_approvals",
  "due_hours"
)
SELECT
  new_workflow."workflow_definition_id",
  1,
  'Executive treatment plan review',
  approver_role."role_id",
  1,
  72
FROM new_workflow
CROSS JOIN approver_role;

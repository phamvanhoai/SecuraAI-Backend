DELETE FROM "approval_actions"
WHERE "approval_request_id" IN (
  SELECT "approval_request_id"
  FROM "approval_requests"
  WHERE "entity_type" = 'mfa_recovery'
);

DELETE FROM "approval_requests"
WHERE "entity_type" = 'mfa_recovery';

DELETE FROM "workflow_steps"
WHERE "workflow_definition_id" IN (
  SELECT "workflow_definition_id"
  FROM "workflow_definitions"
  WHERE "entity_type" = 'mfa_recovery'
);

DELETE FROM "workflow_definitions"
WHERE "entity_type" = 'mfa_recovery';

DELETE FROM "audit_logs"
WHERE "entity_type" = 'mfa_recovery'
   OR "action" LIKE 'mfa.recovery.%';

DELETE FROM "role_permissions"
WHERE "permission_id" IN (
  SELECT "permission_id"
  FROM "permissions"
  WHERE "code" = 'mfa-recovery.manage'
);

DELETE FROM "permissions"
WHERE "code" = 'mfa-recovery.manage';

DELETE FROM "role_permissions"
WHERE "permission_id" IN (
  SELECT "permission_id" FROM "permissions"
  WHERE "code" IN ('users.lock', 'users.unlock', 'login-history.read')
);

DELETE FROM "permissions"
WHERE "code" IN ('users.lock', 'users.unlock', 'login-history.read');

DELETE FROM "audit_logs"
WHERE "action" IN ('user.locked', 'user.unlocked');

DROP TABLE IF EXISTS "login_history";

ALTER TABLE "users"
  DROP COLUMN IF EXISTS "locked_at";

ALTER TABLE "users"
  DROP CONSTRAINT IF EXISTS "ck_users_01",
  ADD CONSTRAINT "ck_users_01" CHECK (status IN ('active', 'inactive', 'disabled'));

DROP TABLE IF EXISTS "mfa_methods";

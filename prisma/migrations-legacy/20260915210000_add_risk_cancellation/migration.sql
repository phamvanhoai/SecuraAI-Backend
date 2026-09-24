ALTER TABLE "risk_assessments"
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(6),
  ADD COLUMN "cancelled_by_user_id" UUID,
  ADD COLUMN "cancelled_by_full_name" VARCHAR(150),
  ADD COLUMN "cancellation_reason" TEXT;

ALTER TABLE "risk_assessments"
  DROP CONSTRAINT "ck_risk_assessments_08";

ALTER TABLE "risk_assessments"
  ADD CONSTRAINT "ck_risk_assessments_08" CHECK (
    status IN (
      'draft',
      'pending_approval',
      'approved',
      'in_treatment',
      'closed',
      'rejected',
      'cancelled'
    )
  );

INSERT INTO "permissions" ("code", "module", "action", "description")
VALUES ('risks.cancel', 'risk-management', 'cancel', 'Cancel draft or rejected risk assessments')
ON CONFLICT ("code") DO UPDATE SET "module" = EXCLUDED."module", "action" = EXCLUDED."action", "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."role_id", permission."permission_id" FROM "roles" AS role CROSS JOIN "permissions" AS permission
WHERE role."code" IN ('ADMIN', 'SECURITY_OFFICER') AND permission."code" = 'risks.cancel'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

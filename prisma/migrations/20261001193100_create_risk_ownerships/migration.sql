CREATE TABLE "public"."risk_ownerships" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "risk_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "assigned_by" UUID,
  "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMPTZ(6),
  CONSTRAINT "risk_ownerships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_risk_ownership_risk" FOREIGN KEY ("risk_id") REFERENCES "public"."risks"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_risk_ownership_user" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_risk_ownership_assigner" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE SET NULL,
  CONSTRAINT "chk_risk_ownership_period" CHECK ("ended_at" IS NULL OR "ended_at" >= "assigned_at")
);

CREATE UNIQUE INDEX "uq_risk_ownerships_active_user"
ON "public"."risk_ownerships" ("risk_id", "user_id")
WHERE "ended_at" IS NULL;

CREATE INDEX "idx_risk_ownerships_risk_active"
ON "public"."risk_ownerships" ("risk_id", "ended_at");

CREATE INDEX "idx_risk_ownerships_user_active"
ON "public"."risk_ownerships" ("user_id", "ended_at");

INSERT INTO "public"."risk_ownerships" ("risk_id", "user_id", "assigned_by")
SELECT "id", "owner_user_id", "created_by"
FROM "public"."risks"
WHERE "owner_user_id" IS NOT NULL
ON CONFLICT ("risk_id", "user_id") WHERE "ended_at" IS NULL DO NOTHING;

UPDATE "public"."users" AS "user"
SET "role" = 'RISK_OWNER'
WHERE "user"."role" = 'EMPLOYEE'
  AND EXISTS (
    SELECT 1
    FROM "public"."risk_ownerships" AS "ownership"
    WHERE "ownership"."user_id" = "user"."id"
      AND "ownership"."ended_at" IS NULL
  );

COMMENT ON TABLE "public"."risk_ownerships" IS
'Active and historical ownership scope for users with the Risk Owner role.';

COMMENT ON COLUMN "public"."risks"."owner_user_id" IS
'Deprecated compatibility owner. New authorization uses risk_ownerships.';

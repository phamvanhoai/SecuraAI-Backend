UPDATE "public"."users"
SET "role" = 'EMPLOYEE'
WHERE "role" = 'RISK_OWNER';

DROP TABLE "public"."risk_ownerships";

ALTER TYPE "public"."user_role" RENAME TO "user_role_with_risk_owner";

CREATE TYPE "public"."user_role" AS ENUM (
  'ADMIN',
  'SECURITY_OFFICER',
  'EMPLOYEE',
  'EXECUTIVE'
);

ALTER TABLE "public"."users"
ALTER COLUMN "role" TYPE "public"."user_role"
USING ("role"::text::"public"."user_role");

DROP TYPE "public"."user_role_with_risk_owner";

CREATE TYPE "notification_priority" AS ENUM ('NORMAL', 'IMPORTANT', 'URGENT');
CREATE TYPE "notification_audience_type" AS ENUM ('USERS', 'ROLES');
CREATE TYPE "notification_channel" AS ENUM ('IN_SYSTEM', 'EMAIL');
CREATE TYPE "notification_delivery_status" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED');
CREATE TYPE "audit_outcome" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');
CREATE TYPE "report_export_format" AS ENUM ('CSV', 'JSON', 'XLSX');

CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" varchar(160) NOT NULL,
  "message" text NOT NULL,
  "priority" "notification_priority" NOT NULL DEFAULT 'NORMAL',
  "audience_type" "notification_audience_type" NOT NULL,
  "audience_definition" jsonb NOT NULL,
  "sent_by" uuid NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "expires_at" timestamptz(6),
  CONSTRAINT "fk_notifications_sender" FOREIGN KEY ("sent_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "ck_notifications_title" CHECK (char_length(btrim("title")) BETWEEN 1 AND 160),
  CONSTRAINT "ck_notifications_message" CHECK (char_length(btrim("message")) BETWEEN 1 AND 2000),
  CONSTRAINT "ck_notifications_expiry" CHECK ("expires_at" IS NULL OR "expires_at" > "created_at")
);

CREATE TABLE "notification_recipients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "notification_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "read_at" timestamptz(6),
  "archived_at" timestamptz(6),
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "fk_notification_recipients_notification" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "fk_notification_recipients_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "uq_notification_recipients_notification_user" UNIQUE ("notification_id", "user_id"),
  CONSTRAINT "ck_notification_recipients_read_at" CHECK ("read_at" IS NULL OR "read_at" >= "created_at"),
  CONSTRAINT "ck_notification_recipients_archived_at" CHECK ("archived_at" IS NULL OR "archived_at" >= "created_at")
);

CREATE TABLE "notification_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "notification_recipient_id" uuid NOT NULL,
  "channel" "notification_channel" NOT NULL,
  "destination" varchar(320),
  "status" "notification_delivery_status" NOT NULL DEFAULT 'PENDING',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "provider_message_id" varchar(255),
  "last_error_code" varchar(100),
  "last_error_message" text,
  "last_attempt_at" timestamptz(6),
  "sent_at" timestamptz(6),
  "delivered_at" timestamptz(6),
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "fk_notification_deliveries_recipient" FOREIGN KEY ("notification_recipient_id") REFERENCES "notification_recipients"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "uq_notification_deliveries_recipient_channel" UNIQUE ("notification_recipient_id", "channel"),
  CONSTRAINT "ck_notification_deliveries_attempt_count" CHECK ("attempt_count" >= 0),
  CONSTRAINT "ck_notification_deliveries_destination" CHECK ("channel" <> 'EMAIL' OR char_length(btrim("destination")) BETWEEN 3 AND 320),
  CONSTRAINT "ck_notification_deliveries_timestamps" CHECK (("sent_at" IS NULL OR "sent_at" >= "created_at") AND ("delivered_at" IS NULL OR "delivered_at" >= COALESCE("sent_at", "created_at")))
);

CREATE TABLE "notification_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "channel" "notification_channel" NOT NULL,
  "event_type" varchar(100) NOT NULL DEFAULT 'ALL',
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "fk_notification_preferences_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "uq_notification_preferences_user_channel_event" UNIQUE ("user_id", "channel", "event_type"),
  CONSTRAINT "ck_notification_preferences_event_type" CHECK (char_length(btrim("event_type")) BETWEEN 1 AND 100)
);

ALTER TABLE "audit_logs"
  ADD COLUMN "outcome" "audit_outcome" NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN "error_code" varchar(100),
  ADD COLUMN "duration_ms" integer,
  ADD CONSTRAINT "ck_audit_logs_duration_ms" CHECK ("duration_ms" IS NULL OR "duration_ms" >= 0),
  ADD CONSTRAINT "ck_audit_logs_error_code" CHECK ("outcome" = 'SUCCESS' OR char_length(btrim("error_code")) > 0);

ALTER TABLE "report_exports"
  ADD COLUMN "file_format" "report_export_format",
  ADD COLUMN "record_count" integer,
  ADD COLUMN "error_code" varchar(100),
  ADD COLUMN "error_message" text,
  ADD COLUMN "expires_at" timestamptz(6),
  ADD COLUMN "completed_at" timestamptz(6),
  ADD CONSTRAINT "ck_report_exports_record_count" CHECK ("record_count" IS NULL OR "record_count" >= 0),
  ADD CONSTRAINT "ck_report_exports_expiry" CHECK ("expires_at" IS NULL OR "expires_at" > "created_at");

CREATE INDEX "idx_notifications_sender_created" ON "notifications" ("sent_by", "created_at" DESC);
CREATE INDEX "idx_notifications_created" ON "notifications" ("created_at" DESC);
CREATE INDEX "idx_notification_recipients_inbox" ON "notification_recipients" ("user_id", "read_at", "created_at" DESC);
CREATE INDEX "idx_notification_deliveries_status_created" ON "notification_deliveries" ("status", "created_at");
CREATE INDEX "idx_notification_deliveries_provider_message" ON "notification_deliveries" ("provider_message_id") WHERE "provider_message_id" IS NOT NULL;
CREATE INDEX "idx_notification_preferences_user_enabled" ON "notification_preferences" ("user_id", "enabled");
CREATE INDEX "idx_audit_logs_outcome_occurred" ON "audit_logs" ("outcome", "occurred_at" DESC);
CREATE INDEX "idx_audit_logs_source_occurred" ON "audit_logs" ("source", "occurred_at" DESC);
CREATE INDEX "idx_audit_logs_actor_occurred" ON "audit_logs" ("actor_user_id", "occurred_at" DESC);
CREATE INDEX "idx_audit_logs_action_occurred" ON "audit_logs" ("action", "occurred_at" DESC);

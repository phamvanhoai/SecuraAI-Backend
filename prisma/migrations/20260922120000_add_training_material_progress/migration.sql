CREATE TABLE "training_material_progress" (
  "training_material_progress_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "training_enrollment_id" UUID NOT NULL REFERENCES "training_enrollments"("training_enrollment_id"),
  "training_material_id" UUID NOT NULL REFERENCES "training_materials"("training_material_id"),
  "status" VARCHAR(20) NOT NULL DEFAULT 'not_started',
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "last_accessed_at" TIMESTAMPTZ(6),
  CONSTRAINT "ck_training_material_progress_status" CHECK ("status" IN ('not_started', 'in_progress', 'completed')),
  CONSTRAINT "training_material_progress_enrollment_material_key" UNIQUE ("training_enrollment_id", "training_material_id")
);

CREATE INDEX "training_material_progress_material_id_idx" ON "training_material_progress" ("training_material_id");

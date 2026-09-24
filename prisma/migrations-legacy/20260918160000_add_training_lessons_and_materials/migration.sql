BEGIN;

CREATE TABLE training_lessons (
  training_lesson_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_course_id UUID NOT NULL REFERENCES training_courses(training_course_id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 1 CHECK (display_order > 0),
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  UNIQUE (training_course_id, display_order),
  UNIQUE (training_lesson_id, training_course_id)
);

CREATE TABLE training_materials (
  training_material_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_lesson_id UUID NOT NULL REFERENCES training_lessons(training_lesson_id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  title VARCHAR(255) NOT NULL,
  material_type VARCHAR(20) NOT NULL CHECK (material_type IN ('text', 'video', 'document', 'link')),
  content TEXT,
  file_id UUID REFERENCES files(file_id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  external_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 1 CHECK (display_order > 0),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  UNIQUE (training_lesson_id, display_order),
  CONSTRAINT ck_training_material_source CHECK (
    (material_type = 'text' AND content IS NOT NULL AND length(btrim(content)) > 0 AND file_id IS NULL AND external_url IS NULL)
    OR (material_type IN ('video', 'document') AND content IS NULL AND (
      (file_id IS NOT NULL AND external_url IS NULL)
      OR (file_id IS NULL AND external_url IS NOT NULL AND external_url ~ '^https://[^[:space:]]+$')
    ))
    OR (material_type = 'link' AND content IS NULL AND file_id IS NULL AND external_url IS NOT NULL AND external_url ~ '^https://[^[:space:]]+$')
  )
);
CREATE INDEX training_materials_file_id_idx ON training_materials(file_id);

CREATE TABLE training_lesson_progress (
  training_lesson_progress_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_enrollment_id UUID NOT NULL REFERENCES training_enrollments(training_enrollment_id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  training_lesson_id UUID NOT NULL REFERENCES training_lessons(training_lesson_id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  status VARCHAR(20) NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  started_at TIMESTAMPTZ(6),
  completed_at TIMESTAMPTZ(6),
  last_accessed_at TIMESTAMPTZ(6),
  UNIQUE (training_enrollment_id, training_lesson_id),
  CONSTRAINT ck_training_lesson_progress_time CHECK (
    (status = 'not_started' AND started_at IS NULL AND completed_at IS NULL)
    OR (status = 'in_progress' AND started_at IS NOT NULL AND completed_at IS NULL)
    OR (status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND completed_at >= started_at)
  )
);
CREATE INDEX training_lesson_progress_lesson_id_idx ON training_lesson_progress(training_lesson_id);

ALTER TABLE quizzes ADD COLUMN training_lesson_id UUID;
ALTER TABLE quizzes ADD CONSTRAINT quizzes_lesson_course_fkey
  FOREIGN KEY (training_lesson_id, training_course_id)
  REFERENCES training_lessons(training_lesson_id, training_course_id) ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE INDEX quizzes_training_lesson_id_idx ON quizzes(training_lesson_id);

-- Expand phase: keep nullable until every writer supplies enrollment and legacy
-- ambiguities are resolved. Never guess between multiple assignment campaigns.
ALTER TABLE quiz_attempts ADD COLUMN training_enrollment_id UUID
  REFERENCES training_enrollments(training_enrollment_id) ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE INDEX quiz_attempts_enrollment_quiz_idx ON quiz_attempts(training_enrollment_id, quiz_id);
WITH candidates AS (
  SELECT a.quiz_attempt_id, (array_agg(e.training_enrollment_id))[1] AS enrollment_id
  FROM quiz_attempts a
  JOIN quizzes q ON q.quiz_id = a.quiz_id
  JOIN training_campaigns c ON c.training_course_id = q.training_course_id
  JOIN training_enrollments e ON e.training_campaign_id = c.training_campaign_id AND e.user_id = a.user_id
  GROUP BY a.quiz_attempt_id HAVING count(*) = 1
)
UPDATE quiz_attempts a SET training_enrollment_id = c.enrollment_id
FROM candidates c WHERE a.quiz_attempt_id = c.quiz_attempt_id;

CREATE FUNCTION validate_training_progress_course() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM training_enrollments e
    JOIN training_campaigns c ON c.training_campaign_id = e.training_campaign_id
    JOIN training_lessons l ON l.training_course_id = c.training_course_id
    WHERE e.training_enrollment_id = NEW.training_enrollment_id AND l.training_lesson_id = NEW.training_lesson_id
  ) THEN RAISE EXCEPTION 'Lesson and enrollment must belong to the same course' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER training_progress_course_check BEFORE INSERT OR UPDATE ON training_lesson_progress
  FOR EACH ROW EXECUTE FUNCTION validate_training_progress_course();

CREATE FUNCTION validate_training_attempt_enrollment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.training_enrollment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM training_enrollments e
    JOIN training_campaigns c ON c.training_campaign_id = e.training_campaign_id
    JOIN quizzes q ON q.training_course_id = c.training_course_id
    WHERE e.training_enrollment_id = NEW.training_enrollment_id AND e.user_id = NEW.user_id AND q.quiz_id = NEW.quiz_id
  ) THEN RAISE EXCEPTION 'Attempt must match enrollment user and course' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER training_attempt_enrollment_check BEFORE INSERT OR UPDATE ON quiz_attempts
  FOR EACH ROW EXECUTE FUNCTION validate_training_attempt_enrollment();

COMMIT;

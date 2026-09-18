# Training schema extension

Approved extension to the V3 baseline: 78 business tables, 141 foreign keys,
91 CHECK constraints. `schema-extensions.json` supplements the original design
for `db:verify`; original applied migrations and V3 reference SQL remain unchanged.

The migration adds lessons, materials and enrollment-scoped lesson progress.
All identifiers use UUID and `gen_random_uuid()`, timestamps use TIMESTAMPTZ(6),
statuses use VARCHAR with SQL CHECK constraints, and foreign keys use NO ACTION.
Uploaded content reuses `files`; binaries belong in object storage, not PostgreSQL.
There is no course version table and no per-material video resume tracking.

Lesson quizzes use nullable `quizzes.training_lesson_id`; NULL means final quiz.
A composite foreign key ensures a lesson quiz belongs to its declared course.
Progress and attempt triggers enforce matching enrollment/course/user at write time.
Application services must prohibit moving assigned courses, lessons, quizzes or
enrollments to a different parent and must lock learning content on publication.
These publication and assignment rules are not implemented by this schema task.

`quiz_attempts.training_enrollment_id` is temporarily nullable (expand phase) so
existing deployed writers remain compatible. Legacy attempts are backfilled only
when exactly one enrollment matches the user and course. Before NOT NULL is applied,
all writers and readers must become enrollment-scoped and any remaining NULL rows
must be reviewed. Never infer a campaign merely from the nearest date.

Existing course content, campaigns, enrollments, answers and certificates are retained.
New tables start empty; legacy content is not automatically converted into lessons.

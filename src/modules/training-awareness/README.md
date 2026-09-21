# Edit security awareness course drafts (UC160)

`GET /training/courses/{courseId}` and `PATCH /training/courses/{courseId}`
require `training-courses.update`, granted to Admin and Security Officer. Editing
covers course information, ordered lessons, text/HTTPS/file materials, lesson
assessments and the final assessment. Correct answers are returned only through
this protected editor endpoint.

Only unassigned drafts are editable. Published, archived, or assigned courses
return `409`; historical learner progress is never rewritten. `expectedUpdatedAt`
rejects stale saves. Updates and audit records are atomic. Existing private files
may be retained or replaced; removed file records and local objects are cleaned
up. No table or column changes are required.

# Create structured security awareness courses (UC75)

UC165 publishes a completed draft with `POST /training/courses/{courseId}/publish`.
The operation requires `training-courses.publish`, granted to Admin and Security
Officer. A publishable course must still be a draft, have no assignment campaign,
contain at least one lesson, and every lesson must contain training material.
Publishing is atomic, records an audit event, and does not add database columns
or tables. Published courses remain immutable through the draft editor.

UC165: `GET /training/my-certificates?page=1&limit=10&q=` requires
`training-certificates.read-own` and lists only certificates whose enrollment
belongs to the authenticated user. It supports bounded pagination and search by
certificate number, course or campaign. Certificates are metadata records;
the endpoint does not claim a generated PDF. Grant the new permission to Admin
and Employee with the data-only migration before testing.

Create drafts with ordered lessons and materials, optional lesson assessments and
an optional final assessment. Reuses `training-courses.create` for creation and
`training-courses.read` for content inspection/private downloads. Existing role
permission grants apply; no new permission code is required.

`POST /training/courses` accepts JSON, or multipart with a `payload` JSON string
and UUID-named file fields referenced by `materials[].uploadKey`. Text uses
`content`; links use `externalUrl`; video/PDF uses either an HTTPS URL or upload,
never both. URLs are stored, not fetched/imported into local storage. Only PDF,
MP4 and WebM are accepted, with MIME/extension and basic content signature checks,
up to 10 files and 20 MiB per file. File bytes are streamed to a private local
directory under FILE_STORAGE_DIR; metadata reuses `files`. Uploaded files are
removed if validation or the database transaction fails. Creation has one
transaction for course, lessons, materials, assessments, file metadata and audit.
At most 50 lessons, 10 materials per lesson, 100 materials and 100 questions total.

Structured courses must be created as drafts; publishing, editing structured
drafts, learner progression and certificate eligibility are separate use cases.
The legacy content-only JSON contract remains supported for compatibility.
No automatic conversion of legacy content or changes to historical attempts.

`GET /training/courses/{courseId}/content` returns ordered lessons/materials and
assessment summaries without answer keys or internal storage paths.
`GET /training/materials/{materialId}/download` returns a private attachment.

Local upload requires a persistent server/VPS filesystem or Docker volume, with
backup. Vercel local uploads are rejected; request-size limits of any frontend
host/reverse proxy still apply. This task does not deploy Docker, add object
storage, provide malware scanning/transcoding, or support video resume positions.

# Track training completion (UC78)

`GET /training/completion` and `GET /training/completion/{campaignId}` require
`training-completion.read`. Campaign totals exclude withdrawn enrollments and use
the persisted enrollment status/progress as the authoritative completion record.
The campaign detail also returns campaign-wide metrics, required lesson progress,
the latest final-assessment score/pass state, learner activity and certificate
state for every paginated employee. Lesson quizzes are not treated as the final
assessment. Overdue is derived from the campaign due date and never overrides a
completed or withdrawn enrollment. No schema change or new permission is needed.

# Training deadline reminders (UC79)

Employees receive automatic **in-app** reminders; they do not send reminders to
themselves. Email sending and channel preference editing remain separate use cases.

- Use existing `training-assessments.take` permission to receive/view reminders.
- Only active, non-deleted/non-disabled accounts with that permission qualify.
- Only published, started campaigns with unfinished enrollments qualify:
  `assigned`, `in_progress`, or `overdue`, progress below 100%, no completion date
  and no certificate. Cancelled/withdrawn/completed enrollments do not qualify.
  Enrollment completion is authoritative: passing a lesson or final quiz alone
  does not suppress reminders while required course work remains incomplete.
- Dates use **UTC calendar days**, consistent with existing assessment deadlines.
  The due date remains available through the end of that UTC day.
- Default milestones are 3 days and 1 day before the deadline. A missed run can
  catch up within its window: days 3–2 use milestone 3; days 1–0 use milestone 1.
  Never send both milestones together or send after the due date.
- Honor `notification_preferences.event_type = training_deadline_reminder` with
  `in_app_enabled = false`. Missing preferences mean in-app enabled.
- A deterministic notification primary key includes enrollment, due date and
  milestone. Repeated/concurrent runs cannot duplicate delivery. Changing a due
  date creates a new deadline cycle; old notifications remain historical.
- Eligibility is rechecked under campaign/enrollment row locks before writing
  notification and delivery records atomically. Sending does not alter progress.
- No schema changes, new columns/tables, seed data or new role permissions.

## API

Inbox accepts optional `search` (trimmed, maximum 100 characters). It searches
title/message case-insensitively before pagination, with the same filter applied
to the count. Course names refer to the historical notification message. Search
combines with unread and actor ownership; `%`, `_`, and backslash are literals.

- `GET /training/deadline-reminders?page=1&limit=10&status=all|unread`: own inbox,
  with account-wide total and unread summary counts unaffected by search/filter.
- `PATCH /training/deadline-reminders/{notificationId}/read`: own reminder only;
  idempotent, missing/other-user notification returns 404.
- `GET /training/deadline-reminders/dispatch`: scheduler only, requires exact
  `Authorization: Bearer <CRON_SECRET>`, not a user access token. Fail closed when
  the secret is not configured. Never expose this secret to frontend code.

## Scheduling

Long-running Node (`npm run dev` / `npm start`) starts a scheduler after database
connection, then checks every minute. Set `TRAINING_REMINDERS_ENABLED=false` to
disable both automatic runs and external dispatch. Tests do not start this timer.

For Vercel, set a server-only random `CRON_SECRET` (minimum 32 characters) in the
backend deployment. `vercel.json` schedules daily at 01:00 UTC (08:00 Vietnam).
If `API_PREFIX` changes, update the cron path too. Vercel invokes this endpoint
with the secret bearer header. A Node interval is not a serverless scheduler.

Each run processes at most 1,000 candidates and uses a 20-second application work
budget (database operation timeout may add time). The response contains
`delivered`, `processed`, and `hasMore`. At large organization sizes, configure a
more frequent external scheduler and monitor `hasMore` so the backlog is drained
within the reminder window. Already delivered jobs are excluded before the
candidate limit, so the next run progresses through the remaining recipients.
Database failures do not record a successful delivery; the next run retries.

# Issue training completion certificate (UC80)

`GET|POST /training/enrollments/{enrollmentId}/certificate` keeps certificate
issuance enrollment-scoped. A certificate may be issued only when the enrollment
is completed, has a completion timestamp and 100% progress. If the course has a
final assessment (a course quiz without a lesson), that same enrollment must have
a submitted passing attempt. Lesson assessments and attempts from earlier
campaigns never satisfy this requirement. Courses without a final assessment do
not invent an extra assessment requirement.

The response includes the individual eligibility checks so the UI can explain
why issuance is unavailable. An existing certificate remains viewable and POST is
idempotent. Issuance and its audit record are written atomically. UC80 stores
certificate metadata only; it does not generate a PDF or change the database
schema.

## Where to test

Login as an Employee, open **Notifications** (header bell) or **My training
assessments → Deadline reminders**. A published course must already be assigned,
started, unfinished and due within three UTC calendar days. Refresh reads the
inbox; it does not trigger sending. Old deadlines are displayed as historical
reminders, not an authoritative current assignment state.

# UC81 — Department training completion report

`GET /training/department-report` requires `training-department-reports.read`, assigned to Admin/Executive by the permission-only migration and seed. No schema change is required. Supports `page`, `limit`, `q`, and `progress`. Workforce headcount includes active and locked users and excludes deleted, disabled, and inactive accounts. The report separates unique assigned employees from campaign assignment totals and exposes both training coverage and assignment completion rates. It returns department metrics, an organization-wide summary, and pagination in the standard envelope.

Employees are distinct current workforce accounts; assigned employees are distinct users with non-withdrawn enrollments, while assignments count separately per campaign. Completed means enrollment status `completed`. Overdue means incomplete with campaign due date before today UTC. Current department membership is used because no assignment-time department snapshot exists. No-department employees are reported separately. Zero-assignment departments remain visible. Search does not affect summary metrics.

# Assignment eligibility (UC76)

Assignment creation and latest-campaign updates require a published course.
Drafts return 409 COURSE_NOT_PUBLISHED before target resolution or campaign writes;
archived courses remain unavailable (404). Existing campaign-scoped enrollment
and historical result preservation rules are unchanged. No schema migration.

# Complete assigned training course (UC77)

Employees use enrollment-scoped learning APIs to read ordered lesson materials,
download only files belonging to their assignment, complete lessons, and take
lesson/final assessments. Lesson progress and quiz attempts are scoped to the
campaign enrollment, so an earlier campaign pass is not reused. A required
lesson with an assessment completes only after a passing attempt. A course is
completed only after every required lesson and, when configured, the final
assessment are passed. Optional lessons do not block completion. No schema change.

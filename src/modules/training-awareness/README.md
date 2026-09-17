# Training deadline reminders (UC79)

Employees receive automatic **in-app** reminders; they do not send reminders to
themselves. Email sending and channel preference editing remain separate use cases.

- Use existing `training-assessments.take` permission to receive/view reminders.
- Only active, non-deleted/non-disabled accounts with that permission qualify.
- Only published, started campaigns with unfinished enrollments qualify:
  `assigned`, `in_progress`, or `overdue`, progress below 100%, no completion date
  and no certificate. Cancelled/withdrawn/completed enrollments do not qualify.
  A passed latest assessment is also excluded, consistent with the existing
  assessment API, even when a historical enrollment has stale progress.
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

- `GET /training/deadline-reminders?page=1&limit=10&status=all|unread`: own inbox.
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

## Where to test

Login as an Employee, open **Notifications** (header bell) or **My training
assessments → Deadline reminders**. A published course must already be assigned,
started, unfinished and due within three UTC calendar days. Refresh reads the
inbox; it does not trigger sending. Old deadlines are displayed as historical
reminders, not an authoritative current assignment state.

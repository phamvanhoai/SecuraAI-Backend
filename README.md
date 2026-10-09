# SecuraAI Backend — V2 baseline

UC63: `GET/POST /api/v1/incidents/:incidentId/close` supports closure review and active Security Officer closure. Requires Lessons learned, saved RCA/lessons/improvement recommendations, a summary, explicit readiness confirmation and optimistic timestamp. Server closure time and audit are atomic; repeat closure is idempotent and existing history is retained. No database changes; 71 legacy contracts remain pending. See [workflow rules](project-docs/incident-workflow.md).

Incident workflow: `PATCH /api/v1/incidents/:incidentId/progress` migrates the existing pending contract to manual V2 handling-phase assessment; `GET` provides paginated phase history. Active Security Officers write with required confirmation, readiness/results note, expectedStatus and expectedUpdatedAt. Classification, handler assignment and response journal writes never change phase. Action counts are not completion gates. Emergency jumps/deferred completion require skipReason; leaving Recovery requires the officer's restoration/validation attestation, not automated infrastructure verification. Exact transition restrictions are SecuraAI product rules, not universal industry requirements. Atomic status/audit writes reuse existing V2 tables, with no migration. Existing statuses are not rewritten. There are now 71 pending legacy contracts. See [workflow rules](project-docs/incident-workflow.md).

UC62: **Incidents → Actions → Root cause & lessons learned** replaces preview findings with the V2 API. GET/PATCH `/api/v1/incidents/:incidentId/analysis` reads/saves the unique `incident_analysis` (root cause, lessons learned, recommended improvements); GET `/analysis/history` paginates before/after audit snapshots. Active Security Officers write only in LESSONS_LEARNED; CLOSED findings and history are read-only; Security Officers and Executives can read. Required `expectedUpdatedAt` (null initially) prevents stale overwrites. Authenticated analyst and save time are server-owned. Findings/History tabs refresh after save; unsaved input survives tab changes and failed saves. Saving never changes incident status or completes recommendations. No schema changes. 71 legacy routes remain pending after progress migration.

UC61: Record Recovery Actions uses POST/GET `/api/v1/incidents/:incidentId/recovery-actions` and existing V2 `incident_actions` with phase `RECOVERY`. Active Security Officers record completed restoration steps and performed time; the authenticated performer and audit are saved atomically. History is paginated and refreshes after saving. Closed incidents are read-only; recording requires RECOVERY or LESSONS_LEARNED and never changes phase. Verified completion is confirmed separately through PATCH /incidents/:incidentId/progress. No schema changes; 71 legacy contracts remain pending.

UC60: `POST/GET /api/v1/incidents/:incidentId/eradication-actions` records and paginates completed eradication actions in existing V2 `incident_actions` (`ERADICATION`). Only active Security Officers can write; active Security Officers and Executives can read. Description is 10–4000 trimmed characters; performed time must not be future. Performer is server-owned. Writes and `INCIDENT_ERADICATION_RECORDED` audit are atomic; closed incidents reject writes but retain readable history. Recording requires ERADICATION or a later non-closed phase and never changes phase. These action URLs do not replace pending contracts. 71 legacy contracts remain pending after progress migration.

UC59: `POST /api/v1/incidents/:incidentId/containment-actions` records a completed containment action (description 10–4000 characters, performedAt ISO datetime not in the future). The signed-in active Security Officer is the performer. Existing `incident_actions` and audit records are written atomically; recording requires CONTAINMENT or a later non-closed phase and never changes phase. Closed incidents reject new actions. `GET` on the same URL provides paginated history for active Security Officers and Executives, including closed incidents. These are new URLs, not replacements for pending legacy contracts; 71 legacy contracts remain pending after progress migration. No schema changes.

`GET /api/v1/incidents/:incidentId/assignee` returns paginated assignment history from existing `audit_logs`: previous/new handler, assigning officer, time and note. Active Security Officers and Executives may read closed-incident history. Defaults: page 1 / limit 10 (maximum 100). Names reflect current accounts. No new tables or pending-route count change.

UC58: `GET /api/v1/incidents/assignment-options` lists active Security Officer handlers; `PATCH /api/v1/incidents/:incidentId/assignee` assigns or changes the handler with a 10–2000 character note and optional `expectedUpdatedAt`. Only active Security Officers may call these endpoints. Closed incidents and stale edits return 409. Assignment and `INCIDENT_HANDLER_ASSIGNED` audit (previous/new handler, officer, note, time) are atomic, using existing V2 tables. Assignment preserves the handling phase, including OPEN; selecting the current handler is a no-op. There are 71 pending V1 contracts.

UC57: `PATCH /api/v1/incidents/:incidentId/severity` lets active Security Officers classify severity (`low`, `medium`, `high`, `critical`) with a 10–2000 character rationale. Severity and its `INCIDENT_SEVERITY_CLASSIFIED` audit record are saved atomically. Optional `expectedUpdatedAt` guards stale edits; closed incidents return 409. List/detail responses include classification count and the latest rationale, officer and time.

`GET /api/v1/incidents/:incidentId/severity` returns paginated classification history from existing `audit_logs`, newest first, including previous/new severity, rationale, officer and time. Active Security Officers and Executives may read it, including closed incidents. Defaults: page 1, limit 10 (maximum 100). No new database table is required.

This repository targets the approved 56-table PostgreSQL V2 baseline in `project-docs/new/database.sql` plus additive migrations. The current evolved schema contains 64 tables. `prisma/migrations/00000000000000_baseline_v2/migration.sql` is the fresh-install baseline; historical migrations under `prisma/migrations-legacy/` must not be deployed.

The active API currently implements health checks, V2-backed authentication including password reset and authenticated password change, protected `GET /api/v1/users/me`, Admin user detail/edit operations, Security Officer risk register list/detail endpoints, the Security Officer policy draft create, list, edit, and submission endpoints, Admin viewing and review of submitted policy drafts, Employee published-policy reading and acknowledgement, `POST /api/v1/anomaly-detections/runs`, the near-real-time `GET /api/v1/ai-alerts` feed and `GET /api/v1/ai-alerts/:alertId/explanation`, `GET`/`POST /api/v1/ai-alerts/:alertId/feedback`, `POST /api/v1/ai-alerts/:alertId/confirm-incident`, `POST /api/v1/ai-alerts/:alertId/false-positive`, `GET /api/v1/ai-alerts/models`, and asset-specific `GET`/`PUT /api/v1/ai-alerts/thresholds` operations for Security Officers. The V2 schema has four fixed roles but no detailed permission or MFA models. `/users/me` returns a conservative set of frontend capability names derived from the Project Tracking WBS actor column for the user's database role; these are not per-user grants or backend authorization. MFA remains disabled. Pending historical V1 method/URL contracts remain registered and visible in OpenAPI, but return `501 ENDPOINT_NOT_IMPLEMENTED` until each handler is ported to V2. They do not execute V3 database code. Training endpoints, handlers, tests and porting-reference files have been removed. Other old source and tests remain under `reference/legacy-v3/` for porting reference; they are excluded from build, lint and tests. Immutable historical database snapshots may still contain the former schema. Contributors replace each pending contract with its V2 route, DTO, service, repository, OpenAPI entry and tests.

Policy Management also implements `POST /api/v1/compliance/policies/:policyId/versions/:versionId/submit` for an active Security Officer to submit an owned V2 draft for Admin review.

An active Admin completes that review with `POST /api/v1/compliance/policies/:policyId/versions/:versionId/review`. The operation records a `REVIEWED` decision and moves the version from `IN_REVIEW` to `WAITING_APPROVAL`; publication approval is only permitted after this transition.

After approval, `POST /api/v1/compliance/policies/:policyId/versions/:versionId/publish` atomically makes the version official: it becomes `PUBLISHED`, any prior current version becomes `SUPERSEDED`, the policy becomes `ACTIVE`, and `current_published_version_id` points to the newly published version.

## Setup

Use Node.js 22+ and npm. Copy `.env.example` to `.env`, set a real `DATABASE_URL`, and install dependencies:

To add the idempotent Risk Register demonstration records in a development database, set `SEED_RISK_DEMO=true` only for `npm run db:seed`. The demo records use the `DEMO-RSK-*`, `DEMO-AST-*`, `DEMO-CTRL-*`, and `DEMO-INC-*` prefixes.

```bash
npm ci
npm run db:generate
npm run db:verify
npm run dev
```

For a **fresh, empty** PostgreSQL database only, run `npm run db:deploy` before `db:verify`. Do not deploy the baseline to an existing V2 database without checking its Prisma migration history. `npm run db:seed` creates admin and optional test accounts only when you deliberately provide the corresponding environment variables; never use example passwords in a deployed environment.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm audit
npx prisma validate
npm run db:verify
```

`db:verify` reads the database and checks the current evolved schema for 64 tables, 135 foreign keys, 184 checks, and no missing or unexpected tables. It does not modify data. See `src/modules/README.md` for the V2 module boundaries.

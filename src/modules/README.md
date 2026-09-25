# V2 modules

The active backend uses the 56-table schema in `project-docs/new/database.sql`. The domain folders follow the current Project Tracking document. Authentication currently exposes V2-backed login, refresh and logout; other business use cases remain unimplemented.

Implemented routes are `/api/v1/health/live`, `/api/v1/health/ready`, `/api/v1/auth/login`, `/api/v1/auth/refresh`, `/api/v1/auth/logout`, protected `/api/v1/users/me`, `GET /api/v1/compliance/policies/drafts/mine`, `POST /api/v1/compliance/policies/:policyId/versions/:versionId/submit`, Admin submitted-policy draft list/detail reads, `POST /api/v1/anomaly-detections/runs`, `GET /api/v1/ai-alerts`, `GET`/`POST /api/v1/ai-alerts/:alertId/feedback`, `POST /api/v1/ai-alerts/:alertId/confirm-incident`, and `POST /api/v1/ai-alerts/:alertId/false-positive`. Another 134 historical V1 method/URL contracts are registered in `src/routes/legacy-v1-route-contracts.ts`; each currently returns HTTP 501 and is marked pending in OpenAPI. Legacy V3 handlers and tests are preserved in `reference/legacy-v3/`, but are not executed. Do not re-register those handlers against the V2 database; port each use case to the new schema first.

Use route → controller → service → repository → Prisma for each new use case. Update `src/routes/index.ts` and `src/docs/openapi.ts` only when the corresponding endpoint is real and tested.

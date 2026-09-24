# V2 modules

The active backend uses the 56-table schema in `project-docs/new/database.sql`. The domain folders follow the current Project Tracking document. Authentication currently exposes V2-backed login, refresh and logout; other business use cases remain unimplemented.

Registered routes are `/api/v1/health/live`, `/api/v1/health/ready`, `/api/v1/auth/login`, `/api/v1/auth/refresh`, and `/api/v1/auth/logout`. Legacy V3 handlers and tests are preserved in `reference/legacy-v3/`, but are not registered or executed. Do not re-register those handlers against the V2 database; port each use case to the new schema first.

Use route → controller → service → repository → Prisma for each new use case. Update `src/routes/index.ts` and `src/docs/openapi.ts` only when the corresponding endpoint is real and tested.

# V2 modules

The active backend uses the 56-table schema in `project-docs/new/database.sql`. The domain folders below follow the current Project Tracking document. They deliberately expose no business routes until their V2 use cases, authorization, DTOs, repositories, OpenAPI contracts, and tests are implemented.

The only registered routes in this baseline are `/api/v1/health/live` and `/api/v1/health/ready`. Legacy V3 handlers and training functionality were removed from the active source because they reference tables absent from V2. Their history remains recoverable in Git; do not re-register those handlers against the V2 database.

Use route → controller → service → repository → Prisma for each new use case. Update `src/routes/index.ts` and `src/docs/openapi.ts` only when the corresponding endpoint is real and tested.

# SecuraAI Backend — V2 baseline

This repository now targets the approved 56-table PostgreSQL V2 schema in `project-docs/new/database.sql`. `prisma/schema.prisma` was introspected from the matching database; `prisma/migrations/00000000000000_baseline_v2/migration.sql` is the fresh-install baseline. The previous migrations are retained under `prisma/migrations-legacy/` and must not be deployed.

Only `GET /api/v1/health/live` and `GET /api/v1/health/ready` are implemented. Authentication and business endpoints from the V3 application were removed because their models do not exist in V2. The V2 domain directories in `src/modules/` are intentionally unimplemented; contributors add routes, DTOs, services, repositories, OpenAPI entries, and tests per use case. The old source remains recoverable in Git history, not in the active application.

## Setup

Use Node.js 22+ and npm. Copy `.env.example` to `.env`, set a real `DATABASE_URL`, and install dependencies:

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

`db:verify` reads the database and checks for 56 tables, 120 foreign keys, 160 checks, and no missing or unexpected tables. It does not modify data. See `src/modules/README.md` for the V2 module boundaries.

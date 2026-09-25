# SecuraAI Backend — V2 baseline

This repository now targets the approved 56-table PostgreSQL V2 schema in `project-docs/new/database.sql`. `prisma/schema.prisma` was introspected from the matching database; `prisma/migrations/00000000000000_baseline_v2/migration.sql` is the fresh-install baseline. The previous migrations are retained under `prisma/migrations-legacy/` and must not be deployed.

The active API currently implements health checks, V2-backed authentication, protected `GET /api/v1/users/me`, `POST /api/v1/anomaly-detections/runs`, the near-real-time `GET /api/v1/ai-alerts` feed, and `GET`/`POST /api/v1/ai-alerts/:alertId/feedback` for Security Officers. The V2 schema has four fixed roles but no detailed permission or MFA models. `/users/me` returns a conservative set of frontend capability names derived from the Project Tracking WBS actor column for the user's database role; these are not per-user grants or backend authorization. MFA remains disabled. Another 139 historical V1 method/URL contracts remain registered and visible in OpenAPI, but return `501 ENDPOINT_NOT_IMPLEMENTED` until each handler is ported to V2. They do not execute V3 database code. Training endpoints, handlers, tests and porting-reference files have been removed. Other old source and tests remain under `reference/legacy-v3/` for porting reference; they are excluded from build, lint and tests. Immutable historical database snapshots may still contain the former schema. Contributors replace each pending contract with its V2 route, DTO, service, repository, OpenAPI entry and tests.

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

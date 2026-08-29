# SecuraAI Backend - Coding Agent Instructions

This file is the authoritative implementation guide for AI coding agents and contributors working in this repository. Read it completely before changing code.

## 1. Project context

SecuraAI is an enterprise Information Security Risk Management platform combining GRC/ISMS functions with AI-based anomaly detection. The approved scope and database references are stored in `project-docs/`.

Current stack:

- Node.js 22+
- Express 5 and TypeScript in strict mode
- PostgreSQL and Prisma ORM
- Zod for runtime validation and DTO type inference
- JWT access tokens plus opaque rotating refresh tokens
- OpenAPI/Swagger
- Vitest, ESLint and Prettier

Current database baseline:

- Online database: Supabase-managed PostgreSQL 17 in the Singapore region.
- The application schema contains 75 business tables, 134 foreign keys and 85 enforced business `CHECK` constraints.
- `prisma/migrations/20260830055000_full_database_schema/migration.sql` installs the complete V3 schema.
- `prisma/migrations/20260830060000_enforce_business_checks/migration.sql` materializes the checks that the dbdiagram export stored as comments.
- `npm run db:verify` compares the live `public` schema with the approved database design.

Do not migrate the project to NestJS, another web framework, another ORM, or another database unless the user explicitly requests it.

## 2. Sources of truth

Use these sources in this order:

1. The user's current requirement.
2. This `AGENTS.md` file.
3. `src/modules/README.md` for domain ownership and module boundaries.
4. Applied files under `prisma/migrations/` for the exact deployable PostgreSQL schema, including features Prisma cannot represent.
5. `prisma/schema.prisma` for the introspected Prisma Client model currently implemented by the application.
6. `project-docs/database.txt` and `project-docs/Database.sql` for the approved V3 database design.
7. `project-docs/De xuat de tai khoa luan WebApp.pdf` for roles and the 101 use cases.

The files in `project-docs/` are design references, not files to execute directly. Their approved schema has already been converted into versioned migrations. Never run a reference SQL file against an environment automatically. When the design changes, create a new explicit migration; do not rerun or modify an applied migration.

## 3. Architecture

Organize business code by domain under `src/modules/`, not in global controller/service folders.

The required dependency flow is:

```text
route -> controller -> service -> repository -> Prisma -> PostgreSQL
```

Responsibilities:

- `*.routes.ts`: URL mapping, authentication, authorization, rate limits and validation middleware.
- `*.controller.ts`: Translate HTTP request/response only. No business rules or Prisma queries.
- `*.service.ts`: Business rules, orchestration, authorization-sensitive decisions and transactions.
- `*.repository.ts`: Prisma/database queries only. No Express request or response objects.
- `dto/*.dto.ts`: Zod schemas and types inferred with `z.infer`.
- `*.mapper.ts`: Optional mapping from database records to response DTOs.
- `index.ts`: Module manifest and public module exports.

Shared technical code belongs in:

- `src/config`: environment and infrastructure configuration.
- `src/common/errors`: application errors.
- `src/common/middleware`: cross-module middleware.
- `src/common/utils`: pure reusable utilities.
- `src/database`: Prisma lifecycle and database infrastructure.
- `src/docs`: OpenAPI configuration.
- `src/routes`: top-level route composition only.

Do not create generic helpers until at least two modules genuinely need them. Do not import another module's controller or repository. Cross-module access must go through the other module's public service/API.

## 4. Module implementation template

When implementing a domain endpoint, evolve its folder toward this shape:

```text
src/modules/<domain>/
  dto/
    create-entity.dto.ts
    update-entity.dto.ts
    list-entity-query.dto.ts
  <domain>.repository.ts
  <domain>.service.ts
  <domain>.controller.ts
  <domain>.routes.ts
  <domain>.mapper.ts          # only when useful
  index.ts
```

The domain folders already contain empty layer scaffolds so team members can start consistently. Replace those exports with real implementations as use cases are assigned. Never add fake responses or placeholder behavior that appears functional. Keep the module manifest's tables and capabilities synchronized with implementation scope.

## 5. TypeScript rules

- Preserve strict TypeScript settings, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Do not use `any`, `@ts-ignore`, non-null assertions, or unsafe casts to silence errors.
- Prefer `unknown` at untrusted boundaries and narrow it safely.
- Use `import type` for type-only imports.
- Use the `@/` path alias for imports across directories and `.js` extensions in source imports because output uses NodeNext modules.
- Prefer small named functions and explicit return types on exported functions.
- Use existing naming: kebab-case directories, dot-suffixed files, camelCase values, PascalCase types/classes.
- Do not expose Prisma model types directly as public API contracts when a response DTO is appropriate.
- The introspected Prisma models and fields intentionally use database `snake_case`. Repositories may use these generated names, but controllers must map them to stable camelCase API response DTOs.
- Do not rename Prisma models or fields only for aesthetics. A naming cleanup requires complete `@map`/`@@map` coverage, regenerated Client, updated repositories and verification that the migration diff is empty.

## 6. HTTP and API conventions

- All business APIs are mounted below the configured `API_PREFIX` (normally `/api/v1`).
- Use plural resource names and REST semantics.
- Use `GET` for reads, `POST` for creation/actions, `PATCH` for partial updates and `DELETE` for deletion/revocation.
- Use standard status codes: `200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `422`, `429`, `500`.
- Successful JSON responses use `{ "success": true, "data": ... }`.
- Errors must go through `AppError` and the central error handler. Do not return ad hoc error shapes.
- Never reveal stack traces, database details, secrets, password hashes or existence-sensitive authentication details in production responses.
- Add pagination to every unbounded list endpoint. Prefer `page`, `limit`, `sortBy`, and `sortOrder` until a domain needs cursor pagination.
- Validate body, params and query with Zod before the controller.
- Add/update the route in `src/docs/openapi.ts` in the same change. Document authentication, authorization, input, success and error responses.

## 7. Authentication and authorization

- Access tokens are short-lived JWTs signed with the configured algorithm/secret and restricted by issuer, audience and token type.
- Refresh tokens are opaque random values. Store only their SHA-256 hashes and rotate them on use.
- Passwords must use Argon2id. Never log, return or store plaintext passwords.
- Protected routes must use `authenticate` before `authorize`.
- Authorization is permission-based. Do not rely only on UI checks or role names in business logic.
- Use generic login/reset errors to reduce account enumeration risk.
- Security-sensitive actions must produce audit records when audit infrastructure for the affected use case exists.

Do not weaken existing authentication, CORS, Helmet, rate limiting, request-size limits, token verification or secret validation for convenience.

## 8. Database rules

- Put normal queries in a module repository using Prisma.
- Explicitly use `select` for response-facing reads to prevent accidental secret leakage and over-fetching.
- Respect soft deletion (`deletedAt`) and entity status fields where defined.
- Use a transaction for multi-write operations that must succeed or fail together.
- Avoid N+1 queries; use appropriate Prisma relations/selects or bounded batch queries.
- Never use `$queryRawUnsafe` or string-built SQL with user input. Raw SQL must use Prisma's parameterized tagged template.
- Every schema change requires an intentional migration under `prisma/migrations/`.
- Add indexes for foreign keys and common filters after considering actual query patterns.
- Do not edit an already deployed migration. Add a new migration.
- Do not run destructive resets, drops or production migrations without explicit user authorization.
- The Supabase `public` schema must contain exactly the 75 approved business tables plus Prisma's `_prisma_migrations` table. Do not modify Supabase-managed schemas such as `auth`, `storage`, `realtime`, `extensions` or `vault`.
- Prisma does not fully represent PostgreSQL comments, deferred foreign keys or all check-constraint metadata. Preserve these in SQL migrations; do not assume `prisma db pull` captures every database feature.
- Run `npm run db:verify` after schema changes. It must report 75 tables, 134 foreign keys, 85 checks, and empty `missing`/`unexpected` lists.

Repository example:

```ts
export const entityRepository = {
  findById(id: string) {
    return prisma.entity.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, status: true },
    });
  },
};
```

## 9. Security and privacy

- Treat all request data, uploaded files, integration payloads and external API responses as untrusted.
- Never commit `.env`, credentials, tokens, private keys, production URLs or real personal data.
- Treat the Supabase access token, database password, project connection string and service-role key as secrets. Never place them in source, documentation, command output, frontend code or Git history.
- Backend Prisma is the only approved application path to PostgreSQL. Do not expose Supabase Data API tables directly to the frontend unless a separately approved RLS design is implemented and tested.
- Keep secrets in environment variables/secret managers and preserve logger redaction.
- Apply allow-lists for CORS, file types, sort fields, filters, webhook origins and redirect targets.
- Use parameterized queries and output-safe response serialization.
- Apply stricter rate limits to login, refresh, password reset, MFA and ingestion endpoints.
- Validate file size, MIME type, extension and content where file upload is implemented.
- Encrypt integration secrets at application level with managed keys; do not merely encode them.
- Minimize personal data in logs and audit records.
- Do not claim the system is secure merely because middleware exists. Mention remaining deployment controls when relevant.

## 10. Testing requirements

For every implemented use case, add tests proportionate to risk:

- DTO validation tests for important boundaries.
- Service tests for business rules and authorization-sensitive branches.
- Repository/integration tests for complex Prisma queries.
- HTTP tests for route status codes, response shape, authentication and errors.
- Security regression tests when fixing a vulnerability.

Tests must not depend on execution order or real production services. Mock only external boundaries; avoid mocking away the business logic being tested.

Before declaring work complete, run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm audit
npx prisma validate
npm run db:verify
```

If a database-dependent test is intentionally not run, state that clearly in the handoff.

## 11. Git and change discipline

- Work from `develop` unless the user names another branch.
- Preserve unrelated user changes and project documents.
- Keep commits scoped and use Conventional Commits, for example `feat(risks): add assessment creation`.
- Do not commit generated `dist/`, coverage, local logs, `.env`, uploads or editor configuration.
- Do not rewrite shared history, force-push, reset, or delete branches without explicit authorization.
- Before commit, inspect `git diff --check`, staged files and test results.

## 12. Definition of done

A code task is complete only when:

- The requested behavior is implemented in the correct module and layer.
- Input validation, authentication and permission checks are present where required.
- Database access is safe, bounded and transactionally correct.
- Responses do not leak protected fields.
- OpenAPI documentation matches the implementation.
- Relevant tests pass along with typecheck, lint and build.
- Schema changes include a migration.
- Live database verification passes when the task changes database structure.
- The handoff states what changed, how it was verified and any remaining limitation.

When requirements are ambiguous, inspect the project references and existing patterns first. Ask the user only when a choice would materially change business behavior, security, data design or public API compatibility.

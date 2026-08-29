# SecuraAI Backend

Production-oriented REST API skeleton for the SecuraAI GRC platform, built with Express 5, TypeScript, PostgreSQL, Prisma and OpenAPI/Swagger.

## Included

- Modular route/controller/service structure with strict TypeScript
- PostgreSQL schema and migrations through Prisma
- JWT access tokens and opaque, hashed, rotating refresh tokens
- Argon2id password hashing and RBAC-ready roles/permissions
- Zod request/environment validation and consistent error responses
- Helmet, CORS allow-list, rate limiting, HPP and request-size limits
- Structured Pino logs with secret redaction and request IDs
- Swagger UI, health/readiness endpoints, graceful shutdown and tests

## Quick start

Requirements: Node.js 22+, npm and Docker (or PostgreSQL 14+).

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
npm run dev
```

Swagger UI: `http://localhost:3000/docs`. Replace every example secret before non-local use.

## Main commands

| Command | Purpose |
|---|---|
| `npm run dev` | Run with hot reload |
| `npm run build && npm start` | Build/run production output |
| `npm run db:migrate` | Create/apply a development migration |
| `npm run db:deploy` | Apply committed production migrations |
| `npm run db:seed` | Create initial admin role/user |
| `npm run lint` | Static analysis |
| `npm run typecheck` | Strict TypeScript validation |
| `npm test` | Run tests |

## Structure

```text
src/
  common/       errors, middleware, shared utilities
  config/       validated environment and logging
  database/     Prisma client lifecycle
  docs/         OpenAPI definition
  modules/      business modules (auth, users, health, ...)
  routes/       top-level API composition
  app.ts        Express application composition
  server.ts     process and HTTP server lifecycle
prisma/         schema and seed
tests/          tests
project-docs/   project proposals, reports and reference database designs
```

## Production security

- Inject generated secrets through a secret manager and serve only behind HTTPS.
- Configure exact CORS origins and disable or protect Swagger when appropriate.
- The in-memory limiter fits one instance; use a shared Redis-backed store when scaling.
- Run dependency, source and container scanning in CI. Application middleware is only one layer of hardening.

# V3 API reference — not executable

This snapshot contains the API source and tests from commit `8adcb5a`, before the V3 handlers were removed. It is retained only to support endpoint-by-endpoint migration to the approved 56-table V2 schema.

Files here are excluded from TypeScript builds, ESLint, and Vitest. Do not import or register a handler from this directory: its repositories and authorization logic refer to V3 tables absent from V2. For each migrated use case, preserve the intended HTTP contract where appropriate, rewrite the repository/service against `prisma/schema.prisma`, add current tests and OpenAPI documentation, then register that V2 route under `/api/v1`.

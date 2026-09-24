# Business module map

This folder mirrors the domain groups defined by `project-docs/database.txt` and the 101 use cases in the project proposal. `auth`, `users`, and `health` are working reference modules; the other domain modules are intentional implementation skeletons.

## Team allocation

| Suggested owner | Modules |
|---|---|
| Member 1 | `auth`, `users`, `access-control`, `organization`, `notifications`, `audit-settings` |
| Member 2 | `asset-management`, `risk-management`, `file-management` |
| Member 3 | `policy-compliance`, `incident-management`, `training-awareness` |
| Member 4 | `security-monitoring`, `ai-alerts` |
| Member 5 | `reporting`, `approval-workflow`, `integrations` |

## Structure when implementing a module

Do not put business logic in the module manifest. Add files next to `index.ts` as endpoints are implemented:

```text
<module>/
  dto/
    create-*.dto.ts       Zod input schemas and inferred types
  <module>.routes.ts      URL and middleware composition
  <module>.controller.ts  HTTP-only request/response mapping
  <module>.service.ts     authorization-aware business rules/transactions
  <module>.repository.ts  Prisma queries only
  <module>.mapper.ts      optional database-to-response mapping
  index.ts                module manifest/public exports
```

The dependency direction is `routes -> controller -> service -> repository -> Prisma`. A module may call another module's public service, but must not import its controller or repository directly.

## Rules

- Add a permission code for every protected operation and enforce it at the route boundary.
- Keep Prisma queries in repositories; raw SQL must use parameterized `$queryRaw` tagged templates.
- Validate body, params, and query with Zod before the controller.
- Select response fields explicitly so password hashes, encrypted secrets, and internal metadata cannot leak.
- Record changes to security-sensitive entities in `audit_logs` within the same transaction when possible.
- Document every public route in OpenAPI and add service/repository tests before opening a pull request.

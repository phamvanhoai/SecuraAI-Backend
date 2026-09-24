# Users module

## Deactivate or remove a user

Administrators with `users.deactivate` can POST a required reason to
`/api/v1/users/{userId}/deactivate`, changing the account to `disabled`.
Administrators with `users.remove` can DELETE `/api/v1/users/{userId}` with a
required reason; removal is a soft delete (`deleted_at`), not a physical delete.
Both actions revoke sessions, cancel pending MFA login challenges, and write an
audit record in one transaction. Self-management and removing the last active
administrator are forbidden. A previously disabled account returns `changed: false`
for repeat deactivation; a previously removed account returns 404. Both routes
are also available below `/api/v1/admin/users`.

## Edit user accounts

Administrators with `users.update` can update profile and department
through `PATCH /api/v1/users/{userId}` (also available below
`/api/v1/admin/users`). Email, credentials, MFA, and account lock state are not
editable through this use case. Role changes are not accepted here; duplicate
employee codes return a conflict,
and every successful change writes before/after audit data.

## Assign user roles

ADMIN with `users.assign-role` can list available roles at `/api/v1/users/assignable-roles`
and POST `{ roleCodes }` to `/api/v1/users/{userId}/roles`. Assignment adds only
missing roles and never removes existing ones. A disabled or removed user cannot
receive roles. Each change records the actor and an audit event in one transaction.
The acting administrator's current permission is rechecked in the transaction.
Already assigned roles return `changed: false` without a duplicate audit event.
Creating a user with roles requires both `users.create` and `users.assign-role`.
Role assignment revokes the target's refresh sessions. The user must sign in
again to receive the new roles and permissions; an existing access token retains
its old, short-lived claims until expiry.

## Add user accounts

Administrators with `users.create` can load active departments and assignable
roles from `GET /api/v1/users/create-options`, then create an account with
`POST /api/v1/users`. The routes are also available below `/api/v1/admin/users`.
The service rechecks authorization, validates department and role references,
hashes a generated temporary password with Argon2id, and creates the user, role
assignments, and audit record atomically. The temporary password is sent only by
email and must be changed after the first sign-in.

## View user accounts

Administrators with `users.read` can list accounts through `GET /api/v1/users`
and open one account through `GET /api/v1/users/{userId}`. Both operations are
also available below `/api/v1/admin/users`. The detail response includes safe
profile, department, assigned-role, MFA-state, and account-activity metadata;
credential hashes, MFA secrets, refresh sessions, and recovery codes are never
selected. Deleted or missing accounts return `USER_NOT_FOUND`.

## Lock and unlock behavior

The project proposal assigns UC7 to Admin. Authorization uses `users.lock` and
`users.unlock`, granted to ADMIN by the explicit permission migration and seed.
Both the ADMIN role and the operation permission are mandatory. Granting these
permissions to another role does not allow it to lock/unlock accounts. The acting
account, its current ADMIN membership and permissions are rechecked inside the transaction.

- `POST /api/v1/users/{userId}/lock`: active → locked.
- `POST /api/v1/users/{userId}/unlock`: locked → active.
- Both routes also exist under `/api/v1/admin/users`.
- Body: `{ "reason": "Account temporarily locked during security investigation" }`.
  Both actions require a trimmed reason of 10–1000 characters.
- Repeating the same action returns `changed: false`. No duplicate audit is written.
- Inactive, disabled or deleted accounts are not reactivated. Self-management is
  forbidden. The last active ADMIN holding both account-management permissions
  cannot be locked, including when those permissions come from multiple roles.
- Status change, refresh-session revocation, MFA-challenge cancellation, and audit
  are atomic. Password, MFA enrollment/recovery codes, roles, ownership and
  business records are preserved. Unlock does not restore old sessions.
- Every protected request checks the account in PostgreSQL. `locked_at` retains
  the last lock timestamp after unlock; new JWTs carry that exact version so
  tokens issued before the lock remain invalid after unlock. Legacy tokens for
  previously locked accounts require a fresh login. The response exposes this as
  `lastLockedAt`, rather than implying that an active account is currently locked.
- Account management serializes through a transaction advisory lock; session
  creation/refresh and MFA challenge issuance/consumption lock the target user row
  to prevent sessions crossing a lock/unlock operation.

Preview in Swagger at `/docs`: sign in as an authorized administrator, authorize
with the access token, then use the Users lock/unlock operations. Apply the new
permission migration through the normal deployment process first, and sign in
again to obtain the new permissions. No live migration is applied by this change.

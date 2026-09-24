# Users module

## Deactivate or remove a user

Administrators with `users.deactivate` can POST a required reason to
`/api/v1/users/{userId}/deactivate`, changing the account to `disabled`.
Administrators with `users.remove` can DELETE `/api/v1/users/{userId}` with a
required reason; removal is a soft delete (`deleted_at`), not a physical delete.
Both actions revoke sessions and write an
audit record in one transaction. Self-management and removing the last active
administrator are forbidden. A previously disabled account returns `changed: false`
for repeat deactivation; a previously removed account returns 404. Both routes
are also available below `/api/v1/admin/users`.

## Edit user accounts

Administrators with `users.update` can update profile and department
through `PATCH /api/v1/users/{userId}` (also available below
`/api/v1/admin/users`). Email, credentials, and account lock state are not
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
profile, department, assigned-role, and account-activity metadata;
credential hashes and refresh sessions are never
selected. Deleted or missing accounts return `USER_NOT_FOUND`.

# Users module

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

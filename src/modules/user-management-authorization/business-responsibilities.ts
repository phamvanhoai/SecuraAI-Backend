import type { Prisma } from '@prisma/client';
import type { UserAccessScopeCode } from './user-access-scope-catalog.js';

/** Eligibility only. Every resource operation must still verify its actual owner.
 * Existing owners retain eligibility without a database backfill.
 */
export function responsibilityWhere(code: UserAccessScopeCode): Prisma.usersWhereInput {
  const existingOwnership: Prisma.usersWhereInput = code === 'RISK_OWNER'
    ? { risks_risks_owner_user_idTousers: { some: {} } }
    : code === 'CONTROL_OWNER'
      ? { security_controls_security_controls_owner_user_idTousers: { some: {} } }
      : code === 'ASSET_OWNER'
        ? { assets_assets_owner_user_idTousers: { some: {} } }
        : { id: { in: [] } };
  return {
    status: 'ACTIVE',
    OR: [
      { role: { not: 'EMPLOYEE' } },
      { role: 'EMPLOYEE', ...existingOwnership },
      { role: 'EMPLOYEE', user_access_scopes_user_access_scopes_user_idTousers: { some: {
        scope_code: code, effect: 'ALLOW', role: null,
        asset_id: null, business_service_id: null,
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
      } } },
    ],
  };
}

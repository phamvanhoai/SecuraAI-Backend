import type { Prisma } from '@prisma/client';
import type { UserAccessScopeCode } from './user-access-scope-catalog.js';

export const approverGrantSelect = {
  user_access_scopes_user_access_scopes_user_idTousers: {
    where: { scope_code: 'AUTHORIZED_APPROVER', effect: 'ALLOW', role: null,
      asset_id: null, business_service_id: null, expires_at: null },
    select: { id: true },
  },
} as const;

/** Risk acceptance workflow eligibility; callers must also enforce request state and separation of duties. */
export function isRiskAcceptanceApprover(actor: {
  role: string; status: string;
  user_access_scopes_user_access_scopes_user_idTousers?: readonly { id: string }[];
}): boolean {
  return actor.status === 'ACTIVE' && (['SECURITY_OFFICER', 'EXECUTIVE'].includes(actor.role) ||
    (actor.role === 'EMPLOYEE' && Boolean(actor.user_access_scopes_user_access_scopes_user_idTousers?.length)));
}

/** Eligibility only. Every resource operation must still verify its actual owner.
 * Existing owners retain eligibility without a database backfill.
 */
export function responsibilityWhere(code: UserAccessScopeCode, allowExistingOwnership = true): Prisma.usersWhereInput {
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
      ...(allowExistingOwnership ? [{ role: { not: 'EMPLOYEE' as const } }] : []),
      ...(allowExistingOwnership ? [{ role: 'EMPLOYEE' as const, ...existingOwnership }] : []),
      { role: 'EMPLOYEE', user_access_scopes_user_access_scopes_user_idTousers: { some: {
        scope_code: code, effect: 'ALLOW', role: null,
        asset_id: null, business_service_id: null,
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
      } } },
    ],
  };
}

import { describe, expect, it } from 'vitest';
import { assignUserAccessBodySchema } from '../src/modules/user-management-authorization/dto/assign-user-access.dto.js';
import { responsibilityWhere } from '../src/modules/user-management-authorization/business-responsibilities.js';

describe('Employee business responsibilities', () => {
  const grant = { scopeCode: 'RISK_OWNER', targetType: 'GLOBAL' };
  it('accepts each responsibility individually and rejects multiple selections', () => {
    for (const scopeCode of ['RISK_OWNER', 'CONTROL_OWNER', 'ASSET_OWNER', 'AUTHORIZED_APPROVER']) {
      expect(assignUserAccessBodySchema.safeParse({ role: 'EMPLOYEE', scopes: [{ ...grant, scopeCode }] }).success).toBe(true);
    }
    expect(assignUserAccessBodySchema.safeParse({ role: 'EMPLOYEE', scopes: [grant,
      { ...grant, scopeCode: 'CONTROL_OWNER' }] }).success).toBe(false);
  });
  it.each(['ADMIN', 'EXECUTIVE', 'SECURITY_OFFICER'])('rejects responsibility grants for %s', (role) => {
    expect(assignUserAccessBodySchema.safeParse({ role, scopes: [grant] }).success).toBe(false);
  });
  it('rejects obsolete permissions, duplicate roles, expiry and resource-wide grants', () => {
    for (const scopes of [[{ ...grant, scopeCode: 'AUDIT_VIEW' }], [grant, grant],
      [{ ...grant, expiresAt: '2099-01-01T00:00:00Z' }],
      [{ ...grant, targetType: 'ASSET', targetId: '00000000-0000-4000-8000-000000000001' }]]) {
      expect(assignUserAccessBodySchema.safeParse({ role: 'EMPLOYEE', scopes }).success).toBe(false);
    }
  });
  it('requires an active account and an allow grant or existing ownership for Employees', () => {
    const where = responsibilityWhere('RISK_OWNER');
    expect(where.status).toBe('ACTIVE');
    expect(where.OR).toContainEqual({ role: 'EMPLOYEE', risks_risks_owner_user_idTousers: { some: {} } });
    expect(JSON.stringify(where)).toContain('RISK_OWNER');
    expect(JSON.stringify(where)).toContain('ALLOW');
  });
  it('does not infer Authorized Approver from asset ownership', () => {
    const where = responsibilityWhere('AUTHORIZED_APPROVER');
    expect(JSON.stringify(where)).not.toContain('assets_assets_owner');
    expect(JSON.stringify(where)).toContain('AUTHORIZED_APPROVER');
  });
});

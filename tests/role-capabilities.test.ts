import { describe, expect, it } from 'vitest';
import { user_role } from '@prisma/client';
import { capabilitiesForRole } from '../src/modules/user-management-authorization/role-capabilities.js';

describe('WBS role capability compatibility', () => {
  it('has exactly the four V2 database roles', () => {
    expect(Object.values(user_role).sort()).toEqual([
      'ADMIN',
      'EMPLOYEE',
      'EXECUTIVE',
      'SECURITY_OFFICER',
    ]);
  });

  it('keeps Admin user management separate from Security Officer operations', () => {
    const admin = capabilitiesForRole(user_role.ADMIN);
    const officer = capabilitiesForRole(user_role.SECURITY_OFFICER);
    expect(admin).toContain('users.read');
    expect(admin).not.toContain('assets.read');
    expect(officer).toContain('assets.read');
    expect(officer).not.toContain('users.assign-role');
  });

  it('does not invent ownership or removed training grants', () => {
    const all = Object.values(user_role).flatMap((role) => capabilitiesForRole(role));
    expect(all.some((capability) => capability.startsWith('training-'))).toBe(false);
    expect(all).not.toContain('risks.cancel');
    expect(all).not.toContain('roles.update');
  });

  it('allows only Security Officer to run anomaly detection', () => {
    for (const role of Object.values(user_role)) {
      expect(capabilitiesForRole(role).includes('anomaly-detection.run')).toBe(
        role === user_role.SECURITY_OFFICER,
      );
    }
  });

  it('limits Executive and Employee to functions explicitly listed for them', () => {
    expect(capabilitiesForRole(user_role.EXECUTIVE)).toEqual([
      'ai-alerts.thresholds.manage',
      'incidents.read',
      'reports.read',
    ]);
    expect(capabilitiesForRole(user_role.EMPLOYEE)).toEqual(['policies.acknowledge']);
  });
});

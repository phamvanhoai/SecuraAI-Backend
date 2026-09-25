import type { user_role } from '@prisma/client';

/**
 * Compatibility capability names for the current frontend. These are derived
 * conservatively from the "Vai trò thực hiện" column in
 * project-docs/new/Report3_Project Tracking.xlsx (WBS), not from a database
 * permission grant. Future V2 handlers must enforce their own role/scope rules.
 * Ownership-specific actors and removed training use cases are not inferred.
 */
const capabilitiesByRole = {
  ADMIN: [
    'users.read',
    'users.create',
    'users.update',
    'users.assign-role',
    'assets.classify',
    'policies.publish',
    'login-history.read',
    'log-sources.read',
    'integrations.read',
    'audit.read',
    'system-settings.read',
  ],
  SECURITY_OFFICER: [
    'assets.read',
    'assets.create',
    'assets.update',
    'assets.assign-owner',
    'assets.classify',
    'risks.read',
    'risks.create',
    'risks.update',
    'ai-alerts.read',
    'ai-alerts.confirm',
    'ai-alerts.feedback',
    'ai-alerts.mark-false-positive',
    'ai-alerts.thresholds.manage',
    'anomaly-detection.run',
    'ai-models.read',
    'policies.create',
    'policies.update',
    'policies.submit',
    'incidents.read',
    'incidents.report',
    'incidents.classify',
    'incidents.assign',
    'incidents.update-progress',
    'compliance.assess-controls',
    'login-history.read',
    'log-sources.read',
    'reports.read',
  ],
  EXECUTIVE: [
    'ai-alerts.thresholds.manage',
    'incidents.read',
    'reports.read',
  ],
  EMPLOYEE: [
    'policies.acknowledge',
  ],
} as const satisfies Record<user_role, readonly string[]>;

export function capabilitiesForRole(role: user_role): readonly string[] {
  return capabilitiesByRole[role];
}

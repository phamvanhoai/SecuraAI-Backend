import type { user_role } from '@prisma/client';

/**
 * Compatibility capability names for the current frontend. These are derived
 * conservatively from the "Vai trò thực hiện" column in
 * project-docs/new/Report3_Project Tracking.xlsx (WBS), not from a database
 * permission grant. Future V2 handlers must enforce their own role/scope rules.
 * `assets.read` grants entry to the asset directory; the asset API still
 * enforces contextual Asset Owner scope for non-Security-Officer accounts.
 */
export const capabilitiesByRole = {
  ADMIN: [
    'roles.read',
    'roles.update',
    'assets.read',
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
    'business-services.read',
    'business-services.create',
    'business-services.update',
    'business-services.deactivate',
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
    'incidents.link-assets',
    'incidents.link-controls',
    'incidents.link-risks',
    'incidents.record-control-weakness',
    'incidents.request-risk-reassessment',
    'compliance.assess-controls',
    'controls.create',
    'controls.update',
    'login-history.read',
    'log-sources.read',
    'reports.read',
  ],
  EXECUTIVE: [
    'assets.read',
    'risks.read',
    'ai-alerts.thresholds.manage',
    'incidents.read',
    'reports.read',
  ],
  EMPLOYEE: ['assets.read', 'policies.acknowledge'],
} as const satisfies Record<user_role, readonly string[]>;

export function capabilitiesForRole(role: user_role): readonly string[] {
  return capabilitiesByRole[role];
}

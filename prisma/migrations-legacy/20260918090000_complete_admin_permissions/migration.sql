INSERT INTO permissions (code, module, action, description)
VALUES
  ('ai-alerts.thresholds.manage', 'ai-alerts', 'manage-thresholds', 'Set custom AI alert thresholds for assets'),
  ('mfa-recovery.manage', 'access-control', 'manage-mfa-recovery', 'Review and decide MFA recovery requests')
ON CONFLICT (code) DO UPDATE SET
  module = EXCLUDED.module,
  action = EXCLUDED.action,
  description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.role_id, permission.permission_id
FROM roles AS role
CROSS JOIN permissions AS permission
WHERE role.code = 'ADMIN'
ON CONFLICT DO NOTHING;

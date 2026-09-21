INSERT INTO permissions (code, module, action, description)
VALUES (
  'training-certificates.read-issued',
  'training-awareness',
  'read-issued-certificates',
  'View all issued training certificates (UC164)'
)
ON CONFLICT (code) DO UPDATE SET
  module = EXCLUDED.module,
  action = EXCLUDED.action,
  description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.role_id, permission.permission_id
FROM roles AS role
CROSS JOIN permissions AS permission
WHERE role.code IN ('ADMIN', 'SECURITY_OFFICER')
  AND permission.code = 'training-certificates.read-issued'
ON CONFLICT DO NOTHING;

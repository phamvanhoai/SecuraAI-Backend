INSERT INTO permissions (code, module, action, description)
VALUES (
  'training-certificates.read-own',
  'training-awareness',
  'read-own-certificates',
  'View certificates issued for the signed-in user (UC165)'
)
ON CONFLICT (code) DO UPDATE SET
  module = EXCLUDED.module,
  action = EXCLUDED.action,
  description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.role_id, permission.permission_id
FROM roles AS role
CROSS JOIN permissions AS permission
WHERE role.code IN ('ADMIN', 'EMPLOYEE')
  AND permission.code = 'training-certificates.read-own'
ON CONFLICT DO NOTHING;

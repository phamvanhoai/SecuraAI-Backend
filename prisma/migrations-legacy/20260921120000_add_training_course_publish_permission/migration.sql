INSERT INTO permissions (code, module, action, description)
VALUES (
  'training-courses.publish',
  'training-awareness',
  'publish-course',
  'Publish a completed security awareness course draft (UC165)'
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
  AND permission.code = 'training-courses.publish'
ON CONFLICT DO NOTHING;

INSERT INTO permissions (code, module, action, description)
VALUES ('training-department-reports.read', 'training-awareness', 'read-department-report', 'View department training completion reports (UC81)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('ADMIN', 'EXECUTIVE') AND p.code = 'training-department-reports.read'
ON CONFLICT DO NOTHING;

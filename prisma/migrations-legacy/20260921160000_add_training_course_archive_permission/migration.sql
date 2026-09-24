INSERT INTO permissions (permission_id, code, module, action, description)
VALUES (gen_random_uuid(), 'training-courses.archive', 'training-awareness', 'archive-course', 'Archive published security awareness courses')
ON CONFLICT (code) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('ADMIN', 'SECURITY_OFFICER') AND p.code = 'training-courses.archive'
ON CONFLICT DO NOTHING;

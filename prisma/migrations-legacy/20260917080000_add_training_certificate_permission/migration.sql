-- UC80 permission data only: no database tables or columns are changed.
INSERT INTO permissions (code, module, action, description)
VALUES ('training-certificates.issue', 'training-awareness', 'issue-certificate',
        'Issue certificates for completed training with a passed assessment')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('ADMIN', 'SECURITY_OFFICER')
  AND p.code = 'training-certificates.issue'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Completion read is the prerequisite for navigating to certificate issuance.
INSERT INTO permissions (code, module, action, description)
VALUES ('training-completion.read', 'training-awareness', 'read-completion',
        'View training campaign and employee completion progress')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('ADMIN', 'SECURITY_OFFICER', 'EXECUTIVE')
  AND p.code = 'training-completion.read'
ON CONFLICT (role_id, permission_id) DO NOTHING;

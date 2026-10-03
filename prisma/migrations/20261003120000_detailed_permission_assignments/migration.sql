ALTER TABLE user_access_scopes
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN role user_role,
  ADD COLUMN effect varchar(10) NOT NULL DEFAULT 'ALLOW';

ALTER TABLE user_access_scopes
  ADD CONSTRAINT chk_access_scope_principal CHECK (num_nonnulls(user_id, role) = 1),
  ADD CONSTRAINT chk_access_scope_effect CHECK (effect IN ('ALLOW', 'DENY'));

CREATE INDEX idx_access_scopes_role ON user_access_scopes(role);

COMMENT ON COLUMN user_access_scopes.role IS
  'Fixed role principal for a role-level permission grant. Exactly one of user_id or role is present.';
COMMENT ON COLUMN user_access_scopes.effect IS
  'ALLOW grants a permission; DENY is valid only for a user override and takes precedence over role grants.';

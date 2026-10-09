CREATE TABLE policy_applicabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version_id uuid NOT NULL UNIQUE,
  department_ids uuid[] NOT NULL DEFAULT '{}',
  role_codes user_role[] NOT NULL DEFAULT '{}',
  user_groups text[] NOT NULL DEFAULT '{}',
  organizational_scope text,
  rationale text NOT NULL,
  reference_basis text NOT NULL,
  defined_by uuid NOT NULL,
  defined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_policy_applicability_version FOREIGN KEY (policy_version_id)
    REFERENCES policy_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_policy_applicability_defined_by FOREIGN KEY (defined_by)
    REFERENCES users(id),
  CONSTRAINT chk_policy_applicability_target CHECK (
    cardinality(department_ids) > 0 OR cardinality(role_codes) > 0 OR
    cardinality(user_groups) > 0 OR length(trim(organizational_scope)) > 0
  ),
  CONSTRAINT chk_policy_applicability_rationale CHECK (length(trim(rationale)) BETWEEN 20 AND 2000),
  CONSTRAINT chk_policy_applicability_reference CHECK (length(trim(reference_basis)) BETWEEN 5 AND 2000)
);

CREATE INDEX idx_policy_applicability_defined_by ON policy_applicabilities(defined_by);

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(50) NOT NULL UNIQUE,
  name varchar(255) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT chk_departments_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

ALTER TABLE users
  ADD COLUMN phone varchar(30),
  ADD COLUMN employee_code varchar(50),
  ADD COLUMN department_id uuid;

ALTER TABLE users
  ADD CONSTRAINT uq_users_employee_code UNIQUE (employee_code),
  ADD CONSTRAINT fk_users_department
    FOREIGN KEY (department_id) REFERENCES departments(id)
    ON UPDATE NO ACTION ON DELETE SET NULL;

CREATE INDEX idx_users_department_id ON users(department_id);

INSERT INTO departments (code, name)
VALUES
  ('IT', 'Information Technology'),
  ('SECURITY', 'Information Security'),
  ('HR', 'Human Resources'),
  ('FINANCE', 'Finance'),
  ('OPERATIONS', 'Operations')
ON CONFLICT (code) DO NOTHING;

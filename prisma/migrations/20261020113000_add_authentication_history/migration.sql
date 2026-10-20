CREATE TABLE authentication_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id),
    email_attempted varchar(255) NOT NULL,
    status varchar(16) NOT NULL,
    failure_reason varchar(100),
    ip_address varchar(45),
    user_agent text,
    occurred_at timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT chk_authentication_history_status CHECK (status IN ('SUCCESS', 'FAILED')),
    CONSTRAINT chk_authentication_history_failure CHECK ((status = 'SUCCESS' AND failure_reason IS NULL) OR (status = 'FAILED' AND failure_reason IS NOT NULL))
);
CREATE INDEX idx_authentication_history_occurred ON authentication_history(occurred_at DESC, id DESC);
CREATE INDEX idx_authentication_history_user ON authentication_history(user_id, occurred_at DESC);
CREATE INDEX idx_authentication_history_email ON authentication_history(email_attempted, occurred_at DESC);

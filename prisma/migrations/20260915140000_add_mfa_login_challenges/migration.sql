ALTER TABLE "mfa_methods"
  ADD COLUMN "login_challenge_token_hash" varchar(64),
  ADD COLUMN "login_challenge_expires_at" timestamptz(6),
  ADD COLUMN "login_challenge_attempts" smallint NOT NULL DEFAULT 0,
  ADD COLUMN "login_challenge_ip" inet;

CREATE UNIQUE INDEX "mfa_methods_login_challenge_token_hash_key"
  ON "mfa_methods"("login_challenge_token_hash");

CREATE INDEX "mfa_methods_login_challenge_expires_at_idx"
  ON "mfa_methods"("login_challenge_expires_at");

ALTER TABLE "mfa_methods"
  ADD COLUMN "last_used_totp_step" bigint,
  ADD COLUMN "recovery_code_hashes" jsonb;

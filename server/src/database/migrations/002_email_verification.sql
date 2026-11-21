-- NestWell.BT — 002: registered-email verification
-- Target: MySQL 8.0+. Run ONCE against an existing database (fresh installs use schema.sql).
--
-- BEFORE RUNNING, confirm the legacy columns exist (schema.sql had them, but check your live DB):
--   SHOW COLUMNS FROM users LIKE 'is_email_verified';
--   SHOW COLUMNS FROM users LIKE 'email_verification_token';
-- If either is missing, replace the matching CHANGE COLUMN below with ADD COLUMN.

START TRANSACTION;

ALTER TABLE users
  CHANGE COLUMN is_email_verified        is_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  CHANGE COLUMN email_verification_token verification_token VARCHAR(128) NULL,
  ADD COLUMN verification_code_hash CHAR(64) NULL                       AFTER verification_token,
  ADD COLUMN verification_attempts  TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER verification_code_hash,
  ADD COLUMN verification_sent_at   DATETIME NULL                       AFTER verification_attempts,
  ADD COLUMN token_expires_at       DATETIME NULL                       AFTER verification_sent_at,
  ADD COLUMN email_verified_at      DATETIME NULL                       AFTER token_expires_at,
  ADD INDEX  idx_users_verification_token (verification_token);

-- Any value in the old column was a plaintext token. The new column holds hashes only.
UPDATE users SET verification_token = NULL;

-- Accounts that were already verified keep working; stamp when (approximately).
UPDATE users SET email_verified_at = created_at WHERE is_verified = TRUE AND email_verified_at IS NULL;

-- The admin review screen already looks for this column; registration now fills it.
ALTER TABLE caretaker_profiles ADD COLUMN certificate_document_path VARCHAR(255) NULL AFTER id_document_path;

-- Lets /auth/refresh tell a harmless racing refresh (two tabs) from a replayed, stolen token.
ALTER TABLE refresh_tokens ADD COLUMN revoked_at DATETIME NULL AFTER revoked;

COMMIT;

-- Accounts with is_verified = FALSE can no longer sign in. They get a fresh code automatically
-- the next time they enter the correct password, or via POST /api/auth/resend-verification.
-- To grandfather every existing account instead (not recommended for production):
--   UPDATE users SET is_verified = TRUE, email_verified_at = NOW() WHERE is_verified = FALSE;

-- ---------------------------------------------------------------------------
-- Pre-existing bug fix (unrelated to email): bookings.child_id pointed at users(id) instead of
-- children(id), so any booking that references a child profile violated the foreign key.
-- Find the constraint name, then swap it:
--   SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'child_id' AND REFERENCED_TABLE_NAME = 'users';
--   ALTER TABLE bookings DROP FOREIGN KEY <name_from_above>;
--   ALTER TABLE bookings ADD CONSTRAINT fk_bookings_child FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE RESTRICT;

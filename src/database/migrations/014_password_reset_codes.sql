-- +migrate Up

-- ---------------------------------------------------------------------------
-- Password reset by emailed code
--
-- The reset used to hand out a long opaque token. A person now receives a short
-- numeric code by email and types it in, which means the code is guessable by
-- brute force in a way a 32-byte token never was. `attempts` caps how many
-- guesses a single issued code will tolerate before it is spent.
-- ---------------------------------------------------------------------------

ALTER TABLE password_reset_tokens
    ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN verified_at TIMESTAMPTZ,
    ADD CONSTRAINT password_reset_tokens_attempts_check CHECK (attempts >= 0);

COMMENT ON COLUMN password_reset_tokens.attempts IS
    'Failed code entries for this request; the code is burned once it hits the configured maximum.';

COMMENT ON COLUMN password_reset_tokens.verified_at IS
    'Set when the code was entered correctly; the new password may then be set.';

-- +migrate Down

ALTER TABLE password_reset_tokens
    DROP CONSTRAINT IF EXISTS password_reset_tokens_attempts_check,
    DROP COLUMN IF EXISTS verified_at,
    DROP COLUMN IF EXISTS attempts;

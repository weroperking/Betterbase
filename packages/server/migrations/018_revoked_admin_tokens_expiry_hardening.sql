UPDATE betterbase_meta.revoked_admin_tokens
SET expires_at = NOW() + INTERVAL '8 hours'
WHERE expires_at IS NULL;

ALTER TABLE betterbase_meta.revoked_admin_tokens
ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_revoked_admin_tokens_expires_at
  ON betterbase_meta.revoked_admin_tokens (expires_at);

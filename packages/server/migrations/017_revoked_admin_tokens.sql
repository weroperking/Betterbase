CREATE TABLE IF NOT EXISTS betterbase_meta.revoked_admin_tokens (
  jti TEXT PRIMARY KEY,
  admin_user_id TEXT REFERENCES betterbase_meta.admin_users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_revoked_admin_tokens_expires_at
  ON betterbase_meta.revoked_admin_tokens (expires_at);

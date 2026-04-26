CREATE TABLE IF NOT EXISTS betterbase_meta.rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expires_at
  ON betterbase_meta.rate_limits (expires_at);

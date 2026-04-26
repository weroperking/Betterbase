UPDATE betterbase_meta.revoked_admin_tokens
SET expires_at = NOW() + INTERVAL '8 hours'
WHERE expires_at IS NULL;

ALTER TABLE betterbase_meta.revoked_admin_tokens
ALTER COLUMN expires_at SET NOT NULL;

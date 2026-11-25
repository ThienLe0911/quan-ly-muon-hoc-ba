ALTER TABLE users ADD COLUMN search_text TEXT NOT NULL DEFAULT '';

ALTER TABLE loan_records ADD COLUMN class_name_norm TEXT NOT NULL DEFAULT '';

ALTER TABLE loan_records ADD COLUMN search_text TEXT NOT NULL DEFAULT '';

ALTER TABLE audit_logs ADD COLUMN search_text TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS login_rate_limits (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  reset_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_rate_limits_reset_at
  ON login_rate_limits(reset_at);

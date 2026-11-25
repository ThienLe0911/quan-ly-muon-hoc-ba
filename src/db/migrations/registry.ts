export interface MigrationDefinition {
  name: string;
  statements: string[];
}

export const MIGRATIONS: MigrationDefinition[] = [
  {
    name: '0000_initial.sql',
    statements: [
      `CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ADMIN', 'TEACHER')),
  phone TEXT,
  unit TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK(must_change_password IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,
      `CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
      `CREATE TABLE IF NOT EXISTS loan_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  teacher_name_snapshot TEXT NOT NULL,
  teacher_phone_snapshot TEXT,
  teacher_unit_snapshot TEXT,
  class_name TEXT NOT NULL,
  student_name TEXT NOT NULL,
  school_year TEXT NOT NULL,
  record_identity_key TEXT NOT NULL,
  borrowed_at TEXT NOT NULL,
  due_date TEXT NOT NULL,
  returned_at TEXT,
  returned_by_admin_id INTEGER REFERENCES users(id),
  return_note TEXT,
  status TEXT NOT NULL CHECK(status IN ('BORROWED', 'RETURNED', 'CANCELLED')),
  borrow_note TEXT,
  cancel_reason TEXT,
  cancelled_by_admin_id INTEGER REFERENCES users(id),
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_active_identity
  ON loan_records(record_identity_key)
  WHERE status = 'BORROWED'`,
      `CREATE INDEX IF NOT EXISTS idx_loan_status_due_date
  ON loan_records(status, due_date)`,
      `CREATE INDEX IF NOT EXISTS idx_loan_borrowed_at
  ON loan_records(borrowed_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_loan_teacher_status
  ON loan_records(teacher_id, status)`,
      `CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_admin_id INTEGER REFERENCES users(id)
)`,
      `CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs(created_at DESC)`,
    ],
  },
  {
    name: '0001_turso_search_and_ratelimit.sql',
    statements: [
      `ALTER TABLE users ADD COLUMN search_text TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE loan_records ADD COLUMN class_name_norm TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE loan_records ADD COLUMN search_text TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE audit_logs ADD COLUMN search_text TEXT NOT NULL DEFAULT ''`,
      `CREATE TABLE IF NOT EXISTS login_rate_limits (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  reset_at INTEGER NOT NULL
)`,
      `CREATE INDEX IF NOT EXISTS idx_login_rate_limits_reset_at
  ON login_rate_limits(reset_at)`,
    ],
  },
];

import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  role: text('role', { enum: ['ADMIN', 'TEACHER'] }).notNull(),
  phone: text('phone'),
  unit: text('unit'),
  isActive: integer('is_active').notNull().default(1),
  mustChangePassword: integer('must_change_password').notNull().default(0),
  searchText: text('search_text').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_sessions_user_id').on(table.userId)]
);

export const loanRecords = sqliteTable(
  'loan_records',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    teacherId: integer('teacher_id')
      .notNull()
      .references(() => users.id),
    teacherNameSnapshot: text('teacher_name_snapshot').notNull(),
    teacherPhoneSnapshot: text('teacher_phone_snapshot'),
    teacherUnitSnapshot: text('teacher_unit_snapshot'),
    loanType: text('loan_type', { enum: ['INDIVIDUAL', 'WHOLE_CLASS'] })
      .notNull()
      .default('INDIVIDUAL'),
    className: text('class_name').notNull(),
    studentName: text('student_name').notNull(),
    schoolYear: text('school_year').notNull(),
    quantity: integer('quantity'),
    recordIdentityKey: text('record_identity_key').notNull(),
    classYearKey: text('class_year_key').notNull().default(''),
    classNameNorm: text('class_name_norm').notNull().default(''),
    searchText: text('search_text').notNull().default(''),
    borrowedAt: text('borrowed_at').notNull(),
    dueDate: text('due_date').notNull(),
    returnedAt: text('returned_at'),
    returnedByAdminId: integer('returned_by_admin_id').references(() => users.id),
    returnNote: text('return_note'),
    status: text('status', { enum: ['BORROWED', 'RETURNED', 'CANCELLED'] }).notNull(),
    borrowNote: text('borrow_note'),
    cancelReason: text('cancel_reason'),
    cancelledByAdminId: integer('cancelled_by_admin_id').references(() => users.id),
    cancelledAt: text('cancelled_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_loan_status_due_date').on(table.status, table.dueDate),
    index('idx_loan_borrowed_at').on(table.borrowedAt),
    index('idx_loan_teacher_status').on(table.teacherId, table.status),
    index('idx_loan_class_year_status').on(table.classYearKey, table.status),
  ]
);

export const systemSettings = sqliteTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
  updatedByAdminId: integer('updated_by_admin_id').references(() => users.id),
});

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    actorId: integer('actor_id').references(() => users.id),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    metadataJson: text('metadata_json'),
    searchText: text('search_text').notNull().default(''),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_audit_logs_created_at').on(table.createdAt)]
);

export const loginRateLimits = sqliteTable(
  'login_rate_limits',
  {
    key: text('key').primaryKey(),
    failures: integer('failures').notNull().default(0),
    resetAt: integer('reset_at').notNull(),
  },
  (table) => [index('idx_login_rate_limits_reset_at').on(table.resetAt)]
);

export type UserRow = typeof users.$inferSelect;
export type LoanRecordRow = typeof loanRecords.$inferSelect;
export type AuditLogRow = typeof auditLogs.$inferSelect;

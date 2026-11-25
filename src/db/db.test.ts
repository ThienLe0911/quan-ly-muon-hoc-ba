import { afterEach, describe, expect, it } from 'vitest';
import { createDbConnection, type DbConnection } from './index';
import { loanRecords, systemSettings, users } from './schema';
import { seedDatabase } from './seed';
import { eq } from 'drizzle-orm';
import { hashPassword } from '@/lib/auth/password';
import { isSqliteUniqueError } from '@/lib/api/response';
import { getEnv } from '@/lib/env';
import { buildSearchText } from '@/lib/domain/search';

describe('Tầng cơ sở dữ liệu libSQL/Turso & Migration (T02)', () => {
  const conns: DbConnection[] = [];

  afterEach(() => {
    while (conns.length > 0) {
      conns.pop()?.client.close();
    }
  });

  async function setupTestDb() {
    const conn = await createDbConnection(':memory:');
    conns.push(conn);
    return conn;
  }

  it('tạo đủ 6 bảng (gồm login_rate_limits) và index chống mượn trùng', async () => {
    const { client } = await setupTestDb();
    const tablesRes = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const tables = tablesRes.rows.map((r) => String(r.name));

    expect(tables).toContain('users');
    expect(tables).toContain('sessions');
    expect(tables).toContain('loan_records');
    expect(tables).toContain('system_settings');
    expect(tables).toContain('audit_logs');
    expect(tables).toContain('login_rate_limits');

    const indexesRes = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='index'"
    );
    const indexes = indexesRes.rows.map((r) => String(r.name));
    expect(indexes).toContain('idx_loan_active_identity');
  });

  it('seedDatabase tạo cài đặt mặc định và admin đầu tiên theo cơ chế idempotent', async () => {
    const { db } = await setupTestDb();

    const first = await seedDatabase(db);
    expect(first.adminCreated).toBe(true);

    const second = await seedDatabase(db);
    expect(second.adminCreated).toBe(false);

    const admins = await db.select().from(users).where(eq(users.role, 'ADMIN')).all();
    expect(admins).toHaveLength(1);
    expect(admins[0].searchText).toContain('admin');

    const settings = await db.select().from(systemSettings).all();
    const settingMap = new Map(settings.map((s) => [s.key, s.value]));
    expect(settingMap.get('default_loan_days')).toBe('7');
    expect(settingMap.get('max_loan_days')).toBe('30');
  });

  it('Partial Unique Index chặn 2 phiếu BORROWED cùng học bạ nhưng cho phép mượn lại sau RETURNED/CANCELLED', async () => {
    const { db } = await setupTestDb();
    const now = new Date().toISOString();

    const teacher = await db
      .insert(users)
      .values({
        username: 'gv_lan',
        passwordHash: hashPassword('123456'),
        fullName: 'Nguyễn Thị Lan',
        role: 'TEACHER',
        phone: '0901234567',
        unit: '3A',
        isActive: 1,
        mustChangePassword: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    const identityKey = '3a|nguyễn văn an|2025-2026';

    const firstLoan = await db
      .insert(loanRecords)
      .values({
        teacherId: teacher.id,
        teacherNameSnapshot: teacher.fullName,
        teacherPhoneSnapshot: teacher.phone,
        teacherUnitSnapshot: teacher.unit,
        className: '3A',
        studentName: 'Nguyễn Văn An',
        schoolYear: '2025-2026',
        recordIdentityKey: identityKey,
        borrowedAt: now,
        dueDate: '2026-12-01',
        status: 'BORROWED',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    // Chèn trùng khi vẫn đang BORROWED phải ném lỗi UNIQUE constraint
    let duplicateError: unknown = null;
    try {
      await db
        .insert(loanRecords)
        .values({
          teacherId: teacher.id,
          teacherNameSnapshot: teacher.fullName,
          teacherPhoneSnapshot: teacher.phone,
          teacherUnitSnapshot: teacher.unit,
          className: '3A',
          studentName: 'Nguyễn Văn An',
          schoolYear: '2025-2026',
          recordIdentityKey: identityKey,
          borrowedAt: now,
          dueDate: '2026-12-02',
          status: 'BORROWED',
          createdAt: now,
          updatedAt: now,
        })
        .run();
    } catch (err) {
      duplicateError = err;
    }
    expect(duplicateError).not.toBeNull();
    expect(isSqliteUniqueError(duplicateError)).toBe(true);

    // Đánh dấu RETURNED thì được phép mượn lại
    await db
      .update(loanRecords)
      .set({ status: 'RETURNED', returnedAt: now, updatedAt: now })
      .where(eq(loanRecords.id, firstLoan.id))
      .run();

    const secondLoan = await db
      .insert(loanRecords)
      .values({
        teacherId: teacher.id,
        teacherNameSnapshot: teacher.fullName,
        teacherPhoneSnapshot: teacher.phone,
        teacherUnitSnapshot: teacher.unit,
        className: '3A',
        studentName: 'Nguyễn Văn An',
        schoolYear: '2025-2026',
        recordIdentityKey: identityKey,
        borrowedAt: now,
        dueDate: '2026-12-05',
        status: 'BORROWED',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    expect(secondLoan.id).toBeGreaterThan(firstLoan.id);

    // Đánh dấu CANCELLED cũng giải phóng khóa để mượn lại
    await db
      .update(loanRecords)
      .set({ status: 'CANCELLED', cancelReason: 'Nhập nhầm', cancelledAt: now, updatedAt: now })
      .where(eq(loanRecords.id, secondLoan.id))
      .run();

    const thirdLoan = await db
      .insert(loanRecords)
      .values({
        teacherId: teacher.id,
        teacherNameSnapshot: teacher.fullName,
        teacherPhoneSnapshot: teacher.phone,
        teacherUnitSnapshot: teacher.unit,
        className: '3A',
        studentName: 'Nguyễn Văn An',
        schoolYear: '2025-2026',
        recordIdentityKey: identityKey,
        borrowedAt: now,
        dueDate: '2026-12-08',
        status: 'BORROWED',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    expect(thirdLoan.status).toBe('BORROWED');
  });

  it('tự động bật AUTH_COOKIE_SECURE và TRUST_PROXY khi chạy trên Vercel (VERCEL=1) và hỗ trợ tìm kiếm không dấu', () => {
    const prevVercel = process.env.VERCEL;
    const prevSecure = process.env.AUTH_COOKIE_SECURE;
    const prevTrust = process.env.TRUST_PROXY;
    try {
      process.env.VERCEL = '1';
      delete process.env.AUTH_COOKIE_SECURE;
      delete process.env.TRUST_PROXY;
      const env = getEnv();
      expect(env.isVercel).toBe(true);
      expect(env.authCookieSecure).toBe(true);
      expect(env.trustProxy).toBe(true);
    } finally {
      if (prevVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prevVercel;
      if (prevSecure === undefined) delete process.env.AUTH_COOKIE_SECURE;
      else process.env.AUTH_COOKIE_SECURE = prevSecure;
      if (prevTrust === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = prevTrust;
    }

    const search = buildSearchText(['Đặng Thu An', 'gv_an']);
    expect(search).toContain('đặng thu an');
    expect(search).toContain('dang thu an');
    expect(search).toContain('gv_an');
  });

  it('từ chối seed mật khẩu mặc định công khai trên Vercel (VERCEL=1) khi thiếu SEED_ADMIN_PASSWORD và mặc định mustChangePassword=1', async () => {
    const prevVercel = process.env.VERCEL;
    const prevPwd = process.env.SEED_ADMIN_PASSWORD;
    const prevMust = process.env.SEED_ADMIN_MUST_CHANGE_PASSWORD;
    try {
      process.env.VERCEL = '1';
      delete process.env.SEED_ADMIN_PASSWORD;
      delete process.env.SEED_ADMIN_MUST_CHANGE_PASSWORD;

      const { db } = await setupTestDb();
      await expect(seedDatabase(db)).rejects.toThrow(/SEED_ADMIN_PASSWORD/);

      process.env.SEED_ADMIN_PASSWORD = 'TruongTieuHoc#2026';
      const seeded = await seedDatabase(db);
      expect(seeded.adminCreated).toBe(true);
      const admin = (await db.select().from(users).where(eq(users.role, 'ADMIN')).get())!;
      expect(admin.mustChangePassword).toBe(1);
    } finally {
      if (prevVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prevVercel;
      if (prevPwd === undefined) delete process.env.SEED_ADMIN_PASSWORD;
      else process.env.SEED_ADMIN_PASSWORD = prevPwd;
      if (prevMust === undefined) delete process.env.SEED_ADMIN_MUST_CHANGE_PASSWORD;
      else process.env.SEED_ADMIN_MUST_CHANGE_PASSWORD = prevMust;
    }
  });
});

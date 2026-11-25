import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDbConnection, resetDbForTests, setDbForTests } from '@/db';
import { users } from '@/db/schema';
import { hashPassword, verifyPassword } from './password';
import {
  createSession,
  getSessionUser,
  revokeAllUserSessions,
  revokeSessionByToken,
  SESSION_COOKIE_NAME,
} from './session';
import {
  isLoginRateLimited,
  recordLoginFailure,
  resetRateLimiterForTests,
} from './rate-limit';
import { requireAdmin, requireAuth, requireTeacher } from './guards';

describe('Tầng xác thực, session & RBAC (T04)', () => {
  let teacherId = 0;
  let adminId = 0;

  beforeEach(async () => {
    const conn = await createDbConnection(':memory:');
    setDbForTests(conn);
    await resetRateLimiterForTests();
    const now = new Date().toISOString();

    adminId = (
      await conn.db
        .insert(users)
        .values({
          username: 'admin_test',
          passwordHash: hashPassword('Secret123'),
          fullName: 'Văn thư Test',
          role: 'ADMIN',
          isActive: 1,
          mustChangePassword: 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()
    ).id;

    teacherId = (
      await conn.db
        .insert(users)
        .values({
          username: 'gv_test',
          passwordHash: hashPassword('GvPass123'),
          fullName: 'Cô Hoa',
          role: 'TEACHER',
          phone: '0911222333',
          unit: '2B',
          isActive: 1,
          mustChangePassword: 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()
    ).id;
  });

  afterEach(() => {
    resetDbForTests();
  });

  it('băm mật khẩu scrypt ngẫu nhiên muối và đối chiếu chính xác', () => {
    const h1 = hashPassword('MatKhau@2026');
    const h2 = hashPassword('MatKhau@2026');
    expect(h1).not.toBe(h2);
    expect(verifyPassword('MatKhau@2026', h1)).toBe(true);
    expect(verifyPassword('SaiMatKhau', h1)).toBe(false);
  });

  it('tạo phiên, đọc từ cookie header, thu hồi tức thì và chặn user bị khóa', async () => {
    const { rawToken } = await createSession(teacherId);
    const req = new Request('http://localhost/api/test', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${rawToken}` },
    });

    const user = await getSessionUser(req);
    expect(user?.username).toBe('gv_test');
    expect(user?.role).toBe('TEACHER');

    // Kiểm tra guards
    expect((await requireAuth(req)).user?.id).toBe(teacherId);
    expect((await requireTeacher(req)).user?.id).toBe(teacherId);
    expect((await requireAdmin(req)).errorResponse?.status).toBe(403);

    // Khóa tài khoản qua DB -> mất quyền ngay dù session còn hạn
    const { getDb } = await import('@/db');
    const { eq } = await import('drizzle-orm');
    const db = await getDb();
    await db.update(users).set({ isActive: 0 }).where(eq(users.id, teacherId)).run();
    expect(await getSessionUser(req)).toBeNull();
    expect((await requireAuth(req)).errorResponse?.status).toBe(401);

    // Mở lại tài khoản rồi test thu hồi phiên
    await db.update(users).set({ isActive: 1 }).where(eq(users.id, teacherId)).run();
    expect((await getSessionUser(req))?.id).toBe(teacherId);

    await revokeSessionByToken(rawToken);
    expect(await getSessionUser(req)).toBeNull();

    const s2 = await createSession(adminId);
    const adminReq = new Request('http://localhost/api/test', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${s2.rawToken}` },
    });
    expect((await requireAdmin(adminReq)).user?.id).toBe(adminId);
    expect((await requireTeacher(adminReq)).errorResponse?.status).toBe(403);

    await revokeAllUserSessions(adminId);
    expect(await getSessionUser(adminReq)).toBeNull();
  });

  it('kích hoạt rate limit sau 5 lần sai liên tiếp (lưu bền vững trong DB)', async () => {
    const key = '127.0.0.1:admin';
    for (let i = 0; i < 4; i++) {
      await recordLoginFailure(key, 1000);
      expect(await isLoginRateLimited(key, 1000)).toBe(false);
    }
    await recordLoginFailure(key, 1000);
    expect(await isLoginRateLimited(key, 1000)).toBe(true);
    // Hết cửa sổ 15 phút thì tự mở lại
    expect(await isLoginRateLimited(key, 1000 + 16 * 60 * 1000)).toBe(false);
  });
});

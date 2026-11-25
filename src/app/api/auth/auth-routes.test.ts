import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDbConnection, resetDbForTests, setDbForTests } from '@/db';
import { users } from '@/db/schema';
import { hashPassword } from '@/lib/auth/password';
import { resetRateLimiterForTests } from '@/lib/auth/rate-limit';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { POST as loginPOST } from './login/route';
import { POST as logoutPOST } from './logout/route';
import { GET as meGET } from './me/route';
import { POST as changePasswordPOST } from './change-password/route';

function extractSessionCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) return '';
  const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(setCookieHeader);
  return match ? `${SESSION_COOKIE_NAME}=${match[1]}` : '';
}

describe('API Xác thực (/api/auth/*) (T06)', () => {
  beforeEach(async () => {
    const conn = await createDbConnection(':memory:');
    setDbForTests(conn);
    await resetRateLimiterForTests();
    const now = new Date().toISOString();

    await conn.db
      .insert(users)
      .values([
        {
          username: 'gv_mai',
          passwordHash: hashPassword('Mai12345'),
          fullName: 'Trần Thị Mai',
          role: 'TEACHER',
          phone: '0909111222',
          unit: '1A',
          isActive: 1,
          mustChangePassword: 1,
          createdAt: now,
          updatedAt: now,
        },
        {
          username: 'gv_khoa',
          passwordHash: hashPassword('Khoa12345'),
          fullName: 'Lê Văn Khóa',
          role: 'TEACHER',
          isActive: 0,
          mustChangePassword: 0,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
  });

  afterEach(() => {
    resetDbForTests();
  });

  it('đăng nhập, kiểm tra /me, đổi mật khẩu và đăng xuất thành công', async () => {
    const loginRes = await loginPOST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'GV_Mai', password: 'Mai12345' }),
      })
    );
    expect(loginRes.status).toBe(200);
    const loginJson = await loginRes.json();
    expect(loginJson.data.user.username).toBe('gv_mai');
    expect(loginJson.data.user.mustChangePassword).toBe(true);

    const cookieHeader = extractSessionCookie(loginRes.headers.get('set-cookie'));
    expect(cookieHeader).toContain(`${SESSION_COOKIE_NAME}=`);

    // Gọi /me với cookie vừa cấp
    const meRes = await meGET(
      new Request('http://localhost/api/auth/me', {
        headers: { cookie: cookieHeader },
      })
    );
    expect(meRes.status).toBe(200);
    const meJson = await meRes.json();
    expect(meJson.data.user.fullName).toBe('Trần Thị Mai');

    // Đổi mật khẩu
    const cpRes = await changePasswordPOST(
      new Request('http://localhost/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: cookieHeader },
        body: JSON.stringify({
          currentPassword: 'Mai12345',
          newPassword: 'MaiNewPassword9',
        }),
      })
    );
    expect(cpRes.status).toBe(200);

    // Kiểm tra /me sau đổi mật khẩu: mustChangePassword thành false
    const meAfterCp = await meGET(
      new Request('http://localhost/api/auth/me', {
        headers: { cookie: cookieHeader },
      })
    );
    expect((await meAfterCp.json()).data.user.mustChangePassword).toBe(false);

    // Đăng xuất -> /me phải trả 401
    const logoutRes = await logoutPOST(
      new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { cookie: cookieHeader },
      })
    );
    expect(logoutRes.status).toBe(200);

    const meAfterLogout = await meGET(
      new Request('http://localhost/api/auth/me', {
        headers: { cookie: cookieHeader },
      })
    );
    expect(meAfterLogout.status).toBe(401);
  });

  it('tài khoản bị khóa bị từ chối đăng nhập với mã 403', async () => {
    const res = await loginPOST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'gv_khoa', password: 'Khoa12345' }),
      })
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe('ACCOUNT_LOCKED');
  });
});

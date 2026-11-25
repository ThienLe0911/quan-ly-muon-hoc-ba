import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { createDbConnection, resetDbForTests, setDbForTests } from '@/db';
import { seedDatabase } from '@/db/seed';
import { users } from '@/db/schema';
import { hashPassword } from '@/lib/auth/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { GET as listUsersGET, POST as createUserPOST } from './route';
import { PATCH as updateUserPATCH } from './[id]/route';
import { POST as resetPasswordPOST } from './[id]/reset-password/route';
import { GET as getSettingsGET, PATCH as patchSettingsPATCH } from '../settings/route';
import { GET as meGET } from '../auth/me/route';

describe('API Quản lý giáo viên & Cài đặt (/api/users*, /api/settings) (T07)', () => {
  let adminCookie = '';
  let teacherCookie = '';
  let adminId = 0;
  let teacherId = 0;

  beforeEach(async () => {
    const conn = await createDbConnection(':memory:');
    setDbForTests(conn);
    await seedDatabase(conn.db);
    const now = new Date().toISOString();

    const admin = (await conn.db.select().from(users).limit(1).get())!;
    adminId = admin.id;
    adminCookie = `${SESSION_COOKIE_NAME}=${(await createSession(adminId)).rawToken}`;

    const teacher = await conn.db
      .insert(users)
      .values({
        username: 'gv_binh',
        passwordHash: hashPassword('Binh1234'),
        fullName: 'Phạm Văn Bình',
        role: 'TEACHER',
        phone: '0988777666',
        unit: '4C',
        isActive: 1,
        mustChangePassword: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    teacherId = teacher.id;
    teacherCookie = `${SESSION_COOKIE_NAME}=${(await createSession(teacherId)).rawToken}`;
  });

  afterEach(() => {
    resetDbForTests();
  });

  it('Admin tạo, sửa, khóa tài khoản (thu hồi phiên) và reset mật khẩu giáo viên', async () => {
    // Giáo viên gọi /api/users phải bị 403
    const forbidden = await listUsersGET(
      new Request('http://localhost/api/users', {
        headers: { cookie: teacherCookie },
      })
    );
    expect(forbidden.status).toBe(403);

    // Admin tạo tài khoản mới
    const createRes = await createUserPOST(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: JSON.stringify({
          username: 'gv_hanh',
          fullName: 'Đỗ Thị Hạnh',
          role: 'TEACHER',
          phone: '0912345678',
          unit: '1B',
          password: 'TempPass123',
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const createdJson = await createRes.json();
    expect(createdJson.data.username).toBe('gv_hanh');

    // Không cho khóa Admin duy nhất cuối cùng
    const lockLastAdmin = await updateUserPATCH(
      new NextRequest(`http://localhost/api/users/${adminId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: JSON.stringify({ isActive: false }),
      }),
      { params: Promise.resolve({ id: String(adminId) }) }
    );
    expect(lockLastAdmin.status).toBe(400);

    // Admin khóa gv_binh -> phiên của gv_binh mất hiệu lực ngay
    const lockTeacher = await updateUserPATCH(
      new NextRequest(`http://localhost/api/users/${teacherId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: JSON.stringify({ isActive: false }),
      }),
      { params: Promise.resolve({ id: String(teacherId) }) }
    );
    expect(lockTeacher.status).toBe(200);

    const teacherMeAfterLock = await meGET(
      new Request('http://localhost/api/auth/me', {
        headers: { cookie: teacherCookie },
      })
    );
    expect(teacherMeAfterLock.status).toBe(401);

    // Admin reset mật khẩu cho gv_hanh
    const resetRes = await resetPasswordPOST(
      new NextRequest(`http://localhost/api/users/${createdJson.data.id}/reset-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: JSON.stringify({ newPassword: 'NewTemp999', mustChangePassword: true }),
      }),
      { params: Promise.resolve({ id: String(createdJson.data.id) }) }
    );
    expect(resetRes.status).toBe(200);
  });

  it('Admin cập nhật hạn mượn mặc định/tối đa, Giáo viên chỉ được đọc', async () => {
    const readAsTeacher = await getSettingsGET(
      new Request('http://localhost/api/settings', {
        headers: { cookie: teacherCookie },
      })
    );
    expect(readAsTeacher.status).toBe(200);
    expect((await readAsTeacher.json()).data).toEqual({
      defaultLoanDays: 7,
      maxLoanDays: 30,
    });

    const patchAsTeacher = await patchSettingsPATCH(
      new Request('http://localhost/api/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: teacherCookie },
        body: JSON.stringify({ defaultLoanDays: 10, maxLoanDays: 30 }),
      })
    );
    expect(patchAsTeacher.status).toBe(403);

    const patchAsAdmin = await patchSettingsPATCH(
      new Request('http://localhost/api/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: JSON.stringify({ defaultLoanDays: 10, maxLoanDays: 45 }),
      })
    );
    expect(patchAsAdmin.status).toBe(200);
    expect((await patchAsAdmin.json()).data).toEqual({
      defaultLoanDays: 10,
      maxLoanDays: 45,
    });
  });
});

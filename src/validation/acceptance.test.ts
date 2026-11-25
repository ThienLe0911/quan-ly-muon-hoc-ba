import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { createDbConnection, getDb, resetDbForTests, setDbForTests } from '@/db';
import { loanRecords, users } from '@/db/schema';
import { seedDatabase } from '@/db/seed';
import { hashPassword } from '@/lib/auth/password';
import { resetRateLimiterForTests } from '@/lib/auth/rate-limit';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { addCalendarDays, getTodayVNDateString } from '@/lib/domain/overdue';
import { buildUserSearchText } from '@/lib/domain/search';
import { formatDateVN } from '@/lib/format-vn';
import { isSqliteUniqueError } from '@/lib/api/response';

import { POST as loginPOST } from '@/app/api/auth/login/route';
import { POST as logoutPOST } from '@/app/api/auth/logout/route';
import { GET as meGET } from '@/app/api/auth/me/route';
import { POST as changePasswordPOST } from '@/app/api/auth/change-password/route';
import { GET as listUsersGET, POST as createUserPOST } from '@/app/api/users/route';
import { PATCH as updateUserPATCH } from '@/app/api/users/[id]/route';
import { POST as resetPasswordPOST } from '@/app/api/users/[id]/reset-password/route';
import { GET as listLoansGET, POST as createLoanPOST } from '@/app/api/loans/route';
import { POST as returnLoanPOST } from '@/app/api/loans/[id]/return/route';
import { POST as cancelLoanPOST } from '@/app/api/loans/[id]/cancel/route';
import { GET as adminDashboardGET } from '@/app/api/dashboard/admin/route';
import { GET as getSettingsGET, PATCH as patchSettingsPATCH } from '@/app/api/settings/route';
import { GET as auditLogsGET } from '@/app/api/audit-logs/route';

function extractCookiePair(setCookieHeader: string | null): string {
  if (!setCookieHeader) return '';
  const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(setCookieHeader);
  return match ? `${SESSION_COOKIE_NAME}=${match[1]}` : '';
}

function makeJsonReq(
  url: string,
  method: string,
  body: unknown,
  cookie?: string,
  extraHeaders?: Record<string, string>
): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(extraHeaders ?? {}),
  };
  if (cookie) headers.cookie = cookie;
  return new Request(url, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

function makeNextJsonReq(url: string, method: string, body: unknown, cookie?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return new NextRequest(url, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

interface LoanItemResponse {
  id: number;
  teacherId: number;
  teacherNameSnapshot: string;
  teacherPhoneSnapshot: string | null;
  teacherUnitSnapshot: string | null;
  className: string;
  studentName: string;
  schoolYear: string;
  borrowedAt: string;
  dueDate: string;
  returnedAt: string | null;
  returnedByAdminId: number | null;
  returnedByAdminName: string | null;
  returnNote: string | null;
  status: 'BORROWED' | 'RETURNED' | 'CANCELLED';
  cancelReason: string | null;
  cancelledByAdminId: number | null;
  cancelledAt: string | null;
  overdueDays: number;
  timingLevel: string;
  isInRedList: boolean;
}

describe('Bộ kiểm chứng chấp nhận độc lập (AC-01..AC-14 & BR-01..BR-11)', () => {
  let adminId = 0;
  let adminCookie = '';
  let teacherAId = 0;
  let teacherACookie = '';
  let teacherBId = 0;
  let teacherBCookie = '';

  beforeEach(async () => {
    const conn = await createDbConnection(':memory:');
    setDbForTests(conn);
    await resetRateLimiterForTests();
    await seedDatabase(conn.db);

    const now = new Date().toISOString();
    const admin = (await conn.db.select().from(users).where(eq(users.role, 'ADMIN')).limit(1).get())!;
    adminId = admin.id;
    adminCookie = `${SESSION_COOKIE_NAME}=${(await createSession(adminId)).rawToken}`;

    const tA = await conn.db
      .insert(users)
      .values({
        username: 'gv_lan',
        passwordHash: hashPassword('LanPass123'),
        fullName: 'Nguyễn Thị Lan',
        role: 'TEACHER',
        phone: '0901112222',
        unit: '3A',
        isActive: 1,
        mustChangePassword: 0,
        searchText: buildUserSearchText({
          username: 'gv_lan',
          fullName: 'Nguyễn Thị Lan',
          phone: '0901112222',
          unit: '3A',
        }),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    teacherAId = tA.id;
    teacherACookie = `${SESSION_COOKIE_NAME}=${(await createSession(teacherAId)).rawToken}`;

    const tB = await conn.db
      .insert(users)
      .values({
        username: 'gv_an',
        passwordHash: hashPassword('AnPass123'),
        fullName: 'Đặng Hoàng Ân',
        role: 'TEACHER',
        phone: '0909888777',
        unit: 'Tổ 4-5',
        isActive: 1,
        mustChangePassword: 0,
        searchText: buildUserSearchText({
          username: 'gv_an',
          fullName: 'Đặng Hoàng Ân',
          phone: '0909888777',
          unit: 'Tổ 4-5',
        }),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    teacherBId = tB.id;
    teacherBCookie = `${SESSION_COOKIE_NAME}=${(await createSession(teacherBId)).rawToken}`;
  });

  afterEach(async () => {
    await resetRateLimiterForTests();
    resetDbForTests();
  });

  // =========================================================================
  // AC-01, AC-02, BR-10 — Tài khoản, Cookie, Brute-force, Phiên & Bảo vệ Admin
  // =========================================================================
  describe('AC-01, AC-02 & BR-10: Xác thực, Cookie, Rate Limit, Phiên & Quản lý tài khoản', () => {
    it('AC-01: cấp cookie có cờ HttpOnly, SameSite=Lax, Path=/ và không rò rỉ passwordHash', async () => {
      const loginRes = await loginPOST(
        makeJsonReq('http://localhost/api/auth/login', 'POST', {
          username: '  GV_LAN ',
          password: 'LanPass123',
        })
      );
      expect(loginRes.status).toBe(200);

      const setCookie = loginRes.headers.get('set-cookie') || '';
      expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
      expect(setCookie.toLowerCase()).toContain('httponly');
      expect(setCookie.toLowerCase()).toContain('samesite=lax');
      expect(setCookie.toLowerCase()).toContain('path=/');

      const loginBody = await loginRes.json();
      expect(loginBody.data.user.username).toBe('gv_lan');
      expect('passwordHash' in loginBody.data.user).toBe(false);

      const cookiePair = extractCookiePair(setCookie);
      const meRes = await meGET(
        new Request('http://localhost/api/auth/me', { headers: { cookie: cookiePair } })
      );
      expect(meRes.status).toBe(200);
      const meBody = await meRes.json();
      expect('passwordHash' in meBody.data.user).toBe(false);
    });

    it('AC-01 / NFR 8.2: kích hoạt brute-force rate limit trả 429 sau 5 lần đăng nhập sai cùng IP + username', async () => {
      const attackerHeaders = { 'x-forwarded-for': '192.168.1.50' };

      for (let i = 0; i < 5; i++) {
        const res = await loginPOST(
          makeJsonReq(
            'http://localhost/api/auth/login',
            'POST',
            { username: 'gv_lan', password: `WrongPass${i}` },
            undefined,
            attackerHeaders
          )
        );
        expect(res.status).toBe(401);
      }

      // Lần thứ 6 kể cả nhập đúng mật khẩu vẫn bị chặn 429 trên IP đó
      const blockedRes = await loginPOST(
        makeJsonReq(
          'http://localhost/api/auth/login',
          'POST',
          { username: 'gv_lan', password: 'LanPass123' },
          undefined,
          attackerHeaders
        )
      );
      expect(blockedRes.status).toBe(429);
      const blockedBody = await blockedRes.json();
      expect(blockedBody.error.code).toBe('TOO_MANY_ATTEMPTS');

      // Khi chạy sau reverse proxy tin cậy (TRUST_PROXY=true), IP hợp lệ khác không bị chặn oan;
      // còn mặc định TRUST_PROXY=false sẽ chặn luôn mọi header X-Forwarded-For giả mạo
      const prevTrust = process.env.TRUST_PROXY;
      try {
        process.env.TRUST_PROXY = 'true';
        const otherIpRes = await loginPOST(
          makeJsonReq(
            'http://localhost/api/auth/login',
            'POST',
            { username: 'gv_lan', password: 'LanPass123' },
            undefined,
            { 'x-forwarded-for': '192.168.1.99' }
          )
        );
        expect(otherIpRes.status).toBe(200);
      } finally {
        if (prevTrust === undefined) delete process.env.TRUST_PROXY;
        else process.env.TRUST_PROXY = prevTrust;
      }
    });

    it('AC-01: chặn trùng username không phân biệt hoa/thường (409) và khóa/mở khóa tài khoản đúng quy tắc', async () => {
      const dupRes = await createUserPOST(
        makeJsonReq(
          'http://localhost/api/users',
          'POST',
          {
            username: 'GV_LAN',
            fullName: 'Giáo viên trùng tên đăng nhập',
            role: 'TEACHER',
            password: 'TempPass123',
          },
          adminCookie
        )
      );
      expect(dupRes.status).toBe(409);
      expect((await dupRes.json()).error.code).toBe('DUPLICATE_USERNAME');

      // Khóa gv_lan -> phiên cũ bị 401 ngay và không thể đăng nhập lại (403)
      const lockRes = await updateUserPATCH(
        makeNextJsonReq(`http://localhost/api/users/${teacherAId}`, 'PATCH', { isActive: false }, adminCookie),
        { params: Promise.resolve({ id: String(teacherAId) }) }
      );
      expect(lockRes.status).toBe(200);

      const meLocked = await meGET(
        new Request('http://localhost/api/auth/me', { headers: { cookie: teacherACookie } })
      );
      expect(meLocked.status).toBe(401);

      const loginLocked = await loginPOST(
        makeJsonReq('http://localhost/api/auth/login', 'POST', {
          username: 'gv_lan',
          password: 'LanPass123',
        })
      );
      expect(loginLocked.status).toBe(403);
      expect((await loginLocked.json()).error.code).toBe('ACCOUNT_LOCKED');

      // Mở khóa lại -> đăng nhập được
      const unlockRes = await updateUserPATCH(
        makeNextJsonReq(`http://localhost/api/users/${teacherAId}`, 'PATCH', { isActive: true }, adminCookie),
        { params: Promise.resolve({ id: String(teacherAId) }) }
      );
      expect(unlockRes.status).toBe(200);

      const loginAgain = await loginPOST(
        makeJsonReq('http://localhost/api/auth/login', 'POST', {
          username: 'gv_lan',
          password: 'LanPass123',
        })
      );
      expect(loginAgain.status).toBe(200);
    });

    it('AC-02: đổi mật khẩu xóa các phiên thiết bị khác nhưng giữ nguyên phiên hiện tại', async () => {
      const login1 = await loginPOST(
        makeJsonReq('http://localhost/api/auth/login', 'POST', {
          username: 'gv_lan',
          password: 'LanPass123',
        })
      );
      const login2 = await loginPOST(
        makeJsonReq('http://localhost/api/auth/login', 'POST', {
          username: 'gv_lan',
          password: 'LanPass123',
        })
      );
      const cookieDevice1 = extractCookiePair(login1.headers.get('set-cookie'));
      const cookieDevice2 = extractCookiePair(login2.headers.get('set-cookie'));

      // Sai mật khẩu hiện tại -> 400
      const wrongCurrent = await changePasswordPOST(
        makeJsonReq(
          'http://localhost/api/auth/change-password',
          'POST',
          { currentPassword: 'WrongPassword', newPassword: 'NewStrong123' },
          cookieDevice1
        )
      );
      expect(wrongCurrent.status).toBe(400);

      // Trùng mật khẩu cũ -> 400
      const samePass = await changePasswordPOST(
        makeJsonReq(
          'http://localhost/api/auth/change-password',
          'POST',
          { currentPassword: 'LanPass123', newPassword: 'LanPass123' },
          cookieDevice1
        )
      );
      expect(samePass.status).toBe(400);

      // Đổi mật khẩu thành công trên thiết bị 1
      const okChange = await changePasswordPOST(
        makeJsonReq(
          'http://localhost/api/auth/change-password',
          'POST',
          { currentPassword: 'LanPass123', newPassword: 'LanNewPass99' },
          cookieDevice1
        )
      );
      expect(okChange.status).toBe(200);

      // Thiết bị 1 (hiện tại) vẫn sống
      const me1 = await meGET(
        new Request('http://localhost/api/auth/me', { headers: { cookie: cookieDevice1 } })
      );
      expect(me1.status).toBe(200);

      // Thiết bị 2 và phiên trước đó bị thu hồi ngay
      const me2 = await meGET(
        new Request('http://localhost/api/auth/me', { headers: { cookie: cookieDevice2 } })
      );
      expect(me2.status).toBe(401);

      const meOld = await meGET(
        new Request('http://localhost/api/auth/me', { headers: { cookie: teacherACookie } })
      );
      expect(meOld.status).toBe(401);

      // Mật khẩu cũ không đăng nhập được, mật khẩu mới đăng nhập thành công
      const oldLogin = await loginPOST(
        makeJsonReq('http://localhost/api/auth/login', 'POST', {
          username: 'gv_lan',
          password: 'LanPass123',
        })
      );
      expect(oldLogin.status).toBe(401);

      const newLogin = await loginPOST(
        makeJsonReq('http://localhost/api/auth/login', 'POST', {
          username: 'gv_lan',
          password: 'LanNewPass99',
        })
      );
      expect(newLogin.status).toBe(200);
    });

    it('AC-02: Admin reset mật khẩu vô hiệu hóa toàn bộ phiên cũ và bật mustChangePassword', async () => {
      const loginExtra = await loginPOST(
        makeJsonReq('http://localhost/api/auth/login', 'POST', {
          username: 'gv_lan',
          password: 'LanPass123',
        })
      );
      const extraCookie = extractCookiePair(loginExtra.headers.get('set-cookie'));

      const resetRes = await resetPasswordPOST(
        makeNextJsonReq(
          `http://localhost/api/users/${teacherAId}/reset-password`,
          'POST',
          { newPassword: 'ResetTemp2026', mustChangePassword: true },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(teacherAId) }) }
      );
      expect(resetRes.status).toBe(200);

      // Cả 2 phiên cũ đều bị vô hiệu hóa
      expect(
        (await meGET(new Request('http://localhost/api/auth/me', { headers: { cookie: teacherACookie } }))).status
      ).toBe(401);
      expect(
        (await meGET(new Request('http://localhost/api/auth/me', { headers: { cookie: extraCookie } }))).status
      ).toBe(401);

      // Mật khẩu cũ thất bại, mật khẩu mới thành công và bật mustChangePassword=true
      const oldPassLogin = await loginPOST(
        makeJsonReq('http://localhost/api/auth/login', 'POST', {
          username: 'gv_lan',
          password: 'LanPass123',
        })
      );
      expect(oldPassLogin.status).toBe(401);

      const tempPassLogin = await loginPOST(
        makeJsonReq('http://localhost/api/auth/login', 'POST', {
          username: 'gv_lan',
          password: 'ResetTemp2026',
        })
      );
      expect(tempPassLogin.status).toBe(200);
      expect((await tempPassLogin.json()).data.user.mustChangePassword).toBe(true);
    });

    it('BR-10: chặn khóa hoặc hạ quyền Admin hoạt động cuối cùng kể cả khi đã có Admin thứ 2 bị khóa trước đó', async () => {
      // Tạo thêm Admin thứ 2
      const createAdmin2 = await createUserPOST(
        makeJsonReq(
          'http://localhost/api/users',
          'POST',
          {
            username: 'admin_2',
            fullName: 'Phó văn thư',
            role: 'ADMIN',
            password: 'Admin2Pass123',
          },
          adminCookie
        )
      );
      expect(createAdmin2.status).toBe(201);
      const admin2Id = (await createAdmin2.json()).data.id as number;
      const admin2Cookie = `${SESSION_COOKIE_NAME}=${(await createSession(admin2Id)).rawToken}`;

      // Admin 1 khóa Admin 2 thành công vì vẫn còn Admin 1 hoạt động
      const lockAdmin2 = await updateUserPATCH(
        makeNextJsonReq(`http://localhost/api/users/${admin2Id}`, 'PATCH', { isActive: false }, adminCookie),
        { params: Promise.resolve({ id: String(admin2Id) }) }
      );
      expect(lockAdmin2.status).toBe(200);

      // Phiên của Admin 2 lập tức mất hiệu lực
      expect(
        (await meGET(new Request('http://localhost/api/auth/me', { headers: { cookie: admin2Cookie } }))).status
      ).toBe(401);

      // Lúc này DB có 2 dòng ADMIN nhưng chỉ còn 1 ADMIN active (admin1).
      // Không được phép tự khóa hoặc tự hạ quyền Admin 1.
      const lockLast = await updateUserPATCH(
        makeNextJsonReq(`http://localhost/api/users/${adminId}`, 'PATCH', { isActive: false }, adminCookie),
        { params: Promise.resolve({ id: String(adminId) }) }
      );
      expect([400, 409]).toContain(lockLast.status);

      const demoteLast = await updateUserPATCH(
        makeNextJsonReq(`http://localhost/api/users/${adminId}`, 'PATCH', { role: 'TEACHER' }, adminCookie),
        { params: Promise.resolve({ id: String(adminId) }) }
      );
      expect([400, 409]).toContain(demoteLast.status);

      const dbAdmin1 = (await (await getDb()).select().from(users).where(eq(users.id, adminId)).get())!;
      expect(dbAdmin1.isActive).toBe(1);
      expect(dbAdmin1.role).toBe('ADMIN');
    });
  });

  // =========================================================================
  // AC-03, AC-04, AC-05, AC-14 & BR-01..BR-04, BR-11
  // =========================================================================
  describe('AC-03, AC-04, AC-05, AC-14: Tạo phiếu, Snapshot bất biến, Hạn trả, Niên khóa, Chống trùng & Chặn mượn hộ', () => {
    it('AC-03 & BR-03: snapshot thông tin giáo viên bất biến sau khi Admin cập nhật họ tên/SĐT/lớp của giáo viên', async () => {
      const todayVN = getTodayVNDateString();
      const dueDate = addCalendarDays(todayVN, 7);

      const createRes = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '3A',
            studentName: 'Nguyễn Văn An',
            schoolYear: '2025-2026',
            dueDate,
            borrowNote: 'Kiểm tra nhận xét học kỳ 1',
          },
          teacherACookie
        )
      );
      expect(createRes.status).toBe(201);
      const loan1 = (await createRes.json()).data as LoanItemResponse;
      expect(loan1.teacherNameSnapshot).toBe('Nguyễn Thị Lan');
      expect(loan1.teacherPhoneSnapshot).toBe('0901112222');
      expect(loan1.teacherUnitSnapshot).toBe('3A');
      expect(loan1.status).toBe('BORROWED');

      // Admin cập nhật thông tin cá nhân giáo viên Lan
      const updateTeacherRes = await updateUserPATCH(
        makeNextJsonReq(
          `http://localhost/api/users/${teacherAId}`,
          'PATCH',
          {
            fullName: 'Nguyễn Thị Lan (Chuyển tổ)',
            phone: '0977666555',
            unit: '5B',
          },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(teacherAId) }) }
      );
      expect(updateTeacherRes.status).toBe(200);

      // Phiếu cũ vẫn phải giữ nguyên snapshot cũ
      const listAfterUpdate = await listLoansGET(
        new Request('http://localhost/api/loans', { headers: { cookie: adminCookie } })
      );
      const loans = (await listAfterUpdate.json()).data as LoanItemResponse[];
      const oldLoan = loans.find((l) => l.id === loan1.id)!;
      expect(oldLoan.teacherNameSnapshot).toBe('Nguyễn Thị Lan');
      expect(oldLoan.teacherPhoneSnapshot).toBe('0901112222');
      expect(oldLoan.teacherUnitSnapshot).toBe('3A');

      // Phiếu tạo mới sau cập nhật phải lấy snapshot mới
      const createRes2 = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '5B',
            studentName: 'Phạm Thị Bích',
            schoolYear: '2025-2026',
            dueDate,
          },
          teacherACookie
        )
      );
      expect(createRes2.status).toBe(201);
      const loan2 = (await createRes2.json()).data as LoanItemResponse;
      expect(loan2.teacherNameSnapshot).toBe('Nguyễn Thị Lan (Chuyển tổ)');
      expect(loan2.teacherPhoneSnapshot).toBe('0977666555');
      expect(loan2.teacherUnitSnapshot).toBe('5B');
    });

    it('AC-05 & BR-04: chặn due_date < todayVN và > todayVN + maxLoanDays; chấp nhận đúng biên todayVN và todayVN + maxLoanDays', async () => {
      const todayVN = getTodayVNDateString();

      // Nhỏ hơn hôm nay -> 400
      const pastDue = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '1A',
            studentName: 'Học Sinh A',
            schoolYear: '2025-2026',
            dueDate: addCalendarDays(todayVN, -1),
          },
          teacherACookie
        )
      );
      expect(pastDue.status).toBe(400);
      expect((await pastDue.json()).error.code).toBe('INVALID_DUE_DATE');

      // Vượt quá 30 ngày (+31 ngày) -> 400
      const overMax = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '1A',
            studentName: 'Học Sinh A',
            schoolYear: '2025-2026',
            dueDate: addCalendarDays(todayVN, 31),
          },
          teacherACookie
        )
      );
      expect(overMax.status).toBe(400);
      expect((await overMax.json()).error.code).toBe('INVALID_DUE_DATE');

      // Ngày không hợp lệ (30/02) -> 400
      const invalidDate = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '1A',
            studentName: 'Học Sinh A',
            schoolYear: '2025-2026',
            dueDate: '2026-02-30',
          },
          teacherACookie
        )
      );
      expect(invalidDate.status).toBe(400);

      // Đúng biên dưới: dueDate === todayVN -> 201
      const sameDayDue = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '1A',
            studentName: 'Học Sinh Trả Trong Ngày',
            schoolYear: '2025-2026',
            dueDate: todayVN,
          },
          teacherACookie
        )
      );
      expect(sameDayDue.status).toBe(201);
      const sameDayLoan = (await sameDayDue.json()).data as LoanItemResponse;
      expect(sameDayLoan.dueDate).toBe(todayVN);
      expect(sameDayLoan.timingLevel).toBe('DUE_TODAY');
      expect(sameDayLoan.isInRedList).toBe(false);

      // Đúng biên trên: dueDate === todayVN + 30 -> 201
      const exactMaxDue = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '1A',
            studentName: 'Học Sinh Hạn Tối Đa',
            schoolYear: '2025-2026',
            dueDate: addCalendarDays(todayVN, 30),
          },
          teacherACookie
        )
      );
      expect(exactMaxDue.status).toBe(201);
      expect((await exactMaxDue.json()).data.dueDate).toBe(addCalendarDays(todayVN, 30));
    });

    it('AC-14 & BR-01 & BR-11: kiểm tra đầy đủ định dạng niên khóa (2021-2026, dấu –/—, sai định dạng) và chặn mượn hộ', async () => {
      const todayVN = getTodayVNDateString();
      const due7 = addCalendarDays(todayVN, 7);

      // Chấp nhận khóa tiểu học 5 năm (2021-2026) và dấu gạch dài (en-dash, em-dash)
      const ok5Year = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '5A',
            studentName: 'Lê Minh Khôi',
            schoolYear: '2021-2026',
            dueDate: due7,
          },
          teacherACookie
        )
      );
      expect(ok5Year.status).toBe(201);
      expect((await ok5Year.json()).data.schoolYear).toBe('2021-2026');

      const okEmDash = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '5A',
            studentName: 'Lê Minh Quân',
            schoolYear: ' 2024 — 2025 ',
            dueDate: due7,
          },
          teacherACookie
        )
      );
      expect(okEmDash.status).toBe(201);
      expect((await okEmDash.json()).data.schoolYear).toBe('2024-2025');

      // Từ chối tất cả các định dạng sai theo spec AC-14 / BR-01
      const invalidSchoolYears = [
        '25-26',
        '2026-2025',
        '2025-2025',
        '2025',
        '2010-2025',
        '2025/2026',
        'abcd-efgh',
      ];
      for (const badYear of invalidSchoolYears) {
        const res = await createLoanPOST(
          makeJsonReq(
            'http://localhost/api/loans',
            'POST',
            {
              className: '3A',
              studentName: 'Nguyễn Văn Test',
              schoolYear: badYear,
              dueDate: due7,
            },
            teacherACookie
          )
        );
        expect(res.status, `schoolYear="${badYear}" phải bị từ chối 400`).toBe(400);
      }

      // ADMIN gọi POST /api/loans -> 403 (BR-11)
      const adminBorrow = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '3A',
            studentName: 'Nguyễn Văn An',
            schoolYear: '2025-2026',
            dueDate: due7,
            teacherId: teacherAId,
          },
          adminCookie
        )
      );
      expect(adminBorrow.status).toBe(403);

      // TEACHER A gửi teacherId của TEACHER B và borrowedAt giả -> server bỏ qua, gắn đúng teacherAId và đồng hồ server
      const spoofRes = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '3B',
            studentName: 'Trần Hoàng Long',
            schoolYear: '2025-2026',
            dueDate: due7,
            teacherId: teacherBId,
            borrowedAt: '2020-01-01T00:00:00.000Z',
          },
          teacherACookie
        )
      );
      expect(spoofRes.status).toBe(201);
      const spoofData = (await spoofRes.json()).data as LoanItemResponse;
      expect(spoofData.teacherId).toBe(teacherAId);
      expect(spoofData.teacherNameSnapshot).toBe('Nguyễn Thị Lan');
      expect(spoofData.borrowedAt.startsWith('2020-01-01')).toBe(false);
    });

    it('AC-04 & BR-02: chặn mượn trùng qua chuẩn hóa Unicode NFC/NFD, khoảng trắng và chữ hoa/thường tiếng Việt', async () => {
      const todayVN = getTodayVNDateString();
      const due7 = addCalendarDays(todayVN, 7);

      // GV A mượn học bạ dạng NFC chuẩn
      const first = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '3A',
            studentName: 'Nguyễn Văn Đức'.normalize('NFC'),
            schoolYear: '2025-2026',
            dueDate: due7,
          },
          teacherACookie
        )
      );
      expect(first.status).toBe(201);

      // GV B gửi lại dạng NFD + thừa khoảng trắng + khác hoa thường + en-dash
      const nfdDuplicate = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '  3a  ',
            studentName: '  nguyễn   văn   đức '.normalize('NFD'),
            schoolYear: ' 2025 – 2026 ',
            dueDate: due7,
          },
          teacherBCookie
        )
      );
      expect(nfdDuplicate.status).toBe(409);
      const nfdErr = await nfdDuplicate.json();
      expect(nfdErr.error.code).toBe('DUPLICATE_ACTIVE_LOAN');
      expect(nfdErr.error.message).toContain('Nguyễn Thị Lan');
      expect(nfdErr.error.message).toContain(formatDateVN(due7));
      expect(nfdErr.error.message).toContain(formatDateVN(todayVN));
      expect(nfdErr.error.details.existingLoan.teacherNameSnapshot).toBe('Nguyễn Thị Lan');
      expect(nfdErr.error.details.existingLoan.borrowedAt).toBeTruthy();
      expect(nfdErr.error.details.existingLoan.dueDate).toBe(due7);
      // Không rò rỉ SĐT hoặc ghi chú riêng tư của giáo viên khác
      expect('teacherPhoneSnapshot' in nfdErr.error.details.existingLoan).toBe(false);
      expect('borrowNote' in nfdErr.error.details.existingLoan).toBe(false);

      // Biến thể chữ in hoa toàn bộ tiếng Việt có dấu (Đ/Ứ)
      const upperDuplicate = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '3A',
            studentName: 'NGUYỄN VĂN ĐỨC',
            schoolYear: '2025 - 2026',
            dueDate: due7,
          },
          teacherBCookie
        )
      );
      expect(upperDuplicate.status).toBe(409);

      // Khác niên khóa hoặc khác lớp cùng tên học sinh -> vẫn mượn bình thường (201)
      const diffYear = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '3A',
            studentName: 'Nguyễn Văn Đức',
            schoolYear: '2024-2025',
            dueDate: due7,
          },
          teacherBCookie
        )
      );
      expect(diffYear.status).toBe(201);
    });
  });

  // =========================================================================
  // AC-06, AC-07, AC-08 & BR-05, BR-06 — Thời gian mượn VN, Độ lố hạn & Tìm kiếm TV
  // =========================================================================
  describe('AC-06, AC-07, AC-08: Thời gian mượn theo giờ VN, Phân mức độ lố hạn & Tìm kiếm tiếng Việt', () => {
    it('AC-07: lọc chính xác khoảng borrowedFrom/borrowedTo theo ranh giới ngày Việt Nam (UTC+7) và sắp xếp asc/desc', async () => {
      const db = await getDb();
      const now = new Date().toISOString();
      const todayVN = getTodayVNDateString();
      const due = addCalendarDays(todayVN, 10);

      // 00:00:00 ngày 11/11/2026 VN = 2026-11-10T17:00:00.000Z
      // 23:59:59 ngày 11/11/2026 VN = 2026-11-11T16:59:59.000Z
      await db.insert(loanRecords)
        .values([
          {
            teacherId: teacherAId,
            teacherNameSnapshot: 'Nguyễn Thị Lan',
            teacherPhoneSnapshot: '0901112222',
            teacherUnitSnapshot: '3A',
            className: '3A',
            studentName: 'HS Cuối Ngày 10',
            schoolYear: '2025-2026',
            recordIdentityKey: '3a|hs cuối ngày 10|2025-2026',
            borrowedAt: '2026-11-10T16:59:59.000Z', // 23:59:59 10/11 VN
            dueDate: due,
            status: 'BORROWED',
            createdAt: now,
            updatedAt: now,
          },
          {
            teacherId: teacherAId,
            teacherNameSnapshot: 'Nguyễn Thị Lan',
            teacherPhoneSnapshot: '0901112222',
            teacherUnitSnapshot: '3A',
            className: '3A',
            studentName: 'HS Đầu Ngày 11',
            schoolYear: '2025-2026',
            recordIdentityKey: '3a|hs đầu ngày 11|2025-2026',
            borrowedAt: '2026-11-10T17:00:00.000Z', // 00:00:00 11/11 VN
            dueDate: due,
            status: 'BORROWED',
            createdAt: now,
            updatedAt: now,
          },
          {
            teacherId: teacherBId,
            teacherNameSnapshot: 'Đặng Hoàng Ân',
            teacherPhoneSnapshot: '0909888777',
            teacherUnitSnapshot: 'Tổ 4-5',
            className: '4A',
            studentName: 'HS Cuối Ngày 11',
            schoolYear: '2025-2026',
            recordIdentityKey: '4a|hs cuối ngày 11|2025-2026',
            borrowedAt: '2026-11-11T16:59:59.000Z', // 23:59:59 11/11 VN
            dueDate: due,
            status: 'BORROWED',
            createdAt: now,
            updatedAt: now,
          },
          {
            teacherId: teacherBId,
            teacherNameSnapshot: 'Đặng Hoàng Ân',
            teacherPhoneSnapshot: '0909888777',
            teacherUnitSnapshot: 'Tổ 4-5',
            className: '4A',
            studentName: 'HS Đầu Ngày 12',
            schoolYear: '2025-2026',
            recordIdentityKey: '4a|hs đầu ngày 12|2025-2026',
            borrowedAt: '2026-11-11T17:00:00.000Z', // 00:00:00 12/11 VN
            dueDate: due,
            status: 'BORROWED',
            createdAt: now,
            updatedAt: now,
          },
        ])
        .run();

      // Lọc đúng ngày 11/11 VN với sort=borrowed_asc
      const ascRes = await listLoansGET(
        new Request(
          'http://localhost/api/loans?borrowedFrom=2026-11-11&borrowedTo=2026-11-11&sort=borrowed_asc',
          { headers: { cookie: adminCookie } }
        )
      );
      expect(ascRes.status).toBe(200);
      const ascList = (await ascRes.json()).data as LoanItemResponse[];
      expect(ascList.map((r) => r.studentName)).toEqual(['HS Đầu Ngày 11', 'HS Cuối Ngày 11']);

      // Lọc đúng ngày 11/11 VN với sort=borrowed_desc
      const descRes = await listLoansGET(
        new Request(
          'http://localhost/api/loans?borrowedFrom=2026-11-11&borrowedTo=2026-11-11&sort=borrowed_desc',
          { headers: { cookie: adminCookie } }
        )
      );
      expect(descRes.status).toBe(200);
      const descList = (await descRes.json()).data as LoanItemResponse[];
      expect(descList.map((r) => r.studentName)).toEqual(['HS Cuối Ngày 11', 'HS Đầu Ngày 11']);
    });

    it('AC-06 & AC-08: lọc chính xác từng overdueTier (CRITICAL, MODERATE, MILD, DUE_TODAY, DUE_SOON, ATTENTION) và tie-breaker sắp xếp', async () => {
      const db = await getDb();
      const now = new Date().toISOString();
      const todayVN = getTodayVNDateString();

      const seedRows = [
        { name: 'HS Critical 12', offset: -12, borrowedAt: '2026-11-02T01:00:00.000Z', status: 'BORROWED' as const },
        { name: 'HS Critical 8 Cũ', offset: -8, borrowedAt: '2026-11-01T01:00:00.000Z', status: 'BORROWED' as const },
        { name: 'HS Critical 8 Mới', offset: -8, borrowedAt: '2026-11-05T01:00:00.000Z', status: 'BORROWED' as const },
        { name: 'HS Moderate 7', offset: -7, borrowedAt: '2026-11-06T01:00:00.000Z', status: 'BORROWED' as const },
        { name: 'HS Moderate 4', offset: -4, borrowedAt: '2026-11-07T01:00:00.000Z', status: 'BORROWED' as const },
        { name: 'HS Mild 3', offset: -3, borrowedAt: '2026-11-08T01:00:00.000Z', status: 'BORROWED' as const },
        { name: 'HS Mild 1', offset: -1, borrowedAt: '2026-11-09T01:00:00.000Z', status: 'BORROWED' as const },
        { name: 'HS Due Today', offset: 0, borrowedAt: '2026-11-10T01:00:00.000Z', status: 'BORROWED' as const },
        { name: 'HS Due Soon 1', offset: 1, borrowedAt: '2026-11-11T01:00:00.000Z', status: 'BORROWED' as const },
        { name: 'HS Due Soon 2', offset: 2, borrowedAt: '2026-11-12T01:00:00.000Z', status: 'BORROWED' as const },
        { name: 'HS On Time 3', offset: 3, borrowedAt: '2026-11-13T01:00:00.000Z', status: 'BORROWED' as const },
        { name: 'HS Returned Cũ', offset: -20, borrowedAt: '2026-10-01T01:00:00.000Z', status: 'RETURNED' as const },
      ];

      await db.insert(loanRecords)
        .values(
          seedRows.map((item, idx) => ({
            teacherId: teacherAId,
            teacherNameSnapshot: 'Nguyễn Thị Lan',
            teacherPhoneSnapshot: '0901112222',
            teacherUnitSnapshot: '3A',
            className: '3A',
            studentName: item.name,
            schoolYear: '2025-2026',
            recordIdentityKey: `3a|hs_tier_${idx}|2025-2026`,
            borrowedAt: item.borrowedAt,
            dueDate: addCalendarDays(todayVN, item.offset),
            returnedAt: item.status === 'RETURNED' ? now : null,
            returnedByAdminId: item.status === 'RETURNED' ? adminId : null,
            status: item.status,
            createdAt: now,
            updatedAt: now,
          }))
        )
        .run();

      const queryTier = async (tier: string) => {
        const res = await listLoansGET(
          new Request(`http://localhost/api/loans?overdueTier=${tier}&sort=overdue_desc`, {
            headers: { cookie: adminCookie },
          })
        );
        expect(res.status).toBe(200);
        return ((await res.json()).data as LoanItemResponse[]).map((r) => r.studentName);
      };

      // CRITICAL: sắp xếp overdueDays DESC, cùng overdueDays thì borrowedAt ASC
      expect(await queryTier('CRITICAL')).toEqual([
        'HS Critical 12',
        'HS Critical 8 Cũ',
        'HS Critical 8 Mới',
      ]);
      expect(await queryTier('MODERATE')).toEqual(['HS Moderate 7', 'HS Moderate 4']);
      expect(await queryTier('MILD')).toEqual(['HS Mild 3', 'HS Mild 1']);
      expect(await queryTier('DUE_TODAY')).toEqual(['HS Due Today']);
      expect(await queryTier('DUE_SOON')).toEqual(['HS Due Soon 1', 'HS Due Soon 2']);

      // ATTENTION: gồm toàn bộ 5 nhóm trên, loại ON_TIME và RETURNED
      const attention = await queryTier('ATTENTION');
      expect(attention).toEqual([
        'HS Critical 12',
        'HS Critical 8 Cũ',
        'HS Critical 8 Mới',
        'HS Moderate 7',
        'HS Moderate 4',
        'HS Mild 3',
        'HS Mild 1',
        'HS Due Today',
        'HS Due Soon 1',
        'HS Due Soon 2',
      ]);

      // Kiểm tra đồng bộ với Dashboard Admin
      const dashRes = await adminDashboardGET(
        new Request('http://localhost/api/dashboard/admin', { headers: { cookie: adminCookie } })
      );
      expect(dashRes.status).toBe(200);
      const dash = (await dashRes.json()).data;
      expect(dash.kpi.totalBorrowed).toBe(11);
      expect(dash.kpi.overdueCount).toBe(7); // 3 CRITICAL + 2 MODERATE + 2 MILD
      expect(dash.kpi.dueSoonOrTodayCount).toBe(3); // 1 DUE_TODAY + 2 DUE_SOON
      expect(dash.redList.map((r: LoanItemResponse) => r.studentName)).toEqual([
        'HS Critical 12',
        'HS Critical 8 Cũ',
        'HS Critical 8 Mới',
        'HS Moderate 7',
        'HS Moderate 4',
        'HS Mild 3',
        'HS Mild 1',
      ]);
    });

    it('tìm kiếm tiếng Việt có dấu không phân biệt hoa/thường (đức ↔ Đức, ân ↔ Ân) trên /api/loans, /api/users, /api/audit-logs', async () => {
      const todayVN = getTodayVNDateString();
      const due7 = addCalendarDays(todayVN, 7);

      // Giáo viên Đặng Hoàng Ân mượn học bạ học sinh Trần Minh Đức
      const createRes = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '4A',
            studentName: 'Trần Minh Đức',
            schoolYear: '2025-2026',
            dueDate: due7,
          },
          teacherBCookie
        )
      );
      expect(createRes.status).toBe(201);

      // 1. /api/loans: tìm "đức", "ĐỨC", NFD và tìm theo tên giáo viên "ân" / "ĐẶNG"
      for (const kw of ['đức', 'ĐỨC', 'đức'.normalize('NFD'), 'ân', 'ĐẶNG']) {
        const res = await listLoansGET(
          new Request(`http://localhost/api/loans?q=${encodeURIComponent(kw)}`, {
            headers: { cookie: adminCookie },
          })
        );
        expect(res.status).toBe(200);
        const rows = (await res.json()).data as LoanItemResponse[];
        expect(rows, `GET /api/loans?q=${kw} phải tìm thấy Trần Minh Đức`).toHaveLength(1);
        expect(rows[0].studentName).toBe('Trần Minh Đức');
      }

      // 2. /api/users: tìm "đặng", "ÂN", "tổ 4-5"
      for (const kw of ['đặng', 'ÂN', 'tổ 4-5']) {
        const res = await listUsersGET(
          new Request(`http://localhost/api/users?q=${encodeURIComponent(kw)}`, {
            headers: { cookie: adminCookie },
          })
        );
        expect(res.status).toBe(200);
        const rows = (await res.json()).data as Array<{ username: string; activeLoanCount: number }>;
        expect(rows, `GET /api/users?q=${kw} phải tìm thấy gv_an`).toHaveLength(1);
        expect(rows[0].username).toBe('gv_an');
        expect(rows[0].activeLoanCount).toBe(1);
      }

      // 3. /api/audit-logs: tìm "đức" (trong metadataJson) và "đặng" / "ÂN" (trong actorName)
      for (const kw of ['đức', 'ĐỨC', 'đặng', 'ÂN']) {
        const res = await auditLogsGET(
          new Request(`http://localhost/api/audit-logs?q=${encodeURIComponent(kw)}`, {
            headers: { cookie: adminCookie },
          })
        );
        expect(res.status).toBe(200);
        const rows = (await res.json()).data as Array<{ action: string }>;
        expect(rows.length, `GET /api/audit-logs?q=${kw} phải tìm thấy log LOAN_CREATED`).toBeGreaterThanOrEqual(1);
        expect(rows.some((r) => r.action === 'LOAN_CREATED')).toBe(true);
      }
    });
  });

  // =========================================================================
  // AC-09, AC-10, BR-07, BR-08, BR-09
  // =========================================================================
  describe('AC-09, AC-10, BR-08, BR-09: Tài khoản bị khóa giữ nguyên phiếu, Xác nhận trả & Hủy phiếu', () => {
    it('BR-09: giáo viên bị khóa tài khoản vẫn giữ nguyên phiếu đang mượn trên Dashboard Admin và Danh sách đỏ', async () => {
      const db = await getDb();
      const now = new Date().toISOString();
      const todayVN = getTodayVNDateString();

      const overdueLoan = await db
        .insert(loanRecords)
        .values({
          teacherId: teacherAId,
          teacherNameSnapshot: 'Nguyễn Thị Lan',
          teacherPhoneSnapshot: '0901112222',
          teacherUnitSnapshot: '3A',
          className: '3A',
          studentName: 'Học Sinh Của GV Bị Khóa',
          schoolYear: '2025-2026',
          recordIdentityKey: '3a|học sinh của gv bị khóa|2025-2026',
          borrowedAt: '2026-11-10T02:00:00.000Z',
          dueDate: addCalendarDays(todayVN, -5),
          status: 'BORROWED',
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      // Admin khóa tài khoản GV A
      const lockRes = await updateUserPATCH(
        makeNextJsonReq(`http://localhost/api/users/${teacherAId}`, 'PATCH', { isActive: false }, adminCookie),
        { params: Promise.resolve({ id: String(teacherAId) }) }
      );
      expect(lockRes.status).toBe(200);

      // Phiếu quá hạn của GV A vẫn nằm nguyên trong Dashboard & Danh sách đỏ
      const dashRes = await adminDashboardGET(
        new Request('http://localhost/api/dashboard/admin', { headers: { cookie: adminCookie } })
      );
      const dash = (await dashRes.json()).data;
      expect(dash.kpi.totalBorrowed).toBe(1);
      expect(dash.kpi.overdueCount).toBe(1);
      expect(dash.redList).toHaveLength(1);
      expect(dash.redList[0].id).toBe(overdueLoan.id);
      expect(dash.redList[0].teacherPhoneSnapshot).toBe('0901112222');

      // Admin vẫn thu hồi và xác nhận trả được bình thường
      const retRes = await returnLoanPOST(
        makeNextJsonReq(
          `http://localhost/api/loans/${overdueLoan.id}/return`,
          'POST',
          { returnNote: 'Thu hồi trực tiếp tại văn phòng' },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(overdueLoan.id) }) }
      );
      expect(retRes.status).toBe(200);

      const dashAfter = (
        await (
          await adminDashboardGET(
            new Request('http://localhost/api/dashboard/admin', { headers: { cookie: adminCookie } })
          )
        ).json()
      ).data;
      expect(dashAfter.kpi.overdueCount).toBe(0);
      expect(dashAfter.redList).toHaveLength(0);
    });

    it('AC-09 & AC-10 & BR-08: từ chối 409 khi trả lại phiếu RETURNED/CANCELLED; hủy bắt buộc lý do >= 3 ký tự, không xóa DB và giải phóng khóa trùng', async () => {
      const todayVN = getTodayVNDateString();
      const due7 = addCalendarDays(todayVN, 7);

      // Tạo phiếu 1 để test trả -> trả lại (409) & hủy sau khi trả (409)
      const loan1 = (
        await (
          await createLoanPOST(
            makeJsonReq(
              'http://localhost/api/loans',
              'POST',
              { className: '2A', studentName: 'Lê Thu Hà', schoolYear: '2025-2026', dueDate: due7 },
              teacherACookie
            )
          )
        ).json()
      ).data as LoanItemResponse;

      // Trả thành công (kể cả body rỗng)
      const returnOk = await returnLoanPOST(
        new NextRequest(`http://localhost/api/loans/${loan1.id}/return`, {
          method: 'POST',
          headers: { cookie: adminCookie },
        }),
        { params: Promise.resolve({ id: String(loan1.id) }) }
      );
      expect(returnOk.status).toBe(200);
      const returnedData = (await returnOk.json()).data as LoanItemResponse;
      expect(returnedData.status).toBe('RETURNED');
      expect(returnedData.returnedByAdminId).toBe(adminId);
      expect(returnedData.returnedByAdminName).toBeTruthy();
      expect(returnedData.returnedAt).toBeTruthy();

      // Trả lại phiếu đã RETURNED -> 409
      const returnAgain = await returnLoanPOST(
        makeNextJsonReq(`http://localhost/api/loans/${loan1.id}/return`, 'POST', {}, adminCookie),
        { params: Promise.resolve({ id: String(loan1.id) }) }
      );
      expect(returnAgain.status).toBe(409);
      expect((await returnAgain.json()).error.code).toBe('INVALID_LOAN_STATUS');

      // Hủy phiếu đã RETURNED -> 409
      const cancelReturned = await cancelLoanPOST(
        makeNextJsonReq(
          `http://localhost/api/loans/${loan1.id}/cancel`,
          'POST',
          { reason: 'Thử hủy phiếu đã trả' },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(loan1.id) }) }
      );
      expect(cancelReturned.status).toBe(409);

      // Tạo phiếu 2 để test hủy phiếu
      const loan2 = (
        await (
          await createLoanPOST(
            makeJsonReq(
              'http://localhost/api/loans',
              'POST',
              { className: '2B', studentName: 'Võ Minh Tâm', schoolYear: '2025-2026', dueDate: due7 },
              teacherACookie
            )
          )
        ).json()
      ).data as LoanItemResponse;

      // Lý do < 3 ký tự hoặc toàn khoảng trắng -> 400
      for (const badReason of ['', '  ', 'ab', '  a  ']) {
        const badCancel = await cancelLoanPOST(
          makeNextJsonReq(
            `http://localhost/api/loans/${loan2.id}/cancel`,
            'POST',
            { reason: badReason },
            adminCookie
          ),
          { params: Promise.resolve({ id: String(loan2.id) }) }
        );
        expect(badCancel.status, `reason="${badReason}" phải bị 400`).toBe(400);
      }

      // Hủy hợp lệ (>= 3 ký tự) -> 200
      const cancelOk = await cancelLoanPOST(
        makeNextJsonReq(
          `http://localhost/api/loans/${loan2.id}/cancel`,
          'POST',
          { reason: 'Nhập nhầm lớp của học sinh' },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(loan2.id) }) }
      );
      expect(cancelOk.status).toBe(200);
      const cancelledData = (await cancelOk.json()).data as LoanItemResponse;
      expect(cancelledData.status).toBe('CANCELLED');
      expect(cancelledData.cancelReason).toBe('Nhập nhầm lớp của học sinh');
      expect(cancelledData.cancelledByAdminId).toBe(adminId);
      expect(cancelledData.cancelledAt).toBeTruthy();

      // BR-08: Bản ghi vẫn tồn tại trong DB, không bị xóa cứng
      const dbRow = await (await getDb()).select().from(loanRecords).where(eq(loanRecords.id, loan2.id)).get();
      expect(dbRow).toBeDefined();
      expect(dbRow?.status).toBe('CANCELLED');

      // Xác nhận trả hoặc hủy lại phiếu đã CANCELLED -> 409
      const returnCancelled = await returnLoanPOST(
        makeNextJsonReq(`http://localhost/api/loans/${loan2.id}/return`, 'POST', {}, adminCookie),
        { params: Promise.resolve({ id: String(loan2.id) }) }
      );
      expect(returnCancelled.status).toBe(409);

      const cancelAgain = await cancelLoanPOST(
        makeNextJsonReq(
          `http://localhost/api/loans/${loan2.id}/cancel`,
          'POST',
          { reason: 'Hủy lần 2' },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(loan2.id) }) }
      );
      expect(cancelAgain.status).toBe(409);

      // Giải phóng khóa chống trùng sau CANCELLED -> GV B mượn lại được ngay
      const reBorrow = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          { className: '2B', studentName: 'Võ Minh Tâm', schoolYear: '2025-2026', dueDate: due7 },
          teacherBCookie
        )
      );
      expect(reBorrow.status).toBe(201);
    });
  });

  // =========================================================================
  // AC-11 & Ma trận phân quyền RBAC
  // =========================================================================
  describe('AC-11 & Permissions: Cô lập dữ liệu hoàn toàn giữa giáo viên và bảo vệ RBAC toàn diện', () => {
    it('AC-11: giáo viên A truyền ?teacherId=<B> hoặc tìm tên học sinh của B vẫn chỉ thấy phiếu của chính A', async () => {
      const todayVN = getTodayVNDateString();
      const due7 = addCalendarDays(todayVN, 7);

      await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          { className: '3A', studentName: 'Học Sinh Riêng Của A', schoolYear: '2025-2026', dueDate: due7 },
          teacherACookie
        )
      );
      await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          { className: '4B', studentName: 'Học Sinh Riêng Của B', schoolYear: '2025-2026', dueDate: due7 },
          teacherBCookie
        )
      );

      // A cố truyền teacherId của B
      const spoofFilter = await listLoansGET(
        new Request(`http://localhost/api/loans?teacherId=${teacherBId}`, {
          headers: { cookie: teacherACookie },
        })
      );
      expect(spoofFilter.status).toBe(200);
      const aRows = (await spoofFilter.json()).data as LoanItemResponse[];
      expect(aRows).toHaveLength(1);
      expect(aRows[0].teacherId).toBe(teacherAId);
      expect(aRows[0].studentName).toBe('Học Sinh Riêng Của A');

      // A tìm kiếm từ khóa khớp học sinh của B -> rỗng
      const searchB = await listLoansGET(
        new Request(`http://localhost/api/loans?q=${encodeURIComponent('Riêng Của B')}`, {
          headers: { cookie: teacherACookie },
        })
      );
      expect(searchB.status).toBe(200);
      expect((await searchB.json()).data).toHaveLength(0);
    });

    it('RBAC: từ chối 401 khi chưa đăng nhập và 403 khi giáo viên gọi các API chỉ dành cho Admin', async () => {
      // Unauthenticated -> 401
      expect((await meGET(new Request('http://localhost/api/auth/me'))).status).toBe(401);
      expect(
        (
          await changePasswordPOST(
            makeJsonReq('http://localhost/api/auth/change-password', 'POST', {
              currentPassword: 'a',
              newPassword: 'bbbbbb',
            })
          )
        ).status
      ).toBe(401);
      expect((await listUsersGET(new Request('http://localhost/api/users'))).status).toBe(401);
      expect(
        (await createUserPOST(makeJsonReq('http://localhost/api/users', 'POST', {}))).status
      ).toBe(401);
      expect(
        (
          await updateUserPATCH(makeNextJsonReq('http://localhost/api/users/1', 'PATCH', {}), {
            params: Promise.resolve({ id: '1' }),
          })
        ).status
      ).toBe(401);
      expect(
        (
          await resetPasswordPOST(
            makeNextJsonReq('http://localhost/api/users/1/reset-password', 'POST', {}),
            { params: Promise.resolve({ id: '1' }) }
          )
        ).status
      ).toBe(401);
      expect((await listLoansGET(new Request('http://localhost/api/loans'))).status).toBe(401);
      expect(
        (await createLoanPOST(makeJsonReq('http://localhost/api/loans', 'POST', {}))).status
      ).toBe(401);
      expect(
        (
          await returnLoanPOST(makeNextJsonReq('http://localhost/api/loans/1/return', 'POST', {}), {
            params: Promise.resolve({ id: '1' }),
          })
        ).status
      ).toBe(401);
      expect(
        (
          await cancelLoanPOST(makeNextJsonReq('http://localhost/api/loans/1/cancel', 'POST', {}), {
            params: Promise.resolve({ id: '1' }),
          })
        ).status
      ).toBe(401);
      expect(
        (await adminDashboardGET(new Request('http://localhost/api/dashboard/admin'))).status
      ).toBe(401);
      expect((await getSettingsGET(new Request('http://localhost/api/settings'))).status).toBe(401);
      expect(
        (await patchSettingsPATCH(makeJsonReq('http://localhost/api/settings', 'PATCH', {}))).status
      ).toBe(401);
      expect((await auditLogsGET(new Request('http://localhost/api/audit-logs'))).status).toBe(401);

      // TEACHER gọi các endpoint Admin -> 403
      expect(
        (await listUsersGET(new Request('http://localhost/api/users', { headers: { cookie: teacherACookie } }))).status
      ).toBe(403);
      expect(
        (await createUserPOST(makeJsonReq('http://localhost/api/users', 'POST', {}, teacherACookie))).status
      ).toBe(403);
      expect(
        (
          await updateUserPATCH(
            makeNextJsonReq(`http://localhost/api/users/${teacherBId}`, 'PATCH', { isActive: false }, teacherACookie),
            { params: Promise.resolve({ id: String(teacherBId) }) }
          )
        ).status
      ).toBe(403);
      expect(
        (
          await resetPasswordPOST(
            makeNextJsonReq(
              `http://localhost/api/users/${teacherBId}/reset-password`,
              'POST',
              { newPassword: 'HackPassword1' },
              teacherACookie
            ),
            { params: Promise.resolve({ id: String(teacherBId) }) }
          )
        ).status
      ).toBe(403);
      expect(
        (
          await returnLoanPOST(
            makeNextJsonReq('http://localhost/api/loans/1/return', 'POST', {}, teacherACookie),
            { params: Promise.resolve({ id: '1' }) }
          )
        ).status
      ).toBe(403);
      expect(
        (
          await cancelLoanPOST(
            makeNextJsonReq('http://localhost/api/loans/1/cancel', 'POST', { reason: 'Tự hủy' }, teacherACookie),
            { params: Promise.resolve({ id: '1' }) }
          )
        ).status
      ).toBe(403);
      expect(
        (
          await adminDashboardGET(
            new Request('http://localhost/api/dashboard/admin', { headers: { cookie: teacherACookie } })
          )
        ).status
      ).toBe(403);
      expect(
        (
          await patchSettingsPATCH(
            makeJsonReq(
              'http://localhost/api/settings',
              'PATCH',
              { defaultLoanDays: 10, maxLoanDays: 20 },
              teacherACookie
            )
          )
        ).status
      ).toBe(403);
      expect(
        (
          await auditLogsGET(
            new Request('http://localhost/api/audit-logs', { headers: { cookie: teacherACookie } })
          )
        ).status
      ).toBe(403);
    });
  });

  // =========================================================================
  // AC-12 — Cấu hình hạn mượn không ảnh hưởng phiếu cũ, áp dụng cho phiếu mới
  // =========================================================================
  describe('AC-12: Thay đổi cấu hình hạn mượn mặc định và tối đa', () => {
    it('AC-12: đổi defaultLoanDays & maxLoanDays không sửa dueDate phiếu cũ nhưng áp dụng ngay giới hạn mới cho phiếu sau', async () => {
      const todayVN = getTodayVNDateString();
      const oldDue25 = addCalendarDays(todayVN, 25);

      // Tạo phiếu trước khi đổi cấu hình (max đang là 30)
      const oldLoanRes = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '5A',
            studentName: 'Học Sinh Tạo Trước',
            schoolYear: '2025-2026',
            dueDate: oldDue25,
          },
          teacherACookie
        )
      );
      expect(oldLoanRes.status).toBe(201);
      const oldLoanId = (await oldLoanRes.json()).data.id as number;

      // Kiểm tra validation lỗi khi maxLoanDays < defaultLoanDays hoặc vượt khoảng
      const badSettings = await patchSettingsPATCH(
        makeJsonReq(
          'http://localhost/api/settings',
          'PATCH',
          { defaultLoanDays: 20, maxLoanDays: 10 },
          adminCookie
        )
      );
      expect(badSettings.status).toBe(400);

      // Admin đổi cấu hình: mặc định 10 ngày, tối đa 15 ngày
      const patchOk = await patchSettingsPATCH(
        makeJsonReq(
          'http://localhost/api/settings',
          'PATCH',
          { defaultLoanDays: 10, maxLoanDays: 15 },
          adminCookie
        )
      );
      expect(patchOk.status).toBe(200);

      // Giáo viên đọc /api/settings nhận ngay cấu hình mới (+10 ngày mặc định, +15 tối đa)
      const teacherSettings = await getSettingsGET(
        new Request('http://localhost/api/settings', { headers: { cookie: teacherACookie } })
      );
      expect((await teacherSettings.json()).data).toEqual({
        defaultLoanDays: 10,
        maxLoanDays: 15,
      });

      // Phiếu cũ không hề bị thay đổi dueDate
      const oldRow = (await (await getDb()).select().from(loanRecords).where(eq(loanRecords.id, oldLoanId)).get())!;
      expect(oldRow.dueDate).toBe(oldDue25);

      // Phiếu mới vượt quá giới hạn mới (+16 ngày) phải bị từ chối 400
      const exceedNewMax = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '5A',
            studentName: 'Học Sinh Tạo Sau Quá Hạn',
            schoolYear: '2025-2026',
            dueDate: addCalendarDays(todayVN, 16),
          },
          teacherACookie
        )
      );
      expect(exceedNewMax.status).toBe(400);
      expect((await exceedNewMax.json()).error.code).toBe('INVALID_DUE_DATE');

      // Phiếu mới đúng biên giới hạn mới (+15 ngày) được chấp nhận 201
      const withinNewMax = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '5A',
            studentName: 'Học Sinh Tạo Sau Hợp Lệ',
            schoolYear: '2025-2026',
            dueDate: addCalendarDays(todayVN, 15),
          },
          teacherACookie
        )
      );
      expect(withinNewMax.status).toBe(201);
    });
  });

  // =========================================================================
  // AC-13 — Audit Logs đầy đủ mọi thao tác trọng yếu & truy vấn/lọc
  // =========================================================================
  describe('AC-13: Ghi nhận đầy đủ Audit Logs cho toàn bộ thao tác trọng yếu và lọc/phân trang', () => {
    it('AC-13: ghi đủ 12 loại hành động trọng yếu, không log mật khẩu rõ, lọc theo action/targetType và phân trang chính xác', async () => {
      const todayVN = getTodayVNDateString();
      const due7 = addCalendarDays(todayVN, 7);

      // 1. LOGIN_FAILED
      await loginPOST(
        makeJsonReq('http://localhost/api/auth/login', 'POST', {
          username: 'gv_lan',
          password: 'SaiPassword999',
        })
      );

      // 2. LOGIN_SUCCESS
      const loginOk = await loginPOST(
        makeJsonReq('http://localhost/api/auth/login', 'POST', {
          username: 'gv_lan',
          password: 'LanPass123',
        })
      );
      const lanCookie = extractCookiePair(loginOk.headers.get('set-cookie'));

      // 3. PASSWORD_CHANGED
      await changePasswordPOST(
        makeJsonReq(
          'http://localhost/api/auth/change-password',
          'POST',
          { currentPassword: 'LanPass123', newPassword: 'LanSecretNew88' },
          lanCookie
        )
      );

      // 4. LOGOUT
      await logoutPOST(
        new Request('http://localhost/api/auth/logout', {
          method: 'POST',
          headers: { cookie: lanCookie },
        })
      );

      // 5. USER_CREATED
      const createdUserRes = await createUserPOST(
        makeJsonReq(
          'http://localhost/api/users',
          'POST',
          {
            username: 'gv_audit',
            fullName: 'Trần Văn Kiểm Toán',
            role: 'TEACHER',
            phone: '0912345670',
            unit: '2C',
            password: 'AuditTempPassword1',
          },
          adminCookie
        )
      );
      const newUserId = (await createdUserRes.json()).data.id as number;

      // 6. USER_UPDATED
      await updateUserPATCH(
        makeNextJsonReq(
          `http://localhost/api/users/${newUserId}`,
          'PATCH',
          { phone: '0912000111', unit: '3C' },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(newUserId) }) }
      );

      // 7. USER_STATUS_CHANGED
      await updateUserPATCH(
        makeNextJsonReq(
          `http://localhost/api/users/${newUserId}`,
          'PATCH',
          { isActive: false },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(newUserId) }) }
      );

      // 8. USER_PASSWORD_RESET
      await resetPasswordPOST(
        makeNextJsonReq(
          `http://localhost/api/users/${newUserId}/reset-password`,
          'POST',
          { newPassword: 'ResetSuperSecret2', mustChangePassword: true },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(newUserId) }) }
      );

      // 9. LOAN_CREATED (2 phiếu: 1 để trả, 1 để hủy)
      const loan1 = (
        await (
          await createLoanPOST(
            makeJsonReq(
              'http://localhost/api/loans',
              'POST',
              { className: '4A', studentName: 'HS Audit Trả', schoolYear: '2025-2026', dueDate: due7 },
              teacherBCookie
            )
          )
        ).json()
      ).data as LoanItemResponse;

      const loan2 = (
        await (
          await createLoanPOST(
            makeJsonReq(
              'http://localhost/api/loans',
              'POST',
              { className: '4A', studentName: 'HS Audit Hủy', schoolYear: '2025-2026', dueDate: due7 },
              teacherBCookie
            )
          )
        ).json()
      ).data as LoanItemResponse;

      // 10. LOAN_RETURNED
      await returnLoanPOST(
        makeNextJsonReq(
          `http://localhost/api/loans/${loan1.id}/return`,
          'POST',
          { returnNote: 'Đủ sổ' },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(loan1.id) }) }
      );

      // 11. LOAN_CANCELLED
      await cancelLoanPOST(
        makeNextJsonReq(
          `http://localhost/api/loans/${loan2.id}/cancel`,
          'POST',
          { reason: 'Hủy kiểm chứng audit' },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(loan2.id) }) }
      );

      // 12. SETTINGS_UPDATED
      await patchSettingsPATCH(
        makeJsonReq(
          'http://localhost/api/settings',
          'PATCH',
          { defaultLoanDays: 10, maxLoanDays: 25 },
          adminCookie
        )
      );

      // Truy vấn toàn bộ audit logs
      const allLogsRes = await auditLogsGET(
        new Request('http://localhost/api/audit-logs?pageSize=50', {
          headers: { cookie: adminCookie },
        })
      );
      expect(allLogsRes.status).toBe(200);
      const allLogsBody = await allLogsRes.json();
      const logs = allLogsBody.data as Array<{
        id: number;
        action: string;
        targetType: string;
        metadataJson: string | null;
      }>;

      const expectedActions = [
        'LOGIN_FAILED',
        'LOGIN_SUCCESS',
        'PASSWORD_CHANGED',
        'LOGOUT',
        'USER_CREATED',
        'USER_UPDATED',
        'USER_STATUS_CHANGED',
        'USER_PASSWORD_RESET',
        'LOAN_CREATED',
        'LOAN_RETURNED',
        'LOAN_CANCELLED',
        'SETTINGS_UPDATED',
      ];
      const loggedActionSet = new Set(logs.map((l) => l.action));
      for (const act of expectedActions) {
        expect(loggedActionSet.has(act), `Thiếu audit action ${act}`).toBe(true);
      }

      // Bảo mật NFR 8.2: tuyệt đối không lưu mật khẩu dạng rõ trong metadataJson
      const allMetaText = logs.map((l) => l.metadataJson ?? '').join('\n');
      expect(allMetaText).not.toContain('SaiPassword999');
      expect(allMetaText).not.toContain('LanPass123');
      expect(allMetaText).not.toContain('LanSecretNew88');
      expect(allMetaText).not.toContain('AuditTempPassword1');
      expect(allMetaText).not.toContain('ResetSuperSecret2');

      // Lọc theo action
      const onlyReturned = await auditLogsGET(
        new Request('http://localhost/api/audit-logs?action=LOAN_RETURNED', {
          headers: { cookie: adminCookie },
        })
      );
      const returnedLogs = (await onlyReturned.json()).data as Array<{ action: string }>;
      expect(returnedLogs).toHaveLength(1);
      expect(returnedLogs[0].action).toBe('LOAN_RETURNED');

      // Lọc theo targetType
      const settingLogs = await auditLogsGET(
        new Request('http://localhost/api/audit-logs?targetType=SETTING', {
          headers: { cookie: adminCookie },
        })
      );
      const settingItems = (await settingLogs.json()).data as Array<{ targetType: string }>;
      expect(settingItems).toHaveLength(1);
      expect(settingItems[0].targetType).toBe('SETTING');

      // Phân trang: trang 1 và trang 2 không trùng bản ghi
      const p1 = await (
        await auditLogsGET(
          new Request('http://localhost/api/audit-logs?page=1&pageSize=5', {
            headers: { cookie: adminCookie },
          })
        )
      ).json();
      const p2 = await (
        await auditLogsGET(
          new Request('http://localhost/api/audit-logs?page=2&pageSize=5', {
            headers: { cookie: adminCookie },
          })
        )
      ).json();
      expect(p1.data).toHaveLength(5);
      expect(p2.data).toHaveLength(5);
      expect(p1.meta.total).toBe(logs.length);
      const p1Ids = new Set(p1.data.map((r: { id: number }) => r.id));
      for (const r of p2.data as Array<{ id: number }>) {
        expect(p1Ids.has(r.id)).toBe(false);
      }
    });
  });

  // =========================================================================
  // Kiểm chứng đối chiếu Spec Permissions mục 6 & NFR phân trang 20 dòng/trang
  // =========================================================================
  describe('NFR 8.1 & Spec Permissions: Phân trang mặc định 20 dòng và xác thực logout', () => {
    it('NFR 8.1: mặc định phân trang 20 bản ghi/trang cho /api/loans', async () => {
      const db = await getDb();
      const now = new Date().toISOString();
      const todayVN = getTodayVNDateString();
      const due7 = addCalendarDays(todayVN, 7);

      const batch = Array.from({ length: 25 }, (_, i) => ({
        teacherId: teacherAId,
        teacherNameSnapshot: 'Nguyễn Thị Lan',
        teacherPhoneSnapshot: '0901112222',
        teacherUnitSnapshot: '3A',
        className: '3A',
        studentName: `Học Sinh Số ${i + 1}`,
        schoolYear: '2025-2026',
        recordIdentityKey: `3a|học sinh số ${i + 1}|2025-2026`,
        borrowedAt: new Date(Date.now() - i * 60_000).toISOString(),
        dueDate: due7,
        status: 'BORROWED' as const,
        createdAt: now,
        updatedAt: now,
      }));
      await db.insert(loanRecords).values(batch).run();

      const page1 = await (
        await listLoansGET(new Request('http://localhost/api/loans', { headers: { cookie: adminCookie } }))
      ).json();
      expect(page1.data).toHaveLength(20);
      expect(page1.meta.total).toBe(25);
      expect(page1.meta.pageSize).toBe(20);
      expect(page1.meta.totalPages).toBe(2);

      const page2 = await (
        await listLoansGET(
          new Request('http://localhost/api/loans?page=2', { headers: { cookie: adminCookie } })
        )
      ).json();
      expect(page2.data).toHaveLength(5);
    });

    it('FR-07 & FR-02: thống kê KPI returnedLast7Days/returnedThisMonth theo giờ VN và lọc /api/users theo role/isActive', async () => {
      const db = await getDb();
      const now = new Date();
      const nowIso = now.toISOString();
      const todayVN = getTodayVNDateString(now);
      const twoMonthsAgo = new Date(now.getTime() - 65 * 86_400_000).toISOString();

      await db.insert(loanRecords)
        .values([
          {
            teacherId: teacherAId,
            teacherNameSnapshot: 'Nguyễn Thị Lan',
            teacherPhoneSnapshot: '0901112222',
            teacherUnitSnapshot: '3A',
            className: '3A',
            studentName: 'HS Trả Hôm Nay',
            schoolYear: '2025-2026',
            recordIdentityKey: '3a|hs trả hôm nay|2025-2026',
            borrowedAt: nowIso,
            dueDate: addCalendarDays(todayVN, 5),
            returnedAt: nowIso,
            returnedByAdminId: adminId,
            status: 'RETURNED',
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          {
            teacherId: teacherAId,
            teacherNameSnapshot: 'Nguyễn Thị Lan',
            teacherPhoneSnapshot: '0901112222',
            teacherUnitSnapshot: '3A',
            className: '3A',
            studentName: 'HS Trả Tháng Trước',
            schoolYear: '2024-2025',
            recordIdentityKey: '3a|hs trả tháng trước|2024-2025',
            borrowedAt: twoMonthsAgo,
            dueDate: addCalendarDays(todayVN, -60),
            returnedAt: twoMonthsAgo,
            returnedByAdminId: adminId,
            status: 'RETURNED',
            createdAt: twoMonthsAgo,
            updatedAt: twoMonthsAgo,
          },
          {
            teacherId: teacherBId,
            teacherNameSnapshot: 'Đặng Hoàng Ân',
            teacherPhoneSnapshot: '0909888777',
            teacherUnitSnapshot: 'Tổ 4-5',
            className: '4A',
            studentName: 'HS Bị Hủy Hôm Nay',
            schoolYear: '2025-2026',
            recordIdentityKey: '4a|hs bị hủy hôm nay|2025-2026',
            borrowedAt: nowIso,
            dueDate: addCalendarDays(todayVN, 5),
            cancelReason: 'Nhập sai',
            cancelledByAdminId: adminId,
            cancelledAt: nowIso,
            status: 'CANCELLED',
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        ])
        .run();

      const dashRes = await adminDashboardGET(
        new Request('http://localhost/api/dashboard/admin', { headers: { cookie: adminCookie } })
      );
      const dash = (await dashRes.json()).data;
      expect(dash.kpi.returnedLast7Days).toBe(1);
      expect(dash.kpi.returnedThisMonth).toBe(1);

      // Lọc /api/users theo role và isActive
      await updateUserPATCH(
        makeNextJsonReq(`http://localhost/api/users/${teacherBId}`, 'PATCH', { isActive: false }, adminCookie),
        { params: Promise.resolve({ id: String(teacherBId) }) }
      );

      const onlyAdmins = await (
        await listUsersGET(
          new Request('http://localhost/api/users?role=ADMIN', { headers: { cookie: adminCookie } })
        )
      ).json();
      expect(onlyAdmins.data).toHaveLength(1);
      expect(onlyAdmins.data[0].role).toBe('ADMIN');

      const onlyLocked = await (
        await listUsersGET(
          new Request('http://localhost/api/users?isActive=false', { headers: { cookie: adminCookie } })
        )
      ).json();
      expect(onlyLocked.data).toHaveLength(1);
      expect(onlyLocked.data[0].id).toBe(teacherBId);
      expect('passwordHash' in onlyLocked.data[0]).toBe(false);
    });

    it('Spec mục 6 (Permissions) & Architecture mục 4.2: POST /api/auth/logout idempotent trả 200 và xóa cookie khi chưa đăng nhập', async () => {
      const res = await logoutPOST(
        new Request('http://localhost/api/auth/logout', {
          method: 'POST',
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.loggedOut).toBe(true);
      const setCookie = res.headers.get('set-cookie') || '';
      expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
      expect(setCookie).toContain('Max-Age=0');
    });
  });

  describe('Hồi quy sau kiểm chứng (HIGH-02..04 & MEDIUM-01..07)', () => {
    it('HIGH-02: Giả mạo X-Forwarded-For không vượt qua được rate-limit khi TRUST_PROXY=false; username bucket chặn vượt ngưỡng dù TRUST_PROXY=true', async () => {
      const prevTrust = process.env.TRUST_PROXY;
      try {
        process.env.TRUST_PROXY = 'false';
        for (let i = 1; i <= 5; i++) {
          const res = await loginPOST(
            makeJsonReq(
              'http://localhost/api/auth/login',
              'POST',
              { username: 'gv_lan', password: 'WrongPassword' },
              undefined,
              { 'x-forwarded-for': `203.0.113.${i}` }
            )
          );
          expect(res.status).toBe(401);
        }

        const blocked = await loginPOST(
          makeJsonReq(
            'http://localhost/api/auth/login',
            'POST',
            { username: 'gv_lan', password: 'LanPass123' },
            undefined,
            { 'x-forwarded-for': '203.0.113.99' }
          )
        );
        expect(blocked.status).toBe(429);

        // Kiểm tra bucket riêng theo username khi bật TRUST_PROXY=true
        await resetRateLimiterForTests();
        process.env.TRUST_PROXY = 'true';
        for (let i = 1; i <= 15; i++) {
          const res = await loginPOST(
            makeJsonReq(
              'http://localhost/api/auth/login',
              'POST',
              { username: 'gv_lan', password: 'WrongPassword' },
              undefined,
              { 'x-forwarded-for': `198.51.100.${i}` }
            )
          );
          expect(res.status).toBe(401);
        }

        const blockedByUsername = await loginPOST(
          makeJsonReq(
            'http://localhost/api/auth/login',
            'POST',
            { username: 'gv_lan', password: 'LanPass123' },
            undefined,
            { 'x-forwarded-for': '198.51.100.200' }
          )
        );
        expect(blockedByUsername.status).toBe(429);
      } finally {
        if (prevTrust === undefined) delete process.env.TRUST_PROXY;
        else process.env.TRUST_PROXY = prevTrust;
      }
    });

    it('HIGH-03 & MEDIUM-06: Trả/hủy phiếu nguyên tử (409 nếu đã xử lý) và giữ tên người xác nhận sau khi đổi role', async () => {
      const todayVN = getTodayVNDateString();
      const due7 = addCalendarDays(todayVN, 7);

      const created = await (
        await createLoanPOST(
          makeJsonReq(
            'http://localhost/api/loans',
            'POST',
            {
              className: '2C',
              studentName: 'Lê Minh Khôi',
              schoolYear: '2025-2026',
              dueDate: due7,
            },
            teacherACookie
          )
        )
      ).json();
      const loanId = created.data.id;

      // Tạo Admin phụ thực hiện xác nhận trả
      const subAdmin = await (
        await createUserPOST(
          makeJsonReq(
            'http://localhost/api/users',
            'POST',
            {
              username: 'admin_phu',
              fullName: 'Cô Văn Thư Phụ',
              role: 'ADMIN',
              password: 'SubAdmin123',
            },
            adminCookie
          )
        )
      ).json();
      const subAdminCookie = `${SESSION_COOKIE_NAME}=${(await createSession(subAdmin.data.id)).rawToken}`;

      const retOk = await returnLoanPOST(
        makeNextJsonReq(`http://localhost/api/loans/${loanId}/return`, 'POST', {}, subAdminCookie),
        { params: Promise.resolve({ id: String(loanId) }) }
      );
      expect(retOk.status).toBe(200);

      // Gọi hủy hoặc trả lần 2 đều phải nhận 409
      const cancelAfterReturn = await cancelLoanPOST(
        makeNextJsonReq(
          `http://localhost/api/loans/${loanId}/cancel`,
          'POST',
          { reason: 'Thử ghi đè' },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(loanId) }) }
      );
      expect(cancelAfterReturn.status).toBe(409);

      // Đổi role của admin_phu sang TEACHER -> returnedByAdminName vẫn giữ nguyên
      const demoteRes = await updateUserPATCH(
        makeNextJsonReq(`http://localhost/api/users/${subAdmin.data.id}`, 'PATCH', { role: 'TEACHER' }, adminCookie),
        { params: Promise.resolve({ id: String(subAdmin.data.id) }) }
      );
      expect(demoteRes.status).toBe(200);

      const listRes = await (
        await listLoansGET(new Request('http://localhost/api/loans', { headers: { cookie: adminCookie } }))
      ).json();
      expect(listRes.data[0].returnedByAdminName).toBe('Cô Văn Thư Phụ');
    });

    it('HIGH-04 & MEDIUM-01: Hỗ trợ status=HISTORY phân trang và lọc tiếng Việt theo className/schoolYear + escape wildcard', async () => {
      const todayVN = getTodayVNDateString();
      const due7 = addCalendarDays(todayVN, 7);

      const l1 = (
        await (
          await createLoanPOST(
            makeJsonReq(
              'http://localhost/api/loans',
              'POST',
              { className: 'Lớp 1A', studentName: 'HS Một', schoolYear: '2025-2026', dueDate: due7 },
              teacherACookie
            )
          )
        ).json()
      ).data;
      const l2 = (
        await (
          await createLoanPOST(
            makeJsonReq(
              'http://localhost/api/loans',
              'POST',
              { className: 'Lớp 1B', studentName: 'HS Hai', schoolYear: '2024-2025', dueDate: due7 },
              teacherACookie
            )
          )
        ).json()
      ).data;
      await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          { className: 'Lớp 1C', studentName: 'HS Ba', schoolYear: '2025-2026', dueDate: due7 },
          teacherACookie
        )
      );

      await returnLoanPOST(
        makeNextJsonReq(`http://localhost/api/loans/${l1.id}/return`, 'POST', {}, adminCookie),
        { params: Promise.resolve({ id: String(l1.id) }) }
      );
      await cancelLoanPOST(
        makeNextJsonReq(
          `http://localhost/api/loans/${l2.id}/cancel`,
          'POST',
          { reason: 'Hủy để test history' },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(l2.id) }) }
      );

      const historyPage1 = await (
        await listLoansGET(
          new Request('http://localhost/api/loans?status=HISTORY&page=1&pageSize=1', {
            headers: { cookie: teacherACookie },
          })
        )
      ).json();
      expect(historyPage1.data).toHaveLength(1);
      expect(historyPage1.meta.total).toBe(2);
      expect(historyPage1.meta.totalPages).toBe(2);
      expect(historyPage1.meta.teacherSummary.totalActive).toBe(1);

      // Lọc theo className không phân biệt hoa/thường tiếng Việt và escape %
      const classFiltered = await (
        await listLoansGET(
          new Request(
            `http://localhost/api/loans?className=${encodeURIComponent('lớp 1a')}&schoolYear=${encodeURIComponent('2025 - 2026')}`,
            { headers: { cookie: adminCookie } }
          )
        )
      ).json();
      expect(classFiltered.data).toHaveLength(1);
      expect(classFiltered.data[0].studentName).toBe('HS Một');

      const percentEscaped = await (
        await listLoansGET(
          new Request(`http://localhost/api/loans?className=${encodeURIComponent('%')}`, {
            headers: { cookie: adminCookie },
          })
        )
      ).json();
      expect(percentEscaped.data).toHaveLength(0);
    });

    it('MEDIUM-03, MEDIUM-04, MEDIUM-05, MEDIUM-07: Chống enumeration tài khoản khóa, cookie sai encoding, diff audit và isSqliteUniqueError', async () => {
      await updateUserPATCH(
        makeNextJsonReq(`http://localhost/api/users/${teacherAId}`, 'PATCH', { isActive: false }, adminCookie),
        { params: Promise.resolve({ id: String(teacherAId) }) }
      );

      // Tài khoản bị khóa nhưng nhập SAI mật khẩu phải trả 401 (không lộ trạng thái khóa)
      const lockedWrongPass = await loginPOST(
        makeJsonReq('http://localhost/api/auth/login', 'POST', {
          username: 'gv_lan',
          password: 'WrongPassword',
        })
      );
      expect(lockedWrongPass.status).toBe(401);
      expect((await lockedWrongPass.json()).error.code).toBe('INVALID_CREDENTIALS');

      // Cookie percent-encoding hỏng phải trả 401 (không 500)
      const badCookieMe = await meGET(
        new Request('http://localhost/api/auth/me', {
          headers: { cookie: `${SESSION_COOKIE_NAME}=%E0%A4%A` },
        })
      );
      expect(badCookieMe.status).toBe(401);

      // PATCH /api/users/[id] ghi diff before/after trong audit_logs
      await updateUserPATCH(
        makeNextJsonReq(
          `http://localhost/api/users/${teacherBId}`,
          'PATCH',
          { fullName: 'Trần Văn Nam (Mới)', unit: '5B' },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(teacherBId) }) }
      );
      const logsJson = await (
        await auditLogsGET(
          new Request('http://localhost/api/audit-logs?action=USER_UPDATED', {
            headers: { cookie: adminCookie },
          })
        )
      ).json();
      expect(logsJson.data).toHaveLength(1);
      const meta = JSON.parse(logsJson.data[0].metadataJson);
      expect(meta.before.unit).toBe('Tổ 4-5');
      expect(meta.after.unit).toBe('5B');

      // isSqliteUniqueError không bắt nhầm lỗi CHECK/FOREIGNKEY
      expect(isSqliteUniqueError({ code: 'SQLITE_CONSTRAINT', message: 'CHECK constraint failed' })).toBe(
        false
      );
      expect(isSqliteUniqueError({ code: 'SQLITE_CONSTRAINT_CHECK' })).toBe(false);
      expect(isSqliteUniqueError({ code: 'SQLITE_CONSTRAINT_UNIQUE' })).toBe(true);
    });
  });
});

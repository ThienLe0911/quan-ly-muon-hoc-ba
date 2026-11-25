import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { createDbConnection, getDb, resetDbForTests, setDbForTests } from '@/db';
import { auditLogs, loanRecords, users } from '@/db/schema';
import { seedDatabase } from '@/db/seed';
import { isSqliteUniqueError, withApiErrorHandling } from '@/lib/api/response';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { getClientIp, resetRateLimiterForTests } from '@/lib/auth/rate-limit';
import { createSession, parseCookieHeader, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { addCalendarDays, getTodayVNDateString } from '@/lib/domain/overdue';
import { buildUserSearchText } from '@/lib/domain/search';
import { formatDateVN } from '@/lib/format-vn';
import { enrichLoanRows } from '@/lib/loans/enrich';

import { POST as loginPOST } from '@/app/api/auth/login/route';
import { POST as logoutPOST } from '@/app/api/auth/logout/route';
import { GET as meGET } from '@/app/api/auth/me/route';
import { GET as listUsersGET, POST as createUserPOST } from '@/app/api/users/route';
import { PATCH as updateUserPATCH } from '@/app/api/users/[id]/route';
import { POST as resetPasswordPOST } from '@/app/api/users/[id]/reset-password/route';
import { GET as listLoansGET, POST as createLoanPOST } from '@/app/api/loans/route';
import { POST as returnLoanPOST } from '@/app/api/loans/[id]/return/route';
import { POST as cancelLoanPOST } from '@/app/api/loans/[id]/cancel/route';
import { GET as adminDashboardGET } from '@/app/api/dashboard/admin/route';
import { PATCH as patchSettingsPATCH } from '@/app/api/settings/route';
import { GET as auditLogsGET } from '@/app/api/audit-logs/route';

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

describe('Kiểm thử hồi quy QA Vòng 2 (HIGH-01..04, MEDIUM-01..13 & Phương án A Logout)', () => {
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
    vi.restoreAllMocks();
  });

  // =========================================================================
  // HIGH-01 & MEDIUM-10: Seed tự động & SEED_ADMIN_MUST_CHANGE_PASSWORD=true
  // =========================================================================
  describe('HIGH-01 & MEDIUM-10: seedDatabase theo biến môi trường', () => {
    it('bật mustChangePassword=1 khi SEED_ADMIN_MUST_CHANGE_PASSWORD=true và giữ tính idempotent', async () => {
      const prevEnv = {
        SEED_ADMIN_USERNAME: process.env.SEED_ADMIN_USERNAME,
        SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD,
        SEED_ADMIN_NAME: process.env.SEED_ADMIN_NAME,
        SEED_ADMIN_MUST_CHANGE_PASSWORD: process.env.SEED_ADMIN_MUST_CHANGE_PASSWORD,
      };

      const freshConn = await createDbConnection(':memory:');
      try {
        process.env.SEED_ADMIN_USERNAME = '  VanThu_Chinh  ';
        process.env.SEED_ADMIN_PASSWORD = 'InitStrong#2026';
        process.env.SEED_ADMIN_NAME = 'Cô Văn Thư Chính';
        process.env.SEED_ADMIN_MUST_CHANGE_PASSWORD = 'true';

        const first = await seedDatabase(freshConn.db);
        expect(first).toEqual({ adminCreated: true, adminUsername: 'vanthu_chinh' });

        const adminRow = (await freshConn.db
          .select()
          .from(users)
          .where(eq(users.role, 'ADMIN'))
          .limit(1)
          .get())!;
        expect(adminRow.username).toBe('vanthu_chinh');
        expect(adminRow.fullName).toBe('Cô Văn Thư Chính');
        expect(adminRow.mustChangePassword).toBe(1);
        expect(adminRow.isActive).toBe(1);
        expect(verifyPassword('InitStrong#2026', adminRow.passwordHash)).toBe(true);

        // Chạy seed lần 2 không ghi đè hoặc tạo thêm Admin
        process.env.SEED_ADMIN_USERNAME = 'admin_khac';
        process.env.SEED_ADMIN_MUST_CHANGE_PASSWORD = 'false';
        const second = await seedDatabase(freshConn.db);
        expect(second).toEqual({ adminCreated: false, adminUsername: 'vanthu_chinh' });

        const allAdmins = await freshConn.db.select().from(users).where(eq(users.role, 'ADMIN')).all();
        expect(allAdmins).toHaveLength(1);
        expect(allAdmins[0].mustChangePassword).toBe(1);
      } finally {
        freshConn.client.close();
        for (const [k, v] of Object.entries(prevEnv)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
      }
    });

    it('mặc định mustChangePassword=0 khi SEED_ADMIN_MUST_CHANGE_PASSWORD không bật', async () => {
      const prev = process.env.SEED_ADMIN_MUST_CHANGE_PASSWORD;
      const freshConn = await createDbConnection(':memory:');
      try {
        delete process.env.SEED_ADMIN_MUST_CHANGE_PASSWORD;
        await seedDatabase(freshConn.db);
        const adminRow = (await freshConn.db
          .select()
          .from(users)
          .where(eq(users.role, 'ADMIN'))
          .limit(1)
          .get())!;
        expect(adminRow.mustChangePassword).toBe(0);
      } finally {
        freshConn.client.close();
        if (prev === undefined) delete process.env.SEED_ADMIN_MUST_CHANGE_PASSWORD;
        else process.env.SEED_ADMIN_MUST_CHANGE_PASSWORD = prev;
      }
    });
  });

  // =========================================================================
  // HIGH-02 & MEDIUM-03: getClientIp, rate-limit tài khoản khóa & reset khi login OK
  // =========================================================================
  describe('HIGH-02 & MEDIUM-03: Rate-limit, TRUST_PROXY và chống spam/enumeration tài khoản khóa', () => {
    it('getClientIp chỉ đọc x-forwarded-for / x-real-ip khi TRUST_PROXY=true', () => {
      const prevTrust = process.env.TRUST_PROXY;
      try {
        process.env.TRUST_PROXY = 'false';
        const reqWithHeaders = new Request('http://localhost/api/auth/login', {
          headers: {
            'x-forwarded-for': '203.0.113.5, 10.0.0.1',
            'x-real-ip': '198.51.100.7',
          },
        });
        expect(getClientIp(reqWithHeaders)).toBe('direct');

        process.env.TRUST_PROXY = 'true';
        expect(getClientIp(reqWithHeaders)).toBe('203.0.113.5');

        const reqOnlyRealIp = new Request('http://localhost/api/auth/login', {
          headers: { 'x-real-ip': '198.51.100.7' },
        });
        expect(getClientIp(reqOnlyRealIp)).toBe('198.51.100.7');

        const reqNoIp = new Request('http://localhost/api/auth/login');
        expect(getClientIp(reqNoIp)).toBe('local');
      } finally {
        if (prevTrust === undefined) delete process.env.TRUST_PROXY;
        else process.env.TRUST_PROXY = prevTrust;
      }
    });

    it('MEDIUM-03: tài khoản bị khóa vẫn chịu rate-limit (429 ở lần thứ 6) khi nhập đúng mật khẩu liên tiếp', async () => {
      await updateUserPATCH(
        makeNextJsonReq(`http://localhost/api/users/${teacherAId}`, 'PATCH', { isActive: false }, adminCookie),
        { params: Promise.resolve({ id: String(teacherAId) }) }
      );

      for (let i = 0; i < 5; i++) {
        const res = await loginPOST(
          makeJsonReq('http://localhost/api/auth/login', 'POST', {
            username: 'gv_lan',
            password: 'LanPass123',
          })
        );
        expect(res.status).toBe(403);
        expect((await res.json()).error.code).toBe('ACCOUNT_LOCKED');
      }

      // Lần thứ 6 bị chặn 429 và không ghi thêm audit log
      const db = await getDb();
      const logsBefore = (await db.select().from(auditLogs).all()).length;
      const blocked = await loginPOST(
        makeJsonReq('http://localhost/api/auth/login', 'POST', {
          username: 'gv_lan',
          password: 'LanPass123',
        })
      );
      expect(blocked.status).toBe(429);
      expect((await blocked.json()).error.code).toBe('TOO_MANY_ATTEMPTS');
      const logsAfter = (await db.select().from(auditLogs).all()).length;
      expect(logsAfter).toBe(logsBefore);
    });

    it('đăng nhập thành công xóa bộ đếm thất bại để người dùng hợp lệ không bị cộng dồn lỗi cũ', async () => {
      for (let i = 0; i < 4; i++) {
        const fail = await loginPOST(
          makeJsonReq('http://localhost/api/auth/login', 'POST', {
            username: 'gv_lan',
            password: 'WrongPassword',
          })
        );
        expect(fail.status).toBe(401);
      }

      const ok = await loginPOST(
        makeJsonReq('http://localhost/api/auth/login', 'POST', {
          username: 'gv_lan',
          password: 'LanPass123',
        })
      );
      expect(ok.status).toBe(200);

      // Sai thêm 4 lần sau khi đã login thành công vẫn là 401 (bộ đếm đã được xóa sạch)
      for (let i = 0; i < 4; i++) {
        const failAgain = await loginPOST(
          makeJsonReq('http://localhost/api/auth/login', 'POST', {
            username: 'gv_lan',
            password: 'WrongPassword',
          })
        );
        expect(failAgain.status).toBe(401);
      }
    });
  });

  // =========================================================================
  // HIGH-03 & LOW-04: Nguyên tử /return vs /cancel đồng thời & kiểm tra ID chặt
  // =========================================================================
  describe('HIGH-03 & LOW-04: Trả/hủy phiếu đồng thời nguyên tử và chặn ID sai định dạng', () => {
    it('gọi đồng thời return và cancel trên cùng phiếu BORROWED: chỉ 1 thành công (200), 1 bị 409 và chỉ 1 audit log', async () => {
      const todayVN = getTodayVNDateString();
      const due7 = addCalendarDays(todayVN, 7);

      const created = (
        await (
          await createLoanPOST(
            makeJsonReq(
              'http://localhost/api/loans',
              'POST',
              { className: '3A', studentName: 'Trần Đồng Thời', schoolYear: '2025-2026', dueDate: due7 },
              teacherACookie
            )
          )
        ).json()
      ).data;

      const [retRes, cancelRes] = await Promise.all([
        returnLoanPOST(
          makeNextJsonReq(
            `http://localhost/api/loans/${created.id}/return`,
            'POST',
            { returnNote: 'Thu hồi' },
            adminCookie
          ),
          { params: Promise.resolve({ id: String(created.id) }) }
        ),
        cancelLoanPOST(
          makeNextJsonReq(
            `http://localhost/api/loans/${created.id}/cancel`,
            'POST',
            { reason: 'Hủy đồng thời' },
            adminCookie
          ),
          { params: Promise.resolve({ id: String(created.id) }) }
        ),
      ]);

      const statuses = [retRes.status, cancelRes.status].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 409]);

      const db = await getDb();
      const dbLoan = (await db.select().from(loanRecords).where(eq(loanRecords.id, created.id)).get())!;
      const closeLogs = (
        await db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.targetId, String(created.id)))
          .all()
      ).filter((l) => l.action === 'LOAN_RETURNED' || l.action === 'LOAN_CANCELLED');

      expect(closeLogs).toHaveLength(1);
      if (dbLoan.status === 'RETURNED') {
        expect(closeLogs[0].action).toBe('LOAN_RETURNED');
      } else {
        expect(dbLoan.status).toBe('CANCELLED');
        expect(closeLogs[0].action).toBe('LOAN_CANCELLED');
      }
    });

    it('trả 404 khi phiếu không tồn tại và 400 INVALID_ID khi tham số id có hậu tố/không hợp lệ', async () => {
      const notFoundReturn = await returnLoanPOST(
        makeNextJsonReq('http://localhost/api/loans/999999/return', 'POST', {}, adminCookie),
        { params: Promise.resolve({ id: '999999' }) }
      );
      expect(notFoundReturn.status).toBe(404);

      const notFoundCancel = await cancelLoanPOST(
        makeNextJsonReq(
          'http://localhost/api/loans/999999/cancel',
          'POST',
          { reason: 'Không tồn tại' },
          adminCookie
        ),
        { params: Promise.resolve({ id: '999999' }) }
      );
      expect(notFoundCancel.status).toBe(404);

      for (const badId of ['1abc', '0', '-3', 'abc']) {
        const r1 = await returnLoanPOST(
          makeNextJsonReq(`http://localhost/api/loans/${badId}/return`, 'POST', {}, adminCookie),
          { params: Promise.resolve({ id: badId }) }
        );
        expect(r1.status, `return id=${badId}`).toBe(400);
        expect((await r1.json()).error.code).toBe('INVALID_ID');

        const r2 = await cancelLoanPOST(
          makeNextJsonReq(
            `http://localhost/api/loans/${badId}/cancel`,
            'POST',
            { reason: 'Lý do hợp lệ' },
            adminCookie
          ),
          { params: Promise.resolve({ id: badId }) }
        );
        expect(r2.status, `cancel id=${badId}`).toBe(400);
        expect((await r2.json()).error.code).toBe('INVALID_ID');

        const r3 = await updateUserPATCH(
          makeNextJsonReq(`http://localhost/api/users/${badId}`, 'PATCH', { fullName: 'Tên Mới' }, adminCookie),
          { params: Promise.resolve({ id: badId }) }
        );
        expect(r3.status, `patch user id=${badId}`).toBe(400);
        expect((await r3.json()).error.code).toBe('INVALID_ID');

        const r4 = await resetPasswordPOST(
          makeNextJsonReq(
            `http://localhost/api/users/${badId}/reset-password`,
            'POST',
            { newPassword: 'NewPassword1' },
            adminCookie
          ),
          { params: Promise.resolve({ id: badId }) }
        );
        expect(r4.status, `reset-password id=${badId}`).toBe(400);
        expect((await r4.json()).error.code).toBe('INVALID_ID');
      }
    });
  });

  // =========================================================================
  // HIGH-04: Phân trang server status=HISTORY (>20 phiếu) & teacherSummary
  // =========================================================================
  describe('HIGH-04: Phân trang server status=HISTORY và meta.teacherSummary chính xác', () => {
    it('giáo viên có 23 phiếu lịch sử (RETURNED + CANCELLED) và 4 phiếu BORROWED: phân trang 20/trang không mất dữ liệu', async () => {
      const db = await getDb();
      const now = new Date().toISOString();
      const todayVN = getTodayVNDateString();

      const historyBatch = Array.from({ length: 23 }, (_, idx) => {
        const isReturned = idx < 15;
        return {
          teacherId: teacherAId,
          teacherNameSnapshot: 'Nguyễn Thị Lan',
          teacherPhoneSnapshot: '0901112222',
          teacherUnitSnapshot: '3A',
          className: '3A',
          studentName: `HS Lịch Sử ${idx + 1}`,
          schoolYear: '2025-2026',
          recordIdentityKey: `3a|hs lịch sử ${idx + 1}|2025-2026`,
          borrowedAt: new Date(Date.now() - (idx + 10) * 60_000).toISOString(),
          dueDate: addCalendarDays(todayVN, 5),
          status: (isReturned ? 'RETURNED' : 'CANCELLED') as 'RETURNED' | 'CANCELLED',
          returnedAt: isReturned ? now : null,
          returnedByAdminId: isReturned ? adminId : null,
          cancelReason: isReturned ? null : 'Nhập nhầm test',
          cancelledByAdminId: isReturned ? null : adminId,
          cancelledAt: isReturned ? null : now,
          createdAt: now,
          updatedAt: now,
        };
      });

      const activeBatch = [
        { name: 'Active Overdue', dueOffset: -3 },
        { name: 'Active Due Today', dueOffset: 0 },
        { name: 'Active Due Soon', dueOffset: 2 },
        { name: 'Active On Time', dueOffset: 10 },
      ].map((item, idx) => ({
        teacherId: teacherAId,
        teacherNameSnapshot: 'Nguyễn Thị Lan',
        teacherPhoneSnapshot: '0901112222',
        teacherUnitSnapshot: '3A',
        className: '3A',
        studentName: item.name,
        schoolYear: '2025-2026',
        recordIdentityKey: `3a|active_${idx}|2025-2026`,
        borrowedAt: now,
        dueDate: addCalendarDays(todayVN, item.dueOffset),
        status: 'BORROWED' as const,
        createdAt: now,
        updatedAt: now,
      }));

      // Thêm 1 phiếu của GV B để xác nhận không bị trộn
      await db.insert(loanRecords)
        .values([
          ...historyBatch,
          ...activeBatch,
          {
            teacherId: teacherBId,
            teacherNameSnapshot: 'Đặng Hoàng Ân',
            teacherPhoneSnapshot: '0909888777',
            teacherUnitSnapshot: 'Tổ 4-5',
            className: '4A',
            studentName: 'HS Lịch Sử Của GV B',
            schoolYear: '2025-2026',
            recordIdentityKey: '4a|hs lịch sử của gv b|2025-2026',
            borrowedAt: now,
            dueDate: addCalendarDays(todayVN, 5),
            status: 'RETURNED',
            returnedAt: now,
            returnedByAdminId: adminId,
            createdAt: now,
            updatedAt: now,
          },
        ])
        .run();

      const p1 = await (
        await listLoansGET(
          new Request('http://localhost/api/loans?status=HISTORY', {
            headers: { cookie: teacherACookie },
          })
        )
      ).json();
      expect(p1.data).toHaveLength(20);
      expect(p1.meta.total).toBe(23);
      expect(p1.meta.pageSize).toBe(20);
      expect(p1.meta.totalPages).toBe(2);
      expect(p1.meta.teacherSummary).toEqual({
        totalActive: 4,
        overdueCount: 1,
        dueSoonCount: 2,
      });
      for (const row of p1.data as Array<{ status: string; teacherId: number }>) {
        expect(['RETURNED', 'CANCELLED']).toContain(row.status);
        expect(row.teacherId).toBe(teacherAId);
      }

      const p2 = await (
        await listLoansGET(
          new Request('http://localhost/api/loans?status=HISTORY&page=2', {
            headers: { cookie: teacherACookie },
          })
        )
      ).json();
      expect(p2.data).toHaveLength(3);
      const p1Ids = new Set((p1.data as Array<{ id: number }>).map((r) => r.id));
      for (const row of p2.data as Array<{ id: number }>) {
        expect(p1Ids.has(row.id)).toBe(false);
      }

      // Admin gọi ?status=HISTORY không kèm teacherSummary và thấy cả GV A + GV B (24 phiếu)
      const adminHistory = await (
        await listLoansGET(
          new Request('http://localhost/api/loans?status=HISTORY', {
            headers: { cookie: adminCookie },
          })
        )
      ).json();
      expect(adminHistory.meta.total).toBe(24);
      expect('teacherSummary' in adminHistory.meta).toBe(false);
    });
  });

  // =========================================================================
  // MEDIUM-01, MEDIUM-09 & MEDIUM-11: vn_norm, escape %/_ trên /users, /loans, /audit-logs & actorId
  // =========================================================================
  describe('MEDIUM-01, MEDIUM-09 & MEDIUM-11: vn_norm, escape %/_, lọc teacherId/actorId và phân trang /api/users', () => {
    it('escape chính xác ký tự wildcard % và _ trên /api/users, /api/loans, /api/audit-logs và hỗ trợ lọc actorId/teacherId', async () => {
      const todayVN = getTodayVNDateString();
      const due7 = addCalendarDays(todayVN, 7);

      await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          { className: '3A', studentName: 'Nguyễn Minh Đức', schoolYear: '2025-2026', dueDate: due7 },
          teacherACookie
        )
      );
      await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          { className: '4B', studentName: 'Phạm Bảo Châu', schoolYear: '2024-2025', dueDate: due7 },
          teacherBCookie
        )
      );

      // 1. Admin lọc teacherId trên /api/loans
      const byTeacherB = await (
        await listLoansGET(
          new Request(`http://localhost/api/loans?teacherId=${teacherBId}`, {
            headers: { cookie: adminCookie },
          })
        )
      ).json();
      expect(byTeacherB.data).toHaveLength(1);
      expect(byTeacherB.data[0].studentName).toBe('Phạm Bảo Châu');

      // 2. Escape % và _ trên /api/loans (q, className, schoolYear)
      for (const query of ['q=%25', 'q=_', 'q=%5C', 'className=_', 'schoolYear=%25']) {
        const res = await (
          await listLoansGET(
            new Request(`http://localhost/api/loans?${query}`, {
              headers: { cookie: adminCookie },
            })
          )
        ).json();
        expect(res.data, `GET /api/loans?${query} không được khớp wildcard`).toHaveLength(0);
      }

      // 3. /api/users: vn_norm với NFD + escape % và _
      const nfdUser = await (
        await listUsersGET(
          new Request(`http://localhost/api/users?q=${encodeURIComponent('đặng'.normalize('NFD'))}`, {
            headers: { cookie: adminCookie },
          })
        )
      ).json();
      expect(nfdUser.data).toHaveLength(1);
      expect(nfdUser.data[0].username).toBe('gv_an');

      const usersPercent = await (
        await listUsersGET(
          new Request('http://localhost/api/users?q=%25', { headers: { cookie: adminCookie } })
        )
      ).json();
      expect(usersPercent.data).toHaveLength(0);

      // '_' chỉ khớp các user có dấu gạch dưới thật (gv_lan, gv_an), KHÔNG khớp 'admin'
      const usersUnderscore = await (
        await listUsersGET(
          new Request('http://localhost/api/users?q=_', { headers: { cookie: adminCookie } })
        )
      ).json();
      const matchedUsernames = (usersUnderscore.data as Array<{ username: string }>)
        .map((u) => u.username)
        .sort();
      expect(matchedUsernames).toEqual(['gv_an', 'gv_lan']);

      // 4. /api/audit-logs: lọc theo actorId + tìm tiếng Việt NFD + escape %/_
      const logsByTeacherB = await (
        await auditLogsGET(
          new Request(`http://localhost/api/audit-logs?actorId=${teacherBId}`, {
            headers: { cookie: adminCookie },
          })
        )
      ).json();
      expect(logsByTeacherB.data).toHaveLength(1);
      expect(logsByTeacherB.data[0].actorId).toBe(teacherBId);
      expect(logsByTeacherB.data[0].action).toBe('LOAN_CREATED');

      // actorId chứa ký tự không phải số bị bỏ qua an toàn (không lỗi 500)
      const logsBadActor = await auditLogsGET(
        new Request('http://localhost/api/audit-logs?actorId=1abc', {
          headers: { cookie: adminCookie },
        })
      );
      expect(logsBadActor.status).toBe(200);

      const logsNfd = await (
        await auditLogsGET(
          new Request(`http://localhost/api/audit-logs?q=${encodeURIComponent('đức'.normalize('NFD'))}`, {
            headers: { cookie: adminCookie },
          })
        )
      ).json();
      expect(logsNfd.data).toHaveLength(1);

      const logsPercent = await (
        await auditLogsGET(
          new Request('http://localhost/api/audit-logs?q=%25', {
            headers: { cookie: adminCookie },
          })
        )
      ).json();
      expect(logsPercent.data).toHaveLength(0);

      // Chỉ chứa ký tự '_' thật trong action (LOAN_CREATED) hoặc username (gv_lan, gv_an)
      const logsDoubleUnderscore = await (
        await auditLogsGET(
          new Request('http://localhost/api/audit-logs?q=__', {
            headers: { cookie: adminCookie },
          })
        )
      ).json();
      expect(logsDoubleUnderscore.data).toHaveLength(0);
    });

    it('MEDIUM-11: /api/users phân trang mặc định 20 tài khoản/trang khi danh sách vượt 20', async () => {
      const db = await getDb();
      const now = new Date().toISOString();
      const extraTeachers = Array.from({ length: 22 }, (_, i) => ({
        username: `gv_bulk_${i + 1}`,
        passwordHash: hashPassword('BulkPass123'),
        fullName: `Giáo Viên ${i + 1}`,
        role: 'TEACHER' as const,
        phone: `09000000${String(i + 10)}`,
        unit: '1A',
        isActive: 1,
        mustChangePassword: 0,
        createdAt: now,
        updatedAt: now,
      }));
      await db.insert(users).values(extraTeachers).run();

      // Tổng cộng: 1 admin + 2 gv mặc định + 22 gv mới = 25 tài khoản
      const page1 = await (
        await listUsersGET(new Request('http://localhost/api/users', { headers: { cookie: adminCookie } }))
      ).json();
      expect(page1.data).toHaveLength(20);
      expect(page1.meta.total).toBe(25);
      expect(page1.meta.pageSize).toBe(20);
      expect(page1.meta.totalPages).toBe(2);

      const page2 = await (
        await listUsersGET(
          new Request('http://localhost/api/users?page=2', { headers: { cookie: adminCookie } })
        )
      ).json();
      expect(page2.data).toHaveLength(5);
    });
  });

  // =========================================================================
  // MEDIUM-02: Payload 409 DUPLICATE_ACTIVE_LOAN tối thiểu & DD/MM/YYYY giờ VN
  // =========================================================================
  describe('MEDIUM-02: Payload 409 chống rò rỉ dữ liệu giáo viên khác và chuẩn DD/MM/YYYY theo giờ VN', () => {
    it('chỉ trả đúng 3 khóa { borrowedAt, dueDate, teacherNameSnapshot } và quy đổi ngày mượn sang giờ VN', async () => {
      const db = await getDb();
      const now = new Date().toISOString();
      const todayVN = getTodayVNDateString();
      const due7 = addCalendarDays(todayVN, 7);

      // 2026-11-20T18:00:00.000Z = 01:00 sáng ngày 21/11/2026 tại Việt Nam (UTC+7)
      await db.insert(loanRecords)
        .values({
          teacherId: teacherAId,
          teacherNameSnapshot: 'Nguyễn Thị Lan',
          teacherPhoneSnapshot: '0901112222',
          teacherUnitSnapshot: '3A',
          className: '3A',
          studentName: 'Hồ Gia Huy',
          schoolYear: '2025-2026',
          recordIdentityKey: '3a|hồ gia huy|2025-2026',
          borrowedAt: '2026-11-20T18:00:00.000Z',
          dueDate: due7,
          status: 'BORROWED',
          borrowNote: 'Ghi chú riêng tư tuyệt mật',
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const conflictRes = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '3A',
            studentName: 'Hồ Gia Huy',
            schoolYear: '2025-2026',
            dueDate: due7,
          },
          teacherBCookie
        )
      );

      expect(conflictRes.status).toBe(409);
      const body = await conflictRes.json();
      expect(body.error.code).toBe('DUPLICATE_ACTIVE_LOAN');
      expect(body.error.message).toContain('21/11/2026');
      expect(body.error.message).toContain(formatDateVN(due7));
      expect(body.error.message).not.toContain('0901112222');
      expect(body.error.message).not.toContain('Ghi chú riêng tư');

      expect(Object.keys(body.error.details.existingLoan).sort()).toEqual([
        'borrowedAt',
        'dueDate',
        'teacherNameSnapshot',
      ]);
    });
  });

  // =========================================================================
  // MEDIUM-04 & Phương án A Logout: parseCookieHeader & idempotent logout
  // =========================================================================
  describe('MEDIUM-04 & Phương án A Logout: parseCookieHeader chặt chẽ và logout idempotent', () => {
    it('parseCookieHeader chỉ chấp nhận đúng 64 ký tự hex và trả null an toàn cho mọi cookie sai định dạng', () => {
      const validHexLower = 'a'.repeat(64);
      const validHexMixed = '0123456789abcdefABCDEF'.repeat(2) + '0123456789abcdef0123';
      expect(validHexMixed).toHaveLength(64);

      expect(parseCookieHeader(`${SESSION_COOKIE_NAME}=${validHexLower}`, SESSION_COOKIE_NAME)).toBe(
        validHexLower
      );
      expect(
        parseCookieHeader(`foo=1; ${SESSION_COOKIE_NAME}=${validHexMixed}; bar=2`, SESSION_COOKIE_NAME)
      ).toBe(validHexMixed);
      expect(
        parseCookieHeader(
          `${SESSION_COOKIE_NAME}=${encodeURIComponent(validHexLower)}`,
          SESSION_COOKIE_NAME
        )
      ).toBe(validHexLower);

      // Các trường hợp không phải hex 64 ký tự hoặc lỗi percent-encoding -> null
      const invalidCookies = [
        null,
        '',
        `${SESSION_COOKIE_NAME}=`,
        `${SESSION_COOKIE_NAME}=${'a'.repeat(63)}`,
        `${SESSION_COOKIE_NAME}=${'a'.repeat(65)}`,
        `${SESSION_COOKIE_NAME}=${'g'.repeat(64)}`,
        `${SESSION_COOKIE_NAME}=not-a-hex-token`,
        `${SESSION_COOKIE_NAME}=%E0%A4%A`,
        `other_cookie=${validHexLower}`,
      ];
      for (const header of invalidCookies) {
        expect(parseCookieHeader(header, SESSION_COOKIE_NAME), `cookie="${header}"`).toBeNull();
      }
    });

    it('GET /api/auth/me từ chối 401 với cookie không phải hex 64 ký tự; POST /api/auth/logout idempotent không ghi rác audit', async () => {
      const badTokenMe = await meGET(
        new Request('http://localhost/api/auth/me', {
          headers: { cookie: `${SESSION_COOKIE_NAME}=short_non_hex_token_123` },
        })
      );
      expect(badTokenMe.status).toBe(401);

      // Logout khi chưa đăng nhập hoặc cookie sai định dạng / không tồn tại -> 200, xóa cookie, không tạo audit LOGOUT
      const noCookieLogout = await logoutPOST(
        new Request('http://localhost/api/auth/logout', { method: 'POST' })
      );
      expect(noCookieLogout.status).toBe(200);
      expect(noCookieLogout.headers.get('set-cookie')).toContain('Max-Age=0');

      const badEncodingLogout = await logoutPOST(
        new Request('http://localhost/api/auth/logout', {
          method: 'POST',
          headers: { cookie: `${SESSION_COOKIE_NAME}=%E0%A4%A` },
        })
      );
      expect(badEncodingLogout.status).toBe(200);
      expect(badEncodingLogout.headers.get('set-cookie')).toContain('Max-Age=0');

      const unknownHexLogout = await logoutPOST(
        new Request('http://localhost/api/auth/logout', {
          method: 'POST',
          headers: { cookie: `${SESSION_COOKIE_NAME}=${'f'.repeat(64)}` },
        })
      );
      expect(unknownHexLogout.status).toBe(200);

      const db = await getDb();
      const logoutLogsBefore = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, 'LOGOUT'))
        .all();
      expect(logoutLogsBefore).toHaveLength(0);

      // Đã đăng nhập -> gọi logout 2 lần liên tiếp với cùng cookie: chỉ ghi 1 log LOGOUT và cả 2 lần đều trả 200
      const firstLogout = await logoutPOST(
        new Request('http://localhost/api/auth/logout', {
          method: 'POST',
          headers: { cookie: teacherACookie },
        })
      );
      expect(firstLogout.status).toBe(200);

      const secondLogout = await logoutPOST(
        new Request('http://localhost/api/auth/logout', {
          method: 'POST',
          headers: { cookie: teacherACookie },
        })
      );
      expect(secondLogout.status).toBe(200);

      const logoutLogsAfter = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, 'LOGOUT'))
        .all();
      expect(logoutLogsAfter).toHaveLength(1);
      expect(logoutLogsAfter[0].actorId).toBe(teacherAId);
    });
  });

  // =========================================================================
  // MEDIUM-05 & MEDIUM-06: Audit PATCH /api/settings + enrichLoanRows cancelledByAdminName
  // =========================================================================
  describe('MEDIUM-05 & MEDIUM-06: Audit diff SETTINGS_UPDATED/USER_STATUS_CHANGED và enrichLoanRows', () => {
    it('PATCH /api/settings ghi audit SETTINGS_UPDATED với đầy đủ before/after trong cùng transaction', async () => {
      const p1 = await patchSettingsPATCH(
        makeJsonReq(
          'http://localhost/api/settings',
          'PATCH',
          { defaultLoanDays: 12, maxLoanDays: 20 },
          adminCookie
        )
      );
      expect(p1.status).toBe(200);

      const p2 = await patchSettingsPATCH(
        makeJsonReq(
          'http://localhost/api/settings',
          'PATCH',
          { defaultLoanDays: 5, maxLoanDays: 15 },
          adminCookie
        )
      );
      expect(p2.status).toBe(200);

      const settingAuditRes = await (
        await auditLogsGET(
          new Request('http://localhost/api/audit-logs?action=SETTINGS_UPDATED', {
            headers: { cookie: adminCookie },
          })
        )
      ).json();
      expect(settingAuditRes.data).toHaveLength(2);

      // Mới nhất trước
      const latestMeta = JSON.parse(settingAuditRes.data[0].metadataJson);
      expect(latestMeta).toEqual({
        before: { defaultLoanDays: 12, maxLoanDays: 20 },
        after: { defaultLoanDays: 5, maxLoanDays: 15 },
      });

      const firstMeta = JSON.parse(settingAuditRes.data[1].metadataJson);
      expect(firstMeta).toEqual({
        before: { defaultLoanDays: 7, maxLoanDays: 30 },
        after: { defaultLoanDays: 12, maxLoanDays: 20 },
      });
    });

    it('MEDIUM-06: giữ nguyên cancelledByAdminName sau khi Admin hủy phiếu bị đổi vai trò sang TEACHER', async () => {
      expect(await enrichLoanRows([], getTodayVNDateString())).toEqual([]);

      const todayVN = getTodayVNDateString();
      const due7 = addCalendarDays(todayVN, 7);

      const loan = (
        await (
          await createLoanPOST(
            makeJsonReq(
              'http://localhost/api/loans',
              'POST',
              { className: '5C', studentName: 'Đỗ Nhật Minh', schoolYear: '2025-2026', dueDate: due7 },
              teacherACookie
            )
          )
        ).json()
      ).data;

      const subAdmin = (
        await (
          await createUserPOST(
            makeJsonReq(
              'http://localhost/api/users',
              'POST',
              {
                username: 'admin_huy',
                fullName: 'Thầy Văn Thư Hủy',
                role: 'ADMIN',
                password: 'SubAdminPassword1',
              },
              adminCookie
            )
          )
        ).json()
      ).data;
      const subAdminCookie = `${SESSION_COOKIE_NAME}=${(await createSession(subAdmin.id)).rawToken}`;

      const cancelRes = await cancelLoanPOST(
        makeNextJsonReq(
          `http://localhost/api/loans/${loan.id}/cancel`,
          'POST',
          { reason: 'Kiểm chứng enrich cancelledByAdminName' },
          subAdminCookie
        ),
        { params: Promise.resolve({ id: String(loan.id) }) }
      );
      expect(cancelRes.status).toBe(200);

      // Đổi vai trò subAdmin từ ADMIN sang TEACHER
      const demoteRes = await updateUserPATCH(
        makeNextJsonReq(`http://localhost/api/users/${subAdmin.id}`, 'PATCH', { role: 'TEACHER' }, adminCookie),
        { params: Promise.resolve({ id: String(subAdmin.id) }) }
      );
      expect(demoteRes.status).toBe(200);

      const listAfter = await (
        await listLoansGET(new Request('http://localhost/api/loans', { headers: { cookie: adminCookie } }))
      ).json();
      expect(listAfter.data[0].cancelledByAdminName).toBe('Thầy Văn Thư Hủy');
    });
  });

  // =========================================================================
  // MEDIUM-07 & MEDIUM-13: isSqliteUniqueError (nested cause) & withApiErrorHandling trả 500 JSON chuẩn
  // =========================================================================
  describe('MEDIUM-07 & MEDIUM-13: isSqliteUniqueError và withApiErrorHandling trả 500 JSON chuẩn', () => {
    it('MEDIUM-07: nhận diện lỗi UNIQUE lồng trong cause (depth <= 3) và không nhầm với FK/CHECK/NOTNULL', () => {
      expect(isSqliteUniqueError(null)).toBe(false);
      expect(isSqliteUniqueError(undefined)).toBe(false);
      expect(isSqliteUniqueError('SQLITE_CONSTRAINT_UNIQUE')).toBe(false);
      expect(isSqliteUniqueError({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' })).toBe(false);
      expect(isSqliteUniqueError({ code: 'SQLITE_CONSTRAINT_NOTNULL' })).toBe(false);
      expect(isSqliteUniqueError({ code: 'SQLITE_CONSTRAINT', message: 'FOREIGN KEY constraint failed' })).toBe(
        false
      );

      expect(isSqliteUniqueError({ message: 'UNIQUE constraint failed: users.username' })).toBe(true);
      expect(
        isSqliteUniqueError({
          cause: { cause: { cause: { code: 'SQLITE_CONSTRAINT_UNIQUE' } } },
        })
      ).toBe(true);
      // Vượt quá depth 3 -> dừng đệ quy, trả false
      expect(
        isSqliteUniqueError({
          cause: { cause: { cause: { cause: { code: 'SQLITE_CONSTRAINT_UNIQUE' } } } },
        })
      ).toBe(false);
    });

    it('MEDIUM-13: withApiErrorHandling bắt lỗi bất ngờ và trả 500 JSON chuẩn không lộ chi tiết nội bộ', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const okHandler = withApiErrorHandling(async () => new Response('ok', { status: 200 }));
      const okRes = await okHandler();
      expect(okRes.status).toBe(200);

      const failingHandler = withApiErrorHandling(async () => {
        throw new Error('SECRET_INTERNAL_SQL_STACK_DETAILS');
      });
      const errRes = await failingHandler();
      expect(errRes.status).toBe(500);
      expect(errRes.headers.get('content-type')).toContain('application/json');

      const errBody = await errRes.json();
      expect(errBody).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
        },
      });
      expect(JSON.stringify(errBody)).not.toContain('SECRET_INTERNAL_SQL_STACK_DETAILS');
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });

    it('MEDIUM-13: route handler thật (/api/dashboard/admin) trả 500 JSON chuẩn khi tầng DB phát sinh lỗi bất ngờ', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});

      // Tạo một kết nối :memory: và đóng client để giả lập lỗi runtime DB mà không đụng ./data/app.db
      const brokenConn = await createDbConnection(':memory:');
      setDbForTests(brokenConn);
      brokenConn.client.close();

      const res = await adminDashboardGET(
        new Request('http://localhost/api/dashboard/admin', {
          headers: { cookie: adminCookie },
        })
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBeTruthy();
    });
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDbConnection, resetDbForTests, setDbForTests } from '@/db';
import { seedDatabase } from '@/db/seed';
import { loanRecords, users } from '@/db/schema';
import { hashPassword } from '@/lib/auth/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { writeAuditLog } from '@/lib/audit/logger';
import { addCalendarDays, getTodayVNDateString } from '@/lib/domain/overdue';
import { GET as adminDashboardGET } from './admin/route';
import { GET as auditLogsGET } from '../audit-logs/route';

describe('API Dashboard Admin & Audit Logs (T09)', () => {
  let adminCookie = '';
  let teacherCookie = '';

  beforeEach(async () => {
    const conn = await createDbConnection(':memory:');
    setDbForTests(conn);
    await seedDatabase(conn.db);
    const now = new Date().toISOString();

    const admin = (await conn.db.select().from(users).limit(1).get())!;
    adminCookie = `${SESSION_COOKIE_NAME}=${(await createSession(admin.id)).rawToken}`;

    const teacher = await conn.db
      .insert(users)
      .values({
        username: 'gv_cuc',
        passwordHash: hashPassword('Cuc12345'),
        fullName: 'Hoàng Thị Cúc',
        role: 'TEACHER',
        phone: '0903334445',
        unit: '5A',
        isActive: 1,
        mustChangePassword: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    teacherCookie = `${SESSION_COOKIE_NAME}=${(await createSession(teacher.id)).rawToken}`;

    const todayVN = getTodayVNDateString();

    await conn.db
      .insert(loanRecords)
      .values([
        {
          teacherId: teacher.id,
          teacherNameSnapshot: teacher.fullName,
          teacherPhoneSnapshot: teacher.phone,
          teacherUnitSnapshot: teacher.unit,
          className: '5A',
          studentName: 'HS Nghiêm Trọng',
          schoolYear: '2025-2026',
          recordIdentityKey: '5a|hs nghiêm trọng|2025-2026',
          borrowedAt: '2026-11-01T02:00:00.000Z',
          dueDate: addCalendarDays(todayVN, -9), // CRITICAL
          status: 'BORROWED',
          createdAt: now,
          updatedAt: now,
        },
        {
          teacherId: teacher.id,
          teacherNameSnapshot: teacher.fullName,
          teacherPhoneSnapshot: teacher.phone,
          teacherUnitSnapshot: teacher.unit,
          className: '5A',
          studentName: 'HS Vừa',
          schoolYear: '2025-2026',
          recordIdentityKey: '5a|hs vừa|2025-2026',
          borrowedAt: '2026-11-10T02:00:00.000Z',
          dueDate: addCalendarDays(todayVN, -5), // MODERATE
          status: 'BORROWED',
          createdAt: now,
          updatedAt: now,
        },
        {
          teacherId: teacher.id,
          teacherNameSnapshot: teacher.fullName,
          teacherPhoneSnapshot: teacher.phone,
          teacherUnitSnapshot: teacher.unit,
          className: '5A',
          studentName: 'HS Nhẹ',
          schoolYear: '2025-2026',
          recordIdentityKey: '5a|hs nhẹ|2025-2026',
          borrowedAt: '2026-11-18T02:00:00.000Z',
          dueDate: addCalendarDays(todayVN, -1), // MILD
          status: 'BORROWED',
          createdAt: now,
          updatedAt: now,
        },
        {
          teacherId: teacher.id,
          teacherNameSnapshot: teacher.fullName,
          teacherPhoneSnapshot: teacher.phone,
          teacherUnitSnapshot: teacher.unit,
          className: '5A',
          studentName: 'HS Hôm Nay',
          schoolYear: '2025-2026',
          recordIdentityKey: '5a|hs hôm nay|2025-2026',
          borrowedAt: '2026-11-19T02:00:00.000Z',
          dueDate: todayVN, // DUE_TODAY -> KHÔNG vào Danh sách đỏ
          status: 'BORROWED',
          createdAt: now,
          updatedAt: now,
        },
        {
          teacherId: teacher.id,
          teacherNameSnapshot: teacher.fullName,
          teacherPhoneSnapshot: teacher.phone,
          teacherUnitSnapshot: teacher.unit,
          className: '5A',
          studentName: 'HS Sắp Hạn',
          schoolYear: '2025-2026',
          recordIdentityKey: '5a|hs sắp hạn|2025-2026',
          borrowedAt: '2026-11-20T02:00:00.000Z',
          dueDate: addCalendarDays(todayVN, 2), // DUE_SOON
          status: 'BORROWED',
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    await writeAuditLog({
      actorId: admin.id,
      action: 'LOGIN_SUCCESS',
      targetType: 'AUTH',
      targetId: admin.id,
      metadata: { note: 'test' },
    });
  });

  afterEach(() => {
    resetDbForTests();
  });

  it('trả về chính xác KPI, Danh sách đỏ, phân nhóm độ lố hạn và Audit logs cho Admin', async () => {
    // Giáo viên bị chặn 403
    expect(
      (
        await adminDashboardGET(
          new Request('http://localhost/api/dashboard/admin', {
            headers: { cookie: teacherCookie },
          })
        )
      ).status
    ).toBe(403);

    expect(
      (
        await auditLogsGET(
          new Request('http://localhost/api/audit-logs', {
            headers: { cookie: teacherCookie },
          })
        )
      ).status
    ).toBe(403);

    const res = await adminDashboardGET(
      new Request('http://localhost/api/dashboard/admin', {
        headers: { cookie: adminCookie },
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;

    expect(body.kpi.totalBorrowed).toBe(5);
    expect(body.kpi.overdueCount).toBe(3); // Chỉ >= 1 ngày trễ mới vào Danh sách đỏ
    expect(body.kpi.dueSoonOrTodayCount).toBe(2);

    expect(body.redList.map((r: { studentName: string }) => r.studentName)).toEqual([
      'HS Nghiêm Trọng',
      'HS Vừa',
      'HS Nhẹ',
    ]);
    expect(body.attentionSummary).toEqual({
      critical: 1,
      moderate: 1,
      mild: 1,
      dueToday: 1,
      dueSoon: 1,
    });

    const auditRes = await auditLogsGET(
      new Request('http://localhost/api/audit-logs', {
        headers: { cookie: adminCookie },
      })
    );
    expect(auditRes.status).toBe(200);
    const auditBody = await auditRes.json();
    expect(auditBody.data).toHaveLength(1);
    expect(auditBody.data[0].action).toBe('LOGIN_SUCCESS');
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { createDbConnection, resetDbForTests, setDbForTests } from '@/db';
import { seedDatabase } from '@/db/seed';
import { users } from '@/db/schema';
import { hashPassword } from '@/lib/auth/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { addCalendarDays, getTodayVNDateString } from '@/lib/domain/overdue';
import { GET as listLoansGET, POST as createLoanPOST } from './route';
import { POST as returnLoanPOST } from './[id]/return/route';
import { POST as cancelLoanPOST } from './[id]/cancel/route';

describe('API Phiếu mượn – trả – hủy (/api/loans*) (T08)', () => {
  let adminCookie = '';
  let teacherACookie = '';
  let teacherBCookie = '';
  let teacherAId = 0;

  beforeEach(async () => {
    const conn = await createDbConnection(':memory:');
    setDbForTests(conn);
    await seedDatabase(conn.db);
    const now = new Date().toISOString();

    const admin = (await conn.db.select().from(users).limit(1).get())!;
    adminCookie = `${SESSION_COOKIE_NAME}=${(await createSession(admin.id)).rawToken}`;

    const tA = await conn.db
      .insert(users)
      .values({
        username: 'gv_a',
        passwordHash: hashPassword('Pass1234'),
        fullName: 'Nguyễn Thị A',
        role: 'TEACHER',
        phone: '0901111111',
        unit: '3A',
        isActive: 1,
        mustChangePassword: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    teacherAId = tA.id;
    teacherACookie = `${SESSION_COOKIE_NAME}=${(await createSession(tA.id)).rawToken}`;

    const tB = await conn.db
      .insert(users)
      .values({
        username: 'gv_b',
        passwordHash: hashPassword('Pass1234'),
        fullName: 'Trần Văn B',
        role: 'TEACHER',
        phone: '0902222222',
        unit: '4A',
        isActive: 1,
        mustChangePassword: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    teacherBCookie = `${SESSION_COOKIE_NAME}=${(await createSession(tB.id)).rawToken}`;
  });

  afterEach(() => {
    resetDbForTests();
  });

  it('thực thi trọn vẹn luồng mượn, chống trùng, cô lập giáo viên, chặn mượn hộ và Admin xác nhận trả', async () => {
    const todayVN = getTodayVNDateString();
    const due7 = addCalendarDays(todayVN, 7);

    // 1. Admin không được tạo phiếu mượn hộ (403)
    const adminBorrowAttempt = await createLoanPOST(
      new Request('http://localhost/api/loans', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: JSON.stringify({
          className: '3A',
          studentName: 'Nguyễn Văn An',
          schoolYear: '2025-2026',
          dueDate: due7,
          teacherId: teacherAId,
        }),
      })
    );
    expect(adminBorrowAttempt.status).toBe(403);

    // 2. Sai định dạng niên khóa -> 400
    const badYearRes = await createLoanPOST(
      new Request('http://localhost/api/loans', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: teacherACookie },
        body: JSON.stringify({
          className: '3A',
          studentName: 'Nguyễn Văn An',
          schoolYear: '25-26',
          dueDate: due7,
        }),
      })
    );
    expect(badYearRes.status).toBe(400);

    // 3. Vượt quá 30 ngày -> 400
    const tooFarDue = await createLoanPOST(
      new Request('http://localhost/api/loans', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: teacherACookie },
        body: JSON.stringify({
          className: '3A',
          studentName: 'Nguyễn Văn An',
          schoolYear: '2025-2026',
          dueDate: addCalendarDays(todayVN, 35),
        }),
      })
    );
    expect(tooFarDue.status).toBe(400);

    // 4. Giáo viên A mượn thành công (kể cả truyền thừa teacherId giả mạo -> phải lưu của A)
    const borrowOk = await createLoanPOST(
      new Request('http://localhost/api/loans', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: teacherACookie },
        body: JSON.stringify({
          className: ' 3A ',
          studentName: 'Nguyễn   Văn An',
          schoolYear: '2025 - 2026',
          dueDate: due7,
          borrowNote: 'Bổ sung nhận xét',
          teacherId: 999,
        }),
      })
    );
    expect(borrowOk.status).toBe(201);
    const createdLoan = (await borrowOk.json()).data;
    expect(createdLoan.teacherId).toBe(teacherAId);
    expect(createdLoan.schoolYear).toBe('2025-2026');
    expect(createdLoan.teacherNameSnapshot).toBe('Nguyễn Thị A');

    // 5. Giáo viên B mượn trùng học bạ (viết thường & thừa khoảng trắng) -> 409
    const duplicateBorrow = await createLoanPOST(
      new Request('http://localhost/api/loans', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: teacherBCookie },
        body: JSON.stringify({
          className: '3a',
          studentName: 'nguyễn văn an',
          schoolYear: '2025-2026',
          dueDate: due7,
        }),
      })
    );
    expect(duplicateBorrow.status).toBe(409);

    // 6. Cô lập dữ liệu: Giáo viên B xem danh sách -> không thấy phiếu của A
    const listB = await listLoansGET(
      new Request('http://localhost/api/loans', { headers: { cookie: teacherBCookie } })
    );
    expect((await listB.json()).data).toHaveLength(0);

    // 7. Giáo viên A tự gọi xác nhận trả -> 403
    const teacherReturnAttempt = await returnLoanPOST(
      new NextRequest(`http://localhost/api/loans/${createdLoan.id}/return`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: teacherACookie },
        body: JSON.stringify({ returnNote: 'Tự trả' }),
      }),
      { params: Promise.resolve({ id: String(createdLoan.id) }) }
    );
    expect(teacherReturnAttempt.status).toBe(403);

    // 8. Admin xác nhận trả thành công -> 200
    const adminReturn = await returnLoanPOST(
      new NextRequest(`http://localhost/api/loans/${createdLoan.id}/return`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: JSON.stringify({ returnNote: 'Đủ bìa nguyên vẹn' }),
      }),
      { params: Promise.resolve({ id: String(createdLoan.id) }) }
    );
    expect(adminReturn.status).toBe(200);
    expect((await adminReturn.json()).data.status).toBe('RETURNED');

    // 9. Sau khi trả, Giáo viên B mượn lại học bạ đó thành công (và test hủy phiếu)
    const reBorrow = await createLoanPOST(
      new Request('http://localhost/api/loans', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: teacherBCookie },
        body: JSON.stringify({
          className: '3A',
          studentName: 'Nguyễn Văn An',
          schoolYear: '2025-2026',
          dueDate: due7,
        }),
      })
    );
    expect(reBorrow.status).toBe(201);
    const loan2 = (await reBorrow.json()).data;

    const cancelRes = await cancelLoanPOST(
      new NextRequest(`http://localhost/api/loans/${loan2.id}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: JSON.stringify({ reason: 'Giáo viên nhập nhầm niên khóa' }),
      }),
      { params: Promise.resolve({ id: String(loan2.id) }) }
    );
    expect(cancelRes.status).toBe(200);
    expect((await cancelRes.json()).data.status).toBe('CANCELLED');
  });
});

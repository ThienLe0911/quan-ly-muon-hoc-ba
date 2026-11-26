import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { and, desc, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDbConnection, getDb, resetDbForTests, setDbForTests } from '@/db';
import { runMigrations } from '@/db/migrate';
import { MIGRATIONS } from '@/db/migrations/registry';
import * as schema from '@/db/schema';
import { auditLogs, loanRecords, users } from '@/db/schema';
import { seedDatabase } from '@/db/seed';
import { hashPassword } from '@/lib/auth/password';
import { resetRateLimiterForTests } from '@/lib/auth/rate-limit';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { addCalendarDays, getTodayVNDateString } from '@/lib/domain/overdue';
import { WHOLE_CLASS_STUDENT_LABEL } from '@/lib/domain/record-identity';
import { buildClassNameNorm, buildLoanSearchText, buildUserSearchText } from '@/lib/domain/search';
import { getEnv } from '@/lib/env';

import { POST as loginPOST } from '@/app/api/auth/login/route';
import { GET as listLoansGET, POST as createLoanPOST } from '@/app/api/loans/route';
import { POST as returnLoanPOST } from '@/app/api/loans/[id]/return/route';
import { POST as cancelLoanPOST } from '@/app/api/loans/[id]/cancel/route';
import { GET as adminDashboardGET } from '@/app/api/dashboard/admin/route';
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

function expectNoInternalLoanColumns(obj: Record<string, unknown>) {
  expect(obj).not.toHaveProperty('classYearKey');
  expect(obj).not.toHaveProperty('class_year_key');
  expect(obj).not.toHaveProperty('searchText');
  expect(obj).not.toHaveProperty('search_text');
  expect(obj).not.toHaveProperty('classNameNorm');
  expect(obj).not.toHaveProperty('class_name_norm');
}

function expectSafeConflictExistingLoan(
  existingLoan: Record<string, unknown>,
  expectedTeacherName: string
) {
  expect(Object.keys(existingLoan).sort()).toEqual([
    'borrowedAt',
    'dueDate',
    'teacherNameSnapshot',
  ]);
  expect(existingLoan.teacherNameSnapshot).toBe(expectedTeacherName);
  expect(existingLoan).not.toHaveProperty('teacherPhoneSnapshot');
  expect(existingLoan).not.toHaveProperty('borrowNote');
  expect(existingLoan).not.toHaveProperty('teacherUnitSnapshot');
  expect(existingLoan).not.toHaveProperty('teacherId');
}

describe('Kiểm thử hồi quy QA Vòng 4 — Wave 7: Loại mượn Cả lớp/Riêng lẻ, Chặn trùng chéo 2 chiều, Migration 0002 & Thuật ngữ Giáo vụ (ADR-005 / AC-15)', () => {
  let adminId = 0;
  let adminCookie = '';
  let teacherAId = 0;
  let teacherACookie = '';
  let teacherBId = 0;
  let teacherBCookie = '';
  const tempFilesToCleanup: string[] = [];

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
        username: 'gvlan',
        passwordHash: hashPassword('LanPass123'),
        fullName: 'Nguyễn Thị Lan',
        role: 'TEACHER',
        phone: '0901112233',
        unit: 'Khối 3',
        isActive: 1,
        mustChangePassword: 0,
        searchText: buildUserSearchText({
          username: 'gvlan',
          fullName: 'Nguyễn Thị Lan',
          phone: '0901112233',
          unit: 'Khối 3',
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
        username: 'gvminh',
        passwordHash: hashPassword('MinhPass123'),
        fullName: 'Trần Quang Minh',
        role: 'TEACHER',
        phone: '0909445566',
        unit: 'Khối 4-5',
        isActive: 1,
        mustChangePassword: 0,
        searchText: buildUserSearchText({
          username: 'gvminh',
          fullName: 'Trần Quang Minh',
          phone: '0909445566',
          unit: 'Khối 4-5',
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

    while (tempFilesToCleanup.length > 0) {
      const filePath = tempFilesToCleanup.pop()!;
      for (const suffix of ['', '-wal', '-shm']) {
        try {
          fs.rmSync(`${filePath}${suffix}`, { force: true });
        } catch {
          // Bỏ qua nếu file tạm không còn tồn tại
        }
      }
    }
  });

  // =========================================================================
  // 1. Tương thích ngược & ép chuẩn hóa payload
  // =========================================================================
  describe('1. Tương thích ngược & ép chuẩn hóa payload trên POST /api/loans', () => {
    it('không truyền loanType -> mặc định INDIVIDUAL, quantity = null', async () => {
      const dueDate = addCalendarDays(getTodayVNDateString(), 7);
      const res = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '2A',
            studentName: 'Lê Minh Khang',
            schoolYear: '2025-2026',
            dueDate,
          },
          teacherACookie
        )
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.loanType).toBe('INDIVIDUAL');
      expect(body.data.quantity).toBeNull();
      expect(body.data.studentName).toBe('Lê Minh Khang');
      expectNoInternalLoanColumns(body.data);

      const db = await getDb();
      const saved = await db
        .select()
        .from(loanRecords)
        .where(eq(loanRecords.id, body.data.id))
        .get();
      expect(saved?.loanType).toBe('INDIVIDUAL');
      expect(saved?.quantity).toBeNull();
    });

    it('INDIVIDUAL gửi kèm quantity: 10 -> bắt buộc ép lưu quantity = null (không lưu rác)', async () => {
      const dueDate = addCalendarDays(getTodayVNDateString(), 7);
      const res = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'INDIVIDUAL',
            className: '2B',
            studentName: 'Phạm Gia Hân',
            schoolYear: '2025-2026',
            quantity: 10,
            dueDate,
          },
          teacherACookie
        )
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.loanType).toBe('INDIVIDUAL');
      expect(body.data.quantity).toBeNull();

      const db = await getDb();
      const saved = await db
        .select()
        .from(loanRecords)
        .where(eq(loanRecords.id, body.data.id))
        .get();
      expect(saved?.quantity).toBeNull();
    });

    it('WHOLE_CLASS gửi kèm studentName giả mạo -> bỏ qua và ép lưu chuẩn "Toàn bộ lớp"', async () => {
      const dueDate = addCalendarDays(getTodayVNDateString(), 7);
      const res = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'WHOLE_CLASS',
            className: '3A',
            studentName: 'Tên giả mạo',
            schoolYear: '2025-2026',
            quantity: 32,
            dueDate,
            teacherId: teacherBId, // Gửi giả mạo teacherId cũng phải bị bỏ qua
          },
          teacherACookie
        )
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.loanType).toBe('WHOLE_CLASS');
      expect(body.data.studentName).toBe(WHOLE_CLASS_STUDENT_LABEL);
      expect(body.data.studentName).toBe('Toàn bộ lớp');
      expect(body.data.quantity).toBe(32);
      expect(body.data.teacherId).toBe(teacherAId);
      expectNoInternalLoanColumns(body.data);

      const db = await getDb();
      const saved = await db
        .select()
        .from(loanRecords)
        .where(eq(loanRecords.id, body.data.id))
        .get();
      expect(saved?.studentName).toBe('Toàn bộ lớp');
      expect(saved?.recordIdentityKey).toBe('class:3a|2025-2026');
      expect(saved?.classYearKey).toBe('3a|2025-2026');
    });

    it('WHOLE_CLASS chấp nhận biên hợp lệ quantity = 1, 200, null, undefined (201) và từ chối 0, -1, 201, 10.5, "35" (400)', async () => {
      const dueDate = addCalendarDays(getTodayVNDateString(), 7);

      const validCases: Array<{
        className: string;
        payloadExtra: Record<string, unknown>;
        expectedQuantity: number | null;
      }> = [
        { className: '1A', payloadExtra: { quantity: 1 }, expectedQuantity: 1 },
        { className: '1B', payloadExtra: { quantity: 200 }, expectedQuantity: 200 },
        { className: '1C', payloadExtra: { quantity: null }, expectedQuantity: null },
        { className: '1D', payloadExtra: {}, expectedQuantity: null }, // quantity: undefined
      ];

      for (const tc of validCases) {
        const res = await createLoanPOST(
          makeJsonReq(
            'http://localhost/api/loans',
            'POST',
            {
              loanType: 'WHOLE_CLASS',
              className: tc.className,
              schoolYear: '2025-2026',
              dueDate,
              ...tc.payloadExtra,
            },
            teacherACookie
          )
        );
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.data.loanType).toBe('WHOLE_CLASS');
        expect(body.data.studentName).toBe('Toàn bộ lớp');
        expect(body.data.quantity).toBe(tc.expectedQuantity);
      }

      const invalidQuantities: unknown[] = [0, -1, 201, 10.5, '35'];
      for (const badQty of invalidQuantities) {
        const res = await createLoanPOST(
          makeJsonReq(
            'http://localhost/api/loans',
            'POST',
            {
              loanType: 'WHOLE_CLASS',
              className: '1E',
              schoolYear: '2025-2026',
              quantity: badQty,
              dueDate,
            },
            teacherACookie
          )
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('BR-11: ADMIN gọi POST /api/loans với loanType: WHOLE_CLASS vẫn bị chặn 403', async () => {
      const dueDate = addCalendarDays(getTodayVNDateString(), 7);
      const res = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'WHOLE_CLASS',
            className: '3C',
            schoolYear: '2025-2026',
            quantity: 35,
            dueDate,
            teacherId: teacherAId,
          },
          adminCookie
        )
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // 2. Chặn trùng chéo 2 chiều & chuẩn hóa Unicode/khoảng trắng + Concurrency
  // =========================================================================
  describe('2. Chặn trùng chéo 2 chiều, chuẩn hóa Unicode/khoảng trắng & Concurrency mạnh', () => {
    it('WHOLE_CLASS (" 3Đ ", "2025 – 2026" en-dash) chặn INDIVIDUAL ("3đ" NFD, "2025-2026") trả 409, existingLoan đúng 3 khóa không lộ SĐT/ghi chú', async () => {
      const dueDate = addCalendarDays(getTodayVNDateString(), 7);

      // Giáo viên A mượn cả lớp " 3Đ " với en-dash và có ghi chú nhạy cảm
      const wholeClassRes = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'WHOLE_CLASS',
            className: '  3Đ  ',
            schoolYear: '2025 – 2026', // en-dash U+2013
            quantity: 36,
            dueDate,
            borrowNote: 'Ghi chú nội bộ bí mật của giáo viên A',
          },
          teacherACookie
        )
      );
      expect(wholeClassRes.status).toBe(201);
      const wholeClassLoan = (await wholeClassRes.json()).data;
      expect(wholeClassLoan.className).toBe('3Đ');
      expect(wholeClassLoan.schoolYear).toBe('2025-2026');

      // Giáo viên B mượn riêng lẻ lớp "3đ" dạng NFD -> phải bị chặn 409 DUPLICATE_ACTIVE_LOAN
      const blockedIndividualRes = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'INDIVIDUAL',
            className: '3đ'.normalize('NFD'),
            studentName: 'Nguyễn Bảo Ngọc',
            schoolYear: '2025-2026',
            dueDate,
          },
          teacherBCookie
        )
      );
      expect(blockedIndividualRes.status).toBe(409);
      const blockedBody = await blockedIndividualRes.json();
      expect(blockedBody.error.code).toBe('DUPLICATE_ACTIVE_LOAN');
      expect(blockedBody.error.message).toContain('Toàn bộ học bạ lớp 3Đ');
      expect(blockedBody.error.message).toContain('Nguyễn Thị Lan');
      expect(blockedBody.error.message).not.toContain('0901112233');
      expect(blockedBody.error.message).not.toContain('bí mật');
      expectSafeConflictExistingLoan(blockedBody.error.details.existingLoan, 'Nguyễn Thị Lan');

      // Mượn WHOLE_CLASS lần 2 với em-dash -> cũng bị chặn 409
      const blockedSecondWholeRes = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'WHOLE_CLASS',
            className: '3đ'.normalize('NFD'),
            schoolYear: '2025 — 2026',
            dueDate,
          },
          teacherBCookie
        )
      );
      expect(blockedSecondWholeRes.status).toBe(409);
      const blockedSecondBody = await blockedSecondWholeRes.json();
      expect(blockedSecondBody.error.code).toBe('DUPLICATE_ACTIVE_LOAN');
      expectSafeConflictExistingLoan(blockedSecondBody.error.details.existingLoan, 'Nguyễn Thị Lan');

      // Mượn lớp khác (3E, 2025-2026) và niên khóa khác (3Đ, 2024-2025) vẫn thành công 201
      const otherClassRes = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'INDIVIDUAL',
            className: '3E',
            studentName: 'Nguyễn Bảo Ngọc',
            schoolYear: '2025-2026',
            dueDate,
          },
          teacherBCookie
        )
      );
      expect(otherClassRes.status).toBe(201);

      const otherYearRes = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'WHOLE_CLASS',
            className: '3Đ',
            schoolYear: '2024-2025',
            quantity: 34,
            dueDate,
          },
          teacherBCookie
        )
      );
      expect(otherYearRes.status).toBe(201);
    });

    it('2 phiếu INDIVIDUAL lớp 4A -> chặn WHOLE_CLASS (báo đúng "2 học bạ..."), trả 1 phiếu vẫn chặn ("1 học bạ..."), trả nốt -> 201', async () => {
      const dueDate = addCalendarDays(getTodayVNDateString(), 7);

      const ind1Res = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'INDIVIDUAL',
            className: '4A',
            studentName: 'Đặng Minh Khôi',
            schoolYear: '2025-2026',
            dueDate,
            borrowNote: 'Ghi chú riêng 1',
          },
          teacherACookie
        )
      );
      expect(ind1Res.status).toBe(201);
      const ind1 = (await ind1Res.json()).data;

      const ind2Res = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'INDIVIDUAL',
            className: ' 4a ',
            studentName: 'Võ Ngọc Hân',
            schoolYear: '2025 - 2026',
            dueDate,
            borrowNote: 'Ghi chú riêng 2',
          },
          teacherBCookie
        )
      );
      expect(ind2Res.status).toBe(201);
      const ind2 = (await ind2Res.json()).data;

      // Đang có 2 phiếu lẻ -> chặn WHOLE_CLASS và báo đúng "2 học bạ mượn riêng lẻ chưa trả"
      const attempt1 = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'WHOLE_CLASS',
            className: '4A',
            schoolYear: '2025-2026',
            quantity: 35,
            dueDate,
          },
          teacherACookie
        )
      );
      expect(attempt1.status).toBe(409);
      const attempt1Body = await attempt1.json();
      expect(attempt1Body.error.code).toBe('DUPLICATE_ACTIVE_LOAN');
      expect(attempt1Body.error.message).toContain('2 học bạ mượn riêng lẻ chưa trả');
      expectSafeConflictExistingLoan(attempt1Body.error.details.existingLoan, 'Nguyễn Thị Lan');

      // Admin xác nhận trả phiếu lẻ thứ 1
      const ret1 = await returnLoanPOST(
        makeNextJsonReq(
          `http://localhost/api/loans/${ind1.id}/return`,
          'POST',
          { returnNote: 'Đã nhận lại cuốn 1' },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(ind1.id) }) }
      );
      expect(ret1.status).toBe(200);

      // Còn 1 phiếu lẻ -> vẫn chặn WHOLE_CLASS và báo đúng "1 học bạ mượn riêng lẻ chưa trả"
      const attempt2 = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'WHOLE_CLASS',
            className: '4A',
            schoolYear: '2025-2026',
            quantity: 35,
            dueDate,
          },
          teacherACookie
        )
      );
      expect(attempt2.status).toBe(409);
      const attempt2Body = await attempt2.json();
      expect(attempt2Body.error.code).toBe('DUPLICATE_ACTIVE_LOAN');
      expect(attempt2Body.error.message).toContain('1 học bạ mượn riêng lẻ chưa trả');
      expect(attempt2Body.error.message).toContain('Võ Ngọc Hân');
      expectSafeConflictExistingLoan(attempt2Body.error.details.existingLoan, 'Trần Quang Minh');

      // Admin xác nhận trả phiếu lẻ thứ 2
      const ret2 = await returnLoanPOST(
        makeNextJsonReq(
          `http://localhost/api/loans/${ind2.id}/return`,
          'POST',
          { returnNote: 'Đã nhận lại cuốn 2' },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(ind2.id) }) }
      );
      expect(ret2.status).toBe(200);

      // Cả 2 phiếu lẻ đã trả -> mượn WHOLE_CLASS thành công 201
      const attempt3 = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'WHOLE_CLASS',
            className: '4A',
            schoolYear: '2025-2026',
            quantity: 35,
            dueDate,
          },
          teacherACookie
        )
      );
      expect(attempt3.status).toBe(201);
      const wholeLoan = (await attempt3.json()).data;
      expect(wholeLoan.loanType).toBe('WHOLE_CLASS');
      expect(wholeLoan.quantity).toBe(35);
      expect(wholeLoan.studentName).toBe('Toàn bộ lớp');
    });

    it('Concurrency mạnh: Promise.all 3 WHOLE_CLASS + 3 INDIVIDUAL cùng lớp "5B" (2025-2026) -> 0 lỗi 500, bất biến DB tuyệt đối', async () => {
      const dueDate = addCalendarDays(getTodayVNDateString(), 7);

      const makeWholeReq = (idx: number, cookie: string) =>
        createLoanPOST(
          makeJsonReq(
            'http://localhost/api/loans',
            'POST',
            {
              loanType: 'WHOLE_CLASS',
              className: '5B',
              schoolYear: '2025-2026',
              quantity: 30 + idx,
              dueDate,
            },
            cookie
          )
        );

      const makeIndReq = (studentName: string, cookie: string) =>
        createLoanPOST(
          makeJsonReq(
            'http://localhost/api/loans',
            'POST',
            {
              loanType: 'INDIVIDUAL',
              className: '5b',
              studentName,
              schoolYear: '2025-2026',
              dueDate,
            },
            cookie
          )
        );

      // Đợt 1: WHOLE_CLASS xen kẽ với 3 học sinh khác nhau (lớp 5B, 2025-2026)
      const batch1Responses = await Promise.all([
        makeWholeReq(1, teacherACookie),
        makeIndReq('Nguyễn Minh Anh', teacherBCookie),
        makeWholeReq(2, teacherBCookie),
        makeIndReq('Trần Gia Bảo', teacherACookie),
        makeWholeReq(3, teacherACookie),
        makeIndReq('Lê Khánh Chi', teacherBCookie),
      ]);

      const batch1Results = await Promise.all(
        batch1Responses.map(async (res, index) => ({
          kind: index % 2 === 0 ? ('WHOLE_CLASS' as const) : ('INDIVIDUAL' as const),
          status: res.status,
          body: await res.json(),
        }))
      );

      // Tuyệt đối 0 lỗi 500; chỉ cho phép 201 hoặc 409 DUPLICATE_ACTIVE_LOAN
      expect(batch1Results.some((r) => r.status >= 500)).toBe(false);
      for (const r of batch1Results) {
        expect([201, 409]).toContain(r.status);
        if (r.status === 409) {
          expect(r.body.error.code).toBe('DUPLICATE_ACTIVE_LOAN');
        }
      }

      const wcCreated1 = batch1Results.filter(
        (r) => r.kind === 'WHOLE_CLASS' && r.status === 201
      );
      const indCreated1 = batch1Results.filter(
        (r) => r.kind === 'INDIVIDUAL' && r.status === 201
      );

      if (wcCreated1.length === 1) {
        // Thắng là WHOLE_CLASS -> đúng 1 201 và 5 còn lại 409
        expect(indCreated1).toHaveLength(0);
        expect(batch1Results.filter((r) => r.status === 201)).toHaveLength(1);
        expect(batch1Results.filter((r) => r.status === 409)).toHaveLength(5);
      } else {
        // Thắng là INDIVIDUAL -> 3 WHOLE_CLASS đều 409, 3 INDIVIDUAL khác học sinh đều 201
        expect(wcCreated1).toHaveLength(0);
        expect(indCreated1).toHaveLength(3);
        expect(batch1Results.filter((r) => r.status === 409)).toHaveLength(3);
      }

      // Kiểm tra bất biến DB: không bao giờ tồn tại đồng thời WHOLE_CLASS và INDIVIDUAL đang BORROWED cho 5b|2025-2026
      const db = await getDb();
      const active5B = await db
        .select()
        .from(loanRecords)
        .where(
          and(eq(loanRecords.classYearKey, '5b|2025-2026'), eq(loanRecords.status, 'BORROWED'))
        )
        .all();
      const activeTypes5B = new Set(active5B.map((r) => r.loanType));
      expect(activeTypes5B.size).toBe(1);
      if (activeTypes5B.has('WHOLE_CLASS')) {
        expect(active5B).toHaveLength(1);
      } else {
        expect(active5B).toHaveLength(3);
      }

      // Đợt 2: INDIVIDUAL gửi trước xen kẽ với WHOLE_CLASS trên lớp 5C (2025-2026) để xác minh nhánh thắng INDIVIDUAL
      const batch2Responses = await Promise.all([
        createLoanPOST(
          makeJsonReq(
            'http://localhost/api/loans',
            'POST',
            {
              loanType: 'INDIVIDUAL',
              className: '5C',
              studentName: 'Học sinh Một',
              schoolYear: '2025-2026',
              dueDate,
            },
            teacherACookie
          )
        ),
        createLoanPOST(
          makeJsonReq(
            'http://localhost/api/loans',
            'POST',
            {
              loanType: 'WHOLE_CLASS',
              className: '5C',
              schoolYear: '2025-2026',
              quantity: 33,
              dueDate,
            },
            teacherBCookie
          )
        ),
        createLoanPOST(
          makeJsonReq(
            'http://localhost/api/loans',
            'POST',
            {
              loanType: 'INDIVIDUAL',
              className: '5C',
              studentName: 'Học sinh Hai',
              schoolYear: '2025-2026',
              dueDate,
            },
            teacherBCookie
          )
        ),
        createLoanPOST(
          makeJsonReq(
            'http://localhost/api/loans',
            'POST',
            {
              loanType: 'WHOLE_CLASS',
              className: '5C',
              schoolYear: '2025-2026',
              quantity: 34,
              dueDate,
            },
            teacherACookie
          )
        ),
        createLoanPOST(
          makeJsonReq(
            'http://localhost/api/loans',
            'POST',
            {
              loanType: 'INDIVIDUAL',
              className: '5C',
              studentName: 'Học sinh Ba',
              schoolYear: '2025-2026',
              dueDate,
            },
            teacherACookie
          )
        ),
        createLoanPOST(
          makeJsonReq(
            'http://localhost/api/loans',
            'POST',
            {
              loanType: 'WHOLE_CLASS',
              className: '5C',
              schoolYear: '2025-2026',
              quantity: 35,
              dueDate,
            },
            teacherBCookie
          )
        ),
      ]);

      const batch2Results = await Promise.all(
        batch2Responses.map(async (res, index) => ({
          kind: index % 2 === 0 ? ('INDIVIDUAL' as const) : ('WHOLE_CLASS' as const),
          status: res.status,
          body: await res.json(),
        }))
      );

      expect(batch2Results.some((r) => r.status >= 500)).toBe(false);
      for (const r of batch2Results) {
        expect([201, 409]).toContain(r.status);
      }

      const active5C = await db
        .select()
        .from(loanRecords)
        .where(
          and(eq(loanRecords.classYearKey, '5c|2025-2026'), eq(loanRecords.status, 'BORROWED'))
        )
        .all();
      const activeTypes5C = new Set(active5C.map((r) => r.loanType));
      expect(activeTypes5C.size).toBe(1);
    });

    it('giải phóng khóa chéo khi Admin xác nhận trả (RETURNED) hoặc hủy (CANCELLED) phiếu WHOLE_CLASS', async () => {
      const dueDate = addCalendarDays(getTodayVNDateString(), 7);

      // Tạo WHOLE_CLASS cho 2C -> chặn INDIVIDUAL -> Admin trả -> cho phép mượn INDIVIDUAL
      const wc1Res = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'WHOLE_CLASS',
            className: '2C',
            schoolYear: '2025-2026',
            quantity: 30,
            dueDate,
          },
          teacherACookie
        )
      );
      expect(wc1Res.status).toBe(201);
      const wc1 = (await wc1Res.json()).data;

      const blockedBeforeReturn = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'INDIVIDUAL',
            className: '2C',
            studentName: 'Nguyễn Văn Tí',
            schoolYear: '2025-2026',
            dueDate,
          },
          teacherBCookie
        )
      );
      expect(blockedBeforeReturn.status).toBe(409);

      const returnWc1 = await returnLoanPOST(
        makeNextJsonReq(
          `http://localhost/api/loans/${wc1.id}/return`,
          'POST',
          { returnNote: 'Trả trọn bộ 30 quyển' },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(wc1.id) }) }
      );
      expect(returnWc1.status).toBe(200);

      const indAfterReturn = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'INDIVIDUAL',
            className: '2C',
            studentName: 'Nguyễn Văn Tí',
            schoolYear: '2025-2026',
            dueDate,
          },
          teacherBCookie
        )
      );
      expect(indAfterReturn.status).toBe(201);
      const indLoan = (await indAfterReturn.json()).data;

      // Admin hủy phiếu INDIVIDUAL -> giải phóng để mượn WHOLE_CLASS -> Admin hủy WHOLE_CLASS -> giải phóng cho INDIVIDUAL
      const cancelInd = await cancelLoanPOST(
        makeNextJsonReq(
          `http://localhost/api/loans/${indLoan.id}/cancel`,
          'POST',
          { reason: 'Giáo viên nhập nhầm tên lớp' },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(indLoan.id) }) }
      );
      expect(cancelInd.status).toBe(200);

      const wc2Res = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'WHOLE_CLASS',
            className: '2C',
            schoolYear: '2025-2026',
            dueDate,
          },
          teacherACookie
        )
      );
      expect(wc2Res.status).toBe(201);
      const wc2 = (await wc2Res.json()).data;

      const cancelWc2 = await cancelLoanPOST(
        makeNextJsonReq(
          `http://localhost/api/loans/${wc2.id}/cancel`,
          'POST',
          { reason: 'Hủy phiếu cả lớp nhập nhầm' },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(wc2.id) }) }
      );
      expect(cancelWc2.status).toBe(200);

      const indAfterCancelWc = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'INDIVIDUAL',
            className: '2C',
            studentName: 'Trần Thị Tẹo',
            schoolYear: '2025-2026',
            dueDate,
          },
          teacherBCookie
        )
      );
      expect(indAfterCancelWc.status).toBe(201);
    });
  });

  // =========================================================================
  // 3. Dashboard Admin (Danh sách đỏ), Lọc loanType, Tìm kiếm & Audit Logs
  // =========================================================================
  describe('3. Dashboard Admin (Danh sách đỏ), Lọc loanType, Tìm kiếm không dấu & Audit Logs', () => {
    it('phiếu WHOLE_CLASS quá hạn xuất hiện đúng trong GET /api/dashboard/admin với loanType, quantity và không rò rỉ cột nội bộ', async () => {
      const db = await getDb();
      const todayVN = getTodayVNDateString();
      const overdueDueDate = addCalendarDays(todayVN, -5); // MODERATE (5 ngày)
      const dueTodayDate = todayVN; // DUE_TODAY (không vào Danh sách đỏ)
      const now = new Date().toISOString();

      // Tạo 1 phiếu WHOLE_CLASS quá hạn 5 ngày (chèn trực tiếp DB để mô phỏng thời gian trôi)
      const overdueWhole = await db
        .insert(loanRecords)
        .values({
          teacherId: teacherAId,
          teacherNameSnapshot: 'Nguyễn Thị Lan',
          teacherPhoneSnapshot: '0901112233',
          teacherUnitSnapshot: 'Khối 3',
          loanType: 'WHOLE_CLASS',
          className: '3A',
          studentName: WHOLE_CLASS_STUDENT_LABEL,
          schoolYear: '2025-2026',
          quantity: 38,
          recordIdentityKey: 'class:3a|2025-2026',
          classYearKey: '3a|2025-2026',
          classNameNorm: buildClassNameNorm('3A'),
          searchText: buildLoanSearchText({
            studentName: WHOLE_CLASS_STUDENT_LABEL,
            className: '3A',
            schoolYear: '2025-2026',
            teacherNameSnapshot: 'Nguyễn Thị Lan',
            teacherUnitSnapshot: 'Khối 3',
            teacherPhoneSnapshot: '0901112233',
            loanType: 'WHOLE_CLASS',
          }),
          borrowedAt: now,
          dueDate: overdueDueDate,
          status: 'BORROWED',
          borrowNote: 'Ghi nhận xét cuối kỳ',
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      // Tạo 1 phiếu WHOLE_CLASS đến hạn hôm nay (không được nằm trong redList)
      const dueTodayWhole = await db
        .insert(loanRecords)
        .values({
          teacherId: teacherBId,
          teacherNameSnapshot: 'Trần Quang Minh',
          teacherPhoneSnapshot: '0909445566',
          teacherUnitSnapshot: 'Khối 4-5',
          loanType: 'WHOLE_CLASS',
          className: '4B',
          studentName: WHOLE_CLASS_STUDENT_LABEL,
          schoolYear: '2025-2026',
          quantity: null,
          recordIdentityKey: 'class:4b|2025-2026',
          classYearKey: '4b|2025-2026',
          classNameNorm: buildClassNameNorm('4B'),
          searchText: buildLoanSearchText({
            studentName: WHOLE_CLASS_STUDENT_LABEL,
            className: '4B',
            schoolYear: '2025-2026',
            teacherNameSnapshot: 'Trần Quang Minh',
            teacherUnitSnapshot: 'Khối 4-5',
            teacherPhoneSnapshot: '0909445566',
            loanType: 'WHOLE_CLASS',
          }),
          borrowedAt: now,
          dueDate: dueTodayDate,
          status: 'BORROWED',
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      const dashRes = await adminDashboardGET(
        new Request('http://localhost/api/dashboard/admin', {
          headers: { cookie: adminCookie },
        })
      );
      expect(dashRes.status).toBe(200);
      const dashBody = await dashRes.json();

      expect(dashBody.data.kpi.totalBorrowed).toBe(2);
      expect(dashBody.data.kpi.overdueCount).toBe(1);
      expect(dashBody.data.kpi.dueSoonOrTodayCount).toBe(1);
      expect(dashBody.data.attentionSummary).toEqual({
        critical: 0,
        moderate: 1,
        mild: 0,
        dueToday: 1,
        dueSoon: 0,
      });

      expect(dashBody.data.redList).toHaveLength(1);
      const redItem = dashBody.data.redList[0];
      expect(redItem.id).toBe(overdueWhole.id);
      expect(redItem.loanType).toBe('WHOLE_CLASS');
      expect(redItem.studentName).toBe('Toàn bộ lớp');
      expect(redItem.quantity).toBe(38);
      expect(redItem.overdueDays).toBe(5);
      expect(redItem.timingLevel).toBe('MODERATE');
      expect(redItem.isInRedList).toBe(true);
      expectNoInternalLoanColumns(redItem);

      // Phiếu đến hạn hôm nay có trong attentionItems nhưng không có trong redList
      expect(
        dashBody.data.redList.some((item: { id: number }) => item.id === dueTodayWhole.id)
      ).toBe(false);
      expect(
        dashBody.data.attentionItems.some((item: { id: number }) => item.id === dueTodayWhole.id)
      ).toBe(true);
      for (const item of dashBody.data.attentionItems as Array<Record<string, unknown>>) {
        expectNoInternalLoanColumns(item);
      }
    });

    it('giáo viên tìm kiếm không dấu "ca lop", "toan bo", "3d" trả phiếu WHOLE_CLASS của chính mình & cô lập không thấy của GV khác; Admin lọc loanType chính xác', async () => {
      const dueDate = addCalendarDays(getTodayVNDateString(), 7);

      // GV A mượn WHOLE_CLASS lớp 3Đ và 1 phiếu INDIVIDUAL lớp 2A
      const aWhole = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'WHOLE_CLASS',
            className: '3Đ',
            schoolYear: '2025-2026',
            quantity: 34,
            dueDate,
          },
          teacherACookie
        )
      );
      expect(aWhole.status).toBe(201);
      const aWholeLoan = (await aWhole.json()).data;

      const aInd = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'INDIVIDUAL',
            className: '2A',
            studentName: 'Nguyễn Minh Quân',
            schoolYear: '2025-2026',
            dueDate,
          },
          teacherACookie
        )
      );
      expect(aInd.status).toBe(201);

      // GV B cũng mượn WHOLE_CLASS lớp 5Đ
      const bWhole = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'WHOLE_CLASS',
            className: '5Đ',
            schoolYear: '2025-2026',
            quantity: 40,
            dueDate,
          },
          teacherBCookie
        )
      );
      expect(bWhole.status).toBe(201);

      // GV A tìm không dấu "ca lop", "toan bo", "3d" và có dấu NFC/NFD -> chỉ thấy phiếu WHOLE_CLASS lớp 3Đ của chính mình (cô lập hoàn toàn với GV B kể cả khi cố tình gửi teacherId của GV B)
      for (const q of [
        'ca lop',
        'toan bo',
        '3d',
        'Cả lớp'.normalize('NFC'),
        'Cả lớp'.normalize('NFD'),
        'Toàn bộ'.normalize('NFD'),
      ]) {
        const res = await listLoansGET(
          new Request(
            `http://localhost/api/loans?q=${encodeURIComponent(q)}&teacherId=${teacherBId}`,
            {
              headers: { cookie: teacherACookie },
            }
          )
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data).toHaveLength(1);
        expect(body.data[0].id).toBe(aWholeLoan.id);
        expect(body.data[0].teacherId).toBe(teacherAId);
        expect(body.data[0].loanType).toBe('WHOLE_CLASS');
        expectNoInternalLoanColumns(body.data[0]);
      }

      // Admin lọc theo loanType=WHOLE_CLASS -> 2 phiếu (3Đ và 5Đ)
      const adminWholeRes = await listLoansGET(
        new Request('http://localhost/api/loans?loanType=WHOLE_CLASS', {
          headers: { cookie: adminCookie },
        })
      );
      expect(adminWholeRes.status).toBe(200);
      const adminWholeBody = await adminWholeRes.json();
      expect(adminWholeBody.data).toHaveLength(2);
      expect(
        adminWholeBody.data.every((item: { loanType: string }) => item.loanType === 'WHOLE_CLASS')
      ).toBe(true);
      for (const item of adminWholeBody.data as Array<Record<string, unknown>>) {
        expectNoInternalLoanColumns(item);
      }

      // Admin lọc theo loanType=INDIVIDUAL -> 1 phiếu (2A)
      const adminIndRes = await listLoansGET(
        new Request('http://localhost/api/loans?loanType=INDIVIDUAL', {
          headers: { cookie: adminCookie },
        })
      );
      expect(adminIndRes.status).toBe(200);
      const adminIndBody = await adminIndRes.json();
      expect(adminIndBody.data).toHaveLength(1);
      expect(adminIndBody.data[0].loanType).toBe('INDIVIDUAL');
      expect(adminIndBody.data[0].studentName).toBe('Nguyễn Minh Quân');
    });

    it('LOAN_CREATED, LOAN_RETURNED và LOAN_CANCELLED của phiếu WHOLE_CLASS ghi đủ loanType & quantity trong audit_logs.metadataJson', async () => {
      const dueDate = addCalendarDays(getTodayVNDateString(), 7);

      // Phiếu 1: WHOLE_CLASS có quantity = 35 -> Tạo -> Trả
      const create1Res = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'WHOLE_CLASS',
            className: '3B',
            schoolYear: '2025-2026',
            quantity: 35,
            dueDate,
          },
          teacherACookie
        )
      );
      expect(create1Res.status).toBe(201);
      const loan1 = (await create1Res.json()).data;

      const return1Res = await returnLoanPOST(
        makeNextJsonReq(
          `http://localhost/api/loans/${loan1.id}/return`,
          'POST',
          { returnNote: 'Đã nhận đủ 35 quyển nguyên vẹn' },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(loan1.id) }) }
      );
      expect(return1Res.status).toBe(200);

      // Phiếu 2: WHOLE_CLASS không nhập quantity (null) -> Tạo -> Hủy
      const create2Res = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            loanType: 'WHOLE_CLASS',
            className: '3C',
            schoolYear: '2025-2026',
            dueDate,
          },
          teacherBCookie
        )
      );
      expect(create2Res.status).toBe(201);
      const loan2 = (await create2Res.json()).data;

      const cancel2Res = await cancelLoanPOST(
        makeNextJsonReq(
          `http://localhost/api/loans/${loan2.id}/cancel`,
          'POST',
          { reason: 'Giáo viên chọn nhầm lớp 3C thay vì 3D' },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(loan2.id) }) }
      );
      expect(cancel2Res.status).toBe(200);

      // Kiểm tra trực tiếp audit_logs trong DB
      const db = await getDb();
      const logs = await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).all();

      const created1Log = logs.find(
        (l) => l.action === 'LOAN_CREATED' && l.targetId === String(loan1.id)
      );
      const returned1Log = logs.find(
        (l) => l.action === 'LOAN_RETURNED' && l.targetId === String(loan1.id)
      );
      const created2Log = logs.find(
        (l) => l.action === 'LOAN_CREATED' && l.targetId === String(loan2.id)
      );
      const cancelled2Log = logs.find(
        (l) => l.action === 'LOAN_CANCELLED' && l.targetId === String(loan2.id)
      );

      expect(created1Log?.metadataJson).toBeTruthy();
      expect(returned1Log?.metadataJson).toBeTruthy();
      expect(created2Log?.metadataJson).toBeTruthy();
      expect(cancelled2Log?.metadataJson).toBeTruthy();

      const created1Meta = JSON.parse(created1Log!.metadataJson!);
      expect(created1Meta.loanType).toBe('WHOLE_CLASS');
      expect(created1Meta.quantity).toBe(35);

      const returned1Meta = JSON.parse(returned1Log!.metadataJson!);
      expect(returned1Meta.loanType).toBe('WHOLE_CLASS');
      expect(returned1Meta.quantity).toBe(35);

      const created2Meta = JSON.parse(created2Log!.metadataJson!);
      expect(created2Meta.loanType).toBe('WHOLE_CLASS');
      expect(created2Meta.quantity).toBeNull();

      const cancelled2Meta = JSON.parse(cancelled2Log!.metadataJson!);
      expect(cancelled2Meta.loanType).toBe('WHOLE_CLASS');
      expect(cancelled2Meta.quantity).toBeNull();

      // Kiểm tra qua API GET /api/audit-logs cũng trả đủ metadata
      const auditApiRes = await auditLogsGET(
        new Request('http://localhost/api/audit-logs?action=LOAN_CANCELLED', {
          headers: { cookie: adminCookie },
        })
      );
      expect(auditApiRes.status).toBe(200);
      const auditApiBody = await auditApiRes.json();
      expect(auditApiBody.data).toHaveLength(1);
      const apiCancelMeta = JSON.parse(auditApiBody.data[0].metadataJson);
      expect(apiCancelMeta.loanType).toBe('WHOLE_CLASS');
      expect(apiCancelMeta.quantity).toBeNull();
    });
  });

  // =========================================================================
  // 4. Migration 0002 + backfill trên file SQLite thật (/tmp)
  // =========================================================================
  describe('4. Migration 0002 + backfill class_year_key trên file SQLite thật (/tmp)', () => {
    it('nâng cấp DB cũ (0000 + 0001) có phiếu INDIVIDUAL " 3Đ " (2025-2026) -> backfill class_year_key = "3đ|2025-2026" -> chặn chéo WHOLE_CLASS 409 ngay lập tức', async () => {
      const tempDbPath = path.join(
        os.tmpdir(),
        `hocba-round4-mig0002-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
      );
      tempFilesToCleanup.push(tempDbPath);

      const client = createClient({ url: `file:${tempDbPath}` });
      try {
        await client.execute('PRAGMA foreign_keys = ON');
        await client.execute(`
          CREATE TABLE IF NOT EXISTS _migrations (
            name TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
          )
        `);

        // Áp dụng đúng 0000 + 0001 (mô phỏng DB production trước ADR-005)
        const preMigrations = MIGRATIONS.slice(0, 2);
        expect(preMigrations.map((m) => m.name)).toEqual([
          '0000_initial.sql',
          '0001_turso_search_and_ratelimit.sql',
        ]);

        const now = new Date().toISOString();
        for (const mig of preMigrations) {
          for (const stmt of mig.statements) {
            await client.execute(stmt);
          }
          await client.execute({
            sql: 'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)',
            args: [mig.name, now],
          });
        }

        // Xác nhận trước khi chạy 0002 chưa có cột loan_type, class_year_key, quantity
        const preCols = await client.execute('PRAGMA table_info(loan_records)');
        const preColNames = preCols.rows.map((r) => String(r.name));
        expect(preColNames).not.toContain('loan_type');
        expect(preColNames).not.toContain('class_year_key');
        expect(preColNames).not.toContain('quantity');

        // Chèn dữ liệu schema 0001: settings, 1 admin, 1 teacher, 1 phiếu INDIVIDUAL cũ với class_name = ' 3Đ '
        await client.execute({
          sql: `INSERT INTO system_settings (key, value, updated_at) VALUES ('default_loan_days', '7', ?), ('max_loan_days', '30', ?)`,
          args: [now, now],
        });
        await client.execute({
          sql: `INSERT INTO users (id, username, password_hash, full_name, role, phone, unit, is_active, must_change_password, search_text, created_at, updated_at)
                VALUES (1, 'admin', ?, 'Giáo vụ nhà trường', 'ADMIN', '0900000001', 'Văn phòng', 1, 0, 'admin', ?, ?)`,
          args: [hashPassword('AdminPass123'), now, now],
        });
        await client.execute({
          sql: `INSERT INTO users (id, username, password_hash, full_name, role, phone, unit, is_active, must_change_password, search_text, created_at, updated_at)
                VALUES (2, 'gv_legacy', ?, 'Nguyễn Thị Cũ', 'TEACHER', '0912345678', 'Khối 3', 1, 0, 'gv_legacy', ?, ?)`,
          args: [hashPassword('TeacherPass123'), now, now],
        });

        const todayVN = getTodayVNDateString();
        const dueDate = addCalendarDays(todayVN, 7);
        await client.execute({
          sql: `INSERT INTO loan_records (
                  id, teacher_id, teacher_name_snapshot, teacher_phone_snapshot, teacher_unit_snapshot,
                  class_name, student_name, school_year, record_identity_key,
                  class_name_norm, search_text,
                  borrowed_at, due_date, status, borrow_note, created_at, updated_at
                ) VALUES (50, 2, 'Nguyễn Thị Cũ', '0912345678', 'Khối 3',
                  ' 3Đ ', 'Lê Thị Bé', '2025-2026', '3đ|lê thị bé|2025-2026',
                  '3đ\n3d', 'lê thị bé\nle thi be\n3đ\n3d\n2025-2026',
                  ?, ?, 'BORROWED', 'Phiếu cũ trước migration 0002', ?, ?)`,
          args: [now, dueDate, now, now],
        });

        // Chạy runMigrations -> chỉ áp dụng 0002 và backfill class_year_key
        const newlyApplied = await runMigrations(client);
        expect(newlyApplied).toEqual(['0002_loan_type_and_whole_class.sql']);

        // Idempotent khi chạy lại lần 2
        expect(await runMigrations(client)).toEqual([]);

        // Xác nhận backfill class_year_key, loan_type và index idx_loan_class_year_status
        const migratedLoanRow = (
          await client.execute({
            sql: 'SELECT loan_type, class_year_key, quantity FROM loan_records WHERE id = ?',
            args: [50],
          })
        ).rows[0];
        expect(String(migratedLoanRow.loan_type)).toBe('INDIVIDUAL');
        expect(String(migratedLoanRow.class_year_key)).toBe('3đ|2025-2026');
        expect(migratedLoanRow.quantity).toBeNull();

        const indexCheck = await client.execute(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_loan_class_year_status'"
        );
        expect(indexCheck.rows).toHaveLength(1);

        // Gắn DB thật đã migrate vào tầng API và gọi POST /api/loans WHOLE_CLASS cho "3đ" (2025-2026) -> phải bị chặn chéo 409!
        const migratedDb = drizzle(client, { schema });
        resetDbForTests();
        setDbForTests({ client, db: migratedDb });
        const legacyTeacherCookie = `${SESSION_COOKIE_NAME}=${(await createSession(2)).rawToken}`;

        const crossBlockedRes = await createLoanPOST(
          makeJsonReq(
            'http://localhost/api/loans',
            'POST',
            {
              loanType: 'WHOLE_CLASS',
              className: '3đ',
              schoolYear: '2025-2026',
              quantity: 35,
              dueDate,
            },
            legacyTeacherCookie
          )
        );
        expect(crossBlockedRes.status).toBe(409);
        const crossBlockedBody = await crossBlockedRes.json();
        expect(crossBlockedBody.error.code).toBe('DUPLICATE_ACTIVE_LOAN');
        expect(crossBlockedBody.error.message).toContain('1 học bạ mượn riêng lẻ chưa trả');
        expect(crossBlockedBody.error.message).toContain('Lê Thị Bé');
        expectSafeConflictExistingLoan(
          crossBlockedBody.error.details.existingLoan,
          'Nguyễn Thị Cũ'
        );
      } finally {
        resetDbForTests();
        try {
          client.close();
        } catch {
          // Đã đóng bởi resetDbForTests
        }
      }
    });
  });

  // =========================================================================
  // 5. Kiểm chứng thuật ngữ "Giáo vụ"
  // =========================================================================
  describe('5. Kiểm chứng thuật ngữ "Giáo vụ" (đổi từ "Văn thư")', () => {
    it('tài khoản bị khóa đăng nhập trả thông báo chứa "Giáo vụ" và không chứa "văn thư"', async () => {
      const db = await getDb();
      const now = new Date().toISOString();

      await db
        .insert(users)
        .values({
          username: 'gvlocked',
          passwordHash: hashPassword('LockedPass123'),
          fullName: 'Phạm Thị Khóa',
          role: 'TEACHER',
          phone: '0907778899',
          unit: 'Khối 2',
          isActive: 0,
          mustChangePassword: 0,
          searchText: buildUserSearchText({
            username: 'gvlocked',
            fullName: 'Phạm Thị Khóa',
            phone: '0907778899',
            unit: 'Khối 2',
          }),
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const res = await loginPOST(
        makeJsonReq('http://localhost/api/auth/login', 'POST', {
          username: 'gvlocked',
          password: 'LockedPass123',
        })
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('ACCOUNT_LOCKED');
      expect(body.error.message).toContain('Giáo vụ');
      expect(body.error.message.toLowerCase()).not.toContain('văn thư');
    });

    it('getEnv() mặc định seedAdminName là "Giáo vụ nhà trường" và seedDatabase dùng đúng tên mặc định này', async () => {
      const prevSeedAdminName = process.env.SEED_ADMIN_NAME;
      try {
        delete process.env.SEED_ADMIN_NAME;
        const env = getEnv();
        expect(env.seedAdminName).toBe('Giáo vụ nhà trường');
        expect(env.seedAdminName.toLowerCase()).not.toContain('văn thư');

        const freshConn = await createDbConnection(':memory:');
        try {
          await seedDatabase(freshConn.db);
          const seededAdmin = await freshConn.db
            .select()
            .from(users)
            .where(eq(users.role, 'ADMIN'))
            .limit(1)
            .get();
          expect(seededAdmin?.fullName).toBe('Giáo vụ nhà trường');
        } finally {
          freshConn.client.close();
        }
      } finally {
        if (prevSeedAdminName === undefined) {
          delete process.env.SEED_ADMIN_NAME;
        } else {
          process.env.SEED_ADMIN_NAME = prevSeedAdminName;
        }
      }
    });
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { and, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDbConnection, getDb, resetDbForTests, setDbForTests } from '@/db';
import { runMigrations } from '@/db/migrate';
import { MIGRATIONS } from '@/db/migrations/registry';
import * as schema from '@/db/schema';
import { auditLogs, loanRecords, loginRateLimits, users } from '@/db/schema';
import { seedDatabase } from '@/db/seed';
import { isSqliteUniqueError } from '@/lib/api/response';
import { hashPassword } from '@/lib/auth/password';
import {
  buildLoginRateKey,
  buildUsernameRateKey,
  isLoginRateLimited,
  recordLoginFailure,
  resetRateLimiterForTests,
} from '@/lib/auth/rate-limit';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { addCalendarDays, getTodayVNDateString } from '@/lib/domain/overdue';
import { buildUserSearchText } from '@/lib/domain/search';
import { getEnv } from '@/lib/env';

import { POST as loginPOST } from '@/app/api/auth/login/route';
import { GET as listUsersGET, POST as createUserPOST } from '@/app/api/users/route';
import { PATCH as updateUserPATCH } from '@/app/api/users/[id]/route';
import { GET as listLoansGET, POST as createLoanPOST } from '@/app/api/loans/route';
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

function expectNoInternalColumns(obj: Record<string, unknown>) {
  expect(obj).not.toHaveProperty('searchText');
  expect(obj).not.toHaveProperty('search_text');
  expect(obj).not.toHaveProperty('classNameNorm');
  expect(obj).not.toHaveProperty('class_name_norm');
  expect(obj).not.toHaveProperty('passwordHash');
  expect(obj).not.toHaveProperty('password_hash');
}

describe('Kiểm thử hồi quy QA Vòng 3 — Kiến trúc Vercel + Turso (ADR-004)', () => {
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
        username: 'gvhuong',
        passwordHash: hashPassword('HuongPass123'),
        fullName: 'Đặng Thị Hương',
        role: 'TEACHER',
        phone: '0901234567',
        unit: 'Tổ 4-5',
        isActive: 1,
        mustChangePassword: 0,
        searchText: buildUserSearchText({
          username: 'gvhuong',
          fullName: 'Đặng Thị Hương',
          phone: '0901234567',
          unit: 'Tổ 4-5',
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
        username: 'gvbinh',
        passwordHash: hashPassword('BinhPass123'),
        fullName: 'Trần Văn Bình',
        role: 'TEACHER',
        phone: '0909876543',
        unit: 'Khối 1',
        isActive: 1,
        mustChangePassword: 0,
        searchText: buildUserSearchText({
          username: 'gvbinh',
          fullName: 'Trần Văn Bình',
          phone: '0909876543',
          unit: 'Khối 1',
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
  // 1. Migration 0000 -> 0001 từ DB cũ đã có dữ liệu sẵn + Backfill tự động
  // =========================================================================
  describe('1. Migration 0000 -> 0001 từ DB cũ có sẵn dữ liệu & backfill search_text/class_name_norm', () => {
    it('nâng cấp DB cũ từ 0000 lên 0001, tạo login_rate_limits và backfill chính xác users/loan_records/audit_logs', async () => {
      const tempDbPath = path.join(
        os.tmpdir(),
        `hocba-round3-mig-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
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

        // Chỉ chạy 0000_initial.sql (mô phỏng DB cũ trước ADR-004)
        const initialMigration = MIGRATIONS[0];
        expect(initialMigration.name).toBe('0000_initial.sql');
        for (const stmt of initialMigration.statements) {
          await client.execute(stmt);
        }
        const now = new Date().toISOString();
        await client.execute({
          sql: 'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)',
          args: [initialMigration.name, now],
        });

        // Xác nhận trước khi chạy 0001 chưa có bảng login_rate_limits và chưa có cột search_text
        const preCols = await client.execute('PRAGMA table_info(loan_records)');
        const preColNames = preCols.rows.map((r) => String(r.name));
        expect(preColNames).not.toContain('search_text');
        expect(preColNames).not.toContain('class_name_norm');

        // Chèn dữ liệu sẵn có ở schema 0000: 1 admin, 1 teacher, 1 loan, 1 audit_log
        await client.execute({
          sql: `INSERT INTO users (id, username, password_hash, full_name, role, phone, unit, is_active, must_change_password, created_at, updated_at)
                VALUES (1, 'admin_legacy', ?, 'Văn Thư Cũ', 'ADMIN', '0900000001', 'Văn phòng', 1, 0, ?, ?)`,
          args: [hashPassword('AdminOld123'), now, now],
        });
        await client.execute({
          sql: `INSERT INTO users (id, username, password_hash, full_name, role, phone, unit, is_active, must_change_password, created_at, updated_at)
                VALUES (2, 'gv_old_huong', ?, 'Đặng Thị Hương', 'TEACHER', '0912345678', 'Tổ 4-5', 1, 0, ?, ?)`,
          args: [hashPassword('TeacherOld123'), now, now],
        });

        const todayVN = getTodayVNDateString();
        const dueDate = addCalendarDays(todayVN, 7);
        await client.execute({
          sql: `INSERT INTO loan_records (
                  id, teacher_id, teacher_name_snapshot, teacher_phone_snapshot, teacher_unit_snapshot,
                  class_name, student_name, school_year, record_identity_key,
                  borrowed_at, due_date, status, borrow_note, created_at, updated_at
                ) VALUES (10, 2, 'Đặng Thị Hương', '0912345678', 'Tổ 4-5',
                  '3Đ', 'Nguyễn Ngọc Ánh', '2025-2026', '3đ|nguyễn ngọc ánh|2025-2026',
                  ?, ?, 'BORROWED', 'Kiểm tra học bạ cũ', ?, ?)`,
          args: [now, dueDate, now, now],
        });

        await client.execute({
          sql: `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata_json, created_at)
                VALUES (100, 2, 'LOAN_CREATED', 'LOAN', '10', ?, ?)`,
          args: [JSON.stringify({ studentName: 'Nguyễn Ngọc Ánh', className: '3Đ' }), now],
        });

        // Chạy runMigrations -> áp dụng các migration mới (0001, 0002) và tự backfill
        const newlyApplied = await runMigrations(client);
        expect(newlyApplied).toContain('0001_turso_search_and_ratelimit.sql');
        expect(newlyApplied).toContain('0002_loan_type_and_whole_class.sql');

        // Chạy lần 2 phải idempotent
        const secondRun = await runMigrations(client);
        expect(secondRun).toEqual([]);

        // Kiểm tra bảng login_rate_limits đã được tạo
        const tables = await client.execute(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='login_rate_limits'"
        );
        expect(tables.rows).toHaveLength(1);

        // Kiểm tra backfill users.search_text
        const userRow = (
          await client.execute({ sql: 'SELECT search_text FROM users WHERE id = ?', args: [2] })
        ).rows[0];
        const userSearch = String(userRow.search_text);
        expect(userSearch).toContain('đặng thị hương');
        expect(userSearch).toContain('dang thi huong');
        expect(userSearch).toContain('gv_old_huong');
        expect(userSearch).toContain('tổ 4-5');
        expect(userSearch).toContain('to 4-5');
        expect(userSearch).toContain('0912345678');

        // Kiểm tra backfill loan_records.class_name_norm & search_text
        const loanRow = (
          await client.execute({
            sql: 'SELECT class_name_norm, search_text FROM loan_records WHERE id = ?',
            args: [10],
          })
        ).rows[0];
        expect(String(loanRow.class_name_norm)).toContain('3đ');
        expect(String(loanRow.class_name_norm)).toContain('3d');
        const loanSearch = String(loanRow.search_text);
        expect(loanSearch).toContain('nguyễn ngọc ánh');
        expect(loanSearch).toContain('nguyen ngoc anh');
        expect(loanSearch).toContain('3đ');
        expect(loanSearch).toContain('3d');
        expect(loanSearch).toContain('2025-2026');
        expect(loanSearch).toContain('đặng thị hương');
        expect(loanSearch).toContain('dang thi huong');

        // Kiểm tra backfill audit_logs.search_text
        const auditRow = (
          await client.execute({
            sql: 'SELECT search_text FROM audit_logs WHERE id = ?',
            args: [100],
          })
        ).rows[0];
        const auditSearch = String(auditRow.search_text);
        expect(auditSearch).toContain('loan_created');
        expect(auditSearch).toContain('nguyễn ngọc ánh');
        expect(auditSearch).toContain('nguyen ngoc anh');
        expect(auditSearch).toContain('3đ');
        expect(auditSearch).toContain('3d');

        // Gắn DB đã migrate vào API để xác minh tìm kiếm không dấu qua HTTP route hoạt động ngay
        const migratedDb = drizzle(client, { schema });
        resetDbForTests();
        setDbForTests({ client, db: migratedDb });
        const legacyAdminCookie = `${SESSION_COOKIE_NAME}=${(await createSession(1)).rawToken}`;

        const userRes = await listUsersGET(
          new Request('http://localhost/api/users?q=dang+thi+huong', {
            headers: { cookie: legacyAdminCookie },
          })
        );
        expect(userRes.status).toBe(200);
        const userBody = await userRes.json();
        expect(userBody.data).toHaveLength(1);
        expect(userBody.data[0].username).toBe('gv_old_huong');

        const loanRes = await listLoansGET(
          new Request('http://localhost/api/loans?q=nguyen+ngoc+anh&className=3d', {
            headers: { cookie: legacyAdminCookie },
          })
        );
        expect(loanRes.status).toBe(200);
        const loanBody = await loanRes.json();
        expect(loanBody.data).toHaveLength(1);
        expect(loanBody.data[0].studentName).toBe('Nguyễn Ngọc Ánh');

        const auditRes = await auditLogsGET(
          new Request('http://localhost/api/audit-logs?q=nguyen+ngoc+anh', {
            headers: { cookie: legacyAdminCookie },
          })
        );
        expect(auditRes.status).toBe(200);
        const auditBody = await auditRes.json();
        expect(auditBody.data.some((row: { id: number }) => row.id === 100)).toBe(true);
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
  // 2. Tìm kiếm tiếng Việt (không dấu, NFC, NFD) & escape %, _, \
  // =========================================================================
  describe('2. Tìm kiếm tiếng Việt (không dấu, NFC, NFD) & escape %, _, \\', () => {
    it('/api/users: tìm không dấu, có dấu NFC, có dấu NFD và escape %, _, \\ chính xác', async () => {
      const createRes = await createUserPOST(
        makeJsonReq(
          'http://localhost/api/users',
          'POST',
          {
            username: 'gvquan',
            fullName: 'Đỗ Minh Quân',
            role: 'TEACHER',
            phone: '0988111222',
            unit: 'Khối 5_A 100% \\ đặc biệt',
            password: 'QuanPassword123',
            mustChangePassword: false,
          },
          adminCookie
        )
      );
      expect(createRes.status).toBe(201);

      // 1. Không dấu (gồm chữ Đ -> d)
      const asciiRes = await listUsersGET(
        new Request('http://localhost/api/users?q=do+minh+quan', {
          headers: { cookie: adminCookie },
        })
      );
      expect(asciiRes.status).toBe(200);
      expect((await asciiRes.json()).data.map((u: { username: string }) => u.username)).toEqual([
        'gvquan',
      ]);

      // 2. Có dấu NFC
      const nfcRes = await listUsersGET(
        new Request(`http://localhost/api/users?q=${encodeURIComponent('Đỗ Minh Quân'.normalize('NFC'))}`, {
          headers: { cookie: adminCookie },
        })
      );
      expect(nfcRes.status).toBe(200);
      expect((await nfcRes.json()).data.map((u: { username: string }) => u.username)).toEqual([
        'gvquan',
      ]);

      // 3. Có dấu NFD
      const nfdRes = await listUsersGET(
        new Request(`http://localhost/api/users?q=${encodeURIComponent('Đỗ Minh Quân'.normalize('NFD'))}`, {
          headers: { cookie: adminCookie },
        })
      );
      expect(nfdRes.status).toBe(200);
      expect((await nfdRes.json()).data.map((u: { username: string }) => u.username)).toEqual([
        'gvquan',
      ]);

      // 4. Escape '%' -> chỉ khớp đúng user có ký tự '%' thật
      const percentRes = await listUsersGET(
        new Request(`http://localhost/api/users?q=${encodeURIComponent('%')}`, {
          headers: { cookie: adminCookie },
        })
      );
      expect(percentRes.status).toBe(200);
      expect((await percentRes.json()).data.map((u: { username: string }) => u.username)).toEqual([
        'gvquan',
      ]);

      // 5. Escape '_' -> chỉ khớp đúng user có '_' thật (không khớp gvhuong, gvbinh, admin)
      const underscoreRes = await listUsersGET(
        new Request(`http://localhost/api/users?q=${encodeURIComponent('_')}`, {
          headers: { cookie: adminCookie },
        })
      );
      expect(underscoreRes.status).toBe(200);
      expect((await underscoreRes.json()).data.map((u: { username: string }) => u.username)).toEqual([
        'gvquan',
      ]);

      // 6. Escape '\' -> chỉ khớp đúng user có '\' thật
      const backslashRes = await listUsersGET(
        new Request(`http://localhost/api/users?q=${encodeURIComponent('\\')}`, {
          headers: { cookie: adminCookie },
        })
      );
      expect(backslashRes.status).toBe(200);
      expect((await backslashRes.json()).data.map((u: { username: string }) => u.username)).toEqual([
        'gvquan',
      ]);
    });

    it('/api/loans (ADMIN): tìm không dấu, NFC, NFD và escape %, _, \\ trên q và className', async () => {
      const dueDate = addCalendarDays(getTodayVNDateString(), 7);

      const loanSpecialRes = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '3Đ_100%\\A',
            studentName: 'Đỗ Quang Dũng',
            schoolYear: '2025-2026',
            dueDate,
            borrowNote: 'Kiểm tra học bạ',
          },
          teacherACookie
        )
      );
      expect(loanSpecialRes.status).toBe(201);

      const loanNormalRes = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '1B',
            studentName: 'Trần Thanh Tùng',
            schoolYear: '2024-2025',
            dueDate,
          },
          teacherACookie
        )
      );
      expect(loanNormalRes.status).toBe(201);

      const queries = [
        'do quang dung',
        'Đỗ Quang Dũng'.normalize('NFC'),
        'Đỗ Quang Dũng'.normalize('NFD'),
        'dang thi huong',
        '%',
        '_',
        '\\',
      ];

      for (const query of queries) {
        const res = await listLoansGET(
          new Request(`http://localhost/api/loans?q=${encodeURIComponent(query)}`, {
            headers: { cookie: adminCookie },
          })
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        if (query === 'dang thi huong') {
          expect(body.data).toHaveLength(2);
        } else {
          expect(body.data.map((item: { studentName: string }) => item.studentName)).toEqual([
            'Đỗ Quang Dũng',
          ]);
        }
      }

      // Kiểm tra lọc className: không dấu, NFC, NFD và escape %, _, \
      for (const clsQuery of ['3d', '3Đ'.normalize('NFC'), '3Đ'.normalize('NFD'), '%', '_', '\\']) {
        const res = await listLoansGET(
          new Request(`http://localhost/api/loans?className=${encodeURIComponent(clsQuery)}`, {
            headers: { cookie: adminCookie },
          })
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.map((item: { studentName: string }) => item.studentName)).toEqual([
          'Đỗ Quang Dũng',
        ]);
      }
    });

    it('/api/loans (TEACHER): tìm có dấu NFC, có dấu NFD và escape %, _, \\ chính xác', async () => {
      const dueDate = addCalendarDays(getTodayVNDateString(), 7);

      const r1 = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '3Đ_100%\\A',
            studentName: 'Đỗ Quang Dũng',
            schoolYear: '2025-2026',
            dueDate,
          },
          teacherACookie
        )
      );
      expect(r1.status).toBe(201);

      const r2 = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '1B',
            studentName: 'Trần Thanh Tùng',
            schoolYear: '2024-2025',
            dueDate,
          },
          teacherACookie
        )
      );
      expect(r2.status).toBe(201);

      for (const query of ['Đỗ Quang Dũng'.normalize('NFC'), 'Đỗ Quang Dũng'.normalize('NFD'), '%', '_', '\\']) {
        const res = await listLoansGET(
          new Request(`http://localhost/api/loans?q=${encodeURIComponent(query)}`, {
            headers: { cookie: teacherACookie },
          })
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.map((item: { studentName: string }) => item.studentName)).toEqual([
          'Đỗ Quang Dũng',
        ]);
      }
    });

    it('/api/loans (TEACHER): tìm kiếm tiếng Việt KHÔNG DẤU phải trả về phiếu khớp tên học sinh/lớp', async () => {
      const dueDate = addCalendarDays(getTodayVNDateString(), 7);

      const created = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '3Đ',
            studentName: 'Đỗ Quang Dũng',
            schoolYear: '2025-2026',
            dueDate,
          },
          teacherACookie
        )
      );
      expect(created.status).toBe(201);

      // Giáo viên gõ không dấu "do quang dung" để tìm phiếu học sinh "Đỗ Quang Dũng"
      const resByStudent = await listLoansGET(
        new Request('http://localhost/api/loans?q=do+quang+dung', {
          headers: { cookie: teacherACookie },
        })
      );
      expect(resByStudent.status).toBe(200);
      const studentBody = await resByStudent.json();
      expect(studentBody.data.map((item: { studentName: string }) => item.studentName)).toEqual([
        'Đỗ Quang Dũng',
      ]);

      // Giáo viên gõ không dấu "3d" để tìm lớp "3Đ"
      const resByClass = await listLoansGET(
        new Request('http://localhost/api/loans?q=3d', {
          headers: { cookie: teacherACookie },
        })
      );
      expect(resByClass.status).toBe(200);
      const classBody = await resByClass.json();
      expect(classBody.data.map((item: { className: string }) => item.className)).toEqual(['3Đ']);
    });

    it('/api/audit-logs: tìm không dấu, NFC, NFD (cả metadata và tên actor) & escape %, _, \\', async () => {
      const dueDate = addCalendarDays(getTodayVNDateString(), 7);

      const loanSpecialRes = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '4A_50%\\B',
            studentName: 'Nguyễn Ánh Dương',
            schoolYear: '2025-2026',
            dueDate,
          },
          teacherACookie
        )
      );
      expect(loanSpecialRes.status).toBe(201);

      const loanNormalRes = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '4AX50ZB',
            studentName: 'Lê Minh Khôi',
            schoolYear: '2025-2026',
            dueDate,
          },
          teacherBCookie
        )
      );
      expect(loanNormalRes.status).toBe(201);

      // Tìm theo metadata: không dấu, NFC, NFD
      for (const query of [
        'nguyen anh duong',
        'Nguyễn Ánh Dương'.normalize('NFC'),
        'Nguyễn Ánh Dương'.normalize('NFD'),
      ]) {
        const res = await auditLogsGET(
          new Request(`http://localhost/api/audit-logs?q=${encodeURIComponent(query)}`, {
            headers: { cookie: adminCookie },
          })
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data).toHaveLength(1);
        expect(body.data[0].actorUsername).toBe('gvhuong');
      }

      // Tìm theo tên actor: không dấu, NFC, NFD
      for (const actorQuery of [
        'dang thi huong',
        'Đặng Thị Hương'.normalize('NFC'),
        'Đặng Thị Hương'.normalize('NFD'),
      ]) {
        const res = await auditLogsGET(
          new Request(`http://localhost/api/audit-logs?q=${encodeURIComponent(actorQuery)}`, {
            headers: { cookie: adminCookie },
          })
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.length).toBeGreaterThanOrEqual(1);
        expect(body.data.every((row: { actorUsername: string }) => row.actorUsername === 'gvhuong')).toBe(
          true
        );
      }

      // Escape '%' và '\' chỉ khớp đúng log có ký tự thật (không khớp log của Lê Minh Khôi)
      for (const special of ['%', '\\', '4a_50%']) {
        const res = await auditLogsGET(
          new Request(`http://localhost/api/audit-logs?q=${encodeURIComponent(special)}`, {
            headers: { cookie: adminCookie },
          })
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data).toHaveLength(1);
        expect(body.data[0].metadataJson).toContain('Nguyễn Ánh Dương');
      }

      // Escape '_' không hoạt động như wildcard 1 ký tự (không khớp "4AX50ZB" khi tìm "4a_50")
      const noWildcardRes = await auditLogsGET(
        new Request(`http://localhost/api/audit-logs?q=${encodeURIComponent('4a_50z')}`, {
          headers: { cookie: adminCookie },
        })
      );
      expect(noWildcardRes.status).toBe(200);
      expect((await noWildcardRes.json()).data).toHaveLength(0);
    });
  });

  // =========================================================================
  // 3. Đồng bộ search_text sau PATCH /api/users/[id]
  // =========================================================================
  describe('3. Đồng bộ search_text khi Admin cập nhật thông tin tài khoản qua PATCH /api/users/[id]', () => {
    it('cập nhật fullName, unit, phone làm tìm theo dữ liệu mới ra kết quả và dữ liệu cũ không còn khớp', async () => {
      const createRes = await createUserPOST(
        makeJsonReq(
          'http://localhost/api/users',
          'POST',
          {
            username: 'gvrename',
            fullName: 'Phạm Thị Hồng',
            role: 'TEACHER',
            phone: '0901000111',
            unit: 'Khối 2A',
            password: 'OldPassword123',
            mustChangePassword: false,
          },
          adminCookie
        )
      );
      expect(createRes.status).toBe(201);
      const createdUser = (await createRes.json()).data;

      // Xác minh trước khi sửa tìm theo thông tin cũ đều khớp
      for (const oldQ of ['pham thi hong', 'khoi 2a', '0901000111']) {
        const res = await listUsersGET(
          new Request(`http://localhost/api/users?q=${encodeURIComponent(oldQ)}`, {
            headers: { cookie: adminCookie },
          })
        );
        expect((await res.json()).data.map((u: { id: number }) => u.id)).toContain(createdUser.id);
      }

      // Admin cập nhật fullName, unit, phone
      const patchRes = await updateUserPATCH(
        makeNextJsonReq(
          `http://localhost/api/users/${createdUser.id}`,
          'PATCH',
          {
            fullName: 'Vũ Hoàng Nam',
            unit: 'Tổ Chuyên Môn 5',
            phone: '0989999888',
          },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(createdUser.id) }) }
      );
      expect(patchRes.status).toBe(200);

      // Tìm theo dữ liệu MỚI (có dấu, không dấu, NFD, unit mới, SĐT mới) phải khớp
      for (const newQ of [
        'Vũ Hoàng Nam',
        'vu hoang nam',
        'Vũ Hoàng Nam'.normalize('NFD'),
        'to chuyen mon 5',
        '0989999888',
      ]) {
        const res = await listUsersGET(
          new Request(`http://localhost/api/users?q=${encodeURIComponent(newQ)}`, {
            headers: { cookie: adminCookie },
          })
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.map((u: { id: number }) => u.id)).toEqual([createdUser.id]);
      }

      // Tìm theo dữ liệu CŨ phải KHÔNG còn khớp
      for (const oldQ of ['Phạm Thị Hồng', 'pham thi hong', 'khoi 2a', '0901000111']) {
        const res = await listUsersGET(
          new Request(`http://localhost/api/users?q=${encodeURIComponent(oldQ)}`, {
            headers: { cookie: adminCookie },
          })
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.map((u: { id: number }) => u.id)).not.toContain(createdUser.id);
      }
    });
  });

  // =========================================================================
  // 4. Không rò rỉ cột nội bộ searchText / classNameNorm trong JSON response
  // =========================================================================
  describe('4. Bảo vệ payload API: không rò rỉ searchText / classNameNorm', () => {
    it('response của /api/users, /api/loans, /api/dashboard/admin và /api/audit-logs không chứa cột nội bộ', async () => {
      // POST /api/users
      const createUserRes = await createUserPOST(
        makeJsonReq(
          'http://localhost/api/users',
          'POST',
          {
            username: 'gvclean',
            fullName: 'Lý Thị Mai',
            role: 'TEACHER',
            phone: '0911222333',
            unit: 'Khối 3',
            password: 'CleanPass123',
            mustChangePassword: false,
          },
          adminCookie
        )
      );
      expect(createUserRes.status).toBe(201);
      const createdUser = (await createUserRes.json()).data;
      expectNoInternalColumns(createdUser);

      // PATCH /api/users/[id]
      const patchUserRes = await updateUserPATCH(
        makeNextJsonReq(
          `http://localhost/api/users/${createdUser.id}`,
          'PATCH',
          { unit: 'Khối 3B' },
          adminCookie
        ),
        { params: Promise.resolve({ id: String(createdUser.id) }) }
      );
      expect(patchUserRes.status).toBe(200);
      expectNoInternalColumns((await patchUserRes.json()).data);

      // GET /api/users
      const listUsersRes = await listUsersGET(
        new Request('http://localhost/api/users', { headers: { cookie: adminCookie } })
      );
      expect(listUsersRes.status).toBe(200);
      const usersList = (await listUsersRes.json()).data;
      expect(usersList.length).toBeGreaterThan(0);
      for (const u of usersList) expectNoInternalColumns(u);

      // POST /api/loans
      const dueDate = addCalendarDays(getTodayVNDateString(), 5);
      const createLoanRes = await createLoanPOST(
        makeJsonReq(
          'http://localhost/api/loans',
          'POST',
          {
            className: '3B',
            studentName: 'Phan Bảo Ngọc',
            schoolYear: '2025-2026',
            dueDate,
          },
          teacherACookie
        )
      );
      expect(createLoanRes.status).toBe(201);
      expectNoInternalColumns((await createLoanRes.json()).data);

      // GET /api/loans (ADMIN & TEACHER)
      for (const cookie of [adminCookie, teacherACookie]) {
        const listLoansRes = await listLoansGET(
          new Request('http://localhost/api/loans', { headers: { cookie } })
        );
        expect(listLoansRes.status).toBe(200);
        const loansList = (await listLoansRes.json()).data;
        expect(loansList.length).toBeGreaterThan(0);
        for (const loan of loansList) expectNoInternalColumns(loan);
      }

      // GET /api/dashboard/admin (thêm 1 phiếu quá hạn để kiểm tra redList & attentionItems)
      const db = await getDb();
      await db
        .update(loanRecords)
        .set({ dueDate: addCalendarDays(getTodayVNDateString(), -3) })
        .run();
      const dashRes = await adminDashboardGET(
        new Request('http://localhost/api/dashboard/admin', { headers: { cookie: adminCookie } })
      );
      expect(dashRes.status).toBe(200);
      const dashData = (await dashRes.json()).data;
      expect(dashData.redList.length).toBeGreaterThan(0);
      for (const item of [...dashData.redList, ...dashData.attentionItems]) {
        expectNoInternalColumns(item);
      }

      // GET /api/audit-logs
      const auditRes = await auditLogsGET(
        new Request('http://localhost/api/audit-logs', { headers: { cookie: adminCookie } })
      );
      expect(auditRes.status).toBe(200);
      const auditsList = (await auditRes.json()).data;
      expect(auditsList.length).toBeGreaterThan(0);
      for (const row of auditsList) expectNoInternalColumns(row);
    });
  });

  // =========================================================================
  // 5. login_rate_limits bền vững trong DB
  // =========================================================================
  describe('5. login_rate_limits lưu bền vững trong DB (getDb())', () => {
    it('lưu bộ đếm trong DB khi đăng nhập sai, chặn 429, xóa đúng bucket khi thành công và không ảnh hưởng user khác', async () => {
      const db = await getDb();

      // gvhuong sai 3 lần, gvbinh sai 2 lần
      for (let i = 0; i < 3; i++) {
        const res = await loginPOST(
          makeJsonReq('http://localhost/api/auth/login', 'POST', {
            username: 'gvhuong',
            password: 'WrongPassword',
          })
        );
        expect(res.status).toBe(401);
      }

      for (let i = 0; i < 2; i++) {
        const res = await loginPOST(
          makeJsonReq('http://localhost/api/auth/login', 'POST', {
            username: 'gvbinh',
            password: 'WrongPassword',
          })
        );
        expect(res.status).toBe(401);
      }

      // Kiểm tra trực tiếp dữ liệu tồn tại bền vững trong bảng login_rate_limits
      const rowsAfterFailures = await db.select().from(loginRateLimits).all();
      const byKey = new Map(rowsAfterFailures.map((r) => [r.key, r]));
      expect(byKey.get('ip:direct|gvhuong')?.failures).toBe(3);
      expect(byKey.get('user:gvhuong')?.failures).toBe(3);
      expect(byKey.get('ip:direct|gvbinh')?.failures).toBe(2);
      expect(byKey.get('user:gvbinh')?.failures).toBe(2);

      // gvhuong đăng nhập thành công -> xóa đúng 2 bucket của gvhuong, giữ nguyên 2 bucket của gvbinh
      const okRes = await loginPOST(
        makeJsonReq('http://localhost/api/auth/login', 'POST', {
          username: 'gvhuong',
          password: 'HuongPass123',
        })
      );
      expect(okRes.status).toBe(200);

      const rowsAfterSuccess = await db.select().from(loginRateLimits).all();
      const afterSuccessMap = new Map(rowsAfterSuccess.map((r) => [r.key, r]));
      expect(afterSuccessMap.has('ip:direct|gvhuong')).toBe(false);
      expect(afterSuccessMap.has('user:gvhuong')).toBe(false);
      expect(afterSuccessMap.get('ip:direct|gvbinh')?.failures).toBe(2);
      expect(afterSuccessMap.get('user:gvbinh')?.failures).toBe(2);

      // gvbinh sai thêm 3 lần nữa (tổng 5 lần) -> lần thứ 6 bị chặn 429 và bucket vẫn giữ nguyên trong DB
      for (let i = 0; i < 3; i++) {
        const res = await loginPOST(
          makeJsonReq('http://localhost/api/auth/login', 'POST', {
            username: 'gvbinh',
            password: 'WrongPassword',
          })
        );
        expect(res.status).toBe(401);
      }

      const blockedRes = await loginPOST(
        makeJsonReq('http://localhost/api/auth/login', 'POST', {
          username: 'gvbinh',
          password: 'BinhPass123',
        })
      );
      expect(blockedRes.status).toBe(429);
      expect((await blockedRes.json()).error.code).toBe('TOO_MANY_ATTEMPTS');

      const binhBucket = await db
        .select()
        .from(loginRateLimits)
        .where(eq(loginRateLimits.key, 'ip:direct|gvbinh'))
        .get();
      expect(binhBucket?.failures).toBe(5);
    });

    it('tự động reset và dọn bản ghi login_rate_limits sau khi hết hạn cửa sổ 15 phút', async () => {
      const db = await getDb();
      const fakeReq = new Request('http://localhost/api/auth/login', { method: 'POST' });
      const ipKey = buildLoginRateKey(fakeReq, 'gv_expired');
      const userKey = buildUsernameRateKey('gv_expired');
      const baseNow = 1_700_000_000_000;
      const windowMs = 15 * 60 * 1000;

      for (let i = 0; i < 5; i++) {
        await recordLoginFailure(ipKey, baseNow + i * 1000);
        await recordLoginFailure(userKey, baseNow + i * 1000);
      }

      // Trong cửa sổ -> bị giới hạn
      expect(await isLoginRateLimited(ipKey, baseNow + windowMs - 1)).toBe(true);

      // Đúng mốc hết hạn (now >= resetAt) -> hết giới hạn và dòng bị xóa khỏi DB
      expect(await isLoginRateLimited(ipKey, baseNow + windowMs)).toBe(false);
      const deletedIpRow = await db
        .select()
        .from(loginRateLimits)
        .where(eq(loginRateLimits.key, ipKey))
        .get();
      expect(deletedIpRow).toBeUndefined();

      // Ghi thất bại mới cho key khác ở mốc sau hết hạn -> dọn luôn bản ghi hết hạn userKey
      await recordLoginFailure('direct:gv_other', baseNow + windowMs + 10);
      const cleanedUserRow = await db
        .select()
        .from(loginRateLimits)
        .where(eq(loginRateLimits.key, userKey))
        .get();
      expect(cleanedUserRow).toBeUndefined();

      const freshOther = await db
        .select()
        .from(loginRateLimits)
        .where(eq(loginRateLimits.key, 'direct:gv_other'))
        .get();
      expect(freshOther?.failures).toBe(1);
    });
  });

  // =========================================================================
  // 6. getEnv() với các tổ hợp TURSO_DATABASE_URL, DATABASE_PATH, VERCEL=1
  // =========================================================================
  describe('6. getEnv() với các tổ hợp biến môi trường Vercel & Turso', () => {
    const trackedKeys = [
      'TURSO_DATABASE_URL',
      'TURSO_AUTH_TOKEN',
      'DATABASE_PATH',
      'VERCEL',
      'AUTH_COOKIE_SECURE',
      'TRUST_PROXY',
      'SESSION_TTL_DAYS',
    ] as const;

    const savedEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
      for (const k of trackedKeys) {
        savedEnv[k] = process.env[k];
        delete process.env[k];
      }
    });

    afterEach(() => {
      for (const k of trackedKeys) {
        if (savedEnv[k] === undefined) delete process.env[k];
        else process.env[k] = savedEnv[k];
      }
    });

    it('xử lý đúng fallback TURSO_DATABASE_URL -> DATABASE_PATH -> file:./data/app.db và chuẩn hóa URL', () => {
      // Mặc định hoàn toàn trống
      expect(getEnv()).toMatchObject({
        tursoDatabaseUrl: 'file:./data/app.db',
        tursoAuthToken: undefined,
        isVercel: false,
        authCookieSecure: false,
        trustProxy: false,
      });

      // Fallback DATABASE_PATH (tự thêm tiền tố file:)
      process.env.DATABASE_PATH = './tmp/local-fallback.db';
      expect(getEnv().tursoDatabaseUrl).toBe('file:./tmp/local-fallback.db');

      // TURSO_DATABASE_URL ưu tiên hơn DATABASE_PATH và giữ nguyên protocol libsql:// / https://
      process.env.TURSO_DATABASE_URL = 'libsql://quan-ly-hoc-ba-org.turso.io';
      process.env.TURSO_AUTH_TOKEN = 'turso-secret-token';
      expect(getEnv()).toMatchObject({
        tursoDatabaseUrl: 'libsql://quan-ly-hoc-ba-org.turso.io',
        tursoAuthToken: 'turso-secret-token',
      });

      process.env.TURSO_DATABASE_URL = 'https://quan-ly-hoc-ba-org.turso.io';
      expect(getEnv().tursoDatabaseUrl).toBe('https://quan-ly-hoc-ba-org.turso.io');

      // Chuẩn hóa file::memory: -> :memory:
      process.env.TURSO_DATABASE_URL = 'file::memory:';
      expect(getEnv().tursoDatabaseUrl).toBe(':memory:');
    });

    it('tự động bật AUTH_COOKIE_SECURE & TRUST_PROXY khi VERCEL=1 và tôn trọng override tường minh false/true', () => {
      // VERCEL=1 không override -> tự động true
      process.env.VERCEL = '1';
      expect(getEnv()).toMatchObject({
        isVercel: true,
        authCookieSecure: true,
        trustProxy: true,
      });

      // VERCEL=1 nhưng override rõ ràng AUTH_COOKIE_SECURE=false và TRUST_PROXY=false
      process.env.AUTH_COOKIE_SECURE = 'false';
      process.env.TRUST_PROXY = 'false';
      expect(getEnv()).toMatchObject({
        isVercel: true,
        authCookieSecure: false,
        trustProxy: false,
      });

      // Ngoài Vercel nhưng bật tường minh true
      delete process.env.VERCEL;
      process.env.AUTH_COOKIE_SECURE = 'true';
      process.env.TRUST_PROXY = 'true';
      expect(getEnv()).toMatchObject({
        isVercel: false,
        authCookieSecure: true,
        trustProxy: true,
      });
    });
  });

  // =========================================================================
  // 7. isSqliteUniqueError với lỗi thật từ @libsql/client
  // =========================================================================
  describe('7. isSqliteUniqueError với lỗi thật từ @libsql/client và phân biệt FOREIGN KEY / CHECK', () => {
    it('nhận diện đúng lỗi UNIQUE thật từ @libsql/client và trả false cho lỗi FOREIGN KEY / CHECK', async () => {
      const conn = await createDbConnection(':memory:');
      try {
        const now = new Date().toISOString();

        // Chèn user đầu tiên
        await conn.client.execute({
          sql: `INSERT INTO users (id, username, password_hash, full_name, role, created_at, updated_at)
                VALUES (1, 'unique_user', 'salt:hash', 'Nguyễn Văn A', 'TEACHER', ?, ?)`,
          args: [now, now],
        });

        // 1. Lỗi thật UNIQUE từ @libsql/client trên users.username
        let uniqueUserErr: unknown = null;
        try {
          await conn.client.execute({
            sql: `INSERT INTO users (username, password_hash, full_name, role, created_at, updated_at)
                  VALUES ('unique_user', 'salt:hash', 'Trùng User', 'TEACHER', ?, ?)`,
            args: [now, now],
          });
        } catch (err) {
          uniqueUserErr = err;
        }
        expect(uniqueUserErr).not.toBeNull();
        expect(isSqliteUniqueError(uniqueUserErr)).toBe(true);

        // 2. Lỗi thật UNIQUE từ Partial Unique Index idx_loan_active_identity qua Drizzle + libSQL
        await conn.db
          .insert(loanRecords)
          .values({
            teacherId: 1,
            teacherNameSnapshot: 'Nguyễn Văn A',
            className: '3A',
            studentName: 'Trần Minh',
            schoolYear: '2025-2026',
            recordIdentityKey: '3a|trần minh|2025-2026',
            borrowedAt: now,
            dueDate: '2026-12-01',
            status: 'BORROWED',
            createdAt: now,
            updatedAt: now,
          })
          .run();

        let partialUniqueErr: unknown = null;
        try {
          await conn.db
            .insert(loanRecords)
            .values({
              teacherId: 1,
              teacherNameSnapshot: 'Nguyễn Văn A',
              className: '3A',
              studentName: 'Trần Minh',
              schoolYear: '2025-2026',
              recordIdentityKey: '3a|trần minh|2025-2026',
              borrowedAt: now,
              dueDate: '2026-12-02',
              status: 'BORROWED',
              createdAt: now,
              updatedAt: now,
            })
            .run();
        } catch (err) {
          partialUniqueErr = err;
        }
        expect(partialUniqueErr).not.toBeNull();
        expect(isSqliteUniqueError(partialUniqueErr)).toBe(true);

        // 3. Lỗi thật FOREIGN KEY từ @libsql/client -> phải trả false
        let fkErr: unknown = null;
        try {
          await conn.client.execute({
            sql: `INSERT INTO loan_records (
                    teacher_id, teacher_name_snapshot, class_name, student_name, school_year,
                    record_identity_key, borrowed_at, due_date, status, created_at, updated_at
                  ) VALUES (999999, 'Ma', '4A', 'HS FK', '2025-2026', '4a|hs fk|2025-2026', ?, '2026-12-01', 'BORROWED', ?, ?)`,
            args: [now, now, now],
          });
        } catch (err) {
          fkErr = err;
        }
        expect(fkErr).not.toBeNull();
        expect(isSqliteUniqueError(fkErr)).toBe(false);

        // 4. Lỗi thật CHECK constraint từ @libsql/client -> phải trả false
        let checkErr: unknown = null;
        try {
          await conn.client.execute({
            sql: `INSERT INTO users (username, password_hash, full_name, role, created_at, updated_at)
                  VALUES ('bad_role_user', 'salt:hash', 'Bad Role', 'SUPERADMIN', ?, ?)`,
            args: [now, now],
          });
        } catch (err) {
          checkErr = err;
        }
        expect(checkErr).not.toBeNull();
        expect(isSqliteUniqueError(checkErr)).toBe(false);

        // 5. Kiểm tra trực tiếp shape lỗi @libsql/client (kể cả bọc cause)
        expect(
          isSqliteUniqueError({
            code: 'SQLITE_CONSTRAINT',
            message: 'SQLITE_CONSTRAINT: UNIQUE constraint failed: loan_records.record_identity_key',
          })
        ).toBe(true);
        expect(
          isSqliteUniqueError({
            message: 'Drizzle wrapper error',
            cause: {
              code: 'SQLITE_CONSTRAINT',
              message: 'SQLITE_CONSTRAINT: UNIQUE constraint failed: users.username',
            },
          })
        ).toBe(true);
        expect(
          isSqliteUniqueError({
            code: 'SQLITE_CONSTRAINT',
            message: 'SQLITE_CONSTRAINT: FOREIGN KEY constraint failed',
          })
        ).toBe(false);
        expect(
          isSqliteUniqueError({
            code: 'SQLITE_CONSTRAINT',
            message: 'SQLITE_CONSTRAINT: CHECK constraint failed: role',
          })
        ).toBe(false);
      } finally {
        conn.client.close();
      }
    });
  });

  // =========================================================================
  // 8. withWriteTransaction đồng thời với nhiều POST /api/loans trùng học bạ
  // =========================================================================
  describe('8. withWriteTransaction đồng thời (Promise.all) chống trùng và tránh lỗi TRANSACTION_ACTIVE', () => {
    it('5 yêu cầu POST /api/loans tạo trùng cùng học bạ đồng thời: đúng 1 phiếu 201, 4 phiếu 409 DUPLICATE_ACTIVE_LOAN, 0 lỗi 500', async () => {
      const dueDate = addCalendarDays(getTodayVNDateString(), 7);

      const payloads = [
        { cookie: teacherACookie, className: '3A', studentName: 'Nguyễn Văn An', schoolYear: '2025-2026' },
        { cookie: teacherBCookie, className: ' 3a ', studentName: 'nguyễn   văn an', schoolYear: '2025 - 2026' },
        { cookie: teacherACookie, className: '3A', studentName: 'NGUYỄN VĂN AN', schoolYear: '2025–2026' },
        { cookie: teacherBCookie, className: '3a', studentName: 'Nguyễn Văn An'.normalize('NFD'), schoolYear: '2025-2026' },
        { cookie: teacherACookie, className: '3A', studentName: 'Nguyễn Văn An', schoolYear: '2025-2026' },
      ];

      const responses = await Promise.all(
        payloads.map((p) =>
          createLoanPOST(
            makeJsonReq(
              'http://localhost/api/loans',
              'POST',
              {
                className: p.className,
                studentName: p.studentName,
                schoolYear: p.schoolYear,
                dueDate,
              },
              p.cookie
            )
          )
        )
      );

      const statuses = responses.map((r) => r.status);
      const bodies = await Promise.all(responses.map((r) => r.json()));

      // Không có bất kỳ lỗi 500 hay lỗi transaction lồng nhau nào
      expect(statuses.filter((s) => s >= 500)).toHaveLength(0);
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(4);

      const conflictBodies = bodies.filter((_, idx) => statuses[idx] === 409);
      for (const body of conflictBodies) {
        expect(body.error.code).toBe('DUPLICATE_ACTIVE_LOAN');
        expect(Object.keys(body.error.details.existingLoan).sort()).toEqual([
          'borrowedAt',
          'dueDate',
          'teacherNameSnapshot',
        ]);
      }

      // DB chỉ có đúng 1 phiếu BORROWED và đúng 1 log LOAN_CREATED
      const db = await getDb();
      const storedLoans = await db
        .select()
        .from(loanRecords)
        .where(
          and(
            eq(loanRecords.recordIdentityKey, '3a|nguyễn văn an|2025-2026'),
            eq(loanRecords.status, 'BORROWED')
          )
        )
        .all();
      expect(storedLoans).toHaveLength(1);

      const createdAuditLogs = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, 'LOAN_CREATED'))
        .all();
      expect(createdAuditLogs).toHaveLength(1);
    });

    it('5 yêu cầu POST /api/loans đồng thời cho 5 học bạ khác nhau đều thành công 201 nhờ hàng đợi withWriteTransaction', async () => {
      const dueDate = addCalendarDays(getTodayVNDateString(), 7);
      const students = [
        'Nguyễn Minh Anh',
        'Trần Bảo Châu',
        'Lê Đức Duy',
        'Phạm Gia Hân',
        'Hoàng Khánh Linh',
      ];

      const responses = await Promise.all(
        students.map((studentName, idx) =>
          createLoanPOST(
            makeJsonReq(
              'http://localhost/api/loans',
              'POST',
              {
                className: `4${String.fromCharCode(65 + idx)}`,
                studentName,
                schoolYear: '2025-2026',
                dueDate,
              },
              idx % 2 === 0 ? teacherACookie : teacherBCookie
            )
          )
        )
      );

      expect(responses.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    });
  });
});

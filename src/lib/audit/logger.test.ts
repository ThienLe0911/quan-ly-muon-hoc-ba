import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDbConnection, resetDbForTests, setDbForTests } from '@/db';
import { auditLogs } from '@/db/schema';
import { jsonError, jsonSuccess } from '@/lib/api/response';
import {
  cancelLoanSchema,
  createLoanSchema,
  updateSettingsSchema,
} from '@/lib/api/validators';
import { writeAuditLog } from './logger';

describe('API Response, Validators & Audit Logger (T05)', () => {
  beforeEach(async () => {
    const conn = await createDbConnection(':memory:');
    setDbForTests(conn);
  });

  afterEach(() => {
    resetDbForTests();
  });

  it('tạo response JSON thống nhất cho success và error', async () => {
    const okRes = jsonSuccess({ ok: true }, { total: 1 }, 201);
    expect(okRes.status).toBe(201);
    expect(await okRes.json()).toEqual({ data: { ok: true }, meta: { total: 1 } });

    const errRes = jsonError('BAD_INPUT', 'Thiếu dữ liệu', 400, { field: 'className' });
    expect(errRes.status).toBe(400);
    expect(await errRes.json()).toEqual({
      error: {
        code: 'BAD_INPUT',
        message: 'Thiếu dữ liệu',
        details: { field: 'className' },
      },
    });
  });

  it('validate chính xác createLoanSchema, cancelLoanSchema và updateSettingsSchema', () => {
    const validLoan = createLoanSchema.safeParse({
      className: ' 3A ',
      studentName: ' Nguyễn Văn An ',
      schoolYear: '2025 - 2026',
      dueDate: '2026-12-01',
      borrowNote: 'Kiểm tra hồ sơ cuối kỳ',
      teacherId: 999, // cố tình chèn phải bị loại bỏ
    });
    expect(validLoan.success).toBe(true);
    if (validLoan.success) {
      expect('teacherId' in validLoan.data).toBe(false);
      expect(validLoan.data.className).toBe('3A');
    }

    const badYear = createLoanSchema.safeParse({
      className: '3A',
      studentName: 'Nguyễn Văn An',
      schoolYear: '25-26',
      dueDate: '2026-12-01',
    });
    expect(badYear.success).toBe(false);

    expect(cancelLoanSchema.safeParse({ reason: 'ab' }).success).toBe(false);
    expect(cancelLoanSchema.safeParse({ reason: 'Nhập nhầm lớp' }).success).toBe(true);

    expect(
      updateSettingsSchema.safeParse({ defaultLoanDays: 15, maxLoanDays: 10 }).success
    ).toBe(false);
    expect(
      updateSettingsSchema.safeParse({ defaultLoanDays: 7, maxLoanDays: 30 }).success
    ).toBe(true);
  });

  it('writeAuditLog ghi đầy đủ thông tin và metadata JSON vào DB', async () => {
    await writeAuditLog({
      actorId: null,
      action: 'SETTINGS_UPDATED',
      targetType: 'SETTING',
      targetId: 'default_loan_days',
      metadata: { before: '7', after: '10' },
    });

    const { getDb } = await import('@/db');
    const db = await getDb();
    const rows = await db.select().from(auditLogs).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('SETTINGS_UPDATED');
    expect(JSON.parse(rows[0].metadataJson || '{}')).toEqual({
      before: '7',
      after: '10',
    });
  });
});

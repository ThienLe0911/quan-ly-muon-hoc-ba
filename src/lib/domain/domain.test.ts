import { describe, expect, it } from 'vitest';
import {
  cleanDisplayText,
  normalizeAndValidateSchoolYear,
  normalizeRecordIdentity,
} from './record-identity';
import {
  addCalendarDays,
  classifyLoanTiming,
  diffCalendarDays,
  getTodayVNDateString,
  getVNDayEndUtcIso,
  getVNDayStartUtcIso,
  isValidDateString,
} from './overdue';

describe('Domain chuẩn hóa định danh học bạ & niên khóa (T03)', () => {
  it('chuẩn hóa văn bản tiếng Việt và khóa chống mượn trùng nhất quán', () => {
    const a = normalizeRecordIdentity({
      className: '  3a ',
      studentName: 'Nguyễn   Văn   An ',
      schoolYear: ' 2025 – 2026 ',
    });
    const b = normalizeRecordIdentity({
      className: '3A',
      studentName: 'nguyễn văn an',
      schoolYear: '2025-2026',
    });

    expect(a.className).toBe('3a');
    expect(a.studentName).toBe('Nguyễn Văn An');
    expect(a.schoolYear).toBe('2025-2026');
    expect(a.recordIdentityKey).toBe(b.recordIdentityKey);
    expect(a.recordIdentityKey).toBe('3a|nguyễn văn an|2025-2026');
    expect(cleanDisplayText('  Lớp   1/2  ')).toBe('Lớp 1/2');
  });

  it('bắt buộc định dạng niên khóa YYYY-YYYY và hỗ trợ khóa tiểu học 5 năm', () => {
    expect(normalizeAndValidateSchoolYear('2025 - 2026')).toEqual({
      valid: true,
      normalized: '2025-2026',
    });
    expect(normalizeAndValidateSchoolYear('2021-2026')).toEqual({
      valid: true,
      normalized: '2021-2026',
    });

    expect(normalizeAndValidateSchoolYear('25-26').valid).toBe(false);
    expect(normalizeAndValidateSchoolYear('2026-2025').valid).toBe(false);
    expect(normalizeAndValidateSchoolYear('2025-2025').valid).toBe(false);
    expect(normalizeAndValidateSchoolYear('2010-2025').valid).toBe(false);
    expect(normalizeAndValidateSchoolYear('2025').valid).toBe(false);
  });
});

describe('Domain ngày giờ Việt Nam & phân mức độ lố hạn (T03)', () => {
  it('tính đúng ngày Việt Nam tại ranh giới nửa đêm UTC', () => {
    // 23:30 UTC ngày 24/11/2026 = 06:30 sáng ngày 25/11/2026 tại Việt Nam
    const utcLateNight = new Date('2026-11-24T23:30:00.000Z');
    expect(getTodayVNDateString(utcLateNight)).toBe('2026-11-25');

    // 16:59 UTC ngày 24/11/2026 = 23:59 ngày 24/11/2026 tại Việt Nam
    const vnBeforeMidnight = new Date('2026-11-24T16:59:00.000Z');
    expect(getTodayVNDateString(vnBeforeMidnight)).toBe('2026-11-24');

    expect(getVNDayStartUtcIso('2026-11-24')).toBe('2026-11-23T17:00:00.000Z');
    expect(getVNDayEndUtcIso('2026-11-24')).toBe('2026-11-24T16:59:59.999Z');
  });

  it('kiểm tra cộng/trừ ngày lịch chính xác kể cả năm nhuận', () => {
    expect(isValidDateString('2024-02-29')).toBe(true);
    expect(isValidDateString('2026-02-29')).toBe(false);
    expect(addCalendarDays('2026-11-24', 7)).toBe('2026-12-01');
    expect(diffCalendarDays('2026-12-01', '2026-11-24')).toBe(7);
  });

  it('phân mức độ lố hạn & danh sách đỏ khớp đúng spec', () => {
    const today = '2026-11-24';

    // Còn >= 3 ngày -> ON_TIME
    expect(classifyLoanTiming('2026-11-27', 'BORROWED', today)).toEqual({
      overdueDays: -3,
      timingLevel: 'ON_TIME',
      isInRedList: false,
    });

    // Sắp đến hạn (-2..-1)
    expect(classifyLoanTiming('2026-11-26', 'BORROWED', today)).toEqual({
      overdueDays: -2,
      timingLevel: 'DUE_SOON',
      isInRedList: false,
    });
    expect(classifyLoanTiming('2026-11-25', 'BORROWED', today)).toEqual({
      overdueDays: -1,
      timingLevel: 'DUE_SOON',
      isInRedList: false,
    });

    // Đến hạn hôm nay (0) -> KHÔNG vào danh sách đỏ
    expect(classifyLoanTiming('2026-11-24', 'BORROWED', today)).toEqual({
      overdueDays: 0,
      timingLevel: 'DUE_TODAY',
      isInRedList: false,
    });

    // Nhẹ (1..3 ngày) -> vào Danh sách đỏ
    expect(classifyLoanTiming('2026-11-23', 'BORROWED', today)).toEqual({
      overdueDays: 1,
      timingLevel: 'MILD',
      isInRedList: true,
    });
    expect(classifyLoanTiming('2026-11-21', 'BORROWED', today)).toEqual({
      overdueDays: 3,
      timingLevel: 'MILD',
      isInRedList: true,
    });

    // Vừa (4..7 ngày) -> vào Danh sách đỏ
    expect(classifyLoanTiming('2026-11-20', 'BORROWED', today)).toEqual({
      overdueDays: 4,
      timingLevel: 'MODERATE',
      isInRedList: true,
    });
    expect(classifyLoanTiming('2026-11-17', 'BORROWED', today)).toEqual({
      overdueDays: 7,
      timingLevel: 'MODERATE',
      isInRedList: true,
    });

    // Nghiêm trọng (>= 8 ngày) -> vào Danh sách đỏ
    expect(classifyLoanTiming('2026-11-16', 'BORROWED', today)).toEqual({
      overdueDays: 8,
      timingLevel: 'CRITICAL',
      isInRedList: true,
    });

    // Đã trả hoặc Đã hủy -> CLOSED, không vào Danh sách đỏ dù due_date cũ
    expect(classifyLoanTiming('2026-11-01', 'RETURNED', today)).toEqual({
      overdueDays: 0,
      timingLevel: 'CLOSED',
      isInRedList: false,
    });
    expect(classifyLoanTiming('2026-11-01', 'CANCELLED', today)).toEqual({
      overdueDays: 0,
      timingLevel: 'CLOSED',
      isInRedList: false,
    });
  });
});

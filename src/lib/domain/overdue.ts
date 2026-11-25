export type LoanStatus = 'BORROWED' | 'RETURNED' | 'CANCELLED';

export type LoanTimingLevel =
  | 'CRITICAL'
  | 'MODERATE'
  | 'MILD'
  | 'DUE_TODAY'
  | 'DUE_SOON'
  | 'ON_TIME'
  | 'CLOSED';

export interface LoanTimingClassification {
  overdueDays: number;
  timingLevel: LoanTimingLevel;
  isInRedList: boolean;
}

const vnDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function getTodayVNDateString(now: Date = new Date()): string {
  return vnDateFormatter.format(now);
}

export function isValidDateString(dateStr: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return false;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() + 1 === month &&
    utc.getUTCDate() === day
  );
}

function dateStringToUtcMs(dateStr: string): number {
  if (!isValidDateString(dateStr)) {
    throw new Error(`Ngày không hợp lệ: ${dateStr}`);
  }
  const [year, month, day] = dateStr.split('-').map((n) => Number.parseInt(n, 10));
  return Date.UTC(year, month - 1, day);
}

export function addCalendarDays(dateStr: string, days: number): string {
  const ms = dateStringToUtcMs(dateStr) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function diffCalendarDays(laterDateStr: string, earlierDateStr: string): number {
  const diffMs = dateStringToUtcMs(laterDateStr) - dateStringToUtcMs(earlierDateStr);
  return Math.round(diffMs / 86_400_000);
}

export function getVNDayStartUtcIso(dateStr: string): string {
  if (!isValidDateString(dateStr)) {
    throw new Error(`Ngày không hợp lệ: ${dateStr}`);
  }
  const startUtcMs = Date.parse(`${dateStr}T00:00:00+07:00`);
  return new Date(startUtcMs).toISOString();
}

export function getVNDayEndUtcIso(dateStr: string): string {
  if (!isValidDateString(dateStr)) {
    throw new Error(`Ngày không hợp lệ: ${dateStr}`);
  }
  const endUtcMs = Date.parse(`${dateStr}T23:59:59.999+07:00`);
  return new Date(endUtcMs).toISOString();
}

export function classifyLoanTiming(
  dueDate: string,
  status: LoanStatus,
  todayVN: string = getTodayVNDateString()
): LoanTimingClassification {
  if (status !== 'BORROWED') {
    return {
      overdueDays: 0,
      timingLevel: 'CLOSED',
      isInRedList: false,
    };
  }

  const overdueDays = diffCalendarDays(todayVN, dueDate);

  if (overdueDays >= 8) {
    return { overdueDays, timingLevel: 'CRITICAL', isInRedList: true };
  }
  if (overdueDays >= 4) {
    return { overdueDays, timingLevel: 'MODERATE', isInRedList: true };
  }
  if (overdueDays >= 1) {
    return { overdueDays, timingLevel: 'MILD', isInRedList: true };
  }
  if (overdueDays === 0) {
    return { overdueDays: 0, timingLevel: 'DUE_TODAY', isInRedList: false };
  }
  if (overdueDays >= -2) {
    return { overdueDays, timingLevel: 'DUE_SOON', isInRedList: false };
  }
  return { overdueDays, timingLevel: 'ON_TIME', isInRedList: false };
}

import { inArray } from 'drizzle-orm';
import { getDb, type AppDatabase } from '@/db';
import { users, type LoanRecordRow } from '@/db/schema';
import {
  classifyLoanTiming,
  type LoanStatus,
  type LoanTimingClassification,
} from '@/lib/domain/overdue';

export interface LoanDto
  extends Omit<LoanRecordRow, 'searchText' | 'classNameNorm'>,
    LoanTimingClassification {
  returnedByAdminName: string | null;
  cancelledByAdminName: string | null;
}

export async function enrichLoanRows(
  rows: LoanRecordRow[],
  todayVN: string,
  dbOverride?: AppDatabase
): Promise<LoanDto[]> {
  if (rows.length === 0) return [];

  const handlerIds = new Set<number>();
  for (const row of rows) {
    if (row.returnedByAdminId !== null) handlerIds.add(row.returnedByAdminId);
    if (row.cancelledByAdminId !== null) handlerIds.add(row.cancelledByAdminId);
  }

  const userMap = new Map<number, string>();
  if (handlerIds.size > 0) {
    const db = dbOverride ?? (await getDb());
    const handlerRows = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(inArray(users.id, Array.from(handlerIds)))
      .all();
    for (const u of handlerRows) {
      userMap.set(u.id, u.fullName);
    }
  }

  return rows.map((row) => {
    const { searchText: _searchText, classNameNorm: _classNameNorm, ...publicRow } = row;
    void _searchText;
    void _classNameNorm;
    const timing = classifyLoanTiming(publicRow.dueDate, publicRow.status as LoanStatus, todayVN);
    return {
      ...publicRow,
      ...timing,
      returnedByAdminName: publicRow.returnedByAdminId
        ? (userMap.get(publicRow.returnedByAdminId) ?? null)
        : null,
      cancelledByAdminName: publicRow.cancelledByAdminId
        ? (userMap.get(publicRow.cancelledByAdminId) ?? null)
        : null,
    };
  });
}

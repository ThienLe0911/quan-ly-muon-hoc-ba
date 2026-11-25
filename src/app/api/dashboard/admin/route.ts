import { and, asc, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { loanRecords } from '@/db/schema';
import { jsonSuccess, withApiErrorHandling } from '@/lib/api/response';
import { requireAdmin } from '@/lib/auth/guards';
import { addCalendarDays, getTodayVNDateString, getVNDayStartUtcIso } from '@/lib/domain/overdue';
import { enrichLoanRows } from '@/lib/loans/enrich';

export const GET = withApiErrorHandling(async (req: Request) => {
  const auth = await requireAdmin(req);
  if (auth.errorResponse) return auth.errorResponse;

  const db = await getDb();
  const todayVN = getTodayVNDateString();
  const monthStartVN = `${todayVN.slice(0, 7)}-01`;
  const last7DaysStartVN = addCalendarDays(todayVN, -6);

  const activeBorrowedRows = await db
    .select()
    .from(loanRecords)
    .where(eq(loanRecords.status, 'BORROWED'))
    .orderBy(asc(loanRecords.dueDate), asc(loanRecords.borrowedAt), asc(loanRecords.id))
    .all();

  const enrichedActive = await enrichLoanRows(activeBorrowedRows, todayVN);

  const redList = enrichedActive.filter((item) => item.isInRedList);
  const attentionItems = enrichedActive.filter(
    (item) => item.timingLevel !== 'ON_TIME' && item.timingLevel !== 'CLOSED'
  );

  const attentionSummary = {
    critical: 0,
    moderate: 0,
    mild: 0,
    dueToday: 0,
    dueSoon: 0,
  };

  for (const item of attentionItems) {
    if (item.timingLevel === 'CRITICAL') attentionSummary.critical += 1;
    else if (item.timingLevel === 'MODERATE') attentionSummary.moderate += 1;
    else if (item.timingLevel === 'MILD') attentionSummary.mild += 1;
    else if (item.timingLevel === 'DUE_TODAY') attentionSummary.dueToday += 1;
    else if (item.timingLevel === 'DUE_SOON') attentionSummary.dueSoon += 1;
  }

  const returnedThisMonthRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(loanRecords)
    .where(
      and(
        eq(loanRecords.status, 'RETURNED'),
        gte(loanRecords.returnedAt, getVNDayStartUtcIso(monthStartVN))
      )
    )
    .get();

  const returnedLast7DaysRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(loanRecords)
    .where(
      and(
        eq(loanRecords.status, 'RETURNED'),
        gte(loanRecords.returnedAt, getVNDayStartUtcIso(last7DaysStartVN))
      )
    )
    .get();

  return jsonSuccess({
    todayVN,
    kpi: {
      totalBorrowed: enrichedActive.length,
      overdueCount: redList.length,
      dueSoonOrTodayCount: attentionSummary.dueToday + attentionSummary.dueSoon,
      returnedLast7Days: Number(returnedLast7DaysRow?.count ?? 0),
      returnedThisMonth: Number(returnedThisMonthRow?.count ?? 0),
    },
    redList,
    attentionSummary,
    attentionItems,
  });
});

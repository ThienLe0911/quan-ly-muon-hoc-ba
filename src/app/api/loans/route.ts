import { and, asc, desc, eq, gte, inArray, lt, lte, sql, type SQL } from 'drizzle-orm';
import { getDb, withWriteTransaction } from '@/db';
import { loanRecords } from '@/db/schema';
import {
  escapeLikePattern,
  isSqliteUniqueError,
  jsonError,
  jsonSuccess,
  parseJsonBody,
  withApiErrorHandling,
} from '@/lib/api/response';
import { createLoanSchema } from '@/lib/api/validators';
import { requireAuth, requireTeacher } from '@/lib/auth/guards';
import { writeAuditLog } from '@/lib/audit/logger';
import {
  addCalendarDays,
  getTodayVNDateString,
  getVNDayEndUtcIso,
  getVNDayStartUtcIso,
  isValidDateString,
} from '@/lib/domain/overdue';
import { cleanDisplayText, normalizeRecordIdentity } from '@/lib/domain/record-identity';
import {
  buildClassNameNorm,
  buildLoanSearchText,
  normalizeVietnameseText,
} from '@/lib/domain/search';
import { formatDateVN } from '@/lib/format-vn';
import { enrichLoanRows } from '@/lib/loans/enrich';
import { readLoanSettings } from '@/lib/settings';

function sanitizeConflictLoan(loan: typeof loanRecords.$inferSelect) {
  return {
    teacherNameSnapshot: loan.teacherNameSnapshot,
    borrowedAt: loan.borrowedAt,
    dueDate: loan.dueDate,
  };
}

function buildDuplicateLoanMessage(loan: typeof loanRecords.$inferSelect): string {
  const borrowedVn = formatDateVN(loan.borrowedAt);
  const dueVn = formatDateVN(loan.dueDate);
  return `Học bạ lớp ${loan.className} - ${loan.studentName} (${loan.schoolYear}) hiện đang được giáo viên ${loan.teacherNameSnapshot} mượn từ ngày ${borrowedVn} và chưa trả (hạn trả ${dueVn}).`;
}

export const GET = withApiErrorHandling(async (req: Request) => {
  const auth = await requireAuth(req);
  if (auth.errorResponse) return auth.errorResponse;

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const status = url.searchParams.get('status')?.trim().toUpperCase() || 'ALL';
  const overdueOnly = url.searchParams.get('overdueOnly') === 'true';
  const overdueTier = url.searchParams.get('overdueTier')?.trim().toUpperCase() || '';
  const teacherIdParam = url.searchParams.get('teacherId')?.trim() || '';
  const schoolYearParam = url.searchParams.get('schoolYear')?.trim() || '';
  const classNameParam = url.searchParams.get('className')?.trim() || '';
  const borrowedFrom = url.searchParams.get('borrowedFrom')?.trim() || '';
  const borrowedTo = url.searchParams.get('borrowedTo')?.trim() || '';
  const sort = url.searchParams.get('sort')?.trim() || 'borrowed_desc';

  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || '20', 10) || 20)
  );

  const todayVN = getTodayVNDateString();
  const conditions: SQL[] = [];

  if (auth.user.role === 'TEACHER') {
    conditions.push(eq(loanRecords.teacherId, auth.user.id));
  } else if (teacherIdParam) {
    const tid = Number.parseInt(teacherIdParam, 10);
    if (Number.isFinite(tid) && tid > 0) {
      conditions.push(eq(loanRecords.teacherId, tid));
    }
  }

  if (status === 'BORROWED' || status === 'RETURNED' || status === 'CANCELLED') {
    conditions.push(eq(loanRecords.status, status));
  } else if (status === 'HISTORY') {
    conditions.push(inArray(loanRecords.status, ['RETURNED', 'CANCELLED']));
  } else if (status === 'OVERDUE') {
    conditions.push(eq(loanRecords.status, 'BORROWED'));
    conditions.push(lt(loanRecords.dueDate, todayVN));
  }

  if (overdueOnly) {
    conditions.push(eq(loanRecords.status, 'BORROWED'));
    conditions.push(lt(loanRecords.dueDate, todayVN));
  }

  if (auth.user.role === 'ADMIN' && overdueTier) {
    conditions.push(eq(loanRecords.status, 'BORROWED'));
    if (overdueTier === 'CRITICAL') {
      conditions.push(lte(loanRecords.dueDate, addCalendarDays(todayVN, -8)));
    } else if (overdueTier === 'MODERATE') {
      conditions.push(gte(loanRecords.dueDate, addCalendarDays(todayVN, -7)));
      conditions.push(lte(loanRecords.dueDate, addCalendarDays(todayVN, -4)));
    } else if (overdueTier === 'MILD') {
      conditions.push(gte(loanRecords.dueDate, addCalendarDays(todayVN, -3)));
      conditions.push(lte(loanRecords.dueDate, addCalendarDays(todayVN, -1)));
    } else if (overdueTier === 'DUE_TODAY') {
      conditions.push(eq(loanRecords.dueDate, todayVN));
    } else if (overdueTier === 'DUE_SOON') {
      conditions.push(gte(loanRecords.dueDate, addCalendarDays(todayVN, 1)));
      conditions.push(lte(loanRecords.dueDate, addCalendarDays(todayVN, 2)));
    } else if (overdueTier === 'ATTENTION') {
      conditions.push(lte(loanRecords.dueDate, addCalendarDays(todayVN, 2)));
    }
  }

  if (schoolYearParam) {
    const normalizedYearFilter = schoolYearParam
      .normalize('NFC')
      .trim()
      .replace(/\s*[–—−-]\s*/g, '-')
      .replace(/\s+/g, '');
    const yearPattern = `%${escapeLikePattern(normalizeVietnameseText(normalizedYearFilter))}%`;
    conditions.push(sql`lower(${loanRecords.schoolYear}) LIKE ${yearPattern} ESCAPE '\\'`);
  }

  if (classNameParam) {
    const normalizedClassFilter = normalizeVietnameseText(cleanDisplayText(classNameParam));
    const classPattern = `%${escapeLikePattern(normalizedClassFilter)}%`;
    conditions.push(sql`${loanRecords.classNameNorm} LIKE ${classPattern} ESCAPE '\\'`);
  }

  if (borrowedFrom && isValidDateString(borrowedFrom)) {
    conditions.push(gte(loanRecords.borrowedAt, getVNDayStartUtcIso(borrowedFrom)));
  }
  if (borrowedTo && isValidDateString(borrowedTo)) {
    conditions.push(lte(loanRecords.borrowedAt, getVNDayEndUtcIso(borrowedTo)));
  }

  if (q) {
    const normQ = normalizeVietnameseText(q);
    const pattern = `%${escapeLikePattern(normQ)}%`;
    const searchCond =
      auth.user.role === 'ADMIN'
        ? sql`${loanRecords.searchText} LIKE ${pattern} ESCAPE '\\'`
        : sql`${loanRecords.recordIdentityKey} LIKE ${pattern} ESCAPE '\\'`;
    conditions.push(searchCond);
  }

  const db = await getDb();
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  let orderByCols;
  if (sort === 'borrowed_asc') {
    orderByCols = [asc(loanRecords.borrowedAt), asc(loanRecords.id)];
  } else if (sort === 'overdue_desc') {
    orderByCols = [asc(loanRecords.dueDate), asc(loanRecords.borrowedAt), asc(loanRecords.id)];
  } else {
    orderByCols = [desc(loanRecords.borrowedAt), desc(loanRecords.id)];
  }

  const totalRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(loanRecords)
    .where(whereClause)
    .get();
  const total = Number(totalRow?.count ?? 0);

  const rows = await db
    .select()
    .from(loanRecords)
    .where(whereClause)
    .orderBy(...orderByCols)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  let teacherSummary:
    | { totalActive: number; overdueCount: number; dueSoonCount: number }
    | undefined;

  if (auth.user.role === 'TEACHER') {
    const dueSoonLimit = addCalendarDays(todayVN, 2);
    const summaryRow = await db
      .select({
        totalActive: sql<number>`count(*)`,
        overdueCount: sql<number>`COALESCE(SUM(CASE WHEN ${loanRecords.dueDate} < ${todayVN} THEN 1 ELSE 0 END), 0)`,
        dueSoonCount: sql<number>`COALESCE(SUM(CASE WHEN ${loanRecords.dueDate} >= ${todayVN} AND ${loanRecords.dueDate} <= ${dueSoonLimit} THEN 1 ELSE 0 END), 0)`,
      })
      .from(loanRecords)
      .where(and(eq(loanRecords.teacherId, auth.user.id), eq(loanRecords.status, 'BORROWED')))
      .get();

    teacherSummary = {
      totalActive: Number(summaryRow?.totalActive ?? 0),
      overdueCount: Number(summaryRow?.overdueCount ?? 0),
      dueSoonCount: Number(summaryRow?.dueSoonCount ?? 0),
    };
  }

  return jsonSuccess(await enrichLoanRows(rows, todayVN), {
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    todayVN,
    ...(teacherSummary ? { teacherSummary } : {}),
  });
});

export const POST = withApiErrorHandling(async (req: Request) => {
  // BR-11: Chỉ TEACHER tự tạo phiếu mượn cho mình; chặn ADMIN mượn hộ
  const auth = await requireTeacher(req);
  if (auth.errorResponse) return auth.errorResponse;

  const parsedBody = await parseJsonBody(req);
  if (parsedBody.errorResponse) return parsedBody.errorResponse;

  const validated = createLoanSchema.safeParse(parsedBody.data);
  if (!validated.success) {
    return jsonError(
      'VALIDATION_ERROR',
      validated.error.issues[0]?.message || 'Thông tin phiếu mượn không hợp lệ.',
      400,
      validated.error.flatten().fieldErrors
    );
  }

  const identity = normalizeRecordIdentity({
    className: validated.data.className,
    studentName: validated.data.studentName,
    schoolYear: validated.data.schoolYear,
  });

  const db = await getDb();
  const settings = await readLoanSettings(db);
  const todayVN = getTodayVNDateString();
  const maxDueDate = addCalendarDays(todayVN, settings.maxLoanDays);

  if (validated.data.dueDate < todayVN) {
    return jsonError(
      'INVALID_DUE_DATE',
      'Hạn ngày trả không được nhỏ hơn ngày mượn hôm nay.',
      400
    );
  }

  if (validated.data.dueDate > maxDueDate) {
    return jsonError(
      'INVALID_DUE_DATE',
      `Hạn ngày trả không được vượt quá ${settings.maxLoanDays} ngày kể từ hôm nay (tối đa ${formatDateVN(maxDueDate)}).`,
      400
    );
  }

  const findExistingActiveLoan = async () =>
    db
      .select()
      .from(loanRecords)
      .where(
        and(
          eq(loanRecords.recordIdentityKey, identity.recordIdentityKey),
          eq(loanRecords.status, 'BORROWED')
        )
      )
      .limit(1)
      .get();

  const existingActive = await findExistingActiveLoan();
  if (existingActive) {
    return jsonError(
      'DUPLICATE_ACTIVE_LOAN',
      buildDuplicateLoanMessage(existingActive),
      409,
      { existingLoan: sanitizeConflictLoan(existingActive) }
    );
  }

  const now = new Date().toISOString();
  try {
    const created = await withWriteTransaction(db, async (tx) => {
      const inserted = await tx
        .insert(loanRecords)
        .values({
          teacherId: auth.user.id,
          teacherNameSnapshot: auth.user.fullName,
          teacherPhoneSnapshot: auth.user.phone,
          teacherUnitSnapshot: auth.user.unit,
          className: identity.className,
          studentName: identity.studentName,
          schoolYear: identity.schoolYear,
          recordIdentityKey: identity.recordIdentityKey,
          classNameNorm: buildClassNameNorm(identity.className),
          searchText: buildLoanSearchText({
            studentName: identity.studentName,
            className: identity.className,
            schoolYear: identity.schoolYear,
            teacherNameSnapshot: auth.user.fullName,
            teacherUnitSnapshot: auth.user.unit,
            teacherPhoneSnapshot: auth.user.phone,
          }),
          borrowedAt: now,
          dueDate: validated.data.dueDate,
          status: 'BORROWED',
          borrowNote: validated.data.borrowNote,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      await writeAuditLog(
        {
          actorId: auth.user.id,
          action: 'LOAN_CREATED',
          targetType: 'LOAN',
          targetId: inserted.id,
          metadata: {
            className: inserted.className,
            studentName: inserted.studentName,
            schoolYear: inserted.schoolYear,
            dueDate: inserted.dueDate,
          },
        },
        tx
      );

      return inserted;
    });

    return jsonSuccess((await enrichLoanRows([created], todayVN))[0], undefined, 201);
  } catch (err) {
    if (isSqliteUniqueError(err)) {
      const conflictLoan = await findExistingActiveLoan();
      return jsonError(
        'DUPLICATE_ACTIVE_LOAN',
        conflictLoan
          ? buildDuplicateLoanMessage(conflictLoan)
          : 'Học bạ này hiện đang được mượn và chưa trả.',
        409,
        conflictLoan ? { existingLoan: sanitizeConflictLoan(conflictLoan) } : undefined
      );
    }
    throw err;
  }
});

import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { getDb, withWriteTransaction } from '@/db';
import { loanRecords } from '@/db/schema';
import { jsonError, jsonSuccess, parseJsonBody, withApiErrorHandling } from '@/lib/api/response';
import { returnLoanSchema } from '@/lib/api/validators';
import { requireAdmin } from '@/lib/auth/guards';
import { writeAuditLog } from '@/lib/audit/logger';
import { getTodayVNDateString } from '@/lib/domain/overdue';
import { enrichLoanRows } from '@/lib/loans/enrich';

export const POST = withApiErrorHandling(
  async (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const auth = await requireAdmin(req);
    if (auth.errorResponse) return auth.errorResponse;

    const { id: rawId } = await context.params;
    const loanId = /^\d+$/.test(rawId) ? Number.parseInt(rawId, 10) : NaN;
    if (!Number.isFinite(loanId) || loanId <= 0) {
      return jsonError('INVALID_ID', 'Mã phiếu mượn không hợp lệ.', 400);
    }

    let bodyData: unknown = {};
    const contentLength = req.headers.get('content-length');
    if (contentLength && contentLength !== '0') {
      const parsedBody = await parseJsonBody(req);
      if (parsedBody.errorResponse) return parsedBody.errorResponse;
      bodyData = parsedBody.data;
    } else {
      try {
        const text = await req.text();
        if (text.trim()) {
          bodyData = JSON.parse(text);
        }
      } catch {
        return jsonError('INVALID_JSON', 'Dữ liệu gửi lên không đúng định dạng JSON.', 400);
      }
    }

    const validated = returnLoanSchema.safeParse(bodyData);
    if (!validated.success) {
      return jsonError(
        'VALIDATION_ERROR',
        validated.error.issues[0]?.message || 'Ghi chú trả không hợp lệ.',
        400,
        validated.error.flatten().fieldErrors
      );
    }

    const db = await getDb();
    const now = new Date().toISOString();

    const result = await withWriteTransaction(db, async (tx) => {
      const updatedRow = await tx
        .update(loanRecords)
        .set({
          status: 'RETURNED',
          returnedAt: now,
          returnedByAdminId: auth.user.id,
          returnNote: validated.data.returnNote,
          updatedAt: now,
        })
        .where(and(eq(loanRecords.id, loanId), eq(loanRecords.status, 'BORROWED')))
        .returning()
        .get();

      if (!updatedRow) {
        const existing = await tx
          .select({ id: loanRecords.id })
          .from(loanRecords)
          .where(eq(loanRecords.id, loanId))
          .limit(1)
          .get();
        return existing ? { kind: 'CONFLICT' as const } : { kind: 'NOT_FOUND' as const };
      }

      await writeAuditLog(
        {
          actorId: auth.user.id,
          action: 'LOAN_RETURNED',
          targetType: 'LOAN',
          targetId: loanId,
          metadata: {
            className: updatedRow.className,
            studentName: updatedRow.studentName,
            schoolYear: updatedRow.schoolYear,
            teacherId: updatedRow.teacherId,
            returnNote: validated.data.returnNote,
          },
        },
        tx
      );

      const enriched = (await enrichLoanRows([updatedRow], getTodayVNDateString(), tx))[0];
      return { kind: 'OK' as const, loan: enriched };
    });

    if (result.kind === 'NOT_FOUND') {
      return jsonError('LOAN_NOT_FOUND', 'Không tìm thấy phiếu mượn.', 404);
    }
    if (result.kind === 'CONFLICT') {
      return jsonError(
        'INVALID_LOAN_STATUS',
        'Phiếu mượn này đã được xử lý trả hoặc đã hủy trước đó.',
        409
      );
    }

    return jsonSuccess(result.loan);
  }
);

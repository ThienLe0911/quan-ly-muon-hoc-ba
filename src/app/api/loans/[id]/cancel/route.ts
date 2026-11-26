import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { getDb, withWriteTransaction } from '@/db';
import { loanRecords } from '@/db/schema';
import { jsonError, jsonSuccess, parseJsonBody, withApiErrorHandling } from '@/lib/api/response';
import { cancelLoanSchema } from '@/lib/api/validators';
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

    const parsedBody = await parseJsonBody(req);
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const validated = cancelLoanSchema.safeParse(parsedBody.data);
    if (!validated.success) {
      return jsonError(
        'VALIDATION_ERROR',
        validated.error.issues[0]?.message || 'Vui lòng nhập lý do hủy phiếu hợp lệ.',
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
          status: 'CANCELLED',
          cancelReason: validated.data.reason,
          cancelledByAdminId: auth.user.id,
          cancelledAt: now,
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
          action: 'LOAN_CANCELLED',
          targetType: 'LOAN',
          targetId: loanId,
          metadata: {
            loanType: updatedRow.loanType,
            className: updatedRow.className,
            studentName: updatedRow.studentName,
            schoolYear: updatedRow.schoolYear,
            quantity: updatedRow.quantity,
            reason: validated.data.reason,
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
        'Chỉ có thể hủy phiếu đang ở trạng thái đang mượn.',
        409
      );
    }

    return jsonSuccess(result.loan);
  }
);

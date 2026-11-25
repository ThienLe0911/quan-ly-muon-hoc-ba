import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { getDb, withWriteTransaction } from '@/db';
import { users } from '@/db/schema';
import { jsonError, jsonSuccess, parseJsonBody, withApiErrorHandling } from '@/lib/api/response';
import { resetPasswordSchema } from '@/lib/api/validators';
import { requireAdmin } from '@/lib/auth/guards';
import { hashPassword } from '@/lib/auth/password';
import { revokeAllUserSessions } from '@/lib/auth/session';
import { writeAuditLog } from '@/lib/audit/logger';

export const POST = withApiErrorHandling(
  async (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const auth = await requireAdmin(req);
    if (auth.errorResponse) return auth.errorResponse;

    const { id: rawId } = await context.params;
    const userId = /^\d+$/.test(rawId) ? Number.parseInt(rawId, 10) : NaN;
    if (!Number.isFinite(userId) || userId <= 0) {
      return jsonError('INVALID_ID', 'Mã tài khoản không hợp lệ.', 400);
    }

    const parsedBody = await parseJsonBody(req);
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const validated = resetPasswordSchema.safeParse(parsedBody.data);
    if (!validated.success) {
      return jsonError(
        'VALIDATION_ERROR',
        validated.error.issues[0]?.message || 'Mật khẩu mới không hợp lệ.',
        400,
        validated.error.flatten().fieldErrors
      );
    }

    const db = await getDb();
    const now = new Date().toISOString();

    const found = await withWriteTransaction(db, async (tx) => {
      const target = await tx.select().from(users).where(eq(users.id, userId)).limit(1).get();
      if (!target) return false;

      await tx
        .update(users)
        .set({
          passwordHash: hashPassword(validated.data.newPassword),
          mustChangePassword: validated.data.mustChangePassword ? 1 : 0,
          updatedAt: now,
        })
        .where(eq(users.id, userId))
        .run();

      await revokeAllUserSessions(userId, undefined, tx);

      await writeAuditLog(
        {
          actorId: auth.user.id,
          action: 'USER_PASSWORD_RESET',
          targetType: 'USER',
          targetId: userId,
          metadata: {
            username: target.username,
            mustChangePassword: validated.data.mustChangePassword,
          },
        },
        tx
      );

      return true;
    });

    if (!found) {
      return jsonError('USER_NOT_FOUND', 'Không tìm thấy tài khoản.', 404);
    }

    return jsonSuccess({ reset: true });
  }
);

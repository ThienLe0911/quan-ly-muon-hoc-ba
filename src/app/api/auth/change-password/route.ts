import { eq } from 'drizzle-orm';
import { getDb, withWriteTransaction } from '@/db';
import { users } from '@/db/schema';
import { jsonError, jsonSuccess, parseJsonBody, withApiErrorHandling } from '@/lib/api/response';
import { changePasswordSchema } from '@/lib/api/validators';
import { requireAuth } from '@/lib/auth/guards';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { getSessionTokenFromRequest, revokeAllUserSessions } from '@/lib/auth/session';
import { writeAuditLog } from '@/lib/audit/logger';

export const POST = withApiErrorHandling(async (req: Request) => {
  const auth = await requireAuth(req);
  if (auth.errorResponse) return auth.errorResponse;

  const parsedBody = await parseJsonBody(req);
  if (parsedBody.errorResponse) return parsedBody.errorResponse;

  const validated = changePasswordSchema.safeParse(parsedBody.data);
  if (!validated.success) {
    return jsonError(
      'VALIDATION_ERROR',
      validated.error.issues[0]?.message || 'Dữ liệu đổi mật khẩu không hợp lệ.',
      400,
      validated.error.flatten().fieldErrors
    );
  }

  const db = await getDb();
  const userRow = await db
    .select()
    .from(users)
    .where(eq(users.id, auth.user.id))
    .limit(1)
    .get();

  if (!userRow) {
    return jsonError('USER_NOT_FOUND', 'Không tìm thấy tài khoản.', 404);
  }

  if (!verifyPassword(validated.data.currentPassword, userRow.passwordHash)) {
    return jsonError('WRONG_CURRENT_PASSWORD', 'Mật khẩu hiện tại không chính xác.', 400);
  }

  if (validated.data.currentPassword === validated.data.newPassword) {
    return jsonError(
      'SAME_PASSWORD',
      'Mật khẩu mới không được trùng với mật khẩu hiện tại.',
      400
    );
  }

  const currentToken = (await getSessionTokenFromRequest(req)) ?? undefined;
  const now = new Date().toISOString();

  await withWriteTransaction(db, async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash: hashPassword(validated.data.newPassword),
        mustChangePassword: 0,
        updatedAt: now,
      })
      .where(eq(users.id, auth.user.id))
      .run();

    await revokeAllUserSessions(auth.user.id, currentToken, tx);

    await writeAuditLog(
      {
        actorId: auth.user.id,
        action: 'PASSWORD_CHANGED',
        targetType: 'USER',
        targetId: auth.user.id,
        metadata: { username: auth.user.username },
      },
      tx
    );
  });

  return jsonSuccess({ changed: true });
});
